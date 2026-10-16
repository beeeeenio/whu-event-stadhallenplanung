import type { EventItem, LayerState, Phase } from '../types'

/** Vollständiger, speicherbarer Zustand eines Projekts (ein Hallenplan-Entwurf). */
export interface ProjectData {
  eventName: string
  currentPhaseId: string
  phases: Phase[]
  items: Record<string, EventItem>
  itemOrder: string[]
  layers: LayerState
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

/** Gibt `true` zurück, wenn der Stand gespeichert werden konnte. */
export function saveProjectData(id: string, data: ProjectData): boolean {
  try {
    localStorage.setItem(dataKey(id), JSON.stringify(data))
    return true
  } catch {
    // localStorage voll oder nicht verfügbar – stiller Fehlschlag, Projekt bleibt im Speicher erhalten
    return false
  }
}

export function deleteProjectData(id: string) {
  localStorage.removeItem(dataKey(id))
  localStorage.removeItem(versionsKey(id))
}

/** Benannter Stand eines Projekts („Version“), vollständig wiederherstellbar. */
export interface ProjectVersion {
  id: string
  name: string
  createdAt: number
  data: ProjectData
}

const versionsKey = (id: string) => `whu-planner-project-versions-${id}`

export function loadProjectVersions(id: string): ProjectVersion[] {
  try {
    const raw = localStorage.getItem(versionsKey(id))
    return raw ? (JSON.parse(raw) as ProjectVersion[]) : []
  } catch {
    return []
  }
}

/** Gibt `true` zurück, wenn die Versionen gespeichert werden konnten. */
export function saveProjectVersions(id: string, versions: ProjectVersion[]): boolean {
  try {
    localStorage.setItem(versionsKey(id), JSON.stringify(versions))
    return true
  } catch {
    // localStorage voll oder nicht verfügbar – stiller Fehlschlag
    return false
  }
}
