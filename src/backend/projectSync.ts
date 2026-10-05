import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { useEventStore } from '../store/store'
import * as api from './api'
import { errorMessage, isConflict, isRetryable, myRole, pb, type ProjectRecord, type Role } from './pb'
import { emptyProjectData, type ProjectData } from '../utils/projectStorage'

/**
 * Hält das geöffnete Projekt mit dem Server synchron.
 *
 * - Laden beim Öffnen, danach automatisches Speichern kurz nach jeder Änderung am Plan.
 * - Jede Speicherung trägt die Version, auf der sie aufbaut. Hat inzwischen jemand anderes
 *   gespeichert, lehnt der Server ab (409) und der Status wird „conflict“; aufgelöst wird
 *   mit resolveConflict(), wobei die jeweils verworfene Fassung als Version erhalten bleibt.
 * - Speichert jemand anderes, während man selbst nichts Ungespeichertes hat, wird dessen
 *   Stand live übernommen (Phase und Ansicht bleiben die eigenen).
 */

export type SyncStatus =
  | 'loading' // Projekt wird geladen
  | 'failed' // Laden fehlgeschlagen (message)
  | 'saved'
  | 'saving' // Änderungen warten aufs Speichern oder werden gerade gespeichert
  | 'offline' // Server nicht erreichbar, neuer Versuch läuft
  | 'error' // Server hat abgelehnt (message), „Erneut versuchen“ möglich
  | 'conflict' // jemand anderes hat inzwischen gespeichert

interface SyncState {
  projectId: string | null
  role: Role | null
  status: SyncStatus
  message: string | null
  /** Wann zuletzt Änderungen anderer übernommen wurden – für einen kurzen Hinweis. */
  remoteAppliedAt: number | null
}

export const useSyncStore = create<SyncState>(() => ({
  projectId: null,
  role: null,
  status: 'loading',
  message: null,
  remoteAppliedAt: null,
}))

const SAVE_DELAY_MS = 600
const RETRY_DELAY_MS = 5000

interface Session {
  id: string
  /** Version des zuletzt gespeicherten oder geladenen Stands. */
  version: number
  /** Änderungszähler: Alles bis savedSeq ist auf dem Server. */
  seq: number
  savedSeq: number
  inflight: Promise<void> | null
  /** Live-Update, das während einer eigenen Speicherung kam – danach auswerten. */
  pendingRemote: ProjectRecord | null
  timer: ReturnType<typeof setTimeout> | null
  applyingRemote: boolean
  closed: boolean
  cleanups: (() => void)[]
}

let session: Session | null = null

function setStatus(s: Session, patch: Partial<SyncState>) {
  if (session === s) useSyncStore.setState(patch)
}

const isDirty = (s: Session) => s.seq !== s.savedSeq
const canWrite = () => {
  const role = useSyncStore.getState().role
  return role === 'owner' || role === 'editor'
}

/** Öffnet ein Projekt; die zurückgegebene Funktion schließt es wieder (und speichert Ausstehendes). */
export function startSession(id: string): () => void {
  const s: Session = {
    id,
    version: 0,
    seq: 0,
    savedSeq: 0,
    inflight: null,
    pendingRemote: null,
    timer: null,
    applyingRemote: false,
    closed: false,
    cleanups: [],
  }
  session = s
  useSyncStore.setState({ projectId: id, role: null, status: 'loading', message: null, remoteAppliedAt: null })

  api
    .loadProject(id)
    .then((p) => {
      if (s.closed) return
      s.version = p.version
      applyData(s, p.data ?? emptyProjectData(), false)
      setStatus(s, { role: p.role, status: 'saved' })
      watch(s)
    })
    .catch((err) => setStatus(s, { status: 'failed', message: errorMessage(err) }))

  return () => endSession(s)
}

function watch(s: Session) {
  s.cleanups.push(
    useEventStore.subscribe((state, prev) => {
      if (s.applyingRemote) return
      // Nur der Plan selbst zählt; Phase/Ansicht wechseln ist keine Änderung zum Speichern.
      if (
        state.eventName === prev.eventName &&
        state.phases === prev.phases &&
        state.items === prev.items &&
        state.itemOrder === prev.itemOrder
      )
        return
      s.seq++
      scheduleSave(s)
    }),
  )

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (canWrite() && (isDirty(s) || s.inflight)) e.preventDefault()
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  s.cleanups.push(() => window.removeEventListener('beforeunload', onBeforeUnload))

  pb.collection<ProjectRecord>('projects')
    .subscribe(s.id, (e) => onRemote(s, e.action, e.record))
    .then((unsubscribe) => {
      if (s.closed) void unsubscribe()
      else s.cleanups.push(() => void unsubscribe())
    })
    // Live-Updates sind eine Ergänzung – Speichern und Konflikterkennung gehen auch ohne.
    .catch(() => {})
}

function scheduleSave(s: Session, delay = SAVE_DELAY_MS) {
  if (s.closed || !canWrite() || useSyncStore.getState().status === 'conflict') return
  if (s.timer) clearTimeout(s.timer)
  if (useSyncStore.getState().status === 'saved') setStatus(s, { status: 'saving' })
  s.timer = setTimeout(() => {
    s.timer = null
    void flush(s)
  }, delay)
}

