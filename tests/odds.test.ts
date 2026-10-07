import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EloBook, goalMultiplier } from '../src/odds/elo'
import { marketProbabilities, scoreMatrix } from '../src/odds/goals'
import { DEFAULT_PARAMS, evaluate, evaluateBaseline, walkForward } from '../src/odds/model'
import { priceMarkets, toOdds } from '../src/odds/odds'
import { teamKey } from '../src/football/teams'
import type { Match } from '../src/football/types'

// Synthetic matches between synthetic teams; not real LPF results.
const match = (id: number, home: string, away: string, score: [number, number] | null, season = '2024'): Match => ({
  id: `af:${id}`, sources: { apiFootball: id, theSportsDb: null }, competition: 'lpf', league: 'Fixture', season, round: null,
  kickoff: new Date(Date.UTC(2024, 0, 1 + id)).toISOString(),
  home: { name: home, sourceId: `fixture:${home}`, badge: null }, away: { name: away, sourceId: `fixture:${away}`, badge: null },
  status: score ? 'finished' : 'scheduled', rawStatus: score ? 'FT' : 'NS', score: score && { home: score[0], away: score[1] }, venue: null,
})

test('Team identity maps by source id across providers, never by name', () => {
  assert.equal(teamKey({ name: 'Veraguas', sourceId: 'af:15620', badge: null }), 'veraguas')
  assert.equal(teamKey({ name: 'Veraguas United', sourceId: 'tsdb:145086', badge: null }), 'veraguas')
  assert.equal(teamKey({ name: 'Veraguas United', sourceId: 'tsdb:999', badge: null }), 'tsdb:999')
})

test('Score matrix is a distribution and Dixon-Coles rho shifts mass to 0-0', () => {
  const independent = scoreMatrix(1.2, 1.0, 0)
  const correlated = scoreMatrix(1.2, 1.0, -0.1)
  assert.ok(Math.abs(independent.flat().reduce((a, b) => a + b, 0) - 1) < 1e-9)
  assert.ok(correlated[0][0] > independent[0][0])
  const markets = marketProbabilities(correlated)
  assert.ok(Math.abs(markets.home + markets.draw + markets.away - 1) < 1e-9)
  assert.ok(markets.home > markets.away)
})

test('Odds carry the book margin and stay within bounds', () => {
  const odds = priceMarkets(marketProbabilities(scoreMatrix(1.3, 1.0, -0.05)))
  const overround = 1 / odds.result.home + 1 / odds.result.draw + 1 / odds.result.away
  assert.ok(overround > 1.04 && overround < 1.08)
  assert.equal(toOdds(0.999), 1.01)
  assert.equal(toOdds(1e-9), 500)
  assert.equal(odds.correctScore.length, 8)
})

test('Elo is zero-sum, weights margins and regresses between seasons', () => {
  const book = new EloBook(DEFAULT_PARAMS.elo)
  const win = match(1, 'A', 'B', [3, 0])
  book.prepare(win)
  book.update(win)
  const [first, second] = book.table()
  assert.equal(first.key, 'fixture:A')
  assert.ok(Math.abs(first.rating + second.rating - 3000) < 1e-9)
  assert.ok(goalMultiplier(3) > goalMultiplier(2) && goalMultiplier(2) > goalMultiplier(1))
  const gap = first.rating - second.rating
  book.prepare(match(2, 'A', 'B', null, '2025'))
  const [after] = book.table()
  assert.ok(after.rating - 1500 < gap / 2)
})

test('Walk-forward predictions never see later results', () => {
  const base = Array.from({ length: 60 }, (_, i) => match(i, i % 2 ? 'A' : 'B', i % 2 ? 'B' : 'A', [i % 3, (i + 1) % 2]))
  const diffs = (matches: Match[]) => { const out: number[] = []; walkForward(matches, DEFAULT_PARAMS, (_, diff) => out.push(diff)); return out }
  const changedFuture = base.map((m, i) => i === 59 ? { ...m, score: { home: 9, away: 0 } } : m)
  assert.deepEqual(diffs(base), diffs(changedFuture))
  assert.equal(evaluate(base, DEFAULT_PARAMS).n, 10)
  assert.equal(evaluateBaseline(base).n, 10)
})
