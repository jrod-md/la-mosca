// Public, append-only record of every automated job run, successful or not.
export interface RunEntry {
  at: string
  job: 'sync-matches'
  ok: boolean
  window?: { from: string; to: string }
  fetched?: number
  added?: number
  updated?: number
  newlyFinished?: string[]
  unsettled?: string[]
  error?: string
}

export interface RunLog {
  runs: RunEntry[]
}

export const appendRun = (log: RunLog, entry: RunEntry): RunLog => ({ runs: [...log.runs, entry] })
