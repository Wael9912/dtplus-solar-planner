import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { installWayFor } from '../src/pwa'
import { en } from '../src/i18n/en'
import { ar } from '../src/i18n/ar'

const root = new URL('../', import.meta.url)
const read = (f: string) => readFileSync(new URL(f, root))
/** Width × height from a PNG header. */
const pngSize = (f: string) => { const b = read(f); return [b.readUInt32BE(16), b.readUInt32BE(20)] }

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
}

describe('installable app', () => {
  it('picks the way to install for each browser', () => {
    const w = (ua: string, o: { installed?: boolean; prompt?: boolean; touchPoints?: number } = {}) => installWayFor({ installed: false, prompt: false, touchPoints: 0, ...o, ua })
    expect(w(UA.android, { installed: true, prompt: true })).toBe('installed')
    expect(w(UA.android, { prompt: true })).toBe('prompt')
    expect(w(UA.macChrome, { prompt: true })).toBe('prompt')
    expect(w(UA.iphone, { touchPoints: 5 })).toBe('ios')
    expect(w(UA.ipadDesktop, { touchPoints: 5 })).toBe('ios') // iPadOS asks for the desktop site
    expect(w(UA.macSafari)).toBe('mac')
    expect(w(UA.macChrome)).toBe('other') // Chrome before its install event, or with the app already installed
    expect(w(UA.firefox)).toBe('other')
    expect(w(UA.android)).toBe('other')
  })

  it('manifest: installable fields, icons on disk at their stated sizes, a maskable icon, shortcuts inside the scope', () => {
    const m = JSON.parse(read('public/manifest.webmanifest').toString())
    expect(m.name).toBe(en.appName)
    expect(m.short_name.length).toBeLessThanOrEqual(15) // home-screen label without truncation
    expect(m.display).toBe('standalone')
    expect(m.start_url.startsWith(m.scope)).toBe(true)
    const html = read('index.html').toString()
    expect(html).toContain(`<meta name="theme-color" content="${m.theme_color}"`)
    expect(html).toContain('rel="manifest" href="./manifest.webmanifest"')
    for (const i of m.icons) {
      expect(existsSync(new URL(`public/${i.src}`, root))).toBe(true)
      expect(pngSize(`public/${i.src}`).join('x')).toBe(i.sizes)
    }
    expect(m.icons.some((i: { purpose: string; sizes: string }) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true)
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true)
    expect(pngSize('public/apple-touch-icon.png')).toEqual([180, 180])
    for (const s of m.shortcuts) expect(s.url.startsWith(m.scope)).toBe(true)
  })

  it('service worker template: one build id and one file list to fill in; version.json never cached', () => {
    const sw = read('pwa/sw.js').toString()
    expect(sw.match(/'__BUILD__'/g)).toHaveLength(1)
    expect(sw.match(/__FILES__/g)).toHaveLength(1)
    expect(sw).toContain('version\\.json|sw\\.js')
    const headers = read('public/_headers').toString()
    expect(headers).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/)
    expect(headers).toMatch(/\/version\.json\n\s+Cache-Control: no-store/)
  })

  it('install steps in both languages', () => {
    for (const k of ['ios', 'mac', 'other'] as const) {
      expect(ar.install[k].steps).toHaveLength(en.install[k].steps.length)
      expect(en.install[k].steps.every((s) => s.trim().length > 10)).toBe(true)
    }
  })
})
