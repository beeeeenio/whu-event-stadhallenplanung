import { v4 as uuid } from 'uuid'
import { unpackZip } from './zipHelper'
import type { ProjectData, ProjectVersion } from './projectStorage'
import type { LayoutTemplate } from './templateStorage'
import type { ExportManifest } from './exportProject'
import * as api from '../backend/api'

export interface ImportResult {
  imported: { projectId: string; name: string }[]
  skipped: { projectId: string; reason: string }[]
  templateCount: number
}

interface ExportedMeta {
  id: string
  name: string
}

export interface ImportData {
  manifest: ExportManifest
  projects: ExportedMeta[]
  templates: LayoutTemplate[]
  projectData: Record<string, { data: ProjectData; versions?: ProjectVersion[] }>
}

export async function parseExportZip(blob: Blob): Promise<ImportData> {
  const files = await unpackZip(blob)

  const manifestJson = files['manifest.json']
  if (!manifestJson) throw new Error('manifest.json not found in ZIP')
  const manifest: ExportManifest = JSON.parse(manifestJson)

  const projects: ExportedMeta[] = JSON.parse(files['projects.json'] || '[]')
  const templates: LayoutTemplate[] = JSON.parse(files['templates.json'] || '[]')

  const projectData: ImportData['projectData'] = {}
  for (const projectId of manifest.projectIds) {
    const dataJson = files[`projects/${projectId}/data.json`]
    if (!dataJson) continue
    const versionsJson = files[`projects/${projectId}/versions.json`]
    projectData[projectId] = { data: JSON.parse(dataJson), versions: versionsJson ? JSON.parse(versionsJson) : undefined }
  }

  return { manifest, projects, templates, projectData }
}

/**
 * ZIP-Export auf den Server einspielen. Projekte, die es schon gibt, werden je nach Wahl
 * überschrieben (nur mit Schreibrecht) oder als Kopie angelegt. Versionen bekommen immer
 * neue IDs; Vorlagen kommen zu den eigenen dazu, sofern noch nicht vorhanden.
 */
export async function importAllProjects(
  file: File,
  onMergeDuplicates: (
    duplicates: { projectId: string; name: string }[],
  ) => Promise<'overwrite' | 'keepBoth' | 'cancel'>,
): Promise<ImportResult> {
  const data = await parseExportZip(file)
  const imported: ImportResult['imported'] = []
  const skipped: ImportResult['skipped'] = []

  const existing = new Map((await api.listProjects()).map((p) => [p.id, p]))
  const duplicates = data.projects.filter((p) => existing.has(p.id))

  let strategy: 'overwrite' | 'keepBoth' | 'cancel' = 'keepBoth'
  if (duplicates.length > 0) {
    strategy = await onMergeDuplicates(duplicates.map((p) => ({ projectId: p.id, name: p.name })))
  }
  if (strategy === 'cancel') return { imported, skipped, templateCount: 0 }

  for (const meta of data.projects) {
    const content = data.projectData[meta.id]
    if (!content) {
      skipped.push({ projectId: meta.id, reason: 'No data.json found' })
      continue
    }
    try {
      let projectId: string
      const current = existing.get(meta.id)
      if (current && strategy === 'overwrite') {
        if (current.role === 'viewer') {
          skipped.push({ projectId: meta.id, reason: 'Nur Leserechte' })
          continue
        }
        const { version } = await api.loadProject(meta.id)
        await api.saveProjectData(meta.id, content.data, version + 1)
        await api.renameProject(meta.id, meta.name)
        projectId = meta.id
      } else {
        // Neue ID, wenn sie hier schon existiert oder (für uns unsichtbar) anderweitig vergeben ist.
        projectId = current ? uuid() : meta.id
        try {
          await api.createProject(meta.name, content.data, projectId)
        } catch {
          projectId = await api.createProject(meta.name, content.data)
        }
      }
      for (const v of content.versions ?? []) {
        await api.createVersion(projectId, { ...v, id: uuid() })
      }
      imported.push({ projectId, name: meta.name })
    } catch (err) {
      skipped.push({ projectId: meta.id, reason: (err as Error).message })
    }
  }

  let templateCount = 0
  try {
    const own = new Set((await api.listTemplates()).map((t) => t.id))
    for (const t of data.templates) {
      if (own.has(t.id)) continue
      await api.createTemplate(t).catch(() => api.createTemplate({ ...t, id: uuid() }))
      templateCount++
    }
  } catch (err) {
    console.warn('Failed to import templates:', err)
  }

  return { imported, skipped, templateCount }
}
