import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { findVoidViolation, type Level } from '../utils/levels'
import type { EventItem, EventState, ForexPanel, ItemType, ItemWithId, NivtecData, Phase } from '../types'
import { ITEM_LIBRARY } from '../data/itemLibrary'
import { sortPhases } from '../utils/phaseDiff'
import { sanitizeForexPanels } from '../utils/forex'
import { hasDefaultVisiovaLabel, visiovaLabel } from '../utils/visiova'
import { hasDefaultPipeDrapeLabel, pipeDrapeLabel } from '../utils/pipeDrape'
import { FOAM_DEFAULT_TEXT, foamLettersLabel, foamLettersWidth, hasDefaultFoamLabel } from '../utils/foamLetters'
import { normalizeDeg, positionForRotation, unionBox, worldBBox } from '../utils/geometry'
import { DEFAULT_PIXELS_PER_METER } from '../utils/scale'

const PHASE_1 = uuid()
const MAX_HISTORY = 50
const PPM = DEFAULT_PIXELS_PER_METER

/** Letzter Pfeiltasten-Schub: gleiche Objekte innerhalb einer Sekunde ergeben EINEN Undo-Schritt. */
let lastNudge = { key: '', at: 0 }

/** Rotierende Standardfarben für neu gezogene Bereiche/Stände, frei überschreibbar. */
export const AREA_COLORS = [
  '#10b981', // grün
  '#3b82f6', // blau
  '#f59e0b', // orange
  '#ec4899', // pink
  '#8b5cf6', // violett
  '#ef4444', // rot
  '#06b6d4', // türkis
  '#84cc16', // limette
]

/** Allgemeine Farbauswahl für alle übrigen Objekte (Molton/Pipe & Drape, Möbel, Technik …). */
export const OBJECT_COLORS = [
  '#111827', // schwarz (Molton)
  '#6b7280', // grau
  '#f9fafb', // weiß
  '#7f1d1d', // bordeaux
  '#dc2626', // rot
  '#1d4ed8', // blau
  '#059669', // grün
  '#7c3aed', // violett
  '#b45309', // holz
]

/** Vordefinierte Farben für NivTec-Gruppen. */
export const NIVTEC_COLORS = [
  '#111827', // schwarz
  '#6b7280', // grau
  '#dc2626', // rot
  '#059669', // grün
  '#7c3aed', // violett
]

interface HistorySnapshot {
  items: Record<string, EventItem>
  itemOrder: string[]
  /** Nur beim Wiederherstellen einer Version gesetzt: dann macht Undo auch Phasen/Name rückgängig. */
  project?: Pick<EventState, 'eventName' | 'currentPhaseId' | 'phases'>
}

/** Gegenstück zum Undo/Redo-Ziel erzeugen; Phasen/Name nur mitsichern, wenn das Ziel sie ersetzt. */
function counterSnapshot(state: EventState, target: HistorySnapshot): HistorySnapshot {
  const snap: HistorySnapshot = { items: state.items, itemOrder: state.itemOrder }
  if (target.project) {
    snap.project = { eventName: state.eventName, currentPhaseId: state.currentPhaseId, phases: state.phases }
  }
  return snap
}

interface Store extends EventState {
  /** Aktuell bearbeitetes Geschoss (nur Oberfläche, wird nicht im Projekt gespeichert). */
  currentLevel: Level
  setCurrentLevel: (level: Level) => void
  /** Kurzer Hinweistext der Oberfläche (z. B. Platzieren im Luftraum abgelehnt); `seq` zählt hoch. */
  notice: { text: string; seq: number } | null
  /** Zählt bei jeder abgelehnten Änderung hoch, damit die Zeichenfläche Objekte neu aufbaut (zurück an ihren Platz). */
  revision: number
  historyPast: HistorySnapshot[]
  historyFuture: HistorySnapshot[]

  // Grid/Snap state (Phase A)
  gridEnabled: boolean
  gridSize: number
  searchQuery: string
  setGridEnabled: (enabled: boolean) => void
  setGridSize: (size: number) => void
  setSearchQuery: (q: string) => void
  filteredItems: () => ItemWithId[]

  setEventName: (name: string) => void

  // Phases
  addPhase: (name: string, empty?: boolean) => void
  removePhase: (phaseId: string) => void
  renamePhase: (phaseId: string, name: string) => void
  setPhaseNote: (phaseId: string, note: string) => void
  setCurrentPhase: (phaseId: string) => void
  reorderPhases: (phases: Phase[]) => void

  // Items
  addItem: (type: ItemType, x: number, y: number) => string
  addItemsBatch: (items: EventItem[]) => void
  removeItem: (itemId: string) => void
  updateItemTransform: (itemId: string, x: number, y: number, rotation?: number) => void
  rotateItem: (itemId: string, deltaDeg: number) => void
  /** Setzt die Rotation auf einen festen Wert in Grad (0-359). */
  setItemRotation: (itemId: string, deg: number) => void
  toggleItemVisible: (itemId: string, visible?: boolean) => void
  renameItem: (itemId: string, label: string) => void
  setItemNote: (itemId: string, note: string) => void
  resizeItem: (itemId: string, width: number, height: number) => void
  /** Länge (Breite in m) ändern, Tiefe bleibt; Standard-Bezeichnung von Pipe & Drape zieht mit. */
  setItemLength: (itemId: string, length: number) => void
  setItemColor: (itemId: string, color: string | null) => void
  /** Visiova-Rahmen: Druck (Data-URL) setzen bzw. mit null entfernen. */
  setItemPrint: (itemId: string, image: string | null) => void
  /**
   * Visiova-Rahmen auf eine Reihe aus mehreren Rahmen setzen (bleibt EIN Objekt, das sich als
   * Ganzes verschieben/drehen lässt; ein Druck läuft über alle Rahmen). Ein Undo-Schritt.
   */
  setVisiovaRun: (itemId: string, widths: number[]) => void
  /** Mehrere Drucke auf einmal setzen (ein Undo-Schritt), z. B. ein Bild über mehrere Rahmen verteilt. */
  setItemPrints: (prints: Record<string, string>) => void
  /** NivTec-Bühne: Forex-Blenden ersetzen; Drucke entfernter Blenden fallen weg, neue Drucke werden übernommen. */
  setForex: (itemId: string, panels: ForexPanel[], prints?: Record<string, string>) => void
  /** Visiova-Rahmen: Rahmenhöhe in Metern. */
  setFrameHeight: (itemId: string, heightM: number) => void
  /** Styropor-Buchstaben: Text setzen; Breite (und Standard-Bezeichnung) passen sich an. Ein Undo-Schritt. */
  setLetterText: (itemId: string, text: string) => void
  /** Sperrt/entsperrt ein Objekt gegen Verschieben und Drehen (unabhängig von der Phase). */
  toggleItemLocked: (itemId: string, locked?: boolean) => void

