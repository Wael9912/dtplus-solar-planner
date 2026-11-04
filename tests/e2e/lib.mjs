// Shared helpers for the headless-browser QA scripts (plain node + playwright).
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

export const URL = 'http://localhost:5179/'
export const SHOTS = process.env.SHOTS || '/private/tmp/claude-501/-Users-waelabdalla-PyCharmMiscProject/a0b2e4f6-b48b-439c-918d-9d216da1814e/scratchpad/stress-e2e'
export const DL = path.join(SHOTS, 'downloads')
fs.mkdirSync(DL, { recursive: true })
export const DESKTOP = { width: 1366, height: 900 }
export const MOBILE = { width: 390, height: 844 }

export async function launch(viewport = DESKTOP) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport, acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ kind: 'console', text: m.text() }) })
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', text: String(e?.stack || e) }))
  return { browser, context, page, errors }
}

export const issues = []
export function issue(msg) { issues.push(msg); console.log('ISSUE:', msg) }
export function pass(msg) { console.log('PASS:', msg) }

export async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log('shot', file)
  return file
}

/** Text-level sanity: NaN / undefined / lone en-dash where numbers expected. Returns offending snippets. */
export async function textProblems(page) {
  return page.evaluate(() => {
    const out = []
    const txt = document.body.innerText
    for (const re of [/\bNaN\b/g, /\bundefined\b/g, /\bnull\b/g, /\bInfinity\b/g]) {
      let m; while ((m = re.exec(txt))) out.push(txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' '))
    }
    return out
  })
}

/** Horizontal overflow (body wider than viewport). */
export async function overflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement
    const w = de.scrollWidth, cw = de.clientWidth
    const wide = []
    if (w > cw + 1) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if ((r.right > cw + 1 || r.left < -1) && r.width > 0) { wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')}${el.dataset.testid ? '#' + el.dataset.testid : ''} [${Math.round(r.left)}..${Math.round(r.right)}] "${(el.innerText || '').replace(/\s+/g, ' ').slice(0, 30)}"`); if (wide.length > 6) break }
      }
    }
    return { scrollWidth: w, clientWidth: cw, over: w > cw + 1, wide }
  })
}

export async function checkPage(page, label) {
  const tp = await textProblems(page)
  if (tp.length) issue(`${label}: text problems: ${JSON.stringify(tp.slice(0, 5))}`)
  const ov = await overflow(page)
  if (ov.over) issue(`${label}: horizontal overflow scrollWidth=${ov.scrollWidth} > ${ov.clientWidth}; ${ov.wide.join(' | ')}`)
  return { tp, ov }
}

export function reportErrors(errors, label) {
  // Filter known-noisy dev-only warnings (none expected); print all.
  const real = errors.filter((e) => !/favicon/.test(e.text))
  if (real.length) issue(`${label}: ${real.length} browser error(s): ${real.map((e) => e.kind + ': ' + e.text.slice(0, 300)).join(' || ')}`)
  errors.length = 0
  return real
}

export async function gotoApp(page) {
  await page.goto(URL, { waitUntil: 'networkidle' })
}

/** Go to a wizard step by index (0-6): desktop stepper, or the step-list sheet on phones. */
export async function goStep(page, i) {
  const sheetBtn = page.getByTestId('step-sheet-btn')
  if (await sheetBtn.isVisible()) { await sheetBtn.click(); await page.getByTestId(`sheet-step-${i}`).click() }
  else await page.getByTestId(`step-${i}`).click()
  await page.waitForTimeout(250)
}

/** Load the 4 sample projects (first-run card on Home or History, or the History ⋯ menu) — ends on the History list. */
export async function loadSamples(page) {
  const first = page.getByTestId('load-samples')
  if (await first.isVisible()) await first.click()
  else {
    if (!(await page.getByTestId('projects-menu').isVisible())) await nav(page, 'projects')
    await page.getByTestId('projects-menu').click(); await page.getByTestId('menu-samples').click()
  }
  await page.waitForTimeout(300)
}

