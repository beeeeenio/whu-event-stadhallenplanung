import { useState } from 'react'
import { useProjectsStore } from '../store/projectsStore'
import { btn } from '../utils/ui'

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ProjectsDashboard() {
  const projects = useProjectsStore((s) => s.projects)
  const createProject = useProjectsStore((s) => s.createProject)
  const openProject = useProjectsStore((s) => s.openProject)
  const renameProject = useProjectsStore((s) => s.renameProject)
  const deleteProject = useProjectsStore((s) => s.deleteProject)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt)

  const handleCreate = () => {
    createProject(newName.trim() || 'Neues Projekt')
    setNewName('')
  }

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }

  const commitRename = (id: string) => {
    if (renameValue.trim()) renameProject(id, renameValue.trim())
    setRenamingId(null)
  }

  return (
    <div className="h-screen w-screen overflow-y-auto bg-ground">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-gray-800 mb-1">Kongresshalle Vallendar – Event-Planungstool</h1>
        <p className="text-sm text-gray-500 mb-8">Projekte verwalten und Hallenpläne bearbeiten</p>

        <div className="flex gap-2 mb-8">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Name des neuen Projekts (z. B. Gala-Dinner Mittwoch)"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50"
          />
          <button onClick={handleCreate} className={btn('primary', 'md')}>
            + Neues Projekt
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-16 border border-dashed border-gray-300 rounded-lg">
            Noch keine Projekte vorhanden. Legen Sie oben Ihr erstes Projekt an.
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sorted.map((p) => (
              <li
                key={p.id}
                className="bg-white border border-gray-200 rounded-2xl p-4 hover:shadow-md hover:border-gray-300 transition-all"
              >
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
                    className="w-full border border-blue-300 rounded-md px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                ) : (
                  <button onClick={() => openProject(p.id)} className="text-left w-full">
                    <div className="font-medium text-gray-800 truncate">{p.name}</div>
                    <div className="text-xs text-gray-400 mt-1">Zuletzt bearbeitet: {formatDate(p.updatedAt)}</div>
                  </button>
                )}

                {confirmingDeleteId === p.id ? (
                  <div className="flex items-center gap-2 mt-3 text-xs">
                    <span className="text-gray-600">Wirklich löschen?</span>
                    <button
                      onClick={() => {
                        deleteProject(p.id)
                        setConfirmingDeleteId(null)
                      }}
                      className={btn('danger', 'sm')}
                    >
                      Ja, löschen
                    </button>
                    <button onClick={() => setConfirmingDeleteId(null)} className={btn('outline', 'sm')}>
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => openProject(p.id)} className={btn('dark', 'sm')}>
                      Öffnen
                    </button>
                    <button onClick={() => startRename(p.id, p.name)} className={btn('outline', 'sm')}>
                      Umbenennen
                    </button>
                    <button onClick={() => setConfirmingDeleteId(p.id)} className={`ml-auto ${btn('dangerOutline', 'sm')}`}>
                      Löschen
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
