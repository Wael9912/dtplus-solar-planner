import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from GitHub Pages at https://<user>.github.io/dtplus-solar-planner/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0') },
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE ?? '/dtplus-solar-planner/',
  build: { chunkSizeWarningLimit: 1500 },
})
