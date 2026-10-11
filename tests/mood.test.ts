import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isOfficial, moodAt, panamaWon } from '../src/site/mood'
import { matchPhase, seleCountdown } from '../src/site/phase'
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

test('Match phase follows the visitor clock; national fixtures are "today" for the whole Panama day', () => {
  const lpf = '2026-10-11T01:30:00.000Z' // Saturday 8:30 p.m. in Panama
  assert.equal(matchPhase(lpf, 'af:1', new Date('2026-10-10T23:00:00Z')), 'before')
  assert.equal(matchPhase(lpf, 'af:1', new Date('2026-10-11T02:30:00Z')), 'playing')
  assert.equal(matchPhase(lpf, 'af:1', new Date('2026-10-11T04:00:00Z')), 'after')
  const sele = '2026-11-12T12:00:00.000Z'
  assert.equal(matchPhase(sele, 'elo:x', new Date('2026-11-12T04:00:00Z')), 'before') // still the 11th in Panama
  assert.equal(matchPhase(sele, 'elo:x', new Date('2026-11-12T13:00:00Z')), 'today')
  assert.equal(matchPhase(sele, 'elo:x', new Date('2026-11-13T03:00:00Z')), 'today') // 10 p.m. on match day
  assert.equal(matchPhase(sele, 'elo:x', new Date('2026-11-13T06:00:00Z')), 'after')
})

test('The Sele countdown counts Panama dates and lasts through match day', () => {
  const listed = [fixture('2026-11-12', 'Liga de Naciones Concacaf'), fixture('2026-11-15', 'Liga de Naciones Concacaf')]
  assert.deepEqual(seleCountdown(new Date('2026-11-10T15:00:00Z'), listed), { days: 2, date: '2026-11-12' })
  assert.equal(seleCountdown(new Date('2026-11-11T15:00:00Z'), listed)?.days, 1)
  // Match day, well past the 07:00 placeholder kickoff: still today.
  assert.equal(seleCountdown(new Date('2026-11-12T23:00:00Z'), listed)?.days, 0)
  assert.equal(seleCountdown(new Date('2026-11-13T15:00:00Z'), listed)?.days, 2)
  assert.equal(seleCountdown(new Date('2026-11-16T15:00:00Z'), listed), null)
})
