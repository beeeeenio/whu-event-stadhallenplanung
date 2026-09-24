import { useEffect, useRef, useState } from 'react'
import Sidebar from './Sidebar'
import Toolbar from './Toolbar'
import CanvasEditor, { type CanvasEditorHandle } from './CanvasEditor'
import InventoryPanel from './InventoryPanel'
import PhasesPanel from './PhasesPanel'
import PresentationMode from './PresentationMode'
import { useEventStore, AREA_COLORS } from '../store/store'
import { DEFAULT_PIXELS_PER_METER } from '../utils/scale'
import { exportPhaseToPdf } from '../utils/pdfExport'
import { btn, input as inputCls } from '../utils/ui'

export default function EditorView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [presenting, setPresenting] = useState(false)
  const canvasRef = useRef<CanvasEditorHandle>(null)
  const eventName = useEventStore((s) => s.eventName)
  const phases = useEventStore((s) => s.phases)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const removeItem = useEventStore((s) => s.removeItem)
  const renameItem = useEventStore((s) => s.renameItem)
  const resizeItem = useEventStore((s) => s.resizeItem)
  const setItemColor = useEventStore((s) => s.setItemColor)
  const duplicateItem = useEventStore((s) => s.duplicateItem)
  const undo = useEventStore((s) => s.undo)
  const redo = useEventStore((s) => s.redo)
  const items = useEventStore((s) => s.items)
  const selectedItem = selectedId ? items[selectedId] : null

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.ctrlKey || e.metaKey
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }

      if (isMod && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()
        const newId = duplicateItem(selectedId)
        if (newId) setSelectedId(newId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, duplicateItem, selectedId])

  const handleExportPdf = async () => {
    const planImageDataUrl = await canvasRef.current?.exportSnapshot()
    const phase = phases.find((p) => p.id === currentPhaseId)
    exportPhaseToPdf({ eventName, phase, items, currentPhaseId, planImageDataUrl })
  }

  if (presenting) return <PresentationMode onClose={() => setPresenting(false)} />

  return (
    <div className="h-screen w-screen flex flex-col">
      <Toolbar onExportPdf={handleExportPdf} onPresent={() => setPresenting(true)} />
      <div className="flex-1 flex min-h-0">
        <PhasesPanel />
        <Sidebar />
        <div className="flex-1 relative min-w-0">
          <CanvasEditor
            ref={canvasRef}
            pixelsPerMeter={DEFAULT_PIXELS_PER_METER}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {selectedItem && (
            <div className="absolute top-3 right-3 bg-white shadow-lg border border-gray-200 rounded-lg p-3.5 w-60 text-xs space-y-3">
              <div className="font-semibold text-gray-800 text-sm pb-1 border-b border-gray-100">
                Objekt-Eigenschaften
              </div>
              <label className="block space-y-1">
                <span className="text-gray-500">Bezeichnung</span>
                <input
                  className={`w-full ${inputCls}`}
                  value={selectedItem.label}
                  onChange={(e) => renameItem(selectedItem.id, e.target.value)}
                />
              </label>
              {selectedItem.type === 'area' ? (
                <div className="flex gap-2">
                  <label className="flex-1 space-y-1">
                    <span className="text-gray-500">Breite (m)</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      value={selectedItem.width}
                      onChange={(e) => resizeItem(selectedItem.id, Number(e.target.value), selectedItem.height)}
                      className={`w-full ${inputCls}`}
                    />
                  </label>
                  <label className="flex-1 space-y-1">
                    <span className="text-gray-500">Tiefe (m)</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      value={selectedItem.height}
                      onChange={(e) => resizeItem(selectedItem.id, selectedItem.width, Number(e.target.value))}
                      className={`w-full ${inputCls}`}
                    />
                  </label>
                </div>
              ) : (
                <div className="text-gray-500">
                  Größe: {selectedItem.width}m × {selectedItem.height}m
                </div>
              )}
              {selectedItem.type === 'area' && (
                <div>
                  <div className="text-gray-500 mb-1.5">Farbe</div>
                  <div className="flex flex-wrap gap-1.5">
                    {AREA_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setItemColor(selectedItem.id, color)}
                        style={{ backgroundColor: color }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
                          (selectedItem.color ?? AREA_COLORS[0]) === color ? 'border-gray-800' : 'border-transparent'
                        }`}
                        title={color}
                      />
                    ))}
                    <input
                      type="color"
                      value={selectedItem.color ?? AREA_COLORS[0]}
                      onChange={(e) => setItemColor(selectedItem.id, e.target.value)}
                      className="w-5 h-5 rounded-full overflow-hidden border-2 border-transparent cursor-pointer"
                      title="Eigene Farbe"
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5 pt-1">
                <button
                  onClick={() => {
                    const newId = duplicateItem(selectedItem.id)
                    if (newId) setSelectedId(newId)
                  }}
                  className={`w-full ${btn('primaryOutline', 'sm')}`}
                  title="Strg/Cmd+D"
                >
                  ⧉ Duplizieren
                </button>
                <button
                  onClick={() => {
                    removeItem(selectedItem.id)
                    setSelectedId(null)
                  }}
                  className={`w-full ${btn('dangerOutline', 'sm')}`}
                >
                  Objekt löschen
                </button>
              </div>
            </div>
          )}
        </div>
        <InventoryPanel selectedId={selectedId} onSelect={setSelectedId} />
      </div>
    </div>
  )
}
