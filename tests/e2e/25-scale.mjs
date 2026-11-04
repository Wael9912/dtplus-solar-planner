// Scenario o — production limits: a big company history (600 projects) stays usable (history, search, home, opening a project);
// a phone-photo logo is shrunk before it is stored; when the device's storage is full the app says so (banner, "Not saved")
// instead of losing work, and saves everything again once there is room. Desktop + iPhone, EN + AR.
import { scenario, loadSamples, projectCards } from './lib.mjs'

const N = 600
const STORE = 'dtplus-solar-planner-v1'
const SLOW_MS = 4000

await scenario('25-scale', async (c) => {
  const { page, phone } = c
  const vis = (tid) => page.getByTestId(tid).first().isVisible().catch(() => false)
  const timed = async (label, fn, until) => {
    const t0 = Date.now(); await fn()
    const ok = await page.waitForFunction(until, null, { timeout: 30000 }).then(() => true, () => false)
    const ms = Date.now() - t0
    if (!ok) c.bad(`${label}: did not finish in 30 s`)
    else if (ms > SLOW_MS) c.bad(`${label}: ${ms} ms (> ${SLOW_MS} ms)`)
    else c.ok(`${label}: ${ms} ms`)
    return ms
  }

  // ---- 600 projects (the samples, repeated with new ids and references)
  await loadSamples(page)
  const size = await page.evaluate(({ STORE, N }) => {
    const s = JSON.parse(localStorage.getItem(STORE))
    const base = s.state.projects
    s.state.projects = Array.from({ length: N }, (_, i) => {
      const p = structuredClone(base[i % base.length])
      return { ...p, id: `scale-${i}`, reference: `Q-S-${String(i).padStart(4, '0')}`, name: `${p.name} #${i}`, updatedAt: new Date(Date.now() - i * 60000).toISOString() }
    })
    const json = JSON.stringify(s); localStorage.setItem(STORE, json)
    return json.length
  }, { STORE, N })
  c.ok(`stored ${N} projects: ${(size / 1e6).toFixed(2)} M characters`)
  await page.evaluate(() => { location.hash = '#/projects' })
  await timed(`history with ${N} projects`, () => page.reload(), () => document.querySelectorAll('[data-testid=project-card]').length >= 600)
  if ((await projectCards(page).count()) !== N) c.bad(`history shows ${await projectCards(page).count()} of ${N}`)
  await timed('search the history', () => page.getByTestId('projects-search').fill('Q-S-0420'), () => document.querySelectorAll('[data-testid=project-card]').length === 1)
  await page.getByTestId('projects-search').fill('')
  await timed('home with a big history', () => page.getByTestId(phone ? 'brand' : 'nav-home').click(), () => document.querySelectorAll('[data-testid=recent-project]').length > 0)
  await timed('open the newest project', () => page.getByTestId('recent-project').first().click(), () => /^#\/p\//.test(location.hash))
  await c.check('project inside a big history', { taps: false })

  // ---- a 4000 × 3000 photo as the logo is stored at ≤ 600 px
  await page.evaluate(() => { location.hash = '#/settings' }); await page.waitForTimeout(400)
  const b64 = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 4000; cv.height = 3000
    const g = cv.getContext('2d'); const img = g.createImageData(4000, 3000)
    for (let i = 0; i < img.data.length; i += 4) { img.data[i] = (i * 7) & 255; img.data[i + 1] = (i * 13) & 255; img.data[i + 2] = (i >> 9) & 255; img.data[i + 3] = 255 }
    g.putImageData(img, 0, 0)
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.95))
    const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return btoa(s)
  })
  await page.locator('input[type=file][accept="image/png,image/jpeg"]').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') })
  const logo = await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).state.company.logoDataUrl, STORE, { timeout: 15000 }).then((h) => h.jsonValue(), () => null)
  if (!logo) c.bad('logo upload: nothing stored')
  else {
    const dims = await page.evaluate((src) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = src }), logo)
    if (Math.max(...dims) > 600 || logo.length > 400000) c.bad(`logo stored at ${dims.join('×')} px, ${logo.length} characters (upload was ${Math.round(b64.length / 1000)} k)`)
    else c.ok(`logo: ${Math.round(b64.length / 1000)} k upload stored as ${dims.join('×')} px, ${Math.round(logo.length / 1000)} k`)
  }

  // ---- storage full: say so, keep working, save again once there is room
  // back to the 4 samples so the app's own data is small (reloaded straight away: any change in the open app would write its
  // 600 projects back), then fill the rest of the storage
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k)); s.state.projects = s.state.projects.slice(0, 4); s.state.view = 'home'; localStorage.setItem(k, JSON.stringify(s))
    history.replaceState(null, '', location.pathname)
  }, STORE)
  await page.reload({ waitUntil: 'networkidle' })
  if (!(await vis('home-page'))) await page.getByTestId(phone ? 'brand' : 'nav-home').click()
  await page.evaluate(() => { let n = 0; for (let size = 1 << 20; size >= 1; size >>= 1) { const s = 'x'.repeat(size); for (;;) { try { localStorage.setItem('junk' + n, s); n++ } catch { break } } } })
  await page.getByTestId('start-design').click(); await page.waitForTimeout(500)
  if (!(await vis('save-banner'))) c.bad('storage full: no "not saved" banner')
  if (!phone && !(await vis('not-saved'))) c.bad('storage full: project header still says "Saved automatically"')
  await c.check('storage full', { shotName: 'storage-full' })
  await page.getByTestId('save-banner-backup').click(); await page.waitForTimeout(400)
  if (!(await vis('export-backup'))) c.bad('storage full: Backup did not open the backup section')
  await page.evaluate(() => { for (let i = 0; i < 12; i++) localStorage.removeItem('junk' + i) })
  await page.getByTestId('settings-name').fill('Scale Test Solar'); await page.waitForTimeout(300)
  if (await vis('save-banner')) c.bad('room again: banner still shown after a saved change')
  await page.reload({ waitUntil: 'networkidle' })
  const kept = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).state.projects.length, STORE)
  if (kept !== 5) c.bad(`room again: ${kept} projects after reload (want 5: the one made while full is saved too)`)
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('junk')) localStorage.removeItem(k) })
})
