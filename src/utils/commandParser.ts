import { ITEM_LIBRARY, type ItemTemplate } from '../data/itemLibrary'
import type { ItemType } from '../types'
import { rowsForChairCount } from './placement'

/** Zusätzliche Suchbegriffe je Bibliothekstyp (Umgangssprache der Hallen-Crew). */
const SYNONYMS: Partial<Record<ItemType, string[]>> = {
  table_round: ['rundtisch', 'bankett', 'tisch', 'rund', 'dinner'],
  table_rect: ['tisch', 'eckig', 'bankett', 'tafel', 'rechteck'],
  table_high: ['stehtisch', 'bistro', 'cocktail', 'stehtische'],
  table_low_round: ['beistelltisch', 'couchtisch', 'lounge'],
  chair: ['stuhl', 'stühle', 'stuehle', 'sitz', 'sitze'],
  armchair: ['sessel', 'lounge'],
  sofa_2: ['sofa', 'couch', 'lounge'],
  sofa_3: ['sofa', 'couch', 'lounge'],
  sofa_corner: ['ecksofa', 'lounge', 'insel'],
  bar: ['bar', 'theke', 'tresen', 'catering'],
  truss: ['traverse', 'truss', 'rigging'],
  curtain: ['vorhang', 'molton', 'vorhänge'],
  pipe_drape: ['pipe', 'drape', 'stellwand', 'trennwand'],
  podium: ['podest', 'bühne', 'buehne', 'podeste', 'bühnenpodest'],
  exhibition_stand: ['messestand', 'stand', 'aussteller', 'messe'],
  coat_rack: ['garderobe', 'garderobenständer'],
  plant: ['pflanze', 'pflanzen', 'deko', 'grün'],
  screen: ['leinwand', 'screen', 'projektion', 'beamer'],
}

const STOPWORDS = new Set(['als', 'in', 'im', 'the', 'mit', 'x', '×', 'stk', 'stück', 'saal', 'und', 'a', 'je'])

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim()
}

function haystack(t: ItemTemplate): string {
  return normalize([t.label, ...(SYNONYMS[t.type] ?? [])].join(' '))
}

export interface ParsedQuery {
  /** Führende Menge, z. B. „40“ in „40 Stühle“. */
  quantity: number | null
  /** Explizites Raster „5x8“ bzw. „5 × 8“. */
  grid: { rows: number; cols: number } | null
  /** Enthält „Reihe“/„Reihen“/„Bestuhlung“. */
  wantsRows: boolean
  /** Restliche Suchwörter (normalisiert, ohne Füllwörter/Zahlen). */
  words: string[]
  raw: string
}

export function parseQuery(raw: string): ParsedQuery {
  let text = raw.trim()
  let grid: ParsedQuery['grid'] = null
  const gridMatch = text.match(/(\d+)\s*[x×*]\s*(\d+)/i)
  if (gridMatch) {
    grid = { rows: Math.max(1, Number(gridMatch[1])), cols: Math.max(1, Number(gridMatch[2])) }
    text = text.replace(gridMatch[0], ' ')
  }
  let quantity: number | null = null
  const qtyMatch = text.match(/^\s*(\d+)\s*[x×]?\s*/i)
  if (qtyMatch) {
    quantity = Math.max(1, Math.min(500, Number(qtyMatch[1])))
    text = text.slice(qtyMatch[0].length)
  }
  const norm = normalize(text)
  const wantsRows = /\b(reihe|reihen|bestuhlung|stuhlreihe|stuhlreihen)\b/.test(norm)
  const words = norm
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .filter((w) => !/^(reihe|reihen|bestuhlung)$/.test(w))
  return { quantity, grid, wantsRows, words, raw }
}

/** Bibliothekstreffer, bester zuerst. Leere Suche liefert die ganze Bibliothek (Konzept C: „⌘K ohne Text“). */
export function matchLibrary(words: string[]): ItemTemplate[] {
  if (words.length === 0) return ITEM_LIBRARY
  const scored = ITEM_LIBRARY.map((t) => {
    const hay = haystack(t)
    const tokens = hay.split(' ')
    let score = 0
    for (const w of words) {
      // Plural-/Endungs-tolerant: „stuehle“ ~ „stuhl“, „stehtische“ ~ „stehtisch“
      const stem = w.length > 4 ? w.replace(/(en|e|n|s)$/, '') : w
      if (tokens.some((tok) => tok === w)) score += 3
      else if (tokens.some((tok) => tok.startsWith(stem))) score += 2
      else if (hay.includes(stem)) score += 1
      else return { t, score: -1 }
    }
    // Kürzere Labels bei gleichem Treffer bevorzugen („Stuhl“ vor „Stuhlreihe…“)
    return { t, score: score - t.label.length / 1000 }
  })
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.t)
}

/** Stuhlreihen-Vorschlag, wenn die Eingabe danach klingt („40 Stühle als Reihe“, „Reihen 5x8“). */
export function chairRowSuggestion(q: ParsedQuery): { rows: number; cols: number } | null {
  const mentionsChairs = q.words.some((w) => /^(stuhl|stuehl|stuhle|sitz)/.test(w))
  if (q.grid && (q.wantsRows || mentionsChairs || q.words.length === 0)) return q.grid
  if (q.wantsRows) {
    if (q.quantity) return rowsForChairCount(q.quantity)
    return { rows: 5, cols: 10 }
  }
  return null
}

/** Einfache Textsuche für Befehle/Phasen: alle Wörter müssen irgendwo vorkommen. */
export function textMatches(words: string[], text: string): boolean {
  if (words.length === 0) return true
  const hay = normalize(text)
  return words.every((w) => hay.includes(w.length > 4 ? w.replace(/(en|e|n|s)$/, '') : w))
}
