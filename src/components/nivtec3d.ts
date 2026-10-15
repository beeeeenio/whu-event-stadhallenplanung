import * as THREE from 'three'
import type { ForexPanel, Piece2D } from '../types'
import { forexEdge } from '../utils/forex'

/**
 * NivTec-Podest in 3D — Darstellung übernommen aus dem NivTec-Konfigurator
 * (beeeeenio/whu-event-NivTec, AufbauScene3D.tsx): Alu-Rahmen je Platte, dunkler
 * Siebdruck-Belag mit Sechseck-Prägung, verzinkte Füße. Zusätzlich optional ein
 * Molton-Behang in der Objektfarbe an allen freien Außenkanten.
 */

const PANEL_THICKNESS_M = 0.08
const FRAME_WIDTH_M = 0.04
const INFILL_RECESS_M = 0.005
const PANEL_GAP_M = 0.01
const INFILL_COLOR = '#2b2724'
const HEX_TILE_M = 0.25
const FOOT_RADIUS_M = 0.026
const FOOT_PLATE_RADIUS_M = 0.075
const MOLTON_OFFSET_M = 0.02

const GALVANIZED = new THREE.MeshStandardMaterial({ color: '#a9aeb1', metalness: 0.85, roughness: 0.45 })

type Corner = NonNullable<Piece2D['corner']>
type Pt = { x: number; y: number }

let hexCanvasCache: HTMLCanvasElement | null | undefined
/** Einmal gezeichnete Sechseck-Prägung (Graustufen): hell = Plateau, dunkel = Rille. */
function hexCanvas(): HTMLCanvasElement | null {
  if (hexCanvasCache !== undefined) return hexCanvasCache
  hexCanvasCache = null
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = 'rgb(236,236,236)'
  ctx.fillRect(0, 0, 256, 256)
  const r = 8
  const w = Math.sqrt(3) * r
  const h = 1.5 * r
  ctx.strokeStyle = 'rgb(185,185,185)'
  ctx.lineWidth = 1.6
  for (let row = -1; row * h < 256 + r; row++) {
    for (let col = -1; col * w < 256 + w; col++) {
      const cx = col * w + (row % 2 !== 0 ? w / 2 : 0)
      const cy = row * h
      ctx.beginPath()
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3
        const px = cx + r * 0.82 * Math.cos(a)
        const py = cy + r * 0.82 * Math.sin(a)
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }
  hexCanvasCache = c
  return c
}

const INFILL_MATERIALS = new Map<string, THREE.MeshStandardMaterial>()
function infillMaterial(repeatU: number, repeatV: number): THREE.MeshStandardMaterial {
  const key = `${repeatU.toFixed(3)}|${repeatV.toFixed(3)}`
  let m = INFILL_MATERIALS.get(key)
  if (m) return m
  m = new THREE.MeshStandardMaterial({ color: INFILL_COLOR, roughness: 0.82, metalness: 0 })
  const canvas = hexCanvas()
  if (canvas) {
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.repeat.set(repeatU, repeatV)
    const bump = map.clone()
    bump.colorSpace = THREE.NoColorSpace
    m.map = map
    m.bumpMap = bump
    m.bumpScale = 1.5
  }
  INFILL_MATERIALS.set(key, m)
  return m
}

const FRAME_MATERIAL = new THREE.MeshStandardMaterial({ color: '#cfd0cc', metalness: 0.9, roughness: 0.4 })

/** Eckpunkte eines Dreiecks (wie im 2D-Plan: rechter Winkel an `corner`). */
function trianglePoints(p: Piece2D, corner: Corner): Pt[] {
  const tl = { x: p.x, y: p.y }
  const tr = { x: p.x + p.w, y: p.y }
  const bl = { x: p.x, y: p.y + p.d }
  const br = { x: p.x + p.w, y: p.y + p.d }
  return { tl: [tl, tr, bl], tr: [tl, tr, br], bl: [tl, bl, br], br: [tr, bl, br] }[corner]
}

function piecePolygon(p: Piece2D): Pt[] {
  if (p.corner) return trianglePoints(p, p.corner)
  return [
    { x: p.x, y: p.y },
    { x: p.x + p.w, y: p.y },
    { x: p.x + p.w, y: p.y + p.d },
    { x: p.x, y: p.y + p.d },
  ]
}

/** Konvexes Polygon um `t` nach innen versetzen (Kanten parallel verschieben, Nachbarn schneiden). */
function insetPolygon(pts: Pt[], t: number): Pt[] {
  const n = pts.length
  const cx = pts.reduce((s, p) => s + p.x, 0) / n
  const cy = pts.reduce((s, p) => s + p.y, 0) / n
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const dx = (b.x - a.x) / len
    const dy = (b.y - a.y) / len
    let nx = -dy
    let ny = dx
    if (nx * (cx - a.x) + ny * (cy - a.y) < 0) {
      nx = -nx
      ny = -ny
    }
    return { px: a.x + nx * t, py: a.y + ny * t, dx, dy }
  })
  return pts.map((_, i) => {
    const l1 = lines[(i - 1 + n) % n]
    const l2 = lines[i]
    const cross = l1.dx * l2.dy - l1.dy * l2.dx
    const s = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / cross
    return { x: l1.px + s * l1.dx, y: l1.py + s * l1.dy }
  })
}

/** Plan-Polygon (x, y nach unten) → Extrusion nach oben (Y) mit Höhe h ab deckY. */
function extrudeXZ(pts: Pt[], holes: Pt[][], h: number, deckY: number, mat: THREE.Material): THREE.Mesh {
  // Shape in (x, -y): nach rotateX(-90°) liegt y wieder als +z im Plan
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.y)))
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, -p.y))))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, deckY, 0)
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

