import { useEffect, useRef, useState, useCallback } from 'react'
import type { FloatingPosition } from '../utils/floatingPosition'
import {
  loadSavedPositions,
  savePositions,
  anchorToStyle,
  clampPosition,
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
  const containerRef = useRef<HTMLDivElement>(null)
  const pointerStartRef = useRef({ x: 0, y: 0, pointerId: -1 })

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

    // Try to capture pointer for smooth drag
    try {
      containerRef.current.setPointerCapture(e.pointerId)
    } catch (err) {
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
      setPosition({
        ...position,
        x: clamped.x,
        y: clamped.y,
      })
    },
    [isDragging, dragOffset, size, position, getDragThreshold]
  )

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (pointerStartRef.current.pointerId !== e.pointerId) return

      // Release pointer capture
      try {
        if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
          containerRef.current.releasePointerCapture(e.pointerId)
        }
      } catch (err) {
        // Ignore if releasePointerCapture fails
      }

      if (isDragging) {
        // Save position on drag release
        const saved = loadSavedPositions()
        savePositions({
          toolsBar: barKey === 'toolsBar' ? position : saved.toolsBar,
          settingsBar: barKey === 'settingsBar' ? position : saved.settingsBar,
        })
        setIsDragging(false)
      }

      pointerStartRef.current = { x: 0, y: 0, pointerId: -1 }
    },
    [isDragging, position, barKey]
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

  const style = anchorToStyle(position)
  const isSettingsBar = barKey === 'settingsBar'

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        ...style,
        zIndex: isDragging ? Z.toolbarDragging : Z.toolbars,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className={`flex flex-col ${isSettingsBar ? 'gap-0.5 p-1' : 'gap-1.5 p-2'} select-none touch-none transition-[box-shadow] ${island} ${
        isDragging ? 'shadow-[0_20px_40px_-8px_rgba(20,30,35,0.4)] ring-2 ring-accent/40' : ''
      }`}
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
