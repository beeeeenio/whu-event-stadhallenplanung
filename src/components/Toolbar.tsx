import { useEffect, useRef, useState } from 'react'
import { useEventStore } from '../store/store'
import { useProjectsStore } from '../store/projectsStore'
import type { LayerState } from '../types'
import { btn, dividerV, popoverPanel } from '../utils/ui'

const LAYER_LABELS: Record<keyof LayerState, string> = {
  walls: 'Grundriss',
  rigging: 'Bühnenzüge',
  power: '⚡ Strom/CEE',
  simplified: 'Vereinfacht',
}

interface Props {
  onExportPdf: () => Promise<void>
  onPresent: () => void
}

export default function Toolbar({ onExportPdf, onPresent }: Props) {
  const eventName = useEventStore((s) => s.eventName)
  const setEventName = useEventStore((s) => s.setEventName)
  const layers = useEventStore((s) => s.layers)
  const toggleLayer = useEventStore((s) => s.toggleLayer)
  const saalSplit = useEventStore((s) => s.saalSplit)
  const toggleSaal = useEventStore((s) => s.toggleSaal)
  const undo = useEventStore((s) => s.undo)
  const redo = useEventStore((s) => s.redo)
  const canUndo = useEventStore((s) => s.historyPast.length > 0)
  const canRedo = useEventStore((s) => s.historyFuture.length > 0)
  const closeProject = useProjectsStore((s) => s.closeProject)
  const [exporting, setExporting] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!viewMenuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [viewMenuOpen])

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-2.5 flex flex-wrap items-center gap-3">
      <button onClick={closeProject} title="Zurück zur Projektübersicht" className={btn('ghost', 'sm')}>
        ← Projekte
      </button>

      <input
        value={eventName}
        onChange={(e) => setEventName(e.target.value)}
        className="text-sm font-semibold text-gray-800 border-none focus:outline-none focus:ring-2 focus:ring-blue-300 rounded px-1.5 py-1 min-w-[160px]"
      />

      <div className={dividerV} />

      <div className="relative" ref={viewMenuRef}>
        <button onClick={() => setViewMenuOpen((v) => !v)} className={btn(viewMenuOpen ? 'secondary' : 'ghost', 'sm')}>
          Ansicht ▾
        </button>
        {viewMenuOpen && (
          <div
            className={`${popoverPanel} w-64 space-y-3`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div>
              <span className="font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Ansicht</span>
              <div className="mt-1.5 flex flex-col gap-1.5 text-xs text-gray-600">
                {(Object.keys(LAYER_LABELS) as (keyof LayerState)[]).map((key) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={() => toggleLayer(key)}
                      className="accent-blue-600 w-3.5 h-3.5"
                    />
                    {LAYER_LABELS[key]}
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100">
              <span className="font-semibold text-gray-500 text-[11px] uppercase tracking-wide">Saal</span>
              <div className="mt-1.5 flex flex-col gap-1.5 text-xs text-gray-600">
                {(['saal1', 'saal2', 'saal3'] as const).map((key) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={saalSplit[key]}
                      onChange={() => toggleSaal(key)}
                      className="accent-blue-600 w-3.5 h-3.5"
                    />
                    {key.replace('saal', 'Saal ')}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={dividerV} />

      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-gray-500 text-[11px] uppercase tracking-wide mr-0.5">Verlauf</span>
        <button onClick={undo} disabled={!canUndo} title="Rückgängig (Strg/Cmd+Z)" className={btn('secondary', 'sm')}>
          ↺ Rückgängig
        </button>
        <button onClick={redo} disabled={!canRedo} title="Wiederholen (Strg/Cmd+Shift+Z)" className={btn('secondary', 'sm')}>
          ↻ Wiederholen
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button onClick={onPresent} title="Phasen im Vollbild durchgehen" className={btn('secondary', 'sm')}>
          ▶ Präsentation
        </button>
        <button
          onClick={async () => {
            setExporting(true)
            try {
              await onExportPdf()
            } finally {
              setExporting(false)
            }
          }}
          disabled={exporting}
          className={btn('primary', 'sm')}
        >
          {exporting ? 'Exportiere…' : 'PDF exportieren'}
        </button>
      </div>
    </div>
  )
}
