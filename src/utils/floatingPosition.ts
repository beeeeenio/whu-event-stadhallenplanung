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

export type SnapSide = 'left' | 'right' | 'top' | 'bottom'

export interface DirectionalSnapState {
  side: SnapSide | null
  turn: number
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

/** Directional snap thresholds based on drag direction */
export const DIRECTIONAL_SNAP = {
  threshold: 15, // pixels to determine dominant axis
  hysteresis: 35, // pixels to release snap (2.33x threshold)
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

/**
 * Apply directional snap based on drag direction with hysteresis.
 * Determines dominant axis and snaps to appropriate edge.
 * Pure function for testing.
 *
 * @param position Current position {x, y}
 * @param startPos Initial drag position {x, y}
 * @param pointer Current pointer position {x, y}
 * @param state Current snap state {side, turn}
 * @param rect Toolbar's bounding rect
 * @param vw Viewport width
 * @param vh Viewport height
 * @param _isTouch Whether input is touch/pen (for future threshold adjustments)
 * @returns {position, state, snap}
 */
export function applyDirectionalSnap(
  position: { x: number; y: number },
  startPos: { x: number; y: number },
  pointer: { x: number; y: number },
  state: DirectionalSnapState,
  rect: { width: number; height: number },
  vw: number,
  vh: number,
  _isTouch: boolean
): {
  position: { x: number; y: number }
  state: DirectionalSnapState
  snap: SnapInfo
} {
  const { width: toolbarWidth, height: toolbarHeight } = rect
  const threshold = DIRECTIONAL_SNAP.threshold
  const hysteresis = DIRECTIONAL_SNAP.hysteresis

  // Calculate drag deltas
  const dx = pointer.x - startPos.x
  const dy = pointer.y - startPos.y

  // Determine dominant axis (first to exceed threshold)
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  const isDominantHorizontal = absDx > absDy

  // Calculate distances to edges
  const distFromLeft = position.x
  const distFromRight = vw - (position.x + toolbarWidth)
  const distFromTop = position.y
  const distFromBottom = vh - (position.y + toolbarHeight)

  let newX = position.x
  let newY = position.y
  let newSide: SnapSide | null = null
  const snap: SnapInfo = {}

  // If already snapped and dominant axis changed significantly, release
  if (state.side) {
    const isLeftRight = state.side === 'left' || state.side === 'right'
    const isTopBottom = state.side === 'top' || state.side === 'bottom'

    // If snapped horizontally but dominant is now vertical by hysteresis
    if (isLeftRight && absDy > hysteresis && absDy > absDx) {
      state.side = null
      state.turn++
    }
    // If snapped vertically but dominant is now horizontal by hysteresis
    if (isTopBottom && absDx > hysteresis && absDx > absDy) {
      state.side = null
      state.turn++
    }
  }

  // Apply snapping based on dominant axis and state
  if (!state.side) {
    // Not snapped: determine if we should snap based on dominant axis
    if (isDominantHorizontal && absDx > threshold) {
      // Horizontal drag: check left/right
      if (dx > 0 && distFromRight < threshold) {
        // Moving right, snap to right
        newX = vw - toolbarWidth - SAFE_INSETS.right
        newSide = 'right'
        snap.x = 'right'
        // Clamp Y to safe insets
        newY = Math.max(SAFE_INSETS.top, Math.min(newY, vh - toolbarHeight - SAFE_INSETS.bottom))
      } else if (dx < 0 && distFromLeft < threshold) {
        // Moving left, snap to left
        newX = SAFE_INSETS.left
        newSide = 'left'
        snap.x = 'left'
        // Clamp Y to safe insets
        newY = Math.max(SAFE_INSETS.top, Math.min(newY, vh - toolbarHeight - SAFE_INSETS.bottom))
      }
    } else if (!isDominantHorizontal && absDy > threshold) {
      // Vertical drag: check top/bottom
      if (dy > 0 && distFromBottom < threshold) {
        // Moving down, snap to bottom
        newY = vh - toolbarHeight - SAFE_INSETS.bottom
        newSide = 'bottom'
        snap.y = 'bottom'
        // Clamp X to safe insets
        newX = Math.max(SAFE_INSETS.left, Math.min(newX, vw - toolbarWidth - SAFE_INSETS.right))
      } else if (dy < 0 && distFromTop < threshold) {
        // Moving up, snap to top
        newY = SAFE_INSETS.top
        newSide = 'top'
        snap.y = 'top'
        // Clamp X to safe insets
        newX = Math.max(SAFE_INSETS.left, Math.min(newX, vw - toolbarWidth - SAFE_INSETS.right))
      }
    }
  } else {
    // Already snapped: apply hysteresis-based release
    const isLeftRight = state.side === 'left' || state.side === 'right'

    if (isLeftRight) {
      // Snapped horizontally: release only if moved far enough away
      if (state.side === 'left' && distFromLeft > hysteresis) {
        // Released from left: don't re-snap left
        newSide = null
      } else if (state.side === 'right' && distFromRight > hysteresis) {
        // Released from right: don't re-snap right
        newSide = null
      } else {
        // Still snapped: maintain snap
        newSide = state.side
        if (state.side === 'left') {
          newX = SAFE_INSETS.left
          snap.x = 'left'
        } else {
          newX = vw - toolbarWidth - SAFE_INSETS.right
          snap.x = 'right'
        }
        // Clamp Y
        newY = Math.max(SAFE_INSETS.top, Math.min(newY, vh - toolbarHeight - SAFE_INSETS.bottom))
      }
    } else {
      // Snapped vertically: release only if moved far enough away
      if (state.side === 'top' && distFromTop > hysteresis) {
        // Released from top: don't re-snap top
        newSide = null
      } else if (state.side === 'bottom' && distFromBottom > hysteresis) {
        // Released from bottom: don't re-snap bottom
        newSide = null
      } else {
        // Still snapped: maintain snap
        newSide = state.side
        if (state.side === 'top') {
          newY = SAFE_INSETS.top
          snap.y = 'top'
        } else {
          newY = vh - toolbarHeight - SAFE_INSETS.bottom
          snap.y = 'bottom'
        }
        // Clamp X
        newX = Math.max(SAFE_INSETS.left, Math.min(newX, vw - toolbarWidth - SAFE_INSETS.right))
      }
    }
  }

  return {
    position: { x: newX, y: newY },
    state: { side: newSide, turn: state.turn },
    snap,
  }
}
