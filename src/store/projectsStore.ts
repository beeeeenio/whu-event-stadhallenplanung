import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuid } from 'uuid'
import {
  deleteProjectData,
  saveProjectData,
  loadProjectData,
  loadProjectVersions,
  saveProjectVersions,
  type ProjectData,
} from '../utils/projectStorage'

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
  duplicateProject: (projectId: string, newName?: string) => void
  touchProject: (id: string) => void
  importProjects: (meta: ProjectMeta[]) => void
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

      duplicateProject: (projectId, newName) => {
        // Load source project data and versions
        const sourceData = loadProjectData(projectId)
        const sourceProject = useProjectsStore.getState().projects.find((p) => p.id === projectId)

        if (!sourceData || !sourceProject) return

        // Generate new ID and name
        const newId = uuid()
        const finalName = newName || `${sourceProject.name} (Kopie)`

        // Deep clone project data
        const duplicatedData = structuredClone(sourceData)

        // Save duplicated project data
        saveProjectData(newId, duplicatedData)

        // Load and duplicate versions if they exist
        const sourceVersions = loadProjectVersions(projectId)
        if (sourceVersions.length > 0) {
          const duplicatedVersions = sourceVersions.map((v) => ({
            ...v,
            id: uuid(),
            data: structuredClone(v.data),
          }))
          saveProjectVersions(newId, duplicatedVersions)
        }

        // Add to projects list
        const meta: ProjectMeta = { id: newId, name: finalName, updatedAt: Date.now() }
        set((state) => ({ projects: [meta, ...state.projects] }))
      },

      touchProject: (id) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, updatedAt: Date.now() } : p)),
        })),

      importProjects: (meta) =>
        set((state) => ({
          projects: [...state.projects, ...meta],
        })),
    }),
    { name: 'whu-planner-projects' },
  ),
)
