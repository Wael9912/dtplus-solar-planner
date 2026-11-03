// Scenario m (2/2) — abuse with data: huge numbers (bill 1e9 kWh, a 1 GW appliance, 100 MWp known size, 1e9 price),
// a 200-line load list (imported JSON), very long Arabic / English / unbroken names — every screen and the PDFs stay clean.
import fs from 'node:fs'
import path from 'node:path'
import { scenario, DL, newVia, goKey, fillNum, grab, checkClientPdf, pdfPng, pdfPages, go, projectCards, numOf, grandTotal } from './lib.mjs'

const LONG_EN = 'Al-Mansour Integrated Agricultural, Residential and Commercial Solar Electrification Project for the Northern State Irrigation Cooperative — Phase Two Extension with Cold Stores'
const LONG_AR = 'مشروع الطاقة الشمسية المتكامل لكهربة المجمع الزراعي والسكني والتجاري التابع لجمعية الري التعاونية بالولاية الشمالية — المرحلة الثانية التوسعية مع مخازن التبريد'
const UNBROKEN = 'ClientRef_NorthernStateIrrigationCooperative_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ'

await scenario('23-abuse-data', async (c) => {
  const { page } = c
  const walk = async (mode, label, keys) => { for (const k of keys) { await goKey(page, mode, k); await c.check(`${label}: ${k}`, { taps: false }) } }

  // ---- huge bill
  await newVia(page, 'design'); await goKey(page, 'design', 'loads')
  await page.getByTestId('demand-bill').click()
  const kwh = page.getByTestId('bill-kwh')
  await kwh.click(); await kwh.fill('1000000000'); await page.waitForTimeout(150)
  const note = await page.locator('[data-testid=bill-view] .error-text').first().innerText().catch(() => '')
  await kwh.blur(); await page.waitForTimeout(250)
  c.ok(`bill 1e9 → field ${await kwh.inputValue()} (note "${note}")`)
  if (numOf(await kwh.inputValue()) > 1e7) c.bad(`bill field kept ${await kwh.inputValue()}`)
  await c.check('huge bill: loads', { shotName: 'huge-bill' })
  const t0 = Date.now()
  await walk('design', 'huge bill', ['site', 'design', 'results', 'bom', 'export'])
  c.ok(`huge bill walk ${Date.now() - t0} ms`)
  await goKey(page, 'design', 'results'); await c.snap('huge-bill-results')
  const p1 = await grab(c, () => (goKey(page, 'design', 'export').then(() => page.getByTestId('export-proposal-download').click())), 'huge-bill-proposal', { timeout: 90000 })
  checkClientPdf(c, p1, 'huge-bill proposal'); if (p1) pdfPng(p1, { last: 1 })

  // ---- 1 GW appliance in the load list
  await goKey(page, 'design', 'loads'); await page.getByTestId('demand-loads').click(); await page.waitForTimeout(200)
  await page.getByTestId('add-custom').first().click(); await page.waitForTimeout(250)
  const ed = page.getByTestId('load-editor')
  await ed.locator('input').first().fill('Smelter')
  const nums = ed.locator('input[inputmode=decimal]')
  await fillNum(nums.nth(0), 1000000000); await fillNum(nums.nth(2), 24)
  await page.getByTestId('load-editor-done').click(); await page.waitForTimeout(300)
  await c.check('1 GW load: loads', { shotName: 'gw-loads' })
  await walk('design', '1 GW load', ['site', 'design', 'results', 'bom'])
  await goKey(page, 'design', 'results'); await c.snap('gw-results')
  // a 1e9 unit price on the first BOM line
  await goKey(page, 'design', 'bom'); await page.getByTestId('view-cost').click(); await page.waitForTimeout(200)
  const row = page.getByTestId(c.phone ? 'bom-card' : 'bom-row').first()
  await fillNum(row.locator('input[inputmode=decimal]').nth(1), 1000000000); await page.waitForTimeout(300)
  const g = await grandTotal(page)
  c.ok(`1e9 unit price → grand total ${g}`)
  await c.check('1e9 price: pricing', { shotName: 'gw-pricing' })
  await page.getByTestId('view-client').click()

  // ---- 100 MWp known size
  await newVia(page, 'size')
  await fillNum(page.getByTestId('target-pv'), 100000); await fillNum(page.getByTestId('target-inv'), 100000); await fillNum(page.getByTestId('target-batt'), 100000)
  await page.waitForTimeout(400)
  await c.check('100 MW known size: system', { shotName: 'mw-system' })
  await walk('size', '100 MW', ['site', 'results', 'bom', 'export'])
  await goKey(page, 'size', 'results'); await c.snap('mw-results')

  // ---- 200 load lines (imported project file)
  const json = await page.evaluate(async () => {
    const d = await import('/src/engine/defaults.ts'); const a = await import('/src/data/appliances.ts')
    const p = d.newProject({ name: '200 loads — stress', clientName: 'Load test', reference: 'Q-STRESS-200' })
    p.loads = Array.from({ length: 200 }, (_, i) => ({ ...d.loadFromAppliance(a.appliances[i % a.appliances.length], 1 + (i % 3)), id: `l${i}`, name: `${a.appliances[i % a.appliances.length].name} #${i + 1}` }))
    return JSON.stringify(p)
  })
  const f200 = path.join(DL, `200-loads-${c.id}.json`); fs.writeFileSync(f200, json)
  await go(page, 'projects')
  await page.getByTestId('import-file').setInputFiles(f200); await page.waitForTimeout(600)
  const card = projectCards(page).filter({ hasText: 'Q-STRESS-200' })
  if (!(await card.count())) return c.bad('200-line project not imported')
  await c.check('200 loads: project card', { shotName: '200-card' })
  await card.getByTestId('project-open').click(); await page.waitForTimeout(300)
  const tl = Date.now(); await goKey(page, 'design', 'loads'); await page.locator('[data-load-id]').nth(199).waitFor({ timeout: 20000 })
  const ms = Date.now() - tl
  if (ms > 4000) c.bad(`200-line Loads step took ${ms} ms to render`)
  c.ok(`200 lines rendered in ${ms} ms`)
  // edit the last line; the total updates
  const k0 = (await page.getByTestId('load-kpis').locator('.stat-value').first().innerText()).trim()
  const last = page.locator('[data-load-id]').nth(199).locator('input[inputmode=decimal]').first()
  const te = Date.now(); await fillNum(last, 5000); const k1 = (await page.getByTestId('load-kpis').locator('.stat-value').first().innerText()).trim()
  c.ok(`edit line 200: ${k0} → ${k1} kWh in ${Date.now() - te} ms`)
  if (k0 === k1) c.bad('editing line 200 did not change the daily energy')
  await c.check('200 loads: loads step', { shotName: '200-loads', taps: false })
  await walk('design', '200 loads', ['site', 'design', 'results', 'bom', 'export'])
  const p2 = await grab(c, () => page.getByTestId('export-proposal-download').click(), '200-proposal', { timeout: 90000 })
  checkClientPdf(c, p2, '200-line proposal')
  const tch = await grab(c, () => page.getByTestId('export-tech-download').click(), '200-technical', { timeout: 90000 })
  checkClientPdf(c, tch, '200-line technical', { internalOk: true })
  if (tch) { c.ok(`technical PDF ${pdfPages(tch)} pages`); if (!/#200/.test(fs.readFileSync(tch).length ? (await import('./lib.mjs')).pdfText(tch) : '')) c.warn('technical PDF load table does not list line #200') }
  const x = await grab(c, () => page.getByTestId('export-excel-download').click(), '200-excel', { timeout: 90000 })
  if (x) c.ok(`Excel ${fs.statSync(x).size} bytes`)

  // ---- very long names
  await newVia(page, 'design')
  const nameIn = page.locator('input.input').first()
  await nameIn.fill(c.lang === 'ar' ? `${LONG_AR} ${LONG_AR}` : `${LONG_EN} ${LONG_EN}`)
  await page.getByTestId('info-client').fill(UNBROKEN)
  await page.locator('input[type=tel]').fill('+249 912 345 678 ext. 1234567890')
  await c.check('long names: client step', { shotName: 'long-client' })
  await goKey(page, 'design', 'loads'); await page.getByTestId('tpl-tplSmallHome').click(); await page.waitForTimeout(250)
  await page.getByTestId('add-custom').first().click(); await page.waitForTimeout(250)
  await page.getByTestId('load-editor').locator('input').first().fill(c.lang === 'ar' ? LONG_EN : LONG_AR)
  await page.getByTestId('load-editor-done').click(); await page.waitForTimeout(250)
  await page.getByTestId('add-custom').first().click(); await page.waitForTimeout(250)
  await page.getByTestId('load-editor').locator('input').first().fill(UNBROKEN)
  await page.getByTestId('load-editor-done').click(); await page.waitForTimeout(250)
  await c.check('long names: loads', { shotName: 'long-loads' })
  await walk('design', 'long names', ['site', 'design', 'results', 'bom'])
  await goKey(page, 'design', 'bom'); await c.snap('long-bom')
  await goKey(page, 'design', 'export'); await c.check('long names: export', { shotName: 'long-export' })
  const p3 = await grab(c, () => page.getByTestId('export-proposal-download').click(), 'long-proposal', { timeout: 90000 })
  const t3 = checkClientPdf(c, p3, 'long-name proposal')
  if (p3) { pdfPng(p3, { last: 2, res: 70 }); if (!t3.replace(/\s+/g, '').includes(UNBROKEN.slice(0, 30))) c.warn('unbroken client name not found intact in the proposal text') }
  const q3 = await grab(c, () => page.getByTestId('export-quote-download').click(), 'long-quotation', { timeout: 90000 })
  if (q3) { checkClientPdf(c, q3, 'long-name quotation'); pdfPng(q3, { last: 1, res: 70 }) }
  await go(page, 'projects')
  await c.check('long names: project list', { shotName: 'long-list' })
})
