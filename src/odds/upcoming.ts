import { displayName, teamKey } from '../football/teams'
import type { Match } from '../football/types'
import { EloBook } from './elo'
import type { MarketProbabilities } from './goals'
import { predict, type OddsModelParams } from './model'
import { priceMarkets, type MatchOdds } from './odds'

export interface UpcomingTeam { key: string; name: string; badge: string | null }

export interface UpcomingMatch {
  id: string
  competition: Match['competition']
  league: string
  round: string | null
  kickoff: string
  kickoffTimeKnown: boolean
  venue: string | null
  home: UpcomingTeam
  away: UpcomingTeam
  // Null when a match cannot be priced (for example a team missing from the ratings).
  odds: MatchOdds | null
  probabilities: { home: number; draw: number; away: number; over25: number; btts: number } | null
}

const team = (ref: Match['home']): UpcomingTeam => ({ key: teamKey(ref), name: displayName(ref), badge: ref.badge })

export type InternationalPricer = (match: Match) => MarketProbabilities | null

export interface RecentNationalMatch { date: string; home: string; away: string; league: string; score: { home: number; away: number } }

// Panama's finished matches in the last `days`, by eloratings code (PA, CW...).
export const recentNational = (matches: readonly Match[], now: Date, days = 21): RecentNationalMatch[] => {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  return matches.filter(match => match.competition === 'panama' && match.status === 'finished' && match.score && match.kickoff >= since)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .map(match => ({ date: match.kickoff.slice(0, 10), home: match.home.sourceId.replace(/^nt:/, ''), away: match.away.sourceId.replace(/^nt:/, ''), league: match.league, score: match.score! }))
}

// Ratings from every LPF result that finished before `now`, oldest first.
export const ratingsAt = (matches: readonly Match[], params: OddsModelParams, now: Date): EloBook => {
  const book = new EloBook(params.elo)
  const cutoff = now.toISOString()
  for (const match of matches.filter(match => match.competition === 'lpf' && match.status === 'finished' && match.kickoff < cutoff)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))) {
    book.prepare(match)
    book.update(match)
  }
  return book
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

// League matches within `days`; national team matches further ahead, so the site can tease them.

export const priceUpcoming = (matches: readonly Match[], book: EloBook, params: OddsModelParams, now: Date, international: InternationalPricer = () => null, days = 7): UpcomingMatch[] => {
  const from = now.getTime()
  const horizon = (match: Match) => from + (match.competition === 'panama' ? 45 : days) * 86_400_000
  return matches.filter(match => match.status === 'scheduled' && Date.parse(match.kickoff) >= from && Date.parse(match.kickoff) <= horizon(match))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .map(match => {
      const markets = match.competition === 'lpf' ? predict(book.prepare(match), params) : international(match)
      return {
        id: match.id, competition: match.competition, league: match.league, round: match.round, kickoff: match.kickoff,
        kickoffTimeKnown: match.kickoffTimeKnown !== false, venue: match.venue,
        home: team(match.home), away: team(match.away),
        odds: markets && priceMarkets(markets),
        probabilities: markets && { home: round3(markets.home), draw: round3(markets.draw), away: round3(markets.away), over25: round3(markets.over25), btts: round3(markets.btts) },
      }
    })
}
