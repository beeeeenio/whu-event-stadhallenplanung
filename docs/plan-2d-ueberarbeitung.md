# Überarbeitungsplan 2D-Editor (Stadthallenplanung)

Stand: 15.10.2026 · Basis: Commit `653ce3d` · Prüfung: `npx tsc -b` grün, `npm run lint` mit 14 Warnungen (Baseline).

---

## 1. Wichtigste Erkenntnisse

1. **Rechteckige Objekte drehen sich um die linke obere Ecke.** Beim ersten Ziehen springt der Drehgriff um viele Grad. Ursache: Der Winkel wird ab dem Ursprung gemessen, der Griff sitzt aber über der Mitte. `rotateItem` und `setItemRotation` passen x/y nicht an.
   *Quelle:* `EventItemShape.tsx:105-144`, `store.ts:361-407`; Figma, tldraw (`Rotating.ts`).
2. **Mehrfachauswahl läuft beim Ziehen nicht mit.** Die anderen Objekte springen erst beim Loslassen nach.
   *Quelle:* `CanvasEditor.tsx:513-530`; Konva-Transformer bzw. imperatives Mitziehen in `dragmove`.
3. **Einrasten am Raster greift erst beim Loslassen.** Das Objekt springt dann. Es gibt kein Einrasten an anderen Objekten, keine Hilfslinien und keine Abstandsanzeige. `snapToGuides` wird nirgends benutzt.
   *Quelle:* `EventItemShape.tsx:67-78`, `snapping.ts`; tldraw, Excalidraw (Schwelle 8 px ÷ Zoom), Social Tables „Measurement Guides“.
4. **Mausrad und Trackpad zoomen immer, in festen Schritten von ±0,1.** Zwei Finger auf dem Trackpad sollten verschieben, Pinch (`ctrlKey`) sollte stufenlos zoomen. Bei schnellen Events wird mit veralteten Werten gerechnet.
   *Quelle:* `CanvasEditor.tsx:331-337`; Excalidraw `App.wheel.ts`, Konva-Demo „Zooming relative to pointer“.
5. **Auf Touch-Geräten fehlt viel.** Es gibt kein Pinch-Zoom und kein Zwei-Finger-Verschieben. Messen, Bereich und Rahmenauswahl hängen an Mouse-Events und gehen auf dem iPad nicht.
   *Quelle:* `CanvasEditor.tsx:580-582`; Konva „Multi-touch Scale Stage“, Konva Pointer Events.
6. **Auswahl reagiert nur auf Klick, nicht schon beim Drücken.** Wer ein nicht ausgewähltes Objekt zieht, wählt es nicht aus; die alte Auswahl bleibt stehen. Messen bzw. Bereich lassen sich nicht auf einem Objekt starten (`cancelBubble` immer aktiv).
   *Quelle:* `EventItemShape.tsx:82-89,153-157`.
7. **Beim Ablegen aus der Bibliothek landet das Objekt versetzt.** Die Vorschau ist auf den Zeiger zentriert, das Objekt wird aber mit der linken oberen Ecke angelegt. Ein Drop über Panels legt trotzdem ein Objekt an, und Abbrechen mit Esc geht nicht.
   *Quelle:* `EditorView.tsx:310-340,713-733`.
8. **Standard-Tastenkürzel fehlen:** Pfeiltasten, ⌘A, ⌘C/⌘V, +/−/0, ⇧2 und Strg+Y. R und ⌘D wirken nur auf ein einzelnes Objekt. Ausrichten und Verteilen fehlen ganz.
   *Quelle:* `EditorView.tsx:392-472`, `SelectionControls.tsx:92-141`; Figma, tldraw `actions.tsx`.
9. **Performance:**
   - Der `zoom`-Prop rendert alle Objekte bei jedem Rad-Tick neu.
   - Bis zu 9 Konva-Layer (Konva warnt ab 5).
   - Das Gitter besteht aus etwa 128 einzelnen Linien.
   - Eine Stuhlreihe ist rows×cols einzelne Rects.
   - Es gibt keine Begrenzung der `pixelRatio`.

   *Quelle:* `CanvasEditor.tsx:587-767,692`, `EventItemShape.tsx:295-315`; Konva „All Performance Tips“.
10. **Kleine Fehler mit großer Wirkung:**
    - Das Gradfeld zeigt den alten Wert und schreibt ihn zurück.
    - Die Bereichsmaße erzeugen einen Undo-Schritt pro Tastendruck und können 0 werden.
    - Ein Ziehen ohne Bewegung erzeugt einen leeren Undo-Schritt.
    - Phase löschen lässt sich nicht rückgängig machen.
    - Autosave verwirft beim Schließen die letzten 600 ms.

    *Quelle:* `SelectionControls.tsx:174-204`, `store.ts:240-266,335`, `App.tsx:27-39`.

**Grundregel für alle Pakete:** Das Datenformat bleibt gleich. x/y ist bei Rechtecken die linke obere Ecke und bei runden Objekten (`table_round`, `table_high`, `custom_round`) die Mitte. `Venue3D.tsx:146`, der PDF-Export und gespeicherte Projekte verlassen sich darauf. Die Drehung um die Mitte entsteht nur durch **Positionsausgleich** (x/y wird beim Drehen mitgerechnet), ohne Datenmigration.

---

## 2. Was wir bewusst NICHT machen

| Nicht machen | Warum |
|---|---|
| Datenmodell auf Mittelpunkt-Anker umstellen (`offsetX/Y`) | Das bricht 3D, PDF, Inventar und alle gespeicherten Projekte. Der Positionsausgleich reicht. |
| Konva.Transformer für alle Objekte | Möbel haben feste Maße. Der Transformer kollidiert mit dem Visiova-Griff, mit den Stuhlreihen und mit der Zoom-Logik. Mitziehen und der eigene Drehgriff reichen. |
| Konva-Update auf ≥10.8 nur für Shift-15° | Unser eigener Griff kann das mit wenigen Zeilen. |
| Abstands-Einrasten „gleiche Lücken“ (Gap-Snapping) | Großer Aufwand. „Verteilen“ deckt den Anwendungsfall ab. |
| Plan-Check nach VStättV, Kapazitätsrechner, Auto-Fill, gebogene Reihen, Nummerierung, Export-Optionen, Team-Standards | Das sind Bestuhlungs-Features und gehören nicht zum Handling. Kandidaten für später. |
| Stuhlreihen-Block nachträglich bearbeiten, getrennte Abstände | Sinnvoll, aber eigenes Feature. Später als eigenes Paket. |
| Maßlinien speichern bzw. an Objekte binden | Geringer Nutzen. Wir lassen Messlinien nur bis Esc stehen, statt sie beim Werkzeugwechsel zu löschen. |
| Gruppieren (⌘G) | Für die Crew zu komplex. Rahmenauswahl plus Mitziehen genügt. |
| Eigener Drag-Layer per `moveTo` | In react-konva riskant. Zuerst die günstigen Maßnahmen umsetzen. |
| Zustand-Selektoren pro Objekt / `useShallow` überall | Erst angehen, wenn es messbar ruckelt. Der Zoom-Bucket bringt den Großteil. |
| Zoom/Pan komplett ohne React-State | Wir setzen die Stage imperativ und spiegeln den State nur einmal pro Frame. Das reicht und ist für Haiku sicherer. |
| Bilder nach IndexedDB, `navigator.storage.persist` | Kein Handling-Thema. Wir zeigen nur eine sichtbare Fehlermeldung, wenn das Speichern scheitert. |
| Kontextmenü, Auto-Pan am Rand, Alt-Ziehen zum Duplizieren | Niedrige Priorität bzw. doppelte UI. Für später. |
| Auswahl im Undo mitspeichern | Die Auswahl liegt in EditorView, das ist ein Umbau. Später. |
| Unit-Tests mit Vitest | Ein neues Paket ist nicht nötig. Absicherung über `tsc`, `lint` und die manuelle Checkliste (Abschnitt 4). Vitest später. |

---

## 3. Arbeitspakete

### Regeln für ALLE Agenten

- Ändere **nur die Dateien deines Pakets**. Andere Dateien darfst du nicht anfassen, auch nicht für Typfehler.
- Keine neuen npm-Pakete. Kein `git commit`. Das macht der Orchestrator nach jeder Welle.
- Kommentare auf Deutsch. Bestehende Kommentare und Funktionen bleiben, soweit das Paket nichts anderes sagt. Nicht die ganze Datei umformatieren.
- Pixel-Maßstab: `DEFAULT_PIXELS_PER_METER = 20` (1 m = 20 px).
- Prüfen nach dem Ändern:
  - `npx tsc -b`: keine Fehler in **deinen** Dateien. Die bei deinem Paket unter „Erwartete Fremdfehler“ genannten Fehler sind erlaubt.
  - `npm run lint`: keine Errors. Gesamtzahl Warnungen ≤ 14.
- Wenn eine Anweisung unklar ist: halte dich an den Wortlaut und notiere die Frage im Abschlussbericht. Erfinde kein anderes Verhalten.

### Dateizuordnung

| Paket | Dateien (exklusiv) | Welle |
|---|---|---|
| P1 Fundament-Utils | `src/utils/geometry.ts` (neu), `src/utils/snapping.ts`, `src/utils/viewport.ts` (neu) | 1 |
| P8 Autosave | `src/App.tsx`, `src/utils/projectStorage.ts`, `index.html` | 1 |
| P2 Store | `src/store/store.ts` | 2 |
| P3 Objekt-Shape | `src/components/EventItemShape.tsx` | 2 |
| P4 Leisten & Panels | `src/components/SelectionControls.tsx`, `src/components/FloatingToolbar.tsx`; löschen: `src/components/ObjectsPanel.tsx`, `src/utils/floatingPosition.ts` | 3 |
| P5 Editor-Steuerung | `src/components/EditorView.tsx`; löschen: `src/components/GridSettingsDialog.tsx` | 3 |
| P6 Canvas-Ansicht | `src/components/CanvasEditor.tsx` | 3 |
| P7 Ziehen & Einrasten (Integration) | `src/components/CanvasEditor.tsx` | 4 (nach P6) |

---

### P1 – Fundament-Utils (Geometrie, Einrasten, Ansicht)

**Ziel:** Reine Funktionen, die alle anderen Pakete nutzen. Kein React, kein Store.

**Schritte:**

1. Lege `src/utils/geometry.ts` mit **genau** diesem Inhalt an:

