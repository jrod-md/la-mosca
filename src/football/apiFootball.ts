import { matchId, type Competition, type JsonFetch, type Match, type MatchStatus } from './types'

// Free plan: seasons 2022-2024 only, no `next`/`last` parameters, 100 requests/day.
const BASE = 'https://v3.football.api-sports.io'
export const AF_LPF_LEAGUE = 304
export const AF_PANAMA_TEAM = 11

export interface ApiFootballFixture {
  fixture: { id: number; date: string; status: { short: string | null }; venue?: { name: string | null } | null }
  league: { id: number; name: string; season: number; round?: string | null }
  teams: { home: { id: number; name: string; logo?: string | null }; away: { id: number; name: string; logo?: string | null } }
  goals: { home: number | null; away: number | null }
}

const FINISHED = new Set(['FT', 'AET', 'PEN'])
const SCHEDULED = new Set(['NS', 'TBD'])
const VOID = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO'])

export const apiFootballStatus = (short: string | null): MatchStatus =>
  !short ? 'unknown' : FINISHED.has(short) ? 'finished' : SCHEDULED.has(short) ? 'scheduled' : VOID.has(short) ? 'void' : 'unknown'

export const normalizeApiFootballFixture = (item: ApiFootballFixture, competition: Competition): Match => {
  const { fixture, league, teams, goals } = item
  const kickoff = new Date(fixture.date)
  if (Number.isNaN(kickoff.getTime())) throw new Error(`API-Football fixture ${fixture.id} has no valid kickoff`)
  let status = apiFootballStatus(fixture.status.short)
  if (status === 'finished' && (goals.home === null || goals.away === null)) status = 'unknown'
  return {
    id: matchId(fixture.id, ''),
    sources: { apiFootball: fixture.id, theSportsDb: null },
    competition,
    league: league.name,
    season: String(league.season),
    round: league.round ?? null,
    kickoff: kickoff.toISOString(),
    home: { name: teams.home.name, sourceId: `af:${teams.home.id}`, badge: teams.home.logo ?? null },
    away: { name: teams.away.name, sourceId: `af:${teams.away.id}`, badge: teams.away.logo ?? null },
    status,
    rawStatus: fixture.status.short,
    score: status === 'finished' && goals.home !== null && goals.away !== null ? { home: goals.home, away: goals.away } : null,
    venue: fixture.venue?.name ?? null,
  }
}

// Messages come from the API body (e.g. plan limits); the key is only ever sent as a header.
export class ApiFootballError extends Error {}

export const createApiFootballClient = (fetch: JsonFetch, key: string) => {
  let requests = 0
  const fixtures = async (query: string): Promise<ApiFootballFixture[]> => {
    requests++
    const response = await fetch(`${BASE}/fixtures?${query}`, { headers: { 'x-apisports-key': key } })
    if (!response.ok) throw new ApiFootballError(`API-Football /fixtures failed with HTTP ${response.status}`)
    const body = await response.json() as { errors?: unknown; response?: unknown }
    const errors = body.errors && typeof body.errors === 'object' ? Object.values(body.errors as Record<string, unknown>) : []
    if (errors.length) throw new ApiFootballError(`API-Football: ${errors.map(String).join('; ')}`)
    return Array.isArray(body.response) ? body.response as ApiFootballFixture[] : []
  }
  return {
    get requests() { return requests },
    lpfSeason: async (season: number) => (await fixtures(`league=${AF_LPF_LEAGUE}&season=${season}`)).map(item => normalizeApiFootballFixture(item, 'lpf')),
    panamaSeason: async (season: number) => (await fixtures(`team=${AF_PANAMA_TEAM}&season=${season}`)).map(item => normalizeApiFootballFixture(item, 'panama')),
  }
}
