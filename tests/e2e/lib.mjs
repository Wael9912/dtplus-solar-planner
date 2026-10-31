// Shared helpers for the headless-browser QA scripts (plain node + playwright).
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

export const URL = 'http://localhost:5179/dtplus-solar-planner/'
export const SHOTS = '/private/tmp/claude-501/-Users-waelabdalla-PyCharmMiscProject/a199386a-3b48-4985-a705-6ec93c7f1733/scratchpad/e2e'
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
        if (r.right > cw + 1 && r.width > 0) { wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} right=${Math.round(r.right)}`); if (wide.length > 6) break }
      }
    }
    return { scrollWidth: w, clientWidth: cw, over: w > cw + 1, wide }
  })
}

export async function checkPage(page, label, { allowDash = true } = {}) {
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

/** Click a wizard step tab by index (0-6). */
export async function goStep(page, i) {
  await page.locator('ol.card li button').nth(i).click()
  await page.waitForTimeout(250)
}

export async function loadSamples(page) {
  await page.getByRole('button', { name: 'Load sample projects' }).click()
  await page.waitForTimeout(300)
}

export async function clearStorage(page) {
  await page.evaluate(() => localStorage.clear())
}

export function summary(label) {
  console.log(`\n==== ${label}: ${issues.length} issue(s) ====`)
  for (const i of issues) console.log(' -', i)
}
