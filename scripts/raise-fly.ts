// "Infancy": a newborn fly relives every settled LPF match in order, betting against the
// walk-forward bookmaker before each result is known, then learning from it.
// Writes data/fly/state.json, data/fly/bets.json and prints a summary.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { buildCircuit } from '../src/brain/circuit'
import { Fly, FLY_PARAMS, fixtureOf, type Bet } from '../src/brain/fly'
import { mergeMatches } from '../src/football/ledger'
import { LPF_TEAMS, teamName } from '../src/football/teams'
import type { Match, MatchLedger } from '../src/football/types'
import { EloBook } from '../src/odds/elo'
import { predict, type OddsModelParams } from '../src/odds/model'
import { priceMarkets } from '../src/odds/odds'

const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'))
const write = (file: string, value: unknown) => {
  mkdirSync('data/fly', { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 1) + '\n')
  renameSync(`${file}.tmp`, file)
}

// Raising again restarts the fly from birth; never silently erase a public live record.
if (existsSync('data/fly/bets.json') && read<{ bets: Bet[] }>('data/fly/bets.json').bets.some(bet => bet.phase === 'live') && !process.argv.includes('--force')) {
  console.error('The fly already has live bets. Raising it again would erase them; pass --force only if that is intended.')
  process.exit(1)
}

const circuit = buildCircuit(read('src/data/generated/malecns_mushroom_body.json'))
const { params } = read<{ params: OddsModelParams }>('data/model/odds-model.json')
const history = readdirSync('data/history').filter(file => file.startsWith('lpf-')).flatMap(file => read<{ matches: Match[] }>(`data/history/${file}`).matches)
const ledger = existsSync('data/matches.json') ? read<MatchLedger>('data/matches.json').matches.filter(match => match.competition === 'lpf') : []
const matches = mergeMatches(history, ledger).matches.filter(match => match.status === 'finished')

const fly = Fly.newborn(circuit)
const innate = LPF_TEAMS.map(team => ({ team: team.id, affinity: fly.teamAffinity(team.id) }))
const book = new EloBook(params.elo)
const bets: Bet[] = []
let skipped = 0
for (const match of matches) {
  const odds = priceMarkets(predict(book.prepare(match), params))
  const decision = fly.decide(fixtureOf(match), odds)
  const bet = fly.place(match, decision, 'infancy', match.kickoff)
  if (bet) bets.push(fly.settle(bet, match))
  else skipped++
  book.update(match)
}
const learned = LPF_TEAMS.map(team => ({ team: team.id, affinity: fly.teamAffinity(team.id) }))
const staked = bets.reduce((sum, bet) => sum + bet.stake, 0)
const returned = bets.reduce((sum, bet) => sum + bet.payout, 0)
const won = bets.filter(bet => bet.status === 'won')
const favourite = (bet: Bet) => bet.odds === Math.min(...bet.options.map(option => option.odds))
const pct = (part: number, whole: number) => `${(100 * part / (whole || 1)).toFixed(1)}%`
const infancyResult = { bankroll: fly.state.bankroll, bankruptcies: fly.state.bankruptcies }
// Infancy was practice: the fly keeps everything it learned but debuts live with a fresh bankroll.
fly.state.bankroll = FLY_PARAMS.startingBankroll
fly.state.bankruptcies = 0
const now = new Date().toISOString()
write('data/fly/infancy.json', {
  completedAt: now, matches: matches.length, from: matches[0]?.kickoff, to: matches.at(-1)?.kickoff, avoided: skipped,
  summary: { bets: bets.length, won: won.length, staked: Math.round(staked * 100) / 100, returned: Math.round(returned * 100) / 100, ...infancyResult },
  // Bankroll after every bet (date, balance), compact enough for the site to chart without the full bet list.
  curve: bets.map(bet => [bet.kickoff.slice(0, 10), bet.bankrollAfter]),
  // Indices into curve where the fly went broke and was recapitalized.
  bankruptAt: bets.flatMap((bet, i) => bet.bankrupt ? [i] : []),
  affinity: LPF_TEAMS.map(team => ({ team: team.id, innate: innate.find(entry => entry.team === team.id)!.affinity, learned: learned.find(entry => entry.team === team.id)!.affinity })),
})
// Kept separate so the site loads the full list only on request.
write('data/fly/infancy-bets.json', { bets })
write('data/fly/state.json', { updatedAt: now, phase: 'ready-for-live', lastInfancyMatch: matches.at(-1)?.id, state: fly.state })
write('data/fly/bets.json', { bets: [], passes: [] })

console.log(`Infancy: ${matches.length} matches (${matches[0]?.kickoff.slice(0, 10)} to ${matches.at(-1)?.kickoff.slice(0, 10)}), ${bets.length} bets, ${skipped} avoided.`)
console.log(`Hit rate ${pct(won.length, bets.length)} | staked B/.${staked.toFixed(2)} returned B/.${returned.toFixed(2)} | ROI ${pct(returned - staked, staked)}`)
console.log(`Bankruptcies ${infancyResult.bankruptcies} | final bankroll B/.${infancyResult.bankroll} | boldness ${fly.state.boldness} | live debut bankroll B/.${fly.state.bankroll}`)
console.log(`Picks: home ${pct(bets.filter(bet => bet.selection === 'home').length, bets.length)}, draw ${pct(bets.filter(bet => bet.selection === 'draw').length, bets.length)}, away ${pct(bets.filter(bet => bet.selection === 'away').length, bets.length)} | favourite ${pct(bets.filter(favourite).length, bets.length)} | dared ${bets.filter(bet => bet.dared).length} | tilted ${bets.filter(bet => bet.tilted).length}`)
const biggest = [...won].sort((a, b) => b.payout - b.stake - (a.payout - a.stake))[0]
if (biggest) console.log(`Best hit: ${teamName(biggest.home)} vs ${teamName(biggest.away)} ${biggest.result}, ${biggest.selection} @${biggest.odds}, +B/.${(biggest.payout - biggest.stake).toFixed(2)}`)
console.log('\nTeam affinity  innate -> learned')
for (const { team, affinity } of [...learned].sort((a, b) => b.affinity - a.affinity)) {
  const before = innate.find(entry => entry.team === team)!.affinity
  console.log(`  ${teamName(team).padEnd(24)} ${before.toFixed(3)} -> ${affinity.toFixed(3)}`)
}
