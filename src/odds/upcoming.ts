import { teamKey, teamName } from '../football/teams'
import type { Match } from '../football/types'
import { EloBook } from './elo'
import { predict, type OddsModelParams } from './model'
import { priceMarkets, type MatchOdds } from './odds'

export interface UpcomingTeam { key: string; name: string; badge: string | null }

export interface UpcomingMatch {
  id: string
  competition: Match['competition']
  league: string
  round: string | null
  kickoff: string
  venue: string | null
  home: UpcomingTeam
  away: UpcomingTeam
  // Null where no pricing model exists yet (national team matches).
  odds: MatchOdds | null
  probabilities: { home: number; draw: number; away: number; over25: number; btts: number } | null
}

const team = (ref: Match['home']): UpcomingTeam => {
  const key = teamKey(ref)
  return { key, name: key === ref.sourceId ? ref.name : teamName(key), badge: ref.badge }
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

export const priceUpcoming = (matches: readonly Match[], book: EloBook, params: OddsModelParams, now: Date, days = 7): UpcomingMatch[] => {
  const from = now.getTime(), to = from + days * 86_400_000
  return matches.filter(match => match.status === 'scheduled' && Date.parse(match.kickoff) >= from && Date.parse(match.kickoff) <= to)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .map(match => {
      const markets = match.competition === 'lpf' ? predict(book.prepare(match), params) : null
      return {
        id: match.id, competition: match.competition, league: match.league, round: match.round, kickoff: match.kickoff, venue: match.venue,
        home: team(match.home), away: team(match.away),
        odds: markets && priceMarkets(markets),
        probabilities: markets && { home: round3(markets.home), draw: round3(markets.draw), away: round3(markets.away), over25: round3(markets.over25), btts: round3(markets.btts) },
      }
    })
}