```ts
import type { EventItem, ItemType, PhaseData } from '../types'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import { metersToPixels } from './scale'

/** Punkt in Plan-Koordinaten (px, 20 px = 1 m). */
export interface Pt {
  x: number
  y: number
}

/** Achsenparallele Box in Plan-Koordinaten (px). */
export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Typen, die zentriert (Ursprung = Mitte) als Kreis gezeichnet werden. NICHT erweitern:
 *  sonst verrutschen gespeicherte Projekte (Ursprung liegt bei allen anderen oben links). */
const ROUND_TYPES: ItemType[] = ['table_round', 'table_high', 'custom_round']

export function isRoundType(type: ItemType): boolean {
  return ROUND_TYPES.includes(type)
}

type Sized = Pick<EventItem, 'type' | 'width' | 'height' | 'label'>

/** Ungedrehte Box im lokalen Koordinatensystem der Konva-Gruppe (Ursprung = phaseData.x/y). */
export function localBounds(item: Sized, ppm: number): { x: number; y: number; w: number; h: number } {
  const w = metersToPixels(item.width, ppm)
  const h = metersToPixels(item.height, ppm)
  if (isRoundType(item.type)) return { x: -w / 2, y: -w / 2, w, h: w }
  if (item.type === 'text_label') return { x: 0, y: 0, w: Math.max(item.label.length * 8 + 8, 20), h: 21 }
  return { x: 0, y: 0, w, h }
}

export function localCenter(item: Sized, ppm: number): Pt {
  const b = localBounds(item, ppm)
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

function rotatePt(p: Pt, deg: number): Pt {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

/** Mittelpunkt des Objekts in Plan-Koordinaten (berücksichtigt die Drehung). */
export function worldCenter(item: Sized, pd: PhaseData, ppm: number): Pt {
  const c = rotatePt(localCenter(item, ppm), pd.rotation)
  return { x: pd.x + c.x, y: pd.y + c.y }
}

/** Achsenparallele Bounding-Box des (ggf. gedrehten) Objekts in Plan-Koordinaten. */
export function worldBBox(item: Sized, pd: PhaseData, ppm: number): Box {
  const b = localBounds(item, ppm)
  const corners: Pt[] = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ].map((p) => {
    const r = rotatePt(p, pd.rotation)
    return { x: pd.x + r.x, y: pd.y + r.y }
  })
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

/** Neuer Ursprung (x/y), damit das Objekt bei der Drehung auf `newRotation` um seine MITTE dreht.
 *  Runde Objekte (Ursprung = Mitte) behalten x/y. */
export function positionForRotation(item: Sized, pd: PhaseData, newRotation: number, ppm: number): Pt {
  const center = worldCenter(item, pd, ppm)
  const c = rotatePt(localCenter(item, ppm), newRotation)
  return { x: round3(center.x - c.x), y: round3(center.y - c.y) }
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Winkel einrasten. fine15=true (Shift): 15°-Schritte. Sonst: im Umkreis von 4° auf
 *  0/90/180/270° einrasten, ansonsten auf ganze Grad runden. */
export function snapAngle(deg: number, fine15: boolean): number {
  const d = normalizeDeg(deg)
  if (fine15) return normalizeDeg(Math.round(d / 15) * 15)
  const nearest90 = Math.round(d / 90) * 90
  if (Math.abs(d - nearest90) <= 4) return normalizeDeg(nearest90)
  return normalizeDeg(Math.round(d))
}

/** Winkel der Strecke from→to in Grad (0° = nach rechts, im Uhrzeigersinn wie Konva). */
export function angleDeg(from: Pt, to: Pt): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

/** Ursprung (x/y) für ein NEUES Objekt, dessen Mitte bei (cx, cy) liegen soll (Drehung 0). */
export function originForCenter(
  type: ItemType,
  cx: number,
  cy: number,
  ppm: number,
  size?: { width: number; height: number },
): Pt {
  if (isRoundType(type)) return { x: cx, y: cy }
  const tpl = ITEM_LIBRARY.find((t) => t.type === type)
  const w = metersToPixels(size?.width ?? tpl?.width ?? 1, ppm)
  const h = metersToPixels(size?.height ?? tpl?.height ?? 1, ppm)
  return { x: cx - w / 2, y: cy - h / 2 }
}

/** Ursprung eines NEUEN Objekts so verschieben, dass seine Box-Oberkante links auf dem Raster liegt
 *  (gleiche Regel wie beim Ziehen). */
export function snapNewItemToGrid(
  type: ItemType,
  origin: Pt,
  ppm: number,
  gridSize: number,
  size?: { width: number; height: number },
): Pt {
  const tpl = ITEM_LIBRARY.find((t) => t.type === type)
  const lb = localBounds({ type, width: size?.width ?? tpl?.width ?? 1, height: size?.height ?? tpl?.height ?? 1, label: '' }, ppm)
  const minX = origin.x + lb.x
  const minY = origin.y + lb.y
  return {
    x: origin.x + Math.round(minX / gridSize) * gridSize - minX,
    y: origin.y + Math.round(minY / gridSize) * gridSize - minY,
  }
}

export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  }
}

export function translateBox(b: Box, dx: number, dy: number): Box {
  return { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy }
}
```

2. Ersetze den **gesamten** Inhalt von `src/utils/snapping.ts` durch diesen Code. `snapToGuides` entfällt, `snapToGrid` bleibt erhalten.

```ts
import type { Box } from './geometry'

/** Einrast-Schwelle in BILDSCHIRM-Pixeln; vor Gebrauch durch den Zoom teilen. */
export const SNAP_THRESHOLD_SCREEN_PX = 8

/** Modifier-Tasten während des Ziehens eines Objekts. */
export interface DragMods {
  /** ⌘/Strg gehalten: Einrasten (Objekte + Raster) vorübergehend aus. */
  bypassSnap: boolean
  /** Shift gehalten: nur waagrecht ODER senkrecht verschieben. */
  axisLock: boolean
}

/** Hilfslinie: 'v' = senkrechte Linie bei x=pos von y=from bis y=to; 'h' = waagrechte bei y=pos. */
export interface Guide {
  orientation: 'v' | 'h'
  pos: number
  from: number
  to: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: Guide[]
}

/** Raster: nächster Rasterpunkt (px). */
export function snapToGrid(x: number, y: number, gridSize: number) {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  }
}

/** Korrektur, damit die linke obere Ecke der Box auf dem Raster liegt. */
export function snapBoxToGrid(box: Box, gridSize: number): { dx: number; dy: number } {
  return {
    dx: Math.round(box.minX / gridSize) * gridSize - box.minX,
    dy: Math.round(box.minY / gridSize) * gridSize - box.minY,
  }
}

const xs = (b: Box) => [b.minX, (b.minX + b.maxX) / 2, b.maxX]
const ys = (b: Box) => [b.minY, (b.minY + b.maxY) / 2, b.maxY]

/** Kanten und Mitten der bewegten Box an Kanten/Mitten der Ziel-Boxen einrasten.
 *  threshold in Plan-px (= SNAP_THRESHOLD_SCREEN_PX / zoom). */
export function snapBoxToTargets(moving: Box, targets: Box[], threshold: number): SnapResult {
  let bestX: { delta: number; pos: number } | null = null
  let bestY: { delta: number; pos: number } | null = null
  for (const t of targets) {
    for (const a of xs(moving)) {
      for (const b of xs(t)) {
        const d = b - a
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) bestX = { delta: d, pos: b }
      }
    }
    for (const a of ys(moving)) {
      for (const b of ys(t)) {
        const d = b - a
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) bestY = { delta: d, pos: b }
      }
    }
  }
  const dx = bestX?.delta ?? 0
  const dy = bestY?.delta ?? 0
  const moved: Box = { minX: moving.minX + dx, minY: moving.minY + dy, maxX: moving.maxX + dx, maxY: moving.maxY + dy }
  const guides: Guide[] = []
  if (bestX) {
    const pos = bestX.pos
    let from = moved.minY
    let to = moved.maxY
    for (const t of targets) {
      if (xs(t).some((v) => Math.abs(v - pos) < 0.5)) {
        from = Math.min(from, t.minY)
        to = Math.max(to, t.maxY)
      }
    }
    guides.push({ orientation: 'v', pos, from, to })
  }
  if (bestY) {
    const pos = bestY.pos
    let from = moved.minX
    let to = moved.maxX
    for (const t of targets) {
      if (ys(t).some((v) => Math.abs(v - pos) < 0.5)) {
        from = Math.min(from, t.minX)
        to = Math.max(to, t.maxX)
      }
    }
    guides.push({ orientation: 'h', pos, from, to })
  }
  return { dx, dy, guides }
}

/** Abstandsmaß zwischen zwei Boxen (Strecke von (x1,y1) nach (x2,y2), Länge distancePx). */
export interface GapMeasure {
  x1: number
  y1: number
  x2: number
  y2: number
  distancePx: number
}

/** Abstand zum nächsten Nachbarn links/rechts/oben/unten (nur Nachbarn, die sich in der
 *  Querrichtung überlappen), höchstens maxDist (px). Liefert 0–4 Maße. */
export function nearestGaps(moving: Box, others: Box[], maxDist: number): GapMeasure[] {
  let left: GapMeasure | null = null
  let right: GapMeasure | null = null
  let up: GapMeasure | null = null
  let down: GapMeasure | null = null
  for (const o of others) {
    const overlapY = o.minY < moving.maxY && o.maxY > moving.minY
    const overlapX = o.minX < moving.maxX && o.maxX > moving.minX
    if (overlapY) {
      const y = (Math.max(o.minY, moving.minY) + Math.min(o.maxY, moving.maxY)) / 2
      if (o.maxX <= moving.minX) {
        const d = moving.minX - o.maxX
        if (d <= maxDist && (!left || d < left.distancePx)) left = { x1: o.maxX, y1: y, x2: moving.minX, y2: y, distancePx: d }
      }
      if (o.minX >= moving.maxX) {
        const d = o.minX - moving.maxX
        if (d <= maxDist && (!right || d < right.distancePx)) right = { x1: moving.maxX, y1: y, x2: o.minX, y2: y, distancePx: d }
      }
    }
    if (overlapX) {
      const x = (Math.max(o.minX, moving.minX) + Math.min(o.maxX, moving.maxX)) / 2
      if (o.maxY <= moving.minY) {
        const d = moving.minY - o.maxY
        if (d <= maxDist && (!up || d < up.distancePx)) up = { x1: x, y1: o.maxY, x2: x, y2: moving.minY, distancePx: d }
      }
      if (o.minY >= moving.maxY) {
        const d = o.minY - moving.maxY
        if (d <= maxDist && (!down || d < down.distancePx)) down = { x1: x, y1: moving.maxY, x2: x, y2: o.minY, distancePx: d }
      }
    }
  }
  return [left, right, up, down].filter((g): g is GapMeasure => g !== null)
}
```

3. Lege `src/utils/viewport.ts` mit **genau** diesem Inhalt an:

