import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { buildCircuit, perceive, KC_SPARSITY } from '../src/brain/circuit'
import { Fly, FLY_PARAMS, decidedMatches, fixtureOf, withUniqueId } from '../src/brain/fly'
import { glomeruli, optionOdor, priceBucket } from '../src/brain/odor'
import { randomFor } from '../src/brain/random'
import { settleOpenBets } from '../src/brain/settlement'
import { recordSnapshot, weeklyChange, type TasteLog } from '../src/brain/tastes'
import type { Match } from '../src/football/types'
import type { MatchOdds } from '../src/odds/odds'

const circuit = buildCircuit(JSON.parse(readFileSync('src/data/generated/malecns_mushroom_body.json', 'utf8')))

// Synthetic match between real team ids; the score is a fixture, not a real result.
const match = (score: [number, number] | null, id = 'af:1'): Match => ({
  id, sources: { apiFootball: 1, theSportsDb: null }, competition: 'lpf', league: 'Fixture', season: '2026', round: null,
  kickoff: '2026-10-10T01:30:00.000Z', home: { name: 'Home', sourceId: 'af:2885', badge: null }, away: { name: 'Away', sourceId: 'af:2890', badge: null },
  status: score ? 'finished' : 'scheduled', rawStatus: score ? 'FT' : 'NS', score: score && { home: score[0], away: score[1] }, venue: null,
})
const odds: MatchOdds = { result: { home: 2.4, draw: 3.1, away: 3.0 }, total25: { over: 2.3, under: 1.6 }, btts: { yes: 2, no: 1.8 }, correctScore: [{ score: '1-1', odds: 6.2 }, { score: '1-0', odds: 7.1 }] }

test('Committed mushroom body circuit keeps every learning stage', () => {
  assert.equal(circuit.pn.length, 48)
  assert.equal(circuit.kc.length, 160)
  assert.ok(circuit.kcToMbon.length > 1000)
  assert.ok(circuit.kcInputs.every(inputs => inputs.every(input => input.weight > 0)))
  assert.ok(circuit.mbonValence.some(value => value > 0.5) && circuit.mbonValence.some(value => value < -0.5))
  assert.ok(circuit.mbonValence.every(value => value >= -1 && value <= 1))
  assert.throws(() => buildCircuit({ metadata: { realConnectivity: false }, nodes: [], edges: [] }))
})

test('Odors are deterministic, team-specific and sparsely coded in KCs', () => {
  assert.deepEqual(glomeruli('team:tauro', 8, 48), glomeruli('team:tauro', 8, 48))
  assert.notDeepEqual(optionOdor('home', 'tauro', 2, 48), optionOdor('home', 'alianza', 2, 48))
  assert.equal(priceBucket(1.5), 0)
  assert.equal(priceBucket(5), 4)
  const perception = perceive(circuit, circuit.kcToMbon.map(synapse => synapse.weight), optionOdor('home', 'tauro', 2, 48))
  assert.ok(perception.activeKcs.length <= Math.round(circuit.kc.length * KC_SPARSITY))
  assert.ok(perception.activeKcs.length > 0)
  assert.equal(randomFor('a')(), randomFor('a')())
})

test('Decisions are reproducible from the match id and fly state', () => {
  const a = Fly.newborn(circuit).decide(fixtureOf(match(null)), odds)
  const b = Fly.newborn(circuit).decide(fixtureOf(match(null)), odds)
  assert.deepEqual(a, b)
  assert.ok(Math.abs(a.options.reduce((sum, option) => sum + option.probability, 0) - 1) < 1e-9)
})

