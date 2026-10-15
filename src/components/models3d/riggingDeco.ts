import * as THREE from 'three'
import type { EventItem } from '../../types'
import { VENUE } from '../../data/venue3d'
import { box, cylinder, group, mat, NEUTRAL, rod, shade, sphere, type ModelMap, type P3 } from './common'

/** Traversen, Garderobe und Pflanze (siehe docs/plan-objekte-3d.md, Paket P5). */

/** Punkt in der Traversen-Ebene als [y, z]. */
type YZ = [number, number]

/** Punkt [x, y, z] aus x und einem Punkt [y, z]. */
function at(x: number, p: YZ): P3 {
  return [x, p[0], p[1]]
}

// Traverse

/** Unterkante der Traverse über dem Boden (m). */
const TRUSS_ELEVATION = 5
/** Querschnitt (Höhe = Plan-Tiefe) wird auf diesen Bereich begrenzt (m). */
const TRUSS_MIN_SECTION = 0.2
const TRUSS_MAX_SECTION = 0.6
/** Radius der Gurtrohre (m). */
const TRUSS_CHORD_R = 0.024
/** Radius der Diagonalen (m). */
const TRUSS_BRACE_R = 0.008
/** Maximaler Abstand der Diagonalen-Knoten (m). */
const TRUSS_FIELD = 0.6
/** Ab dieser Länge (m) hängen Kettenzüge an der Traverse. */
const TRUSS_HOIST_MIN_LENGTH = 1.5
/** Abstand der Kettenzüge vom Traversenende (m). */
const TRUSS_HOIST_INSET = 0.3
/** Radius der Kettenglieder (m). */
const CHAIN_R = 0.006

/**
 * Traverse (4-Punkt-Gitter) über die Breite `item.width`, Unterkante 5 m über dem Boden.
 * Gurte und Diagonalen in Objektfarbe (Metall), Kettenzüge in Schwarz ab 1,5 m Länge.
 */
export function buildTruss(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const d = item.height // Plan-Tiefe = Querschnitt
  const s = Math.min(Math.max(d, TRUSS_MIN_SECTION), TRUSS_MAX_SECTION)
  const zc = d / 2
  const yc = TRUSS_ELEVATION + s / 2
  const c = s / 2 - TRUSS_CHORD_R
  const m = mat(color, 'metal')
  const TF: YZ = [yc + c, zc - c]
  const TB: YZ = [yc + c, zc + c]
  const BF: YZ = [yc - c, zc - c]
  const BB: YZ = [yc - c, zc + c]
  const parts: THREE.Object3D[] = []

  // Gurte
  for (const p of [TF, TB, BF, BB]) {
    parts.push(rod(at(0, p), at(w, p), TRUSS_CHORD_R, m, true, 12))
  }

  // Diagonalen im Zickzack je Fläche
  const n = Math.max(1, Math.round(w / TRUSS_FIELD))
  const seg = w / n
  const faces: [YZ, YZ][] = [
    [TF, TB],
    [BF, BB],
    [TF, BF],
    [TB, BB],
  ]
  for (const [p1, p2] of faces) {
    for (let i = 0; i < n; i++) {
      const even = i % 2 === 0
      const a = even ? p1 : p2
      const b = even ? p2 : p1
      parts.push(rod(at(i * seg, a), at((i + 1) * seg, b), TRUSS_BRACE_R, m, false, 6))
    }
  }

  // Kettenzüge
  if (w >= TRUSS_HOIST_MIN_LENGTH) {
    const top = TRUSS_ELEVATION + s
    const motorMat = mat(NEUTRAL.black, 'satin')
    const chainMat = mat(NEUTRAL.black, 'metal')
    for (const x of [TRUSS_HOIST_INSET, w - TRUSS_HOIST_INSET]) {
      parts.push(box(0.22, 0.3, 0.22, x, top + 0.9, zc, motorMat, false))
      parts.push(rod([x, top, zc], [x, top + 0.75, zc], CHAIN_R, chainMat, false, 4))
      parts.push(rod([x, top + 1.05, zc], [x, VENUE.wallHeight, zc], CHAIN_R, chainMat, false, 4))
    }
  }

  return group(...parts)
}

// Garderobe

/** Garderobe: Höhe (m). */
const COAT_H = 1.8
/** Liegen Breite und Tiefe darunter (m), ist es ein Ständer, sonst ein Wagen. */
const COAT_STAND_MAX = 1.0
/** Feste Mantelfarben (Stoff), nicht über die Objektfarbe änderbar. */
const COAT_SLATE = '#334155'
const COAT_RUST = '#7c2d12'
const COAT_NAVY = '#1e3a8a'

/** Mantel als Stoffquader, Mitte (x, y, z). */
function coat(w: number, h: number, d: number, x: number, y: number, z: number, color: string): THREE.Mesh {
  return box(w, h, d, x, y, z, mat(color, 'fabric'))
}

