import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { buildCircuit, perceive, KC_SPARSITY } from '../src/brain/circuit'
import { Fly } from '../src/brain/fly'
import { glomeruli, optionOdor, priceBucket } from '../src/brain/odor'
import { randomFor } from '../src/brain/random'
import type { Match } from '../src/football/types'
import type { MatchOdds } from '../src/odds/odds'

const circuit = buildCircuit(JSON.parse(readFileSync('src/data/generated/malecns_mushroom_body.json', 'utf8')))

// Synthetic match between real team ids; the score is a fixture, not a real result.
const match = (score: [number, number] | null, id = 'af:1'): Match => ({
  id, sources: { apiFootball: 1, theSportsDb: null }, competition: 'lpf', league: 'Fixture', season: '2026', round: null,
  kickoff: '2026-10-10T01:30:00.000Z', home: { name: 'Home', sourceId: 'af:2885', badge: null }, away: { name: 'Away', sourceId: 'af:2890', badge: null },
  status: score ? 'finished' : 'scheduled', rawStatus: score ? 'FT' : 'NS', score: score && { home: score[0], away: score[1] }, venue: null,
})
const odds: MatchOdds = { result: { home: 2.4, draw: 3.1, away: 3.0 }, total25: { over: 2.3, under: 1.6 }, btts: { yes: 2, no: 1.8 }, correctScore: [] }

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
  const a = Fly.newborn(circuit).decide(match(null), odds)
  const b = Fly.newborn(circuit).decide(match(null), odds)
  assert.deepEqual(a, b)
  assert.ok(Math.abs(a.options.reduce((sum, option) => sum + option.probability, 0) - 1) < 1e-9)
})

test('Bets move the bankroll and dopamine learning changes only active synapses', () => {
  const fly = Fly.newborn(circuit)
  const decision = fly.decide(match(null), odds)
  const forced = { ...decision, choice: decision.options[0], activeKcs: decision.activeKcs.length ? decision.activeKcs : [0] }
  const before = [...fly.state.weights]
  const bet = fly.place(match(null), forced, 'live', '2026-10-09T12:00:00.000Z')!
  assert.equal(fly.state.bankroll, 100 - bet.stake)
  const settled = fly.settle(bet, match([2, 0]))
  assert.equal(settled.status, 'won')
  assert.equal(settled.payout, Math.round(bet.stake * bet.odds * 100) / 100)
  assert.equal(fly.state.bankroll, Math.round((100 - bet.stake + settled.payout) * 100) / 100)
  const activeKcs = new Set(forced.activeKcs)
  const changed = circuit.kcToMbon.map((synapse, i) => ({ synapse, i })).filter(({ i }) => fly.state.weights[i] !== before[i])
  assert.ok(changed.length > 0)
  assert.ok(changed.every(({ synapse }) => activeKcs.has(synapse.kc)))
  assert.equal(fly.settle(settled, match([2, 0])), settled)
})

test('Void matches refund and unsettled matches cannot be settled', () => {
  const fly = Fly.newborn(circuit)
  const decision = fly.decide(match(null), odds)
  const bet = fly.place(match(null), { ...decision, choice: decision.options[1] }, 'live', '2026-10-09T12:00:00.000Z')!
  assert.throws(() => fly.settle(bet, match(null)))
  const voided = fly.settle(bet, { ...match(null), status: 'void' })
  assert.equal(voided.status, 'void')
  assert.equal(fly.state.bankroll, 100)
  assert.throws(() => new Fly(circuit, { ...fly.state, circuitSha: 'other' }))
})
