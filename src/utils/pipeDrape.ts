/** Pipe & Drape: beliebig lange und hohe Wand. Länge und Höhe in 10-cm-Schritten, mindestens 0,5 m. */
export const PIPE_DRAPE_MIN_M = 0.5
export const PIPE_DRAPE_STEP_M = 0.1
/** Standardhöhe der Wand in m (wenn `heightM` fehlt) und Obergrenze für die Eingabe. */
export const PIPE_DRAPE_DEFAULT_HEIGHT_M = 3
export const PIPE_DRAPE_MAX_HEIGHT_M = 10

const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',')

/** Gerundete, gültige Länge (m) aus einem beliebigen Wert. */
export function clampPipeDrapeLength(m: number): number {
  return Math.max(PIPE_DRAPE_MIN_M, Math.round(m / PIPE_DRAPE_STEP_M) * PIPE_DRAPE_STEP_M)
}

/** Gerundete, gültige Höhe (m), begrenzt auf 0,5 bis 10 m. */
export function clampPipeDrapeHeight(m: number): number {
  return Math.min(PIPE_DRAPE_MAX_HEIGHT_M, Math.max(PIPE_DRAPE_MIN_M, Math.round(m / PIPE_DRAPE_STEP_M) * PIPE_DRAPE_STEP_M))
}

/** Standard-Bezeichnung wie in der Bibliothek: „Pipe & Drape (3x0,2m)“. */
export function pipeDrapeLabel(lengthM: number, depthM: number): string {
  return `Pipe & Drape (${fmt(lengthM)}x${fmt(depthM)}m)`
}

/** Nur die Standard-Bezeichnung wird mit der Länge angepasst, eigene Namen bleiben. */
export function hasDefaultPipeDrapeLabel(label: string): boolean {
  return /^Pipe & Drape \([\d,]+x[\d,]+m\)$/.test(label)
}
