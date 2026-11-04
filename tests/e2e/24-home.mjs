// Scenario n — home screen: lands on #/home, every feature has its own tile and each tile opens the right screen (hash + screen),
// History is one tap from every screen, recent work and "Continue calculation" reopen the right thing, the back gesture returns
// home, and Home ↔ History survive a refresh. Desktop + iPhone, EN + AR.
import { scenario, go, loadSamples, projectCards } from './lib.mjs'

// tile → [hash it must open, test id visible on that screen]
const TILES = [
  ['start-calc', /#\/calc$/, 'calc-page'],
  ['start-tool-strings', /#\/tools\/strings$/, 'tool-strings'],
  ['start-tool-battery', /#\/tools\/battery$/, 'tool-battery'],
  ['start-tool-cable', /#\/tools\/cable$/, 'tool-cable'],
  ['start-tool-generator', /#\/tools\/generator$/, 'tool-generator'],
  ['home-history', /#\/projects$/, 'history-page'],
  ['home-prices', /#\/prices$/, 'prices-page'],
  ['home-settings', /#\/settings$/, 'settings-currency'],
  ['home-backup', /#\/settings$/, 'export-backup'],
]
const PROJECT_TILES = [['start-size', 'size'], ['start-items', 'items'], ['start-design', 'design']]
const hash = (page) => new globalThis.URL(page.url()).hash

await scenario('24-home', async (c) => {
  const { page, phone, T } = c
  const H = T.calc.home
  const vis = (tid) => page.getByTestId(tid).first().isVisible().catch(() => false)
  const home = async () => { await go(page, 'home'); if (!(await vis('home-page'))) c.bad(`home not shown after the Home button (at ${hash(page)})`) }

  // ---- first start: Home, not the list
  if (!/#\/home$/.test(hash(page))) c.bad(`first start opens ${hash(page)}, not #/home`)
  if (!(await vis('home-page'))) c.bad('home screen not shown on first start')
  if (!(await vis('home-new-here'))) c.bad('first start: "New here?" card missing')
  const h1 = (await page.locator('main h1').first().innerText()).trim()
  if (h1 !== H.hello) c.bad(`home title "${h1}" ≠ "${H.hello}"`)
  for (const g of ['calc', 'quotes', 'business']) if (!(await vis(`home-group-${g}`))) c.bad(`group ${g} missing`)
  const allTiles = [...TILES.map(([t]) => t), ...PROJECT_TILES.map(([t]) => t)]
  for (const tid of allTiles) if (!(await vis(tid))) c.bad(`tile ${tid} not visible on home`)
  if (phone) {
    const shorts = await page.getByTestId('tile-short').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.textContent.trim()))
    if (shorts.length !== allTiles.length || shorts.some((s) => !s)) c.bad(`phone tiles: ${shorts.length} one-line hints for ${allTiles.length} tiles`)
  }
  await c.check('home (empty)', { shotName: 'home-empty' })

  // ---- every non-project tile opens its screen; History is one tap away there; back gesture returns home
  for (const [tid, re, screen] of TILES) {
    await page.getByTestId(tid).click(); await page.waitForTimeout(350)
    if (!re.test(hash(page))) c.bad(`${tid} opened ${hash(page)}`)
    if (!(await vis(screen))) c.bad(`${tid}: "${screen}" not shown`)
    if (tid === 'home-backup') {
      const box = await page.locator('#company-file').boundingBox()
      const vh = page.viewportSize()?.height ?? 800
      if (!box || box.y > vh * 0.6 || box.y < -box.height) c.bad(`backup tile: company-file section not scrolled into view (y=${box?.y})`)
    }
    await c.check(`${tid} screen`, { shotName: null })
    if (tid !== 'home-history') {
      const hist = page.getByTestId('nav-projects')
      if (!(await hist.isVisible())) c.bad(`${tid}: History button not visible in the header`)
      await page.goBack(); await page.waitForTimeout(300)
      if (!(await vis('home-page'))) c.bad(`${tid}: back gesture did not return home (at ${hash(page)})`)
    } else await home()
  }

  // ---- empty history → home link; samples from home land on History
  await page.getByTestId('nav-projects').click(); await page.waitForTimeout(250)
  if (!(await vis('get-started'))) c.bad('empty history: get-started card missing')
  await page.getByTestId('go-home').click(); await page.waitForTimeout(250)
  if (!(await vis('home-page'))) c.bad('empty history: "Home screen" button did not go home')
  await loadSamples(page)
  if (!(await vis('history-page'))) c.bad('samples from home did not open History')
  const n = await projectCards(page).count()
  if (n !== 4) c.bad(`samples: ${n} cards on History`)
  await c.check('history with samples', { shotName: 'history' })

  // ---- recent work on home: newest first, 4 on desktop / 3 on phones, opens the project
  await home()
  if (await vis('home-new-here')) c.bad('"New here?" still shown with projects saved')
  const recent = page.getByTestId('recent-project')
  const shown = await recent.evaluateAll((els) => els.filter((e) => e.offsetParent).length)
  if (shown !== (phone ? 3 : 4)) c.bad(`recent projects shown: ${shown} (want ${phone ? 3 : 4})`)
  const totals = await page.getByTestId('recent-total').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.textContent.trim()))
  if (totals.some((x) => !/\d/.test(x))) c.bad(`recent totals: ${totals.join(' | ')}`)
  const link = page.getByTestId('home-history-link')
  if (!(await link.innerText()).includes('4')) c.bad(`history link text "${await link.innerText()}" has no count`)
  await c.check('home with recent work', { shotName: 'home-recent' })
  const firstTitle = (await recent.first().locator('bdi').first().innerText()).trim()
  await recent.first().click(); await page.waitForTimeout(350)
  if (!/^#\/p\//.test(hash(page))) c.bad(`recent project opened ${hash(page)}`)
  const inProject = phone ? (await page.getByTestId('header-project').innerText()).trim() : firstTitle
  if (inProject !== firstTitle) c.bad(`recent opened "${inProject}", not "${firstTitle}"`)
  // inside a project History is still one tap: header button (desktop) or the back arrow (phone)
  await page.getByTestId(phone ? 'nav-back-projects' : 'nav-projects').click(); await page.waitForTimeout(300)
  if (!(await vis('history-page'))) c.bad('from a project: one tap did not open History')

  // ---- project tiles create a project in the right mode, listed on History
  for (const [tid, mode] of PROJECT_TILES) {
    await home()
    await page.getByTestId(tid).click(); await page.waitForTimeout(350)
    if (!/^#\/p\/[^/]+\/1$/.test(hash(page))) c.bad(`${tid} opened ${hash(page)}`)
    await go(page, 'projects')
    const m = await projectCards(page).first().getAttribute('data-mode')
    if (m !== mode) c.bad(`${tid}: newest card mode ${m}, want ${mode}`)
  }
  if (await projectCards(page).count() !== 7) c.bad(`after 3 project tiles: ${await projectCards(page).count()} cards (want 7)`)

  // ---- calculator work in progress → "Continue calculation" on home
  await home()
  await page.getByTestId('start-calc').click(); await page.waitForTimeout(300)
  await page.getByTestId('tpl-tplShop').click().catch(() => c.bad('calculator template button missing')); await page.waitForTimeout(300)
  await home()
  const cont = page.getByTestId('continue-calc')
  if (!(await cont.isVisible())) c.bad('home: "Continue calculation" missing after calculator work')
  else {
    const shownNow = await recent.evaluateAll((els) => els.filter((e) => e.offsetParent).length)
    if (shownNow !== (phone ? 2 : 3)) c.bad(`with calculator work: ${shownNow} recent projects shown (want ${phone ? 2 : 3})`)
    await cont.click(); await page.waitForTimeout(300)
    if (!/#\/calc$/.test(hash(page))) c.bad(`continue calculation opened ${hash(page)}`)
  }

  // ---- refresh keeps the screen; brand goes home; the other language has its own home text
  for (const [h, tid] of [['#/home', 'home-page'], ['#/projects', 'history-page']]) {
    await page.evaluate((x) => { location.hash = x }, h); await page.waitForTimeout(250)
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(350)
    if (!(await vis(tid))) c.bad(`refresh on ${h}: "${tid}" not shown`)
  }
  await page.getByTestId('brand').click(); await page.waitForTimeout(250)
  if (!(await vis('home-page'))) c.bad('brand did not go home')
  const other = c.lang === 'ar' ? 'en' : 'ar'
  await page.getByTestId(`lang-${other}`).click(); await page.waitForTimeout(300)
  const h1o = (await page.locator('main h1').first().innerText()).trim()
  if (h1o !== c.D[other].calc.home.hello) c.bad(`home title in ${other}: "${h1o}"`)
  await c.check(`home in ${other}`, { shotName: `home-${other}` })
  await page.getByTestId(`lang-${c.lang}`).click(); await page.waitForTimeout(200)
})
