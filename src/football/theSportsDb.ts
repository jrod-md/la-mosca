import { matchId, toInteger, type Competition, type JsonFetch, type Match, type MatchStatus } from './types'

// Free public key. The free tier truncates list endpoints to ~5 events, so callers query one day at a time.
const BASE = 'https://www.thesportsdb.com/api/v1/json/3/'
export const TSDB_LPF_LEAGUE = '4819'

export interface TsdbEvent {
  idEvent: string
  idAPIfootball?: string | null
  idLeague?: string | null
  strLeague?: string | null
  strSeason?: string | null
  intRound?: string | null
  strTimestamp?: string | null
  dateEvent?: string | null
  strTime?: string | null
  strHomeTeam: string
  strAwayTeam: string
  idHomeTeam: string
  idAwayTeam: string
  strHomeTeamBadge?: string | null
  strAwayTeamBadge?: string | null
  intHomeScore?: string | null
  intAwayScore?: string | null
  strStatus?: string | null
  strPostponed?: string | null
  strVenue?: string | null
}

const FINISHED = new Set(['FT', 'AET', 'PEN', 'Match Finished'])
const SCHEDULED = new Set(['NS', 'TBD', 'Not Started'])
// Awarded/walkover results were not played; like API-Football's AWD/WO they settle as void.
const VOID = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO', 'Postponed', 'Cancelled', 'Abandoned'])

export const tsdbStatus = (event: TsdbEvent): MatchStatus => {
  const status = event.strStatus ?? null
  if (event.strPostponed === 'yes' || (status && VOID.has(status))) return 'void'
  if (status && FINISHED.has(status)) return 'finished'
  if (!status || SCHEDULED.has(status)) return 'scheduled'
  return 'unknown'
}

// TheSportsDB timestamps are UTC without a zone suffix.
const kickoffOf = (event: TsdbEvent): string => {
  const raw = event.strTimestamp || (event.dateEvent && `${event.dateEvent}T${event.strTime || '00:00:00'}`)
  const date = raw ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`) : null
  if (!date || Number.isNaN(date.getTime())) throw new Error(`TheSportsDB event ${event.idEvent} has no valid kickoff`)
  return date.toISOString()
}

// The LPF runs on calendar years (as API-Football labels it); TheSportsDB sometimes labels the
// Apertura as a split season ("2025-2026"), so league matches use the kickoff year.
const seasonOf = (event: TsdbEvent, competition: Competition, kickoff: string): string =>
  competition === 'lpf' ? kickoff.slice(0, 4) : event.strSeason ?? ''

export const normalizeTsdbEvent = (event: TsdbEvent, competition: Competition): Match => {
  const kickoff = kickoffOf(event)
  const apiFootball = toInteger(event.idAPIfootball)
  const home = toInteger(event.intHomeScore)
  const away = toInteger(event.intAwayScore)
  let status = tsdbStatus(event)
  // A final status without both scores cannot be settled.
  if (status === 'finished' && (home === null || away === null)) status = 'unknown'
  return {
    id: matchId(apiFootball, `tsdb:${event.idEvent}`),
    sources: { apiFootball, theSportsDb: event.idEvent },
    competition,
    league: event.strLeague ?? '',
    season: seasonOf(event, competition, kickoff),
    round: event.intRound && event.intRound !== '0' ? event.intRound : null,
    kickoff,
    home: { name: event.strHomeTeam, sourceId: `tsdb:${event.idHomeTeam}`, badge: event.strHomeTeamBadge ?? null },
    away: { name: event.strAwayTeam, sourceId: `tsdb:${event.idAwayTeam}`, badge: event.strAwayTeamBadge ?? null },
    status,
    rawStatus: event.strStatus ?? null,
    score: status === 'finished' && home !== null && away !== null ? { home, away } : null,
    venue: event.strVenue ?? null,
  }
}

export const createTheSportsDbClient = (fetch: JsonFetch) => {
  const get = async (path: string, field: 'events'): Promise<TsdbEvent[]> => {
    const response = await fetch(`${BASE}${path}`)
    if (!response.ok) throw new Error(`TheSportsDB ${path.split('?')[0]} failed with HTTP ${response.status}`)
    const body = await response.json() as Record<string, unknown>
    const list = body[field]
    return Array.isArray(list) ? list as TsdbEvent[] : []
  }
  return {
    // date: 'YYYY-MM-DD' in UTC, matching TheSportsDB's dateEvent.
    lpfDay: async (date: string) => (await get(`eventsday.php?d=${date}&l=${TSDB_LPF_LEAGUE}`, 'events'))
      .filter(event => event.idLeague === TSDB_LPF_LEAGUE).map(event => normalizeTsdbEvent(event, 'lpf')),
  }
}
