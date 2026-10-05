import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { EventItem, EventState, ItemType, ItemWithId, NivtecData, Phase } from '../types'
import { ITEM_LIBRARY } from '../data/itemLibrary'

const PHASE_1 = uuid()
const MAX_HISTORY = 50

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
  setItemColor: (itemId: string, color: string | null) => void
  /** Sperrt/entsperrt ein Objekt gegen Verschieben und Drehen (unabhängig von der Phase). */
  toggleItemLocked: (itemId: string, locked?: boolean) => void

  // Mehrfachauswahl: dieselben Aktionen wie oben, aber für mehrere Objekte als EIN Undo-Schritt.
  removeItems: (itemIds: string[]) => void
  toggleItemsVisible: (itemIds: string[], visible?: boolean) => void
  moveItemsBy: (itemIds: string[], dx: number, dy: number) => void

  // Bereiche (z.B. Messestände): frei gezogenes Rechteck mit individueller Größe
  addArea: (x: number, y: number, width: number, height: number, label?: string) => string
  /** Freie Text-Beschriftung an einer Stelle im Plan (z. B. "Einlass hier"). */
  addTextLabel: (x: number, y: number, text: string) => string
  /** Eigenes Objekt mit frei gewähltem Namen, Maßen (m), Form und Farbe. */
  addCustomItem: (x: number, y: number, spec: CustomItemSpec) => string
  duplicateItem: (itemId: string, offsetX?: number, offsetY?: number) => string | null

  /** Stuhlreihen als EIN Objekt (Gruppe), damit sie gemeinsam verschoben werden können. */
  addChairRowGroup: (x: number, y: number, rows: number, cols: number, spacingM?: number) => string

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

export const useEventStore = create<Store>((set, get) => {
  /** Snapshot des Objekt-Zustands vor einer mutierenden Aktion auf den Undo-Stack legen. */
  const pushHistory = () => {
    const { items, itemOrder, historyPast } = get()
    const past = [...historyPast, { items, itemOrder }].slice(-MAX_HISTORY)
    set({ historyPast: past, historyFuture: [] })
  }

  return {
    eventName: 'Neues Event',
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

    addPhase: (name, empty) =>
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
      }),

    removePhase: (phaseId) =>
      set((state) => {
        if (state.phases.length <= 1) return state
        const phases = state.phases.filter((p) => p.id !== phaseId)
        const currentPhaseId = state.currentPhaseId === phaseId ? phases[0].id : state.currentPhaseId
        return { phases, currentPhaseId }
      }),

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
      pushHistory()
      set((state) => {
        const item = state.items[itemId]
        if (!item) return state
        const current = item.phaseData[state.currentPhaseId]
        if (!current) return state
        const rotation = (((current.rotation + deltaDeg) % 360) + 360) % 360
        return {
          items: {
            ...state.items,
            [itemId]: {
              ...item,
              phaseData: {
                ...item.phaseData,
                [state.currentPhaseId]: { ...current, rotation },
              },
            },
          },
        }
      })
    },

    setItemRotation: (itemId, deg) => {
      const normalized = (((deg % 360) + 360) % 360)
      set((state) => {
        const item = state.items[itemId]
        if (!item) return state
        const current = item.phaseData[state.currentPhaseId]
        if (!current) return state
        // Nur Undo-Schritt, wenn sich die Rotation tatsächlich ändert
        if (current.rotation === normalized) return state
        pushHistory()
        return {
          items: {
            ...state.items,
            [itemId]: {
              ...item,
              phaseData: {
                ...item.phaseData,
                [state.currentPhaseId]: { ...current, rotation: normalized },
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

    renameItem: (itemId, label) => {
      set((state) => {
        const item = state.items[itemId]
        if (!item || item.label === label) return state
        pushHistory()
        return {
          items: { ...state.items, [itemId]: { ...item, label } },
        }
      })
    },

    setItemNote: (itemId, note) => {
      pushHistory()
      set((state) => ({
        items: { ...state.items, [itemId]: { ...state.items[itemId], note } },
      }))
    },

    resizeItem: (itemId, width, height) => {
      pushHistory()
      set((state) => ({
        items: {
          ...state.items,
          [itemId]: { ...state.items[itemId], width, height },
        },
      }))
    },

    setItemColor: (itemId, color) => {
      set((state) => {
        const item = state.items[itemId]
        if (!item) return state
        const newColor = color ?? undefined
        if (item.color === newColor) return state
        pushHistory()
        return {
          items: {
            ...state.items,
            [itemId]: { ...item, color: newColor },
          },
        }
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

    addChairRowGroup: (x, y, rows, cols, spacingM = 0.55) => {
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
        height: rows * spacingM,
        seats: rows * cols,
        phaseData,
        grid: { rows, cols, spacingM },
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
        nivtecData: data,
      }
      pushHistory()
      set((state) => ({
        items: { ...state.items, [id]: item },
        itemOrder: [...state.itemOrder, id],
      }))
    },

    undo: () =>
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
      }),

    redo: () =>
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
      }),

    restoreVersion: (data) => {
      // Wie pushHistory, aber zusätzlich Phasen/Name sichern, da die Version diese ebenfalls ersetzt
      const { items, itemOrder, eventName, currentPhaseId, phases, historyPast } = get()
      const snap: HistorySnapshot = { items, itemOrder, project: { eventName, currentPhaseId, phases } }
      set({ historyPast: [...historyPast, snap].slice(-MAX_HISTORY), historyFuture: [] })
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
        historyPast: [],
        historyFuture: [],
      }),

    hydrate: (data) =>
      set({
        ...data,
        historyPast: [],
        historyFuture: [],
      }),

    getSnapshot: () => {
      const { eventName, currentPhaseId, phases, items, itemOrder, layers } = get()
      return { eventName, currentPhaseId, phases, items, itemOrder, layers }
    },
  }
})
