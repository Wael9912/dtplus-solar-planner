// Low-level PDF helpers shared by the proposal and the technical report: font set-up, glyph safety, bidi (Arabic) handling,
// mirrored (RTL) tables, page header and footer.
//
// Arabic in jsPDF 4: the built-in shaper maps letters to Arabic Presentation Forms-B, so the embedded font must have them
// (IBM Plex Sans Arabic does; Cairo/Tajawal drop letters). Strings that contain Arabic are drawn with explicit bidi options
// (logical input → visual output, RTL paragraph, mirrored brackets); Latin/number runs inside them are wrapped in LRMs so
// "6.96 kWp" or "$1,234.00" keep their order. jspdf-autotable's default text options reverse Arabic cells, so every cell
// gets the same options through `didParseCell`.
import { jsPDF } from 'jspdf'
import autoTable, { __createTable, type CellHookData, type RowInput, type CellInput, type Styles, type UserOptions, type TextOptions } from 'jspdf-autotable'
import type { CompanySettings } from '../engine/types'
import type { PdfFontData } from './fonts'

export type RGB = [number, number, number]
export const INK: RGB = [15, 23, 42]
export const SLATE: RGB = [51, 65, 85]
export const MUTED: RGB = [100, 116, 139]
export const FAINT: RGB = [148, 163, 184]
export const RULE: RGB = [226, 232, 240]
export const WHITE: RGB = [255, 255, 255]
export const FONT_FAMILY = 'PlexArabic'

export const hex2rgb = (h: string): RGB => {
  const m = (h || '').replace('#', '')
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16))
  return rgb.every((x) => Number.isFinite(x)) ? (rgb as RGB) : [15, 118, 110]
}
/** Tint a colour towards white (t = 0 → colour, 1 → white). */
export const tint = (c: RGB, t: number): RGB => c.map((x) => Math.round(x + (255 - x) * t)) as RGB

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/
export const hasArabic = (s: string) => ARABIC.test(s)
const LRM = '\u200E'

// Stand-ins for characters a PDF font cannot draw. Applied only when the active font lacks the glyph.
const SUBST: Record<string, string> = {
  '≈': '~', '≅': '~', '→': '->', '←': '<-', '⇒': '=>', '≤': '<=', '≥': '>=', '≠': '!=', '✓': 'OK', '✔': 'OK', '✗': 'X', '✘': 'X', '×': 'x',
  '₂': '2', '₃': '3', '²': '2', '³': '3', 'ρ': 'rho', 'Ω': 'ohm', 'μ': 'u', 'µ': 'u', 'η': 'eff.', 'β': 'beta', 'Δ': 'delta', 'π': 'pi', '√': 'sqrt', '·': '.', '∙': '.', '•': '-',
  '−': '-', '–': '-', '—': '-', '‐': '-', '‑': '-', '…': '...', '‘': "'", '’': "'", '′': "'", '“': '"', '”': '"', '″': '"', '€': 'EUR', '™': '(TM)', '⌀': 'dia.', '★': '*',
  '°': ' deg', '±': '+/-', '\u200E': '', '\u200F': '',
}
const latin1 = (cp: number) => (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)

/**
 * Make a string printable with the active PDF font: characters the font has are kept, known symbols it lacks become readable
 * ASCII stand-ins (≈ → ~, ≤ → <=, ✓ → OK, Ω → ohm, − → -, ₂ → 2 …), invisible controls are dropped and anything else becomes "?".
 * Default `has` = the Latin-1 range of jsPDF's core Helvetica.
 */
export function pdfSafe(s: string, has: (cp: number) => boolean = latin1): string {
  let out = ''
  for (const ch of String(s ?? '')) {
    const cp = ch.codePointAt(0)!
    if (ch === '\n') { out += ch; continue }
    if (ch === '\t' || ch === '\r') { out += ' '; continue }
    if (cp < 0x20 || (cp >= 0x200b && cp <= 0x200d) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0xfeff) continue
    if (has(cp)) { out += ch; continue }
    const sub = SUBST[ch]
    out += sub === undefined ? '?' : [...sub].every((c) => has(c.codePointAt(0)!)) ? sub : pdfSafe(sub, latin1)
  }
  return out
}

