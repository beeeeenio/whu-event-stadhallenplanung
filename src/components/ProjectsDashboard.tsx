import { useEffect, useRef, useState } from 'react'
import { useProjectsStore, type ProjectMeta } from '../store/projectsStore'
import { pb, errorMessage } from '../backend/pb'
import { migrateLegacyData, pendingLegacyData } from '../backend/legacyImport'
import { btn } from '../utils/ui'
import { exportAllProjects, generateExportFilename } from '../utils/exportProject'
import { importAllProjects } from '../utils/importProject'
import ExportImportDialog from './ExportImportDialog'
import ShareDialog from './ShareDialog'

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

const ROLE_BADGE: Record<ProjectMeta['role'], string | null> = {
  owner: null,
  editor: 'Geteilt · Bearbeiten',
  viewer: 'Geteilt · Nur ansehen',
}

export default function ProjectsDashboard() {
  const projects = useProjectsStore((s) => s.projects)
  const loading = useProjectsStore((s) => s.loading)
  const error = useProjectsStore((s) => s.error)
  const refresh = useProjectsStore((s) => s.refresh)
  const clearError = useProjectsStore((s) => s.clearError)
  const createProject = useProjectsStore((s) => s.createProject)
  const openProject = useProjectsStore((s) => s.openProject)
  const renameProject = useProjectsStore((s) => s.renameProject)
  const deleteProject = useProjectsStore((s) => s.deleteProject)
  const duplicateProject = useProjectsStore((s) => s.duplicateProject)
  const logout = useProjectsStore((s) => s.logout)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [sharing, setSharing] = useState<ProjectMeta | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergeDuplicates, setMergeDuplicates] = useState<{ projectId: string; name: string }[]>([])
  const [mergePendingCallback, setMergePendingCallback] = useState<
    ((strategy: 'overwrite' | 'keepBoth' | 'cancel') => void) | null
  >(null)

  // Liste laden und aktuell halten, wenn andere Projekte anlegen, teilen oder ändern.
  useEffect(() => {
    void refresh()
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe: (() => Promise<void>) | undefined
    let active = true
    pb.collection('projects')
      .subscribe('*', () => {
        clearTimeout(timer)
        timer = setTimeout(() => void refresh(), 300)
      })
      .then((fn) => (active ? (unsubscribe = fn) : void fn()))
      .catch(() => {})
    return () => {
      active = false
      clearTimeout(timer)
      void unsubscribe?.()
    }
  }, [refresh])

  const handleCreate = async () => {
    setCreating(true)
    await createProject(newName.trim() || 'Neues Projekt')
    setNewName('')
    setCreating(false)
  }

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }

  const commitRename = (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (renameValue.trim() && renameValue.trim() !== project?.name) void renameProject(id, renameValue.trim())
    setRenamingId(null)
  }

  const handleExport = async () => {
    setExportLoading(true)
    try {
      const blob = await exportAllProjects()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = generateExportFilename('Kongresshalle')
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export fehlgeschlagen: ' + errorMessage(err))
    } finally {
      setExportLoading(false)
    }
  }

  const handleImport = async (file: File) => {
    setImportLoading(true)
    setImportError(null)
    try {
      const result = await importAllProjects(file, async (duplicates) => {
        setMergeDuplicates(duplicates)
        setMergeDialogOpen(true)

        return new Promise((resolve) => {
          setMergePendingCallback(() => (strategy: 'overwrite' | 'keepBoth' | 'cancel') => {
            setMergeDialogOpen(false)
            resolve(strategy)
          })
        })
      })

      if (result.imported.length > 0 || result.skipped.length > 0) {
        const msg =
          `Import abgeschlossen: ${result.imported.length} Projekte importiert, ` +
          `${result.skipped.length} übersprungen, ${result.templateCount} Templates.`
        alert(msg)
      } else {
        setImportError('Keine Projekte zum Importieren gefunden')
      }
    } catch (err) {
      const msg = errorMessage(err)
      setImportError(msg)
      alert('Import fehlgeschlagen: ' + msg)
    } finally {
      setImportLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      void refresh()
    }
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImport(file)
    }
  }

  return (
    <div className="h-screen w-screen overflow-y-auto bg-ground">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-800 mb-1">Kongresshalle Vallendar – Event-Planungstool</h1>
            <p className="text-sm text-gray-500">Projekte verwalten und Hallenpläne bearbeiten</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            <span className="text-xs text-ink3 hidden sm:inline">{pb.authStore.record?.email}</span>
            <button onClick={logout} className={btn('outline', 'sm')}>
              Abmelden
            </button>
          </div>
        </div>

        <LegacyImportBanner onDone={refresh} />

        {error && (
          <div className="flex items-center gap-3 mb-6 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="text-red-700 hover:underline text-xs shrink-0">
              Ausblenden
            </button>
          </div>
        )}

        <div className="flex gap-2 mb-8">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !creating && handleCreate()}
            placeholder="Name des neuen Projekts (z. B. Gala-Dinner Mittwoch)"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50"
          />
          <button onClick={handleCreate} disabled={creating} className={btn('primary', 'md')}>
            + Neues Projekt
          </button>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 text-sm py-16">Projekte werden geladen…</div>
        ) : projects.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-16 border border-dashed border-gray-300 rounded-lg">
            Noch keine Projekte vorhanden. Legen Sie oben Ihr erstes Projekt an.
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {projects.map((p) => (
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
                    <div className="text-xs text-gray-400 mt-1">
                      Zuletzt bearbeitet: {formatDate(p.updatedAt)}
                      {ROLE_BADGE[p.role] && <span className="ml-2 text-accent">{ROLE_BADGE[p.role]}</span>}
                    </div>
                  </button>
                )}

                {confirmingDeleteId === p.id ? (
                  <div className="flex items-center gap-2 mt-3 text-xs">
                    <span className="text-gray-600">Für alle löschen?</span>
                    <button
                      onClick={() => {
                        void deleteProject(p.id)
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
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => openProject(p.id)} className={btn('dark', 'sm')}>
                      Öffnen
                    </button>
                    <button onClick={() => setSharing(p)} className={btn('outline', 'sm')}>
                      {p.role === 'owner' ? 'Teilen' : 'Mitglieder'}
                    </button>
                    {p.role !== 'viewer' && (
                      <button onClick={() => startRename(p.id, p.name)} className={btn('outline', 'sm')}>
                        Umbenennen
                      </button>
                    )}
                    <button onClick={() => void duplicateProject(p.id)} className={btn('outline', 'sm')}>
                      Duplizieren
                    </button>
                    {p.role === 'owner' && (
                      <button onClick={() => setConfirmingDeleteId(p.id)} className={`ml-auto ${btn('dangerOutline', 'sm')}`}>
                        Löschen
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={handleExport}
            disabled={exportLoading}
            className={btn('primary', 'md')}
          >
            {exportLoading ? 'Exporting...' : '⬇ Export'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importLoading}
            className={btn('primary', 'md')}
          >
            {importLoading ? 'Importing...' : '⬆ Import'}
          </button>
          {importError && <div className="text-red-500 text-sm flex items-center">{importError}</div>}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>

      <ExportImportDialog
        isOpen={mergeDialogOpen}
        duplicateCount={mergeDuplicates.length}
        duplicateProjects={mergeDuplicates}
        onMergeStrategy={(strategy) => {
          if (mergePendingCallback) {
            mergePendingCallback(strategy)
          }
        }}
      />

      {sharing && (
        <ShareDialog
          projectId={sharing.id}
          projectName={sharing.name}
          myRole={sharing.role}
          onClose={() => setSharing(null)}
          onLeft={() => {
            setSharing(null)
            void refresh()
          }}
        />
      )}
    </div>
  )
}

/** Hinweis auf Projekte, die vor dem Backend nur in diesem Browser gespeichert wurden. */
function LegacyImportBanner({ onDone }: { onDone: () => Promise<void> }) {
  const [pending, setPending] = useState(pendingLegacyData)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (result) {
    return (
      <div className="flex items-center gap-3 mb-6 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
        <span className="flex-1">{result}</span>
        <button onClick={() => setResult(null)} className="text-emerald-800 hover:underline text-xs shrink-0">
          Ausblenden
        </button>
      </div>
    )
  }
  if (pending.projects === 0 && pending.templates === 0) return null

  const migrate = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await migrateLegacyData()
      setResult(
        `Übernommen: ${r.projects} Projekte, ${r.versions} Versionen, ${r.templates} Vorlagen. ` +
          'Eine Sicherung bleibt zusätzlich in diesem Browser.',
      )
      await onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPending(pendingLegacyData())
      setBusy(false)
    }
  }

  const parts = [
    pending.projects > 0 && `${pending.projects} ${pending.projects === 1 ? 'Projekt' : 'Projekte'}`,
    pending.templates > 0 && `${pending.templates} ${pending.templates === 1 ? 'Vorlage' : 'Vorlagen'}`,
  ].filter(Boolean)

  return (
    <div className="mb-6 bg-accent-soft border border-accent/20 rounded-2xl px-4 py-3">
      <p className="text-sm text-ink">
        In diesem Browser liegen noch {parts.join(' und ')} von vor der Umstellung auf den Server.
      </p>
      <p className="text-xs text-ink2 mt-0.5">
        Übernehmen Sie sie, damit sie auf allen Geräten verfügbar sind und geteilt werden können.
      </p>
      {error && <p className="text-xs text-red-700 mt-2">{error}</p>}
      <button onClick={migrate} disabled={busy} className={btn('primary', 'sm', 'mt-3')}>
        {busy ? 'Wird übernommen…' : 'Auf den Server übernehmen'}
      </button>
    </div>
  )
}
