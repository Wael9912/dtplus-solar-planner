// Load-calculator output: the 1-page "System estimate" PDF and the plain-text summary (Copy / Share).
// Client-safe — selling prices only; every money figure comes from the quote (buildQuote with the company price list).
// English or Arabic (RTL, mirrored layout, embedded IBM Plex Sans Arabic). jsPDF and the font are loaded on demand inside
// buildSummaryPdf, so the UI can import summaryText() from here without pulling jsPDF into the main bundle.
import type { Project, Results, CompanySettings } from '../engine/types'
import { formatQuoteMoney, type Quote } from '../engine/quote'
import { fmt } from '../engine/format'
import { resolveSizing } from '../engine/sizing'
import { calcEn, calcAr } from '../i18n/calc'
import { labelsFor, loadName, locationName, docCompany, companyNameFor, fmtDate, addDays, num, autonomyOf, solarCoveragePct, batteryInfo, productName, existingNote, type ExportLang } from './common'
import { arFixCounts } from './labels'
import type { PdfFontData } from './fonts'

/** The calc strings of a document language (same objects as `dicts[lang].calc`). */
const dict = (lang: ExportLang) => (lang === 'ar' ? calcAr : calcEn)
/** Arabic counted nouns ("8 ساعات", "ساعتان") in strings from the calc dictionary. */
const grammar = (lang: ExportLang) => (s: string) => (lang === 'ar' ? arFixCounts(s) : s)
const wh = (l: Project['loads'][number]) => l.watts * l.qty * l.hoursPerDay
/** Rounded to `d` decimals first, then printed without trailing zeros (0.98 → "1", 1.25 → "1.3"). */
export const short = (v: number, d: number) => num(Number(v.toFixed(d)), d)

/** Derived figures shared by the result card, the text summary and the PDF. */
export function estimateFigures(p: Project, r: Results, q: Quote) {
  const dailyKwh = r.dailyWh / 1000
  const battery = p.design.systemType !== 'gridtie' && r.batteryQty > 0 && r.batteryKwh > 0
  return {
    bill: r.demand === 'bill',
    dailyKwh,
    monthlyKwh: r.monthlyKwh > 0 ? r.monthlyKwh : dailyKwh * 30.4,
    nightPct: r.dailyWh > 0 ? (r.nightWh / r.dailyWh) * 100 : 0,
    /** Selling price per installed Wp (quote currency). */
    perWp: r.arrayKwp > 0 ? q.total / (r.arrayKwp * 1000) : 0,
    battery,
    /** Off-grid: days of autonomy; hybrid: hours of night backup. null without a battery. */
    auto: battery ? autonomyOf(p, r) : null,
    coverage: solarCoveragePct(r),
  }
}

/** Plain-text estimate for WhatsApp / e-mail / clipboard, in the given language (selling price only). */
export function summaryText(p: Project, r: Results, q: Quote, company: CompanySettings, lang: ExportLang): string {
  const D = dict(lang), T = D.text
  const f = estimateFigures(p, r, q)
  const money = (v: number, d?: number) => formatQuoteMoney(v, q, d)
  const type = D.sysTypes[p.design.systemType] ?? p.design.systemType
  const co = companyNameFor(company, lang)
  const sep = lang === 'ar' ? '، ' : ', '
  const peak = num(r.peakW / 1000, 1)
  const out = [co ? `${T.title} · ${co}` : T.title]
  out.push(f.bill ? T.energyBill(fmt(f.monthlyKwh), fmt(f.dailyKwh, 1), peak) : T.energy(fmt(f.dailyKwh, 1), fmt(f.monthlyKwh), peak))
  out.push(T.system(type))
  out.push(`• ${T.panels(r.panelQty, String(r.panel.watts), fmt(r.arrayKwp, 2))}`)
  if (f.battery) {
    const a = f.auto
    const extra = a ? (a.offgrid ? T.autonomy(short(a.days, 1)) : a.hours > 72 ? T.backupLong : T.backup(short(a.hours, 0))) : ''
    out.push(`• ${T.battery(fmt(r.batteryKwh, 1), fmt(r.batteryUsableKwh, 1))}${extra ? sep + extra : ''}`)
  }
  if (r.inverter) out.push(`• ${T.inverter(r.inverterQty, num(r.inverter.ratedAcKw, 1), productName(r.inverter))}`)
  out.push(`• ${T.production(fmt(r.annualProductionKwh), fmt(r.annualKwh))}`)
  out.push(T.price(money(q.total, 0), q.vatPct > 0 ? num(q.vatPct) : null, money(f.perWp, 2)))
  out.push(`${T.site(locationName(p, lang), num(p.site.psh, 1))} ${T.disclaimer}`)
  const contact = [company.phone, company.email, company.website].map((s) => s?.trim()).filter(Boolean).join(' · ')
  if (contact) out.push(contact)
  return grammar(lang)(out.join('\n'))
}

