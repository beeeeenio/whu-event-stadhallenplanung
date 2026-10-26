import type { SummaryRow } from './countItems'
import type { NivtecParts } from './nivtecParts'

export function exportInventoryCsv(eventName: string, phaseName: string, summary: SummaryRow[], nivtec: NivtecParts[] = []) {
  const rows = [
    ['Objekt', 'Anzahl'],
    ...summary.map((r) => [r.label, String(r.count)]),
    // NivTec-Material je Bühne: „NivTec Bühne 1 · Podest 2,00 × 1,00 m“
    ...nivtec.flatMap((p) => p.lines.map((l) => [`${p.name} · ${l.label}`, String(l.count)])),
  ]
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${eventName.replace(/\s+/g, '_')}_${phaseName.replace(/\s+/g, '_')}_Inventar.csv`
  a.click()
  URL.revokeObjectURL(url)
}
