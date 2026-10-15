import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useEventStore } from '../store/store'
import type { EventItem, ItemType, PhaseData } from '../types'
import { DEFAULT_PIXELS_PER_METER, POWER_PLAN_NATIVE_PIXELS_PER_METER } from '../utils/scale'
import { getDefaultColor } from './EventItemShape'
import { MAIN_CURTAIN_PX, STAGE_PX, VENUE, WALL_SEGMENTS_PX } from '../data/venue3d'
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
          const cx = (c + 0.5) * grid.spacingM
          const cz = (r + 0.5) * grid.spacingM
          g.add(box(0.42, 0.45, 0.42, cx, 0.225, cz, color))
          g.add(box(0.42, 0.45, 0.05, cx, 0.675, cz + 0.19, color))
        }
      }
      break
    }
    case 'chair':
      g.add(box(w, 0.45, d, w / 2, 0.225, d / 2, color))
      g.add(box(w, 0.45, 0.05, w / 2, 0.675, d - 0.025, color))
      break
    case 'nivtec_group': {
      const ph = (item.nivtecData?.heightCm ?? 40) / 100
      for (const p of item.nivtecData?.pieces ?? []) {
        g.add(box(p.w, ph, p.d, p.x + p.w / 2, ph / 2, p.y + p.d / 2, item.color ?? '#1f2937'))
      }
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

/** Feste Bauteile: Wände (unten Holz, oben weiß), Bühnenpodest, Hauptvorhang. */
function buildVenue(): THREE.Group {
  const g = new THREE.Group()
  for (const seg of WALL_SEGMENTS_PX) {
    g.add(segmentBox(seg, 0, VENUE.woodPanelHeight, VENUE.wallThickness, VENUE.woodColor))
    g.add(segmentBox(seg, VENUE.woodPanelHeight, VENUE.wallHeight, VENUE.wallThickness, VENUE.upperWallColor))
  }
  const st = { x: STAGE_PX.x / NP, z: STAGE_PX.y / NP, w: STAGE_PX.w / NP, d: STAGE_PX.h / NP }
  g.add(box(st.w, VENUE.stageHeight, st.d, st.x + st.w / 2, VENUE.stageHeight / 2, st.z + st.d / 2, VENUE.stageColor))
  g.add(segmentBox(MAIN_CURTAIN_PX, VENUE.stageHeight, VENUE.curtainHeight, 0.1, VENUE.curtainColor))
  return g
}

interface Props {
  onClose: () => void
}

/** Schlichte 3D-Ansicht der aktuellen Phase: Grundriss am Boden, Objekte als Blöcke mit typischer Höhe. */
export default function Venue3D({ onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{ items: THREE.Group; walls: THREE.Group; camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null)
  const items = useEventStore((s) => s.items)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const phaseName = useEventStore((s) => s.phases.find((p) => p.id === s.currentPhaseId)?.name ?? '')
  const hideCodes = useEventStore((s) => !!s.layers.hideCodes)
  const [eye, setEye] = useState(false)
  const [showWalls, setShowWalls] = useState(true)

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

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 500)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    sceneRef.current = { items: itemGroup, walls: wallGroup, camera, controls }

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
      s.camera.position.set(PLAN_W * 0.55, 45, PLAN_D * 1.05)
      s.controls.target.set(PLAN_W * 0.5, 0, PLAN_D * 0.45)
    }
    s.controls.update()
  }, [eye, hideCodes])

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
