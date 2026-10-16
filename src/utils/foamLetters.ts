/** Styropor-Buchstaben: jeder Buchstabe steht einzeln, der Schriftzug wird als ein Objekt geplant. */
export const FOAM_LETTER = {
  /** Breite eines „H“ (m); andere Buchstaben im Verhältnis der Schrift, z. B. „I“ schmal, „W“ breit */
  widthM: 0.5,
  /** Höhe (m) */
  heightM: 1,
  /** Stärke (m), Schätzung */
  depthM: 0.2,
  /** Abstand zwischen zwei Buchstaben (m) */
  gapM: 0.05,
  /** Breite eines Leerzeichens (m) */
  spaceM: 0.3,
}

export const FOAM_DEFAULT_TEXT = 'WHU'

/** Buchstabenbreite relativ zum „H“, gemessen an der 3D-Schrift (helvetiker bold). */
const RELATIVE_WIDTH: Record<string, number> = {
  "!": 0.24, "#": 1.22, "%": 1.33, "&": 1.09, "*": 0.71, "+": 0.88, ",": 0.25, "-": 0.46, ".": 0.25, "/": 0.52,
  "0": 0.87, "1": 0.51, "2": 0.84, "3": 0.84, "4": 0.86, "5": 0.84, "6": 0.85, "7": 0.83, "8": 0.85, "9": 0.85,
  ":": 0.25, "?": 0.82, "@": 1.52,
  A: 1.15, B: 1, C: 1.16, D: 1.03, E: 0.91, F: 0.84, G: 1.16, H: 1, I: 0.25, J: 0.77, K: 1.07, L: 0.84, M: 1.22,
  N: 0.99, O: 1.19, P: 0.92, Q: 1.19, R: 1, S: 0.99, T: 0.97, U: 0.97, V: 1.07, W: 1.54, X: 1.07, Y: 1, Z: 0.96,
  a: 0.84, b: 0.86, c: 0.9, d: 0.86, e: 0.84, f: 0.51, g: 0.86, h: 0.8, i: 0.24, j: 0.34, k: 0.82, l: 0.24, m: 1.27,
  n: 0.8, o: 0.91, p: 0.86, q: 0.86, r: 0.51, s: 0.81, t: 0.49, u: 0.8, v: 0.88, w: 1.26, x: 0.88, y: 0.88, z: 0.79,
}
/** Die Schrift kennt keine Umlaute: Grundbuchstabe (die Punkte setzt das 3D-Modell selbst). */
export const UMLAUT_BASE: Record<string, string> = { Ä: 'A', Ö: 'O', Ü: 'U', ä: 'a', ö: 'o', ü: 'u', ß: 'B' }

/** Breite eines Buchstabens in Metern. */
export function letterWidthM(char: string): number {
  return (RELATIVE_WIDTH[UMLAUT_BASE[char] ?? char] ?? 1) * FOAM_LETTER.widthM
}

export interface LetterSlot {
  char: string
  /** linke Kante (m) */
  x: number
  /** Breite (m) */
  w: number
}

/** Position jedes Buchstabens von links; Leerzeichen erzeugen nur Abstand. */
export function letterSlots(text: string): LetterSlot[] {
  const slots: LetterSlot[] = []
  let x = 0
  for (const char of text) {
    if (char.trim() === '') {
      x += FOAM_LETTER.spaceM
      continue
    }
    if (slots.length > 0 && x > 0) x += FOAM_LETTER.gapM
    const w = letterWidthM(char)
    slots.push({ char, x, w })
    x += w
  }
  return slots
}

/** Gesamtbreite des Schriftzugs (m), mindestens ein Buchstabe. */
export function foamLettersWidth(text: string): number {
  const slots = letterSlots(text)
  if (slots.length === 0) return FOAM_LETTER.widthM
  const last = slots[slots.length - 1]
  return last.x + last.w
}

export function foamLettersLabel(text: string): string {
  return `Styropor-Buchstaben „${text.trim()}“`
}

/** Bezeichnung wurde nicht von Hand geändert. */
export function hasDefaultFoamLabel(label: string): boolean {
  return label.startsWith('Styropor-Buchstaben')
}
