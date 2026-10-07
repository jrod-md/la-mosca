import type { Match } from '../football/types'
import { EloBook, type EloParams } from './elo'
import { coordinateSearch } from './search'
import { expectedGoals, marketProbabilities, MAX_GOALS, scoreMatrix, type GoalParams, type MarketProbabilities } from './goals'

export interface OddsModelParams {
  elo: EloParams
  goals: GoalParams
}

export const DEFAULT_PARAMS: OddsModelParams = {
  elo: { k: 20, homeAdvantage: 50, seasonRegression: 0.3, initial: 1500, newcomer: 1450 },
  goals: { base: 0.05, home: 0.15, slope: 1, rho: -0.05 },
}

// Early predictions come from flat ratings; they are excluded from every metric.
export const WARMUP_MATCHES = 50

export const predict = (diff: number, params: OddsModelParams): MarketProbabilities => {
  const lambda = expectedGoals(diff, params.goals)
  return marketProbabilities(scoreMatrix(lambda.home, lambda.away, params.goals.rho))
}

const settled = (matches: readonly Match[]) => matches.filter(match => match.status === 'finished' && match.score)
  .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))

// Each prediction sees only earlier results: predict, then update.
export const walkForward = (matches: readonly Match[], params: OddsModelParams, visit?: (match: Match, diff: number, index: number) => void): EloBook => {
  const book = new EloBook(params.elo)
  settled(matches).forEach((match, index) => {
    const diff = book.prepare(match)
    visit?.(match, diff, index)
    book.update(match)
  })
  return book
}

const outcome = (match: Match) => match.score!.home > match.score!.away ? 0 : match.score!.home === match.score!.away ? 1 : 2
const brier = (probabilities: number[], actual: number) => probabilities.reduce((sum, p, i) => sum + (p - (i === actual ? 1 : 0)) ** 2, 0)

export interface Evaluation { n: number; resultLogLoss: number; brier: number; scoreLogLoss?: number }

export const evaluate = (matches: readonly Match[], params: OddsModelParams): Required<Evaluation> => {
  let n = 0, result = 0, score = 0, squared = 0
  walkForward(matches, params, (match, diff, index) => {
    if (index < WARMUP_MATCHES) return
    const lambda = expectedGoals(diff, params.goals)
    const matrix = scoreMatrix(lambda.home, lambda.away, params.goals.rho)
    const markets = marketProbabilities(matrix)
    const probabilities = [markets.home, markets.draw, markets.away]
    const actual = outcome(match)
    n++
    result -= Math.log(Math.max(1e-12, probabilities[actual]))
    score -= Math.log(Math.max(1e-12, matrix[Math.min(MAX_GOALS, match.score!.home)][Math.min(MAX_GOALS, match.score!.away)]))
    squared += brier(probabilities, actual)
  })
  return { n, resultLogLoss: result / n, scoreLogLoss: score / n, brier: squared / n }
}

// Naive reference: running home/draw/away frequencies (Laplace-smoothed), same walk-forward rules.
export const evaluateBaseline = (matches: readonly Match[]): Evaluation => {
  const counts = [1, 1, 1]
  let n = 0, result = 0, squared = 0
  settled(matches).forEach((match, index) => {
    const actual = outcome(match)
    if (index >= WARMUP_MATCHES) {
      const total = counts[0] + counts[1] + counts[2]
      const probabilities = counts.map(count => count / total)
      n++
      result -= Math.log(probabilities[actual])
      squared += brier(probabilities, actual)
    }
    counts[actual]++
  })
  return { n, resultLogLoss: result / n, brier: squared / n }
}

const KEYS = [['elo', 'k'], ['elo', 'homeAdvantage'], ['elo', 'seasonRegression'], ['goals', 'base'], ['goals', 'home'], ['goals', 'slope'], ['goals', 'rho']] as const
const BOUNDS: [number, number][] = [[1, 80], [0, 150], [0, 1], [-1, 1], [-0.5, 0.8], [0, 3], [-0.3, 0.3]]
const STEPS = [5, 20, 0.1, 0.05, 0.05, 0.2, 0.03]

const toParams = (vector: number[], template: OddsModelParams): OddsModelParams => {
  const params: OddsModelParams = { elo: { ...template.elo }, goals: { ...template.goals } }
  KEYS.forEach(([group, key], i) => { (params[group] as unknown as Record<string, number>)[key] = vector[i] })
  return params
}

// Deterministic coordinate search on exact-score log loss, which covers every market at once.
export const fitParams = (matches: readonly Match[], start = DEFAULT_PARAMS, rounds = 12) => {
  const initial = KEYS.map(([group, key]) => (start[group] as unknown as Record<string, number>)[key])
  const fit = coordinateSearch(initial, STEPS, BOUNDS, candidate => evaluate(matches, toParams(candidate, start)).scoreLogLoss, rounds)
  return { params: toParams(fit.vector, start), scoreLogLoss: fit.loss, evaluations: fit.evaluations }
}
