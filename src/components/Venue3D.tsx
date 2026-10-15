import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useEventStore } from '../store/store'
import type { EventItem, ItemType, PhaseData } from '../types'
import { DEFAULT_PIXELS_PER_METER, POWER_PLAN_NATIVE_PIXELS_PER_METER } from '../utils/scale'
import { getDefaultColor } from '../utils/itemColors'
import { buildNivtecDeck } from './nivtec3d'
import { DOORS_PX, MAIN_CURTAIN_PX, STAGE_PX, VENUE, WALL_SEGMENTS_PX } from '../data/venue3d'
import { island, islandBtn } from '../utils/ui'

/** Plan-Abmessungen in Metern (Stromplan 1755×1240px bei 23,6px/m). */
const PLAN_W = 1755 / POWER_PLAN_NATIVE_PIXELS_PER_METER
const PLAN_D = 1240 / POWER_PLAN_NATIVE_PIXELS_PER_METER
const PX = DEFAULT_PIXELS_PER_METER
const EYE_HEIGHT = 1.65
/** Standpunkt „Augenhöhe“: hinten im großen Saal (x in Metern, nahe der rechten Saalwand). */
const VIEW_FROM_BACK_X = 1340 / POWER_PLAN_NATIVE_PIXELS_PER_METER

/** Typische Höhen in Metern — bewusst grob, es geht um Proportionen und Sichtlinien. */
const HEIGHTS: Partial<Record<ItemType, number>> = {
  table_round: 0.75,
  table_rect: 0.75,
  table_high: 1.1,
  table_low_round: 0.45,
  chair: 0.9,
  bar: 1.1,
  truss: 0.3,
  curtain: VENUE.woodPanelHeight,
  pipe_drape: 3,
  podium: 1.2,
  exhibition_stand: 2.5,
  sofa_3: 0.8,
  sofa_2: 0.8,
  sofa_corner: 0.8,
  armchair: 0.8,
  coat_rack: 1.8,
  plant: 1.5,
  screen: 3,
  custom_rect: 1,
  custom_round: 1,
}
/** Traversen hängen typischerweise über den Köpfen. */
const TRUSS_ELEVATION = 5

function mesh(geo: THREE.BufferGeometry, color: string, opacity = 1) {
  const mat = new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: 0.8 })
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = opacity === 1
  m.receiveShadow = true
  return m
}

function box(w: number, hgt: number, d: number, x: number, y: number, z: number, color: string, opacity = 1) {
  const m = mesh(new THREE.BoxGeometry(Math.max(w, 0.02), Math.max(hgt, 0.02), Math.max(d, 0.02)), color, opacity)
  m.position.set(x, y, z)
  return m
}

const VISIOVA_ALU = '#d4d6d8'
/** V55: 55 mm Profiltiefe; sichtbare Profilbreite geschätzt ca. 30 mm. Lochraster 62 mm (visiova.de). */
const VISIOVA_DEPTH_M = 0.055
const VISIOVA_FACE_M = 0.03
const VISIOVA_HOLE_PITCH_M = 0.062
const PRINT_TEXTURES = new Map<string, THREE.Texture>()

