// Public, append-only record of every automated job run, successful or not.
export interface RunEntry {
  at: string
  job: 'sync-matches' | 'backfill-matches' | 'fly-daily'
  ok: boolean
  window?: { from: string; to: string }
  fetched?: number
  added?: number
  updated?: number
  newlyFinished?: string[]
  unsettled?: string[]
  settled?: number
  placed?: number
  passed?: number
  error?: string
}

export interface RunLog {
  runs: RunEntry[]
}

export const appendRun = (log: RunLog, entry: RunEntry): RunLog => ({ runs: [...log.runs, entry] })

// Panama has no daylight saving: local date is UTC-5.
const panamaDay = (iso: string) => new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(0, 10)
const RESULT_DELAY_HOURS = 3

// Whether a scheduled slot still has work: the fly has not had its day yet, or a bet on a match
// that should be over is still waiting for its result (the source can publish results late).
export const slotHasWork = (log: RunLog, bets: readonly { status: string; kickoff: string; postponed?: boolean }[], now: Date): boolean => {
  const today = panamaDay(now.toISOString())
  const ranToday = log.runs.some(run => run.job === 'fly-daily' && run.ok && panamaDay(run.at) === today)
  const owed = bets.some(bet => bet.status === 'open' && !bet.postponed && Date.parse(bet.kickoff) + RESULT_DELAY_HOURS * 3_600_000 < now.getTime())
  return !ranToday || owed
}
