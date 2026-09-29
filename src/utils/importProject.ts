import { unpackZip, calculateSha256 } from './zipHelper'
import { saveProjectData, saveProjectVersions, type ProjectVersion } from './projectStorage'
import { mergeTemplates, type LayoutTemplate } from './templateStorage'
import type { ProjectMeta } from '../store/projectsStore'
import type { ExportManifest } from './exportProject'

export interface ImportResult {
  imported: { projectId: string; name: string }[]
  skipped: { projectId: string; reason: string }[]
  templateCount: number
}

export interface ImportData {
  manifest: ExportManifest
  projects: ProjectMeta[]
  templates: LayoutTemplate[]
  projectData: Record<string, { data: any; versions?: ProjectVersion[] }>
}

export async function parseExportZip(blob: Blob): Promise<ImportData> {
  const files = await unpackZip(blob)

  const manifestJson = files['manifest.json']
  if (!manifestJson) throw new Error('manifest.json not found in ZIP')
  const manifest: ExportManifest = JSON.parse(manifestJson)

  const projectsJson = files['projects.json'] || '[]'
  const projects: ProjectMeta[] = JSON.parse(projectsJson)

  const templatesJson = files['templates.json'] || '[]'
  const templates: LayoutTemplate[] = JSON.parse(templatesJson)

  const projectData: Record<string, { data: any; versions?: ProjectVersion[] }> = {}

  for (const projectId of manifest.projectIds) {
    const dataJson = files[`projects/${projectId}/data.json`]
    if (!dataJson) continue

    const data = JSON.parse(dataJson)
    const versionsJson = files[`projects/${projectId}/versions.json`]
    const versions = versionsJson ? JSON.parse(versionsJson) : undefined

    projectData[projectId] = { data, versions }
  }

  return { manifest, projects, templates, projectData }
}

export async function validateImportData(data: ImportData): Promise<string[]> {
  const errors: string[] = []

  if (data.manifest.version !== 1) {
    errors.push('Unsupported manifest version')
  }

  for (const [path, hash] of Object.entries(data.manifest.checksums)) {
    const files = await unpackZip(
      await fetch('blob:' + (typeof window !== 'undefined' ? window.location.href : '')).then((r) => r.blob()),
    )
    const content = files[path]
    if (content) {
      const calculatedHash = await calculateSha256(content)
      if (calculatedHash !== hash) {
        errors.push(`Checksum mismatch for ${path}`)
      }
    }
  }

  return errors
}

export async function importAllProjects(
  file: File,
  onMergeDuplicates: (
    duplicates: { projectId: string; name: string }[],
  ) => Promise<'overwrite' | 'keepBoth' | 'cancel'>,
): Promise<ImportResult> {
  const data = await parseExportZip(file)
  const imported: { projectId: string; name: string }[] = []
  const skipped: { projectId: string; reason: string }[] = []

  const projectsMetaJson = localStorage.getItem('whu-planner-projects')
  const projectsData = projectsMetaJson ? JSON.parse(projectsMetaJson) : {}
  const existingProjects: ProjectMeta[] = projectsData.state?.projects || []
  const existingIds = new Set(existingProjects.map((p) => p.id))

  const duplicates = data.projects.filter((p) => existingIds.has(p.id))

  let mergeStrategy: 'overwrite' | 'keepBoth' | 'cancel' = 'keepBoth'
  if (duplicates.length > 0) {
    mergeStrategy = await onMergeDuplicates(duplicates.map((p) => ({ projectId: p.id, name: p.name })))
  }

  if (mergeStrategy === 'cancel') {
    return { imported, skipped, templateCount: 0 }
  }

  const newProjects: ProjectMeta[] = []
  for (const projectMeta of data.projects) {
    let finalId = projectMeta.id

    if (existingIds.has(projectMeta.id)) {
      if (mergeStrategy === 'keepBoth') {
        finalId = `${projectMeta.id}_imported`
        while (existingIds.has(finalId)) {
          finalId = `${finalId}_2`
        }
      }
    }

    const projectContent = data.projectData[projectMeta.id]
    if (!projectContent) {
      skipped.push({ projectId: projectMeta.id, reason: 'No data.json found' })
      continue
    }

    try {
      const finalMeta: ProjectMeta = {
        id: finalId,
        name: projectMeta.name,
        updatedAt: Date.now(),
      }

      saveProjectData(finalId, projectContent.data)
      if (projectContent.versions) {
        saveProjectVersions(finalId, projectContent.versions)
      }

      newProjects.push(finalMeta)
      imported.push({ projectId: finalId, name: projectMeta.name })
      existingIds.add(finalId)
    } catch (err) {
      skipped.push({ projectId: projectMeta.id, reason: (err as Error).message })
    }
  }

  const mergedProjects =
    mergeStrategy === 'overwrite'
      ? [
          ...existingProjects.filter((p) => !duplicates.map((d) => d.id).includes(p.id)),
          ...newProjects,
        ]
      : [...existingProjects, ...newProjects]

  try {
    const projectsMetaJson = localStorage.getItem('whu-planner-projects')
    const projectsData = projectsMetaJson ? JSON.parse(projectsMetaJson) : { state: {} }
    projectsData.state.projects = mergedProjects
    localStorage.setItem('whu-planner-projects', JSON.stringify(projectsData))
  } catch (err) {
    throw new Error(`Failed to update projects metadata: ${(err as Error).message}`)
  }

  try {
    mergeTemplates(data.templates)
  } catch (err) {
    console.warn('Failed to import templates:', err)
  }

  return {
    imported,
    skipped,
    templateCount: data.templates.length,
  }
}
