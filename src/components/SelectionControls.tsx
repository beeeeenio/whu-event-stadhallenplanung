import { useState } from 'react'
import { useEventStore, AREA_COLORS, NIVTEC_COLORS } from '../store/store'
import type { EventItem } from '../types'
import { sortPhases } from '../utils/phaseDiff'
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
 * wo man gerade hinschaut. Alle Details liegen in „Objekt-Eigenschaften".
 */
export function SelectionBar({ item, onDuplicate, onDelete, onHideInPhase, onOpenProperties, propertiesOpen }: ActionProps) {
  const rotateItem = useEventStore((s) => s.rotateItem)
  const toggleItemLocked = useEventStore((s) => s.toggleItemLocked)
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
      <button
        onClick={() => toggleItemLocked(item.id)}
        className={`${cell} ${item.locked ? 'text-accent bg-accent-soft hover:bg-accent-soft' : ''}`}
        title={item.locked ? 'Entsperren (wieder verschieb-/drehbar per Maus)' : 'Sperren (gegen versehentliches Verschieben/Drehen per Maus)'}
      >
        {item.locked ? '🔒 Gesperrt' : '🔓 Sperren'}
      </button>
      <button onClick={onDelete} className={`${cell} text-red-700 hover:bg-red-50`} title="Löschen (Entf/⌫)">
        Löschen
      </button>
    </div>
  )
}

interface MultiActionProps {
  count: number
  onCopyToLaterPhases?: () => void
  onHide: () => void
  onDelete: () => void
}

/** Leiste für die Mehrfachauswahl: nur die gemeinsamen Aktionen (Verschieben passiert direkt per
 *  Ziehen eines der ausgewählten Objekte, dafür braucht es keinen eigenen Button). */
