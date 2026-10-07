import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTheSportsDbClient, normalizeTsdbEvent, type TsdbEvent } from '../src/football/theSportsDb'
import { createApiFootballClient, normalizeApiFootballFixture, type ApiFootballFixture } from '../src/football/apiFootball'
import { mergeMatches, utcDay } from '../src/football/ledger'
import type { JsonFetch } from '../src/football/types'

// Synthetic fixtures shaped like real responses; teams and scores are not real results.
const tsdb = (overrides: Partial<TsdbEvent> = {}): TsdbEvent => ({
  idEvent: '900', idAPIfootball: '7000', idLeague: '4819', strLeague: 'Fixture League', strSeason: '2026', intRound: '12',
  strTimestamp: '2026-10-10T01:30:00', strHomeTeam: 'Home FC', strAwayTeam: 'Away CD', idHomeTeam: '1', idAwayTeam: '2',
  intHomeScore: null, intAwayScore: null, strStatus: 'NS', strPostponed: 'no', strVenue: 'Fixture Stadium', ...overrides,
})

const fixture = (overrides: Partial<ApiFootballFixture['fixture']> = {}, goals = { home: 2 as number | null, away: 1 as number | null }): ApiFootballFixture => ({
  fixture: { id: 7000, date: '2024-03-01T00:30:00+00:00', status: { short: 'FT' }, venue: { name: 'Fixture Stadium' }, ...overrides },
  league: { id: 304, name: 'Fixture League', season: 2024, round: 'Regular Season - 3' },
  teams: { home: { id: 10, name: 'Home FC' }, away: { id: 20, name: 'Away CD' } },
  goals,
})

test('TheSportsDB events normalize to UTC kickoff and shared API-Football id', () => {
  const match = normalizeTsdbEvent(tsdb(), 'lpf')
  assert.equal(match.id, 'af:7000')
  assert.equal(match.kickoff, '2026-10-10T01:30:00.000Z')
  assert.equal(match.status, 'scheduled')
  assert.equal(match.score, null)
  assert.equal(match.home.sourceId, 'tsdb:1')
  assert.equal(normalizeTsdbEvent(tsdb({ idAPIfootball: null }), 'lpf').id, 'tsdb:900')
})

test('Only explicit final statuses with both scores are settled', () => {
  assert.deepEqual(normalizeTsdbEvent(tsdb({ strStatus: 'FT', intHomeScore: '3', intAwayScore: '1' }), 'lpf').score, { home: 3, away: 1 })
  // Ambiguous status with a score (seen on national team data) stays unsettled.
  const ambiguous = normalizeTsdbEvent(tsdb({ strStatus: 'P', intHomeScore: '1', intAwayScore: '1' }), 'panama')
  assert.equal(ambiguous.status, 'unknown')
  assert.equal(ambiguous.score, null)
  assert.equal(normalizeTsdbEvent(tsdb({ strStatus: 'FT', intHomeScore: '3' }), 'lpf').status, 'unknown')
  assert.equal(normalizeTsdbEvent(tsdb({ strPostponed: 'yes' }), 'lpf').status, 'void')
  assert.equal(normalizeTsdbEvent(tsdb({ strStatus: 'AWD', intHomeScore: '3', intAwayScore: '0' }), 'lpf').status, 'void')
  // LPF seasons are calendar years even when the source labels a split season.
  assert.equal(normalizeTsdbEvent(tsdb({ strSeason: '2025-2026', strTimestamp: '2026-01-17T23:00:00' }), 'lpf').season, '2026')
  assert.equal(normalizeTsdbEvent(tsdb({ strSeason: '2025-2026', strTimestamp: '2026-01-17T23:00:00' }), 'panama').season, '2025-2026')
  assert.throws(() => normalizeTsdbEvent(tsdb({ strTimestamp: null, dateEvent: null }), 'lpf'))
})

test('API-Football fixtures normalize with the same id scheme', () => {
  const match = normalizeApiFootballFixture(fixture(), 'lpf')
  assert.equal(match.id, 'af:7000')
  assert.deepEqual(match.score, { home: 2, away: 1 })
  assert.equal(match.season, '2024')
  assert.equal(normalizeApiFootballFixture(fixture({ status: { short: 'PST' } }), 'lpf').status, 'void')
  assert.equal(normalizeApiFootballFixture(fixture({ status: { short: '2H' } }), 'lpf').status, 'unknown')
  assert.equal(normalizeApiFootballFixture(fixture({}, { home: null, away: null }), 'lpf').status, 'unknown')
})

test('Ledger merge upserts, unions sources and never downgrades a final result', () => {
  const scheduled = normalizeTsdbEvent(tsdb(), 'lpf')
  const finished = normalizeTsdbEvent(tsdb({ strStatus: 'FT', intHomeScore: '2', intAwayScore: '2' }), 'lpf')
  const first = mergeMatches([], [scheduled])
  assert.equal(first.added, 1)
  const second = mergeMatches(first.matches, [finished])
  assert.equal(second.updated, 1)
  assert.equal(second.matches[0].status, 'finished')
  const stale = mergeMatches(second.matches, [scheduled])
  assert.equal(stale.updated, 0)
  assert.equal(stale.matches[0].status, 'finished')
  const fromApi = mergeMatches(second.matches, [normalizeApiFootballFixture(fixture({ id: 7000 }, { home: 2, away: 2 }), 'lpf')])
  assert.equal(fromApi.matches.length, 1)
  assert.deepEqual(fromApi.matches[0].sources, { apiFootball: 7000, theSportsDb: '900' })
  assert.equal(utcDay(new Date('2026-10-07T23:59:00Z'), 1), '2026-10-08')
})

test('TheSportsDB client filters by league and national team', async () => {
  const urls: string[] = []
  const fetch: JsonFetch = async url => {
    urls.push(url)
    const events = url.includes('eventsday') ? [tsdb(), tsdb({ idEvent: '901', idAPIfootball: null, idLeague: '9999' })]
      : [tsdb({ idEvent: '902', idAPIfootball: null, idHomeTeam: '136141' }), tsdb({ idEvent: '903', idAPIfootball: null })]
    return { ok: true, status: 200, json: async () => url.includes('eventslast') ? { results: events } : { events } }
  }
  const client = createTheSportsDbClient(fetch)
  assert.deepEqual((await client.lpfDay('2026-10-10')).map(match => match.id), ['af:7000'])
  assert.deepEqual((await client.panamaRecent()).map(match => match.id), ['tsdb:902', 'tsdb:902'])
  assert.ok(urls[0].endsWith('eventsday.php?d=2026-10-10&l=4819'))
})

test('API-Football client surfaces plan errors without leaking the key', async () => {
  const fetch: JsonFetch = async (_url, init) => {
    assert.equal(init?.headers?.['x-apisports-key'], 'fixture-key')
    return { ok: true, status: 200, json: async () => ({ errors: { plan: 'Free plans do not have access to this season.' }, response: [] }) }
  }
  const client = createApiFootballClient(fetch, 'fixture-key')
  await assert.rejects(client.lpfSeason(2026), (error: Error) => error.message.includes('Free plans') && !error.message.includes('fixture-key'))
  assert.equal(client.requests, 1)
})
