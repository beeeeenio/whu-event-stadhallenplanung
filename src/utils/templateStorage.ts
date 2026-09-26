import type { EventItem, PhaseData } from '../types'

/** Ein Objekt einer Vorlage: alle Eigenschaften außer ID/Phasen, plus absolute Lage in der Phase. */
export type TemplateItem = Omit<EventItem, 'id' | 'phaseData'> & Omit<PhaseData, 'visible'>

/** Projektübergreifende Aufbau-Vorlage (z. B. „Bankett 200 Pers.“). */
export interface LayoutTemplate {
  id: string
  name: string
  createdAt: number
  items: TemplateItem[]
}

const TEMPLATES_KEY = 'whu-planner-templates'

export function loadTemplates(): LayoutTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY)
    return raw ? (JSON.parse(raw) as LayoutTemplate[]) : []
  } catch {
    return []
  }
}

export function saveTemplates(templates: LayoutTemplate[]) {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
  } catch {
    // localStorage voll oder nicht verfügbar – stiller Fehlschlag
  }
}
