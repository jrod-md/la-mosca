import { teamKey } from '../football/teams'
import type { Match } from '../football/types'
import type { MatchOdds } from '../odds/odds'
import { perceive, type MbCircuit } from './circuit'
import { glomeruli, optionOdor, priceBucket, ODOR_SIZE, type Selection } from './odor'
import { randomFor } from './random'

// Behavioral settings of the simulated fly. Learning follows the mushroom body rule (dopamine
// depresses active KC->MBON synapses in its compartment); boldness is a modeled arousal state
// inspired by octopamine, not derived from the connectome.
export const FLY_PARAMS = Object.freeze({
  // Twenty balboas: a realistic weekend stake in Panama, not a round internet hundred.
  startingBankroll: 20,
  minStake: 1,
  baseStakeFraction: 0.03,
  maxStakeFraction: 0.12,
  learningRate: 0.3,
  // Per settled bet, plastic weights relax this fraction back toward the connectome value.
  recovery: 0.003,
  // The fly avoids a match when its best option falls below this share of its recent typical drive.
  abstainRatio: 0.75,
  driveBaselineRate: 0.02,
  temperature: 0.12,
  initialBoldness: 0.3,
  tiltAfterLosses: 3,
  tiltChance: 0.25,
})

export interface FlyState {
  circuitSha: string
  bankroll: number
  bankruptcies: number
  boldness: number
  winStreak: number
  lossStreak: number
  tilted: boolean
  weights: number[]
  settled: number
  // Running average of the best option's drive (sensory adaptation for the abstain rule).
  driveBaseline: number | null
}

export interface OptionView { selection: Selection; odds: number; drive: number; probability: number }

export interface Bet {
  id: string
  matchId: string
  phase: 'infancy' | 'live'
  placedAt: string
  kickoff: string
  home: string
  away: string
  market: '1x2'
  options: OptionView[]
  selection: Selection
  odds: number
  stake: number
  boldness: number
  dared: boolean
  tilted: boolean
  activeKcs: string[]
  status: 'open' | 'won' | 'lost' | 'void'
  payout: number
  bankrollAfter: number
  result: string | null
  bankrupt: boolean
}

// A recorded decision not to bet; kept public so the fly cannot reconsider later.
export interface Pass { matchId: string; decidedAt: string; kickoff: string; home: string; away: string; options: OptionView[] }

export interface BetBook { bets: Bet[]; passes?: Pass[] }

// What the fly needs to know about a fixture: its id (seeds randomness) and canonical team keys.
export interface Fixture { id: string; home: string; away: string }
export const fixtureOf = (match: Match): Fixture => ({ id: match.id, home: teamKey(match.home), away: teamKey(match.away) })

export interface ExhibitionPick { key: string; odds: number; drive: number; probability: number }
export interface Exhibition { totals: ExhibitionPick[]; btts: ExhibitionPick[]; score: ExhibitionPick[] }

export interface Decision { options: OptionView[]; choice: OptionView | null; dared: boolean; activeKcs: number[] }

const round2 = (value: number) => Math.round(value * 100) / 100

export class Fly {
  constructor(readonly circuit: MbCircuit, readonly state: FlyState) {
    if (state.circuitSha !== circuit.sha || state.weights.length !== circuit.kcToMbon.length) throw new Error('Fly state does not match this circuit')
  }

  static newborn(circuit: MbCircuit): Fly {
    return new Fly(circuit, {
      circuitSha: circuit.sha, bankroll: FLY_PARAMS.startingBankroll, bankruptcies: 0, boldness: FLY_PARAMS.initialBoldness,
      winStreak: 0, lossStreak: 0, tilted: false, weights: circuit.kcToMbon.map(synapse => synapse.weight), settled: 0, driveBaseline: null,
    })
  }

  odor(match: Fixture, selection: Selection, odds: number): number[] {
    const team = selection === 'draw' ? null : selection === 'home' ? match.home : match.away
    return optionOdor(selection, team, odds, this.circuit.pn.length)
  }

