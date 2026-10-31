// Scenario 6: edge cases — zero loads, 3-phase mix, gridtie, panel qty 1, 500 kWh/day.
import fs from 'node:fs'; import path from 'node:path'
import { launch, DESKTOP, DL, shot, checkPage, reportErrors, gotoApp, goStep, clearStorage, issue, pass, summary } from './lib.mjs'
const { browser, page, errors } = await launch(DESKTOP)
await gotoApp(page); await clearStorage(page); await page.reload({ waitUntil: 'networkidle' })
const newProject = async (name) => { await page.locator('header button.btn-primary').click(); await page.waitForTimeout(200); await page.getByLabel('Project name').fill(name) }
const walk = async (label) => { for (let s = 0; s < 7; s++) { await goStep(page, s); await checkPage(page, `${label} step ${s + 1}`); reportErrors(errors, `${label} step ${s + 1}`) } }
const checks = async () => (await page.locator('section').first().locator('li').allInnerTexts()).map((x) => x.replace(/\n/g, ' '))
const exportAll = async (label) => {
  await goStep(page, 6)
  for (const i of [0, 1, 2]) { const dlp = page.waitForEvent('download', { timeout: 30000 }).catch(() => null); await page.locator('main button.card').nth(i).click(); const dl = await dlp; if (!dl) issue(`${label}: export ${i} failed`); else { const out = path.join(DL, `${label.replace(/\W+/g, '_')}-${dl.suggestedFilename()}`); await dl.saveAs(out); if (fs.statSync(out).size === 0) issue(`${label}: export ${i} empty`) } await page.waitForTimeout(300); reportErrors(errors, `${label} export ${i}`) }
  pass(`${label}: pdf/tech/xlsx exports ok`)
}
const addCustomLoad = async (watts, qty, hours) => {
  await page.getByRole('button', { name: 'Custom appliance' }).click(); await page.waitForTimeout(100)
  const row = page.locator('table.table tbody tr').last()
  await row.locator('input').nth(0).fill('Big load'); await row.locator('input[type=number]').nth(0).fill(String(watts)); await row.locator('input[type=number]').nth(1).fill(String(qty)); await row.locator('input[type=number]').nth(2).fill(String(hours)); await page.waitForTimeout(150)
}

// (a) zero loads
await newProject('Edge: zero loads'); await walk('zero-loads')
await goStep(page, 4); let c = await checks(); if (!c.some((x) => /No loads/.test(x))) issue(`zero-loads: no "No loads" error; checks=${c}`); else pass('zero-loads: error check shown')
await shot(page, '06-zero-loads-results'); await exportAll('zero-loads')

// (b) 3-phase with 1-phase mix
await newProject('Edge: three-phase mix'); await page.getByRole('button', { name: 'Three-phase 400 V' }).click()
await goStep(page, 1); await page.getByRole('button', { name: 'Family home with AC' }).click(); await page.getByRole('button', { name: 'Farm pump' }).click(); await page.waitForTimeout(150)
const phaseSel = page.locator('table.table tbody tr select'); if (!(await phaseSel.count())) issue('3ph: phase column missing'); else pass(`3ph: phase column with ${await phaseSel.count()} selects`)
await walk('3ph'); await goStep(page, 4); c = await checks(); pass(`3ph checks: ${c.join(' | ')}`)
const txt3 = await page.locator('body').innerText(); if (!/3-ph|3φ|Three/.test(txt3)) issue('3ph: no 3-phase inverter visible?')
await shot(page, '06-3ph-results'); await exportAll('3ph')
// switch project to single-phase while it has 3-phase loads -> expect error check
await goStep(page, 0); await page.getByRole('button', { name: 'Single-phase 230 V' }).click(); await goStep(page, 4); c = await checks()
if (!c.some((x) => /Three-phase loads present/.test(x))) issue(`3ph->1ph: no load-phase error; ${c}`); else pass('3ph->1ph: load-phase error shown')
reportErrors(errors, '3ph->1ph')

