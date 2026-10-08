import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FLY_PARAMS, type Bet } from '../brain/fly'
import { teamName } from '../football/teams'
import { liveBets, nextDailyRun, passes } from './data'
import { day, matchTime, money, odds as formatOdds } from './format'
import { useLanguage, useT } from './i18n'

// The fly's own notebook: a closed cover that opens, ruled pages written by hand, and real page
// turns. Page 1 holds the accounts; every following page lists the fly's decisions, newest first.
// Entries per page, so each fits its ruled lines: narrow pages wrap more.
const perPage = (wide: boolean) => wide ? 3 : 2
const START = FLY_PARAMS.startingBankroll

type Entry =
  | { kind: 'bet'; bet: Bet; kickoff: string; home: string; away: string }
  | { kind: 'pass'; kickoff: string; home: string; away: string; matchId: string }
type Page = { kind: 'accounts' } | { kind: 'entries'; entries: Entry[] } | { kind: 'blank' }

const names = (entry: { home: string; away: string; homeName?: string; awayName?: string }) =>
  [entry.homeName ?? teamName(entry.home), entry.awayName ?? teamName(entry.away)] as const

const useWide = () => {
  const query = '(min-width: 900px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setWide(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return wide
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Accounts() {
  const t = useT()
  const settled = [...liveBets].filter(bet => bet.status !== 'open').sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  const staked = settled.reduce((sum, bet) => sum + bet.stake, 0)
  const returned = settled.reduce((sum, bet) => sum + bet.payout, 0)
  const net = returned - staked
  const won = settled.filter(bet => bet.status === 'won').length
  const decided = settled.filter(bet => bet.status !== 'void').length
  const open = liveBets.filter(bet => bet.status === 'open')
  const balance = settled.at(-1)?.bankrollAfter ?? START
  const series = [START, ...settled.map(bet => bet.bankrollAfter)]
  const max = Math.max(START * 1.5, ...series)
  const points = series.map((value, i) => `${(i / Math.max(1, series.length - 1)) * 200},${60 - (value / max) * 56}`).join(' ')
  return (
    <>
      <h3 className="nb__heading">{t('nbAccounts')}</h3>
      <dl className="nb__accounts">
        <div><dt>{t('totalStaked')}</dt><dd>{money(staked)}</dd></div>
        <div><dt>{t('totalReturned')}</dt><dd>{money(returned)}</dd></div>
        <div><dt>{t('net')}</dt><dd data-sign={net > 0 ? 'up' : net < 0 ? 'down' : 'flat'}>{net > 0 ? '+' : net < 0 ? '−' : ''}{money(Math.abs(net))}</dd></div>
        <div><dt>{t('hits')}</dt><dd>{won} / {decided}</dd></div>
        <div><dt>{t('nbInPlay')}</dt><dd>{open.length} · {money(open.reduce((sum, bet) => sum + bet.stake, 0))}</dd></div>
        <div><dt>{t('bankruptcies')}</dt><dd>{liveBets.filter(bet => bet.bankrupt).length}</dd></div>
      </dl>
      {settled.length > 0 ? (
        <svg className="nb__sketch" viewBox="0 0 200 64" role="img" aria-label={`${t('chartLive')}: ${money(START)} → ${money(balance)}`}>
          <line x1="0" x2="200" y1={60 - (START / max) * 56} y2={60 - (START / max) * 56} className="nb__sketch-base" />
          <polyline points={points} className="nb__sketch-line" />
        </svg>
      ) : <p className="nb__note">{t('nbNoResults')}</p>}
      <p className="nb__note">{t('nbHint')}</p>
    </>
  )
}

function EntryView({ entry }: { entry: Entry }) {
  const t = useT()
  const { language } = useLanguage()
  if (entry.kind === 'pass') return (
    <li className="nb__entry" data-status="pass">
      <span className="nb__date">{day(entry.kickoff, language)}</span>
      <span className="nb__match">{entry.home} {t('vs')} {entry.away}</span>
      <span className="nb__line">{t('nbPass')}</span>
    </li>
  )
  const { bet, home, away } = entry
  // In the fly's own words: the team it backed (or the draw), not the market label.
  const pick = `${bet.selection === 'draw' ? t('nbTheDraw') : bet.selection === 'home' ? home : away} @${formatOdds(bet.odds)}`
  return (
    <li className="nb__entry" data-status={bet.status}>
      <span className="nb__date">{day(bet.kickoff, language)}</span>
      <span className="nb__match">{home} {t('vs')} {away}</span>
      <span className="nb__line">{t('nbPick', { pick })}{bet.dared ? ` (${t('nbDared')})` : ''}. {t('nbStake', { stake: money(bet.stake) })}</span>
      <span className="nb__line nb__result">
        {bet.status === 'open' && t('nbPending', { when: matchTime(bet.kickoff, bet.matchId, language), win: money(bet.stake * bet.odds) })}
        {bet.status === 'won' && <><mark className="nb__circle">{t('nbWon', { score: bet.result ?? '' })}</mark> {t('nbPaid', { paid: money(bet.payout) })}</>}
        {bet.status === 'lost' && <s>{t('nbLost', { score: bet.result ?? '' })}</s>}
        {bet.status === 'void' && t('nbVoid', { paid: money(bet.payout) })}
      </span>
      {bet.bankrupt && <span className="nb__line nb__broke">{t('nbBroke', { start: START })}</span>}
    </li>
  )
}

function PageView({ page, number }: { page: Page | undefined; number: number }) {
  const t = useT()
  const { language } = useLanguage()
  let body: ReactNode = null
  if (page?.kind === 'accounts') body = <Accounts />
  if (page?.kind === 'entries') body = <ol className="nb__entries">{page.entries.map(entry => <EntryView key={entry.kind === 'bet' ? entry.bet.id : `pass-${entry.matchId}`} entry={entry} />)}</ol>
  if (page?.kind === 'accounts' && liveBets.length + passes.length === 0) body = <><Accounts /><p className="nb__note">{t('recordEmpty', { date: day(nextDailyRun().toISOString(), language) })}</p></>
  return (
    <div className="nb__page" data-blank={!page || page.kind === 'blank'}>
      {body}
      {page && page.kind !== 'blank' && <span className="nb__folio">{number}</span>}
    </div>
  )
}

type Flip = { dir: 'next' | 'prev' } | null

export default function Notebook() {
  const t = useT()
  const wide = useWide()
  const step = wide ? 2 : 1
  const [open, setOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  const [index, setIndex] = useState(0)
  const [flip, setFlip] = useState<Flip>(null)
  const touch = useRef<number | null>(null)

  const pages = useMemo<Page[]>(() => {
    const entries: Entry[] = [
      ...liveBets.map(bet => { const [home, away] = names(bet); return { kind: 'bet' as const, bet, kickoff: bet.kickoff, home, away } }),
      ...passes.map(pass => { const [home, away] = names(pass); return { kind: 'pass' as const, kickoff: pass.kickoff, home, away, matchId: pass.matchId } }),
    ].sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    const list: Page[] = [{ kind: 'accounts' }]
    const size = perPage(wide)
    for (let i = 0; i < entries.length; i += size) list.push({ kind: 'entries', entries: entries.slice(i, i + size) })
    return list
  }, [wide])

  // Keep spreads aligned when switching between one and two pages per view.
  useEffect(() => { setIndex(current => current - (current % step)) }, [step])

  const canNext = index + step < pages.length
  const canPrev = index > 0
  const go = (dir: 'next' | 'prev') => {
    if (flip || (dir === 'next' ? !canNext : !canPrev)) return
    if (reducedMotion()) setIndex(current => current + (dir === 'next' ? step : -step))
    else setFlip({ dir })
  }
  // Timers, not animationend: browsers may skip animation events (background tabs, throttling).
  useEffect(() => {
    if (!flip) return
    const timer = window.setTimeout(() => {
      setIndex(current => current + (flip.dir === 'next' ? step : -step))
      setFlip(null)
    }, wide ? 700 : 600)
    return () => window.clearTimeout(timer)
  }, [flip, step, wide])
  useEffect(() => {
    if (!opening) return
    const timer = window.setTimeout(() => { setOpening(false); setOpen(true) }, 650)
    return () => window.clearTimeout(timer)
  }, [opening])
  const openBook = () => {
    if (reducedMotion()) { setOpen(true); return }
    setOpening(true)
  }

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') go('next')
    if (event.key === 'ArrowLeft') go('prev')
  }
  const onTouchStart = (event: React.TouchEvent) => { touch.current = event.touches[0].clientX }
  const onTouchEnd = (event: React.TouchEvent) => {
    if (touch.current === null) return
    const delta = event.changedTouches[0].clientX - touch.current
    touch.current = null
    if (Math.abs(delta) > 40) go(delta < 0 ? 'next' : 'prev')
  }

  const at = (i: number) => pages[i]
  // What sits underneath while a page turns, and what the turning leaf shows on each face.
  let base: number[], leaf: { front: number; back: number; side: 'left' | 'right' | 'full' } | null = null
  if (wide) {
    base = [index, index + 1]
    if (flip?.dir === 'next') { base = [index, index + 3]; leaf = { front: index + 1, back: index + 2, side: 'right' } }
    if (flip?.dir === 'prev') { base = [index - 2, index + 1]; leaf = { front: index, back: index - 1, side: 'left' } }
  } else {
    base = [index]
    if (flip?.dir === 'next') { base = [index + 1]; leaf = { front: index, back: -1, side: 'full' } }
    if (flip?.dir === 'prev') { base = [index]; leaf = { front: index - 1, back: -1, side: 'full' } }
  }
  const total = pages.length

  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <div className="section-head">
        <h2 id="ledger-title">{t('recordTitle')}</h2>
        <p>{t('recordLead')}</p>
      </div>
      {!open ? (
        <button type="button" className="nb-cover" data-opening={opening} onClick={openBook}>
          <span className="nb-cover__label">
            <span className="nb-cover__title">{t('nbTitle')}</span>
            <span className="nb-cover__owner">{t('nbOwner')}</span>
          </span>
          <span className="nb-cover__cta">{t('nbOpen')}</span>
        </button>
      ) : (
        <div className="nb" data-wide={wide} tabIndex={0} onKeyDown={onKey} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-roledescription={t('nbTitle')}>
          <div className="nb__spread">
            {base.map((i, slot) => <PageView key={`${slot}-${i}`} page={at(i)} number={i + 1} />)}
            {wide && <span className="nb__spine" aria-hidden="true" />}
            {leaf && (
              <div className="nb__leaf" data-side={leaf.side} data-dir={flip!.dir} aria-hidden="true">
                <div className="nb__face nb__face--front"><PageView page={at(leaf.front)} number={leaf.front + 1} /></div>
                <div className="nb__face nb__face--back"><PageView page={leaf.back >= 0 ? at(leaf.back) : { kind: 'blank' }} number={leaf.back + 1} /></div>
              </div>
            )}
          </div>
          <div className="nb__controls">
            <button type="button" className="nb__turn" onClick={() => go('prev')} disabled={!canPrev} aria-label={t('nbPrev')}>‹</button>
            <span aria-live="polite">{t('nbPage', { n: Math.min(index + 1, total), total })}</span>
            <button type="button" className="nb__turn" onClick={() => go('next')} disabled={!canNext} aria-label={t('nbNext')}>›</button>
            <button type="button" className="text-button text-button--light" onClick={() => { setOpen(false); setIndex(0) }}>{t('nbClose')}</button>
          </div>
        </div>
      )}
    </section>
  )
}
