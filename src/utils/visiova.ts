/** Visiova V55: lieferbare Rahmenbreiten in Metern (visiova.de, 62-mm-Lochraster). */
export const VISIOVA_WIDTHS_M = [0.31, 0.496, 0.744, 0.992]
const MAX_W = 0.992

/**
 * Eine gezogene Wandlänge in lieferbare Rahmen aufteilen: so viele 992er wie möglich,
 * der Rest mit der Kombination aus kleineren Rahmen, die der Länge am nächsten kommt.
 */
export function splitVisiovaRun(lengthM: number): number[] {
  const len = Math.max(lengthM, VISIOVA_WIDTHS_M[0])
  const full = Math.floor(len / MAX_W)
  const rest = len - full * MAX_W
  // Restvarianten: nichts, ein Rahmen oder zwei kleinere Rahmen
  const options: number[][] = [[]]
  for (const a of VISIOVA_WIDTHS_M) {
    options.push([a])
    for (const b of VISIOVA_WIDTHS_M) if (b <= a && a < MAX_W) options.push([a, b])
  }
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
  let best = options[0]
  for (const o of options) {
    const d = Math.abs(sum(o) - rest)
    const bd = Math.abs(sum(best) - rest)
    if (d < bd - 1e-6 || (Math.abs(d - bd) < 1e-6 && o.length < best.length)) best = o
  }
  const widths = [...Array(full).fill(MAX_W), ...best]
  return widths.length ? widths : [VISIOVA_WIDTHS_M[0]]
}

/** Kurzbeschreibung, z. B. „3 × 992 + 496 mm“. */
export function describeVisiovaRun(widths: number[]): string {
  const counts = new Map<number, number>()
  for (const w of widths) counts.set(w, (counts.get(w) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([w, n]) => (n > 1 ? `${n} × ${Math.round(w * 1000)}` : `${Math.round(w * 1000)}`))
    .join(' + ') + ' mm'
}

/** Standard-Bezeichnung, z. B. „Visiova V55 (496x2480mm)“ bzw. „Visiova-Wand 5 Rahmen (4,46 m)“. */
export function visiovaLabel(widths: number | number[], heightM: number): string {
  const ws = Array.isArray(widths) ? widths : [widths]
  if (ws.length === 1) return `Visiova V55 (${Math.round(ws[0] * 1000)}x${Math.round(heightM * 1000)}mm)`
  const total = ws.reduce((s, w) => s + w, 0)
  return `Visiova-Wand ${ws.length} Rahmen (${total.toFixed(2).replace('.', ',')} m)`
}

/** Hat das Objekt noch die automatische Bezeichnung (dann darf sie mit den Maßen mitgehen)? */
export function hasDefaultVisiovaLabel(label: string): boolean {
  return /^Visiova V55 \(\d+x\d+mm\)$/.test(label) || /^Visiova-Wand \d+ Rahmen \([\d,]+ m\)$/.test(label)
}
