import { useEventStore, AREA_COLORS } from '../store/store'
import type { EventItem } from '../types'
import { btn, input as inputCls, island } from '../utils/ui'

interface ActionProps {
  item: EventItem
  onDuplicate: () => void
  onDelete: () => void
  onHideInPhase: () => void
  onOpenProperties: () => void
  propertiesOpen: boolean
}

/**
 * Kontextleiste direkt an der Auswahl (Konzept B): die häufigsten Aktionen genau dort,
 * wo man gerade hinschaut. Alle Details liegen in „Objekt-Eigenschaften“.
 */
export function SelectionBar({ item, onDuplicate, onDelete, onHideInPhase, onOpenProperties, propertiesOpen }: ActionProps) {
  const rotateItem = useEventStore((s) => s.rotateItem)
  const cell = 'h-9 px-2.5 rounded-lg text-xs font-medium text-ink hover:bg-chip inline-flex items-center gap-1 whitespace-nowrap'
  return (
    <div
      className={`flex items-center gap-0.5 p-1 rounded-xl ${island}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={onOpenProperties}
        className={`h-9 px-2.5 rounded-lg text-[11px] font-semibold font-mono max-w-[160px] truncate inline-flex items-center gap-1.5 ${
          propertiesOpen ? 'bg-accent text-white' : 'bg-accent-soft text-accent hover:bg-accent/15'
        }`}
        title="Objekt-Eigenschaften"
      >
        {item.type === 'area' && (
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color ?? AREA_COLORS[0] }} />
        )}
        <span className="truncate">{item.label}</span>
      </button>
      <button onClick={() => rotateItem(item.id, -90)} className={cell} title="90° gegen den Uhrzeigersinn drehen (Umschalt+R)">
        ⟲
      </button>
      <button onClick={() => rotateItem(item.id, 90)} className={cell} title="90° im Uhrzeigersinn drehen (R)">
        ⟳ Drehen
      </button>
      <button onClick={onDuplicate} className={cell} title="Duplizieren (Strg/Cmd+D)">
        ⧉ Duplizieren
      </button>
      <button onClick={onHideInPhase} className={cell} title="Nur in dieser Phase ausblenden, andere Phasen bleiben unverändert">
        ◌ Ausblenden
      </button>
      <button onClick={onDelete} className={`${cell} text-red-700 hover:bg-red-50`} title="Löschen (Entf/⌫)">
        Löschen
      </button>
    </div>
  )
}

interface PanelProps {
  item: EventItem
  currentPhaseId: string
  onClose: () => void
  onDuplicate: () => void
  onDelete: () => void
}

/** Vollständige Objekt-Eigenschaften (Bezeichnung, Größe, Drehung, Farbe). */
export function PropertiesPanel({ item, currentPhaseId, onClose, onDuplicate, onDelete }: PanelProps) {
  const renameItem = useEventStore((s) => s.renameItem)
  const resizeItem = useEventStore((s) => s.resizeItem)
  const setItemColor = useEventStore((s) => s.setItemColor)
  const rotateItem = useEventStore((s) => s.rotateItem)

  return (
    <div className={`p-3.5 w-64 text-xs space-y-3 ${island}`} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-chip">
        <span className="font-bold text-ink text-sm">Objekt-Eigenschaften</span>
        <button onClick={onClose} title="Schließen (Esc)" className="text-ink3 hover:text-ink leading-none text-base px-1 -mr-1">
          ×
        </button>
      </div>
      <label className="block space-y-1">
        <span className="text-ink3">Bezeichnung</span>
        <input className={`w-full ${inputCls}`} value={item.label} onChange={(e) => renameItem(item.id, e.target.value)} />
      </label>
      {item.type === 'area' ? (
        <div className="flex gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-ink3">Breite (m)</span>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={Math.round(item.width * 100) / 100}
              onChange={(e) => resizeItem(item.id, Number(e.target.value), item.height)}
              className={`w-full ${inputCls}`}
            />
          </label>
          <label className="flex-1 space-y-1">
            <span className="text-ink3">Tiefe (m)</span>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={Math.round(item.height * 100) / 100}
              onChange={(e) => resizeItem(item.id, item.width, Number(e.target.value))}
              className={`w-full ${inputCls}`}
            />
          </label>
        </div>
      ) : (
        <div className="text-ink3">
          Größe: {item.width}m × {item.height}m
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink3">Drehung: {Math.round(item.phaseData[currentPhaseId]?.rotation ?? 0)}°</span>
        <div className="flex gap-1">
          <button
            onClick={() => rotateItem(item.id, -90)}
            title="90° gegen den Uhrzeigersinn drehen (Umschalt+R)"
            className="w-7 h-7 flex items-center justify-center border border-line rounded-md hover:bg-chip"
          >
            ⟲
          </button>
          <button
            onClick={() => rotateItem(item.id, 90)}
            title="90° im Uhrzeigersinn drehen (R)"
            className="w-7 h-7 flex items-center justify-center border border-line rounded-md hover:bg-chip"
          >
            ⟳
          </button>
        </div>
      </div>
      {item.type === 'area' && (
        <div>
          <div className="text-ink3 mb-1.5">Farbe</div>
          <div className="flex flex-wrap gap-1.5">
            {AREA_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setItemColor(item.id, color)}
                style={{ backgroundColor: color }}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  (item.color ?? AREA_COLORS[0]) === color ? 'border-ink' : 'border-transparent'
                }`}
                title={color}
              />
            ))}
            <input
              type="color"
              value={item.color ?? AREA_COLORS[0]}
              onChange={(e) => setItemColor(item.id, e.target.value)}
              className="w-6 h-6 rounded-full overflow-hidden border-2 border-transparent cursor-pointer"
              title="Eigene Farbe"
            />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5 pt-1">
        <button onClick={onDuplicate} className={`w-full ${btn('primaryOutline', 'sm')}`} title="Strg/Cmd+D">
          ⧉ Duplizieren
        </button>
        <button onClick={onDelete} className={`w-full ${btn('dangerOutline', 'sm')}`}>
          Objekt löschen
        </button>
      </div>
    </div>
  )
}
