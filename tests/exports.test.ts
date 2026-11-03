// Every client / internal document builds in every project mode and both languages (jsPDF + ExcelJS run under node; the PDF font
// is read from disk and passed in `opts.fonts`, so no fetch is needed). English documents are also built with the Helvetica
// fallback so their text can be read back from the (deflated) content streams.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import zlib from 'node:zlib'
import ExcelJS from 'exceljs'
import { buildProposalPdf, buildQuotationPdf, buildTechnicalPdf } from '../src/export/pdf'
import { buildExcel } from '../src/export/excel'
import { buildSummaryPdf, summaryText } from '../src/export/summaryPdf'
import { exportLabels, arCount, arFixCounts, AR_NOUNS } from '../src/export/labels'
import { outputsEn, outputsAr } from '../src/i18n/outputs'
import {
  docCompany, localizeCompany, companyNameFor, isDefaultCompanyName, docTitle, docFileStem, docFileName, proposalFinance, unitSpace, fileStem, termsText,
} from '../src/export/common'
import { computeProject } from '../src/engine/compute'
import { newProject, siteFromLocation, defaultDesign, defaultPricing, modeDefaults, defaultCompany } from '../src/engine/defaults'
import { defaultSizing } from '../src/engine/sizing'
import { buildQuote } from '../src/engine/quote'
import { sampleProjects } from '../src/data/samples'
import { catalog } from '../src/data/catalog'
import type { BomLine, Project, SystemType } from '../src/engine/types'
import type { PdfFontData } from '../src/export/fonts'

const fonts: PdfFontData = {
  regular: fs.readFileSync(new URL('../src/export/fonts/IBMPlexSansArabic-Regular.ttf', import.meta.url)).toString('base64'),
  bold: fs.readFileSync(new URL('../src/export/fonts/IBMPlexSansArabic-Bold.ttf', import.meta.url)).toString('base64'),
}
const now = new Date('2026-11-03T10:00:00Z')
const company = { ...defaultCompany, name: 'Sun Co', phone: '+249 900 000 000' }
const INTERNAL = 'INTERNAL-NOTE-do-not-print'
const CLIENT_NOTE = 'Price includes two site visits'

const sized = (type: SystemType, targets: Partial<NonNullable<Project['sizing']>['targets']> = {}) => {
  const p = newProject({ name: 'Known size', clientName: 'Client A', reference: 'Q-2026-0200', ...modeDefaults('size', type), notes: INTERNAL, proposalNote: CLIENT_NOTE })
  p.design = defaultDesign(type); p.site = siteFromLocation('khartoum'); p.pricing = defaultPricing(20, 0)
  p.sizing = { ...p.sizing!, targets: { ...p.sizing!.targets, ...targets } }
  return p
}
const line = (x: Partial<BomLine> & Pick<BomLine, 'name' | 'qty' | 'unitPriceUsd'>): BomLine =>
  ({ id: x.name, category: 'Custom', spec: '', unit: 'pcs', totalUsd: 0, source: 'custom', ...x })

