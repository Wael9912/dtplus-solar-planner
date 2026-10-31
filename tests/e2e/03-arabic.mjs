// Scenario 3: Arabic RTL via the header EN | عربي switch, step through, toggle back.
import { launch, DESKTOP, MOBILE, shot, checkPage, reportErrors, gotoApp, goStep, loadSamples, clearStorage, issue, pass, summary, openCard, newProject, nav, setLang } from './lib.mjs'
for (const [vpName, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  const { browser, page, errors } = await launch(vp)
  await gotoApp(page); await clearStorage(page); await page.reload({ waitUntil: 'networkidle' }); await loadSamples(page)
  if (!(await page.getByTestId('lang-ar').isVisible())) issue(`${vpName}: language switch not visible in the header`)
  await setLang(page, 'ar')
  const dir = await page.evaluate(() => [document.documentElement.dir, document.documentElement.lang])
  if (dir[0] !== 'rtl' || dir[1] !== 'ar') issue(`${vpName}: html dir/lang = ${dir}`); else pass(`${vpName}: dir=rtl lang=ar`)
  if ((await page.getByTestId('lang-ar').getAttribute('aria-pressed')) !== 'true') issue(`${vpName}: عربي segment not marked as pressed`)
  let txt = await page.locator('body').innerText()
  if (!/المشاريع/.test(txt)) issue(`${vpName}: projects title not Arabic`)
  if (!/\d/.test(txt)) issue(`${vpName}: no digits on Arabic projects page`)
  if (/[٠-٩]/.test(txt)) issue(`${vpName}: Arabic-Indic digits shown (policy: Western digits)`)
  await checkPage(page, `${vpName} ar projects`); await shot(page, `03-${vpName}-ar-projects`)
  for (let i = 0; i < 4; i++) {
    await openCard(page, i)
    for (let s = 0; s < 7; s++) {
      await goStep(page, s); const label = `${vpName} ar project ${i + 1} step ${s + 1}`
      await checkPage(page, label); reportErrors(errors, label)
      if (i === 0) await shot(page, `03-${vpName}-ar-p1-s${s + 1}`)
    }
    txt = await page.locator('body').innerText()
    if (!/[؀-ۿ]/.test(txt)) issue(`${vpName}: no Arabic text in wizard`)
    await nav(page, 'projects')
  }
  // Arabic appliance library: adding stores the Arabic name
  await newProject(page); await goStep(page, 1)
  await page.getByTestId('open-library').click()
  const n = await page.getByTestId('library-item').count(); if (!n) issue(`${vpName}: ar library empty`)
  await page.getByTestId('library-item').first().locator('button').first().click(); await page.waitForTimeout(100)
  await page.getByTestId('library-done').click()
  const loadTxt = await page.locator('[data-load-id]').first().evaluate((el) => el.innerText + ' ' + [...el.querySelectorAll('input')].map((i) => i.value).join(' '))
  if (!/[؀-ۿ]/.test(loadTxt)) issue(`${vpName}: load added from the Arabic library has no Arabic name: ${loadTxt}`); else pass(`${vpName}: Arabic load name`)
  await checkPage(page, `${vpName} ar loads`); await shot(page, `03-${vpName}-ar-loads`); reportErrors(errors, `${vpName} ar loads`)
  await setLang(page, 'en')
  const back = await page.evaluate(() => document.documentElement.dir)
  if (back !== 'ltr') issue(`${vpName}: dir after toggling back = ${back}`); else pass(`${vpName}: toggled back to ltr`)
  reportErrors(errors, `${vpName} ar`)
  await browser.close()
}
summary('03-arabic')
