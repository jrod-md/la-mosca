import { teamKey } from '../football/teams'
import type { Match } from '../football/types'

export interface EloParams {
  k: number
  homeAdvantage: number
  // Fraction of each rating's distance to the mean removed per season boundary.
  seasonRegression: number
  initial: number
  // Rating for a team first seen after the opening season (typically promoted).
  newcomer: number
}

export const goalMultiplier = (margin: number): number => margin <= 1 ? 1 : margin === 2 ? 1.5 : (11 + margin) / 8
export const expectedHome = (diff: number): number => 1 / (1 + 10 ** (-diff / 400))

export class EloBook {
  private readonly ratings = new Map<string, number>()
  private season: number | null = null
  private firstSeason: number | null = null

  constructor(private readonly params: EloParams) {}

  rating(key: string): number {
    return this.ratings.get(key) ?? (this.season === this.firstSeason ? this.params.initial : this.params.newcomer)
  }

  // Applies season regression if the match opens a later season; returns home minus away rating.
  prepare(match: Match): number {
    const season = Number(match.season)
    if (Number.isInteger(season)) {
      if (this.season === null) this.season = this.firstSeason = season
      else if (season > this.season) {
        const values = [...this.ratings.values()]
        const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
        const keep = (1 - this.params.seasonRegression) ** (season - this.season)
        for (const [key, value] of this.ratings) this.ratings.set(key, mean + (value - mean) * keep)
        this.season = season
      }
    }
    return this.rating(teamKey(match.home)) - this.rating(teamKey(match.away))
  }

  update(match: Match): void {
    if (match.status !== 'finished' || !match.score) return
    const home = teamKey(match.home), away = teamKey(match.away)
    const ratingHome = this.rating(home), ratingAway = this.rating(away)
    const { home: goalsHome, away: goalsAway } = match.score
    const actual = goalsHome > goalsAway ? 1 : goalsHome === goalsAway ? 0.5 : 0
    const delta = this.params.k * goalMultiplier(Math.abs(goalsHome - goalsAway)) * (actual - expectedHome(ratingHome + this.params.homeAdvantage - ratingAway))
    this.ratings.set(home, ratingHome + delta)
    this.ratings.set(away, ratingAway - delta)
  }

  table(): { key: string; rating: number }[] {
    return [...this.ratings].map(([key, rating]) => ({ key, rating })).sort((a, b) => b.rating - a.rating)
  }
}