/** true when the first strong character is Arabic (the string's natural paragraph direction is RTL). */
export function firstStrongRtl(s: string) {
  for (const ch of s) { if (ARABIC.test(ch)) return true; if (/\p{L}/u.test(ch)) return false }
  return false
}
// A Latin/number run inside Arabic text: starts with a letter, digit, currency sign or a minus before a digit; ends with a letter, digit, % ² ° or +.
const LATIN_RUN = /(?:[-−](?=\d)|[A-Za-z0-9\u00C0-\u024F$€£¥₦₹₺])(?:[A-Za-z0-9\u00C0-\u024F$€£¥₦₹₺− .,:;/×%+°²³µ·#&'_~=<>*-]*[A-Za-z0-9\u00C0-\u024F%°²³+])?/g
/** Wrap Latin/number runs in LRMs so the bidi algorithm keeps them in reading order inside RTL text. */
export const isolateLatin = (s: string) => s.replace(LATIN_RUN, (m) => LRM + m + LRM)
// jsPDF's shaper treats every U+0600–06FF character as a joining letter and has no mark positioning: drop the harakat and put a
// ZWNJ (zero-width, non-joining) before Arabic punctuation so "الياسمين،" ends in a final نـ, not an initial one.
const HARAKAT = /[\u064B-\u065F\u0670]/g
const AR_PUNCT = /([\u0600-\u06FF])([\u060C\u061B\u061F\u066A-\u066D\u06D4])/g
/** Prepare an Arabic-containing line for jsPDF: shaping fixes + LTR isolation of Latin runs. */
export const arabicLine = (s: string) => isolateLatin(s.replace(HARAKAT, '').replace(AR_PUNCT, '$1\u200C$2'))
// After jsPDF's Arabic shaper (preProcessText) the ZWNJs have done their job: remove them before bidi and output so they don't
// end up in the PDF text layer (copy/paste and search would see a split word). Handlers pushed after jsPDF's own run first.
type TextPayload = { text: string | (string | [string, number, number])[] }
const ZWNJ = /\u200C/g
const stripZwnj = (t: TextPayload['text']): TextPayload['text'] =>
  typeof t === 'string' ? t.replace(ZWNJ, '') : t.map((x) => (typeof x === 'string' ? x.replace(ZWNJ, '') : Array.isArray(x) ? [String(x[0]).replace(ZWNJ, ''), x[1], x[2]] as [string, number, number] : x))
const api = jsPDF.API as unknown as { events: unknown[][]; __dtStripZwnj?: boolean }
if (!api.__dtStripZwnj) { api.__dtStripZwnj = true; api.events.push(['postProcessText', (p: TextPayload) => { if (p?.text != null) p.text = stripZwnj(p.text) }]) }

const bidiOptions = (rtl: boolean): TextOptions => ({ isInputVisual: false, isOutputVisual: true, isInputRtl: rtl, isOutputRtl: false, isSymmetricSwapping: true })

type Align = 'left' | 'right' | 'center'
export type TableOptions = Omit<UserOptions, 'head' | 'body' | 'columnStyles'> & { head?: CellInput[][]; body: CellInput[][]; columnStyles?: Record<number, Partial<Styles>> }
export interface TextStyle { align?: Align; bold?: boolean; size?: number; color?: RGB; maxWidth?: number; lineGap?: number }

export class Pdf {
  readonly doc: jsPDF
  readonly rtl: boolean
  /** An embedded Unicode font is active (Arabic and symbols available). */
  readonly unicode: boolean
  readonly family: string
  readonly brand: RGB
  readonly W = 210
  readonly H = 297
  readonly M = 14
  readonly top = 20
  readonly bottom = 280
  private readonly has: (cp: number) => boolean

  constructor(o: { rtl: boolean; brandHex: string; fonts: PdfFontData | null }) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    this.rtl = o.rtl
    this.brand = hex2rgb(o.brandHex || '#0f766e')
    let has = latin1, family = 'helvetica', unicode = false
    if (o.fonts) {
      try {
        this.doc.addFileToVFS('PlexArabic-Regular.ttf', o.fonts.regular)
        this.doc.addFont('PlexArabic-Regular.ttf', FONT_FAMILY, 'normal')
        this.doc.addFileToVFS('PlexArabic-Bold.ttf', o.fonts.bold)
        this.doc.addFont('PlexArabic-Bold.ttf', FONT_FAMILY, 'bold')
        const internal = this.doc.internal as unknown as { getFont: (f: string, s: string) => { metadata?: { cmap?: { unicode?: { codeMap?: Record<number, number> } } } } }
        const maps = ['normal', 'bold'].map((st) => internal.getFont(FONT_FAMILY, st)?.metadata?.cmap?.unicode?.codeMap)
        if (maps.every(Boolean)) {
          // LRM / RLM / ZWNJ → glyph 1 (".null": empty, zero advance) so these marks take no width and draw nothing
          for (const cm of maps) { cm![0x200e] = 1; cm![0x200f] = 1; cm![0x200c] = 1 }
          const cm = maps[0]!
          has = (cp: number) => !!cm[cp]
          family = FONT_FAMILY; unicode = true
        }
      } catch { /* fall back to Helvetica */ }
    }
    this.has = has; this.family = family; this.unicode = unicode
    this.doc.setLineHeightFactor(1.15)
    this.doc.setFont(this.family, 'normal')
  }

  /** Mirror an x coordinate given for the LTR layout. */
  x(ltrX: number) { return this.rtl ? this.W - ltrX : ltrX }
  /** Alignment at the reading-start / reading-end side. */
  get start(): Align { return this.rtl ? 'right' : 'left' }
  get end(): Align { return this.rtl ? 'left' : 'right' }
  get left() { return this.M }
  get right() { return this.W - this.M }
  get contentW() { return this.W - 2 * this.M }

  safe(s: string | number | null | undefined) { return pdfSafe(s == null ? '' : String(s), this.has) }
  /** bidi preparation for one line of text. */
  prep(s: string): { text: string; opts: TextOptions } {
    const t = this.safe(s)
    if (!this.unicode || !hasArabic(t)) return { text: t, opts: {} }
    return { text: arabicLine(t), opts: bidiOptions(this.rtl || firstStrongRtl(t)) }
  }
  font(bold = false, size?: number) { this.doc.setFont(this.family, bold ? 'bold' : 'normal'); if (size) this.doc.setFontSize(size) }
  lineH(size?: number) { return ((size ?? this.doc.getFontSize()) / this.doc.internal.scaleFactor) * 1.15 }
  width(s: string, bold = false, size?: number) {
    this.font(bold, size)
    return this.doc.getTextWidth(this.safe(s))
  }
  /** Split into lines that fit `width` (uses the current font). */
  wrap(s: string, width: number, bold = false, size?: number): string[] {
    this.font(bold, size)
    return this.safe(s).split('\n').flatMap((para) => (para ? (this.doc.splitTextToSize(para, width) as string[]) : ['']))
  }
  /** Draw text (one string or lines). Returns the y below the last line. */
  text(s: string | string[], x: number, y: number, st: TextStyle = {}): number {
    this.font(!!st.bold, st.size)
    if (st.color) this.doc.setTextColor(...st.color)
    const lines = (Array.isArray(s) ? s : [s]).flatMap((l) => (st.maxWidth ? this.wrap(l, st.maxWidth, !!st.bold) : this.safe(l).split('\n')))
    const lh = this.lineH() + (st.lineGap ?? 0)
    lines.forEach((line, i) => {
      const { text, opts } = this.prep(line)
      if (text) this.doc.text(text, x, y + i * lh, { align: st.align ?? 'left', ...opts })
    })
    return y + lines.length * lh
  }
  /** Text placed at the reading-start side of an LTR x position (mirrored in RTL). */
  textStart(s: string | string[], ltrX: number, y: number, st: TextStyle = {}) { return this.text(s, this.x(ltrX), y, { ...st, align: this.start }) }
  textEnd(s: string | string[], ltrX: number, y: number, st: TextStyle = {}) { return this.text(s, this.x(ltrX), y, { ...st, align: this.end }) }

  /** Start a new page when fewer than `need` mm remain. Returns the y to continue at. */
  ensure(y: number, need: number) {
    if (y + need <= this.bottom) return y
    this.doc.addPage()
    return this.top
  }
  get lastTableY() { return (this.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? this.top }

  /** Section heading with a brand-coloured rule. Returns the y for the content below. */
  heading(text: string, y: number, right?: string) {
    y = this.ensure(y, 20)
    this.text(text, this.x(this.M), y, { bold: true, size: 11.5, color: this.brand, align: this.start })
    if (right) this.text(right, this.x(this.W - this.M), y, { size: 8, color: MUTED, align: this.end })
    this.doc.setDrawColor(...this.brand); this.doc.setLineWidth(0.35); this.doc.line(this.M, y + 1.8, this.W - this.M, y + 1.8)
    this.doc.setTextColor(...SLATE)
    return y + 7.5
  }

  /**
   * autoTable with the house style, glyph safety, Arabic cells and RTL mirroring (column order, alignment, margins).
   * No orphan header: when the header row and the first `keepRows` rows (default 3) do not fit below `startY`, the table starts
   * on the next page.
   */
  table(o: TableOptions & { keepRows?: number }) {
    const { keepRows = 3, ...rest } = o
    let opts = this.tableOptions(rest)
    const startY = typeof opts.startY === 'number' ? opts.startY : this.top
    if (keepRows > 0 && startY > this.top + 1 && startY + this.measure(opts, keepRows) > this.bottom) {
      this.doc.addPage()
      opts = { ...opts, startY: this.top }
    }
    autoTable(this.doc, opts)
    return this.lastTableY
  }
  /** Height (mm) of the header row plus the first `rows` body rows — a dry run, nothing is drawn. */
  tableStartH(o: TableOptions, rows = 3) { return this.measure(this.tableOptions(o), rows) }
  private measure(opts: UserOptions, rows: number) {
    try {
      const t = __createTable(this.doc, opts)
      return t.getHeadHeight(t.columns) + t.body.slice(0, rows).reduce((s, r) => s + (r.height || 0), 0)
    } catch { return 0 }
  }
  /** Section heading kept together with the start of its table (the heading never ends a page alone). Returns the y below the table. */
  headedTable(title: string, y: number, o: TableOptions & { keepRows?: number }, right?: string) {
    const need = 7.5 + this.tableStartH({ ...o, startY: y }, o.keepRows ?? 3) + 1
    y = this.ensure(y, Math.max(20, need))
    y = this.heading(title, y, right)
    return this.table({ ...o, startY: y, keepRows: 0 })
  }
  private tableOptions(o: TableOptions): UserOptions {
    const nCols = Math.max(0, ...[...(o.head ?? []), ...o.body].map((r) => r.reduce<number>((n, c) => n + (c && typeof c === 'object' && !Array.isArray(c) && 'colSpan' in c ? Number(c.colSpan) || 1 : 1), 0)))
    const flip = (s?: Partial<Styles>): Partial<Styles> | undefined => (!s || !this.rtl ? s : { ...s, halign: s.halign === 'left' ? 'right' : s.halign === 'right' ? 'left' : s.halign ?? 'right' })
    const flipCell = (c: CellInput): CellInput => (this.rtl && c && typeof c === 'object' && !Array.isArray(c) && 'styles' in c ? { ...c, styles: flip(c.styles) } : c)
    const rows = (rs?: CellInput[][]) => rs?.map((r) => (this.rtl ? [...r].reverse() : r).map(flipCell))
    const columnStyles: Record<number, Partial<Styles>> = {}
    for (const [k, v] of Object.entries(o.columnStyles ?? {})) columnStyles[this.rtl ? nCols - 1 - Number(k) : Number(k)] = flip(v)!
    const margin = { top: this.top, bottom: this.H - this.bottom, left: this.M, right: this.M, ...(typeof o.margin === 'object' && !Array.isArray(o.margin) ? o.margin : {}) }
    if (this.rtl) [margin.left, margin.right] = [margin.right, margin.left]
    const userParse = o.didParseCell
    return {
      theme: 'grid',
      rowPageBreak: 'avoid',
      ...o,
      styles: { font: this.family, fontSize: 8.5, cellPadding: 1.8, textColor: SLATE, lineColor: RULE, lineWidth: 0.2, halign: this.rtl ? 'right' : 'left', valign: 'middle', overflow: 'linebreak', ...o.styles },
      headStyles: { fillColor: this.brand, textColor: WHITE, fontStyle: 'bold', ...flip(o.headStyles) },
      alternateRowStyles: { fillColor: [248, 250, 252], ...o.alternateRowStyles },
      head: rows(o.head) as RowInput[] | undefined,
      body: rows(o.body) as RowInput[],
      columnStyles,
      margin,
      didParseCell: (d: CellHookData) => {
        const lines = d.cell.text.map((l) => this.safe(l))
        if (this.unicode && lines.some(hasArabic)) {
          d.cell.text = lines.map((l) => (hasArabic(l) ? arabicLine(l) : isolateLatin(l)))
          d.cell.styles.textOptions = bidiOptions(this.rtl || firstStrongRtl(lines.join(' ')))
        } else d.cell.text = lines
        // columnStyles only reach body cells: give header cells the same alignment as their column
        if (d.section === 'head' && columnStyles[d.column.index]?.halign) d.cell.styles.halign = columnStyles[d.column.index].halign!
        userParse?.(d)
      },
    }
  }

  /** Brand band across the top of a page: logo + company at the start side, document title at the end side. */
  header(company: CompanySettings, title: string, subtitle: string) {
    const d = this.doc
    d.setFillColor(...this.brand); d.rect(0, 0, this.W, 28, 'F')
    let blockStart = this.M
    if (company.logoDataUrl) {
      try {
        const props = d.getImageProperties(company.logoDataUrl)
        const k = Math.min(36 / props.width, 18 / props.height)
        const w = props.width * k, h = props.height * k
        // White rounded backdrop so dark logos stay visible on the brand colour
        const lx = this.rtl ? this.W - this.M - w : this.M
        d.setFillColor(255, 255, 255); d.roundedRect(lx - 1.5, 14 - h / 2 - 1.5, w + 3, h + 3, 1.5, 1.5, 'F')
        d.addImage(company.logoDataUrl, props.fileType || 'PNG', lx, 14 - h / 2, w, h, undefined, 'FAST')
        blockStart = this.M + w + 6
      } catch { /* unsupported image: skip the logo */ }
    }
    const blockW = 118 - blockStart
    const contact = [company.phone, company.email, company.website].filter((s) => s?.trim()).join('  ·  ')
    const sub = [company.tagline, contact].filter((s) => s?.trim()).map((s) => this.wrap(s, blockW, false, 8.5)[0])
    // No company name (still the placeholder): logo + tagline / contact only, centred in the band
    const name = company.name?.trim() ? this.wrap(company.name, blockW, true, 15)[0] ?? '' : ''
    if (name) this.text(name, this.x(blockStart), 12.5, { bold: true, size: 15, color: WHITE, align: this.start })
    this.text(sub, this.x(blockStart), name ? 18 : sub.length > 1 ? 12.8 : 15.5, { size: name ? 8.5 : 9, color: WHITE, align: this.start, lineGap: name ? 0 : 1.2 })
    this.text(title, this.x(this.W - this.M), 12.5, { bold: true, size: 13, color: WHITE, align: this.end })
    this.text(subtitle, this.x(this.W - this.M), 18.5, { size: 8.5, color: WHITE, align: this.end })
    d.setTextColor(...SLATE)
  }

  /** Footer on every page: company contact (start), page x of n (end), small product credit (centre). */
  footer(company: CompanySettings, page: (i: number, n: number) => string, credit: string) {
    const d = this.doc, n = d.getNumberOfPages()
    const contact = [company.name, company.phone, company.address].filter((s) => s?.trim()).join('  ·  ')
    for (let i = 1; i <= n; i++) {
      d.setPage(i)
      d.setDrawColor(...RULE); d.setLineWidth(0.2); d.line(this.M, 284, this.W - this.M, 284)
      const c = this.wrap(contact, 120, false, 7.5)[0] ?? ''
      this.text(c, this.x(this.M), 288.5, { size: 7.5, color: MUTED, align: this.start })
      this.text(page(i, n), this.x(this.W - this.M), 288.5, { size: 7.5, color: MUTED, align: this.end })
      this.credit(credit, 293)
    }
  }
  /**
   * Product credit centred on the page. In Arabic the Latin brand ("DT+") is drawn as its own text run at the line's left end,
   * so the bidi pass can never move the "+" to the wrong side ("+DT").
   */
  private credit(credit: string, y: number) {
    const m = /^(.*\S)\s+([A-Za-z][\w+.-]*\+?)\s*$/u.exec(this.safe(credit).replace(/[\u200e\u200f]/g, ''))
    if (!m || !this.unicode || !hasArabic(m[1])) { this.text(credit, this.W / 2, y, { size: 6.5, color: FAINT, align: 'center' }); return }
    const [, words, brand] = m
    const gap = this.width(' ', false, 6.5), wb = this.width(brand, false, 6.5), ww = this.width(words, false, 6.5)
    const x0 = this.W / 2 - (wb + gap + ww) / 2
    this.text(brand, x0, y, { size: 6.5, color: FAINT, align: 'left' })
    this.text(words, x0 + wb + gap, y, { size: 6.5, color: FAINT, align: 'left' })
  }

  blob(): Blob { return this.doc.output('blob') }
}