  decide(match: Fixture, odds: MatchOdds): Decision {
    const random = randomFor(`decide:${match.id}:${this.state.settled}`)
    const perceptions = (['home', 'draw', 'away'] as const).map(selection => {
      const price = odds.result[selection]
      return { selection, odds: price, perception: perceive(this.circuit, this.state.weights, this.odor(match, selection, price)) }
    })
    const boldness = this.state.tilted ? 0.95 : this.state.boldness
    const temperature = FLY_PARAMS.temperature * (0.6 + 1.4 * boldness)
    const top = Math.max(...perceptions.map(option => option.perception.drive))
    const exps = perceptions.map(option => Math.exp((option.perception.drive - top) / temperature))
    const sum = exps.reduce((a, b) => a + b, 0)
    const options: OptionView[] = perceptions.map((option, i) => ({ selection: option.selection, odds: option.odds, drive: Math.round(option.perception.drive * 1000) / 1000, probability: exps[i] / sum }))
    const baseline = this.state.driveBaseline ?? top
    this.state.driveBaseline = Math.round((baseline + FLY_PARAMS.driveBaselineRate * (top - baseline)) * 1e6) / 1e6
    if (top < baseline * FLY_PARAMS.abstainRatio) return { options, choice: null, dared: false, activeKcs: [] }

    // Daring: a bold fly sometimes goes for the longest price it does not actively avoid.
    let index: number
    let dared = false
    const approachable = options.filter(option => option.probability > 0.15)
    if (random() < 0.35 * boldness ** 2 && approachable.length > 1) {
      index = options.indexOf(approachable.reduce((best, option) => option.odds > best.odds ? option : best))
      dared = true
    } else {
      let roll = random()
      index = options.findIndex(option => (roll -= option.probability) <= 0)
      if (index < 0) index = options.length - 1
    }
    return { options, choice: options[index], dared, activeKcs: perceptions[index].perception.activeKcs }
  }

  place(match: Match, decision: Decision, phase: Bet['phase'], placedAt: string): Bet | null {
    const choice = decision.choice
    if (!choice || this.state.bankroll < FLY_PARAMS.minStake) return null
    const boldness = this.state.tilted ? 0.95 : this.state.boldness
    const conviction = Math.max(0, choice.probability - 1 / 3) * 1.5
    const fraction = Math.min(FLY_PARAMS.maxStakeFraction, FLY_PARAMS.baseStakeFraction * (1 + 2 * boldness) + 0.04 * conviction)
    const stake = Math.min(this.state.bankroll, Math.max(FLY_PARAMS.minStake, round2(this.state.bankroll * fraction)))
    this.state.bankroll = round2(this.state.bankroll - stake)
    return {
      id: `bet:${match.id}`, matchId: match.id, phase, placedAt, kickoff: match.kickoff, home: teamKey(match.home), away: teamKey(match.away),
      market: '1x2', options: decision.options, selection: choice.selection, odds: choice.odds, stake, boldness: round2(boldness), dared: decision.dared,
      tilted: this.state.tilted, activeKcs: decision.activeKcs.map(kc => this.circuit.kc[kc].id), status: 'open', payout: 0,
      bankrollAfter: this.state.bankroll, result: null, bankrupt: false,
    }
  }

  // Settles a bet against a final result and applies dopamine learning. Void matches refund.
  settle(bet: Bet, match: Match): Bet {
    if (bet.status !== 'open') return bet
    if (match.status === 'void') {
      this.state.bankroll = round2(this.state.bankroll + bet.stake)
      return { ...bet, status: 'void', payout: bet.stake, bankrollAfter: this.state.bankroll }
    }
    if (match.status !== 'finished' || !match.score) throw new Error(`Match ${match.id} is not settled`)
    const { home, away } = match.score
    const outcome: Selection = home > away ? 'home' : home === away ? 'draw' : 'away'
    const won = outcome === bet.selection
    const payout = won ? round2(bet.stake * bet.odds) : 0
    this.state.bankroll = round2(this.state.bankroll + payout)
    this.learn(bet.activeKcs, won, bet.odds)
    this.updateMood(won, randomFor(`mood:${match.id}`))
    let bankrupt = false
    if (this.state.bankroll < FLY_PARAMS.minStake) {
      bankrupt = true
      this.state.bankruptcies++
      this.state.bankroll = FLY_PARAMS.startingBankroll
    }
    return { ...bet, status: won ? 'won' : 'lost', payout, result: `${home}-${away}`, bankrollAfter: this.state.bankroll, bankrupt }
  }

