import { useEffect, useRef, useState } from 'react'
import ProjectsDashboard from './components/ProjectsDashboard'
import EditorView from './components/EditorView'
import { useEventStore } from './store/store'
import { useProjectsStore } from './store/projectsStore'
import { loadProjectData, saveProjectData } from './utils/projectStorage'

const AUTOSAVE_DELAY_MS = 600

function App() {
  const currentProjectId = useProjectsStore((s) => s.currentProjectId)
  const touchProject = useProjectsStore((s) => s.touchProject)
  const hydrate = useEventStore((s) => s.hydrate)
  const getSnapshot = useEventStore((s) => s.getSnapshot)
  const loadedProjectId = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  // Projektdaten laden, sobald ein Projekt geöffnet wird
  useEffect(() => {
    if (!currentProjectId || loadedProjectId.current === currentProjectId) return
    const data = loadProjectData(currentProjectId)
    if (data) hydrate(data)
    loadedProjectId.current = currentProjectId
  }, [currentProjectId, hydrate])

  // Autosave: bei jeder Änderung am aktiven Projekt debounced in localStorage sichern
  useEffect(() => {
    if (!currentProjectId) return
    const projectId = currentProjectId
    let pending = false
    const save = () => {
      pending = false
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      const ok = saveProjectData(projectId, getSnapshot())
      setSaveFailed(!ok)
      if (ok) touchProject(projectId)
    }
    // Ausstehende Änderung sofort sichern (beim Schließen, Tab-Wechsel, App-Wechsel auf dem iPad)
    const flush = () => {
      if (pending) save()
    }
    const unsubscribe = useEventStore.subscribe(() => {
      pending = true
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(save, AUTOSAVE_DELAY_MS)
    })
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [currentProjectId, getSnapshot, touchProject])

  if (!currentProjectId) {
    loadedProjectId.current = null
    return <ProjectsDashboard />
  }

  return (
    <>
      <EditorView />
      {saveFailed && <SaveBanner />}
    </>
  )
}

function SaveBanner() {
  return (
    <div role="alert" className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg">
      Speichern fehlgeschlagen – Browser-Speicher voll. Bitte Projekt exportieren und alte Versionen löschen.
    </div>
  )
}

export default App
