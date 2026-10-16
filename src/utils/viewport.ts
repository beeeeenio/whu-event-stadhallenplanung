/** Zoom-Grenzen und -Stufen des 2D-Plans. */
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 6
/** Stufen für +/−-Buttons und Tastatur. Mausrad/Pinch zoomen stufenlos. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6]

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

/** Nächste Zoomstufe in Richtung dir (+1 = größer, −1 = kleiner). */
export function nextZoomStep(z: number, dir: 1 | -1): number {
  if (dir === 1) return ZOOM_STEPS.find((s) => s > z + 0.001) ?? MAX_ZOOM
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? MIN_ZOOM
}

/** Zoom auf √2-Stufen runden. Nicht ausgewählte Objekte bekommen nur diesen Wert, damit sie
 *  nicht bei jedem Mausrad-Tick neu rendern. */
export function quantizeZoom(z: number): number {
  return 2 ** (Math.round(Math.log2(z) * 2) / 2)
}

export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number }

/** Wheel-Event deuten: Pinch (ctrlKey) bzw. ⌘/Strg+Rad oder klassisches Mausrad → Zoom-Faktor.
 *  Zwei-Finger-Scrollen auf dem Trackpad → Verschieben (dx/dy in Bildschirm-px). */
export function interpretWheel(e: WheelEvent): WheelIntent {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
  let dx = e.deltaX * unit
  let dy = e.deltaY * unit
  const isMouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40)
  if (e.ctrlKey || e.metaKey || isMouseWheel) {
    const k = isMouseWheel ? 0.0015 : 0.01
    const factor = Math.min(2, Math.max(0.5, Math.exp(-dy * k)))
    return { kind: 'zoom', factor }
  }
  if (e.shiftKey && dx === 0) {
    dx = dy
    dy = 0
  }
  return { kind: 'pan', dx, dy }
}

/** true auf Geräten mit Finger-Bedienung (iPad/Handy). */
export const IS_COARSE_POINTER =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

/** true auf Mac/iOS (für die Anzeige ⌘ statt Strg). */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
