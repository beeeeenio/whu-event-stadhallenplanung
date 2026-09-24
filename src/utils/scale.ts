/**
 * Kalibrierung: Basis-Grundriss ist der Stromplan Erdgeschoss (power-plan.png),
 * dessen "Maßstab 1:250"-Balken exakt 236px = 10,00m entspricht (native Auflösung
 * 1755×1240px, per Pixel-Messung verifiziert). Der Canvas nutzt intern
 * DEFAULT_PIXELS_PER_METER = 20px/m; das Hintergrundbild wird in CanvasEditor
 * entsprechend um den Faktor 20/23.6 skaliert, damit beide Maßstäbe exakt
 * übereinstimmen. Siehe STAGE_WIDTH/STAGE_HEIGHT in CanvasEditor.tsx.
 */
export const DEFAULT_PIXELS_PER_METER = 20

/** Native Kalibrierung des Stromplan-Hintergrundbilds (public/plans/power-plan.png). */
export const POWER_PLAN_NATIVE_PIXELS_PER_METER = 236 / 10

export function metersToPixels(meters: number, pixelsPerMeter: number): number {
  return meters * pixelsPerMeter
}

export function pixelsToMeters(pixels: number, pixelsPerMeter: number): number {
  return pixels / pixelsPerMeter
}
