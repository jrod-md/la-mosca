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