  // Mehrfachauswahl: dieselben Aktionen wie oben, aber für mehrere Objekte als EIN Undo-Schritt.
  removeItems: (itemIds: string[]) => void
  toggleItemsVisible: (itemIds: string[], visible?: boolean) => void
  moveItemsBy: (itemIds: string[], dx: number, dy: number) => void
  /** Dreht jedes Objekt um seine eigene Mitte (gesperrte und nicht sichtbare Objekte bleiben unberührt). */
  rotateItems: (itemIds: string[], deltaDeg: number) => void
  /** Dupliziert alle Objekte in EINEM Schritt; gibt die neuen IDs in derselben Reihenfolge zurück. */
  duplicateItems: (itemIds: string[], offsetPx?: number) => string[]
  /** Pfeiltasten-Verschieben in Pixeln; schnelle Wiederholungen ergeben EINEN Undo-Schritt. */
  nudgeItems: (itemIds: string[], dx: number, dy: number) => void
  /** Objekte aus einer anderen Phase einfügen (Kopien, versetzt um offsetPx); gibt die neuen IDs zurück. */
  pasteItems: (sources: EventItem[], sourcePhaseId: string, offsetPx: number) => string[]
  /** Sperrt bzw. entsperrt alle genannten Objekte (phasenunabhängig) in einem Schritt. */
  setItemsLocked: (itemIds: string[], locked: boolean) => void
  /** Richtet die sichtbaren Objekte aneinander aus; gesperrte dienen nur als Bezug. */
  alignItems: (itemIds: string[], mode: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom') => void
  /** Verteilt mindestens drei sichtbare Objekte mit gleichem Abstand; Erste und Letzte bleiben stehen. */
  distributeItems: (itemIds: string[], axis: 'horizontal' | 'vertical') => void
  /**
   * Objekte so, wie sie in der aktuellen Phase sind, in alle folgenden Phasen übernehmen —
   * je Phase als eigenständige Kopie, damit spätere Änderungen die anderen Phasen nicht berühren.
   */
  copyItemsToLaterPhases: (itemIds: string[]) => void

  // Bereiche (z.B. Messestände): frei gezogenes Rechteck mit individueller Größe
  addArea: (x: number, y: number, width: number, height: number, label?: string) => string
  /** Freie Text-Beschriftung an einer Stelle im Plan (z. B. "Einlass hier"). */
  addTextLabel: (x: number, y: number, text: string) => string
  /** Eigenes Objekt mit frei gewähltem Namen, Maßen (m), Form und Farbe. */
  addCustomItem: (x: number, y: number, spec: CustomItemSpec) => string
  duplicateItem: (itemId: string, offsetX?: number, offsetY?: number) => string | null

  /** Stuhlreihen als EIN Objekt (Gruppe), damit sie gemeinsam verschoben werden können. */
  addChairRowGroup: (x: number, y: number, rows: number, cols: number, spacingM?: number, rowSpacingM?: number) => string

  // Layers
  toggleLayer: (layer: keyof EventState['layers']) => void

  // NivTec import
  importNivtec: (data: NivtecData, x: number, y: number) => void

  // Undo/Redo (wirkt auf Objekt-Änderungen: platzieren, verschieben, löschen, umbenennen)
  undo: () => void
  /** Gespeicherte Version wiederherstellen — als EIN Undo-Schritt (inkl. Phasen und Name). */
  restoreVersion: (data: Pick<EventState, 'eventName' | 'currentPhaseId' | 'phases' | 'items' | 'itemOrder'>) => void
  redo: () => void

  // Projekte: kompletten Zustand aus einem gespeicherten Projekt laden bzw. für die Speicherung exportieren
  importProject: (data: Pick<EventState, 'eventName' | 'currentPhaseId' | 'phases' | 'items' | 'itemOrder' | 'layers'>) => void
  hydrate: (data: Pick<EventState, 'eventName' | 'currentPhaseId' | 'phases' | 'items' | 'itemOrder' | 'layers'>) => void
  getSnapshot: () => Pick<EventState, 'eventName' | 'currentPhaseId' | 'phases' | 'items' | 'itemOrder' | 'layers'>
}

export interface CustomItemSpec {
  label: string
  /** Breite bzw. Durchmesser in Metern */
  width: number
  height: number
  shape: 'rect' | 'round'
  color: string
}

/**
 * Eigenschaften (Name, Größe, Farbe, Notiz) nur in der aktuellen Phase ändern.
 * Ist das Objekt auch in anderen Phasen sichtbar (z. B. nach "Phase übernehmen"), wird es
 * aufgeteilt: Die anderen Phasen behalten eine Kopie mit den alten Eigenschaften, das
 * Objekt selbst (gleiche ID, Auswahl bleibt erhalten) gilt danach nur noch für diese Phase.
 */
/** Stuhlabstand in der Reihe und Reihenabstand (aus den Bestuhlungsplänen der Stadthalle, gemessen). */
export const CHAIR_PITCH_M = 0.5
export const CHAIR_ROW_PITCH_M = 0.85

/** Stuhlreihen aus älteren Ständen (Abstand 0,55 m in beide Richtungen): auf die realistischen Abstände bringen. */
function normalizeChairGroups(items: Record<string, EventItem>): Record<string, EventItem> {
  let changed: Record<string, EventItem> | null = null
  for (const [id, item] of Object.entries(items)) {
    const g = item.grid
    if (item.type !== 'chair_row_group' || !g || g.rowSpacingM !== undefined) continue
    changed ??= { ...items }
    changed[id] = {
      ...item,
      width: g.cols * CHAIR_PITCH_M,
      height: g.rows * CHAIR_ROW_PITCH_M,
      grid: { ...g, spacingM: CHAIR_PITCH_M, rowSpacingM: CHAIR_ROW_PITCH_M },
    }
  }
  return changed ?? items
}

/** Styropor-Schriftzüge aus älteren Ständen: Breite an die aktuelle Buchstabenbreite anpassen. */
function normalizeFoamLetters(items: Record<string, EventItem>): Record<string, EventItem> {
  let changed: Record<string, EventItem> | null = null
  for (const [id, item] of Object.entries(items)) {
    if (item.type !== 'foam_letters') continue
    const width = foamLettersWidth(item.letterText ?? FOAM_DEFAULT_TEXT)
    if (Math.abs(item.width - width) < 1e-6) continue
    changed ??= { ...items }
    changed[id] = { ...item, width }
  }
  return changed ?? items
}

function patchItemInCurrentPhase(
  state: EventState,
  itemId: string,
  patch: Partial<Pick<EventItem, 'label' | 'note' | 'width' | 'height' | 'color' | 'frameHeight' | 'printImage' | 'nivtecData' | 'forexPrints' | 'visiovaFrames' | 'letterText'>>,
): Pick<EventState, 'items' | 'itemOrder'> {
  const item = state.items[itemId]
  const current = item.phaseData[state.currentPhaseId]
  const sharedElsewhere = Object.entries(item.phaseData).some(
    ([phaseId, pd]) => phaseId !== state.currentPhaseId && pd.visible,
  )
  if (!current || !sharedElsewhere) {
    return { items: { ...state.items, [itemId]: { ...item, ...patch } }, itemOrder: state.itemOrder }
  }
  const otherPhaseData = { ...item.phaseData }
  delete otherPhaseData[state.currentPhaseId]
  const copyId = uuid()
  const idx = state.itemOrder.indexOf(itemId)
  const itemOrder = [...state.itemOrder]
  itemOrder.splice(idx < 0 ? itemOrder.length : idx + 1, 0, copyId)
  return {
    items: {
      ...state.items,
      [copyId]: { ...item, id: copyId, phaseData: otherPhaseData },
      [itemId]: { ...item, ...patch, phaseData: { [state.currentPhaseId]: current } },
    },
    itemOrder,
  }
}

export const useEventStore = create<Store>((rawSet, get) => {
  /**
   * Alle Änderungen laufen hier durch: Neue Objekte bekommen das aktuelle Geschoss, und Änderungen,
   * die ein OG-Objekt in den Luftraum (kein Boden) setzen, werden abgelehnt. Undo/Redo, Laden und
   * Phasenwechsel ändern auch `phases`/`historyPast` und umgehen die Prüfung.
   */
  const set = ((partial: unknown, replace?: boolean) => {
    const prev = get()
    const next = (typeof partial === 'function' ? (partial as (s: Store) => unknown)(prev) : partial) as Partial<Store> | null
    if (!next || !next.items || next.items === prev.items || 'phases' in next || 'historyPast' in next) {
      rawSet(next as never, replace as never)
      return
    }
    let items = next.items
    if (prev.currentLevel === 'og') {
      const stamped: Record<string, EventItem> = { ...items }
      for (const [id, item] of Object.entries(items)) {
        if (!prev.items[id] && item.level === undefined) stamped[id] = { ...item, level: 'og' }
      }
      items = stamped
    }
    const hit = findVoidViolation(prev.items, items)
    if (hit) {
      const last = prev.historyPast[prev.historyPast.length - 1]
      rawSet({
        notice: { text: `„${hit.item.label}“ kann nicht im Luftraum (${hit.voidName}) stehen, dort ist im Obergeschoss kein Boden.`, seq: (prev.notice?.seq ?? 0) + 1 },
        revision: prev.revision + 1,
        // pushHistory lief schon: den leeren Schritt wieder entfernen
        ...(last && last.items === prev.items ? { historyPast: prev.historyPast.slice(0, -1) } : {}),
      })
      return
    }
    rawSet({ ...next, items } as never, replace as never)
  }) as typeof rawSet

  /** Snapshot des Objekt-Zustands vor einer mutierenden Aktion auf den Undo-Stack legen. */
  const pushHistory = () => {
    lastNudge = { key: '', at: 0 }
    const { items, itemOrder, historyPast } = get()
    const past = [...historyPast, { items, itemOrder }].slice(-MAX_HISTORY)
    set({ historyPast: past, historyFuture: [] })
  }

  /** Wie pushHistory, sichert aber zusätzlich Phasen/Name/aktuelle Phase (für Phasen-Aktionen). */
  const pushProjectHistory = () => {
    lastNudge = { key: '', at: 0 }
    const { items, itemOrder, eventName, currentPhaseId, phases, historyPast } = get()
    const snap: HistorySnapshot = { items, itemOrder, project: { eventName, currentPhaseId, phases } }
    set({ historyPast: [...historyPast, snap].slice(-MAX_HISTORY), historyFuture: [] })
  }

  return {
    eventName: 'Neues Event',
    currentLevel: 'eg',
    setCurrentLevel: (level) => set({ currentLevel: level }),
    notice: null,
    revision: 0,
    currentPhaseId: PHASE_1,
    phases: [{ id: PHASE_1, name: 'Phase 1', order: 0 }],
    items: {},
    itemOrder: [],
    layers: { walls: true, rigging: false, power: false, simplified: false },
    historyPast: [],
    historyFuture: [],
    gridEnabled: false,
    gridSize: 20,
    searchQuery: '',

    setEventName: (name) => set({ eventName: name }),

    setGridEnabled: (enabled) => set({ gridEnabled: enabled }),

    setGridSize: (size) => set({ gridSize: size }),

    setSearchQuery: (q) => set({ searchQuery: q }),

    filteredItems: () => {
      const state = get()
      return state.itemOrder
        .map((id) => state.items[id])
        .filter((item) =>
          item.label?.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
          item.note?.toLowerCase().includes(state.searchQuery.toLowerCase())
        )
        .map((item) => ({ ...item, id: item.id }))
    },

    addPhase: (name, empty) => {
      pushProjectHistory()
      set((state) => {
        const newPhase: Phase = { id: uuid(), name, order: state.phases.length }
        // Standardmäßig den aktuell sichtbaren Aufbau als Startpunkt übernehmen; bei `empty`
        // beginnt die neue Phase stattdessen komplett leer (kein Objekt darin sichtbar).
        const items = { ...state.items }
        for (const id of Object.keys(items)) {
          const item = items[id]
          const prev = empty ? undefined : item.phaseData[state.currentPhaseId]
          items[id] = {
            ...item,
            phaseData: {
              ...item.phaseData,
              [newPhase.id]: prev ? { ...prev } : { x: 0, y: 0, rotation: 0, visible: false },
            },
          }
        }
        return { phases: [...state.phases, newPhase], items, currentPhaseId: newPhase.id }
      })
    },

    removePhase: (phaseId) => {
      const existing = get().phases
      // Letzte Phase bleibt bestehen; unbekannte ID: kein Undo-Eintrag
      if (existing.length <= 1 || !existing.some((p) => p.id === phaseId)) return
      pushProjectHistory()
      set((state) => {
        const phases = state.phases.filter((p) => p.id !== phaseId)
        const currentPhaseId = state.currentPhaseId === phaseId ? phases[0].id : state.currentPhaseId
        return { phases, currentPhaseId }
      })
    },

    renamePhase: (phaseId, name) =>
      set((state) => ({
        phases: state.phases.map((p) => (p.id === phaseId ? { ...p, name } : p)),
      })),

    setPhaseNote: (phaseId, note) =>
      set((state) => ({
        phases: state.phases.map((p) => (p.id === phaseId ? { ...p, note } : p)),
      })),

    setCurrentPhase: (phaseId) => set({ currentPhaseId: phaseId }),

    reorderPhases: (phases) => set({ phases }),

    addItem: (type, x, y) => {
      const template = ITEM_LIBRARY.find((t) => t.type === type)
      const id = uuid()
      const { currentPhaseId, phases } = get()
      const phaseData: EventItem['phaseData'] = {}
      for (const p of phases) {
        phaseData[p.id] = { x, y, rotation: 0, visible: p.id === currentPhaseId }
      }
      const item: EventItem = {
        id,
        type,
        label: template?.label ?? type,
        width: template?.width ?? 1,
        height: template?.height ?? 1,
        seats: template?.seats,
        phaseData,
        ...(type === 'foam_letters' ? { letterText: FOAM_DEFAULT_TEXT } : {}),
      }
      pushHistory()
      set((state) => ({
        items: { ...state.items, [id]: item },
        itemOrder: [...state.itemOrder, id],
      }))
      return id
    },

    addItemsBatch: (items) => {
      pushHistory()
      set((state) => ({
        items: { ...state.items, ...Object.fromEntries(items.map((i) => [i.id, i])) },
        itemOrder: [...state.itemOrder, ...items.map((i) => i.id)],
      }))
    },

    // Löscht das Objekt nur aus der aktuellen Phase (entfernt dessen phaseData-Eintrag dort).
    // Existiert es danach in keiner Phase mehr, wird es komplett entfernt — so bleibt es in
    // anderen Phasen (z.B. nach "Phase übernehmen") unangetastet.
    removeItem: (itemId) => {
      pushHistory()
      set((state) => {
        const item = state.items[itemId]
        if (!item) return state
        const phaseData = { ...item.phaseData }
        delete phaseData[state.currentPhaseId]
        if (Object.keys(phaseData).length === 0) {
          const items = { ...state.items }
          delete items[itemId]
          return { items, itemOrder: state.itemOrder.filter((id) => id !== itemId) }
        }
        return { items: { ...state.items, [itemId]: { ...item, phaseData } } }
      })
    },

    updateItemTransform: (itemId, x, y, rotation) => {
      const { items, currentPhaseId } = get()
      const cur = items[itemId]?.phaseData[currentPhaseId]
      // Objekt fehlt oder nichts ändert sich: kein Undo-Schritt
      if (!items[itemId] || (cur && cur.x === x && cur.y === y && (rotation === undefined || rotation === cur.rotation))) return
      pushHistory()
      set((state) => {
        const item = state.items[itemId]
        if (!item) return state
        const current = item.phaseData[state.currentPhaseId] ?? { x, y, rotation: 0, visible: true }
        return {
          items: {
            ...state.items,
            [itemId]: {
              ...item,
              phaseData: {
                ...item.phaseData,
                [state.currentPhaseId]: {
                  ...current,
                  x,
                  y,
                  rotation: rotation ?? current.rotation,
                },
              },
            },
          },
        }
      })
    },

    rotateItem: (itemId, deltaDeg) => {
      const { items, currentPhaseId } = get()
      // Kein Objekt, keine Phasendaten oder volle Umdrehung: kein Undo-Schritt
      if (!items[itemId]?.phaseData[currentPhaseId] || deltaDeg % 360 === 0) return
      pushHistory()
      set((state) => {
        const item = state.items[itemId]
        const current = item.phaseData[state.currentPhaseId]
        const rotation = normalizeDeg(current.rotation + deltaDeg)
        // Um die MITTE drehen: x/y werden so mitgeführt, dass die Mitte stehen bleibt
        const pos = positionForRotation(item, current, rotation, PPM)
        return {
          items: {
            ...state.items,
            [itemId]: {
              ...item,
              phaseData: {
                ...item.phaseData,
                [state.currentPhaseId]: { ...current, rotation, x: pos.x, y: pos.y },
              },
            },
          },
        }
      })
    },

    setItemRotation: (itemId, deg) => {
      const normalized = normalizeDeg(deg)
      set((state) => {
        const item = state.items[itemId]
        if (!item) return state
        const current = item.phaseData[state.currentPhaseId]
        if (!current) return state
        // Nur Undo-Schritt, wenn sich die Rotation tatsächlich ändert
        if (current.rotation === normalized) return state
        pushHistory()
        // Um die MITTE drehen: x/y werden so mitgeführt, dass die Mitte stehen bleibt
        const pos = positionForRotation(item, current, normalized, PPM)
        return {
          items: {
            ...state.items,
            [itemId]: {
              ...item,
              phaseData: {
                ...item.phaseData,
                [state.currentPhaseId]: { ...current, rotation: normalized, x: pos.x, y: pos.y },
              },
            },
          },
        }
      })
    },

    toggleItemVisible: (itemId, visible) => {
      pushHistory()
      set((state) => {
        const item = state.items[itemId]
        if (!item) return state
        const current = item.phaseData[state.currentPhaseId]
        if (!current) return state
        return {
          items: {
            ...state.items,
            [itemId]: {
              ...item,
              phaseData: {
                ...item.phaseData,
                [state.currentPhaseId]: { ...current, visible: visible ?? !current.visible },
              },
            },
          },
        }
      })
    },

    removeItems: (itemIds) => {
      pushHistory()
      set((state) => {
        const items = { ...state.items }
        let itemOrder = state.itemOrder
        for (const itemId of itemIds) {
          const item = items[itemId]
          if (!item) continue
          const phaseData = { ...item.phaseData }
          delete phaseData[state.currentPhaseId]
          if (Object.keys(phaseData).length === 0) {
            delete items[itemId]
            itemOrder = itemOrder.filter((id) => id !== itemId)
          } else {
            items[itemId] = { ...item, phaseData }
          }
        }
        return { items, itemOrder }
      })
    },

    toggleItemsVisible: (itemIds, visible) => {
      pushHistory()
      set((state) => {
        const items = { ...state.items }
        for (const itemId of itemIds) {
          const item = items[itemId]
          const current = item?.phaseData[state.currentPhaseId]
          if (!item || !current) continue
          items[itemId] = {
            ...item,
            phaseData: { ...item.phaseData, [state.currentPhaseId]: { ...current, visible: visible ?? !current.visible } },
          }
        }
        return { items }
      })
    },

    moveItemsBy: (itemIds, dx, dy) => {
      // Nichts zu verschieben oder keine Bewegung: kein Undo-Schritt
      if (itemIds.length === 0 || (dx === 0 && dy === 0)) return
      pushHistory()
      set((state) => {
        const items = { ...state.items }
        for (const itemId of itemIds) {
          const item = items[itemId]
          const current = item?.phaseData[state.currentPhaseId]
          if (!item || !current) continue
          items[itemId] = {
            ...item,
            phaseData: { ...item.phaseData, [state.currentPhaseId]: { ...current, x: current.x + dx, y: current.y + dy } },
          }
        }
        return { items }
      })
    },

    rotateItems: (itemIds, deltaDeg) => {
      const { items, currentPhaseId } = get()
      const ids = itemIds.filter((id) => items[id]?.phaseData[currentPhaseId] && !items[id].locked)
      if (ids.length === 0 || deltaDeg % 360 === 0) return
      pushHistory()
      set((state) => {
        const next = { ...state.items }
        for (const id of ids) {
          const item = next[id]
          const current = item.phaseData[state.currentPhaseId]
          const rotation = normalizeDeg(current.rotation + deltaDeg)
          const pos = positionForRotation(item, current, rotation, PPM)
          next[id] = {
            ...item,
            phaseData: { ...item.phaseData, [state.currentPhaseId]: { ...current, rotation, x: pos.x, y: pos.y } },
          }
        }
        return { items: next }
      })
    },

    duplicateItems: (itemIds, offsetPx = 20) => {
      const { items, currentPhaseId, phases } = get()
      const sources = itemIds.map((id) => items[id]).filter((it): it is EventItem => Boolean(it))
      if (sources.length === 0) return []
      // Gleiche Logik wie duplicateItem, nur für alle Quellen gemeinsam
      const created: EventItem[] = sources.map((source) => {
        const phaseData: EventItem['phaseData'] = {}
        for (const p of phases) {
          const src = source.phaseData[p.id]
          phaseData[p.id] = src
            ? { ...src, x: src.x + offsetPx, y: src.y + offsetPx }
            : { x: offsetPx, y: offsetPx, rotation: 0, visible: p.id === currentPhaseId }
        }
        return { ...source, id: uuid(), phaseData }
      })
      pushHistory()
      set((state) => ({
        items: { ...state.items, ...Object.fromEntries(created.map((i) => [i.id, i])) },
        itemOrder: [...state.itemOrder, ...created.map((i) => i.id)],
      }))
      return created.map((i) => i.id)
    },

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

    pasteItems: (sources, sourcePhaseId, offsetPx) => {
      const { currentPhaseId, phases } = get()
      const valid = sources.filter((s) => s.phaseData[sourcePhaseId])
      if (valid.length === 0) return []
      const created: EventItem[] = valid.map((source) => {
        const src = source.phaseData[sourcePhaseId]
        const phaseData: EventItem['phaseData'] = {}
        // Wie addItem: in allen Phasen vorhanden, sichtbar nur in der aktuellen
        for (const p of phases) {
          phaseData[p.id] = {
            x: src.x + offsetPx,
            y: src.y + offsetPx,
            rotation: src.rotation,
            visible: p.id === currentPhaseId,
          }
        }
        return { ...source, id: uuid(), locked: false, level: undefined, phaseData }
      })
      pushHistory()
      set((state) => ({
        items: { ...state.items, ...Object.fromEntries(created.map((i) => [i.id, i])) },
        itemOrder: [...state.itemOrder, ...created.map((i) => i.id)],
      }))
      return created.map((i) => i.id)
    },

    setItemsLocked: (itemIds, locked) => {
      const { items } = get()
      const ids = Array.from(new Set(itemIds)).filter((id) => items[id] && (items[id].locked ?? false) !== locked)
      if (ids.length === 0) return
      pushHistory()
      set((state) => {
        const next = { ...state.items }
        for (const id of ids) next[id] = { ...next[id], locked }
        return { items: next }
      })
    },

    alignItems: (itemIds, mode) => {
      const state = get()
      const cp = state.currentPhaseId
      const list = Array.from(new Set(itemIds))
        .map((id) => state.items[id])
        .filter((it): it is EventItem => Boolean(it?.phaseData[cp]?.visible))
      if (list.length < 2) return
      const boxes = list.map((it) => worldBBox(it, it.phaseData[cp], PPM))
      const all = unionBox(boxes)
      if (!all) return
      const items = { ...state.items }
      let changed = false
      for (let i = 0; i < list.length; i++) {
        const it = list[i]
        // Gesperrte Objekte dienen nur als Bezug und werden nicht bewegt
        if (it.locked) continue
        const b = boxes[i]
        let dx = 0
        let dy = 0
        if (mode === 'left') dx = all.minX - b.minX
        if (mode === 'right') dx = all.maxX - b.maxX
        if (mode === 'centerX') dx = (all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2
        if (mode === 'top') dy = all.minY - b.minY
        if (mode === 'bottom') dy = all.maxY - b.maxY
        if (mode === 'centerY') dy = (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2
        if (dx === 0 && dy === 0) continue
        changed = true
        const pd = it.phaseData[cp]
        items[it.id] = { ...it, phaseData: { ...it.phaseData, [cp]: { ...pd, x: pd.x + dx, y: pd.y + dy } } }
      }
      if (!changed) return
      pushHistory()
      set({ items })
    },

    distributeItems: (itemIds, axis) => {
      const state = get()
      const cp = state.currentPhaseId
      const horiz = axis === 'horizontal'
      const sorted = Array.from(new Set(itemIds))
        .map((id) => state.items[id])
        .filter((it): it is EventItem => Boolean(it?.phaseData[cp]?.visible))
        .map((it) => {
          const box = worldBBox(it, it.phaseData[cp], PPM)
          return horiz
            ? { it, lo: box.minX, hi: box.maxX }
            : { it, lo: box.minY, hi: box.maxY }
        })
        .sort((a, b) => a.lo - b.lo)
      if (sorted.length < 3) return
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const sizeSum = sorted.reduce((s, e) => s + (e.hi - e.lo), 0)
      // Gleicher Abstand zwischen allen Nachbarn; Erste und Letzte bleiben stehen
      const gap = (last.hi - first.lo - sizeSum) / (sorted.length - 1)
      const items = { ...state.items }
      let cursor = first.hi + gap
      let changed = false
      for (const e of sorted.slice(1, -1)) {
        const delta = cursor - e.lo
        cursor += e.hi - e.lo + gap
        if (e.it.locked || delta === 0) continue
        changed = true
        const pd = e.it.phaseData[cp]
        items[e.it.id] = {
          ...e.it,
          phaseData: {
            ...e.it.phaseData,
            [cp]: { ...pd, x: pd.x + (horiz ? delta : 0), y: pd.y + (horiz ? 0 : delta) },
          },
        }
      }
      if (!changed) return
      pushHistory()
      set({ items })
    },

    renameItem: (itemId, label) => {
      set((state) => {
        const item = state.items[itemId]
        if (!item || item.label === label) return state
        pushHistory()
        return patchItemInCurrentPhase(state, itemId, { label })
      })
    },

    setItemNote: (itemId, note) => {
      set((state) => {
        if (!state.items[itemId]) return state
        pushHistory()
        return patchItemInCurrentPhase(state, itemId, { note })
      })
    },

    resizeItem: (itemId, width, height) => {
      const item = get().items[itemId]
      // Ungültige Maße (0, negativ, NaN, Infinity) oder unverändert: kein Undo-Schritt
      if (!item || !(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return
      if (item.width === width && item.height === height) return
      pushHistory()
      set((state) => patchItemInCurrentPhase(state, itemId, { width, height }))
    },

    setItemLength: (itemId, length) => {
      const item = get().items[itemId]
      if (!item || !(length > 0) || !Number.isFinite(length) || item.width === length) return
      pushHistory()
      const label = item.type === 'pipe_drape' && hasDefaultPipeDrapeLabel(item.label) ? pipeDrapeLabel(length, item.height) : item.label
      set((state) => patchItemInCurrentPhase(state, itemId, { width: length, label }))
    },

    setItemColor: (itemId, color) => {
      set((state) => {
        const item = state.items[itemId]
        if (!item) return state
        const newColor = color ?? undefined
        if (item.color === newColor) return state
        pushHistory()
        return patchItemInCurrentPhase(state, itemId, { color: newColor })
      })
    },

    setItemPrint: (itemId, image) => {
      set((state) => {
        if (!state.items[itemId]) return state
        pushHistory()
        return patchItemInCurrentPhase(state, itemId, { printImage: image ?? undefined })
      })
    },

    setVisiovaRun: (itemId, widths) => {
      set((state) => {
        const item = state.items[itemId]
        if (!item || widths.length === 0) return state
        pushHistory()
        const total = widths.reduce((s, w) => s + w, 0)
        const label = hasDefaultVisiovaLabel(item.label) ? visiovaLabel(widths, item.frameHeight ?? 2.48) : item.label
        return patchItemInCurrentPhase(state, itemId, {
          width: total,
          visiovaFrames: widths.length > 1 ? widths : undefined,
          label,
        })
      })
    },

    setItemPrints: (prints) => {
      set((state) => {
        const ids = Object.keys(prints).filter((id) => state.items[id])
        if (ids.length === 0) return state
        pushHistory()
        let next: Pick<EventState, 'items' | 'itemOrder'> = { items: state.items, itemOrder: state.itemOrder }
        for (const id of ids) next = patchItemInCurrentPhase({ ...state, ...next }, id, { printImage: prints[id] })
        return next
      })
    },

    setForex: (itemId, panels, prints) => {
      set((state) => {
        const item = state.items[itemId]
        if (!item?.nivtecData) return state
        pushHistory()
        const ids = new Set(panels.map((p) => p.id))
        const merged = { ...item.forexPrints, ...prints }
        const forexPrints = Object.fromEntries(Object.entries(merged).filter(([id]) => ids.has(id)))
        return patchItemInCurrentPhase(state, itemId, { nivtecData: { ...item.nivtecData, forexPanels: panels }, forexPrints })
      })
    },

    setFrameHeight: (itemId, heightM) => {
      set((state) => {
        const item = state.items[itemId]
        if (!item || item.frameHeight === heightM) return state
        pushHistory()
        return patchItemInCurrentPhase(state, itemId, { frameHeight: heightM })
      })
    },

    setLetterText: (itemId, text) => {
      set((state) => {
        const item = state.items[itemId]
        const clean = text.replace(/\s+/g, ' ').trim()
        if (!item || !clean || item.letterText === clean) return state
        pushHistory()
        return patchItemInCurrentPhase(state, itemId, {
          letterText: clean,
          width: foamLettersWidth(clean),
          ...(hasDefaultFoamLabel(item.label) ? { label: foamLettersLabel(clean) } : {}),
        })
      })
    },

    toggleItemLocked: (itemId, locked) => {
      pushHistory()
      set((state) => {
        const item = state.items[itemId]
        if (!item) return state
        return { items: { ...state.items, [itemId]: { ...item, locked: locked ?? !item.locked } } }
      })
    },

    copyItemsToLaterPhases: (itemIds) => {
      set((state) => {
        const sorted = sortPhases(state.phases)
        const later = sorted.slice(sorted.findIndex((p) => p.id === state.currentPhaseId) + 1)
        const sources = itemIds.map((id) => state.items[id]).filter((it) => it?.phaseData[state.currentPhaseId])
        if (later.length === 0 || sources.length === 0) return state
        pushHistory()
        const items = { ...state.items }
        const itemOrder = [...state.itemOrder]
        for (const source of sources) {
          const current = source.phaseData[state.currentPhaseId]
          // Das Original gilt danach nicht mehr in den folgenden Phasen, dort stehen die Kopien.
          const phaseData = { ...source.phaseData }
          for (const p of later) delete phaseData[p.id]
          items[source.id] = { ...source, phaseData }
          let insertAt = itemOrder.indexOf(source.id) + 1 || itemOrder.length
          for (const p of later) {
            const copyId = uuid()
            items[copyId] = { ...source, id: copyId, phaseData: { [p.id]: { ...current, visible: true } } }
            itemOrder.splice(insertAt++, 0, copyId)
          }
        }
        return { items, itemOrder }
      })
    },

    addArea: (x, y, width, height, label) => {
      const id = uuid()
      const { currentPhaseId, phases, items } = get()
      const areaCount = Object.values(items).filter((i) => i.type === 'area').length
      const phaseData: EventItem['phaseData'] = {}
      for (const p of phases) {
        phaseData[p.id] = { x, y, rotation: 0, visible: p.id === currentPhaseId }
      }
      const item: EventItem = {
        id,
        type: 'area',
        label: label ?? `Stand ${areaCount + 1}`,
        width,
        height,
        phaseData,
        color: AREA_COLORS[areaCount % AREA_COLORS.length],
      }
      pushHistory()
      set((state) => ({
        items: { ...state.items, [id]: item },
        itemOrder: [...state.itemOrder, id],
      }))
      return id
    },

    addCustomItem: (x, y, spec) => {
      const id = uuid()
      const { currentPhaseId, phases } = get()
      const phaseData: EventItem['phaseData'] = {}
      for (const p of phases) {
        phaseData[p.id] = { x, y, rotation: 0, visible: p.id === currentPhaseId }
      }
      const round = spec.shape === 'round'
      const item: EventItem = {
        id,
        type: round ? 'custom_round' : 'custom_rect',
        label: spec.label,
        width: spec.width,
        height: round ? spec.width : spec.height,
        phaseData,
        color: spec.color,
      }
      pushHistory()
      set((state) => ({
        items: { ...state.items, [id]: item },
        itemOrder: [...state.itemOrder, id],
      }))
      return id
    },

    addTextLabel: (x, y, text) => {
      const id = uuid()
      const { currentPhaseId, phases } = get()
      const phaseData: EventItem['phaseData'] = {}
      for (const p of phases) {
        phaseData[p.id] = { x, y, rotation: 0, visible: p.id === currentPhaseId }
      }
      const item: EventItem = {
        id,
        type: 'text_label',
        label: text,
        width: 0.1,
        height: 0.1,
        phaseData,
      }
      pushHistory()
      set((state) => ({
        items: { ...state.items, [id]: item },
        itemOrder: [...state.itemOrder, id],
      }))
      return id
    },

    addChairRowGroup: (x, y, rows, cols, spacingM = CHAIR_PITCH_M, rowSpacingM = CHAIR_ROW_PITCH_M) => {
      const id = uuid()
      const { currentPhaseId, phases, items } = get()
      const groupCount = Object.values(items).filter((i) => i.type === 'chair_row_group').length
      const phaseData: EventItem['phaseData'] = {}
      for (const p of phases) {
        phaseData[p.id] = { x, y, rotation: 0, visible: p.id === currentPhaseId }
      }
      const item: EventItem = {
        id,
        type: 'chair_row_group',
        label: `Stuhlreihe ${groupCount + 1} (${rows * cols} Stühle)`,
        width: cols * spacingM,
        height: rows * rowSpacingM,
        seats: rows * cols,
        phaseData,
        grid: { rows, cols, spacingM, rowSpacingM },
      }
      pushHistory()
      set((state) => ({
        items: { ...state.items, [id]: item },
        itemOrder: [...state.itemOrder, id],
      }))
      return id
    },

    duplicateItem: (itemId, offsetX = 20, offsetY = 20) => {
      const source = get().items[itemId]
      if (!source) return null
      const id = uuid()
      const { currentPhaseId, phases } = get()
      const phaseData: EventItem['phaseData'] = {}
      for (const p of phases) {
        const src = source.phaseData[p.id]
        phaseData[p.id] = src
          ? { ...src, x: src.x + offsetX, y: src.y + offsetY }
          : { x: offsetX, y: offsetY, rotation: 0, visible: p.id === currentPhaseId }
      }
      const item: EventItem = { ...source, id, phaseData }
      pushHistory()
      set((state) => ({
        items: { ...state.items, [id]: item },
        itemOrder: [...state.itemOrder, id],
      }))
      return id
    },

    toggleLayer: (layer) =>
      set((state) => ({ layers: { ...state.layers, [layer]: !state.layers[layer] } })),

    importNivtec: (data, x, y) => {
      const id = uuid()
      const { currentPhaseId, phases } = get()
      // bounding box in meters from pieces (already in cm/m per NivTec convention: meters)
      const maxX = Math.max(...data.pieces.map((p) => p.x + p.w), 1)
      const maxY = Math.max(...data.pieces.map((p) => p.y + p.d), 1)
      const phaseData: EventItem['phaseData'] = {}
      for (const p of phases) {
        phaseData[p.id] = { x, y, rotation: 0, visible: p.id === currentPhaseId }
      }
      const item: EventItem = {
        id,
        type: 'nivtec_group',
        label: data.name || 'NivTec Bühne/Theke',
        width: maxX,
        height: maxY,
        phaseData,
        nivtecData: { ...data, forexPanels: sanitizeForexPanels(data.pieces, data.forexPanels) },
      }
      pushHistory()
      set((state) => ({
        items: { ...state.items, [id]: item },
        itemOrder: [...state.itemOrder, id],
      }))
    },

    undo: () => {
      // Nach Undo beginnt ein neuer Pfeiltasten-Schub immer einen eigenen Undo-Schritt
      lastNudge = { key: '', at: 0 }
      set((state) => {
        if (state.historyPast.length === 0) return state
        const previous = state.historyPast[state.historyPast.length - 1]
        const newPast = state.historyPast.slice(0, -1)
        const currentSnapshot = counterSnapshot(state, previous)
        return {
          ...previous.project,
          items: previous.items,
          itemOrder: previous.itemOrder,
          historyPast: newPast,
          historyFuture: [...state.historyFuture, currentSnapshot],
        }
      })
    },

    redo: () => {
      lastNudge = { key: '', at: 0 }
      set((state) => {
        if (state.historyFuture.length === 0) return state
        const next = state.historyFuture[state.historyFuture.length - 1]
        const newFuture = state.historyFuture.slice(0, -1)
        const currentSnapshot = counterSnapshot(state, next)
        return {
          ...next.project,
          items: next.items,
          itemOrder: next.itemOrder,
          historyPast: [...state.historyPast, currentSnapshot],
          historyFuture: newFuture,
        }
      })
    },

    restoreVersion: (data) => {
      // Wie pushHistory, sichert aber zusätzlich Phasen/Name, da die Version diese ebenfalls ersetzt
      pushProjectHistory()
      set({
        eventName: data.eventName,
        currentPhaseId: data.currentPhaseId,
        phases: data.phases,
        items: data.items,
        itemOrder: data.itemOrder,
      })
    },

    importProject: (data) =>
      set({
        ...data,
        items: normalizeChairGroups(normalizeFoamLetters(data.items)),
        historyPast: [],
        historyFuture: [],
      }),

    hydrate: (data) =>
      set({
        ...data,
        items: normalizeChairGroups(normalizeFoamLetters(data.items)),
        historyPast: [],
        historyFuture: [],
      }),

    getSnapshot: () => {
      const { eventName, currentPhaseId, phases, items, itemOrder, layers } = get()
      return { eventName, currentPhaseId, phases, items, itemOrder, layers }
    },
  }
})
