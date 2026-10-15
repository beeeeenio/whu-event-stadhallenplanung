import * as THREE from 'three'
import type { EventItem, ItemType } from '../../types'

/**
 * Gemeinsame Bausteine der 3D-Objektmodelle (siehe docs/plan-objekte-3d.md).
 * Einheiten Meter; x = rechts, y = oben, z = Plan-y (im 2D-Plan nach unten).
 * Geometrien und Materialien sind geteilt (Cache) — nie dispose() darauf aufrufen.
 */

/** Baut ein Objekt im lokalen Koordinatensystem (Position/Drehung im Saal setzt Venue3D). */
export type ModelBuilder = (item: EventItem, color: string) => THREE.Group
export type ModelMap = Partial<Record<ItemType, ModelBuilder>>
export type P3 = [number, number, number]

/** Neutrale Farben für Gestelle, Metall, Holz — nicht über die Objektfarbe änderbar. */
export const NEUTRAL = {
  chrome: '#c0c4c8',
  alu: '#cfd2d6',
  steel: '#9ca3af',
  black: '#1f2937',
  anthracite: '#374151',
  white: '#f8fafc',
  wood: '#b08560',
  darkWood: '#5b4433',
  glass: '#dbeafe',
} as const

/** Oberflächen: matt (Lack/Holz), fabric (Stoff, beidseitig), satin (Polster/Kunststoff), metal, chrome, leaf (facettiertes Laub), glass. */
export type Finish = 'matt' | 'fabric' | 'satin' | 'metal' | 'chrome' | 'leaf' | 'glass'

const FINISH: Record<Finish, THREE.MeshStandardMaterialParameters> = {
  matt: { roughness: 0.8, metalness: 0 },
  fabric: { roughness: 1, metalness: 0, side: THREE.DoubleSide },
  satin: { roughness: 0.5, metalness: 0.05 },
  // ohne Environment-Map wirkt hohe Metalness sehr dunkel → moderat
  metal: { roughness: 0.45, metalness: 0.6 },
  chrome: { roughness: 0.3, metalness: 0.85 },
  leaf: { roughness: 0.9, metalness: 0, flatShading: true },
  glass: { roughness: 0.1, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false },
}

const MATERIALS = new Map<string, THREE.MeshStandardMaterial>()

/** Geteiltes Material je Farbe + Oberfläche (+ Deckkraft). Farbe als Hex oder rgb()/rgba(). */
export function mat(color: string, finish: Finish = 'matt', opacity = 1): THREE.MeshStandardMaterial {
  const key = `${color}|${finish}|${opacity}`
  let m = MATERIALS.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, ...FINISH[finish] })
    if (opacity < 1) {
      m.transparent = true
      m.opacity = opacity
      m.depthWrite = false
    }
    MATERIALS.set(key, m)
  }
  return m
}

const WHITE = new THREE.Color('#ffffff')
const BLACK = new THREE.Color('#000000')

/** Farbe aufhellen (amount > 0) bzw. abdunkeln (amount < 0), amount in −1…1. Ergebnis als Hex. */
export function shade(color: string, amount: number): string {
  const c = new THREE.Color(color).lerp(amount > 0 ? WHITE : BLACK, Math.min(Math.abs(amount), 1))
  return `#${c.getHexString()}`
}

// Einheitsgeometrien, per mesh.scale auf Maß gebracht
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_BOX_EDGES = new THREE.EdgesGeometry(UNIT_BOX)
const UNIT_SPHERE = new THREE.SphereGeometry(1, 16, 12)
const UNIT_BLOB = new THREE.IcosahedronGeometry(1, 1)
const CYLINDERS = new Map<string, THREE.CylinderGeometry>()

/** Einheits-Zylinder: Radius unten 1, oben `taper`, Höhe 1, Mitte im Ursprung. */
function unitCylinder(taper: number, segments: number): THREE.CylinderGeometry {
  const key = `${taper.toFixed(3)}|${segments}`
  let g = CYLINDERS.get(key)
  if (!g) {
    g = new THREE.CylinderGeometry(taper, 1, 1, segments)
    CYLINDERS.set(key, g)
  }
  return g
}

/** Schatten-Flags: Hauptteile werfen Schatten, kleine Teile (cast = false) nur empfangen. */
export function shadows<T extends THREE.Mesh>(m: T, cast = true): T {
  m.castShadow = cast
  m.receiveShadow = true
  return m
}

