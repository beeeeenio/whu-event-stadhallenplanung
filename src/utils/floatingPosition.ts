/** Floating toolbar position management with localStorage persistence. */

export type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface FloatingPosition {
  x: number
  y: number
  anchor: AnchorPosition
}

interface StoredPositions {
  toolsToolbar?: FloatingPosition
  settingsToolbar?: FloatingPosition
}

const STORAGE_KEY = 'stadthalle.floating-positions'

/** Load saved positions from localStorage. */
export function loadSavedPositions(): StoredPositions {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch (e) {
    console.error('Failed to load floating positions:', e)
  }
  return {}
}

/** Save positions to localStorage. */
export function savePositions(positions: StoredPositions): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch (e) {
    console.error('Failed to save floating positions:', e)
  }
}

/** Get next non-overlapping anchor position. If all are occupied, cycle to first. */
export function getNextAnchorPosition(
  occupiedAnchors: Set<AnchorPosition>
): AnchorPosition {
  const allAnchors: AnchorPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
  const available = allAnchors.find((a) => !occupiedAnchors.has(a))
  return available || allAnchors[0]
}

/** Calculate screen pixel position from anchor and offset. */
export function getPixelPosition(
  pos: FloatingPosition,
  toolbarWidth: number,
  toolbarHeight: number
): { x: number; y: number } {
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  switch (pos.anchor) {
    case 'top-left':
      return { x: pos.x, y: pos.y }
    case 'top-right':
      return { x: screenWidth - toolbarWidth - pos.x, y: pos.y }
    case 'bottom-left':
      return { x: pos.x, y: screenHeight - toolbarHeight - pos.y }
    case 'bottom-right':
      return { x: screenWidth - toolbarWidth - pos.x, y: screenHeight - toolbarHeight - pos.y }
  }
}

/** Detect which anchor corner the toolbar is closest to. */
export function detectAnchor(
  screenX: number,
  screenY: number,
  toolbarWidth: number,
  toolbarHeight: number
): AnchorPosition {
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  const centerX = screenX + toolbarWidth / 2
  const centerY = screenY + toolbarHeight / 2

  const isLeft = centerX < screenWidth / 2
  const isTop = centerY < screenHeight / 2

  if (isTop && isLeft) return 'top-left'
  if (isTop && !isLeft) return 'top-right'
  if (!isTop && isLeft) return 'bottom-left'
  return 'bottom-right'
}

/** Calculate offset from anchor for storage. */
export function getOffsetFromAnchor(
  screenX: number,
  screenY: number,
  toolbarWidth: number,
  toolbarHeight: number,
  anchor: AnchorPosition
): { x: number; y: number } {
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  switch (anchor) {
    case 'top-left':
      return { x: screenX, y: screenY }
    case 'top-right':
      return { x: screenWidth - screenX - toolbarWidth, y: screenY }
    case 'bottom-left':
      return { x: screenX, y: screenHeight - screenY - toolbarHeight }
    case 'bottom-right':
      return { x: screenWidth - screenX - toolbarWidth, y: screenHeight - screenY - toolbarHeight }
  }
}
