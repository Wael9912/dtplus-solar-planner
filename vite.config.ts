import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Hosted at the site root on Cloudflare Pages (npm run deploy); set VITE_BASE to serve from a sub-path
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0') },
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE ?? '/',
  build: { chunkSizeWarningLimit: 1500 },
})
