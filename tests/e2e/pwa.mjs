// Installable app end to end, on production builds served like Cloudflare Pages (SPA fallback): Chrome's installability
// verdict and the manifest (DevTools protocol), the service worker taking control, the whole app with the server down
// (home, calculator PDF in English and Arabic, an engineering tool, a project's Excel), a new build replacing the old cache,
// and on iPhone (WebKit) the install banner with the Add-to-Home-Screen steps.
// Run: `node tests/e2e/pwa.mjs` (needs no dev server; uses port 5182).
import { chromium, webkit, devices } from 'playwright'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const PORT = 5182
const URL = `http://localhost:${PORT}/`
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-pwa-'))
const A = path.join(tmp, 'a'), B = path.join(tmp, 'b')
for (const dir of [A, B]) execSync(`npx vite build --outDir ${dir} --emptyOutDir --logLevel error`, { stdio: 'inherit' })
const buildOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).build

let root = A, down = false
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const server = http.createServer((req, res) => {
  if (down) { req.socket.destroy(); return } // no connection at all, like a phone without signal
  const p = decodeURIComponent(new globalThis.URL(req.url, URL).pathname)
  let file = path.join(root, p === '/' ? 'index.html' : p)
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html')
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': /\/(version\.json)$/.test(p) ? 'no-store' : 'no-cache' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(PORT, r))

const issues = []
const pass = (m) => console.log('PASS:', m)
const issue = (m) => { issues.push(m); console.log('ISSUE:', m) }
const check = (ok, m) => (ok ? pass(m) : issue(m))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const vis = (page, tid) => page.getByTestId(tid).first().isVisible().catch(() => false)
const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return true; await sleep(250) } return false }
const controlled = (page) => page.evaluate(() => !!navigator.serviceWorker?.controller)
const cacheNames = (page) => page.evaluate(() => caches.keys())

async function download(page, click, tag) {
  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
  await click()
  const d = await dl
  if (!d) { issue(`${tag}: no download`); return null }
  const out = path.join(tmp, `${tag}-${d.suggestedFilename()}`); await d.saveAs(out)
  return fs.readFileSync(out)
}