function projects(): Record<string, Project> {
  const [fam, off, , grid] = sampleProjects()
  fam.notes = INTERNAL; fam.proposalNote = CLIENT_NOTE
  const bill = sampleProjects()[2]
  bill.name = 'Bill-based design'
  bill.sizing = { ...defaultSizing(), demand: 'bill', bill: { monthlyKwh: 450, profile: 'commercial', peakKw: null, largestMotorKw: 1.5 } }
  const expansion = sized('hybrid')
  expansion.sizing = { ...expansion.sizing!, existing: { panels: 4, batteries: 1, inverters: 0 } }
  const panel = catalog.panels[0], inv = catalog.inverters[0], rail = catalog.items.find((i) => i.id === 'rail')!
  const items = newProject({ name: 'Counter sale', clientName: '', reference: 'Q-2026-0300', ...modeDefaults('items'), notes: INTERNAL, proposalNote: CLIENT_NOTE })
  items.pricing = { ...defaultPricing(15, 5), labourPerKwUsd: 0, transportUsd: 0, commissioningUsd: 0, discountPct: 2, customItems: [
    line({ id: 'c1', ref: panel.id, category: 'PV Modules', name: `${panel.brand} ${panel.model}`, nameAr: `${panel.brand} ${panel.model}`, spec: `${panel.watts} W`, qty: 10, unitPriceUsd: panel.approxPriceUsd }),
    line({ id: 'c2', ref: inv.id, category: 'Inverter', name: `${inv.brand} ${inv.model}`, spec: `${inv.ratedAcKw} kW`, qty: 1, unitPriceUsd: inv.approxPriceUsd }),
    line({ id: 'c3', ref: rail.id, category: rail.category, name: rail.name, nameAr: rail.nameAr, spec: rail.spec ?? '', specAr: rail.specAr, unit: rail.unit, qty: 12.5, unitPriceUsd: rail.approxPriceUsd }),
    line({ id: 'c4', name: 'Delivery to site', qty: 1, unitPriceUsd: 25, unit: 'lot' }),
  ] }
  const itemsSdg = structuredClone(items)
  itemsSdg.site = { ...itemsSdg.site, currency: 'SDG', fxRateToUsd: 2600 }
  return {
    design: fam, offgrid: off, gridtie: grid, bill, size: sized('hybrid'), sizeGt: sized('gridtie', { pvKwp: 10, inverterKw: null, batteryKwh: null }),
    backup: sized('hybrid', { pvKwp: 0, inverterKw: 5, batteryKwh: 10 }), expansion, items, itemsSdg,
  }
}

const isPdf = async (b: Blob) => { const buf = Buffer.from(await b.arrayBuffer()); return { buf, ok: buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 2000 } }
const pageCount = (buf: Buffer) => (buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length
/** Text of a Helvetica (non-embedded font) PDF: inflate every content stream and pull the string operands. */
function pdfText(buf: Buffer) {
  const raw = buf.toString('latin1'), out: string[] = []
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    let s: string
    try { s = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') } catch { s = m[1] }
    for (const t of s.matchAll(/\((.*?)(?<!\\)\)\s*Tj/g)) out.push(t[1].replace(/\\([()\\])/g, '$1'))
  }
  return out.join(' ')
}
const BAD = /NaN|undefined|Infinity|\[object/

/**
 * Text of a PDF drawn with the embedded font (Arabic documents): glyph ids are mapped back through each font's ToUnicode CMap,
 * presentation forms normalised (NFKC) and bidi marks dropped. Each line is in visual order: an Arabic run reads reversed.
 */
function pdfTextU(buf: Buffer) {
  const raw = buf.toString('latin1')
  const objs = new Map<string, string>()
  for (const m of raw.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objs.set(m[1], m[2])
  const streamOf = (body = '') => {
    const m = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(body)
    if (!m) return ''
    try { return zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1') } catch { return m[1] }
  }
  const maps = new Map<string, Map<number, string>>()
  for (const m of raw.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const tu = /\/ToUnicode (\d+) 0 R/.exec(objs.get(m[2]) ?? '')
    if (!tu || maps.has(m[1])) continue
    const map = new Map<number, string>()
    for (const e of streamOf(objs.get(tu[1])).matchAll(/<([0-9a-fA-F]{4})><([0-9a-fA-F]{4})>/g)) map.set(parseInt(e[1], 16), String.fromCharCode(parseInt(e[2], 16)))
    maps.set(m[1], map)
  }
  const out: string[] = []
  for (const body of objs.values()) {
    const st = streamOf(body)
    if (!st.includes('BT')) continue
    let font = ''
    for (const t of st.matchAll(/\/(F\d+) [\d.]+ Tf|<([0-9a-fA-F]*)> Tj|\((.*?)(?<!\\)\) Tj/g)) {
      if (t[1]) font = t[1]
      else if (t[2] != null) out.push((t[2].match(/.{4}/g) ?? []).map((h) => maps.get(font)?.get(parseInt(h, 16)) ?? '').join(''))
      else if (t[3] != null) out.push(t[3])
    }
  }
  return out.join('\n').normalize('NFKC').replace(/[\u200c\u200e\u200f]/g, '')
}
/** An Arabic phrase as it appears in visual order in the PDF text layer (pure Arabic: reversed). */
const vis = (s: string) => [...s.normalize('NFKC')].reverse().join('')

describe('documents build in every mode and language', () => {
  const ps = projects()
  for (const [key, p] of Object.entries(ps)) {
    const r = computeProject(p)
    for (const lang of ['en', 'ar'] as const) {
      it(`${key} · ${lang}: quotation, proposal, technical PDFs and the workbook`, async () => {
        const quote = await isPdf(await buildQuotationPdf(p, r, company, lang, { fonts, now }))
        expect(quote.ok).toBe(true)
        expect(pageCount(quote.buf)).toBeGreaterThanOrEqual(1)
        if (r.mode !== 'items') {
          const prop = await isPdf(await buildProposalPdf(p, r, company, lang, { fonts, now }))
          const tech = await isPdf(await buildTechnicalPdf(p, r, company, lang, { fonts, now }))
          expect(prop.ok).toBe(true); expect(tech.ok).toBe(true)
          expect(pageCount(prop.buf)).toBeGreaterThanOrEqual(2)
        }
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(Buffer.from(await (await buildExcel(p, r, company, lang, { now })).arrayBuffer()) as unknown as ArrayBuffer)
        const names = wb.worksheets.map((w) => w.name)
        if (r.mode === 'items') expect(names).toHaveLength(1)
        else {
          expect(names.length).toBeGreaterThanOrEqual(4)
          expect(names.length).toBe(4 + (r.demand === 'none' ? 0 : 1) + (r.arrayKwp > 0 ? 1 : 0))
        }
        // No NaN / undefined anywhere in the workbook (values and cached formula results)
        for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => {
          const v = c.value as unknown
          const val = v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: unknown }).result : v
          if (typeof val === 'number') expect(Number.isFinite(val), `${ws.name}!${c.address}`).toBe(true)
          if (typeof val === 'string') expect(val, `${ws.name}!${c.address}`).not.toMatch(BAD)
        }))
      })
    }
  }
})

