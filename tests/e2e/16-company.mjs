// Scenario g — company setup on the price list page: 3 own prices, one inverter "not stocked", one own panel (datasheet form) →
// a new design never auto-picks the hidden inverter, uses the company prices, offers the own panel; company file export →
// clear storage → import → everything restored.
import fs from 'node:fs'
import { scenario, grab, numOf, goKey, fillNum, newVia, go, setLang, confirmDialog } from './lib.mjs'

const recommended = async (page, testId) => {
  await page.getByTestId(testId).click(); await page.waitForTimeout(300)
  const id = await page.getByTestId('equipment-picker').locator('[data-testid^=pick-]').filter({ has: page.locator('.badge-ok') }).first().getAttribute('data-testid').catch(() => null)
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  return id?.replace(/^pick-/, '') ?? null
}
const designWithFamily = async (c) => {
  await newVia(c.page, 'design'); await goKey(c.page, 'design', 'loads')
  await c.page.getByTestId('tpl-tplFamilyHome').click(); await c.page.waitForTimeout(250)
  await goKey(c.page, 'design', 'design')
}
const unitCost = (page, id) => page.locator(`[data-line-id="${id}"] input[inputmode=decimal]`).nth(1).inputValue().catch(() => null)

await scenario('16-company', async (c) => {
  const { page } = c
  // reference design: what the planner picks out of the box
  await designWithFamily(c)
  const ref = { panel: await recommended(page, 'eq-panel'), inverter: await recommended(page, 'eq-inverter'), battery: await recommended(page, 'eq-battery') }
  c.ok(`reference auto-picks: ${JSON.stringify(ref)}`)
  if (!ref.inverter || !ref.panel || !ref.battery) return c.bad('could not read the recommended products')

  // ---- price list page
  await go(page, 'prices')
  if (!(await page.getByTestId('prices-page').isVisible())) return c.bad('price list did not open')
  await c.check('prices: panels tab', { shotName: 'prices' })
  const setPrice = async (tab, id, v, q) => {
    await page.getByTestId(`prices-tab-${tab}`).click()
    await page.getByTestId('prices-search').fill(q ?? ''); await page.waitForTimeout(300)
    const inp = page.getByTestId(`price-${id}`)
    if (!(await inp.count())) { c.bad(`price field for ${id} not found on tab ${tab}`); return }
    await fillNum(inp, v); await page.waitForTimeout(150)
    if (numOf(await inp.inputValue()) !== v) c.bad(`price ${id} shows ${await inp.inputValue()} after typing ${v}`)
  }
  await setPrice('panels', ref.panel, 77, ref.panel.split('-').slice(1, 3).join(' '))
  await setPrice('batteries', ref.battery, 1234)
  await setPrice('items', 'mc4-pair', 4.5, 'mc4')
  await page.getByTestId('prices-search').fill('')
  // not stocked
  await page.getByTestId('prices-tab-inverters').click(); await page.waitForTimeout(200)
  const sw = page.getByTestId(`stock-${ref.inverter}`)
  await sw.click(); await page.waitForTimeout(150)
  if ((await sw.getAttribute('aria-checked')) !== 'false') c.bad('stock switch did not turn off')
  await c.check('prices: inverters (one hidden)', { shotName: 'prices-hidden' })
  // own panel, typed from a datasheet (save empty first: errors must show)
  await page.getByTestId('prices-tab-panels').click()
  await page.getByTestId('prices-add').click(); await page.waitForTimeout(300)
  const form = page.getByTestId('product-form')
  await form.getByTestId('pf-save').click(); await page.waitForTimeout(200)
  const nInvalid = await form.locator('[aria-invalid=true]').count()
  if (nInvalid < 5) c.bad(`saving an empty product form flags only ${nInvalid} fields`)
  const ds = { brand: 'Acme', model: 'QA-555 Bifacial', watts: 555, efficiencyPct: 21.5, voc: 49.9, vmp: 41.8, isc: 14.0, imp: 13.28, lengthMm: 2278, widthMm: 1134, weightKg: 27.5, approxPriceUsd: 88 }
  for (const [k, v] of Object.entries(ds)) {
    const f = form.getByTestId(`pf-${k}`)
    if (typeof v === 'string') await f.fill(v); else await fillNum(f, v)
  }
  await c.check('prices: product form', { shotName: 'product-form' })
  await form.getByTestId('pf-save').click(); await page.waitForTimeout(400)
  if (await form.isVisible().catch(() => false)) { const errs = await form.locator('.error-text').allInnerTexts(); c.bad(`own panel not saved: ${errs.join(' | ')}`); await page.keyboard.press('Escape') }
  await page.getByTestId('prices-tab-mine').click(); await page.waitForTimeout(200)
  const own = await page.locator('[data-testid^=own-my-panel]').first().getAttribute('data-testid').catch(() => null)
  const ownId = own?.replace(/^own-/, '')
  if (!ownId) c.bad('own panel not listed under "Your products"')
  const summary = (await page.getByTestId('prices-summary').innerText()).replace(/\s+/g, ' ')
  c.ok(`price list: ${summary}; own id ${ownId}`)
  await c.check('prices: own products', { shotName: 'prices-mine' })

  // ---- a new design uses all of it
  await designWithFamily(c)
  const now = { panel: await recommended(page, 'eq-panel'), inverter: await recommended(page, 'eq-inverter'), battery: await recommended(page, 'eq-battery') }
  if (now.inverter === ref.inverter) c.bad(`hidden inverter ${ref.inverter} still auto-picked`)
  else c.ok(`auto inverter now ${now.inverter} (was ${ref.inverter})`)
  await page.getByTestId('eq-inverter').click(); await page.waitForTimeout(250)
  const hiddenRow = page.getByTestId(`pick-${ref.inverter}`)
  if (!(await hiddenRow.getByTestId('not-stocked').count())) c.bad('hidden inverter is not tagged "not stocked" in the picker')
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  await goKey(page, 'design', 'bom'); await page.getByTestId('view-cost').click(); await page.waitForTimeout(200)
  const costs = { panel: await unitCost(page, now.panel), battery: await unitCost(page, now.battery), mc4: await unitCost(page, 'mc4-pair') }
  c.ok(`unit costs in the BOM: ${JSON.stringify(costs)}`)
  if (now.panel === ref.panel && numOf(costs.panel) !== 77) c.bad(`panel unit cost ${costs.panel}, company price 77`)
  if (now.battery === ref.battery && numOf(costs.battery) !== 1234) c.bad(`battery unit cost ${costs.battery}, company price 1234`)
  if (numOf(costs.mc4) !== 4.5) c.bad(`MC4 unit cost ${costs.mc4}, company price 4.5`)
  if (now.battery !== ref.battery) c.warn(`auto battery changed after re-pricing: ${ref.battery} → ${now.battery}`)
  await page.getByTestId('view-client').click()
  // own panel in the System step
  await goKey(page, 'design', 'design')
  await page.getByTestId('eq-panel').click(); await page.waitForTimeout(250)
  const picker = page.getByTestId('equipment-picker')
  await picker.locator('input[type=search]').fill('acme'); await page.waitForTimeout(200)
  const pick = picker.locator(`[data-testid="pick-${ownId}"]`)
  if (!(await pick.count())) { c.bad('own panel not offered in the System step picker'); await page.keyboard.press('Escape') }
  else {
    await c.check('system: panel picker with own panel', { shotName: 'picker-own' })
    await pick.click(); await page.waitForTimeout(250)
    const eq = (await page.getByTestId('eq-panel').innerText()).replace(/\s+/g, ' ')
    if (!/Acme/.test(eq)) c.bad(`System step does not show the own panel: ${eq}`)
    await goKey(page, 'design', 'bom'); await page.getByTestId('view-cost').click(); await page.waitForTimeout(200)
    const oc = await unitCost(page, ownId)
    if (numOf(oc) !== 88) c.bad(`own panel unit cost ${oc}, list price 88`)
    else c.ok('own panel priced 88 from the list')
    await c.check('pricing with own panel', { shotName: 'pricing-own' })
    await page.getByTestId('view-client').click()
  }

  // ---- company file round trip
  await go(page, 'settings')
  const countsBefore = (await page.getByTestId('settings-prices-counts').innerText()).trim()
  const f = await grab(c, () => page.getByTestId('export-company').click(), 'company')
  if (!f) return
  const j = JSON.parse(fs.readFileSync(f, 'utf8'))
  const pb = j.company?.priceBook
  if (j.kind !== 'dtplus-company' || !pb) return c.bad(`company file shape: ${Object.keys(j)}`)
  if (Object.keys(pb.prices).length !== 3 || pb.hidden.length !== 1 || pb.custom.panels.length !== 1) c.bad(`company file: ${Object.keys(pb.prices).length} prices, ${pb.hidden.length} hidden, ${pb.custom.panels.length} own panels`)
  if ('projects' in j) c.bad('company file contains projects')
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle' })
  if (c.lang === 'ar') await setLang(page, 'ar')
  await go(page, 'settings')
  const countsCleared = (await page.getByTestId('settings-prices-counts').innerText()).trim()
  if (countsCleared === countsBefore) c.bad('clearing storage did not clear the price list')
  await page.getByTestId('import-company-file').setInputFiles(f); await page.waitForTimeout(400)
  if (!(await page.getByTestId('confirm-dialog').isVisible())) return c.bad('company import asks no confirmation')
  await c.check('settings: import confirmation', { shotName: 'import-confirm' })
  await confirmDialog(page)
  const countsAfter = (await page.getByTestId('settings-prices-counts').innerText()).trim()
  if (countsAfter !== countsBefore) c.bad(`after import counts "${countsAfter}" ≠ before "${countsBefore}"`)
  else c.ok(`restored: ${countsAfter}`)
  await go(page, 'prices')
  await page.getByTestId('prices-tab-inverters').click(); await page.waitForTimeout(200)
  if ((await page.getByTestId(`stock-${ref.inverter}`).getAttribute('aria-checked')) !== 'false') c.bad('hidden inverter not restored')
  await page.getByTestId('prices-tab-batteries').click(); await page.waitForTimeout(200)
  if (numOf(await page.getByTestId(`price-${ref.battery}`).inputValue()) !== 1234) c.bad('battery price not restored')
  await page.getByTestId('prices-tab-mine').click(); await page.waitForTimeout(200)
  if (!(await page.getByTestId(`own-${ownId}`).count())) c.bad('own panel not restored')
  await c.check('prices after import', { shotName: 'prices-restored' })
  await designWithFamily(c)
  if ((await recommended(page, 'eq-inverter')) === ref.inverter) c.bad('after import the hidden inverter is auto-picked again')
})
