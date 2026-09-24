import { useRef, useState } from 'react'
import { useEventStore } from '../store/store'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import type { NivtecData } from '../types'
import ChairRowGenerator from './ChairRowGenerator'
import { btn, panel, panelHeader, panelTitle, panelSubtitle, sectionLabel, collapseToggle } from '../utils/ui'

export default function Sidebar() {
  const addItem = useEventStore((s) => s.addItem)
  const importNivtec = useEventStore((s) => s.importNivtec)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})

  const toggleCategory = (key: string) =>
    setCollapsedCategories((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/item-type', type)
  }

  const handleNivtecFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text) as NivtecData
      if (!Array.isArray(json.pieces) || json.pieces.length === 0) {
        throw new Error('Datei enthält kein "pieces"-Array mit Podesten')
      }
      // NivTec-Exporte haben meist keinen eigenen Namen – Dateiname als Fallback nutzen
      const nameFromFile = file.name.replace(/\.json$/i, '').replace(/[-_]+/g, ' ')
      importNivtec({ ...json, name: json.name || nameFromFile }, 100, 100)
    } catch (err) {
      alert('NivTec-Datei konnte nicht gelesen werden: ' + (err as Error).message)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const categories = [
    { key: 'furniture', label: 'Möblierung' },
    { key: 'infrastructure', label: 'Infrastruktur' },
  ] as const

  if (collapsed) {
    return (
      <aside className={`w-9 shrink-0 border-r border-gray-200 h-full flex flex-col items-center ${panel}`}>
        <button onClick={() => setCollapsed(false)} title="Objekt-Bibliothek einblenden" className={collapseToggle}>
          »
        </button>
        <span
          className="flex-1 flex items-center justify-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
          style={{ writingMode: 'vertical-rl' }}
        >
          Objekt-Bibliothek
        </span>
      </aside>
    )
  }

  return (
    <aside className={`w-72 shrink-0 border-r border-gray-200 h-full overflow-y-auto ${panel}`}>
      <div className={`${panelHeader} flex items-start justify-between gap-2`}>
        <div>
          <h2 className={panelTitle}>Objekt-Bibliothek</h2>
          <p className={panelSubtitle}>Ziehen Sie Objekte in den Hallenplan</p>
        </div>
        <button onClick={() => setCollapsed(true)} title="Objekt-Bibliothek einklappen" className="text-gray-400 hover:text-gray-700 shrink-0">
          «
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {categories.map((cat) => {
          const isCollapsed = collapsedCategories[cat.key]
          return (
            <div key={cat.key} className="border-b border-gray-100">
              <button
                onClick={() => toggleCategory(cat.key)}
                className="w-full flex items-center justify-between px-3 pt-3 pb-2 text-left hover:bg-gray-50"
              >
                <h3 className={sectionLabel}>{cat.label}</h3>
                <span className={`text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>▾</span>
              </button>
              {!isCollapsed && (
                <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                  {ITEM_LIBRARY.filter((i) => i.category === cat.key).map((tpl) => (
                    <div
                      key={tpl.type}
                      draggable
                      onDragStart={(e) => handleDragStart(e, tpl.type)}
                      onDoubleClick={() => addItem(tpl.type, 150, 150)}
                      className="flex flex-col items-center justify-center gap-1 p-2 border border-gray-200 rounded-md cursor-grab active:cursor-grabbing hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm transition-all text-center"
                      title={`${tpl.label} (Doppelklick zum Platzieren)`}
                    >
                      <span className="text-lg">{tpl.icon}</span>
                      <span className="text-[10px] leading-tight text-gray-600">{tpl.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <ChairRowGenerator />

        <div className="p-3 border-b border-gray-100">
          <h3 className={`${sectionLabel} mb-2`}>NivTec Import</h3>
          <button onClick={() => fileInputRef.current?.click()} className={`w-full ${btn('primary', 'md')}`}>
            Bühne/Theke JSON importieren
          </button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleNivtecFile} />
        </div>
      </div>
    </aside>
  )
}