let holeCanvas: HTMLCanvasElement | null = null
/** Profilseite mit Lochreihe (ein Loch je Kachel); wird in Profil-Längsrichtung wiederholt. */
function holeTexture(lengthM: number): THREE.Texture {
  if (!holeCanvas) {
    holeCanvas = document.createElement('canvas')
    holeCanvas.width = 64
    holeCanvas.height = 64
    const ctx = holeCanvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = '#3f3f46'
    ctx.beginPath()
    ctx.arc(32, 32, 13, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(holeCanvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(lengthM / VISIOVA_HOLE_PITCH_M, 1)
  return t
}

/**
 * Visiova V55 Systemrahmen: gelochtes Alu-Profil (55 mm tief), einseitig bespannter Druck
 * (Vorderseite = Plan-„unten“, also +z lokal), Rückseite offen/weiß, Bodenplatten.
 * Lokaler Ursprung = linke vordere Ecke wie in 2D.
 */
function buildVisiovaFrame(w: number, h: number, print: string | undefined, aluColor: string): THREE.Group {
  const g = new THREE.Group()
  const F = VISIOVA_FACE_M
  const D = VISIOVA_DEPTH_M
  const lift = 0.01 // Bodenplatte
  const plain = new THREE.MeshStandardMaterial({ color: aluColor, metalness: 0.8, roughness: 0.35 })
  /** Profilstab: Seitenflächen (Tiefe) mit Lochreihe, Vorder-/Rückkante glatt. */
  const bar = (len: number, horizontal: boolean, x: number, y: number) => {
    const holed = new THREE.MeshStandardMaterial({ color: aluColor, metalness: 0.7, roughness: 0.4, map: holeTexture(len) })
    if (!horizontal) holed.map!.rotation = Math.PI / 2
    const geo = horizontal ? new THREE.BoxGeometry(len, F, D) : new THREE.BoxGeometry(F, len, D)
    // Box-Flächen: +x, -x, +y, -y, +z, -z → Lochreihe auf den Flächen quer zur Rahmenebene
    const mats = horizontal ? [plain, plain, holed, holed, plain, plain] : [holed, holed, plain, plain, plain, plain]
    const m = new THREE.Mesh(geo, mats)
    m.position.set(x, y, D / 2)
    m.castShadow = true
    g.add(m)
  }
  bar(w, true, w / 2, lift + h - F / 2)
  bar(w, true, w / 2, lift + F / 2)
  bar(h - 2 * F, false, F / 2, lift + h / 2)
  bar(h - 2 * F, false, w - F / 2, lift + h / 2)
  let map: THREE.Texture | undefined
  if (print) {
    map = PRINT_TEXTURES.get(print)
    if (!map) {
      map = new THREE.TextureLoader().load(print)
      map.colorSpace = THREE.SRGBColorSpace
      map.anisotropy = 8
      PRINT_TEXTURES.set(print, map)
    }
  }
  // Textildruck mit Keder: bedeckt die Rahmenfront bis auf einen schmalen Rand
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.006, h - 0.006),
    new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : '#f3f4f6', map, roughness: 0.9 }),
  )
  front.position.set(w / 2, lift + h / 2, D + 0.002)
  g.add(front)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * F, h - 2 * F), new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.9 }))
  back.rotation.y = Math.PI
  back.position.set(w / 2, lift + h / 2, 0.01)
  g.add(back)
  // Bodenplatten an beiden Enden
  for (const x of [F / 2, w - F / 2]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, lift, 0.4), plain)
    plate.position.set(x, lift / 2, D / 2)
    plate.receiveShadow = true
    g.add(plate)
  }
  return g
}

/** Stuhlfarbe wie im Saal (schwarze Bankettstühle mit Chromgestell). */
const CHAIR_COLOR = '#1f2937'
const CHROME = new THREE.MeshStandardMaterial({ color: '#c0c4c8', metalness: 0.9, roughness: 0.3 })

/** Einzelner Stuhl (ca. 45 × 45 cm), Lehne hinten (+z), Mittelpunkt im Ursprung. */
function buildChair(color: string): THREE.Group {
  const c = new THREE.Group()
  c.add(box(0.44, 0.05, 0.42, 0, 0.46, 0, color))
  c.add(box(0.44, 0.42, 0.04, 0, 0.74, 0.2, color))
  const leg = new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6)
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    const m = new THREE.Mesh(leg, CHROME)
    m.position.set(x, 0.225, z)
    c.add(m)
  }
  return c
}