/** Header navigation that works on desktop (buttons) and phones (⋯ menu). */
export async function nav(page, where /* 'projects' | 'settings' | 'new' */) {
  const direct = page.getByTestId(`nav-${where}`)
  if (await direct.isVisible()) await direct.click()
  else { await page.getByTestId('nav-menu').click(); await page.getByTestId(`menu-${where}`).click() }
  await page.waitForTimeout(250)
}
/** Header "New" menu (desktop) or the phone ⋯ menu → one of calc | size | items | design | tools. */
export async function newVia(page, kind = 'design') {
  const btn = page.getByTestId('nav-new')
  if (await btn.isVisible()) { await btn.click(); await page.getByTestId(`new-${kind}`).click() }
  else { await page.getByTestId('nav-menu').click(); await page.getByTestId(`menu-new-${kind}`).click() }
  await page.waitForTimeout(250)
}
export const newProject = (page) => newVia(page, 'design')
export const projectCards = (page) => page.getByTestId('project-card')
export async function openCard(page, i) { await projectCards(page).nth(i).getByTestId('project-open').click(); await page.waitForTimeout(250) }
/** Click the download action of an Export-step document (0 proposal, 1 technical, 2 Excel, 3 JSON). */
export async function exportDoc(page, i) {
  const key = ['proposal', 'tech', 'excel', 'json'][i]
  const btn = page.getByTestId(`export-${key}-download`)
  if (await btn.count()) await btn.click(); else await page.locator('main button.card').nth(i).click()
}
/** Language switch (segmented EN | عربي in the header). */
export async function setLang(page, l) { await page.getByTestId(`lang-${l}`).click(); await page.waitForTimeout(200) }

export async function clearStorage(page) {
  await page.evaluate(() => localStorage.clear())
}

export function summary(label) {
  console.log(`\n==== ${label}: ${issues.length} issue(s) ====`)
  for (const i of issues) console.log(' -', i)
}

// ============================================================================================================
// v0.2 scenario helpers: Chromium desktop + WebKit iPhone 13, EN + AR, per-combo pass/fail, PDF / Excel checks.
// ============================================================================================================
import { webkit, devices } from 'playwright'
import { execFileSync } from 'node:child_process'

export const COMBOS = [
  { id: 'chromium-desktop-en', engine: 'chromium', lang: 'en' },
  { id: 'chromium-desktop-ar', engine: 'chromium', lang: 'ar' },
  { id: 'webkit-iphone-en', engine: 'webkit', lang: 'en' },
  { id: 'webkit-iphone-ar', engine: 'webkit', lang: 'ar' },
]
export const RESULTS = path.join(SHOTS, 'results')
fs.mkdirSync(RESULTS, { recursive: true })

/** Launch one combo (fresh profile, empty storage). */
export async function launchCombo(c) {
  const phone = c.engine === 'webkit'
  const browser = phone ? await webkit.launch() : await chromium.launch()
  const opts = phone ? { ...devices['iPhone 13'], acceptDownloads: true } : { viewport: DESKTOP, acceptDownloads: true }
  const context = await browser.newContext(opts)
  if (!phone) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL }).catch(() => {})
  // Phones share files through the OS share sheet (headless WebKit has none): record what the app hands to navigator.share
  if (phone) await context.addInitScript(() => {
    const share = async (d) => {
      const f = d?.files?.[0]
      if (f) {
        const b = new Uint8Array(await f.arrayBuffer()); let s = ''
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
        window.__shared = { name: f.name, type: f.type, b64: btoa(s) }
      } else window.__sharedText = d?.text ?? ''
      window.__shareCount = (window.__shareCount || 0) + 1
    }
    Object.defineProperty(Navigator.prototype, 'share', { value: share, configurable: true, writable: true })
    Object.defineProperty(Navigator.prototype, 'canShare', { value: () => true, configurable: true, writable: true })
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push({ kind: 'console', text: m.text() }) })
  page.on('pageerror', (e) => errors.push({ kind: 'pageerror', text: String(e?.stack || e) }))
  return { browser, context, page, errors, phone }
}

/** Static strings of the running app (dictionary functions dropped): { en, ar, X: exportLabels }. */
export async function dicts(page) {
  return page.evaluate(async () => {
    const strip = (o) => JSON.parse(JSON.stringify(o))
    const i = await import('/src/i18n/index.ts'); const x = await import('/src/export/labels.ts')
    return { en: strip(i.dicts.en), ar: strip(i.dicts.ar), X: strip(x.exportLabels) }
  })
}

