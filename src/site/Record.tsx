import { useState } from 'react'
import { FLY_PARAMS, type Bet } from '../brain/fly'
import { PANAMA_KEY, TASTE_TEAMS, weeklyChange } from '../brain/tastes'
import { teamName } from '../football/teams'
import { infancy, liveBets, loadInfancyBets, nextDailyRun, passes, tastes } from './data'
import { day, money, odds as formatOdds } from './format'
import { useLanguage, useT } from './i18n'
import { selectionLabel } from './Slip'

const START = FLY_PARAMS.startingBankroll

interface ChartPoint { value: number; status?: Bet['status']; bankrupt?: boolean }

// Bankroll after each bet, with the starting line, wins, losses and bankruptcies marked.
function BankrollChart({ points, label, markEach }: { points: ChartPoint[]; label: string; markEach: boolean }) {
  const t = useT()
  const width = 600, height = 150, pad = 8
  const series = [{ value: START }, ...points]
  const max = Math.max(START * 1.5, ...series.map(point => point.value))
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (width - pad * 2)
  const y = (value: number) => height - pad - (value / max) * (height - pad * 2)
  const line = series.map((point, i) => `${x(i)},${y(point.value)}`).join(' ')
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${money(START)} → ${money(series.at(-1)!.value)}`}>
        <line x1={pad} x2={width - pad} y1={y(START)} y2={y(START)} className="chart__baseline" />
        <polyline points={line} className="chart__line" />
        {series.map((point, i) => point.bankrupt
          ? <line key={i} x1={x(i)} x2={x(i)} y1={pad} y2={height - pad} className="chart__bankrupt" />
          : markEach && point.status && point.status !== 'open'
            ? <circle key={i} cx={x(i)} cy={y(point.value)} r="4" className={`chart__dot chart__dot--${point.status}`} />
            : null)}
      </svg>
      <figcaption>
        {label}.
        <span><span className="chart__legend" aria-hidden="true" /> {t('chartStart')} {money(START)}</span>
        {markEach && <span><span className="chart__key chart__key--won" aria-hidden="true" /> {t('chartWon')}</span>}
        {markEach && <span><span className="chart__key chart__key--lost" aria-hidden="true" /> {t('chartLost')}</span>}
        <span><span className="chart__key chart__key--bankrupt" aria-hidden="true" /> {t('chartBankrupt', { start: START })}</span>
      </figcaption>
    </figure>
  )
}

function Totals({ bets, bankruptcies }: { bets: Bet[]; bankruptcies: number }) {
  const t = useT()
  const settled = bets.filter(bet => bet.status !== 'open')
  const staked = settled.reduce((sum, bet) => sum + bet.stake, 0)
  const returned = settled.reduce((sum, bet) => sum + bet.payout, 0)
  const won = settled.filter(bet => bet.status === 'won').length
  const decided = settled.filter(bet => bet.status !== 'void').length
  const net = returned - staked
  return (
    <dl className="totals">
      <div><dt>{t('totalStaked')}</dt><dd>{money(staked)}</dd></div>
      <div><dt>{t('totalReturned')}</dt><dd>{money(returned)}</dd></div>
      <div><dt>{t('net')}</dt><dd data-sign={net > 0 ? 'up' : net < 0 ? 'down' : 'flat'}>{net > 0 ? '+' : net < 0 ? '−' : ''}{money(Math.abs(net))}</dd></div>
      <div><dt>{t('hits')}</dt><dd>{won} / {decided}</dd></div>
      <div><dt>{t('bankruptcies')}</dt><dd>{bankruptcies}</dd></div>
    </dl>
  )
}

type Row = { kind: 'bet'; bet: Bet; kickoff: string } | { kind: 'pass'; kickoff: string; home: string; away: string }

const names = (entry: { home: string; away: string; homeName?: string; awayName?: string }) =>
  [entry.homeName ?? teamName(entry.home), entry.awayName ?? teamName(entry.away)] as const

function BetTable({ rows }: { rows: Row[] }) {
  const t = useT()
  const { language } = useLanguage()
  return (
    <div className="table-scroll">
      <table>
        <thead><tr>
          <th scope="col">{t('colDate')}</th><th scope="col">{t('colMatch')}</th><th scope="col">{t('colPick')}</th><th scope="col">{t('colOdds')}</th>
          <th scope="col">{t('colStake')}</th><th scope="col">{t('colResult')}</th><th scope="col">{t('colPaid')}</th><th scope="col">{t('colBalance')}</th>
        </tr></thead>
        <tbody>
          {rows.map(row => {
            if (row.kind === 'pass') return (
              <tr key={`pass-${row.kickoff}-${row.home}`} data-status="pass">
                <td>{day(row.kickoff, language)}</td>
                <td>{row.home} {t('vs')} {row.away}</td>
                <td colSpan={6}>{t('passedRow')}</td>
              </tr>
            )
            const { bet } = row
            const [home, away] = names(bet)
            return (
              <tr key={bet.id} data-status={bet.status}>
                <td>{day(bet.kickoff, language)}</td>
                <td>{home} {t('vs')} {away}</td>
                <td>{selectionLabel(t, bet.selection, home, away)}{bet.dared ? ` · ${t('dared')}` : ''}</td>
                <td className="num">{formatOdds(bet.odds)}</td>
                <td className="num">{money(bet.stake)}</td>
                <td>{t(bet.status)}{bet.result ? ` ${bet.result}` : ''}</td>
                <td className="num">{bet.status === 'open' ? '' : money(bet.payout)}</td>
                <td className="num">{money(bet.bankrollAfter)}{bet.bankrupt ? ' *' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Ledger() {
  const t = useT()
  const { language } = useLanguage()
  const chronological = [...liveBets].sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  const rows: Row[] = [
    ...liveBets.map(bet => ({ kind: 'bet' as const, bet, kickoff: bet.kickoff })),
    ...passes.map(pass => { const [home, away] = names(pass); return { kind: 'pass' as const, kickoff: pass.kickoff, home, away } }),
  ].sort((a, b) => b.kickoff.localeCompare(a.kickoff))
  const settled = chronological.filter(bet => bet.status !== 'open')
  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <div className="section-head">
        <h2 id="ledger-title">{t('recordTitle')}</h2>
        <p>{t('recordLead')}</p>
      </div>
      {rows.length === 0 ? (
        <p className="ledger__empty">{t('recordEmpty', { date: day(nextDailyRun().toISOString(), language) })}</p>
      ) : (
        <>
          <Totals bets={liveBets} bankruptcies={liveBets.filter(bet => bet.bankrupt).length} />
          {settled.length > 0 && <BankrollChart label={t('chartLive')} markEach points={settled.map(bet => ({ value: bet.bankrollAfter, status: bet.status, bankrupt: bet.bankrupt }))} />}
          <BetTable rows={rows} />
        </>
      )}
    </section>
  )
}

export function Infancy() {
  const t = useT()
  const { language } = useLanguage()
  const { curve, summary, bankruptAt } = infancy
  const [bets, setBets] = useState<Bet[] | null>(null)
  const [open, setOpen] = useState(false)
  const toggle = () => {
    setOpen(value => !value)
    if (!bets) loadInfancyBets().then(setBets, () => setOpen(false))
  }
  const broke = new Set(bankruptAt)
  return (
    <section className="infancy" aria-labelledby="infancy-title">
      <div className="section-head"><h2 id="infancy-title">{t('infancyTitle')}</h2></div>
      <p>{t('infancyLead', { matches: infancy.matches, from: day(infancy.from, language), to: day(infancy.to, language) })}</p>
      <p>{t('infancyStats', { bets: summary.bets, won: summary.won, bankruptcies: summary.bankruptcies, start: START })}</p>
      <BankrollChart label={t('infancyChart')} markEach={false} points={curve.map(([, value], i) => ({ value, bankrupt: broke.has(i) }))} />
      <button type="button" className="text-button text-button--light" aria-expanded={open} onClick={toggle}>
        {open ? t('hideInfancyBets') : t('showInfancyBets', { n: summary.bets })}
      </button>
      {open && (bets
        ? <div className="infancy__bets"><BetTable rows={[...bets].reverse().map(bet => ({ kind: 'bet', bet, kickoff: bet.kickoff }))} /></div>
        : <p className="fine" aria-live="polite">{t('loadingBets')}</p>)}
    </section>
  )
}

// One sentence on how its tastes moved over the last week; null before there is a week to compare.
export function useWeeklyLine() {
  const t = useT()
  const change = weeklyChange(tastes)
  if (!change) return null
  const name = (team: string) => team === PANAMA_KEY ? t('sele') : teamName(team)
  if (change.warmed && change.cooled) return t('weekBoth', { warmed: name(change.warmed.team), cooled: name(change.cooled.team) })
  if (change.warmed) return `${t('weekWarmed', { team: name(change.warmed.team) })}.`
  if (change.cooled) return `${t('weekCooledOnly', { team: name(change.cooled.team) })}.`
  return t('weekStill')
}

export function Tastes() {
  const t = useT()
  const weekly = useWeeklyLine()
  const latest = tastes.history.at(-1)?.affinity ?? tastes.innate
  const rows = TASTE_TEAMS.map(team => ({ team, innate: tastes.innate[team] ?? 0, learned: latest[team] ?? 0 })).sort((a, b) => b.learned - a.learned)
  const max = Math.max(...rows.flatMap(row => [row.innate, row.learned]))
  return (
    <section className="tastes" aria-labelledby="tastes-title">
      <div className="section-head">
        <h2 id="tastes-title">{t('tastesTitle')}</h2>
        <p>{t('tastesLead')}</p>
        {weekly && <p className="tastes__weekly">{weekly}</p>}
      </div>
      <ol className="tastes__list">
        {rows.map(row => (
          <li key={row.team} data-sele={row.team === PANAMA_KEY}>
            <span className="tastes__name">{row.team === PANAMA_KEY ? t('sele') : teamName(row.team)}</span>
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
