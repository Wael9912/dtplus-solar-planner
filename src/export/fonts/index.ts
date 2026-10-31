// IBM Plex Sans Arabic (SIL OFL 1.1, see OFL.txt): the PDF font for both languages. It covers Latin, Arabic and the
// Arabic Presentation Forms-B that jsPDF's built-in shaper emits. The TTFs are emitted as separate hashed assets
// (`?url`) and fetched only when a PDF is generated, so they never reach the main bundle.
import regularUrl from './IBMPlexSansArabic-Regular.ttf?url'
import boldUrl from './IBMPlexSansArabic-Bold.ttf?url'

/** Base64-encoded TTF files, ready for `jsPDF.addFileToVFS`. */
export interface PdfFontData { regular: string; bold: string }

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
async function fetchBase64(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Font download failed (${res.status})`)
  return toBase64(await res.arrayBuffer())
}

let loader = async (): Promise<PdfFontData> => {
  const [regular, bold] = await Promise.all([fetchBase64(regularUrl), fetchBase64(boldUrl)])
  return { regular, bold }
}
let cache: Promise<PdfFontData> | null = null

/** Loads both weights once per session (a failed attempt is retried on the next call). */
export function loadPdfFonts(): Promise<PdfFontData> {
  if (!cache) cache = loader().catch((e) => { cache = null; throw e })
  return cache
}
/** Replace the loader (node scripts/tests read the TTFs from disk instead of fetching them). */
export function setPdfFontLoader(fn: () => Promise<PdfFontData>) { loader = fn; cache = null }
