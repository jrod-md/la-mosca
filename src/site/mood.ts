import type { FlyMood } from '../scene/fly3d'
import type { RecentNationalMatch, UpcomingMatch } from '../odds/upcoming'

// Visitor's local hour; ?hora=8 previews a given hour.
export const visitorHour = () => {
  const params = new URLSearchParams(window.location.search)
  const forced = Number(params.get('hora'))
  return params.has('hora') && Number.isInteger(forced) && forced >= 0 && forced < 24 ? forced : new Date().getHours()
}

// The fly's mood follows the visitor's clock and the national team's official calendar.
// Priority: asleep (00:00-05:00) > nervous (official Panama match today) > celebrating
// (Panama won an official match in the last two days) > its usual self.
const MOODS: FlyMood[] = ['idle', 'thinking', 'sleeping', 'nervous', 'celebrating']

// Friendlies do not count; everything else (Nations League, qualifiers, Gold Cup, World Cup) does.
export const isOfficial = (league: string) => !/amistoso|friendl/i.test(league)

const panamaDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama' }).format(date)

export const panamaWon = (match: RecentNationalMatch) =>
  (match.home === 'PA' && match.score.home > match.score.away) || (match.away === 'PA' && match.score.away > match.score.home)

export const moodAt = (now: Date, hour: number, upcoming: readonly UpcomingMatch[], recent: readonly RecentNationalMatch[], thinking: boolean): FlyMood => {
  // ?animo=sleeping|nervous|celebrating previews a mood.
  const forced = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('animo') as FlyMood | null
  if (forced && MOODS.includes(forced)) return forced
  if (hour < 5) return 'sleeping'
  const today = panamaDate(now)
  if (upcoming.some(match => match.competition === 'panama' && isOfficial(match.league) && match.kickoff.slice(0, 10) === today)) return 'nervous'
  const twoDaysAgo = panamaDate(new Date(now.getTime() - 2 * 86_400_000))
  if (recent.some(match => isOfficial(match.league) && match.date >= twoDaysAgo && match.date <= today && panamaWon(match))) return 'celebrating'
  return thinking ? 'thinking' : 'idle'
}
