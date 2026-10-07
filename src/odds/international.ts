import type { EloResult } from '../football/eloratings'
import { venueOf } from '../football/eloratings'
import { expectedGoals, marketProbabilities, MAX_GOALS, scoreMatrix, type MarketProbabilities } from './goals'
import { coordinateSearch } from './search'

// National team pricing: World Football Elo ratings (with their +100 home convention) drive the
// same Dixon-Coles goal model as the league, with goal parameters fitted on Panama's own history.
export const HOME_ADVANTAGE = 100

export interface InternationalParams { base: number; slope: number; rho: number }
export const DEFAULT_INTERNATIONAL: InternationalParams = { base: 0.1, slope: 1, rho: -0.05 }

// Rating gap from the home side's view, including home advantage when one side plays at home.
export const ratingGap = (homeRating: number, awayRating: number, home: string, away: string, venue: string) =>
  homeRating - awayRating + (venue === home ? HOME_ADVANTAGE : venue === away ? -HOME_ADVANTAGE : 0)

export const priceInternational = (gap: number, params: InternationalParams): MarketProbabilities => {
  const lambda = expectedGoals(gap, { base: params.base, home: 0, slope: params.slope, rho: params.rho })
  return marketProbabilities(scoreMatrix(lambda.home, lambda.away, params.rho))
}

const outcome = (result: EloResult) => result.homeGoals > result.awayGoals ? 0 : result.homeGoals === result.awayGoals ? 1 : 2

// Ratings in the file are pre-match (reconstructed), so nothing here sees the future.
export const evaluateInternational = (results: readonly EloResult[], params: InternationalParams) => {
  let score = 0, result = 0
  for (const match of results) {
    const gap = ratingGap(match.homeBefore, match.awayBefore, match.home, match.away, venueOf(match))
    const lambda = expectedGoals(gap, { base: params.base, home: 0, slope: params.slope, rho: params.rho })
    const matrix = scoreMatrix(lambda.home, lambda.away, params.rho)
    const markets = marketProbabilities(matrix)
    score -= Math.log(Math.max(1e-12, matrix[Math.min(MAX_GOALS, match.homeGoals)][Math.min(MAX_GOALS, match.awayGoals)]))
    result -= Math.log(Math.max(1e-12, [markets.home, markets.draw, markets.away][outcome(match)]))
  }
  return { n: results.length, scoreLogLoss: score / results.length, resultLogLoss: result / results.length }
}

// Reference: eloratings' own expectation for the win share, with draws at their observed rate.
export const evaluateEloBaseline = (results: readonly EloResult[]) => {
  const drawRate = results.filter(match => outcome(match) === 1).length / results.length
  let loss = 0
  for (const match of results) {
    const gap = ratingGap(match.homeBefore, match.awayBefore, match.home, match.away, venueOf(match))
    const expected = 1 / (1 + 10 ** (-gap / 400))
    const home = Math.max(0.01, expected - drawRate / 2), away = Math.max(0.01, 1 - expected - drawRate / 2)
    const total = home + drawRate + away
    loss -= Math.log([home / total, drawRate / total, away / total][outcome(match)])
  }
  return { n: results.length, resultLogLoss: loss / results.length }
}

export const fitInternational = (results: readonly EloResult[]) => {
  const keys = ['base', 'slope', 'rho'] as const
  const toParams = (vector: number[]) => Object.fromEntries(keys.map((key, i) => [key, vector[i]])) as unknown as InternationalParams
  const fit = coordinateSearch(keys.map(key => DEFAULT_INTERNATIONAL[key]), [0.1, 0.2, 0.03], [[-1, 1], [0, 3], [-0.3, 0.3]],
    vector => evaluateInternational(results, toParams(vector)).scoreLogLoss)
  return { params: toParams(fit.vector), evaluations: fit.evaluations }
}
