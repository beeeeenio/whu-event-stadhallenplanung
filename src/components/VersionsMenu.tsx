import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useEventStore } from '../store/store'
import { useProjectsStore } from '../store/projectsStore'
import { loadProjectVersions, saveProjectVersions, type ProjectVersion } from '../utils/projectStorage'
import { island, islandBtn } from '../utils/ui'

const formatTime = (ts: number) => new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

/** „Versionen“-Dropdown: benannte Stände des aktuellen Projekts speichern und wiederherstellen. */
export default function VersionsMenu() {
  const projectId = useProjectsStore((s) => s.currentProjectId)
  const restoreVersion = useEventStore((s) => s.restoreVersion)
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<ProjectVersion[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !projectId) return
    setVersions(loadProjectVersions(projectId))
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [open, projectId])

  if (!projectId) return null

  const update = (next: ProjectVersion[]) => {
    saveProjectVersions(projectId, next)
    setVersions(next)
  }

  const commitSave = () => {
    const createdAt = Date.now()
    const version: ProjectVersion = {
      id: uuid(),
      name: name.trim() || `Version vom ${formatTime(createdAt)}`,
      createdAt,
      data: useEventStore.getState().getSnapshot(),
    }
    update([version, ...loadProjectVersions(projectId)])
    setName('')
    setNaming(false)
  }

  const restore = (v: ProjectVersion) => {
    const { eventName, currentPhaseId, phases, items, itemOrder } = v.data
    restoreVersion({ eventName, currentPhaseId, phases, items, itemOrder })
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className={islandBtn(open ? 'chip' : 'plain')} title="Gespeicherte Versionen dieses Projekts">
        Versionen ▾
      </button>
      {open && (
        <div className={`absolute right-0 top-full mt-2 z-30 w-72 p-3 space-y-2 text-[13px] ${island}`} onMouseDown={(e) => e.stopPropagation()}>
          {naming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitSave()
                if (e.key === 'Escape') setNaming(false)
              }}
              placeholder="Name der Version…"
              className="w-full text-sm font-bold text-ink border-b border-accent focus:outline-none bg-transparent"
            />
          ) : (
            <button onClick={() => setNaming(true)} className={islandBtn('chip', 'w-full')} title="Aktuellen Stand des ganzen Projekts sichern">
              Version speichern
            </button>
          )}
          <ul className="pt-2 border-t border-chip space-y-0.5 max-h-72 overflow-y-auto">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-1 px-1 py-1 rounded-lg hover:bg-chip/60">
                {confirmDeleteId === v.id ? (
                  <>
                    <span className="flex-1 truncate text-xs text-ink2 px-1">„{v.name}“ löschen?</span>
                    <button
                      onClick={() => {
                        update(versions.filter((x) => x.id !== v.id))
                        setConfirmDeleteId(null)
                      }}
                      className="px-2 py-1 rounded-md bg-red-600 text-white text-xs font-semibold"
                    >
                      Löschen
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 rounded-md bg-chip text-ink text-xs">
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0 px-1">
                      <div className="truncate text-ink font-semibold">{v.name}</div>
                      <div className="font-mono text-[10.5px] text-ink3">
                        {formatTime(v.createdAt)} · {v.data.itemOrder.length} Obj.
                      </div>
                    </div>
                    <button
                      onClick={() => restore(v)}
                      className="px-2 py-1 rounded-md bg-accent-soft text-accent text-[11px] font-semibold hover:bg-accent/20 shrink-0"
                      title="Diesen Stand wiederherstellen (rückgängig machbar)"
                    >
                      Wiederherstellen
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(v.id)}
                      title="Version löschen"
                      className="text-ink3 hover:text-red-700 hover:bg-red-50 text-sm w-6 h-6 rounded flex items-center justify-center leading-none transition-colors shrink-0"
                    >
                      ×
                    </button>
                  </>
                )}
              </li>
            ))}
            {versions.length === 0 && <li className="text-xs text-ink3 text-center py-3">Noch keine Versionen gespeichert</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
