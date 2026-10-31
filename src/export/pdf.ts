// Client proposal PDF (client-safe: selling prices only) and technical design report PDF (internal: cost, markup, margin).
// Both render in English or Arabic (RTL, mirrored layout) with the embedded IBM Plex Sans Arabic font.
// Every money figure comes from buildQuote() so the documents match the screen to the cent.
import type { Project, Results, CompanySettings, CableResult } from '../engine/types'
import { fmt } from '../engine/format'
import { buildQuote } from '../engine/quote'
import { loadPdfFonts, type PdfFontData } from './fonts'
import { Pdf, INK, SLATE, MUTED, WHITE, tint, hasArabic, type RGB } from './pdfkit'
import {
  labelsFor, fmtDate, addDays, qtyText, num, money, plain, unitDecimals, systemName, phaseName, locationName, unitName, categoryName, lineName, lineSpec,
  loadName, derateName, checkMessage, batteryInfo, autonomyOf, solarCoveragePct, footprintM2, termsText, localizeCompany, escalationPct, cableLabel, cableSize, cableDevice, protectionRows, INV_EFF_BATT, type ExportLang,
} from './common'

export interface PdfOptions {
  /** Pre-loaded fonts (node scripts); `null` forces the Helvetica fallback. Default: fetched lazily. */
  fonts?: PdfFontData | null
  /** Document date (tests). */
  now?: Date
}
/** The embedded font could not be loaded and the document needs it (Arabic text). */
export class PdfFontError extends Error { constructor() { super('pdf-font') } }

type Body = Parameters<Pdf['table']>[0]['body']
const userStrings = (p: Project, c: CompanySettings) => [
  p.name, p.clientName, p.clientAddress, p.clientPhone, p.clientEmail, p.notes, p.site.customName, c.name, c.tagline, c.address, c.terms, c.phone, c.email, c.website,
  ...p.loads.map((l) => l.name), ...p.pricing.customItems.flatMap((i) => [i.name, i.spec, i.category]),
]
async function openPdf(lang: ExportLang, p: Project, company: CompanySettings, opts: PdfOptions) {
  const needsUnicode = lang === 'ar' || userStrings(p, company).some((s) => !!s && hasArabic(s))
  let fonts = opts.fonts
  if (fonts === undefined) {
    try { fonts = await loadPdfFonts() } catch { fonts = null }
  }
  if (!fonts && needsUnicode) throw new PdfFontError()
  const pdf = new Pdf({ rtl: lang === 'ar', brandHex: company.primaryColor, fonts: fonts ?? null })
  if (!pdf.unicode && needsUnicode) throw new PdfFontError()
  return pdf
}
const eyebrow = (s: string, lang: ExportLang) => (lang === 'en' ? s.toUpperCase() : s)
const NEG: RGB = [185, 28, 28], POS: RGB = [4, 120, 87]