```ts
/** Zoom-Grenzen und -Stufen des 2D-Plans. */
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 6
/** Stufen für +/−-Buttons und Tastatur. Mausrad/Pinch zoomen stufenlos. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6]

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

/** Nächste Zoomstufe in Richtung dir (+1 = größer, −1 = kleiner). */
export function nextZoomStep(z: number, dir: 1 | -1): number {
  if (dir === 1) return ZOOM_STEPS.find((s) => s > z + 0.001) ?? MAX_ZOOM
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? MIN_ZOOM
}

/** Zoom auf √2-Stufen runden. Nicht ausgewählte Objekte bekommen nur diesen Wert, damit sie
 *  nicht bei jedem Mausrad-Tick neu rendern. */
export function quantizeZoom(z: number): number {
  return 2 ** (Math.round(Math.log2(z) * 2) / 2)
}

export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number }

/** Wheel-Event deuten: Pinch (ctrlKey) bzw. ⌘/Strg+Rad oder klassisches Mausrad → Zoom-Faktor.
 *  Zwei-Finger-Scrollen auf dem Trackpad → Verschieben (dx/dy in Bildschirm-px). */
export function interpretWheel(e: WheelEvent): WheelIntent {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
  let dx = e.deltaX * unit
  let dy = e.deltaY * unit
  const isMouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40)
  if (e.ctrlKey || e.metaKey || isMouseWheel) {
    const k = isMouseWheel ? 0.0015 : 0.01
    const factor = Math.min(2, Math.max(0.5, Math.exp(-dy * k)))
    return { kind: 'zoom', factor }
  }
  if (e.shiftKey && dx === 0) {
    dx = dy
    dy = 0
  }
  return { kind: 'pan', dx, dy }
}

/** true auf Geräten mit Finger-Bedienung (iPad/Handy). */
export const IS_COARSE_POINTER =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

/** true auf Mac/iOS (für die Anzeige ⌘ statt Strg). */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
```

**Akzeptanzkriterien:**
- Die drei Dateien existieren mit genau diesen Exporten.
- `snapToGuides` gibt es nicht mehr.
- `grep -rn snapToGuides src` findet nichts.

**Test:** `npx tsc -b` ohne Fehler. `npm run lint` ≤ 14 Warnungen. Diese Code-Stücke wurden vorab isoliert typgeprüft.

**Erwartete Fremdfehler:** keine. `EventItemShape.tsx` importiert weiterhin `snapToGrid`, das bleibt erhalten.

---

### P8 – Autosave-Flush und sichtbarer Speicherfehler

**Ziel:**
- Keine Änderung geht beim Schließen verloren.
- Ein volles `localStorage` wird angezeigt.
- Die HTML-Grunddaten sind auf Deutsch.

**Schritte:**

1. `src/utils/projectStorage.ts`: `saveProjectData` und `saveProjectVersions` geben `boolean` zurück: `true` nach erfolgreichem `setItem`, `false` im `catch`. Die Kommentare im `catch` bleiben. Bestehende Aufrufer, die den Rückgabewert ignorieren, bleiben gültig.

2. `src/App.tsx`:
   - Neuer State: `const [saveFailed, setSaveFailed] = useState(false)`. Dazu `useState` importieren.
   - Den Autosave-Effekt komplett so ersetzen:

```tsx
useEffect(() => {
  if (!currentProjectId) return
  const projectId = currentProjectId
  let pending = false
  const save = () => {
    pending = false
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const ok = saveProjectData(projectId, getSnapshot())
    setSaveFailed(!ok)
    if (ok) touchProject(projectId)
  }
  // Ausstehende Änderung sofort sichern (beim Schließen, Tab-Wechsel, App-Wechsel auf dem iPad)
  const flush = () => {
    if (pending) save()
  }
  const unsubscribe = useEventStore.subscribe(() => {
    pending = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, AUTOSAVE_DELAY_MS)
  })
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', flush)
  return () => {
    unsubscribe()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', flush)
    flush()
  }
}, [currentProjectId, getSnapshot, touchProject])
```

   - Rendern: Bei geöffnetem Projekt `<><EditorView />{saveFailed && <SaveBanner />}</>` zurückgeben. `SaveBanner` ist eine kleine Funktion in derselben Datei:

```tsx
function SaveBanner() {
  return (
    <div role="alert" className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg">
      Speichern fehlgeschlagen – Browser-Speicher voll. Bitte Projekt exportieren und alte Versionen löschen.
    </div>
  )
}
```

3. `index.html`: `lang="en"` wird zu `lang="de"`. Der `<title>` wird zu `WHU Event – Stadthallenplanung`.

**Akzeptanzkriterien:**
- Wird innerhalb von 600 ms nach einer Änderung „Zurück zur Projektübersicht“ geklickt, ist die Änderung gespeichert.
- Schlägt `setItem` fehl, erscheint das rote Banner. Beim nächsten erfolgreichen Speichern verschwindet es.

**Test:**
- `npx tsc -b`, `npm run lint` (≤ 14).
- Manuell: In der DevTools-Konsole `localStorage.setItem = () => { throw new Error('quota') }` setzen, ein Objekt verschieben, das Banner muss erscheinen.

**Erwartete Fremdfehler:** keine.

---

### P2 – Store: Drehen um die Mitte, Mehrfachaktionen, saubere Undo-Schritte

**Ziel:** Alle Daten-Aktionen, die die UI-Pakete brauchen. Das Datenformat bleibt unverändert.

**Schritte** (nur `src/store/store.ts`):

1. **Importe:**
   - `import { DEFAULT_PIXELS_PER_METER } from '../utils/scale'`
   - `import { normalizeDeg, positionForRotation, unionBox, worldBBox } from '../utils/geometry'`
   - Konstante `const PPM = DEFAULT_PIXELS_PER_METER`.

2. **Typen im Interface `Store`** ergänzen:

```ts
rotateItems: (itemIds: string[], deltaDeg: number) => void
duplicateItems: (itemIds: string[], offsetPx?: number) => string[]
nudgeItems: (itemIds: string[], dx: number, dy: number) => void
pasteItems: (sources: EventItem[], sourcePhaseId: string, offsetPx: number) => string[]
setItemsLocked: (itemIds: string[], locked: boolean) => void
alignItems: (itemIds: string[], mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') => void
distributeItems: (itemIds: string[], axis: 'horizontal' | 'vertical') => void
```

3. **Nudge-Zusammenfassung:** Oberhalb von `create(...)` diese Variable anlegen:

```ts
let lastNudge = { key: '', at: 0 }
```

   In `pushHistory` als erste Zeile `lastNudge = { key: '', at: 0 }` einfügen. Zusätzlich eine Funktion `pushProjectHistory` neben `pushHistory` anlegen:

```ts
/** Wie pushHistory, sichert aber zusätzlich Phasen/Name/aktuelle Phase (für Phasen-Aktionen). */
const pushProjectHistory = () => {
  lastNudge = { key: '', at: 0 }
  const { items, itemOrder, eventName, currentPhaseId, phases, historyPast } = get()
  const snap: HistorySnapshot = { items, itemOrder, project: { eventName, currentPhaseId, phases } }
  set({ historyPast: [...historyPast, snap].slice(-MAX_HISTORY), historyFuture: [] })
}
```

   `restoreVersion` ruft statt seines eigenen Codes für den Snapshot jetzt `pushProjectHistory()` auf. Danach folgt wie bisher das `set` mit den Daten.

4. **Phasen rückgängig machbar:**
   - `addPhase` und `removePhase`: Als erste Anweisung `pushProjectHistory()` aufrufen. Dafür beide als Block-Funktion schreiben: `(name, empty) => { pushProjectHistory(); set((state) => {...}) }`.
   - In `removePhase`: Ist `state.phases.length <= 1`, darf **kein** History-Eintrag entstehen. Diese Prüfung also vorher mit `get()` machen und dann `return`.

5. **`updateItemTransform`:** Am Anfang prüfen und ohne History-Eintrag abbrechen, wenn sich nichts ändert:

```ts
const cur = get().items[itemId]?.phaseData[get().currentPhaseId]
if (cur && cur.x === x && cur.y === y && (rotation === undefined || rotation === cur.rotation)) return
```

6. **`rotateItem` und `setItemRotation` drehen um die Mitte.** Neue Rotation `rot` (bei `rotateItem` `normalizeDeg(current.rotation + deltaDeg)`). Dann `const pos = positionForRotation(item, current, rot, PPM)` berechnen und `{ ...current, rotation: rot, x: pos.x, y: pos.y }` speichern. `setItemRotation` behält seine Prüfung „keine Änderung → kein Undo“. `rotateItem` macht ebenfalls nichts, wenn `deltaDeg % 360 === 0`.

7. **`moveItemsBy`:** Abbrechen ohne History, wenn `itemIds.length === 0` oder `dx === 0 && dy === 0`.

8. **`resizeItem`:** Abbrechen ohne History, wenn `!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)`, oder wenn beide Werte gleich den alten sind.

9. **Neue Aktionen** (jeweils genau EIN Undo-Schritt; nichts tun, wenn nichts zu ändern ist):

   - **`rotateItems(ids, delta)`:** Gesperrte Objekte (`item.locked`) und Objekte ohne `phaseData[currentPhaseId]` überspringen. Jedes Objekt dreht um seine eigene Mitte (wie Schritt 6). Ist nichts zu drehen: `return`. Sonst `pushHistory()` und ein `set`.
   - **`duplicateItems(ids, offsetPx = 20)`:** Logik wie `duplicateItem`, für alle IDs in einem `set`. Gibt die neuen IDs zurück, in derselben Reihenfolge. Leere Liste: `[]` ohne History.
   - **`nudgeItems(ids, dx, dy)`:**

```ts
nudgeItems: (itemIds, dx, dy) => {
  const { items, currentPhaseId } = get()
  const ids = itemIds.filter((id) => items[id]?.phaseData[currentPhaseId] && !items[id].locked)
  if (ids.length === 0 || (dx === 0 && dy === 0)) return
  const key = [...ids].sort().join(',')
  const now = Date.now()
  // Gedrückt gehaltene / schnell wiederholte Pfeiltasten = EIN Undo-Schritt
  if (!(lastNudge.key === key && now - lastNudge.at < 1000)) pushHistory()
  lastNudge = { key, at: now }
  set((state) => {
    const next = { ...state.items }
    for (const id of ids) {
      const it = next[id]
      const pd = it.phaseData[state.currentPhaseId]
      next[id] = { ...it, phaseData: { ...it.phaseData, [state.currentPhaseId]: { ...pd, x: pd.x + dx, y: pd.y + dy } } }
    }
    return { items: next }
  })
},
```

   - **`pasteItems(sources, sourcePhaseId, offsetPx)`:** Für jede Quelle mit `source.phaseData[sourcePhaseId]` ein neues Objekt anlegen: `{ ...source, id: uuid(), locked: false }`. `phaseData` für **alle** aktuellen Phasen wie in `addItem` (`visible` nur in `currentPhaseId`). Die Position ist `x + offsetPx`, `y + offsetPx`, `rotation` wie in der Quelle. An `itemOrder` anhängen. Ein Undo-Schritt. Rückgabe: neue IDs.
   - **`setItemsLocked(ids, locked)`:** Alle vorhandenen Objekte auf `locked` setzen. Ändert sich nichts: `return`. Ein Undo-Schritt.
   - **`alignItems(ids, mode)`:**

