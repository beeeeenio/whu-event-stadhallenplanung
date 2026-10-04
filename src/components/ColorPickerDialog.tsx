import { useState } from 'react'
import { btn } from '../utils/ui'

interface ColorPickerDialogProps {
  isOpen: boolean
  currentColor?: string
  onApply: (color: string) => void
  onCancel: () => void
}

/** Preset color palette: type → color mapping */
const PRESET_COLORS = [
  { label: 'Tisch', color: '#FCD34D' },      // yellow
  { label: 'Stuhl', color: '#F87171' },      // red
  { label: 'Dekor', color: '#A78BFA' },      // purple
  { label: 'Bereich', color: '#60A5FA' },    // blue
  { label: 'Grau', color: '#D1D5DB' },       // grey
  { label: 'Grün', color: '#10b981' },       // green
]

export default function ColorPickerDialog({
  isOpen,
  currentColor = '#FCD34D',
  onApply,
  onCancel,
}: ColorPickerDialogProps) {
  const [customHex, setCustomHex] = useState(currentColor)
  const [selectedColor, setSelectedColor] = useState(currentColor)

  if (!isOpen) return null

  const handleApply = () => {
    onApply(selectedColor || customHex)
  }

  const handlePresetClick = (color: string) => {
    setSelectedColor(color)
    setCustomHex(color)
  }

  const handleCustomHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCustomHex(value)
    // Validate hex format: #RRGGBB or RRGGBB
    if (/^#?[0-9A-Fa-f]{6}$/.test(value)) {
      setSelectedColor(value.startsWith('#') ? value : `#${value}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Farbe wählen</h2>

        {/* Preset colors grid */}
        <div className="mb-6">
          <div className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-[0.1em]">
            Vordefinierte Farben
          </div>
          <div className="grid grid-cols-3 gap-3">
            {PRESET_COLORS.map(({ label, color }) => (
              <button
                key={color}
                onClick={() => handlePresetClick(color)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
                  selectedColor === color ? 'ring-2 ring-offset-1 ring-gray-400 bg-gray-50' : 'hover:bg-gray-50'
                }`}
                title={label}
              >
                <div
                  className="w-12 h-12 rounded-lg border border-gray-200 shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-gray-600 text-center font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom hex input */}
        <div className="mb-6">
          <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-[0.1em]">
            Benutzerdefiniert
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={customHex}
              onChange={handleCustomHexChange}
              placeholder="#FCD34D"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div
              className="w-10 h-10 rounded-lg border border-gray-200 shadow-sm"
              style={{ backgroundColor: selectedColor || customHex }}
            />
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Format: #RRGGBB (z.B. #FF5733)</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={onCancel} className={btn('outline', 'md')}>
            Abbrechen
          </button>
          <button onClick={handleApply} className={btn('primary', 'md')}>
            Anwenden
          </button>
        </div>
      </div>
    </div>
  )
}
