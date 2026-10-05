import { useEffect, useRef, useState, useCallback } from 'react'
import type { FloatingPosition, SnapInfo, DirectionalSnapState, AnchorPosition } from '../utils/floatingPosition'
import {
  loadSavedPositions,
  savePositions,
  anchorToStyle,
  clampPosition,
  applyDirectionalSnap,
  detectAnchor,
  getOffsetFromAnchor,
} from '../utils/floatingPosition'
import { island, Z } from '../utils/ui'

interface DraggableBarProps {
  barKey: 'toolsBar' | 'settingsBar'
  defaultPosition: FloatingPosition
  label: string
  children: React.ReactNode
}

const DRAG_THRESHOLD_MOUSE = 3 // pixels
const DRAG_THRESHOLD_TOUCH = 6 // pixels

interface DragState {
  isDragging: boolean
  position: { x: number; y: number }
  dragOffset: { x: number; y: number }
  startPointer: { x: number; y: number }
  pointerId: number
}

/**
 * Draggable floating toolbar container with pointer events.
 * Supports mouse, touch, and pen input with proper drag detection.
 * Saves position on release, double-tap grip to reset to default.
 * Direction-based snap: determines snap side from drag direction.
 */
export default function DraggableBar({
  barKey,
  defaultPosition,
  label,
  children,
}: DraggableBarProps) {
  const [position, setPosition] = useState(defaultPosition)
  const [size, setSize] = useState({ width: 200, height: 200 })
  const [snapInfo, setSnapInfo] = useState<SnapInfo>({})
  const [isDragging, setIsDragging] = useState(false) // For UI only (cursor, z-index)
  const containerRef = useRef<HTMLDivElement>(null)
  const gripRef = useRef<HTMLDivElement>(null)
  const dirSnapRef = useRef<DirectionalSnapState>({ side: null, turn: 0 })

  const dragStateRef = useRef<DragState>({
    isDragging: false,
    position: { x: defaultPosition.x, y: defaultPosition.y },
    dragOffset: { x: 0, y: 0 },
    startPointer: { x: 0, y: 0 },
    pointerId: -1,
  })

  // Measure size with ResizeObserver
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [barKey, defaultPosition])

  // Detect if touch/pen input
  const isTouchInput = useCallback((e: PointerEvent): boolean => {
    return e.pointerType === 'touch' || e.pointerType === 'pen'
  }, [])

  // Get drag threshold based on input type
  const getDragThreshold = useCallback(
    (e: PointerEvent): number => {
      return isTouchInput(e) ? DRAG_THRESHOLD_TOUCH : DRAG_THRESHOLD_MOUSE
    },
    [isTouchInput]
  )

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore if clicking on a button or interactive element
    if ((e.target as HTMLElement).closest('button')) return
    if ((e.target as HTMLElement).closest('[role="button"]')) return

    // Only handle primary pointer (left click / single touch)
    if (e.button !== 0) return

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || !containerRef.current) return

    // Get current position from displayStyle or dragStateRef
    const currentX = dragStateRef.current.position.x
    const currentY = dragStateRef.current.position.y

    // Initialize drag state in ref
    dragStateRef.current = {
      isDragging: false,
      position: { x: currentX, y: currentY },
      dragOffset: {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      },
      startPointer: { x: e.clientX, y: e.clientY },
      pointerId: e.pointerId,
    }

    // Initialize directional snap state
    dirSnapRef.current = { side: null, turn: 0 }

    // NOTE: setPointerCapture will be called AFTER threshold is exceeded in handlePointerMove
  }, [barKey])

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const dragState = dragStateRef.current
      if (dragState.pointerId === -1 || !containerRef.current) return

      const threshold = getDragThreshold(e as PointerEvent)
      const dx = e.clientX - dragState.startPointer.x
      const dy = e.clientY - dragState.startPointer.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Start drag if threshold exceeded
      if (distance > threshold && !dragState.isDragging) {
        dragStateRef.current.isDragging = true
        setIsDragging(true)
        // NOW capture pointer after threshold is exceeded
        try {
          containerRef.current.setPointerCapture(dragState.pointerId)
          // eslint-disable-next-line no-unused-vars
        } catch (_) {
          // Ignore if setPointerCapture fails
        }
        // Continue without return
      }

      if (!dragState.isDragging) return

      // Calculate new position based on pointer movement
      const newX = e.clientX - dragState.dragOffset.x
      const newY = e.clientY - dragState.dragOffset.y

      const clamped = clampPosition(newX, newY, size.width, size.height)

      // Apply directional snap (unless alt-key is pressed)
      let snapResult
      if (e.altKey) {
        // Alt key disables snapping
        snapResult = { position: clamped, state: { side: null, turn: 0 }, snap: {} as SnapInfo }
        dirSnapRef.current = { side: null, turn: 0 }
      } else {
        snapResult = applyDirectionalSnap(
          clamped,
          dragState.startPointer,
          { x: e.clientX, y: e.clientY },
          dirSnapRef.current,
          size,
          window.innerWidth,
          window.innerHeight,
          isTouchInput(e as PointerEvent)
        )
        dirSnapRef.current = snapResult.state
      }

      // Store SNAPPED position in ref immediately (for pointerUp to read)
      // This is critical: we must save the snapped position, not the clamped one
      dragStateRef.current.position = { x: snapResult.position.x, y: snapResult.position.y }

      // Update state for rendering
      setPosition({
        x: snapResult.position.x,
        y: snapResult.position.y,
        anchor: position.anchor,
      })
      setSnapInfo(snapResult.snap)
    },
    [size, getDragThreshold, isTouchInput]
  )

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const dragState = dragStateRef.current
      if (dragState.pointerId !== e.pointerId) return

      // Release pointer capture
      try {
        if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
          containerRef.current.releasePointerCapture(e.pointerId)
        }
        // eslint-disable-next-line no-unused-vars
      } catch (_) {
        // Ignore if releasePointerCapture fails
      }

      if (dragState.isDragging) {
        // Read final position from dragStateRef (not from state closure)
        const newX = dragState.position.x
        const newY = dragState.position.y

        // Read directional snap state from ref
        const snapState = dirSnapRef.current

        // Detect anchor based on current position
        let anchor = detectAnchor(newX, newY, size.width, size.height)

        // Override anchor only for the snapped axis, preserve the other axis
        if (snapState.side === 'left' || snapState.side === 'right') {
          // Horizontal snap: override left/right part of anchor, keep top/bottom
          const isTop = anchor === 'top-left' || anchor === 'top-right'
          anchor = isTop
            ? (`top-${snapState.side}` as AnchorPosition)
            : (`bottom-${snapState.side}` as AnchorPosition)
        } else if (snapState.side === 'top' || snapState.side === 'bottom') {
          // Vertical snap: override top/bottom part of anchor, keep left/right
          const isLeft = anchor === 'top-left' || anchor === 'bottom-left'
          anchor = isLeft
            ? (`${snapState.side}-left` as AnchorPosition)
            : (`${snapState.side}-right` as AnchorPosition)
        }

        // Calculate offset from anchor for storage
        const offset = getOffsetFromAnchor(newX, newY, size.width, size.height, anchor)

        // Save position with calculated anchor
        const newPosition: FloatingPosition = {
          x: offset.x,
          y: offset.y,
          anchor,
        }

        const saved = loadSavedPositions()
        savePositions({
          toolsBar: barKey === 'toolsBar' ? newPosition : saved.toolsBar,
          settingsBar: barKey === 'settingsBar' ? newPosition : saved.settingsBar,
        })

        // Update component position to match saved state
        setPosition(newPosition)
        setSnapInfo({})
      }

      // Always reset drag state
      dragStateRef.current.isDragging = false
      dragStateRef.current.pointerId = -1
      setIsDragging(false)
      dirSnapRef.current = { side: null, turn: 0 }
    },
    [size, barKey]
  )

  const handleGripDoubleClick = useCallback(() => {
    // Reset to default position on double-click
    dragStateRef.current.position = { x: defaultPosition.x, y: defaultPosition.y }
    setPosition(defaultPosition)
    const saved = loadSavedPositions()
    savePositions({
      toolsBar: barKey === 'toolsBar' ? defaultPosition : saved.toolsBar,
      settingsBar: barKey === 'settingsBar' ? defaultPosition : saved.settingsBar,
    })
  }, [barKey, defaultPosition])

  // Global pointer move and up listeners
  useEffect(() => {
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp, barKey, defaultPosition])

  // During drag, use hardcoded 'top-left' anchor for positioning
  const displayStyle = isDragging
    ? { left: `${position.x}px`, top: `${position.y}px` }
    : anchorToStyle(position)

  const isSettingsBar = barKey === 'settingsBar'
  const isSnapped = Object.keys(snapInfo).length > 0

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        ...displayStyle,
        zIndex: isDragging ? Z.toolbarDragging : Z.toolbars,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className={`flex flex-col ${isSettingsBar ? 'gap-0.5 p-1' : 'gap-1.5 p-2'} select-none touch-none transition-[box-shadow,ring-color] duration-120 ${island} ${
        isDragging ? 'shadow-[0_20px_40px_-8px_rgba(20,30,35,0.4)]' : ''
      } ${isSnapped && isDragging ? 'ring-2 ring-accent/40' : ''}`}
      onPointerDown={handlePointerDown}
      title={label}
    >
      {/* Drag handle / grip */}
      <div
        ref={gripRef}
        data-grip
        onDoubleClick={handleGripDoubleClick}
        className={`${isSettingsBar ? 'w-8 h-1.5' : 'w-12 h-1.5'} bg-line rounded-full mx-auto mb-0.5 touch:${isSettingsBar ? 'h-2' : 'h-2'} cursor-grab active:cursor-grabbing hover:bg-ink3`}
        title={`${label} - Doppelklick zum Zurücksetzen`}
      />

      {/* Content */}
      {children}
    </div>
  )
}
