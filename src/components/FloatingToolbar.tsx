import { useState, useEffect } from 'react'
import { island } from '../utils/ui'

interface FloatingToolbarProps {
  onGridToggle: () => void
}

export default function FloatingToolbar({ onGridToggle }: FloatingToolbarProps) {
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('floatingToolbarPosition')
    return saved ? JSON.parse(saved) : { x: 20, y: 200 }
  })

  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  useEffect(() => {
    if (!isDragging) return

    const onMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 100))
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 60))
      setPosition({ x: newX, y: newY })
    }

    const onMouseUp = () => {
      setIsDragging(false)
      localStorage.setItem('floatingToolbarPosition', JSON.stringify(position))
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging, dragOffset, position])

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 45,
      }}
      className={`flex flex-col gap-1 p-1.5 rounded-xl cursor-move select-none ${island}`}
      onMouseDown={handleMouseDown}
    >
      {/* Drag-Handle */}
      <div className="w-10 h-1 bg-line rounded-full mx-auto mb-1" />

      {/* Grid-Button */}
      <button
        onClick={(e) => {
          e.stopPropagation() // Prevent drag when clicking
          onGridToggle()
        }}
        className="w-10 h-10 rounded-lg text-ink2 hover:text-ink flex items-center justify-center text-sm font-semibold border border-line hover:bg-chip"
        title="Gitter-Einstellungen (📐)"
      >
        📐
      </button>
    </div>
  )
}
