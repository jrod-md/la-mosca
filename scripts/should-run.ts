// Used by the daily workflow's backup slots: prints "done=true" when this slot has nothing to do.
import { existsSync, readFileSync } from 'node:fs'
import type { BetBook } from '../src/brain/fly'
import { slotHasWork, type RunLog } from '../src/football/runLog'

const read = <T>(file: string, fallback: T): T => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback
const work = slotHasWork(read<RunLog>('data/runs.json', { runs: [] }), read<BetBook>('data/fly/bets.json', { bets: [] }).bets, new Date())
console.log(`done=${!work}`)
