import { panamaDay, type RunLog } from './runLog'

// Top-level keys that only say when a file was written.
export const TIMESTAMP_KEYS = ['updatedAt', 'generatedAt', 'fetchedAt'] as const

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Two files are the same when only their top-level write timestamps differ.
export const sameIgnoringTimestamps = (before: unknown, after: unknown): boolean => {
  if (isPlainObject(before) && isPlainObject(after)) {
    const strip = (value: Record<string, unknown>) => {
      const copy = { ...value }
      for (const key of TIMESTAMP_KEYS) delete copy[key]
      return copy
    }
    return JSON.stringify(strip(before)) === JSON.stringify(strip(after))
  }
  return JSON.stringify(before) === JSON.stringify(after)
}

// New run entries are news when one failed, or when it is the fly's first successful day on its
// Panama date (the backup slots read that from the committed log).
export const runsAreNews = (before: RunLog, after: RunLog): boolean => {
  if (after.runs.length < before.runs.length) return true
  if (JSON.stringify(after.runs.slice(0, before.runs.length)) !== JSON.stringify(before.runs)) return true
  const added = after.runs.slice(before.runs.length)
  if (added.length === 0) return false
  if (added.some(entry => entry.ok === false)) return true
  const firstFlyDay = added.some(entry =>
    entry.job === 'fly-daily' && entry.ok &&
    !before.runs.some(run => run.job === 'fly-daily' && run.ok && panamaDay(run.at) === panamaDay(entry.at)))
  if (firstFlyDay) return true
  if (added.some(entry => entry.job === 'backfill-matches')) return true
  return false
}
