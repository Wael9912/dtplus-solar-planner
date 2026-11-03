// Scenario c — backup-only UPS for outages: known size, "No panels", 5 kW inverter, 15 kWh → no panel / mounting / PV DC lines,
// results show backup time (no production), proposal has no production chart, no NaN anywhere.
import { scenario, grab, checkClientPdf, pdfPng, numOf, goKey, fillNum, newVia, grandTotal } from './lib.mjs'

const PV_IDS = /^(pnl-|my-panel|ground-structure|mid-clamp|end-clamp|rail|rail-splice|tile-hook|l-foot|triangle-frame|ballast-block|earth-clip|dc-cable-|mc4-pair|combiner-box|pv-fuse-|pv-array-fuse-|dc-isolator-|spd-dc-)/
await scenario('12-ups', async (c) => {
  const { page, T, X } = { ...c, X: c.D.X[c.lang] }
  await newVia(page, 'size')
  await page.getByTestId('size-type-hybrid').click()
  await page.getByTestId('sw-no-pv').click()
  await page.waitForTimeout(200)
  if (!(await page.getByTestId('target-pv').isDisabled())) c.bad('"No panels" did not disable the kWp field')
  await fillNum(page.getByTestId('target-inv'), 5)
  await fillNum(page.getByTestId('target-batt'), 15)
  await page.waitForTimeout(300)
  const eqPanel = (await page.getByTestId('eq-panel').innerText()).replace(/\s+/g, ' ')
  c.ok(`panel row: ${eqPanel}`)
  await c.check('ups: system', { shotName: 'system' })

  await goKey(page, 'size', 'site'); await c.check('ups: site', { shotName: 'site' })
  await goKey(page, 'size', 'results')
  const ov = (await page.getByTestId('results-overview').innerText()).replace(/\s+/g, ' ')
  if (!(await page.getByTestId('backup-table').isVisible().catch(() => false))) c.bad('results: no backup-time table for a UPS')
  if (await page.getByTestId('chart-months').count()) c.bad('results: production chart shown with no panels')
  if (/kWp/.test(ov)) c.bad(`results mention kWp for a no-panel system: ${ov.slice(0, 200)}`)
  c.ok(`results: ${ov.slice(0, 260)}`)
  await c.check('ups: results', { shotName: 'results' })

  await goKey(page, 'size', 'bom')
  await page.getByTestId('view-cost').click(); await page.waitForTimeout(200)
  const ids = await page.locator('[data-line-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-line-id')))
  const pv = ids.filter((id) => PV_IDS.test(id))
  if (pv.length) c.bad(`BOM has panel / mounting / PV DC lines: ${pv.join(', ')}`)
  const bomTxt = await page.locator('main').innerText()
  for (const k of ['PV Modules', 'Mounting']) if (bomTxt.includes(T.bom.cats[k])) c.bad(`BOM shows category "${T.bom.cats[k]}"`)
  c.ok(`BOM lines: ${ids.join(', ')}`)
  const total = await grandTotal(page)
  if (!(numOf(total) > 0)) c.bad(`UPS total ${total}`)
  await page.getByTestId('view-client').click(); await page.waitForTimeout(150)
  await c.check('ups: pricing', { shotName: 'pricing' })

  await goKey(page, 'size', 'export')
  await c.check('ups: export', { shotName: 'export' })
  const p = await grab(c, () => page.getByTestId('export-proposal-download').click(), 'proposal')
  const txt = checkClientPdf(c, p, 'UPS proposal', { total })
  if (p) {
    pdfPng(p, { last: 4 })
    for (const l of [X.pdf?.chartTitle, 'kWp', X.pdf?.tiles?.production, X.pdf?.tiles?.payback].filter(Boolean)) if (txt.includes(l)) c.bad(`UPS proposal still has "${l}"`)
  }
  const q = await grab(c, () => page.getByTestId('export-quote-download').click(), 'quotation')
  checkClientPdf(c, q, 'UPS quotation', { total })
  const x = await grab(c, () => page.getByTestId('export-excel-download').click(), 'excel')
  if (x) {
    const { createRequire } = await import('node:module'); const ExcelJS = createRequire(import.meta.url)('exceljs')
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await import('node:fs').then((f) => f.readFileSync(x)))
    const bad = []
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cl) => { const v = cl.value; const s = typeof v === 'object' && v ? JSON.stringify(v.result ?? v.formula ?? v) : String(v); if ((typeof v === 'number' && !Number.isFinite(v)) || /NaN|undefined|Infinity|#DIV|#VALUE/.test(s)) bad.push(`${ws.name}!${cl.address}=${s.slice(0, 40)}`) })))
    if (bad.length) c.bad(`Excel bad cells: ${bad.slice(0, 6).join(' ')}`)
    c.ok(`Excel sheets: ${wb.worksheets.map((w) => w.name).join(', ')}`)
  }
})
