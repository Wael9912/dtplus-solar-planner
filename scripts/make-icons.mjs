// App icons for the installed app (manifest + iPhone home screen), drawn from the favicon motif with headless Chromium.
// Run after changing the logo: `node scripts/make-icons.mjs` → public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')
// Sun over a solar panel (same drawing as public/favicon.svg), 64 × 64 units
const MOTIF = `<circle cx="32" cy="26" r="11" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="3" stroke-linecap="round"><line x1="32" y1="6" x2="32" y2="10"/><line x1="14" y1="26" x2="18" y2="26"/><line x1="46" y1="26" x2="50" y2="26"/><line x1="19.3" y1="13.3" x2="22.1" y2="16.1"/><line x1="44.7" y1="13.3" x2="41.9" y2="16.1"/></g><rect x="10" y="42" width="44" height="14" rx="2" fill="#e0f2fe"/><g stroke="#1c407c" stroke-width="1.5"><line x1="21" y1="42" x2="21" y2="56"/><line x1="32" y1="42" x2="32" y2="56"/><line x1="43" y1="42" x2="43" y2="56"/><line x1="10" y1="49" x2="54" y2="49"/></g>`
// rounded: transparent corners (purpose "any"); full: edge-to-edge background, motif shrunk into the platform's safe zone
const svg = ({ rounded, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${rounded ? '<rect width="64" height="64" rx="14" fill="#1c407c"/>' : '<rect width="64" height="64" fill="#1c407c"/>'}<g transform="translate(32 31) scale(${scale}) translate(-32 -31)">${MOTIF}</g></svg>`
const ICONS = [
  ['icon-192.png', 192, { rounded: true, scale: 1 }],
  ['icon-512.png', 512, { rounded: true, scale: 1 }],
  ['icon-maskable-512.png', 512, { rounded: false, scale: 0.7 }], // Android masks to a circle / squircle: keep the motif inside the central 80 %
  ['apple-touch-icon.png', 180, { rounded: false, scale: 0.8 }], // iOS rounds the corners itself and shows transparency as black
]
const browser = await chromium.launch()
for (const [name, size, o] of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(o)}`)
  await page.locator('svg').screenshot({ path: path.join(out, name), omitBackground: true })
  await page.close()
  console.log('wrote', name)
}
await browser.close()
