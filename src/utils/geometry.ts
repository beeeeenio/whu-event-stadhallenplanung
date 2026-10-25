import type { EventItem, ItemType, PhaseData, Piece2D } from '../types'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import { metersToPixels } from './scale'

/** Punkt in Plan-Koordinaten (px, 20 px = 1 m). */
export interface Pt {
  x: number
  y: number
}

/** Achsenparallele Box in Plan-Koordinaten (px). */
export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Typen, die zentriert (Ursprung = Mitte) als Kreis gezeichnet werden. NICHT erweitern:
 *  sonst verrutschen gespeicherte Projekte (Ursprung liegt bei allen anderen oben links). */
const ROUND_TYPES: ItemType[] = ['table_round', 'table_high', 'custom_round']

export function isRoundType(type: ItemType): boolean {
  return ROUND_TYPES.includes(type)
}

type Sized = Pick<EventItem, 'type' | 'width' | 'height' | 'label'>

/** Ungedrehte Box im lokalen Koordinatensystem der Konva-Gruppe (Ursprung = phaseData.x/y). */
export function localBounds(item: Sized, ppm: number): { x: number; y: number; w: number; h: number } {
  const w = metersToPixels(item.width, ppm)
  const h = metersToPixels(item.height, ppm)
  if (isRoundType(item.type)) return { x: -w / 2, y: -w / 2, w, h: w }
  if (item.type === 'text_label') return { x: 0, y: 0, w: Math.max(item.label.length * 8 + 8, 20), h: 21 }
  return { x: 0, y: 0, w, h }
}

export function localCenter(item: Sized, ppm: number): Pt {
  const b = localBounds(item, ppm)
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

function rotatePt(p: Pt, deg: number): Pt {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** Tatsächliche Box der NivTec-Podeste in Metern. `item.width/height` reichen immer von 0/0 bis zum
 *  äußersten Podest, die Podeste selbst können versetzt liegen (z. B. erst ab x = 2 m). */
export function piecesBounds(pieces: Piece2D[] | undefined): { x: number; y: number; w: number; d: number } | null {
  if (!pieces || pieces.length === 0) return null
  const x = Math.min(...pieces.map((p) => p.x))
  const y = Math.min(...pieces.map((p) => p.y))
  return { x, y, w: Math.max(...pieces.map((p) => p.x + p.w)) - x, d: Math.max(...pieces.map((p) => p.y + p.d)) - y }
}

/** Mittelpunkt des Objekts in Plan-Koordinaten (berücksichtigt die Drehung). */
export function worldCenter(item: Sized, pd: PhaseData, ppm: number): Pt {
  const c = rotatePt(localCenter(item, ppm), pd.rotation)
  return { x: pd.x + c.x, y: pd.y + c.y }
}

/** Achsenparallele Bounding-Box des (ggf. gedrehten) Objekts in Plan-Koordinaten. */
export function worldBBox(item: Sized, pd: PhaseData, ppm: number): Box {
  const b = localBounds(item, ppm)
  const corners: Pt[] = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ].map((p) => {
    const r = rotatePt(p, pd.rotation)
    return { x: pd.x + r.x, y: pd.y + r.y }
  })
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

/** Neuer Ursprung (x/y), damit das Objekt bei der Drehung auf `newRotation` um seine MITTE dreht.
 *  Runde Objekte (Ursprung = Mitte) behalten x/y. */
export function positionForRotation(item: Sized, pd: PhaseData, newRotation: number, ppm: number): Pt {
  const center = worldCenter(item, pd, ppm)
  const c = rotatePt(localCenter(item, ppm), newRotation)
  return { x: round3(center.x - c.x), y: round3(center.y - c.y) }
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Winkel einrasten. fine15=true (Shift): 15°-Schritte. Sonst: im Umkreis von 4° auf
 *  0/90/180/270° einrasten, ansonsten auf ganze Grad runden. */
export function snapAngle(deg: number, fine15: boolean): number {
  const d = normalizeDeg(deg)
  if (fine15) return normalizeDeg(Math.round(d / 15) * 15)
  const nearest90 = Math.round(d / 90) * 90
  if (Math.abs(d - nearest90) <= 4) return normalizeDeg(nearest90)
  return normalizeDeg(Math.round(d))
}

/** Winkel der Strecke from→to in Grad (0° = nach rechts, im Uhrzeigersinn wie Konva). */
export function angleDeg(from: Pt, to: Pt): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

/** Ursprung (x/y) für ein NEUES Objekt, dessen Mitte bei (cx, cy) liegen soll (Drehung 0). */
export function originForCenter(
  type: ItemType,
  cx: number,
  cy: number,
  ppm: number,
  size?: { width: number; height: number },
): Pt {
  if (isRoundType(type)) return { x: cx, y: cy }
  const tpl = ITEM_LIBRARY.find((t) => t.type === type)
  const w = metersToPixels(size?.width ?? tpl?.width ?? 1, ppm)
  const h = metersToPixels(size?.height ?? tpl?.height ?? 1, ppm)
  return { x: cx - w / 2, y: cy - h / 2 }
}

/** Ursprung eines NEUEN Objekts so verschieben, dass seine Box-Oberkante links auf dem Raster liegt
 *  (gleiche Regel wie beim Ziehen). */
export function snapNewItemToGrid(
  type: ItemType,
  origin: Pt,
  ppm: number,
  gridSize: number,
  size?: { width: number; height: number },
): Pt {
  const tpl = ITEM_LIBRARY.find((t) => t.type === type)
  const lb = localBounds({ type, width: size?.width ?? tpl?.width ?? 1, height: size?.height ?? tpl?.height ?? 1, label: '' }, ppm)
  const minX = origin.x + lb.x
  const minY = origin.y + lb.y
  return {
    x: origin.x + Math.round(minX / gridSize) * gridSize - minX,
    y: origin.y + Math.round(minY / gridSize) * gridSize - minY,
  }
}

export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  }
}

export function translateBox(b: Box, dx: number, dy: number): Box {
  return { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy }
}
