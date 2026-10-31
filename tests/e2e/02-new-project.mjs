// Scenario 2: new project end-to-end with interactions on every step and export validation.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { launch, DESKTOP, MOBILE, DL, shot, checkPage, reportErrors, gotoApp, goStep, clearStorage, issue, pass, summary, newProject, exportDoc } from './lib.mjs'
const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs')

const vpName = process.argv[2] === 'mobile' ? 'mobile' : 'desktop'
const vp = vpName === 'mobile' ? MOBILE : DESKTOP
const mobile = vpName === 'mobile'
const { browser, page, errors } = await launch(vp)
await gotoApp(page); await clearStorage(page); await page.reload({ waitUntil: 'networkidle' })
const statValue = async (i) => (await page.locator('.stat-value').nth(i).innerText()).trim()
const barKpi = async () => (await page.getByTestId('bar-kpi').innerText()).replace(/\s+/g, ' ').trim()
const grand = async () => (await page.getByTestId('bom-grand').last().innerText()).trim()
const num = (loc) => loc.locator('input[inputmode=decimal]')

// ---- Step 1: info
await newProject(page)
await page.getByLabel('Project name').fill('QA Villa Hybrid')
await page.getByLabel('Client name').fill('Test Client')
await page.getByLabel('Phone').fill('+249 912 345 678')
await page.getByLabel('Email').fill('client@example.com')
await page.getByLabel('Site address').fill('Street 15, Khartoum')
await page.getByRole('radio', { name: /Hybrid \(grid/ }).click()
await checkPage(page, `${vpName} info`); await shot(page, `02-${vpName}-s1-info`); reportErrors(errors, 'info')

// ---- Step 2: loads
await goStep(page, 1)
const k0 = await barKpi()
if (!/0\.00 kWh/.test(k0)) issue(`loads: initial daily energy should be 0.00 kWh, got ${k0}`)
await page.getByTestId('open-library').click()
await page.getByTestId('library-search').fill('AC')
const results = page.getByTestId('library-item')
const nRes = await results.count()
if (nRes === 0) issue('loads: search "AC" returned nothing'); else pass(`loads: search "AC" -> ${nRes} results`)
const first = (await results.first().innerText()).replace(/\n/g, ' ')
await results.first().locator('button').first().click(); await page.waitForTimeout(150)
await results.first().locator('button').first().click(); await page.waitForTimeout(150) // tapping again increments qty
await page.getByTestId('library-done').click(); await page.waitForTimeout(200)
let rows = page.locator('[data-load-id]')
if ((await rows.count()) !== 1) issue(`loads: expected 1 row after adding the same appliance twice, got ${await rows.count()}`); else pass(`loads: added "${first}" twice -> 1 row`)
const after1 = await statValue(0)
if (/^0\.00/.test(after1)) issue('loads: stat tile did not update after adding appliance')
await page.getByTestId('open-library').click(); await page.getByTestId('lib-tpl-tplSmallHome').click(); await page.getByTestId('tpl-add').click(); await page.waitForTimeout(200)
const nTpl = await rows.count()
if (nTpl < 5) issue(`loads: template added too few rows (${nTpl})`); else pass(`loads: small home template -> ${nTpl} rows`)
// edit row 0 watts & qty
const before = await statValue(1)
if (mobile) {
  await rows.nth(0).getByTestId('load-card-edit').click(); await page.waitForTimeout(200)
  const ed = page.getByTestId('load-editor')
  await num(ed).nth(0).fill('2000'); await num(ed).nth(1).fill('3'); await page.getByTestId('load-editor-done').click()
} else {
  await num(rows.nth(0)).nth(0).fill('2000'); await num(rows.nth(0)).nth(1).fill('3'); await num(rows.nth(0)).nth(1).blur()
}
await page.waitForTimeout(150)
const afterEdit = await statValue(1)
if (afterEdit === before) issue('loads: peak demand tile did not change after editing watts/qty'); else pass(`loads: peak ${before} -> ${afterEdit}`)
// delete last row + undo
const cntBefore = await rows.count()
await rows.last().getByTestId('load-delete').click(); await page.waitForTimeout(150)
if ((await rows.count()) !== cntBefore - 1) issue('loads: delete row failed'); else pass('loads: delete row')
await page.getByRole('button', { name: 'Undo' }).last().click(); await page.waitForTimeout(150)
if ((await rows.count()) !== cntBefore) issue('loads: undo delete failed'); else pass('loads: undo delete')
// backup checkbox
const cb = rows.nth(0).locator('input[type=checkbox]')
if (!(await cb.count())) issue('loads: Backup checkbox missing for hybrid')
else {
  await cb.uncheck(); await page.waitForTimeout(100); if (await cb.isChecked()) issue('loads: uncheck backup failed')
  await cb.check(); await page.waitForTimeout(100); if (!(await cb.isChecked())) issue('loads: re-check backup failed')
  pass('loads: backup toggle')
}
await checkPage(page, `${vpName} loads`); await shot(page, `02-${vpName}-s2-loads`); reportErrors(errors, 'loads')

// ---- Step 3: site
await goStep(page, 2)
const loc = page.getByTestId('site-location')
const pshOf = async () => (await page.getByRole('textbox', { name: /Peak sun hours/ }).inputValue())
for (const id of ['khartoum', 'riyadh', 'london']) {
  await loc.selectOption(id); await page.waitForTimeout(150)
  const v = await loc.inputValue(); const psh = await pshOf()
  if (v !== id) issue(`site: location select did not take ${id}`)
  if (!(Number(psh) > 1)) issue(`site: psh invalid after ${id}: ${psh}`)
  pass(`site: ${id} psh=${psh} tiltGain=${await page.getByLabel('Tilt gain factor').inputValue()} tariff=${await page.getByLabel('Grid / diesel tariff').inputValue()}`)
  await checkPage(page, `${vpName} site ${id}`); reportErrors(errors, `site ${id}`)
}
await loc.selectOption('khartoum')
await page.getByLabel('Mounting surface').selectOption('metal-sheet')
await page.getByTestId('site-currency').selectOption('SDG'); await page.waitForTimeout(100)
const fxDefault = await page.getByTestId('site-fx').inputValue()
if (!(Number(fxDefault) > 1)) issue(`site: switching to SDG did not pre-fill an exchange rate (${fxDefault})`); else pass(`site: SDG pre-filled FX ${fxDefault}`)
await page.getByTestId('site-fx').fill('600'); await page.getByTestId('site-fx').blur()
await page.waitForTimeout(100)
await shot(page, `02-${vpName}-s3-site`); await checkPage(page, `${vpName} site`); reportErrors(errors, 'site')

// ---- Step 4: design
await goStep(page, 3)
const volt = page.getByLabel('Battery system voltage')
const pickerCount = async (testId) => { await page.getByTestId(testId).click(); await page.waitForTimeout(150); const n = await page.getByTestId('equipment-picker').locator('[data-testid^=pick-]').count(); await page.keyboard.press('Escape'); await page.waitForTimeout(100); return n }
for (const v of ['12', '24', '48', 'hv']) {
  await volt.selectOption(v); await page.waitForTimeout(200)
  const nb = (await pickerCount('eq-battery')) - 2, ni = (await pickerCount('eq-inverter')) - 1
  pass(`design ${v}V: ${nb} batteries, ${ni} inverters`)
  if (nb < 1) issue(`design: no battery options at ${v} V`)
  if (ni < 1) issue(`design: no inverter options at ${v} V`)
  await checkPage(page, `${vpName} design ${v}`); reportErrors(errors, `design ${v}`)
  await goStep(page, 4); await checkPage(page, `${vpName} results after ${v}`); reportErrors(errors, `results ${v}`); await goStep(page, 3)
}
await volt.selectOption('48'); await page.waitForTimeout(150)
// manual inverter (3rd model in the picker)
await page.getByTestId('eq-inverter').click(); await page.waitForTimeout(150)
await page.getByTestId('equipment-picker').locator('[data-testid^=pick-]').nth(2).click(); await page.waitForTimeout(150)
const qtyField = page.getByLabel('Inverter units (parallel)')
if (!(await qtyField.isVisible())) issue('design: inverter qty field did not appear after manual inverter')
else { await qtyField.fill('2'); await qtyField.blur(); pass('design: manual inverter + qty 2') }
// generator toggle (Advanced engineering)
await page.getByTestId('design-advanced').locator('summary').click(); await page.waitForTimeout(100)
await page.getByTestId('sw-generator').click(); await page.waitForTimeout(150)
if (!(await page.getByLabel('Generator size').isVisible())) issue('design: generator kVA field did not appear')
else pass(`design: generator placeholder "${await page.getByLabel('Generator size').getAttribute('placeholder')}"`)
await shot(page, `02-${vpName}-s4-design`); await checkPage(page, `${vpName} design`); reportErrors(errors, 'design')

// ---- Step 5: results
await goStep(page, 4)
const svgs = await page.locator('svg.recharts-surface').count()
if (svgs < 2) issue(`results: ${svgs} chart svgs`); else pass(`results: ${svgs} chart svgs`)
const nChecks = (await page.locator('[data-testid=checks] li').count()) + (await page.getByTestId('checks-ok').count())
if (!nChecks) issue('results: no checks listed'); else pass(`results: ${nChecks} check rows`)
const txt = await page.locator('body').innerText()
if (!/SDG/.test(txt)) issue('results: no SDG prices shown')
await page.getByTestId('tab-engineering').click(); await page.waitForTimeout(150)
if (!/Cables|Protection/.test(await page.locator('main').innerText())) issue('results: engineering tab missing cables')
await shot(page, `02-${vpName}-s5-results`); await checkPage(page, `${vpName} results`); reportErrors(errors, 'results')

// ---- Step 6: BOM (pricing)
await goStep(page, 5)
await page.getByTestId('view-cost').click(); await page.waitForTimeout(150)
const bomTxt = await page.locator('body').innerText()
if (!/Unit cost \(SDG\)/i.test(bomTxt)) issue('bom: header not in SDG')
if (/\$\d/.test(bomTxt)) issue('bom: dollar prices still shown while currency is SDG')
const g0 = await grand(); pass(`bom: grand total ${g0}`)
const bomRows = page.locator(mobile ? '[data-testid=bom-card]' : '[data-testid=bom-row]')
const r0 = bomRows.nth(0)
const lineTotal = async (r) => (await r.locator(mobile ? 'p.shrink-0' : 'td.num').last().innerText()).trim()
const r0total0 = await lineTotal(r0)
await num(r0).nth(1).fill('99000'); await num(r0).nth(1).blur(); await page.waitForTimeout(150)
const r0total1 = await lineTotal(r0)
if (r0total0 === r0total1) issue('bom: price override did not change line total'); else pass(`bom: price override ${r0total0} -> ${r0total1}`)
await num(r0).nth(0).fill('7'); await num(r0).nth(0).blur(); await page.waitForTimeout(150)
const r0total2 = await lineTotal(r0)
if (r0total2 === r0total1) issue('bom: qty override did not change line total'); else pass(`bom: qty override -> ${r0total2}`)
const g1 = await grand()
await bomRows.nth(4).getByTestId('bom-include').click(); await page.waitForTimeout(150)
const g2 = await grand()
if (g1 === g2) issue('bom: excluding a line did not change grand total'); else pass(`bom: exclude ${g1} -> ${g2}`)
await page.getByTestId('bom-menu').click()
if (!(await page.getByTestId('bom-reset').isVisible())) issue('bom: reset-edits action not shown after overrides')
if (!/1/.test(await page.getByTestId('bom-show-removed').innerText())) issue('bom: excluded counter not 1')
await page.keyboard.press('Escape')
await page.getByTestId('bom-add-custom').click(); await page.waitForTimeout(200)
const custom = page.locator('[data-line-id]').last()
await custom.locator('input').first().fill('Scaffolding'); await num(custom).nth(0).fill('2'); await num(custom).nth(1).fill('30000'); await num(custom).nth(1).blur(); await page.waitForTimeout(150)
const g3 = await grand()
if (g3 === g2) issue('bom: custom line did not change grand total'); else pass(`bom: custom line -> ${g3}`)
if (mobile) await page.getByTestId('bom-adjust').click()
await page.getByTestId('bom-markup').fill('30'); await page.getByTestId('bom-markup').blur(); await page.waitForTimeout(150); const g4 = await grand()
await page.getByTestId('bom-vat').fill('15'); await page.getByTestId('bom-vat').blur(); await page.waitForTimeout(150); const g5 = await grand()
if (mobile) await page.keyboard.press('Escape')
if (g4 === g3 || g5 === g4) issue(`bom: markup/VAT change did not change grand total (${g3}, ${g4}, ${g5})`); else pass(`bom: markup -> ${g4}, VAT -> ${g5}`)
// labour price edited in the table goes to the Services field (no silent override)
await page.getByTestId('view-client').click(); await page.waitForTimeout(100)
if (/Unit cost/.test(await page.locator('main').innerText())) issue('bom: client view still shows cost prices')
await shot(page, `02-${vpName}-s6-bom`); await checkPage(page, `${vpName} bom`); reportErrors(errors, 'bom')

// ---- Step 7: export
await goStep(page, 6)
await shot(page, `02-${vpName}-s7-export`)
const files = {}
for (const [i, key, ext] of [[0, 'proposal', '.pdf'], [1, 'technical', '.pdf'], [2, 'xlsx', '.xlsx'], [3, 'json', '.json']]) {
  const dlp = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
  await exportDoc(page, i)
  const dl = await dlp
  if (!dl) { issue(`export ${key}: no download event`); continue }
  const name = dl.suggestedFilename(); const out = path.join(DL, `${vpName}-${name}`)
  await dl.saveAs(out); files[key] = out
  const size = fs.statSync(out).size
  if (!name.endsWith(ext)) issue(`export ${key}: filename ${name} does not end with ${ext}`)
  if (size === 0) issue(`export ${key}: empty file`)
  pass(`export ${key}: ${name} ${size} bytes`)
  if (ext === '.pdf') { const head = fs.readFileSync(out).subarray(0, 5).toString(); if (head !== '%PDF-') issue(`export ${key}: bad header ${head}`); if (size < 20 * 1024) issue(`export ${key}: pdf only ${size} bytes (<20 KB)`) }
  await page.waitForTimeout(400); reportErrors(errors, `export ${key}`)
}
if (files.xlsx) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(files.xlsx))
  const names = wb.worksheets.map((w) => w.name)
  for (const s of ['Summary', 'Loads', 'Sizing', 'Production', 'BOM', 'Economics']) if (!names.includes(s)) issue(`xlsx: sheet ${s} missing (have ${names})`)
  const bom = wb.getWorksheet('BOM'); let formulas = 0
  bom?.eachRow((row) => row.eachCell((c) => { if (c.formula) formulas++ }))
  if (!formulas) issue('xlsx: BOM sheet has no formulas'); else pass(`xlsx: sheets ${names.join(',')} ; BOM formulas=${formulas}`)
  const bad = []
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { const v = c.value; if (v === undefined || (typeof v === 'number' && !Number.isFinite(v)) || /NaN|undefined/.test(String(typeof v === 'object' && v ? (v.formula ?? v.result ?? JSON.stringify(v)) : v))) bad.push(`${ws.name}!${c.address}=${JSON.stringify(v)}`) })))
  if (bad.length) issue(`xlsx: bad cells ${bad.slice(0, 8).join(' ')}`)
}
if (files.json) { const j = JSON.parse(fs.readFileSync(files.json, 'utf8')); if (!j.loads || !j.design) issue('json: missing loads/design'); else pass(`json: project ${j.name} with ${j.loads.length} loads`) }
await checkPage(page, `${vpName} export`); reportErrors(errors, 'export')
fs.writeFileSync(path.join(DL, 'files.json'), JSON.stringify(files))
await browser.close()
summary(`02-new-project ${vpName}`)
