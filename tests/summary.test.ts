// Load calculator outputs: the plain-text summary (Copy / Share) and the 1-page "System estimate" PDF.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { computeProject } from '../src/engine/compute'
import { newProject, siteFromLocation, defaultDesign, defaultPricing, loadFromAppliance, applySystemType } from '../src/engine/defaults'
import { buildQuote, formatQuoteMoney } from '../src/engine/quote'
import { emptyPriceBook } from '../src/engine/catalogContext'
import { defaultSizing } from '../src/engine/sizing'
import { defaultCompany } from '../src/engine/defaults'
import { appliances } from '../src/data/appliances'
import { summaryText, buildSummaryPdf, estimateFigures } from '../src/export/summaryPdf'
import type { PdfFontData } from '../src/export/fonts'
import type { Project, SystemType } from '../src/engine/types'

const fontDir = path.resolve(__dirname, '../src/export/fonts')
const fonts: PdfFontData = {
  regular: fs.readFileSync(path.join(fontDir, 'IBMPlexSansArabic-Regular.ttf')).toString('base64'),
  bold: fs.readFileSync(path.join(fontDir, 'IBMPlexSansArabic-Bold.ttf')).toString('base64'),
}
const book = emptyPriceBook()
const company = { ...defaultCompany, name: 'Nile Solar', phone: '+249 912 345 678', email: 'sales@nile.example', quoteValidityDays: 21 }

function calcProject(type: SystemType = 'hybrid', nLoads = 6, f?: (p: Project) => void): Project {
  const p = newProject({ name: 'calc' })
  p.design = applySystemType(defaultDesign('hybrid'), type)
  p.site = siteFromLocation('khartoum')
  p.pricing = { ...defaultPricing(20, 15), labourPerKwUsd: 120, transportUsd: 100, commissioningUsd: 150 }
  p.loads = appliances.slice(0, nLoads).map((a, i) => ({ ...loadFromAppliance(a), id: `l${i}` }))
  f?.(p)
  return p
}
const run = (p: Project) => { const r = computeProject(p, book); return { r, q: buildQuote(p, r) } }
const pages = async (b: Blob) => (Buffer.from(await b.arrayBuffer()).toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length
const bad = (s: string) => /NaN|undefined|null|Infinity/.test(s)

describe('load calculator: text summary', () => {
  it('EN: demand, system, sell price incl. VAT and the disclaimer — never cost or markup', () => {
    const p = calcProject('hybrid')
    const { r, q } = run(p)
    const s = summaryText(p, r, q, company, 'en')
    expect(s.split('\n')[0]).toBe('System estimate · Nile Solar')
    expect(s).toContain(`${r.panelQty} × ${r.panel.watts} W`)
    expect(s).toContain('kWh usable')
    expect(s).toContain(formatQuoteMoney(q.total, q, 0))
    expect(s).toContain('incl. VAT 15%')
    expect(s).toContain('site survey')
    expect(s).toContain('+249 912 345 678')
    expect(s).not.toContain(formatQuoteMoney(q.costSubtotal, q))
    expect(s).not.toMatch(/markup|cost/i)
    expect(bad(s)).toBe(false)
  })

  it('AR: Arabic text with number + unit runs isolated', () => {
    const p = calcProject('offgrid')
    const { r, q } = run(p)
    const s = summaryText(p, r, q, company, 'ar')
    expect(s).toContain('تقدير النظام')
    expect(s).toContain('منفصل عن الشبكة')
    expect(s).toContain('دون شمس') // off-grid → autonomy days
    expect(s).toMatch(/⁨[^⁩]*kWp⁩/)
    expect(bad(s)).toBe(false)
  })

  it('grid-tied: no battery line; per-Wp price matches the quote', () => {
    const p = calcProject('gridtie')
    const { r, q } = run(p)
    const s = summaryText(p, r, q, defaultCompany, 'en')
    expect(s).not.toContain('Battery')
    expect(s.split('\n')[0]).toBe('System estimate')
    const f = estimateFigures(p, r, q)
    expect(f.battery).toBe(false)
    expect(f.perWp).toBeCloseTo(q.total / (r.arrayKwp * 1000), 9)
  })

  it('bill demand: monthly kWh from the bill', () => {
    const p = calcProject('hybrid', 0, (x) => { x.sizing = { ...defaultSizing(), demand: 'bill', bill: { monthlyKwh: 450, profile: 'residential', peakKw: null, largestMotorKw: null } } })
    const { r, q } = run(p)
    expect(r.demand).toBe('bill')
    const s = summaryText(p, r, q, company, 'en')
    expect(s).toContain('450 kWh/month from the electricity bill')
    expect(bad(s)).toBe(false)
  })
})

describe('load calculator: 1-page PDF', () => {
  const now = new Date('2026-11-03T10:00:00Z')
  it.each([
    ['en', 'hybrid', 6], ['ar', 'hybrid', 6], ['en', 'offgrid', 45], ['ar', 'gridtie', 45], ['en', 'hybrid', 1],
  ] as const)('%s %s with %i appliances → one A4 page', async (lang, type, n) => {
    const p = calcProject(type, n)
    const { r, q } = run(p)
    const blob = await buildSummaryPdf(p, r, q, company, lang, { fonts, now })
    expect(blob.size).toBeGreaterThan(5000)
    expect(await pages(blob)).toBe(1)
  })

  it('bill demand → one page (bill table instead of appliances)', async () => {
    const p = calcProject('hybrid', 0, (x) => { x.sizing = { ...defaultSizing(), demand: 'bill', bill: { monthlyKwh: 900, profile: 'commercial', peakKw: 6, largestMotorKw: 2.2 } } })
    const { r, q } = run(p)
    for (const lang of ['en', 'ar'] as const) expect(await pages(await buildSummaryPdf(p, r, q, company, lang, { fonts, now }))).toBe(1)
  })

  it('Arabic needs the embedded font', async () => {
    const p = calcProject('hybrid')
    const { r, q } = run(p)
    await expect(buildSummaryPdf(p, r, q, company, 'ar', { fonts: null, now })).rejects.toThrow('pdf-font')
    expect(await pages(await buildSummaryPdf(p, r, q, company, 'en', { fonts: null, now }))).toBe(1)
  })
})
