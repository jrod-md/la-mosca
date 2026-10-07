// One-off download of past seasons from API-Football (free plan: 2022-2024), for training.
// Reads API_FOOTBALL_KEY from the process environment only; the key is never printed.
// Usage: node scripts/run-ts.mjs scripts/fetch-history.ts [--season 2022 ...] [--overwrite]
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { ApiFootballError, createApiFootballClient } from '../src/football/apiFootball'
import type { JsonFetch, Match } from '../src/football/types'

const DIR = 'data/history'

const main = async () => {
  const key = process.env.API_FOOTBALL_KEY?.trim()
  if (!key) {
    console.error('API_FOOTBALL_KEY is missing. Nothing requested.')
    return 2
  }
  const args = process.argv.slice(2)
  const seasons = args.flatMap((arg, index) => arg === '--season' ? [Number(args[index + 1])] : [])
  const overwrite = args.includes('--overwrite')
  const client = createApiFootballClient(fetch as JsonFetch, key)
  mkdirSync(DIR, { recursive: true })
  for (const season of seasons.length ? seasons : [2022, 2023, 2024]) {
    if (!Number.isInteger(season)) throw new ApiFootballError('Invalid --season value')
    for (const [name, load] of [['lpf', client.lpfSeason], ['panama', client.panamaSeason]] as const) {
      const file = `${DIR}/${name}-${season}.json`
      if (existsSync(file) && !overwrite) {
        console.log(`skip ${file} (exists)`)
        continue
      }
      const matches: Match[] = await load(season)
      writeFileSync(`${file}.tmp`, JSON.stringify({ source: 'API-Football v3', season, fetchedAt: new Date().toISOString(), matches }, null, 1) + '\n')
      renameSync(`${file}.tmp`, file)
      console.log(`${file}: ${matches.length} matches (${matches.filter(match => match.status === 'finished').length} finished)`)
    }
  }
  console.log(`API-Football requests used: ${client.requests}`)
  return 0
}

main().then(code => { process.exitCode = code }, error => {
  // Only our own messages are printed; anything else could carry request details.
  console.error(`History fetch failed: ${error instanceof ApiFootballError ? error.message : 'network or parse error'}. Completed seasons were kept.`)
  process.exitCode = 1
})
