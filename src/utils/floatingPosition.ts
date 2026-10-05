/** Floating toolbar position management with localStorage persistence and edge snapping. */

export type AnchorPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface FloatingPosition {
  x: number
  y: number
  anchor: AnchorPosition
}

export interface SnapInfo {
  x?: 'left' | 'right'
  y?: 'top' | 'bottom'
}

/** Safe insets to prevent toolbars from covering header/timeline */
export const SAFE_INSETS = {
  top: 84,    // Below ToolsBar default
  right: 16,
  bottom: 112, // Above SettingsBar default
  left: 16,
} as const

/** Snap distance thresholds (pixels) */
export const SNAP_THRESHOLDS = {
  snapIn: 30,  // Snap when within 30px of edge
  snapOut: 45, // Release snap when beyond 45px
  snapInTouch: 40,  // Touch: 40px snap distance
  snapOutTouch: 55, // Touch: 55px release distance
} as const

interface StoredPositionsV3 {
  toolsBar?: FloatingPosition
  settingsBar?: FloatingPosition
}

const STORAGE_KEY_V3 = 'stadthalle.toolbar-positions.v3'
const STORAGE_KEY_V2 = 'stadthalle.toolbar-positions.v2'
const OLD_STORAGE_KEY = 'stadthalle.floating-positions'

/** Load saved positions from localStorage (v3), migrate from v2 or old keys if needed. */
export function loadSavedPositions(): StoredPositionsV3 {
  try {
    // Try v3 first
    const stored = localStorage.getItem(STORAGE_KEY_V3)
    if (stored) return JSON.parse(stored)

    // Migrate from v2 if exists
    const storedV2 = localStorage.getItem(STORAGE_KEY_V2)
    if (storedV2) {
      const v2Data = JSON.parse(storedV2)
      localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(v2Data))
      localStorage.removeItem(STORAGE_KEY_V2)
      return v2Data
    }

    // Migrate from old key if exists
    const oldStored = localStorage.getItem(OLD_STORAGE_KEY)
    if (oldStored) {
      const oldData = JSON.parse(oldStored)
      const migrated: StoredPositionsV3 = {
        toolsBar: oldData.toolsToolbar,
        settingsBar: oldData.settingsToolbar,
      }
      localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(migrated))
      localStorage.removeItem(OLD_STORAGE_KEY)
      return migrated
    }
  } catch (e) {
    console.error('Failed to load floating positions:', e)
  }
  return {}
}

/** Save positions to localStorage (v3). */
export function savePositions(positions: StoredPositionsV3): void {
  try {
    localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(positions))
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

/**
 * Apply edge snapping with hysterese and alt-key override.
 * Returns snapped position and snap info for visual feedback.
 * Respects SAFE_INSETS to avoid covering important UI.
 */
export function applyEdgeSnap(
  position: { x: number; y: number },
  toolbarWidth: number,
  toolbarHeight: number,
  isTouch: boolean,
  snapState?: SnapInfo
): { position: { x: number; y: number }; snap: SnapInfo } {
  // Check alt-key to disable snapping (if we're in an event context)
  // Note: This is handled at the component level during drag

  const vw = window.innerWidth
  const vh = window.innerHeight

  const snapIn = isTouch ? SNAP_THRESHOLDS.snapInTouch : SNAP_THRESHOLDS.snapIn
  const snapOut = isTouch ? SNAP_THRESHOLDS.snapOutTouch : SNAP_THRESHOLDS.snapOut

  let newX = position.x
  let newY = position.y
  const snap: SnapInfo = {}

  // X-axis snapping (left/right edges)
  const distFromLeft = position.x
  const distFromRight = vw - (position.x + toolbarWidth)

  // Snap to left edge if within range
  if (
    distFromLeft < snapIn ||
    (snapState?.x === 'left' && distFromLeft < snapOut)
  ) {
    newX = SAFE_INSETS.left
    snap.x = 'left'
  }
  // Snap to right edge if within range
  else if (
    distFromRight < snapIn ||
    (snapState?.x === 'right' && distFromRight < snapOut)
  ) {
    newX = vw - toolbarWidth - SAFE_INSETS.right
    snap.x = 'right'
  }

  // Y-axis snapping (top/bottom edges)
  const distFromTop = position.y
  const distFromBottom = vh - (position.y + toolbarHeight)

  // Snap to top edge if within range
  if (
    distFromTop < snapIn ||
    (snapState?.y === 'top' && distFromTop < snapOut)
  ) {
    newY = SAFE_INSETS.top
    snap.y = 'top'
  }
  // Snap to bottom edge if within range
  else if (
    distFromBottom < snapIn ||
    (snapState?.y === 'bottom' && distFromBottom < snapOut)
  ) {
    newY = vh - toolbarHeight - SAFE_INSETS.bottom
    snap.y = 'bottom'
  }

  return {
    position: { x: newX, y: newY },
    snap,
  }
}
