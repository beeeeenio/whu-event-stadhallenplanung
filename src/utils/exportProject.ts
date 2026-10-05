import { createZip, calculateSha256 } from './zipHelper'
import * as api from '../backend/api'

export interface ExportManifest {
  version: 1
  exportedAt: string
  projectCount: number
  projectIds: string[]
  checksums: Record<string, string>
}

/** Alle sichtbaren Projekte (mit Versionen) und die eigenen Vorlagen als ZIP – Format wie vor dem Backend. */
export async function exportAllProjects(): Promise<Blob> {
  const projects = (await api.listProjects()).map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
  const templates = await api.listTemplates()

  const files: Record<string, string> = {}
  const checksums: Record<string, string> = {}
  const add = async (path: string, content: string) => {
    files[path] = content
    checksums[path] = await calculateSha256(content)
  }

  await add('projects.json', JSON.stringify(projects))
  await add('templates.json', JSON.stringify(templates))

  for (const meta of projects) {
    const [{ data }, versions] = await Promise.all([api.loadProject(meta.id), api.listVersions(meta.id)])
    if (data) await add(`projects/${meta.id}/data.json`, JSON.stringify(data))
    if (versions.length > 0) await add(`projects/${meta.id}/versions.json`, JSON.stringify(versions))
  }

  const manifest: ExportManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projectCount: projects.length,
    projectIds: projects.map((p) => p.id),
    checksums,
  }
  files['manifest.json'] = JSON.stringify(manifest)

  return createZip(files)
}

export function generateExportFilename(eventName?: string): string {
  const name = eventName?.replace(/\s+/g, '_') || 'export'
  const date = new Date().toISOString().split('T')[0]
  return `event-export-${name}-${date}.zip`
}
