import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  // three.js (~560 kB) is its own lazily loaded chunk; the page text renders without it.
  build: { chunkSizeWarningLimit: 600 },
})
