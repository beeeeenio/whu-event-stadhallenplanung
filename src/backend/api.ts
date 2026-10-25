import { v4 as uuid } from 'uuid'
import { currentUserId, myRole, parseDate, pb, roleIn, type ProjectRecord, type Role } from './pb'
import type { ProjectData, ProjectVersion } from '../utils/projectStorage'
import type { LayoutTemplate, TemplateItem } from '../utils/templateStorage'

/**
 * Alle Lese-/Schreibzugriffe der App auf das Backend. Rechte prüft der Server
 * (server/pb_migrations), hier steht nur, welche Daten wohin gehen.
 */

export interface ProjectMeta {
  id: string
  name: string
  updatedAt: number
  /** Was man darf (Admins wie Eigentümer). */
  role: Role
  /** Eigene Mitgliedschaft; null = nur über Admin-Rechte sichtbar („Backup“). */
  membership: Role | null
  /** Name oder E-Mail des Eigentümers – nur lesbar, wenn man den Account sehen darf. */
  ownerName?: string
  hasOwner: boolean
  /** Wer zuletzt gespeichert hat (leer bei älteren Projekten oder ohne Änderung). */
  lastEditorName?: string
}

export interface LoadedProject {
  name: string
  data: ProjectData | null
  version: number
  role: Role
}

export interface Member {
  id: string
  email: string
  name: string
  role: Role
}

const projects = () => pb.collection<ProjectRecord>('projects')

// ---------- Projekte ----------

export async function listProjects(): Promise<ProjectMeta[]> {
  const me = currentUserId()
  const records = await projects().getFullList({
    fields: 'id,name,updated,owner,editors,viewers,lastEditorName,expand.owner.name,expand.owner.email',
    expand: 'owner',
    sort: '-updated',
  })
  return records.map((r) => ({
    id: r.id,
    name: r.name,
    updatedAt: parseDate(r.updated),
    role: myRole(r),
    membership: me ? roleIn(r, me) : null,
    ownerName: r.expand?.owner?.name || r.expand?.owner?.email || undefined,
    hasOwner: !!r.owner,
    lastEditorName: (r as { lastEditorName?: string }).lastEditorName || undefined,
  }))
}

/** Eigentümer/Ersteller nur mitschicken, wenn angemeldet (offener Zugang: ohne). */
const byMe = (field: 'owner' | 'createdBy') => {
  const me = currentUserId()
  return me ? { [field]: me } : {}
}

export async function createProject(name: string, data: ProjectData, id: string = uuid()): Promise<string> {
  await projects().create({ id, name, data, ...byMe('owner') })
  return id
}

export async function loadProject(id: string): Promise<LoadedProject> {
  const r = await projects().getOne(id)
  return { name: r.name, data: r.data, version: r.version, role: myRole(r) }
}

/**
 * Speichert den Plan. `version` = zuletzt bekannte Version + 1; passt sie nicht mehr,
 * weil inzwischen jemand anderes gespeichert hat, wirft der Server 409 (isConflict).
 */
export async function saveProjectData(id: string, data: ProjectData, version: number): Promise<number> {
  // Der Titel im Plan (eventName) ist auch der Name in der Projektübersicht: beim Speichern mitziehen
  const name = data.eventName?.trim()
  const r = await projects().update(id, { data, version, ...(name ? { name } : {}) }, { fields: 'version' })
  return r.version
}

/** Nur den Namen in der Projektübersicht setzen (ohne den Plan anzufassen). */
export async function setProjectName(id: string, name: string): Promise<void> {
  await projects().update(id, { name }, { fields: 'id' })
}

/** Umbenennen aus der Projektübersicht: Name und Titel im Plan (eventName) bleiben gleich. */
export async function renameProject(id: string, name: string): Promise<void> {
  const r = await projects().getOne(id, { fields: 'id,data,version' })
  const data = r.data as ProjectData | null
  if (!data) {
    await setProjectName(id, name)
    return
  }
  await projects().update(id, { name, data: { ...data, eventName: name }, version: r.version + 1 }, { fields: 'id' })
}

export async function deleteProject(id: string): Promise<void> {
  await projects().delete(id)
}

