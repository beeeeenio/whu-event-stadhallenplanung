import { useState } from 'react'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import type { ItemType } from '../types'
import { matchLibrary, parseQuery } from '../utils/commandParser'
import ChairRowGenerator from './ChairRowGenerator'
import { btn, island, kbd } from '../utils/ui'

export type PickerTab = 'furniture' | 'infrastructure' | 'rows' | 'nivtec'

interface Props {
  tab: PickerTab
  onTabChange: (tab: PickerTab) => void
  /** Aktuell zum Platzieren gewählter Typ (Kachel hervorgehoben). */
  activeType: ItemType | null
  /** Kachel angetippt → Platzierungsmodus. */
  onPick: (type: ItemType) => void
  /** Doppelklick → sofort in Bildmitte einfügen. */
  onInsertCenter: (type: ItemType) => void
  onCreateChairRows: (rows: number, perRow: number, mode: 'tap' | 'center') => void
  onImportNivtec: () => void
  onClose: () => void
}

const TABS: { key: PickerTab; label: string }[] = [
  { key: 'furniture', label: 'Möblierung' },
  { key: 'infrastructure', label: 'Infrastruktur' },
  { key: 'rows', label: 'Stuhlreihen' },
  { key: 'nivtec', label: 'NivTec' },
]

/** Objekt-Bibliothek als Kachel-Blatt über dem Werkzeug-Dock (Konzept B). */
export default function ObjectPicker({
  tab,
  onTabChange,
  activeType,
  onPick,
  onInsertCenter,
  onCreateChairRows,
  onImportNivtec,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  const searching = query.trim().length > 0
  const tiles = searching
    ? matchLibrary(parseQuery(query).words)
    : ITEM_LIBRARY.filter((i) => i.category === tab)

  return (
    <div
      className={`w-[min(640px,calc(100vw-32px))] p-3.5 ${island}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1.5 mb-3 items-center">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setQuery('')
              onTabChange(t.key)
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tab === t.key && !searching ? 'bg-ink text-white' : 'bg-chip text-ink2 hover:bg-chip-hover'
            }`}
          >
            {t.label}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (query) setQuery('')
              else onClose()
            }
            if (e.key === 'Enter' && tiles[0]) onPick(tiles[0].type)
          }}
          placeholder="⌕ Objekt suchen…"
          className="ml-auto w-36 h-8 px-3 rounded-full bg-chip text-xs text-ink placeholder:text-ink3 focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button onClick={onClose} className="w-8 h-8 rounded-full text-ink3 hover:bg-chip" title="Schließen (Esc)">
          ×
        </button>
      </div>

      {(tab === 'furniture' || tab === 'infrastructure' || searching) && (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 max-h-[40vh] overflow-y-auto">
            {tiles.map((tpl) => (
              <button
                key={tpl.type}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/item-type', tpl.type)}
                onClick={() => onPick(tpl.type)}
                onDoubleClick={() => onInsertCenter(tpl.type)}
                className={`flex flex-col items-center justify-center gap-1 px-1.5 py-2 rounded-xl border text-center transition-all min-h-[78px] ${
                  activeType === tpl.type
                    ? 'border-accent bg-accent-soft/60 ring-2 ring-accent'
                    : 'border-line bg-white hover:border-ink3/40 hover:shadow-sm'
                }`}
                title={`${tpl.label} – antippen und in den Plan tippen, ziehen oder doppelklicken`}
              >
                <span className="text-xl leading-none text-ink">{tpl.icon}</span>
                <span className="text-[10.5px] leading-tight text-ink2">{tpl.label}</span>
              </button>
            ))}
            {tiles.length === 0 && (
              <p className="col-span-full text-xs text-ink3 text-center py-6">Kein Objekt gefunden</p>
            )}
          </div>
          <p className="mt-2.5 text-[11px] text-ink3 flex flex-wrap gap-x-3 gap-y-1">
            <span>Antippen, dann in den Plan tippen</span>
            <span>· Ziehen per Drag &amp; Drop</span>
            <span>· Doppelklick fügt in der Bildmitte ein</span>
            <span className="ml-auto">
              Schneller: <span className={kbd}>⌘K</span> „12 Stehtische“
            </span>
          </p>
        </>
      )}

      {tab === 'rows' && !searching && <ChairRowGenerator onCreate={onCreateChairRows} />}

      {tab === 'nivtec' && !searching && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-ink">NivTec Import</h3>
            <p className="text-[11px] text-ink3 mt-0.5">
              Bühnen-/Theken-Aufbau aus einem NivTec-JSON-Export übernehmen. Er wird in der Bildmitte eingefügt.
            </p>
          </div>
          <button onClick={onImportNivtec} className={`w-full ${btn('primary', 'md')}`}>
            Bühne/Theke JSON importieren
          </button>
        </div>
      )}
    </div>
  )
}
