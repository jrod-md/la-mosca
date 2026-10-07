// Daily life of the fly, run by the cron after sync-matches:
// 1. settle open bets whose match is final (in kickoff order), learning from each;
// 2. decide on LPF matches kicking off in the next days, freezing the price at decision time.
// Every decision, including declining to bet, is recorded once and never revisited.
// Also publishes data/fly/upcoming.json (next 7 days, priced) for the site.
// --upcoming-only refreshes that file without settling or betting.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { buildCircuit } from '../src/brain/circuit'
import { Fly, fixtureOf, type BetBook, type FlyState } from '../src/brain/fly'
import { mergeMatches } from '../src/football/ledger'
import { appendRun, type RunLog } from '../src/football/runLog'
import { teamKey, teamName } from '../src/football/teams'
import type { Match, MatchLedger } from '../src/football/types'
import { predict, type OddsModelParams } from '../src/odds/model'
import { priceMarkets } from '../src/odds/odds'
import { priceUpcoming, ratingsAt } from '../src/odds/upcoming'

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
  return { params, ledger, all: mergeMatches(history, ledger).matches }
}

const publishUpcoming = (now: Date) => {
  const { params, all } = load()
  const upcoming = priceUpcoming(all, ratingsAt(all, params, now), params, now)
  write('data/fly/upcoming.json', { generatedAt: now.toISOString(), matches: upcoming })
  console.log(`Published ${upcoming.length} upcoming matches.`)
}

const run = (now: Date) => {
  if (!existsSync('data/fly/state.json')) throw new Error('No fly state; run raise-fly first')
  const saved = read<{ state: FlyState; lastMatch?: string }>('data/fly/state.json')
  const fly = new Fly(buildCircuit(read('src/data/generated/malecns_mushroom_body.json')), saved.state)
  const book = read<BetBook>('data/fly/bets.json')
  const passes = book.passes ?? []
  const { params, ledger, all } = load()
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
    console.log(`settled ${teamName(result.home)} vs ${teamName(result.away)} ${result.result ?? 'void'}: ${result.selection} @${result.odds} -> ${result.status}${result.bankrupt ? ' (BANKRUPT, recapitalized)' : ''}`)
  }

  // 2. Price with everything settled so far, then decide on upcoming LPF fixtures.
  const lpf = all.filter(match => match.competition === 'lpf')
  const elo = ratingsAt(all, params, now)
  const decided = new Set([...book.bets.map(bet => bet.matchId), ...passes.map(pass => pass.matchId)])
  const earliest = now.getTime() + MIN_LEAD_MINUTES * 60_000, latest = now.getTime() + LOOKAHEAD_HOURS * 3_600_000
  const upcoming = lpf.filter(match => match.status === 'scheduled' && !decided.has(match.id)
    && Date.parse(match.kickoff) >= earliest && Date.parse(match.kickoff) <= latest)
  let placed = 0
  for (const match of upcoming) {
    const odds = priceMarkets(predict(elo.prepare(match), params))
    const decision = fly.decide(fixtureOf(match), odds)
    const bet = fly.place(match, decision, 'live', now.toISOString())
    if (bet) {
      book.bets.push(bet)
      placed++
      console.log(`bet ${teamName(bet.home)} vs ${teamName(bet.away)}: ${bet.selection} @${bet.odds}, B/.${bet.stake}${bet.dared ? ' (dared)' : ''}${bet.tilted ? ' (tilted)' : ''}`)
    } else {
      const home = teamKey(match.home), away = teamKey(match.away)
      passes.push({ matchId: match.id, decidedAt: now.toISOString(), kickoff: match.kickoff, home, away, options: decision.options })
      console.log(`passed on ${teamName(home)} vs ${teamName(away)}`)
    }
  }

  write('data/fly/bets.json', { bets: book.bets, passes } satisfies BetBook)
  write('data/fly/state.json', { ...saved, updatedAt: now.toISOString(), phase: 'live', state: fly.state })
  publishUpcoming(now)
  console.log(`Bankroll B/.${fly.state.bankroll} | open ${book.bets.filter(bet => bet.status === 'open').length} | boldness ${fly.state.boldness}`)
  return { settled, placed, passed: upcoming.length - placed }
}

const now = new Date()
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