export interface SummaryPdfOptions {
  /** Pre-loaded fonts (node tests); `null` forces the Helvetica fallback. Default: fetched lazily. */
  fonts?: PdfFontData | null
  /** Document date (tests). */
  now?: Date
}

/** A4, one page: company header, demand, recommended system, appliance list (or bill), indicative selling price, assumptions. */
export async function buildSummaryPdf(p: Project, r: Results, q: Quote, companyIn: CompanySettings, lang: ExportLang, opts: SummaryPdfOptions = {}): Promise<Blob> {
  const [{ Pdf, INK, SLATE, MUTED, tint, hasArabic }, { PdfFontError }] = await Promise.all([import('./pdfkit'), import('./pdf')])
  const D = dict(lang), C = D.pdf, L = labelsFor(lang), P = L.pdf
  const company = docCompany(companyIn, lang)
  const G = grammar(lang)
  const f = estimateFigures(p, r, q)
  const loads = p.loads.filter((l) => l.qty > 0 && l.watts > 0)

  // Font: the embedded one is required for Arabic (document language or user-typed names)
  const needsUnicode = lang === 'ar' || [company.name, company.tagline, company.phone, company.email, company.website, company.address, p.site.customName, ...loads.map((l) => l.name)]
    .some((s) => !!s && hasArabic(s))
  let fonts = opts.fonts
  if (fonts === undefined) {
    try { fonts = await (await import('./fonts')).loadPdfFonts() } catch { fonts = null }
  }
  if (!fonts && needsUnicode) throw new PdfFontError()
  const pdf = new Pdf({ rtl: lang === 'ar', brandHex: company.primaryColor, fonts: fonts ?? null })
  if (!pdf.unicode && needsUnicode) throw new PdfFontError()
  const { doc, brand } = pdf
  const now = opts.now ?? new Date()
  const money = (v: number, d?: number) => formatQuoteMoney(v, q, d)
  const city = locationName(p, lang)
  const type = D.sysTypes[p.design.systemType] ?? p.design.systemType

  pdf.header(company, C.title, fmtDate(now))
  let y = 37
  y = pdf.text(f.bill ? C.introBill(type, city, fmt(f.monthlyKwh)) : C.intro(type, city, loads.length), pdf.x(pdf.M), y, { size: 9.5, color: SLATE, maxWidth: pdf.contentW, align: pdf.start }) + 3

  // Four KPI tiles per row (same look as the proposal's first page)
  const tiles = (items: { k: string; v: string; s?: string }[], y0: number) => {
    const tw = 43, tg = (pdf.contentW - 4 * tw) / 3, th = 18.5
    items.forEach((t, i) => {
      const ltrX = pdf.M + i * (tw + tg)
      const x = pdf.rtl ? pdf.W - ltrX - tw : ltrX
      doc.setFillColor(...tint(brand, 0.93)); doc.setDrawColor(...tint(brand, 0.75)); doc.setLineWidth(0.25); doc.roundedRect(x, y0, tw, th, 2, 2, 'FD')
      let size = 12.5
      while (size > 7.5 && pdf.width(t.v, true, size) > tw - 6) size -= 0.5
      const tx = pdf.rtl ? x + tw - 3 : x + 3
      pdf.text(t.v, tx, y0 + 7.2, { bold: true, size, color: brand, align: pdf.start })
      pdf.text(t.k, tx, y0 + 12, { size: 7.6, color: INK, align: pdf.start })
      if (t.s) pdf.text(pdf.wrap(t.s, tw - 6, false, 6.6)[0] ?? '', tx, y0 + 15.6, { size: 6.6, color: MUTED, align: pdf.start })
    })
    return y0 + th
  }

  // ---- energy use
  y = pdf.heading(C.energy, y)
  y = tiles([
    { k: C.tiles.daily, v: `${fmt(f.dailyKwh, 1)} kWh`, s: f.bill ? C.fromBill : C.appliancesN(loads.length) },
    { k: C.tiles.monthly, v: `${fmt(f.monthlyKwh)} kWh`, s: C.perYear(fmt(r.annualKwh)) },
    { k: C.tiles.peak, v: `${num(r.peakW / 1000, 1)} kW`, s: r.surgeW > r.peakW ? C.surge(num(r.surgeW / 1000, 1)) : '' },
    { k: C.tiles.night, v: `${fmt(f.nightPct)}%`, s: C.nightSub(num(r.nightWh / 1000, 1)) },
  ], y) + 6

  // ---- recommended system: tiles + one line per component
  const a = f.auto
  const prod = r.annualProductionKwh
  y = pdf.heading(C.system, y, L.sys[p.design.systemType])
  y = tiles([
    { k: C.tiles.pv, v: `${fmt(r.arrayKwp, 2)} kWp`, s: C.panelsSub(r.panelQty, String(r.panel.watts)) },
    f.battery
      ? { k: C.tiles.battery, v: `${fmt(r.batteryKwh, 1)} kWh`, s: a ? G(a.offgrid ? C.autonomy(short(a.days, 1)) : a.hours > 72 ? C.backupLong : C.backup(short(a.hours, 0))) : '' }
      : { k: C.tiles.battery, v: '—', s: C.noBattery },
    { k: C.tiles.inverter, v: r.inverter ? `${num(r.inverterTotalKw, 1)} kW` : '—', s: r.inverter ? C.invSub(r.inverterQty, r.inverter.brand) : '' },
    { k: C.tiles.production, v: prod >= 100000 ? `${fmt(prod / 1000, 1)} MWh` : `${fmt(prod)} kWh`, s: r.annualKwh > 0 ? C.coverage(fmt(f.coverage)) : '' },
  ], y) + 2.5
  const { battery } = batteryInfo(p, r)
  const sysRows: string[][] = [[P.rows.modules, P.modules(String(r.panelQty), productName(r.panel), String(r.panel.watts), r.panel.technology, String(r.panel.warrantyYears))]]
  if (r.inverter) sysRows.push([P.rows.inverter, P.inverter(String(r.inverterQty), productName(r.inverter), num(r.inverter.ratedAcKw, 1), L.invType[r.inverter.type] ?? r.inverter.type)])
  if (r.controller && r.controllerQty) sysRows.push([P.rows.controller, P.controller(String(r.controllerQty), productName(r.controller))])
  if (f.battery) sysRows.push([P.rows.battery, battery ? P.battery(String(r.batteryQty), productName(battery), fmt(r.batteryKwh, 1), fmt(r.batteryUsableKwh, 1)) : P.batteryNoModel(fmt(r.batteryKwh, 1), fmt(r.batteryUsableKwh, 1))])
  const compact = { fontSize: 8, cellPadding: { top: 1.1, bottom: 1.1, left: 1.8, right: 1.8 } }
  y = pdf.table({ startY: y, body: sysRows, styles: compact, columnStyles: { 0: { cellWidth: 36, fontStyle: 'bold', textColor: INK } } }) + 7

  // ---- appliances (top lines that fit the page) or the electricity bill
  const priceBlockH = 58 // price box + notes, kept free above the footer
  const right = { halign: 'right' as const }
  if (f.bill) {
    const b = resolveSizing(p).bill
    y = pdf.heading(C.bill, y)
    const rows: string[][] = [
      [C.billRows.monthly, `${fmt(b.monthlyKwh)} kWh`],
      [C.billRows.profile, C.profiles[b.profile] ?? b.profile],
      [C.billRows.peak, `${num(r.peakW / 1000, 1)} kW (${b.peakKw ? C.measured : C.estimated})`],
    ]
    if (b.largestMotorKw) rows.push([C.billRows.motor, `${num(b.largestMotorKw, 1)} kW`])
    y = pdf.table({ startY: y, body: rows, styles: compact, columnStyles: { 0: { cellWidth: 60, textColor: MUTED }, 1: { textColor: INK } } }) + 7
  } else if (loads.length) {
    y = pdf.heading(C.loads, y, C.appliancesN(loads.length))
    const rowH = 5.5
    const fit = Math.max(3, Math.floor((pdf.bottom - priceBlockH - y - 3 * rowH) / rowH))
    const sorted = [...loads].sort((x, z) => wh(z) - wh(x))
    const shown = sorted.length <= fit + 1 ? sorted : sorted.slice(0, fit)
    const rest = sorted.slice(shown.length)
    const nameW = pdf.contentW - 22 - 14 - 20 - 22 - 4
    const oneLine = (s: string) => { const ls = pdf.wrap(s, nameW, false, 8); return ls.length > 1 ? `${ls[0].replace(/\s+\S*$/, '')}…` : ls[0] ?? '' }
    const body: Parameters<typeof pdf.table>[0]['body'] = shown.map((l) => [oneLine(loadName(l, lang)), fmt(l.watts), fmt(l.qty), num(l.hoursPerDay, 1), fmt(wh(l))])
    // Spanning label cells take the first column's style: give them an explicit start alignment (mirrored in RTL)
    if (rest.length) body.push([{ content: C.more(rest.length), colSpan: 4, styles: { halign: 'left', textColor: MUTED } }, { content: fmt(rest.reduce((s, l) => s + wh(l), 0)), styles: { textColor: MUTED } }])
    body.push([{ content: C.total, colSpan: 4, styles: { halign: 'left', fontStyle: 'bold', textColor: INK } }, { content: fmt(r.dailyWh), styles: { fontStyle: 'bold', textColor: INK } }])
    y = pdf.table({
      startY: y, head: [[C.cols.name, C.cols.watts, C.cols.qty, C.cols.hours, C.cols.wh]], body, styles: compact,
      columnStyles: { 1: { ...right, cellWidth: 22 }, 2: { ...right, cellWidth: 14 }, 3: { ...right, cellWidth: 20 }, 4: { ...right, cellWidth: 22 } },
    }) + 7
  }

  // ---- indicative price (selling price incl. VAT — no cost, no markup)
  const bh = 22
  doc.setFillColor(...tint(brand, 0.92)); doc.setDrawColor(...tint(brand, 0.7)); doc.setLineWidth(0.3); doc.roundedRect(pdf.M, y, pdf.contentW, bh, 2, 2, 'FD')
  pdf.textStart(C.price, pdf.M + 5, y + 9, { bold: true, size: 11, color: INK })
  pdf.textStart(C.priceSub(q.vatPct > 0 ? num(q.vatPct) : null, money(f.perWp, 2)), pdf.M + 5, y + 15.5, { size: 8.5, color: MUTED })
  const total = money(q.total, 0)
  let size = 20
  while (size > 12 && pdf.width(total, true, size) > 95) size -= 1
  pdf.textEnd(total, pdf.W - pdf.M - 5, y + 14, { bold: true, size, color: brand })
  y += bh + 6

  // ---- assumptions & validity
  const days = company.quoteValidityDays || 30
  y = pdf.text([G(C.assumptions(city, num(p.site.psh, 2), days, fmtDate(addDays(now, days)))), existingNote(r, lang, L)].filter(Boolean).join(' '), pdf.x(pdf.M), y, { size: 8, color: MUTED, maxWidth: pdf.contentW, align: pdf.start }) + 1.5
  pdf.text(C.disclaimer, pdf.x(pdf.M), y, { size: 8.5, bold: true, color: INK, maxWidth: pdf.contentW, align: pdf.start })

  pdf.footer(company, P.page, L.brand)
  return pdf.blob()
}