  // Dopamine scales with surprise (reward prediction error against the price's implied chance):
  // an upset win rewards strongly, a lost favourite punishes strongly. In expectation the two balance.
  private learn(activeKcIds: string[], won: boolean, odds: number) {
    const active = new Set(activeKcIds.map(id => this.circuit.kc.findIndex(kc => kc.id === id)))
    const expected = Math.min(1, 1 / odds)
    const dopamine = won ? 1 - expected : expected
    const coupling = won ? this.circuit.rewardCoupling : this.circuit.punishmentCoupling
    const { weights } = this.state
    this.circuit.kcToMbon.forEach((synapse, i) => {
      if (active.has(synapse.kc)) weights[i] *= 1 - FLY_PARAMS.learningRate * dopamine * coupling[synapse.mbon]
      weights[i] += FLY_PARAMS.recovery * (synapse.weight - weights[i])
    })
    this.state.settled++
  }

  private updateMood(won: boolean, random: () => number) {
    const state = this.state
    state.tilted = false
    if (won) {
      state.winStreak++
      state.lossStreak = 0
      state.boldness += 0.08 * (1 - state.boldness)
    } else {
      state.lossStreak++
      state.winStreak = 0
      state.boldness -= 0.06 * state.boldness
      if (state.lossStreak >= FLY_PARAMS.tiltAfterLosses && random() < FLY_PARAMS.tiltChance) state.tilted = true
    }
    state.boldness = Math.round(state.boldness * 1000) / 1000
  }

  // Exhibition only ("be more specific"): the fly's leaning on secondary markets, each option smelled
  // like a 1X2 choice. Never staked, never learned from, and it does not touch the fly's state.
  exhibit(match: Fixture, odds: MatchOdds): Exhibition {
    const smell = (market: string, options: { key: string; odds: number }[]): ExhibitionPick[] => {
      const drives = options.map(option => {
        const odor = [...new Set([...glomeruli(`market:${market}:${option.key}`, ODOR_SIZE.team, this.circuit.pn.length),
          ...glomeruli(`price:${priceBucket(option.odds)}`, ODOR_SIZE.price, this.circuit.pn.length)])]
        return perceive(this.circuit, this.state.weights, odor).drive
      })
      const top = Math.max(...drives)
      const exps = drives.map(drive => Math.exp((drive - top) / FLY_PARAMS.temperature))
      const sum = exps.reduce((a, b) => a + b, 0)
      return options.map((option, i) => ({ ...option, drive: Math.round(drives[i] * 1000) / 1000, probability: exps[i] / sum }))
        .sort((a, b) => b.probability - a.probability)
    }
    return {
      totals: smell('total25', [{ key: 'over', odds: odds.total25.over }, { key: 'under', odds: odds.total25.under }]),
      btts: smell('btts', [{ key: 'yes', odds: odds.btts.yes }, { key: 'no', odds: odds.btts.no }]),
      score: smell(`score:${match.home}:${match.away}`, odds.correctScore.map(score => ({ key: score.score, odds: score.odds }))),
    }
  }

  // Innate-plus-learned approach drive toward each team's odor, neutral price and role averaged.
  teamAffinity(team: string): number {
    const drives = (['home', 'away'] as const).flatMap(selection => [1.8, 2.5, 3.5].map(odds =>
      perceive(this.circuit, this.state.weights, optionOdor(selection, team, odds, this.circuit.pn.length)).drive))
    return drives.reduce((a, b) => a + b, 0) / drives.length
  }
}
