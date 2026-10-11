import type { Match } from '../football/types'
import type { Bet, Fly } from './fly'

// A postponed league match may still be played or rescheduled within days; the bet waits this
// long after its kickoff before it is voided and refunded.
export const POSTPONED_GRACE_HOURS = 72

const waitsForNewDate = (bet: Bet, match: Match, now: Date) =>
  match.status === 'void' && match.rawStatus !== 'eloratings:removed'
  && now.getTime() < Date.parse(bet.kickoff) + POSTPONED_GRACE_HOURS * 3_600_000

// Settles every open bet whose match is final, oldest kickoff first so learning happens in real
// order. Bets on postponed matches stay open (flagged) during the grace period and follow the match
// to its new date if it is rescheduled. A removed national fixture is void at once.
export const settleOpenBets = (fly: Fly, bets: readonly Bet[], matchOf: (id: string) => Match | undefined, now: Date) => {
  const book = [...bets]
  const settled: Bet[] = []
  const open = book.filter(bet => bet.status === 'open').sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  for (const bet of open) {
    const match = matchOf(bet.matchId)
    if (!match) continue
    const index = book.findIndex(entry => entry.id === bet.id)
    const waiting = waitsForNewDate(bet, match, now)
    if (waiting || (match.status !== 'finished' && match.status !== 'void')) {
      const { postponed: _was, ...rest } = bet
      book[index] = waiting ? { ...rest, postponed: true } : { ...rest, kickoff: match.status === 'scheduled' ? match.kickoff : bet.kickoff }
      continue
    }
    const othersOpen = book.filter(other => other.status === 'open' && other.id !== bet.id).length
    const result = fly.settle(bet, match, othersOpen)
    book[index] = result
    settled.push(result)
  }
  return { bets: book, settled }
}
