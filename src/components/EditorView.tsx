import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Toolbar from './Toolbar'
import CanvasEditor, { type CanvasEditorHandle, type CanvasViewport, type ToolMode } from './CanvasEditor'
import InventoryPanel from './InventoryPanel'
import PhaseTimeline from './PhaseTimeline'
import PresentationMode from './PresentationMode'
import ObjectPicker, { type PickerTab } from './ObjectPicker'
import CommandBar, { type CommandActions } from './CommandBar'
import FloatingToolbar from './FloatingToolbar'
import { SelectionBar, MultiSelectionBar, PropertiesPanel } from './SelectionControls'
import { useNivtecImport } from './useNivtecImport'
import { useEventStore, type CustomItemSpec } from '../store/store'
import { useProjectsStore } from '../store/projectsStore'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import type { EventItem, ItemType } from '../types'
import { DEFAULT_PIXELS_PER_METER, metersToPixels } from '../utils/scale'
import { isRoundType, originForCenter, snapNewItemToGrid, unionBox, worldBBox, worldCenter } from '../utils/geometry'
import { IS_MAC } from '../utils/viewport'
import { exportPhaseToPdf } from '../utils/pdfExport'
import { buildItemGrid, type Placement } from '../utils/placement'
import { changedSincePhase, previousPhaseId, sortPhases } from '../utils/phaseDiff'
import { btn, input as inputCls, island, kbd } from '../utils/ui'

const PPM = DEFAULT_PIXELS_PER_METER

// Three.js wird erst geladen, wenn die 3D-Ansicht geöffnet wird (eigener Chunk).
const Venue3D = lazy(() => import('./Venue3D'))

/** Bildschirm-Rechteck eines (ggf. gedrehten) Objekts, um die Kontextleiste daran auszurichten. */
function screenBounds(item: EventItem, phaseId: string, vp: CanvasViewport) {
  const pd = item.phaseData[phaseId]
  if (!pd) return null
  const b = worldBBox(item, pd, PPM)
  return { minX: b.minX * vp.zoom + vp.x, maxX: b.maxX * vp.zoom + vp.x, minY: b.minY * vp.zoom + vp.y, maxY: b.maxY * vp.zoom + vp.y }
}

const MOD = IS_MAC ? '⌘' : 'Strg+'

const SHORTCUTS: [string, string][] = [
  ['Befehlszeile', `${MOD}K`],
  ['Auswählen / Messen / Bereich', 'V · M · B'],
  ['Objekte-Blatt', 'O'],
  ['Vorherige / nächste Phase', '[ · ]'],
  ['Drehen 90° (auch mehrere)', 'R · ⇧R'],
  ['Drehgriff: 15°-Schritte', '⇧ halten'],
  ['Verschieben 10 cm / 1 m', 'Pfeile · ⇧+Pfeile'],
  ['Beim Ziehen: ohne Einrasten', `${IS_MAC ? '⌘' : 'Strg'} halten`],
  ['Beim Ziehen: nur gerade', '⇧ halten'],
  ['Alles auswählen', `${MOD}A`],
  ['Kopieren / Einfügen (auch in andere Phase)', `${MOD}C · ${MOD}V`],
  ['Duplizieren', `${MOD}D`],
  ['Zur Auswahl hinzufügen/entfernen', '⇧Klick'],
  ['Mehrere per Rechteck wählen', 'Ziehen auf freie Fläche'],
  ['Ansicht verschieben', 'Leertaste+Ziehen · 2 Finger'],
  ['Zoomen', 'Mausrad · Pinch · + / −'],
  ['Einpassen / Auswahl zeigen', '0 · ⇧2'],
  ['Löschen', '⌫'],
  ['Abwählen / schließen', 'Esc'],
  ['Rückgängig / Wiederholen', `${MOD}Z · ${MOD}⇧Z`],
  ['Diese Hilfe', '?'],
]

type ActivePanel = 'picker' | 'inventory' | 'properties' | 'grid' | 'command' | 'text' | 'shortcuts' | null

