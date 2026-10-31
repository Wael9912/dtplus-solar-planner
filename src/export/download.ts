// Getting a generated file to the user: Web Share (phones: WhatsApp, Mail, Files) with a download fallback.

/** Save a blob through a temporary <a download> link. The object URL is kept alive long enough for slow mobile browsers. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none'
  document.body.appendChild(a); a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 60_000)
}

const asFile = (blob: Blob, name: string) => new File([blob], name, { type: blob.type || 'application/octet-stream', lastModified: Date.now() })

/** true when this browser can share files of this type through the OS share sheet. */
export function canShareFiles(type = 'application/pdf', name = 'file.pdf') {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([new Uint8Array(1)], name, { type })] })
  } catch { return false }
}

/** Phones and tablets (touch-first): sharing is the primary action there. */
export const isTouchDevice = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

export type ShareResult = 'shared' | 'cancelled' | 'needs-gesture' | 'unsupported'
/**
 * Open the share sheet with the file. 'needs-gesture' means the browser refused because the tap that started a slow
 * export has expired — show a "Tap to share" button that calls this again with the same blob.
 */
export async function shareFile(blob: Blob, name: string, title?: string): Promise<ShareResult> {
  const file = asFile(blob, name)
  if (typeof navigator.share !== 'function' || !navigator.canShare?.({ files: [file] })) return 'unsupported'
  try {
    await navigator.share({ files: [file], title: title ?? name })
    return 'shared'
  } catch (e) {
    const n = (e as DOMException)?.name
    if (n === 'AbortError') return 'cancelled'
    if (n === 'NotAllowedError') return 'needs-gesture'
    return 'unsupported'
  }
}
