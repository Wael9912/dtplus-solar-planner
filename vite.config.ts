import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves it at /dtplus-solar-planner/; Cloudflare Pages builds with VITE_BASE=/ (npm run deploy:cf)
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0') },
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE ?? '/dtplus-solar-planner/',
  build: { chunkSizeWarningLimit: 1500 },
})