/**
 * Run a scenario on every combo (or the ones in argv / COMBOS env, e.g. `node 10-x.mjs chromium-desktop-en`).
 * fn(ctx) gets { page, phone, lang, id, T (dict of the UI language), D (both dicts), bad(msg), ok(msg), check(label), snap(name), ... }.
 */
export async function scenario(name, fn, { combos = COMBOS } = {}) {
  const want = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const sel = combos.filter((c) => !want.length || want.some((w) => c.id.includes(w)))
  const out = {}
  for (const c of sel) {
    const t0 = Date.now()
    const L = await launchCombo(c)
    const mine = [], warns = []
    const ctx = {
      ...L, ...c, name,
      bad: (m) => { mine.push(m); issue(`[${name} ${c.id}] ${m}`) },
      warn: (m) => { warns.push(m); console.log(`WARN: [${name} ${c.id}] ${m}`) },
      ok: (m) => pass(`[${c.id}] ${m}`),
      snap: (n) => shot(L.page, `${name}-${c.id}-${n}`),
      file: (n) => path.join(SHOTS, `${name}-${c.id}-${n}.png`),
    }
    ctx.check = async (label, o = {}) => screenCheck(ctx, label, o)
    try {
      await gotoApp(L.page)
      ctx.D = await dicts(L.page); ctx.T = ctx.D[c.lang]
      if (c.lang === 'ar') await setLang(L.page, 'ar')
      await fn(ctx)
    } catch (e) {
      ctx.bad(`EXCEPTION: ${String(e?.message || e).split('\n').slice(0, 4).join(' | ')}`)
      await shot(L.page, `${name}-${c.id}-EXCEPTION`).catch(() => {})
    }
    const errs = L.errors.filter((e) => !/favicon|Download the React DevTools/.test(e.text))
    if (errs.length) ctx.bad(`${errs.length} browser error(s): ${errs.slice(0, 3).map((e) => `${e.kind}: ${e.text.slice(0, 240)}`).join(' || ')}`)
    out[c.id] = { status: mine.length ? 'FAIL' : 'PASS', issues: mine, warnings: warns, secs: Math.round((Date.now() - t0) / 1000) }
    await L.browser.close()
  }
  const file = path.join(RESULTS, `${name}.json`)
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  fs.writeFileSync(file, JSON.stringify({ ...prev, ...out }, null, 2))
  console.log(`\n==== ${name}: ${Object.entries(out).map(([k, v]) => `${k}=${v.status}`).join('  ')} ====`)
  for (const [k, v] of Object.entries(out)) { for (const m of v.issues) console.log(` - ${k}: ${m}`); for (const m of v.warnings) console.log(` ~ ${k} (warn): ${m}`) }
}

/**
 * Per-screen checks: no NaN / undefined / Infinity / null text, no horizontal overflow, no new browser errors,
 * and on the phone primary controls at least 40 px tall (visible buttons / inputs / selects / tabs).
 */
export async function screenCheck(ctx, label, { taps = true, shotName = null } = {}) {
  const { page } = ctx
  await page.waitForTimeout(120)
  const tp = await textProblems(page)
  if (tp.length) ctx.bad(`${label}: text problems ${JSON.stringify(tp.slice(0, 4))}`)
  const ov = await overflow(page)
  if (ov.over) ctx.bad(`${label}: horizontal overflow ${ov.scrollWidth}>${ov.clientWidth}: ${ov.wide.slice(0, 4).join(' | ')}`)
  if (ctx.phone && taps) {
    const small = await page.evaluate(() => {
      const out = []
      const sel = 'button.btn-primary, button.btn-secondary, button.btn-ghost, input.input, select.input, [role=tab], [role=radio], button.chip, [data-testid^=nav-], [data-testid^=menu-]'
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 3) continue
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue
        if (el.closest('[aria-hidden=true]')) continue
        if (r.height < 40 || r.width < 40) out.push({ chip: el.classList.contains('chip'), s: `${el.tagName.toLowerCase()}${el.dataset.testid ? '#' + el.dataset.testid : ''}"${(el.innerText || el.getAttribute('aria-label') || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 24)}" ${Math.round(r.width)}×${Math.round(r.height)}` })
      }
      return out
    })
    const fmtL = (xs) => { const u = [...new Set(xs.map((x) => x.s))]; return `${u.slice(0, 6).join(' ; ')}${u.length > 6 ? ` (+${u.length - 6})` : ''}` }
    const hard = small.filter((x) => !x.chip), chips = small.filter((x) => x.chip)
    if (hard.length) ctx.bad(`${label}: tap targets < 40 px: ${fmtL(hard)}`)
    if (chips.length) ctx.warn(`${label}: filter chips < 40 px: ${fmtL(chips)}`)
  }
  if (shotName) await ctx.snap(shotName)
}

