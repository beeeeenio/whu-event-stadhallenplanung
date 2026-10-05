import { useEffect, useRef, useState } from 'react'
import { useEventStore } from '../store/store'
import { useProjectsStore } from '../store/projectsStore'
import type { LayerState } from '../types'
import { island, islandBtn, kbd } from '../utils/ui'
import TemplatesMenu from './TemplatesMenu'
import VersionsMenu from './VersionsMenu'
import ShareDialog from './ShareDialog'
import { SyncStatusLine } from './SyncStatus'
import { useSyncStore } from '../backend/projectSync'

const LAYER_LABELS: Record<keyof LayerState, string> = {
  walls: 'Grundriss',
  rigging: 'Bühnenzüge',
  power: '⚡ Strom/CEE',
  simplified: 'Vereinfacht',
}

interface Props {
  onExportPdf: () => Promise<void>
  onPresent: () => void
  onOpenCommand: () => void
  onionSkin: boolean
  onToggleOnionSkin: () => void
  hasPreviousPhase: boolean
}

/** Schwebende Kopf-Inseln: Projekt links, Befehlszeile mittig, Verlauf/Ansicht/Export rechts. */
export default function Toolbar({ onExportPdf, onPresent, onOpenCommand, onionSkin, onToggleOnionSkin, hasPreviousPhase }: Props) {
  const eventName = useEventStore((s) => s.eventName)
  const setEventName = useEventStore((s) => s.setEventName)
  const layers = useEventStore((s) => s.layers)
  const toggleLayer = useEventStore((s) => s.toggleLayer)
  const undo = useEventStore((s) => s.undo)
  const redo = useEventStore((s) => s.redo)
  const canUndo = useEventStore((s) => s.historyPast.length > 0)
  const canRedo = useEventStore((s) => s.historyFuture.length > 0)
  const closeProject = useProjectsStore((s) => s.closeProject)
  const projectId = useSyncStore((s) => s.projectId)
  const role = useSyncStore((s) => s.role)
  const [sharing, setSharing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!viewMenuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setViewMenuOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [viewMenuOpen])

  const check = 'accent-[#1e5e7a] w-4 h-4'

  return (
    <>
      <div className={`absolute top-4 left-4 z-20 flex items-center gap-2 p-1.5 pr-3 ${island}`}>
        <button onClick={closeProject} title="Zurück zur Projektübersicht" className={islandBtn('chip', 'px-0 w-10 text-base')}>
          ‹
        </button>
        <div className="flex flex-col min-w-0">
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="text-[15px] font-bold text-ink bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-accent/30 rounded px-1 w-[min(220px,40vw)]"
            title="Projektname"
          />
          <SyncStatusLine />
        </div>
        <button onClick={() => setSharing(true)} title="Wer hat Zugriff auf dieses Projekt?" className={islandBtn('chip', 'ml-1')}>
          {role === 'owner' ? 'Teilen' : 'Mitglieder'}
        </button>
      </div>

      {sharing && projectId && role && (
        <ShareDialog
          projectId={projectId}
          projectName={eventName}
          myRole={role}
          onClose={() => setSharing(false)}
          onLeft={() => useProjectsStore.setState({ currentProjectId: null })}
        />
      )}

      <button
        onClick={onOpenCommand}
        className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 hidden lg:flex items-center gap-2 h-[52px] px-4 w-[min(400px,30vw)] text-sm text-ink3 hover:text-ink2 ${island}`}
        title="Befehlszeile (⌘K)"
      >
        <span>⌕</span>
        <span className="truncate">Objekt, Befehl oder Phase…</span>
        <span className={`ml-auto ${kbd}`}>⌘K</span>
      </button>

      <div className={`absolute top-4 right-4 z-20 flex items-center gap-1 p-1.5 ${island}`}>
        <button onClick={onOpenCommand} className={islandBtn('plain', 'lg:hidden')} title="Befehlszeile (⌘K)">
          ⌕
        </button>
        <button onClick={undo} disabled={!canUndo} title="Rückgängig (Strg/Cmd+Z)" className={islandBtn('plain')}>
          ↺
        </button>
        <button onClick={redo} disabled={!canRedo} title="Wiederholen (Strg/Cmd+Shift+Z)" className={islandBtn('plain')}>
          ↻
        </button>
        <VersionsMenu />
        <div className="relative" ref={viewMenuRef}>
          <button onClick={() => setViewMenuOpen((v) => !v)} className={islandBtn(viewMenuOpen ? 'chip' : 'plain')}>
            Ansicht ▾
          </button>
          {viewMenuOpen && (
            <div className={`absolute right-0 top-full mt-2 z-30 w-60 p-3 space-y-3 ${island}`} onMouseDown={(e) => e.stopPropagation()}>
              <div>
                <span className="font-semibold text-ink3 text-[10.5px] uppercase tracking-[0.1em]">Ansicht</span>
                <div className="mt-2 flex flex-col gap-2 text-[13px] text-ink">
                  {(Object.keys(LAYER_LABELS) as (keyof LayerState)[]).map((key) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} className={check} />
                      {LAYER_LABELS[key]}
                    </label>
                  ))}
                  <label className={`flex items-center gap-2 select-none ${hasPreviousPhase ? 'cursor-pointer' : 'opacity-40'}`}>
                    <input type="checkbox" checked={onionSkin && hasPreviousPhase} disabled={!hasPreviousPhase} onChange={onToggleOnionSkin} className={check} />
                    Vorphase einblenden
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
        <TemplatesMenu />
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
          className={islandBtn('chip')}
          title="PDF exportieren (aktuelle Phase)"
        >
          {exporting ? 'Exportiere…' : 'PDF'}
        </button>
        <button onClick={onPresent} title="Phasen im Vollbild durchgehen" className={islandBtn('dark')}>
          ▶ <span className="hidden sm:inline">Präsentation</span>
        </button>
      </div>
    </>
  )
}
