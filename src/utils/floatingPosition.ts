/** Floating toolbar position management with localStorage persistence. */

export type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface FloatingPosition {
  x: number
  y: number
  anchor: AnchorPosition
}

interface StoredPositionsV2 {
  toolsBar?: FloatingPosition
  settingsBar?: FloatingPosition
}

const STORAGE_KEY_V2 = 'stadthalle.toolbar-positions.v2'
const OLD_STORAGE_KEY = 'stadthalle.floating-positions'

/** Load saved positions from localStorage (v2), migrate from old keys if needed. */
export function loadSavedPositions(): StoredPositionsV2 {
  try {
    // Try v2 first
    const stored = localStorage.getItem(STORAGE_KEY_V2)
    if (stored) return JSON.parse(stored)

    // Migrate from old key if exists
    const oldStored = localStorage.getItem(OLD_STORAGE_KEY)
    if (oldStored) {
      const oldData = JSON.parse(oldStored)
      const migrated: StoredPositionsV2 = {
        toolsBar: oldData.toolsToolbar,
        settingsBar: oldData.settingsToolbar,
      }
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated))
      localStorage.removeItem(OLD_STORAGE_KEY)
      return migrated
    }
  } catch (e) {
    console.error('Failed to load floating positions:', e)
  }
  return {}
}

/** Save positions to localStorage. */
export function savePositions(positions: StoredPositionsV2): void {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(positions))
  } catch (e) {
    console.error('Failed to save floating positions:', e)
  }
}

/** Clamp position to screen bounds. */
export function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(x, window.innerWidth - width)),
    y: Math.max(0, Math.min(y, window.innerHeight - height)),
  }
}

/** Convert FloatingPosition to CSS style properties. */
export function anchorToStyle(
  pos: FloatingPosition
): { left?: string; right?: string; top?: string; bottom?: string } {
  switch (pos.anchor) {
    case 'top-left':
      return { left: `${pos.x}px`, top: `${pos.y}px` }
    case 'top-right':
      return { right: `${pos.x}px`, top: `${pos.y}px` }
    case 'bottom-left':
      return { left: `${pos.x}px`, bottom: `${pos.y}px` }
    case 'bottom-right':
      return { right: `${pos.x}px`, bottom: `${pos.y}px` }
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
