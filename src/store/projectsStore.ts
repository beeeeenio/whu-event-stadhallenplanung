import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import { deleteProjectData, saveProjectData, type ProjectData } from '../utils/projectStorage'

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
}

interface ProjectsStore {
  projects: ProjectMeta[]
  currentProjectId: string | null
  createProject: (name: string) => string
  openProject: (id: string) => void
  closeProject: () => void
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  touchProject: (id: string) => void
}

function emptyProjectData(): ProjectData {
  const phaseId = uuid()
  return {
    eventName: 'Neues Event',
    currentPhaseId: phaseId,
    phases: [{ id: phaseId, name: 'Phase 1', order: 0 }],
    items: {},
    itemOrder: [],
    layers: { walls: true, rigging: false, power: false, simplified: false },
    saalSplit: { saal1: true, saal2: true, saal3: true },
  }
}

export const useProjectsStore = create<ProjectsStore>()(
  persist(
    (set) => ({
      projects: [],
      currentProjectId: null,

      createProject: (name) => {
        const id = uuid()
        const meta: ProjectMeta = { id, name: name || 'Neues Projekt', updatedAt: Date.now() }
        saveProjectData(id, emptyProjectData())
        set((state) => ({ projects: [meta, ...state.projects], currentProjectId: id }))
        return id
      },

      openProject: (id) => set({ currentProjectId: id }),

      closeProject: () => set({ currentProjectId: null }),

      renameProject: (id, name) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, name } : p)),
        })),

      deleteProject: (id) => {
        deleteProjectData(id)
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
        }))
      },

      touchProject: (id) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, updatedAt: Date.now() } : p)),
        })),
    }),
    { name: 'whu-planner-projects' },
  ),
)
