// Fits the simulated bookmaker on every settled LPF match (history + live ledger), walk-forward.
// Writes data/model/odds-model.json and previews odds for upcoming fixtures.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mergeMatches } from '../src/football/ledger'
import { isMappedTeam, teamKey, teamName } from '../src/football/teams'
import type { Match, MatchLedger } from '../src/football/types'
import { evaluate, evaluateBaseline, fitParams, predict, walkForward } from '../src/odds/model'
import { priceMarkets } from '../src/odds/odds'

const OUTPUT = 'data/model/odds-model.json'
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as { matches: Match[] }

const history = existsSync('data/history') ? readdirSync('data/history').filter(file => file.startsWith('lpf-')).flatMap(file => read(`data/history/${file}`).matches) : []
const ledger: MatchLedger = existsSync('data/matches.json') ? JSON.parse(readFileSync('data/matches.json', 'utf8')) : { updatedAt: '', matches: [] }
const all = mergeMatches(history, ledger.matches.filter(match => match.competition === 'lpf')).matches
const finished = all.filter(match => match.status === 'finished')

const unmapped = new Set(all.flatMap(match => [match.home, match.away]).filter(team => !isMappedTeam(team)).map(team => `${team.sourceId} ${team.name}`))
if (unmapped.size) console.warn(`Unmapped teams (rated as separate identities): ${[...unmapped].join(', ')}`)

const fit = fitParams(finished)
const model = evaluate(finished, fit.params)
const baseline = evaluateBaseline(finished)
const range = { from: finished[0]?.kickoff, to: finished.at(-1)?.kickoff }
mkdirSync('data/model', { recursive: true })
writeFileSync(`${OUTPUT}.tmp`, JSON.stringify({
  fittedAt: new Date().toISOString(), trainedOn: finished.length, range, params: fit.params,
  metrics: { model, baseline }, method: 'Walk-forward Elo + Dixon-Coles Poisson, coordinate search on exact-score log loss',
}, null, 1) + '\n')
renameSync(`${OUTPUT}.tmp`, OUTPUT)

const fixed = (value: number, digits = 3) => value.toFixed(digits)
console.log(`Trained on ${finished.length} settled LPF matches (${range.from?.slice(0, 10)} to ${range.to?.slice(0, 10)}), ${fit.evaluations} evaluations.`)
console.log('Params:', JSON.stringify(fit.params))
console.log(`1X2 log loss  model ${fixed(model.resultLogLoss)}  vs baseline ${fixed(baseline.resultLogLoss)}  (lower is better)`)
console.log(`1X2 Brier     model ${fixed(model.brier)}  vs baseline ${fixed(baseline.brier)}`)
console.log(`Exact-score log loss ${fixed(model.scoreLogLoss)} over ${model.n} matches`)

const book = walkForward(finished, fit.params)
console.log('\nRatings:')
for (const { key, rating } of book.table()) console.log(`  ${rating.toFixed(0).padStart(5)}  ${teamName(key)}`)

console.log('\nUpcoming:')
for (const match of all.filter(match => match.status === 'scheduled')) {
  const markets = predict(book.prepare(match), fit.params)
  const odds = priceMarkets(markets)
  console.log(`  ${match.kickoff.slice(0, 16)}  ${teamName(teamKey(match.home))} vs ${teamName(teamKey(match.away))}`)
  console.log(`    1X2 ${odds.result.home} / ${odds.result.draw} / ${odds.result.away}   (p ${fixed(markets.home, 2)} ${fixed(markets.draw, 2)} ${fixed(markets.away, 2)})   O2.5 ${odds.total25.over}  BTTS ${odds.btts.yes}  top ${odds.correctScore.slice(0, 3).map(score => `${score.score}@${score.odds}`).join(' ')}`)
}
