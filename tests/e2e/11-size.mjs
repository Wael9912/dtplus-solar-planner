// Scenario b — "I want a 5 kW hybrid with 10 kWh lithium": known-size quote → change to 8 kWp → client name →
// quotation PDF + proposal PDF; the total on screen equals the PDF total; internal note never printed.
import { scenario, grab, checkClientPdf, pdfPng, numOf, goKey, fillNum, newVia, grandTotal } from './lib.mjs'

const SECRET = 'ZZ-INTERNAL-7731'
await scenario('11-size', async (c) => {
  const { page } = c
  await newVia(page, 'size')
  if (!/#\/p\/[^/]+\/1$/.test(page.url())) c.bad(`known-size quote did not open at step 1: ${page.url()}`)
  const steps = c.phone ? Number((await page.getByTestId('step-sheet-btn').innerText()).match(/\d+\D+(\d+)/)?.[1]) : await page.locator('nav ol button[data-testid^="step-"]').count()
  if (steps !== 6) c.bad(`known-size quote should have 6 steps, has ${steps}`)
  if (!(await page.getByTestId('size-targets').isVisible())) return c.bad('System step has no size inputs')
  await c.check('size: system (defaults)', { shotName: 'system-default' })

  await page.getByTestId('size-type-hybrid').click()
  await fillNum(page.getByTestId('target-inv'), 5)
  await fillNum(page.getByTestId('target-batt'), 10)
  await page.waitForTimeout(300)
  const help = async (id) => (await page.getByTestId(id).locator('xpath=ancestor::label[1]').locator('.help').innerText().catch(() => '')).trim()
  const battHelp = await help('target-batt'), invHelp = await help('target-inv')
  c.ok(`5 kW / 10 kWh → ${invHelp} | ${battHelp}`)
  if (!/=\s*(9\.|10\.|1[01]\b)/.test(battHelp) && !/1[0-2]\.\d+ kWh$/.test(battHelp)) c.bad(`battery installed is not ≈10 kWh: ${battHelp}`)
  if (!/= ?[56](\.0)? kW/.test(invHelp)) c.bad(`inverter installed is not ≈5 kW: ${invHelp}`)
  const battEq = (await page.getByTestId('eq-battery').innerText()).replace(/\s+/g, ' ')
  if (!/LiFePO4|LFP|ليثيوم|kWh/i.test(battEq)) c.warn(`battery row does not say lithium: ${battEq}`)
  const pv0 = await help('target-pv')
  // customer changes his mind: 8 kWp
  await fillNum(page.getByTestId('target-pv'), 8)
  await page.waitForTimeout(300)
  const pv1 = await help('target-pv')
  c.ok(`PV ${pv0} → ${pv1}`)
  const kwp = numOf(pv1.split('=').pop())
  if (!(kwp >= 8 && kwp < 9)) c.bad(`8 kWp target installs ${pv1}`)
  await c.check('size: system 8 kWp / 10 kWh / 5 kW', { shotName: 'system-8kwp' })

  await goKey(page, 'size', 'site'); await c.check('size: site', { shotName: 'site' })
  await goKey(page, 'size', 'results')
  const stats = (await page.getByTestId('results-stats').innerText()).replace(/\s+/g, ' ')
  if (!(await page.getByTestId('results-basis').isVisible().catch(() => false))) c.bad('results: no "size chosen" basis note')
  c.ok(`results: ${stats}`)
  await c.check('size: results', { shotName: 'results' })
  if ((await page.locator('svg.recharts-surface').count()) < 1) c.bad('results: no production chart for an 8 kWp system')

  await goKey(page, 'size', 'bom')
  const total = await grandTotal(page)
  const statsTotal = numOf(stats)
  if (Math.abs(numOf(total) - statsTotal) > 1) c.bad(`Pricing total ${total} ≠ Results total ${stats.slice(0, 40)}`)
  await c.check('size: pricing', { shotName: 'pricing' })

  await goKey(page, 'size', 'info')
  const client = c.lang === 'ar' ? 'محمد عبد الله' : 'Mohamed Abdalla'
  await page.getByTestId('info-client').fill(client)
  await page.getByTestId('info-notes').fill(`${SECRET} supplier discount 12%`)
  await c.check('size: client', { shotName: 'client' })

  await goKey(page, 'size', 'export')
  await c.check('size: export', { shotName: 'export' })
  const ready = await page.getByTestId('ready-client').getAttribute('data-ok')
  if (ready !== 'true') c.bad('export: client name not ticked as ready')
  const q = await grab(c, () => page.getByTestId('export-quote-download').click(), 'quotation')
  const qt = checkClientPdf(c, q, 'quotation PDF', { total, secret: SECRET })
  if (q) { pdfPng(q, { last: 2 }); if (!qt.includes(client.split(' ')[0]) && c.lang === 'en') c.bad('quotation PDF has no client name') }
  const p = await grab(c, () => page.getByTestId('export-proposal-download').click(), 'proposal')
  const pt = checkClientPdf(c, p, 'proposal PDF', { total, secret: SECRET })
  if (p) { pdfPng(p, { last: 4 }); if (!/8\.\d\d kWp|8\.\d kWp/.test(pt)) c.bad('proposal PDF does not show the 8 kWp array') }
  // technical PDF is internal: allowed to show cost, but never NaN
  const tch = await grab(c, () => page.getByTestId('export-tech-download').click(), 'technical')
  if (tch) checkClientPdf(c, tch, 'technical PDF', { internalOk: true })
  await page.waitForTimeout(300)
  await c.check('size: export after downloads', { shotName: 'export-done' })
})
