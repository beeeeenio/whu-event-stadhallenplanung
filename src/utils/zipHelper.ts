import JSZip from 'jszip'

export async function createZip(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content)
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function unpackZip(blob: Blob): Promise<Record<string, string>> {
  const zip = new JSZip()
  await zip.loadAsync(blob)
  const result: Record<string, string> = {}
  for (const [path, file] of Object.entries(zip.files)) {
    if (!file.dir) {
      result[path] = await file.async('text')
    }
  }
  return result
}

export async function calculateSha256(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256-${hashHex}`
}
