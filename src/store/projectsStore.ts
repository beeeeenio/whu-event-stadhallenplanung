import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as api from '../backend/api'
import { errorMessage, pb } from '../backend/pb'
import { canLeaveProject } from '../backend/projectSync'
import { emptyProjectData } from '../utils/projectStorage'

export type { ProjectMeta } from '../backend/api'

interface ProjectsStore {
  projects: api.ProjectMeta[]
  loading: boolean
  /** Letzter Fehler einer Aktion in der Projektübersicht. */
  error: string | null
  currentProjectId: string | null
  refresh: () => Promise<void>
  createProject: (name: string) => Promise<void>
  openProject: (id: string) => void
  closeProject: () => void
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  /** Aus einem geteilten Projekt austragen. */
  leaveProject: (id: string) => Promise<void>
  duplicateProject: (projectId: string, newName?: string) => Promise<void>
  logout: () => void
  clearError: () => void
}

export const useProjectsStore = create<ProjectsStore>()(
  persist(
    (set, get) => {
      /** Aktion ausführen, danach Liste neu laden; Fehler landen in `error`. */
      const run = async (action: () => Promise<unknown>) => {
        try {
          await action()
          await get().refresh()
        } catch (err) {
          set({ error: errorMessage(err) })
        }
      }

      return {
        projects: [],
        loading: true,
        error: null,
        currentProjectId: null,

        refresh: async () => {
          try {
            const projects = await api.listProjects()
            set({ projects, loading: false })
          } catch (err) {
            set({ loading: false, error: errorMessage(err) })
          }
        },

        createProject: (name) =>
          run(async () => {
            const id = await api.createProject(name || 'Neues Projekt', emptyProjectData())
            set({ currentProjectId: id })
          }),

        openProject: (id) => set({ currentProjectId: id, error: null }),

        closeProject: () => {
          if (canLeaveProject()) set({ currentProjectId: null })
        },

        renameProject: (id, name) => run(() => api.renameProject(id, name)),

        deleteProject: (id) => run(() => api.deleteProject(id)),

        leaveProject: (id) => run(() => api.removeMember(id, pb.authStore.record!.id)),

        duplicateProject: (projectId, newName) =>
          run(() => {
            const source = get().projects.find((p) => p.id === projectId)
            return api.duplicateProject(projectId, newName || `${source?.name ?? 'Projekt'} (Kopie)`)
          }),

        logout: () => {
          pb.authStore.clear()
          set({ projects: [], loading: true, currentProjectId: null, error: null })
        },

        clearError: () => set({ error: null }),
      }
    },
    // Nur das offene Projekt merken (zum Wiederöffnen nach Neuladen) – die Liste kommt vom Server.
    // Eigener Schlüssel: unter „whu-planner-projects“ liegen noch die Projekte von vor dem
    // Backend, die legacyImport.ts von dort übernimmt.
    { name: 'whu-planner-session', partialize: (s) => ({ currentProjectId: s.currentProjectId }) },
  ),
)
