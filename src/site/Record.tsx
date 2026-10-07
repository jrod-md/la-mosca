import { teamName } from '../football/teams'
import { LPF_TEAMS } from '../football/teams'
import { infancy, liveBets, nextDailyRun } from './data'
import { day, money, odds as formatOdds, shortDay } from './format'
import { useLanguage, useT } from './i18n'
import { selectionLabel } from './Slip'

export function Ledger() {
  const t = useT()
  const { language } = useLanguage()
  const bets = [...liveBets].sort((a, b) => b.kickoff.localeCompare(a.kickoff))
  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <div className="section-head"><h2 id="ledger-title">{t('recordTitle')}</h2></div>
      {bets.length === 0 ? (
        <p className="ledger__empty">{t('recordEmpty', { date: day(nextDailyRun().toISOString(), language) })}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr><th scope="col">{t('colDate')}</th><th scope="col">{t('colMatch')}</th><th scope="col">{t('colPick')}</th><th scope="col">{t('colOdds')}</th><th scope="col">{t('colStake')}</th><th scope="col">{t('colResult')}</th><th scope="col">{t('colBalance')}</th></tr></thead>
            <tbody>
              {bets.map(bet => (
                <tr key={bet.id} data-status={bet.status}>
                  <td>{shortDay(bet.kickoff, language)}</td>
                  <td>{teamName(bet.home)} {t('vs')} {teamName(bet.away)}</td>
                  <td>{selectionLabel(t, bet.selection, teamName(bet.home), teamName(bet.away))}</td>
                  <td className="num">{formatOdds(bet.odds)}</td>
                  <td className="num">{money(bet.stake)}</td>
                  <td>{t(bet.status)}{bet.result ? ` ${bet.result}` : ''}</td>
                  <td className="num">{money(bet.bankrollAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function Infancy() {
  const t = useT()
  const { language } = useLanguage()
  const { curve, summary } = infancy
  const width = 600, height = 140
  const max = Math.max(...curve.map(([, value]) => value), 100)
  const points = curve.map(([, value], i) => `${(i / Math.max(1, curve.length - 1)) * width},${height - (value / max) * height}`).join(' ')
  const baseline = height - (100 / max) * height
  return (
    <section className="infancy" aria-labelledby="infancy-title">
      <div className="section-head"><h2 id="infancy-title">{t('infancyTitle')}</h2></div>
      <p>{t('infancyLead', { matches: infancy.matches, from: day(infancy.from, language), to: day(infancy.to, language) })}</p>
      <p>{t('infancyStats', { bets: summary.bets, won: summary.won, bankruptcies: summary.bankruptcies })}</p>
      <figure className="chart">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${t('infancyChart')}: ${money(curve[0]?.[1] ?? 100)} → ${money(curve.at(-1)?.[1] ?? 0)}`}>
          <line x1="0" x2={width} y1={baseline} y2={baseline} className="chart__baseline" />
          <polyline points={points} className="chart__line" />
        </svg>
        <figcaption>{t('infancyChart')}. <span className="chart__legend" aria-hidden="true" /> B/. 100</figcaption>
      </figure>
    </section>
  )
}

export function Tastes() {
  const t = useT()
  const names = new Map(LPF_TEAMS.map(team => [team.id, team.name]))
  const rows = [...infancy.affinity].sort((a, b) => b.learned - a.learned)
  const max = Math.max(...rows.flatMap(row => [row.innate, row.learned]))
  return (
    <section className="tastes" aria-labelledby="tastes-title">
      <div className="section-head">
        <h2 id="tastes-title">{t('tastesTitle')}</h2>
        <p>{t('tastesLead')}</p>
      </div>
      <ol className="tastes__list">
        {rows.map(row => (
          <li key={row.team}>
            <span className="tastes__name">{names.get(row.team) ?? row.team}</span>
            <span className="tastes__bar" aria-label={`${t('innate')} ${row.innate.toFixed(2)}, ${t('learned')} ${row.learned.toFixed(2)}`}>
              <span className="tastes__learned" style={{ inlineSize: `${(Math.max(0, row.learned) / max) * 100}%` }} />
              <span className="tastes__innate" style={{ insetInlineStart: `${(Math.max(0, row.innate) / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ol>
      <p className="fine"><span className="key key--learned" /> {t('learned')} · <span className="key key--innate" /> {t('innate')}. {t('tastesNote')}</p>
    </section>
  )
}