/** Garderobenständer mit Standfuß, Säule, 6 Haken und 2 Mänteln. Mitte bei (w/2, d/2). */
function buildCoatStand(w: number, d: number, m: THREE.Material): THREE.Group {
  const cx = w / 2
  const cz = d / 2
  const parts: THREE.Object3D[] = [
    cylinder(0.02, COAT_H - 0.02, cx, 0.02 + (COAT_H - 0.02) / 2, cz, m, { segments: 12 }),
    cylinder(Math.min(w, d) * 0.4, 0.02, cx, 0.01, cz, mat(NEUTRAL.black, 'metal'), { segments: 24 }),
    sphere(0.03, 0.03, 0.03, cx, COAT_H + 0.01, cz, m, false, false),
    coat(0.12, 0.85, 0.36, cx - 0.2, COAT_H - 0.55, cz, COAT_SLATE),
    coat(0.12, 0.85, 0.36, cx + 0.2, COAT_H - 0.55, cz, COAT_RUST),
  ]
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    parts.push(
      rod(
        [cx + 0.02 * ca, COAT_H - 0.12, cz + 0.02 * sa],
        [cx + 0.16 * ca, COAT_H - 0.02, cz + 0.16 * sa],
        0.01,
        m,
        false,
        6,
      ),
    )
  }
  return group(...parts)
}

/**
 * Garderobenwagen mit Stange entlang der längeren Seite. Innere Gruppe läuft entlang x;
 * bei d > w wird sie um −90° gedreht, damit die lange Seite in z liegt.
 */
function buildCoatRail(w: number, d: number, m: THREE.Material): THREE.Group {
  const L = Math.max(w, d)
  const D = Math.min(w, d)
  const ends = [0.05, L - 0.05]
  const rollerMat = mat(NEUTRAL.black, 'satin')
  const parts: THREE.Object3D[] = []

  for (const x of ends) {
    parts.push(rod([x, 0.08, D / 2], [x, COAT_H - 0.1, D / 2], 0.016, m, true))
    parts.push(box(0.04, 0.03, D, x, 0.08, D / 2, m))
    for (const z of [0.03, D - 0.03]) {
      parts.push(sphere(0.03, 0.03, 0.03, x, 0.03, z, rollerMat, false, false))
    }
  }
  parts.push(rod([0.05, COAT_H - 0.1, D / 2], [L - 0.05, COAT_H - 0.1, D / 2], 0.016, m))

  const coats: [number, string][] = [
    [0.3, COAT_SLATE],
    [0.5, COAT_RUST],
    [0.7, COAT_NAVY],
  ]
  for (const [t, c] of coats) {
    parts.push(coat(0.1, 0.85, 0.4, L * t, COAT_H - 0.55, D / 2, c))
  }

  const inner = group(...parts)
  if (d > w) {
    inner.rotation.y = -Math.PI / 2
    inner.position.x = w
  }
  return inner
}

/**
 * Garderobe: unter 1 m in Breite und Tiefe ein Ständer, sonst ein Wagen.
 * Stoffe und Gestell: Objektfarbe nur für die Säule bzw. Stange (Satin), Mäntel in festen Farben.
 */
export function buildCoatRack(item: EventItem, color: string): THREE.Group {
  const m = mat(color, 'satin')
  return Math.max(item.width, item.height) < COAT_STAND_MAX
    ? buildCoatStand(item.width, item.height, m)
    : buildCoatRail(item.width, item.height, m)
}

// Pflanze

/** Pflanzkübel: Höhe (m). */
const POT_H = 0.42
/** Erdschicht: Mitte (m) und Farbe. */
const SOIL_Y = 0.41
const SOIL = '#3f2a1d'
/** Stamm: Radius, Höhe und Mitte (m). */
const TRUNK_R = 0.025
const TRUNK_H = 0.55
const TRUNK_Y = 0.695

/**
 * Zimmerpflanze mit Kübel, Stamm und drei facettierten Laubballen. Mitte bei (w/2, d/2),
 * Radius R = min(w, d) / 2. Laub in Objektfarbe, nach oben leicht auf- bzw. abgehellt.
 */
export function buildPlant(item: EventItem, color: string): THREE.Group {
  const cx = item.width / 2
  const cz = item.height / 2
  const R = Math.min(item.width, item.height) / 2
  return group(
    cylinder(R * 0.55, POT_H, cx, POT_H / 2, cz, mat(NEUTRAL.anthracite, 'satin'), { taper: 1.25, segments: 20 }),
    cylinder(R * 0.66, 0.02, cx, SOIL_Y, cz, mat(SOIL, 'matt'), { segments: 20, cast: false }),
    cylinder(TRUNK_R, TRUNK_H, cx, TRUNK_Y, cz, mat(NEUTRAL.darkWood, 'matt'), { segments: 8, cast: false }),
    sphere(R, 0.32, R, cx, 0.95, cz, mat(color, 'leaf'), true),
    sphere(R * 0.8, 0.28, R * 0.8, cx + 0.06, 1.18, cz - 0.04, mat(shade(color, 0.08), 'leaf'), true),
    sphere(R * 0.55, 0.22, R * 0.55, cx - 0.04, 1.33, cz + 0.03, mat(shade(color, 0.15), 'leaf'), true),
  )
}

/** Export für models3d/index.ts: Traverse, Garderobe und Pflanze. */
export const RIGGING_DECO_MODELS: ModelMap = {
  truss: buildTruss,
  coat_rack: buildCoatRack,
  plant: buildPlant,
}