// ---------------------------------------------------------------- client proposal
export async function buildProposalPdf(p: Project, r: Results, companyIn: CompanySettings, lang: ExportLang, opts: PdfOptions = {}): Promise<Blob> {
  const L = labelsFor(lang), P = L.pdf
  const company = localizeCompany(companyIn, lang)
  const q = buildQuote(p, r)
  const M = money(q), N = plain(q)
  const pdf = await openPdf(lang, p, company, opts)
  const { doc, brand } = pdf
  const now = opts.now ?? new Date()
  const date = fmtDate(now)

  // ---- page 1: header, client/project, KPI tiles, system, chart, finance
  pdf.header(company, P.title, `${p.reference} · ${date}`)
  let y = 37
  const block = (label: string, first: string, rest: string[], ltrX: number, w: number) => {
    let yy = pdf.textStart(eyebrow(label, lang), ltrX, y, { bold: true, size: 7.5, color: brand })
    yy = pdf.textStart(first?.trim() || '—', ltrX, yy + (lang === 'ar' ? 2 : 0.8), { bold: true, size: 11, color: INK, maxWidth: w })
    for (const s of rest.filter((x) => x?.trim())) yy = pdf.textStart(s, ltrX, yy + 0.3, { size: 8.8, color: SLATE, maxWidth: w })
    return yy
  }
  const yClient = block(P.preparedFor, p.clientName, [p.clientAddress, p.clientPhone, p.clientEmail], 14, 84)
  const yProject = block(P.project, p.name, [
    `${systemName(p, L)} · ${phaseName(p, L)}`,
    `${P.location}: ${locationName(p, lang)} · ${P.psh(fmt(p.site.psh, 2))}`,
    P.validUntil(fmtDate(addDays(now, company.quoteValidityDays || 30))),
  ], 110, 86)
  y = Math.max(yClient, yProject) + 3

  // KPI tiles
  const auto = autonomyOf(p, r)
  const diesel = r.savingsBasis === 'diesel'
  const shortAutonomy = auto ? (auto.offgrid || auto.hours > 72 ? P.autonomyShort(num(auto.days, 1)) : P.backupShort(num(auto.hours, 0))) : ''
  const prodKwh = r.annualProductionKwh
  const tiles: { k: string; v: string; s?: string }[] = [
    { k: P.tiles.pv, v: `${fmt(r.arrayKwp, 2)} kWp`, s: `${r.panelQty} × ${r.panel.watts} W` },
    r.batteryKwh > 0
      ? { k: P.tiles.battery, v: `${fmt(r.batteryKwh, 1)} kWh`, s: shortAutonomy }
      : { k: P.tiles.yield, v: `${fmt(r.specificYield)} ${P.kwhPerKwp}` },
    { k: P.tiles.inverter, v: r.inverter ? `${num(r.inverterTotalKw, 1)} kW` : '—', s: r.inverter ? `${r.inverterQty} × ${r.inverter.brand}` : '' },
    { k: P.tiles.production, v: prodKwh >= 100000 ? `${fmt(prodKwh / 1000, 1)} MWh` : `${fmt(prodKwh)} kWh`, s: `${fmt(r.specificYield)} ${P.kwhPerKwp}` },
    { k: P.tiles.investment, v: M(q.total, 0), s: q.vatPct ? P.inclVat(num(q.vatPct)) : '' },
    { k: P.tiles.savings, v: M(r.annualSavingsUsd * q.fx, 0), s: diesel ? P.savingsDiesel : P.yearN(1) },
    { k: P.tiles.payback, v: r.paybackYears != null && Number.isFinite(r.paybackYears) ? P.years(fmt(r.paybackYears, 1)) : '—' },
    { k: P.tiles.co2, v: `${fmt(r.co2TonsPerYear, 1)} ${P.tPerYear}`, s: diesel ? P.vsDiesel : P.vsGrid },
  ]
  const tw = 43, tg = (pdf.contentW - 4 * tw) / 3, th = 18.5
  tiles.forEach((t, i) => {
    const col = i % 4, row = Math.floor(i / 4)
    const ltrX = 14 + col * (tw + tg), yy = y + row * (th + 2.5)
    const x = pdf.rtl ? pdf.W - ltrX - tw : ltrX
    doc.setFillColor(...tint(brand, 0.93)); doc.setDrawColor(...tint(brand, 0.75)); doc.setLineWidth(0.25); doc.roundedRect(x, yy, tw, th, 2, 2, 'FD')
    let size = 12.5
    while (size > 7.5 && pdf.width(t.v, true, size) > tw - 6) size -= 0.5
    const tx = pdf.rtl ? x + tw - 3 : x + 3
    pdf.text(t.v, tx, yy + 7.2, { bold: true, size, color: brand, align: pdf.start })
    pdf.text(t.k, tx, yy + 12, { size: 7.6, color: INK, align: pdf.start })
    if (t.s) pdf.text(pdf.wrap(t.s, tw - 6, false, 6.6)[0] ?? '', tx, yy + 15.6, { size: 6.6, color: MUTED, align: pdf.start })
  })
  y += 2 * th + 2.5 + 7

  // Your system
  y = pdf.heading(P.yourSystem, y)
  const { battery, excluded } = batteryInfo(p, r)
  const sysRows: string[][] = [[P.rows.modules, P.modules(String(r.panelQty), `${r.panel.brand} ${r.panel.model}`, String(r.panel.watts), `${r.panel.technology}${r.panel.bifacial && !/bifacial/i.test(r.panel.model) ? ' ' + P.bifacial : ''}`, String(r.panel.warrantyYears))]]
  if (r.inverter) sysRows.push([P.rows.inverter, P.inverter(String(r.inverterQty), `${r.inverter.brand} ${r.inverter.model}`, num(r.inverter.ratedAcKw, 1), L.invType[r.inverter.type] ?? r.inverter.type)])
  if (r.controller && r.controllerQty) sysRows.push([P.rows.controller, P.controller(String(r.controllerQty), `${r.controller.brand} ${r.controller.model}`)])
  if (r.batteryQty > 0) {
    const parts = [battery ? P.battery(String(r.batteryQty), `${battery.brand} ${battery.model}`, fmt(r.batteryKwh, 1), fmt(r.batteryUsableKwh, 1)) : P.batteryNoModel(fmt(r.batteryKwh, 1), fmt(r.batteryUsableKwh, 1))]
    if (auto) parts.push(auto.offgrid || auto.hours > 72 ? P.autonomyDays(num(auto.days, 1)) : P.backupHours(num(auto.hours, 0)))
    if (excluded) parts.push(P.notQuoted)
    sysRows.push([P.rows.battery, parts.join(' · ')])
  }
  if (r.generatorKva) sysRows.push([P.rows.generator, P.generator(num(r.generatorKva, 1))])
  sysRows.push([P.rows.roof, P.roof(fmt(footprintM2(r)), L.roofs[p.site.roofType] ?? p.site.roofType)])
  sysRows.push([P.rows.energy, P.energy(fmt(r.dailyWh / 1000, 1), fmt(solarCoveragePct(r)))])
  y = pdf.table({ startY: y, head: [[P.component, P.description]], body: sysRows, columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold', textColor: INK } } }) + 7

  // Monthly production chart (demand: dashed line, legend in the heading row)
  const demand = (r.dailyWh / 1000) * 30.4
  y = pdf.ensure(y, 58)
  const legend = demand > 0 ? P.demand(fmt(demand)) : ''
  y = pdf.heading(P.chartTitle, y, legend)
  if (legend) {
    const lw = pdf.width(legend, false, 8)
    const lx0 = pdf.rtl ? pdf.M + lw + 2 : pdf.W - pdf.M - lw - 8
    doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.6); doc.setLineDashPattern([1.5, 1], 0); doc.line(lx0, y - 8.7, lx0 + 6, y - 8.7); doc.setLineDashPattern([], 0)
  }
  const months = r.monthlyProductionKwh
  const maxV = Math.max(...months, demand, 1) * 1.08
  const cx = pdf.M, cw = pdf.contentW, ch = 32, cy = y + 36, slot = cw / 12, bw = slot - 3.2
  doc.setDrawColor(...tint(SLATE, 0.8)); doc.setLineWidth(0.2); doc.line(cx, cy, cx + cw, cy)
  const barX = (i: number) => cx + (pdf.rtl ? 11 - i : i) * slot + 1.6
  months.forEach((v, i) => {
    const bx = barX(i), bh = (v / maxV) * ch
    doc.setFillColor(...brand); doc.rect(bx, cy - bh, bw, bh, 'F')
    pdf.text(L.months[i], bx + bw / 2, cy + 4, { size: 6.8, color: MUTED, align: 'center' })
  })
  if (demand > 0) {
    const dy = cy - (demand / maxV) * ch
    doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.5); doc.setLineDashPattern([1.5, 1], 0); doc.line(cx, dy, cx + cw, dy); doc.setLineDashPattern([], 0)
  }
  months.forEach((v, i) => {
    const bx = barX(i), bh = (v / maxV) * ch
    const label = fmt(v), w = pdf.width(label, false, 6.5) + 1.2
    doc.setFillColor(...WHITE); doc.rect(bx + bw / 2 - w / 2, cy - bh - 4.1, w, 3, 'F')
    pdf.text(label, bx + bw / 2, cy - bh - 1.6, { size: 6.5, color: SLATE, align: 'center' })
  })
  y = cy + 11

  // Financial summary
  y = pdf.ensure(y, 34)
  y = pdf.heading(P.finance, y)
  const horizon = p.design.analysisYears
  const yrs = [1, 5, 10, 15, 20, 25, 30].filter((n) => n <= horizon && r.cumulativeCashflow[n] != null)
  if (!yrs.includes(horizon) && r.cumulativeCashflow[horizon] != null) yrs.push(horizon)
  const cum = yrs.map((n) => r.cumulativeCashflow[n] * q.fx)
  y = pdf.table({
    startY: y, head: [[P.year, ...yrs.map((n) => P.yearN(n))]], body: [[`${P.cumulative} (${q.currency})`, ...cum.map((v) => N(v, 0))]],
    columnStyles: Object.fromEntries([[0, { cellWidth: 40, fontStyle: 'bold', textColor: INK }], ...yrs.map((_, i) => [i + 1, { halign: 'right' }])]),
    didParseCell: (d) => {
      if (d.section !== 'body') return
      const k = pdf.rtl ? yrs.length - d.column.index : d.column.index // logical column (0 = label)
      if (k > 0 && cum[k - 1] != null) d.cell.styles.textColor = cum[k - 1] < 0 ? NEG : POS
    },
  }) + 3
  const tariffUsd = Number.isFinite(r.avoidedCostUsdPerKwh) && r.avoidedCostUsdPerKwh > 0 ? r.avoidedCostUsdPerKwh : p.site.gridTariff
  const tariff = tariffUsd * q.fx, lcoe = r.lcoeUsdPerKwh * q.fx
  pdf.text(P.financeNote({
    diesel, tariff: M(tariff, unitDecimals(tariff)), esc: num(escalationPct(p), 2), deg: num(p.design.degradationPctPerYear), lcoe: M(lcoe, unitDecimals(lcoe)),
    years: String(horizon), roi: r.roi25Pct != null && Number.isFinite(r.roi25Pct) ? `${fmt(r.roi25Pct)}%` : '—',
    om: r.omUsdPerYear > 0 ? M(r.omUsdPerYear * q.fx, 0) : '',
    repl: (r.replacements ?? []).filter((x) => x.year <= horizon).map((x) => P.replItem(x.item, x.year, M(x.usd * q.fx, 0))).join(lang === 'ar' ? '، ' : ', '),
  }), pdf.x(pdf.M), y + 1, { size: 8, color: MUTED, maxWidth: pdf.contentW, align: pdf.start })

  // ---- quotation (selling prices; markup is spread into the line prices)
  doc.addPage()
  pdf.header(company, P.quotation, `${p.reference} · ${date}`)
  y = pdf.heading(P.boq, 37, P.pricesIn(q.currency))
  const body: Body = []
  const lines = q.lines.filter((l) => l.qty > 0)
  let n = 0
  for (const c of Array.from(new Set(lines.map((l) => l.category)))) {
    body.push([{ content: categoryName(c, L), colSpan: 7, styles: { fontStyle: 'bold', fillColor: tint(brand, 0.9), textColor: brand, halign: 'left' } }])
    for (const l of lines.filter((x) => x.category === c)) {
      n++
      body.push([String(n), lineName(l, lang, L), lineSpec(l, lang), qtyText(l.qty), unitName(l.unit, L), N(l.unitSell), N(l.totalSell)])
    }
  }
  const C = P.cols
  y = pdf.table({
    startY: y, head: [[C.no, C.item, C.spec, C.qty, C.unit, `${C.unitPrice} (${q.currency})`, `${C.total} (${q.currency})`]], body,
    styles: { fontSize: 8 }, alternateRowStyles: { fillColor: WHITE },
    columnStyles: { 0: { cellWidth: 8, halign: 'center', textColor: MUTED }, 1: { cellWidth: 50, textColor: INK }, 2: { cellWidth: 45 }, 3: { cellWidth: 15, halign: 'right' }, 4: { cellWidth: 18 }, 5: { cellWidth: 23, halign: 'right' }, 6: { cellWidth: 23, halign: 'right', fontStyle: 'bold', textColor: INK } },
  }) + 3

  // Totals: subtotal, discount, VAT, total — no cost or markup on the client document
  const totals: [string, string][] = []
  if (q.discount > 0 || q.vatPct > 0) totals.push([P.subtotal, M(q.sellSubtotal)])
  if (q.discount > 0) totals.push([P.discount(num(q.discountPct)), M(-q.discount)])
  if (q.vatPct > 0) totals.push([P.vat(num(q.vatPct)), M(q.vat)])
  y = pdf.ensure(y, 12 + totals.length * 6 + 10)
  const totW = 100, hl = { fontStyle: 'bold' as const, fontSize: 10.5, textColor: WHITE, fillColor: brand }
  y = pdf.table({
    startY: y, theme: 'plain', margin: { left: pdf.W - pdf.M - totW, right: pdf.M }, tableWidth: totW, alternateRowStyles: { fillColor: WHITE },
    styles: { fontSize: 9, cellPadding: { top: 1.3, bottom: 1.3, left: 2.5, right: 2.5 } },
    body: [...totals.map(([k, v]) => [k, v]), [{ content: q.vatPct > 0 ? P.totalInclVat : P.total, styles: hl }, { content: M(q.total), styles: hl }]],
    columnStyles: { 0: { halign: 'right', cellWidth: 54 }, 1: { halign: 'right', cellWidth: 46, textColor: INK } },
  }) + 9

  // Terms, notes, signatures
  const para = (title: string, text: string) => {
    y = pdf.heading(title, y)
    for (const line of pdf.wrap(text, pdf.contentW, false, 8.3)) { y = pdf.ensure(y, 5); y = pdf.text(line, pdf.x(pdf.M), y, { size: 8.3, color: SLATE, align: pdf.start }) }
    y += 5
  }
  const terms = termsText(company, lang)
  if (terms) para(P.terms, terms)
  if (p.notes?.trim()) para(P.notes, p.notes.trim())
  y = pdf.ensure(y + 2, 34)
  const sig = (title: string, ltrX: number, w: number) => {
    let yy = pdf.textStart(title, ltrX, y, { bold: true, size: 9, color: INK, maxWidth: w })
    for (const f of [P.name, P.signature, P.date]) {
      yy += 6.5
      const lw = pdf.width(f + ':', false, 8.5)
      pdf.textStart(f + ':', ltrX, yy, { size: 8.5, color: MUTED })
      doc.setDrawColor(...tint(SLATE, 0.6)); doc.setLineWidth(0.25); doc.line(pdf.x(ltrX + lw + 2), yy + 0.6, pdf.x(ltrX + w), yy + 0.6)
    }
  }
  sig(P.accepted, 14, 82)
  sig(P.forCompany(company.name || ''), 110, 86)

  pdf.footer(company, P.page, L.brand)
  return pdf.blob()
}

