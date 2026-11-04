// Service worker of the installable app. vite.config.ts copies this file to dist/sw.js at build time and fills in BUILD and
// FILES (every file of that build), so each published build installs a new worker. Not used by the dev server.
// - Install: cache every file of the build (the app, the PDF / Excel code, fonts, icons) so the whole app works offline.
// - Opening the app: the network when it answers within a few seconds (a published update shows at once), else the cached copy.
// - version.json and sw.js always go to the network: open copies keep learning about new builds (src/updates.ts).
// - A new worker takes over straight away and deletes the previous build's cache; Google Fonts are kept in their own cache.
const BUILD = '__BUILD__'
const FILES = __FILES__
const CACHE = `dtplus-${BUILD}`
const FONTS = 'dtplus-fonts'
const SHELL = new URL('./', self.location).href
const NAV_TIMEOUT_MS = 4000

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE)
    await c.addAll(FILES.map((f) => new Request(new URL(f, self.location).href, { cache: 'reload' })))
    // The page at the root (index.html): hosts may redirect /index.html, and a redirected response cannot answer a page load
    const res = await fetch(SHELL, { cache: 'reload' })
    if (!res.ok) throw new Error(`app page ${res.status}`)
    await c.put(SHELL, res.redirected ? new Response(await res.blob(), { status: 200, headers: res.headers }) : res)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('dtplus-') && k !== CACHE && k !== FONTS) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (req.mode === 'navigate') return e.respondWith(openApp(req))
  if (url.origin === self.location.origin) {
    if (/\/(version\.json|sw\.js)$/.test(url.pathname)) return
    return e.respondWith(fromCache(req))
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(font(req))
})

async function openApp(req) {
  const cached = () => caches.match(SHELL, { cacheName: CACHE })
  const net = fetch(req)
  net.catch(() => {}) // when the cached copy answered first, a later network failure is expected
  try {
    const res = await Promise.race([net, new Promise((r) => setTimeout(r, NAV_TIMEOUT_MS))])
    if (res) return res
    return (await cached()) ?? (await net) // slow connection: the cached copy; first visit: keep waiting
  } catch {
    return (await cached()) ?? Response.error() // offline
  }
}

async function fromCache(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  // A file this build did not list (none expected); never keep a host's "page not found" HTML under a script's name
  if (res.ok && res.type === 'basic' && !/text\/html/.test(res.headers.get('content-type') ?? '')) {
    const c = await caches.open(CACHE); await c.put(req, res.clone())
  }
  return res
}

// Font files never change (cache first); the stylesheet is refreshed when online and served from the cache offline
async function font(req) {
  const c = await caches.open(FONTS)
  const hit = await c.match(req)
  if (hit && new URL(req.url).hostname === 'fonts.gstatic.com') return hit
  try {
    const res = await fetch(req)
    if (res.ok || res.type === 'opaque') await c.put(req, res.clone())
    return res
  } catch (err) {
    if (hit) return hit
    throw err
  }
}