const FOREX_THICKNESS_MM = 5
const FOREX_PRINT_TEXTURES = new Map<string, THREE.Texture>()
const FOREX_EDGE = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 })

function midKey(x: number, y: number): string {
  return `${Math.round(x * 100)}|${Math.round(y * 100)}`
}

/** Forex-Platte direkt vor der Kante, vom Boden bis 1 cm unter Belag-Oberkante, Druck nach außen. */
function buildForexPanel(
  e: { a: Pt; b: Pt; nx: number; ny: number; length: number },
  heightM: number,
  thicknessMm: number,
  print: string | undefined,
): THREE.Mesh {
  const h = Math.max(heightM - 0.01, 0.05)
  const t = thicknessMm / 1000
  let map: THREE.Texture | undefined
  if (print) {
    map = FOREX_PRINT_TEXTURES.get(print)
    if (!map) {
      map = new THREE.TextureLoader().load(print)
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = 8
      FOREX_PRINT_TEXTURES.set(print, map)
    }
  }
  const front = new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : '#f8fafc', map, roughness: 0.5 })
  // Box-Flächen: +x, -x, +y, -y, +z (außen, bedruckt), -z
  const m = new THREE.Mesh(new THREE.BoxGeometry(e.length - 0.004, h, t), [FOREX_EDGE, FOREX_EDGE, FOREX_EDGE, FOREX_EDGE, front, FOREX_EDGE])
  const off = MOLTON_OFFSET_M + t / 2
  m.position.set((e.a.x + e.b.x) / 2 + e.nx * off, h / 2, (e.a.y + e.b.y) / 2 + e.ny * off)
  // lokales +z soll entlang der Außennormale (nx, ny) zeigen
  m.rotation.y = Math.atan2(e.nx, e.ny)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * Baut das Podest im lokalen Koordinatensystem des Objekts (Meter, x rechts, z = Plan-y).
 * `heightM` = Oberkante Belag über Boden. `moltonColor` = Behang an freien Außenkanten (null = keiner).
 * `forex` = bedruckte Forex-Blenden an einzelnen Kanten; dort entfällt der Molton.
 */
export function buildNivtecDeck(
  pieces: Piece2D[],
  heightM: number,
  moltonColor: string | null,
  forex?: { panels: ForexPanel[]; prints?: Record<string, string> },
): THREE.Group {
  const g = new THREE.Group()
  const forexMidpoints = new Set<string>()
  for (const panel of forex?.panels ?? []) {
    const e = forexEdge(pieces, panel)
    if (!e) continue
    forexMidpoints.add(midKey((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2))
    g.add(buildForexPanel(e, heightM, panel.thicknessMm ?? FOREX_THICKNESS_MM, forex?.prints?.[panel.id]))
  }
  const deckY = Math.max(heightM - PANEL_THICKNESS_M, 0.02)
  const polys = pieces.map(piecePolygon)

  polys.forEach((poly) => {
    const outer = insetPolygon(poly, PANEL_GAP_M / 2)
    const inner = insetPolygon(outer, FRAME_WIDTH_M)
    g.add(extrudeXZ(outer, [inner], PANEL_THICKNESS_M, deckY, FRAME_MATERIAL))
    // UVs der Extrusion liegen in Metern → eine Kachel je HEX_TILE_M
    const mat = infillMaterial(1 / HEX_TILE_M, 1 / HEX_TILE_M)
    g.add(extrudeXZ(inner, [], PANEL_THICKNESS_M - INFILL_RECESS_M, deckY, mat))
  })

  // Füße: an jeder Plattenecke, doppelte Ecken (Nachbarplatten) nur einmal
  const feet = new Map<string, Pt>()
  for (const poly of polys) {
    for (const p of insetPolygon(poly, 0.08)) feet.set(`${Math.round(p.x * 10)}|${Math.round(p.y * 10)}`, p)
  }
  const legH = Math.max(deckY, 0.01)
  const legGeo = new THREE.CylinderGeometry(FOOT_RADIUS_M, FOOT_RADIUS_M, legH, 12)
  const plateGeo = new THREE.CylinderGeometry(FOOT_PLATE_RADIUS_M * 0.95, FOOT_PLATE_RADIUS_M, 0.008, 24)
  for (const p of feet.values()) {
    const leg = new THREE.Mesh(legGeo, GALVANIZED)
    leg.position.set(p.x, legH / 2, p.y)
    leg.castShadow = true
    g.add(leg)
    const plate = new THREE.Mesh(plateGeo, GALVANIZED)
    plate.position.set(p.x, 0.004, p.y)
    g.add(plate)
  }

  // Molton an allen Außenkanten: eine Kante ist innen, wenn direkt daneben eine andere Platte liegt
  if (moltonColor) {
    const molton = new THREE.MeshStandardMaterial({ color: moltonColor, roughness: 1, side: THREE.DoubleSide })
    polys.forEach((poly, pi) => {
      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length
      const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]
        const b = poly[(i + 1) % poly.length]
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        let nx = -(b.y - a.y) / len
        let ny = (b.x - a.x) / len
        const mx = (a.x + b.x) / 2
        const my = (a.y + b.y) / 2
        if (nx * (cx - mx) + ny * (cy - my) > 0) {
          nx = -nx
          ny = -ny
        }
        if (forexMidpoints.has(midKey(mx, my))) continue
        const probe = { x: mx + nx * 0.05, y: my + ny * 0.05 }
        if (polys.some((other, oi) => oi !== pi && pointInPolygon(probe, other))) continue
        const h = deckY
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), molton)
        m.position.set(mx + nx * MOLTON_OFFSET_M, h / 2, my + ny * MOLTON_OFFSET_M)
        m.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x)
        m.receiveShadow = true
        g.add(m)
      }
    })
  }
  return g
}
