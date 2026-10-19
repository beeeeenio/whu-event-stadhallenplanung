import { useEffect, useMemo, useRef, useState } from 'react'
import { useEventStore } from '../store/store'
import type { ItemType, LayerState } from '../types'
import type { ToolMode } from './CanvasEditor'
import type { PickerTab } from './ObjectPicker'
import { chairRowSuggestion, matchLibrary, parseQuery, textMatches } from '../utils/commandParser'
import { crossPhaseInventory, peakAsSummary, sortPhases } from '../utils/phaseDiff'
import { countVisibleItems } from '../utils/countItems'
import { exportInventoryCsv } from '../utils/exportInventory'
import { openMenu } from '../utils/uiEvents'
import { LEVELS } from '../utils/levels'
import { kbd } from '../utils/ui'

export interface CommandActions {
  placeType: (type: ItemType, quantity: number, mode: 'tap' | 'center') => void
  placeChairRows: (rows: number, cols: number, mode: 'tap' | 'center', rowSpacingM?: number) => void
  setTool: (tool: ToolMode) => void
  openPicker: (tab: PickerTab) => void
  importNivtec: () => void
  exportPdf: () => void
  present: () => void
  toggleOnionSkin: () => void
  toggleInventory: () => void
  fitToView: () => void
  showShortcuts: () => void
  goToProjects: () => void
  open3D: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomToSelection: () => void
  exportImage: () => void
  openText: () => void
  selectedIds: string[]
  selectAll: () => void
  clearSelection: () => void
  copySelection: () => void
  pasteClipboard: () => void
  duplicateSelection: () => void
  deleteSelection: () => void
}

interface Props {
  onClose: () => void
  actions: CommandActions
}

interface Result {
  id: string
  group: string
  icon: string
  label: string
  /** Zusätzliche Suchwörter, die nicht im Namen stehen. */
  keywords?: string
  hint?: string
  run: () => void
  runAlt?: () => void
}

const LAYER_LABELS: Record<Exclude<keyof LayerState, 'hideCodes'>, string> = {
  walls: 'Grundriss',
  rigging: 'Bühnenzüge',
  power: 'Strom/CEE',
  simplified: 'Vereinfacht',
}

const LAYER_KEYWORDS: Record<keyof typeof LAYER_LABELS, string> = {
  walls: 'plan hintergrund wände ebene',
  rigging: 'traversen züge rigging belastbarkeit ebene',
  power: 'strom steckdosen cee bodentank elektro anschlüsse ebene',
  simplified: 'aufgehellt entrümpelt plan ebene',
}

