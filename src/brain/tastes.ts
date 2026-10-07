import { LPF_TEAMS } from '../football/teams'
import type { Fly } from './fly'

// Daily snapshots of how much the fly likes each team (innate structure plus everything learned).
export const PANAMA_KEY = 'nt:PA'
export const TASTE_TEAMS = [...LPF_TEAMS.map(team => team.id), PANAMA_KEY]

export type Snapshot = Record<string, number>
export interface TasteLog { innate: Snapshot; history: { date: string; affinity: Snapshot }[] }

export const snapshot = (fly: Fly): Snapshot =>
  Object.fromEntries(TASTE_TEAMS.map(team => [team, Math.round(fly.teamAffinity(team) * 10_000) / 10_000]))

// One entry per day; a rerun the same day replaces that day's entry.
export const recordSnapshot = (log: TasteLog, date: string, affinity: Snapshot): TasteLog => ({
  innate: log.innate,
  history: [...log.history.filter(entry => entry.date !== date), { date, affinity }].sort((a, b) => a.date.localeCompare(b.date)),
})

export interface WeeklyChange { from: string; to: string; warmed: { team: string; delta: number } | null; cooled: { team: string; delta: number } | null }

// Compares the latest snapshot with the newest one at least `days` older (or the oldest available).
export const weeklyChange = (log: TasteLog, days = 7, threshold = 0.005): WeeklyChange | null => {
  const latest = log.history.at(-1)
  if (!latest || log.history.length < 2) return null
  const cutoff = new Date(Date.parse(`${latest.date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
  const base = [...log.history].reverse().find(entry => entry.date <= cutoff) ?? log.history[0]
  if (base === latest) return null
  const deltas = Object.keys(latest.affinity).map(team => ({ team, delta: latest.affinity[team] - (base.affinity[team] ?? latest.affinity[team]) }))
  const warmed = deltas.filter(entry => entry.delta > threshold).sort((a, b) => b.delta - a.delta)[0] ?? null
  const cooled = deltas.filter(entry => entry.delta < -threshold).sort((a, b) => a.delta - b.delta)[0] ?? null
  return { from: base.date, to: latest.date, warmed, cooled }
}
