import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { buildCircuit } from '../src/brain/circuit'
import { Fly, type BetBook, type FlyState } from '../src/brain/fly'
import type { MatchLedger } from '../src/football/types'

// Integrity of the committed data the daily job writes and the site reads.
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'))
// Non-negative balboas with at most two decimals.
const money = (value: number) => Number.isFinite(value) && value >= 0 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6

test('Fly state matches the committed circuit and holds sane numbers', () => {
  const circuit = buildCircuit(read('src/data/generated/malecns_mushroom_body.json'))
  const { state } = read<{ state: FlyState }>('data/fly/state.json')
  assert.doesNotThrow(() => new Fly(circuit, state))
  assert.ok(money(state.bankroll))
  assert.ok(state.boldness >= 0 && state.boldness <= 1)
  assert.ok(state.weights.every(weight => Number.isFinite(weight) && weight >= 0))
})

test('Every bet and pass is well formed and refers to a known match', () => {
  const book = read<BetBook>('data/fly/bets.json')
  const ledger = read<MatchLedger>('data/matches.json')
  const ids = new Set(ledger.matches.map(match => match.id))
  const decided = new Set<string>()
  for (const bet of book.bets) {
    assert.ok(ids.has(bet.matchId), `bet for unknown match ${bet.matchId}`)
    assert.ok(!decided.has(bet.matchId), `two decisions for ${bet.matchId}`)
    decided.add(bet.matchId)
    assert.ok(bet.placedAt < bet.kickoff, `bet ${bet.id} placed after kickoff`)
    assert.ok(bet.stake > 0 && money(bet.stake) && bet.odds > 1 && money(bet.bankrollAfter))
    assert.ok(['open', 'won', 'lost', 'void'].includes(bet.status))
    if (bet.status === 'won') assert.equal(bet.payout, Math.round(bet.stake * bet.odds * 100) / 100)
    if (bet.status === 'lost') assert.equal(bet.payout, 0)
  }
  for (const pass of book.passes ?? []) {
    assert.ok(!decided.has(pass.matchId), `pass and bet for ${pass.matchId}`)
    decided.add(pass.matchId)
    assert.ok(pass.decidedAt < pass.kickoff)
  }
})

test('Upcoming matches are priced coherently', () => {
  const { matches } = read<{ matches: { kickoff: string; odds: { result: Record<string, number> } | null }[] }>('data/fly/upcoming.json')
  for (const match of matches) {
    assert.ok(!Number.isNaN(Date.parse(match.kickoff)))
    if (match.odds) {
      const overround = Object.values(match.odds.result).reduce((sum, odds) => sum + 1 / odds, 0)
      assert.ok(overround > 1 && overround < 1.15)
    }
  }
})