/** Eigene Kopie samt Versionen – auch von Projekten, die man nur ansehen darf. */
export async function duplicateProject(sourceId: string, name: string): Promise<string> {
  const [source, versions] = await Promise.all([loadProject(sourceId), listVersions(sourceId)])
  const id = await createProject(name, { ...(source.data ?? ({} as ProjectData)), eventName: name })
  for (const v of [...versions].reverse()) {
    await createVersion(id, { ...v, id: uuid() })
  }
  return id
}

// ---------- Versionen ----------

interface VersionRecord {
  id: string
  name: string
  createdAt: number
  data: ProjectData
  createdByName?: string
}

export async function listVersions(projectId: string): Promise<ProjectVersion[]> {
  const records = await pb.collection<VersionRecord>('project_versions').getFullList({
    filter: pb.filter('project = {:projectId}', { projectId }),
    sort: '-createdAt',
    fields: 'id,name,createdAt,data,createdByName',
  })
  return records.map(({ id, name, createdAt, data, createdByName }) => ({ id, name, createdAt, data, createdByName: createdByName || undefined }))
}

export async function createVersion(projectId: string, v: ProjectVersion): Promise<void> {
  await pb.collection('project_versions').create({
    id: v.id,
    project: projectId,
    name: v.name,
    data: v.data,
    createdAt: v.createdAt,
    ...byMe('createdBy'),
  })
}

export async function deleteVersion(id: string): Promise<void> {
  await pb.collection('project_versions').delete(id)
}

// ---------- Vorlagen (pro Person) ----------

interface TemplateRecord {
  id: string
  name: string
  createdAt: number
  items: TemplateItem[]
}

export async function listTemplates(): Promise<LayoutTemplate[]> {
  const records = await pb.collection<TemplateRecord>('templates').getFullList({
    sort: '-createdAt',
    fields: 'id,name,createdAt,items',
  })
  return records.map(({ id, name, createdAt, items }) => ({ id, name, createdAt, items }))
}

export async function createTemplate(t: LayoutTemplate): Promise<void> {
  await pb.collection('templates').create({ ...t, ...byMe('owner') })
}

export async function deleteTemplate(id: string): Promise<void> {
  await pb.collection('templates').delete(id)
}

// ---------- Mitglieder (server/pb_hooks/members.pb.js) ----------

const membersPath = (projectId: string) => `/api/stadthalle/projects/${encodeURIComponent(projectId)}/members`

export function listMembers(projectId: string): Promise<Member[]> {
  return pb.send(membersPath(projectId), { method: 'GET' })
}

/** Lädt per E-Mail ein (legt den Account bei Bedarf an) oder ändert die Rolle eines Mitglieds. */
export function inviteMember(projectId: string, email: string, role: 'editor' | 'viewer'): Promise<Member[]> {
  return pb.send(membersPath(projectId), { method: 'POST', body: { email, role } })
}

export function removeMember(projectId: string, userId: string): Promise<Member[]> {
  return pb.send(`${membersPath(projectId)}/${encodeURIComponent(userId)}`, { method: 'DELETE' })
}

/** Alle Accounts (Name, E-Mail) – zum Auswählen beim Freigeben. */
export function listAccounts(): Promise<{ id: string; email: string; name: string }[]> {
  return pb.send('/api/stadthalle/accounts', { method: 'GET' })
}

// ---------- Benutzerverwaltung (nur Admins, server/pb_migrations/1791158700_accounts_and_login.js) ----------

export type AccountRole = 'superadmin' | 'admin' | 'user'

export interface Account {
  id: string
  email: string
  name: string
  role: AccountRole
}

const users = () => pb.collection('users')

export async function listAllAccounts(): Promise<Account[]> {
  const records = await users().getFullList({ sort: 'name,email', fields: 'id,email,name,role' })
  // Accounts von vor der Rollen-Einführung haben keine Rolle → normal.
  return records.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role === 'superadmin' || r.role === 'admin' ? r.role : 'user',
  }))
}

export async function createAccount(a: { email: string; name: string; password: string; role: 'admin' | 'user' }): Promise<void> {
  await users().create({ ...a, passwordConfirm: a.password })
}

export async function updateAccount(id: string, patch: { role?: 'admin' | 'user'; password?: string; disabled?: boolean }): Promise<void> {
  const { password, ...rest } = patch
  await users().update(id, password ? { ...rest, password, passwordConfirm: password } : rest)
}

export async function deleteAccount(id: string): Promise<void> {
  await users().delete(id)
}

// ---------- Benutzerverwaltung v2 (server/pb_hooks/account_admin.pb.js, Migration 1791159000) ----------

