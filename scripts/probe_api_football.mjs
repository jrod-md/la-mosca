// One-off coverage probe for API-Football (~5 requests of the daily quota).
// Reads API_FOOTBALL_KEY from the process environment only; the key is never printed.
const BASE = 'https://v3.football.api-sports.io'
const key = process.env.API_FOOTBALL_KEY?.trim()
if (!key) {
  console.error('API_FOOTBALL_KEY is missing. Nothing requested.')
  process.exit(2)
}

let used = 0
const get = async (path) => {
  used++
  const response = await fetch(`${BASE}${path}`, { headers: { 'x-apisports-key': key } })
  if (!response.ok) return { path, httpStatus: response.status, errors: 'HTTP error', response: [] }
  const body = await response.json()
  const errors = Array.isArray(body.errors) ? (body.errors.length ? body.errors : null) : Object.keys(body.errors ?? {}).length ? body.errors : null
  return { path, errors, results: body.results, response: body.response ?? [] }
}

const summarizeFixture = ({ fixture, league, teams, goals }) => ({
  id: fixture.id, date: fixture.date, status: fixture.status?.short, league: league?.name, round: league?.round,
  home: teams.home.name, away: teams.away.name, goals: `${goals.home ?? '-'}-${goals.away ?? '-'}`,
})

const report = { probedAt: new Date().toISOString() }

const leagues = await get('/leagues?country=panama')
report.leagues = { errors: leagues.errors, items: leagues.response.map(({ league, seasons }) => {
  const current = seasons.find(season => season.current) ?? seasons.at(-1)
  return { id: league.id, name: league.name, type: league.type, seasons: seasons.map(season => season.year),
    currentSeason: current?.year, currentRange: current && `${current.start} → ${current.end}`, coverage: current?.coverage }
}) }

// The top flight is the league-type entry with the most seasons on record.
const top = report.leagues.items.filter(item => item.type === 'League').sort((a, b) => b.seasons.length - a.seasons.length)[0]
if (top) {
  const fixtures = await get(`/fixtures?league=${top.id}&season=${top.currentSeason}`)
  const upcoming = fixtures.response.filter(item => ['NS', 'TBD'].includes(item.fixture.status?.short)).slice(0, 5)
  const finished = fixtures.response.filter(item => item.fixture.status?.short === 'FT').slice(-5)
  report.topLeagueCurrentSeason = { league: top.name, season: top.currentSeason, errors: fixtures.errors, total: fixtures.results,
    upcoming: upcoming.map(summarizeFixture), recentFinished: finished.map(summarizeFixture) }
  const odds = await get(`/odds?league=${top.id}&season=${top.currentSeason}`)
  const sample = odds.response[0]
  report.topLeagueOdds = { errors: odds.errors, fixturesWithOdds: odds.results,
    bookmakers: sample?.bookmakers?.map(book => book.name), betTypes: sample?.bookmakers?.[0]?.bets?.map(bet => bet.name) }
}

const teams = await get('/teams?search=panama')
const national = teams.response.find(({ team }) => team.national)?.team
report.nationalTeam = { errors: teams.errors, team: national && { id: national.id, name: national.name } }
if (national) {
  const next = await get(`/fixtures?team=${national.id}&next=5`)
  report.nationalTeam.next = { errors: next.errors, fixtures: next.response.map(summarizeFixture) }
}

report.requestsUsed = used
console.log(JSON.stringify(report, null, 2))