describe('client documents: what they print', () => {
  const ps = projects()
  const text = async (b: Promise<Blob>) => pdfText(Buffer.from(await (await b).arrayBuffer()))

  it('the proposal and the quotation print the note to the client, never the internal notes', async () => {
    for (const p of [ps.design, ps.size, ps.items]) {
      const r = computeProject(p)
      const docs = [await text(buildQuotationPdf(p, r, company, 'en', { fonts: null, now }))]
      if (r.mode !== 'items') docs.push(await text(buildProposalPdf(p, r, company, 'en', { fonts: null, now })))
      for (const t of docs) {
        expect(t).toContain(CLIENT_NOTE)
        expect(t).not.toContain(INTERNAL)
        expect(t).not.toMatch(BAD)
      }
    }
  })

  it('the quotation shows selling prices and the quote total, never cost or markup', async () => {
    const p = ps.items, r = computeProject(p), q = buildQuote(p, r)
    const t = await text(buildQuotationPdf(p, r, company, 'en', { fonts: null, now }))
    expect(t).toContain('Quotation')
    expect(t).toContain('Q-2026-0300')
    expect(t).toContain('03/11/2026') // date
    expect(t).toContain('Valid until 03/12/2026') // 30-day validity
    for (const l of q.lines) expect(t).toContain(l.unitSell.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
    expect(t).toContain('Discount 2%'); expect(t).toContain('VAT 5%')
    expect(t).toMatch(new RegExp(`\\$${q.total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`))
    expect(t).not.toMatch(/markup|Unit cost|Markup/i)
    expect(q.markup).toBeGreaterThan(0)
  })

  it('known size: no load table, the size is the client’s choice, savings assume self-use', async () => {
    const p = { ...ps.size, proposalFinance: true }, r = computeProject(p)
    const prop = await text(buildProposalPdf(p, r, company, 'en', { fonts: null, now }))
    expect(prop).toContain('System size chosen by the client')
    expect(prop).toContain('savings assume all the solar energy is used on site')
    expect(prop).not.toContain('kWh/day demand')
    const tech = await text(buildTechnicalPdf(p, r, company, 'en', { fonts: null, now }))
    expect(tech).toContain('Sizing basis')
    expect(tech).not.toContain('Load analysis')
    expect(tech).toContain('fixed at 5 kWp by the client')
  })

  it('battery backup only: no production chart or payback, backup time instead', async () => {
    const p = ps.backup, r = computeProject(p)
    expect(r.arrayKwp).toBe(0)
    const prop = await text(buildProposalPdf(p, r, company, 'en', { fonts: null, now }))
    expect(prop).not.toContain('Monthly solar production')
    expect(prop).not.toContain('Financial summary')
    expect(prop).toContain('Backup time')
    expect(prop).not.toContain('Solar modules')
    const tech = await text(buildTechnicalPdf(p, r, company, 'en', { fonts: null, now }))
    expect(tech).toContain('No PV array: battery backup only.')
  })

  it('bill demand: the bill and its profile instead of the appliance table', async () => {
    const p = ps.bill, r = computeProject(p)
    expect(r.demand).toBe('bill')
    const prop = await text(buildProposalPdf(p, r, company, 'en', { fonts: null, now }))
    expect(prop).toContain('450 kWh/month from the electricity bill (commercial use)')
    const tech = await text(buildTechnicalPdf(p, r, company, 'en', { fonts: null, now }))
    expect(tech).toContain('Demand from the electricity bill')
    expect(tech).not.toContain('Load analysis')
  })

  it('expansion: units already on site are named on the quotation', async () => {
    const p = ps.expansion, r = computeProject(p)
    const t = await text(buildQuotationPdf(p, r, company, 'en', { fonts: null, now }))
    expect(t).toContain('+4 already on site, not quoted')
  })
})

describe('workbook by mode', () => {
  const ps = projects()
  const load = async (p: Project, lang: 'en' | 'ar' = 'en') => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await (await buildExcel(p, computeProject(p), company, lang, { now })).arrayBuffer()) as unknown as ArrayBuffer)
    return wb
  }
  it('product quote: one priced sheet with live formulas that match the quote', async () => {
    const p = ps.itemsSdg, q = buildQuote(p, computeProject(p))
    const wb = await load(p)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Quotation'])
    const ws = wb.worksheets[0]
    const cells: { f: string; v: unknown }[] = []
    ws.eachRow((row) => row.eachCell((c) => { const v = c.value as { formula?: string; result?: unknown }; if (v && typeof v === 'object' && v.formula) cells.push({ f: v.formula, v: v.result }) }))
    expect(cells.some((c) => c.f.startsWith('ROUND(F6*I6'))).toBe(true)
    expect(cells.some((c) => c.v === q.total)).toBe(true)
  })
  it('full design keeps its six sheets; bill design states the bill; known size drops the Loads sheet', async () => {
    expect((await load(ps.design)).worksheets.map((w) => w.name)).toEqual(['Summary', 'Loads', 'Sizing', 'Production', 'BOM', 'Economics'])
    const bill = await load(ps.bill)
    expect(bill.getWorksheet('Loads')!.getCell('A1').value).toBe('Demand from the electricity bill')
    expect((await load(ps.size)).worksheets.map((w) => w.name)).toEqual(['Summary', 'Sizing', 'Production', 'BOM', 'Economics'])
    expect((await load(ps.backup)).worksheets.map((w) => w.name)).toEqual(['Summary', 'Sizing', 'BOM', 'Economics'])
  })
})

