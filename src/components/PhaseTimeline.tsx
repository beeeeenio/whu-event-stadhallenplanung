import { useMemo, useState } from 'react'
import { useEventStore } from '../store/store'
import { countVisibleItems } from '../utils/countItems'
import { diffPhases, sortPhases } from '../utils/phaseDiff'
import { island, islandBtn } from '../utils/ui'

interface Props {
  onPresent: () => void
  onionSkin: boolean
  onToggleOnionSkin: () => void
  inventoryOpen: boolean
  onToggleInventory: () => void
}

/**
 * Phasen-Zeitleiste am unteren Rand: Ablauf als Hauptnavigation (Konzept C) in Form
 * der schwebenden Zeitleiste mit Play-Taste (Konzept B). Jede Phase zeigt, was sich
 * gegenüber der vorigen ändert (+ neu / − entfernt / ↔ verschoben).
 */
export default function PhaseTimeline({ onPresent, onionSkin, onToggleOnionSkin, inventoryOpen, onToggleInventory }: Props) {
  const phases = useEventStore((s) => s.phases)
  const items = useEventStore((s) => s.items)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const setCurrentPhase = useEventStore((s) => s.setCurrentPhase)
  const addPhase = useEventStore((s) => s.addPhase)
  const removePhase = useEventStore((s) => s.removePhase)
  const renamePhase = useEventStore((s) => s.renamePhase)
  const reorderPhases = useEventStore((s) => s.reorderPhases)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [newPhaseName, setNewPhaseName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const sorted = useMemo(() => sortPhases(phases), [phases])
  const stats = useMemo(
    () =>
      sorted.map((p, i) => ({
        count: countVisibleItems(items, p.id).total,
        diff: diffPhases(items, i > 0 ? sorted[i - 1].id : null, p.id),
      })),
    [sorted, items],
  )
  const currentIndex = sorted.findIndex((p) => p.id === currentPhaseId)
  const current = countVisibleItems(items, currentPhaseId)

  const commitRename = (id: string) => {
    if (renameValue.trim()) renamePhase(id, renameValue.trim())
    setRenamingId(null)
  }

  const commitAdd = () => {
    const name = newPhaseName.trim() || `Phase ${phases.length + 1}`
    addPhase(name)
    setNewPhaseName('')
    setAdding(false)
  }

  const move = (id: string, dir: -1 | 1) => {
    const idx = sorted.findIndex((p) => p.id === id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= sorted.length) return
    const next = [...sorted]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    reorderPhases(next.map((p, i) => ({ ...p, order: i })))
  }

  return (
    <div className={`flex items-stretch gap-3 p-2 pr-3 ${island}`}>
      <button
        onClick={onPresent}
        className="w-12 shrink-0 rounded-xl bg-accent text-white grid place-items-center text-lg hover:bg-accent-hover transition-colors"
        title="Präsentation ab dieser Phase (Vollbild)"
      >
        ▶
      </button>

      <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto no-scrollbar items-stretch">
        {sorted.map((p, i) => {
          const active = p.id === currentPhaseId
          const { diff, count } = stats[i]
          return (
            <div
              key={p.id}
              className={`group relative shrink-0 w-[168px] rounded-xl border px-2.5 py-1.5 text-left transition-all cursor-pointer ${
                active
                  ? 'border-ink bg-white ring-2 ring-ink'
                  : 'border-line bg-white/70 hover:bg-white hover:border-ink3/40'
              }`}
              onClick={() => setCurrentPhase(p.id)}
              onDoubleClick={() => {
                setRenamingId(p.id)
                setRenameValue(p.name)
              }}
              title="Klicken zum Wechseln, Doppelklick zum Umbenennen"
            >
              <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-ink3 whitespace-nowrap">
                <span>Phase {i + 1}</span>
                <span>·</span>
                <span>{count} Obj.</span>
                <span className="ml-auto flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      move(p.id, -1)
                    }}
                    disabled={i === 0}
                    className="w-5 h-5 rounded hover:bg-chip disabled:opacity-25"
                    title="Phase nach vorne verschieben"
                  >
                    ‹
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      move(p.id, 1)
                    }}
                    disabled={i === sorted.length - 1}
                    className="w-5 h-5 rounded hover:bg-chip disabled:opacity-25"
                    title="Phase nach hinten verschieben"
                  >
                    ›
                  </button>
                  {phases.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(p.id)
                      }}
                      className="w-5 h-5 rounded hover:bg-red-50 hover:text-red-700"
                      title="Phase löschen"
                    >
                      ×
                    </button>
                  )}
                </span>
              </div>
              {renamingId === p.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(p.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => commitRename(p.id)}
                  className="w-full text-sm font-bold text-ink border-b border-accent focus:outline-none bg-transparent"
                />
              ) : (
                <div className={`text-sm font-bold truncate ${active ? 'text-ink' : 'text-ink2'}`}>{p.name}</div>
              )}
              <div className="flex gap-1 mt-0.5 font-mono text-[10.5px] min-h-[16px]">
                {diff.added > 0 && <span className="px-1 rounded bg-plus-soft text-plus" title="Neu gegenüber der Vorphase">+{diff.added}</span>}
                {diff.removed > 0 && <span className="px-1 rounded bg-minus-soft text-minus" title="Entfernt gegenüber der Vorphase">−{diff.removed}</span>}
                {diff.moved > 0 && <span className="px-1 rounded bg-move-soft text-move" title="Verschoben/gedreht gegenüber der Vorphase">↔{diff.moved}</span>}
                {i > 0 && diff.added + diff.removed + diff.moved === 0 && <span className="text-ink3">unverändert</span>}
              </div>

              {confirmDeleteId === p.id && (
                <div
                  className="absolute inset-0 rounded-xl bg-white flex flex-col items-center justify-center gap-1.5 text-xs z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-ink2">„{p.name}“ löschen?</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        removePhase(p.id)
                        setConfirmDeleteId(null)
                      }}
                      className="px-2 py-1 rounded-md bg-red-600 text-white font-semibold"
                    >
                      Löschen
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 rounded-md bg-chip text-ink">
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {adding ? (
          <div className="shrink-0 w-[168px] rounded-xl border border-dashed border-accent bg-white px-2.5 py-1.5 flex flex-col justify-center gap-1">
            <input
              autoFocus
              value={newPhaseName}
              onChange={(e) => setNewPhaseName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitAdd()
                if (e.key === 'Escape') setAdding(false)
              }}
              onBlur={() => (newPhaseName.trim() ? commitAdd() : setAdding(false))}
              placeholder="Neue Phase…"
              className="w-full text-sm font-bold text-ink focus:outline-none bg-transparent"
            />
            <span className="text-[10.5px] text-ink3">übernimmt den aktuellen Aufbau · ↵</span>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 w-14 rounded-xl border border-dashed border-line text-ink3 text-xl hover:border-accent hover:text-accent transition-colors"
            title="+ Phase hinzufügen"
          >
            +
          </button>
        )}
      </div>

      <div className="hidden md:flex items-center gap-4 border-l border-line pl-4 shrink-0">
        <button
          onClick={onToggleOnionSkin}
          disabled={currentIndex <= 0}
          className="flex flex-col items-start leading-tight text-left disabled:opacity-35"
          title="Vorphase als Geisterbild unter dem Plan einblenden"
        >
          <span className="text-[11px] text-ink3">Vorphase</span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <span className={`w-7 h-4 rounded-full relative transition-colors ${onionSkin && currentIndex > 0 ? 'bg-move' : 'bg-chip-hover'}`}>
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${
                  onionSkin && currentIndex > 0 ? 'left-3.5' : 'left-0.5'
                }`}
              />
            </span>
            einblenden
          </span>
        </button>
        <div className="flex flex-col leading-none">
          <b className="text-xl font-extrabold tabular-nums">{current.totalChairs}</b>
          <small className="text-[11px] text-ink3 mt-1">Stühle</small>
        </div>
        <div className="flex flex-col leading-none">
          <b className="text-xl font-extrabold tabular-nums">{current.total}</b>
          <small className="text-[11px] text-ink3 mt-1">Objekte</small>
        </div>
      </div>
      <button
        onClick={onToggleInventory}
        className={islandBtn(inventoryOpen ? 'dark' : 'chip', 'self-center shrink-0')}
        title="Inventar / Stückliste"
      >
        Stückliste
      </button>
    </div>
  )
}
