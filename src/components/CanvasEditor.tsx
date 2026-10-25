import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Group, Rect, Text, Circle, Shape } from 'react-konva'
import Konva from 'konva'
import useImage from '../utils/useImage'
import { useEventStore } from '../store/store'
import { metersToPixels, pixelsToMeters, DEFAULT_PIXELS_PER_METER, POWER_PLAN_NATIVE_PIXELS_PER_METER } from '../utils/scale'
import { RIGGING_BARS, STAGE_FRONT_EDGE } from '../data/rigging'
import EventItemShape from './EventItemShape'
import type { Placement } from '../utils/placement'
import { exportCanvasAsImage } from '../utils/exportImage'
import { splitVisiovaRun } from '../utils/visiova'
import { itemLevel } from '../utils/levels'
import { OG_VOIDS } from '../data/venueOG'
import { unionBox, translateBox, worldBBox, type Box } from '../utils/geometry'
import { clampZoom, nextZoomStep, quantizeZoom, interpretWheel, IS_COARSE_POINTER } from '../utils/viewport'
import {
  snapBoxToTargets,
  snapBoxToGrid,
  nearestGaps,
  SNAP_THRESHOLD_SCREEN_PX,
  type DragMods,
  type Guide,
  type GapMeasure,
} from '../utils/snapping'

/** Laufende Ziehbewegung eines Objekts (bzw. der ausgewählten Gruppe). Wird nur imperativ genutzt,
 *  damit beim Ziehen kein React-State pro Frame entsteht. */
interface DragSession {
  id: string
  start: { x: number; y: number }
  others: { id: string; node: Konva.Node; start: { x: number; y: number } }[]
  movingBox: Box
  targets: Box[]
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
  /** Nur Ansicht (z. B. Freigabe-Link): Objekte sind nicht anfassbar, Ziehen verschiebt die Ansicht. */
  viewOnly?: boolean
  /** Aktiver „Antippen & Platzieren“-Modus: Klick in den Plan setzt das Objekt an diese Stelle. */
  placement?: Placement | null
  onPlacementDone?: () => void
  /** Phase, deren (geänderte) Objekte als Geisterbild unter der aktuellen Phase liegen. */
  ghostPhaseId?: string | null
  /** IDs der Objekte fürs Geisterbild (vorberechnet: in der Vorphase anders/vorhanden). */
  ghostItemIds?: string[]
  onViewportChange?: (viewport: CanvasViewport) => void
  /** Wird gemeldet, wenn eine Ansichts-Geste (Verschieben, Pinch, Leertaste, Rahmen) beginnt bzw. endet. */
  onGestureChange?: (active: boolean) => void
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
  /** Canvas als Bild exportieren. */
  exportImage: () => Promise<void>
  /** Zoom vergrößern. */
  zoomIn: () => void
  /** Zoom verkleinern. */
  zoomOut: () => void
  /** Zoom auf einen Prozentwert setzen. */
  setZoomPercent: (percent: number) => void
  /** Ansicht so zoomen und verschieben, dass der Bereich (Plan-Koordinaten, px) sichtbar ist. */
  zoomToBounds: (b: Box) => void
}

// Canvas-Grundfläche = kalibriertes Erdgeschoss (Stromplan). Bei DEFAULT_PIXELS_PER_METER=20px/m
// entspricht das der nativen Bildgröße (1755×1240px @ 23.6px/m) skaliert auf 20/23.6.
const CALIBRATION_SCALE = DEFAULT_PIXELS_PER_METER / POWER_PLAN_NATIVE_PIXELS_PER_METER
const STAGE_WIDTH = Math.round(1755 * CALIBRATION_SCALE)
const STAGE_HEIGHT = Math.round(1240 * CALIBRATION_SCALE)
const noop = () => {}

// Retina-Canvases begrenzen (iPad-Speicherlimit), Finger brauchen größere Zieh-Schwelle,
// Pinch muss auch während eines Drags erkannt werden (Konva-Demo „Multi-touch Scale Stage“).
Konva.pixelRatio = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
Konva.dragDistance = IS_COARSE_POINTER ? 8 : 3
Konva.hitOnDragEnabled = true