export default function EditorView() {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [presenting, setPresenting] = useState(false)
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [tool, setTool] = useState<ToolMode>('select')
  const [placement, setPlacement] = useState<(Placement & { type?: ItemType }) | null>(null)
  const [pickerTab, setPickerTab] = useState<PickerTab>('furniture')
  const [onionSkin, setOnionSkin] = useState(false)
  const [textLabelDraft, setTextLabelDraft] = useState<string | null>(null)
  const gridEnabled = useEventStore((s) => s.gridEnabled)
  const gridSize = useEventStore((s) => s.gridSize)
  const setGridEnabled = useEventStore((s) => s.setGridEnabled)
  const setGridSize = useEventStore((s) => s.setGridSize)
  const codesHidden = useEventStore((s) => !!s.layers.hideCodes)
  const [show3D, setShow3D] = useState(false)
  const toggleLayer = useEventStore((s) => s.toggleLayer)

  // Restore grid settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('gridSettings')
    if (saved) {
      try {
        const { enabled, size } = JSON.parse(saved)
        if (typeof enabled === 'boolean') setGridEnabled(enabled)
        if (typeof size === 'number') setGridSize(size)
      } catch {}
    }
  }, [setGridEnabled, setGridSize])

  // Save grid settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('gridSettings', JSON.stringify({ enabled: gridEnabled, size: gridSize }))
  }, [gridEnabled, gridSize])
  const [viewport, setViewport] = useState<CanvasViewport | null>(null)
  const canvasRef = useRef<CanvasEditorHandle>(null)

  /** Kachel aus der Objekt-Bibliothek gezogen: Formvorschau folgt dem Zeiger bis zum Loslassen.
   *  Die Position wird direkt am DOM-Element gesetzt (ohne React-Re-Render pro Bewegung). */
  const [dragGhostType, setDragGhostType] = useState<ItemType | null>(null)
  const ghostElRef = useRef<HTMLDivElement>(null)
  const ghostPosRef = useRef({ x: 0, y: 0 })
  const moveGhost = useCallback((x: number, y: number) => {
    ghostPosRef.current = { x, y }
    const el = ghostElRef.current
    if (el) el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
  }, [])
  // Beim Erscheinen sofort an die Zeigerposition setzen
  useLayoutEffect(() => {
    if (dragGhostType) moveGhost(ghostPosRef.current.x, ghostPosRef.current.y)
  }, [dragGhostType, moveGhost])

  /** Während einer Canvas-Geste (Ziehen, Zoomen, Pinch) bleiben die Kontextleisten ausgeblendet. */
  const [gestureActive, setGestureActive] = useState(false)
  /** Eigene Zwischenablage für ⌘C / ⌘V (auch über Phasen hinweg). */
  const clipboardRef = useRef<{ items: EventItem[]; phaseId: string; pastes: number } | null>(null)
  /** Stabile Funktion, damit der memoisierte Canvas nicht bei jedem Render neu rendert. */
  const clearPlacement = useCallback(() => setPlacement(null), [])

  const phases = useEventStore((s) => s.phases)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const items = useEventStore((s) => s.items)
  const itemOrder = useEventStore((s) => s.itemOrder)
  const removeItems = useEventStore((s) => s.removeItems)
  const eventName = useEventStore((s) => s.eventName)
  const rotateItems = useEventStore((s) => s.rotateItems)
  const duplicateItems = useEventStore((s) => s.duplicateItems)
  const nudgeItems = useEventStore((s) => s.nudgeItems)
  const pasteItems = useEventStore((s) => s.pasteItems)
  const copyItemsToLaterPhases = useEventStore((s) => s.copyItemsToLaterPhases)
  const allItems = useEventStore((s) => s.items)
  // Ausgewählte Visiova-Rahmen entlang ihrer Ausrichtung sortiert (links → rechts aus Sicht der Druckseite)
  const selectedVisiovaFrames = useMemo(() => {
    const frames = selectedIds.map((id) => allItems[id]).filter((it) => it?.type === 'visiova_frame')
    if (frames.length < 2) return undefined
    const rot = ((frames[0].phaseData[currentPhaseId]?.rotation ?? 0) * Math.PI) / 180
    const along = (it: EventItem) => {
      const pd = it.phaseData[currentPhaseId]
      return pd ? pd.x * Math.cos(rot) + pd.y * Math.sin(rot) : 0
    }
    return [...frames].sort((a, b) => along(a) - along(b))
  }, [selectedIds, allItems, currentPhaseId])
  const hasLaterPhases = useEventStore((s) => {
    const sorted = sortPhases(s.phases)
    return sorted[sorted.length - 1]?.id !== s.currentPhaseId
  })
  const toggleItemsVisible = useEventStore((s) => s.toggleItemsVisible)
  const addItem = useEventStore((s) => s.addItem)
  const addItemsBatch = useEventStore((s) => s.addItemsBatch)
  const addChairRowGroup = useEventStore((s) => s.addChairRowGroup)
  const addCustomItem = useEventStore((s) => s.addCustomItem)
  const addTextLabel = useEventStore((s) => s.addTextLabel)
  const setCurrentPhase = useEventStore((s) => s.setCurrentPhase)
  const undo = useEventStore((s) => s.undo)
  const redo = useEventStore((s) => s.redo)
  const closeProject = useProjectsStore((s) => s.closeProject)

  // Objekt-Eigenschaften/Kontextleiste zeigen Details nur, wenn genau EIN Objekt ausgewählt ist.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null
  const selectedItem = selectedId ? items[selectedId] : null
  const selectedVisible = !!selectedItem?.phaseData[currentPhaseId]?.visible

  // Phasenwechsel oder Ausblenden: Objekte, die in der aktuellen Phase nicht (mehr) sichtbar
  // sind, verschwinden automatisch aus der Auswahl.
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = prev.filter((id) => items[id]?.phaseData[currentPhaseId]?.visible)
      return next.length === prev.length ? prev : next
    })
  }, [items, currentPhaseId])

  // Panel-Toggle-Helper
  const togglePanel = useCallback((panel: ActivePanel) => {
    setActivePanel((current) => (current === panel ? null : panel))
  }, [])

  // Eigenschaften-Panel ist nur für eine Einzelauswahl sinnvoll
  useEffect(() => {
    if (selectedId === null && activePanel === 'properties') {
      setActivePanel(null)
    }
  }, [selectedId, activePanel])

  // Draft löschen wenn Text-Panel geschlossen wird
  useEffect(() => {
    if (activePanel !== 'text' && textLabelDraft !== null) {
      setTextLabelDraft(null)
    }
  }, [activePanel, textLabelDraft])

  const prevPhaseId = useMemo(() => previousPhaseId(phases, currentPhaseId), [phases, currentPhaseId])
  const ghostItemIds = useMemo(
    () => (onionSkin && prevPhaseId ? changedSincePhase(items, itemOrder, prevPhaseId, currentPhaseId) : []),
    [onionSkin, prevPhaseId, items, itemOrder, currentPhaseId],
  )

  const viewCenter = useCallback(() => canvasRef.current?.getViewCenter() ?? { x: 200, y: 200 }, [])
  const nivtec = useNivtecImport(viewCenter)

  /** Einzelnes Objekt (an-)wählen. additive=true (Shift-Klick) fügt zur bestehenden Auswahl
   *  hinzu bzw. entfernt daraus, statt sie zu ersetzen. id=null leert die Auswahl komplett. */
  const select = useCallback((id: string | null, additive = false) => {
    if (id === null) {
      setSelectedIds([])
      return
    }
    setSelectedIds((prev) => {
      if (!additive) return [id]
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    })
  }, [])

  /** Mehrere Objekte auf einmal wählen (Rubberband-Auswahl per Shift+Ziehen). */
  const selectMany = useCallback((ids: string[], additive: boolean) => {
    setSelectedIds((prev) => (additive ? Array.from(new Set([...prev, ...ids])) : ids))
  }, [])

  /** Auswahl aus der Stückliste: zusätzlich sanft in den sichtbaren Ausschnitt holen (nur dort,
   *  nicht beim normalen Klick im Plan). */
  const selectFromInventory = useCallback(
    (id: string) => {
      select(id)
      const { items: all, currentPhaseId: cur } = useEventStore.getState()
      const item = all[id]
      const pd = item?.phaseData[cur]
      if (!item || !pd) return
      const c = worldCenter(item, pd, PPM)
      canvasRef.current?.panToItem(c.x, c.y)
    },
    [select],
  )

  const changeTool = useCallback((next: ToolMode) => {
    setTool(next)
    setPlacement(null)
  }, [])

  /** Ursprung (x/y) für ein neues Objekt, dessen MITTE bei (cx, cy) liegt; bei aktivem Raster
   *  rastet die Box-Ecke ein. */
  const placeOrigin = useCallback((type: ItemType, cx: number, cy: number, size?: { width: number; height: number }) => {
    const o = originForCenter(type, cx, cy, PPM, size)
    const { gridEnabled: ge, gridSize: gs } = useEventStore.getState()
    return ge ? snapNewItemToGrid(type, o, PPM, gs, size) : o
  }, [])

  /** Bibliotheksobjekt(e) setzen: per Tippen in den Plan oder sofort in der Bildmitte. */
  const placeType = useCallback(
    (type: ItemType, quantity: number, mode: 'tap' | 'center') => {
      const tpl = ITEM_LIBRARY.find((t) => t.type === type)
      const create = (x: number, y: number): string | null => {
        if (quantity <= 1) {
          const o = placeOrigin(type, x, y)
          return addItem(type, o.x, o.y)
        }
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
    [addItem, addItemsBatch, viewCenter, select, placeOrigin],
  )

  const placeCustom = useCallback(
    (spec: CustomItemSpec, mode: 'tap' | 'center') => {
      setTool('select')
      const t = spec.shape === 'round' ? 'custom_round' : 'custom_rect'
      const size = { width: spec.width, height: spec.shape === 'round' ? spec.width : spec.height }
      if (mode === 'center') {
        const c = viewCenter()
        const o = placeOrigin(t, c.x, c.y, size)
        select(addCustomItem(o.x, o.y, spec))
        setPlacement(null)
        setActivePanel(null)
        return
      }
      setPlacement({
        label: spec.label,
        place: (x, y) => {
          const o = placeOrigin(t, x, y, size)
          return addCustomItem(o.x, o.y, spec)
        },
      })
      setActivePanel(null)
    },
    [addCustomItem, viewCenter, select, placeOrigin],
  )

  const placeChairRows = useCallback(
    (rows: number, cols: number, mode: 'tap' | 'center') => {
      setTool('select')
      if (mode === 'center') {
        const c = viewCenter()
        select(addChairRowGroup(c.x, c.y, rows, cols))
        setPlacement(null)
        setActivePanel((p) => (p === 'picker' ? null : p))
        return
      }
      setPlacement({
        label: `Stuhlreihen ${rows} × ${cols} (${rows * cols} Stühle)`,
        place: (x, y) => addChairRowGroup(x, y, rows, cols),
        once: true,
      })
      setActivePanel((p) => (p === 'picker' ? null : p))
    },
    [addChairRowGroup, viewCenter, select],
  )

  /** Freie Text-Beschriftung: Text zuerst in einem kleinen Eingabefeld abfragen, dann per
   *  Tippen in den Plan platzieren (statt eines nativen window.prompt, das nicht ins
   *  Erscheinungsbild passt). */
  const commitTextLabelDraft = useCallback(() => {
    const text = textLabelDraft?.trim()
    setTextLabelDraft(null)
    setActivePanel(null)
    if (!text) return
    setTool('select')
    setPlacement({
      label: `Text „${text}"`,
      place: (x, y) => addTextLabel(x, y, text),
      once: true,
    })
  }, [textLabelDraft, addTextLabel])

  /** Kachel aus der Bibliothek per Zeiger gezogen: sofortige Formvorschau statt des trägen
   *  nativen HTML5-Drag-Ghosts, Objekt wird erst beim Loslassen über dem Plan angelegt. */
  const handleTileDragStart = useCallback(
    (e: React.PointerEvent, type: ItemType) => {
      // Nur Maus: auf Touch scrollt die Kachelliste; dort gilt „antippen, dann in den Plan tippen“.
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      const startX = e.clientX
      const startY = e.clientY
      let dragging = false
      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', cleanup)
        window.removeEventListener('keydown', onKey, true)
        setDragGhostType(null)
      }
      const onMove = (ev: PointerEvent) => {
        if (!dragging) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
          dragging = true
          ghostPosRef.current = { x: ev.clientX, y: ev.clientY }
          setDragGhostType(type)
        }
        moveGhost(ev.clientX, ev.clientY)
      }
      const onUp = (ev: PointerEvent) => {
        cleanup()
        if (!dragging) return
        // Nur annehmen, wenn direkt über dem Plan-Canvas losgelassen (nicht über Panels/Dock)
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        if (!el || el.tagName !== 'CANVAS') return
        const pos = canvasRef.current?.screenToCanvas(ev.clientX, ev.clientY)
        if (!pos) return
        const o = placeOrigin(type, pos.x, pos.y)
        select(addItem(type, o.x, o.y))
        setActivePanel((p) => (p === 'picker' ? null : p))
      }
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape') return
        ev.preventDefault()
        ev.stopPropagation()
        cleanup()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', cleanup)
      window.addEventListener('keydown', onKey, true) // capture: vor dem globalen Esc-Handler
    },
    [addItem, select, placeOrigin, moveGhost],
  )

  const handleExportPdf = useCallback(async () => {
    const planImageDataUrl = await canvasRef.current?.exportSnapshot()
    const s = useEventStore.getState()
    const phase = s.phases.find((p) => p.id === s.currentPhaseId)
    exportPhaseToPdf({ eventName: s.eventName, phase, items: s.items, currentPhaseId: s.currentPhaseId, planImageDataUrl })
  }, [])

  /** Dupliziert die komplette Auswahl in EINEM Schritt und wählt die Kopien aus. */
  const duplicateSelected = useCallback(() => {
    if (selectedIds.length === 0) return
    const ids = duplicateItems(selectedIds)
    if (ids.length > 0) selectMany(ids, false)
  }, [selectedIds, duplicateItems, selectMany])

  /** Löscht die komplette Auswahl (ein Objekt oder mehrere) als EIN Undo-Schritt. */
  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return
    removeItems(selectedIds)
    select(null)
  }, [selectedIds, removeItems, select])

  /** Blendet die komplette Auswahl in dieser Phase aus (ein Objekt oder mehrere). */
  const hideSelection = useCallback(() => {
    if (selectedIds.length === 0) return
    toggleItemsVisible(selectedIds, false)
    select(null)
  }, [selectedIds, toggleItemsVisible, select])

  const openPicker = useCallback((tab: PickerTab) => {
    setPickerTab(tab)
    setActivePanel('picker')
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
      toggleInventory: () => togglePanel('inventory'),
      fitToView: () => canvasRef.current?.fitToView(),
      showShortcuts: () => setActivePanel('shortcuts'),
      goToProjects: closeProject,
    }),
    [placeType, placeChairRows, changeTool, openPicker, nivtec.open, handleExportPdf, closeProject, togglePanel],
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Solange die 3D-Ansicht offen ist, gehören alle Tasten ihr: nur Esc schließt sie.
      if (show3D) {
        if (e.key === 'Escape') setShow3D(false)
        return
      }
      const isMod = e.ctrlKey || e.metaKey
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        togglePanel('command')
        return
      }
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (activePanel === 'command') return

      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      const key = e.key.toLowerCase()
      if (isMod && key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (isMod && key === 'a') {
        e.preventDefault()
        const s = useEventStore.getState()
        selectMany(s.itemOrder.filter((id) => s.items[id]?.phaseData[s.currentPhaseId]?.visible), false)
        return
      }
      if (isMod && key === 'c' && selectedIds.length > 0) {
        e.preventDefault()
        const s = useEventStore.getState()
        clipboardRef.current = {
          items: selectedIds.map((id) => s.items[id]).filter((it): it is EventItem => !!it),
          phaseId: s.currentPhaseId,
          pastes: 0,
        }
        return
      }
      if (isMod && key === 'v' && clipboardRef.current) {
        e.preventDefault()
        const cb = clipboardRef.current
        // Gleiche Phase: versetzt einfügen; andere Phase: an derselben Stelle (Aufbau → Event übernehmen)
        const samePhase = cb.phaseId === currentPhaseId
        if (samePhase) cb.pastes += 1
        const ids = pasteItems(cb.items, cb.phaseId, samePhase ? 20 * cb.pastes : 0)
        if (ids.length > 0) selectMany(ids, false)
        return
      }
      if (isMod && key === 'd' && selectedIds.length > 0) {
        e.preventDefault()
        duplicateSelected()
        return
      }
      if (isMod || e.altKey) return

      const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const arrow = ARROWS[e.key]
      if (arrow && selectedIds.length > 0) {
        e.preventDefault()
        // Ohne Raster: 10 cm (⇧: 1 m). Mit Raster: ein Rasterschritt (⇧: 5 Schritte).
        const step = gridEnabled ? (e.shiftKey ? gridSize * 5 : gridSize) : e.shiftKey ? PPM : PPM * 0.1
        nudgeItems(selectedIds, arrow[0] * step, arrow[1] * step)
        return
      }
      if (key === 'r' && selectedIds.length > 0) {
        e.preventDefault()
        rotateItems(selectedIds, e.shiftKey ? -90 : 90)
        return
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        canvasRef.current?.zoomIn()
        return
      }
      if (e.key === '-') {
        e.preventDefault()
        canvasRef.current?.zoomOut()
        return
      }
      if (e.key === '0' || (e.shiftKey && e.code === 'Digit1')) {
        e.preventDefault()
        canvasRef.current?.fitToView()
        return
      }
      if (e.shiftKey && e.code === 'Digit2' && selectedIds.length > 0) {
        e.preventDefault()
        const s = useEventStore.getState()
        const box = unionBox(
          selectedIds
            .map((id) => s.items[id])
            .filter((it): it is EventItem => !!it?.phaseData[s.currentPhaseId])
            .map((it) => worldBBox(it, it.phaseData[s.currentPhaseId], PPM)),
        )
        if (box) canvasRef.current?.zoomToBounds(box)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        deleteSelection()
        return
      }
      if (e.key === '?') {
        togglePanel('shortcuts')
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        setActivePanel('command')
        return
      }
      if (key === 'v') return changeTool('select')
      if (key === 'm') return changeTool('measure')
      if (key === 'b') return changeTool('area')
      if (key === 'o') {
        togglePanel('picker')
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
        // Von innen nach außen schließen: Platzieren → Werkzeug → Panels → Auswahl
        if (placement) setPlacement(null)
        else if (tool !== 'select') setTool('select')
        else if (activePanel) setActivePanel(null)
        else if (selectedIds.length > 0) select(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    undo, redo, rotateItems, nudgeItems, pasteItems, selectedIds, selectMany, duplicateSelected, deleteSelection, changeTool,
    select, activePanel, placement, tool, phases, currentPhaseId, setCurrentPhase, togglePanel, show3D, gridEnabled, gridSize,
  ])

  // Kontextleiste an der Auswahl ausrichten. Über dem Objekt braucht es genug Abstand, um den
  // Rotationsgriff (fest ~26 Bildschirm-Pixel über der Objekt-Oberkante, siehe EventItemShape)
  // freizulassen — sonst legt sich die Leiste über den Griff und man kommt nicht mehr an ihn heran.
  const ROTATE_HANDLE_CLEARANCE = 40
  let barStyle: React.CSSProperties | null = null
  if (selectedItem && selectedVisible && viewport && !placement && tool === 'select' && !gestureActive) {
    const b = screenBounds(selectedItem, currentPhaseId, viewport)
    if (b) {
      const cx = Math.min(Math.max((b.minX + b.maxX) / 2, 230), viewport.width - 230)
      const above = b.minY - ROTATE_HANDLE_CLEARANCE > 150
      barStyle = above
        ? { left: cx, top: b.minY - ROTATE_HANDLE_CLEARANCE, transform: 'translate(-50%, -100%)' }
        : { left: cx, top: Math.min(b.maxY + 12, viewport.height - 220), transform: 'translate(-50%, 0)' }
    }
  }

  // Kontextleiste für die Mehrfachauswahl: an der gemeinsamen Bounding-Box aller ausgewählten,
  // in dieser Phase sichtbaren Objekte ausgerichtet.
  let multiBarStyle: React.CSSProperties | null = null
  if (selectedIds.length > 1 && viewport && !placement && tool === 'select' && !gestureActive) {
    const boxes = selectedIds
      .map((id) => items[id])
      .filter((it): it is EventItem => !!it && !!it.phaseData[currentPhaseId]?.visible)
      .map((it) => screenBounds(it, currentPhaseId, viewport))
      .filter((b): b is NonNullable<typeof b> => !!b)
    if (boxes.length > 0) {
      const minX = Math.min(...boxes.map((b) => b.minX))
      const maxX = Math.max(...boxes.map((b) => b.maxX))
      const minY = Math.min(...boxes.map((b) => b.minY))
      const maxY = Math.max(...boxes.map((b) => b.maxY))
      const cx = Math.min(Math.max((minX + maxX) / 2, 230), viewport.width - 230)
      const above = minY - 20 > 150
      multiBarStyle = above
        ? { left: cx, top: minY - 20, transform: 'translate(-50%, -100%)' }
        : { left: cx, top: Math.min(maxY + 12, viewport.height - 220), transform: 'translate(-50%, 0)' }
    }
  }

  if (presenting) return <PresentationMode startPhaseId={currentPhaseId} onClose={() => setPresenting(false)} />

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-ground select-none">
      <CanvasEditor
        ref={canvasRef}
        pixelsPerMeter={PPM}
        selectedIds={selectedIds}
        onSelect={select}
        onSelectMany={selectMany}
        tool={tool}
        onToolChange={changeTool}
        placement={placement}
        onPlacementDone={clearPlacement}
        onGestureChange={setGestureActive}
        ghostPhaseId={onionSkin ? prevPhaseId : null}
        ghostItemIds={ghostItemIds}
        onViewportChange={setViewport}
        gridEnabled={gridEnabled}
        gridSize={gridSize}
        eventName={eventName}
        phaseName={phases.find((p) => p.id === currentPhaseId)?.name || 'Phase'}
      />

      <Toolbar
        onOpenCommand={() => setActivePanel('command')}
      />

      {/* Kontextleiste an der Auswahl (Einzelauswahl) */}
      {barStyle && selectedItem && (
        <div className="absolute z-10" style={barStyle}>
          <SelectionBar
            item={selectedItem}
            onDuplicate={duplicateSelected}
            onDelete={deleteSelection}
            onHideInPhase={hideSelection}
            onOpenProperties={() => togglePanel('properties')}
            propertiesOpen={activePanel === 'properties'}
          />
        </div>
      )}

      {/* Kontextleiste an der Auswahl (Mehrfachauswahl) */}
      {multiBarStyle && (
        <div className="absolute z-10" style={multiBarStyle}>
          <MultiSelectionBar
            count={selectedIds.length}
            ids={selectedIds}
            onDuplicate={duplicateSelected}
            visiovaFrames={selectedVisiovaFrames}
            onCopyToLaterPhases={hasLaterPhases ? () => copyItemsToLaterPhases(selectedIds) : undefined}
            onHide={hideSelection} onDelete={deleteSelection} />
        </div>
      )}

      {/* Rechte Seite: Inventar-Blatt und Objekt-Eigenschaften */}
      <div className="absolute right-4 top-[84px] bottom-[112px] z-20 flex gap-3 items-start pointer-events-none">
        {activePanel === 'properties' && selectedItem && selectedVisible && (
          <div className="pointer-events-auto">
            <PropertiesPanel
              item={selectedItem}
              currentPhaseId={currentPhaseId}
              onClose={() => setActivePanel(null)}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelection}
            />
          </div>
        )}
        {activePanel === 'inventory' && (
          <div className="pointer-events-auto h-full flex">
            <InventoryPanel selectedIds={selectedIds} onSelect={selectFromInventory} onClose={() => setActivePanel(null)} />
          </div>
        )}
      </div>

      {/* Objekt-Blatt über dem Dock */}
      {activePanel === 'picker' && (
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
                setActivePanel(null)
              }
            }}
            onInsertCenter={(type) => placeType(type, 1, 'center')}
            onCreateChairRows={placeChairRows}
            onImportNivtec={nivtec.open}
            onCreateCustom={placeCustom}
            onClose={() => setActivePanel(null)}
            onTileDragStart={handleTileDragStart}
          />
        </div>
      )}

      {/* Text-Eingabe für die freie Beschriftung */}
      {activePanel === 'text' && (
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-[176px] z-20 p-3 w-[min(320px,calc(100vw-32px))] flex flex-col gap-2 ${island}`}>
          <input
            autoFocus
            value={textLabelDraft ?? ''}
            onChange={(e) => setTextLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTextLabelDraft()
              if (e.key === 'Escape') {
                setTextLabelDraft(null)
                setActivePanel(null)
              }
            }}
            placeholder='z. B. "Einlass hier"...'
            className={`w-full ${inputCls}`}
          />
          <div className="flex items-center gap-2">
            <button onClick={commitTextLabelDraft} className={`flex-1 ${btn('primary', 'sm')}`}>
              In Plan tippen zum Platzieren
            </button>
            <button onClick={() => setTextLabelDraft(null)} className={btn('secondary', 'sm')}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Phasen-Zeitleiste */}
      <div className="absolute left-4 right-4 bottom-4 z-20">
        <PhaseTimeline
          onPresent={() => setPresenting(true)}
          onionSkin={onionSkin}
          onToggleOnionSkin={() => setOnionSkin((v) => !v)}
          inventoryOpen={activePanel === 'inventory'}
          onToggleInventory={() => togglePanel('inventory')}
        />
      </div>

      {/* Werkzeug-Dock */}
      <FloatingToolbar
        tool={tool}
        onToolChange={changeTool}
        placement={placement}
        onPlacementDone={clearPlacement}
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        pickerTab={pickerTab}
        onPickerTabChange={setPickerTab}
        zoom={viewport?.zoom ?? 1}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onZoomReset={() => canvasRef.current?.fitToView()}
        onZoomSet={(percent) => canvasRef.current?.setZoomPercent(percent)}
        onExportImage={() => void handleExportPdf()}
        gridEnabled={gridEnabled}
        gridSize={gridSize}
        onGridSizeChange={setGridSize}
        onGridToggle={() => setGridEnabled(!gridEnabled)}
        codesHidden={codesHidden}
        onCodesToggle={() => toggleLayer('hideCodes')}
        on3D={() => setShow3D(true)}
      />

      {/* Tastatur-Hilfe */}
      <button
        onClick={() => togglePanel('shortcuts')}
        title="Tastatur-Shortcuts (?)"
        className={`absolute bottom-48 left-4 z-20 w-10 h-10 rounded-full text-ink2 hover:text-ink flex items-center justify-center text-sm font-semibold ${island}`}
      >
        ?
      </button>
      {activePanel === 'shortcuts' && (
        <div className={`absolute bottom-[160px] left-4 z-30 p-3.5 w-80 text-xs space-y-2 ${island}`}>
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-chip">
            <span className="font-bold text-ink text-sm">Tastatur-Shortcuts</span>
            <button onClick={() => setActivePanel(null)} className="text-ink3 hover:text-ink leading-none text-base px-1 -mr-1">
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

      {activePanel === 'command' && <CommandBar onClose={() => setActivePanel(null)} actions={commandActions} />}
      {nivtec.inputElement}

      {/* Formvorschau beim Ziehen einer Kachel aus der Objekt-Bibliothek: nimmt sofort die
          echte Größe/Form des Objekts an und folgt dem Zeiger, statt des trägen Browser-Ghosts. */}
      {dragGhostType && (() => {
        const tpl = ITEM_LIBRARY.find((t) => t.type === dragGhostType)
        const zoom = viewport?.zoom ?? 1
        const w = Math.max(metersToPixels(tpl?.width ?? 1, PPM) * zoom, 22)
        const h = Math.max(metersToPixels(tpl?.height ?? 1, PPM) * zoom, 22)
        // Position kommt über moveGhost per transform (kein left/top/transform im style).
        return (
          <div
            ref={ghostElRef}
            className="fixed left-0 top-0 z-50 pointer-events-none flex items-center justify-center text-lg bg-accent-soft/90 border-2 border-accent shadow-lg text-ink"
            style={{ width: w, height: h, borderRadius: isRoundType(dragGhostType) ? '9999px' : '10px' }}
          >
            {tpl?.icon}
          </div>
        )
      })()}

      {/* 3D-Ansicht der aktuellen Phase als Overlay */}
      {show3D && (
        <Suspense fallback={null}>
          <Venue3D onClose={() => setShow3D(false)} />
        </Suspense>
      )}
    </div>
  )
}
