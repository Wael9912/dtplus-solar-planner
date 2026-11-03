// Scenario l — persistence / migration ("returning device"): the live v0.1 app (built from `main`, served by request interception —
// no extra port) loads the samples; its saved localStorage state (persist version 2: no mode / sizing / priceBook) is seeded into
// v0.2 → every project opens and prices the same as v0.1; full backup export → clear → restore round trip.
// Needs V01_DIST (default: scratch v01dist built with `git archive main` + `vite build`).
import fs from 'node:fs'
import path from 'node:path'
import { scenario, URL, SHOTS, grab, projectCards, goStep, goKey, go, grandTotal, numOf, setLang, confirmDialog, gotoApp } from './lib.mjs'

const V01 = process.env.V01_DIST || path.join(path.dirname(SHOTS), 'v01dist')
const V01_URL = 'http://v01.test/'
const TYPES = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json' }
if (!fs.existsSync(path.join(V01, 'index.html'))) { console.log(`SKIP: no v0.1 build at ${V01}`); process.exit(0) }

await scenario('21-migrate', async (c) => {
  const { page, context } = c
  await context.route(`${V01_URL}**`, (route) => {
    const u = new globalThis.URL(route.request().url())
    const f = path.join(V01, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname))
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nope' })
    route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] ?? 'application/octet-stream' })
  })
  // ---- v0.1: load the samples like a user of the live app, note every total
  await page.goto(V01_URL, { waitUntil: 'networkidle' })
  if (c.lang === 'ar') await setLang(page, 'ar')
  const first = page.getByTestId('load-samples')
  if (await first.isVisible().catch(() => false)) await first.click(); else { await page.getByTestId('projects-menu').click(); await page.getByTestId('menu-samples').click() }
  await page.waitForTimeout(400)
  const cards = projectCards(page)
  const n = await cards.count()
  const v01 = {}
  for (let i = 0; i < n; i++) {
    const ref = (await cards.nth(i).innerText()).match(/Q-\d{4}-\d{4}/)?.[0]
    await cards.nth(i).getByTestId('project-open').click(); await page.waitForTimeout(300)
    await goStep(page, 5)
    v01[ref] = (await page.getByTestId('bom-grand').last().innerText()).trim()
    await page.getByTestId('nav-finish').isVisible().catch(() => false)
    await page.goto(`${V01_URL}#/projects`); await page.waitForTimeout(300)
  }
  // one project left open on a step, as a real user would leave it
  await cards.first().getByTestId('project-open').click(); await page.waitForTimeout(200); await goStep(page, 2)
  const saved = await page.evaluate(() => localStorage.getItem('dtplus-solar-planner-v1'))
  const st = JSON.parse(saved)
  c.ok(`v0.1 saved state: version ${st.version}, ${st.state.projects.length} projects, view ${st.state.view}; totals ${JSON.stringify(v01)}`)
  if (st.version !== 2) c.bad(`v0.1 build saved version ${st.version}, expected 2`)
  if (st.state.projects.some((p) => 'mode' in p || 'sizing' in p) || 'priceBook' in (st.state.company ?? {})) c.bad('v0.1 state unexpectedly has v0.2 fields')
  fs.writeFileSync(path.join(SHOTS, `21-migrate-${c.id}-v01-state.json`), JSON.stringify(st, null, 1))

  // ---- v0.2 on the same device: seed the saved state and reload
  await gotoApp(page)
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('dtplus-solar-planner-v1', s) }, saved)
  await page.goto('about:blank'); await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForTimeout(500) // the bookmark (no hash)
  const lang = await page.evaluate(() => document.documentElement.lang)
  if (lang !== c.lang) c.bad(`language after migration ${lang}, v0.1 had ${c.lang}`)
  if (!/#\/p\/[^/]+\/3$/.test(page.url())) c.warn(`v0.1 left a project open on step 3; v0.2 opened ${page.url()}`)
  await c.check('migrated: reopened view', { shotName: 'reopened' })
  await go(page, 'projects')
  if ((await cards.count()) !== n) c.bad(`after migration ${await cards.count()} projects, v0.1 had ${n}`)
  const modes = await cards.evaluateAll((els) => els.map((e) => e.dataset.mode))
  if (modes.some((m) => m !== 'design')) c.bad(`migrated projects modes: ${modes}`)
  await c.check('migrated: project list', { shotName: 'list' })
  const v02 = {}
  for (const ref of Object.keys(v01)) {
    await cards.filter({ hasText: ref }).getByTestId('project-open').click(); await page.waitForTimeout(300)
    for (let s = 0; s < 7; s++) { await goStep(page, s); await c.check(`migrated ${ref} step ${s + 1}`, { taps: s === 0, shotName: s === 4 ? `${ref}-results` : null }) }
    await goKey(page, 'design', 'bom')
    v02[ref] = await grandTotal(page)
    if (v02[ref] !== v01[ref]) c.bad(`${ref}: v0.1 total ${v01[ref]} → v0.2 ${v02[ref]} (Δ ${(numOf(v02[ref]) - numOf(v01[ref])).toFixed(2)})`)
    await go(page, 'projects')
  }
  c.ok(`v0.2 totals ${JSON.stringify(v02)}`)

  // ---- backup round trip
  await go(page, 'settings')
  const f = await grab(c, () => page.getByTestId('export-backup').click(), 'backup')
  if (!f) return
  const b = JSON.parse(fs.readFileSync(f, 'utf8'))
  if (b.kind !== 'dtplus-backup' || b.projects?.length !== n) c.bad(`backup file: kind ${b.kind}, ${b.projects?.length} projects`)
  await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle' })
  if (c.lang === 'ar') await setLang(page, 'ar')
  await go(page, 'settings')
  await page.getByTestId('restore-file').setInputFiles(f); await page.waitForTimeout(400)
  if (!(await page.getByTestId('confirm-dialog').isVisible())) return c.bad('restore asks no confirmation')
  await c.check('restore confirmation', { shotName: 'restore-confirm' })
  await confirmDialog(page)
  await go(page, 'projects')
  if ((await cards.count()) !== n) c.bad(`after restore ${await cards.count()} projects`)
  for (const ref of Object.keys(v01)) {
    await cards.filter({ hasText: ref }).getByTestId('project-open').click(); await page.waitForTimeout(300)
    await goKey(page, 'design', 'bom')
    const t = await grandTotal(page)
    if (t !== v02[ref]) c.bad(`${ref}: restored total ${t} ≠ ${v02[ref]}`)
    await go(page, 'projects')
  }
  // restoring the same backup again adds copies with new ids (no clash), nothing crashes
  await go(page, 'settings'); await page.getByTestId('restore-file').setInputFiles(f); await page.waitForTimeout(300); await confirmDialog(page)
  await go(page, 'projects')
  if ((await cards.count()) !== 2 * n) c.bad(`restoring twice gives ${await cards.count()} projects (expected ${2 * n})`)
  await c.check('restored twice', { shotName: 'restored-twice' })
  // reload persists
  await page.reload({ waitUntil: 'networkidle' })
  if ((await cards.count()) !== 2 * n) c.bad('restored projects lost on reload')
})