```ts
alignItems: (itemIds, mode) => {
  const state = get()
  const cp = state.currentPhaseId
  const list = itemIds.map((id) => state.items[id]).filter((it) => it?.phaseData[cp]?.visible)
  if (list.length < 2) return
  const boxes = list.map((it) => worldBBox(it, it.phaseData[cp], PPM))
  const all = unionBox(boxes)!
  const items = { ...state.items }
  let changed = false
  list.forEach((it, i) => {
    if (it.locked) return // gesperrte Objekte dienen nur als Bezug
    const b = boxes[i]
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = all.minX - b.minX
    if (mode === 'right') dx = all.maxX - b.maxX
    if (mode === 'centerX') dx = (all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2
    if (mode === 'top') dy = all.minY - b.minY
    if (mode === 'bottom') dy = all.maxY - b.maxY
    if (mode === 'centerY') dy = (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2
    if (dx === 0 && dy === 0) return
    changed = true
    const pd = it.phaseData[cp]
    items[it.id] = { ...it, phaseData: { ...it.phaseData, [cp]: { ...pd, x: pd.x + dx, y: pd.y + dy } } }
  })
  if (!changed) return
  pushHistory()
  set({ items })
},
```

   - **`distributeItems(ids, axis)`:** Wie bei `alignItems` die sichtbaren Objekte mit ihren Boxen sammeln. Bei weniger als 3 Objekten: `return`.
     1. Nach Box-Minimum auf der Achse sortieren (`minX` bei `horizontal`, `minY` bei `vertical`).
     2. Das erste und das letzte Objekt bleiben stehen.
     3. `gap = (last.max − first.min − Σ Größen aller Boxen) / (n − 1)` berechnen.
     4. `cursor = first.max + gap` setzen. Für jedes mittlere Objekt: `delta = cursor − box.min`. Ist es nicht gesperrt, um `delta` auf der Achse verschieben. Danach `cursor += Größe + gap`.
     5. Ein Undo-Schritt, nur wenn sich etwas bewegt hat.

10. `duplicateItem`, `filteredItems` und alle übrigen Aktionen bleiben unverändert.

**Akzeptanzkriterien:**
- Bar (2 × 0,6 m) bei (100,100), Drehung 0, nach `rotateItem(id, 90)`: Position (126, 86), Drehung 90.
- Viermal `rotateItem(id, 90)` führt zurück zu (100,100) (± 0,001).
- `updateItemTransform` mit gleichen Werten erzeugt keinen History-Eintrag.
- `removePhase` lässt sich mit `undo()` zurückholen.
- Mehrere `nudgeItems` innerhalb einer Sekunde ergeben einen Undo-Schritt.

**Test:**
- `npx tsc -b`, `npm run lint` (≤ 14).
- In der Dev-Konsole: `useEventStore` ist nicht global. Deshalb manuell über die UI testen (R-Taste, Phase löschen und ⌘Z).

**Erwartete Fremdfehler:** keine. Alle neuen Aktionen sind Ergänzungen.

---

### P3 – Objekt-Shape: Auswahl beim Drücken, Drehgriff, Ziehen-Callbacks, Hover, Performance

**Ziel:**
- `EventItemShape` wählt beim Drücken aus.
- Der Drehgriff dreht um die Mitte und rastet ein.
- Die Shape meldet Ziehbewegungen an den Parent.
- Sie zeichnet günstiger.

**Neuer Props-Vertrag** (P6/P7 verlassen sich darauf):

```ts
import type { DragMods } from '../utils/snapping'

interface Props {
  item: EventItem
  phaseData: PhaseData
  pixelsPerMeter: number
  isSelected: boolean
  onSelect: (id: string, additive: boolean) => void
  /** Beginn des Ziehens der GANZEN Gruppe (nicht der Griffe). */
  onDragStart?: (id: string) => void
  /** Während des Ziehens: Parent liefert die korrigierte (eingerastete) Position zurück. */
  onDragMove?: (id: string, x: number, y: number, mods: DragMods) => { x: number; y: number }
  onDragEnd: (id: string, x: number, y: number) => void
  onRotate?: (id: string, x: number, y: number, rotationDeg: number) => void
  onVisiovaRun?: (id: string, lengthM: number) => void
  draggable?: boolean
  zoom?: number
  /** Geisterbild der Vorphase: keine Konva-ID, keine Hover-Effekte. */
  isGhost?: boolean
}
```

`gridEnabled` und `gridSize` werden **entfernt**, ebenso der Import `snapToGrid`.

**Schritte** (nur `src/components/EventItemShape.tsx`):

1. **Importe:**
   - `Shape` aus `react-konva`.
   - `localBounds, worldCenter, positionForRotation, snapAngle, angleDeg, isRoundType, type Pt` aus `../utils/geometry`.
   - `IS_COARSE_POINTER` aus `../utils/viewport`.
   - `type DragMods` aus `../utils/snapping`.
   - `isRound` wird zu `isRoundType(item.type)`.

2. **handleDragEnd** (Group) – das Einrasten ist entfernt:

```ts
const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
  if (e.target !== groupRef.current) return
  onDragEnd(item.id, e.target.x(), e.target.y())
}
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
```

   Die Group bekommt `onDragStart={handleDragStart}`, `onDragMove={handleDragMove}` und `onDragEnd={handleDragEnd}`.

3. **Auswahl beim Drücken** (ersetzt `handleSelect` und `stopBubble` an der Group):

```ts
const justSelectedRef = useRef(false)
const isAdditive = (ev: Event) => {
  const m = ev as MouseEvent
  return !!(m.shiftKey || m.metaKey || m.ctrlKey)
}
// Nur im Auswahl-Werkzeug (draggable=true) das Event abfangen – sonst (Messen/Bereich/Platzieren)
// muss der Klick bei der Stage ankommen. Gilt auch für gesperrte Objekte.
const stopBubble = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>) => {
  if (draggable) e.cancelBubble = true
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
```

   Die Group bekommt:
   - `onPointerDown={handlePointerDown}`
   - `onMouseDown={stopBubble}`, `onTouchStart={stopBubble}`
   - `onClick={handleClick}`, `onTap={handleClick}`
   - `id={isGhost ? undefined : item.id}`

   Die Visiova- und Dreh-Griffe behalten ihr **eigenes** unbedingtes `e.cancelBubble = true` in `onMouseDown`/`onTouchStart`. Zusätzlich bekommen sie `onPointerDown={(e) => { e.cancelBubble = true }}`.

4. **Drehgriff** (ersetzt `angleFromPointer`, `handleRotateDragMove` und `handleRotateDragEnd`):

```ts
const lb = localBounds(item, pixelsPerMeter)
const centerX = lb.x + lb.w / 2
const topY = lb.y
const handleX = centerX
const handleY = topY - 26 / zoom
const rotStartRef = useRef<{ center: Pt; pointerAngle: number; startRotation: number } | null>(null)
const angleTextRef = useRef<Konva.Text>(null)
const pointerWorld = (e: Konva.KonvaEventObject<DragEvent>) => e.target.getLayer()?.getRelativePointerPosition() ?? null

const handleRotateDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
  e.cancelBubble = true
  const p = pointerWorld(e)
  if (!p) return
  const center = worldCenter(item, phaseData, pixelsPerMeter)
  rotStartRef.current = { center, pointerAngle: angleDeg(center, p), startRotation: phaseData.rotation }
}
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
```

   Am Griff-`Circle`:
   - `onDragStart={handleRotateDragStart}` ergänzen.
   - `hitStrokeWidth={(IS_COARSE_POINTER ? 30 : 12) / zoom}` ergänzen.

   Direkt nach dem Griff-Circle einfügen:

   ```tsx
   <Text ref={angleTextRef} visible={false} listening={false} x={handleX + 12 / zoom} y={handleY - 6 / zoom} fontSize={12 / zoom} fontStyle="bold" fill="#1d4ed8" text="" />
   ```

   Das alte `centerX`/`topY` (`isRound ? …`) entfällt. Der Visiova-Griff-`Rect` bekommt `hitStrokeWidth={(IS_COARSE_POINTER ? 24 : 8) / zoom}`.

5. **Hover und Cursor:**
   - Neuer State: `const [hovered, setHovered] = useState(false)`.
   - Strichfarbe: `const stroke = isSelected ? '#2563eb' : hovered ? '#60a5fa' : '#374151'`.
   - An der Group, nur wenn `!isGhost`:
     - `onMouseEnter`: `setHovered(true)`, dann `const c = e.target.getStage()?.container(); if (c) c.style.cursor = isLocked ? 'not-allowed' : draggable ? 'move' : ''`.
     - `onMouseLeave`: `setHovered(false)` und `cursor = ''`.

6. **Trefferfläche:** Bei runden Objekten wird aus dem unsichtbaren `Rect` ein `<Circle radius={Math.max(w / 2, minSize / 2)} fill="rgba(255,255,255,0.001)" />`. Text-Labels und Rechtecke behalten das `Rect`.

7. **Stuhlreihe als eine Shape:** Den Block `Array.from({ length: item.grid.rows })…` ersetzen durch:

```tsx
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
```

   Das gestrichelte Umriss-`Rect` darüber bleibt.

8. **Detailgrad (LOD):**
   - `const showDims = isSelected || zoom >= 0.7` und `const showLabel = isSelected || zoom >= 0.4`.
   - Im letzten `else`-Zweig (nicht Text-Label, nicht Bereich) das Label-`Text` nur bei `showLabel` rendern, das Maß-`Text` nur bei `showDims`.
   - Text-Labels und Bereichs-Texte bleiben immer sichtbar.

**Akzeptanzkriterien:**
- Der Griff springt beim Greifen nicht.
- Die Objektmitte bleibt beim Drehen stehen.
- Nahe 0/90/180/270° rastet der Winkel ein, mit Shift in 15°-Schritten.
- Die Gradanzeige erscheint nur während des Drehens.
- Ein nicht ausgewähltes Objekt ist sofort beim Drücken ausgewählt.
- In Messen/Bereich gehen Klicks auf Objekte an die Stage.
- Eine Stuhlreihe ist genau eine Shape.

**Test:**
- `npx tsc -b`: Fehler nur in `CanvasEditor.tsx`, siehe unten.
- `npm run lint`: keine neuen Warnungen in `EventItemShape.tsx`.
- `grep -n "snapToGrid\|gridEnabled" src/components/EventItemShape.tsx` findet nichts.

**Erwartete Fremdfehler:** `CanvasEditor.tsx` übergibt noch `gridEnabled`/`gridSize`. Das behebt P6.

---

