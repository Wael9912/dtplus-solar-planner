// Scenario e — grid-tied from the bill: full design, Loads → Electricity bill 450 kWh/month residential, grid-tied, Khartoum;
// results sensible; the proposal states the bill basis.
import { scenario, grab, checkClientPdf, pdfPng, numOf, goKey, fillNum, newVia, grandTotal } from './lib.mjs'

await scenario('14-bill', async (c) => {
  const { page, T } = c
  const P = c.D.X[c.lang].pdf
  await newVia(page, 'design')
  await page.locator('[role=radiogroup] [role=radio]').filter({ hasText: T.info.gridtie }).first().click()
  await page.getByTestId('info-client').fill(c.lang === 'ar' ? 'أسرة الطيب' : 'El Tayeb family')
  await c.check('bill: client', { shotName: 'client' })
  await goKey(page, 'design', 'loads')
  await page.getByTestId('demand-bill').click()
  await page.waitForTimeout(200)
  if (!(await page.getByTestId('bill-view').isVisible())) return c.bad('Electricity bill view did not open')
  await fillNum(page.getByTestId('bill-kwh'), 450)
  await page.waitForTimeout(250)
  const kpis = (await page.getByTestId('bill-kpis').innerText()).replace(/\s+/g, ' ')
  c.ok(`bill KPIs: ${kpis}`)
  const day = numOf(kpis)
  if (Math.abs(day - 450 / 30.4) > 0.1) c.bad(`daily energy ${day} ≠ 450/30.4 = ${(450 / 30.4).toFixed(1)}`)
  // the amount field: tariff × kWh
  await c.check('bill: loads (bill)', { shotName: 'bill' })

  await goKey(page, 'design', 'site')
  const loc = await page.getByTestId('site-location').inputValue()
  if (loc !== 'khartoum') await page.getByTestId('site-location').selectOption('khartoum')
  if (await page.getByTestId('site-outage').count()) c.bad('grid-tied site step shows the outage-hours field')
  await c.check('bill: site', { shotName: 'site' })
  await goKey(page, 'design', 'design')
  if (await page.getByTestId('eq-battery').count()) c.bad('grid-tied System step shows a battery row')
  await c.check('bill: system', { shotName: 'system' })

  await goKey(page, 'design', 'results')
  const basis = (await page.getByTestId('results-basis').innerText().catch(() => '')).replace(/\s+/g, ' ')
  if (!/450/.test(basis)) c.bad(`results basis does not state the 450 kWh bill: "${basis}"`)
  const stats = (await page.getByTestId('results-stats').innerText()).replace(/\s+/g, ' ')
  c.ok(`results: ${basis} || ${stats}`)
  const kwp = Number(/([\d.]+)\s*kWp/.exec(stats)?.[1])
  if (!(kwp >= 2 && kwp <= 5)) c.bad(`450 kWh/month in Khartoum → ${kwp} kWp (expected ≈2.5–4)`)
  if (/kWh\s*(سعة التخزين|Battery storage)/.test(stats)) c.bad('grid-tied results show battery storage')
  const issues = await page.locator('[data-testid=checks] li').allInnerTexts().catch(() => [])
  if (issues.length) c.warn(`checks on a plain 450 kWh grid-tied design: ${issues.map((x) => x.replace(/\s+/g, ' ').slice(0, 90)).join(' | ')}`)
  await c.check('bill: results', { shotName: 'results' })

  await goKey(page, 'design', 'bom')
  const ids = await page.locator('[data-line-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-line-id')))
  if (ids.some((x) => /^bat-|batt-|bms-/.test(x))) c.bad(`grid-tied BOM has battery lines: ${ids.filter((x) => /^bat-|batt-|bms-/.test(x))}`)
  const total = await grandTotal(page)
  await c.check('bill: pricing', { shotName: 'pricing' })

  await goKey(page, 'design', 'export')
  const ready = await page.getByTestId('ready-loads').innerText().catch(() => '')
  if (!/450/.test(ready)) c.bad(`export readiness does not name the bill: "${ready.replace(/\s+/g, ' ')}"`)
  await c.check('bill: export', { shotName: 'export' })
  const p = await grab(c, () => page.getByTestId('export-proposal-download').click(), 'proposal')
  const txt = checkClientPdf(c, p, 'bill proposal', { total })
  if (p) {
    pdfPng(p, { last: 3 })
    const flat = txt.replace(/\s+/g, ' ')
    if (!/450/.test(flat)) c.bad('proposal does not state 450 kWh/month')
    if (c.lang === 'en' && !flat.includes(P.profiles.residential)) c.bad('proposal does not state the residential profile')
    if (c.lang === 'en' && !/electricity bill/i.test(flat)) c.bad('proposal does not say the size comes from the electricity bill')
  }
  const tch = await grab(c, () => page.getByTestId('export-tech-download').click(), 'technical')
  if (tch) { const t = checkClientPdf(c, tch, 'bill technical', { internalOk: true }); if (!/450/.test(t)) c.bad('technical PDF does not state the bill') }
})
