import { readFileSync } from 'node:fs'
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

// Hosted at the site root on Cloudflare Pages (npm run deploy); set VITE_BASE to serve from a sub-path
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify(build) },
  plugins: [react(), tailwindcss(), versionFile()],
  base: process.env.VITE_BASE ?? '/',
  build: { chunkSizeWarningLimit: 1500 },
})
