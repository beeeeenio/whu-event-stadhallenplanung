import * as THREE from 'three'
import type { EventItem } from '../../types'
import { box, cylinder, group, mat, NEUTRAL, shade, shadows, type ModelMap } from './common'

/** Bankett-Tischhöhe: Tuch-Mitte 0,75 m, Tischoberkante 0,76 m. */
const TABLE_H = 0.75
/** Stehtisch-Höhe: Tischoberkante 1,10 m. */
const HIGH_H = 1.1
/** Niedriger Lounge-Tisch: Höhe 45 cm (Schätzung). */
const LOW_H = 0.45

let skirtGeo: THREE.BufferGeometry | null = null

/** Tuch-Behang (Einheitsgröße: Radius unten 1, oben 0,96, Höhe 1, offen) mit nach unten stärkeren Falten. */
function skirtGeometry(): THREE.BufferGeometry {
  if (skirtGeo) return skirtGeo
  const g = new THREE.CylinderGeometry(0.96, 1, 1, 64, 1, true)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const k = 1 + 0.03 * Math.sin(Math.atan2(z, x) * 18) * (0.5 - y)
    p.setXYZ(i, x * k, y, z * k)
  }
  g.computeVertexNormals()
  skirtGeo = g
  return g
}

/** Bankett-Rundtisch mit bodenlangem Tafeltuch und Vase in der Mitte. Mitte im Ursprung, Radius w/2. */
export function buildTableRound(item: EventItem, color: string): THREE.Group {
  const R = item.width / 2
  const tuch = cylinder(R + 0.02, 0.02, 0, TABLE_H, 0, mat(color, 'fabric'), { segments: 40 })
  const skirt = shadows(new THREE.Mesh(skirtGeometry(), mat(color, 'fabric')))
  skirt.scale.set(R + 0.05, 0.74, R + 0.05)
  skirt.position.y = TABLE_H / 2
  const vase = cylinder(0.06, 0.22, 0, TABLE_H + 0.12, 0, mat(NEUTRAL.glass, 'glass'), { segments: 12, cast: false })
  return group(tuch, skirt, vase)
}

/** Bankett-Rechtecktisch mit Tuch (2 cm Überhang rundum, 30 cm nach unten) auf vier schwarzen Klappbeinen. Ursprung oben links, Grundfläche w × d. */
export function buildTableRect(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const d = item.height // item.height = Plan-Tiefe
  const cloth = box(w + 0.04, 0.3, d + 0.04, w / 2, 0.615, d / 2, mat(color, 'fabric'))
  const legMat = mat(NEUTRAL.black, 'metal')
  const legs: THREE.Mesh[] = []
  for (const x of [0.08, w - 0.08]) {
    for (const z of [0.08, d - 0.08]) {
      legs.push(cylinder(0.018, 0.465, x, 0.2325, z, legMat, { segments: 8, cast: false }))
    }
  }
  return group(cloth, ...legs)
}

/** Stehtisch (Bankett-Hochtisch) mit Stretch-Husse in Sanduhrform. Mitte im Ursprung, Radius w/2. */
export function buildTableHigh(item: EventItem, color: string): THREE.Group {
  const R = item.width / 2
  const rf = Math.min(0.3, R * 0.75)
  const husse = mat(color, 'fabric')
  const bund = mat(shade(color, -0.15), 'fabric')
  return group(
    cylinder(R, 0.03, 0, HIGH_H - 0.015, 0, husse, { segments: 32 }),
    cylinder(0.07, 0.3, 0, 0.92, 0, husse, { taper: R / 0.07, segments: 32 }),
    cylinder(0.09, 0.05, 0, 0.77, 0, bund, { segments: 16, cast: false }),
    cylinder(rf, 0.75, 0, 0.375, 0, husse, { taper: 0.07 / rf, segments: 24 }),
  )
}

/** Niedriger Rundtisch (Lounge). In 2D ein Rechteck ab (0,0), daher Mitte bei (w/2, d/2). Platte in Objektfarbe. */
export function buildTableLowRound(item: EventItem, color: string): THREE.Group {
  const cx = item.width / 2
  const cz = item.height / 2 // item.height = Plan-Tiefe
  const r = Math.min(item.width, item.height) / 2
  return group(
    cylinder(r, 0.03, cx, LOW_H - 0.015, cz, mat(color, 'satin'), { segments: 32 }),
    cylinder(0.025, LOW_H - 0.05, cx, 0.02 + (LOW_H - 0.05) / 2, cz, mat(NEUTRAL.chrome, 'chrome'), { segments: 12, cast: false }),
    cylinder(r * 0.55, 0.02, cx, 0.01, cz, mat(NEUTRAL.black, 'metal'), { taper: 0.9, cast: false }),
  )
}

/** 3D-Modelle der Tischtypen. */
export const TABLE_MODELS: ModelMap = {
  table_round: buildTableRound,
  table_rect: buildTableRect,
  table_high: buildTableHigh,
  table_low_round: buildTableLowRound,
}
