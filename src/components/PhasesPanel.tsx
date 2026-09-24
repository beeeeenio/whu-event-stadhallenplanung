import { useState } from 'react'
import { useEventStore } from '../store/store'
import { btn, input, panel, panelHeader, panelTitle, panelSubtitle, collapseToggle } from '../utils/ui'

export default function PhasesPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const phases = useEventStore((s) => s.phases)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const setCurrentPhase = useEventStore((s) => s.setCurrentPhase)
  const addPhase = useEventStore((s) => s.addPhase)
  const removePhase = useEventStore((s) => s.removePhase)
  const renamePhase = useEventStore((s) => s.renamePhase)
  const [newPhaseName, setNewPhaseName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const commitRename = (id: string) => {
    if (renameValue.trim()) renamePhase(id, renameValue.trim())
    setRenamingId(null)
  }

  const handleAdd = () => {
    if (!newPhaseName.trim()) return
    addPhase(newPhaseName.trim())
    setNewPhaseName('')
  }

  if (collapsed) {
    return (
      <div className={`w-9 shrink-0 h-full flex flex-col items-center ${panel} border-y-0 border-l-0 border-r border-gray-200`}>
        <button onClick={() => setCollapsed(false)} title="Phasen einblenden" className={collapseToggle}>
          »
        </button>
        <span
          className="flex-1 flex items-center justify-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
          style={{ writingMode: 'vertical-rl' }}
        >
          Phasen
        </span>
      </div>
    )
  }

  return (
    <div className={`w-48 shrink-0 h-full flex flex-col ${panel} border-y-0 border-l-0`}>
      <div className={`${panelHeader} flex items-start justify-between gap-2`}>
        <div>
          <h2 className={panelTitle}>Phasen</h2>
          <p className={panelSubtitle}>Ablauf des Events</p>
        </div>
        <button onClick={() => setCollapsed(true)} title="Phasen einklappen" className="text-gray-400 hover:text-gray-700 shrink-0">
          «
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        {phases.map((p) => (
          <li key={p.id} className="flex items-center gap-1">
            {renamingId === p.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(p.id)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                onBlur={() => commitRename(p.id)}
                className={`flex-1 ${input}`}
              />
            ) : (
              <button
                onClick={() => setCurrentPhase(p.id)}
                onDoubleClick={() => {
                  setRenamingId(p.id)
                  setRenameValue(p.name)
                }}
                className={`flex-1 text-left text-xs px-2.5 py-2 rounded-md truncate transition-colors ${
                  p.id === currentPhaseId
                    ? 'bg-blue-600 text-white font-medium shadow-sm'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                title="Klicken zum Wechseln, Doppelklick zum Umbenennen"
              >
                {p.name}
              </button>
            )}
            {phases.length > 1 && (
              <button
                onClick={() => removePhase(p.id)}
                className="text-gray-300 hover:text-red-600 text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 transition-colors"
                title="Phase löschen"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="p-2.5 border-t border-gray-200 space-y-1.5">
        <input
          value={newPhaseName}
          onChange={(e) => setNewPhaseName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Neue Phase…"
          className={`w-full border-dashed ${input}`}
        />
        <button onClick={handleAdd} className={`w-full ${btn('secondary', 'sm')}`}>
          + Phase hinzufügen
        </button>
      </div>
    </div>
  )
}
