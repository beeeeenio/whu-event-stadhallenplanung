import type { SummaryRow } from './countItems'

export function exportInventoryCsv(eventName: string, phaseName: string, summary: SummaryRow[]) {
  const rows = [['Objekt', 'Anzahl'], ...summary.map((r) => [r.label, String(r.count)])]
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${eventName.replace(/\s+/g, '_')}_${phaseName.replace(/\s+/g, '_')}_Inventar.csv`
  a.click()
  URL.revokeObjectURL(url)
}
