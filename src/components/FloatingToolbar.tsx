import type { ToolMode } from './CanvasEditor'
import type { PickerTab } from './ObjectPicker'
import type { ItemType } from '../types'
import type { Placement } from '../utils/placement'
import { island, islandBtn } from '../utils/ui'
import { useEffect, useState } from 'react'

type ActivePanel = 'picker' | 'inventory' | 'properties' | 'grid' | 'command' | 'text' | 'shortcuts' | null

interface FloatingToolbarProps {
  // Tools toolbar (old dock)
  tool: ToolMode
  onToolChange: (tool: ToolMode) => void
  placement: (Placement & { type?: ItemType }) | null
  onPlacementDone: () => void
  activePanel: ActivePanel
  onPanelChange: (panel: ActivePanel) => void
  pickerTab: PickerTab
  onPickerTabChange: (tab: PickerTab) => void

  // Settings toolbar
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  onZoomSet: (percent: number) => void
  onExportImage: () => void
  gridEnabled: boolean
  onGridToggle: () => void
  codesHidden: boolean
  onCodesToggle: () => void
}

// Helper functions for dock tools
function svg(d: React.ReactNode) {
  return (
    <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  )
}

function dockTool(
  key: ToolMode,
  label: string,
  icon: React.ReactNode,
  shortcut: string,
  currentTool: ToolMode,
  placement: (Placement & { type?: ItemType }) | null,
  onClick: () => void
) {
  const active = currentTool === key && !placement
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`h-11 w-[52px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
        active ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
      }`}
      title={`${label} (${shortcut})`}
    >
      {icon}
      {label}
    </button>
  )
}

export default function FloatingToolbar({
  tool,
  onToolChange,
  placement,
  onPlacementDone,
  activePanel,
  onPanelChange,
  pickerTab,
  onPickerTabChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomSet,
  onExportImage,
  gridEnabled,
  onGridToggle,
  codesHidden,
  onCodesToggle,
}: FloatingToolbarProps) {

  return (
      <div className={`absolute left-1/2 -translate-x-1/2 bottom-[108px] z-20 flex items-center gap-1 p-1.5 ${island}`} title="Werkzeuge">
        {/* Werkzeug-Dock Buttons */}
        {dockTool('select', 'Auswahl', svg(<path d="M5 3l14 8-6 2-2 6z" />), 'V', tool, placement, () => onToolChange('select'))}
        {dockTool('area', 'Bereich', svg(<rect x="4" y="6" width="16" height="12" strokeDasharray="3 2" />), 'B', tool, placement, () => onToolChange('area'))}
        {dockTool('measure', 'Messen', svg(<><path d="M3 17L17 3l4 4L7 21z" /><path d="M8 8l2 2M11 5l2 2M5 11l2 2" /></>), 'M', tool, placement, () => onToolChange('measure'))}

        <div className="w-px h-8 bg-line mx-1" />

        {/* Objekte Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPickerTabChange('furniture')
            if (activePanel !== 'picker') onPanelChange('picker')
          }}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            activePanel === 'picker' && (pickerTab === 'furniture' || pickerTab === 'infrastructure') ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="Objekt-Bibliothek (O)"
        >
          {svg(<path d="M12 5v14M5 12h14" />)}
          Objekte
        </button>

        {/* Reihen Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPickerTabChange('rows')
            if (activePanel !== 'picker') onPanelChange('picker')
          }}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            activePanel === 'picker' && pickerTab === 'rows' ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="Stuhlreihen-Generator"
        >
          {svg(<>{[6, 12, 18].flatMap((x) => [8, 16].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.5} />))}</>)}
          Reihen
        </button>

        {/* NivTec Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPickerTabChange('nivtec')
            if (activePanel !== 'picker') onPanelChange('picker')
          }}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            activePanel === 'picker' && pickerTab === 'nivtec' ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="NivTec Import"
        >
          {svg(<><path d="M12 15V4M8 8l4-4 4 4" /><path d="M4 15v4h16v-4" /></>)}
          NivTec
        </button>

        {/* Text Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPanelChange(activePanel === 'text' ? null : 'text')
          }}
          className={`h-12 w-[62px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors ${
            activePanel === 'text' ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip'
          }`}
          title="Freie Textbeschriftung in den Plan setzen"
        >
          {svg(<><path d="M5 6h14M12 6v13" /></>)}
          Text
        </button>

        <div className="w-px h-8 bg-line mx-1" />

        <button
          onClick={onZoomOut}
          className={islandBtn('plain', 'h-9 w-9 p-0 text-base')}
          title="Verkleinern (−)"
        >
          −
        </button>
        <ZoomInput zoom={zoom} onZoomSet={onZoomSet} />
        <button
          onClick={onZoomIn}
          className={islandBtn('plain', 'h-9 w-9 p-0 text-base')}
          title="Vergrößern (+)"
        >
          +
        </button>
        <button
          onClick={onZoomReset}
          className={islandBtn('plain', 'h-9 px-2 text-[11px] font-medium')}
          title="Plan einpassen"
        >
          Einpassen
        </button>

        <div className="w-px h-8 bg-line mx-1" />

        <button
          onClick={onGridToggle}
          className={islandBtn(gridEnabled ? 'dark' : 'plain', 'h-9 w-9 p-0')}
          title="Gitter anzeigen/verbergen"
        >
          📐
        </button>
        <button
          onClick={onCodesToggle}
          className={islandBtn(codesHidden ? 'plain' : 'dark', 'h-9 px-2 text-[11px] font-medium')}
          title="Steckdosen-Codes (z. B. 3F9) im Plan ein-/ausblenden"
        >
          Codes
        </button>
        <button
          onClick={onExportImage}
          className={islandBtn('plain', 'h-9 w-9 p-0 text-lg')}
          title="Als PDF exportieren"
        >
          📄
        </button>

        {placement && (
          <>
            <div className="w-px h-8 bg-line mx-1" />
            <button
              onClick={onPlacementDone}
              className="h-12 px-3 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover"
              title="Platzieren beenden (Esc)"
            >
              Fertig
            </button>
          </>
        )}
      </div>
  )
}

function ZoomInput({ zoom, onZoomSet }: { zoom: number; onZoomSet: (percent: number) => void }) {
  const current = String(Math.round(zoom * 100))
  const [draft, setDraft] = useState(current)
  useEffect(() => setDraft(current), [current])

  const commit = () => {
    const value = parseFloat(draft.replace(',', '.'))
    if (Number.isFinite(value) && value > 0) onZoomSet(value)
    else setDraft(current)
  }

  return (
    <label className="h-9 flex items-center rounded-lg bg-chip px-1.5 text-xs font-medium text-ink" title="Zoom in Prozent eingeben">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setDraft(current)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        inputMode="decimal"
        className="w-9 bg-transparent text-right outline-none"
        aria-label="Zoom in Prozent"
      />
      %
    </label>
  )
}
