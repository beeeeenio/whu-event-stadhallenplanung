import { v4 as uuid } from 'uuid'
import type { EventItem, ItemType, Phase } from '../types'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import { metersToPixels } from './scale'

/**
 * Laufender Platzierungsmodus („Antippen, dann in den Plan tippen“ aus Konzept B).
 * `place` bekommt Canvas-Koordinaten (px) und gibt die ID des neuen Objekts zurück.
 */
export interface Placement {
  /** Beschriftung für den Hinweis im Plan, z. B. „Stehtisch“ oder „40 × Stuhl“. */
  label: string
  place: (x: number, y: number) => string | null
  /** true: nach einer Platzierung automatisch beenden (Mengen, Stuhlreihen, Import). */
  once?: boolean
}

/**
 * Baut `count` Objekte eines Bibliothekstyps in einem Raster (für „12 Stehtische“ aus der Befehlszeile).
 * Die Objekte haben dieselbe Struktur wie `addItem` sie erzeugt und werden per `addItemsBatch`
 * in EINEM Undo-Schritt eingefügt.
 */
export function buildItemGrid(
  type: ItemType,
  count: number,
  originX: number,
  originY: number,
  phases: Phase[],
  currentPhaseId: string,
  pixelsPerMeter: number,
): EventItem[] {
  const template = ITEM_LIBRARY.find((t) => t.type === type)
  const width = template?.width ?? 1
  const height = template?.height ?? 1
  const cols = Math.ceil(Math.sqrt(count))
  const gap = 0.4
  const stepX = metersToPixels(width + gap, pixelsPerMeter)
  const stepY = metersToPixels(height + gap, pixelsPerMeter)
  const result: EventItem[] = []
  for (let i = 0; i < count; i++) {
    const x = originX + (i % cols) * stepX
    const y = originY + Math.floor(i / cols) * stepY
    const phaseData: EventItem['phaseData'] = {}
    for (const p of phases) phaseData[p.id] = { x, y, rotation: 0, visible: p.id === currentPhaseId }
    result.push({
      id: uuid(),
      type,
      label: template?.label ?? type,
      width,
      height,
      seats: template?.seats,
      phaseData,
    })
  }
  return result
}

/** Aus einer Gesamtzahl Stühle sinnvolle Reihen × Stühle ableiten (max. 10 pro Reihe als Startwert). */
export function rowsForChairCount(total: number): { rows: number; cols: number } {
  const cols = Math.min(total, total > 60 ? 12 : 10)
  return { rows: Math.max(1, Math.ceil(total / cols)), cols: Math.max(1, cols) }
}