describe('document names, company, titles, savings section (owner review)', () => {
  const ps = projects()
  const text = async (b: Promise<Blob>) => pdfText(Buffer.from(await (await b).arrayBuffer()))
  const textU = async (b: Promise<Blob>) => pdfTextU(Buffer.from(await (await b).arrayBuffer()))

  it('the proposal and the quotation have distinct names on the cards, in the PDF titles and in the file names, in both languages', async () => {
    for (const lang of ['en', 'ar'] as const) {
      const L = exportLabels[lang], O = (lang === 'ar' ? outputsAr : outputsEn).export
      const names = [[L.pdf.title, L.pdf.quotation], [L.ui.proposal, O.quotation], [L.file.proposal, L.file.quotation]]
      for (const [a, b] of names) { expect(a).not.toBe(b); expect(a).not.toContain(b.replace(' (PDF)', '')); expect(b).not.toContain(a.replace(' (PDF)', '')) }
    }
    expect(exportLabels.ar.ui.proposal).toContain('العرض الشامل')
    expect(outputsAr.export.quotation).toContain('عرض سعر')
    // the proposal's page headers carry the proposal title (the quotation page included); the quotation never does
    const p = ps.design, r = computeProject(p)
    const prop = await text(buildProposalPdf(p, r, company, 'en', { fonts: null, now }))
    const quote = await text(buildQuotationPdf(p, r, company, 'en', { fonts: null, now }))
    expect(prop.match(/Solar Proposal/g)?.length).toBeGreaterThanOrEqual(2)
    expect(prop).not.toMatch(/\bQuotation\b/)
    expect(quote).toContain('Quotation'); expect(quote).not.toContain('Solar Proposal')
    const propAr = await textU(buildProposalPdf(p, r, company, 'ar', { fonts, now }))
    const quoteAr = await textU(buildQuotationPdf(p, r, company, 'ar', { fonts, now }))
    expect(propAr).toContain(vis('العرض الشامل'))
    expect(quoteAr).toContain(vis('عرض سعر')); expect(quoteAr).not.toContain(vis('العرض الشامل'))
  })

  it('the placeholder company name never prints on a client document (EN and AR); the header keeps the contact', async () => {
    const placeholder = { ...defaultCompany, phone: '+249 911 111 111' }
    expect(isDefaultCompanyName(placeholder)).toBe(true)
    expect(docCompany(placeholder, 'en').name).toBe('')
    expect(docCompany(placeholder, 'ar').name).toBe('')
    const swapped = { ...placeholder, name: 'شركتك للطاقة الشمسية' } // the Arabic placeholder typed back in
    expect(companyNameFor(swapped, 'en')).toBe('')
    for (const p of [ps.size, ps.items]) {
      const r = computeProject(p)
      const docs = [await text(buildQuotationPdf(p, r, placeholder, 'en', { fonts: null, now }))]
      if (r.mode !== 'items') docs.push(await text(buildProposalPdf(p, r, placeholder, 'en', { fonts: null, now })))
      for (const t of docs) {
        expect(t).not.toContain('Your Solar Company'); expect(t).not.toContain('Clean energy, engineered.')
        expect(t).toContain('+249 911 111 111'); expect(t).toContain('For the company')
      }
      const ar = await textU(buildQuotationPdf(p, r, placeholder, 'ar', { fonts, now }))
      expect(ar).not.toContain(vis('شركتك للطاقة الشمسية'))
      expect(ar).toContain(vis('عن الشركة'))
    }
    // 1-page estimate (load calculator) and its text summary
    const calc = sampleProjects()[0], r = computeProject(calc), q = buildQuote(calc, r)
    const est = await text(buildSummaryPdf(calc, r, q, placeholder, 'en', { fonts: null, now }))
    expect(est).not.toContain('Your Solar Company')
    expect(summaryText(calc, r, q, placeholder, 'en')).not.toContain('Your Solar Company')
    expect(await textU(buildSummaryPdf(calc, r, q, placeholder, 'ar', { fonts, now }))).not.toContain(vis('شركتك للطاقة الشمسية'))
  })

  it('a default project name is replaced by the client and the system on the documents and in the file name', async () => {
    const p = { ...ps.size, name: 'New quote', clientName: 'Osman Ali' }, r = computeProject(p)
    expect(docTitle(p, r, 'en')).toBe('Osman Ali — 5.2 kWp hybrid')
    expect(docFileStem(p, r, 'en')).toBe('Q-2026-0200_Osman_Ali_5.2_kWp_hybrid')
    expect(docTitle({ ...p, name: 'عرض سعر جديد' }, r, 'ar')).toBe('Osman Ali — نظام هجين 5.2 kWp')
    expect(docTitle({ ...p, name: 'New solar project', clientName: '' }, r, 'en')).toBe('Q-2026-0200')
    expect(docFileStem({ ...p, name: 'New solar project', clientName: '' }, r, 'en')).toBe('Q-2026-0200')
    expect(docTitle({ ...p, name: 'Al-Fahad villa' }, r, 'en')).toBe('Al-Fahad villa')
    expect(docTitle(ps.backup, computeProject(ps.backup), 'en')).toBe('Known size')
    expect(docTitle({ ...ps.backup, name: 'New quote' }, computeProject(ps.backup), 'en')).toBe('Client A — 10.2 kWh battery backup')
    for (const build of [buildQuotationPdf, buildProposalPdf, buildTechnicalPdf]) {
      const t = await text(build(p, r, company, 'en', { fonts: null, now }))
      expect(t).not.toContain('New quote')
      expect(t).toContain('Osman Ali - 5.2 kWp hybrid')
    }
    const ar = await textU(buildQuotationPdf({ ...p, name: 'عرض سعر جديد' }, r, company, 'ar', { fonts, now }))
    expect(ar).not.toContain(vis('عرض سعر جديد'))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await (await buildExcel(p, r, company, 'en', { now })).arrayBuffer()) as unknown as ArrayBuffer)
    expect(wb.getWorksheet('Summary')!.getCell('A1').value).toBe('Osman Ali — 5.2 kWp hybrid')
    expect(fileStem('Ahmed — 5.8 kWp hybrid')).toBe('Ahmed_5.8_kWp_hybrid')
    expect(fileStem('a.b / c.')).toBe('a_b_c')
  })

  it('savings & payback: Auto hides them when the payback is long (Khartoum tariff), On / Off override, never without panels', async () => {
    const p = ps.size, r = computeProject(p)
    expect(r.paybackYears!).toBeGreaterThan(12)
    expect(proposalFinance(p, r)).toEqual({ show: false, auto: true, reason: 'payback' })
    expect(proposalFinance({ ...p, proposalFinance: true }, r).show).toBe(true)
    expect(proposalFinance({ ...p, proposalFinance: false }, r)).toMatchObject({ show: false, reason: 'off' })
    const dear = { ...p, site: { ...p.site, gridTariff: 0.3 } }, rd = computeProject(dear)
    expect(rd.paybackYears!).toBeLessThanOrEqual(12)
    expect(proposalFinance(dear, rd)).toEqual({ show: true, auto: true, reason: 'ok' })
    expect(proposalFinance({ ...dear, proposalFinance: false }, rd).show).toBe(false)
    const free = { ...p, site: { ...p.site, gridTariff: 0 } }
    expect(proposalFinance(free, computeProject(free)).reason).toBe('no-savings')
    expect(proposalFinance({ ...ps.backup, proposalFinance: true }, computeProject(ps.backup))).toMatchObject({ show: false, reason: 'na' })
    expect(proposalFinance(ps.items, computeProject(ps.items)).reason).toBe('na')
    const hidden = await text(buildProposalPdf(p, r, company, 'en', { fonts: null, now }))
    for (const s of ['Annual savings', 'Payback', 'Financial summary', 'Cumulative cash flow', 'Levelised cost']) expect(hidden).not.toContain(s)
    expect(hidden).toContain('CO2 avoided'); expect(hidden).toContain('Monthly solar production')
    const shown = await text(buildProposalPdf(dear, rd, company, 'en', { fonts: null, now }))
    for (const s of ['Annual savings', 'Payback', 'Financial summary', 'Cumulative cash flow']) expect(shown).toContain(s)
    // The internal workbook keeps its cash flow whatever the proposal shows
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await (await buildExcel({ ...p, proposalFinance: false }, r, company, 'en', { now })).arrayBuffer()) as unknown as ArrayBuffer)
    expect(wb.getWorksheet('Economics')).toBeTruthy()
  })

  it('Arabic name, tagline and terms print on Arabic documents, the English ones on English documents, each falling back to the other', async () => {
    const both = { ...company, name: 'Nile Solar', nameAr: 'شركة النيل', tagline: 'Power for every home', taglineAr: 'طاقة لكل بيت', terms: 'Pay on delivery.', termsAr: 'الدفع عند التسليم.' }
    expect(localizeCompany(both, 'ar')).toMatchObject({ name: 'شركة النيل', tagline: 'طاقة لكل بيت', terms: 'الدفع عند التسليم.' })
    expect(localizeCompany(both, 'en')).toMatchObject({ name: 'Nile Solar', tagline: 'Power for every home', terms: 'Pay on delivery.' })
    // empty Arabic fields → the main ones; placeholder main name + Arabic name → the Arabic one in English documents too
    expect(localizeCompany({ ...both, nameAr: '', termsAr: ' ' }, 'ar')).toMatchObject({ name: 'Nile Solar', terms: 'Pay on delivery.' })
    expect(companyNameFor({ ...defaultCompany, nameAr: 'شركة النيل' }, 'en')).toBe('شركة النيل')
    expect(isDefaultCompanyName({ ...defaultCompany, nameAr: 'شركة النيل' })).toBe(false)
    // untouched default terms still follow the document language
    expect(termsText(defaultCompany, 'ar')).not.toBe(defaultCompany.terms)
    expect(termsText({ ...defaultCompany, termsAr: '' }, 'en')).toBe(defaultCompany.terms)
    const p = ps.size, r = computeProject(p)
    const ar = await textU(buildQuotationPdf(p, r, both, 'ar', { fonts, now }))
    expect(ar).toContain(vis('شركة النيل')); expect(ar).toContain(vis('طاقة لكل بيت')); expect(ar).not.toContain('Nile Solar')
    const enU = await textU(buildQuotationPdf(p, r, both, 'en', { fonts, now }))
    expect(enU).toContain('Nile Solar'); expect(enU).toContain('Pay on delivery.'); expect(enU).not.toContain(vis('شركة النيل'))
  })

  it('Arabic counted nouns and spaced units', () => {
    expect([1, 2, 3, 8, 10, 11, 25, 100, 103].map((n) => arCount(String(n), AR_NOUNS.hour))).toEqual(['1 ساعة', 'ساعتان', '3 ساعات', '8 ساعات', '10 ساعات', '11 ساعة', '25 ساعة', '100 ساعة', '103 ساعات'])
    expect(arCount('8.8', AR_NOUNS.hour)).toBe('8.8 ساعة')
    expect(arCount('2', AR_NOUNS.year, true)).toBe('سنتين')
    expect(arCount('12', AR_NOUNS.day)).toBe('12 يوما')
    const P = exportLabels.ar.pdf
    expect(P.hours('8')).toBe('8 ساعات'); expect(P.years('21.0')).toBe('21.0 سنة'); expect(P.years('10')).toBe('10 سنوات')
    expect(P.backupShort('2')).toBe('دعم ليلي ساعتين'); expect(P.autonomyShort('3')).toBe('استقلالية 3 أيام')
    expect(P.modules('12', 'X', '580', 'TOPCon', '10')).toContain('ضمان 10 سنوات')
    expect(arFixCounts('احتياط ليلي نحو \u20688\u2069 ساعة')).toBe('احتياط ليلي نحو \u20688\u2069 ساعات')
    expect(arFixCounts('نحو 2 يوم دون شمس')).toBe('نحو يومين دون شمس')
    expect(arFixCounts('الأسعار صالحة لمدة 30 يوماً')).toBe('الأسعار صالحة لمدة 30 يوماً')
    expect(outputsAr.results.hoursShort('8')).toContain('ساعات')
    expect(unitSpace('Generic 51.2V 200Ah 10.24 kWh, 580W, hybrid 48V')).toBe('Generic 51.2 V 200 Ah 10.24 kWh, 580 W, hybrid 48 V')
    expect(unitSpace('JKM580N-72HL4-BDV SUN-8K-SG01LP1 S6-EH1P6K 15kW')).toBe('JKM580N-72HL4-BDV SUN-8K-SG01LP1 S6-EH1P6K 15 kW')
  })

  it('documents print units with a space ("48 V", "580 W") and the Arabic footer keeps "DT+" as one run', async () => {
    const p = ps.design, r = computeProject(p)
    for (const build of [buildProposalPdf, buildQuotationPdf, buildTechnicalPdf]) {
      const t = await text(build(p, r, company, 'en', { fonts: null, now }))
      expect(t).not.toMatch(/(?<![A-Za-z0-9.])\d+(?:\.\d+)?(kWp|kWh|kW|Ah|V|W)\b/)
    }
    const ar = await textU(buildQuotationPdf(p, r, company, 'ar', { fonts, now }))
    expect(ar).toMatch(/^DT\+$/m)
    expect(ar).not.toContain('+DT')
  })
})

