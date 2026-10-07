// Daily sync: LPF fixtures/results and Panama national team from TheSportsDB (free, no key).
// data/matches.json is written only after every request succeeded; data/runs.json records every run.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createTheSportsDbClient } from '../src/football/theSportsDb'
import { mergeMatches, utcDay } from '../src/football/ledger'
import { appendRun, type RunEntry, type RunLog } from '../src/football/runLog'
import type { JsonFetch, Match, MatchLedger } from '../src/football/types'

const OUTPUT = 'data/matches.json'
const RUNS = 'data/runs.json'
const DAYS_BACK = 3
const DAYS_AHEAD = 7
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const readJson = <T>(file: string, fallback: T): T => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback
const writeJson = (file: string, value: unknown) => {
  mkdirSync('data', { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 1) + '\n')
  renameSync(`${file}.tmp`, file)
}
const label = (match: Match) => `${match.id} ${match.home.name} vs ${match.away.name}`

const sync = async (now: Date): Promise<RunEntry> => {
  const client = createTheSportsDbClient(fetch as JsonFetch)
  const window = { from: utcDay(now, -DAYS_BACK), to: utcDay(now, DAYS_AHEAD) }
  const incoming: Match[] = []
  for (let offset = -DAYS_BACK; offset <= DAYS_AHEAD; offset++) {
    incoming.push(...await client.lpfDay(utcDay(now, offset)))
    await pause(300) // Free tier allows ~30 requests/minute.
  }
  incoming.push(...await client.panamaRecent())

  const ledger = readJson<MatchLedger>(OUTPUT, { updatedAt: '', matches: [] })
  const wasFinished = new Set(ledger.matches.filter(match => match.status === 'finished').map(match => match.id))
  const { matches, added, updated } = mergeMatches(ledger.matches, incoming)
  writeJson(OUTPUT, { updatedAt: now.toISOString(), matches } satisfies MatchLedger)

  const newlyFinished = matches.filter(match => match.status === 'finished' && !wasFinished.has(match.id))
  const unsettled = [...new Map(incoming.filter(match => match.status === 'unknown').map(match => [match.id, match])).values()]
  console.log(`Synced ${incoming.length} matches (${added} new, ${updated} updated). Ledger: ${matches.length} matches in ${OUTPUT}.`)
  for (const match of newlyFinished) console.log(`  final: ${label(match)} ${match.score?.home}-${match.score?.away}`)
  for (const match of unsettled) console.log(`  unsettled status '${match.rawStatus}': ${label(match)}`)
  return { at: now.toISOString(), job: 'sync-matches', ok: true, window, fetched: incoming.length, added, updated,
    newlyFinished: newlyFinished.map(match => match.id), unsettled: unsettled.map(match => match.id) }
}

const main = async () => {
  const now = new Date()
  let entry: RunEntry
  try {
    entry = await sync(now)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error(`Sync failed: ${message}. Ledger unchanged.`)
    entry = { at: now.toISOString(), job: 'sync-matches', ok: false, error: message }
    process.exitCode = 1
  }
  writeJson(RUNS, appendRun(readJson<RunLog>(RUNS, { runs: [] }), entry))
}

main()