// ---------------------------------------------------------------- Chromium (desktop): install, offline, update
{
  console.log('\n=== chromium ===')
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(URL, { waitUntil: 'networkidle' })
  check(await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)), 'service worker installed and active')
  await page.reload({ waitUntil: 'networkidle' })
  check(await controlled(page), 'service worker controls the page after a reload')

  const cdp = await ctx.newCDPSession(page)
  const inst = await cdp.send('Page.getInstallabilityErrors')
  check(inst.installabilityErrors.length === 0, `Chrome says installable${inst.installabilityErrors.length ? `: ${JSON.stringify(inst.installabilityErrors)}` : ''}`)
  const man = await cdp.send('Page.getAppManifest')
  check(man.errors.length === 0 && !!man.data, `manifest parses without errors${man.errors.length ? `: ${JSON.stringify(man.errors)}` : ''}`)

  const files = JSON.parse(/const FILES = (\[.*?\])\n/.exec(fs.readFileSync(path.join(A, 'sw.js'), 'utf8'))[1])
  const onDisk = fs.readdirSync(path.join(A, 'assets')).length
  check(files.filter((f) => f.startsWith('assets/')).length === onDisk, `sw.js lists every build file (${files.length}, assets ${onDisk})`)
  check(files.includes('manifest.webmanifest') && files.includes('icon-192.png') && !files.includes('version.json'), 'sw.js caches the manifest and icons, never version.json')
  const cached = await page.evaluate(async (name) => (await (await caches.open(name)).keys()).length, `dtplus-${buildOf(A)}`)
  check(cached >= files.length + 1, `cache holds the whole build (${cached} entries for ${files.length} files + the app page)`)

  // some data to work with
  await page.getByTestId('load-samples').click(); await sleep(400)
  const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem('dtplus-solar-planner-v1')).state.projects[0].id)

  // ---- server down: the installed app keeps working
  down = true
  await page.goto(`${URL}#/home`, { waitUntil: 'load' }).catch(() => {})
  await page.reload({ waitUntil: 'load' }).catch(() => {})
  await sleep(600)
  check(await vis(page, 'home-page'), 'offline: home screen opens')
  check((await page.getByTestId('recent-project').count()) > 0, 'offline: saved projects are there')
  await page.getByTestId('start-calc').click(); await sleep(300)
  await page.getByTestId('tpl-tplShop').click(); await sleep(400)
  let pdf = await download(page, () => page.getByTestId('calc-pdf').click(), 'offline-calc-en')
  check(pdf?.subarray(0, 5).toString() === '%PDF-', `offline: calculator PDF (English) ${pdf?.length ?? 0} bytes`)
  await page.getByTestId('lang-ar').click(); await sleep(300)
  pdf = await download(page, () => page.getByTestId('calc-pdf').click(), 'offline-calc-ar')
  check(pdf?.subarray(0, 5).toString() === '%PDF-' && pdf.length > 20000, `offline: calculator PDF (Arabic font from the cache) ${pdf?.length ?? 0} bytes`)
  await page.getByTestId('lang-en').click(); await sleep(200)
  await page.getByTestId('brand').click(); await sleep(250)
  await page.getByTestId('start-tool-cable').click(); await sleep(350)
  check(await vis(page, 'tool-cable'), 'offline: engineering tool opens')
  await page.goto(`${URL}#/p/${encodeURIComponent(projectId)}/7`).catch(() => {}); await sleep(600)
  const xlsx = await download(page, () => page.getByTestId('export-excel-download').click(), 'offline-excel')
  check(xlsx?.subarray(0, 2).toString() === 'PK', `offline: project Excel workbook ${xlsx?.length ?? 0} bytes`)
  check(errors.filter((e) => !/Failed to fetch|NetworkError|Load failed/.test(e)).length === 0, `offline: no page errors ${errors.slice(0, 2).join(' | ')}`)

  // ---- a new build is published: the next start runs it and the old build's cache goes
  // (a real page load, as the app's own update check does — a hash change alone does not look for a new worker)
  down = false; root = B
  await page.goto(`${URL}#/home`).catch(() => {}); await page.reload({ waitUntil: 'networkidle' })
  const swapped = await waitFor(async () => { const k = await cacheNames(page); return k.includes(`dtplus-${buildOf(B)}`) && !k.includes(`dtplus-${buildOf(A)}`) }, 30000)
  check(swapped, `new build: its cache replaced the old one (${(await cacheNames(page)).join(', ')})`)
  await page.reload({ waitUntil: 'networkidle' }); await sleep(500)
  const running = await page.evaluate(() => [...document.scripts].map((s) => s.src).find((s) => /assets\/index-/.test(s)))
  const bIndex = fs.readdirSync(path.join(B, 'assets')).find((f) => /^index-.*\.js$/.test(f))
  check(!!running && running.endsWith(bIndex), `new build: page runs ${bIndex}`)
  check((await page.getByTestId('recent-project').count()) > 0, 'new build: projects kept')
  await browser.close()
}

// ---------------------------------------------------------------- iPhone (WebKit): banner → Add to Home Screen steps
{
  console.log('\n=== webkit iPhone ===')
  root = A
  const browser = await webkit.launch()
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  check(await vis(page, 'install-banner'), 'iPhone: install banner on the home screen')
  await page.getByTestId('install-app').click(); await sleep(300)
  check(await vis(page, 'install-sheet'), 'iPhone: Install app opens the steps')
  const steps = await page.getByTestId('install-steps').locator('li').allInnerTexts()
  check(steps.length === 3 && /Add to Home Screen/.test(steps.join(' ')), `iPhone: Add to Home Screen steps (${steps.length})`)
  await page.getByTestId('install-sheet-done').click(); await sleep(250)
  check(!(await vis(page, 'install-sheet')), 'iPhone: steps close')
  await page.getByTestId('install-close').click(); await sleep(200)
  check(!(await vis(page, 'install-banner')), 'iPhone: banner closes')
  await page.reload({ waitUntil: 'networkidle' }); await sleep(300)
  check(!(await vis(page, 'install-banner')), 'iPhone: closed banner stays closed after a reload')
  await page.getByTestId('nav-menu').click(); await sleep(200)
  check(await vis(page, 'menu-install'), 'iPhone: Install app stays in the menu')
  await page.keyboard.press('Escape')
  const sw = await page.evaluate(() => Promise.race([navigator.serviceWorker?.ready.then(() => 'ready'), new Promise((r) => setTimeout(() => r('none'), 5000))]))
  if (sw === 'ready') pass('iPhone: service worker active')
  else console.log('NOTE: Playwright WebKit did not start the service worker (Safari on a real iPhone does)')
  await browser.close()
}

server.close()
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n==== pwa: ${issues.length} issue(s) ====`)
for (const i of issues) console.log(' -', i)
process.exitCode = issues.length ? 1 : 0
