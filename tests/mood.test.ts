import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isOfficial, moodAt, panamaWon } from '../src/site/mood'
import type { RecentNationalMatch, UpcomingMatch } from '../src/odds/upcoming'

const fixture = (date: string, league: string): UpcomingMatch => ({
  id: `elo:${date}:CW-PA`, competition: 'panama', league, round: null, kickoff: `${date}T12:00:00.000Z`, kickoffTimeKnown: false, venue: null,
  home: { key: 'nt:CW', name: 'Curazao', badge: null }, away: { key: 'nt:PA', name: 'Panamá', badge: null }, odds: null, probabilities: null,
})
const result = (date: string, league: string, home: number, away: number): RecentNationalMatch => ({ date, home: 'CW', away: 'PA', league, score: { home, away } })
// 15:00 UTC is 10:00 in Panama on the same date.
const at = (date: string) => new Date(`${date}T15:00:00Z`)

test('Only non-friendly national matches are official, and wins are read from Panama’s side', () => {
  assert.equal(isOfficial('Liga de Naciones Concacaf'), true)
  assert.equal(isOfficial('Amistoso'), false)
  assert.equal(isOfficial('Torneo amistoso'), false)
  assert.equal(panamaWon(result('2026-11-13', 'x', 0, 2)), true)
  assert.equal(panamaWon(result('2026-11-13', 'x', 2, 0)), false)
})

test('Mood priority: asleep, then nervous on official match day, then celebrating an official win', () => {
  const official = [fixture('2026-11-13', 'Liga de Naciones Concacaf')]
  assert.equal(moodAt(at('2026-11-13'), 1, official, [], false), 'sleeping')
  assert.equal(moodAt(at('2026-11-13'), 10, official, [], false), 'nervous')
  assert.equal(moodAt(at('2026-11-13'), 10, [fixture('2026-11-13', 'Amistoso')], [], false), 'idle')
  const won = [result('2026-11-13', 'Liga de Naciones Concacaf', 0, 1)]
  assert.equal(moodAt(at('2026-11-14'), 10, [], won, false), 'celebrating')
  assert.equal(moodAt(at('2026-11-17'), 10, [], won, true), 'thinking')
  assert.equal(moodAt(at('2026-11-14'), 10, [], [result('2026-11-13', 'Amistoso', 0, 1)], false), 'idle')
})