// (c) grid-tied no battery
await newProject('Edge: gridtie'); await page.getByRole('button', { name: /Grid-tied/ }).click()
await goStep(page, 1); await page.getByRole('button', { name: 'Shop / office' }).click(); await page.waitForTimeout(150)
if (await page.locator('table.table th', { hasText: 'Backup' }).count()) issue('gridtie: Backup column should be hidden')
await walk('gridtie'); await goStep(page, 3)
if (await page.getByLabel('Battery system voltage').count()) issue('gridtie: voltage field should be hidden')
await goStep(page, 4); c = await checks(); if (c.some((x) => /No battery/.test(x))) issue('gridtie: "No battery" check should not appear')
const gt = await page.locator('body').innerText(); if (/Battery bank/.test(gt)) issue('gridtie: battery bank section shown')
pass(`gridtie checks: ${c.join(' | ')}`); await shot(page, '06-gridtie-results')
await goStep(page, 5); const gb = await page.locator('table.table').innerText(); if (/Battery/.test(gb)) issue('gridtie: battery lines in BOM'); else if (/MPPT controller|MPPT 60A|needs external MPPT/i.test(gb) || c.some((x) => /no PV input/.test(x))) issue(`gridtie: inverter/charger or MPPT controllers in a grid-tied BOM: ${c.join(' | ')}`); else pass('gridtie: BOM has no battery/controller lines')
await exportAll('gridtie')

// (d) panel qty override = 1
await newProject('Edge: one panel'); await goStep(page, 1); await page.getByRole('button', { name: 'Family home with AC' }).click()
await goStep(page, 3); await page.getByLabel('Panel quantity override').fill('1'); await page.waitForTimeout(150)
await walk('one-panel'); await goStep(page, 4); c = await checks(); pass(`one-panel checks: ${c.join(' | ')}`)
const op = await page.locator('body').innerText(); if (!/1 × /.test(op)) issue('one-panel: array should show 1 panel')
if (!c.some((x) => /warn|Check|narrow|low|short/i.test(x)) && !(await page.locator('.badge-warn, .badge-err').count())) issue('one-panel: expected at least a warning')
await shot(page, '06-one-panel-results'); await exportAll('one-panel')

// (e) 500 kWh/day
await newProject('Edge: 500 kWh'); await goStep(page, 1); await addCustomLoad(20833, 1, 24)
const daily = await page.locator('.stat-value').nth(0).innerText(); if (!/^499|^500/.test(daily)) issue(`big: daily energy tile ${daily}`); else pass(`big: ${daily}`)
await walk('big'); await goStep(page, 4); c = await checks(); pass(`big checks: ${c.join(' | ')}`)
if (!(await page.locator('.badge-warn, .badge-err').count())) issue('big: expected warnings for 500 kWh/day on 48 V')
await shot(page, '06-big-results'); await exportAll('big')
// also HV + 3-phase for the big one
await goStep(page, 0); await page.getByRole('button', { name: 'Three-phase 400 V' }).click(); await goStep(page, 3); await page.getByLabel('Battery system voltage').selectOption('hv'); await walk('big-hv'); await goStep(page, 4); c = await checks(); pass(`big-hv checks: ${c.join(' | ')}`)
await shot(page, '06-big-hv-results')
// (f) extreme inputs: hours 0, qty 0, negative watts via keyboard
await newProject('Edge: zeros'); await goStep(page, 1); await addCustomLoad(0, 0, 0); await goStep(page, 4); await checkPage(page, 'zeros results'); reportErrors(errors, 'zeros')
await goStep(page, 1); await page.locator('table.table tbody tr').last().locator('input[type=number]').nth(0).fill('-50'); await page.waitForTimeout(100); await goStep(page, 4); await checkPage(page, 'negative results'); reportErrors(errors, 'negative')
pass('zeros/negative: no crash')
await browser.close(); summary('06-edge-cases')
