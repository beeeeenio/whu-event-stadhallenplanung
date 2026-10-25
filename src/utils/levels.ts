import type { EventItem, PhaseData } from '../types'
import { OG_FOOTPRINT, OG_VOIDS } from '../data/venueOG'
import { worldBBox } from './geometry'
import { DEFAULT_PIXELS_PER_METER } from './scale'

/** Geschoss der Stadthalle. Objekte ohne Angabe stehen im Erdgeschoss (alte Stände). */
export type Level = 'eg' | 'og'

export const LEVELS: { id: Level; label: string; short: string }[] = [
  { id: 'eg', label: 'Erdgeschoss', short: 'EG' },
  { id: 'og', label: 'Obergeschoss', short: 'OG' },
]

export function itemLevel(item: Pick<EventItem, 'level'>): Level {
  return item.level ?? 'eg'
}

/** Abstand, den ein Objekt in die Sperrzone ragen darf (Toleranz für ungenaue Kanten). */
const VOID_TOLERANCE_M = 0.05

/** Name des Luftraums, in den das Objekt ragt (Fußboden fehlt dort), sonst null. Nur für das OG sinnvoll. */
export function ogVoidHit(item: EventItem, pd: PhaseData): string | null {
  const bb = worldBBox(item, pd, DEFAULT_PIXELS_PER_METER)
  const r = DEFAULT_PIXELS_PER_METER
  const [minX, minZ, maxX, maxZ] = [bb.minX / r, bb.minY / r, bb.maxX / r, bb.maxY / r]
  for (const { name, rect: [x0, z0, x1, z1] } of OG_VOIDS) {
    if (maxX > x0 + VOID_TOLERANCE_M && minX < x1 - VOID_TOLERANCE_M && maxZ > z0 + VOID_TOLERANCE_M && minZ < z1 - VOID_TOLERANCE_M) {
      return name
    }
  }
  return null
}

/** Mitte des Objekts (px) liegt auf dem Gebäudegrundriss des OG. */
function centerInFootprint(item: EventItem, pd: PhaseData): boolean {
  const bb = worldBBox(item, pd, DEFAULT_PIXELS_PER_METER)
  const cx = (bb.minX + bb.maxX) / 2 / DEFAULT_PIXELS_PER_METER
  const cz = (bb.minY + bb.maxY) / 2 / DEFAULT_PIXELS_PER_METER
  return OG_FOOTPRINT.some(([x0, z0, x1, z1]) => cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1)
}

/**
 * Nächster Platz mit Boden für ein NEUES OG-Objekt, das im Luftraum landen würde: Versatz in Pixeln
 * (gleich für alle Phasen) oder null, wenn im Umkreis von 50 m nichts frei ist. Gesucht wird in Ringen
 * von 0,5 m Schritt um die Wunschposition, im ersten Ring mit freiem Platz der nächste Punkt.
 */
export function nearestFloorOffset(item: EventItem, pd: PhaseData): { dx: number; dy: number } | null {
  const STEP_M = 0.5
  const MAX_RING = 100
  const r = DEFAULT_PIXELS_PER_METER
  for (let ring = 1; ring <= MAX_RING; ring++) {
    let best: { dx: number; dy: number; d: number } | null = null
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue
        const dx = i * STEP_M * r
        const dy = j * STEP_M * r
        const moved = { ...pd, x: pd.x + dx, y: pd.y + dy }
        if (ogVoidHit(item, moved) || !centerInFootprint(item, moved)) continue
        const d = i * i + j * j
        if (!best || d < best.d) best = { dx, dy, d }
      }
    }
    if (best) return { dx: best.dx, dy: best.dy }
  }
  return null
}

/** Neues OG-Objekt, das im Luftraum läge, an den nächsten Platz mit Boden schieben (alle Phasen gleich). */
export function relocateFromVoid(item: EventItem): EventItem {
  const hitPd = Object.values(item.phaseData).find((pd) => pd.visible && ogVoidHit(item, pd))
  if (!hitPd) return item
  const off = nearestFloorOffset(item, hitPd)
  if (!off) return item
  const phaseData = Object.fromEntries(Object.entries(item.phaseData).map(([id, pd]) => [id, { ...pd, x: pd.x + off.dx, y: pd.y + off.dy }]))
  return { ...item, phaseData }
}

const samePlace = (a: PhaseData | undefined, b: PhaseData) =>
  !!a && a.x === b.x && a.y === b.y && a.rotation === b.rotation && a.visible === b.visible

/**
 * Erstes OG-Objekt, das durch den Wechsel von `prev` zu `next` neu im Luftraum landet.
 * Nur geänderte Objekte werden geprüft; unveränderte Position und Größe bleiben unbeachtet.
 */
export function findVoidViolation(
  prev: Record<string, EventItem>,
  next: Record<string, EventItem>,
): { item: EventItem; voidName: string } | null {
  for (const [id, item] of Object.entries(next)) {
    const before = prev[id]
    if (before === item || itemLevel(item) !== 'og') continue
    const sameSize = !!before && before.width === item.width && before.height === item.height
    for (const [phaseId, pd] of Object.entries(item.phaseData)) {
      if (!pd.visible || (sameSize && samePlace(before.phaseData[phaseId], pd))) continue
      const voidName = ogVoidHit(item, pd)
      if (voidName) return { item, voidName }
    }
  }
  return null
}
