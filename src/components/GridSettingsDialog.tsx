import { useState } from 'react'
import { btn, island } from '../utils/ui'

interface GridSettingsDialogProps {
  isOpen: boolean
  gridEnabled: boolean
  gridSize: number
  onGridEnabledChange: (enabled: boolean) => void
  onGridSizeChange: (size: number) => void
  onClose: () => void
}

export default function GridSettingsDialog({
  isOpen,
  gridEnabled,
  gridSize,
  onGridEnabledChange,
  onGridSizeChange,
  onClose,
}: GridSettingsDialogProps) {
  const [tempSize, setTempSize] = useState(gridSize)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className={`${island} max-w-sm w-full mx-4 p-6 flex flex-col gap-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">Gitter-Einstellungen</h2>

        {/* Checkbox für Gitter aktivieren */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={gridEnabled}
            onChange={(e) => onGridEnabledChange(e.target.checked)}
            className="accent-[#1e5e7a] w-4 h-4"
          />
          <span className="text-sm text-ink font-medium">Gitter aktivieren</span>
        </label>

        {/* Slider für Gitter-Größe */}
        {gridEnabled && (
          <div className="space-y-3">
            <label className="text-xs font-semibold text-ink3 uppercase tracking-[0.1em]">
              Gitter-Größe: {tempSize}px
            </label>
            <input
              type="range"
              min="10"
              max="50"
              step="5"
              value={tempSize}
              onChange={(e) => {
                const newSize = parseInt(e.target.value, 10)
                setTempSize(newSize)
                onGridSizeChange(newSize)
              }}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-ink3">
              <span>10px</span>
              <span>50px</span>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className={btn('outline', 'sm')}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
