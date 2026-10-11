// Everything the site shows comes from the committed data/ files the daily job writes.
import stateFile from '../../data/fly/state.json'
import betsFile from '../../data/fly/bets.json'
import upcomingFile from '../../data/fly/upcoming.json'
import tastesFile from '../../data/fly/tastes.json'
import { summary as infancySummary, curve as infancyCurve, bankruptAt as infancyBankruptAt, matches as infancyMatches, from as infancyFrom, to as infancyTo } from '../../data/fly/infancy.json'
import type { Bet, BetBook, FlyState, Pass } from '../brain/fly'
import type { TasteLog } from '../brain/tastes'
import type { RecentNationalMatch, UpcomingMatch } from '../odds/upcoming'
import { matchPhase, panamaDay, seleCountdown, siteNow } from './phase'

export const REPO_URL = 'https://github.com/jrod-md/la-mosca'
export const BETS_HISTORY_URL = `${REPO_URL}/commits/main/data/fly/bets.json`

export const flyState = (stateFile as unknown as { state: FlyState }).state
export const stateUpdatedAt = (stateFile as { updatedAt: string }).updatedAt
const book = betsFile as unknown as BetBook
export const liveBets: Bet[] = book.bets.filter(bet => bet.phase === 'live')
export const passes: Pass[] = book.passes ?? []
export const upcoming = (upcomingFile as unknown as { matches: UpcomingMatch[] }).matches
export const tastes = tastesFile as unknown as TasteLog
export const recentNational = (upcomingFile as unknown as { recentNational?: RecentNationalMatch[] }).recentNational ?? []
export const upcomingGeneratedAt = (upcomingFile as { generatedAt: string }).generatedAt

export const infancy = {
  summary: infancySummary,
  matches: infancyMatches,
  from: infancyFrom,
  to: infancyTo,
  curve: infancyCurve as [string, number][],
  bankruptAt: infancyBankruptAt as number[],
}

// The full infancy bet list is large; it loads only when someone asks to see it.
export const loadInfancyBets = () => import('../../data/fly/infancy-bets.json').then(module => (module.default as unknown as { bets: Bet[] }).bets)

export type Featured =
  | { kind: 'open'; bet: Bet; match: UpcomingMatch | null }
  | { kind: 'thinking'; match: UpcomingMatch }
  | { kind: 'passed'; pass: Pass; match: UpcomingMatch | null }
  | { kind: 'settled'; bet: Bet }
  | { kind: 'empty' }

const byKickoff = <T extends { kickoff: string }>(a: T, b: T) => a.kickoff.localeCompare(b.kickoff)

// The one story the page leads with: an open bet first, then what the fly is mulling over next.
export const featured = (now = siteNow()): Featured => {
  const iso = now.toISOString()
  // Lead with a bet whose match is still ahead or being played; one that is only waiting for its
  // result (or for a new date) leads when nothing else is open.
  const opens = liveBets.filter(bet => bet.status === 'open').sort(byKickoff)
  const open = opens.find(bet => !bet.postponed && matchPhase(bet.kickoff, bet.matchId, now) !== 'after') ?? opens[0]
  if (open) return { kind: 'open', bet: open, match: upcoming.find(match => match.id === open.matchId) ?? null }
  const next = upcoming.filter(match => match.kickoff > iso).sort(byKickoff)
  const pass = passes.filter(entry => entry.kickoff > iso).sort(byKickoff)[0]
  const nextPriced = next.find(match => match.odds && !passes.some(entry => entry.matchId === match.id))
  if (pass && (!nextPriced || pass.kickoff <= nextPriced.kickoff)) return { kind: 'passed', pass, match: upcoming.find(match => match.id === pass.matchId) ?? null }
  if (nextPriced) return { kind: 'thinking', match: nextPriced }
  const last = liveBets.filter(bet => bet.status !== 'open').sort(byKickoff).at(-1)
  return last ? { kind: 'settled', bet: last } : { kind: 'empty' }
}

// Marea Roja: Panama plays today or within two days (counted in Panama dates). `days` drives the
// banner: today, tomorrow, or the weekday. ?marea=1 forces it for previews.
export const mareaRoja = (now = siteNow()): { days: number; date: string } | null => {
  const next = seleCountdown(now, upcoming)
  if (next && next.days <= 2) return next
  return new URLSearchParams(window.location.search).get('marea') === '1' ? { days: 0, date: panamaDay(now) } : null
}

// Date of the next daily run (used only for "first bet comes out on..."); it runs each morning in Panama.
export const nextDailyRun = (now = new Date()): Date => {
  const run = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12))
  if (run <= now) run.setUTCDate(run.getUTCDate() + 1)
  return run
}
