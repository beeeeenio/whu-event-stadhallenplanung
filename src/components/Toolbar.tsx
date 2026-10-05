import { useEventStore } from '../store/store'
import { useProjectsStore } from '../store/projectsStore'
import { island, islandBtn, kbd } from '../utils/ui'
import TemplatesMenu from './TemplatesMenu'
import VersionsMenu from './VersionsMenu'

interface Props {
  onOpenCommand: () => void
}

/** Schwebende Kopf-Inseln: Projekt links, Befehlszeile mittig, Undo/Redo rechts. */
export default function Toolbar({ onOpenCommand }: Props) {
  const eventName = useEventStore((s) => s.eventName)
  const setEventName = useEventStore((s) => s.setEventName)
  const undo = useEventStore((s) => s.undo)
  const redo = useEventStore((s) => s.redo)
  const canUndo = useEventStore((s) => s.historyPast.length > 0)
  const canRedo = useEventStore((s) => s.historyFuture.length > 0)
  const closeProject = useProjectsStore((s) => s.closeProject)

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
          <span className="text-[11px] text-ink3 px-1 leading-tight">Kongresshalle Vallendar · Projekte</span>
        </div>
      </div>

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
        <TemplatesMenu />
      </div>
    </>
  )
}
