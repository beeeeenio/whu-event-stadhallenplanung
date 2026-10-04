import { useCallback } from 'react'
import { useEventStore } from '../store/store'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import { input, island } from '../utils/ui'

interface Props {
  selectedIds: string[]
  onSelect: (id: string) => void
  onClose: () => void
}

/**
 * ObjectsPanel — Phase C: Search/Filter Objects
 * Shows filtered list of items matching the search query in real-time.
 * Clicking an item selects it in the canvas and scrolls/zooms to show it.
 */
export default function ObjectsPanel({ selectedIds, onSelect, onClose }: Props) {
  const searchQuery = useEventStore((s) => s.searchQuery)
  const setSearchQuery = useEventStore((s) => s.setSearchQuery)
  const filteredItems = useEventStore((s) => s.filteredItems())
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)

  // Group filtered items by type and count visibility
  const groupedByType = new Map<string, { items: typeof filteredItems; visibleCount: number }>()
  for (const item of filteredItems) {
    const pd = item.phaseData[currentPhaseId]
    const isVisible = pd?.visible ?? false
    if (!groupedByType.has(item.type)) {
      groupedByType.set(item.type, { items: [], visibleCount: 0 })
    }
    const group = groupedByType.get(item.type)!
    group.items.push(item)
    if (isVisible) group.visibleCount += 1
  }

  const handleItemClick = useCallback(
    (itemId: string) => {
      onSelect(itemId)
      // Keep search visible for continuity, but clear on Escape
      setSearchQuery(searchQuery)
    },
    [onSelect, searchQuery, setSearchQuery],
  )

  // Show hint when search is active but has no results
  const hasResults = filteredItems.length > 0
  const isSearching = searchQuery.trim().length > 0

  return (
    <aside className={`w-[min(340px,calc(100vw-32px))] max-h-full flex flex-col overflow-hidden ${island}`}>
      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">Objekte</h2>
          <p className="text-xs text-ink3 mt-0.5">Suchen und filtern</p>
        </div>
        <button onClick={onClose} title="Schließen" className="w-8 h-8 rounded-full text-ink3 hover:bg-chip -mr-1.5">
          ×
        </button>
      </div>

      <div className="px-3 pb-2">
        <input
          autoFocus
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchQuery('')
              onClose()
            }
          }}
          placeholder="Objekte suchen…"
          className={`${input} w-full`}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {isSearching && !hasResults && (
          <div className="text-xs text-ink3 text-center py-6">
            Keine Treffer für „{searchQuery.trim()}"
          </div>
        )}

        {!isSearching && filteredItems.length === 0 && (
          <div className="text-xs text-ink3 text-center py-6">
            Keine Objekte in dieser Phase
          </div>
        )}

        {hasResults && (
          <div className="space-y-2">
            {/* Show all filtered items */}
            {filteredItems.map((item) => {
              const template = ITEM_LIBRARY.find((t) => t.type === item.type)
              const pd = item.phaseData[currentPhaseId]
              const isVisible = pd?.visible ?? false
              const isSelected = selectedIds.includes(item.id)

              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full text-left text-xs px-2.5 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                    isSelected
                      ? 'bg-accent-soft text-accent font-semibold'
                      : isVisible
                        ? 'text-ink hover:bg-chip'
                        : 'text-ink3 opacity-60 hover:bg-chip'
                  }`}
                  title={item.label + (isVisible ? '' : ' (ausgeblendet in dieser Phase)')}
                >
                  {/* Icon */}
                  <span className="text-base w-4 text-center flex-shrink-0">
                    {template?.icon ?? '●'}
                  </span>
                  {/* Label */}
                  <span className="flex-1 truncate">{item.label}</span>
                  {/* Visibility indicator */}
                  {!isVisible && (
                    <span className="text-[10px] flex-shrink-0 opacity-70">hidden</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {!isSearching && hasResults && (
          <div className="mt-3 pt-2 border-t border-line text-[10.5px] text-ink3">
            <div className="font-semibold uppercase tracking-[0.1em] px-1 mb-2">Typ-Zusammenfassung</div>
            <ul className="space-y-1">
              {Array.from(groupedByType.entries()).map(([type, { items: typeItems, visibleCount }]) => {
                const template = ITEM_LIBRARY.find((t) => t.type === type)
                return (
                  <li key={type} className="flex items-center gap-2 px-1">
                    <span className="text-base w-4">{template?.icon ?? '●'}</span>
                    <span className="flex-1 text-ink2">{template?.label ?? type}</span>
                    <span className="font-mono text-ink">{visibleCount}/{typeItems.length}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-line px-4 py-2.5 text-xs text-ink3">
        <div className="flex justify-between">
          <span>{filteredItems.length} gefiltert</span>
          <span className="font-mono text-ink">{selectedIds.length} ausgewählt</span>
        </div>
      </div>
    </aside>
  )
}
