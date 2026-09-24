/** Bühnenzüge 1-6: Abstand zur Bühnenvorderkante in Metern, Belastbarkeit 250kg je Zug. */
export interface RiggingBar {
  id: number
  distanceFromStageFrontM: number
  loadCapacityKg: number
}

// Werte laut Stromplan "Strom & Laststangen Bühne" (Neubau Stadt- & Kongresshalle Vallendar)
export const RIGGING_BARS: RiggingBar[] = [
  { id: 1, distanceFromStageFrontM: 2.25, loadCapacityKg: 250 },
  { id: 2, distanceFromStageFrontM: 3.65, loadCapacityKg: 250 },
  { id: 3, distanceFromStageFrontM: 5.0, loadCapacityKg: 250 },
  { id: 4, distanceFromStageFrontM: 5.25, loadCapacityKg: 250 },
  { id: 5, distanceFromStageFrontM: 6.65, loadCapacityKg: 250 },
  { id: 6, distanceFromStageFrontM: 7.15, loadCapacityKg: 250 },
]

/**
 * Referenzpunkt der Bühnenvorderkante im Canvas-Koordinatensystem (px, bei
 * DEFAULT_PIXELS_PER_METER). Aus der Bemaßung "Abstand Züge zur Bühnenvorderkante"
 * im Stromplan abgeleitet (native Bildposition x≈413,y≈195px bei 23.6px/m,
 * umgerechnet auf 20px/m).
 */
export const STAGE_FRONT_EDGE = { x: 350, y: 165, widthM: 15 }
