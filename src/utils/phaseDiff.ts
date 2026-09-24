import type { EventItem, Phase } from '../types'
import { countVisibleItems, type SummaryRow } from './countItems'

export interface PhaseDiff {
  added: number
  removed: number
  moved: number
}

/** Phasen in Ablauf-Reihenfolge (nach `order`, bei Gleichstand Array-Reihenfolge). */
export function sortPhases(phases: Phase[]): Phase[] {
  return phases
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.order - b.p.order || a.i - b.i)
    .map(({ p }) => p)
}

/** Vorige Phase im Ablauf (oder null für die erste Phase). */
export function previousPhaseId(phases: Phase[], phaseId: string): string | null {
  const sorted = sortPhases(phases)
  const idx = sorted.findIndex((p) => p.id === phaseId)
  return idx > 0 ? sorted[idx - 1].id : null
}

function hasMoved(a: { x: number; y: number; rotation: number }, b: { x: number; y: number; rotation: number }) {
  return Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.rotation - b.rotation) > 0.5
}

/** Was hat sich von `fromPhaseId` zu `toPhaseId` geändert (neu/entfernt/verschoben)? */
export function diffPhases(items: Record<string, EventItem>, fromPhaseId: string | null, toPhaseId: string): PhaseDiff {
  const diff: PhaseDiff = { added: 0, removed: 0, moved: 0 }
  for (const item of Object.values(items)) {
    const to = item.phaseData[toPhaseId]
    const from = fromPhaseId ? item.phaseData[fromPhaseId] : undefined
    const inTo = !!to?.visible
    const inFrom = !!from?.visible
    if (inTo && !inFrom) diff.added++
    else if (!inTo && inFrom) diff.removed++
    else if (inTo && inFrom && hasMoved(from!, to!)) diff.moved++
  }
  return diff
}

/** IDs der Objekte, deren Stand in der Vorphase sich vom aktuellen unterscheidet (für das Geisterbild). */
export function changedSincePhase(items: Record<string, EventItem>, itemOrder: string[], fromPhaseId: string, toPhaseId: string): string[] {
  return itemOrder.filter((id) => {
    const item = items[id]
    const from = item?.phaseData[fromPhaseId]
    if (!from?.visible) return false
    const to = item.phaseData[toPhaseId]
    return !to?.visible || hasMoved(from, to)
  })
}

export interface CrossPhaseRow {
  label: string
  icon: string
  perPhase: number[]
  max: number
}

/** Stückliste über alle Phasen: Anzahl je Phase + Maximalbedarf (fürs Lager). */
export function crossPhaseInventory(items: Record<string, EventItem>, phases: Phase[]): CrossPhaseRow[] {
  const sorted = sortPhases(phases)
  const rows = new Map<string, CrossPhaseRow>()
  sorted.forEach((phase, idx) => {
    const { summary } = countVisibleItems(items, phase.id)
    for (const r of summary) {
      let row = rows.get(r.label)
      if (!row) {
        row = { label: r.label, icon: r.icon, perPhase: sorted.map(() => 0), max: 0 }
        rows.set(r.label, row)
      }
      row.perPhase[idx] = r.count
    }
  })
  const result = Array.from(rows.values())
  for (const r of result) r.max = Math.max(...r.perPhase)
  return result.sort((a, b) => b.max - a.max || a.label.localeCompare(b.label, 'de'))
}

/** Maximalbedarf als SummaryRow-Liste (für den bestehenden CSV-Export). */
export function peakAsSummary(rows: CrossPhaseRow[]): SummaryRow[] {
  return rows.map((r) => ({ label: r.label, icon: r.icon, count: r.max }))
}
