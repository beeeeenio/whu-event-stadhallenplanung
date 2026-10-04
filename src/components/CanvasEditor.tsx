import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Group, Rect, Text, Circle } from 'react-konva'
import type Konva from 'konva'
import useImage from '../utils/useImage'
import { useEventStore } from '../store/store'
import { metersToPixels, pixelsToMeters, DEFAULT_PIXELS_PER_METER, POWER_PLAN_NATIVE_PIXELS_PER_METER } from '../utils/scale'
import { RIGGING_BARS, STAGE_FRONT_EDGE } from '../data/rigging'
import EventItemShape from './EventItemShape'
import type { EventItem, PhaseData } from '../types'
import type { Placement } from '../utils/placement'
import { island } from '../utils/ui'
import { exportCanvasAsImage } from '../utils/exportImage'

/** Achsenparallele Welt-Bounding-Box eines (ggf. gedrehten) Objekts, für die Rubberband-Auswahl. */
function itemWorldBBox(item: EventItem, pd: PhaseData, ppm: number) {
  const w = metersToPixels(item.width, ppm)
  const h = metersToPixels(item.height, ppm)
  const isRound = item.type === 'table_round' || item.type === 'table_high'
  const corners = isRound
    ? [[-w / 2, -w / 2], [w / 2, -w / 2], [w / 2, w / 2], [-w / 2, w / 2]]
    : [[0, 0], [w, 0], [w, h], [0, h]]
  const rad = (pd.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const pts = corners.map(([cx, cy]) => ({ x: pd.x + cx * cos - cy * sin, y: pd.y + cx * sin + cy * cos }))
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

export type ToolMode = 'select' | 'measure' | 'area'

/** Aktueller Ausschnitt des Plans (für schwebende Bedienelemente an der Auswahl). */
export interface CanvasViewport {
  zoom: number
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  pixelsPerMeter: number
  /** Mehrfachauswahl: alle aktuell ausgewählten Objekt-IDs. */
  selectedIds: string[]
  /** Einzelnes Objekt (an-)wählen; additive=true (Shift-Klick) fügt hinzu/entfernt statt zu ersetzen. */
  onSelect: (id: string | null, additive?: boolean) => void
  /** Mehrere Objekte auf einmal wählen (Rubberband-Auswahl); additive=true erweitert die bestehende Auswahl. */
  onSelectMany: (ids: string[], additive: boolean) => void
  /** Werkzeug von außen steuern (Werkzeug-Dock). Ohne Angabe verwaltet der Canvas es selbst. */
  tool?: ToolMode
  onToolChange?: (tool: ToolMode) => void
  /** Aktiver „Antippen & Platzieren“-Modus: Klick in den Plan setzt das Objekt an diese Stelle. */
  placement?: Placement | null
  onPlacementDone?: () => void
  /** Phase, deren (geänderte) Objekte als Geisterbild unter der aktuellen Phase liegen. */
  ghostPhaseId?: string | null
  /** IDs der Objekte fürs Geisterbild (vorberechnet: in der Vorphase anders/vorhanden). */
  ghostItemIds?: string[]
  onViewportChange?: (viewport: CanvasViewport) => void
  /** Gitter-Einstellungen */
  gridEnabled?: boolean
  gridSize?: number
  /** Event name for export filename. */
  eventName?: string
  /** Phase name for export filename. */
  phaseName?: string
}

export interface CanvasEditorHandle {
  /** Rendert den kompletten Erdgeschoss-Plan inkl. aller platzierten Objekte/Bereiche als PNG-DataURL. */
  exportSnapshot: () => Promise<string | null>
  /** Mittelpunkt des sichtbaren Ausschnitts in Canvas-Koordinaten (px), z. B. für Einfügen per Befehl. */
  getViewCenter: () => { x: number; y: number }
  /** Ansicht auf den ganzen Grundriss einpassen. */
  fitToView: () => void
  /** Bildschirmkoordinaten (z. B. e.clientX/Y beim Ziehen aus der Objekt-Bibliothek) in
   *  Canvas-Koordinaten umrechnen, oder null außerhalb der Plan-Fläche. */
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number } | null
  /** Ansicht auf den Canvas-Punkt (px) zentrieren — aber nur, wenn er außerhalb des sichtbaren
   *  Ausschnitts (abzüglich Rand für die schwebenden Inseln) liegt. Zoom bleibt unverändert. */
  panToItem: (x: number, y: number) => void
}

// Canvas-Grundfläche = kalibriertes Erdgeschoss (Stromplan). Bei DEFAULT_PIXELS_PER_METER=20px/m
// entspricht das der nativen Bildgröße (1755×1240px @ 23.6px/m) skaliert auf 20/23.6.
const CALIBRATION_SCALE = DEFAULT_PIXELS_PER_METER / POWER_PLAN_NATIVE_PIXELS_PER_METER
const STAGE_WIDTH = Math.round(1755 * CALIBRATION_SCALE)
const STAGE_HEIGHT = Math.round(1240 * CALIBRATION_SCALE)
const MIN_ZOOM = 0.25
const MAX_ZOOM = 6
const ZOOM_STEP = 0.1
const noop = () => {}

const CanvasEditor = forwardRef<CanvasEditorHandle, Props>(function CanvasEditor(
  {
    pixelsPerMeter,
    selectedIds,
    onSelect,
    onSelectMany,
    tool: toolProp,
    onToolChange,
    placement = null,
    onPlacementDone,
    ghostPhaseId = null,
    ghostItemIds = [],
    onViewportChange,
    gridEnabled = undefined,
    gridSize = undefined,
    eventName = 'Event',
    phaseName = 'Phase',
  },
  ref,
) {
  const items = useEventStore((s) => s.items)
  const itemOrder = useEventStore((s) => s.itemOrder)
  const currentPhaseId = useEventStore((s) => s.currentPhaseId)
  const layers = useEventStore((s) => s.layers)
  const updateItemTransform = useEventStore((s) => s.updateItemTransform)
  const moveItemsBy = useEventStore((s) => s.moveItemsBy)
  const addArea = useEventStore((s) => s.addArea)

  // Basis-Grundriss: kalibrierter Stromplan Erdgeschoss (enthält bereits Wände).
  // Das ehemalige floorplan.svg zeigte das Obergeschoss (Galerie) und wurde auf
  // Wunsch durch das Erdgeschoss ersetzt/zusammengeführt. "Vereinfacht" blendet
  // störende Details ab (aufgehellt/entsättigt), "Strom/CEE" legt die Anschlüsse
  // als eigenes Overlay unabhängig davon darüber.
  const [detailedImage] = useImage('/plans/power-plan.png')
  const [simplifiedImage] = useImage('/plans/power-plan-simple.png')
  const [powerOverlayImage] = useImage('/plans/power-overlay.png')
  const image = layers.simplified ? simplifiedImage : detailedImage
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)

  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [hasFit, setHasFit] = useState(false)
  const [toolState, setToolState] = useState<ToolMode>('select')
  const tool = toolProp ?? toolState
  const setTool = (next: ToolMode) => {
    if (onToolChange) onToolChange(next)
    else setToolState(next)
  }
  const [measurePoints, setMeasurePoints] = useState<{ x: number; y: number }[]>([])
  const [measureCursor, setMeasureCursor] = useState<{ x: number; y: number } | null>(null)
  const [areaStart, setAreaStart] = useState<{ x: number; y: number } | null>(null)
  const [areaCursor, setAreaCursor] = useState<{ x: number; y: number } | null>(null)
  // Rubberband-Mehrfachauswahl: bei gedrückter Shift-Taste zieht ein leerer Klick im Auswahl-
  // Werkzeug ein Auswahlrechteck auf statt die Ansicht zu verschieben. Erkannt wird das direkt am
  // Konva-"dragstart" der Stage (e.evt.shiftKey) statt über separat mitgeführten Tastatur-Status —
  // Dafür wird stage.draggable(false) direkt (imperativ, synchron) im mousedown-Handler gesetzt,
  // BEVOR Konvas eigene Drag-Erkennung beim nächsten Mousemove greifen kann — ein Abbrechen erst im
  // "dragstart"-Event (per stopDrag()) kam zu spät bzw. war nicht zuverlässig, weil Konva den
  // internen Drag da schon begonnen hatte. Am Ende der Geste wird draggable wieder hergestellt.
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null)
  const [marqueeCursor, setMarqueeCursor] = useState<{ x: number; y: number } | null>(null)

  const gridEnabledInternal = gridEnabled ?? false
  const gridSizeInternal = gridSize ?? 20

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100))

  useImperativeHandle(ref, () => ({
    exportSnapshot: async () => {
      const stage = stageRef.current
      if (!stage) return null

      // Für einen vollständigen, unverzerrten Export kurz auf 1:1-Ansicht des
      // gesamten Erdgeschoss-Plans wechseln, Snapshot ziehen, danach Ansicht wiederherstellen.
      const prevZoom = zoom
      const prevPos = stagePos
      const prevSelected = selectedIds
      const prevWidth = stage.width()
      const prevHeight = stage.height()
      onSelect(null)
      setZoom(1)
      setStagePos({ x: 0, y: 0 })
      await new Promise((resolve) => setTimeout(resolve, 60))

      // Die Stage-Canvas-Größe folgt normalerweise der Container-/Viewport-Größe (React-Props);
      // für einen vollständigen Export muss sie unabhängig davon auf die volle Planfläche gesetzt
      // werden, sonst wird alles außerhalb des aktuell sichtbaren Ausschnitts nicht gerendert.
      stage.width(STAGE_WIDTH)
      stage.height(STAGE_HEIGHT)
      stage.batchDraw()

      // JPEG statt PNG hält den PDF-Export klein (die gescannte Grundriss-Textur
      // komprimiert schlecht verlustfrei, macht sonst mehrere zehn MB pro Export aus).
      const dataUrl = stage.toDataURL({
        x: 0,
        y: 0,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        pixelRatio: 1.5,
        mimeType: 'image/jpeg',
        quality: 0.85,
      })

      stage.width(prevWidth)
      stage.height(prevHeight)
      setZoom(prevZoom)
      setStagePos(prevPos)
      if (prevSelected.length > 0) onSelectMany(prevSelected, false)

      return dataUrl
    },
    getViewCenter: () => {
      const w = containerSize?.width ?? STAGE_WIDTH
      const h = containerSize?.height ?? STAGE_HEIGHT
      return { x: (w / 2 - stagePos.x) / zoom, y: (h / 2 - stagePos.y) / zoom }
    },
    fitToView: () => setHasFit(false),
    screenToCanvas: (clientX, clientY) => {
      const el = containerRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const screenX = clientX - rect.left
      const screenY = clientY - rect.top
      if (screenX < 0 || screenY < 0 || screenX > rect.width || screenY > rect.height) return null
      return { x: (screenX - stagePos.x) / zoom, y: (screenY - stagePos.y) / zoom }
    },
    panToItem: (x, y) => {
      if (!containerSize) return
      const { width: w, height: h } = containerSize
      const sx = x * zoom + stagePos.x
      const sy = y * zoom + stagePos.y
      const MARGIN = 120
      if (sx >= MARGIN && sx <= w - MARGIN && sy >= MARGIN && sy <= h - MARGIN) return
      setStagePos({ x: w / 2 - x * zoom, y: h / 2 - y * zoom })
    },
  }))

  // Ausschnitt nach außen melden, damit z. B. die Kontextleiste an der Auswahl mitwandert
  useEffect(() => {
    if (!containerSize) return
    onViewportChange?.({ zoom, x: stagePos.x, y: stagePos.y, width: containerSize.width, height: containerSize.height })
  }, [zoom, stagePos, containerSize, onViewportChange])

  // Wird das Werkzeug von außen gewechselt (Dock/Tastatur), laufende Zeichenvorgänge abbrechen
  useEffect(() => {
    setMeasurePoints([])
    setMeasureCursor(null)
    setAreaStart(null)
    setAreaCursor(null)
  }, [tool])

  // Container-Größe verfolgen (für passgenauen Stage-Viewport). Erst nach der ersten
  // echten Messung wird gefittet, damit kein falscher Platzhalterwert einfließt.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setContainerSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Einmalig auf den Grundriss einpassen, sobald die reale Container-Größe bekannt ist
  useEffect(() => {
    if (hasFit || !containerSize) return
    const fit = Math.min(containerSize.width / STAGE_WIDTH, containerSize.height / STAGE_HEIGHT, 1)
    setZoom(clampZoom(fit))
    setStagePos({
      x: (containerSize.width - STAGE_WIDTH * fit) / 2,
      y: (containerSize.height - STAGE_HEIGHT * fit) / 2,
    })
    setHasFit(true)
  }, [containerSize, hasFit])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMeasurePoints([])
        setAreaStart(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /** Zoomt auf einen festen Bildschirmpunkt (Cursor oder Viewport-Mitte), Objekt unter dem Punkt bleibt stehen. */
  const zoomAtPoint = (newZoomRaw: number, point: { x: number; y: number }) => {
    const newZoom = clampZoom(newZoomRaw)
    const worldPoint = { x: (point.x - stagePos.x) / zoom, y: (point.y - stagePos.y) / zoom }
    setStagePos({
      x: point.x - worldPoint.x * newZoom,
      y: point.y - worldPoint.y * newZoom,
    })
    setZoom(newZoom)
  }

  const viewportCenter = { x: (containerSize?.width ?? 0) / 2, y: (containerSize?.height ?? 0) / 2 }

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition() ?? viewportCenter
    const direction = e.evt.deltaY > 0 ? -1 : 1
    zoomAtPoint(zoom + direction * ZOOM_STEP, pointer)
  }

  const handleExportImage = async () => {
    const stage = stageRef.current
    if (!stage) return

    // Save current state
    const prevZoom = zoom
    const prevPos = stagePos
    const prevSelected = selectedIds

    // Reset to full view
    onSelect(null)
    setZoom(1)
    setStagePos({ x: 0, y: 0 })
    
    // Wait for render
    await new Promise((resolve) => setTimeout(resolve, 60))

    try {
      // Generate filename
      const date = new Date().toISOString().split('T')[0]
      const filename = `${eventName.replace(/\s+/g, '_')}_${phaseName.replace(/\s+/g, '_')}_${date}`

      // Export as image
      await exportCanvasAsImage(stageRef, filename, 1.5)
    } finally {
      // Restore previous state
      setZoom(prevZoom)
      setStagePos(prevPos)
      if (prevSelected.length > 0) onSelectMany(prevSelected, false)
    }
  }

  const stagePointerToInternal = (stage: Konva.Stage) => {
    const pos = stage.getRelativePointerPosition()
    if (!pos) return null
    return { x: pos.x, y: pos.y }
  }

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return

    // Shift+Ziehen auf leerer Fläche startet die Marquee-Mehrfachauswahl statt die Ansicht zu
    // verschieben. draggable(false) muss HIER, synchron im mousedown, imperativ gesetzt werden —
    // ein React-Prop-Update käme erst beim nächsten Render, zu spät für Konvas eigene
    // Drag-Erkennung beim folgenden Mousemove.
    if (tool === 'select' && e.evt.shiftKey && e.target === stage) {
      stage.draggable(false)
      const pt = stagePointerToInternal(stage)
      if (pt) {
        setMarqueeStart(pt)
        setMarqueeCursor(pt)
      }
      return
    }

    if (tool === 'measure') {
      const pt = stagePointerToInternal(stage)
      if (!pt) return
      setMeasurePoints((pts) => (pts.length >= 2 ? [pt] : [...pts, pt]))
      return
    }

    if (tool === 'area') {
      const pt = stagePointerToInternal(stage)
      if (!pt) return
      setAreaStart(pt)
      setAreaCursor(pt)
      return
    }

    if (placement) return // Klick wird von handlePlacementClick verarbeitet

    if (e.target === stage) onSelect(null)
  }

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === 'measure' && measurePoints.length === 1) {
      const stage = e.target.getStage()
      if (!stage) return
      const pt = stagePointerToInternal(stage)
      if (pt) setMeasureCursor(pt)
      return
    }
    if (tool === 'area' && areaStart) {
      const stage = e.target.getStage()
      if (!stage) return
      const pt = stagePointerToInternal(stage)
      if (pt) setAreaCursor(pt)
      return
    }
    if (marqueeStart) {
      const stage = e.target.getStage()
      if (!stage) return
      const pt = stagePointerToInternal(stage)
      if (pt) setMarqueeCursor(pt)
    }
  }

  const handleStageMouseUp = () => {
    if (marqueeStart && marqueeCursor) {
      // draggable(true) wieder herstellen — wurde bei Beginn dieser Geste (Shift+Mousedown auf
      // leerer Fläche) imperativ auf false gesetzt, um Konvas eigenes Stage-Dragging zu verhindern.
      if (tool === 'select') stageRef.current?.draggable(true)
      const rect = {
        minX: Math.min(marqueeStart.x, marqueeCursor.x),
        maxX: Math.max(marqueeStart.x, marqueeCursor.x),
        minY: Math.min(marqueeStart.y, marqueeCursor.y),
        maxY: Math.max(marqueeStart.y, marqueeCursor.y),
      }
      setMarqueeStart(null)
      setMarqueeCursor(null)
      if (rect.maxX - rect.minX < 4 && rect.maxY - rect.minY < 4) return // zu klein, vermutlich nur ein Klick
      const hitIds = visibleItemIds.filter((id) => {
        const item = items[id]
        const pd = item?.phaseData[currentPhaseId]
        if (!item || !pd) return false
        const b = itemWorldBBox(item, pd, pixelsPerMeter)
        return b.minX <= rect.maxX && b.maxX >= rect.minX && b.minY <= rect.maxY && b.maxY >= rect.minY
      })
      onSelectMany(hitIds, true)
      return
    }
    if (tool !== 'area' || !areaStart || !areaCursor) return
    const x = Math.min(areaStart.x, areaCursor.x)
    const y = Math.min(areaStart.y, areaCursor.y)
    const widthPx = Math.abs(areaCursor.x - areaStart.x)
    const heightPx = Math.abs(areaCursor.y - areaStart.y)
    setAreaStart(null)
    setAreaCursor(null)
    if (widthPx < 4 || heightPx < 4) return // zu klein, vermutlich nur ein Klick
    const widthM = pixelsToMeters(widthPx, pixelsPerMeter)
    const heightM = pixelsToMeters(heightPx, pixelsPerMeter)
    const id = addArea(x, y, widthM, heightM)
    onSelect(id)
    // Nach dem Zeichnen automatisch zurück ins Auswählen-Werkzeug wechseln, damit man den
    // gerade erstellten Bereich direkt anschauen/verschieben kann, statt ungewollt weitere
    // Bereiche zu erzeugen.
    setTool('select')
  }

  /** „Antippen & Platzieren“: Klick/Tipp in den Plan setzt das gewählte Objekt an diese Stelle. */
  const handlePlacementClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!placement || tool !== 'select') return
    const stage = e.target.getStage()
    if (!stage) return
    const pt = stagePointerToInternal(stage)
    if (!pt) return
    const id = placement.place(pt.x, pt.y)
    if (id) onSelect(id)
    if (placement.once) onPlacementDone?.()
  }

  // Stabile Handler für EventItemShape (React.memo): aktuelle Werte über Refs lesen, damit sich
  // die Funktionsreferenz nie ändert und beim Verschieben EINES Objekts nicht alle anderen
  // Objekte neu gerendert/abgeglichen werden.
  const selectCtxRef = useRef({ tool, placement, onSelect })
  selectCtxRef.current = { tool, placement, onSelect }
  const handleItemSelect = useCallback((id: string, additive: boolean) => {
    const { tool: t, placement: p, onSelect: sel } = selectCtxRef.current
    if (t === 'select' && !p) sel(id, additive)
  }, [])
  // Für Mehrfachauswahl: beim Ziehen eines ausgewählten Objekts alle anderen ausgewählten
  // Objekte um denselben Versatz mitbewegen. Über eine Ref gelesen, damit sich die Callback-
  // Referenz nicht bei jeder Auswahländerung ändert (siehe Kommentar oben).
  const dragCtxRef = useRef({ selectedIds, items, currentPhaseId })
  dragCtxRef.current = { selectedIds, items, currentPhaseId }
  const handleItemDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      const { selectedIds: sel, items: curItems, currentPhaseId: cp } = dragCtxRef.current
      // Grid snapping is already applied in EventItemShape
      if (sel.length > 1 && sel.includes(id)) {
        const pd = curItems[id]?.phaseData[cp]
        if (pd) {
          const dx = x - pd.x
          const dy = y - pd.y
          const moveIds = sel.filter((sid) => !curItems[sid]?.locked)
          if (dx !== 0 || dy !== 0) moveItemsBy(moveIds, dx, dy)
          return
        }
      }
      updateItemTransform(id, x, y)
    },
    [updateItemTransform, moveItemsBy],
  )
  const handleItemRotate = useCallback(
    (id: string, x: number, y: number, rotation: number) => updateItemTransform(id, x, y, rotation),
    [updateItemTransform],
  )

  const visibleItemIds = itemOrder.filter((id) => items[id]?.phaseData[currentPhaseId]?.visible)

  const measureEnd = measurePoints.length === 2 ? measurePoints[1] : measureCursor
  const measureStart = measurePoints[0]
  const measureDistanceM =
    measureStart && measureEnd
      ? pixelsToMeters(
          Math.hypot(measureEnd.x - measureStart.x, measureEnd.y - measureStart.y),
          pixelsPerMeter,
        )
      : null

  return (
    <div className="w-full h-full relative">
      <div
        ref={containerRef}
        className={`absolute inset-0 overflow-hidden bg-ground ${
          placement || tool !== 'select' ? 'cursor-crosshair' : ''
        }`}
      >
        <Stage
          ref={stageRef}
          width={containerSize?.width ?? 0}
          height={containerSize?.height ?? 0}
          scaleX={zoom}
          scaleY={zoom}
          x={stagePos.x}
          y={stagePos.y}
          draggable={tool === 'select'}
          onDragEnd={(e) => {
            // Das dragend-Event von Objekten bubbelt bis zur Stage hoch — nur reagieren,
            // wenn die Stage selbst (nicht ein Kind-Objekt) gezogen wurde.
            if (e.target !== e.target.getStage()) return
            setStagePos({ x: e.target.x(), y: e.target.y() })
          }}
          onWheel={handleWheel}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onClick={handlePlacementClick}
          onTap={handlePlacementClick}
        >
          {/* Wände / Grundriss (Erdgeschoss, kalibriert) */}
          {layers.walls && (
            <Layer listening={false}>
              {image && <KonvaImage image={image} width={STAGE_WIDTH} height={STAGE_HEIGHT} />}
            </Layer>
          )}

          {/* Strom/CEE-Layer: Bodentanks, CEE 16A/32A/63A als eigenes, unabhängig schaltbares Overlay */}
          {layers.power && (
            <Layer listening={false}>
              {powerOverlayImage && (
                <KonvaImage image={powerOverlayImage} width={STAGE_WIDTH} height={STAGE_HEIGHT} />
              )}
            </Layer>
          )}

          {/* Bühnenzüge (Rigging) Referenzlinien */}
          {layers.rigging && (
            <Layer listening={false}>
              {RIGGING_BARS.map((bar) => {
                const x = STAGE_FRONT_EDGE.x + metersToPixels(bar.distanceFromStageFrontM, pixelsPerMeter)
                const widthPx = metersToPixels(STAGE_FRONT_EDGE.widthM, pixelsPerMeter)
                return (
                  <Group key={bar.id}>
                    <Rect
                      x={x - 1}
                      y={STAGE_FRONT_EDGE.y}
                      width={2}
                      height={widthPx}
                      fill="#d97706"
                      rotation={90}
                    />
                    <Text
                      x={x - 10}
                      y={STAGE_FRONT_EDGE.y - 14}
                      text={`Zug ${bar.id} (${bar.loadCapacityKg}kg)`}
                      fontSize={10}
                      fill="#92400e"
                    />
                  </Group>
                )
              })}
            </Layer>
          )}

          {/* Gitter-Visualisierung */}
          {gridEnabledInternal && (
            <Layer listening={false} opacity={0.35}>
              {(() => {
                const lines: { key: string; points: number[] }[] = []
                // Vertical grid lines
                for (let x = 0; x <= STAGE_WIDTH; x += gridSizeInternal) {
                  lines.push({ key: `v-${x}`, points: [x, 0, x, STAGE_HEIGHT] })
                }
                // Horizontal grid lines
                for (let y = 0; y <= STAGE_HEIGHT; y += gridSizeInternal) {
                  lines.push({ key: `h-${y}`, points: [0, y, STAGE_WIDTH, y] })
                }
                return lines.map((line) => (
                  <Line key={line.key} points={line.points} stroke="#94a3b8" strokeWidth={1.5} perfectDrawEnabled={false} />
                ))
              })()}
            </Layer>
          )}

          {/* Geisterbild der Vorphase (Konzept C): nur, was dort anders stand oder inzwischen weg ist */}
          {ghostPhaseId && ghostItemIds.length > 0 && (
            <Layer listening={false} opacity={0.3}>
              {ghostItemIds.map((id) => {
                const item = items[id]
                const phaseData = item?.phaseData[ghostPhaseId]
                if (!item || !phaseData) return null
                return (
                  <EventItemShape
                    key={`ghost-${id}`}
                    item={item}
                    phaseData={phaseData}
                    pixelsPerMeter={pixelsPerMeter}
                    isSelected={false}
                    onSelect={noop}
                    onDragEnd={noop}
                    draggable={false}
                    zoom={zoom}
                  />
                )
              })}
            </Layer>
          )}

          {/* Event-Objekte der aktiven Phase */}
          <Layer>
            {visibleItemIds.map((id) => {
              const item = items[id]
              const phaseData = item.phaseData[currentPhaseId]
              return (
                <EventItemShape
                  key={id}
                  item={item}
                  phaseData={phaseData}
                  pixelsPerMeter={pixelsPerMeter}
                  isSelected={selectedIds.includes(id)}
                  onSelect={handleItemSelect}
                  onDragEnd={handleItemDragEnd}
                  onRotate={handleItemRotate}
                  draggable={tool === 'select' && !placement}
                  zoom={zoom}
                  gridEnabled={gridEnabledInternal}
                  gridSize={gridSizeInternal}
                />
              )
            })}
          </Layer>

          {/* Maßwerkzeug */}
          {tool === 'measure' && measureStart && measureEnd && (
            <Layer listening={false}>
              <Line
                points={[measureStart.x, measureStart.y, measureEnd.x, measureEnd.y]}
                stroke="#dc2626"
                strokeWidth={1.5 / zoom}
                dash={[6 / zoom, 4 / zoom]}
              />
              <Circle x={measureStart.x} y={measureStart.y} radius={3 / zoom} fill="#dc2626" />
              <Circle x={measureEnd.x} y={measureEnd.y} radius={3 / zoom} fill="#dc2626" />
              <Group x={(measureStart.x + measureEnd.x) / 2} y={(measureStart.y + measureEnd.y) / 2 - 16 / zoom}>
                <Rect
                  x={-30 / zoom}
                  y={-9 / zoom}
                  width={60 / zoom}
                  height={18 / zoom}
                  fill="#dc2626"
                  cornerRadius={3 / zoom}
                />
                <Text
                  x={-30 / zoom}
                  y={-6 / zoom}
                  width={60 / zoom}
                  align="center"
                  text={`${measureDistanceM?.toFixed(2)} m`}
                  fontSize={11 / zoom}
                  fill="#fff"
                />
              </Group>
            </Layer>
          )}

          {/* Bereichs-Werkzeug: Live-Vorschau während des Aufziehens */}
          {tool === 'area' && areaStart && areaCursor && (
            <Layer listening={false}>
              <Rect
                x={Math.min(areaStart.x, areaCursor.x)}
                y={Math.min(areaStart.y, areaCursor.y)}
                width={Math.abs(areaCursor.x - areaStart.x)}
                height={Math.abs(areaCursor.y - areaStart.y)}
                fill="rgba(16,185,129,0.15)"
                stroke="#059669"
                strokeWidth={1.5 / zoom}
                dash={[6 / zoom, 3 / zoom]}
              />
              <Text
                x={Math.min(areaStart.x, areaCursor.x)}
                y={Math.min(areaStart.y, areaCursor.y) - 16 / zoom}
                text={`${pixelsToMeters(Math.abs(areaCursor.x - areaStart.x), pixelsPerMeter).toFixed(2)} × ${pixelsToMeters(Math.abs(areaCursor.y - areaStart.y), pixelsPerMeter).toFixed(2)} m`}
                fontSize={11 / zoom}
                fill="#059669"
              />
            </Layer>
          )}

          {/* Rubberband-Mehrfachauswahl: Live-Vorschau des Auswahlrechtecks */}
          {marqueeStart && marqueeCursor && (
            <Layer listening={false}>
              <Rect
                x={Math.min(marqueeStart.x, marqueeCursor.x)}
                y={Math.min(marqueeStart.y, marqueeCursor.y)}
                width={Math.abs(marqueeCursor.x - marqueeStart.x)}
                height={Math.abs(marqueeCursor.y - marqueeStart.y)}
                fill="rgba(37,99,235,0.08)"
                stroke="#2563eb"
                strokeWidth={1 / zoom}
                dash={[4 / zoom, 3 / zoom]}
              />
            </Layer>
          )}
        </Stage>
      </div>

      {/* Zoom-Insel (schwebt links über dem Plan) */}
      <div className={`absolute left-4 top-[84px] z-10 flex flex-col items-center p-1 gap-0.5 ${island}`}>
        <button
          onClick={() => zoomAtPoint(zoom + ZOOM_STEP, viewportCenter)}
          className="w-9 h-9 rounded-xl text-ink hover:bg-chip text-lg leading-none"
          title="Vergrößern"
        >
          +
        </button>
        <span className="font-mono text-[10.5px] text-ink2 py-0.5" title="Zoom">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => zoomAtPoint(zoom - ZOOM_STEP, viewportCenter)}
          className="w-9 h-9 rounded-xl text-ink hover:bg-chip text-lg leading-none"
          title="Verkleinern"
        >
          −
        </button>
        <div className="w-6 h-px bg-line my-0.5" />
        <button
          onClick={() => setHasFit(false)}
          className="w-9 h-9 rounded-xl text-ink hover:bg-chip text-[15px] leading-none"
          title="Einpassen"
        >
          ⤢
        </button>
        <div className="w-6 h-px bg-line my-0.5" />
        <button
          onClick={handleExportImage}
          className="w-9 h-9 rounded-xl text-ink hover:bg-chip text-[15px] leading-none"
          title="Als Bild exportieren"
        >
          📸
        </button>
      </div>

      {/* Maßstab + Objektzahl (ehemalige Statusleiste) */}
      <div className="absolute left-[72px] top-[92px] z-10 pointer-events-none flex flex-col gap-1 font-mono text-[10.5px] text-ink2">
        <span className="flex items-center gap-1.5">
          <i
            className="block h-1.5 border-[1.5px] border-t-0 border-ink2"
            style={{ width: Math.max(12, metersToPixels(5, pixelsPerMeter) * zoom) }}
          />
          5 m
        </span>
        <span className="text-ink3">
          {Math.round(pixelsPerMeter * zoom * 10) / 10} px/m · {visibleItemIds.length} sichtbar / {itemOrder.length} gesamt
        </span>
      </div>

      {/* Werkzeug-Hinweis */}
      {(tool !== 'select' || placement) && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[76px] z-10 pointer-events-none">
          <div className="bg-accent text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
            {placement
              ? `Tippen/Klicken zum Platzieren · ${placement.label}${placement.once ? '' : ' · Esc beendet'}`
              : tool === 'measure'
                ? 'Messen: zwei Punkte anklicken · Esc setzt zurück'
                : 'Bereich: Rechteck aufziehen · Esc bricht ab'}
          </div>
        </div>
      )}
    </div>
  )
})

export default CanvasEditor
