// App updates end to end (src/updates.ts): builds the app twice (two build ids), serves one build, swaps the served files
// while the page is open and checks the reload, the messages, the banner, the loop guard and that data survives.
// Chromium desktop + WebKit iPhone. Run: `node tests/e2e/update-flow.mjs` (needs no dev server; uses port 5181).
import { chromium, webkit, devices } from 'playwright'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const PORT = 5181
const URL = `http://localhost:${PORT}/`
const STORE = 'dtplus-solar-planner-v1'
// The version being released (package.json) — the "what's new" sheet of a v0.1 device lists every note since 0.2.0
const VERSION = JSON.parse(fs.readFileSync(new globalThis.URL('../../package.json', import.meta.url), 'utf8')).version
const VERSION_RE = VERSION.replace(/\./g, '\\.')
const NOTES_SINCE_0_1 = 13 // 0.2.0: 6, 0.2.1: 1, 0.3.0: 3, 0.4.0: 3; add the new version's notes when releasing
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-update-'))
const A = path.join(tmp, 'a'), B = path.join(tmp, 'b')
for (const dir of [A, B]) execSync(`npx vite build --outDir ${dir} --emptyOutDir --logLevel error`, { stdio: 'inherit' })

let root = A
// version.json faked by the server itself (a page with the app's service worker is out of reach of Playwright's page.route in
// WebKit): a build id that never arrives, or no answer at all (offline)
let versionFake = null // null | { build } | 'offline'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' }
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new globalThis.URL(req.url, URL).pathname)
  if (p === '/version.json' && versionFake === 'offline') { req.socket.destroy(); return }
  if (p === '/version.json' && versionFake) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ version: VERSION, build: versionFake.build })); return }
  let file = path.join(root, p === '/' ? 'index.html' : p)
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html') // SPA fallback, like Cloudflare Pages
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': p === '/version.json' ? 'no-store' : 'max-age=0, must-revalidate' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(PORT, r))

const issues = []
const pass = (m) => console.log('PASS:', m)
const issue = (m) => { issues.push(m); console.log('ISSUE:', m) }
const check = (ok, m) => (ok ? pass(m) : issue(m))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Start and resume checks are at least 10 s apart
const GAP = 12_000

