import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useEventStore } from '../store/store'
import type { EventItem, ItemType, PhaseData } from '../types'
import { DEFAULT_PIXELS_PER_METER, POWER_PLAN_NATIVE_PIXELS_PER_METER } from '../utils/scale'
import { getDefaultColor } from '../utils/itemColors'
import { worldCenter } from '../utils/geometry'
import { buildNivtecDeck } from './nivtec3d'
import { MODELS } from './models3d'
import { COLUMNS_PX, DOORS_PX, GLASS_SEGMENTS_PX, MAIN_CURTAIN_PX, PARTITIONS_PX, STAGE_PX, VENUE, WALL_SEGMENTS_PX } from '../data/venue3d'
import { island, islandBtn } from '../utils/ui'
import { itemLevel, type Level } from '../utils/levels'
import { OG_ELEVATION_M, OG_FOOTPRINT, OG_SLAB_THICKNESS_M, OG_VOIDS, OG_WALL_HEIGHT_M, OG_WALLS, subtractRects } from '../data/venueOG'

/** Plan-Abmessungen in Metern (Stromplan 1755×1240px bei 23,6px/m). */
const PLAN_W = 1755 / POWER_PLAN_NATIVE_PIXELS_PER_METER
const PLAN_D = 1240 / POWER_PLAN_NATIVE_PIXELS_PER_METER
const PX = DEFAULT_PIXELS_PER_METER
const EYE_HEIGHT = 1.65
/** Standpunkt „Augenhöhe“: hinten im großen Saal (x in Metern, nahe der rechten Saalwand). */
const VIEW_FROM_BACK_X = 1340 / POWER_PLAN_NATIVE_PIXELS_PER_METER

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
 * Visiova V55 Systemrahmen: gelochtes Alu-Profil (55 mm tief), optional einseitig bespannter Druck
 * (Vorderseite = Plan-„unten“, also +z lokal), Rückseite offen/weiß, Bodenplatten.
 * Lokaler Ursprung = linke vordere Ecke wie in 2D.
 */
function buildVisiovaFrame(
  w: number,
  h: number,
  print: string | undefined,
  aluColor: string,
  /** Ausschnitt des Drucks für diesen Rahmen (Anteil der Wandbreite), damit ein Druck über alle Rahmen läuft */
  uStart = 0,
  uLen = 1,
): THREE.Group {
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
  // Ohne Druck ist der Rahmen offen (nur Profil); mit Druck: Textil mit Keder über die Front,
  // Rückseite weiß (einseitig bedruckt)
  if (map) {
    let part = map
    if (uLen < 1) {
      part = map.clone()
      part.repeat.set(uLen, 1)
      part.offset.set(uStart, 0)
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.006, h - 0.006), new THREE.MeshStandardMaterial({ map: part, roughness: 0.9 }))
    front.position.set(w / 2, lift + h / 2, D + 0.002)
    g.add(front)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * F, h - 2 * F), new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.9 }))
    back.rotation.y = Math.PI
    back.position.set(w / 2, lift + h / 2, 0.01)
    g.add(back)
  }
  // Bodenplatten an beiden Enden
  for (const x of [F / 2, w - F / 2]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, lift, 0.4), plain)
    plate.position.set(x, lift / 2, D / 2)
    plate.receiveShadow = true
    g.add(plate)
  }
  return g
}

/** Standardfarben in 3D, wo die 2D-Farbe nicht passt (Stühle schwarz wie im Saal, Vorhang wie der Bühnenvorhang). */
const DEFAULT_3D_COLOR: Partial<Record<ItemType, string>> = {
  chair: '#1f2937',
  chair_row_group: '#1f2937',
  curtain: VENUE.curtainColor,
}

