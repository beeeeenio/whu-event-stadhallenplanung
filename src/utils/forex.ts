import type { ForexPanel, ForexSide, Piece2D } from '../types'

/** Forex-Blenden an NivTec-Podesten: Geometrie der Kanten (Meter, Plan-Koordinaten, y nach unten). */

type Pt = { x: number; y: number }
export interface ForexEdge {
  a: Pt
  b: Pt
  /** Außennormale (Einheitsvektor) */
  nx: number
  ny: number
  length: number
}

export const FOREX_SIDES: ForexSide[] = ['top', 'right', 'bottom', 'left', 'hyp']
export const FOREX_SIDE_LABEL: Record<ForexSide, string> = {
  top: 'hinten',
  right: 'rechts',
  bottom: 'vorne',
  left: 'links',
  hyp: 'Schräge',
}

/** Schlüssel eines Podests: NivTec-id, sonst Position in der Liste. */
export function pieceKey(p: Piece2D, index: number): string {
  return p.id ?? `#${index}`
}

function polygon(p: Piece2D): Pt[] {
  const tl = { x: p.x, y: p.y }
  const tr = { x: p.x + p.w, y: p.y }
  const br = { x: p.x + p.w, y: p.y + p.d }
  const bl = { x: p.x, y: p.y + p.d }
  if (!p.corner) return [tl, tr, br, bl]
  return { tl: [tl, tr, bl], tr: [tl, tr, br], bl: [tl, br, bl], br: [tr, br, bl] }[p.corner]
}

function sideOf(p: Piece2D, a: Pt, b: Pt): ForexSide {
  const eps = 1e-6
  if (Math.abs(a.y - b.y) < eps) return Math.abs(a.y - p.y) < eps ? 'top' : 'bottom'
  if (Math.abs(a.x - b.x) < eps) return Math.abs(a.x - p.x) < eps ? 'left' : 'right'
  return 'hyp'
}

/** Alle Kanten eines Podests mit Seite und Außennormale. */
export function pieceEdges(p: Piece2D): (ForexEdge & { side: ForexSide })[] {
  const poly = polygon(p)
  const cx = poly.reduce((s, q) => s + q.x, 0) / poly.length
  const cy = poly.reduce((s, q) => s + q.y, 0) / poly.length
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    let nx = -(b.y - a.y) / length
    let ny = (b.x - a.x) / length
    if (nx * (cx - (a.x + b.x) / 2) + ny * (cy - (a.y + b.y) / 2) > 0) {
      nx = -nx
      ny = -ny
    }
    return { a, b, nx, ny, length, side: sideOf(p, a, b) }
  })
}

function inside(pt: Pt, poly: Pt[]): boolean {
  let r = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) r = !r
  }
  return r
}

/** Liegt direkt außerhalb der Kante kein anderes Podest? (Nur dann kann dort eine Blende hängen.) */
export function isFreeEdge(pieces: Piece2D[], index: number, e: ForexEdge): boolean {
  const probe = { x: (e.a.x + e.b.x) / 2 + e.nx * 0.05, y: (e.a.y + e.b.y) / 2 + e.ny * 0.05 }
  return !pieces.some((o, oi) => oi !== index && inside(probe, polygon(o)))
}

/** Kante einer Blende (oder null, wenn Podest/Seite nicht passt). */
export function forexEdge(pieces: Piece2D[], panel: ForexPanel): ForexEdge | null {
  const i = pieces.findIndex((p, idx) => pieceKey(p, idx) === panel.pieceId)
  if (i < 0) return null
  return pieceEdges(pieces[i]).find((e) => e.side === panel.side) ?? null
}

/** Ungültige Blenden verwerfen (Podest fehlt, Seite gibt es nicht, doppelt). */
export function sanitizeForexPanels(pieces: Piece2D[], raw: unknown): ForexPanel[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ForexPanel[] = []
  for (const v of raw as Partial<ForexPanel>[]) {
    if (typeof v?.id !== 'string' || typeof v.pieceId !== 'string' || !FOREX_SIDES.includes(v.side as ForexSide)) continue
    const panel: ForexPanel = { id: v.id, pieceId: v.pieceId, side: v.side as ForexSide }
    if (typeof v.thicknessMm === 'number' && v.thicknessMm > 0) panel.thicknessMm = v.thicknessMm
    if (typeof v.printGroup === 'string' && v.printGroup) panel.printGroup = v.printGroup
    const key = `${panel.pieceId}|${panel.side}`
    if (seen.has(key) || seen.has(`id:${panel.id}`) || !forexEdge(pieces, panel)) continue
    seen.add(key)
    seen.add(`id:${panel.id}`)
    out.push(panel)
  }
  return out
}

/** Alle freien Vorderkanten (größtes y je Spalte = 'bottom') als neue Blenden in Gruppe „vorne“. */
export function frontEdgePanels(pieces: Piece2D[], existing: ForexPanel[]): ForexPanel[] {
  const taken = new Set(existing.map((p) => `${p.pieceId}|${p.side}`))
  const ids = new Set(existing.map((p) => p.id))
  let n = 1
  const nextId = () => {
    while (ids.has(`fx-${n}`)) n++
    ids.add(`fx-${n}`)
    return `fx-${n}`
  }
  const added: ForexPanel[] = []
  pieces.forEach((p, i) => {
    const e = pieceEdges(p).find((x) => x.side === 'bottom')
    if (!e || !isFreeEdge(pieces, i, e) || taken.has(`${pieceKey(p, i)}|bottom`)) return
    added.push({ id: nextId(), pieceId: pieceKey(p, i), side: 'bottom', printGroup: 'vorne' })
  })
  return added
}

/** Freie Kanten, an denen noch keine Blende hängt (für „Blende hinzufügen“). */
export function freeEdgesWithoutPanel(pieces: Piece2D[], existing: ForexPanel[]) {
  const taken = new Set(existing.map((p) => `${p.pieceId}|${p.side}`))
  return pieces.flatMap((p, i) =>
    pieceEdges(p)
      .filter((e) => isFreeEdge(pieces, i, e) && !taken.has(`${pieceKey(p, i)}|${e.side}`))
      .map((e) => ({ pieceId: pieceKey(p, i), side: e.side, length: e.length, index: i })),
  )
}

/**
 * Reihenfolge links → rechts, wie man von außen auf die Blenden schaut
 * (für einen Druck, der über mehrere Platten läuft).
 */
export function sortPanelsForPrint(pieces: Piece2D[], panels: ForexPanel[]): ForexPanel[] {
  const key = (p: ForexPanel) => {
    const e = forexEdge(pieces, p)
    if (!e) return 0
    // Blickrichtung = -Normale; „rechts“ für den Betrachter (Plan, y nach unten) = (ny, -nx)
    const mx = (e.a.x + e.b.x) / 2
    const my = (e.a.y + e.b.y) / 2
    return mx * e.ny - my * e.nx
  }
  return [...panels].sort((a, b) => key(a) - key(b))
}
