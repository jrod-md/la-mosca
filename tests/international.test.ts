import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEloratingsClient, nationalCode, parseFixtures, parseRatings, parseResults, venueOf } from '../src/football/eloratings'
import { DEFAULT_INTERNATIONAL, HOME_ADVANTAGE, evaluateInternational, priceInternational, ratingGap } from '../src/odds/international'

// Synthetic rows in eloratings' TSV layout (note the Unicode minus sign); not real results.
const RESULTS = [
  '2026\t10\t01\tNZ\tPA\t1\t1\tFT\tJP\t4\t1561\t1646\t+1\t−1\t71\t54',
  '2026\t06\t03\tPA\tDO\t4\t2\tF\t\t1\t1734\t1283\t0\t−1\t36\t146',
].join('\n')
const FIXTURES = [
  '2026\t11\t13\tCW\tPA\tCNL\tCW\t84\t54\t1491\t1654',
  '2026\t11\t00\tDZ\tTG\tFQ\tDZ\t30\t114\t1744\t1366',
].join('\n')

test('eloratings TSVs parse into pre-match ratings, venues and dated fixtures', () => {
  const [neutral, home] = parseResults(RESULTS)
  // Pre-match: home after minus change, away after plus change.
  assert.equal(neutral.homeBefore, 1557)
  assert.equal(neutral.awayBefore, 1650)
  assert.equal(venueOf(neutral), 'JP')
  assert.equal(venueOf(home), 'PA')
  assert.deepEqual(parseRatings('1\t1\tES\t2287\t1\n54\t54\tPA\t1654\t3'), { ES: 2287, PA: 1654 })
  const fixtures = parseFixtures(FIXTURES)
  assert.equal(fixtures.length, 1)
  assert.deepEqual(fixtures[0], { date: '2026-11-13', home: 'CW', away: 'PA', tournament: 'CNL', venue: 'CW' })
})

test('Home advantage applies only to the side playing in its own country', () => {
  assert.equal(ratingGap(1600, 1500, 'PA', 'CW', 'PA'), 100 + HOME_ADVANTAGE)
  assert.equal(ratingGap(1600, 1500, 'PA', 'CW', 'CW'), 100 - HOME_ADVANTAGE)
  assert.equal(ratingGap(1600, 1500, 'PA', 'CW', 'JP'), 100)
})

test('International prices are a distribution that favours the stronger side', () => {
  const markets = priceInternational(200, DEFAULT_INTERNATIONAL)
  assert.ok(Math.abs(markets.home + markets.draw + markets.away - 1) < 1e-9)
  assert.ok(markets.home > markets.away)
  const fit = evaluateInternational(parseResults(RESULTS), DEFAULT_INTERNATIONAL)
  assert.equal(fit.n, 2)
  assert.ok(Number.isFinite(fit.scoreLogLoss))
})

test('Panama matches become date-only ledger entries with stable ids', async () => {
  const files: Record<string, string> = { 'Panama.tsv': RESULTS, 'fixtures.tsv': FIXTURES }
  const client = createEloratingsClient(async url => files[url.split('/').pop()!] ?? '')
  const matches = await client.panamaMatches({ NZ: 'New Zealand', DO: 'Dominican Republic', CW: 'Curacao' }, '2026-09-01')
  assert.deepEqual(matches.map(match => match.id), ['elo:2026-10-01:NZ-PA', 'elo:2026-11-13:CW-PA'])
  const [played, scheduled] = matches
  assert.equal(played.status, 'finished')
  assert.deepEqual(played.score, { home: 1, away: 1 })
  assert.equal(scheduled.status, 'scheduled')
  assert.equal(scheduled.kickoffTimeKnown, false)
  assert.equal(scheduled.venueCountry, 'CW')
  assert.equal(scheduled.home.name, 'Curazao')
  assert.equal(nationalCode(scheduled.away), 'PA')
})
