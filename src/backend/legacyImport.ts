import { ClientResponseError } from 'pocketbase'
import { v4 as uuid } from 'uuid'
import * as api from './api'
import { pb } from './pb'
import { loadProjectData, loadProjectVersions } from '../utils/projectStorage'
import { loadTemplates } from '../utils/templateStorage'

/**
 * Einmalige Übernahme der Projekte, Versionen und Vorlagen, die vor dem Backend nur im
 * localStorage dieses Browsers lagen. Die lokalen Daten bleiben als Sicherung liegen;
 * übernommene IDs werden gemerkt, damit nichts doppelt hochgeladen wird.
 */

const MIGRATED_KEY = 'whu-planner-migrated-ids'

interface LegacyMeta {
  id: string
  name: string
}

function legacyProjects(): LegacyMeta[] {
  try {
    const raw = localStorage.getItem('whu-planner-projects')
    const projects = raw ? (JSON.parse(raw)?.state?.projects as LegacyMeta[] | undefined) : undefined
    return (projects ?? []).filter((p) => loadProjectData(p.id))
  } catch {
    return []
  }
}

function migratedIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(MIGRATED_KEY) || '[]') as string[])
  } catch {
    return new Set()
  }
}

function markMigrated(id: string) {
  const ids = migratedIds()
  ids.add(id)
  localStorage.setItem(MIGRATED_KEY, JSON.stringify([...ids]))
}

export function pendingLegacyData(): { projects: number; templates: number } {
  const done = migratedIds()
  return {
    projects: legacyProjects().filter((p) => !done.has(p.id)).length,
    templates: loadTemplates().filter((t) => !done.has(t.id)).length,
  }
}

/** Anlegen mit der bisherigen ID; ist sie schon vergeben, false (statt Fehler). */
async function createKeepingId(create: () => Promise<unknown>): Promise<boolean> {
  try {
    await create()
    return true
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 400 && err.response?.data?.id) return false
    throw err
  }
}

export async function migrateLegacyData(): Promise<{ projects: number; versions: number; templates: number }> {
  const done = migratedIds()
  const result = { projects: 0, versions: 0, templates: 0 }

  for (const meta of legacyProjects()) {
    if (done.has(meta.id)) continue
    const data = loadProjectData(meta.id)!

    // Gleiche ID wie bisher, damit eine abgebrochene Übernahme beim nächsten Mal weitermacht.
    // Ist die ID schon vergeben und das Projekt für uns sichtbar, war es schon übernommen;
    // sonst gehört sie fremd (anderer Account am selben Rechner) → neue ID.
    let projectId = meta.id
    let freshIds = false
    if (await createKeepingId(() => api.createProject(meta.name, data, meta.id))) {
      result.projects++
    } else {
      const visible = await pb.collection('projects').getOne(meta.id, { fields: 'id' }).then(
        () => true,
        () => false,
      )
      if (!visible) {
        projectId = await api.createProject(meta.name, data)
        freshIds = true
        result.projects++
      }
    }

    for (const v of loadProjectVersions(meta.id)) {
      const version = freshIds ? { ...v, id: uuid() } : v
      if (await createKeepingId(() => api.createVersion(projectId, version))) result.versions++
    }
    markMigrated(meta.id)
  }

  for (const t of loadTemplates()) {
    if (done.has(t.id)) continue
    if (await createKeepingId(() => api.createTemplate(t))) result.templates++
    markMigrated(t.id)
  }

  return result
}
