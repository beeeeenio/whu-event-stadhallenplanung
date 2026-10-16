/** Styropor-Buchstaben: jeder Buchstabe steht einzeln, der Schriftzug wird als ein Objekt geplant. */
export const FOAM_LETTER = {
  /** Breite je Buchstabe (m) */
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

export interface LetterSlot {
  char: string
  /** linke Kante (m) */
  x: number
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
    slots.push({ char, x })
    x += FOAM_LETTER.widthM
  }
  return slots
}

/** Gesamtbreite des Schriftzugs (m), mindestens ein Buchstabe. */
export function foamLettersWidth(text: string): number {
  const slots = letterSlots(text)
  if (slots.length === 0) return FOAM_LETTER.widthM
  return slots[slots.length - 1].x + FOAM_LETTER.widthM
}

export function foamLettersLabel(text: string): string {
  return `Styropor-Buchstaben „${text.trim()}“`
}

/** Bezeichnung wurde nicht von Hand geändert. */
export function hasDefaultFoamLabel(label: string): boolean {
  return label.startsWith('Styropor-Buchstaben')
}