const CanvasEditor = forwardRef<CanvasEditorHandle, Props>(function CanvasEditor(
  {
    pixelsPerMeter,
    selectedIds,
    onSelect,
    onSelectMany,
    tool: toolProp,
    onToolChange,
    viewOnly = false,
    placement = null,
    onPlacementDone,
    ghostPhaseId = null,
    ghostItemIds = [],
    onViewportChange,
    onGestureChange,
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
  const [detailedNoCodesImage] = useImage('/plans/power-plan-nolabels.png')
  const [simplifiedNoCodesImage] = useImage('/plans/power-plan-simple-nolabels.png')
  const [powerOverlayImage] = useImage('/plans/power-overlay.png')
  const currentLevel = useEventStore((s) => s.currentLevel)
  const revision = useEventStore((s) => s.revision)
  const [ogImage] = useImage(currentLevel === 'og' ? '/plans/og-plan.png' : '')
  const image = layers.hideCodes
    ? layers.simplified ? simplifiedNoCodesImage : detailedNoCodesImage
    : layers.simplified ? simplifiedImage : detailedImage
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)

  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null)
  // Ansicht: viewRef wird sofort gesetzt (Stage direkt, ohne auf React zu warten); der React-State
  // (zoom/stagePos) wird nur einmal pro Frame gespiegelt, damit Zoom-Ticks nicht alles neu rendern.
  const viewRef = useRef({ zoom: 1, x: 0, y: 0 })
  const rafRef = useRef(0)
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
  const [measureLines, setMeasureLines] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } }[]>([])
  const [areaStart, setAreaStart] = useState<{ x: number; y: number } | null>(null)
  const [areaCursor, setAreaCursor] = useState<{ x: number; y: number } | null>(null)
  // Rubberband-Mehrfachauswahl: ein Ziehen auf leerer Fläche (Maus, Auswahl-Werkzeug) zieht ein
  // Auswahlrechteck auf. Shift beim Drücken erweitert die bestehende Auswahl.
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null)
  const [marqueeCursor, setMarqueeCursor] = useState<{ x: number; y: number } | null>(null)
  const marqueeAdditiveRef = useRef(false)
  // Ansichts-Gesten: Verschieben (Leertaste, Mitteltaste, Finger auf leerer Fläche), Pinch, Leertaste
  const [spaceDown, setSpaceDown] = useState(false)
  const spaceDownRef = useRef(false)
  const [panning, setPanning] = useState(false)
  const panRef = useRef<{ cx: number; cy: number; x: number; y: number; tapOnEmpty: boolean } | null>(null)
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null)
  // Handler für Zeigerbewegung/-ende über das Fenster (werden nach jedem Render aktualisiert)
  const gestureMoveRef = useRef<(ev: PointerEvent) => void>(() => {})
  const gestureEndRef = useRef<(ev: PointerEvent) => void>(() => {})
  const gestureCbRef = useRef(onGestureChange)
  const guideGroupRef = useRef<Konva.Group>(null)

  const gridEnabledInternal = gridEnabled ?? false
  const gridSizeInternal = gridSize ?? 20
  // Für nicht ausgewählte Objekte nur quantisierter Zoom: sie rendern beim Zoomen nur bei Stufenwechsel neu
  const zoomBucket = quantizeZoom(zoom)

  /** Ansicht sofort an der Stage setzen (kein Warten auf React) und einmal pro Frame in den State spiegeln. */
  const applyView = (zRaw: number, x: number, y: number) => {
    const z = clampZoom(zRaw)
    viewRef.current = { zoom: z, x, y }
    const stage = stageRef.current
    if (stage) {
      stage.scale({ x: z, y: z })
      stage.position({ x, y })
      stage.batchDraw()
    }
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        const v = viewRef.current
        setZoom(v.zoom)
        setStagePos({ x: v.x, y: v.y })
      })
    }
  }
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  /** Zoomt auf einen festen Bildschirmpunkt (Cursor oder Viewport-Mitte), Objekt unter dem Punkt bleibt stehen. */
  const zoomAtPoint = (newZoomRaw: number, point: { x: number; y: number }) => {
    const v = viewRef.current
    const z = clampZoom(newZoomRaw)
    const wx = (point.x - v.x) / v.zoom
    const wy = (point.y - v.y) / v.zoom
    applyView(z, point.x - wx * z, point.y - wy * z)
  }

  /** Bildschirmpunkt (clientX/Y) in Plan-Koordinaten umrechnen, ohne Bereichsprüfung. */
  const clientToCanvas = (clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const v = viewRef.current
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom }
  }

  const handleExportImage = async () => {
    const stage = stageRef.current
    if (!stage) return

    // Save current state
    const prevView = { ...viewRef.current }
    const prevSelected = selectedIds

    // Reset to full view
    onSelect(null)
    applyView(1, 0, 0)

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
      applyView(prevView.zoom, prevView.x, prevView.y)
      if (prevSelected.length > 0) onSelectMany(prevSelected, false)
    }
  }

  useImperativeHandle(ref, () => ({
    exportSnapshot: async () => {
      const stage = stageRef.current
      if (!stage) return null

      // Für einen vollständigen, unverzerrten Export kurz auf 1:1-Ansicht des
      // gesamten Erdgeschoss-Plans wechseln, Snapshot ziehen, danach Ansicht wiederherstellen.
      const prevView = { ...viewRef.current }
      const prevSelected = selectedIds
      const prevWidth = stage.width()
      const prevHeight = stage.height()
      onSelect(null)
      applyView(1, 0, 0)
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
      applyView(prevView.zoom, prevView.x, prevView.y)
      if (prevSelected.length > 0) onSelectMany(prevSelected, false)

      return dataUrl
    },
    exportImage: handleExportImage,
    getViewCenter: () => {
      const w = containerSize?.width ?? STAGE_WIDTH
      const h = containerSize?.height ?? STAGE_HEIGHT
      const v = viewRef.current
      return { x: (w / 2 - v.x) / v.zoom, y: (h / 2 - v.y) / v.zoom }
    },
    fitToView: () => setHasFit(false),
    screenToCanvas: (clientX, clientY) => {
      const el = containerRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const screenX = clientX - rect.left
      const screenY = clientY - rect.top
      if (screenX < 0 || screenY < 0 || screenX > rect.width || screenY > rect.height) return null
      const v = viewRef.current
      return { x: (screenX - v.x) / v.zoom, y: (screenY - v.y) / v.zoom }
    },
    panToItem: (x, y) => {
      if (!containerSize) return
      const { width: w, height: h } = containerSize
      const v = viewRef.current
      const sx = x * v.zoom + v.x
      const sy = y * v.zoom + v.y
      const MARGIN = 120
      if (sx >= MARGIN && sx <= w - MARGIN && sy >= MARGIN && sy <= h - MARGIN) return
      applyView(v.zoom, w / 2 - x * v.zoom, h / 2 - y * v.zoom)
    },
    zoomIn: () => {
      if (!containerSize) return
      const point = { x: containerSize.width / 2, y: containerSize.height / 2 }
      zoomAtPoint(nextZoomStep(viewRef.current.zoom, 1), point)
    },
    zoomOut: () => {
      if (!containerSize) return
      const point = { x: containerSize.width / 2, y: containerSize.height / 2 }
      zoomAtPoint(nextZoomStep(viewRef.current.zoom, -1), point)
    },
    setZoomPercent: (percent: number) => {
      if (!containerSize) return
      zoomAtPoint(percent / 100, { x: containerSize.width / 2, y: containerSize.height / 2 })
    },
    zoomToBounds: (b: Box) => {
      if (!containerSize) return
      const pad = 80
      const w = Math.max(b.maxX - b.minX, 40)
      const h = Math.max(b.maxY - b.minY, 40)
      const z = clampZoom(Math.min((containerSize.width - 2 * pad) / w, (containerSize.height - 2 * pad) / h, 3))
      applyView(
        z,
        containerSize.width / 2 - ((b.minX + b.maxX) / 2) * z,
        containerSize.height / 2 - ((b.minY + b.maxY) / 2) * z,
      )
    },
  }))

  // Ausschnitt nach außen melden, damit z. B. die Kontextleiste an der Auswahl mitwandert
  useEffect(() => {
    if (!containerSize) return
    onViewportChange?.({ zoom, x: stagePos.x, y: stagePos.y, width: containerSize.width, height: containerSize.height })
  }, [zoom, stagePos, containerSize, onViewportChange])

  // Wird das Werkzeug von außen gewechselt (Dock/Tastatur), laufende Zeichenvorgänge abbrechen.
  // Messlinien bleiben bis Esc stehen.
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
    applyView(
      fit,
      (containerSize.width - STAGE_WIDTH * fit) / 2,
      (containerSize.height - STAGE_HEIGHT * fit) / 2,
    )
    setHasFit(true)
  }, [containerSize, hasFit])

  // Leertaste hält das Verschieben der Ansicht, Esc bricht laufende Vorgänge ab.
  // Bei Eingabefeldern als Ziel passiert nichts.
  useEffect(() => {
    const isTextTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    }
    const setSpace = (v: boolean) => {
      if (spaceDownRef.current === v) return
      spaceDownRef.current = v
      setSpaceDown(v)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextTarget(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        setSpace(true)
        return
      }
      if (e.key === 'Escape') {
        setMeasurePoints([])
        setMeasureCursor(null)
        setMeasureLines([])
        setAreaStart(null)
        setAreaCursor(null)
        setMarqueeStart(null)
        setMarqueeCursor(null)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false)
    }
    const onBlur = () => setSpace(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Safari würde sonst bei Pinch die ganze Seite zoomen
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const block = (ev: Event) => ev.preventDefault()
    el.addEventListener('gesturestart', block)
    el.addEventListener('gesturechange', block)
    return () => {
      el.removeEventListener('gesturestart', block)
      el.removeEventListener('gesturechange', block)
    }
  }, [])

  const viewportCenter = { x: (containerSize?.width ?? 0) / 2, y: (containerSize?.height ?? 0) / 2 }

  /** Mausrad / Trackpad: Pinch bzw. ⌘/Strg+Rad zoomt am Cursor, Zwei-Finger-Scrollen verschiebt. */
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const intent = interpretWheel(e.evt)
    const v = viewRef.current
    if (intent.kind === 'zoom') {
      zoomAtPoint(v.zoom * intent.factor, stageRef.current?.getPointerPosition() ?? viewportCenter)
    } else {
      applyView(v.zoom, v.x - intent.dx, v.y - intent.dy)
    }
  }

  const stagePointerToInternal = (stage: Konva.Stage) => {
    const pos = stage.getRelativePointerPosition()
    if (!pos) return null
    return { x: pos.x, y: pos.y }
  }

  // Ansichts-Gesten und Zeichen-Gesten. Eine Geste beginnt mit dem Drücken, die Bewegung und das
  // Ende laufen über das Fenster (siehe Effekt unten), damit sie auch außerhalb des Plans enden.
  const cancelGestures = () => {
    setMarqueeStart(null)
    setMarqueeCursor(null)
    setAreaStart(null)
    setAreaCursor(null)
    if (panRef.current) {
      panRef.current = null
      setPanning(false)
      gestureCbRef.current?.(false)
    }
  }

  const handleStagePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return
    const evt = e.evt
    // Zweiter Finger: laufende Ein-Finger-Geste abbrechen, Pinch übernimmt (handleTouchMove)
    if (evt.pointerType === 'touch' && !evt.isPrimary) {
      cancelGestures()
      return
    }
    const onEmpty = e.target === stage
    const pt = clientToCanvas(evt.clientX, evt.clientY)
    if (!pt) return
    // Ansicht verschieben (in jedem Werkzeug, auch über Objekten): mittlere oder rechte Maustaste,
    // Leertaste gehalten, auf leerer Fläche mit dem Finger
    const wantsPan =
      evt.button === 1 ||
      evt.button === 2 ||
      viewOnly ||
      spaceDownRef.current ||
      (onEmpty && tool === 'select' && !placement && evt.pointerType !== 'mouse')
    if (wantsPan) {
      evt.preventDefault()
      const v = viewRef.current
      panRef.current = {
        cx: evt.clientX,
        cy: evt.clientY,
        x: v.x,
        y: v.y,
        tapOnEmpty: !viewOnly && evt.button === 0 && onEmpty && tool === 'select' && !placement,
      }
      setPanning(true)
      gestureCbRef.current?.(true)
      return
    }
    if (evt.button !== 0) return
    if (tool === 'measure') {
      if (measurePoints.length === 1) {
        const a = measurePoints[0]
        setMeasureLines((lines) => [...lines, { a, b: pt }])
        setMeasurePoints([])
        setMeasureCursor(null)
      } else {
        setMeasurePoints([pt])
      }
      return
    }
    if (tool === 'area') {
      setAreaStart(pt)
      setAreaCursor(pt)
      return
    }
    if (placement) return // Klick wird von handlePlacementClick verarbeitet
    if (tool === 'select' && onEmpty) {
      marqueeAdditiveRef.current = evt.shiftKey // Shift ergänzt die Auswahl
      setMarqueeStart(pt)
      setMarqueeCursor(pt)
    }
  }

  // Pinch (zwei Finger): Zoom am Mittelpunkt der Finger, Verschieben mit dem Mittelpunkt
  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches
    const el = containerRef.current
    if (t.length !== 2 || !el) return
    e.evt.preventDefault()
    const r = el.getBoundingClientRect()
    const ax = t[0].clientX - r.left
    const ay = t[0].clientY - r.top
    const bx = t[1].clientX - r.left
    const by = t[1].clientY - r.top
    const cx = (ax + bx) / 2
    const cy = (ay + by) / 2
    const dist = Math.hypot(ax - bx, ay - by)
    if (!pinchRef.current) {
      cancelGestures()
      stageRef.current?.find((n: Konva.Node) => n.isDragging()).forEach((n: Konva.Node) => n.stopDrag())
      pinchRef.current = { dist, cx, cy }
      gestureCbRef.current?.(true)
      return
    }
    const v = viewRef.current
    const last = pinchRef.current
    const z = clampZoom(v.zoom * (dist / last.dist))
    const wx = (last.cx - v.x) / v.zoom
    const wy = (last.cy - v.y) / v.zoom
    applyView(z, cx - wx * z, cy - wy * z)
    pinchRef.current = { dist, cx, cy }
  }

  const handleTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2 && pinchRef.current) {
      pinchRef.current = null
      gestureCbRef.current?.(false)
    }
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
  // visibleItemIds wird unten gesetzt, sobald es berechnet ist (Ref-Wert wird vor jedem Ziehen gelesen).
  const dragCtxRef = useRef({ selectedIds, items, currentPhaseId, visibleItemIds: [] as string[] })
  // Einrasten: Raster-Einstellung aus den Props, ebenfalls über eine Ref gelesen.
  const snapCtxRef = useRef({ gridEnabled: gridEnabledInternal, gridSize: gridSizeInternal })
  snapCtxRef.current = { gridEnabled: gridEnabledInternal, gridSize: gridSizeInternal }
  // Laufende Ziehbewegung (nur während eines Drags gesetzt).
  const dragRef = useRef<DragSession | null>(null)

  // Hilfslinien und Abstandsmaße imperativ in die Gruppe guideGroupRef zeichnen (kein React-State pro Frame).
  const clearOverlay = useCallback(() => {
    const g = guideGroupRef.current
    if (!g) return
    g.destroyChildren()
    g.getLayer()?.batchDraw()
  }, [])
  const drawOverlay = useCallback(
    (guides: Guide[], gaps: GapMeasure[]) => {
      const g = guideGroupRef.current
      if (!g) return
      g.destroyChildren()
      const z = viewRef.current.zoom
      // Pinke gestrichelte Hilfslinien für Kanten/Mitten
      for (const gd of guides) {
        const points = gd.orientation === 'v' ? [gd.pos, gd.from, gd.pos, gd.to] : [gd.from, gd.pos, gd.to, gd.pos]
        g.add(new Konva.Line({ points, stroke: '#ec4899', strokeWidth: 1 / z, dash: [4 / z, 3 / z], listening: false }))
      }
      // Blaue Abstandslinien mit Beschriftung in Metern
      for (const m of gaps) {
        g.add(new Konva.Line({ points: [m.x1, m.y1, m.x2, m.y2], stroke: '#00bce8', strokeWidth: 1 / z, listening: false }))
        g.add(
          new Konva.Text({
            x: (m.x1 + m.x2) / 2 + 4 / z,
            y: (m.y1 + m.y2) / 2 + 4 / z,
            text: `${(m.distancePx / pixelsPerMeter).toFixed(2).replace('.', ',')} m`,
            fontSize: 11 / z,
            fontStyle: 'bold',
            fill: '#0369a1',
            listening: false,
          }),
        )
      }
      g.getLayer()?.batchDraw()
    },
    [pixelsPerMeter],
  )

  // Ziehen einer Auswahl: alle ausgewählten Objekte laufen während des Ziehens live mit.
  const handleItemDragStart = useCallback(
    (id: string) => {
      const { selectedIds: sel0, items: cur, currentPhaseId: cp, visibleItemIds: vis } = dragCtxRef.current
      const stage = stageRef.current
      const pd = cur[id]?.phaseData[cp]
      if (!stage || !pd) return
      const sel = sel0.includes(id) ? sel0 : [id]
      const others = sel
        .filter((s) => s !== id && !cur[s]?.locked && cur[s]?.phaseData[cp])
        .flatMap((s) => {
          const node = stage.findOne((n: Konva.Node) => n.id() === s)
          const p = cur[s].phaseData[cp]
          return node ? [{ id: s, node, start: { x: p.x, y: p.y } }] : []
        })
      const movingIds = [id, ...others.map((o) => o.id)]
      const movingBox = unionBox(movingIds.map((m) => worldBBox(cur[m], cur[m].phaseData[cp], pixelsPerMeter)))
      if (!movingBox) return
      // Einrast-Ziele: alle sichtbaren, nicht mitbewegten Objekte
      const targets = vis
        .filter((v) => !movingIds.includes(v) && cur[v]?.phaseData[cp])
        .map((v) => worldBBox(cur[v], cur[v].phaseData[cp], pixelsPerMeter))
      dragRef.current = { id, start: { x: pd.x, y: pd.y }, others, movingBox, targets }
      gestureCbRef.current?.(true)
    },
    [pixelsPerMeter],
  )

  const handleItemDragMove = useCallback(
    (id: string, x: number, y: number, mods: DragMods) => {
      const s = dragRef.current
      if (!s || s.id !== id) return { x, y }
      let dx = x - s.start.x
      let dy = y - s.start.y
      let lockX = false
      let lockY = false
      // Shift: nur waagrecht ODER senkrecht
      if (mods.axisLock) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          dy = 0
          lockY = true
        } else {
          dx = 0
          lockX = true
        }
      }
      let guides: Guide[] = []
      // ⌘/Strg: kein Einrasten (weder an Objekten noch am Raster)
      if (!mods.bypassSnap) {
        const moved = translateBox(s.movingBox, dx, dy)
        const snap = snapBoxToTargets(moved, s.targets, SNAP_THRESHOLD_SCREEN_PX / viewRef.current.zoom)
        let sdx = snap.dx
        let sdy = snap.dy
        const { gridEnabled: ge, gridSize: gs } = snapCtxRef.current
        if (ge) {
          // Objekt-Einrasten hat Vorrang vor dem Raster
          const gsnap = snapBoxToGrid(moved, gs)
          if (!snap.guides.some((g) => g.orientation === 'v')) sdx = gsnap.dx
          if (!snap.guides.some((g) => g.orientation === 'h')) sdy = gsnap.dy
        }
        if (!lockX) dx += sdx
        if (!lockY) dy += sdy
        guides = snap.guides.filter((g) => (g.orientation === 'v' ? !lockX : !lockY))
      }
      for (const o of s.others) o.node.position({ x: o.start.x + dx, y: o.start.y + dy })
      drawOverlay(guides, nearestGaps(translateBox(s.movingBox, dx, dy), s.targets, pixelsPerMeter * 10))
      return { x: s.start.x + dx, y: s.start.y + dy }
    },
    [pixelsPerMeter, drawOverlay],
  )

  const handleItemDragEnd = useCallback(
    (id: string, x: number, y: number) => {
      const s = dragRef.current
      dragRef.current = null
      clearOverlay()
      gestureCbRef.current?.(false)
      const { items: cur, currentPhaseId: cp } = dragCtxRef.current
      const pd = cur[id]?.phaseData[cp]
      if (!pd) return
      const dx = x - pd.x
      const dy = y - pd.y
      if (dx === 0 && dy === 0) return // kein leerer Undo-Schritt
      if (s && s.id === id && s.others.length > 0) moveItemsBy([id, ...s.others.map((o) => o.id)], dx, dy)
      else updateItemTransform(id, x, y)
    },
    [updateItemTransform, moveItemsBy, clearOverlay],
  )
  const handleItemRotate = useCallback(
    (id: string, x: number, y: number, rotation: number) => updateItemTransform(id, x, y, rotation),
    [updateItemTransform],
  )

  const setVisiovaRun = useEventStore((s) => s.setVisiovaRun)
  const handleVisiovaRun = useCallback(
    (id: string, lengthM: number) => setVisiovaRun(id, splitVisiovaRun(lengthM)),
    [setVisiovaRun],
  )
  const setItemLength = useEventStore((s) => s.setItemLength)

  const visibleItemIds = itemOrder.filter((id) => items[id]?.phaseData[currentPhaseId]?.visible && itemLevel(items[id]) === currentLevel)
  dragCtxRef.current = { selectedIds, items, currentPhaseId, visibleItemIds }

  const measureStart = measurePoints[0]
  const measureSegments = [
    ...measureLines,
    ...(measureStart && measureCursor ? [{ a: measureStart, b: measureCursor }] : []),
  ]

  // Handler nach jedem Render neu setzen, damit sie die aktuellen Werte sehen (Listener bleibt stabil).
  useEffect(() => {
    gestureCbRef.current = onGestureChange
    gestureMoveRef.current = (ev) => {
      const p = panRef.current
      if (p) {
        applyView(viewRef.current.zoom, p.x + ev.clientX - p.cx, p.y + ev.clientY - p.cy)
        return
      }
      const pt = clientToCanvas(ev.clientX, ev.clientY)
      if (!pt) return
      if (tool === 'measure' && measurePoints.length === 1) setMeasureCursor(pt)
      else if (tool === 'area' && areaStart) setAreaCursor(pt)
      else if (marqueeStart) setMarqueeCursor(pt)
    }
    gestureEndRef.current = (ev) => {
      if (ev.type === 'pointercancel') {
        cancelGestures()
        return
      }
      const p = panRef.current
      if (p) {
        const moved = Math.hypot(ev.clientX - p.cx, ev.clientY - p.cy) > 4
        panRef.current = null
        setPanning(false)
        gestureCbRef.current?.(false)
        if (!moved && p.tapOnEmpty) onSelect(null) // Antippen auf freie Fläche (Touch) hebt Auswahl auf
        return
      }
      if (marqueeStart) {
        const additive = marqueeAdditiveRef.current
        const cur = marqueeCursor ?? marqueeStart
        setMarqueeStart(null)
        setMarqueeCursor(null)
        const rect = {
          minX: Math.min(marqueeStart.x, cur.x),
          maxX: Math.max(marqueeStart.x, cur.x),
          minY: Math.min(marqueeStart.y, cur.y),
          maxY: Math.max(marqueeStart.y, cur.y),
        }
        if (rect.maxX - rect.minX < 4 && rect.maxY - rect.minY < 4) {
          // zu klein, vermutlich nur ein Klick
          if (!additive) onSelect(null)
          return
        }
        const hitIds = visibleItemIds.filter((id) => {
          const item = items[id]
          const pd = item?.phaseData[currentPhaseId]
          if (!item || !pd) return false
          const b = worldBBox(item, pd, pixelsPerMeter)
          return b.minX <= rect.maxX && b.maxX >= rect.minX && b.minY <= rect.maxY && b.maxY >= rect.minY
        })
        onSelectMany(hitIds, additive)
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
  })

  useEffect(() => {
    const move = (ev: PointerEvent) => gestureMoveRef.current(ev)
    const end = (ev: PointerEvent) => gestureEndRef.current(ev)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  return (
    <div className="w-full h-full relative">
      <div
        ref={containerRef}
        className={`absolute inset-0 overflow-hidden touch-none bg-ground ${
          panning
            ? 'cursor-grabbing'
            : spaceDown || viewOnly
              ? 'cursor-grab'
              : placement || tool !== 'select'
                ? 'cursor-crosshair'
                : ''
        }`}
        onContextMenu={(e) => e.preventDefault()} // rechte Maustaste verschiebt die Ansicht
        onPointerDownCapture={() => {
          const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
          if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            active.blur()
          }
        }}
      >
        <Stage
          ref={stageRef}
          width={containerSize?.width ?? 0}
          height={containerSize?.height ?? 0}
          scaleX={zoom}
          scaleY={zoom}
          x={stagePos.x}
          y={stagePos.y}
          onWheel={handleWheel}
          onPointerDown={handleStagePointerDown}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handlePlacementClick}
          onTap={handlePlacementClick}
        >
          {/* Layer 1, statisch: Grundriss, Strom/CEE, Bühnenzüge (Rigging) und Gitter */}
          <Layer listening={false}>
            {/* Wände / Grundriss (Erdgeschoss, kalibriert) */}
            {layers.walls && currentLevel === 'eg' && image && <KonvaImage image={image} width={STAGE_WIDTH} height={STAGE_HEIGHT} />}
            {layers.walls && currentLevel === 'og' && ogImage && <KonvaImage image={ogImage} width={STAGE_WIDTH} height={STAGE_HEIGHT} />}
            {/* Luftraum im OG: kein Boden, hier lässt sich nichts platzieren */}
            {currentLevel === 'og' &&
              OG_VOIDS.map(({ name, rect: [x0, z0, x1, z1] }) => {
                const w = (x1 - x0) * pixelsPerMeter
                const h = (z1 - z0) * pixelsPerMeter
                return (
                  <Group key={name} x={x0 * pixelsPerMeter} y={z0 * pixelsPerMeter}>
                    <Rect width={w} height={h} fill="rgba(0,153,194,0.10)" stroke="#0099c2" strokeWidth={1} dash={[8, 5]} />
                    <Text
                      width={w}
                      y={h / 2 - 16}
                      align="center"
                      text={`Luftraum ${name}\nnicht belegbar`}
                      fontSize={14}
                      fontStyle="600"
                      fill="#006680"
                    />
                  </Group>
                )
              })}

            {/* Strom/CEE-Layer: Bodentanks, CEE 16A/32A/63A als eigenes, unabhängig schaltbares Overlay */}
            {currentLevel === 'eg' && layers.power && powerOverlayImage && (
              <KonvaImage image={powerOverlayImage} width={STAGE_WIDTH} height={STAGE_HEIGHT} />
            )}

            {/* Bühnenzüge (Rigging) Referenzlinien */}
            {currentLevel === 'eg' && layers.rigging &&
              RIGGING_BARS.map((bar) => {
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

            {/* Gitter: eine Shape statt vieler einzelner Linien. Bei kleinem Zoom nur jede n-te Linie. */}
            {gridEnabledInternal && (
              <Shape
                listening={false}
                opacity={0.35}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeScaleEnabled={false}
                perfectDrawEnabled={false}
                sceneFunc={(ctx, shape) => {
                  const step = gridSizeInternal * Math.max(1, Math.ceil(6 / (gridSizeInternal * zoomBucket)))
                  ctx.beginPath()
                  for (let x = 0; x <= STAGE_WIDTH; x += step) {
                    ctx.moveTo(x, 0)
                    ctx.lineTo(x, STAGE_HEIGHT)
                  }
                  for (let y = 0; y <= STAGE_HEIGHT; y += step) {
                    ctx.moveTo(0, y)
                    ctx.lineTo(STAGE_WIDTH, y)
                  }
                  ctx.strokeShape(shape)
                }}
              />
            )}
          </Layer>

          {/* Layer 2: Geisterbild der Vorphase (Konzept C, nur was dort anders stand oder weg ist), darunter die Objekte */}
          <Layer listening={!viewOnly}>
            {ghostPhaseId && ghostItemIds.length > 0 && (
              <Group listening={false} opacity={0.3}>
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
                      zoom={zoomBucket}
                      isGhost
                    />
                  )
                })}
              </Group>
            )}

            {/* Event-Objekte der aktiven Phase. Nicht ausgewählte bekommen nur den quantisierten Zoom. */}
            {visibleItemIds.map((id) => {
              const item = items[id]
              const phaseData = item.phaseData[currentPhaseId]
              return (
                <EventItemShape
                  key={`${id}-${revision}`}
                  item={item}
                  phaseData={phaseData}
                  pixelsPerMeter={pixelsPerMeter}
                  isSelected={selectedIds.includes(id)}
                  onSelect={handleItemSelect}
                  onDragStart={handleItemDragStart}
                  onDragMove={handleItemDragMove}
                  onDragEnd={handleItemDragEnd}
                  onRotate={handleItemRotate}
                  onVisiovaRun={handleVisiovaRun}
                  onLength={setItemLength}
                  draggable={tool === 'select' && !placement && !spaceDown}
                  zoom={selectedIds.includes(id) ? zoom : zoomBucket}
                />
              )
            })}
          </Layer>

          {/* Layer 3, Overlay: Maßwerkzeug, Bereichs-Vorschau, Rahmenauswahl und Platz für Hilfslinien */}
          <Layer listening={false}>
            {/* Maßwerkzeug */}
            {tool === 'measure' &&
              measureSegments.length > 0 &&
              measureSegments.map(({ a, b }, i) => (
                <Group key={i}>
                  <Line
                    points={[a.x, a.y, b.x, b.y]}
                    stroke="#dc2626"
                    strokeWidth={1.5 / zoom}
                    dash={[6 / zoom, 4 / zoom]}
                  />
                  <Circle x={a.x} y={a.y} radius={3 / zoom} fill="#dc2626" />
                  <Circle x={b.x} y={b.y} radius={3 / zoom} fill="#dc2626" />
                  <Group x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 16 / zoom}>
                    <Rect x={-30 / zoom} y={-9 / zoom} width={60 / zoom} height={18 / zoom} fill="#dc2626" cornerRadius={3 / zoom} />
                    <Text
                      x={-30 / zoom}
                      y={-6 / zoom}
                      width={60 / zoom}
                      align="center"
                      text={`${pixelsToMeters(Math.hypot(b.x - a.x, b.y - a.y), pixelsPerMeter).toFixed(2)} m`}
                      fontSize={11 / zoom}
                      fill="#fff"
                    />
                  </Group>
                </Group>
              ))}

            {/* Bereichs-Werkzeug: Live-Vorschau während des Aufziehens */}
            {tool === 'area' && areaStart && areaCursor && (
              <Group>
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
              </Group>
            )}

            {/* Rubberband-Mehrfachauswahl: Live-Vorschau des Auswahlrechtecks */}
            {marqueeStart && marqueeCursor && (
              <Rect
                x={Math.min(marqueeStart.x, marqueeCursor.x)}
                y={Math.min(marqueeStart.y, marqueeCursor.y)}
                width={Math.abs(marqueeCursor.x - marqueeStart.x)}
                height={Math.abs(marqueeCursor.y - marqueeStart.y)}
                fill="rgba(0,153,194,0.08)"
                stroke="#0099c2"
                strokeWidth={1 / zoom}
                dash={[4 / zoom, 3 / zoom]}
              />
            )}

            {/* Hilfslinien und Abstände beim Einrasten (imperativ befüllt in drawOverlay) */}
            <Group ref={guideGroupRef} />
          </Layer>
        </Stage>
      </div>

      {/* Maßstab + Objektzahl (ehemalige Statusleiste) */}
      <div className="absolute left-4 top-[84px] z-10 pointer-events-none flex flex-col gap-1 font-mono text-[10.5px] text-ink2">
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
      {(tool === 'measure' || tool === 'area' || placement) && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[148px] z-10 pointer-events-none">
          <div className="bg-accent text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
            {placement
              ? `Tippen/Klicken zum Platzieren · ${placement.label}${placement.once ? '' : ' · Esc beendet'}`
              : tool === 'measure'
                ? 'Messen: Start- und Endpunkt anklicken, beliebig viele Linien · Esc löscht alle'
                : 'Bereich: Rechteck aufziehen · Esc bricht ab'}
          </div>
        </div>
      )}
    </div>
  )
})

export default memo(CanvasEditor)