/** Objekt steht auf der festen Bühne (Mittelpunkt innerhalb der Bühnenfläche) → auf Bühnenhöhe stellen. */
function isOnStage(item: EventItem, pd: PhaseData): boolean {
  const c = worldCenter(item, pd, PX)
  const x = c.x / PX
  const z = c.y / PX
  return (
    x >= STAGE_PX.x / NP && x <= (STAGE_PX.x + STAGE_PX.w) / NP && z >= STAGE_PX.y / NP && z <= (STAGE_PX.y + STAGE_PX.h) / NP
  )
}

/** Ein Objekt als 3D-Modell; lokaler Ursprung = Konva-Ursprung (oben links bzw. Mitte bei runden). */
function buildItem(item: EventItem, pd: PhaseData): THREE.Object3D | null {
  if (item.type === 'text_label') return null
  const g = new THREE.Group()
  g.position.set(pd.x / PX, 0, pd.y / PX)
  g.rotation.y = -(pd.rotation * Math.PI) / 180
  if (itemLevel(item) === 'og') g.position.y = OG_ELEVATION_M
  else if (item.type !== 'truss' && isOnStage(item, pd)) g.position.y = VENUE.stageHeight
  const color = item.color || DEFAULT_3D_COLOR[item.type] || getDefaultColor(item.type)
  const w = item.width

  switch (item.type) {
    case 'visiova_frame': {
      // Wand aus mehreren Rahmen nebeneinander; ein Druck läuft über die ganze Wand
      const frames = item.visiovaFrames?.length ? item.visiovaFrames : [w]
      const total = frames.reduce((s, x) => s + x, 0)
      let at = 0
      for (const fw of frames) {
        const f = buildVisiovaFrame(fw, item.frameHeight ?? 2.48, item.printImage, item.color || VISIOVA_ALU, at / total, fw / total)
        f.position.x = at
        g.add(f)
        at += fw
      }
      break
    }
    case 'nivtec_group': {
      const heightM = (item.nivtecData?.heightCm ?? 40) / 100
      // Objektfarbe = Molton rundherum; ohne gesetzte Farbe kein Behang
      g.add(
        buildNivtecDeck(item.nivtecData?.pieces ?? [], heightM, item.color ?? null, {
          panels: item.nivtecData?.forexPanels ?? [],
          prints: item.forexPrints,
        }),
      )
      break
    }
    default: {
      const model = MODELS[item.type]
      g.add(model ? model(item, color) : box(w, 1, item.height, w / 2, 0.5, item.height / 2, color))
    }
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

/** Feste Bauteile: Wände (unten Holz, oben weiß) mit Türöffnungen. Bühne und Säulen stehen in `buildStageAndColumns`. */
function buildVenue(): THREE.Group {
  const g = new THREE.Group()
  // Oberer, weißer Wandteil separat, damit er sich ausblenden lässt (Blick in die Räume)
  const upper = new THREE.Group()
  upper.name = 'upperWalls'
  g.add(upper)
  const t = VENUE.wallThickness
  for (const seg of WALL_SEGMENTS_PX) {
    // Unterhalb der Türhöhe nur die geschlossenen Abschnitte, darüber durchgehend
    for (const [a, b] of solidParts(seg)) {
      g.add(segmentBox(subSegment(seg, a, b), 0, VENUE.doorHeight, t, VENUE.woodColor))
    }
    g.add(segmentBox(seg, VENUE.doorHeight, VENUE.woodPanelHeight, t, VENUE.woodColor))
    upper.add(segmentBox(seg, VENUE.woodPanelHeight, VENUE.wallHeight, t, VENUE.upperWallColor))
  }
  // Glasfassaden (Terrasse, Foyer): Scheiben mit Türöffnungen, darüber weiße Wand
  const glass = new THREE.MeshStandardMaterial({ color: '#bcd7e6', transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1, depthWrite: false })
  for (const seg of GLASS_SEGMENTS_PX) {
    for (const [a, b] of solidParts(seg)) {
      const m = segmentBox(subSegment(seg, a, b), 0, VENUE.glassHeight, 0.04, '#ffffff')
      m.material = glass
      m.castShadow = false
      g.add(m)
    }
    upper.add(segmentBox(seg, VENUE.glassHeight, VENUE.wallHeight, t, VENUE.upperWallColor))
  }
  return g
}

/** Feste Bühne und Säulen; eigene Gruppe, damit sie beim Ausblenden der Wände stehen bleiben. */
function buildStageAndColumns(): THREE.Group {
  const g = new THREE.Group()
  // Feste Säulen (Foyer)
  for (const [cx, cy, dPx] of COLUMNS_PX) {
    const r = dPx / NP / 2
    const col = new THREE.Mesh(new THREE.CylinderGeometry(r, r, VENUE.wallHeight, 24), new THREE.MeshStandardMaterial({ color: VENUE.columnColor, roughness: 0.7 }))
    col.position.set(cx / NP, VENUE.wallHeight / 2, cy / NP)
    col.castShadow = true
    col.receiveShadow = true
    g.add(col)
  }
  const st = { x: STAGE_PX.x / NP, z: STAGE_PX.y / NP, w: STAGE_PX.w / NP, d: STAGE_PX.h / NP }
  g.add(box(st.w, VENUE.stageHeight, st.d, st.x + st.w / 2, VENUE.stageHeight / 2, st.z + st.d / 2, VENUE.stageColor))
  return g
}

/** Obergeschoss: Wände aus dem Werkplan und der Boden (Grundfläche ohne die Lufträume Saal, Bühne, Foyer). */
function buildOG(): { walls: THREE.Group; slab: THREE.Group } {
  const walls = new THREE.Group()
  for (const [x, z, w, d] of OG_WALLS) {
    walls.add(box(w, OG_WALL_HEIGHT_M, d, x + w / 2, OG_ELEVATION_M + OG_WALL_HEIGHT_M / 2, z + d / 2, VENUE.upperWallColor))
  }
  const slab = new THREE.Group()
  const cuts = OG_VOIDS.map((v) => v.rect)
  for (const base of OG_FOOTPRINT) {
    for (const [x0, z0, x1, z1] of subtractRects(base, cuts)) {
      slab.add(box(x1 - x0, OG_SLAB_THICKNESS_M, z1 - z0, (x0 + x1) / 2, OG_ELEVATION_M - OG_SLAB_THICKNESS_M / 2, (z0 + z1) / 2, '#d6d3d1'))
    }
  }
  return { walls, slab }
}

/** Mobile Trennwände im Saal (Holzoptik, volle Höhe). */
function buildPartitions(): THREE.Group {
  const g = new THREE.Group()
  for (const seg of PARTITIONS_PX) g.add(segmentBox(seg, 0, VENUE.wallHeight - 0.3, 0.12, VENUE.woodColor))
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

/** Zuletzt benutzte Kamera (pro Browser; bleibt auch nach Neuladen erhalten). */
interface SavedView {
  position: number[]
  target: number[]
}
const VIEW_STORAGE_KEY = 'stadthalle-3d-view'
let lastViewMemory: SavedView | null = null

function loadLastView(): SavedView | null {
  if (lastViewMemory) return lastViewMemory
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY)
    const v = raw ? (JSON.parse(raw) as SavedView) : null
    if (v && v.position?.length === 3 && v.target?.length === 3) lastViewMemory = v
  } catch {
    // Speicher nicht verfügbar – dann Standardansicht
  }
  return lastViewMemory
}

function saveLastView(camera: THREE.Camera, controls: OrbitControls) {
  lastViewMemory = { position: camera.position.toArray(), target: controls.target.toArray() }
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(lastViewMemory))
  } catch {
    // ignorieren
  }
}

