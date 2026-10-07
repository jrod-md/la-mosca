export type Competition = 'lpf' | 'panama'

// 'unknown' covers live, ambiguous or unrecognized source statuses. It is never settled.
export type MatchStatus = 'scheduled' | 'finished' | 'void' | 'unknown'

export interface TeamRef {
  name: string
  // Source-prefixed id ('tsdb:139109', 'af:2868'). Cross-source team identity is resolved later.
  sourceId: string
  badge: string | null
}

export interface Match {
  // 'af:<fixtureId>' whenever an API-Football id is known, so both sources share one key.
  id: string
  sources: { apiFootball: number | null; theSportsDb: string | null }
  competition: Competition
  league: string
  season: string
  round: string | null
  kickoff: string
  home: TeamRef
  away: TeamRef
  status: MatchStatus
  rawStatus: string | null
  score: { home: number; away: number } | null
  venue: string | null
  // National team matches (eloratings): only the date is known, and the country where it is played.
  kickoffTimeKnown?: boolean
  venueCountry?: string | null
}

export interface MatchLedger {
  updatedAt: string
  matches: Match[]
}

export type JsonFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export const toInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

export const matchId = (apiFootball: number | null, fallback: string): string => apiFootball !== null ? `af:${apiFootball}` : fallback
