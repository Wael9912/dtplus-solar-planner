// Scenario 6: edge cases — zero loads, 3-phase mix, gridtie, panel qty 1, 500 kWh/day.
import fs from 'node:fs'; import path from 'node:path'
import { launch, DESKTOP, DL, shot, checkPage, reportErrors, gotoApp, goStep, clearStorage, issue, pass, summary, newProject as navNew, exportDoc } from './lib.mjs'
const { browser, page, errors } = await launch(DESKTOP)
await gotoApp(page); await clearStorage(page); await page.reload({ waitUntil: 'networkidle' })
const newProject = async (name) => { await navNew(page); await page.getByLabel('Project name').fill(name) }
const walk = async (label) => { for (let s = 0; s < 7; s++) { await goStep(page, s); await checkPage(page, `${label} step ${s + 1}`); reportErrors(errors, `${label} step ${s + 1}`) } }
const checks = async () => (await page.locator('[data-testid=checks] li').allInnerTexts()).map((x) => x.replace(/\n/g, ' '))
const exportAll = async (label) => {
  await goStep(page, 6)
  for (const i of [0, 1, 2]) { const dlp = page.waitForEvent('download', { timeout: 30000 }).catch(() => null); await exportDoc(page, i); const dl = await dlp; if (!dl) issue(`${label}: export ${i} failed`); else { const out = path.join(DL, `${label.replace(/\W+/g, '_')}-${dl.suggestedFilename()}`); await dl.saveAs(out); if (fs.statSync(out).size === 0) issue(`${label}: export ${i} empty`) } await page.waitForTimeout(300); reportErrors(errors, `${label} export ${i}`) }
  pass(`${label}: pdf/tech/xlsx exports ok`)
}
const addCustomLoad = async (watts, qty, hours) => {
  await page.getByTestId('add-custom').click(); await page.waitForTimeout(150)
  const ed = page.getByTestId('load-editor'); const n = ed.locator('input[inputmode=decimal]')
  await ed.locator('input').first().fill('Big load'); await n.nth(0).fill(String(watts)); await n.nth(1).fill(String(qty)); await n.nth(2).fill(String(hours)); await n.nth(2).blur()
  await page.getByTestId('load-editor-done').click(); await page.waitForTimeout(150)
}
const applyTemplate = async (key) => {
  if (await page.getByTestId(`tpl-${key}`).isVisible()) { await page.getByTestId(`tpl-${key}`).click() }
  else { await page.getByTestId('open-library').click(); await page.getByTestId(`lib-tpl-${key}`).click(); await page.getByTestId('tpl-add').click() }
  await page.waitForTimeout(150)
}

// (a) zero loads → Results/Pricing/Export show the "add loads first" empty state
await newProject('Edge: zero loads'); await walk('zero-loads')
await goStep(page, 4)
if (!(await page.getByTestId('go-loads').isVisible())) issue('zero-loads: Results should show the empty state with "Go to Loads"'); else pass('zero-loads: empty state instead of a fake system')
await shot(page, '06-zero-loads-results')

// (b) 3-phase with 1-phase mix
await newProject('Edge: three-phase mix'); await page.getByRole('radio', { name: 'Three-phase 400 V' }).click()
await goStep(page, 1); await applyTemplate('tplFamilyHome'); await applyTemplate('tplFarm')
const phaseSel = page.locator('[data-testid=loads-table] tbody tr select'); if (!(await phaseSel.count())) issue('3ph: phase column missing'); else pass(`3ph: phase column with ${await phaseSel.count()} selects`)
await phaseSel.first().selectOption('3') // one three-phase motor/pump load
await walk('3ph'); await goStep(page, 4); let c = await checks(); pass(`3ph checks: ${c.join(' | ')}`)
await page.getByTestId('tab-engineering').click(); const txt3 = await page.locator('main').innerText(); if (!/3-ph|3φ|Three|3-phase/.test(txt3)) issue('3ph: no 3-phase inverter visible?')
await shot(page, '06-3ph-results'); await exportAll('3ph')
// switch project to single-phase while it has 3-phase loads -> expect error check
await goStep(page, 0); await page.getByRole('radio', { name: 'Single-phase 230 V' }).click(); await goStep(page, 4); c = await checks()
if (!c.some((x) => /Three-phase loads present|three-phase/i.test(x))) issue(`3ph->1ph: no load-phase error; ${c}`); else pass('3ph->1ph: load-phase error shown')
reportErrors(errors, '3ph->1ph')

