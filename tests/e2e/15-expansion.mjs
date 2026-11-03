// Scenario f — expansion: known size where 1 inverter + 6 panels are already on site; add a 10 kWh battery →
// the existing units are designed in but not quoted ("already on site" badge), mounting / labour only for new panels.
import { scenario, grab, checkClientPdf, pdfPng, numOf, goKey, fillNum, newVia, grandTotal } from './lib.mjs'

await scenario('15-expansion', async (c) => {
  const { page } = c
  await newVia(page, 'size')
  await page.getByTestId('size-type-hybrid').click()
  await fillNum(page.getByTestId('target-pv'), 3.48) // the 6 × 580 W already on the roof
  await fillNum(page.getByTestId('target-batt'), 10)
  await page.waitForTimeout(300)
  const pvHelp = (await page.getByTestId('target-pv').locator('xpath=ancestor::label[1]').locator('.help').innerText()).trim()
  const nPanels = numOf(pvHelp.replace(/^\D+/, ''))
  c.ok(`design: ${pvHelp}`)
  // price before declaring existing equipment
  await goKey(page, 'size', 'bom')
  const full = await grandTotal(page)
  await goKey(page, 'size', 'design')

  const disc = page.getByTestId('existing-equipment')
  if (!(await disc.evaluate((e) => e.open))) await disc.locator('summary').click()
  await fillNum(page.getByTestId('existing-panels'), 6)
  await fillNum(page.getByTestId('existing-inverters'), 1)
  await page.waitForTimeout(300)
  await c.check('expansion: system', { shotName: 'system' })

  await goKey(page, 'size', 'results')
  await c.check('expansion: results', { shotName: 'results' })
  const notes = (await page.getByTestId('results-overview').innerText()).replace(/\s+/g, ' ')
  c.ok(`results: ${notes.slice(0, 220)}`)

  await goKey(page, 'size', 'bom')
  const part = await grandTotal(page)
  if (!(numOf(part) < numOf(full) * 0.85)) c.bad(`total with existing panels + inverter ${part} is not much below the full system ${full}`)
  c.ok(`total ${full} → ${part} with existing equipment`)
  await page.getByTestId('view-cost').click(); await page.waitForTimeout(200)
  const rows = await page.locator('[data-line-id]').evaluateAll((els) => els.map((e) => ({
    // a line entirely on site has no quantity input (qty 0, price "—"); it only carries the badge
    id: e.getAttribute('data-line-id'), qty: e.querySelector('input[inputmode=decimal]')?.value ?? (e.querySelector('[data-testid=bom-existing]') ? '0' : undefined), badge: e.querySelector('[data-testid=bom-existing]')?.innerText ?? '',
  })))
  const panel = rows.find((r) => /^pnl-/.test(r.id)), inv = rows.find((r) => /^inv-/.test(r.id)), batt = rows.find((r) => /^bat-/.test(r.id))
  c.ok(`panel ${JSON.stringify(panel)} inverter ${JSON.stringify(inv)} battery ${JSON.stringify(batt)}`)
  if (!panel?.badge) c.bad('panel line has no "already on site" badge')
  if (!inv?.badge) c.bad('inverter line has no "already on site" badge')
  if (panel && Number(panel.qty) !== Math.max(0, nPanels - 6)) c.bad(`panel line quotes ${panel.qty}, expected ${nPanels} − 6`)
  if (inv && Number(inv.qty) !== 0) c.bad(`inverter line quotes ${inv.qty}, expected 0 (already on site)`)
  if (!batt || !(Number(batt.qty) > 0)) c.bad(`battery not quoted: ${JSON.stringify(batt)}`)
  if (rows.some((r) => /mid-clamp|end-clamp|^rail|triangle-frame|ballast/.test(r.id) && Number(r.qty) > 0) && nPanels <= 6) c.bad(`mounting quoted for panels already on site: ${rows.filter((r) => /clamp|rail|frame|ballast/.test(r.id)).map((r) => `${r.id}=${r.qty}`)}`)
  const lab = rows.find((r) => r.id === 'labour'); c.ok(`labour line: ${JSON.stringify(lab)}`)
  await c.check('expansion: pricing (cost view)', { shotName: 'pricing-cost' })
  await page.getByTestId('view-client').click(); await page.waitForTimeout(200)
  const badgesClient = await page.getByTestId('bom-existing').count()
  if (!badgesClient) c.warn('client view hides the "already on site" lines (qty 0 lines are filtered) — the client never sees what is reused')
  await c.check('expansion: pricing (client view)', { shotName: 'pricing-client' })

  // partial: 9 panels designed, 6 on site → 3 quoted with the badge
  await goKey(page, 'size', 'design')
  await fillNum(page.getByTestId('target-pv'), 5.22)
  await goKey(page, 'size', 'bom')
  await page.getByTestId('view-cost').click(); await page.waitForTimeout(200)
  const p2 = await page.locator('[data-line-id^="pnl-"]').first().evaluate((e) => ({ qty: e.querySelector('input[inputmode=decimal]')?.value, badge: e.querySelector('[data-testid=bom-existing]')?.innerText ?? '' })).catch(() => null)
  if (!p2?.badge || p2.qty !== '3') c.bad(`partial expansion (9 designed, 6 on site): panel line ${JSON.stringify(p2)}`)
  else c.ok(`partial expansion: panel line qty ${p2.qty}, badge "${p2.badge}"`)
  await c.check('expansion: partial', { shotName: 'pricing-partial' })
  await page.getByTestId('view-client').click(); await page.waitForTimeout(150)
  await goKey(page, 'size', 'design'); await fillNum(page.getByTestId('target-pv'), 3.48)

  await goKey(page, 'size', 'export')
  const p = await grab(c, () => page.getByTestId('export-proposal-download').click(), 'proposal')
  const txt = checkClientPdf(c, p, 'expansion proposal', { total: part })
  if (p) {
    pdfPng(p, { last: 3 })
    if (!/on site|existing|موجود|القائم/i.test(txt)) c.warn('proposal does not mention the equipment already on site')
  }
})