async function run(name, browserType, ctxOpts) {
  console.log(`\n=== ${name} ===`)
  const browser = await browserType.launch()
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const bundle = () => page.evaluate(() => document.querySelector('script[src*="/assets/index-"]')?.getAttribute('src'))
  const bundleOf = (dir) => fs.readFileSync(path.join(dir, 'index.html'), 'utf8').match(/\/assets\/index-[^"]+\.js/)[0]
  const markPage = () => page.evaluate(() => { window.__same = 1 })
  const reloaded = () => page.waitForFunction(() => !window.__same && document.readyState === 'complete', null, { timeout: 15_000 }).then(() => true, () => false)
  const resume = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const toastText = () => page.locator('[data-testid=toast]').allInnerTexts().then((x) => x.join(' | '))

  try {
    // 1. New device: no message, version stored
    root = A
    await page.goto(URL, { waitUntil: 'networkidle' })
    await sleep(2000)
    check(!(await page.locator('[data-testid=whats-new]').count()), `${name}: new device sees no "what's new"`)
    check((await page.evaluate(() => localStorage.getItem('dtplus-seen-version'))) === VERSION, `${name}: version stored on a new device`)

    // 2. Device that ran v0.1 (store data, no stored version): release notes, in English then Arabic
    for (const lang of ['en', 'ar']) {
      await page.evaluate(([k, l]) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify({ state: { lang: l, projects: [] }, version: 2 })) }, [STORE, lang])
      await page.reload({ waitUntil: 'networkidle' })
      const sheet = page.locator('[data-testid=whats-new]')
      const shown = await sheet.waitFor({ timeout: 5000 }).then(() => true, () => false)
      check(shown, `${name}/${lang}: returning v0.1 device sees "what's new"`)
      if (shown) {
        const txt = await sheet.innerText()
        check(lang === 'en' ? new RegExp(`New in version ${VERSION_RE}`).test(txt) && /Load calculator/.test(txt) && /updates itself/.test(txt) : /الجديد في الإصدار/.test(txt) && /حاسبة الأحمال/.test(txt), `${name}/${lang}: notes cover v0.2.0 to v${VERSION}`)
        check((await sheet.locator('li').count()) === NOTES_SINCE_0_1, `${name}/${lang}: ${NOTES_SINCE_0_1} notes`)
        if (lang === 'ar') check((await page.evaluate(() => document.querySelector('[data-testid=whats-new]')?.closest('[dir]')?.getAttribute('dir'))) === 'rtl', `${name}/ar: sheet is RTL`)
        await page.screenshot({ path: path.join(tmp, `${name}-whatsnew-${lang}.png`) })
        await page.locator('[data-testid=whats-new-ok]').click()
        check(!(await sheet.count()), `${name}/${lang}: "Got it" closes the notes`)
      }
      await page.reload({ waitUntil: 'networkidle' }); await sleep(500)
      check(!(await sheet.count()), `${name}/${lang}: notes shown only once`)
    }
    await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify({ state: { lang: 'en' }, version: 3 })); localStorage.setItem('dtplus-seen-version', v) }, [STORE, VERSION])
    await page.reload({ waitUntil: 'networkidle' })

    // 3. New version published while the app is open; the user comes back to the tab → reloads by itself, data and screen kept
    await page.goto(URL + '#/settings', { waitUntil: 'networkidle' })
    const nameBox = page.locator('[data-testid=settings-name]')
    await nameBox.fill('Update Test Co'); await nameBox.blur()
    await sleep(GAP)
    root = B
    await markPage(); await resume()
    check(await reloaded(), `${name}: coming back to the tab after a publish reloads the app`)
    check((await bundle()) === bundleOf(B), `${name}: the new build is running`)
    await page.locator('[data-testid=toast]').first().waitFor({ timeout: 5000 }).catch(() => {})
    check(new RegExp(`updated to version ${VERSION_RE}`).test(await toastText()), `${name}: "The app was updated" message shown`)
    check(page.url().endsWith('#/settings'), `${name}: same screen after the update (${page.url()})`)
    check((await page.locator('[data-testid=settings-name]').inputValue()) === 'Update Test Co', `${name}: data kept through the update`)

    // 4. Busy (typing in a field): banner instead of a reload; "Update now" applies it
    await sleep(GAP)
    root = A
    await page.locator('[data-testid=settings-name]').focus()
    await markPage(); await resume()
    const banner = page.locator('[data-testid=update-banner]')
    check(await banner.waitFor({ timeout: 5000 }).then(() => true, () => false), `${name}: while typing, a "new version" banner shows`)
    await sleep(2000)
    check(await page.evaluate(() => window.__same === 1), `${name}: no reload while typing`)
    await page.screenshot({ path: path.join(tmp, `${name}-banner.png`) })
    await page.locator('[data-testid=update-now]').click()
    check(await reloaded(), `${name}: "Update now" reloads`)
    check((await bundle()) === bundleOf(A), `${name}: banner update runs the new build`)

    // 5. A lazy file of the old version is gone (PDF/Excel after a publish): reloads into the new version
    await sleep(500)
    root = B
    await markPage()
    await page.evaluate(() => window.dispatchEvent(new Event('vite:preloadError')))
    check(await reloaded(), `${name}: a missing file of the old version reloads the app`)
    check((await bundle()) === bundleOf(B), `${name}: and the new build runs`)

    // 6. Loop guard: version.json names a build the reload cannot deliver → one reload, then the banner, never a loop
    await sleep(GAP)
    versionFake = { build: 'never-arrives' }
    let loads = 0
    page.on('load', () => loads++)
    await markPage(); await resume()
    await reloaded()
    await sleep(4000)
    check(loads === 1, `${name}: exactly one reload for a build that never arrives (loads=${loads})`)
    check(await banner.isVisible(), `${name}: then the banner instead of another reload`)
    versionFake = null

    // 7. Settings → "Check for updates": up to date, and offline
    await page.goto(URL + '#/settings', { waitUntil: 'networkidle' })
    await page.locator('[data-testid=check-updates]').click()
    await page.locator('[data-testid=toast]').first().waitFor({ timeout: 5000 }).catch(() => {})
    check(/latest version/.test(await toastText()), `${name}: manual check says "latest version"`)
    versionFake = 'offline'
    await page.locator('[data-testid=check-updates]').click()
    await page.waitForFunction(() => /Could not check/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {})
    check(/Could not check/.test(await toastText()), `${name}: manual check offline says so`)
    versionFake = null
    // Offline resume never reloads (a reload while offline would leave a browser error page)
    await sleep(GAP)
    versionFake = 'offline'
    root = A
    await markPage(); await resume(); await sleep(2000)
    check(await page.evaluate(() => window.__same === 1), `${name}: offline resume does not reload`)
    versionFake = null
    check(!errors.length, `${name}: no page errors ${errors.join(' | ').slice(0, 300)}`)
  } catch (e) {
    issue(`${name}: crashed: ${e?.stack || e}`)
  } finally {
    await browser.close()
  }
}

await run('chromium-desktop', chromium, { viewport: { width: 1366, height: 900 } })
await run('webkit-iphone', webkit, { ...devices['iPhone 13'] })
server.close()
console.log(`\nScreenshots: ${tmp}`)
console.log(issues.length ? `\n${issues.length} ISSUE(S)` : '\nALL PASS')
process.exit(issues.length ? 1 : 0)