test('Bets move the bankroll and dopamine learning changes only active synapses', () => {
  const fly = Fly.newborn(circuit)
  const decision = fly.decide(fixtureOf(match(null)), odds)
  const forced = { ...decision, choice: decision.options[0], activeKcs: decision.activeKcs.length ? decision.activeKcs : [0] }
  const before = [...fly.state.weights]
  const bet = fly.place(match(null), forced, 'live', '2026-10-09T12:00:00.000Z')!
  assert.equal(fly.state.bankroll, Math.round((FLY_PARAMS.startingBankroll - bet.stake) * 100) / 100)
  const settled = fly.settle(bet, match([2, 0]))
  assert.equal(settled.status, 'won')
  assert.equal(settled.payout, Math.round(bet.stake * bet.odds * 100) / 100)
  assert.equal(fly.state.bankroll, Math.round((FLY_PARAMS.startingBankroll - bet.stake + settled.payout) * 100) / 100)
  const activeKcs = new Set(forced.activeKcs)
  const changed = circuit.kcToMbon.map((synapse, i) => ({ synapse, i })).filter(({ i }) => fly.state.weights[i] !== before[i])
  assert.ok(changed.length > 0)
  assert.ok(changed.every(({ synapse }) => activeKcs.has(synapse.kc)))
  assert.equal(fly.settle(settled, match([2, 0])), settled)
})

test('Void matches refund and unsettled matches cannot be settled', () => {
  const fly = Fly.newborn(circuit)
  const decision = fly.decide(fixtureOf(match(null)), odds)
  const bet = fly.place(match(null), { ...decision, choice: decision.options[1] }, 'live', '2026-10-09T12:00:00.000Z')!
  assert.throws(() => fly.settle(bet, match(null)))
  const voided = fly.settle(bet, { ...match(null), status: 'void' })
  assert.equal(voided.status, 'void')
  assert.equal(fly.state.bankroll, FLY_PARAMS.startingBankroll)
  assert.throws(() => new Fly(circuit, { ...fly.state, circuitSha: 'other' }))
})

test('Exhibition picks are a distribution and leave the fly untouched', () => {
  const fly = Fly.newborn(circuit)
  const before = JSON.stringify(fly.state)
  const exhibition = fly.exhibit(fixtureOf(match(null)), odds)
  for (const market of [exhibition.totals, exhibition.btts, exhibition.score]) {
    assert.ok(Math.abs(market.reduce((sum, pick) => sum + pick.probability, 0) - 1) < 1e-9)
    assert.ok(market[0].probability >= market.at(-1)!.probability)
  }
  assert.equal(exhibition.score.length, 2)
  assert.equal(JSON.stringify(fly.state), before)
})

test('Taste log keeps one snapshot per day and reports the week’s biggest moves', () => {
  let log: TasteLog = { innate: { a: 0.5, b: 0.5 }, history: [] }
  log = recordSnapshot(log, '2026-10-01', { a: 0.5, b: 0.5 })
  assert.equal(weeklyChange(log), null)
  log = recordSnapshot(log, '2026-10-08', { a: 0.4, b: 0.6 })
  log = recordSnapshot(log, '2026-10-08', { a: 0.45, b: 0.62 })
  assert.equal(log.history.length, 2)
  const change = weeklyChange(log)!
  assert.equal(change.warmed?.team, 'b')
  assert.equal(change.cooled?.team, 'a')
  assert.equal(weeklyChange(recordSnapshot(log, '2026-10-15', { a: 0.45, b: 0.62 }))?.warmed, null)
})

test('Postponed matches wait before voiding, follow a new date, and removed fixtures void at once', () => {
  const place = (fly: Fly, id: string) => {
    const decision = fly.decide(fixtureOf(match(null, id)), odds)
    return fly.place(match(null, id), { ...decision, choice: decision.options[0] }, 'live', '2026-10-08T12:00:00.000Z')!
  }
  const fly = Fly.newborn(circuit)
  const bets = [place(fly, 'af:1'), place(fly, 'af:2'), place(fly, 'elo:x')]
  const postponed = { ...match(null, 'af:1'), status: 'void' as const, rawStatus: 'PST' }
  const ledger = new Map<string, Match>([['af:1', postponed], ['af:2', match(null, 'af:2')], ['elo:x', { ...match(null, 'elo:x'), status: 'void', rawStatus: 'eloratings:removed' }]])
  // Day after kickoff: the postponed bet waits (flagged), the removed fixture refunds immediately.
  const day1 = settleOpenBets(fly, bets, id => ledger.get(id), new Date('2026-10-11T12:00:00Z'))
  assert.deepEqual(day1.bets.map(bet => bet.status), ['open', 'open', 'void'])
  assert.equal(day1.bets[0].postponed, true)
  assert.deepEqual(day1.settled.map(bet => bet.id), ['bet:elo:x'])
  // Rescheduled with the same id: the bet follows the new kickoff and loses the flag.
  ledger.set('af:1', { ...match(null, 'af:1'), kickoff: '2026-10-20T01:30:00.000Z' })
  const moved = settleOpenBets(fly, day1.bets, id => ledger.get(id), new Date('2026-10-12T12:00:00Z'))
  assert.equal(moved.bets[0].kickoff, '2026-10-20T01:30:00.000Z')
  assert.equal(moved.bets[0].postponed, undefined)
  // Never rescheduled: after the grace period it is voided and refunded.
  ledger.set('af:1', postponed)
  const late = settleOpenBets(fly, day1.bets, id => ledger.get(id), new Date('2026-10-14T12:00:00Z'))
  assert.equal(late.bets[0].status, 'void')
  assert.equal(late.bets[0].postponed, undefined)
})

