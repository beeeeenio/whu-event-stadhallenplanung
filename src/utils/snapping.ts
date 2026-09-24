export interface SnapTarget {
  x?: number
  y?: number
}

const SNAP_THRESHOLD_PX = 10

/** Snaps a candidate point to the nearest guide line (other object edges, grid) within threshold. */
export function snapToGuides(
  x: number,
  y: number,
  guidesX: number[],
  guidesY: number[],
): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
  let snapX = x
  let snapY = y
  let snappedX = false
  let snappedY = false

  for (const gx of guidesX) {
    if (Math.abs(x - gx) < SNAP_THRESHOLD_PX) {
      snapX = gx
      snappedX = true
      break
    }
  }
  for (const gy of guidesY) {
    if (Math.abs(y - gy) < SNAP_THRESHOLD_PX) {
      snapY = gy
      snappedY = true
      break
    }
  }

  return { x: snapX, y: snapY, snappedX, snappedY }
}

export function snapToGrid(x: number, y: number, gridSize: number) {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  }
}
