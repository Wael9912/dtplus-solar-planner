// Scenario 3: Arabic RTL toggle, step through, toggle back.
import { launch, DESKTOP, MOBILE, shot, checkPage, reportErrors, gotoApp, goStep, loadSamples, clearStorage, issue, pass, summary } from './lib.mjs'
for (const [vpName, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  const { browser, page, errors } = await launch(vp)
  await gotoApp(page); await clearStorage(page); await page.reload({ waitUntil: 'networkidle' }); await loadSamples(page)
  await page.locator('header button[title=Language]').click(); await page.waitForTimeout(200)
  const dir = await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang])
  if (dir[0] !== 'rtl' || dir[1] !== 'ar') issue(`${vpName}: html dir/lang = ${dir}`); else pass(`${vpName}: dir=rtl lang=ar`)
  let txt = await page.locator('body').innerText()
  if (!/المشاريع/.test(txt)) issue(`${vpName}: projects title not Arabic`)
  if (!/\d/.test(txt)) issue(`${vpName}: no digits on Arabic projects page`)
  await checkPage(page, `${vpName} ar projects`); await shot(page, `03-${vpName}-ar-projects`)
  for (let i = 0; i < 4; i++) {
    await page.locator('.card.flex.flex-col').nth(i).locator('button.btn-secondary').click(); await page.waitForTimeout(200)
    for (let s = 0; s < 7; s++) {
      await goStep(page, s); const label = `${vpName} ar project ${i + 1} step ${s + 1}`
      await checkPage(page, label); reportErrors(errors, label)
      if (i === 0) await shot(page, `03-${vpName}-ar-p1-s${s + 1}`)
    }
    txt = await page.locator('body').innerText()
    if (!/[؀-ۿ]/.test(txt)) issue(`${vpName}: no Arabic text in wizard`)
    await page.locator('ol.card li button').first().click()
    await page.locator('header button').first().click(); await page.waitForTimeout(150)
  }
  // Arabic appliance library search
  await page.locator('header button.btn-primary').click(); await page.waitForTimeout(200); await goStep(page, 1)
  const n = await page.locator('div.grid.max-h-56 button').count(); if (!n) issue(`${vpName}: ar library empty`)
  await page.locator('div.grid.max-h-56 button').first().click(); await page.waitForTimeout(100)
  await checkPage(page, `${vpName} ar loads`); await shot(page, `03-${vpName}-ar-loads`); reportErrors(errors, `${vpName} ar loads`)
  await page.locator('header button[title=Language]').click(); await page.waitForTimeout(200)
  const back = await page.evaluate(() => document.documentElement.dir)
  if (back !== 'ltr') issue(`${vpName}: dir after toggling back = ${back}`); else pass(`${vpName}: toggled back to ltr`)
  reportErrors(errors, `${vpName} ar`)
  await browser.close()
}
summary('03-arabic')
