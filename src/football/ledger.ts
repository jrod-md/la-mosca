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

export const utcDay = (date: Date, offsetDays: number): string =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offsetDays)).toISOString().slice(0, 10)
