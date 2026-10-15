import * as THREE from 'three'
import type { EventItem } from '../../types'
import { box, cylinder, drape, group, mat, NEUTRAL, type ModelMap } from './common'

/** Bühnenpodest-Oberkante 1,20 m (aus HEIGHTS übernommen). */
const PODIUM_H = 1.2
/** Messestand-Höhe 2,50 m (aus HEIGHTS übernommen). */
const STAND_H = 2.5

/**
 * Mobile Bar/Theke: Gästeseite bei z = 0, Korpus in Objektfarbe, dahinter Unterschrank,
 * Arbeitsplatte und Flaschen (nur wenn die Tiefe dafür reicht).
 */
export function buildBar(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const d = item.height // Plan-Tiefe
  const front = Math.min(0.3, d * 0.4)
  const back = d - front - 0.1
  const parts: THREE.Object3D[] = [
    box(w, 1.0, front, w / 2, 0.56, 0.08 + front / 2, mat(color, 'satin')),
    box(w - 0.04, 0.06, front - 0.02, w / 2, 0.03, 0.1 + (front - 0.02) / 2, mat(NEUTRAL.black, 'matt'), false),
    box(w + 0.04, 0.04, front + 0.12, w / 2, 1.08, (front + 0.12) / 2, mat(NEUTRAL.black, 'satin')),
  ]
  if (back > 0.2) {
    const zBack = front + 0.09 + back / 2
    parts.push(
      box(w - 0.04, 0.84, back, w / 2, 0.44, zBack, mat(NEUTRAL.anthracite, 'matt')),
      box(w - 0.04, 0.04, back, w / 2, 0.88, zBack, mat(NEUTRAL.steel, 'metal')),
      // Flaschen stehen auf der Arbeitsplatte (Unterkante 0,90 m)
      cylinder(0.035, 0.28, w / 2 - 0.15, 1.04, zBack, mat('#14532d', 'satin'), { segments: 10, cast: false }),
      cylinder(0.035, 0.28, w / 2, 1.04, zBack, mat('#14532d', 'satin'), { segments: 10, cast: false }),
      cylinder(0.035, 0.28, w / 2 + 0.15, 1.04, zBack, mat('#14532d', 'satin'), { segments: 10, cast: false }),
    )
  }
  return group(...parts)
}

/**
 * Bühnenpodest: Alu-Rahmen mit dunklem Belag, Molton ringsum in Objektfarbe.
 * Mitte bei (w/2, d/2), Oberkante 1,20 m.
 */
export function buildPodium(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const d = item.height // Plan-Tiefe
  const skirtH = PODIUM_H - 0.09
  const skirtY = skirtH / 2
  const molton = mat(color, 'fabric')
  const skirtOpts = { depth: 0.025, fold: 0.15 }
  const sideL = drape(d + 0.06, skirtH, -0.03, skirtY, d / 2, molton, skirtOpts)
  const sideR = drape(d + 0.06, skirtH, w + 0.03, skirtY, d / 2, molton, skirtOpts)
  sideL.rotation.y = Math.PI / 2
  sideR.rotation.y = Math.PI / 2
  return group(
    box(w, 0.08, d, w / 2, PODIUM_H - 0.05, d / 2, mat(NEUTRAL.alu, 'metal')),
    box(w - 0.04, 0.012, d - 0.04, w / 2, PODIUM_H - 0.006, d / 2, mat('#2b2724', 'matt')),
    drape(w + 0.06, skirtH, w / 2, skirtY, -0.03, molton, skirtOpts),
    drape(w + 0.06, skirtH, w / 2, skirtY, d + 0.03, molton, skirtOpts),
    sideL,
    sideR,
  )
}

/**
 * Messe-Reihenstand: nach vorn (z = 0) offen, Rückwand mit Grafik in Objektfarbe.
 * Ab 1,20 m Tiefe zusätzlich eine Theke mit Platte vor der Rückwand.
 */
export function buildExhibitionStand(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const d = item.height // Plan-Tiefe
  const parts: THREE.Object3D[] = [
    box(w, 0.012, d, w / 2, 0.006, d / 2, mat(NEUTRAL.anthracite, 'fabric'), false),
    box(w, STAND_H, 0.04, w / 2, STAND_H / 2, d - 0.02, mat(NEUTRAL.white, 'matt')),
    box(0.04, STAND_H, d - 0.04, 0.02, STAND_H / 2, (d - 0.04) / 2, mat(NEUTRAL.white, 'matt')),
    box(0.04, STAND_H, d - 0.04, w - 0.02, STAND_H / 2, (d - 0.04) / 2, mat(NEUTRAL.white, 'matt')),
    box(w - 0.3, STAND_H - 0.7, 0.006, w / 2, STAND_H / 2, d - 0.043, mat(color, 'satin')),
    box(0.05, STAND_H - 0.3, 0.05, 0.025, (STAND_H - 0.3) / 2, 0.025, mat(NEUTRAL.alu, 'metal')),
    box(0.05, STAND_H - 0.3, 0.05, w - 0.025, (STAND_H - 0.3) / 2, 0.025, mat(NEUTRAL.alu, 'metal')),
    box(w, 0.3, 0.04, w / 2, STAND_H - 0.15, 0.02, mat(color, 'satin')),
  ]
  if (d >= 1.2) {
    const tw = Math.min(1, w * 0.45)
    parts.push(
      box(tw, 0.98, 0.5, w / 2, 0.49, 0.45, mat(color, 'satin')),
      box(tw + 0.04, 0.03, 0.54, w / 2, 0.995, 0.45, mat(NEUTRAL.white, 'satin')),
    )
  }
  return group(...parts)
}

/** Bar, Bühnenpodest und Messestand (Paket P3). */
export const BAR_STAGE_MODELS: ModelMap = {
  bar: buildBar,
  podium: buildPodium,
  exhibition_stand: buildExhibitionStand,
}
