import type { EventItem, PhaseData } from '../types'
import { OG_VOIDS } from '../data/venueOG'
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
