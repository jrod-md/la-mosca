// Daily life of the fly, run by the cron after sync-matches:
// 1. settle open bets whose match is final (in kickoff order), learning from each;
// 2. decide on LPF matches kicking off in the next days, freezing the price at decision time.
// Every decision, including declining to bet, is recorded once and never revisited.
// Also publishes data/fly/upcoming.json (next 7 days, priced) for the site.
// --upcoming-only refreshes that file without settling or betting.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { buildCircuit } from '../src/brain/circuit'
import { Fly, fixtureOf, type BetBook, type FlyState } from '../src/brain/fly'
import { recordSnapshot, snapshot, type TasteLog } from '../src/brain/tastes'
import { mergeMatches } from '../src/football/ledger'
import { appendRun, type RunLog } from '../src/football/runLog'
import { nationalCode } from '../src/football/eloratings'
import { displayName, teamKey } from '../src/football/teams'
import type { Match, MatchLedger } from '../src/football/types'
import { predict, type OddsModelParams } from '../src/odds/model'
import { priceMarkets } from '../src/odds/odds'
import { priceInternational, ratingGap, type InternationalParams } from '../src/odds/international'
import { priceUpcoming, ratingsAt, type InternationalPricer } from '../src/odds/upcoming'

const LOOKAHEAD_HOURS = 72
const MIN_LEAD_MINUTES = 30

const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'))
const write = (file: string, value: unknown) => {
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 1) + '\n')
  renameSync(`${file}.tmp`, file)
}

const load = () => {
  const { params } = read<{ params: OddsModelParams }>('data/model/odds-model.json')
  const history = readdirSync('data/history').filter(file => file.startsWith('lpf-')).flatMap(file => read<{ matches: Match[] }>(`data/history/${file}`).matches)
  const ledger = read<MatchLedger>('data/matches.json').matches
  return { params, ledger, all: mergeMatches(history, ledger).matches, international: internationalPricer() }
}

// National team prices from today's eloratings ratings and the Panama-fitted goal model.
const internationalPricer = (): InternationalPricer => {
  if (!existsSync('data/international/ratings.json') || !existsSync('data/model/international-model.json')) return () => null
  const { ratings } = read<{ ratings: Record<string, number> }>('data/international/ratings.json')
  const { params } = read<{ params: InternationalParams }>('data/model/international-model.json')
  return match => {
    const home = nationalCode(match.home), away = nationalCode(match.away)
    if (!home || !away || ratings[home] === undefined || ratings[away] === undefined) return null
    return priceInternational(ratingGap(ratings[home], ratings[away], home, away, match.venueCountry ?? home), params)
  }
}

// Last moment the fly may decide. National fixtures only have a date, so it decides the day before.
const decisionDeadline = (match: Match) => match.kickoffTimeKnown === false
  ? Date.parse(`${match.kickoff.slice(0, 10)}T00:00:00Z`)
  : Date.parse(match.kickoff) - MIN_LEAD_MINUTES * 60_000

const publishUpcoming = (now: Date) => {
  const { params, all, international } = load()
  const upcoming = priceUpcoming(all, ratingsAt(all, params, now), params, now, international)
  write('data/fly/upcoming.json', { generatedAt: now.toISOString(), matches: upcoming })
  console.log(`Published ${upcoming.length} upcoming matches.`)
}

