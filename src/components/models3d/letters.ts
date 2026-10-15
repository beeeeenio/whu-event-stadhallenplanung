import * as THREE from 'three'
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json'
import type { EventItem } from '../../types'
import { FOAM_DEFAULT_TEXT, FOAM_LETTER, letterSlots } from '../../utils/foamLetters'
import { box, mat, shadows, type ModelMap } from './common'

let font: Font | null = null
/** Glyphe als Einheitsform: Grundlinie y = 0, Mitte x = 0, Tiefe 1 (z von 0 bis 1). */
const GLYPHS = new Map<string, { geo: THREE.BufferGeometry; w: number; h: number } | null>()
/** Die Schrift kennt keine Umlaute: auf den Grundbuchstaben ausweichen. */
const FALLBACK: Record<string, string> = { Ä: 'A', Ö: 'O', Ü: 'U', ä: 'a', ö: 'o', ü: 'u', ß: 'B' }

function glyph(char: string) {
  if (GLYPHS.has(char)) return GLYPHS.get(char)!
  font ??= new FontLoader().parse(fontJson as unknown as Parameters<FontLoader['parse']>[0])
  const c = char in (font.data as { glyphs: Record<string, unknown> }).glyphs ? char : FALLBACK[char]
  let entry = null
  if (c) {
    const geo = new TextGeometry(c, { font, size: 1, depth: 1, curveSegments: 6, bevelEnabled: false })
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, 0)
    geo.computeVertexNormals()
    entry = { geo, w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y }
  }
  GLYPHS.set(char, entry)
  return entry
}

/**
 * Styropor-Buchstaben: jeder Buchstabe einzeln, 1 m hoch (Versalhöhe), höchstens 0,5 m breit,
 * lesbar von der Plan-Unterseite (+z). Lokaler Ursprung = linke obere Ecke wie in 2D.
 */
export function buildFoamLetters(item: EventItem, color: string): THREE.Group {
  const g = new THREE.Group()
  const material = mat(color, 'satin')
  const capH = glyph('H')?.h ?? 0.7
  const d = item.height || FOAM_LETTER.depthM
  for (const slot of letterSlots(item.letterText ?? FOAM_DEFAULT_TEXT)) {
    const cx = slot.x + FOAM_LETTER.widthM / 2
    const gl = glyph(slot.char)
    if (!gl) {
      g.add(box(FOAM_LETTER.widthM * 0.8, FOAM_LETTER.heightM, d, cx, FOAM_LETTER.heightM / 2, d / 2, material))
      continue
    }
    const sy = FOAM_LETTER.heightM / capH
    const sx = Math.min(sy, FOAM_LETTER.widthM / Math.max(gl.w, 0.01))
    const m = shadows(new THREE.Mesh(gl.geo, material))
    m.scale.set(sx, sy, d)
    m.position.set(cx, 0, 0)
    g.add(m)
    // Umlaut-Punkte selbst setzen (die Schrift hat keine Umlaute)
    if ('ÄÖÜäöü'.includes(slot.char)) {
      const top = gl.h * sy + 0.06
      for (const dx of [-0.11, 0.11]) g.add(box(0.1, 0.1, d, cx + dx, top + 0.05, d / 2, material))
    }
  }
  return g
}

export const LETTER_MODELS: ModelMap = { foam_letters: buildFoamLetters }
