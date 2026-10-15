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

/** Höhe des Körpers bei custom_rect und custom_round (1 m). */
const CUSTOM_H = 1
/** Überstand des Deckelrandes über den Körper (5 mm). */
const CUSTOM_RIM_OVERHANG = 0.005
/** Höhe des Deckelrandes (2 cm). */
const CUSTOM_RIM_H = 0.02

/**
 * Fläche am Boden (wie im Plan gestrichelt umrandet): halbtransparente Platte mit schmalem Rand.
 * Grundfläche (0,0) bis (w,d), Mitte bei (w/2, d/2). Alles ohne Schatten.
 */
export function buildArea(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const d = item.height // Plan-Tiefe
  return group(
    box(w, AREA_FLOOR_H, d, w / 2, AREA_FLOOR_Y, d / 2, mat(color, 'matt', AREA_FLOOR_OPACITY), false),
    // Rand oben und unten (Plan-Ober- und Unterkante)
    box(w, AREA_EDGE_H, AREA_EDGE_T, w / 2, AREA_EDGE_Y, AREA_EDGE_INSET, mat(color, 'satin'), false),
    box(w, AREA_EDGE_H, AREA_EDGE_T, w / 2, AREA_EDGE_Y, d - AREA_EDGE_INSET, mat(color, 'satin'), false),
    // Rand links und rechts
    box(AREA_EDGE_T, AREA_EDGE_H, d, AREA_EDGE_INSET, AREA_EDGE_Y, d / 2, mat(color, 'satin'), false),
    box(AREA_EDGE_T, AREA_EDGE_H, d, w - AREA_EDGE_INSET, AREA_EDGE_Y, d / 2, mat(color, 'satin'), false),
  )
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