async function flush(s: Session): Promise<void> {
  if (s.inflight) return s.inflight.then(() => flush(s))
  if (!isDirty(s)) return
  const seq = s.seq
  const data = useEventStore.getState().getSnapshot()
  s.inflight = save(s, data, seq)
  try {
    await s.inflight
  } finally {
    s.inflight = null
  }
  const remote = s.pendingRemote
  s.pendingRemote = null
  if (remote) onRemote(s, 'update', remote)
  if (isDirty(s) && useSyncStore.getState().status === 'saving') scheduleSave(s, 0)
}

async function save(s: Session, data: ProjectData, seq: number): Promise<void> {
  setStatus(s, { status: 'saving' })
  try {
    s.version = await api.saveProjectData(s.id, data, s.version + 1)
    s.savedSeq = seq
    setStatus(s, { status: isDirty(s) ? 'saving' : 'saved', message: null })
  } catch (err) {
    if (isConflict(err)) {
      setStatus(s, { status: 'conflict', message: null })
    } else if (isRetryable(err)) {
      setStatus(s, { status: 'offline', message: null })
      if (!s.closed) {
        s.timer = setTimeout(() => {
          s.timer = null
          void flush(s)
        }, RETRY_DELAY_MS)
      }
    } else {
      setStatus(s, { status: 'error', message: errorMessage(err) })
    }
  }
}

function onRemote(s: Session, action: string, record: ProjectRecord) {
  if (s.closed) return
  if (action === 'delete') {
    setStatus(s, { status: 'error', message: 'Das Projekt wurde gelöscht.' })
    return
  }
  const role = myRole(record)
  if (role !== useSyncStore.getState().role) setStatus(s, { role })
  if (record.version <= s.version) return // die eigene Speicherung oder schon bekannt
  if (s.inflight) {
    // Kann das Echo der gerade laufenden eigenen Speicherung sein – erst deren Antwort abwarten.
    s.pendingRemote = record
    return
  }
  if (isDirty(s) && canWrite()) {
    if (s.timer) clearTimeout(s.timer)
    s.timer = null
    setStatus(s, { status: 'conflict' })
    return
  }
  s.version = record.version
  s.savedSeq = s.seq
  applyData(s, record.data ?? emptyProjectData(), true)
  setStatus(s, { status: 'saved', message: null, remoteAppliedAt: Date.now() })
}

/** Ersetzt den Plan im Editor; mit keepView bleiben eigene Phase und Ebenen erhalten. */
function applyData(s: Session, data: ProjectData, keepView: boolean) {
  const next = { ...emptyProjectData(), ...data }
  if (keepView) {
    const { currentPhaseId, layers } = useEventStore.getState()
    if (next.phases.some((p) => p.id === currentPhaseId)) next.currentPhaseId = currentPhaseId
    next.layers = layers
  }
  s.applyingRemote = true
  try {
    useEventStore.getState().hydrate(next)
  } finally {
    s.applyingRemote = false
  }
}

function endSession(s: Session) {
  s.closed = true
  if (s.timer) clearTimeout(s.timer)
  s.cleanups.forEach((fn) => fn())
  // Letzte Änderungen noch speichern – mit dem Stand von jetzt, bevor das nächste Projekt lädt.
  if (canWrite() && isDirty(s) && useSyncStore.getState().status !== 'conflict') {
    const data = useEventStore.getState().getSnapshot()
    const seq = s.seq
    void (s.inflight ?? Promise.resolve()).then(() => save(s, data, seq))
  }
  if (session === s) session = null
}

/** Darf das Projekt geschlossen werden, ohne dass Änderungen verloren gehen? Fragt sonst nach. */
export function canLeaveProject(): boolean {
  const s = session
  if (!s || !canWrite() || !isDirty(s)) return true
  const { status } = useSyncStore.getState()
  if (status === 'saving' || status === 'saved') return true
  return window.confirm('Ihre letzten Änderungen sind noch nicht auf dem Server gespeichert. Trotzdem schließen?')
}

export function retrySave() {
  const s = session
  if (!s) return
  setStatus(s, { status: 'saving', message: null })
  void flush(s)
}

/**
 * Konflikt auflösen. „theirs“: Stand vom Server laden, die eigenen Änderungen als Version sichern.
 * „mine“: Den Serverstand als Version sichern und die eigene Fassung darüber speichern.
 */
export async function resolveConflict(choice: 'theirs' | 'mine'): Promise<void> {
  const s = session
  if (!s) return
  setStatus(s, { status: 'saving', message: null })
  const stamp = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
  try {
    const latest = await api.loadProject(s.id)
    const mine = useEventStore.getState().getSnapshot()
    if (choice === 'theirs') {
      await api.createVersion(s.id, {
        id: uuid(),
        name: `Meine Änderungen vor dem Neuladen (${stamp})`,
        createdAt: Date.now(),
        data: mine,
      })
      s.version = latest.version
      s.savedSeq = s.seq
      applyData(s, latest.data ?? emptyProjectData(), true)
      setStatus(s, { status: 'saved', role: latest.role })
    } else {
      if (latest.data) {
        await api.createVersion(s.id, {
          id: uuid(),
          name: `Stand vor dem Überschreiben (${stamp})`,
          createdAt: Date.now(),
          data: latest.data,
        })
      }
      s.version = latest.version
      await save(s, mine, s.seq)
    }
    if (isDirty(s)) scheduleSave(s, 0)
  } catch (err) {
    setStatus(s, { status: isConflict(err) ? 'conflict' : 'error', message: errorMessage(err) })
  }
}
