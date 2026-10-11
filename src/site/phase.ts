// Where a match stands on the visitor's clock. The site is rebuilt once a day, so anything that
// depends on "has it kicked off yet" is worked out in the browser, not baked into the data.
export type MatchPhase = 'before' | 'today' | 'playing' | 'after'

// Long enough for stoppage time and a late start.
const MATCH_MINUTES = 135
// Panama has no daylight saving: local date is UTC-5.
export const panamaDay = (date: Date) => new Date(date.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)

// National fixtures (ids "elo:...") only publish a date: they are "today" for that whole Panama day.
export const matchPhase = (kickoff: string, matchId: string, now: Date): MatchPhase => {
  if (matchId.startsWith('elo:')) {
    const day = kickoff.slice(0, 10), today = panamaDay(now)
    return today < day ? 'before' : today === day ? 'today' : 'after'
  }
  const start = Date.parse(kickoff)
  return now.getTime() < start ? 'before' : now.getTime() < start + MATCH_MINUTES * 60_000 ? 'playing' : 'after'
}

// Days until Panama's next match, counted in Panama dates: 0 today, 1 tomorrow; null if none is listed.
export const seleCountdown = (now: Date, upcoming: readonly { competition: string; kickoff: string; id: string }[]): { days: number; date: string } | null => {
  const today = panamaDay(now)
  const dates = upcoming.filter(match => match.competition === 'panama')
    .map(match => match.id.startsWith('elo:') ? match.kickoff.slice(0, 10) : panamaDay(new Date(match.kickoff)))
    .filter(date => date >= today).sort()
  if (!dates.length) return null
  return { days: Math.round((Date.parse(dates[0]) - Date.parse(today)) / 86_400_000), date: dates[0] }
}

// The visitor's clock; ?ahora=2026-11-12T15:00:00Z previews the page at another moment.
export const siteNow = (): Date => {
  const forced = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('ahora')
  const date = forced ? new Date(forced) : null
  return date && !Number.isNaN(date.getTime()) ? date : new Date()
}