const run = (now: Date) => {
  if (!existsSync('data/fly/state.json')) throw new Error('No fly state; run raise-fly first')
  const saved = read<{ state: FlyState; lastMatch?: string }>('data/fly/state.json')
  const fly = new Fly(buildCircuit(read('src/data/generated/malecns_mushroom_body.json')), saved.state)
  const book = read<BetBook>('data/fly/bets.json')
  const passes = book.passes ?? []
  const { params, ledger, all, international } = load()
  const byId = new Map(ledger.map(match => [match.id, match]))

  // 1. Settle, oldest kickoff first, so learning happens in real order.
  let settled = 0
  const open = book.bets.filter(bet => bet.status === 'open').sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  for (const bet of open) {
    const match = byId.get(bet.matchId)
    if (!match || (match.status !== 'finished' && match.status !== 'void')) continue
    const result = fly.settle(bet, match)
    book.bets[book.bets.indexOf(bet)] = result
    settled++
    console.log(`settled ${result.homeName ?? result.home} vs ${result.awayName ?? result.away} ${result.result ?? 'void'}: ${result.selection} @${result.odds} -> ${result.status}${result.bankrupt ? ' (BANKRUPT, recapitalized)' : ''}`)
  }

  // 2. Price with everything settled so far, then decide on upcoming league and national fixtures.
  const elo = ratingsAt(all, params, now)
  const decided = new Set([...book.bets.map(bet => bet.matchId), ...passes.map(pass => pass.matchId)])
  const latest = now.getTime() + LOOKAHEAD_HOURS * 3_600_000
  const upcoming = all.filter(match => match.status === 'scheduled' && !decided.has(match.id)
    && now.getTime() < decisionDeadline(match) && Date.parse(match.kickoff) <= latest)
  let placed = 0, unpriced = 0
  for (const match of upcoming) {
    const markets = match.competition === 'lpf' ? predict(elo.prepare(match), params) : international(match)
    if (!markets) {
      unpriced++
      console.log(`no price for ${displayName(match.home)} vs ${displayName(match.away)}; skipped`)
      continue
    }
    const odds = priceMarkets(markets)
    const decision = fly.decide(fixtureOf(match), odds)
    const bet = fly.place(match, decision, 'live', now.toISOString())
    if (bet) {
      book.bets.push(bet)
      placed++
      console.log(`bet ${bet.homeName} vs ${bet.awayName}: ${bet.selection} @${bet.odds}, B/.${bet.stake}${bet.dared ? ' (dared)' : ''}${bet.tilted ? ' (tilted)' : ''}`)
    } else {
      const homeName = displayName(match.home), awayName = displayName(match.away)
      passes.push({ matchId: match.id, decidedAt: now.toISOString(), kickoff: match.kickoff, home: teamKey(match.home), away: teamKey(match.away), homeName, awayName, options: decision.options })
      console.log(`passed on ${homeName} vs ${awayName}`)
    }
  }

  write('data/fly/bets.json', { bets: book.bets, passes } satisfies BetBook)
  write('data/fly/state.json', { ...saved, updatedAt: now.toISOString(), phase: 'live', state: fly.state })
  const tastes = existsSync('data/fly/tastes.json') ? read<TasteLog>('data/fly/tastes.json') : { innate: snapshot(fly), history: [] }
  write('data/fly/tastes.json', recordSnapshot(tastes, now.toISOString().slice(0, 10), snapshot(fly)))
  publishUpcoming(now)
  console.log(`Bankroll B/.${fly.state.bankroll} | open ${book.bets.filter(bet => bet.status === 'open').length} | boldness ${fly.state.boldness}`)
  return { settled, placed, passed: upcoming.length - placed - unpriced }
}

// FLY_NOW (ISO date) overrides the clock for dry runs on a copy of data/; never set it in the workflow.
const now = process.env.FLY_NOW ? new Date(process.env.FLY_NOW) : new Date()
if (process.argv.includes('--upcoming-only')) {
  publishUpcoming(now)
  process.exit(0)
}
const runs = existsSync('data/runs.json') ? read<RunLog>('data/runs.json') : { runs: [] }
try {
  const summary = run(now)
  write('data/runs.json', appendRun(runs, { at: now.toISOString(), job: 'fly-daily', ok: true, ...summary }))
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error'
  console.error(`Fly daily failed: ${message}. Fly state unchanged.`)
  write('data/runs.json', appendRun(runs, { at: now.toISOString(), job: 'fly-daily', ok: false, error: message }))
  process.exitCode = 1
}
