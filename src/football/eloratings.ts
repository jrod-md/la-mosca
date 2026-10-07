import type { Match, TeamRef } from './types'

// World Football Elo Ratings (eloratings.net): national team ratings, every Panama result since
// 1938, and scheduled fixtures with the country where each is played. Plain TSV files.
const BASE = 'https://www.eloratings.net/'
export const PANAMA = 'PA'

// Spanish display names for the usual CONCACAF opponents; other teams keep eloratings' English name.
const SPANISH_NAMES: Record<string, string> = {
  PA: 'Panamá', CW: 'Curazao', MX: 'México', US: 'Estados Unidos', CR: 'Costa Rica', HN: 'Honduras', JM: 'Jamaica',
  CA: 'Canadá', SV: 'El Salvador', GT: 'Guatemala', HT: 'Haití', TT: 'Trinidad y Tobago', NI: 'Nicaragua', SR: 'Surinam',
  GP: 'Guadalupe', MQ: 'Martinica', DO: 'República Dominicana', CU: 'Cuba', BZ: 'Belice', GY: 'Guyana', PR: 'Puerto Rico',
  BR: 'Brasil', AR: 'Argentina', CO: 'Colombia', EC: 'Ecuador', VE: 'Venezuela', PE: 'Perú', CL: 'Chile', UY: 'Uruguay',
  PY: 'Paraguay', BO: 'Bolivia', JP: 'Japón', KR: 'Corea del Sur', NZ: 'Nueva Zelanda', EN: 'Inglaterra', HR: 'Croacia', ES: 'España',
}

const TOURNAMENTS: Record<string, string> = {
  CNL: 'Liga de Naciones Concacaf', WQ: 'Eliminatoria mundialista', WC: 'Copa del Mundo', GC: 'Copa Oro', CA: 'Copa América',
  F: 'Amistoso', FT: 'Torneo amistoso',
}

export interface EloResult { date: string; home: string; away: string; homeGoals: number; awayGoals: number; tournament: string; venue: string; homeBefore: number; awayBefore: number }
export interface EloFixture { date: string; home: string; away: string; tournament: string; venue: string }

const rows = (tsv: string) => tsv.split('\n').map(line => line.replace(/\r$/, '')).filter(Boolean).map(line => line.split('\t'))
// eloratings writes negative numbers with a Unicode minus sign.
const number = (value: string) => Number(value.replace('−', '-'))
const isoDate = (y: string, m: string, d: string) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`

// World.tsv: rank, rank, code, rating, ...
export const parseRatings = (tsv: string): Record<string, number> =>
  Object.fromEntries(rows(tsv).filter(row => row.length > 3 && Number.isFinite(number(row[3]))).map(row => [row[2], number(row[3])]))

export const parseNames = (tsv: string): Record<string, string> =>
  Object.fromEntries(rows(tsv).filter(row => row.length >= 2).map(row => [row[0], row[1]]))

// <Team>.tsv: y m d home away hg ag tournament venue change homeAfter awayAfter ...
// `change` is the home side's rating change, so pre-match ratings are after minus/plus change.
export const parseResults = (tsv: string): EloResult[] => rows(tsv).filter(row => row.length >= 12).map(row => {
  const change = number(row[9])
  return {
    date: isoDate(row[0], row[1], row[2]), home: row[3], away: row[4], homeGoals: number(row[5]), awayGoals: number(row[6]),
    tournament: row[7], venue: row[8], homeBefore: number(row[10]) - change, awayBefore: number(row[11]) + change,
  }
}).filter(result => [result.homeGoals, result.awayGoals, result.homeBefore, result.awayBefore].every(Number.isFinite))

// fixtures.tsv: y m d home away tournament venue ... ; day "00" means the date is not set yet.
export const parseFixtures = (tsv: string): EloFixture[] => rows(tsv).filter(row => row.length >= 7 && row[2] !== '00')
  .map(row => ({ date: isoDate(row[0], row[1], row[2]), home: row[3], away: row[4], tournament: row[5], venue: row[6] || row[3] }))

// An empty venue in results means the listed home side played at home.
export const venueOf = (result: Pick<EloResult, 'home' | 'venue'>) => result.venue || result.home

export const teamRef = (code: string, names: Record<string, string>): TeamRef =>
  ({ name: SPANISH_NAMES[code] ?? names[code] ?? code, sourceId: `nt:${code}`, badge: null })

export const nationalCode = (team: TeamRef) => team.sourceId.startsWith('nt:') ? team.sourceId.slice(3) : null

const toMatch = (entry: EloFixture | EloResult, names: Record<string, string>): Match => {
  const result = 'homeGoals' in entry ? entry : null
  return {
    id: `elo:${entry.date}:${entry.home}-${entry.away}`,
    sources: { apiFootball: null, theSportsDb: null },
    competition: 'panama',
    league: TOURNAMENTS[entry.tournament] ?? entry.tournament,
    season: entry.date.slice(0, 4),
    round: null,
    // Only the date is published; noon UTC (07:00 in Panama) on that date stands in for kickoff.
    kickoff: `${entry.date}T12:00:00.000Z`,
    kickoffTimeKnown: false,
    home: teamRef(entry.home, names),
    away: teamRef(entry.away, names),
    status: result ? 'finished' : 'scheduled',
    rawStatus: result ? 'eloratings:result' : 'eloratings:fixture',
    score: result ? { home: result.homeGoals, away: result.awayGoals } : null,
    venue: SPANISH_NAMES[venueOf(entry)] ?? names[venueOf(entry)] ?? venueOf(entry),
    venueCountry: venueOf(entry),
  }
}

const involvesPanama = (entry: { home: string; away: string }) => entry.home === PANAMA || entry.away === PANAMA

export const createEloratingsClient = (fetchText: (url: string) => Promise<string>) => {
  const get = (file: string) => fetchText(`${BASE}${file}`)
  return {
    ratings: async () => parseRatings(await get('World.tsv')),
    names: async () => parseNames(await get('en.teams.tsv')),
    panamaHistory: async () => parseResults(await get('Panama.tsv')),
    // Panama's recent results and scheduled fixtures as ledger matches.
    panamaMatches: async (names: Record<string, string>, since: string) => {
      const [history, fixtures] = await Promise.all([get('Panama.tsv'), get('fixtures.tsv')])
      return [
        ...parseResults(history).filter(result => result.date >= since).map(result => toMatch(result, names)),
        ...parseFixtures(fixtures).filter(involvesPanama).map(fixture => toMatch(fixture, names)),
      ]
    },
  }
}
