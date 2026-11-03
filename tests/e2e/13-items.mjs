// Scenario d — counter sale: product quote, 6 panels + 1 inverter + 2 batteries from the catalogue (search), edit one price,
// 5 % discount → quotation PDF; the Excel export has only the quotation sheet.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { scenario, grab, checkClientPdf, pdfPng, numOf, goKey, fillNum, newVia, grandTotal, withPricing } from './lib.mjs'
const ExcelJS = createRequire(import.meta.url)('exceljs')

await scenario('13-items', async (c) => {
  const { page } = c
  await newVia(page, 'items')
  const steps = c.phone ? Number((await page.getByTestId('step-sheet-btn').innerText()).match(/\d+\D+(\d+)/)?.[1]) : await page.locator('nav ol button[data-testid^="step-"]').count()
  if (steps !== 3) c.bad(`product quote should have 3 steps, has ${steps}`)
  if (!(await page.getByTestId('bom-empty').isVisible())) return c.bad('product quote does not open on the empty catalogue prompt')
  await c.check('items: empty', { shotName: 'empty' })

  await page.getByTestId('bom-add-products').click()
  await page.waitForTimeout(400)
  const sheet = page.getByTestId('catalog-sheet')
  const add = async (tab, q, n) => {
    await sheet.getByTestId(`catalog-tab-${tab}`).click()
    await sheet.getByTestId('catalog-search').fill(q)
    await page.waitForTimeout(350)
    const it = sheet.getByTestId('catalog-item').first()
    if (!(await it.count())) { c.bad(`catalogue search "${q}" in ${tab}: nothing`); return null }
    const name = (await it.innerText()).split('\n')[0]
    for (let i = 0; i < n; i++) { await it.click(); await page.waitForTimeout(60) }
    const badge = (await it.getByTestId('catalog-in-quote').innerText().catch(() => '')).trim()
    if (numOf(badge) !== n) c.bad(`"${name}" in-quote badge "${badge}" after ${n} taps`)
    return name
  }
  const names = [await add('panels', 'jinko 580', 6), await add('inverters', 'deye 5', 1), await add('batteries', '51.2 100', 2)]
  c.ok(`picked: ${names.join(' | ')}`)
  const status = (await sheet.getByTestId('catalog-status').innerText()).trim()
  if (!status) c.bad('catalogue: no "added" status message')
  await c.check('items: catalogue sheet', { shotName: 'catalogue' })
  await sheet.getByTestId('catalog-done').click()
  await page.waitForTimeout(300)

  const rowSel = c.phone ? 'bom-card' : 'bom-row'
  const rows = page.getByTestId(rowSel)
  const nRows = await rows.count()
  if (nRows !== 3) c.bad(`expected 3 quote lines, got ${nRows}`)
  const ids = await page.locator('[data-line-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-line-id')))
  if (ids.some((x) => /labour|transport|commissioning/.test(x))) c.bad(`counter sale has service lines: ${ids}`)
  const t0 = await grandTotal(page)

  // edit the panel price (cost view)
  await page.getByTestId('view-cost').click(); await page.waitForTimeout(200)
  const priceIn = rows.nth(0).locator('input[inputmode=decimal]').nth(1)
  const before = await priceIn.inputValue()
  await fillNum(priceIn, 95)
  await page.waitForTimeout(200)
  const t1 = await grandTotal(page)
  if (t1 === t0) c.bad(`price edit ${before} → 95 did not change the total (${t0})`)
  c.ok(`panel cost ${before} → 95: total ${t0} → ${t1}`)

  await withPricing(c, async () => { await fillNum(page.getByTestId('bom-discount'), 5); await page.waitForTimeout(200) })
  const t2 = await grandTotal(page)
  const ratio = numOf(t2) / numOf(t1)
  if (Math.abs(ratio - 0.95) > 0.002) c.bad(`5 % discount: ${t1} → ${t2} (ratio ${ratio.toFixed(4)})`)
  const totals = (await page.getByTestId('bom-totals-list').first().innerText()).replace(/\s+/g, ' ')
  if (!/5%/.test(totals)) c.bad(`totals list has no 5% discount line: ${totals}`)
  c.ok(`after discount: ${totals}`)
  await page.getByTestId('view-client').click(); await page.waitForTimeout(150)
  await c.check('items: pricing', { shotName: 'pricing' })
  const total = await grandTotal(page)

  await goKey(page, 'items', 'info')
  await page.getByTestId('info-client').fill(c.lang === 'ar' ? 'ورشة النيل' : 'Nile Workshop')
  await c.check('items: client', { shotName: 'client' })
  await goKey(page, 'items', 'export')
  await c.check('items: export', { shotName: 'export' })
  if (await page.getByTestId('export-card-proposal').count()) c.bad('product quote offers a system proposal')
  const q = await grab(c, () => page.getByTestId('export-quote-download').click(), 'quotation')
  const txt = checkClientPdf(c, q, 'counter quotation', { total })
  if (q) {
    pdfPng(q, { last: 2 })
    if (!/5\s?%/.test(txt)) c.bad('quotation PDF shows no 5 % discount')
    for (const n of names.filter(Boolean)) { const w = n.split(' ').slice(0, 2).join(' '); if (!txt.includes(w)) c.bad(`quotation PDF misses "${w}"`) }
    if (/kWp|kWh\/yr|payback|الاسترداد/.test(txt)) c.warn('counter quotation mentions system figures (kWp / payback)')
  }
  const x = await grab(c, () => page.getByTestId('export-excel-download').click(), 'excel')
  if (x) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(x))
    const names2 = wb.worksheets.map((w) => w.name)
    if (names2.length !== 1) c.bad(`product-quote Excel should have only the quotation sheet, has: ${names2.join(', ')}`)
    let found = false
    wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((cl) => { const v = cl.value; const n = typeof v === 'number' ? v : typeof v === 'object' && v ? v.result : null; if (typeof n === 'number' && Math.abs(n - numOf(total)) < 0.02) found = true })))
    if (!found) c.warn(`Excel: grand total ${total} not found as a cell result (formulas may be uncomputed)`)
    c.ok(`Excel sheets: ${names2.join(', ')}`)
  }
})
