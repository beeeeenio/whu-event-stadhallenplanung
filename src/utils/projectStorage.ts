import type { EventItem, LayerState, Phase } from '../types'

/** Vollständiger, speicherbarer Zustand eines Projekts (ein Hallenplan-Entwurf). */
export interface ProjectData {
  eventName: string
  currentPhaseId: string
  phases: Phase[]
  items: Record<string, EventItem>
  itemOrder: string[]
  layers: LayerState
  saalSplit: { saal1: boolean; saal2: boolean; saal3: boolean }
}

const dataKey = (id: string) => `whu-planner-project-data-${id}`

export function loadProjectData(id: string): ProjectData | null {
  try {
    const raw = localStorage.getItem(dataKey(id))
    return raw ? (JSON.parse(raw) as ProjectData) : null
  } catch {
    return null
  }
}

export function saveProjectData(id: string, data: ProjectData) {
  try {
    localStorage.setItem(dataKey(id), JSON.stringify(data))
  } catch {
    // localStorage voll oder nicht verfügbar – stiller Fehlschlag, Projekt bleibt im Speicher erhalten
  }
}

export function deleteProjectData(id: string) {
  localStorage.removeItem(dataKey(id))
}
