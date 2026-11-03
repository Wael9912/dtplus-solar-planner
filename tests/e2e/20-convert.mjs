// Scenario k — project-type conversion: full design (samples) → known size keeps the same total; → product quote; back to full design.
import { scenario, loadSamples, projectCards, goKey, go, grandTotal, numOf, confirmDialog } from './lib.mjs'

const convert = async (c, to) => {
  await c.page.getByTestId(`ptype-${to}`).click()
  if (!(await c.page.getByTestId('confirm-dialog').waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false))) { c.bad(`converting to ${to}: no confirmation`); return }
  await confirmDialog(c.page)
}

await scenario('20-convert', async (c) => {
  const { page } = c
  await loadSamples(page)
  const cards = projectCards(page)
  for (const ref of ['Q-2026-0112', 'Q-2026-0098', 'Q-2026-0105', 'Q-2026-0120']) {
    await cards.filter({ hasText: ref }).getByTestId('project-open').click(); await page.waitForTimeout(300)
    await goKey(page, 'design', 'bom')
    const t0 = await grandTotal(page)
    await goKey(page, 'design', 'info')
    await convert(c, 'size')
    if (!/#\/p\/[^/]+\/5$/.test(page.url())) c.bad(`${ref}: after → size the URL is ${page.url()} (Client = step 5)`)
    await goKey(page, 'size', 'bom')
    const t1 = await grandTotal(page)
    if (t1 !== t0) c.bad(`${ref}: full design ${t0} → known size ${t1} (should be the same)`)
    else c.ok(`${ref}: design → size keeps ${t0}`)
    await goKey(page, 'size', 'results'); await c.check(`${ref}: as known size (results)`, { shotName: `${ref}-size-results` })
    await goKey(page, 'size', 'info')
    await convert(c, 'items')
    if (!/#\/p\/[^/]+\/2$/.test(page.url())) c.bad(`${ref}: after → items the URL is ${page.url()} (Client = step 2)`)
    await goKey(page, 'items', 'bom')
    const empty = await page.getByTestId('bom-empty').isVisible().catch(() => false)
    if (!empty) c.warn(`${ref}: product quote after conversion is not empty (total ${await grandTotal(page).catch(() => '?')})`)
    await c.check(`${ref}: as product quote`, { shotName: `${ref}-items` })
    // a product added in the product quote survives the way back
    await page.getByTestId('bom-add-products').click(); await page.waitForTimeout(300)
    await page.getByTestId('catalog-sheet').getByTestId('catalog-search').fill('mc4'); await page.waitForTimeout(300)
    await page.getByTestId('catalog-sheet').getByTestId('catalog-item').first().click()
    await page.getByTestId('catalog-done').click(); await page.waitForTimeout(200)
    const tItems = await grandTotal(page)
    await goKey(page, 'items', 'info')
    await convert(c, 'design')
    await goKey(page, 'design', 'bom')
    const t2 = await grandTotal(page)
    const diff = numOf(t2) - numOf(t0)
    if (!(diff > 0 && diff <= numOf(tItems) + 1)) c.bad(`${ref}: back to full design total ${t2} vs original ${t0} + added product ${tItems}`)
    else c.ok(`${ref}: back to design ${t2} (= ${t0} + ${tItems})`)
    await c.check(`${ref}: back to full design`, { shotName: `${ref}-back` })
    // card on the list shows the right mode
    await go(page, 'projects')
    const mode = await cards.filter({ hasText: ref }).getAttribute('data-mode')
    if (mode !== 'design') c.bad(`${ref}: card mode ${mode}`)
  }
  // a fresh known-size quote converted to full design with no loads: no NaN, empty-state guidance
  await page.getByTestId('start-size').click(); await page.waitForTimeout(300)
  await goKey(page, 'size', 'info'); await convert(c, 'design')
  await goKey(page, 'design', 'results')
  if (!(await page.getByTestId('go-loads').isVisible())) c.bad('known size → full design without loads: Results do not ask for loads')
  await c.check('size → design without loads', { shotName: 'size-to-design-empty' })
})
