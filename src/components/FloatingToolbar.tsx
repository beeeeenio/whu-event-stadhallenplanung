import { useEffect, useRef, useState, useCallback } from 'react'
import type { FloatingPosition } from '../utils/floatingPosition'
import type { ToolMode } from './CanvasEditor'
import type { PickerTab } from './ObjectPicker'
import type { ItemType } from '../types'
import type { Placement } from '../utils/placement'
import {
  loadSavedPositions,
  savePositions,
  anchorToStyle,
  clampPosition,
  detectAnchor,
  getOffsetFromAnchor,
} from '../utils/floatingPosition'
import { island, islandBtn, Z } from '../utils/ui'

type ActivePanel = 'picker' | 'inventory' | 'properties' | 'grid' | 'command' | 'text' | 'shortcuts' | null

interface FloatingToolbarProps {
  // Tools toolbar (old dock)
  tool: ToolMode
  onToolChange: (tool: ToolMode) => void
  placement: (Placement & { type?: ItemType }) | null
  onPlacementDone: () => void
  activePanel: ActivePanel
  onPanelChange: (panel: ActivePanel) => void
  pickerTab: PickerTab
  onPickerTabChange: (tab: PickerTab) => void
  onOpenPicker: (tab: PickerTab) => void

  // Settings toolbar
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onExportImage: () => void
  gridEnabled: boolean
  onGridToggle: () => void
}

/** Single draggable floating toolbar container */
function DraggableBar({
  barKey,
  defaultPosition,
  label,
  children,
}: {
  barKey: 'toolsBar' | 'settingsBar'
  defaultPosition: FloatingPosition
  label: string
  children: React.ReactNode
}) {
  const [position, setPosition] = useState(defaultPosition)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ width: 200, height: 200 })
  const containerRef = useRef<HTMLDivElement>(null)

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

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setIsDragging(true)
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return

      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y

      const clamped = clampPosition(newX, newY, size.width, size.height)
      const anchor = detectAnchor(clamped.x, clamped.y, size.width, size.height)
      const offset = getOffsetFromAnchor(clamped.x, clamped.y, size.width, size.height, anchor)

      setPosition({ x: offset.x, y: offset.y, anchor })
    },
    [isDragging, dragOffset, size]
  )

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
    }
  }, [isDragging])

  useEffect(() => {
    if (!isDragging) return
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Save position on release
  useEffect(() => {
    if (!isDragging) {
      const saved = loadSavedPositions()
      savePositions({
        toolsBar: barKey === 'toolsBar' ? position : saved.toolsBar,
        settingsBar: barKey === 'settingsBar' ? position : saved.settingsBar,
      })
    }
  }, [isDragging, position, barKey])

  const style = anchorToStyle(position)
  const isSettingsBar = barKey === 'settingsBar'

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        ...style,
        zIndex: Z.toolbars,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className={`flex flex-col ${isSettingsBar ? 'gap-0.5 p-1' : 'gap-1.5 p-2'} select-none touch-none ${island}`}
      onMouseDown={handleMouseDown}
      title={label}
    >
      {/* Drag handle */}
      <div className={`${isSettingsBar ? 'w-8 h-0.5' : 'w-12 h-1'} bg-line rounded-full mx-auto mb-0.5`} />

      {/* Content */}
      {children}
    </div>
  )
}

// Helper functions for dock tools
function svg(d: React.ReactNode) {
  return (
    <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  )
}

function dockTool(
  key: ToolMode,
  label: string,
  icon: React.ReactNode,
  shortcut: string,
  currentTool: ToolMode,
  placement: (Placement & { type?: ItemType }) | null,
  onClick: () => void
) {
  const active = currentTool === key && !placement
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`h-11 w-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
        active ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
      }`}
      title={`${label} (${shortcut})`}
    >
      {icon}
      {label}
    </button>
  )
}