### P4 – Leisten & Panels: Mehrfachaktionen, korrekte Formularfelder, Rasterweite

**Ziel:**
- Die Mehrfachauswahl kann ausrichten, verteilen, drehen, duplizieren und sperren.
- Die Felder im Eigenschaften-Panel sind korrekt.
- Die Rasterweite ist einstellbar.
- Toter Code wird entfernt.

**Schritte:**

1. **`SelectionControls.tsx` – RotationField:** Den Aufruf ändern zu

   ```tsx
   <RotationField key={`${item.id}:${Math.round(item.phaseData[currentPhaseId]?.rotation ?? 0)}`} item={item} currentPhaseId={currentPhaseId} />
   ```

2. **`SelectionControls.tsx` – Bereichsmaße:** Den Block mit den zwei `type="number"`-Inputs (Bereich) ersetzen durch `<AreaSizeFields key={`${item.id}:${item.width}:${item.height}`} item={item} />`. Die neue Komponente in derselben Datei:

```tsx
/** Breite/Tiefe eines Bereichs: lokal tippen, bei Enter/Verlassen EIN Undo-Schritt, nie 0. */
function AreaSizeFields({ item }: { item: EventItem }) {
  const resizeItem = useEventStore((s) => s.resizeItem)
  const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',')
  const [w, setW] = useState(fmt(item.width))
  const [h, setH] = useState(fmt(item.height))
  const commit = () => {
    const nw = parseFloat(w.replace(',', '.'))
    const nh = parseFloat(h.replace(',', '.'))
    if (nw > 0 && nh > 0 && Number.isFinite(nw) && Number.isFinite(nh)) {
      if (nw !== item.width || nh !== item.height) resizeItem(item.id, nw, nh)
    } else {
      setW(fmt(item.width))
      setH(fmt(item.height))
    }
  }
  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="flex-1 space-y-1">
      <span className="text-ink3">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => set(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setW(fmt(item.width))
            setH(fmt(item.height))
          }
        }}
        className={`w-full ${inputCls}`}
      />
    </label>
  )
  return (
    <div className="flex gap-2">
      {field('Breite (m)', w, setW)}
      {field('Tiefe (m)', h, setH)}
    </div>
  )
}
```

   `resizeItem` wird danach in `PropertiesPanel` nicht mehr gebraucht. Den Selektor dort entfernen, sonst meldet `tsc` „unused“.

3. **`SelectionControls.tsx` – MultiSelectionBar:**
   - Neue Props: `ids: string[]` und `onDuplicate: () => void`, beide Pflicht.
   - Store-Selektoren: `rotateItems`, `alignItems`, `distributeItems`, `setItemsLocked`, `const allLocked = useEventStore((s) => ids.every((id) => !!s.items[id]?.locked))`.
   - Lokaler State: `const [showAlign, setShowAlign] = useState(false)`.
   - Neue Buttons in die Leiste, in dieser Reihenfolge nach dem Zähler, alle mit Klasse `cell`:
     - `⧉ Duplizieren` → `onDuplicate`, title „Alle duplizieren (Strg/Cmd+D)“
     - `⟳ 90°` → `rotateItems(ids, 90)`, title „Jedes Objekt um 90° drehen (R)“
     - `⇹ Ausrichten` → `setShowAlign((v) => !v)`, aktiv-Stil `text-accent bg-accent-soft`, wenn `showAlign`
     - Sperren: `allLocked ? '🔓 Entsperren' : '🔒 Sperren'` → `setItemsLocked(ids, !allLocked)`
   - Die bisherigen Buttons bleiben danach.
   - Die Wurzel wird zu `<div className="flex flex-col items-center gap-1">`, mit der bestehenden Leiste als erstem Kind. Ist `showAlign` gesetzt, folgt als zweites Kind eine zweite Leiste mit gleichem Stil (`flex items-center gap-0.5 p-1 rounded-xl ${island}`) und diesen Buttons:

| Text | title | Aktion |
|---|---|---|
| `⇤` | Links ausrichten | `alignItems(ids,'left')` |
| `↔` | Waagrecht mittig | `alignItems(ids,'centerX')` |
| `⇥` | Rechts ausrichten | `alignItems(ids,'right')` |
| `⤒` | Oben ausrichten | `alignItems(ids,'top')` |
| `↕` | Senkrecht mittig | `alignItems(ids,'centerY')` |
| `⤓` | Unten ausrichten | `alignItems(ids,'bottom')` |
| `Verteilen ↔` (nur bei `ids.length >= 3`) | Gleiche Abstände waagrecht | `distributeItems(ids,'horizontal')` |
| `Verteilen ↕` (nur bei `ids.length >= 3`) | Gleiche Abstände senkrecht | `distributeItems(ids,'vertical')` |

   Beide Leisten behalten `onMouseDown={(e) => e.stopPropagation()}`.

4. **`FloatingToolbar.tsx`:**
   - Neue Pflicht-Props: `gridSize: number` und `onGridSizeChange: (px: number) => void`.
   - Direkt nach dem Gitter-Button `📐` einfügen:

```tsx
{gridEnabled && (
  <select
    value={gridSize}
    onChange={(e) => onGridSizeChange(Number(e.target.value))}
    className="h-9 rounded-lg bg-chip px-1 text-[11px] font-medium text-ink"
    title="Rasterweite"
  >
    {/* 20 px = 1 m */}
    <option value={5}>0,25 m</option>
    <option value={10}>0,5 m</option>
    <option value={20}>1 m</option>
    <option value={40}>2 m</option>
  </select>
)}
```

   - Der title von „Einpassen“ wird zu `Plan einpassen (0)`.
   - Den Typ `ActivePanel` **nicht** ändern.

5. **Löschen:** `src/components/ObjectsPanel.tsx` und `src/utils/floatingPosition.ts`. Vorher mit `grep -rn "ObjectsPanel\|floatingPosition" src` prüfen, dass nichts sie importiert.

**Akzeptanzkriterien:**
- Wechsel auf ein anderes Objekt zeigt im Gradfeld dessen Winkel.
- Das Leeren des Breitenfelds setzt den Bereich nicht auf 0.
- „12,5“ tippen und Enter ergibt einen einzigen Undo-Schritt.
- Bei 3 ausgewählten Tischen gleicht „Verteilen ↔“ die Abstände an.

**Test:** `npx tsc -b`, `npm run lint` (≤ 14).

**Erwartete Fremdfehler** (bis P5 fertig ist): `EditorView.tsx` übergibt `ids`, `onDuplicate`, `gridSize` und `onGridSizeChange` noch nicht.

---

### P5 – Editor-Steuerung: Tastatur, Bibliotheks-Drop, Platzieren, Leisten

**Ziel:**
- Standard-Tastenkürzel.
- Objekte landen zentriert und eingerastet.
- Drop nur auf dem Plan, mit Abbrechen per Esc.
- Leisten verschwinden während Gesten.
- Stabile Props für den memoisierten Canvas.

**Vertrag mit P6:**
- `CanvasEditorHandle` bekommt `zoomToBounds(box: Box): void`.
- `CanvasEditor` bekommt den Prop `onGestureChange?: (active: boolean) => void`.

**Schritte** (nur `src/components/EditorView.tsx`; zusätzlich `src/components/GridSettingsDialog.tsx` löschen):

1. **Importe:**
   - `worldBBox, worldCenter, unionBox, originForCenter, snapNewItemToGrid` aus `../utils/geometry`.
   - `IS_MAC` aus `../utils/viewport`.
   - `GridSettingsDialog` entfernen (Import und JSX-Block `activePanel === 'grid'`). Den Typ `ActivePanel` unverändert lassen.

2. **`screenBounds` neu:**

```ts
function screenBounds(item: EventItem, phaseId: string, vp: CanvasViewport) {
  const pd = item.phaseData[phaseId]
  if (!pd) return null
  const b = worldBBox(item, pd, PPM)
  return { minX: b.minX * vp.zoom + vp.x, maxX: b.maxX * vp.zoom + vp.x, minY: b.minY * vp.zoom + vp.y, maxY: b.maxY * vp.zoom + vp.y }
}
```

   In `selectFromInventory` die `isRound`-Berechnung ersetzen durch `const c = worldCenter(item, pd, PPM); canvasRef.current?.panToItem(c.x, c.y)`.

3. **Platzier-Anker:**

```ts
/** Mitte des neuen Objekts an (cx, cy); bei aktivem Raster Box-Ecke aufs Raster. */
const placeOrigin = useCallback((type: ItemType, cx: number, cy: number, size?: { width: number; height: number }) => {
  const o = originForCenter(type, cx, cy, PPM, size)
  const { gridEnabled: ge, gridSize: gs } = useEventStore.getState()
  return ge ? snapNewItemToGrid(type, o, PPM, gs, size) : o
}, [])
```

   - In `placeType` → `create`: `if (quantity <= 1) { const o = placeOrigin(type, x, y); return addItem(type, o.x, o.y) }`. `buildItemGrid` bleibt unverändert.
   - In `placeCustom`, im Zweig `center` und in `place`:
     `const t = spec.shape === 'round' ? 'custom_round' : 'custom_rect'`
     `const size = { width: spec.width, height: spec.shape === 'round' ? spec.width : spec.height }`
     `const o = placeOrigin(t, x, y, size)` und dann `addCustomItem(o.x, o.y, spec)`.
   - `placeOrigin` in die Dependency-Arrays aufnehmen.

4. **Bibliotheks-Drag neu:** Den State `dragGhost` und den Ref `dragStateRef` ersetzen.

```ts
const [dragGhostType, setDragGhostType] = useState<ItemType | null>(null)
const ghostElRef = useRef<HTMLDivElement>(null)
const ghostPosRef = useRef({ x: 0, y: 0 })
const moveGhost = (x: number, y: number) => {
  ghostPosRef.current = { x, y }
  const el = ghostElRef.current
  if (el) el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
}
// Beim Erscheinen sofort an die Zeigerposition setzen (ohne React-Re-Render pro Bewegung)
useLayoutEffect(() => {
  if (dragGhostType) moveGhost(ghostPosRef.current.x, ghostPosRef.current.y)
}, [dragGhostType])

const handleTileDragStart = useCallback(
  (e: React.PointerEvent, type: ItemType) => {
    // Nur Maus: auf Touch scrollt die Kachelliste; dort gilt „antippen, dann in den Plan tippen“.
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cleanup)
      window.removeEventListener('keydown', onKey, true)
      setDragGhostType(null)
    }
    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
        dragging = true
        ghostPosRef.current = { x: ev.clientX, y: ev.clientY }
        setDragGhostType(type)
      }
      moveGhost(ev.clientX, ev.clientY)
    }
    const onUp = (ev: PointerEvent) => {
      cleanup()
      if (!dragging) return
      // Nur annehmen, wenn direkt über dem Plan-Canvas losgelassen (nicht über Panels/Dock)
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      if (!el || el.tagName !== 'CANVAS') return
      const pos = canvasRef.current?.screenToCanvas(ev.clientX, ev.clientY)
      if (!pos) return
      const o = placeOrigin(type, pos.x, pos.y)
      select(addItem(type, o.x, o.y))
      setActivePanel((p) => (p === 'picker' ? null : p))
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      cleanup()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cleanup)
    window.addEventListener('keydown', onKey, true) // capture: vor dem globalen Esc-Handler
  },
  [addItem, select, placeOrigin],
)
```

   - `useLayoutEffect` in den React-Import aufnehmen.
   - `moveGhost` als Funktion im Komponentenkörper definieren, wie oben.
   - Das Ghost-JSX nutzt `dragGhostType` statt `dragGhost.type`, `ref={ghostElRef}` und die Klassen `fixed left-0 top-0 z-50 pointer-events-none …`.
   - `style` enthält **nur** `width`, `height` und `borderRadius`, **kein** `left`/`top`/`transform`.
   - `isRound` beim Ghost über `isRoundType` aus geometry.

