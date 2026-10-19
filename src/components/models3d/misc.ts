import * as THREE from 'three'
import type { EventItem } from '../../types'
import { box, boxEdges, cylinder, group, mat, shade, type ModelMap } from './common'

/** Höhe der Bodenfläche (1 cm, nur Markierung). */
const AREA_FLOOR_H = 0.01
/** Mittelpunkt der Bodenfläche über dem Boden. */
const AREA_FLOOR_Y = 0.006
/** Deckkraft der Bodenfläche. */
const AREA_FLOOR_OPACITY = 0.35
/** Höhe des Randes (2 cm). */
const AREA_EDGE_H = 0.02
/** Mittelpunkt des Randes über dem Boden. */
const AREA_EDGE_Y = 0.01
/** Breite des Randstreifens (4 cm). */
const AREA_EDGE_T = 0.04
/** Abstand der Randmitte vom äußeren Rand (2 cm). */
const AREA_EDGE_INSET = 0.02

/** Höhe der Beschriftung über dem Boden (knapp über dem Rand, gegen Z-Fighting). */
const AREA_LABEL_Y = 0.025
/** Auflösung der Beschriftungstextur in Pixel je Meter (Breite maximal AREA_LABEL_MAX_PX). */
const AREA_LABEL_PX_PER_M = 96
const AREA_LABEL_MAX_PX = 1024
/** Schrifthöhe in Anteilen der kurzen Seite, Anteil der langen Seite, den der Text höchstens belegt. */
const AREA_LABEL_HEIGHT_FRAC = 0.3
const AREA_LABEL_WIDTH_FRAC = 0.88

/** Höhe des Körpers bei custom_rect und custom_round (1 m). */
const CUSTOM_H = 1
/** Überstand des Deckelrandes über den Körper (5 mm). */
const CUSTOM_RIM_OVERHANG = 0.005
/** Höhe des Deckelrandes (2 cm). */
const CUSTOM_RIM_H = 0.02

const UNIT_PLANE = new THREE.PlaneGeometry(1, 1)
const LABEL_MATERIALS = new Map<string, THREE.MeshBasicMaterial>()

/** Beschriftungs-Material (Text auf transparentem Grund), je Text/Farbe/Maß geteilt wie die übrigen Materialien (Textur wird nie freigegeben). */
function areaLabelMaterial(text: string, color: string, long: number, short: number): THREE.MeshBasicMaterial {
  const key = `${text}|${color}|${long.toFixed(2)}|${short.toFixed(2)}`
  let m = LABEL_MATERIALS.get(key)
  if (m) return m
  const cw = Math.max(64, Math.min(AREA_LABEL_MAX_PX, Math.round(long * AREA_LABEL_PX_PER_M)))
  const ch = Math.max(32, Math.round(cw * (short / long)))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const family = 'system-ui, -apple-system, "Segoe UI", sans-serif'
    let size = ch * AREA_LABEL_HEIGHT_FRAC
    ctx.font = `700 ${size}px ${family}`
    const textW = ctx.measureText(text).width
    const maxW = cw * AREA_LABEL_WIDTH_FRAC
    if (textW > maxW) {
      size *= maxW / textW
      ctx.font = `700 ${size}px ${family}`
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(2, size * 0.14)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.strokeText(text, cw / 2, ch / 2)
    ctx.fillStyle = shade(color, -0.6)
    ctx.fillText(text, cw / 2, ch / 2)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
  LABEL_MATERIALS.set(key, m)
  return m
}

/**
 * Bereichsname flach auf dem Boden. Der Text liest sich von oben wie im Plan (Oberkante = Norden),
 * bei hohen, schmalen Bereichen läuft er entlang der langen Seite (von unten nach oben).
 */
function areaLabel(item: EventItem, color: string): THREE.Object3D | null {
  const text = (item.label ?? '').trim()
  if (!text) return null
  const w = item.width
  const d = item.height
  const vertical = d > w
  const long = vertical ? d : w
  const short = vertical ? w : d
  const mesh = new THREE.Mesh(UNIT_PLANE, areaLabelMaterial(text, color, long, short))
  mesh.scale.set(long, short, 1)
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = 1
  const holder = new THREE.Group()
  holder.add(mesh)
  holder.position.set(w / 2, AREA_LABEL_Y, d / 2)
  if (vertical) holder.rotation.y = Math.PI / 2
  return holder
}

/**
 * Fläche am Boden (wie im Plan gestrichelt umrandet): halbtransparente Platte mit schmalem Rand.
 * Grundfläche (0,0) bis (w,d), Mitte bei (w/2, d/2). Alles ohne Schatten.
 */
export function buildArea(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const d = item.height // Plan-Tiefe
  const label = areaLabel(item, color)
  const g = group(
    box(w, AREA_FLOOR_H, d, w / 2, AREA_FLOOR_Y, d / 2, mat(color, 'matt', AREA_FLOOR_OPACITY), false),
    // Rand oben und unten (Plan-Ober- und Unterkante)
    box(w, AREA_EDGE_H, AREA_EDGE_T, w / 2, AREA_EDGE_Y, AREA_EDGE_INSET, mat(color, 'satin'), false),
    box(w, AREA_EDGE_H, AREA_EDGE_T, w / 2, AREA_EDGE_Y, d - AREA_EDGE_INSET, mat(color, 'satin'), false),
    // Rand links und rechts
    box(AREA_EDGE_T, AREA_EDGE_H, d, AREA_EDGE_INSET, AREA_EDGE_Y, d / 2, mat(color, 'satin'), false),
    box(AREA_EDGE_T, AREA_EDGE_H, d, w - AREA_EDGE_INSET, AREA_EDGE_Y, d / 2, mat(color, 'satin'), false),
  )
  if (label) g.add(label)
  return g
}

/**
 * Eckiger Platzhalter, 1 m hoch, Grundfläche (0,0) bis (w,d). Körper in Objektfarbe, Kanten dunkler abgesetzt.
 */
export function buildCustomRect(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const d = item.height // Plan-Tiefe
  return group(
    box(w, CUSTOM_H, d, w / 2, CUSTOM_H / 2, d / 2, mat(color, 'satin')),
    boxEdges(w, CUSTOM_H, d, w / 2, CUSTOM_H / 2, d / 2, shade(color, -0.45)),
  )
}

/**
 * Runder Platzhalter, 1 m hoch, um den Ursprung zentriert, Radius w/2. `item.height` wird ignoriert.
 * Oben ein leicht überstehender, dunklerer Deckelrand.
 */
export function buildCustomRound(item: EventItem, color: string): THREE.Group {
  const r = item.width / 2
  return group(
    cylinder(r, CUSTOM_H, 0, CUSTOM_H / 2, 0, mat(color, 'satin'), { segments: 32 }),
    cylinder(
      r + CUSTOM_RIM_OVERHANG,
      CUSTOM_RIM_H,
      0,
      CUSTOM_H - CUSTOM_RIM_H / 2,
      0,
      mat(shade(color, -0.3), 'satin'),
      { segments: 32, cast: false },
    ),
  )
}

/** Modelle für die Sonstigen (Fläche, eigene Rechtecke und Kreise). */
export const MISC_MODELS: ModelMap = {
  area: buildArea,
  custom_rect: buildCustomRect,
  custom_round: buildCustomRound,
}
