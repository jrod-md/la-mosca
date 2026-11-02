// Used by the daily workflow after staging data/: prints "news=true" unless the only staged changes are timestamps and successful routine run entries.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { runsAreNews, sameIgnoringTimestamps } from '../src/football/dataChange'
import type { RunLog } from '../src/football/runLog'

const MAX_BUFFER = 64 * 1024 * 1024

const diff = execFileSync('git', ['diff', '--cached', '--name-status', '--', 'data/'], { encoding: 'utf8', maxBuffer: MAX_BUFFER })
const lines = diff.split('\n').filter(line => line.trim() !== '')

let anyNews = false
for (const line of lines) {
  const [status, path] = line.split('\t')
  let news = false
  if (status !== 'M') news = true
  else if (!path.endsWith('.json')) news = true
  else {
    try {
      const before = JSON.parse(execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8', maxBuffer: MAX_BUFFER }))
      const after = JSON.parse(readFileSync(path, 'utf8'))
      news = path === 'data/runs.json' ? runsAreNews(before as RunLog, after as RunLog) : !sameIgnoringTimestamps(before, after)
    } catch {
      news = true
    }
  }
  if (news) {
    console.error(`news: ${path}`)
    anyNews = true
  }
}
console.log(`news=${anyNews}`)
