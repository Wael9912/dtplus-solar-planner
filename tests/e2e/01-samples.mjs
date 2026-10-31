// Scenario 1: empty state → load samples → open each → step through all 7 steps (desktop + mobile).
import { launch, DESKTOP, MOBILE, shot, checkPage, reportErrors, gotoApp, goStep, loadSamples, clearStorage, issue, pass, summary, projectCards, openCard } from './lib.mjs'

for (const [vpName, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  const { browser, page, errors } = await launch(vp)
  await gotoApp(page); await clearStorage(page); await page.reload({ waitUntil: 'networkidle' })
  await shot(page, `01-${vpName}-empty`)
  const emptyTxt = await page.locator('body').innerText()
  if (!/No projects yet/.test(emptyTxt)) issue(`${vpName}: empty state text missing`)
  await checkPage(page, `${vpName} empty`)
  await loadSamples(page)
  await shot(page, `01-${vpName}-samples`)
  const cards = projectCards(page)
  const n = await cards.count()
  if (n !== 4) issue(`${vpName}: expected 4 sample cards, got ${n}`); else pass(`${vpName}: 4 sample cards`)
  for (let i = 0; i < n; i++) {
    const t = await cards.nth(i).innerText()
    const hasKwp = /\d[\d,.]*\s*kWp/.test(t), hasPrice = /\$\s?\d|[\d,]+\s[A-Z]{3}/.test(t), hasKwh = /kWh|—/.test(t)
    if (!hasKwp || !hasPrice || !hasKwh) issue(`${vpName}: card ${i} missing kWp/kWh/price: ${t.replace(/\n/g, ' | ')}`)
    if (/\$0\b|0\.0 kWp/.test(t)) issue(`${vpName}: card ${i} has zero value: ${t.replace(/\n/g, ' | ')}`)
  }
  await checkPage(page, `${vpName} samples`)
  reportErrors(errors, `${vpName} projects page`)

  for (let i = 0; i < n; i++) {
    const name = (await cards.nth(i).locator('h3').innerText()).trim()
    await openCard(page, i)
    for (let s = 0; s < 7; s++) {
      await goStep(page, s)
      const label = `${vpName} "${name}" step ${s + 1}`
      await checkPage(page, label)
      if (s === 4) {
        const svgs = await page.locator('svg.recharts-surface').count()
        if (svgs < 2) issue(`${label}: expected ≥2 chart svgs, got ${svgs}`)
      }
      if (await page.evaluate(() => scrollY) !== 0) issue(`${label}: step did not open at the top`)
      await shot(page, `01-${vpName}-p${i + 1}-s${s + 1}`)
      reportErrors(errors, label)
    }
    await page.getByTestId('nav-finish').click()
    await page.waitForTimeout(200)
  }
  await browser.close()
}
summary('01-samples')
