import { createZip, calculateSha256 } from './zipHelper'
import { loadProjectData, loadProjectVersions } from './projectStorage'
import { loadTemplates, type LayoutTemplate } from './templateStorage'
import type { ProjectMeta } from '../store/projectsStore'

export interface ExportManifest {
  version: 1
  exportedAt: string
  projectCount: number
  projectIds: string[]
  checksums: Record<string, string>
}

export async function exportAllProjects(): Promise<Blob> {
  const projectsMetaJson = localStorage.getItem('whu-planner-projects')
  const projectsData = projectsMetaJson ? JSON.parse(projectsMetaJson) : {}
  const projects: ProjectMeta[] = projectsData.state?.projects || []

  const templates: LayoutTemplate[] = loadTemplates()

  const files: Record<string, string> = {}
  const checksums: Record<string, string> = {}

  const projectsJson = JSON.stringify(projects)
  files['projects.json'] = projectsJson
  checksums['projects.json'] = await calculateSha256(projectsJson)

  const templatesJson = JSON.stringify(templates)
  files['templates.json'] = templatesJson
  checksums['templates.json'] = await calculateSha256(templatesJson)

  for (const projectMeta of projects) {
    const data = loadProjectData(projectMeta.id)
    if (data) {
      const dataJson = JSON.stringify(data)
      files[`projects/${projectMeta.id}/data.json`] = dataJson
      checksums[`projects/${projectMeta.id}/data.json`] = await calculateSha256(dataJson)
    }

    const versions = loadProjectVersions(projectMeta.id)
    if (versions.length > 0) {
      const versionsJson = JSON.stringify(versions)
      files[`projects/${projectMeta.id}/versions.json`] = versionsJson
      checksums[`projects/${projectMeta.id}/versions.json`] = await calculateSha256(versionsJson)
    }
  }

  const manifest: ExportManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projectCount: projects.length,
    projectIds: projects.map((p) => p.id),
    checksums,
  }

  const manifestJson = JSON.stringify(manifest)
  files['manifest.json'] = manifestJson

  const zipBlob = await createZip(files)
  return zipBlob
}

export function generateExportFilename(eventName?: string): string {
  const name = eventName?.replace(/\s+/g, '_') || 'export'
  const date = new Date().toISOString().split('T')[0]
  return `event-export-${name}-${date}.zip`
}
