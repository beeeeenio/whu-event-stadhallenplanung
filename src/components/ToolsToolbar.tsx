import { useState, useEffect } from 'react'
import { island, islandBtn, Z } from '../utils/ui'
import type { FloatingPosition } from '../utils/floatingPosition'
import { getPixelPosition } from '../utils/floatingPosition'

interface ToolsToolbarProps {
  onMeasure: () => void
  onArea: () => void
  onDuplicate: () => void
  isMeasuring: boolean
  isAreaMode: boolean
  position: FloatingPosition
  onPositionChange: (pos: FloatingPosition) => void
}

export function ToolsToolbar({
  onMeasure,
  onArea,
  onDuplicate,
  isMeasuring,
  isAreaMode,
  position,
  onPositionChange,
}: ToolsToolbarProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const toolbarWidth = 200
  const toolbarHeight = 180

  const pixelPos = getPixelPosition(position, toolbarWidth, toolbarHeight)

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    setIsDragging(true)
    setDragOffset({ x: e.clientX - pixelPos.x, y: e.clientY - pixelPos.y })
  }

  const handleMouseMove = (e: MouseEvent) => {
    const newX = e.clientX - dragOffset.x
    const newY = e.clientY - dragOffset.y

    // Clamp to screen bounds
    const clampedX = Math.max(0, Math.min(newX, window.innerWidth - toolbarWidth))
    const clampedY = Math.max(0, Math.min(newY, window.innerHeight - toolbarHeight))

    // Detect anchor and calculate offset
    const centerX = clampedX + toolbarWidth / 2
    const centerY = clampedY + toolbarHeight / 2
    const isLeft = centerX < window.innerWidth / 2
    const isTop = centerY < window.innerHeight / 2

    let anchor: FloatingPosition['anchor'] = 'top-left'
    if (isTop && isLeft) anchor = 'top-left'
    else if (isTop && !isLeft) anchor = 'top-right'
    else if (!isTop && isLeft) anchor = 'bottom-left'
    else anchor = 'bottom-right'

    // Calculate offset from anchor
    let offsetX = 0, offsetY = 0
    switch (anchor) {
      case 'top-left':
        offsetX = clampedX
        offsetY = clampedY
        break
      case 'top-right':
        offsetX = window.innerWidth - clampedX - toolbarWidth
        offsetY = clampedY
        break
      case 'bottom-left':
        offsetX = clampedX
        offsetY = window.innerHeight - clampedY - toolbarHeight
        break
      case 'bottom-right':
        offsetX = window.innerWidth - clampedX - toolbarWidth
        offsetY = window.innerHeight - clampedY - toolbarHeight
        break
    }

    onPositionChange({ x: offsetX, y: offsetY, anchor })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Attach listeners when dragging
  useEffect(() => {
    if (!isDragging) return
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset.x, dragOffset.y, position])

  return (
    <div
      style={{
        position: 'fixed',
        left: `${pixelPos.x}px`,
        top: `${pixelPos.y}px`,
        zIndex: Z.toolbars,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className={`flex flex-col gap-1.5 p-2 select-none ${island}`}
      onMouseDown={handleMouseDown}
    >
      {/* Drag handle */}
      <div className="w-12 h-1 bg-line rounded-full mx-auto mb-0.5" />

      {/* Tools buttons */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onMeasure()
        }}
        className={islandBtn(isMeasuring ? 'dark' : 'plain', 'w-full justify-center')}
        title="Messwerkzeug (M)"
      >
        📏 Messen
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onArea()
        }}
        className={islandBtn(isAreaMode ? 'dark' : 'plain', 'w-full justify-center')}
        title="Bereich zeichnen (A)"
      >
        ◻ Bereich
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onDuplicate()
        }}
        className={islandBtn('plain', 'w-full justify-center')}
        title="Duplizieren (Strg+D)"
      >
        ⧉ Duplizieren
      </button>
    </div>
  )
}
