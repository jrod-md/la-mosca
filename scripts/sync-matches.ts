// Daily sync: LPF fixtures/results from TheSportsDB (free, no key); Panama's national team
// fixtures, results and every team's rating from eloratings.net (written to data/international/).
// Backfill: --from YYYY-MM-DD --to YYYY-MM-DD walks every day in the range, checkpointing as it goes.
// data/matches.json only receives fully fetched days; data/runs.json records every run.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createEloratingsClient } from '../src/football/eloratings'
import { createTheSportsDbClient } from '../src/football/theSportsDb'
import { mergeMatches, utcDay } from '../src/football/ledger'
import { appendRun, type RunEntry, type RunLog } from '../src/football/runLog'
import type { JsonFetch, Match, MatchLedger } from '../src/football/types'

const OUTPUT = 'data/matches.json'
const RUNS = 'data/runs.json'
const RATINGS = 'data/international/ratings.json'
const DAYS_BACK = 3
const DAYS_AHEAD = 7
const CHECKPOINT_DAYS = 30
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const readJson = <T>(file: string, fallback: T): T => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback
const fetchText = async (url: string) => {
  const response = await fetch(url, { headers: { 'user-agent': 'la-mosca (github.com/jrod-md/la-mosca)' } })
  if (!response.ok) throw new Error(`eloratings ${url.split('/').pop()} failed with HTTP ${response.status}`)
  return response.text()
}
const writeJson = (file: string, value: unknown) => {
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 1) + '\n')
  renameSync(`${file}.tmp`, file)
}
const label = (match: Match) => `${match.id} ${match.home.name} vs ${match.away.name}`
const argument = (name: string) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined }
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

const sync = async (now: Date, from: string, to: string, backfill: boolean): Promise<RunEntry> => {
  const client = createTheSportsDbClient(fetch as JsonFetch)
  const start = new Date(`${from}T00:00:00Z`)
  const total = daysBetween(from, to)
  if (!(total >= 0) || total > 800) throw new Error('Invalid date range (max 800 days)')
  const before = readJson<MatchLedger>(OUTPUT, { updatedAt: '', matches: [] })
  const wasFinished = new Set(before.matches.filter(match => match.status === 'finished').map(match => match.id))
  let matches = before.matches, added = 0, updated = 0, fetched = 0
  const unsettled = new Map<string, Match>()
  let pending: Match[] = []
  const flush = () => {
    const merged = mergeMatches(matches, pending)
    matches = merged.matches; added += merged.added; updated += merged.updated; pending = []
    writeJson(OUTPUT, { updatedAt: now.toISOString(), matches } satisfies MatchLedger)
  }
  for (let offset = 0; offset <= total; offset++) {
    const day = await client.lpfDay(utcDay(start, offset))
    pending.push(...day)
    fetched += day.length
    // Backfill respects the free tier (~30 requests/minute) and checkpoints so a failure keeps finished days.
    await pause(backfill ? 2100 : 300)
    if (backfill && offset % CHECKPOINT_DAYS === CHECKPOINT_DAYS - 1) {
      flush()
      console.log(`  checkpoint ${utcDay(start, offset)}: ${matches.length} matches in ledger`)
    }
  }
  const elo = createEloratingsClient(fetchText)
  const [names, ratings] = await Promise.all([elo.names(), elo.ratings()])
  if (Object.keys(ratings).length < 150) throw new Error('eloratings World.tsv looks incomplete')
  writeJson(RATINGS, { fetchedAt: now.toISOString(), source: 'World Football Elo Ratings (eloratings.net)', ratings })
  const panama = await elo.panamaMatches(names, utcDay(now, -45))
  pending.push(...panama)
  fetched += panama.length
  for (const match of pending) if (match.status === 'unknown') unsettled.set(match.id, match)
  flush()

  const newlyFinished = matches.filter(match => match.status === 'finished' && !wasFinished.has(match.id))
  console.log(`Synced ${fetched} matches (${added} new, ${updated} updated). Ledger: ${matches.length} matches in ${OUTPUT}.`)
  if (!backfill) for (const match of newlyFinished) console.log(`  final: ${label(match)} ${match.score?.home}-${match.score?.away}`)
  for (const match of unsettled.values()) console.log(`  unsettled status '${match.rawStatus}': ${label(match)}`)
  return { at: now.toISOString(), job: backfill ? 'backfill-matches' : 'sync-matches', ok: true, window: { from, to }, fetched, added, updated,
    newlyFinished: backfill ? [] : newlyFinished.map(match => match.id), unsettled: [...unsettled.keys()] }
}

const main = async () => {
  const now = new Date()
  const from = argument('--from'), to = argument('--to')
  const backfill = Boolean(from || to)
  let entry: RunEntry
  try {
    entry = await sync(now, from ?? utcDay(now, -DAYS_BACK), to ?? utcDay(now, DAYS_AHEAD), backfill)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error(`Sync failed: ${message}. Completed checkpoints were kept.`)
    entry = { at: now.toISOString(), job: backfill ? 'backfill-matches' : 'sync-matches', ok: false, window: from || to ? { from: from ?? '', to: to ?? '' } : undefined, error: message }
    process.exitCode = 1
  }
  writeJson(RUNS, appendRun(readJson<RunLog>(RUNS, { runs: [] }), entry))
}

main()
