// Scenario m (1/2) — abuse: double-taps on Next and start tiles, browser back / forward through steps and views (hash routes),
// switching language mid-flow, refresh on every route (incl. broken links).
import { scenario, URL, newVia, go, setLang, loadSamples, projectCards, goStep } from './lib.mjs'

const stepNo = async (page, phone) => phone
  ? Number((await page.getByTestId('step-sheet-btn').innerText()).match(/(\d+)/)?.[1])
  : Number(/\/(\d+)$/.exec(page.url())?.[1])

await scenario('22-abuse-nav', async (c) => {
  const { page, phone } = c
  const other = c.lang === 'ar' ? 'en' : 'ar'
  const tap2 = async (loc) => { if (phone) { await loc.tap(); await loc.tap().catch(() => {}) } else await loc.dblclick() }

  // ---- double taps
  await loadSamples(page)
  const nProj = await projectCards(page).count()
  await go(page, 'home')
  await tap2(page.getByTestId('start-size')); await page.waitForTimeout(400)
  await go(page, 'projects')
  const nAfter = await projectCards(page).count()
  if (nAfter !== nProj + 1) c.bad(`double tap on "Quote a known size" created ${nAfter - nProj} projects`)
  await projectCards(page).filter({ hasText: 'Q-2026-0112' }).getByTestId('project-open').click(); await page.waitForTimeout(300)
  await goStep(page, 0)
  const id = /#\/p\/([^/]+)\//.exec(page.url())?.[1]
  await tap2(page.getByTestId('nav-next')); await page.waitForTimeout(400)
  const s1 = await stepNo(page, phone)
  if (s1 === 3) c.warn('double tap on Next skips a step (1 → 3)')
  else if (s1 !== 2) c.bad(`double tap on Next → step ${s1}`)
  await c.check('after double-tap Next', { shotName: 'double-next' })
  // last step: double tap Finish
  await goStep(page, 6)
  await tap2(page.getByTestId('nav-finish')); await page.waitForTimeout(300)
  if (!/#\/projects$/.test(page.url())) c.bad(`double tap Finish → ${page.url()}`)
  await page.goBack(); await page.waitForTimeout(300)
  // export: double tap a download → one file, button busy
  if (/#\/p\//.test(page.url())) {
    let n = 0; const on = () => n++
    page.on('download', on)
    await tap2(page.getByTestId('export-json-download')); await page.waitForTimeout(1500)
    page.off('download', on)
    const shared = await page.evaluate(() => window.__shareCount || 0)
    if (n + shared > 2) c.bad(`double tap on a download produced ${n + shared} files`)
    c.ok(`double tap on JSON download → ${n} download(s), ${shared} share(s)`)
  }

  // ---- back / forward through steps and views
  await page.goto(`${URL}#/p/${id}/1`); await page.waitForTimeout(400)
  for (let i = 0; i < 3; i++) { await page.getByTestId('nav-next').click(); await page.waitForTimeout(200) }
  if (await stepNo(page, phone) !== 4) c.bad(`3 × Next from step 1 → ${await stepNo(page, phone)}`)
  await page.goBack(); await page.waitForTimeout(250); await page.goBack(); await page.waitForTimeout(250)
  if (await stepNo(page, phone) !== 2) c.bad(`back × 2 from step 4 → step ${await stepNo(page, phone)} (${page.url()})`)
  await page.goForward(); await page.waitForTimeout(250)
  if (await stepNo(page, phone) !== 3) c.bad(`forward → step ${await stepNo(page, phone)}`)
  await c.check('back/forward in wizard', { shotName: 'back-forward-steps' })
  const views = [['prices', 'prices-page'], ['settings', 'settings-currency']]
  for (const [v] of views) await go(page, v)
  await newVia(page, 'tools'); await page.getByTestId('tool-card-cable').click(); await page.waitForTimeout(250)
  const trail = []
  for (let i = 0; i < 4; i++) { await page.goBack(); await page.waitForTimeout(250); trail.push(new globalThis.URL(page.url()).hash) }
  c.ok(`back trail from cable tool: ${trail.join(' ← ')}`)
  if (trail[0] !== '#/tools' || trail[1] !== '#/settings' || trail[2] !== '#/prices') c.bad(`back through views went ${trail.join(' → ')}, expected #/tools → #/settings → #/prices → wizard`)
  if (!/^#\/p\//.test(trail[3] ?? '')) c.bad(`4th back went to ${trail[3]}`)
  for (let i = 0; i < 4; i++) { await page.goForward(); await page.waitForTimeout(200) }
  if (!/#\/tools\/cable$/.test(page.url()) || !(await page.getByTestId('tool-cable').isVisible())) c.bad(`forward × 4 ended at ${page.url()}`)
  await c.check('back/forward through views', { shotName: 'back-forward-views' })

  // ---- language switch mid-flow
  await page.goto(`${URL}#/p/${id}/5`); await page.waitForTimeout(400)
  await setLang(page, other); await page.waitForTimeout(300)
  if (await stepNo(page, phone) !== 5) c.bad(`switching language on Results moved to step ${await stepNo(page, phone)}`)
  await c.check(`results after switching to ${other}`, { shotName: `lang-${other}-results` })
  await goStep(page, 5); await c.check(`pricing in ${other}`, { shotName: `lang-${other}-pricing` })
  await setLang(page, c.lang)
  await page.getByTestId('start-calc').click().catch(async () => { await newVia(page, 'calc') }); await page.waitForTimeout(300)
  if (!/#\/calc/.test(page.url())) await newVia(page, 'calc')
  await page.getByTestId('tpl-tplShop').click().catch(() => {}); await page.waitForTimeout(300)
  await setLang(page, other); await page.waitForTimeout(300)
  const names = await page.locator('[data-load-id]').evaluateAll((els) => els.map((e) => (e.querySelector('input.input-quiet')?.value || e.querySelector('[data-testid=load-card-edit] bdi')?.textContent || '').trim()))
  const wrongScript = names.filter((n) => (other === 'ar' ? /^[A-Za-z]/.test(n) && !/^(LED|CCTV|POS|PC)/.test(n) : /[؀-ۿ]/.test(n)))
  if (wrongScript.length) c.warn(`load names did not follow the language switch: ${wrongScript.slice(0, 3).join(' | ')}`)
  await c.check(`calculator after switching to ${other}`, { shotName: `lang-${other}-calc` })
  await setLang(page, c.lang)

  // ---- refresh on every route (typed URL, then reload)
  const routes = [['#/calc', 'calc-page'], ['#/tools', 'tools-page'], ['#/tools/strings', 'tool-strings'], ['#/tools/battery', 'tool-battery'], ['#/prices', 'prices-page'],
    ['#/settings', 'settings-currency'], ['#/projects', 'history-page'], ['#/history', 'history-page'], ['#/home', 'home-page'], [`#/p/${id}/3`, 'site-location'], [`#/p/${id}/7`, 'export-step'],
    [`#/p/${id}/99`, 'export-step'], ['#/p/does-not-exist/3', 'history-page'], ['#/tools/nope', 'tools-page'], ['#/garbage', null], [`#/p/${id}/0`, null]]
  for (const [h, tid] of routes) {
    await page.goto('about:blank'); await page.goto(`${URL}${h}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(300)
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400)
    const ok = tid ? await page.getByTestId(tid).first().isVisible().catch(() => false) : true
    if (!ok) c.bad(`refresh on ${h}: "${tid}" not shown (now at ${new globalThis.URL(page.url()).hash})`)
    const blank = (await page.locator('main').innerText().catch(() => '')).trim().length < 20
    if (blank) c.bad(`refresh on ${h}: blank screen`)
    await c.check(`refresh ${h}`, { taps: false, shotName: h === `#/p/${id}/3` ? 'refresh-p3' : null })
  }
})