5. **Gesten-Status:**
   - Neuer State: `const [gestureActive, setGestureActive] = useState(false)`.
   - An `<CanvasEditor>` übergeben: `onGestureChange={setGestureActive}`.
   - `barStyle` und `multiBarStyle` nur berechnen, wenn zusätzlich `!gestureActive`.

6. **Stabile Props:** `const clearPlacement = useCallback(() => setPlacement(null), [])`. Damit `onPlacementDone={clearPlacement}` an `CanvasEditor` **und** `FloatingToolbar` übergeben.

7. **Store-Selektoren** ergänzen: `rotateItems`, `duplicateItems`, `nudgeItems`, `pasteItems`, `setGridSize` (schon vorhanden). Den Selektor `duplicateItem` entfernen, er wird nicht mehr gebraucht.

8. **`duplicateSelected`** neu:

```ts
const duplicateSelected = useCallback(() => {
  if (selectedIds.length === 0) return
  const ids = duplicateItems(selectedIds)
  if (ids.length > 0) selectMany(ids, false)
}, [selectedIds, duplicateItems, selectMany])
```

9. **Zwischenablage:**

   ```ts
   const clipboardRef = useRef<{ items: EventItem[]; phaseId: string; pastes: number } | null>(null)
   ```

10. **Keydown-Handler:** Nach dem bestehenden `⌘Z`-Block und **vor** `if (isMod || e.altKey) return` einfügen, mit `const key = e.key.toLowerCase()`:

```ts
if (isMod && key === 'y') { e.preventDefault(); redo(); return }
if (isMod && key === 'a') {
  e.preventDefault()
  const s = useEventStore.getState()
  selectMany(s.itemOrder.filter((id) => s.items[id]?.phaseData[s.currentPhaseId]?.visible), false)
  return
}
if (isMod && key === 'c' && selectedIds.length > 0) {
  e.preventDefault()
  const s = useEventStore.getState()
  clipboardRef.current = { items: selectedIds.map((id) => s.items[id]).filter(Boolean), phaseId: s.currentPhaseId, pastes: 0 }
  return
}
if (isMod && key === 'v' && clipboardRef.current) {
  e.preventDefault()
  const cb = clipboardRef.current
  // Gleiche Phase: versetzt einfügen; andere Phase: an derselben Stelle (Aufbau → Event übernehmen)
  const samePhase = cb.phaseId === currentPhaseId
  if (samePhase) cb.pastes += 1
  const ids = pasteItems(cb.items, cb.phaseId, samePhase ? 20 * cb.pastes : 0)
  if (ids.length > 0) selectMany(ids, false)
  return
}
if (isMod && key === 'd' && selectedIds.length > 0) { e.preventDefault(); duplicateSelected(); return }
```

   Den alten `⌘D`-Block, der `selectedId` prüft, entfernen.

   Nach `if (isMod || e.altKey) return` einfügen. Den alten `r`-Block ersetzen:

```ts
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
const arrow = ARROWS[e.key]
if (arrow && selectedIds.length > 0) {
  e.preventDefault()
  const step = gridEnabled ? (e.shiftKey ? gridSize * 5 : gridSize) : e.shiftKey ? PPM : PPM * 0.1
  nudgeItems(selectedIds, arrow[0] * step, arrow[1] * step)
  return
}
if (key === 'r' && selectedIds.length > 0) { e.preventDefault(); rotateItems(selectedIds, e.shiftKey ? -90 : 90); return }
if (e.key === '+' || e.key === '=') { e.preventDefault(); canvasRef.current?.zoomIn(); return }
if (e.key === '-') { e.preventDefault(); canvasRef.current?.zoomOut(); return }
if (e.key === '0' || (e.shiftKey && e.code === 'Digit1')) { e.preventDefault(); canvasRef.current?.fitToView(); return }
if (e.shiftKey && e.code === 'Digit2' && selectedIds.length > 0) {
  e.preventDefault()
  const s = useEventStore.getState()
  const box = unionBox(
    selectedIds
      .map((id) => s.items[id])
      .filter((it): it is EventItem => !!it?.phaseData[s.currentPhaseId])
      .map((it) => worldBBox(it, it.phaseData[s.currentPhaseId], PPM)),
  )
  if (box) canvasRef.current?.zoomToBounds(box)
  return
}
```

   Alle neu benutzten Werte in das Dependency-Array aufnehmen: `selectMany`, `duplicateItems`, `nudgeItems`, `rotateItems`, `pasteItems`, `gridEnabled`, `gridSize`. `rotateItem` und `duplicateItem` daraus entfernen.

11. **Shortcut-Liste:** `const MOD = IS_MAC ? '⌘' : 'Strg+'` und `SHORTCUTS` ersetzen durch:

```ts
const SHORTCUTS: [string, string][] = [
  ['Befehlszeile', `${MOD}K`],
  ['Auswählen / Messen / Bereich', 'V · M · B'],
  ['Objekte-Blatt', 'O'],
  ['Vorherige / nächste Phase', '[ · ]'],
  ['Drehen 90° (auch mehrere)', 'R · ⇧R'],
  ['Drehgriff: 15°-Schritte', '⇧ halten'],
  ['Verschieben 10 cm / 1 m', 'Pfeile · ⇧+Pfeile'],
  ['Beim Ziehen: ohne Einrasten', `${IS_MAC ? '⌘' : 'Strg'} halten`],
  ['Beim Ziehen: nur gerade', '⇧ halten'],
  ['Alles auswählen', `${MOD}A`],
  ['Kopieren / Einfügen (auch in andere Phase)', `${MOD}C · ${MOD}V`],
  ['Duplizieren', `${MOD}D`],
  ['Zur Auswahl hinzufügen/entfernen', '⇧Klick'],
  ['Mehrere per Rechteck wählen', 'Ziehen auf freie Fläche'],
  ['Ansicht verschieben', 'Leertaste+Ziehen · 2 Finger'],
  ['Zoomen', 'Mausrad · Pinch · + / −'],
  ['Einpassen / Auswahl zeigen', '0 · ⇧2'],
  ['Löschen', '⌫'],
  ['Abwählen / schließen', 'Esc'],
  ['Rückgängig / Wiederholen', `${MOD}Z · ${MOD}⇧Z`],
  ['Diese Hilfe', '?'],
]
```

   Die Breite des Shortcut-Panels wird von `w-72` zu `w-80`.

12. **Props an die Kinder:**
    - `MultiSelectionBar` bekommt zusätzlich `ids={selectedIds}` und `onDuplicate={duplicateSelected}`.
    - `FloatingToolbar` bekommt zusätzlich `gridSize={gridSize}` und `onGridSizeChange={setGridSize}`.

**Akzeptanzkriterien:**
- Ein Stehtisch, aus der Bibliothek gezogen, liegt mittig unter dem Zeiger.
- Ein Drop über dem Dock legt nichts an. Esc während des Ziehens bricht ab.
- Pfeiltasten bewegen 10 cm, mit Shift 1 m. Gesperrte Objekte bewegen sich nicht.
- ⌘C, Phase wechseln, ⌘V setzt die Objekte an derselben Stelle ein.
- ⌘A wählt alle sichtbaren Objekte.

**Test:** `npx tsc -b`, `npm run lint` (≤ 14).

**Erwartete Fremdfehler:** bis P6 und P4 fertig sind, fehlen `zoomToBounds`, `onGestureChange` und die neuen Props von `MultiSelectionBar` bzw. `FloatingToolbar`.

---

### P6 – Canvas-Ansicht: Mausrad/Trackpad, Pinch, Pointer-Gesten, Layer, Gitter

**Ziel:**
- Natürliches Zoomen und Verschieben auf Trackpad, Maus und Touch.
- Rahmenauswahl ohne Shift.
- Messen, Bereich und Rahmenauswahl auch auf Touch.
- Höchstens 3 Layer.
- Kein Re-Render aller Objekte pro Rad-Tick.

**Schritte** (nur `src/components/CanvasEditor.tsx`):

1. **Importe und Globals:**
   - `import type Konva from 'konva'` wird zu `import Konva from 'konva'`.
   - `memo` und `Shape` importieren.
   - Aus `../utils/viewport`: `clampZoom, nextZoomStep, quantizeZoom, interpretWheel, IS_COARSE_POINTER`.
   - Aus `../utils/geometry`: `worldBBox, type Box`.
   - Die lokale Funktion `itemWorldBBox` löschen und durch `worldBBox` ersetzen (gleiche Signatur `(item, pd, ppm)`).
   - Die lokalen `MIN_ZOOM`, `MAX_ZOOM`, `ZOOM_STEP` und `clampZoom` löschen.
   - Auf Modulebene, unter den Konstanten:

```ts
// Retina-Canvases begrenzen (iPad-Speicherlimit), Finger brauchen größere Zieh-Schwelle,
// Pinch muss auch während eines Drags erkannt werden (Konva-Demo „Multi-touch Scale Stage“).
Konva.pixelRatio = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
Konva.dragDistance = IS_COARSE_POINTER ? 8 : 3
Konva.hitOnDragEnabled = true
```

2. **Ansichts-Kern** (ersetzt `zoomAtPoint` und alle direkten `setZoom`/`setStagePos`-Aufrufe):

