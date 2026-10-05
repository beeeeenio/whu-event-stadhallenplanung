import { useEffect } from 'react'
import { ClientResponseError } from 'pocketbase'
import ProjectsDashboard from './components/ProjectsDashboard'
import EditorView from './components/EditorView'
import LoginView from './components/LoginView'
import { SyncBanner } from './components/SyncStatus'
import { useProjectsStore } from './store/projectsStore'
import { OPEN_ACCESS, pb, useCurrentUser } from './backend/pb'
import { startSession, useSyncStore } from './backend/projectSync'
import { btn } from './utils/ui'

function App() {
  const user = useCurrentUser()
  const currentProjectId = useProjectsStore((s) => s.currentProjectId)

  // Beim Start das Login verlängern; gibt es den Account nicht mehr, abmelden.
  useEffect(() => {
    if (!pb.authStore.isValid) return
    pb.collection('users')
      .authRefresh()
      .catch((err) => {
        if (err instanceof ClientResponseError && [401, 403, 404].includes(err.status)) pb.authStore.clear()
      })
  }, [])

  if (!user && !OPEN_ACCESS) return <LoginView />
  if (!currentProjectId) return <ProjectsDashboard />
  return <ProjectSession key={currentProjectId} projectId={currentProjectId} />
}

/** Geöffnetes Projekt: vom Server laden, dann Editor mit automatischem Speichern (backend/projectSync.ts). */
function ProjectSession({ projectId }: { projectId: string }) {
  const sessionProjectId = useSyncStore((s) => s.projectId)
  const status = useSyncStore((s) => s.status)
  const message = useSyncStore((s) => s.message)
  const closeProject = useProjectsStore((s) => s.closeProject)

  useEffect(() => startSession(projectId), [projectId])

  if (sessionProjectId !== projectId || status === 'loading') {
    return <div className="h-screen w-screen bg-ground flex items-center justify-center text-sm text-ink3">Projekt wird geladen…</div>
  }

  if (status === 'failed') {
    return (
      <div className="h-screen w-screen bg-ground flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-ink2">Das Projekt konnte nicht geladen werden{message ? `: ${message}` : '.'}</p>
        <button onClick={closeProject} className={btn('primary', 'md')}>
          Zur Projektübersicht
        </button>
      </div>
    )
  }

  return (
    <>
      <EditorView />
      <SyncBanner />
    </>
  )
}

export default App
