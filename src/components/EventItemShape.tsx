import { memo, useRef, useState } from 'react'
import { Group, Rect, Circle, Line, Text, Shape } from 'react-konva'
import type { EventItem, PhaseData } from '../types'
import { metersToPixels } from '../utils/scale'
import { getDefaultColor } from '../utils/itemColors'
import { forexEdge } from '../utils/forex'
import { describeVisiovaRun, splitVisiovaRun } from '../utils/visiova'
import type { DragMods } from '../utils/snapping'
import { angleDeg, isRoundType, localBounds, positionForRotation, snapAngle, worldCenter, type Pt } from '../utils/geometry'
import { IS_COARSE_POINTER } from '../utils/viewport'
import { FOAM_DEFAULT_TEXT, FOAM_LETTER, letterSlots } from '../utils/foamLetters'
import type Konva from 'konva'


interface Props {
  item: EventItem
  phaseData: PhaseData
  pixelsPerMeter: number
  isSelected: boolean
  /** Callbacks erhalten die Item-ID, damit der Parent stabile (referenzgleiche) Handler
   *  übergeben kann und React.memo unveränderte Objekte beim Re-Render überspringt. */
  /** additive=true (Shift-Klick) fügt zur bestehenden Auswahl hinzu/entfernt daraus, statt zu ersetzen. */
  onSelect: (id: string, additive: boolean) => void
  /** Beginn des Ziehens der GANZEN Gruppe (nicht der Griffe). */
  onDragStart?: (id: string) => void
  /** Während des Ziehens: Parent liefert die korrigierte (eingerastete) Position zurück. */
  onDragMove?: (id: string, x: number, y: number, mods: DragMods) => { x: number; y: number }
  onDragEnd: (id: string, x: number, y: number) => void
  /** freie 360°-Drehung per Maus-/Touch-Ziehen am Rotationsgriff */
  onRotate?: (id: string, x: number, y: number, rotationDeg: number) => void
  /** Visiova-Rahmen am Endgriff auf eine Länge ziehen (Meter) → Reihe aus lieferbaren Rahmen */
  onVisiovaRun?: (id: string, lengthM: number) => void
  draggable?: boolean
  /** aktueller Canvas-Zoom, um eine konstante Mindest-Klickfläche auf dem Bildschirm sicherzustellen */
  zoom?: number
  /** Geisterbild der Vorphase: keine Konva-ID, keine Hover-Effekte. */
  isGhost?: boolean
}

