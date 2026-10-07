// Elo difference -> expected goals -> Dixon-Coles score matrix -> every market at once.
export interface GoalParams {
  base: number
  home: number
  slope: number
  // Dixon-Coles low-score dependence; negative values raise 0-0 and 1-1.
  rho: number
}

export const MAX_GOALS = 10

export const expectedGoals = (diff: number, params: GoalParams) => ({
  home: Math.exp(params.base + params.home + params.slope * diff / 400),
  away: Math.exp(params.base - params.slope * diff / 400),
})

const poisson = (goals: number, lambda: number): number => {
  let probability = Math.exp(-lambda)
  for (let i = 1; i <= goals; i++) probability *= lambda / i
  return probability
}

const dixonColes = (home: number, away: number, lambdaHome: number, lambdaAway: number, rho: number): number =>
  home === 0 && away === 0 ? 1 - lambdaHome * lambdaAway * rho
    : home === 0 && away === 1 ? 1 + lambdaHome * rho
      : home === 1 && away === 0 ? 1 + lambdaAway * rho
        : home === 1 && away === 1 ? 1 - rho : 1

// matrix[home][away], normalized over 0..MAX_GOALS.
export const scoreMatrix = (lambdaHome: number, lambdaAway: number, rho: number): number[][] => {
  const matrix = Array.from({ length: MAX_GOALS + 1 }, (_, home) => Array.from({ length: MAX_GOALS + 1 }, (_, away) =>
    Math.max(0, poisson(home, lambdaHome) * poisson(away, lambdaAway) * dixonColes(home, away, lambdaHome, lambdaAway, rho))))
  const total = matrix.flat().reduce((sum, value) => sum + value, 0)
  return matrix.map(row => row.map(value => value / total))
}

export interface MarketProbabilities {
  home: number
  draw: number
  away: number
  over25: number
  btts: number
  scores: { home: number; away: number; probability: number }[]
}

export const marketProbabilities = (matrix: number[][]): MarketProbabilities => {
  const result: MarketProbabilities = { home: 0, draw: 0, away: 0, over25: 0, btts: 0, scores: [] }
  matrix.forEach((row, home) => row.forEach((probability, away) => {
    if (home > away) result.home += probability
    else if (home === away) result.draw += probability
    else result.away += probability
    if (home + away > 2) result.over25 += probability
    if (home > 0 && away > 0) result.btts += probability
    result.scores.push({ home, away, probability })
  }))
  result.scores.sort((a, b) => b.probability - a.probability)
  return result
}
