/** Markenbilder für Exporte (PDF): SVG aus public/brand/ als PNG-DataURL, damit jsPDF es einbetten kann. */
export async function brandLogoPng(widthPx = 1200): Promise<{ dataUrl: string; aspect: number } | null> {
  try {
    const img = new Image()
    img.src = '/brand/whu-event-logo-black.svg'
    await img.decode()
    const aspect = img.naturalHeight / img.naturalWidth
    const canvas = document.createElement('canvas')
    canvas.width = widthPx
    canvas.height = Math.round(widthPx * aspect)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/png'), aspect }
  } catch {
    return null
  }
}
