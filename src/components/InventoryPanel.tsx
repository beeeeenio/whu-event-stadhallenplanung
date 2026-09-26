import { useMemo, useState } from 'react'
import { useEventStore } from '../store/store'
import { countVisibleItems, visibleItemList } from '../utils/countItems'
import { exportInventoryCsv } from '../utils/exportInventory'
import { crossPhaseInventory, peakAsSummary, sortPhases } from '../utils/phaseDiff'
import { btn, input, island, segmentedGroup, segmentedItem } from '../utils/ui'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
}

type Tab = 'summary' | 'list' | 'phases'

/**
 * Inventar als schwebendes Blatt rechts (Konzept B). Übersicht/Liste beziehen sich auf die
 * aktive Phase; „Alle Phasen“ zeigt den Bedarf über den ganzen Ablauf mit Maximalbedarf (Konzept C).
 */
export default function InventoryPanel({ selectedId, onSelect, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('summary')
  const [search, setSearch] = useState('')
  const items = useEventStore((s) => s.items)
  const itemOrder = useEventStore((s) => s.itemOrder)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const eventName = useEventStore((s) => s.eventName)
  const phases = useEventStore((s) => s.phases)
  const removeItem = useEventStore((s) => s.removeItem)
  const toggleItemVisible = useEventStore((s) => s.toggleItemVisible)

  const counts = countVisibleItems(items, currentPhaseId)
  const list = visibleItemList(items, itemOrder, currentPhaseId)
  const q = search.trim().toLowerCase()
  const filteredList = list
    .map((item, i) => ({ item, n: i + 1 }))
    .filter(({ item }) => !q || item.label.toLowerCase().includes(q))
  const hiddenHere = itemOrder
    .map((id) => items[id])
    .filter((it) => it && it.phaseData[currentPhaseId] && !it.phaseData[currentPhaseId].visible)
  const phaseName = phases.find((p) => p.id === currentPhaseId)?.name ?? 'Phase'
  const sorted = useMemo(() => sortPhases(phases), [phases])
  const cross = useMemo(() => crossPhaseInventory(items, phases), [items, phases])
  const currentIdx = sorted.findIndex((p) => p.id === currentPhaseId)

  return (
    <aside className={`w-[min(340px,calc(100vw-32px))] max-h-full flex flex-col overflow-hidden ${island}`}>
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">Inventar</h2>
          <p className="text-xs text-ink3 mt-0.5">
            {tab === 'phases' ? 'Bedarf über alle Phasen' : `Live-Stückliste · ${phaseName}`}
          </p>
        </div>
        <button onClick={onClose} title="Schließen" className="w-8 h-8 rounded-full text-ink3 hover:bg-chip -mr-1.5">
          ×
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className={`${segmentedGroup} w-full`}>
          <button onClick={() => setTab('summary')} className={segmentedItem(tab === 'summary', 'flex-1')}>
            Übersicht
          </button>
          <button onClick={() => setTab('list')} className={segmentedItem(tab === 'list', 'flex-1')}>
            Liste
          </button>
          <button onClick={() => setTab('phases')} className={segmentedItem(tab === 'phases', 'flex-1')}>
            Alle Phasen
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-2">
        {tab === 'summary' && (
          <ul className="space-y-0.5">
            {counts.summary.map((row) => (
              <li key={row.label} className="flex items-center gap-2 text-xs text-ink py-1.5 px-1 border-b border-chip last:border-0">
                <span className="text-sm w-4 text-center text-ink2">{row.icon}</span>
                <span className="truncate flex-1">{row.label}</span>
                <span className="font-mono font-semibold tabular-nums">{row.count}</span>
              </li>
            ))}
            {counts.summary.length === 0 && (
              <li className="text-xs text-ink3 text-center py-4">Keine Objekte in dieser Phase</li>
            )}
          </ul>
        )}

        {tab === 'list' && (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
              placeholder="Suchen…"
              className={`${input} w-full mb-2`}
            />
            <ul className="space-y-0.5">
              {filteredList.map(({ item, n }) => (
                <li key={item.id} className="flex items-center gap-1">
                  <button
                    onClick={() => onSelect(item.id)}
                    className={`flex-1 text-left text-xs px-2 py-1.5 rounded-lg truncate transition-colors ${
                      selectedId === item.id ? 'bg-accent-soft text-accent font-semibold' : 'text-ink hover:bg-chip'
                    }`}
                  >
                    {n}. {item.label}
                  </button>
                  <button
                    onClick={() => toggleItemVisible(item.id, false)}
                    title="Nur in dieser Phase ausblenden"
                    className="text-ink3 hover:text-ink hover:bg-chip text-[11px] w-6 h-6 rounded flex items-center justify-center"
                  >
                    ◌
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    title="Löschen"
                    className="text-ink3 hover:text-red-700 hover:bg-red-50 text-sm w-6 h-6 rounded flex items-center justify-center leading-none transition-colors"
                  >
                    ×
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="text-xs text-ink3 text-center py-4">Keine Objekte in dieser Phase</li>}
              {list.length > 0 && filteredList.length === 0 && (
                <li className="text-xs text-ink3 text-center py-4">Keine Treffer für „{search.trim()}“</li>
              )}
            </ul>
            {hiddenHere.length > 0 && (
              <div className="mt-3 pt-2 border-t border-line">
                <div className="text-[10.5px] font-semibold text-ink3 uppercase tracking-[0.1em] px-1 mb-1">
                  In dieser Phase ausgeblendet
                </div>
                <ul className="space-y-0.5">
                  {hiddenHere.map((item) => (
                    <li key={item.id} className="flex items-center gap-1 text-xs text-ink3">
                      <span className="flex-1 truncate px-2 py-1">{item.label}</span>
                      <button
                        onClick={() => toggleItemVisible(item.id, true)}
                        className="px-2 py-1 rounded-md text-accent hover:bg-accent-soft font-semibold"
                      >
                        Einblenden
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {tab === 'phases' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-[10.5px] font-mono text-ink3">
                  <th className="text-left font-medium pb-1.5 pr-2">Objekt</th>
                  {sorted.map((p, i) => (
                    <th
                      key={p.id}
                      className={`text-right font-medium pb-1.5 px-1 max-w-[56px] truncate ${i === currentIdx ? 'text-ink' : ''}`}
                      title={p.name}
                    >
                      {p.name.length > 7 ? p.name.slice(0, 6) + '…' : p.name}
                    </th>
                  ))}
                  <th className="text-right font-semibold pb-1.5 pl-1 text-accent">Max</th>
                </tr>
              </thead>
              <tbody>
                {cross.map((r) => (
                  <tr key={r.label} className="border-t border-chip">
                    <td className="py-1.5 pr-2 text-ink truncate max-w-[130px]" title={r.label}>
                      {r.label}
                    </td>
                    {r.perPhase.map((n, i) => (
                      <td key={i} className={`py-1.5 px-1 text-right ${i === currentIdx ? 'font-semibold text-ink' : 'text-ink2'} ${n === 0 ? 'text-ink3/60' : ''}`}>
                        {n || '–'}
                      </td>
                    ))}
                    <td className="py-1.5 pl-1 text-right font-bold text-accent">{r.max}</td>
                  </tr>
                ))}
                {cross.length === 0 && (
                  <tr>
                    <td colSpan={sorted.length + 2} className="text-center text-ink3 py-4">
                      Noch keine Objekte geplant
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-[11px] text-ink3 mt-2">Max = höchster Bedarf in einer Phase, also was vor Ort vorhanden sein muss.</p>
          </div>
        )}
      </div>

      {tab !== 'phases' ? (
        <>
          <div className="border-t border-line px-4 py-2.5 text-xs text-ink2 space-y-1 bg-ground/60">
            <div className="flex justify-between"><span>Stühle gesamt</span><span className="font-mono text-ink">{counts.totalChairs}</span></div>
            <div className="flex justify-between"><span>Bühnenpodeste gesamt</span><span className="font-mono text-ink">{counts.totalPodiums}</span></div>
            <div className="flex justify-between"><span>Vorhang (lfm)</span><span className="font-mono text-ink">{counts.curtainMeters.toFixed(1)}</span></div>
          </div>
          <div className="border-t border-line px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-ink3">Total <strong className="text-ink">{counts.total}</strong> Objekte</span>
            <button onClick={() => exportInventoryCsv(eventName, phaseName, counts.summary)} className={btn('dark', 'sm')}>
              ⬇ Export
            </button>
          </div>
        </>
      ) : (
        <div className="border-t border-line px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-ink3">{sorted.length} Phasen</span>
          <button
            onClick={() => exportInventoryCsv(eventName, 'Maximalbedarf', peakAsSummary(cross))}
            className={btn('dark', 'sm')}
          >
            ⬇ Maximalbedarf CSV
          </button>
        </div>
      )}
    </aside>
  )
}
