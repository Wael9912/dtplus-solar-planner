// Scenario a — sales desk, customer on the phone: load calculator → result card → copy → 1-page PDF → "Make full proposal".
import { scenario, grab, checkClientPdf, pdfPng, numOf, goStep } from './lib.mjs'

const Q = {
  en: [['split ac 1.5 hp', 2, /1 ton|12,?000/i], ['fridge', 1, /fridge|refrigerator/i], ['led bulb', 10, /LED/], ['tv', 1, /TV/], ['water pump 1 hp', 1, /pump.*1 ?HP/i]],
  ar: [['مكيف سبلت 1.5 حصان', 2, /1 طن|12/], ['ثلاجة', 1, /ثلاجة/], ['لمبة', 10, /LED|لمبة/], ['تلفزيون', 1, /تلفزيون|شاشة/], ['طلمبة 1 حصان', 1, /1 حصان/]],
}

await scenario('10-calc', async (c) => {
  const { page } = c
  await page.getByTestId('start-calc').click()
  await page.waitForTimeout(300)
  if (!(await page.getByTestId('calc-page').isVisible())) return c.bad('calculator did not open from the home tile')
  if (!/#\/calc$/.test(page.url())) c.bad(`calculator hash is ${page.url()}`)
  await c.check('calc empty', { shotName: 'empty' })

  // ---- loads from the library, typed the way the customer says them
  await page.getByTestId('open-library').first().click()
  await page.waitForTimeout(300)
  const picked = []
  for (const [q, n, expect] of Q[c.lang]) {
    await page.getByTestId('library-search').fill(q)
    await page.waitForTimeout(200)
    const item = page.getByTestId('library-item').first()
    if (!(await item.count())) { c.bad(`library search "${q}" found nothing`); continue }
    const nm = (await item.locator('button').first().innerText()).split('\n')[0].trim()
    picked.push(`${q} → ${nm} ×${n}`)
    if (!expect.test(nm)) c.bad(`library search "${q}": first result "${nm}" does not look right`)
    await item.getByTestId('library-add').click()
    await page.waitForTimeout(120)
    if (n > 1) {
      const qty = page.getByTestId('library-item').first().getByTestId('library-qty')
      await qty.click(); await qty.fill(String(n)); await qty.press('Enter'); await page.waitForTimeout(120)
      const v = await qty.inputValue()
      if (v !== String(n)) c.bad(`library qty for "${q}" shows ${v}, wanted ${n}`)
    }
  }
  c.ok(picked.join(' | '))
  await c.check('library sheet', { shotName: 'library' })
  await page.getByTestId('library-done').click()
  await page.waitForTimeout(300)
  const rows = await page.locator('[data-load-id]').count()
  if (rows !== 5) c.bad(`expected 5 load lines, got ${rows}`)
  const qtyTotal = await page.locator('[data-load-id]').evaluateAll((els) => els.map((e) => {
    const ins = [...e.querySelectorAll('input[inputmode=decimal]')]; return ins.map((i) => i.value)
  }))
  c.ok(`load inputs: ${JSON.stringify(qtyTotal)}`)
  const loadsDaily = numOf(await page.getByTestId('load-kpis').locator('.stat-value').first().innerText())

  // ---- result card (side column on desktop, bottom bar + sheet on the phone)
  let scope = page.getByTestId('calc-result')
  if (c.phone) {
    const bar = page.getByTestId('calc-bar-open')
    if (!(await bar.isVisible())) return c.bad('phone: result bar not shown after adding loads')
    const barPrice = (await page.getByTestId('calc-bar-price').innerText()).trim()
    const barSys = (await page.getByTestId('calc-bar-system').innerText()).trim()
    c.ok(`bar: ${barSys} · ${barPrice}`)
    await c.check('calc with loads', { shotName: 'loads' })
    await bar.click(); await page.waitForTimeout(400)
    scope = page.getByTestId('calc-sheet')
  } else await c.check('calc with loads', { shotName: 'loads' })
  const read = async (id) => (await scope.getByTestId(id).innerText()).replace(/\s+/g, ' ').trim()
  const card = { total: await read('calc-total'), daily: await read('calc-daily'), pv: await read('calc-pv'), batt: await read('calc-battery'), inv: await read('calc-inverter'), prod: await read('calc-production') }
  c.ok(`result card: ${JSON.stringify(card)}`)
  const totalN = numOf(card.total), pvN = numOf(card.pv), dailyN = numOf(card.daily)
  if (!(totalN > 1000)) c.bad(`price looks wrong: ${card.total}`)
  if (!(pvN > 1 && pvN < 30)) c.bad(`PV size looks wrong for a house with 2 ACs: ${card.pv}`)
  if (Math.abs(dailyN - loadsDaily) > 0.15) c.bad(`result daily ${card.daily} ≠ loads tile ${loadsDaily}`)
  if (!/kWh/.test(card.batt)) c.bad(`hybrid result has no battery: ${card.batt}`)
  if (!/×/.test(card.inv)) c.bad(`no inverter in result: ${card.inv}`)
  await c.check('result card', { shotName: 'result' })

  // ---- copy summary
  await scope.getByTestId('calc-copy').click()
  await page.waitForTimeout(500)
  const toast = page.getByTestId('toast').last()
  const toastTxt = (await toast.innerText().catch(() => '')).trim()
  const toastErr = await toast.evaluate((e) => e.className.includes('bg-red')).catch(() => true)
  if (!toastTxt || toastErr) c.bad(`copy: toast "${toastTxt}" (error tone=${toastErr})`)
  if (!c.phone) {
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e.message}`)
    if (!clip.includes(String(numOf(card.total)).replace(/\B(?=(\d{3})+(?!\d))/g, ','))) c.bad(`copied text has no total ${card.total}: ${clip.slice(0, 200)}`)
    if (!/kWp/.test(clip)) c.bad('copied text has no kWp')
    if (c.lang === 'ar' && !/[؀-ۿ]/.test(clip)) c.bad('copied text is not Arabic')
    if (/NaN|undefined/.test(clip)) c.bad('copied text has NaN/undefined')
    c.ok(`clipboard: ${clip.replace(/\n/g, ' ⏎ ').slice(0, 260)}`)
  }

  // ---- 1-page PDF
  const pdf = await grab(c, () => scope.getByTestId('calc-pdf').click(), 'summary')
  if (pdf) {
    const txt = checkClientPdf(c, pdf, 'calc PDF', { total: card.total })
    pdfPng(pdf, { first: 1, last: 2, res: 70 })
    const pages = (txt.match(/\f/g) || []).length
    if (pages > 1) c.bad(`1-page PDF has ${pages} pages`)
    if (!txt.includes(String(card.pv.match(/[\d.]+/)?.[0]))) c.bad(`PDF does not show PV size ${card.pv}`)
  }
  await page.waitForTimeout(300)

  // ---- Make full proposal: loads must carry over
  await scope.getByTestId('calc-proposal').click()
  await page.waitForTimeout(500)
  if (!/#\/p\/[^/]+\/1$/.test(page.url())) c.bad(`after "Make full proposal" URL is ${page.url()}`)
  await c.check('proposal created (client step)', { shotName: 'proposal-step1' })
  await goStep(page, 1)
  const n2 = await page.locator('[data-load-id]').count()
  if (n2 !== 5) c.bad(`full proposal has ${n2} load lines, expected 5`)
  const daily2 = numOf(await page.getByTestId('load-kpis').locator('.stat-value').first().innerText())
  if (Math.abs(daily2 - loadsDaily) > 0.01) c.bad(`full proposal daily ${daily2} ≠ calculator ${loadsDaily}`)
  else c.ok(`loads carried over: ${n2} lines, ${daily2} kWh/day`)
  await c.check('proposal loads', { shotName: 'proposal-loads' })
  // price of the new project equals the calculator price (same inputs)
  await goStep(page, 5)
  const g = (await page.getByTestId('bom-grand').first().innerText()).trim()
  if (Math.abs(numOf(g) - totalN) > 1) c.bad(`full proposal total ${g} ≠ calculator ${card.total}`)
  else c.ok(`proposal total ${g} = calculator ${card.total}`)
  // calculator is empty again
  await page.goto(page.url().replace(/#.*$/, '#/calc')); await page.waitForTimeout(500)
  if (await page.locator('[data-load-id]').count()) c.bad('calculator still has loads after "Make full proposal"')
})
