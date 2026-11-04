import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const version: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
// Changes on every build, so an open copy of the app can tell a newly published build from its own (src/updates.ts)
const build = `${version}+${Date.now().toString(36)}`

/** dist/version.json — what open copies of the app fetch to learn that a new version was published. */
const versionFile = (): Plugin => ({
  name: 'version-file', apply: 'build',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, build }) }) },
})

/** Every file of a build folder, relative ('assets/index-x.js'). */
const listFiles = (dir: string, sub = ''): string[] => readdirSync(path.join(dir, sub)).flatMap((f) =>
  statSync(path.join(dir, sub, f)).isDirectory() ? listFiles(dir, path.join(sub, f)) : [path.join(sub, f).split(path.sep).join('/')])
/**
 * dist/sw.js — the installable app's service worker (pwa/sw.js) with this build's id and the files it caches for offline use.
 * index.html is cached as the root page by the worker itself; version.json, _headers and the worker are never cached.
 */
const serviceWorker = (): Plugin => ({
  name: 'service-worker', apply: 'build',
  writeBundle({ dir }) {
    if (!dir) return
    const files = listFiles(dir).filter((f) => !/^(index\.html|version\.json|sw\.js|_headers|_redirects)$/.test(f) && !f.endsWith('.map'))
    const src = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8').replace("'__BUILD__'", JSON.stringify(build)).replace('__FILES__', JSON.stringify(files))
    writeFileSync(path.join(dir, 'sw.js'), src)
  },
})

// Hosted at the site root on Cloudflare Pages (npm run deploy); set VITE_BASE to serve from a sub-path
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify(build) },
  plugins: [react(), tailwindcss(), versionFile(), serviceWorker()],
  base: process.env.VITE_BASE ?? '/',
  build: { chunkSizeWarningLimit: 1500 },
})
