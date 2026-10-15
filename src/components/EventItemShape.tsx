import { memo, useRef, useState } from 'react'
import { Group, Rect, Circle, Line, Text } from 'react-konva'
import type { EventItem, PhaseData } from '../types'
import { metersToPixels } from '../utils/scale'
import { getDefaultColor } from '../utils/itemColors'
import { forexEdge } from '../utils/forex'
import { describeVisiovaRun, splitVisiovaRun } from '../utils/visiova'
import { snapToGrid } from '../utils/snapping'
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
  onDragEnd: (id: string, x: number, y: number) => void
  /** freie 360°-Drehung per Maus-/Touch-Ziehen am Rotationsgriff */
  onRotate?: (id: string, x: number, y: number, rotationDeg: number) => void
  /** Visiova-Rahmen am Endgriff auf eine Länge ziehen (Meter) → Reihe aus lieferbaren Rahmen */
  onVisiovaRun?: (id: string, lengthM: number) => void
  draggable?: boolean
  /** aktueller Canvas-Zoom, um eine konstante Mindest-Klickfläche auf dem Bildschirm sicherzustellen */
  zoom?: number
  gridEnabled?: boolean
  gridSize?: number
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
  onDragEnd,
  onRotate,
  onVisiovaRun,
  draggable = true,
  zoom = 1,
  gridEnabled = false,
  gridSize = 20,
}: Props) {
  const w = metersToPixels(item.width, pixelsPerMeter)
  const h = metersToPixels(item.height, pixelsPerMeter)
  const isRound = item.type === 'table_round' || item.type === 'table_high' || item.type === 'custom_round'
  const isLabel = item.type === 'text_label'
  const isLocked = !!item.locked
  // Visiova: gerade gezogene Länge in px (null = kein Ziehen)
  const [runPx, setRunPx] = useState<number | null>(null)

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    let x = e.target.x()
    let y = e.target.y()
    // Apply grid snapping if enabled
    if (gridEnabled) {
      const snapped = snapToGrid(x, y, gridSize)
      x = snapped.x
      y = snapped.y
      e.target.position({ x, y })
    }
    onDragEnd(item.id, x, y)
  }

  // Stage ist ebenfalls draggable (zum Verschieben der Ansicht). Ohne cancelBubble würde ein
  // Mousedown auf dem Objekt gleichzeitig auch die Stage mitziehen (bekannte Konva-Falle).
  const stopBubble = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true
  }

  const handleSelect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const shift = 'shiftKey' in e.evt && e.evt.shiftKey
    onSelect(item.id, shift)
  }

  const stroke = isSelected ? '#2563eb' : '#374151'
  const strokeWidth = isSelected ? 2 : 1

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
  // der Gruppe. Der Griff selbst bleibt an dieser Stelle fixiert — beim Ziehen wird nur der
  // Zeigerwinkel relativ zum Objektmittelpunkt in Weltkoordinaten berechnet und als neue absolute
  // Rotation gemeldet (klassischer Konva-"Rotate handle"-Trick).
  const centerX = isRound ? 0 : w / 2
  const topY = isRound ? -w / 2 : 0
  const handleDist = 26 / zoom
  const handleX = centerX
  const handleY = topY - handleDist

  // Während des Ziehens die Gruppe direkt über die Konva-Node drehen (wie Konva es beim normalen
  // Verschieben ohnehin intern tut) statt über React-State — ein setState pro Mausmove-Frame würde
  // jedes Mal die ganze Komponente neu rendern/abgleichen und fühlte sich spürbar träge an. Erst am
  // Ende wird die Rotation ein einziges Mal an den Store committet (ein Undo-Schritt pro Zug).
  const groupRef = useRef<Konva.Group>(null)

  const angleFromPointer = (e: Konva.KonvaEventObject<DragEvent>): number | null => {
    const layer = e.target.getLayer()
    const pointer = layer?.getRelativePointerPosition()
    e.target.position({ x: handleX, y: handleY })
    if (!pointer) return null
    const dx = pointer.x - phaseData.x
    const dy = pointer.y - phaseData.y
    if (dx === 0 && dy === 0) return null
    return ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360
  }

  const handleRotateDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    const angle = angleFromPointer(e)
    if (angle === null || !groupRef.current) return
    groupRef.current.rotation(angle)
    groupRef.current.getLayer()?.batchDraw()
  }

  const handleRotateDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    e.cancelBubble = true
    const angle = angleFromPointer(e)
    if (angle !== null) onRotate?.(item.id, phaseData.x, phaseData.y, angle)
  }

  return (
    <Group
      ref={groupRef}
      x={phaseData.x}
      y={phaseData.y}
      rotation={phaseData.rotation}
      draggable={draggable && !isLocked}
      onClick={handleSelect}
      onTap={handleSelect}
      onDragEnd={handleDragEnd}
      onMouseDown={stopBubble}
      onTouchStart={stopBubble}
    >
      {/* Unsichtbare, vergrößerte Trefferfläche für zuverlässiges Greifen auch bei kleinem Zoom */}
      <Rect x={hitX} y={hitY} width={hitW} height={hitH} fill="rgba(255,255,255,0.001)" />
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
          {Array.from({ length: item.grid.rows }).map((_, r) =>
            Array.from({ length: item.grid!.cols }).map((_, c) => {
              const seatSize = metersToPixels(0.4, pixelsPerMeter)
              const cx = metersToPixels((c + 0.5) * item.grid!.spacingM, pixelsPerMeter)
              const cy = metersToPixels((r + 0.5) * item.grid!.spacingM, pixelsPerMeter)
              return (
                <Rect
                  key={`${r}-${c}`}
                  x={cx - seatSize / 2}
                  y={cy - seatSize / 2}
                  width={seatSize}
                  height={seatSize}
                  fill={item.color || getDefaultColor(item.type)}
                  stroke="#9ca3af"
                  strokeWidth={0.5}
                  perfectDrawEnabled={false}
                  listening={false}
                />
              )
            }),
          )}
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
          {item.type !== 'curtain' && (
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
          <Text
              listening={false}
            text={`${item.width.toFixed(2)} × ${item.height.toFixed(2)} m`}
            fontSize={8}
            fill="#6b7280"
            width={Math.max(w, 60)}
            align="center"
            y={(isRound ? w / 2 : h) + 3}
            x={isRound ? -w / 2 : 0}
          />
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
          draggable
          onMouseDown={stopBubble}
          onTouchStart={stopBubble}
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
            draggable
            onDragMove={handleRotateDragMove}
            onDragEnd={handleRotateDragEnd}
            onMouseDown={stopBubble}
            onTouchStart={stopBubble}
          />
        </>
      )}
    </Group>
  )
}

export default memo(EventItemShape)
