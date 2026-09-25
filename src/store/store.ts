import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { EventItem, EventState, ItemType, NivtecData, Phase } from '../types'
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

interface HistorySnapshot {
  items: Record<string, EventItem>
  itemOrder: string[]
}

interface Store extends EventState {
  historyPast: HistorySnapshot[]
  historyFuture: HistorySnapshot[]

  setEventName: (name: string) => void

  // Phases
  addPhase: (name: string) => void
  removePhase: (phaseId: string) => void
  renamePhase: (phaseId: string, name: string) => void
  setCurrentPhase: (phaseId: string) => void
  reorderPhases: (phases: Phase[]) => void

  // Items
  addItem: (type: ItemType, x: number, y: number) => string
  addItemsBatch: (items: EventItem[]) => void
  removeItem: (itemId: string) => void
  updateItemTransform: (itemId: string, x: number, y: number, rotation?: number) => void
  rotateItem: (itemId: string, deltaDeg: number) => void
  toggleItemVisible: (itemId: string, visible?: boolean) => void
  renameItem: (itemId: string, label: string) => void
  resizeItem: (itemId: string, width: number, height: number) => void
  setItemColor: (itemId: string, color: string) => void

  // Bereiche (z.B. Messestände): frei gezogenes Rechteck mit individueller Größe
  addArea: (x: number, y: number, width: number, height: number, label?: string) => string
  duplicateItem: (itemId: string, offsetX?: number, offsetY?: number) => string | null

  /** Stuhlreihen als EIN Objekt (Gruppe), damit sie gemeinsam verschoben werden können. */
  addChairRowGroup: (x: number, y: number, rows: number, cols: number, spacingM?: number) => string

  // Layers
  toggleLayer: (layer: keyof EventState['layers']) => void
  toggleSaal: (saal: keyof EventState['saalSplit']) => void

  // NivTec import
  importNivtec: (data: NivtecData, x: number, y: number) => void

  // Undo/Redo (wirkt auf Objekt-Änderungen: platzieren, verschieben, löschen, umbenennen)
  undo: () => void
  redo: () => void

  // Projekte: kompletten Zustand aus einem gespeicherten Projekt laden bzw. für die Speicherung exportieren
  hydrate: (data: Pick<EventState, 'eventName' | 'currentPhaseId' | 'phases' | 'items' | 'itemOrder' | 'layers' | 'saalSplit'>) => void
  getSnapshot: () => Pick<EventState, 'eventName' | 'currentPhaseId' | 'phases' | 'items' | 'itemOrder' | 'layers' | 'saalSplit'>
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
    saalSplit: { saal1: true, saal2: true, saal3: true },
    historyPast: [],
    historyFuture: [],

    setEventName: (name) => set({ eventName: name }),

    addPhase: (name) =>
      set((state) => {
        const newPhase: Phase = { id: uuid(), name, order: state.phases.length }
        // carry over current visible layout as starting point for the new phase
        const items = { ...state.items }
        for (const id of Object.keys(items)) {
          const item = items[id]
          const prev = item.phaseData[state.currentPhaseId]
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

    renameItem: (itemId, label) => {
      pushHistory()
      set((state) => ({
        items: { ...state.items, [itemId]: { ...state.items[itemId], label } },
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
      pushHistory()
      set((state) => ({
        items: { ...state.items, [itemId]: { ...state.items[itemId], color } },
      }))
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

    toggleSaal: (saal) =>
      set((state) => ({ saalSplit: { ...state.saalSplit, [saal]: !state.saalSplit[saal] } })),

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
        const currentSnapshot: HistorySnapshot = { items: state.items, itemOrder: state.itemOrder }
        return {
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
        const currentSnapshot: HistorySnapshot = { items: state.items, itemOrder: state.itemOrder }
        return {
          items: next.items,
          itemOrder: next.itemOrder,
          historyPast: [...state.historyPast, currentSnapshot],
          historyFuture: newFuture,
        }
      }),

    hydrate: (data) =>
      set({
        ...data,
        historyPast: [],
        historyFuture: [],
      }),

    getSnapshot: () => {
      const { eventName, currentPhaseId, phases, items, itemOrder, layers, saalSplit } = get()
      return { eventName, currentPhaseId, phases, items, itemOrder, layers, saalSplit }
    },
  }
})
