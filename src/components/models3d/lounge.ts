import * as THREE from 'three'
import type { EventItem } from '../../types'
import { box, group, mat, NEUTRAL, shade, type ModelMap } from './common'

/** Armlehnenbreite (m). */
const ARM = 0.18
/** Lehnentiefe (m). */
const BACK = 0.2
/** Fußhöhe (m). */
const LEG = 0.08
/** Oberkante Korpus/Sockel (m). */
const BASE_TOP = 0.3
/** Oberkante Sitzkissen (m). */
const SEAT_TOP = 0.44
/** Oberkante Armlehne (m). */
const ARM_TOP = 0.62
/** Oberkante Rückenlehne (m). */
const BACK_TOP = 0.8
/** Ab dieser Plan-Tiefe (m) wird ein L-Sofa gebaut, darunter ein gerades Sofa. */
const L_MIN_DEPTH = 1.6
/** Maximale Tiefe eines L-Schenkels (m). */
const L_LEG_MAX = 0.9

/**
 * Sofa mit Grundfläche (0,0)–(len, depth), Lehne an z = depth, Sitzrichtung −z.
 * Polster in Objektfarbe, Korpus leicht abgedunkelt, Füße neutral.
 */
function sofa(len: number, depth: number, color: string, armL: boolean, armR: boolean): THREE.Group {
  const polster = mat(color, 'fabric')
  const korpus = mat(shade(color, -0.12), 'fabric')
  const fuss = mat(NEUTRAL.black, 'satin')

  const x0 = armL ? ARM : 0
  const inner = len - x0 - (armR ? ARM : 0)
  const seats = Math.max(1, Math.round(inner / 0.6))
  const cw = inner / seats

  const parts: THREE.Object3D[] = []
  for (const fx of [0.06, len - 0.06]) {
    for (const fz of [0.06, depth - 0.06]) {
      parts.push(box(0.05, LEG, 0.05, fx, LEG / 2, fz, fuss, false))
    }
  }
  parts.push(box(len, BASE_TOP - LEG, depth, len / 2, (LEG + BASE_TOP) / 2, depth / 2, korpus))
  if (armL) parts.push(box(ARM, ARM_TOP - BASE_TOP, depth, ARM / 2, (BASE_TOP + ARM_TOP) / 2, depth / 2, polster))
  if (armR) parts.push(box(ARM, ARM_TOP - BASE_TOP, depth, len - ARM / 2, (BASE_TOP + ARM_TOP) / 2, depth / 2, polster))
  parts.push(box(len, BACK_TOP - BASE_TOP, BACK, len / 2, (BASE_TOP + BACK_TOP) / 2, depth - BACK / 2, polster))

  for (let i = 0; i < seats; i++) {
    const cx = x0 + (i + 0.5) * cw
    parts.push(box(cw - 0.015, SEAT_TOP - BASE_TOP, depth - BACK - 0.02, cx, (BASE_TOP + SEAT_TOP) / 2, 0.01 + (depth - BACK) / 2, polster))
    const kissen = box(cw - 0.03, 0.34, 0.12, cx, SEAT_TOP + 0.18, depth - BACK - 0.06, polster)
    kissen.rotation.x = 0.12 // oben nach hinten geneigt
    parts.push(kissen)
  }
  return group(...parts)
}

/** Zweisitzer (2 Sitzkissen, beidseitig Armlehne), Lehne an der Plan-Unterkante. */
export function buildSofa2(item: EventItem, color: string): THREE.Group {
  return sofa(item.width, item.height, color, true, true)
}

/** Dreisitzer (3 Sitzkissen, beidseitig Armlehne), Lehne an der Plan-Unterkante. */
export function buildSofa3(item: EventItem, color: string): THREE.Group {
  return sofa(item.width, item.height, color, true, true)
}

/** Sessel (1 Sitzkissen, beidseitig Armlehne), Lehne an der Plan-Unterkante. */
export function buildArmchair(item: EventItem, color: string): THREE.Group {
  return sofa(item.width, item.height, color, true, true)
}

/**
 * Eck-Sofa: bei Tiefe >= 1,6 m ein L aus hinterem Teil (volle Breite) und linkem Schenkel
 * mit Ecklehne; sonst ein gerades Sofa.
 */
export function buildSofaCorner(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const d = item.height
  if (d < L_MIN_DEPTH) return sofa(w, d, color, true, true)

  const legDepth = Math.min(L_LEG_MAX, d / 2)
  const hinten = sofa(w, legDepth, color, false, true)
  hinten.position.z = d - legDepth

  // Schenkel läuft in Plan-Richtung nach oben (−z), Lehne landet bei x = 0, Sitzrichtung +x.
  const schenkel = sofa(d - legDepth, legDepth, color, true, false)
  schenkel.rotation.y = -Math.PI / 2
  schenkel.position.x = legDepth

  const ecklehne = box(BACK, BACK_TOP - BASE_TOP, legDepth, BACK / 2, (BASE_TOP + BACK_TOP) / 2, d - legDepth / 2, mat(color, 'fabric'))
  return group(hinten, schenkel, ecklehne)
}

/** Export für index.ts: Sofa- und Sessel-Typen. */
export const LOUNGE_MODELS: ModelMap = {
  sofa_2: buildSofa2,
  sofa_3: buildSofa3,
  sofa_corner: buildSofaCorner,
  armchair: buildArmchair,
}
