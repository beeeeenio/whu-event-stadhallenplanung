import { useEffect, useRef, useState, useCallback } from 'react'
import type { FloatingPosition, SnapInfo, DirectionalSnapState } from '../utils/floatingPosition'
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
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 200, height: 200 })
  const [snapInfo, setSnapInfo] = useState<SnapInfo>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const pointerStartRef = useRef({ x: 0, y: 0, pointerId: -1 })
  const dirSnapRef = useRef<DirectionalSnapState>({ side: null, turn: 0 })

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
  }, [])

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

    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    }

    // Initialize directional snap state
    dirSnapRef.current = { side: null, turn: 0 }

    // Try to capture pointer for smooth drag
    try {
      containerRef.current.setPointerCapture(e.pointerId)
      // eslint-disable-next-line no-unused-vars
    } catch (_) {
      // Ignore if setPointerCapture fails
    }

    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }, [])

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (pointerStartRef.current.pointerId === -1 || !containerRef.current) return

      const threshold = getDragThreshold(e as PointerEvent)
      const dx = e.clientX - pointerStartRef.current.x
      const dy = e.clientY - pointerStartRef.current.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Start drag if threshold exceeded
      if (distance > threshold && !isDragging) {
        setIsDragging(true)
      }

      if (!isDragging) return

      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y

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
          pointerStartRef.current,
          { x: e.clientX, y: e.clientY },
          dirSnapRef.current,
          size,
          window.innerWidth,
          window.innerHeight,
          isTouchInput(e as PointerEvent)
        )
        dirSnapRef.current = snapResult.state
      }

      setPosition({
        ...position,
        x: snapResult.position.x,
        y: snapResult.position.y,
      })
      setSnapInfo(snapResult.snap)
    },
    [isDragging, dragOffset, size, position, getDragThreshold, isTouchInput]
  )

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (pointerStartRef.current.pointerId !== e.pointerId) return

      // Release pointer capture
      try {
        if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
          containerRef.current.releasePointerCapture(e.pointerId)
        }
        // eslint-disable-next-line no-unused-vars
      } catch (_) {
        // Ignore if releasePointerCapture fails
      }

      if (isDragging) {
        // Read directional snap state from ref (not from closure)
        const snapState = dirSnapRef.current
        const newX = position.x
        const newY = position.y

        // Detect anchor based on current position
        let anchor = detectAnchor(newX, newY, size.width, size.height)

        // Override anchor with snap side if applicable
        if (snapState.side === 'left') {
          anchor = 'top-left'
        } else if (snapState.side === 'right') {
          anchor = 'top-right'
        } else if (snapState.side === 'bottom') {
          anchor = 'bottom-left'
        } else if (snapState.side === 'top') {
          anchor = 'top-left'
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
        setIsDragging(false)
        setSnapInfo({})
      }

      pointerStartRef.current = { x: 0, y: 0, pointerId: -1 }
      dirSnapRef.current = { side: null, turn: 0 }
    },
    [isDragging, position, size, barKey]
  )

  const handleGripDoubleClick = useCallback(() => {
    // Reset to default position on double-click
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
  }, [handlePointerMove, handlePointerUp])

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
        data-grip
        onDoubleClick={handleGripDoubleClick}
        className={`${isSettingsBar ? 'w-8 h-0.5' : 'w-12 h-1'} bg-line rounded-full mx-auto mb-0.5 touch:${isSettingsBar ? 'h-5' : 'h-5'} cursor-grab active:cursor-grabbing hover:bg-ink3`}
        title={`${label} - Doppelklick zum Zurücksetzen`}
      />

      {/* Content */}
      {children}
    </div>
  )
}
