import { v4 as uuid } from 'uuid'
import { currentUserId, myRole, parseDate, pb, type ProjectRecord, type Role } from './pb'
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
  role: Role
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
  const records = await projects().getFullList({ fields: 'id,name,updated,owner,editors,viewers', sort: '-updated' })
  return records.map((r) => ({ id: r.id, name: r.name, updatedAt: parseDate(r.updated), role: myRole(r) }))
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
  const r = await projects().update(id, { data, version }, { fields: 'version' })
  return r.version
}

export async function renameProject(id: string, name: string): Promise<void> {
  await projects().update(id, { name }, { fields: 'id' })
}

export async function deleteProject(id: string): Promise<void> {
  await projects().delete(id)
}

/** Eigene Kopie samt Versionen – auch von Projekten, die man nur ansehen darf. */
export async function duplicateProject(sourceId: string, name: string): Promise<string> {
  const [source, versions] = await Promise.all([loadProject(sourceId), listVersions(sourceId)])
  const id = await createProject(name, source.data ?? ({} as ProjectData))
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
}

export async function listVersions(projectId: string): Promise<ProjectVersion[]> {
  const records = await pb.collection<VersionRecord>('project_versions').getFullList({
    filter: pb.filter('project = {:projectId}', { projectId }),
    sort: '-createdAt',
    fields: 'id,name,createdAt,data',
  })
  return records.map(({ id, name, createdAt, data }) => ({ id, name, createdAt, data }))
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

export type AccountRole = 'admin' | 'user'

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
  return records.map((r) => ({ id: r.id, email: r.email, name: r.name, role: r.role === 'admin' ? 'admin' : 'user' }))
}

export async function createAccount(a: { email: string; name: string; password: string; role: AccountRole }): Promise<void> {
  await users().create({ ...a, passwordConfirm: a.password, verified: true })
}

export async function updateAccount(id: string, patch: { role?: AccountRole; password?: string }): Promise<void> {
  const { password, ...rest } = patch
  await users().update(id, password ? { ...rest, password, passwordConfirm: password } : rest)
}

export async function deleteAccount(id: string): Promise<void> {
  await users().delete(id)
}