/** Beschriftete Gruppe im 3D-Bedienpanel. */
function Group3D({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink3">{label}</div>
      {children}
    </div>
  )
}

/** Auswahl genau einer Möglichkeit: die gewählte ist weiß hinterlegt und fett. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string; title?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 p-0.5 rounded-lg bg-black/[0.07]">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`flex-1 h-8 rounded-md text-[12px] transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              active ? 'bg-white text-ink font-semibold shadow-sm' : 'text-ink2 hover:text-ink font-medium'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Ein-/Ausschalter mit sichtbarem Zustand (Schalter links Aus, rechts An). */
function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
  title,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between h-8 px-1 rounded-md text-[12px] font-medium text-ink select-none hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <span>{label}</span>
      <span className={`relative w-8 h-[18px] rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-black/25'}`}>
        <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[14px]' : ''}`} />
      </span>
    </button>
  )
}

interface Props {
  onClose: () => void
  /** Geschoss, das beim Öffnen gezeigt wird (das gerade bearbeitete). */
  initialLevel?: Level
}

/** Schlichte 3D-Ansicht der aktuellen Phase: Grundriss am Boden, Objekte als Blöcke mit typischer Höhe. */
export default function Venue3D({ onClose, initialLevel = 'eg' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{ items: THREE.Group; walls: THREE.Group; curtain: THREE.Group; partitions: THREE.Group; upperWalls: THREE.Object3D | undefined; stage: THREE.Group; ogWalls: THREE.Group; ogSlab: THREE.Group; sun: THREE.DirectionalLight; camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null)
  const items = useEventStore((s) => s.items)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const phaseName = useEventStore((s) => s.phases.find((p) => p.id === s.currentPhaseId)?.name ?? '')
  const hideCodes = useEventStore((s) => !!s.layers.hideCodes)
  const [eye, setEye] = useState(false)
  // Klick auf Übersicht/Augenhöhe: Standardansicht statt gemerkter Ansicht (auch bei erneutem Klick)
  const [viewNonce, setViewNonce] = useState(0)
  const viewRequested = useRef(false)
  const requestView = (eyeView: boolean) => {
    viewRequested.current = true
    setEye(eyeView)
    setViewNonce((n) => n + 1)
  }
  const [showWalls, setShowWalls] = useState(true)
  const [levelView, setLevelView] = useState<'eg' | 'og' | 'both'>(initialLevel)
  const [curtainOpen, setCurtainOpen] = useState(false)
  const [showPartitions, setShowPartitions] = useState(false)
  const [shadows, setShadows] = useState(true)
  const [showUpperWalls, setShowUpperWalls] = useState(true)

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
    const stageGroup = buildStageAndColumns()
    scene.add(stageGroup)
    const og = buildOG()
    scene.add(og.walls, og.slab)
    const curtainGroup = new THREE.Group()
    scene.add(curtainGroup)
    const partitionGroup = buildPartitions()
    partitionGroup.visible = false
    scene.add(partitionGroup)

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 500)
    const controls = new OrbitControls(camera, renderer.domElement)
    // Jede Kamerabewegung merken, damit die 3D-Ansicht beim nächsten Öffnen dort weitermacht
    controls.addEventListener('end', () => saveLastView(camera, controls))
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    sceneRef.current = { items: itemGroup, walls: wallGroup, curtain: curtainGroup, partitions: partitionGroup, upperWalls: wallGroup.getObjectByName('upperWalls'), stage: stageGroup, ogWalls: og.walls, ogSlab: og.slab, sun, camera, controls }

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
      saveLastView(camera, controls)
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
    // Geometrien/Materialien der Modelle sind geteilt; nur die Instanz-Puffer der Stuhlreihen freigeben
    s.items.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose()
    })
    s.items.clear()
    for (const item of Object.values(items)) {
      const pd = item.phaseData[currentPhaseId]
      if (!pd?.visible) continue
      if (levelView !== 'both' && itemLevel(item) !== levelView) continue
      const obj = buildItem(item, pd)
      if (obj) s.items.add(obj)
    }
  }, [items, currentPhaseId, hideCodes, levelView])

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
    if (sceneRef.current) sceneRef.current.partitions.visible = showPartitions && levelView !== 'og'
  }, [showPartitions, levelView, hideCodes])

  // Schatten der Sonne an/aus (Schattenkarte bleibt aktiv, nur die Lichtquelle wirft keinen mehr)
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.sun.castShadow = shadows
  }, [shadows, hideCodes])

  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    const eg = levelView !== 'og'
    const og = levelView !== 'eg'
    s.walls.visible = showWalls && eg
    s.stage.visible = eg
    s.curtain.visible = eg
    s.ogWalls.visible = showWalls && og
    s.ogSlab.visible = og
    // Im Doppelbild stehen die EG-Wände nur bis zum Boden des OG, den Rest übernehmen die OG-Wände
    if (s.upperWalls) s.upperWalls.visible = showUpperWalls && levelView === 'eg'
  }, [showWalls, showUpperWalls, levelView, hideCodes])

  // Kamera: zuletzt benutzte Ansicht wiederherstellen; nach Klick auf Übersicht/Augenhöhe deren Standard
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    const last = viewRequested.current ? null : loadLastView()
    if (last) {
      s.camera.position.fromArray(last.position)
      s.controls.target.fromArray(last.target)
      s.controls.update()
      return
    }
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
  }, [eye, viewNonce, hideCodes, items, currentPhaseId])

  return (
    <div className="absolute inset-0 z-40" style={{ background: VENUE.background }}>
      <div ref={mountRef} className="absolute inset-0" />
      <div className={`absolute top-4 left-4 w-[236px] flex flex-col gap-3 p-3 rounded-2xl ${island}`}>
        <div className="text-xs font-semibold text-ink">3D · {phaseName}</div>
        <Group3D label="Kamera">
          <Segmented
            label="Kamera"
            value={eye ? 'eye' : 'overview'}
            options={[
              { id: 'overview', label: 'Übersicht' },
              { id: 'eye', label: 'Augenhöhe' },
            ]}
            onChange={(v) => requestView(v === 'eye')}
          />
        </Group3D>
        <Group3D label="Geschoss">
          <Segmented
            label="Geschoss"
            value={levelView}
            options={[
              { id: 'eg', label: 'EG', title: 'Nur Erdgeschoss' },
              { id: 'og', label: 'OG', title: 'Nur Obergeschoss' },
              { id: 'both', label: 'Beide', title: 'Erdgeschoss und Obergeschoss übereinander' },
            ]}
            onChange={setLevelView}
          />
        </Group3D>
        <Group3D label="Anzeigen">
          <SwitchRow label="Wände" checked={showWalls} onChange={setShowWalls} />
          <SwitchRow
            label="Obere Wände"
            checked={showUpperWalls}
            onChange={setShowUpperWalls}
            disabled={!showWalls || levelView !== 'eg'}
            title={levelView !== 'eg' ? 'Nur in der reinen EG-Ansicht (im Doppelbild stehen die EG-Wände bis zum OG-Boden)' : 'Oberen, weißen Teil der Wände ein-/ausblenden'}
          />
          <SwitchRow
            label="Trennwände"
            checked={showPartitions}
            onChange={setShowPartitions}
            disabled={levelView === 'og'}
            title="Mobile Trennwände im großen Saal (teilen ihn in drei Teile)"
          />
          <SwitchRow label="Vorhang offen" checked={curtainOpen} onChange={setCurtainOpen} disabled={levelView === 'og'} title="Hauptvorhang der Bühne" />
          <SwitchRow label="Schatten" checked={shadows} onChange={setShadows} />
        </Group3D>
      </div>
      <button onClick={onClose} className={`absolute top-4 right-4 ${islandBtn('plain', 'h-10 px-3.5 text-[13px] font-semibold')} ${island}`}>
        ✕ Zurück zu 2D
      </button>
      <div className={`absolute bottom-4 left-4 px-3 py-2 rounded-xl text-[11px] text-ink3 ${island}`}>
        Ziehen: drehen · Rechtsklick/zwei Finger: verschieben · Scrollen: zoomen
      </div>
    </div>
  )
}
