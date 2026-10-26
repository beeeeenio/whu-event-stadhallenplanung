import type { EventItem, Piece2D } from '../types'
import { forexEdge, FOREX_SIDE_LABEL } from './forex'

/** Eine Materialzeile einer NivTec-Bühne, z. B. „Podest 2,00 × 1,00 m“ × 4. */
export interface NivtecPartLine {
  label: string
  count: number
}

/** Was man für ein NivTec-Objekt braucht: Podeste, Aufsätze, Forex-Blenden samt Maßen. */
export interface NivtecParts {
  itemId: string
  name: string
  /** Hinweise ohne Stückzahl (Höhe, Spindeln, Druckgruppen) */
  facts: string[]
  lines: NivtecPartLine[]
}

/** Höhe der Forex-Platte: Bühnenhöhe minus 1 cm, wie im 3D-Modell (`buildForexPanel`); ohne Angabe 40 cm. */
const DEFAULT_HEIGHT_CM = 40
const FOREX_THICKNESS_MM = 5

/** 2 → „2,00“, 0,585 → „0,59“ */
const m = (v: number) => v.toFixed(2).replace('.', ',')
const dim = (w: number, d: number) => `${m(w)} × ${m(d)} m`

function countBy<T>(list: T[], key: (t: T) => string): NivtecPartLine[] {
  const map = new Map<string, NivtecPartLine>()
  for (const t of list) {
    const label = key(t)
    const row = map.get(label)
    if (row) row.count += 1
    else map.set(label, { label, count: 1 })
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'de'))
}

/** Podest in Maßen; die längere Seite zuerst, damit 1 × 2 und 2 × 1 dasselbe Teil sind. */
function pieceLabel(p: Piece2D, prefix: string): string {
  const [a, b] = p.w >= p.d ? [p.w, p.d] : [p.d, p.w]
  return `${p.corner ? `${prefix} (Dreieck)` : prefix} ${dim(a, b)}`
}

export function nivtecPartsOf(item: EventItem): NivtecParts | null {
  const data = item.nivtecData
  if (item.type !== 'nivtec_group' || !data) return null

  const facts: string[] = []
  const lines: NivtecPartLine[] = []
  const heightCm = data.heightCm ?? DEFAULT_HEIGHT_CM
  facts.push(`Höhe ${m(heightCm / 100)} m`)

  lines.push(...countBy(data.pieces, (p) => pieceLabel(p, 'Podest')))

  const top = data.topPieces ?? []
  if (top.length > 0) {
    lines.push(...countBy(top, (p) => pieceLabel(p, 'Aufsatz-Platte')))
    if (data.spindelHeightCm) facts.push(`Aufsatz auf Spindeln, ${m(data.spindelHeightCm / 100)} m über den Podesten`)
  }

  const panels = data.forexPanels ?? []
  if (panels.length > 0) {
    const h = Math.max(heightCm / 100 - 0.01, 0.05)
    const resolved = panels.flatMap((panel) => {
      const edge = forexEdge(data.pieces, panel)
      return edge ? [{ panel, length: edge.length }] : []
    })
    lines.push(
      ...countBy(resolved, ({ panel, length }) => `Forex-Blende ${dim(length, h)}, ${panel.thicknessMm ?? FOREX_THICKNESS_MM} mm`),
    )
    // Ein Druck, der über mehrere Blenden läuft: Gesamtbreite für die Druckdatei
    const groups = new Map<string, { n: number; length: number }>()
    for (const { panel, length } of resolved) {
      if (!panel.printGroup) continue
      const g = groups.get(panel.printGroup) ?? { n: 0, length: 0 }
      g.n += 1
      g.length += length
      groups.set(panel.printGroup, g)
    }
    for (const [name, g] of groups) {
      facts.push(`Druck „${name}“: ${g.n} Blenden nebeneinander, zusammen ${dim(g.length, h)}`)
    }
    const sides = Array.from(new Set(resolved.map(({ panel }) => FOREX_SIDE_LABEL[panel.side])))
    if (sides.length > 0) facts.push(`Blenden an: ${sides.join(', ')}`)
  }

  return { itemId: item.id, name: item.label, facts, lines }
}

/** Material aller NivTec-Objekte, die in der Phase sichtbar sind (in Listenreihenfolge). */
export function nivtecPartsForPhase(items: Record<string, EventItem>, itemOrder: string[], phaseId: string): NivtecParts[] {
  return itemOrder.flatMap((id) => {
    const item = items[id]
    if (!item?.phaseData[phaseId]?.visible) return []
    const parts = nivtecPartsOf(item)
    return parts ? [parts] : []
  })
}
