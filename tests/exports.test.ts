// Every client / internal document builds in every project mode and both languages (jsPDF + ExcelJS run under node; the PDF font
// is read from disk and passed in `opts.fonts`, so no fetch is needed). English documents are also built with the Helvetica
// fallback so their text can be read back from the (deflated) content streams.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import zlib from 'node:zlib'
import ExcelJS from 'exceljs'
import { buildProposalPdf, buildQuotationPdf, buildTechnicalPdf } from '../src/export/pdf'
import { buildExcel } from '../src/export/excel'
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
    const p = ps.size, r = computeProject(p)
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
