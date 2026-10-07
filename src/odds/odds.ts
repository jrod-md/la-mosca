import type { MarketProbabilities } from './goals'

// Simulated bookmaker overround, close to what regional books charge on 1X2.
export const BOOK_MARGIN = 0.06

export const toOdds = (probability: number, margin = BOOK_MARGIN): number =>
  Math.min(500, Math.max(1.01, Math.round(100 / (probability * (1 + margin))) / 100))

export interface MatchOdds {
  result: { home: number; draw: number; away: number }
  total25: { over: number; under: number }
  btts: { yes: number; no: number }
  correctScore: { score: string; odds: number }[]
}

export const priceMarkets = (markets: MarketProbabilities, margin = BOOK_MARGIN): MatchOdds => ({
  result: { home: toOdds(markets.home, margin), draw: toOdds(markets.draw, margin), away: toOdds(markets.away, margin) },
  total25: { over: toOdds(markets.over25, margin), under: toOdds(1 - markets.over25, margin) },
  btts: { yes: toOdds(markets.btts, margin), no: toOdds(1 - markets.btts, margin) },
  // Correct-score books carry a wider margin.
  correctScore: markets.scores.slice(0, 8).map(score => ({ score: `${score.home}-${score.away}`, odds: toOdds(score.probability, margin * 2.5) })),
})