/** Mindestgröße der (unsichtbaren) Klick-/Greiffläche in Bildschirm-Pixeln, unabhängig vom Zoom. */
const MIN_HIT_TARGET_PX = 32

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function EventItemShape({
  item,
  phaseData,
  pixelsPerMeter,
  isSelected,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onRotate,
  onVisiovaRun,
  draggable = true,
  zoom = 1,
  isGhost = false,
}: Props) {
  const w = metersToPixels(item.width, pixelsPerMeter)
  const h = metersToPixels(item.height, pixelsPerMeter)
  const isRound = isRoundType(item.type)
  const isLabel = item.type === 'text_label'
  const isLocked = !!item.locked
  // Visiova: gerade gezogene Länge in px (null = kein Ziehen)
  const [runPx, setRunPx] = useState<number | null>(null)
  const [hovered, setHovered] = useState(false)
  // Gruppe direkt über die Konva-Node drehen bzw. verschieben statt über React-State pro Mausmove-Frame.
  const groupRef = useRef<Konva.Group>(null)

  // Ziehen der GANZEN Gruppe. Einrasten passiert im Parent (onDragMove), nicht hier.
  const handleDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== groupRef.current) return
    onDragStart?.(item.id)
  }
  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== groupRef.current || !onDragMove) return
    const ev = e.evt as MouseEvent
    const mods: DragMods = { bypassSnap: !!(ev?.metaKey || ev?.ctrlKey), axisLock: !!ev?.shiftKey }
    const p = onDragMove(item.id, e.target.x(), e.target.y(), mods)
    e.target.position(p)
  }
  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== groupRef.current) return
    onDragEnd(item.id, e.target.x(), e.target.y())
  }

  // Auswahl beim DRÜCKEN statt erst beim Loslassen. Im Auswahl-Werkzeug (draggable) fängt das Objekt
  // das Event ab; in Messen/Bereich/Platzieren muss der Klick bei der Stage ankommen.
  const justSelectedRef = useRef(false)
  const isAdditive = (ev: Event) => {
    const m = ev as MouseEvent
    return !!(m.shiftKey || m.metaKey || m.ctrlKey)
  }
  // Stage ist ebenfalls draggable (zum Verschieben der Ansicht). Ohne cancelBubble würde ein
  // Mousedown auf dem Objekt gleichzeitig auch die Stage mitziehen (bekannte Konva-Falle).
  const stopBubble = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>) => {
    if (draggable) e.cancelBubble = true
  }
  // Griffe fangen ihr Event immer ab, unabhängig vom Werkzeug.
  const cancelBubbleAlways = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>) => {
    e.cancelBubble = true
  }
  const handlePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (e.evt.button !== 0) return // Mittel-/Rechtsklick an die Stage weiterreichen (Verschieben)
    stopBubble(e)
    justSelectedRef.current = false
    if (!isSelected) {
      onSelect(item.id, isAdditive(e.evt))
      justSelectedRef.current = true
    }
  }
  const handleClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false
      return
    }
    onSelect(item.id, isAdditive(e.evt))
  }

  const handleMouseEnter = (e: Konva.KonvaEventObject<MouseEvent>) => {
    setHovered(true)
    const c = e.target.getStage()?.container()
    if (c) c.style.cursor = isLocked ? 'not-allowed' : draggable ? 'move' : ''
  }
  const handleMouseLeave = (e: Konva.KonvaEventObject<MouseEvent>) => {
    setHovered(false)
    const c = e.target.getStage()?.container()
    if (c) c.style.cursor = ''
  }

  const stroke = isSelected ? '#2563eb' : hovered ? '#60a5fa' : '#374151'
  const strokeWidth = isSelected ? 2 : 1
  // Detailgrad: Maße erst ab ~70 % Zoom, Beschriftung ab ~40 % (ausgewählte Objekte immer)
  const showDims = isSelected || zoom >= 0.7
  const showLabel = isSelected || zoom >= 0.4

  const minSize = MIN_HIT_TARGET_PX / zoom
  // Text-Labels wachsen nach rechts/unten ab dem Ursprung (Konva-Text-Standardanker), nicht
  // zentriert wie die anderen Objekte — die Trefferfläche muss das nachbilden, sonst lässt sich
  // nur der Anfang des Textes anklicken.
  const labelHitW = Math.max(item.label.length * 8, minSize)
  const labelHitH = Math.max(21, minSize)
  const hitW = isLabel ? labelHitW : Math.max(w, minSize)
  const hitH = isLabel ? labelHitH : Math.max(h, minSize)
  const hitX = isLabel ? -6 / zoom : isRound ? -hitW / 2 : -(hitW - w) / 2
  const hitY = isLabel ? -6 / zoom : isRound ? -hitH / 2 : -(hitH - h) / 2

  // Rotationsgriff: fester Punkt oberhalb der Objektmitte, im lokalen (ungedrehten) Koordinatensystem
  // der Gruppe. Die Drehung erfolgt um die MITTE des Objekts (x/y wird beim Drehen mitgerechnet).
  const lb = localBounds(item, pixelsPerMeter)
  const centerX = lb.x + lb.w / 2
  const topY = lb.y
  const handleX = centerX
  const handleY = topY - 26 / zoom
  const angleTextRef = useRef<Konva.Text>(null)
  // Start des Ziehens: Mittelpunkt, Zeigerwinkel und Ausgangsrotation. Aus dem Delta ab Griff-Start
  // folgt die Rotation, dadurch springt der Griff beim Greifen nicht.
  const rotStartRef = useRef<{ center: Pt; pointerAngle: number; startRotation: number } | null>(null)
  const pointerWorld = (e: Konva.KonvaEventObject<DragEvent>) => e.target.getLayer()?.getRelativePointerPosition() ?? null

  const handleRotateDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    const p = pointerWorld(e)
    if (!p) return
    const center = worldCenter(item, phaseData, pixelsPerMeter)
    rotStartRef.current = { center, pointerAngle: angleDeg(center, p), startRotation: phaseData.rotation }
  }
  // Während des Ziehens die Gruppe direkt über die Konva-Node drehen statt über React-State pro
  // Mausmove-Frame. Erst am Ende wird die Rotation ein einziges Mal an den Store committet
  // (ein Undo-Schritt pro Zug).
  const computeRotation = (e: Konva.KonvaEventObject<DragEvent>): number | null => {
    e.target.position({ x: handleX, y: handleY })
    const s = rotStartRef.current
    const p = pointerWorld(e)
    if (!s || !p) return null
    const raw = s.startRotation + angleDeg(s.center, p) - s.pointerAngle // Delta ab Griff-Start: kein Sprung
    return snapAngle(raw, !!(e.evt as MouseEvent)?.shiftKey)
  }
  const handleRotateDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    const a = computeRotation(e)
    const g = groupRef.current
    if (a === null || !g) return
    g.rotation(a)
    g.position(positionForRotation(item, phaseData, a, pixelsPerMeter)) // Mitte bleibt stehen
    const t = angleTextRef.current
    if (t) {
      t.text(`${a}°`)
      t.rotation(-a) // Gradanzeige bleibt aufrecht lesbar
      t.visible(true)
    }
    g.getLayer()?.batchDraw()
  }
  const handleRotateDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    const a = computeRotation(e)
    rotStartRef.current = null
    angleTextRef.current?.visible(false)
    if (a === null) return
    const pos = positionForRotation(item, phaseData, a, pixelsPerMeter)
    onRotate?.(item.id, pos.x, pos.y, a)
  }

  return (
    <Group
      ref={groupRef}
      id={isGhost ? undefined : item.id}
      x={phaseData.x}
      y={phaseData.y}
      rotation={phaseData.rotation}
      draggable={draggable && !isLocked}
      onPointerDown={handlePointerDown}
      onMouseDown={stopBubble}
      onTouchStart={stopBubble}
      onClick={handleClick}
      onTap={handleClick}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onMouseEnter={isGhost ? undefined : handleMouseEnter}
      onMouseLeave={isGhost ? undefined : handleMouseLeave}
    >
      {/* Unsichtbare, vergrößerte Trefferfläche für zuverlässiges Greifen auch bei kleinem Zoom */}
      {isRound ? (
        <Circle radius={Math.max(w / 2, minSize / 2)} fill="rgba(255,255,255,0.001)" />
      ) : (
        <Rect x={hitX} y={hitY} width={hitW} height={hitH} fill="rgba(255,255,255,0.001)" />
      )}
      {isLabel ? null : isRound ? (
        <Circle radius={w / 2} fill={item.color || getDefaultColor(item.type)} stroke={stroke} strokeWidth={strokeWidth} perfectDrawEnabled={false} />
      ) : item.type === 'curtain' ? (
        <Line points={[0, 0, w, 0]} stroke={item.color || getDefaultColor(item.type)} strokeWidth={6} lineCap="round" perfectDrawEnabled={false} />
      ) : item.type === 'truss' ? (
        <Rect width={w} height={h} fill={item.color || getDefaultColor(item.type)} stroke={stroke} strokeWidth={strokeWidth} dash={[4, 4]} perfectDrawEnabled={false} />
      ) : item.type === 'nivtec_group' ? (
        <>
          {item.nivtecData?.pieces.map((piece, i) => {
            const px = metersToPixels(piece.x, pixelsPerMeter)
            const py = metersToPixels(piece.y, pixelsPerMeter)
            const pw = metersToPixels(piece.w, pixelsPerMeter)
            const pd = metersToPixels(piece.d, pixelsPerMeter)
            const isCorner = !!piece.corner
            const baseColor = item.color ?? '#1d4ed8'
            const lightColor = hexToRgba(baseColor, 0.2)

            if (isCorner) {
              // Dreiecke für Corner-Pieces (tl, tr, bl, br) mit Line-basiertem Path
              const corners: Record<string, number[][]> = {
                tl: [[px, py], [px + pw, py], [px, py + pd]],      // top-left triangle
                tr: [[px + pw, py], [px + pw, py + pd], [px, py]], // top-right triangle
                bl: [[px, py], [px + pw, py + pd], [px, py + pd]], // bottom-left triangle
                br: [[px + pw, py], [px + pw, py + pd], [px, py + pd]], // bottom-right triangle
              }
              const trianglePoints = corners[piece.corner as string] || corners.tl
              const points = trianglePoints.flat()

              return (
                <Line
                  key={i}
                  points={points}
                  fill={lightColor}
                  stroke={isSelected ? '#2563eb' : baseColor}
                  strokeWidth={isSelected ? 2 : 1}
                  closed
                  perfectDrawEnabled={false}
                  listening={false}
                />
              )
            }

            // Regular rectangular pieces
            return (
              <Rect
                key={i}
                x={px}
                y={py}
                width={pw}
                height={pd}
                fill={lightColor}
                stroke={isSelected ? '#2563eb' : baseColor}
                strokeWidth={isSelected ? 2 : 1}
                perfectDrawEnabled={false}
                listening={false}
              />
            )
          })}
          {/* Forex-Blenden: kräftige Linie außen an der Kante */}
          {(item.nivtecData?.forexPanels ?? []).map((panel) => {
            const e = forexEdge(item.nivtecData!.pieces, panel)
            if (!e) return null
            const off = 0.06
            const pts = [e.a.x + e.nx * off, e.a.y + e.ny * off, e.b.x + e.nx * off, e.b.y + e.ny * off].map((v) =>
              metersToPixels(v, pixelsPerMeter),
            )
            return (
              <Line
                key={panel.id}
                points={pts}
                stroke={item.forexPrints?.[panel.id] ? '#f59e0b' : '#94a3b8'}
                strokeWidth={Math.max(3, metersToPixels(0.08, pixelsPerMeter))}
                lineCap="butt"
                perfectDrawEnabled={false}
                listening={false}
              />
            )
          })}
        </>
      ) : item.type === 'foam_letters' ? (
        <>
          {/* Jeder Styropor-Buchstabe als eigener Block, das Zeichen steht davor (Leserichtung) */}
          {letterSlots(item.letterText ?? FOAM_DEFAULT_TEXT).map((slot, i) => {
            const x = metersToPixels(slot.x, pixelsPerMeter)
            const sw = metersToPixels(slot.w, pixelsPerMeter)
            return (
              <Group key={i}>
                <Rect
                  x={x}
                  width={sw}
                  height={h}
                  fill={item.color || getDefaultColor(item.type)}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  perfectDrawEnabled={false}
                />
                <Text
                  listening={false}
                  text={slot.char}
                  x={x}
                  y={h + 1}
                  width={sw}
                  align="center"
                  fontSize={metersToPixels(FOAM_LETTER.widthM, pixelsPerMeter) * 0.9}
                  fontStyle="bold"
                  fill={isSelected ? '#2563eb' : '#1f2937'}
                />
              </Group>
            )
          })}
        </>
      ) : item.type === 'area' ? (
        <Rect
          width={w}
          height={h}
          fill={hexToRgba(item.color ?? '#10b981', isSelected ? 0.3 : 0.18)}
          stroke={item.color ?? '#10b981'}
          strokeWidth={isSelected ? 3 : 2}
          dash={[6, 3]}
          perfectDrawEnabled={false}
        />
      ) : item.type === 'chair_row_group' && item.grid ? (
        <>
          {/* Umriss der ganzen Gruppe, damit klar ist, dass es EIN gemeinsam verschiebbares Objekt ist */}
          <Rect
            width={w}
            height={h}
            fill="transparent"
            stroke={stroke}
            strokeWidth={strokeWidth}
            dash={[3, 3]}
            perfectDrawEnabled={false}
            listening={false}
          />
          {/* Alle Sitze als EINE Shape (ein Pfad) statt vieler Rechtecke – deutlich günstiger zu zeichnen */}
          <Shape
            listening={false}
            perfectDrawEnabled={false}
            fill={item.color || getDefaultColor(item.type)}
            stroke="#9ca3af"
            strokeWidth={0.5}
            sceneFunc={(ctx, shape) => {
              const g = item.grid!
              const seat = metersToPixels(0.4, pixelsPerMeter)
              ctx.beginPath()
              for (let r = 0; r < g.rows; r++) {
                for (let c = 0; c < g.cols; c++) {
                  const cx = metersToPixels((c + 0.5) * g.spacingM, pixelsPerMeter)
                  const cy = metersToPixels((r + 0.5) * g.spacingM, pixelsPerMeter)
                  ctx.rect(cx - seat / 2, cy - seat / 2, seat, seat)
                }
              }
              ctx.fillStrokeShape(shape)
            }}
          />
        </>
      ) : (
        <Rect width={w} height={h} fill={item.color || getDefaultColor(item.type)} stroke={stroke} strokeWidth={strokeWidth} perfectDrawEnabled={false} />
      )}
      {isLabel ? (
        <Text
          listening={false}
          text={item.label}
          fontSize={13}
          fontStyle="600"
          fill={isSelected ? '#2563eb' : '#1f2937'}
          padding={4}
        />
      ) : item.type === 'area' ? (
        <>
          <Text
              listening={false}
            text={item.label}
            fontSize={11}
            fontStyle="bold"
            width={w}
            align="center"
            y={h / 2 - 12}
            fill={item.color ?? '#059669'}
          />
          <Text
              listening={false}
            text={`${item.width.toFixed(2)} × ${item.height.toFixed(2)} m`}
            fontSize={9}
            width={w}
            align="center"
            y={h / 2 + 3}
            fill={item.color ?? '#059669'}
          />
        </>
      ) : (
        <>
          {showLabel && item.type !== 'curtain' && item.type !== 'foam_letters' && (
            <Text
              listening={false}
              text={item.label}
              fontSize={9}
              width={Math.max(w, 40)}
              align="center"
              y={h ? h / 2 - 5 : -5}
              x={isRound ? -w / 2 : 0}
            />
          )}
          {/* Maßangabe (B x H in Metern), wie im Referenz-Tool */}
          {showDims && (
            <Text
              listening={false}
              text={`${item.width.toFixed(2)} × ${item.height.toFixed(2)} m`}
              fontSize={8}
              fill="#6b7280"
              width={Math.max(w, 60)}
              align="center"
              y={(isRound ? w / 2 : h) + 3 + (item.type === 'foam_letters' ? metersToPixels(FOAM_LETTER.widthM, pixelsPerMeter) : 0)}
              x={isRound ? -w / 2 : 0}
            />
          )}
        </>
      )}
      {isLocked && (
        <Text
          listening={false}
          text="🔒"
          fontSize={12 / zoom}
          x={hitX + 2 / zoom}
          y={hitY + 1 / zoom}
        />
      )}
      {/* Visiova-Wand: Fugen zwischen den Rahmen */}
      {runPx === null &&
        item.type === 'visiova_frame' &&
        (item.visiovaFrames?.length ?? 0) > 1 &&
        item.visiovaFrames!.slice(0, -1).map((_, i) => {
          const x = metersToPixels(item.visiovaFrames!.slice(0, i + 1).reduce((s, v) => s + v, 0), pixelsPerMeter)
          return (
            <Line key={i} points={[x, -3 / zoom, x, h + 3 / zoom]} stroke="#374151" strokeWidth={1 / zoom} listening={false} />
          )
        })}
      {runPx !== null && (() => {
        const widths = splitVisiovaRun(runPx / pixelsPerMeter)
        const total = widths.reduce((s, x) => s + x, 0)
        let at = 0
        return (
          <Group listening={false}>
            {widths.map((fw, i) => {
              const x0 = metersToPixels(at, pixelsPerMeter)
              at += fw
              return (
                <Rect
                  key={i}
                  x={x0}
                  y={-2 / zoom}
                  width={metersToPixels(fw, pixelsPerMeter)}
                  height={Math.max(h, 4 / zoom) + 4 / zoom}
                  stroke="#2563eb"
                  strokeWidth={1.5 / zoom}
                  dash={[4 / zoom, 3 / zoom]}
                  fill="rgba(37,99,235,0.15)"
                />
              )
            })}
            <Text
              x={0}
              y={-22 / zoom}
              text={`${widths.length} Rahmen · ${describeVisiovaRun(widths)} · ${total.toFixed(2).replace('.', ',')} m`}
              fontSize={12 / zoom}
              fontStyle="bold"
              fill="#1d4ed8"
            />
          </Group>
        )
      })()}
      {isSelected && onVisiovaRun && item.type === 'visiova_frame' && !isLocked && (
        <Rect
          x={w - 6 / zoom}
          y={h / 2 - 6 / zoom}
          width={12 / zoom}
          height={12 / zoom}
          cornerRadius={2 / zoom}
          fill="#2563eb"
          stroke="#ffffff"
          strokeWidth={1.5 / zoom}
          hitStrokeWidth={(IS_COARSE_POINTER ? 24 : 8) / zoom}
          draggable
          onPointerDown={cancelBubbleAlways}
          onMouseDown={cancelBubbleAlways}
          onTouchStart={cancelBubbleAlways}
          onMouseEnter={(e) => {
            const c = e.target.getStage()?.container()
            if (c) c.style.cursor = 'ew-resize'
          }}
          onMouseLeave={(e) => {
            const c = e.target.getStage()?.container()
            if (c) c.style.cursor = ''
          }}
          onDragMove={(e) => {
            e.cancelBubble = true
            // nur entlang der Rahmenachse ziehen
            const x = Math.max(e.target.x() + 6 / zoom, metersToPixels(0.31, pixelsPerMeter))
            e.target.position({ x: x - 6 / zoom, y: h / 2 - 6 / zoom })
            setRunPx(x)
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true
            const x = runPx ?? w
            setRunPx(null)
            e.target.position({ x: w - 6 / zoom, y: h / 2 - 6 / zoom })
            onVisiovaRun(item.id, x / pixelsPerMeter)
          }}
        />
      )}
      {isSelected && onRotate && !isLocked && (
        <>
          <Line
            points={[centerX, topY, handleX, handleY]}
            stroke="#2563eb"
            strokeWidth={1 / zoom}
            listening={false}
          />
          <Circle
            x={handleX}
            y={handleY}
            radius={7 / zoom}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={1.5 / zoom}
            hitStrokeWidth={(IS_COARSE_POINTER ? 30 : 12) / zoom}
            draggable
            onPointerDown={cancelBubbleAlways}
            onDragStart={handleRotateDragStart}
            onDragMove={handleRotateDragMove}
            onDragEnd={handleRotateDragEnd}
            onMouseDown={cancelBubbleAlways}
            onTouchStart={cancelBubbleAlways}
          />
          <Text ref={angleTextRef} visible={false} listening={false} x={handleX + 12 / zoom} y={handleY - 6 / zoom} fontSize={12 / zoom} fontStyle="bold" fill="#1d4ed8" text="" />
        </>
      )}
    </Group>
  )
}

export default memo(EventItemShape)