/** File names longer than 255 bytes cannot be saved on macOS / most file systems: flag it, then shorten for our copy. */
function safeName(ctx, name, tag) {
  const bytes = Buffer.byteLength(name)
  if (bytes > 255) ctx.bad(`${tag}: file name is ${bytes} bytes (> 255, cannot be saved as is): "${name.slice(0, 60)}…"`)
  if (bytes <= 120) return name
  const ext = path.extname(name); let stem = name.slice(0, -ext.length || undefined)
  while (Buffer.byteLength(stem + ext) > 120) stem = stem.slice(0, -1)
  return stem + ext
}
/**
 * Click something that produces a file: a download (desktop) or a file handed to the share sheet (phone).
 * Returns the saved path (or null + issue).
 */
export async function grab(ctx, click, tag, { timeout = 45000 } = {}) {
  const { page } = ctx
  const before = await page.evaluate(() => window.__shareCount || 0)
  const dlp = page.waitForEvent('download', { timeout }).catch(() => null)
  const shp = page.waitForFunction((n) => (window.__shareCount || 0) > n && window.__shared, before, { timeout }).then(() => 'shared').catch(() => null)
  await click()
  const first = await Promise.race([dlp, shp])
  const dir = path.join(DL, ctx.name); fs.mkdirSync(dir, { recursive: true })
  if (first === 'shared') {
    const f = await page.evaluate(() => window.__shared)
    const out = path.join(dir, `${ctx.id}-${tag}-${safeName(ctx, f.name, tag)}`)
    fs.writeFileSync(out, Buffer.from(f.b64, 'base64'))
    if (!fs.statSync(out).size) ctx.bad(`${tag}: empty shared file`)
    return out
  }
  const dl = first
  if (!dl) { ctx.bad(`${tag}: no download / share`); return null }
  const out = path.join(dir, `${ctx.id}-${tag}-${safeName(ctx, dl.suggestedFilename(), tag)}`)
  await dl.saveAs(out)
  if (!fs.statSync(out).size) ctx.bad(`${tag}: empty file`)
  return out
}

