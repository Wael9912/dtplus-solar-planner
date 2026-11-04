// Scenario i — engineering tools: each tool with typical values and with garbage (empty, 0, negative, letters, huge) —
// no NaN / crash; "Start a project with this" from the string checker opens a matching full design.
import { scenario, newVia, fillNum, textProblems, numOf, goKey } from './lib.mjs'

const TYPICAL = {
  strings: [['st-count', 12], ['st-units', 1]],
  battery: [['bt-load', 2000], ['bt-hours', 6]],
  cable: [['cb-current', 63], ['cb-voltage', 230], ['cb-length', 25]],
  generator: [['gn-running', 6], ['gn-motor', 2.2]],
}
const OUT = { strings: ['st-range', 'st-layout'], battery: ['bt-modules', 'bt-backup', 'bt-fuse', 'bt-cable'], cable: ['cb-size', 'cb-device', 'cb-drop-out'], generator: ['gn-kva', 'gn-inv-kw'] }
const GARBAGE = ['', '0', '-5', 'abc', '1e9', '99999999', '٣٫٥']

await scenario('18-tools', async (c) => {
  const { page } = c
  await newVia(page, 'tools'); await page.waitForTimeout(300)
  if (!/#\/tools$/.test(page.url())) c.bad(`tools hash ${page.url()}`)
  await c.check('tools list', { shotName: 'list' })
  for (const id of ['strings', 'battery', 'cable', 'generator']) {
    await page.getByTestId(`tool-card-${id}`).click(); await page.waitForTimeout(350)
    const frame = page.getByTestId(`tool-${id}`)
    if (!(await frame.isVisible())) { c.bad(`tool ${id} did not open`); continue }
    await c.check(`${id}: defaults`, { shotName: `${id}-defaults` })
    if (id === 'cable') { await frame.getByTestId('cb-circuit-ac1').click(); await frame.getByTestId('cb-by-current').click(); await page.waitForTimeout(150) }
    for (const [tid, v] of TYPICAL[id]) { const f = frame.getByTestId(tid); if (await f.count()) await fillNum(f, v); else c.warn(`${id}: field ${tid} missing`) }
    await page.waitForTimeout(250)
    const outs = {}
    for (const o of OUT[id]) outs[o] = (await frame.getByTestId(o).innerText().catch(() => '(none)')).trim()
    c.ok(`${id} typical → ${JSON.stringify(outs)}`)
    if (Object.values(outs).some((x) => x === '–' || x === '(none)')) c.bad(`${id}: typical values give empty results ${JSON.stringify(outs)}`)
    if (await frame.getByTestId('tool-invalid').isVisible().catch(() => false)) c.bad(`${id}: typical values flagged invalid`)
    if (id === 'cable' && !(numOf(outs['cb-size']) >= 10 && numOf(outs['cb-size']) <= 25)) c.bad(`cable: 63 A / 230 V / 25 m → ${outs['cb-size']} (expected 10–25 mm²)`)
    if (id === 'generator' && !(numOf(outs['gn-kva']) >= 9 && numOf(outs['gn-kva']) <= 20)) c.bad(`generator: 6 kW + 2.2 kW DOL motor → ${outs['gn-kva']} kVA (expected ≈ 10–20)`)
    await c.check(`${id}: typical`, { shotName: `${id}-typical` })
    // copy
    await frame.getByTestId('tool-copy').click(); await page.waitForTimeout(250)
    if (!c.phone) {
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
      if (!clip || /NaN|undefined|Infinity/.test(clip)) c.bad(`${id}: copied text "${clip.slice(0, 120)}"`)
    }
    if (id === 'strings') {
      const start = frame.getByTestId('tool-start')
      if (await start.isDisabled()) c.bad('strings: "Start a project" disabled with valid typical values')
      else {
        await start.click(); await page.waitForTimeout(500)
        if (!/#\/p\/[^/]+\/1$/.test(page.url())) c.bad(`strings start → ${page.url()}`)
        await c.check('strings → project (client step)', { shotName: 'start-project' })
        await goKey(page, 'design', 'design')
        const eq = (await page.getByTestId('eq-panel').innerText()).replace(/\s+/g, ' ') + ' | ' + (await page.getByTestId('eq-inverter').innerText()).replace(/\s+/g, ' ')
        c.ok(`project from tool: ${eq}`)
        if (!/\b12 ×/.test(eq)) c.bad(`project from string tool does not carry 12 panels: ${eq}`)
        await goKey(page, 'design', 'results')
        await c.check('strings → project results', { shotName: 'start-results' })
        const err = await page.locator('[data-testid=checks] li').allInnerTexts().catch(() => [])
        if (err.length) c.warn(`project started from the string tool has checks: ${err.map((x) => x.replace(/\s+/g, ' ').slice(0, 80)).join(' | ')}`)
        await newVia(page, 'tools'); await page.waitForTimeout(250); await page.getByTestId('tool-card-strings').click(); await page.waitForTimeout(300)
      }
    }
    // garbage in every numeric field
    const inputs = frame.locator('input[inputmode=decimal]:not([disabled])')
    const n = await inputs.count()
    let worst = []
    for (let i = 0; i < n; i++) {
      for (const g of GARBAGE) {
        const f = inputs.nth(i)
        if (!(await f.isVisible().catch(() => false))) break
        await f.click({ timeout: 3000 }).catch(() => {}); await f.fill(g).catch(() => {}); await f.blur().catch(() => {})
        const tp = await textProblems(page)
        if (tp.length) worst.push(`input#${i}="${g}": ${tp[0]}`)
      }
    }
    if (worst.length) c.bad(`${id}: garbage input shows ${worst.slice(0, 4).join(' ; ')} (+${Math.max(0, worst.length - 4)})`)
    await c.check(`${id}: after garbage`, { shotName: `${id}-garbage`, taps: false })
    const invalid = await frame.getByTestId('tool-invalid').isVisible().catch(() => false)
    c.ok(`${id}: ${n} fields × ${GARBAGE.length} garbage values; invalid hint shown=${invalid}`)
    await frame.getByTestId('tool-back').click(); await page.waitForTimeout(250)
  }
})