```ts
const viewRef = useRef({ zoom: 1, x: 0, y: 0 })
const rafRef = useRef(0)
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
const zoomAtPoint = (newZoomRaw: number, point: { x: number; y: number }) => {
  const v = viewRef.current
  const z = clampZoom(newZoomRaw)
  const wx = (point.x - v.x) / v.zoom
  const wy = (point.y - v.y) / v.zoom
  applyView(z, point.x - wx * z, point.y - wy * z)
}
const clientToCanvas = (clientX: number, clientY: number) => {
  const el = containerRef.current
  if (!el) return null
  const r = el.getBoundingClientRect()
  const v = viewRef.current
  return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom }
}
```

   Dazu `useEffect(() => () => cancelAnimationFrame(rafRef.current), [])`.

   Überall `zoom`/`stagePos` aus `viewRef.current` lesen, wo es um Rechnungen in Handlern geht: `getViewCenter`, `screenToCanvas`, `panToItem`, Export und Fit. Der Fit-Effekt ruft `applyView(fit, …)` auf. `exportSnapshot` und `handleExportImage` nutzen `const prev = { ...viewRef.current }`, dann `applyView(1, 0, 0)` und zum Wiederherstellen `applyView(prev.zoom, prev.x, prev.y)`. Der Rest der Export-Logik bleibt.

3. **Handle-Methoden:**
   - `zoomIn`: `zoomAtPoint(nextZoomStep(viewRef.current.zoom, 1), Mitte)`.
   - `zoomOut`: entsprechend mit `-1`.
   - `setZoomPercent`: `zoomAtPoint(percent / 100, Mitte)`.
   - Neu, auch im Interface `CanvasEditorHandle` ergänzen:

```ts
zoomToBounds: (b: Box) => {
  if (!containerSize) return
  const pad = 80
  const w = Math.max(b.maxX - b.minX, 40)
  const h = Math.max(b.maxY - b.minY, 40)
  const z = clampZoom(Math.min((containerSize.width - 2 * pad) / w, (containerSize.height - 2 * pad) / h, 3))
  applyView(z, containerSize.width / 2 - ((b.minX + b.maxX) / 2) * z, containerSize.height / 2 - ((b.minY + b.maxY) / 2) * z)
},
```

4. **Mausrad:**

```ts
const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
  e.evt.preventDefault()
  const intent = interpretWheel(e.evt)
  const v = viewRef.current
  if (intent.kind === 'zoom') zoomAtPoint(v.zoom * intent.factor, stageRef.current?.getPointerPosition() ?? viewportCenter)
  else applyView(v.zoom, v.x - intent.dx, v.y - intent.dy)
}
```

5. **Neue Props:**
   - `onGestureChange?: (active: boolean) => void` im Interface `Props`.
   - `const gestureCbRef = useRef(onGestureChange); gestureCbRef.current = onGestureChange`.

6. **Leertaste und Esc:** Den bestehenden Esc-`useEffect` ersetzen.
   - State `const [spaceDown, setSpaceDown] = useState(false)` und `const spaceDownRef = useRef(false)`.
   - Ein `keydown`/`keyup`/`blur`-Effekt auf `window`.
   - Bei `INPUT`, `TEXTAREA`, `SELECT` oder `isContentEditable` als Ziel nichts tun.
   - `keydown` mit `e.code === 'Space'`: `preventDefault()`. Wenn noch nicht gesetzt, Ref und State auf `true`.
   - `keyup` mit Space sowie `window`-`blur`: auf `false`.
   - `keydown` mit `Escape`: `setMeasurePoints([])`, `setMeasureCursor(null)`, `setMeasureLines([])`, `setAreaStart(null)`, `setAreaCursor(null)`, `setMarqueeStart(null)`, `setMarqueeCursor(null)`.
   - Im Werkzeugwechsel-Effekt die Zeile `setMeasureLines([])` **entfernen**. Messlinien bleiben bis Esc stehen.

7. **Pointer-Gesten:**
   - Die Stage wird **nie** draggable: Prop `draggable` und `onDragEnd` der Stage entfernen.
   - `onMouseDown`, `onMouseMove` und `onMouseUp` werden ersetzt durch `onPointerDown={handleStagePointerDown}`, `onTouchMove={handleTouchMove}` und `onTouchEnd={handleTouchEnd}`.
   - `onClick` und `onTap` bleiben.
   - Neue Refs: `panRef` (`{ cx: number; cy: number; x: number; y: number; tapOnEmpty: boolean } | null`), `marqueeAdditiveRef = useRef(false)`, `const [panning, setPanning] = useState(false)`.

```ts
const cancelGestures = () => {
  setMarqueeStart(null); setMarqueeCursor(null); setAreaStart(null); setAreaCursor(null)
  if (panRef.current) { panRef.current = null; setPanning(false); gestureCbRef.current?.(false) }
}
const handleStagePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
  const stage = e.target.getStage()
  if (!stage) return
  const evt = e.evt
  if (evt.pointerType === 'touch' && !evt.isPrimary) { cancelGestures(); return } // zweiter Finger → Pinch
  const onEmpty = e.target === stage
  const pt = clientToCanvas(evt.clientX, evt.clientY)
  if (!pt) return
  const wantsPan =
    evt.button === 1 || spaceDownRef.current ||
    (onEmpty && tool === 'select' && !placement && evt.pointerType !== 'mouse')
  if (wantsPan) {
    evt.preventDefault()
    const v = viewRef.current
    panRef.current = { cx: evt.clientX, cy: evt.clientY, x: v.x, y: v.y, tapOnEmpty: onEmpty && tool === 'select' && !placement }
    setPanning(true)
    gestureCbRef.current?.(true)
    return
  }
  if (evt.button !== 0) return
  if (tool === 'measure') { /* bestehende Logik mit pt */ return }
  if (tool === 'area') { setAreaStart(pt); setAreaCursor(pt); return }
  if (placement) return
  if (tool === 'select' && onEmpty) {
    marqueeAdditiveRef.current = evt.shiftKey
    setMarqueeStart(pt)
    setMarqueeCursor(pt)
  }
}
```

   Bewegung und Ende laufen über `window`, damit Gesten auch außerhalb des Canvas sauber enden. Die Handler-Funktionen werden in jedem Render neu zugewiesen, der Listener selbst ist stabil:

```ts
const gestureMoveRef = useRef<(ev: PointerEvent) => void>(() => {})
const gestureEndRef = useRef<(ev: PointerEvent) => void>(() => {})
gestureMoveRef.current = (ev) => {
  const p = panRef.current
  if (p) { applyView(viewRef.current.zoom, p.x + ev.clientX - p.cx, p.y + ev.clientY - p.cy); return }
  const pt = clientToCanvas(ev.clientX, ev.clientY)
  if (!pt) return
  if (tool === 'measure' && measurePoints.length === 1) setMeasureCursor(pt)
  else if (tool === 'area' && areaStart) setAreaCursor(pt)
  else if (marqueeStart) setMarqueeCursor(pt)
}
gestureEndRef.current = (ev) => {
  if (ev.type === 'pointercancel') { cancelGestures(); return }
  const p = panRef.current
  if (p) {
    const moved = Math.hypot(ev.clientX - p.cx, ev.clientY - p.cy) > 4
    panRef.current = null
    setPanning(false)
    gestureCbRef.current?.(false)
    if (!moved && p.tapOnEmpty) onSelect(null) // Antippen auf freie Fläche (Touch) hebt Auswahl auf
    return
  }
  if (marqueeStart && marqueeCursor) {
    const additive = marqueeAdditiveRef.current
    /* rect wie bisher aus marqueeStart/marqueeCursor; State zurücksetzen */
    /* zu klein (<4 px): if (!additive) onSelect(null); return */
    /* sonst: hitIds mit worldBBox wie bisher; onSelectMany(hitIds, additive) */
    return
  }
  /* Bereich: bestehende Logik aus handleStageMouseUp (ab "if (tool !== 'area' …") unverändert */
}
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
```

   Die alten `handleStageMouseDown`, `handleStageMouseMove` und `handleStageMouseUp` löschen, ebenso alle `stage.draggable(...)`-Aufrufe.

8. **Pinch und Zwei-Finger-Verschieben:**

```ts
const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null)
const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
  const t = e.evt.touches
  const el = containerRef.current
  if (t.length !== 2 || !el) return
  e.evt.preventDefault()
  const r = el.getBoundingClientRect()
  const ax = t[0].clientX - r.left, ay = t[0].clientY - r.top
  const bx = t[1].clientX - r.left, by = t[1].clientY - r.top
  const cx = (ax + bx) / 2, cy = (ay + by) / 2
  const dist = Math.hypot(ax - bx, ay - by)
  if (!pinchRef.current) {
    cancelGestures()
    stageRef.current?.find((n: Konva.Node) => n.isDragging()).forEach((n) => n.stopDrag())
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
```

   **Safari:** ein `useEffect`, das auf `containerRef.current` `gesturestart` und `gesturechange` mit `(ev) => ev.preventDefault()` registriert und wieder entfernt. Sonst zoomt Safari die ganze Seite.

9. **Container:**
   - Die Klasse `touch-none` ergänzen.
   - Cursor-Klasse: `panning ? 'cursor-grabbing' : spaceDown ? 'cursor-grab' : placement || tool !== 'select' ? 'cursor-crosshair' : ''`.

10. **Objekte:**
    - `const zoomBucket = quantizeZoom(zoom)`.
    - Aktive Objekte bekommen `zoom={selectedIds.includes(id) ? zoom : zoomBucket}`, Ghost-Objekte `zoom={zoomBucket}` und `isGhost`.
    - Die Props `gridEnabled` und `gridSize` **nicht mehr** an `EventItemShape` übergeben.
    - `draggable={tool === 'select' && !placement && !spaceDown}`.

11. **Layer zusammenlegen** – genau drei `<Layer>`, in dieser Reihenfolge:
    - **Layer 1** (`listening={false}`), statisch:
      - Grundriss-Image (wenn `layers.walls && image`)
      - Strom-Image (wenn `layers.power`)
      - Rigging-`Group` (wenn `layers.rigging`)
      - Gitter-`Shape` (wenn `gridEnabledInternal`), siehe Code unten
    - **Layer 2** (Objekte):
      - zuerst das Geisterbild als `<Group listening={false} opacity={0.3}>` mit den Ghost-Items (wenn vorhanden)
      - danach die aktiven Objekte
    - **Layer 3** (`listening={false}`), Overlay:
      - Messlinien (nur bei `tool === 'measure'`)
      - Bereichs-Vorschau
      - Rahmenauswahl
      - am Ende **immer** `<Group ref={guideGroupRef} />` mit `const guideGroupRef = useRef<Konva.Group>(null)`. Die Group bleibt leer, P7 füllt sie.

    Gitter-Shape (ersetzt die vielen `<Line>`):

```tsx
<Shape
  listening={false}
  opacity={0.35}
  stroke="#94a3b8"
  strokeWidth={1}
  strokeScaleEnabled={false}
  perfectDrawEnabled={false}
  sceneFunc={(ctx, shape) => {
    // Bei kleinem Zoom nur jede n-te Linie (mind. 6 Bildschirm-px Abstand)
    const step = gridSizeInternal * Math.max(1, Math.ceil(6 / (gridSizeInternal * zoomBucket)))
    ctx.beginPath()
    for (let x = 0; x <= STAGE_WIDTH; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, STAGE_HEIGHT) }
    for (let y = 0; y <= STAGE_HEIGHT; y += step) { ctx.moveTo(0, y); ctx.lineTo(STAGE_WIDTH, y) }
    ctx.strokeShape(shape)
  }}
/>
```