/** PDF → text (pdftotext -layout) and optional PNG pages (pdftoppm). */
export function pdfText(file) {
  try { return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 }) } catch (e) { return `PDFTOTEXT-FAILED ${e.message}` }
}
export function pdfPages(file) {
  try { return Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8' }))?.[1] ?? 0) } catch { return 0 }
}
export function pdfPng(file, { first = 1, last = 2, res = 60 } = {}) {
  const stem = file.replace(/\.pdf$/, '')
  try { execFileSync('pdftoppm', ['-png', '-r', String(res), '-f', String(first), '-l', String(last), file, stem]) } catch { /* ignore */ }
  return stem
}
const ARABIC_RE = /[؀-ۿﭐ-﷿ﹰ-﻿]/
/**
 * Client-document checks: valid PDF, language, no NaN/undefined/Infinity, no internal notes, no cost / markup labels,
 * and (optionally) the on-screen total present.
 */
export function checkClientPdf(ctx, file, tag, { total = null, secret = null, internalOk = false } = {}) {
  if (!file) return ''
  const head = fs.readFileSync(file).subarray(0, 5).toString()
  if (head !== '%PDF-') { ctx.bad(`${tag}: not a PDF (${head})`); return '' }
  const txt = pdfText(file)
  const flat = txt.replace(/\s+/g, ' ')
  for (const re of [/\bNaN\b/, /\bundefined\b/, /\bInfinity\b/, /\bnull\b/]) if (re.test(flat)) ctx.bad(`${tag}: "${re.source}" in PDF: …${flat.slice(Math.max(0, flat.search(re) - 50), flat.search(re) + 40)}…`)
  if (ctx.lang === 'ar' && !ARABIC_RE.test(txt)) ctx.bad(`${tag}: Arabic UI but no Arabic text in PDF`)
  if (ctx.lang === 'en' && /[؀-ۿ]{4,}/.test(txt.replace(/IBM Plex Sans Arabic/g, ''))) {
    const m = txt.match(/[^\n]*[؀-ۿ]{4,}[^\n]*/); ctx.bad(`${tag}: English document contains Arabic text: "${m?.[0].trim().slice(0, 80)}"`)
  }
  if (secret && flat.includes(secret)) ctx.bad(`${tag}: internal note "${secret}" printed on a client document`)
  if (!internalOk) {
    const bads = [/Unit cost/i, /Markup/i, /Cost subtotal/i, /\(cost\)/i, /Gross margin/i, /INTERNAL/, /بسعر التكلفة/, /الإضافة على التكلفة/, /هامش الربح/, /داخلي/]
    for (const re of bads) if (re.test(flat)) ctx.bad(`${tag}: client document shows internal label /${re.source}/: …${flat.slice(Math.max(0, flat.search(re) - 40), flat.search(re) + 40)}…`)
  }
  if (total) {
    const digits = total.replace(/[^\d.,]/g, '')
    if (!flat.includes(digits)) ctx.bad(`${tag}: on-screen total ${total} (${digits}) not found in PDF`)
    else ctx.ok(`${tag}: total ${total} found in PDF`)
  }
  return txt
}

/** Numbers in a money / figure string ("$12,345" → 12345; "≈ 1,234 SDG" → 1234). */
export const numOf = (s) => { const m = String(s ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).match(/-?[\d,]+(\.\d+)?/); return m ? Number(m[0].replace(/,/g, '')) : NaN }

/** Fill a NumberInput-like field and commit (blur). */
export async function fillNum(loc, v) { await loc.click(); await loc.fill(String(v)); await loc.press('Enter').catch(() => {}); await loc.blur().catch(() => {}) }

/** Confirm the open ConfirmDialog (last footer button). */
export async function confirmDialog(page) { await page.getByTestId('confirm-dialog').locator('button').last().click(); await page.waitForTimeout(250) }

/** Header navigation for the v0.2 header: projects | tools | prices | settings (phone: ⋯ menu). */
export async function go(page, where) {
  const direct = page.getByTestId(`nav-${where}`)
  if (await direct.isVisible().catch(() => false)) await direct.click()
  else { await page.getByTestId('nav-menu').click(); await page.getByTestId(`menu-${where}`).click() }
  await page.waitForTimeout(250)
}
/** Wizard: index of a step key for the current project (reads the stepper / sheet labels is fragile, so use MODE_STEPS). */
export const MODE_STEPS = {
  design: ['info', 'loads', 'site', 'design', 'results', 'bom', 'export'],
  size: ['design', 'site', 'results', 'bom', 'info', 'export'],
  items: ['bom', 'info', 'export'],
}
export async function goKey(page, mode, key) { const i = MODE_STEPS[mode].indexOf(key); if (i < 0) throw new Error(`no step ${key} in ${mode}`); await goStep(page, i) }
/** Grand total shown on the Pricing step (desktop side panel / phone totals card). */
export async function grandTotal(page) { return (await page.getByTestId('bom-grand').first().innerText()).trim() }
/** Open the pricing controls (phone: sheet) and run fn; closes the sheet after. */
export async function withPricing(ctx, fn) {
  const adj = ctx.page.getByTestId('bom-adjust')
  if (await adj.isVisible().catch(() => false)) { await adj.click(); await ctx.page.waitForTimeout(250); await fn(); await ctx.page.getByTestId('pricing-sheet').locator('button.btn-primary').last().click(); await ctx.page.waitForTimeout(200) }
  else await fn()
}
