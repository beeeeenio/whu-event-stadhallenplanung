import { memo, useRef } from 'react'
import { Group, Rect, Circle, Line, Text } from 'react-konva'
import type { EventItem, PhaseData } from '../types'
import { metersToPixels } from '../utils/scale'
import type Konva from 'konva'

interface Props {
  item: EventItem
  phaseData: PhaseData
  pixelsPerMeter: number
  isSelected: boolean
  /** Callbacks erhalten die Item-ID, damit der Parent stabile (referenzgleiche) Handler
   *  übergeben kann und React.memo unveränderte Objekte beim Re-Render überspringt. */
  onSelect: (id: string) => void
  onDragEnd: (id: string, x: number, y: number) => void
  /** freie 360°-Drehung per Maus-/Touch-Ziehen am Rotationsgriff */
  onRotate?: (id: string, x: number, y: number, rotationDeg: number) => void
  draggable?: boolean
  /** aktueller Canvas-Zoom, um eine konstante Mindest-Klickfläche auf dem Bildschirm sicherzustellen */
  zoom?: number
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
  draggable = true,
  zoom = 1,
}: Props) {
  const w = metersToPixels(item.width, pixelsPerMeter)
  const h = metersToPixels(item.height, pixelsPerMeter)
  const isRound = item.type === 'table_round' || item.type === 'table_high'

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    onDragEnd(item.id, e.target.x(), e.target.y())
  }

  // Stage ist ebenfalls draggable (zum Verschieben der Ansicht). Ohne cancelBubble würde ein
  // Mousedown auf dem Objekt gleichzeitig auch die Stage mitziehen (bekannte Konva-Falle).
  const stopBubble = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true
  }

  const handleSelect = () => onSelect(item.id)

  const stroke = isSelected ? '#2563eb' : '#374151'
  const strokeWidth = isSelected ? 2 : 1

  const minSize = MIN_HIT_TARGET_PX / zoom
  const hitW = Math.max(w, minSize)
  const hitH = Math.max(h, minSize)
  const hitX = isRound ? -hitW / 2 : -(hitW - w) / 2
  const hitY = isRound ? -hitH / 2 : -(hitH - h) / 2

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
      draggable={draggable}
      onClick={handleSelect}
      onTap={handleSelect}
      onDragEnd={handleDragEnd}
      onMouseDown={stopBubble}
      onTouchStart={stopBubble}
    >
      {/* Unsichtbare, vergrößerte Trefferfläche für zuverlässiges Greifen auch bei kleinem Zoom */}
      <Rect x={hitX} y={hitY} width={hitW} height={hitH} fill="rgba(255,255,255,0.001)" />
      {item.type === 'table_round' || item.type === 'table_high' ? (
        <Circle radius={w / 2} fill="#fef3c7" stroke={stroke} strokeWidth={strokeWidth} perfectDrawEnabled={false} />
      ) : item.type === 'curtain' ? (
        <Line points={[0, 0, w, 0]} stroke="#7c3aed" strokeWidth={6} lineCap="round" perfectDrawEnabled={false} />
      ) : item.type === 'truss' ? (
        <Rect width={w} height={h} fill="#e5e7eb" stroke={stroke} strokeWidth={strokeWidth} dash={[4, 4]} perfectDrawEnabled={false} />
      ) : item.type === 'nivtec_group' ? (
        <>
          {/* Nur die tatsächlichen NivTec-Systempodeste zeichnen — kein Umriss-Rechteck über die
              gesamte Bounding-Box, da L-/T-förmige Aufbauten sonst eine falsche Fläche vortäuschen. */}
          {item.nivtecData?.pieces.map((piece, i) => {
            const px = metersToPixels(piece.x, pixelsPerMeter)
            const py = metersToPixels(piece.y, pixelsPerMeter)
            const pw = metersToPixels(piece.w, pixelsPerMeter)
            const pd = metersToPixels(piece.d, pixelsPerMeter)
            return (
              <Rect
                key={i}
                x={px}
                y={py}
                width={pw}
                height={pd}
                fill={piece.corner ? '#bfdbfe' : '#dbeafe'}
                stroke={isSelected ? '#2563eb' : '#1d4ed8'}
                strokeWidth={isSelected ? 2 : 1}
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
                  fill="#f3f4f6"
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
        <Rect width={w} height={h} fill="#f3f4f6" stroke={stroke} strokeWidth={strokeWidth} perfectDrawEnabled={false} />
      )}
      {item.type === 'area' ? (
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
      {isSelected && onRotate && (
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
