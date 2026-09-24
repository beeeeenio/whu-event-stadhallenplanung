import { useEffect, useMemo, useState } from 'react'
import { Stage, Layer, Image as KonvaImage } from 'react-konva'
import useImage from '../utils/useImage'
import { useEventStore } from '../store/store'
import { DEFAULT_PIXELS_PER_METER, POWER_PLAN_NATIVE_PIXELS_PER_METER } from '../utils/scale'
import EventItemShape from './EventItemShape'

const CALIBRATION_SCALE = DEFAULT_PIXELS_PER_METER / POWER_PLAN_NATIVE_PIXELS_PER_METER
const STAGE_WIDTH = Math.round(1755 * CALIBRATION_SCALE)
const STAGE_HEIGHT = Math.round(1240 * CALIBRATION_SCALE)
const AUTO_ADVANCE_MS = 4000

interface Props {
  onClose: () => void
  /** Phase, mit der die Präsentation beginnt (Standard: erste Phase). */
  startPhaseId?: string
}

export default function PresentationMode({ onClose, startPhaseId }: Props) {
  const phases = useEventStore((s) => s.phases)
  const items = useEventStore((s) => s.items)
  const itemOrder = useEventStore((s) => s.itemOrder)
  const layers = useEventStore((s) => s.layers)
  const [index, setIndex] = useState(() => {
    const sorted = [...phases].sort((a, b) => a.order - b.order)
    return Math.max(0, sorted.findIndex((p) => p.id === startPhaseId))
  })
  const [playing, setPlaying] = useState(false)
  const [image] = useImage(layers.simplified ? '/plans/power-plan-simple.png' : '/plans/power-plan.png')

  const sortedPhases = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases])
  const phase = sortedPhases[index]

  const visibleItemIds = useMemo(
    () => (phase ? itemOrder.filter((id) => items[id]?.phaseData[phase.id]?.visible) : []),
    [itemOrder, items, phase],
  )

  const goNext = () => setIndex((i) => (i + 1) % sortedPhases.length)
  const goPrev = () => setIndex((i) => (i - 1 + sortedPhases.length) % sortedPhases.length)

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(goNext, AUTO_ADVANCE_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, sortedPhases.length])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight - 140 })
  useEffect(() => {
    function onResize() {
      setViewport({ w: window.innerWidth, h: window.innerHeight - 140 })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const fit = Math.min(viewport.w / STAGE_WIDTH, viewport.h / STAGE_HEIGHT, 1)

  if (!phase) return null

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      <div className="text-center pt-6 pb-2 shrink-0">
        <h1 className="text-white text-2xl font-semibold">{phase.name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          Phase {index + 1} von {sortedPhases.length}
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <Stage width={STAGE_WIDTH * fit} height={STAGE_HEIGHT * fit} scaleX={fit} scaleY={fit}>
          <Layer listening={false}>
            {image && <KonvaImage image={image} width={STAGE_WIDTH} height={STAGE_HEIGHT} />}
          </Layer>
          <Layer listening={false}>
            {visibleItemIds.map((id) => {
              const item = items[id]
              const phaseData = item.phaseData[phase.id]
              return (
                <EventItemShape
                  key={id}
                  item={item}
                  phaseData={phaseData}
                  pixelsPerMeter={DEFAULT_PIXELS_PER_METER}
                  isSelected={false}
                  onSelect={() => {}}
                  onDragEnd={() => {}}
                  draggable={false}
                  zoom={fit}
                />
              )
            })}
          </Layer>
        </Stage>
      </div>

      <div className="shrink-0 flex items-center justify-center gap-3 py-5">
        <button
          onClick={goPrev}
          className="text-white border border-gray-600 rounded-full w-11 h-11 flex items-center justify-center hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Vorherige Phase (←)"
        >
          ‹
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="text-white bg-blue-600 rounded-full w-14 h-14 flex items-center justify-center text-xl hover:bg-blue-700 transition-colors shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          title="Automatisch abspielen (Leertaste)"
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          onClick={goNext}
          className="text-white border border-gray-600 rounded-full w-11 h-11 flex items-center justify-center hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Nächste Phase (→)"
        >
          ›
        </button>
        <button
          onClick={onClose}
          className="ml-6 text-gray-300 border border-gray-600 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Schließen (Esc)"
        >
          ✕ Beenden
        </button>
      </div>
    </div>
  )
}
