import type { EventItem } from '../types'
import { ITEM_LIBRARY } from '../data/itemLibrary'

export interface SummaryRow {
  label: string
  icon: string
  count: number
}

export interface ItemCounts {
  summary: SummaryRow[]
  total: number
  totalChairs: number
  totalPodiums: number
  curtainMeters: number
}

function iconForItem(item: EventItem): string {
  return ITEM_LIBRARY.find((t) => t.type === item.type)?.icon ?? '▢'
}

export function countVisibleItems(items: Record<string, EventItem>, phaseId: string): ItemCounts {
  const rows = new Map<string, SummaryRow>()
  let total = 0
  let totalChairs = 0
  let totalPodiums = 0
  let curtainMeters = 0

  for (const item of Object.values(items)) {
    const pd = item.phaseData[phaseId]
    if (!pd?.visible) continue

    total += 1
    const existing = rows.get(item.label)
    if (existing) {
      existing.count += 1
    } else {
      rows.set(item.label, { label: item.label, icon: iconForItem(item), count: 1 })
    }

    if (item.type === 'chair') totalChairs += 1
    if (item.type === 'chair_row_group' && item.grid) totalChairs += item.grid.rows * item.grid.cols
    if (item.type === 'podium') totalPodiums += 1
    if (item.type === 'nivtec_group' && item.nivtecData) totalPodiums += item.nivtecData.pieces.length
    if (item.type === 'curtain') curtainMeters += item.width
  }

  return {
    summary: Array.from(rows.values()).sort((a, b) => b.count - a.count),
    total,
    totalChairs,
    totalPodiums,
    curtainMeters,
  }
}

export function visibleItemList(items: Record<string, EventItem>, itemOrder: string[], phaseId: string) {
  return itemOrder
    .map((id) => items[id])
    .filter((item): item is EventItem => !!item && !!item.phaseData[phaseId]?.visible)
}
