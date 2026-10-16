import type { Box } from './geometry'

/** Einrast-Schwelle in BILDSCHIRM-Pixeln; vor Gebrauch durch den Zoom teilen. */
export const SNAP_THRESHOLD_SCREEN_PX = 8

/** Modifier-Tasten während des Ziehens eines Objekts. */
export interface DragMods {
  /** ⌘/Strg gehalten: Einrasten (Objekte + Raster) vorübergehend aus. */
  bypassSnap: boolean
  /** Shift gehalten: nur waagrecht ODER senkrecht verschieben. */
  axisLock: boolean
}

/** Hilfslinie: 'v' = senkrechte Linie bei x=pos von y=from bis y=to; 'h' = waagrechte bei y=pos. */
export interface Guide {
  orientation: 'v' | 'h'
  pos: number
  from: number
  to: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: Guide[]
}

/** Raster: nächster Rasterpunkt (px). */
export function snapToGrid(x: number, y: number, gridSize: number) {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  }
}

/** Korrektur, damit die linke obere Ecke der Box auf dem Raster liegt. */
export function snapBoxToGrid(box: Box, gridSize: number): { dx: number; dy: number } {
  return {
    dx: Math.round(box.minX / gridSize) * gridSize - box.minX,
    dy: Math.round(box.minY / gridSize) * gridSize - box.minY,
  }
}

const xs = (b: Box) => [b.minX, (b.minX + b.maxX) / 2, b.maxX]
const ys = (b: Box) => [b.minY, (b.minY + b.maxY) / 2, b.maxY]

/** Kanten und Mitten der bewegten Box an Kanten/Mitten der Ziel-Boxen einrasten.
 *  threshold in Plan-px (= SNAP_THRESHOLD_SCREEN_PX / zoom). */
export function snapBoxToTargets(moving: Box, targets: Box[], threshold: number): SnapResult {
  let bestX: { delta: number; pos: number } | null = null
  let bestY: { delta: number; pos: number } | null = null
  for (const t of targets) {
    for (const a of xs(moving)) {
      for (const b of xs(t)) {
        const d = b - a
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) bestX = { delta: d, pos: b }
      }
    }
    for (const a of ys(moving)) {
      for (const b of ys(t)) {
        const d = b - a
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) bestY = { delta: d, pos: b }
      }
    }
  }
  const dx = bestX?.delta ?? 0
  const dy = bestY?.delta ?? 0
  const moved: Box = { minX: moving.minX + dx, minY: moving.minY + dy, maxX: moving.maxX + dx, maxY: moving.maxY + dy }
  const guides: Guide[] = []
  if (bestX) {
    const pos = bestX.pos
    let from = moved.minY
    let to = moved.maxY
    for (const t of targets) {
      if (xs(t).some((v) => Math.abs(v - pos) < 0.5)) {
        from = Math.min(from, t.minY)
        to = Math.max(to, t.maxY)
      }
    }
    guides.push({ orientation: 'v', pos, from, to })
  }
  if (bestY) {
    const pos = bestY.pos
    let from = moved.minX
    let to = moved.maxX
    for (const t of targets) {
      if (ys(t).some((v) => Math.abs(v - pos) < 0.5)) {
        from = Math.min(from, t.minX)
        to = Math.max(to, t.maxX)
      }
    }
    guides.push({ orientation: 'h', pos, from, to })
  }
  return { dx, dy, guides }
}

/** Abstandsmaß zwischen zwei Boxen (Strecke von (x1,y1) nach (x2,y2), Länge distancePx). */
export interface GapMeasure {
  x1: number
  y1: number
  x2: number
  y2: number
  distancePx: number
}

/** Abstand zum nächsten Nachbarn links/rechts/oben/unten (nur Nachbarn, die sich in der
 *  Querrichtung überlappen), höchstens maxDist (px). Liefert 0–4 Maße. */
export function nearestGaps(moving: Box, others: Box[], maxDist: number): GapMeasure[] {
  let left: GapMeasure | null = null
  let right: GapMeasure | null = null
  let up: GapMeasure | null = null
  let down: GapMeasure | null = null
  for (const o of others) {
    const overlapY = o.minY < moving.maxY && o.maxY > moving.minY
    const overlapX = o.minX < moving.maxX && o.maxX > moving.minX
    if (overlapY) {
      const y = (Math.max(o.minY, moving.minY) + Math.min(o.maxY, moving.maxY)) / 2
      if (o.maxX <= moving.minX) {
        const d = moving.minX - o.maxX
        if (d <= maxDist && (!left || d < left.distancePx)) left = { x1: o.maxX, y1: y, x2: moving.minX, y2: y, distancePx: d }
      }
      if (o.minX >= moving.maxX) {
        const d = o.minX - moving.maxX
        if (d <= maxDist && (!right || d < right.distancePx)) right = { x1: moving.maxX, y1: y, x2: o.minX, y2: y, distancePx: d }
      }
    }
    if (overlapX) {
      const x = (Math.max(o.minX, moving.minX) + Math.min(o.maxX, moving.maxX)) / 2
      if (o.maxY <= moving.minY) {
        const d = moving.minY - o.maxY
        if (d <= maxDist && (!up || d < up.distancePx)) up = { x1: x, y1: o.maxY, x2: x, y2: moving.minY, distancePx: d }
      }
      if (o.minY >= moving.maxY) {
        const d = o.minY - moving.maxY
        if (d <= maxDist && (!down || d < down.distancePx)) down = { x1: x, y1: moving.maxY, x2: x, y2: o.minY, distancePx: d }
      }
    }
  }
  return [left, right, up, down].filter((g): g is GapMeasure => g !== null)
}