export interface ServerFeatures {
  features: number
  mailEnabled: boolean
  minPassword: number
}

/** Was der Server kann; null, wenn er noch nicht aktualisiert ist (dann zeigt die App die einfache Verwaltung). */
export async function serverFeatures(): Promise<ServerFeatures | null> {
  try {
    const f = await pb.send<ServerFeatures>('/api/stadthalle/config', { method: 'GET' })
    return f && typeof f.features === 'number' ? f : null
  } catch {
    return null
  }
}

export interface AccountOverview {
  id: string
  email: string
  name: string
  role: AccountRole
  disabled: boolean
  /** Zeitpunkt der letzten Anmeldung, leer = noch nie. */
  lastLogin: string
  /** Gesetzt, solange die Einladung nicht angenommen wurde. */
  invitedAt: string
  created: string
  /** Anzahl Projekte, die der Account besitzt. */
  projects: number
}

export type AccountStatus = 'active' | 'invited' | 'disabled'

export function accountStatus(a: Pick<AccountOverview, 'disabled' | 'invitedAt'>): AccountStatus {
  return a.disabled ? 'disabled' : a.invitedAt ? 'invited' : 'active'
}

export function accountsOverview(): Promise<AccountOverview[]> {
  return pb.send('/api/stadthalle/accounts/overview', { method: 'GET' })
}

export interface TokenLink {
  token: string
  expires: string
  emailSent: boolean
  kind?: 'invite' | 'reset'
}

export function inviteAccount(a: { email: string; name: string; role: 'admin' | 'user' }): Promise<TokenLink & { account: AccountOverview }> {
  return pb.send('/api/stadthalle/accounts/invite', { method: 'POST', body: a })
}

export function createResetLink(accountId: string): Promise<TokenLink & { kind: 'invite' | 'reset' }> {
  return pb.send(`/api/stadthalle/accounts/${accountId}/reset-link`, { method: 'POST' })
}

export function transferProjects(fromId: string, toUserId: string): Promise<{ projects: number; templates: number }> {
  return pb.send(`/api/stadthalle/accounts/${fromId}/transfer`, { method: 'POST', body: { toUserId } })
}

/** Adresse, unter der ein Einladungs- bzw. Reset-Link geöffnet wird. */
export function tokenLink(kind: 'invite' | 'reset', token: string): string {
  return `${window.location.origin}/#/${kind === 'invite' ? 'einladung' : 'passwort'}/${token}`
}

export function tokenInfo(token: string): Promise<{ kind: 'invite' | 'reset'; email: string; name: string }> {
  return pb.send(`/api/stadthalle/token/${encodeURIComponent(token)}`, { method: 'GET' })
}

export function redeemToken(token: string, password: string): Promise<{ email: string }> {
  return pb.send(`/api/stadthalle/token/${encodeURIComponent(token)}/redeem`, { method: 'POST', body: { password } })
}

export function forgotPassword(email: string): Promise<{ mailEnabled: boolean }> {
  return pb.send('/api/stadthalle/forgot', { method: 'POST', body: { email } })
}

// ---------- Betrachter-Links (server/pb_hooks/shares.pb.js) ----------

export interface ShareLink {
  id: string
  created: string
  createdByName: string
  /** Leer = unbegrenzt. */
  expires: string
  revoked: boolean
  expired: boolean
  lastUsed: string
}

export function listShareLinks(projectId: string): Promise<ShareLink[]> {
  return pb.send(`/api/stadthalle/projects/${projectId}/share-links`, { method: 'GET' })
}

/** `days` 0 = unbegrenzt. Der Token steht nur in dieser Antwort. */
export function createShareLink(projectId: string, days: number): Promise<ShareLink & { token: string }> {
  return pb.send(`/api/stadthalle/projects/${projectId}/share-links`, { method: 'POST', body: { days } })
}

export async function revokeShareLink(projectId: string, linkId: string): Promise<void> {
  await pb.send(`/api/stadthalle/projects/${projectId}/share-links/${linkId}`, { method: 'DELETE' })
}

export function shareUrl(token: string): string {
  return `${window.location.origin}/#/ansicht/${token}`
}

export function loadShared(token: string): Promise<{ name: string; data: ProjectData | null; updated: string }> {
  return pb.send(`/api/stadthalle/shared/${encodeURIComponent(token)}`, { method: 'GET' })
}
