import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Toolbar from './Toolbar'
import CanvasEditor, { type CanvasEditorHandle, type CanvasViewport, type ToolMode } from './CanvasEditor'
import InventoryPanel from './InventoryPanel'
import PhaseTimeline from './PhaseTimeline'
import PresentationMode from './PresentationMode'
import ObjectPicker, { type PickerTab } from './ObjectPicker'
import CommandBar, { type CommandActions } from './CommandBar'
import { SelectionBar, PropertiesPanel } from './SelectionControls'
import { useNivtecImport } from './useNivtecImport'
import { useEventStore } from '../store/store'
import { useProjectsStore } from '../store/projectsStore'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import type { EventItem, ItemType } from '../types'
import { DEFAULT_PIXELS_PER_METER, metersToPixels } from '../utils/scale'
import { exportPhaseToPdf } from '../utils/pdfExport'
import { buildItemGrid, type Placement } from '../utils/placement'
import { changedSincePhase, previousPhaseId, sortPhases } from '../utils/phaseDiff'
import { island, kbd } from '../utils/ui'

const PPM = DEFAULT_PIXELS_PER_METER

/** Bildschirm-Rechteck eines (ggf. gedrehten) Objekts, um die Kontextleiste daran auszurichten. */
function screenBounds(item: EventItem, phaseId: string, vp: CanvasViewport) {
  const pd = item.phaseData[phaseId]
  if (!pd) return null
  const w = metersToPixels(item.width, PPM)
  const h = metersToPixels(item.height, PPM)
  const isRound = item.type === 'table_round' || item.type === 'table_high'
  const corners = isRound
    ? [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]]
    : [[0, 0], [w, 0], [w, h], [0, h]]
  const rad = (pd.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const pts = corners.map(([cx, cy]) => ({
    x: (pd.x + cx * cos - cy * sin) * vp.zoom + vp.x,
    y: (pd.y + cx * sin + cy * cos) * vp.zoom + vp.y,
  }))
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

const SHORTCUTS: [string, string][] = [
  ['Befehlszeile', '⌘K'],
  ['Auswählen / Messen / Bereich', 'V · M · B'],
  ['Objekte-Blatt', 'O'],
  ['Vorherige / nächste Phase', '[ · ]'],
  ['Objekt drehen', 'R'],
  ['… gegen Uhrzeigersinn', '⇧R'],
  ['Duplizieren', '⌘D'],
  ['Löschen', '⌫'],
  ['Abwählen / schließen', 'Esc'],
  ['Rückgängig', '⌘Z'],
  ['Wiederholen', '⌘⇧Z'],
  ['Diese Hilfe', '?'],
]

export default function EditorView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [tool, setTool] = useState<ToolMode>('select')
  const [placement, setPlacement] = useState<(Placement & { type?: ItemType }) | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTab, setPickerTab] = useState<PickerTab>('furniture')
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [onionSkin, setOnionSkin] = useState(false)
  const [viewport, setViewport] = useState<CanvasViewport | null>(null)
  const canvasRef = useRef<CanvasEditorHandle>(null)

  /** Kachel aus der Objekt-Bibliothek gezogen: Formvorschau folgt dem Zeiger bis zum Loslassen. */
  const [dragGhost, setDragGhost] = useState<{ type: ItemType; x: number; y: number } | null>(null)
  const dragStateRef = useRef<{ type: ItemType; startX: number; startY: number; dragging: boolean } | null>(null)

  const phases = useEventStore((s) => s.phases)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const items = useEventStore((s) => s.items)
  const itemOrder = useEventStore((s) => s.itemOrder)
  const removeItem = useEventStore((s) => s.removeItem)
  const rotateItem = useEventStore((s) => s.rotateItem)
  const duplicateItem = useEventStore((s) => s.duplicateItem)
  const toggleItemVisible = useEventStore((s) => s.toggleItemVisible)
  const addItem = useEventStore((s) => s.addItem)
  const addItemsBatch = useEventStore((s) => s.addItemsBatch)
  const addChairRowGroup = useEventStore((s) => s.addChairRowGroup)
  const setCurrentPhase = useEventStore((s) => s.setCurrentPhase)
  const undo = useEventStore((s) => s.undo)
  const redo = useEventStore((s) => s.redo)
  const closeProject = useProjectsStore((s) => s.closeProject)

  const selectedItem = selectedId ? items[selectedId] : null
  const selectedVisible = !!selectedItem?.phaseData[currentPhaseId]?.visible

  // Beim Phasenwechsel verschwindet eine Auswahl, die in der neuen Phase nicht sichtbar ist
  useEffect(() => {
    if (selectedId && !selectedVisible) {
      setSelectedId(null)
      setPropertiesOpen(false)
    }
  }, [selectedId, selectedVisible])

  const prevPhaseId = useMemo(() => previousPhaseId(phases, currentPhaseId), [phases, currentPhaseId])
  const ghostItemIds = useMemo(
    () => (onionSkin && prevPhaseId ? changedSincePhase(items, itemOrder, prevPhaseId, currentPhaseId) : []),
    [onionSkin, prevPhaseId, items, itemOrder, currentPhaseId],
  )

  const viewCenter = useCallback(() => canvasRef.current?.getViewCenter() ?? { x: 200, y: 200 }, [])
  const nivtec = useNivtecImport(viewCenter)

  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    if (!id) setPropertiesOpen(false)
  }, [])

  const changeTool = useCallback((next: ToolMode) => {
    setTool(next)
    setPlacement(null)
  }, [])

  /** Bibliotheksobjekt(e) setzen: per Tippen in den Plan oder sofort in der Bildmitte. */
  const placeType = useCallback(
    (type: ItemType, quantity: number, mode: 'tap' | 'center') => {
      const tpl = ITEM_LIBRARY.find((t) => t.type === type)
      const create = (x: number, y: number): string | null => {
        if (quantity <= 1) return addItem(type, x, y)
        const { phases: ph, currentPhaseId: cur } = useEventStore.getState()
        const batch = buildItemGrid(type, quantity, x, y, ph, cur, PPM)
        addItemsBatch(batch)
        return batch[0]?.id ?? null
      }
      setTool('select')
      if (mode === 'center') {
        const c = viewCenter()
        const id = create(c.x, c.y)
        if (id) select(id)
        setPlacement(null)
        return
      }
      setPlacement({
        type,
        label: quantity > 1 ? `${quantity} × ${tpl?.label ?? type}` : tpl?.label ?? type,
        place: create,
        once: quantity > 1,
      })
    },
    [addItem, addItemsBatch, viewCenter, select],
  )

  const placeChairRows = useCallback(
    (rows: number, cols: number, mode: 'tap' | 'center') => {
      setTool('select')
      if (mode === 'center') {
        const c = viewCenter()
        select(addChairRowGroup(c.x, c.y, rows, cols))
        setPlacement(null)
        setPickerOpen(false)
        return
      }
      setPlacement({
        label: `Stuhlreihen ${rows} × ${cols} (${rows * cols} Stühle)`,
        place: (x, y) => addChairRowGroup(x, y, rows, cols),
        once: true,
      })
      setPickerOpen(false)
    },
    [addChairRowGroup, viewCenter, select],
  )

  /** Kachel aus der Bibliothek per Zeiger gezogen: sofortige Formvorschau statt des trägen
   *  nativen HTML5-Drag-Ghosts, Objekt wird erst beim Loslassen über dem Plan angelegt. */
  const handleTileDragStart = useCallback(
    (e: React.PointerEvent, type: ItemType) => {
      if (e.button !== 0) return
      dragStateRef.current = { type, startX: e.clientX, startY: e.clientY, dragging: false }

      const onMove = (ev: PointerEvent) => {
        const st = dragStateRef.current
        if (!st) return
        if (!st.dragging) {
          if (Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) < 5) return
          st.dragging = true
        }
        setDragGhost({ type: st.type, x: ev.clientX, y: ev.clientY })
      }
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        const st = dragStateRef.current
        dragStateRef.current = null
        setDragGhost(null)
        if (!st?.dragging) return
        const pos = canvasRef.current?.screenToCanvas(ev.clientX, ev.clientY)
        if (!pos) return
        const id = addItem(st.type, pos.x, pos.y)
        select(id)
        setPickerOpen(false)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp, { once: true })
    },
    [addItem, select],
  )

  const handleExportPdf = useCallback(async () => {
    const planImageDataUrl = await canvasRef.current?.exportSnapshot()
    const s = useEventStore.getState()
    const phase = s.phases.find((p) => p.id === s.currentPhaseId)
    exportPhaseToPdf({ eventName: s.eventName, phase, items: s.items, currentPhaseId: s.currentPhaseId, planImageDataUrl })
  }, [])

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return
    const newId = duplicateItem(selectedId)
    if (newId) setSelectedId(newId)
  }, [selectedId, duplicateItem])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    removeItem(selectedId)
    select(null)
  }, [selectedId, removeItem, select])

  const openPicker = useCallback((tab: PickerTab) => {
    setPickerTab(tab)
    setPickerOpen(true)
  }, [])

  const commandActions = useMemo<CommandActions>(
    () => ({
      placeType,
      placeChairRows,
      setTool: changeTool,
      openPicker,
      importNivtec: nivtec.open,
      exportPdf: () => void handleExportPdf(),
      present: () => setPresenting(true),
      toggleOnionSkin: () => setOnionSkin((v) => !v),
      toggleInventory: () => setInventoryOpen((v) => !v),
      fitToView: () => canvasRef.current?.fitToView(),
      showShortcuts: () => setShortcutsOpen(true),
      goToProjects: closeProject,
    }),
    [placeType, placeChairRows, changeTool, openPicker, nivtec.open, handleExportPdf, closeProject],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.ctrlKey || e.metaKey
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((v) => !v)
        return
      }
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (commandOpen) return

      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (isMod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()
        duplicateSelected()
        return
      }
      if (isMod || e.altKey) return

      const key = e.key.toLowerCase()
      if (key === 'r' && selectedId) {
        e.preventDefault()
        rotateItem(selectedId, e.shiftKey ? -90 : 90)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        deleteSelected()
        return
      }
      if (e.key === '?') {
        setShortcutsOpen((v) => !v)
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        setCommandOpen(true)
        return
      }
      if (key === 'v') return changeTool('select')
      if (key === 'm') return changeTool('measure')
      if (key === 'b') return changeTool('area')
      if (key === 'o') {
        setPickerOpen((v) => !v)
        return
      }
      if (e.key === '[' || e.key === ']') {
        // Phasen in Reihenfolge durchgehen, an den Enden stehen bleiben (kein Umlauf)
        e.preventDefault()
        const sorted = sortPhases(phases)
        const idx = sorted.findIndex((p) => p.id === currentPhaseId)
        const next = sorted[idx + (e.key === ']' ? 1 : -1)]
        if (idx !== -1 && next) setCurrentPhase(next.id)
        return
      }

      if (e.key === 'Escape') {
        // Von innen nach außen schließen: Platzieren → Werkzeug → Blätter → Auswahl → Hilfe
        if (placement) setPlacement(null)
        else if (tool !== 'select') setTool('select')
        else if (pickerOpen) setPickerOpen(false)
        else if (propertiesOpen) setPropertiesOpen(false)
        else if (selectedId) select(null)
        else if (shortcutsOpen) setShortcutsOpen(false)
        else if (inventoryOpen) setInventoryOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    undo, redo, rotateItem, selectedId, duplicateSelected, deleteSelected, changeTool, select,
    commandOpen, placement, tool, pickerOpen, propertiesOpen, shortcutsOpen, inventoryOpen,
    phases, currentPhaseId, setCurrentPhase,
  ])

  // Kontextleiste an der Auswahl ausrichten. Über dem Objekt braucht es genug Abstand, um den
  // Rotationsgriff (fest ~26 Bildschirm-Pixel über der Objekt-Oberkante, siehe EventItemShape)
  // freizulassen — sonst legt sich die Leiste über den Griff und man kommt nicht mehr an ihn heran.
  const ROTATE_HANDLE_CLEARANCE = 40
  let barStyle: React.CSSProperties | null = null
  if (selectedItem && selectedVisible && viewport && !placement && tool === 'select') {
    const b = screenBounds(selectedItem, currentPhaseId, viewport)
    if (b) {
      const cx = Math.min(Math.max((b.minX + b.maxX) / 2, 230), viewport.width - 230)
      const above = b.minY - ROTATE_HANDLE_CLEARANCE > 150
      barStyle = above
        ? { left: cx, top: b.minY - ROTATE_HANDLE_CLEARANCE, transform: 'translate(-50%, -100%)' }
        : { left: cx, top: Math.min(b.maxY + 12, viewport.height - 220), transform: 'translate(-50%, 0)' }
    }
  }

  if (presenting) return <PresentationMode startPhaseId={currentPhaseId} onClose={() => setPresenting(false)} />

  const dockTool = (key: ToolMode, label: string, icon: React.ReactNode, shortcut: string) => {
    const active = tool === key && !placement
    return (
      <button
        onClick={() => changeTool(key)}
        className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
          active ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
        }`}
        title={`${label} (${shortcut})`}
      >
        {icon}
        {label}
      </button>
    )
  }
  const svg = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  )

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-ground select-none">
      <CanvasEditor
        ref={canvasRef}
        pixelsPerMeter={PPM}
        selectedId={selectedId}
        onSelect={select}
        tool={tool}
        onToolChange={changeTool}
        placement={placement}
        onPlacementDone={() => setPlacement(null)}
        ghostPhaseId={onionSkin ? prevPhaseId : null}
        ghostItemIds={ghostItemIds}
        onViewportChange={setViewport}
      />

      <Toolbar
        onExportPdf={handleExportPdf}
        onPresent={() => setPresenting(true)}
        onOpenCommand={() => setCommandOpen(true)}
        onionSkin={onionSkin}
        onToggleOnionSkin={() => setOnionSkin((v) => !v)}
        hasPreviousPhase={!!prevPhaseId}
      />

      {/* Kontextleiste an der Auswahl */}
      {barStyle && selectedItem && (
        <div className="absolute z-10" style={barStyle}>
          <SelectionBar
            item={selectedItem}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelected}
            onHideInPhase={() => {
              toggleItemVisible(selectedItem.id, false)
              select(null)
            }}
            onOpenProperties={() => setPropertiesOpen((v) => !v)}
            propertiesOpen={propertiesOpen}
          />
        </div>
      )}

      {/* Rechte Seite: Inventar-Blatt und Objekt-Eigenschaften */}
      <div className="absolute right-4 top-[84px] bottom-[112px] z-20 flex gap-3 items-start pointer-events-none">
        {propertiesOpen && selectedItem && selectedVisible && (
          <div className="pointer-events-auto">
            <PropertiesPanel
              item={selectedItem}
              currentPhaseId={currentPhaseId}
              onClose={() => setPropertiesOpen(false)}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
            />
          </div>
        )}
        {inventoryOpen && (
          <div className="pointer-events-auto h-full flex">
            <InventoryPanel selectedId={selectedId} onSelect={select} onClose={() => setInventoryOpen(false)} />
          </div>
        )}
      </div>

      {/* Objekt-Blatt über dem Dock */}
      {pickerOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[176px] z-20">
          <ObjectPicker
            tab={pickerTab}
            onTabChange={setPickerTab}
            activeType={placement?.type ?? null}
            onPick={(type) => {
              if (placement?.type === type) setPlacement(null)
              else {
                placeType(type, 1, 'tap')
                // Blatt einklappen, damit der Plan zum Hineintippen frei ist (O öffnet es wieder)
                setPickerOpen(false)
              }
            }}
            onInsertCenter={(type) => placeType(type, 1, 'center')}
            onCreateChairRows={placeChairRows}
            onImportNivtec={nivtec.open}
            onClose={() => setPickerOpen(false)}
            onTileDragStart={handleTileDragStart}
          />
        </div>
      )}

      {/* Werkzeug-Dock */}
      <div className={`absolute left-1/2 -translate-x-1/2 bottom-[108px] z-20 flex items-center gap-1 p-1.5 ${island}`}>
        {dockTool('select', 'Auswahl', svg(<path d="M5 3l14 8-6 2-2 6z" />), 'V')}
        {dockTool('area', 'Bereich', svg(<rect x="4" y="6" width="16" height="12" strokeDasharray="3 2" />), 'B')}
        {dockTool('measure', 'Messen', svg(<><path d="M3 17L17 3l4 4L7 21z" /><path d="M8 8l2 2M11 5l2 2M5 11l2 2" /></>), 'M')}
        <div className="w-px h-8 bg-line mx-1" />
        <button
          onClick={() => {
            if (pickerOpen && (pickerTab === 'furniture' || pickerTab === 'infrastructure')) setPickerOpen(false)
            else openPicker(pickerTab === 'rows' || pickerTab === 'nivtec' ? 'furniture' : pickerTab)
          }}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            pickerOpen && (pickerTab === 'furniture' || pickerTab === 'infrastructure') ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="Objekt-Bibliothek (O)"
        >
          {svg(<path d="M12 5v14M5 12h14" />)}
          Objekte
        </button>
        <button
          onClick={() => (pickerOpen && pickerTab === 'rows' ? setPickerOpen(false) : openPicker('rows'))}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            pickerOpen && pickerTab === 'rows' ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="Stuhlreihen-Generator"
        >
          {svg(<>{[6, 12, 18].flatMap((x) => [8, 16].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} />))}</>)}
          Reihen
        </button>
        <button
          onClick={() => (pickerOpen && pickerTab === 'nivtec' ? setPickerOpen(false) : openPicker('nivtec'))}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            pickerOpen && pickerTab === 'nivtec' ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="NivTec Import"
        >
          {svg(<><path d="M12 15V4M8 8l4-4 4 4" /><path d="M4 15v4h16v-4" /></>)}
          NivTec
        </button>
        {placement && (
          <>
            <div className="w-px h-8 bg-line mx-1" />
            <button
              onClick={() => setPlacement(null)}
              className="h-12 px-3 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover"
              title="Platzieren beenden (Esc)"
            >
              Fertig
            </button>
          </>
        )}
      </div>

      {/* Phasen-Zeitleiste */}
      <div className="absolute left-4 right-4 bottom-4 z-20">
        <PhaseTimeline
          onPresent={() => setPresenting(true)}
          onionSkin={onionSkin}
          onToggleOnionSkin={() => setOnionSkin((v) => !v)}
          inventoryOpen={inventoryOpen}
          onToggleInventory={() => setInventoryOpen((v) => !v)}
        />
      </div>

      {/* Tastatur-Hilfe */}
      <button
        onClick={() => setShortcutsOpen((v) => !v)}
        title="Tastatur-Shortcuts (?)"
        className={`absolute bottom-[112px] left-4 z-20 w-10 h-10 rounded-full text-ink2 hover:text-ink flex items-center justify-center text-sm font-semibold ${island}`}
      >
        ?
      </button>
      {shortcutsOpen && (
        <div className={`absolute bottom-[160px] left-4 z-30 p-3.5 w-72 text-xs space-y-2 ${island}`}>
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-chip">
            <span className="font-bold text-ink text-sm">Tastatur-Shortcuts</span>
            <button onClick={() => setShortcutsOpen(false)} className="text-ink3 hover:text-ink leading-none text-base px-1 -mr-1">
              ×
            </button>
          </div>
          <ul className="space-y-1.5 text-ink2">
            {SHORTCUTS.map(([label, keys]) => (
              <li key={label} className="flex justify-between gap-2">
                <span>{label}</span>
                <span className={kbd}>{keys}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {commandOpen && <CommandBar onClose={() => setCommandOpen(false)} actions={commandActions} />}
      {nivtec.inputElement}

      {/* Formvorschau beim Ziehen einer Kachel aus der Objekt-Bibliothek: nimmt sofort die
          echte Größe/Form des Objekts an und folgt dem Zeiger, statt des trägen Browser-Ghosts. */}
      {dragGhost && (() => {
        const tpl = ITEM_LIBRARY.find((t) => t.type === dragGhost.type)
        const isRound = dragGhost.type === 'table_round' || dragGhost.type === 'table_high'
        const zoom = viewport?.zoom ?? 1
        const w = Math.max(metersToPixels(tpl?.width ?? 1, PPM) * zoom, 22)
        const h = Math.max(metersToPixels(tpl?.height ?? 1, PPM) * zoom, 22)
        return (
          <div
            className="fixed z-50 pointer-events-none flex items-center justify-center text-lg bg-accent-soft/90 border-2 border-accent shadow-lg text-ink"
            style={{
              left: dragGhost.x - w / 2,
              top: dragGhost.y - h / 2,
              width: w,
              height: h,
              borderRadius: isRound ? '9999px' : '10px',
            }}
          >
            {tpl?.icon}
          </div>
        )
      })()}
    </div>
  )
}
