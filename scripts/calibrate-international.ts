// Fits the national team bookmaker on Panama's results since 2006 (eloratings.net) and writes
// data/model/international-model.json. Also run monthly by the calibration workflow.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { createEloratingsClient } from '../src/football/eloratings'
import { evaluateEloBaseline, evaluateInternational, fitInternational } from '../src/odds/international'

const OUTPUT = 'data/model/international-model.json'
const SINCE = '2006-01-01'

const fetchText = async (url: string) => {
  const response = await fetch(url, { headers: { 'user-agent': 'la-mosca (github.com/jrod-md/la-mosca)' } })
  if (!response.ok) throw new Error(`eloratings ${url.split('/').pop()} failed with HTTP ${response.status}`)
  return response.text()
}

const main = async () => {
  const history = (await createEloratingsClient(fetchText).panamaHistory()).filter(result => result.date >= SINCE)
  if (history.length < 100) throw new Error(`Only ${history.length} Panama results; refusing to fit`)
  const fit = fitInternational(history)
  const model = evaluateInternational(history, fit.params)
  const baseline = evaluateEloBaseline(history)
  mkdirSync('data/model', { recursive: true })
  writeFileSync(`${OUTPUT}.tmp`, JSON.stringify({
    fittedAt: new Date().toISOString(), source: 'World Football Elo Ratings (eloratings.net), Panama results', since: SINCE,
    trainedOn: history.length, params: fit.params, metrics: { model, baseline },
    method: 'Pre-match Elo gap (+100 home) -> Dixon-Coles Poisson; coordinate search on exact-score log loss',
  }, null, 1) + '\n')
  renameSync(`${OUTPUT}.tmp`, OUTPUT)
  console.log(`Trained on ${history.length} Panama matches since ${SINCE}. Params ${JSON.stringify(fit.params)}`)
  console.log(`1X2 log loss  model ${model.resultLogLoss.toFixed(3)}  vs Elo baseline ${baseline.resultLogLoss.toFixed(3)} (lower is better)`)
}

main().catch(error => {
  console.error(`International calibration failed: ${error instanceof Error ? error.message : 'unknown error'}`)
  process.exitCode = 1
})
