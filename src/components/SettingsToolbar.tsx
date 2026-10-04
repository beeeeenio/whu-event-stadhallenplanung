import { useState, useEffect } from 'react'
import { island, islandBtn, Z } from '../utils/ui'
import type { FloatingPosition } from '../utils/floatingPosition'
import { getPixelPosition } from '../utils/floatingPosition'

interface SettingsToolbarProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onExportImage: () => void
  gridEnabled: boolean
  onGridToggle: () => void
  position: FloatingPosition
  onPositionChange: (pos: FloatingPosition) => void
}

export function SettingsToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onExportImage,
  gridEnabled,
  onGridToggle,
  position,
  onPositionChange,
}: SettingsToolbarProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const toolbarWidth = 200
  const toolbarHeight = 240

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

      {/* Zoom controls */}
      <div className="flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onZoomOut()
          }}
          className={islandBtn('plain', '')}
          title="Verkleinern (−)"
        >
          −
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onZoomReset()
          }}
          className={islandBtn('plain', 'flex-1')}
          title="Zoom zurücksetzen (1:1)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onZoomIn()
          }}
          className={islandBtn('plain', '')}
          title="Vergrößern (+)"
        >
          +
        </button>
      </div>

      {/* Grid toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onGridToggle()
        }}
        className={islandBtn(gridEnabled ? 'dark' : 'plain', 'w-full justify-center')}
        title="Gitter anzeigen/verbergen"
      >
        📐 Gitter
      </button>

      {/* Export image */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onExportImage()
        }}
        className={islandBtn('plain', 'w-full justify-center')}
        title="Als PNG exportieren"
      >
        📸 Exportieren
      </button>

      {/* Zoom info */}
      <div className="text-[10px] text-ink3 text-center px-1 py-0.5">
        Scroll zum Zoomen
      </div>
    </div>
  )
}