// ---------------------------------------------------------------- technical report (internal)
export async function buildTechnicalPdf(p: Project, r: Results, companyIn: CompanySettings, lang: ExportLang, opts: PdfOptions = {}): Promise<Blob> {
  const L = labelsFor(lang), T = L.tech
  const company = localizeCompany(companyIn, lang)
  const q = buildQuote(p, r)
  const M = money(q), N = plain(q)
  const pdf = await openPdf(lang, p, company, opts)
  const { doc } = pdf
  const now = opts.now ?? new Date()
  pdf.header(company, T.title, `${p.reference} · ${fmtDate(now)}`)

  // Internal marker + project facts
  let y = 35
  const mw = pdf.width(T.internal, true, 7.5) + 6
  const mx = pdf.rtl ? pdf.M : pdf.W - pdf.M - mw
  doc.setFillColor(254, 242, 242); doc.setDrawColor(252, 165, 165); doc.setLineWidth(0.25); doc.roundedRect(mx, y - 3.6, mw, 5.2, 1.2, 1.2, 'FD')
  pdf.text(T.internal, mx + mw / 2, y, { bold: true, size: 7.5, color: NEG, align: 'center' })
  y += 4
  y = pdf.table({
    startY: y, theme: 'plain', styles: { fontSize: 8.3, cellPadding: { top: 0.8, bottom: 0.8, left: 1.5, right: 1.5 } },
    body: [
      [T.project, p.name || '—', T.client, p.clientName || '—'],
      [T.systemType, systemName(p, L), T.supply, phaseName(p, L)],
      [T.location, `${locationName(p, lang)} · ${fmt(p.site.psh, 2)} h`, T.site, p.clientAddress || '—'],
    ],
    columnStyles: { 0: { cellWidth: 24, textColor: MUTED }, 1: { cellWidth: 67, textColor: INK }, 2: { cellWidth: 24, textColor: MUTED }, 3: { cellWidth: 67, textColor: INK } },
  }) + 6

  // Design checks
  y = pdf.heading(T.checks, y)
  const lvlColor: Record<string, RGB> = { error: NEG, warn: [180, 83, 9], ok: POS }
  const checks = r.checks
  y = pdf.table({
    startY: y, head: [[T.level, T.check]], body: checks.map((c) => [L.levels[c.level] ?? c.level, checkMessage(c, lang)]),
    columnStyles: { 0: { cellWidth: 24, fontStyle: 'bold' } },
    didParseCell: (d) => { if (d.section === 'body' && d.column.index === (pdf.rtl ? 1 : 0)) d.cell.styles.textColor = lvlColor[checks[d.row.index]?.level] ?? SLATE },
  }) + 7

  // Loads
  y = pdf.heading(T.loads, y)
  const right = { halign: 'right' as const }
  y = pdf.table({
    startY: y, head: [T.loadCols],
    body: [
      ...p.loads.map((l) => [loadName(l, lang), fmt(l.watts), fmt(l.qty), num(l.hoursPerDay, 2), fmt(l.nightSharePct), num(l.surgeFactor, 2), fmt(l.watts * l.qty * l.hoursPerDay)]),
      [{ content: T.total, styles: { fontStyle: 'bold', textColor: INK } }, fmt(r.connectedW), '', '', fmt(r.dailyWh ? (r.nightWh / r.dailyWh) * 100 : 0), '', { content: fmt(r.dailyWh), styles: { fontStyle: 'bold', textColor: INK } }],
    ],
    columnStyles: { 0: { cellWidth: 72 }, 1: right, 2: right, 3: right, 4: right, 5: right, 6: right },
  }) + 2.5
  const cf = r.coincidenceFactor > 0 ? r.coincidenceFactor : p.design.coincidenceFactor
  y = pdf.text(T.loadNote({ peak: fmt(r.peakW), cf: num(cf, 2), surge: fmt(r.surgeW), night: fmt(r.nightWh), annual: fmt(r.annualKwh) }), pdf.x(pdf.M), y + 1, { size: 7.8, color: MUTED, maxWidth: pdf.contentW, align: pdf.start }) + 5

  // PV sizing
  y = pdf.heading(T.pv, y)
  const kv = { 0: { cellWidth: 40, fontStyle: 'bold' as const, textColor: INK }, 1: { cellWidth: 46 } }
  y = pdf.table({
    startY: y, head: [[T.param, T.value, T.basis]], columnStyles: kv,
    body: [
      [T.psh, T.tilted(fmt(p.site.psh, 2), fmt(r.tiltedPsh, 2)), T.tiltBasis(num(r.tiltGainUsed > 0 ? r.tiltGainUsed : p.site.tiltGainFactor, 3), fmt(p.site.tiltDeg))],
      [T.derate, `${fmt(r.derate * 100, 1)}%`, r.derateBreakdown.map((b) => `${derateName(b, lang, L)} ${b.factor.toFixed(2)}`).join(' × ')],
      [T.requiredPv, `${fmt(r.requiredPvKwp, 3)} kWp`, T.requiredPvBasis(num(p.design.pvOversize, 2))],
      [T.array, `${r.panelQty} × ${r.panel.watts} W = ${fmt(r.arrayKwp, 2)} kWp`, `${r.panel.brand} ${r.panel.model} · Voc ${r.panel.voc} V · Vmp ${r.panel.vmp} V · Isc ${r.panel.isc} A · ${r.panel.tempCoeffPmaxPctPerC}%/°C`],
      [T.areaWeight, `${fmt(r.arrayAreaM2, 1)} m² / ${fmt(r.arrayWeightKg)} kg`, T.areaBasis(String(r.panel.lengthMm), String(r.panel.widthMm), num(r.panel.weightKg, 1))],
      [T.production, `${fmt(r.annualProductionKwh)} kWh`, T.specYield(fmt(r.specificYield))],
    ],
  }) + 7

  // Inverter & strings
  if (r.inverter) {
    y = pdf.heading(T.inverter, y)
    const inv = r.inverter, st = r.strings
    const dcac = r.dcAcRatio > 0 ? r.dcAcRatio : r.inverterTotalKw > 0 ? r.arrayKwp / r.inverterTotalKw : 0
    const vLimit = st?.maxSystemVoltageV ?? inv.maxPvVoltage
    const rows: string[][] = [
      [T.required, `${fmt(r.requiredInverterKw, 2)} kW`, T.requiredInvBasis(num(p.design.inverterSafety, 2), fmt(r.surgeW / 1000, 1))],
      [T.selected, `${r.inverterQty} × ${inv.brand} ${inv.model}`, T.invBasis({ kw: num(inv.ratedAcKw, 1), surge: num(inv.surgeKw, 1), pv: num(inv.maxPvInputKw, 1), mppt: String(inv.mpptCount), amps: num(inv.maxInputCurrentPerMppt, 1), vmin: fmt(inv.mpptMinV), vmax: fmt(inv.mpptMaxV), vabs: fmt(inv.maxPvVoltage) })],
      [T.dcac, fmt(dcac, 2), T.dcacBasis],
    ]
    if (st) {
      rows.push([T.strings, T.stringsVal(String(st.strings), String(st.panelsPerString)), T.stringsBasis(String(st.mpptsUsed), String(st.stringsPerMppt))])
      rows.push([T.vocCold, `${fmt(st.vocCold)} V`, T.vocBasis(fmt(p.site.recordLowC), fmt(vLimit), st.vocCold <= vLimit)])
      rows.push([T.vmpHot, `${fmt(st.vmpHot)} V`, T.vmpBasis(fmt(p.site.ambientHighC + 31), fmt(inv.mpptMinV), st.vmpHot >= inv.mpptMinV)])
      rows.push([T.isc, `${num(st.stringIscA, 2)} A`, T.iscBasis(num(inv.maxInputCurrentPerMppt, 1), st.stringIscA <= inv.maxInputCurrentPerMppt)])
    }
    y = pdf.table({ startY: y, head: [[T.param, T.value, T.basis]], body: rows, columnStyles: kv }) + 2.5
    const notes = (lang === 'ar' && st?.notesAr?.length ? st.notesAr : st?.notes) ?? []
    for (const nt of notes) y = pdf.text(`• ${nt}`, pdf.x(pdf.M), y + 1, { size: 7.8, color: MUTED, maxWidth: pdf.contentW, align: pdf.start })
    y += 5
  }

  // Battery
  if (r.batteryQty > 0) {
    y = pdf.heading(T.battery, y)
    const { battery } = batteryInfo(p, r)
    const auto = autonomyOf(p, r)
    const busV = p.design.systemVoltage === 'hv' ? (battery?.nominalVoltage ?? 'HV') : p.design.systemVoltage
    const rows: string[][] = [
      [T.required, `${fmt(r.batteryRequiredKwh, 2)} kWh`, T.battRequired(p.design.systemType === 'offgrid' ? T.dailyEnergy : T.criticalNight, num(p.design.autonomyDays, 2), fmt(r.dod * 100), num(INV_EFF_BATT, 3))],
      [T.bank, `${r.batteryQty} × ${battery ? `${battery.brand} ${battery.model}` : '—'}`, T.bankBasis(String(r.batteryConfig.series), String(r.batteryConfig.parallel), fmt(r.batteryKwh, 2), fmt(r.batteryAh), String(busV))],
      [T.usable, `${fmt(r.batteryUsableKwh, 2)} kWh`, auto ? (auto.offgrid || auto.hours > 72 ? L.pdf.autonomyDays(num(auto.days, 1)) : L.pdf.backupHours(num(auto.hours, 0))) : '—'],
    ]
    if (r.controller) rows.push([T.controller, `${r.controllerQty} × ${r.controller.brand} ${r.controller.model}`, T.ctrlBasis(fmt(r.requiredControllerA))])
    if (r.generatorKva) rows.push([T.generator, `${num(r.generatorKva, 1)} kVA`, T.genBasis])
    y = pdf.table({ startY: y, head: [[T.param, T.value, T.basis]], body: rows, columnStyles: kv }) + 7
  }

  // Cables & protection
  y = pdf.heading(T.cables, y)
  const cables: CableResult[] = r.cableSchedule?.length ? r.cableSchedule : r.cables
  y = pdf.table({
    startY: y, head: [T.cableCols],
    body: cables.map((c) => [cableLabel(c, lang, L), `${num(c.currentA, 1)} A`, `${fmt(c.voltage)} V`, `${num(c.lengthM, 1)} m`, cableSize(c, L), `${num(c.dropPct, 2)}%`, cableDevice(c, L)]),
    columnStyles: { 0: { cellWidth: 34 }, 1: { ...right, cellWidth: 16 }, 2: { ...right, cellWidth: 15 }, 3: { ...right, cellWidth: 13 }, 4: { cellWidth: 44 }, 5: { ...right, cellWidth: 14 } },
    didParseCell: (d) => { if (d.section === 'body' && cables[d.row.index]?.deviceStd === false) d.cell.styles.textColor = NEG },
  }) + 2.5
  y = pdf.text(T.cableNote, pdf.x(pdf.M), y + 1, { size: 7.6, color: MUTED, maxWidth: pdf.contentW, align: pdf.start }) + 6

  // Protective devices (ratings that drive the BOM)
  const prot = protectionRows(r, L)
  if (prot.length) {
    y = pdf.heading(T.protection, y)
    const pairs: string[][] = []
    for (let i = 0; i < prot.length; i += 2) pairs.push([prot[i][0], prot[i][1], prot[i + 1]?.[0] ?? '', prot[i + 1]?.[1] ?? ''])
    y = pdf.table({ startY: y, body: pairs, columnStyles: { 0: { cellWidth: 46, textColor: MUTED }, 1: { cellWidth: 45, textColor: INK }, 2: { cellWidth: 46, textColor: MUTED }, 3: { cellWidth: 45, textColor: INK } } }) + 7
  }

  // Internal pricing summary (from the quote: matches the Pricing step and the Excel workbook)
  y = pdf.ensure(y, 62)
  y = pdf.heading(T.pricing, y, q.currency)
  const R = T.pricingRows
  const pr: [string, string, boolean?][] = [
    [R.equipment, M(q.equipmentCost)], [R.services, M(q.servicesCost)], [R.cost, M(q.costSubtotal), true],
    [R.markup(num(q.markupPct, 2)), M(q.markup)], [R.sell, M(q.sellSubtotal), true], [R.margin, `${fmt(q.grossMarginPct, 1)}%`],
  ]
  if (q.discount > 0) pr.push([R.discount(num(q.discountPct, 2)), M(-q.discount)])
  if (q.vatPct > 0) pr.push([R.vat(num(q.vatPct, 2)), M(q.vat)])
  pr.push([R.total, M(q.total), true])
  const strong = { fontStyle: 'bold' as const, textColor: INK }
  y = pdf.table({
    startY: y, tableWidth: 110, margin: { left: pdf.M, right: pdf.W - pdf.M - 110 },
    body: pr.map(([k, v, b]) => [{ content: k, styles: b ? strong : {} }, { content: v, styles: b ? strong : {} }]),
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 40, halign: 'right' } },
  }) + 7

  // Costed BOM
  y = pdf.heading(T.costedBom, y, q.currency)
  const body: Body = []
  let n = 0
  for (const c of Array.from(new Set(q.lines.map((l) => l.category)))) {
    body.push([{ content: categoryName(c, L), colSpan: 8, styles: { fontStyle: 'bold', fillColor: tint(pdf.brand, 0.9), textColor: pdf.brand, halign: 'left' } }])
    for (const l of q.lines.filter((x) => x.category === c)) {
      n++
      body.push([String(n), lineName(l, lang, L), qtyText(l.qty), unitName(l.unit, L), N(l.unitCost), N(l.totalCost), N(l.unitSell), N(l.totalSell)])
    }
  }
  body.push([{ content: '', colSpan: 5 }, { content: N(q.costSubtotal), styles: strong }, '', { content: N(q.sellSubtotal), styles: strong }])
  pdf.table({
    startY: y, head: [T.costCols], body, styles: { fontSize: 7.6 }, alternateRowStyles: { fillColor: WHITE },
    columnStyles: { 0: { cellWidth: 7, halign: 'center', textColor: MUTED }, 1: { cellWidth: 57 }, 2: { cellWidth: 15, halign: 'right' }, 3: { cellWidth: 16 }, 4: { cellWidth: 21, halign: 'right' }, 5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 21, halign: 'right' }, 7: { cellWidth: 23, halign: 'right' } },
  })

  pdf.footer(company, L.pdf.page, L.brand)
  return pdf.blob()
}
