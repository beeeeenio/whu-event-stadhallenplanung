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
  const rotateItem = useEventStore((s) => s.rotateItem)
  const duplicateItem = useEventStore((s) => s.duplicateItem)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
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
        return
      }

      if (!isMod && e.key.toLowerCase() === 'r' && selectedId) {
        e.preventDefault()
        rotateItem(selectedId, e.shiftKey ? -90 : 90)
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeItem(selectedId)
        setSelectedId(null)
        return
      }

      if (e.key === '?' && !isMod) {
        setShortcutsOpen((v) => !v)
        return
      }

      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null)
        else setShortcutsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, duplicateItem, rotateItem, removeItem, selectedId])

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
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-gray-100">
                <span className="font-semibold text-gray-800 text-sm">Objekt-Eigenschaften</span>
                <button
                  onClick={() => setSelectedId(null)}
                  title="Schließen (Esc)"
                  className="text-gray-400 hover:text-gray-700 leading-none text-base px-1 -mr-1"
                >
                  ×
                </button>
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">
                  Drehung: {Math.round(selectedItem.phaseData[currentPhaseId]?.rotation ?? 0)}°
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => rotateItem(selectedItem.id, -90)}
                    title="90° gegen den Uhrzeigersinn drehen (Umschalt+R)"
                    className="w-6 h-6 flex items-center justify-center border border-gray-200 rounded hover:bg-gray-50"
                  >
                    ⟲
                  </button>
                  <button
                    onClick={() => rotateItem(selectedItem.id, 90)}
                    title="90° im Uhrzeigersinn drehen (R)"
                    className="w-6 h-6 flex items-center justify-center border border-gray-200 rounded hover:bg-gray-50"
                  >
                    ⟳
                  </button>
                </div>
              </div>
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

          <button
            onClick={() => setShortcutsOpen((v) => !v)}
            title="Tastatur-Shortcuts (?)"
            className="absolute bottom-3 left-3 w-7 h-7 rounded-full bg-white border border-gray-200 shadow text-gray-500 hover:text-gray-800 hover:bg-gray-50 flex items-center justify-center text-sm font-medium"
          >
            ?
          </button>
          {shortcutsOpen && (
            <div className="absolute bottom-12 left-3 bg-white shadow-lg border border-gray-200 rounded-lg p-3.5 w-64 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-gray-100">
                <span className="font-semibold text-gray-800 text-sm">Tastatur-Shortcuts</span>
                <button
                  onClick={() => setShortcutsOpen(false)}
                  className="text-gray-400 hover:text-gray-700 leading-none text-base px-1 -mr-1"
                >
                  ×
                </button>
              </div>
              <ul className="space-y-1 text-gray-600">
                <li className="flex justify-between"><span>Objekt drehen</span><span className="font-mono text-gray-400">R</span></li>
                <li className="flex justify-between"><span>… gegen Uhrzeigersinn</span><span className="font-mono text-gray-400">⇧R</span></li>
                <li className="flex justify-between"><span>Duplizieren</span><span className="font-mono text-gray-400">⌘D</span></li>
                <li className="flex justify-between"><span>Löschen</span><span className="font-mono text-gray-400">⌫</span></li>
                <li className="flex justify-between"><span>Abwählen / schließen</span><span className="font-mono text-gray-400">Esc</span></li>
                <li className="flex justify-between"><span>Rückgängig</span><span className="font-mono text-gray-400">⌘Z</span></li>
                <li className="flex justify-between"><span>Wiederholen</span><span className="font-mono text-gray-400">⌘⇧Z</span></li>
                <li className="flex justify-between"><span>Diese Hilfe</span><span className="font-mono text-gray-400">?</span></li>
              </ul>
            </div>
          )}
        </div>
        <InventoryPanel selectedId={selectedId} onSelect={setSelectedId} />
      </div>
    </div>
  )
}
