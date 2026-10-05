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

/** Vorlagen von vor dem Backend – nur noch für die einmalige Übernahme (src/backend/legacyImport.ts). */
export function loadTemplates(): LayoutTemplate[] {
  try {
    const raw = localStorage.getItem('whu-planner-templates')
    return raw ? (JSON.parse(raw) as LayoutTemplate[]) : []
  } catch {
    return []
  }
}
