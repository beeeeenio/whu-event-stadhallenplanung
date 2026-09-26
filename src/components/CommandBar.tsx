import { useEffect, useMemo, useRef, useState } from 'react'
import { useEventStore } from '../store/store'
import type { ItemType, LayerState } from '../types'
import type { ToolMode } from './CanvasEditor'
import type { PickerTab } from './ObjectPicker'
import { chairRowSuggestion, matchLibrary, parseQuery, textMatches } from '../utils/commandParser'
import { sortPhases } from '../utils/phaseDiff'
import { kbd } from '../utils/ui'

export interface CommandActions {
  placeType: (type: ItemType, quantity: number, mode: 'tap' | 'center') => void
  placeChairRows: (rows: number, cols: number, mode: 'tap' | 'center') => void
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
  hint?: string
  run: () => void
  runAlt?: () => void
}

const LAYER_LABELS: Record<keyof LayerState, string> = {
  walls: 'Grundriss',
  rigging: 'Bühnenzüge',
  power: 'Strom/CEE',
  simplified: 'Vereinfacht',
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
    if (/^\s*(neue\s+)?phase\b/i.test(query) || (query.trim() && lib.length === 0 && !rows)) {
      const name = newName || `Phase ${phases.length + 1}`
      out.push({
        id: 'phase-new',
        group: 'Phasen',
        icon: '+',
        label: `Neue Phase „${name}“ anlegen`,
        hint: 'übernimmt den aktuellen Aufbau',
        run: () => addPhase(name),
      })
    }

    const cmds: Omit<Result, 'group'>[] = [
      { id: 'area', icon: '▭', label: 'Bereich zeichnen', hint: 'B', run: () => actions.setTool('area') },
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
      ...(Object.keys(LAYER_LABELS) as (keyof LayerState)[]).map((k) => ({
        id: `layer-${k}`,
        icon: layers[k] ? '☑' : '☐',
        label: `Ansicht: ${LAYER_LABELS[k]} ${layers[k] ? 'ausblenden' : 'einblenden'}`,
        run: () => toggleLayer(k),
      })),
      { id: 'help', icon: '?', label: 'Tastatur-Shortcuts', hint: '?', run: actions.showShortcuts },
      { id: 'projects', icon: '←', label: 'Zurück zur Projektübersicht', run: actions.goToProjects },
    ]
    for (const c of cmds) {
      if (words.length === 0 || textMatches(words, c.label)) out.push({ ...c, group: 'Befehle' })
    }
    return out
  }, [query, phases, currentPhaseId, layers, actions, setCurrentPhase, addPhase, toggleLayer, undo, redo])

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
