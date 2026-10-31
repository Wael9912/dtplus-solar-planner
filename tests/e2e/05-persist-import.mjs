// Scenario 5: persistence across reload, duplicate/delete, import of previously exported JSON.
import fs from 'node:fs'; import path from 'node:path'
import { launch, DESKTOP, DL, shot, checkPage, reportErrors, gotoApp, goStep, loadSamples, clearStorage, issue, pass, summary } from './lib.mjs'
const files = JSON.parse(fs.readFileSync(path.join(DL, 'files.json'), 'utf8'))
const { browser, page, errors } = await launch(DESKTOP)
await gotoApp(page); await clearStorage(page); await page.reload({ waitUntil: 'networkidle' }); await loadSamples(page)
await page.locator('.card.flex.flex-col').nth(0).getByRole('button', { name: 'Open' }).click(); await page.getByLabel('Project name').fill('Renamed after reload')
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(200)
const view = await page.locator('body').innerText()
if (!/Renamed after reload/.test(view)) issue('persist: renamed project not shown after reload')
else pass(`persist: reload restores view (${/Projects/.test(view.slice(0, 200)) ? 'projects' : 'wizard'})`)
await page.locator('header nav button').nth(0).click(); await page.waitForTimeout(200)
const cards = page.locator('.card.flex.flex-col')
if ((await cards.count()) !== 4) issue(`persist: expected 4 cards after reload, got ${await cards.count()}`); else pass('persist: 4 cards after reload')
// duplicate + delete
await cards.nth(0).locator('button[title=Duplicate]').click(); await page.waitForTimeout(150)
if ((await cards.count()) !== 5 || !/\(copy\)/.test(await page.locator('body').innerText())) issue('duplicate failed')
await cards.nth(0).locator('button[title=Delete]').click(); await page.getByRole('button', { name: 'Yes, delete' }).click(); await page.waitForTimeout(150)
if ((await cards.count()) !== 4) issue('delete failed'); else pass('duplicate + delete')
// search
await page.getByPlaceholder('Search projects…').fill('khartoum'); await page.waitForTimeout(300)
if ((await cards.count()) !== 1) issue(`search filter failed: ${JSON.stringify(await cards.locator('h3').allInnerTexts())} q=${await page.getByPlaceholder('Search projects…').inputValue()}`); await page.getByPlaceholder('Search projects…').fill('')
// import
await page.locator('input[type=file][accept="application/json"]').setInputFiles(files.json); await page.waitForTimeout(400)
if ((await cards.count()) !== 5) issue(`import: expected 5 cards, got ${await cards.count()}`)
const body = await page.locator('body').innerText()
if (!/QA Villa Hybrid/.test(body)) issue('import: imported project name missing')
if (!/SDG/.test(body)) issue('import: imported SDG total not shown'); else pass('import: QA Villa Hybrid card with SDG total')
await shot(page, '05-imported'); await checkPage(page, 'imported list'); reportErrors(errors, 'import')
// import twice -> id collision handled
await page.locator('input[type=file][accept="application/json"]').setInputFiles(files.json); await page.waitForTimeout(300)
if ((await cards.count()) !== 6) issue('import twice: expected 6 cards'); else pass('import twice handled (new id)')
await cards.nth(0).getByRole('button', { name: 'Open' }).click()
for (let s = 0; s < 7; s++) { await goStep(page, s); await checkPage(page, `imported step ${s + 1}`); reportErrors(errors, `imported step ${s + 1}`) }
await goStep(page, 5); await shot(page, '05-imported-bom')
const bom = await page.locator('body').innerText()
const customNames = await page.locator('table.table tbody tr input:not([type=number])').evaluateAll((es) => es.map((e) => e.value)); if (!customNames.includes('Scaffolding')) issue(`import: custom BOM line lost (${customNames})`); if (!/1 items excluded/.test(bom)) issue('import: excluded line lost'); else pass('import: overrides, exclusions, custom line intact')
// bad JSON import should be ignored silently
const bad = path.join(DL, 'bad.json'); fs.writeFileSync(bad, '{"nope":1}')
await page.locator('header nav button').nth(0).click(); await page.locator('input[type=file][accept="application/json"]').setInputFiles(bad); await page.waitForTimeout(300)
if ((await cards.count()) !== 6) issue('bad import changed project count'); else pass('bad JSON ignored')
reportErrors(errors, 'bad import')
await browser.close(); summary('05-persist-import')
