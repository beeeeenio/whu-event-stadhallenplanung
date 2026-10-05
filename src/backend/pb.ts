import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'
import { useSyncExternalStore } from 'react'
import type { ProjectData } from '../utils/projectStorage'

/**
 * Verbindung zum Stadthallen-Backend (PocketBase, siehe server/README.md).
 *
 * Die App spricht es unter ihrer eigenen Adresse an: in Produktion liefert PocketBase
 * Frontend und API gemeinsam aus, im Dev-Server leitet Vite /api weiter (vite.config.ts).
 */
export const pb = new PocketBase('/')
// Sonst bricht das SDK gleichzeitige Anfragen an dieselbe Adresse gegenseitig ab
// (z. B. die doppelten Effekte im React-StrictMode).
pb.autoCancellation(false)

/**
 * Vorübergehend offener Zugang: ohne Anmeldung sehen und bearbeiten alle alle Projekte;
 * Löschen und Teilen nur angemeldet. Muss zu den Regeln auf dem Server passen
 * (server/pb_migrations/1791158600_open_access.js). Zurück zum Login: false + Gegen-Migration.
 */
export const OPEN_ACCESS = true

export type Role = 'owner' | 'editor' | 'viewer'

export interface ProjectRecord extends RecordModel {
  name: string
  data: ProjectData | null
  version: number
  owner: string
  editors: string[]
  viewers: string[]
  created: string
  updated: string
}

/** ID des angemeldeten Accounts, sonst undefined (offener Zugang ohne Anmeldung). */
export function currentUserId(): string | undefined {
  return pb.authStore.isValid ? pb.authStore.record?.id : undefined
}

export function roleIn(record: Pick<ProjectRecord, 'owner' | 'editors' | 'viewers'>, userId: string): Role | null {
  if (record.owner === userId) return 'owner'
  if (record.editors?.includes(userId)) return 'editor'
  if (record.viewers?.includes(userId)) return 'viewer'
  return null
}

/** Eigene Rolle im Projekt; ohne Mitgliedschaft im offenen Zugang „editor“, sonst „viewer“. */
export function myRole(record: Pick<ProjectRecord, 'owner' | 'editors' | 'viewers'>): Role {
  const me = currentUserId()
  return (me && roleIn(record, me)) || (OPEN_ACCESS ? 'editor' : 'viewer')
}

/** PocketBase-Zeitstempel („2026-10-05 20:21:16.123Z“) als ms – mit „T“, damit auch Safari sie liest. */
export function parseDate(value: string): number {
  return Date.parse(value.replace(' ', 'T'))
}

function subscribeAuth(onChange: () => void) {
  return pb.authStore.onChange(onChange)
}

// authStore.record liest bei jedem Zugriff neu aus dem localStorage (neues Objekt) –
// useSyncExternalStore braucht aber denselben Wert, solange sich nichts ändert.
let currentUser: { token: string; record: RecordModel | null } = { token: '', record: null }
function getCurrentUser() {
  const token = pb.authStore.isValid ? pb.authStore.token : ''
  if (token !== currentUser.token) currentUser = { token, record: token ? pb.authStore.record : null }
  return currentUser.record
}

/** Angemeldeter Account oder null; rendert neu bei Login/Logout. */
export function useCurrentUser() {
  return useSyncExternalStore(subscribeAuth, getCurrentUser)
}

export function isConflict(err: unknown): boolean {
  return err instanceof ClientResponseError && err.status === 409
}

/** Server nicht erreichbar (offline, Server weg) – im Unterschied zu einer Ablehnung durch den Server. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ClientResponseError && err.status === 0 && !err.isAbort
}

/** Lohnt ein neuer Versuch später? (Netzwerk weg oder Serverfehler, keine Ablehnung.) */
export function isRetryable(err: unknown): boolean {
  return isNetworkError(err) || (err instanceof ClientResponseError && err.status >= 500)
}

/** Fehlertext für die Oberfläche: Meldung des Servers, sonst eine allgemeine. */
export function errorMessage(err: unknown): string {
  if (isNetworkError(err)) return 'Server nicht erreichbar. Bitte Internetverbindung prüfen.'
  if (err instanceof ClientResponseError) {
    if (err.status === 429) return 'Zu viele Versuche. Bitte einen Moment warten.'
    // Eigene Meldungen (server/pb_hooks) sind deutsch; PocketBases englische Standardtexte übersetzen.
    const msg: string | undefined = err.response?.message
    if (err.status === 404 && (!msg || msg.startsWith('The requested resource'))) {
      return 'Nicht (mehr) vorhanden oder keine Berechtigung.'
    }
    if (err.status === 403 && (!msg || /^(Only superusers|The authorized record|You are not allowed)/.test(msg))) {
      return 'Keine Berechtigung.'
    }
    return msg || err.message
  }
  return err instanceof Error ? err.message : String(err)
}
