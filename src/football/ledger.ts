import type { Match } from './types'

const byKickoff = (a: Match, b: Match) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id)

// Upsert by id. A settled result is never downgraded by a later, less certain read.
export const mergeMatches = (existing: readonly Match[], incoming: readonly Match[]) => {
  const merged = new Map(existing.map(match => [match.id, match]))
  let added = 0, updated = 0
  for (const match of incoming) {
    const previous = merged.get(match.id)
    if (!previous) {
      merged.set(match.id, match)
      added++
      continue
    }
    if (previous.status === 'finished' && match.status !== 'finished') continue
    const next: Match = {
      ...match,
      sources: { apiFootball: match.sources.apiFootball ?? previous.sources.apiFootball, theSportsDb: match.sources.theSportsDb ?? previous.sources.theSportsDb },
      venue: match.venue ?? previous.venue,
      round: match.round ?? previous.round,
    }
    if (JSON.stringify(next) !== JSON.stringify(previous)) {
      merged.set(match.id, next)
      updated++
    }
  }
  return { matches: [...merged.values()].sort(byKickoff), added, updated }
}

// National fixtures carry their date in the id, so a rescheduled one arrives as a new match and the
// old entry would stay "scheduled" forever. Scheduled eloratings fixtures the source no longer lists
// are voided: at once when still in the future, after a week when the date passed without a result.
export const RESULT_GRACE_DAYS = 7
export const retireStaleFixtures = (matches: readonly Match[], listed: ReadonlySet<string>, now: Date) => {
  const today = now.toISOString().slice(0, 10)
  const expired = new Date(now.getTime() - RESULT_GRACE_DAYS * 86_400_000).toISOString().slice(0, 10)
  const retired: string[] = []
  const next = matches.map(match => {
    if (!match.id.startsWith('elo:') || match.status !== 'scheduled' || listed.has(match.id)) return match
    const date = match.kickoff.slice(0, 10)
    if (date <= today && date > expired) return match
    retired.push(match.id)
    return { ...match, status: 'void' as const, rawStatus: 'eloratings:removed' }
  })
  return { matches: next, retired }
}

export const utcDay = (date: Date, offsetDays: number): string =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offsetDays)).toISOString().slice(0, 10)
