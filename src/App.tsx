import { useEffect, useRef } from 'react'
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
    const unsubscribe = useEventStore.subscribe(() => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        saveProjectData(currentProjectId, getSnapshot())
        touchProject(currentProjectId)
      }, AUTOSAVE_DELAY_MS)
    })
    return () => {
      unsubscribe()
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [currentProjectId, getSnapshot, touchProject])

  if (!currentProjectId) {
    loadedProjectId.current = null
    return <ProjectsDashboard />
  }

  return <EditorView />
}

export default App