export function MultiSelectionBar({ count, onCopyToLaterPhases, onHide, onDelete }: MultiActionProps) {
  const cell = 'h-9 px-2.5 rounded-lg text-xs font-medium text-ink hover:bg-chip inline-flex items-center gap-1 whitespace-nowrap'
  return (
    <div className={`flex items-center gap-0.5 p-1 rounded-xl ${island}`} onMouseDown={(e) => e.stopPropagation()}>
      <span className="h-9 px-2.5 rounded-lg text-[11px] font-semibold font-mono bg-accent-soft text-accent inline-flex items-center whitespace-nowrap">
        {count} Objekte ausgewählt
      </span>
      {onCopyToLaterPhases && (
        <button onClick={onCopyToLaterPhases} className={cell} title="Alle so, wie sie hier sind, als eigenständige Kopien in alle folgenden Phasen übernehmen">
          ⇥ In folgende Phasen
        </button>
      )}
      <button onClick={onHide} className={cell} title="Alle in dieser Phase ausblenden">
        ◌ Ausblenden
      </button>
      <button onClick={onDelete} className={`${cell} text-red-700 hover:bg-red-50`} title="Alle löschen (Entf/⌫)">
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
  const resizeItem = useEventStore((s) => s.resizeItem)
  const toggleItemLocked = useEventStore((s) => s.toggleItemLocked)
  const copyItemsToLaterPhases = useEventStore((s) => s.copyItemsToLaterPhases)
  const laterPhaseCount = useEventStore((s) => {
    const sorted = sortPhases(s.phases)
    return sorted.length - 1 - sorted.findIndex((p) => p.id === currentPhaseId)
  })

  return (
    <div className={`p-3.5 w-64 text-xs space-y-3 ${island}`} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-chip">
        <span className="font-bold text-ink text-sm">Objekt-Eigenschaften</span>
        <button onClick={onClose} title="Schließen (Esc)" className="text-ink3 hover:text-ink leading-none text-base px-1 -mr-1">
          ×
        </button>
      </div>
      <LabelField item={item} />

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
      ) : item.type !== 'text_label' ? (
        <div className="text-ink3">
          Größe: {item.width}m × {item.height}m
        </div>
      ) : null}
      <RotationField item={item} currentPhaseId={currentPhaseId} />
      <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
        <span className="text-ink3">Gegen Verschieben/Drehen per Maus sperren</span>
        <input type="checkbox" checked={!!item.locked} onChange={() => toggleItemLocked(item.id)} className="accent-accent w-4 h-4" />
      </label>
      {/* key inkl. Notiz: bei Undo/Redo von außen geänderte Notiz neu übernehmen */}
      <NoteField key={`${item.id}:${item.note ?? ''}`} itemId={item.id} note={item.note ?? ''} />
      {(item.type === 'area' || item.type === 'nivtec_group') && (
        <ColorSwatches item={item} />
      )}
      <div className="flex flex-col gap-1.5 pt-1">
        {laterPhaseCount > 0 && (
          <button
            onClick={() => copyItemsToLaterPhases([item.id])}
            className={`w-full ${btn('primaryOutline', 'sm')}`}
            title="Objekt so, wie es hier ist, als eigenständige Kopie in alle folgenden Phasen übernehmen"
          >
            ⇥ In folgende Phasen übernehmen ({laterPhaseCount})
          </button>
        )}
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

/** Bezeichnung/Name-Feld: lokal editiert, beim Verlassen gespeichert (ein Undo-Schritt). */
function LabelField({ item }: { item: EventItem }) {
  const renameItem = useEventStore((s) => s.renameItem)
  const [value, setValue] = useState(item.label)
  const commit = () => {
    if (value !== item.label) renameItem(item.id, value)
  }
  const labelText = item.type === 'nivtec_group' ? 'Name der Bühne/Theke' : 'Bezeichnung'
  const hint = item.type === 'nivtec_group' && item.nivtecData ? `Import: ${item.nivtecData.name}` : undefined
  return (
    <label className="block space-y-1">
      <span className="text-ink3">{labelText}</span>
      <input
        className={`w-full ${inputCls}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setValue(item.label)
        }}
      />
      {hint && <span className="text-ink4 text-xs">{hint}</span>}
    </label>
  )
}

/** Drehungs-Eingabefeld: Grad direkt eingeben oder mit ±90° Buttons. */
function RotationField({ item, currentPhaseId }: { item: EventItem; currentPhaseId: string }) {
  const setItemRotation = useEventStore((s) => s.setItemRotation)
  const rotateItem = useEventStore((s) => s.rotateItem)
  const currentRotation = Math.round(item.phaseData[currentPhaseId]?.rotation ?? 0)
  const [value, setValue] = useState(currentRotation.toString())
  const commit = () => {
    const deg = parseInt(value, 10)
    if (!isNaN(deg)) setItemRotation(item.id, deg)
  }
  return (
    <label className="block space-y-1">
      <span className="text-ink3">Drehung (Grad)</span>
      <div className="flex gap-1.5 items-center">
        <button
          onClick={() => rotateItem(item.id, -90)}
          title="90° gegen Uhrzeiger"
          className="w-7 h-7 flex items-center justify-center border border-line rounded-md hover:bg-chip text-xs font-medium"
        >
          ⟲
        </button>
        <input
          type="number"
          min="0"
          max="359"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setValue(currentRotation.toString())
            if (e.key === 'Enter') commit()
          }}
          className={`flex-1 ${inputCls}`}
        />
        <span className="text-ink3 text-xs">°</span>
        <button
          onClick={() => rotateItem(item.id, 90)}
          title="90° im Uhrzeiger"
          className="w-7 h-7 flex items-center justify-center border border-line rounded-md hover:bg-chip text-xs font-medium"
        >
          ⟳
        </button>
      </div>
    </label>
  )
}

/** Farb-Swatches für area und nivtec_group: vordefinierte + freie Farbe. */
function ColorSwatches({ item }: { item: EventItem }) {
  const setItemColor = useEventStore((s) => s.setItemColor)
  const isNivTec = item.type === 'nivtec_group'
  const colors = isNivTec ? NIVTEC_COLORS : AREA_COLORS
  const defaultColor = colors[0]
  const [customColor, setCustomColor] = useState(item.color ?? defaultColor)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const handleColorSelect = (color: string) => {
    setCustomColor(color)
    setItemColor(item.id, color)
  }

  const handleCustomColor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setCustomColor(newColor)
    // Speichern beim Schließen des Pickers, nicht bei jeder Bewegung
  }

  const closeColorPicker = () => {
    setShowColorPicker(false)
    setItemColor(item.id, customColor)
  }

  return (
    <div>
      <div className="text-ink3 mb-1.5">{isNivTec ? 'Farbe' : 'Farbe'}</div>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            onClick={() => handleColorSelect(color)}
            style={{ backgroundColor: color }}
            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
              (item.color ?? defaultColor) === color ? 'border-ink' : 'border-transparent'
            }`}
            title={color}
          />
        ))}
        <div className="relative">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            style={{ backgroundColor: customColor }}
            className="w-6 h-6 rounded-full overflow-hidden border-2 border-line cursor-pointer hover:scale-110 transition-transform"
            title="Eigene Farbe"
          />
          {showColorPicker && (
            <div className="absolute top-8 left-0 bg-white rounded-lg shadow-lg p-2 z-50">
              <input
                type="color"
                value={customColor}
                onChange={handleCustomColor}
                autoFocus
              />
              <button
                onClick={closeColorPicker}
                className="mt-1 w-full text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-dark"
              >
                Fertig
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Notiz zum Objekt: lokal editiert, beim Verlassen des Feldes (ein Undo-Schritt) übernommen. */
function NoteField({ itemId, note }: { itemId: string; note: string }) {
  const setItemNote = useEventStore((s) => s.setItemNote)
  const [value, setValue] = useState(note)
  const commit = () => {
    if (value !== note) setItemNote(itemId, value)
  }
  return (
    <label className="block space-y-1">
      <span className="text-ink3">Notiz</span>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setValue(note)
        }}
        placeholder="z. B. Aufbauhinweis…"
        className={`w-full resize-y ${inputCls}`}
      />
    </label>
  )
}