export default function FloatingToolbar({
  tool,
  onToolChange,
  placement,
  onPlacementDone,
  activePanel,
  onPanelChange,
  pickerTab,
  onPickerTabChange,
  onOpenPicker,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onExportImage,
  gridEnabled,
  onGridToggle,
}: FloatingToolbarProps) {
  const positions = loadSavedPositions()

  // New defaults (Opus-Plan Schritt 1): ToolsBar top-left (16, 84), SettingsBar bottom-left (16, 112)
  const toolsPosition = positions.toolsBar || { x: 16, y: 84, anchor: 'top-left' as const }
  const settingsPosition = positions.settingsBar || { x: 16, y: 112, anchor: 'bottom-left' as const }

  return (
    <>
      {/* Tools Bar (old dock) */}
      <DraggableBar barKey="toolsBar" defaultPosition={toolsPosition} label="Werkzeuge">
        {/* Werkzeug-Dock Buttons */}
        {dockTool('select', 'Auswahl', svg(<path d="M5 3l14 8-6 2-2 6z" />), 'V', tool, placement, () => onToolChange('select'))}
        {dockTool('area', 'Bereich', svg(<rect x="4" y="6" width="16" height="12" strokeDasharray="3 2" />), 'B', tool, placement, () => onToolChange('area'))}
        {dockTool('measure', 'Messen', svg(<><path d="M3 17L17 3l4 4L7 21z" /><path d="M8 8l2 2M11 5l2 2M5 11l2 2" /></>), 'M', tool, placement, () => onToolChange('measure'))}

        <div className="w-px h-8 bg-line mx-auto my-0.5" />

        {/* Objekte Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (activePanel === 'picker' && (pickerTab === 'furniture' || pickerTab === 'infrastructure')) onPanelChange(null)
            else onOpenPicker(pickerTab === 'rows' || pickerTab === 'nivtec' ? 'furniture' : pickerTab)
          }}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            activePanel === 'picker' && (pickerTab === 'furniture' || pickerTab === 'infrastructure') ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="Objekt-Bibliothek (O)"
        >
          {svg(<path d="M12 5v14M5 12h14" />)}
          Objekte
        </button>

        {/* Reihen Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPickerTabChange('rows')
            onPanelChange(activePanel === 'picker' ? null : 'picker')
          }}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            activePanel === 'picker' && pickerTab === 'rows' ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="Stuhlreihen-Generator"
        >
          {svg(<>{[6, 12, 18].flatMap((x) => [8, 16].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} />))}</>)}
          Reihen
        </button>

        {/* NivTec Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPickerTabChange('nivtec')
            onPanelChange(activePanel === 'picker' ? null : 'picker')
          }}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            activePanel === 'picker' && pickerTab === 'nivtec' ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="NivTec Import"
        >
          {svg(<><path d="M12 15V4M8 8l4-4 4 4" /><path d="M4 15v4h16v-4" /></>)}
          NivTec
        </button>

        {/* Text Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPanelChange(activePanel === 'text' ? null : 'text')
          }}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            activePanel === 'text' ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="Freie Textbeschriftung in den Plan setzen"
        >
          {svg(<><path d="M5 6h14M12 6v13" /></>)}
          Text
        </button>

        {/* Fertig Button (when placing) */}
        {placement && (
          <>
            <div className="w-px h-8 bg-line mx-1" />
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPlacementDone()
              }}
              className="h-12 px-3 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover"
              title="Platzieren beenden (Esc)"
            >
              Fertig
            </button>
          </>
        )}
      </DraggableBar>

      {/* Settings Bar (compact icon column) */}
      <DraggableBar barKey="settingsBar" defaultPosition={settingsPosition} label="Einstellungen">
        {/* Zoom out button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onZoomOut()
          }}
          className={islandBtn('plain', 'h-9 w-9 p-0 text-sm')}
          title="Verkleinern (−)"
        >
          −
        </button>

        {/* Zoom reset button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onZoomReset()
          }}
          className={islandBtn('plain', 'h-9 w-9 p-0 text-xs')}
          title="Zoom zurücksetzen (1:1)"
        >
          {Math.round(zoom * 100) === 100 ? '1' : Math.round(zoom * 100)}
        </button>

        {/* Zoom in button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onZoomIn()
          }}
          className={islandBtn('plain', 'h-9 w-9 p-0 text-sm')}
          title="Vergrößern (+)"
        >
          +
        </button>

        {/* Separator */}
        <div className="w-8 h-px bg-line mx-auto my-0.5" />

        {/* Grid toggle button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onGridToggle()
          }}
          className={islandBtn(gridEnabled ? 'dark' : 'plain', 'h-9 w-9 p-0')}
          title="Gitter anzeigen/verbergen"
        >
          📐
        </button>

        {/* Export button - PDF format */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onExportImage()
          }}
          className={islandBtn('plain', 'h-9 w-9 p-0 text-lg')}
          title="Als PDF exportieren"
        >
          📄
        </button>
      </DraggableBar>
    </>
  )
}