/** Ein Objekt als einfache Geometrie; lokaler Ursprung = Konva-Ursprung (oben links bzw. Mitte bei runden). */
function buildItem(item: EventItem, pd: PhaseData): THREE.Object3D | null {
  if (item.type === 'text_label') return null
  const g = new THREE.Group()
  g.position.set(pd.x / PX, 0, pd.y / PX)
  g.rotation.y = -(pd.rotation * Math.PI) / 180
  const color = item.color || getDefaultColor(item.type)
  const w = item.width
  const d = item.height
  const hgt = HEIGHTS[item.type] ?? 1

  switch (item.type) {
    case 'table_round':
    case 'table_high':
    case 'custom_round': {
      const r = w / 2
      g.add(mesh(new THREE.CylinderGeometry(r, r, 0.04, 32), color).translateY(hgt - 0.02))
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, hgt, 8), '#6b7280').translateY(hgt / 2))
      break
    }
    case 'area':
      g.add(box(w, 0.02, d, w / 2, 0.01, d / 2, color, 0.45))
      break
    case 'visiova_frame':
      g.add(buildVisiovaFrame(w, item.frameHeight ?? 2.48, item.printImage, item.color || VISIOVA_ALU))
      break
    case 'curtain':
      g.add(box(w, hgt, 0.08, w / 2, hgt / 2, 0, item.color || VENUE.curtainColor))
      break
    case 'truss':
      g.add(box(w, Math.min(d, 0.4), d, w / 2, TRUSS_ELEVATION, d / 2, '#9ca3af'))
      break
    case 'screen':
      // Leinwand: dünne Fläche, Unterkante auf 1 m
      g.add(box(w, hgt - 1, Math.min(d, 0.1), w / 2, 1 + (hgt - 1) / 2, d / 2, '#f9fafb'))
      g.add(box(0.05, 1, 0.05, 0.1, 0.5, d / 2, '#374151'))
      g.add(box(0.05, 1, 0.05, w - 0.1, 0.5, d / 2, '#374151'))
      break
    case 'chair_row_group': {
      const grid = item.grid
      if (!grid) break
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) {
          const chair = buildChair(item.color || CHAIR_COLOR)
          chair.position.set((c + 0.5) * grid.spacingM, 0, (r + 0.5) * grid.spacingM)
          g.add(chair)
        }
      }
      break
    }
    case 'chair': {
      const chair = buildChair(item.color || CHAIR_COLOR)
      chair.position.set(w / 2, 0, d / 2)
      g.add(chair)
      break
    }
    case 'nivtec_group': {
      const heightM = (item.nivtecData?.heightCm ?? 40) / 100
      // Objektfarbe = Molton rundherum; ohne gesetzte Farbe kein Behang
      g.add(buildNivtecDeck(item.nivtecData?.pieces ?? [], heightM, item.color ?? null))
      break
    }
    default:
      g.add(box(w, hgt, d, w / 2, hgt / 2, d / 2, color))
  }
  return g
}

const NP = POWER_PLAN_NATIVE_PIXELS_PER_METER

