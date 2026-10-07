import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { basename } from 'node:path'

// Bundles a TypeScript script with Vite's esbuild and runs it with the remaining arguments.
const [entry, ...args] = process.argv.slice(2)
if (!entry) {
  console.error('Usage: node scripts/run-ts.mjs <script.ts> [...args]')
  process.exit(2)
}
mkdirSync('node_modules/.tmp', { recursive: true })
const outfile = `node_modules/.tmp/${basename(entry, '.ts')}.cjs`
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'warning' })
const result = spawnSync(process.execPath, [outfile, ...args], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
