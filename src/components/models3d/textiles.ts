import * as THREE from 'three'
import type { EventItem } from '../../types'
import { VENUE } from '../../data/venue3d'
import { box, cylinder, drape, group, mat, NEUTRAL, rod, type ModelMap } from './common'

/** Vorhang/Molton: Höhe der Oberkante = Holzpaneel-Höhe des Saals (3,8 m). */
const CURTAIN_H = VENUE.woodPanelHeight
/** Vorhang: Schiene oben (Höhe und Tiefe des Profils). */
const CURTAIN_RAIL_H = 0.04
const CURTAIN_RAIL_D = 0.06
/** Vorhang: Stoffbahn endet 5 cm unter der Schiene. */
const CURTAIN_CLOTH_H = CURTAIN_H - 0.05

/** Pipe & Drape: Höhe der Pfosten und Querstange. */
const PIPE_H = 3
/** Pipe & Drape: Abstand der Pfosten vom Rand der Bahn. */
const PIPE_POST_INSET = 0.03
/** Pipe & Drape: Pfostenabstand in Metern (Anzahl Pfosten = ceil(w / 3) + 1, mindestens 2). */
const PIPE_POST_SPACING = 3
/** Pipe & Drape: Radius der Pfosten. */
const PIPE_POST_R = 0.025
/** Pipe & Drape: Kantenlänge der quadratischen Fußplatte. */
const PIPE_FOOT = 0.4
const PIPE_FOOT_H = 0.01
/** Pipe & Drape: Radius der Querstange. */
const PIPE_BAR_R = 0.015

/** Leinwand: Gesamthöhe des Rahmens. */
const SCREEN_H = 3
/** Leinwand: Unterkante des Bildes über dem Boden. */
const SCREEN_BOTTOM = 1
/** Leinwand: Rahmenstärke (Querschnitt quadratisch). */
const SCREEN_FRAME = 0.04
/** Leinwand: Tiefe der Stützen-Füße. */
const SCREEN_FOOT_D = 0.8
const SCREEN_FOOT_W = 0.05
const SCREEN_FOOT_H = 0.03
/** Leinwand: Stützenhöhe (von 0 bis 1,0 m). */
const SCREEN_LEG_H = 1
/** Leinwand: Dicke der weißen Bildfläche. */
const SCREEN_PICTURE_D = 0.01

/** Vorhang/Molton: Stoffbahn (Fläche parallel zu x) mit Schiene oben. Linie von x = 0 bis w bei z = 0, Tiefe wird ignoriert. */
export function buildCurtain(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const railMat = mat(NEUTRAL.alu, 'metal')
  return group(
    drape(w, CURTAIN_CLOTH_H, w / 2, CURTAIN_CLOTH_H / 2, 0, mat(color, 'fabric'), { depth: 0.05, fold: 0.3 }),
    box(w, CURTAIN_RAIL_H, CURTAIN_RAIL_D, w / 2, CURTAIN_H - CURTAIN_RAIL_H / 2, 0, railMat, false),
  )
}

/** Pipe & Drape: Stoffwand auf zwei oder mehr Stahlpfosten mit Querstange. Mitte der Grundfläche bei (w/2, d/2). */
export function buildPipeDrape(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const zc = item.height / 2
  const n = Math.max(2, Math.ceil(w / PIPE_POST_SPACING) + 1)
  const postMat = mat(NEUTRAL.alu, 'metal')
  const footMat = mat(NEUTRAL.anthracite, 'metal')
  const parts: THREE.Object3D[] = []
  for (let i = 0; i < n; i++) {
    const x = PIPE_POST_INSET + (i * (w - 2 * PIPE_POST_INSET)) / (n - 1)
    parts.push(
      cylinder(PIPE_POST_R, PIPE_H, x, PIPE_H / 2, zc, postMat, { segments: 12 }),
      box(PIPE_FOOT, PIPE_FOOT_H, PIPE_FOOT, x, PIPE_FOOT_H / 2, zc, footMat, false),
    )
  }
  parts.push(
    rod([0, PIPE_H - 0.04, zc], [w, PIPE_H - 0.04, zc], PIPE_BAR_R, postMat),
    drape(w - 0.02, PIPE_H - 0.08, w / 2, 0.02 + (PIPE_H - 0.08) / 2, zc, mat(color, 'fabric'), { depth: 0.04, fold: 0.25 }),
  )
  return group(...parts)
}

/** Fast-Fold-Leinwand: weiße Bildfläche im Rahmen, Objektfarbe nur für Rahmen und Stützen. Mitte bei (w/2, d/2). */
export function buildScreen(item: EventItem, color: string): THREE.Group {
  const w = item.width
  const zc = item.height / 2
  const frameMat = mat(color, 'satin')
  const pictureMat = mat(NEUTRAL.white, 'matt')
  const footMat = mat(NEUTRAL.black, 'metal')
  const picY = SCREEN_BOTTOM + (SCREEN_H - SCREEN_BOTTOM) / 2
  const sideX = [SCREEN_FRAME / 2, w - SCREEN_FRAME / 2]
  const parts: THREE.Object3D[] = [
    // Bildfläche füllt den Raum zwischen den Rahmenseiten (Bildunterkante 1,04 m, Oberkante 2,96 m)
    box(w - 2 * SCREEN_FRAME, SCREEN_H - SCREEN_BOTTOM - 2 * SCREEN_FRAME, SCREEN_PICTURE_D, w / 2, picY, zc, pictureMat),
    // Rahmen oben und unten
    box(w, SCREEN_FRAME, SCREEN_FRAME, w / 2, SCREEN_H - SCREEN_FRAME / 2, zc, frameMat),
    box(w, SCREEN_FRAME, SCREEN_FRAME, w / 2, SCREEN_BOTTOM + SCREEN_FRAME / 2, zc, frameMat),
  ]
  for (const x of sideX) {
    parts.push(
      // Rahmen links und rechts
      box(SCREEN_FRAME, SCREEN_H - SCREEN_BOTTOM, SCREEN_FRAME, x, picY, zc, frameMat),
      // Stützen (von Boden bis Unterkante Bild)
      box(SCREEN_FRAME, SCREEN_LEG_H, SCREEN_FRAME, x, SCREEN_LEG_H / 2, zc, frameMat),
      // Füße
      box(SCREEN_FOOT_W, SCREEN_FOOT_H, SCREEN_FOOT_D, x, SCREEN_FOOT_H / 2, zc, footMat, false),
    )
  }
  return group(...parts)
}

/** Textil-Typen: Vorhang/Molton, Pipe & Drape, Leinwand. */
export const TEXTILE_MODELS: ModelMap = {
  curtain: buildCurtain,
  pipe_drape: buildPipeDrape,
  screen: buildScreen,
}
