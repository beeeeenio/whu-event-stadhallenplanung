import { useEffect, useState } from 'react'
import type { FloatingPosition } from '../utils/floatingPosition'
import { loadSavedPositions, savePositions } from '../utils/floatingPosition'
import { ToolsToolbar } from './ToolsToolbar'
import { SettingsToolbar } from './SettingsToolbar'

interface FloatingToolbarProps {
  // Tools toolbar
  onMeasure: () => void
  onArea: () => void
  onDuplicate: () => void
  isMeasuring: boolean
  isAreaMode: boolean

  // Settings toolbar
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onExportImage: () => void
  gridEnabled: boolean
  onGridToggle: () => void
}

export default function FloatingToolbar({
  onMeasure,
  onArea,
  onDuplicate,
  isMeasuring,
  isAreaMode,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onExportImage,
  gridEnabled,
  onGridToggle,
}: FloatingToolbarProps) {
  const [savedPositions, setSavedPositions] = useState<{
    tools: FloatingPosition
    settings: FloatingPosition
  }>(() => {
    const saved = loadSavedPositions()
    return {
      tools: saved.toolsToolbar || { x: 20, y: 80, anchor: 'top-left' },
      settings: saved.settingsToolbar || { x: 20, y: 320, anchor: 'top-left' },
    }
  })

  // Save positions whenever they change
  useEffect(() => {
    savePositions({
      toolsToolbar: savedPositions.tools,
      settingsToolbar: savedPositions.settings,
    })
  }, [savedPositions])

  return (
    <>
      <ToolsToolbar
        onMeasure={onMeasure}
        onArea={onArea}
        onDuplicate={onDuplicate}
        isMeasuring={isMeasuring}
        isAreaMode={isAreaMode}
        position={savedPositions.tools}
        onPositionChange={(pos) =>
          setSavedPositions((prev) => ({ ...prev, tools: pos }))
        }
      />
      <SettingsToolbar
        zoom={zoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onZoomReset={onZoomReset}
        onExportImage={onExportImage}
        gridEnabled={gridEnabled}
        onGridToggle={onGridToggle}
        position={savedPositions.settings}
        onPositionChange={(pos) =>
          setSavedPositions((prev) => ({ ...prev, settings: pos }))
        }
      />
    </>
  )
}
