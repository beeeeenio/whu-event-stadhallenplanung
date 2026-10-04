import { useRef, useState } from 'react'
import { useProjectsStore } from '../store/projectsStore'
import { btn } from '../utils/ui'
import { exportAllProjects, generateExportFilename } from '../utils/exportProject'
import { importAllProjects } from '../utils/importProject'
import ExportImportDialog from './ExportImportDialog'

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ProjectsDashboard() {
  const projects = useProjectsStore((s) => s.projects)
  const createProject = useProjectsStore((s) => s.createProject)
  const openProject = useProjectsStore((s) => s.openProject)
  const renameProject = useProjectsStore((s) => s.renameProject)
  const deleteProject = useProjectsStore((s) => s.deleteProject)
  const duplicateProject = useProjectsStore((s) => s.duplicateProject)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergeDuplicates, setMergeDuplicates] = useState<{ projectId: string; name: string }[]>([])
  const [mergePendingCallback, setMergePendingCallback] = useState<
    ((strategy: 'overwrite' | 'keepBoth' | 'cancel') => void) | null
  >(null)

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
      alert('Export fehlgeschlagen: ' + (err as Error).message)
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
      const msg = (err as Error).message
      setImportError(msg)
      alert('Import fehlgeschlagen: ' + msg)
    } finally {
      setImportLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
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
                    <button onClick={() => duplicateProject(p.id)} className={btn('outline', 'sm')}>
                      Duplizieren
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
    </div>
  )
}
