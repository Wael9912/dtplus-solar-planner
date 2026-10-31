// Scenario 2: new project end-to-end with interactions on every step and export validation.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { launch, DESKTOP, MOBILE, DL, shot, checkPage, reportErrors, gotoApp, goStep, clearStorage, issue, pass, summary } from './lib.mjs'
const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs')

const vpName = process.argv[2] === 'mobile' ? 'mobile' : 'desktop'
const vp = vpName === 'mobile' ? MOBILE : DESKTOP
const { browser, page, errors } = await launch(vp)
await gotoApp(page); await clearStorage(page); await page.reload({ waitUntil: 'networkidle' })
const statValue = async (i) => (await page.locator('.stat-value').nth(i).innerText()).trim()
const grand = async () => (await page.locator('dl dd.tabular-nums').last().innerText()).trim()

// ---- Step 1: info
await page.locator('header button.btn-primary').click(); await page.waitForTimeout(300)
await page.getByLabel('Project name').fill('QA Villa Hybrid')
await page.getByLabel('Client name').fill('Test Client')
await page.getByLabel('Phone').fill('+249 912 345 678')
await page.getByLabel('Email').fill('client@example.com')
await page.getByLabel('Site address').fill('Street 15, Khartoum')
await page.getByRole('button', { name: /Hybrid \(grid/ }).click()
await checkPage(page, `${vpName} info`); await shot(page, `02-${vpName}-s1-info`); reportErrors(errors, 'info')

// ---- Step 2: loads
await goStep(page, 1)
const stat0 = await statValue(0)
if (!/^0\.00 kWh/.test(stat0)) issue(`loads: initial daily energy should be 0.00 kWh, got ${stat0}`)
const lib = page.getByPlaceholder('Search appliances…')
if (!(await lib.isVisible())) { await page.getByRole('button', { name: 'Appliance library' }).click() }
await lib.fill('AC')
const results = page.locator('div.grid.max-h-56 button')
const nRes = await results.count()
if (nRes === 0) issue('loads: search "AC" returned nothing'); else pass(`loads: search "AC" -> ${nRes} results`)
const first = (await results.first().innerText()).replace(/\n/g, ' ')
await results.first().click(); await page.waitForTimeout(150)
let rows = page.locator('table.table tbody tr')
if ((await rows.count()) !== 1) issue(`loads: expected 1 row after adding appliance, got ${await rows.count()}`); else pass(`loads: added "${first}"`)
const after1 = await statValue(0)
if (after1 === stat0) issue('loads: stat tile did not update after adding appliance')
await page.getByRole('button', { name: 'Small home' }).click(); await page.waitForTimeout(150)
const nTpl = await rows.count()
if (nTpl < 5) issue(`loads: template added too few rows (${nTpl})`); else pass(`loads: small home template -> ${nTpl} rows`)
// inline edits: row 0 watts & qty
const before = await statValue(1)
await rows.nth(0).locator('input[type=number]').nth(0).fill('2000')
await rows.nth(0).locator('input[type=number]').nth(1).fill('3')
await page.waitForTimeout(150)
const afterEdit = await statValue(1)
if (afterEdit === before) issue('loads: connected load tile did not change after editing watts/qty'); else pass(`loads: connected ${before} -> ${afterEdit}`)
const rowDaily = (await rows.nth(0).locator('td.tabular-nums').innerText()).trim()
// delete last row
const cntBefore = await rows.count()
await rows.last().locator('button').click(); await page.waitForTimeout(100)
if ((await rows.count()) !== cntBefore - 1) issue('loads: delete row failed'); else pass('loads: delete row')
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
const loc = page.getByLabel('Location', { exact: false }).first()
const pshOf = async () => (await page.getByLabel('Peak sun hours').inputValue())
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
await page.getByLabel('Display currency').selectOption('SDG')
await page.getByLabel('Local units per 1 USD').fill('600')
await page.waitForTimeout(100)
await shot(page, `02-${vpName}-s3-site`); await checkPage(page, `${vpName} site`); reportErrors(errors, 'site')

// ---- Step 4: design
await goStep(page, 3)
const volt = page.getByLabel('Battery system voltage')
const eq = page.locator('section.card').filter({ hasText: 'Panel quantity override' })
const invSel = eq.locator('select').nth(1)
const battSel = eq.locator('select').nth(2)
for (const v of ['12', '24', '48', 'hv']) {
  await volt.selectOption(v); await page.waitForTimeout(200)
  const nb = await battSel.locator('option').count(), ni = await invSel.locator('option').count()
  const recB = await eq.locator('label:has(select)').nth(2).innerText()
  pass(`design ${v}V: ${nb - 2} batteries, ${ni - 1} inverters; ${recB.split('\n').slice(-1)[0].slice(0, 90)}`)
  if (nb - 2 < 1) issue(`design: no battery options at ${v} V`)
  if (ni - 1 < 1) issue(`design: no inverter options at ${v} V`)
  await checkPage(page, `${vpName} design ${v}`); reportErrors(errors, `design ${v}`)
  await goStep(page, 4); await checkPage(page, `${vpName} results after ${v}`); reportErrors(errors, `results ${v}`); await goStep(page, 3)
}
await volt.selectOption('48'); await page.waitForTimeout(150)
// manual inverter
const invOpts = await invSel.locator('option').evaluateAll((os) => os.map((o) => o.value))
await invSel.selectOption(invOpts[2]); await page.waitForTimeout(150)
const qtyField = page.getByLabel('Inverter units (parallel)')
if (!(await qtyField.isVisible())) issue('design: inverter qty field did not appear after manual inverter')
else { await qtyField.fill('2'); pass('design: manual inverter + qty 2') }
// generator toggle
await page.getByText('Include generator backup').click(); await page.waitForTimeout(150)
if (!(await page.getByLabel('Generator size').isVisible())) issue('design: generator kVA field did not appear')
else pass(`design: generator placeholder "${await page.getByLabel('Generator size').getAttribute('placeholder')}"`)
await shot(page, `02-${vpName}-s4-design`); await checkPage(page, `${vpName} design`); reportErrors(errors, 'design')

// ---- Step 5: results
await goStep(page, 4)
const svgs = await page.locator('svg.recharts-surface').count()
if (svgs < 2) issue(`results: ${svgs} chart svgs`); else pass(`results: ${svgs} chart svgs`)
const nChecks = await page.locator('section ul li').count()
if (!nChecks) issue('results: no checks listed'); else pass(`results: ${nChecks} checks`)
const txt = await page.locator('body').innerText()
if (!/SDG/.test(txt)) issue('results: no SDG prices shown')
await shot(page, `02-${vpName}-s5-results`); await checkPage(page, `${vpName} results`); reportErrors(errors, 'results')

// ---- Step 6: BOM
await goStep(page, 5)
const bomTxt = await page.locator('body').innerText()
if (!/Unit price \(SDG\)/i.test(bomTxt)) issue('bom: header not in SDG')
if (/\$\d/.test(bomTxt)) issue('bom: dollar prices still shown while currency is SDG')
const g0 = await grand(); pass(`bom: grand total ${g0}`)
const bomRows = page.locator('table.table tbody tr:not(.bg-slate-50)')
const r0 = bomRows.nth(0)
const r0total0 = (await r0.locator('td.tabular-nums').innerText()).trim()
await r0.locator('input[type=number]').nth(1).fill('99000'); await page.waitForTimeout(150)
const r0total1 = (await r0.locator('td.tabular-nums').innerText()).trim()
if (r0total0 === r0total1) issue('bom: price override did not change line total'); else pass(`bom: price override ${r0total0} -> ${r0total1}`)
await r0.locator('input[type=number]').nth(0).fill('7'); await page.waitForTimeout(150)
const r0total2 = (await r0.locator('td.tabular-nums').innerText()).trim()
if (r0total2 === r0total1) issue('bom: qty override did not change line total'); else pass(`bom: qty override -> ${r0total2}`)
if (!(await page.getByRole('button', { name: 'Reset to auto' }).isVisible())) issue('bom: reset-to-auto button not shown after overrides')
const g1 = await grand()
await bomRows.nth(1).locator('button[title=Exclude]').click(); await page.waitForTimeout(150)
const g2 = await grand()
if (g1 === g2) issue('bom: excluding a line did not change grand total'); else pass(`bom: exclude ${g1} -> ${g2}`)
if (!/1 items excluded/.test(await page.locator('body').innerText())) issue('bom: excluded counter not 1')
await page.getByRole('button', { name: 'Add custom line' }).click(); await page.waitForTimeout(150)
const custom = page.locator('table.table tbody tr').last()
await custom.locator('input').nth(0).fill('Scaffolding'); await custom.locator('input[type=number]').nth(0).fill('2'); await custom.locator('input[type=number]').nth(1).fill('30000'); await page.waitForTimeout(150)
const g3 = await grand()
if (g3 === g2) issue('bom: custom line did not change grand total'); else pass(`bom: custom line -> ${g3}`)
await page.getByLabel('Margin %').fill('30'); await page.waitForTimeout(150); const g4 = await grand()
await page.getByLabel('VAT %').fill('15'); await page.waitForTimeout(150); const g5 = await grand()
if (g4 === g3 || g5 === g4) issue(`bom: margin/VAT change did not change grand total (${g3}, ${g4}, ${g5})`); else pass(`bom: margin -> ${g4}, VAT -> ${g5}`)
await shot(page, `02-${vpName}-s6-bom`); await checkPage(page, `${vpName} bom`); reportErrors(errors, 'bom')

// ---- Step 7: export
await goStep(page, 6)
await shot(page, `02-${vpName}-s7-export`)
const cards = page.locator('main button.card')
const files = {}
for (const [i, key, ext] of [[0, 'proposal', '.pdf'], [1, 'technical', '.pdf'], [2, 'xlsx', '.xlsx'], [3, 'json', '.json']]) {
  const dlp = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
  await cards.nth(i).click()
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
  const bom = wb.getWorksheet('BOM'); let formulas = 0, errs = []
  bom?.eachRow((row) => row.eachCell((c) => { if (c.formula) formulas++; if (c.value && typeof c.value === 'object' && c.value.error) errs.push(c.address) }))
  if (!formulas) issue('xlsx: BOM sheet has no formulas'); else pass(`xlsx: sheets ${names.join(',')} ; BOM formulas=${formulas}`)
  const tot = bom.getRow(bom.rowCount).getCell(7).value; pass(`xlsx: BOM last row label "${tot}" formula=${bom.getRow(bom.rowCount).getCell(8).formula}`)
  // NaN / undefined scan of all cells
  const bad = []
  wb.eachSheet((ws) => ws.eachRow((row, rn) => row.eachCell((c, cn) => { const v = c.value; if (v === undefined || (typeof v === 'number' && !Number.isFinite(v)) || /NaN|undefined/.test(String(typeof v === 'object' && v ? (v.formula ?? v.result ?? JSON.stringify(v)) : v))) bad.push(`${ws.name}!${c.address}=${JSON.stringify(v)}`) })))
  if (bad.length) issue(`xlsx: bad cells ${bad.slice(0, 8).join(' ')}`)
}
if (files.json) { const j = JSON.parse(fs.readFileSync(files.json, 'utf8')); if (!j.loads || !j.design) issue('json: missing loads/design'); else pass(`json: project ${j.name} with ${j.loads.length} loads`) }
await checkPage(page, `${vpName} export`); reportErrors(errors, 'export')
fs.writeFileSync(path.join(DL, 'files.json'), JSON.stringify(files))
await browser.close()
summary(`02-new-project ${vpName}`)