test('Bankruptcy needs an empty hand and nothing still riding', () => {
  const fly = Fly.newborn(circuit)
  const decision = fly.decide(fixtureOf(match(null)), odds)
  const first = fly.place(match(null, 'af:1'), { ...decision, choice: decision.options[0] }, 'live', '2026-10-08T12:00:00.000Z')!
  const second = fly.place(match(null, 'af:2'), { ...decision, choice: decision.options[0] }, 'live', '2026-10-08T12:00:00.000Z')!
  fly.state.bankroll = 0.4
  // Loses with another bet still open: not bankrupt yet.
  const lost = fly.settle(first, match([0, 2], 'af:1'), 1)
  assert.equal(lost.bankrupt, false)
  assert.equal(fly.state.bankroll, 0.4)
  // The last open bet also loses: now it is broke and starts again.
  const last = fly.settle(second, match([0, 2], 'af:2'), 0)
  assert.equal(last.bankrupt, true)
  assert.equal(fly.state.bankroll, FLY_PARAMS.startingBankroll)
  assert.equal(fly.state.bankruptcies, 1)
})

test('A match whose bet was voided can be decided again under a new bet id', () => {
  const fly = Fly.newborn(circuit)
  const decision = fly.decide(fixtureOf(match(null, 'af:1')), odds)
  const first = fly.place(match(null, 'af:1'), { ...decision, choice: decision.options[0] }, 'live', '2026-10-08T12:00:00.000Z')!
  const other = fly.place(match(null, 'af:2'), { ...decision, choice: decision.options[0] }, 'live', '2026-10-08T12:00:00.000Z')!
  const pass = { matchId: 'af:3', decidedAt: '2026-10-08T12:00:00.000Z', kickoff: '2026-10-10T01:30:00.000Z', home: 'a', away: 'b', options: decision.options }
  // Open, settled and passed matches stay decided; a voided one is free again.
  assert.deepEqual([...decidedMatches({ bets: [first, other], passes: [pass] })].sort(), ['af:1', 'af:2', 'af:3'])
  const voided = fly.settle(first, { ...match(null, 'af:1'), status: 'void', rawStatus: 'PST' })
  assert.equal(voided.status, 'void')
  const book = [voided, other]
  assert.deepEqual([...decidedMatches({ bets: book, passes: [pass] })].sort(), ['af:2', 'af:3'])
  // The new bet keeps its match id but not the old bet id.
  const again = fly.place(match(null, 'af:1'), { ...decision, choice: decision.options[0] }, 'live', '2026-10-15T12:00:00.000Z')!
  const second = withUniqueId(book, again)
  assert.equal(second.id, 'bet:af:1:2')
  assert.equal(second.matchId, 'af:1')
  assert.equal(withUniqueId([...book, second], again).id, 'bet:af:1:3')
  assert.equal(withUniqueId(book, fly.place(match(null, 'af:9'), { ...decision, choice: decision.options[0] }, 'live', '2026-10-15T12:00:00.000Z')!).id, 'bet:af:9')
  assert.deepEqual([...decidedMatches({ bets: [...book, second] })].sort(), ['af:1', 'af:2'])
})
