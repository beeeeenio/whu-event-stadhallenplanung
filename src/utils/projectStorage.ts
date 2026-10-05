import { v4 as uuid } from 'uuid'
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

/** Benannter Stand eines Projekts („Version“), vollständig wiederherstellbar. */
export interface ProjectVersion {
  id: string
  name: string
  createdAt: number
  data: ProjectData
}

export function emptyProjectData(): ProjectData {
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

// Projekte liegen auf dem Server (src/backend). Aus dem localStorage wird nur noch
// gelesen, um Projekte von vor dem Backend einmalig zu übernehmen (src/backend/legacyImport.ts).

export function loadProjectData(id: string): ProjectData | null {
  try {
    const raw = localStorage.getItem(`whu-planner-project-data-${id}`)
    return raw ? (JSON.parse(raw) as ProjectData) : null
  } catch {
    return null
  }
}

export function loadProjectVersions(id: string): ProjectVersion[] {
  try {
    const raw = localStorage.getItem(`whu-planner-project-versions-${id}`)
    return raw ? (JSON.parse(raw) as ProjectVersion[]) : []
  } catch {
    return []
  }
}
