// Scenario 4: company settings + logo upload, header shows name, proposal PDF still downloads.
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'
import { launch, DESKTOP, MOBILE, DL, SHOTS, shot, checkPage, reportErrors, gotoApp, goStep, loadSamples, clearStorage, issue, pass, summary, nav, openCard, exportDoc } from './lib.mjs'
function png(w, h) { // minimal valid RGBA PNG (teal square)
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 0xff] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) raw.set([15, 118, 110, 255], y * (w * 4 + 1) + 1 + x * 4) }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const logo = path.join(SHOTS, 'logo.png'); fs.writeFileSync(logo, png(120, 60))
for (const [vpName, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
  const { browser, page, errors } = await launch(vp)
  await gotoApp(page); await clearStorage(page); await page.reload({ waitUntil: 'networkidle' })
  await nav(page, 'settings')
  await page.getByLabel('Company name').fill('QA Solar Co')
  await page.getByLabel('Phone').fill('+249 100 000')
  await page.locator('input[type=file][accept^="image"]').setInputFiles(logo); await page.waitForTimeout(400)
  if (!(await page.getByRole('img', { name: 'Logo' }).first().isVisible())) issue(`${vpName}: logo preview not shown`); else pass(`${vpName}: logo preview shown`)
  const hdr = await page.locator('header').innerText()
  if (!/QA Solar Co/.test(hdr)) issue(`${vpName}: header does not show company name`); else pass(`${vpName}: header shows company name`)
  await checkPage(page, `${vpName} settings`); await shot(page, `04-${vpName}-settings`); reportErrors(errors, `${vpName} settings`)
  await nav(page, 'projects'); await loadSamples(page)
  await openCard(page, 0); await goStep(page, 6)
  const dlp = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
  await exportDoc(page, 0)
  const dl = await dlp
  if (!dl) issue(`${vpName}: proposal PDF with logo did not download`)
  else { const out = path.join(DL, `${vpName}-logo-${dl.suggestedFilename()}`); await dl.saveAs(out); const b = fs.readFileSync(out); if (b.subarray(0, 5).toString() !== '%PDF-' || b.length < 20480) issue(`${vpName}: logo PDF invalid (${b.length} bytes)`); else pass(`${vpName}: logo PDF ${b.length} bytes`) }
  await page.waitForTimeout(400); reportErrors(errors, `${vpName} logo pdf`)
  // persistence of settings
  await page.reload({ waitUntil: 'networkidle' }); await nav(page, 'projects') // phones show the project name (not the brand) inside a project
  if (!/QA Solar Co/.test(await page.locator('header').innerText())) issue(`${vpName}: company name lost after reload`); else pass(`${vpName}: settings persisted`)
  await browser.close()
}
summary('04-settings')
