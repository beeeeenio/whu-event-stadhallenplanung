import jsPDF from 'jspdf'
import type { EventItem, Phase } from '../types'
import { countVisibleItems } from './countItems'

interface ExportArgs {
  eventName: string
  phase: Phase | undefined
  items: Record<string, EventItem>
  currentPhaseId: string
  /** PNG-DataURL des Erdgeschoss-Plans inkl. aller platzierten Objekte/Bereiche (siehe CanvasEditor.exportSnapshot). */
  planImageDataUrl?: string | null
}

export function exportPhaseToPdf({ eventName, phase, items, currentPhaseId, planImageDataUrl }: ExportArgs) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const counts = countVisibleItems(items, currentPhaseId)

  doc.setFontSize(16)
  doc.text(eventName, 14, 16)
  doc.setFontSize(11)
  doc.text(`Phase: ${phase?.name ?? '-'}`, 14, 24)
  doc.text(`Export: ${new Date().toLocaleDateString('de-DE')}`, 14, 30)

  const boxX = 14
  const boxY = 36
  const boxW = 190
  const boxH = 120

  if (planImageDataUrl) {
    // Bildgröße ermitteln und seitenverhältnistreu in die Box einpassen
    const props = doc.getImageProperties(planImageDataUrl)
    const scale = Math.min(boxW / props.width, boxH / props.height)
    const w = props.width * scale
    const h = props.height * scale
    const x = boxX + (boxW - w) / 2
    const y = boxY + (boxH - h) / 2
    doc.setDrawColor(200)
    doc.rect(boxX, boxY, boxW, boxH)
    doc.addImage(planImageDataUrl, 'JPEG', x, y, w, h)
  } else {
    doc.setDrawColor(200)
    doc.rect(boxX, boxY, boxW, boxH)
    doc.setFontSize(9)
    doc.setTextColor(150)
    doc.text('Grundriss-Snapshot nicht verfügbar', boxX + 4, boxY + 8)
    doc.setTextColor(0)
  }

  let y = 165
  doc.setFontSize(12)
  doc.text('Legende', 14, y)
  y += 6
  doc.setFontSize(9)
  doc.text('Bühnenzüge: orange | Saaltrennung: gestrichelt | Objekte: aktive Phase', 14, y)

  y += 12
  doc.setFontSize(12)
  doc.text('Stückliste', 14, y)
  y += 6
  doc.setFontSize(9)
  for (const row of counts.summary) {
    doc.text(`${row.label}: ${row.count}`, 14, y)
    y += 5
    if (y > 200) {
      doc.addPage()
      y = 20
    }
  }
  y += 4
  doc.text(`Stühle gesamt: ${counts.totalChairs}`, 14, y)
  y += 5
  doc.text(`Bühnenpodeste gesamt: ${counts.totalPodiums}`, 14, y)
  y += 5
  doc.text(`Vorhang (lfm): ${counts.curtainMeters.toFixed(1)}`, 14, y)

  doc.save(`${eventName.replace(/\s+/g, '_')}_${phase?.name.replace(/\s+/g, '_') ?? 'phase'}.pdf`)
}
