import { useState } from 'react'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import type { ItemType } from '../types'
import { matchLibrary, parseQuery } from '../utils/commandParser'
import ChairRowGenerator from './ChairRowGenerator'
import type { CustomItemSpec } from '../store/store'
import { btn, island, kbd } from '../utils/ui'

export type PickerTab = 'furniture' | 'infrastructure' | 'rows' | 'nivtec' | 'custom'

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
  onCreateCustom: (spec: CustomItemSpec, mode: 'tap' | 'center') => void
  onClose: () => void
  /** Kachel per Zeigergerät aus der Bibliothek gezogen: sofortige Formvorschau, kein natives HTML5-DnD-Ghost-Bild. */
  onTileDragStart: (e: React.PointerEvent, type: ItemType) => void
}

const TABS: { key: PickerTab; label: string }[] = [
  { key: 'furniture', label: 'Möblierung' },
  { key: 'infrastructure', label: 'Infrastruktur' },
  { key: 'rows', label: 'Stuhlreihen' },
  { key: 'nivtec', label: 'NivTec' },
  { key: 'custom', label: '+ Eigenes Objekt' },
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
  onCreateCustom,
  onClose,
  onTileDragStart,
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
                onPointerDown={(e) => onTileDragStart(e, tpl.type)}
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

      {tab === 'custom' && !searching && <CustomObjectForm onCreate={onCreateCustom} />}

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

const CUSTOM_COLORS = ['#94a3b8', '#FCD34D', '#F87171', '#A78BFA', '#60A5FA', '#10b981', '#f97316', '#1f2937']

function CustomObjectForm({ onCreate }: { onCreate: (spec: CustomItemSpec, mode: 'tap' | 'center') => void }) {
  const [label, setLabel] = useState('')
  const [shape, setShape] = useState<'rect' | 'round'>('rect')
  const [width, setWidth] = useState('2')
  const [depth, setDepth] = useState('1')
  const [color, setColor] = useState(CUSTOM_COLORS[0])

  const num = (v: string) => parseFloat(v.replace(',', '.'))
  const w = num(width)
  const d = shape === 'round' ? w : num(depth)
  const valid = label.trim().length > 0 && w > 0 && d > 0 && w <= 100 && d <= 100

  const submit = (mode: 'tap' | 'center') => {
    if (!valid) return
    onCreate({ label: label.trim(), width: w, height: d, shape, color }, mode)
  }

  const field = 'w-full h-9 px-3 rounded-lg border border-line bg-white text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/30'

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit('tap')
      }}
    >
      <div>
        <h3 className="text-sm font-bold text-ink">Eigenes Objekt</h3>
        <p className="text-[11px] text-ink3 mt-0.5">Name, Maße und Form frei wählen, dann wie jedes andere Objekt platzieren.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
        <label className="col-span-2 text-[11px] text-ink2">
          Name
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. DJ-Pult" className={field} />
        </label>
        <div className="text-[11px] text-ink2 col-span-2">
          Form
          <div className="flex gap-1 mt-0.5">
            {(['rect', 'round'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShape(s)}
                className={`flex-1 h-9 rounded-lg text-xs font-semibold ${shape === s ? 'bg-ink text-white' : 'bg-chip text-ink2 hover:bg-chip-hover'}`}
              >
                {s === 'rect' ? '▭ Eckig' : '◯ Rund'}
              </button>
            ))}
          </div>
        </div>
        <label className="text-[11px] text-ink2">
          {shape === 'round' ? 'Durchmesser (m)' : 'Breite (m)'}
          <input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="decimal" className={field} />
        </label>
        {shape === 'rect' && (
          <label className="text-[11px] text-ink2">
            Tiefe (m)
            <input value={depth} onChange={(e) => setDepth(e.target.value)} inputMode="decimal" className={field} />
          </label>
        )}
        <div className={`text-[11px] text-ink2 ${shape === 'rect' ? 'col-span-2' : 'col-span-3'}`}>
          Farbe
          <div className="flex gap-1.5 mt-1.5">
            {CUSTOM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full border ${color === c ? 'ring-2 ring-accent ring-offset-1' : 'border-line'}`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={!valid} className={`flex-1 ${btn('primary', 'md')} disabled:opacity-40`}>
          In den Plan tippen
        </button>
        <button type="button" disabled={!valid} onClick={() => submit('center')} className={`${btn('secondary', 'md')} disabled:opacity-40`}>
          In Bildmitte
        </button>
      </div>
    </form>
  )
}