describe('stress-test follow-ups: equipment entirely on site, long file names', () => {
  const ps = projects()
  const text = async (b: Promise<Blob>) => pdfText(Buffer.from(await (await b).arrayBuffer()))

  it('a main-equipment line entirely on site (qty 0) is named in a note on client documents, never priced, and listed with qty 0 internally', async () => {
    // the engine keeps a fully existing main-equipment line in the BOM with qty 0 and its existingQty (here the battery)
    const p = { ...ps.expansion, sizing: { ...ps.expansion.sizing!, existing: { ...ps.expansion.sizing!.existing, batteries: 99 } } }, r = computeProject(p)
    const batt = r.bom.find((b) => b.category === 'Battery' && b.id === r.battery?.id)!
    expect(batt).toMatchObject({ qty: 0, totalUsd: 0 }); expect(batt.existingQty).toBeGreaterThan(0)
    const n = batt.existingQty!
    const q = buildQuote(p, r)
    expect(q.lines.find((l) => l.id === batt.id)?.totalSell).toBe(0)
    const name = batt.name.replace(/(\d)(V|Ah|W|kWh)\b/g, '$1 $2')
    for (const build of [buildQuotationPdf, buildProposalPdf]) {
      const t = await text(build(p, r, company, 'en', { fonts: null, now }))
      expect(t).toContain(`Existing equipment (not quoted): ${n} × `)
      expect(t).toContain('already on site.')
      expect(t).toMatch(new RegExp(`TOTAL[^$]*\\$${q.total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`))
    }
    const prices = (await text(buildQuotationPdf(p, r, company, 'en', { fonts: null, now }))).split('Existing equipment')[0]
    expect(prices).not.toContain(name)
    const tech = await text(buildTechnicalPdf(p, r, company, 'en', { fonts: null, now }))
    expect(tech).toContain(`+${n} already on site, not quoted`)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(await (await buildExcel(p, r, company, 'en', { now })).arrayBuffer()) as unknown as ArrayBuffer)
    let row: ExcelJS.Row | undefined
    wb.getWorksheet('BOM')!.eachRow((x) => { if (String(x.getCell(4).value ?? '').includes(`+${n} already on site`)) row = x })
    expect(row?.getCell(6).value).toBe(0)
    expect(await isPdf(await buildQuotationPdf(p, r, company, 'ar', { fonts, now }))).toMatchObject({ ok: true })
    // 1-page estimate
    const est = await text(buildSummaryPdf(p, r, q, company, 'en', { fonts: null, now }))
    expect(est).toContain('Existing equipment (not quoted)')
  })

  it('download file names stay within 120 bytes (UTF-8) and keep their suffix', () => {
    const r = computeProject(ps.size)
    const en = { ...ps.size, name: 'Villa '.repeat(50) + 'x' }, ar = { ...ps.size, name: 'مؤسسة الأمل '.repeat(30) }
    const bytes = (s: string) => Math.max(Buffer.byteLength(s, 'utf8'), Buffer.byteLength(s.normalize('NFD'), 'utf8'))
    for (const [p, lang, suffix] of [[en, 'en', 'quotation'], [ar, 'ar', 'عرض-سعر'], [{ ...en, reference: 'Q'.repeat(200) }, 'en', 'technical-internal']] as const) {
      const n = docFileName(p, r, lang, suffix, 'pdf')
      expect(bytes(n)).toBeLessThanOrEqual(120)
      expect(n.endsWith(`-${suffix}.pdf`)).toBe(true)
      expect(n).not.toMatch(/[_-]-/)
      expect(n).not.toContain('\uFFFD')
    }
    expect(docFileName(ps.size, r, 'en', '', 'json')).toBe('Q-2026-0200_Known_size.json')
    expect(bytes(fileStem('ب'.repeat(300)))).toBeLessThanOrEqual(100)
  })
})
