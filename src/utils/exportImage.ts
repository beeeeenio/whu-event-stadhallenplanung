import type Konva from 'konva'

/**
 * Exports the canvas as a PNG image.
 * @param stageRef Reference to the Konva Stage
 * @param filename Filename for the exported image (without extension)
 * @param scale Optional pixel ratio for the export (default: 1.5)
 */
export async function exportCanvasAsImage(
  stageRef: React.RefObject<Konva.Stage | null>,
  filename: string,
  scale: number = 1.5,
): Promise<void> {
  const stage = stageRef.current
  if (!stage) {
    return
  }

  // Export as PNG with high quality
  const dataUrl = stage.toDataURL({
    pixelRatio: scale,
    mimeType: 'image/png',
  })

  // Convert data URL to blob
  const response = await fetch(dataUrl)
  const blob = await response.blob()

  // Create download link
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.png`
  a.click()
  URL.revokeObjectURL(url)
}
