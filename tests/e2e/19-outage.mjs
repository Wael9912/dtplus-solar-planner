// Scenario j — hybrid in Khartoum with 8 h daily outages: the outage hours raise the savings (Results before / after),
// the system size does not change, the blended avoided cost is explained on the Site step.
import { scenario, numOf, goKey, fillNum, newVia, grab, checkClientPdf } from './lib.mjs'

const statOf = async (page, label) => {
  const stats = page.getByTestId('results-stats').locator('.stat, .stat-hero')
  const n = await stats.count()
  for (let i = 0; i < n; i++) {
    const l = (await stats.nth(i).locator('.stat-label').innerText()).trim()
    if (l === label) return (await stats.nth(i).locator('.stat-value').innerText()).trim()
  }
  return null
}

await scenario('19-outage', async (c) => {
  const { page, T } = c
  await newVia(page, 'design')
  await page.locator('[role=radiogroup] [role=radio]').filter({ hasText: T.info.hybrid }).first().click()
  await goKey(page, 'design', 'loads')
  await page.getByTestId('tpl-tplFamilyHome').click(); await page.waitForTimeout(250)
  await goKey(page, 'design', 'site')
  await page.getByTestId('site-location').selectOption('khartoum')
  const outage = page.getByTestId('site-outage')
  if (!(await outage.isVisible())) return c.bad('hybrid Site step has no outage-hours field')
  if (numOf(await outage.inputValue()) !== 0) c.warn(`outage hours default ${await outage.inputValue()}`)
  await goKey(page, 'design', 'results')
  const before = { sav: await statOf(page, T.results.savings), pay: await statOf(page, T.results.payback), pv: await statOf(page, T.results.arraySize), batt: await statOf(page, T.results.bankSize) }
  await c.check('outage 0 h: results', { shotName: 'results-0h' })

  await goKey(page, 'design', 'site')
  await fillNum(outage, 8); await page.waitForTimeout(250)
  if (!(await page.getByTestId('site-diesel').isVisible())) c.bad('no diesel cost field after setting 8 h outages')
  const blended = (await page.getByTestId('site-blended').innerText().catch(() => '')).trim()
  if (!blended) c.bad('no blended avoided-cost line with 8 h outages')
  c.ok(`site: ${blended}`)
  await c.check('outage 8 h: site', { shotName: 'site-8h' })
  await goKey(page, 'design', 'results')
  const after = { sav: await statOf(page, T.results.savings), pay: await statOf(page, T.results.payback), pv: await statOf(page, T.results.arraySize), batt: await statOf(page, T.results.bankSize) }
  c.ok(`before ${JSON.stringify(before)} → after ${JSON.stringify(after)}`)
  if (!before.sav || !after.sav) c.bad(`savings tile not found (label "${T.results.savings}")`)
  else if (!(numOf(after.sav) > numOf(before.sav) * 1.2)) c.bad(`8 h outages: savings ${before.sav} → ${after.sav} (expected a clear increase)`)
  if (before.pay && after.pay && !(numOf(after.pay) < numOf(before.pay))) c.bad(`payback did not drop: ${before.pay} → ${after.pay}`)
  if (before.pv !== after.pv || before.batt !== after.batt) c.bad(`outage hours changed the system size: ${before.pv}/${before.batt} → ${after.pv}/${after.batt}`)
  await c.check('outage 8 h: results', { shotName: 'results-8h' })
  // 24 h outages (no grid at all) and back to 0
  await goKey(page, 'design', 'site'); await fillNum(outage, 24); await goKey(page, 'design', 'results')
  const all = await statOf(page, T.results.savings)
  if (!(numOf(all) >= numOf(after.sav))) c.bad(`24 h outages: savings ${all} < 8 h ${after.sav}`)
  await c.check('outage 24 h: results', { shotName: 'results-24h' })
  await goKey(page, 'design', 'site'); await fillNum(outage, 30); await page.waitForTimeout(150)
  const v30 = await outage.inputValue()
  if (numOf(v30) > 24) c.bad(`outage field accepted ${v30} h`)
  await fillNum(outage, 8)
  await goKey(page, 'design', 'export')
  const p = await grab(c, () => page.getByTestId('export-proposal-download').click(), 'proposal')
  const txt = checkClientPdf(c, p, 'outage proposal')
  if (p && after.sav && !txt.replace(/\s+/g, ' ').includes(after.sav.replace(/[^\d,]/g, ''))) c.warn(`proposal does not show the outage savings ${after.sav}`)
})