/** Wand-Strecke als Quader zwischen zwei Plan-Punkten (in Metern), von y0 bis y1 hoch. */
function segmentBox(seg: [number, number, number, number], y0: number, y1: number, thickness: number, color: string) {
  const [x1, z1, x2, z2] = seg.map((v) => v / NP)
  const len = Math.hypot(x2 - x1, z2 - z1)
  const m = box(len + thickness, y1 - y0, thickness, (x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2, color)
  m.rotation.y = -Math.atan2(z2 - z1, x2 - x1)
  return m
}

/** Abschnitte [von, bis] (in px entlang der Strecke) ohne die Türöffnungen, die auf ihr liegen. */
function solidParts(seg: [number, number, number, number]): [number, number][] {
  const [x1, y1, x2, y2] = seg
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const gaps = DOORS_PX.map(([dx, dy, w]) => {
    const t = (dx - x1) * ux + (dy - y1) * uy
    const off = Math.abs((dx - x1) * uy - (dy - y1) * ux)
    return off < 8 && t > 0 && t < len ? ([t - w / 2, t + w / 2] as [number, number]) : null
  })
    .filter((g): g is [number, number] => g !== null)
    .sort((a, b) => a[0] - b[0])
  const parts: [number, number][] = []
  let from = 0
  for (const [a, b] of gaps) {
    if (a > from) parts.push([from, a])
    from = Math.max(from, b)
  }
  if (from < len) parts.push([from, len])
  return parts
}

/** Teilstrecke von t0 bis t1 (px) einer Wand-Strecke. */
function subSegment(seg: [number, number, number, number], t0: number, t1: number): [number, number, number, number] {
  const [x1, y1, x2, y2] = seg
  const len = Math.hypot(x2 - x1, y2 - y1)
  const p = (t: number): [number, number] => [x1 + ((x2 - x1) * t) / len, y1 + ((y2 - y1) * t) / len]
  return [...p(t0), ...p(t1)]
}

/** Feste Bauteile: Wände (unten Holz, oben weiß) mit Türöffnungen, Bühnenpodest. */
function buildVenue(): THREE.Group {
  const g = new THREE.Group()
  const t = VENUE.wallThickness
  for (const seg of WALL_SEGMENTS_PX) {
    // Unterhalb der Türhöhe nur die geschlossenen Abschnitte, darüber durchgehend
    for (const [a, b] of solidParts(seg)) {
      g.add(segmentBox(subSegment(seg, a, b), 0, VENUE.doorHeight, t, VENUE.woodColor))
    }
    g.add(segmentBox(seg, VENUE.doorHeight, VENUE.woodPanelHeight, t, VENUE.woodColor))
    g.add(segmentBox(seg, VENUE.woodPanelHeight, VENUE.wallHeight, t, VENUE.upperWallColor))
  }
  const st = { x: STAGE_PX.x / NP, z: STAGE_PX.y / NP, w: STAGE_PX.w / NP, d: STAGE_PX.h / NP }
  g.add(box(st.w, VENUE.stageHeight, st.d, st.x + st.w / 2, VENUE.stageHeight / 2, st.z + st.d / 2, VENUE.stageColor))
  return g
}

/** Hauptvorhang als zwei Hälften; `open` 0 = zu, 1 = ganz offen (zur Seite gerafft). */
function buildCurtain(open: number): THREE.Group {
  const g = new THREE.Group()
  const [x1, z1, x2, z2] = MAIN_CURTAIN_PX.map((v) => v / NP)
  const len = Math.hypot(x2 - x1, z2 - z1)
  const half = len / 2
  const halfW = half * (1 - 0.8 * open) // gerafft bleiben ca. 20 % der Breite stehen
  const h = VENUE.curtainHeight - VENUE.stageHeight
  const angle = -Math.atan2(z2 - z1, x2 - x1)
  for (const side of [0, 1]) {
    // Hälfte hängt am jeweiligen Ende und wird zur Mitte hin zugezogen
    const centerT = side === 0 ? halfW / 2 : len - halfW / 2
    const m = box(halfW, h, 0.12 + 0.2 * open, x1 + ((x2 - x1) * centerT) / len, VENUE.stageHeight + h / 2, z1 + ((z2 - z1) * centerT) / len, VENUE.curtainColor)
    m.rotation.y = angle
    g.add(m)
  }
  return g
}

interface Props {
  onClose: () => void
}

/** Schlichte 3D-Ansicht der aktuellen Phase: Grundriss am Boden, Objekte als Blöcke mit typischer Höhe. */
export default function Venue3D({ onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{ items: THREE.Group; walls: THREE.Group; curtain: THREE.Group; camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null)
  const items = useEventStore((s) => s.items)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const phaseName = useEventStore((s) => s.phases.find((p) => p.id === s.currentPhaseId)?.name ?? '')
  const hideCodes = useEventStore((s) => !!s.layers.hideCodes)
  const [eye, setEye] = useState(false)
  const [showWalls, setShowWalls] = useState(true)
  const [curtainOpen, setCurtainOpen] = useState(false)

  // Szene einmalig aufbauen
  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(VENUE.background)
    scene.add(new THREE.HemisphereLight('#ffffff', '#d1d5db', 2.2))
    const sun = new THREE.DirectionalLight('#ffffff', 1.2)
    sun.position.set(PLAN_W * 0.3, 40, PLAN_D * 0.2)
    sun.target.position.set(PLAN_W / 2, 0, PLAN_D / 2)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, far: 120 })
    scene.add(sun, sun.target)

    const floorTex = new THREE.TextureLoader().load(hideCodes ? '/plans/power-plan-simple-nolabels.png' : '/plans/power-plan-simple.png')
    floorTex.colorSpace = THREE.SRGBColorSpace
    floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(PLAN_W, PLAN_D), new THREE.MeshStandardMaterial({ map: floorTex }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(PLAN_W / 2, 0, PLAN_D / 2)
    floor.receiveShadow = true
    scene.add(floor)

    const itemGroup = new THREE.Group()
    scene.add(itemGroup)
    const wallGroup = new THREE.Group()
    scene.add(wallGroup)
    wallGroup.add(buildVenue())
    const curtainGroup = new THREE.Group()
    scene.add(curtainGroup)

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 500)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    sceneRef.current = { items: itemGroup, walls: wallGroup, curtain: curtainGroup, camera, controls }

    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [hideCodes])

  // Objekte der aktuellen Phase (neu) aufbauen
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    s.items.clear()
    for (const item of Object.values(items)) {
      const pd = item.phaseData[currentPhaseId]
      if (!pd?.visible) continue
      const obj = buildItem(item, pd)
      if (obj) s.items.add(obj)
    }
  }, [items, currentPhaseId, hideCodes])

  // Vorhang sanft auf-/zufahren (ca. 1,5 s)
  const curtainPos = useRef(0)
  useEffect(() => {
    const target = curtainOpen ? 1 : 0
    let raf = 0
    const step = () => {
      const s = sceneRef.current
      if (!s) return
      const diff = target - curtainPos.current
      curtainPos.current = Math.abs(diff) < 0.02 ? target : curtainPos.current + Math.sign(diff) * 0.02
      s.curtain.clear()
      s.curtain.add(buildCurtain(curtainPos.current))
      if (curtainPos.current !== target) raf = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(raf)
  }, [curtainOpen, hideCodes])

  useEffect(() => {
    if (sceneRef.current) sceneRef.current.walls.visible = showWalls
  }, [showWalls, hideCodes])

  // Kamera: Übersicht über die ganze Halle, oder Augenhöhe hinten im Saal mit Blick zur Bühne
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    const stageX = (STAGE_PX.x + STAGE_PX.w / 2) / NP
    const stageZ = (STAGE_PX.y + STAGE_PX.h / 2) / NP
    if (eye) {
      s.camera.position.set(VIEW_FROM_BACK_X, EYE_HEIGHT, stageZ)
      s.controls.target.set(stageX, EYE_HEIGHT, stageZ)
    } else {
      // Übersicht: auf die geplanten Objekte zielen, ohne Objekte die ganze Halle
      const bounds = new THREE.Box3().setFromObject(s.items)
      if (bounds.isEmpty()) {
        s.camera.position.set(PLAN_W * 0.55, 45, PLAN_D * 1.05)
        s.controls.target.set(PLAN_W * 0.5, 0, PLAN_D * 0.45)
      } else {
        const c = bounds.getCenter(new THREE.Vector3())
        // steil von oben, damit die ~7 m hohen Wände nicht davor stehen
        const size = Math.max(bounds.getSize(new THREE.Vector3()).length(), 10)
        s.camera.position.set(c.x + size * 0.25, VENUE.wallHeight + size * 0.9, c.z + size * 0.55)
        s.controls.target.set(c.x, 0, c.z)
      }
    }
    s.controls.update()
  }, [eye, hideCodes, items, currentPhaseId])

  return (
    <div className="absolute inset-0 z-40" style={{ background: VENUE.background }}>
      <div ref={mountRef} className="absolute inset-0" />
      <div className={`absolute top-4 left-4 flex items-center gap-2 p-1.5 pl-3 rounded-xl ${island}`}>
        <span className="text-xs font-semibold text-ink">3D · {phaseName}</span>
        <button onClick={() => setEye(false)} className={islandBtn(eye ? 'plain' : 'dark', 'h-8 px-2.5 text-[11px] font-medium')}>
          Übersicht
        </button>
        <button onClick={() => setEye(true)} className={islandBtn(eye ? 'dark' : 'plain', 'h-8 px-2.5 text-[11px] font-medium')}>
          Augenhöhe
        </button>
        <button onClick={() => setCurtainOpen((v) => !v)} className={islandBtn('plain', 'h-8 px-2.5 text-[11px] font-medium')}>
          {curtainOpen ? 'Vorhang zu' : 'Vorhang auf'}
        </button>
        <button onClick={() => setShowWalls((v) => !v)} className={islandBtn(showWalls ? 'dark' : 'plain', 'h-8 px-2.5 text-[11px] font-medium')}>
          Wände
        </button>
        <button onClick={onClose} className={islandBtn('plain', 'h-8 px-2.5 text-[11px] font-medium')}>
          ✕ Zurück zu 2D
        </button>
      </div>
      <div className={`absolute bottom-4 left-4 px-3 py-2 rounded-xl text-[11px] text-ink3 ${island}`}>
        Ziehen: drehen · Rechtsklick/zwei Finger: verschieben · Scrollen: zoomen
      </div>
    </div>
  )
}
