import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// When a Cloudflare Pages project sets REDIRECT_TO (the old metrofly project does), the build
// ships a _redirects file that sends every path to the new address instead of serving the site.
const redirectTo = (target: string | undefined): Plugin => ({
  name: 'redirect-to',
  apply: 'build',
  closeBundle() {
    if (!target) return
    if (!/^https:\/\/[\w.-]+$/.test(target)) throw new Error('REDIRECT_TO must be an https origin, like https://la-mosca.pages.dev')
    writeFileSync(resolve('dist/_redirects'), `/* ${target}/:splat 301\n`)
  },
})

export default defineConfig({
  plugins: [react(), redirectTo(process.env.REDIRECT_TO?.trim())],
  server: { host: '127.0.0.1', port: 5173 },
  // three.js (~560 kB) is its own lazily loaded chunk; the page text renders without it.
  build: { chunkSizeWarningLimit: 600 },
})
