import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import * as api from '../backend/api'
import { useEventStore } from '../store/store'
import { DEFAULT_PIXELS_PER_METER } from '../utils/scale'
import { emptyProjectData } from '../utils/projectStorage'
import { sortPhases } from '../utils/phaseDiff'
import { LEVELS } from '../utils/levels'
import { island, islandBtn } from '../utils/ui'
import BrandLogo from './BrandLogo'
import CanvasEditor, { type CanvasEditorHandle } from './CanvasEditor'
import { LayersMenu } from './FloatingToolbar'

const Venue3D = lazy(() => import('./Venue3D'))
const noop = () => {}

/**
 * Betrachter-Ansicht hinter einem Link (#/ansicht/<token>): Plan, Phasen, Geschoss, Ebenen und 3D ansehen,
 * ohne Anmeldung und ohne etwas ändern zu können. Es gibt hier keine Bearbeitungs-Bedienung und keine Speicherung;
 * den Plan liefert der Server nur zu einem gültigen, nicht widerrufenen Link (server/pb_hooks/shares.pb.js).
 */
export default function SharedViewer({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'invalid' | 'ready'>('loading')
  const [name, setName] = useState('')
  const [show3D, setShow3D] = useState(false)
  const canvasRef = useRef<CanvasEditorHandle>(null)
  const phases = useEventStore((s) => s.phases)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const setCurrentPhase = useEventStore((s) => s.setCurrentPhase)
  const currentLevel = useEventStore((s) => s.currentLevel)
  const setCurrentLevel = useEventStore((s) => s.setCurrentLevel)

  useEffect(() => {
    api.loadShared(token).then(
      (res) => {
        const data = { ...emptyProjectData(), ...(res.data ?? {}) }
        useEventStore.getState().hydrate(data)
        useEventStore.getState().setCurrentLevel('eg')
        setName(res.name)
        setState('ready')
      },
      () => setState('invalid'),
    )
  }, [token])

  useEffect(() => {
    document.title = name ? `${name} – WHU Event` : 'WHU Event'
  }, [name])

  if (state !== 'ready') {
    return (
      <div className="min-h-screen w-screen bg-ground flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white border border-line rounded-2xl shadow-sm p-6">
          <BrandLogo className="h-11 mb-5" />
          {state === 'loading' ? (
            <p className="text-sm text-ink3">Plan wird geladen…</p>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-ink">Link nicht gültig</h1>
              <p className="text-sm text-ink2 mt-2">Dieser Link ist ungültig, abgelaufen oder wurde zurückgezogen. Bitte um einen neuen Link.</p>
            </>
          )}
        </div>
      </div>
    )
  }

  const sorted = sortPhases(phases)
  return (
    <div className="fixed inset-0 bg-ground overflow-hidden">
      <div className="absolute inset-0">
        <CanvasEditor
          ref={canvasRef}
          pixelsPerMeter={DEFAULT_PIXELS_PER_METER}
          selectedIds={[]}
          onSelect={noop}
          onSelectMany={noop}
          tool="hand"
          eventName={name}
          phaseName={sorted.find((p) => p.id === currentPhaseId)?.name}
        />
      </div>

      <div className={`absolute top-4 left-4 z-20 flex items-center gap-3 p-2 pr-4 ${island}`}>
        <BrandLogo variant="icon" className="h-8 shrink-0" />
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-ink truncate max-w-[min(260px,45vw)]">{name}</div>
          <div className="text-[11px] text-ink3">Nur Ansicht · Kongresshalle Vallendar</div>
        </div>
      </div>

      {sorted.length > 1 && (
        <div className={`absolute top-[84px] left-4 z-20 flex flex-wrap gap-1 p-1.5 max-w-[calc(100vw-32px)] ${island}`} role="group" aria-label="Phase">
          {sorted.map((p) => (
            <button
              key={p.id}
              onClick={() => setCurrentPhase(p.id)}
              aria-pressed={p.id === currentPhaseId}
              className={islandBtn(p.id === currentPhaseId ? 'dark' : 'plain', 'h-8 px-3 text-xs font-medium')}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className={`absolute left-1/2 -translate-x-1/2 bottom-5 z-20 flex items-center gap-1 p-1.5 ${island}`}>
        <button onClick={() => canvasRef.current?.zoomOut()} className={islandBtn('plain', 'h-9 w-9 p-0')} title="Verkleinern" aria-label="Verkleinern">
          −
        </button>
        <button onClick={() => canvasRef.current?.zoomIn()} className={islandBtn('plain', 'h-9 w-9 p-0')} title="Vergrößern" aria-label="Vergrößern">
          +
        </button>
        <button onClick={() => canvasRef.current?.fitToView()} className={islandBtn('plain', 'h-9 px-2 text-[11px] font-medium')}>
          Einpassen
        </button>
        <div className="w-px h-8 bg-line mx-1" />
        {LEVELS.map((l) => (
          <button
            key={l.id}
            onClick={() => setCurrentLevel(l.id)}
            aria-pressed={currentLevel === l.id}
            title={l.label}
            className={islandBtn(currentLevel === l.id ? 'dark' : 'plain', 'h-9 px-2.5 text-[11px] font-medium')}
          >
            {l.short}
          </button>
        ))}
        <div className="w-px h-8 bg-line mx-1" />
        <LayersMenu />
        <button onClick={() => setShow3D(true)} className={islandBtn('plain', 'h-9 px-2 text-[11px] font-medium')}>
          3D
        </button>
      </div>

      {show3D && (
        <Suspense fallback={null}>
          <Venue3D onClose={() => setShow3D(false)} initialLevel={currentLevel} />
        </Suspense>
      )}
    </div>
  )
}
