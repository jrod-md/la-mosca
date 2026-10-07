import { useMemo } from 'react'
import { perceive } from '../brain/circuit'
import type { Bet, Fixture, OptionView } from '../brain/fly'
import type { Selection } from '../brain/odor'
import { teamName } from '../football/teams'
import type { MatchOdds } from '../odds/odds'
import type { Activity } from '../scene/brainCloud'
import { featured as pickFeatured, flyState, liveBets, type Featured } from './data'
import type { Brain } from './useBrain'

// The single story the page tells: one match, the fly's options, its pick (or pass), and why.
export interface Story {
  featured: Featured
  fixture: Fixture | null
  homeName: string
  awayName: string
  kickoff: string | null
  venue: string | null
  competition: 'lpf' | 'panama' | null
  odds: MatchOdds | null
  options: OptionView[] | null
  selection: Selection | null
  bet: Bet | null
  // Thinking previews need the circuit; null until it loads.
  pending: boolean
}

export const SELECTION_INDEX: Record<Selection, 0 | 1 | 2> = { home: 0, draw: 1, away: 2 }

export const useStory = (brain: Brain | null): Story => {
  const featured = useMemo(() => pickFeatured(), [])
  return useMemo(() => {
    const base = { featured, venue: null, competition: null, odds: null, options: null, selection: null, bet: null, pending: false } as const
    switch (featured.kind) {
      case 'open':
      case 'settled': {
        const bet = featured.bet
        const match = featured.kind === 'open' ? featured.match : null
        return { ...base, fixture: { id: bet.matchId, home: bet.home, away: bet.away }, homeName: bet.homeName ?? teamName(bet.home), awayName: bet.awayName ?? teamName(bet.away), kickoff: bet.kickoff,
          venue: match?.venue ?? null, competition: match?.competition ?? (bet.matchId.startsWith('elo:') ? 'panama' : 'lpf'), odds: match?.odds ?? null, options: bet.options, selection: bet.selection, bet }
      }
      case 'passed': {
        const { pass, match } = featured
        return { ...base, fixture: { id: pass.matchId, home: pass.home, away: pass.away }, homeName: pass.homeName ?? teamName(pass.home), awayName: pass.awayName ?? teamName(pass.away), kickoff: pass.kickoff,
          venue: match?.venue ?? null, competition: match?.competition ?? (pass.matchId.startsWith('elo:') ? 'panama' : 'lpf'), odds: match?.odds ?? null, options: pass.options }
      }
      case 'thinking': {
        const { match } = featured
        const fixture = { id: match.id, home: match.home.key, away: match.away.key }
        const decision = brain && match.odds ? brain.fly().decide(fixture, match.odds) : null
        return { ...base, fixture, homeName: match.home.name, awayName: match.away.name, kickoff: match.kickoff, venue: match.venue, competition: match.competition,
          odds: match.odds, options: decision?.options ?? null, selection: decision?.choice?.selection ?? null, pending: !decision }
      }
      default:
        return { ...base, fixture: null, homeName: '', awayName: '', kickoff: null }
    }
  }, [featured, brain])
}

const lastSettled = liveBets.filter(bet => bet.status === 'won' || bet.status === 'lost').sort((a, b) => a.kickoff.localeCompare(b.kickoff)).at(-1)

export const activityFor = (brain: Brain | null, story: Story): Activity | null => {
  if (!brain || !story.fixture || !story.selection || !story.options) return null
  const option = story.options.find(entry => entry.selection === story.selection)
  if (!option) return null
  const odor = brain.fly().odor(story.fixture, story.selection, option.odds)
  const perception = perceive(brain.circuit, flyState.weights, odor)
  return {
    pn: new Set(odor),
    kc: new Set(perception.activeKcs),
    mbon: perception.mbon.map((value, i) => value * brain.circuit.mbonValence[i]),
    dopamine: lastSettled ? (lastSettled.status === 'won' ? 'reward' : 'punishment') : null,
  }
}