// (c) grid-tied no battery
await newProject('Edge: gridtie'); await page.getByRole('radio', { name: /Grid-tied/ }).click()
await goStep(page, 1); await applyTemplate('tplShop')
if (await page.locator('[data-testid=loads-table] th', { hasText: 'Backup' }).count()) issue('gridtie: Backup column should be hidden')
await walk('gridtie'); await goStep(page, 3)
if (await page.getByLabel('Battery system voltage').count()) issue('gridtie: voltage field should be hidden')
await goStep(page, 4); c = await checks(); if (c.some((x) => /No battery/.test(x))) issue('gridtie: "No battery" check should not appear')
await page.getByTestId('tab-engineering').click(); const gt = await page.locator('main').innerText(); if (/Battery bank/.test(gt)) issue('gridtie: battery bank section shown')
pass(`gridtie checks: ${c.join(' | ')}`); await shot(page, '06-gridtie-results')
await goStep(page, 5); const gb = await page.getByTestId('bom-table').innerText(); if (/Batteries/.test(gb)) issue('gridtie: battery lines in BOM'); else if (/MPPT controller|MPPT 60A|needs external MPPT/i.test(gb)) issue('gridtie: inverter/charger or MPPT controllers in a grid-tied BOM'); else pass('gridtie: BOM has no battery/controller lines')
await exportAll('gridtie')

// (d) panel qty override = 1
await newProject('Edge: one panel'); await goStep(page, 1); await applyTemplate('tplFamilyHome')
await goStep(page, 3); await page.getByLabel('Panel quantity (manual)').fill('1'); await page.getByLabel('Panel quantity (manual)').blur(); await page.waitForTimeout(150)
await walk('one-panel'); await goStep(page, 4); c = await checks(); pass(`one-panel checks: ${c.join(' | ')}`)
const op = await page.locator('body').innerText(); if (!/1 × /.test(op)) issue('one-panel: array should show 1 panel')
if (!(await page.locator('.badge-warn, .badge-err, [data-level=warn], [data-level=error]').count())) issue('one-panel: expected at least a warning')
await shot(page, '06-one-panel-results'); await exportAll('one-panel')

// (e) 500 kWh/day
await newProject('Edge: 500 kWh'); await goStep(page, 1); await addCustomLoad(20833, 1, 24)
const daily = await page.locator('.stat-value').nth(0).innerText(); if (!/^499|^500/.test(daily)) issue(`big: daily energy tile ${daily}`); else pass(`big: ${daily}`)
await walk('big'); await goStep(page, 4); c = await checks(); pass(`big checks: ${c.join(' | ')}`)
if (!(await page.locator('.badge-warn, .badge-err, [data-level=warn], [data-level=error]').count())) issue('big: expected warnings for 500 kWh/day on 48 V')
await shot(page, '06-big-results'); await exportAll('big')
await goStep(page, 0); await page.getByRole('radio', { name: 'Three-phase 400 V' }).click(); await goStep(page, 3); await page.getByLabel('Battery system voltage').selectOption('hv'); await walk('big-hv'); await goStep(page, 4); c = await checks(); pass(`big-hv checks: ${c.join(' | ')}`)
await shot(page, '06-big-hv-results')
// (f) extreme inputs: hours 0, qty 0, negative watts via keyboard (minus is rejected for W)
await newProject('Edge: zeros'); await goStep(page, 1); await addCustomLoad(0, 0, 0); await goStep(page, 4); await checkPage(page, 'zeros results'); reportErrors(errors, 'zeros')
await goStep(page, 1); const w = page.locator('[data-load-id]').last().locator('input[inputmode=decimal]').first(); await w.fill('-50'); await w.blur(); await page.waitForTimeout(100)
if ((await w.inputValue()).startsWith('-')) issue('zeros: negative watts accepted'); await goStep(page, 4); await checkPage(page, 'negative results'); reportErrors(errors, 'negative')
pass('zeros/negative: no crash')
await browser.close(); summary('06-edge-cases')
