// Company logo for storage and documents: at most 600 px on its long side (a phone photo kept as is would fill the app's
// storage on its own); PNG when that stays small (keeps transparency), else JPEG on white. PDFs take PNG and JPEG.
const MAX_SIDE = 600
const PNG_LIMIT = 300_000

export async function shrinkLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('logo')); i.src = url })
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('logo')
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k))
    const g = c.getContext('2d'); if (!g) throw new Error('logo')
    g.drawImage(img, 0, 0, c.width, c.height)
    if (file.type === 'image/png') { const png = c.toDataURL('image/png'); if (png.length <= PNG_LIMIT) return png }
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.88)
  } finally { URL.revokeObjectURL(url) }
}