/** Quader w × h × d mit Mittelpunkt (x, y, z). */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(UNIT_BOX, material)
  m.scale.set(Math.max(w, 0.005), Math.max(h, 0.005), Math.max(d, 0.005))
  m.position.set(x, y, z)
  return shadows(m, cast)
}

/** Kantenlinien eines Quaders (gleiche Parameter wie box), z. B. für schlichte Platzhalter. */
export function boxEdges(w: number, h: number, d: number, x: number, y: number, z: number, color: string): THREE.LineSegments {
  let lm = LINE_MATERIALS.get(color)
  if (!lm) {
    lm = new THREE.LineBasicMaterial({ color })
    LINE_MATERIALS.set(color, lm)
  }
  const l = new THREE.LineSegments(UNIT_BOX_EDGES, lm)
  l.scale.set(Math.max(w, 0.005), Math.max(h, 0.005), Math.max(d, 0.005))
  l.position.set(x, y, z)
  return l
}
const LINE_MATERIALS = new Map<string, THREE.LineBasicMaterial>()

/**
 * Senkrechter Zylinder mit Radius unten `r`, Höhe `h`, Mittelpunkt (x, y, z).
 * `taper` = Radius oben / Radius unten (Kegelstumpf), `segments` Default 24.
 */
export function cylinder(
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  opts: { taper?: number; segments?: number; cast?: boolean } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(unitCylinder(opts.taper ?? 1, opts.segments ?? 24), material)
  m.scale.set(Math.max(r, 0.002), Math.max(h, 0.005), Math.max(r, 0.002))
  m.position.set(x, y, z)
  return shadows(m, opts.cast ?? true)
}

/** Kugel/Ellipsoid mit Radien rx, ry, rz um (x, y, z); `faceted` = facettierte Form (Laub, Finish 'leaf'). */
export function sphere(rx: number, ry: number, rz: number, x: number, y: number, z: number, material: THREE.Material, faceted = false, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(faceted ? UNIT_BLOB : UNIT_SPHERE, material)
  m.scale.set(rx, ry, rz)
  m.position.set(x, y, z)
  return shadows(m, cast)
}

const UP = new THREE.Vector3(0, 1, 0)

/** Rundstab mit Radius r von Punkt a nach b (Rohre, Diagonalen, Haken, Stangen). */
export function rod(a: P3, b: P3, r: number, material: THREE.Material, cast = false, segments = 8): THREE.Mesh {
  const start = new THREE.Vector3(...a)
  const dir = new THREE.Vector3(...b).sub(start)
  const len = dir.length()
  const m = new THREE.Mesh(unitCylinder(1, segments), material)
  m.scale.set(r, Math.max(len, 0.005), r)
  m.position.copy(start).addScaledVector(dir, 0.5)
  if (len > 0) m.quaternion.setFromUnitVectors(UP, dir.normalize())
  return shadows(m, cast)
}

const DRAPES = new Map<string, THREE.BufferGeometry>()

/** Stoffbahn w × h (Mitte im Ursprung, Fläche in x/y) mit senkrechten Falten in z. */
function drapeGeometry(w: number, h: number, depth: number, fold: number): THREE.BufferGeometry {
  const key = `${w.toFixed(2)}|${h.toFixed(2)}|${depth}|${fold}`
  let g = DRAPES.get(key)
  if (!g) {
    const folds = Math.max(1, Math.round(w / fold))
    const plane = new THREE.PlaneGeometry(w, h, folds * 6, 1)
    const p = plane.attributes.position
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w + 0.5) * folds * Math.PI * 2) * depth)
    plane.computeVertexNormals()
    g = plane
    DRAPES.set(key, g)
  }
  return g
}

/**
 * Senkrechte Stoffbahn (Vorhang, Molton, Skirt) w × h mit Mittelpunkt (x, y, z), Fläche parallel zur x-Achse.
 * Falten: Amplitude `depth` (Default 4 cm), eine Falte je `fold` m (Default 0,25). Für Seitenflächen danach
 * `mesh.rotation.y = Math.PI / 2` setzen. Material mit Finish 'fabric' (beidseitig) verwenden.
 */
export function drape(
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
  opts: { depth?: number; fold?: number; cast?: boolean } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(drapeGeometry(Math.max(w, 0.05), Math.max(h, 0.05), opts.depth ?? 0.04, opts.fold ?? 0.25), material)
  m.position.set(x, y, z)
  return shadows(m, opts.cast ?? true)
}

/** Gruppe aus Teilen. */
export function group(...parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group()
  if (parts.length) g.add(...parts)
  return g
}
