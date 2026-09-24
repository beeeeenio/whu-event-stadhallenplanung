import { useState } from 'react'
import { useEventStore } from '../store/store'
import { countVisibleItems, visibleItemList } from '../utils/countItems'
import { exportInventoryCsv } from '../utils/exportInventory'
import { btn, panel, panelHeader, panelTitle, panelSubtitle, collapseToggle } from '../utils/ui'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function InventoryPanel({ selectedId, onSelect }: Props) {
  const [tab, setTab] = useState<'summary' | 'list'>('summary')
  const [collapsed, setCollapsed] = useState(false)
  const items = useEventStore((s) => s.items)
  const itemOrder = useEventStore((s) => s.itemOrder)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const eventName = useEventStore((s) => s.eventName)
  const phases = useEventStore((s) => s.phases)
  const removeItem = useEventStore((s) => s.removeItem)

  const counts = countVisibleItems(items, currentPhaseId)
  const list = visibleItemList(items, itemOrder, currentPhaseId)
  const phaseName = phases.find((p) => p.id === currentPhaseId)?.name ?? 'Phase'

  if (collapsed) {
    return (
      <aside className={`w-9 shrink-0 border-l border-gray-200 h-full flex flex-col items-center ${panel}`}>
        <button onClick={() => setCollapsed(false)} title="Inventar einblenden" className={collapseToggle}>
          «
        </button>
        <span
          className="flex-1 flex items-center justify-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
          style={{ writingMode: 'vertical-rl' }}
        >
          Inventar
        </span>
      </aside>
    )
  }

  return (
    <aside className={`w-72 shrink-0 border-l border-gray-200 h-full ${panel}`}>
      <div className={`${panelHeader} flex items-start justify-between gap-2`}>
        <div>
          <h2 className={panelTitle}>Inventar</h2>
          <p className={panelSubtitle}>Live-Stückliste der aktiven Phase</p>
        </div>
        <button onClick={() => setCollapsed(true)} title="Inventar einklappen" className="text-gray-400 hover:text-gray-700 shrink-0">
          »
        </button>
      </div>

      <div className="flex border-b border-gray-200 p-1 gap-1">
        <button
          onClick={() => setTab('summary')}
          className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
            tab === 'summary' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Übersicht
        </button>
        <button
          onClick={() => setTab('list')}
          className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
            tab === 'list' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Liste
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'summary' ? (
          <ul className="space-y-1">
            {counts.summary.map((row) => (
              <li key={row.label} className="flex items-center gap-2 text-xs text-gray-700 py-1.5 px-1 rounded hover:bg-gray-50">
                <span className="text-sm w-4 text-center">{row.icon}</span>
                <span className="font-mono w-6 text-right text-gray-500">{row.count}×</span>
                <span className="truncate">{row.label}</span>
              </li>
            ))}
            {counts.summary.length === 0 && (
              <li className="text-xs text-gray-400 text-center py-4">Keine Objekte in dieser Phase</li>
            )}
          </ul>
        ) : (
          <ul className="space-y-1">
            {list.map((item, i) => (
              <li key={item.id} className="flex items-center gap-1">
                <button
                  onClick={() => onSelect(item.id)}
                  className={`flex-1 text-left text-xs px-2 py-1.5 rounded-md truncate transition-colors ${
                    selectedId === item.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {i + 1}. {item.label}
                </button>
                <button
                  onClick={() => removeItem(item.id)}
                  title="Löschen"
                  className="text-gray-300 hover:text-red-600 hover:bg-red-50 text-sm w-6 h-6 rounded flex items-center justify-center leading-none transition-colors"
                >
                  ×
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="text-xs text-gray-400 text-center py-4">Keine Objekte in dieser Phase</li>}
          </ul>
        )}
      </div>

      <div className="border-t border-gray-200 p-3 text-xs text-gray-600 space-y-1 bg-gray-50">
        <div className="flex justify-between"><span>Stühle gesamt</span><span className="font-mono text-gray-800">{counts.totalChairs}</span></div>
        <div className="flex justify-between"><span>Bühnenpodeste gesamt</span><span className="font-mono text-gray-800">{counts.totalPodiums}</span></div>
        <div className="flex justify-between"><span>Vorhang (lfm)</span><span className="font-mono text-gray-800">{counts.curtainMeters.toFixed(1)}</span></div>
      </div>

      <div className="border-t border-gray-200 p-3 flex items-center justify-between">
        <span className="text-xs text-gray-500">Total <strong className="text-gray-800">{counts.total}</strong> Objekte</span>
        <button onClick={() => exportInventoryCsv(eventName, phaseName, counts.summary)} className={btn('dark', 'sm')}>
          ⬇ Export
        </button>
      </div>
    </aside>
  )
}