12. **Memo:** `export default memo(CanvasEditor)`.

**Akzeptanzkriterien:**
- Trackpad mit zwei Fingern verschiebt die Ansicht. Pinch zoomt weich am Cursor. Ein Mausrad zoomt.
- Leertaste+Ziehen und die mittlere Maustaste verschieben in jedem Werkzeug.
- Ziehen auf freier Fläche (Maus) zieht ein Auswahlrechteck auf. Shift erweitert die Auswahl. Ein Klick ins Leere hebt die Auswahl auf.
- Auf dem iPad: ein Finger verschiebt, zwei Finger zoomen, Messen und Bereich funktionieren.
- Lässt man außerhalb des Plans los, bleibt kein Rechteck hängen.
- Es gibt keine Konva-Warnung „more than 5 layers“.

**Test:**
- `npx tsc -b`: nach dieser Welle **null Fehler im ganzen Projekt**.
- `npm run lint` (≤ 14).
- `npm run build`.

**Erwartete Fremdfehler:** keine, sobald P4 und P5 derselben Welle fertig sind.

---

### P7 – Ziehen & Einrasten (Integration, nach P6)

**Ziel:**
- Die Mehrfachauswahl läuft live mit.
- Einrasten an Objekten und am Raster geschieht während des Ziehens.
- Hilfslinien und Abstände in Metern werden angezeigt.
- Mit ⌘/Strg ist das Einrasten aus, mit Shift die Achse gesperrt.
- Es entstehen keine leeren Undo-Schritte.

**Schritte** (nur `src/components/CanvasEditor.tsx`):

1. **Importe** aus `../utils/geometry`: `unionBox, translateBox, worldBBox, type Box`. Aus `../utils/snapping`: `snapBoxToTargets, snapBoxToGrid, nearestGaps, SNAP_THRESHOLD_SCREEN_PX, type DragMods, type Guide, type GapMeasure`.

2. **Kontext-Refs:**
   - `dragCtxRef` um `visibleItemIds` erweitern.
   - Neu: `const snapCtxRef = useRef({ gridEnabled: gridEnabledInternal, gridSize: gridSizeInternal })`, in jedem Render aktualisieren.
   - Neu: `const dragRef = useRef<DragSession | null>(null)` mit:

```ts
interface DragSession {
  id: string
  start: { x: number; y: number }
  others: { id: string; node: Konva.Node; start: { x: number; y: number } }[]
  movingBox: Box
  targets: Box[]
}
```

3. **Overlay-Zeichnung** (imperativ, kein React-State pro Frame):

```ts
const clearOverlay = () => {
  const g = guideGroupRef.current
  if (!g) return
  g.destroyChildren()
  g.getLayer()?.batchDraw()
}
const drawOverlay = (guides: Guide[], gaps: GapMeasure[]) => {
  const g = guideGroupRef.current
  if (!g) return
  g.destroyChildren()
  const z = viewRef.current.zoom
  for (const gd of guides) {
    const points = gd.orientation === 'v' ? [gd.pos, gd.from, gd.pos, gd.to] : [gd.from, gd.pos, gd.to, gd.pos]
    g.add(new Konva.Line({ points, stroke: '#ec4899', strokeWidth: 1 / z, dash: [4 / z, 3 / z], listening: false }))
  }
  for (const m of gaps) {
    g.add(new Konva.Line({ points: [m.x1, m.y1, m.x2, m.y2], stroke: '#0ea5e9', strokeWidth: 1 / z, listening: false }))
    g.add(new Konva.Text({
      x: (m.x1 + m.x2) / 2 + 4 / z, y: (m.y1 + m.y2) / 2 + 4 / z,
      text: `${(m.distancePx / pixelsPerMeter).toFixed(2).replace('.', ',')} m`,
      fontSize: 11 / z, fontStyle: 'bold', fill: '#0369a1', listening: false,
    }))
  }
  g.getLayer()?.batchDraw()
}
```

4. **Handler**, alle als `useCallback` mit Abhängigkeiten nur auf stabile Store-Funktionen. Werte kommen aus den Refs.

```ts
const handleItemDragStart = useCallback((id: string) => {
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
  const targets = vis
    .filter((v) => !movingIds.includes(v) && cur[v]?.phaseData[cp])
    .map((v) => worldBBox(cur[v], cur[v].phaseData[cp], pixelsPerMeter))
  dragRef.current = { id, start: { x: pd.x, y: pd.y }, others, movingBox, targets }
  gestureCbRef.current?.(true)
}, [pixelsPerMeter])

const handleItemDragMove = useCallback((id: string, x: number, y: number, mods: DragMods) => {
  const s = dragRef.current
  if (!s || s.id !== id) return { x, y }
  let dx = x - s.start.x
  let dy = y - s.start.y
  let lockX = false
  let lockY = false
  if (mods.axisLock) {
    if (Math.abs(dx) >= Math.abs(dy)) { dy = 0; lockY = true } else { dx = 0; lockX = true }
  }
  let guides: Guide[] = []
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
}, [pixelsPerMeter])
```

   `handleItemDragEnd` ersetzen:

```ts
const handleItemDragEnd = useCallback((id: string, x: number, y: number) => {
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
}, [updateItemTransform, moveItemsBy])
```

   Hinweis: `drawOverlay` und `clearOverlay` sind normale Funktionen im Komponentenkörper. Sie lesen nur Refs und `pixelsPerMeter`. Damit `oxlint` und `tsc` zufrieden sind, beide **oberhalb** der `useCallback`s definieren. Meldet der Linter `exhaustive-deps`, beide mit `useCallback(…, [pixelsPerMeter])` umschließen und in die Dependency-Arrays aufnehmen.

5. An aktive `EventItemShape` zusätzlich `onDragStart={handleItemDragStart}` und `onDragMove={handleItemDragMove}` übergeben.

**Akzeptanzkriterien:**
- Bei 3 ausgewählten Tischen bewegen sich alle während des Ziehens.
- Nahe der Kante oder Mitte eines anderen Objekts rastet die Auswahl ein, und eine pinke Hilfslinie erscheint.
- Blaue Abstandslinien mit „x,xx m“ zum nächsten Nachbarn erscheinen, bis 10 m.
- Mit Raster bewegt sich das Objekt sichtbar in Rasterschritten und springt beim Loslassen nicht.
- ⌘/Strg gedrückt: kein Einrasten.
- Shift gedrückt: nur waagrecht oder senkrecht.
- Ein Klick mit Mini-Zittern erzeugt keinen Undo-Schritt.
- Gesperrte Objekte der Auswahl bleiben stehen.

**Test:**
- `npx tsc -b` (0 Fehler), `npm run lint` (≤ 14), `npm run build`.

**Erwartete Fremdfehler:** keine.

---

## 4. Reihenfolge

| Welle | Pakete (parallel) | Voraussetzung | Ergebnis nach der Welle |
|---|---|---|---|
| 1 | **P1** Fundament-Utils, **P8** Autosave | – | `tsc` grün |
| 2 | **P2** Store, **P3** Objekt-Shape | P1 | `tsc` nur mit Fehlern in `CanvasEditor.tsx` (`gridEnabled`/`gridSize`-Props). Das ist erlaubt. |
| 3 | **P4** Leisten & Panels, **P5** Editor-Steuerung, **P6** Canvas-Ansicht | P2, P3 | `tsc` komplett grün, `npm run build` ok |
| 4 | **P7** Ziehen & Einrasten | P6 | `tsc` grün, Lint ≤ 14, Build ok |

**Nach jeder Welle macht der Orchestrator:**
1. `npx tsc -b`, `npm run lint` und ab Welle 3 `npm run build` ausführen.
2. Bei Fehlern **ausschließlich** in Dateien, die ein Paket der Welle besitzt: das zuständige Paket mit der Fehlermeldung erneut starten.
3. Commit pro Welle, z. B. „2D-Editor: Welle 2 (Store, Objekt-Shape)“.

**Manuelle Abnahme nach Welle 4** (Mensch; auf echten Geräten mit `npm run dev`):

- **MacBook-Trackpad (Chrome und Safari):**
  - Zwei Finger verschieben, Pinch zoomt am Cursor.
  - In Safari zoomt die Seite nicht mit.
  - Ob Safari Pinch als `ctrl+wheel` liefert, hier prüfen.
- **Maus (Windows/Chrome):**
  - Mausrad zoomt, Leertaste+Ziehen und Mitteltaste verschieben.
  - Strg+Y wiederholt.
  - Die Shortcut-Hilfe zeigt „Strg+“.
- **iPad (Safari):**
  - Ein Finger verschiebt, zwei Finger zoomen.
  - Antippen wählt aus. Ein Objekt mit dem Finger ziehen verrutscht nicht ungewollt.
  - Messen und Bereich funktionieren.
  - Drehgriff und Visiova-Griff sind gut treffbar.
- **Drehen:**
  - Bar am Griff drehen: kein Sprung, die Mitte bleibt.
  - Rastet bei 90° ein, Shift ergibt 15°-Schritte.
  - R auf drei Objekte dreht jedes um seine Mitte.
- **3D-Ansicht:** Nach dem Drehen per R stimmen Position und Drehung in 3D mit 2D überein.
- **Mehrfachauswahl:**
  - Rahmen aufziehen, Gruppe ziehen: alle laufen live mit.
  - Ausrichten links, Verteilen ↔.
  - ⌘D, ⌘C, Phase wechseln, ⌘V.
- **Einrasten:**
  - Tisch an eine Bar heranziehen: Hilfslinie und Abstand in m erscheinen.
  - Mit aktivem Raster in 0,5 m kein Sprung beim Loslassen.
- **Bibliothek:** Stehtisch ziehen, er landet mittig unter dem Zeiger. Über dem Dock loslassen legt nichts an. Esc bricht ab.
- **Undo:**
  - Phase löschen, ⌘Z bringt sie zurück.
  - Pfeiltaste fünfmal schnell, ⌘Z: ein Schritt.
- **Autosave:** Ändern und sofort zur Projektübersicht wechseln, erneut öffnen: Die Änderung ist da.
- **Altes Projekt** (vor dem Umbau gespeichert): Alle Objekte stehen an derselben Stelle wie vorher.

**Bewusst für später (eigene Pakete):**
- Stuhlreihen-Block bearbeitbar machen, mit getrennten Abständen nach VStättV.
- Hinweise im Auswahl-Modus und Leerzustand.
- Auswahl im Undo mitspeichern.
- Klick-Durchwahl bei überlappenden Objekten (Alt-Klick).
- Ebenen-Reihenfolge (nach vorn/hinten).
- Vitest für `geometry.ts`, `snapping.ts` und `viewport.ts`.