/** ⌘K-Befehlszeile (Konzept C): Objekte setzen, Phasen wechseln, Ansicht und Export steuern. */
export default function CommandBar({ onClose, actions }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const phases = useEventStore((s) => s.phases)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const layers = useEventStore((s) => s.layers)
  const currentLevel = useEventStore((s) => s.currentLevel)
  const gridEnabled = useEventStore((s) => s.gridEnabled)
  const setCurrentPhase = useEventStore((s) => s.setCurrentPhase)
  const addPhase = useEventStore((s) => s.addPhase)
  const toggleLayer = useEventStore((s) => s.toggleLayer)
  const undo = useEventStore((s) => s.undo)
  const redo = useEventStore((s) => s.redo)

  useEffect(() => inputRef.current?.focus(), [])

  const results = useMemo<Result[]>(() => {
    const q = parseQuery(query)
    const out: Result[] = []
    const qty = q.quantity ?? 1

    const rows = chairRowSuggestion(q)
    if (rows) {
      out.push({
        id: 'rows',
        group: 'Platzieren',
        icon: '▦',
        label: `Stuhlreihen: ${rows.rows} Reihen × ${rows.cols} Stühle (${rows.rows * rows.cols} Stühle)`,
        hint: '↵ im Plan platzieren · ⇧↵ Bildmitte',
        run: () => actions.placeChairRows(rows.rows, rows.cols, 'tap'),
        runAlt: () => actions.placeChairRows(rows.rows, rows.cols, 'center'),
      })
    }

    const lib = matchLibrary(q.words)
    const libLimit = q.words.length === 0 ? lib.length : 6
    for (const t of lib.slice(0, libLimit)) {
      out.push({
        id: `lib-${t.type}`,
        group: 'Platzieren',
        icon: t.icon,
        label: qty > 1 ? `${qty} × ${t.label}` : t.label,
        hint: '↵ platzieren · ⇧↵ Bildmitte',
        run: () => actions.placeType(t.type, qty, 'tap'),
        runAlt: () => actions.placeType(t.type, qty, 'center'),
      })
    }

    const words = q.words
    const sorted = sortPhases(phases)
    sorted.forEach((p, i) => {
      if (p.id === currentPhaseId) return
      if (words.length === 0 || textMatches(words, `phase ${p.name} ${i + 1}`)) {
        out.push({
          id: `phase-${p.id}`,
          group: 'Phasen',
          icon: String(i + 1),
          label: `Zu Phase „${p.name}“ wechseln`,
          run: () => setCurrentPhase(p.id),
        })
      }
    })
    const newName = query.replace(/^\s*(neue\s+)?phase:?\s*/i, '').trim()
    const newPhaseResult = (): Result => {
      const name = newName || `Phase ${phases.length + 1}`
      return {
        id: 'phase-new',
        group: 'Phasen',
        icon: '+',
        label: `Neue Phase „${name}“ anlegen`,
        hint: 'übernimmt den aktuellen Aufbau',
        run: () => addPhase(name),
      }
    }
    // Wer „Phase …“ schreibt, will eine Phase anlegen (steht dann oben); sonst nur als letzter Ausweg
    const wantsNewPhase = /^\s*(neue\s+)?phase\b/i.test(query)

    const cmds: Omit<Result, 'group'>[] = [
      { id: 'area', icon: '▭', label: 'Bereich zeichnen', hint: 'B', run: () => actions.setTool('area') },
      { id: 'hand', icon: '✋', label: 'Hand-Werkzeug (nur verschieben)', hint: 'H', run: () => actions.setTool('hand') },
      { id: 'measure', icon: '↔', label: 'Messen', hint: 'M', run: () => actions.setTool('measure') },
      { id: 'select', icon: '↖', label: 'Auswählen', hint: 'V', run: () => actions.setTool('select') },
      { id: 'rowsgen', icon: '▦', label: 'Stuhlreihen-Generator öffnen', run: () => actions.openPicker('rows') },
      { id: 'nivtec', icon: '⇪', label: 'NivTec-Bühne importieren (JSON)…', run: actions.importNivtec },
      { id: 'pdf', icon: '⎙', label: 'PDF exportieren (aktuelle Phase)', run: actions.exportPdf },
      { id: 'present', icon: '▶', label: 'Präsentation starten', run: actions.present },
      { id: 'onion', icon: '◐', label: 'Vorphase einblenden/ausblenden', run: actions.toggleOnionSkin },
      { id: 'inv', icon: '≡', label: 'Stückliste / Inventar', run: actions.toggleInventory },
      { id: 'fit', icon: '⤢', label: 'Einpassen', run: actions.fitToView },
      { id: 'undo', icon: '↺', label: 'Rückgängig', hint: '⌘Z', run: undo },
      { id: 'redo', icon: '↻', label: 'Wiederholen', hint: '⌘⇧Z', run: redo },
      ...(Object.keys(LAYER_LABELS) as (keyof typeof LAYER_LABELS)[]).map((k) => ({
        id: `layer-${k}`,
        icon: layers[k] ? '☑' : '☐',
        label: `Ansicht: ${LAYER_LABELS[k]} ${layers[k] ? 'ausblenden' : 'einblenden'}`,
        keywords: LAYER_KEYWORDS[k],
        run: () => toggleLayer(k),
      })),
      {
        id: 'layer-hideCodes',
        icon: layers.hideCodes ? '☐' : '☑',
        label: `Ansicht: Steckdosen-Codes ${layers.hideCodes ? 'einblenden' : 'ausblenden'}`,
        keywords: 'beschriftung 3f9 ebene',
        run: () => toggleLayer('hideCodes'),
      },
      { id: 'help', icon: '?', label: 'Tastatur-Shortcuts', hint: '?', run: actions.showShortcuts },
      {
        id: 'projects',
        icon: '←',
        label: 'Zurück zur Projektübersicht',
        keywords: 'projekte exportieren importieren zip sichern laden öffnen',
        run: actions.goToProjects,
      },
    ]
    for (const c of cmds) {
      if (words.length === 0 || textMatches(words, `${c.label} ${c.keywords ?? ''}`)) out.push({ ...c, group: 'Befehle' })
    }

    // Weitere Befehle in Gruppen, damit die Liste bei leerer Suche übersichtlich bleibt
    const st = () => useEventStore.getState()
    const sel = actions.selectedIds
    const groups: [string, Omit<Result, 'group'>[]][] = [
      [
        'Ansicht',
        [
          ...LEVELS.map((l) => ({
            id: `level-${l.id}`,
            icon: l.short,
            label: `Geschoss: ${l.label} bearbeiten${currentLevel === l.id ? ' (aktuell)' : ''}`,
            keywords: 'etage stockwerk ebene eg og',
            run: () => st().setCurrentLevel(l.id),
          })),
          { id: '3d', icon: '◧', label: '3D-Ansicht öffnen', keywords: 'dreidimensional ansehen', run: actions.open3D },
          { id: 'zoom-in', icon: '+', label: 'Vergrößern (Zoom +)', hint: '+', run: actions.zoomIn },
          { id: 'zoom-out', icon: '−', label: 'Verkleinern (Zoom −)', hint: '−', run: actions.zoomOut },
          ...(sel.length > 0 ? [{ id: 'zoom-sel', icon: '⌖', label: 'Auf Auswahl zoomen', hint: '⇧2', run: actions.zoomToSelection }] : []),
          {
            id: 'grid',
            icon: gridEnabled ? '☑' : '☐',
            label: `Raster ${gridEnabled ? 'ausblenden' : 'einblenden'}`,
            keywords: 'gitter einrasten snapping',
            run: () => st().setGridEnabled(!gridEnabled),
          },
          ...([[5, '0,25 m'], [10, '0,5 m'], [20, '1 m'], [40, '2 m']] as const).map(([px, name]) => ({
            id: `grid-${px}`,
            icon: '▦',
            label: `Rasterweite ${name}`,
            keywords: 'gitter',
            run: () => {
              st().setGridSize(px)
              st().setGridEnabled(true)
            },
          })),
        ],
      ],
      [
        'Auswahl',
        [
          { id: 'sel-all', icon: '▣', label: 'Alles auswählen', hint: '⌘A', run: actions.selectAll },
          ...(sel.length > 0
            ? [
                { id: 'sel-none', icon: '☐', label: 'Auswahl aufheben', hint: 'Esc', run: actions.clearSelection },
                { id: 'sel-copy', icon: '⧉', label: 'Auswahl kopieren', hint: '⌘C', run: actions.copySelection },
                { id: 'sel-dup', icon: '⧉', label: 'Auswahl duplizieren', hint: '⌘D', run: actions.duplicateSelection },
                { id: 'sel-del', icon: '✕', label: 'Auswahl löschen', hint: '⌫', keywords: 'entfernen', run: actions.deleteSelection },
                { id: 'sel-rot', icon: '⟳', label: 'Auswahl um 90° drehen', hint: 'R', run: () => st().rotateItems(sel, 90) },
                { id: 'sel-rotl', icon: '⟲', label: 'Auswahl um 90° zurückdrehen', hint: '⇧R', run: () => st().rotateItems(sel, -90) },
                {
                  id: 'sel-lock',
                  icon: '🔒',
                  label: 'Auswahl sperren oder entsperren',
                  keywords: 'fixieren',
                  run: () => st().setItemsLocked(sel, !sel.every((id) => st().items[id]?.locked)),
                },
                { id: 'sel-hide', icon: '○', label: 'Auswahl in dieser Phase ausblenden', run: () => st().toggleItemsVisible(sel, false) },
                {
                  id: 'sel-later',
                  icon: '→',
                  label: 'Auswahl in spätere Phasen übernehmen',
                  keywords: 'kopieren phase aufbau event abbau',
                  run: () => st().copyItemsToLaterPhases(sel),
                },
              ]
            : []),
          { id: 'sel-paste', icon: '⎘', label: 'Einfügen', hint: '⌘V', run: actions.pasteClipboard },
          ...(sel.length > 1
            ? ([
                ['left', 'links bündig'],
                ['centerX', 'horizontal zentriert'],
                ['right', 'rechts bündig'],
                ['top', 'oben bündig'],
                ['centerY', 'vertikal zentriert'],
                ['bottom', 'unten bündig'],
              ] as const).map(([mode, name]) => ({
                id: `align-${mode}`,
                icon: '⫶',
                label: `Ausrichten: ${name}`,
                keywords: 'anordnen bündig',
                run: () => st().alignItems(sel, mode),
              }))
            : []),
          ...(sel.length > 2
            ? ([
                ['horizontal', 'horizontal'],
                ['vertical', 'vertikal'],
              ] as const).map(([axis, name]) => ({
                id: `dist-${axis}`,
                icon: '⋯',
                label: `Gleichmäßig verteilen: ${name}`,
                keywords: 'abstand anordnen',
                run: () => st().distributeItems(sel, axis),
              }))
            : []),
        ],
      ],
      [
        'Phasen',
        [
          {
            id: 'phase-next',
            icon: '›',
            label: 'Nächste Phase',
            run: () => {
              const ps = sortPhases(st().phases)
              const i = ps.findIndex((p) => p.id === st().currentPhaseId)
              if (ps[i + 1]) st().setCurrentPhase(ps[i + 1].id)
            },
          },
          {
            id: 'phase-prev',
            icon: '‹',
            label: 'Vorherige Phase',
            run: () => {
              const ps = sortPhases(st().phases)
              const i = ps.findIndex((p) => p.id === st().currentPhaseId)
              if (ps[i - 1]) st().setCurrentPhase(ps[i - 1].id)
            },
          },
          {
            id: 'phase-empty',
            icon: '+',
            label: 'Neue leere Phase anlegen',
            run: () => st().addPhase(`Phase ${st().phases.length + 1}`, true),
          },
          {
            id: 'phase-rename',
            icon: '✎',
            label: 'Aktuelle Phase umbenennen…',
            run: () => {
              const cur = st().phases.find((p) => p.id === st().currentPhaseId)
              const name = window.prompt('Neuer Name der Phase', cur?.name ?? '')?.trim()
              if (name && cur) st().renamePhase(cur.id, name)
            },
          },
          {
            id: 'phase-delete',
            icon: '🗑',
            label: 'Aktuelle Phase löschen…',
            run: () => {
              const cur = st().phases.find((p) => p.id === st().currentPhaseId)
              if (cur && st().phases.length > 1 && window.confirm(`Phase „${cur.name}“ wirklich löschen?`)) st().removePhase(cur.id)
            },
          },
        ],
      ],
      [
        'Projekt',
        [
          {
            id: 'rename-event',
            icon: '✎',
            label: 'Projekt umbenennen…',
            run: () => {
              const name = window.prompt('Neuer Projektname', st().eventName)?.trim()
              if (name) st().setEventName(name)
            },
          },
          { id: 'versions', icon: '⏱', label: 'Versionen anzeigen oder speichern', keywords: 'stand sichern wiederherstellen', run: () => openMenu('versions') },
          { id: 'templates', icon: '▤', label: 'Aufbau-Vorlagen öffnen oder speichern', keywords: 'vorlage template', run: () => openMenu('templates') },
          { id: 'text', icon: 'T', label: 'Text-Label hinzufügen', keywords: 'beschriftung schrift', run: actions.openText },
          { id: 'objects', icon: '+', label: 'Objekt-Bibliothek öffnen', keywords: 'möbel infrastruktur custom eigenes objekt', run: () => actions.openPicker('furniture') },
          { id: 'custom', icon: '◇', label: 'Eigenes Objekt anlegen', keywords: 'benutzerdefiniert maß form farbe', run: () => actions.openPicker('custom') },
          { id: 'png', icon: '🖼', label: 'Plan als Bild (PNG) speichern', keywords: 'export screenshot', run: actions.exportImage },
          {
            id: 'csv',
            icon: '⇩',
            label: 'Stückliste als CSV exportieren (aktuelle Phase)',
            keywords: 'inventar excel liste',
            run: () => {
              const s = st()
              const phase = s.phases.find((p) => p.id === s.currentPhaseId)
              exportInventoryCsv(s.eventName, phase?.name ?? 'Phase', countVisibleItems(s.items, s.currentPhaseId).summary)
            },
          },
          {
            id: 'csv-max',
            icon: '⇩',
            label: 'Stückliste als CSV exportieren (Maximalbedarf aller Phasen)',
            keywords: 'inventar excel liste peak',
            run: () => {
              const s = st()
              exportInventoryCsv(s.eventName, 'Maximalbedarf', peakAsSummary(crossPhaseInventory(s.items, s.phases)))
            },
          },
        ],
      ],
    ]
    for (const [group, list] of groups) {
      for (const c of list) {
        if (words.length === 0 || textMatches(words, `${c.label} ${c.keywords ?? ''}`)) out.push({ ...c, group })
      }
    }
    if (wantsNewPhase) out.unshift(newPhaseResult())
    else if (query.trim() && out.length === 0) out.push(newPhaseResult())
    return out
  }, [query, phases, currentPhaseId, layers, currentLevel, gridEnabled, actions, setCurrentPhase, addPhase, toggleLayer, undo, redo])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const execute = (r: Result | undefined, alt: boolean) => {
    if (!r) return
    onClose()
    ;(alt && r.runAlt ? r.runAlt : r.run)()
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-40 bg-ink/15 flex justify-center items-start pt-[12vh] px-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-[560px] bg-white border border-line rounded-2xl shadow-[0_24px_60px_-20px_rgba(30,30,40,0.45)] overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-chip">
          <span className="text-ink3 text-lg">›</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(results.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                execute(results[active], e.shiftKey)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
            placeholder="z. B. „40 Stühle als Reihe“, „12 Stehtische“, „Phase Party“…"
            className="flex-1 text-base text-ink placeholder:text-ink3/70 focus:outline-none bg-transparent"
          />
          <span className={kbd}>esc</span>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null
            lastGroup = r.group
            return (
              <div key={r.id}>
                {header && (
                  <div className="px-4 pt-2.5 pb-1 text-[10px] font-semibold font-mono tracking-[0.1em] uppercase text-ink3">
                    {header}
                  </div>
                )}
                <button
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={(e) => execute(r, e.shiftKey)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left text-[13.5px] ${
                    i === active ? 'bg-move-soft' : ''
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg bg-chip grid place-items-center text-[11px] font-mono text-move shrink-0">
                    {r.icon}
                  </span>
                  <span className="flex-1 truncate text-ink">{r.label}</span>
                  {r.hint && i === active && <span className="text-[11px] font-mono text-ink3 shrink-0">{r.hint}</span>}
                </button>
              </div>
            )
          })}
          {results.length === 0 && <p className="text-center text-sm text-ink3 py-6">Nichts gefunden</p>}
        </div>
        <div className="flex gap-4 px-4 py-2 border-t border-chip bg-ground/60 text-[11px] font-mono text-ink3">
          <span>↑↓ wählen</span>
          <span>↵ ausführen</span>
          <span>⇧↵ in Bildmitte</span>
        </div>
      </div>
    </div>
  )
}
