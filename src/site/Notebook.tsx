import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { FLY_PARAMS, type Bet, type OptionView, type Pass } from '../brain/fly'
import { teamName } from '../football/teams'
import { flyState, liveBets, nextDailyRun, passes } from './data'
import { matchTime, money, odds as formatOdds } from './format'
import { useLanguage, useT, type Language } from './i18n'

// The fly's sketchbook. Closed, it shows its cover; open, every spread is one match: the ticket
// taped on the left with a rubber stamp for the outcome, and the fly's handwritten notes on the
// right. Wide screens show spreads; phones show one page at a time.
const START = FLY_PARAMS.startingBankroll
const TURN_MS = 850

type Entry =
  | { kind: 'bet'; bet: Bet; number: number; home: string; away: string }
  | { kind: 'pass'; pass: Pass; home: string; away: string }
type Page =
  | { kind: 'cover' }
  | { kind: 'inside' }
  | { kind: 'accounts' }
  | { kind: 'ticket'; entry: Entry }
  | { kind: 'note'; entry: Entry }
type Side = 'left' | 'right' | 'single'
type Tone = 'open' | 'won' | 'lost' | 'void' | 'pass'

const names = (entry: { home: string; away: string; homeName?: string; awayName?: string }) =>
  [entry.homeName ?? teamName(entry.home), entry.awayName ?? teamName(entry.away)] as const

const kickoffOf = (entry: Entry) => entry.kind === 'bet' ? entry.bet.kickoff : entry.pass.kickoff
const matchIdOf = (entry: Entry) => entry.kind === 'bet' ? entry.bet.matchId : entry.pass.matchId
const toneOf = (entry: Entry): Tone => entry.kind === 'pass' ? 'pass' : entry.bet.status
const isSele = (entry: Entry) => matchIdOf(entry).startsWith('elo:')

// A stable small number per id, so each taped ticket and stamp keeps its own slight tilt.
const wobble = (id: string, range: number) => {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return ((Math.abs(hash) % 1000) / 1000 - 0.5) * 2 * range
}

// Results are written down the morning after the match (Panama time; national fixtures carry only a date).
const settleDay = (kickoffIso: string, matchId: string, language: Language) => {
  const date = matchId.startsWith('elo:') ? kickoffIso.slice(0, 10) : new Date(Date.parse(kickoffIso) - 5 * 3600e3).toISOString().slice(0, 10)
  const next = new Date(`${date}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return shortDate(next, language)
}
const shortDate = (date: Date, language: Language) =>
  new Intl.DateTimeFormat(language === 'es' ? 'es-PA' : 'en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(date)
const corner = (iso: string) => {
  const [y, m, d] = new Date(Date.parse(iso) - 5 * 3600e3).toISOString().slice(0, 10).split('-')
  return [d, m, y.slice(2)]
}

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

// Ink texture shared by every stamp: displaced edges and a few missing specks.
function InkFilter() {
  return (
    <svg className="nb__defs" aria-hidden="true" focusable="false">
      <filter id="nb-ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" result="rough" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.2 0 0 0 2.75" result="specks" />
        <feComposite in="rough" in2="specks" operator="in" />
      </filter>
    </svg>
  )
}

const useStampWord = () => {
  const t = useT()
  return (tone: Tone) => ({ open: t('nbStampOpen'), won: t('nbStampWon'), lost: t('nbStampLost'), void: t('nbStampVoid'), pass: t('nbStampPass') })[tone]
}

function Stamp({ tone, id }: { tone: Tone; id: string }) {
  const t = useT()
  const word = useStampWord()(tone)
  const key = id.replace(/[^a-z0-9]/gi, '')
  // A classic round rubber stamp: brand on the top arc, place on the bottom arc, the word on a band.
  return (
    <svg className="nb-stamp" data-tone={tone} viewBox="0 0 120 120" aria-hidden="true" style={{ rotate: `${wobble(id, 14)}deg` }}>
      <defs>
        <path id={`nb-top-${key}`} d="M17,60 A43,43 0 0 1 103,60" />
        <path id={`nb-bottom-${key}`} d="M12,60 A48,48 0 0 0 108,60" />
      </defs>
      <g filter="url(#nb-ink)">
        <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="3.5" />
        <circle cx="60" cy="60" r="51" fill="none" stroke="currentColor" strokeWidth="1" />
        <line x1="7" x2="113" y1="44" y2="44" />
        <line x1="7" x2="113" y1="77" y2="77" />
        <text className="nb-stamp__ring" textAnchor="middle"><textPath href={`#nb-top-${key}`} startOffset="50%">LA MOSCA</textPath></text>
        <text className="nb-stamp__ring" textAnchor="middle"><textPath href={`#nb-bottom-${key}`} startOffset="50%">{t('nbStampRing')}</textPath></text>
        <text className="nb-stamp__word" x="60" y="68" textAnchor="middle">{word}</text>
      </g>
    </svg>
  )
}

// A tiny pen sketch of the fly, for corners and the inside cover.
function FlyDoodle({ className }: { className?: string }) {
  return (
    <svg className={`nb-doodle ${className ?? ''}`} viewBox="0 0 80 60" aria-hidden="true">
      <path d="M40 22c-6 0-9 6-9 14s4 14 9 14 9-6 9-14-3-14-9-14z" />
      <path d="M33 34h14M32 40h16M34 46h12" />
      <circle cx="40" cy="17" r="6" />
      <circle cx="35.5" cy="15" r="3" className="nb-doodle__eye" /><circle cx="44.5" cy="15" r="3" className="nb-doodle__eye" />
      <path d="M38 24C26 10 10 12 8 20s14 10 30 8M42 24c12-14 28-12 30-4s-14 10-30 8" />
      <path d="M32 32l-9-4-6 4M31 39l-11 2-5 6M33 45l-7 7M48 32l9-4 6 4M49 39l11 2 5 6M47 45l7 7" />
    </svg>
  )
}

function Cover() {
  const t = useT()
  return (
    <div className="nb-cover">
      <span className="nb-cover__band" aria-hidden="true" />
      <div className="nb-cover__label">
        <span className="nb-cover__title">{t('nbTitle')}</span>
        <span className="nb-cover__owner">{t('nbOwner')}</span>
      </div>
      <FlyDoodle className="nb-cover__fly" />
    </div>
  )
}

function Inside() {
  const t = useT()
  const tones: Tone[] = ['open', 'won', 'lost', 'pass']
  const word = useStampWord()
  const legend = { open: t('nbLegendOpen'), won: t('nbLegendWon'), lost: t('nbLegendLost'), void: '', pass: t('nbLegendPass') }
  return (
    <>
      <p className="nb__found">{t('nbFound')}</p>
      <FlyDoodle className="nb__inside-fly" />
      <p className="nb__hand">{t('nbIntro', { start: START })}</p>
      <h3 className="nb__heading nb__heading--small">{t('nbLegend')}</h3>
      <ul className="nb__legend">
        {tones.map(tone => <li key={tone}><span className="nb-chip" data-tone={tone} style={{ rotate: `${wobble(tone, 4)}deg` }}>{word(tone)}</span><span>{legend[tone]}</span></li>)}
      </ul>
    </>
  )
}

function Accounts() {
  const t = useT()
  const { language } = useLanguage()
  const settled = [...liveBets].filter(bet => bet.status !== 'open').sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  const open = [...liveBets].filter(bet => bet.status === 'open').sort((a, b) => a.kickoff.localeCompare(b.kickoff))
  const staked = settled.reduce((sum, bet) => sum + bet.stake, 0)
  const returned = settled.reduce((sum, bet) => sum + bet.payout, 0)
  const net = returned - staked
  const won = settled.filter(bet => bet.status === 'won').length
  const decided = settled.filter(bet => bet.status !== 'void').length
  const inPlay = open.reduce((sum, bet) => sum + bet.stake, 0)
  // Cash in hand excludes money riding on open bets; that shows as "in play" until it settles.
  const cash = flyState.bankroll
  const series = [START, ...settled.map(bet => bet.bankrollAfter)]
  const max = Math.max(START * 1.5, ...series)
  const points = series.map((value, i) => `${(i / Math.max(1, series.length - 1)) * 200},${60 - (value / max) * 56}`).join(' ')
  const count = (n: number) => t(n === 1 ? 'nbBetsOne' : 'nbBetsMany', { n })
  return (
    <>
      <h3 className="nb__heading">{t('nbAccounts')}</h3>
      <dl className="nb__accounts">
        <div><dt>{t('nbBalance')}</dt><dd>{money(cash)}</dd></div>
        <div><dt>{t('nbInPlay')}</dt><dd>{money(inPlay)} <small>({count(open.length)})</small></dd></div>
      </dl>
      {settled.length > 0 ? (
        <>
          <h4 className="nb__subheading">{t('nbPlayed')}</h4>
          <dl className="nb__accounts">
            <div><dt>{t('nbStaked')}</dt><dd>{money(staked)}</dd></div>
            <div><dt>{t('nbReturned')}</dt><dd>{money(returned)}</dd></div>
            <div><dt>{t('nbNet')}</dt><dd data-sign={net > 0 ? 'up' : net < 0 ? 'down' : 'flat'}>{net > 0 ? '+' : net < 0 ? '−' : ''}{money(Math.abs(net))}</dd></div>
            <div><dt>{t('nbHits')}</dt><dd>{won} / {decided}</dd></div>
            <div><dt>{t('nbBroken')}</dt><dd>{liveBets.filter(bet => bet.bankrupt).length}</dd></div>
          </dl>
          <svg className="nb__sketch" viewBox="0 0 200 64" role="img" aria-label={`${money(START)} → ${money(series.at(-1)!)}`}>
            <line x1="0" x2="200" y1={60 - (START / max) * 56} y2={60 - (START / max) * 56} className="nb__sketch-base" />
            <polyline points={points} className="nb__sketch-line" />
          </svg>
        </>
      ) : open.length > 0 ? (
        <p className="nb__hand nb__hand--soft">{t('nbNoResults', { date: settleDay(open[0].kickoff, open[0].matchId, language) })}</p>
      ) : (
        <p className="nb__hand nb__hand--soft">{t('nbNothingYet', { date: shortDate(nextDailyRun(), language) })}</p>
      )}
      <p className="nb__hand nb__hand--arrow">{t('nbHint')}</p>
    </>
  )
}

function Ticket({ entry }: { entry: Entry }) {
  const t = useT()
  const { language } = useLanguage()
  const id = matchIdOf(entry)
  const tone = toneOf(entry)
  const [d, m, y] = corner(kickoffOf(entry))
  const bet = entry.kind === 'bet' ? entry.bet : null
  const pick = bet ? (bet.selection === 'draw' ? t('draw') : bet.selection === 'home' ? entry.home : entry.away) : null
  // A barcode drawn from the match id: purely decorative, but stable per ticket.
  const bars = [...id.repeat(3)].slice(0, 34).map((char, i) => ({ x: i * 3.4, w: 0.8 + (char.charCodeAt(0) % 3) * 0.7 }))
  return (
    <>
      <span className="nb__corner" aria-hidden="true">{d}<br />{m}<br />{y}</span>
      {isSele(entry) && <span className="nb__sele">{t('nbSele')}</span>}
      <div className="nb-ticket-wrap" style={{ rotate: `${wobble(id, 2.5)}deg` }}>
        <span className="nb-ticket__tape" aria-hidden="true" style={{ rotate: `${wobble(id + 'tape', 6)}deg` }} />
        <div className="nb-ticket" data-tone={tone}>
        <div className="nb-ticket__head">
          <span>La Mosca · {t('nbTicket')}</span>
          <span>{bet ? `N° ${String(entry.kind === 'bet' ? entry.number : 0).padStart(4, '0')}` : t('nbNotBet')}</span>
        </div>
        <p className="nb-ticket__match">{entry.home}<br /><small>{t('vs')}</small> {entry.away}</p>
        <p className="nb-ticket__when">{matchTime(kickoffOf(entry), id, language)}</p>
        {bet && (
          <dl className="nb-ticket__rows">
            <div><dt>{t('nbTicketPick')}</dt><dd>{pick}</dd></div>
            <div><dt>{t('nbTicketOdds')}</dt><dd>{formatOdds(bet.odds)}</dd></div>
            <div><dt>{t('nbTicketStake')}</dt><dd>{money(bet.stake)}</dd></div>
            <div><dt>{t('nbTicketWin')}</dt><dd>{money(bet.stake * bet.odds)}</dd></div>
          </dl>
        )}
        <svg className="nb-ticket__code" viewBox="0 0 116 18" preserveAspectRatio="none" aria-hidden="true">
          {bars.map((bar, i) => <rect key={i} x={bar.x} width={bar.w} height="18" />)}
        </svg>
        <span className="nb-ticket__placed">{t('nbPlacedOn', { date: shortDate(new Date(bet ? bet.placedAt : entry.kind === 'pass' ? entry.pass.decidedAt : 0), language) })}</span>
        </div>
      </div>
      <div className="nb__stamp-spot"><Stamp tone={tone} id={id} /></div>
    </>
  )
}

function Smells({ options, entry, picked }: { options: OptionView[]; entry: Entry; picked: string | null }) {
  const t = useT()
  const top = Math.max(0.0001, ...options.map(option => option.drive))
  const label = (selection: string) => selection === 'draw' ? t('nbDrawShort') : selection === 'home' ? entry.home : entry.away
  return (
    <div className="nb__smells">
      <span className="nb__smells-title">{t('nbSmelled')}:</span>
      {options.map(option => (
        <div key={option.selection} className="nb__smell" data-picked={option.selection === picked}>
          <span className="nb__smell-name">{label(option.selection)}</span>
          <span className="nb__smell-bar" style={{ inlineSize: `${Math.max(6, (Math.max(0, option.drive) / top) * 100)}%`, rotate: `${wobble(option.selection + matchIdOf(entry), 0.8)}deg` }} />
        </div>
      ))}
    </div>
  )
}

function Note({ entry }: { entry: Entry }) {
  const t = useT()
  const { language } = useLanguage()
  const title = <h3 className="nb__title">{entry.home} <small>{t('vs')}</small> {entry.away}</h3>
  if (entry.kind === 'pass') return (
    <>
      {title}
      <p className="nb__hand">{t('nbPass')}</p>
      <Smells options={entry.pass.options} entry={entry} picked={null} />
      <FlyDoodle className="nb__corner-fly" />
    </>
  )
  const { bet } = entry
  const pick = `${bet.selection === 'draw' ? t('nbTheDraw') : bet.selection === 'home' ? entry.home : entry.away} @${formatOdds(bet.odds)}`
  const score = bet.result?.replace('-', ' - ')
  return (
    <>
      {title}
      <p className="nb__hand">
        {t('nbPick', { pick })}{bet.dared && <> (<u>{t('nbDared')}</u>)</>}. {t('nbStake', { stake: money(bet.stake) })}.
        {bet.status === 'open' && <> {t('nbPending', { when: matchTime(bet.kickoff, bet.matchId, language), win: money(bet.stake * bet.odds) })}</>}
      </p>
      <Smells options={bet.options} entry={entry} picked={bet.selection} />
      <div className="nb__result" data-tone={bet.status}>
        <span className="nb__result-label">{t('nbResult')}:</span>
        {bet.status === 'open'
          ? <span className="nb__result-later">{t('nbResultLater', { date: settleDay(bet.kickoff, bet.matchId, language) })}</span>
          : <span className="nb__score">{score}</span>}
      </div>
      {bet.status === 'won' && <p className="nb__hand nb__hand--won">{t('nbPaid', { paid: money(bet.payout) })}</p>}
      {bet.status === 'lost' && <p className="nb__hand nb__hand--lost">{t('nbLost', { stake: money(bet.stake) })}</p>}
      {bet.status === 'void' && <p className="nb__hand">{t('nbVoid', { paid: money(bet.payout) })}</p>}
      {bet.bankrupt && <p className="nb__hand nb__hand--lost">{t('nbBroke', { start: START })}</p>}
      <FlyDoodle className="nb__corner-fly" />
    </>
  )
}

function PageView({ page, number, side }: { page: Page | null | undefined; number: number; side: Side }) {
  if (!page) return <div className="nb__page" data-side={side} data-empty="true" />
  if (page.kind === 'cover') return <div className="nb__page nb__page--cover" data-side={side}><Cover /></div>
  let body: ReactNode = null
  if (page.kind === 'inside') body = <Inside />
  if (page.kind === 'accounts') body = <Accounts />
  if (page.kind === 'ticket') body = <Ticket entry={page.entry} />
  if (page.kind === 'note') body = <Note entry={page.entry} />
  return (
    <div className="nb__page" data-side={side} data-kind={page.kind}>
      {body}
      {page.kind !== 'inside' && <span className="nb__folio">{number}</span>}
    </div>
  )
}

type Flip = { dir: 'next' | 'prev' } | null

export default function Notebook() {
  const t = useT()
  const wide = useWide()
  const step = wide ? 2 : 1
  const [index, setIndex] = useState(0)
  const [flip, setFlip] = useState<Flip>(null)
  const touch = useRef<number | null>(null)

  const pages = useMemo<Page[]>(() => {
    const numbered = [...liveBets].sort((a, b) => a.placedAt.localeCompare(b.placedAt))
    const entries: Entry[] = [
      ...liveBets.map(bet => { const [home, away] = names(bet); return { kind: 'bet' as const, bet, number: numbered.indexOf(bet) + 1, home, away } }),
      ...passes.map(pass => { const [home, away] = names(pass); return { kind: 'pass' as const, pass, home, away } }),
    ].sort((a, b) => kickoffOf(b).localeCompare(kickoffOf(a)))
    return [{ kind: 'cover' }, { kind: 'inside' }, { kind: 'accounts' }, ...entries.flatMap(entry => [{ kind: 'ticket' as const, entry }, { kind: 'note' as const, entry }])]
  }, [])
  // On wide screens an empty slot sits left of the cover, so every spread is (even, odd).
  const seq: (Page | null)[] = useMemo(() => wide ? [null, ...pages] : pages, [wide, pages])
  const numberOf = (i: number) => wide ? i - 1 : i

  // Keep spreads aligned when switching between one and two pages per view.
  useEffect(() => { setIndex(current => wide ? current - (current % 2) : current) }, [wide])

  const canNext = index + step < seq.length
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
    }, TURN_MS)
    return () => window.clearTimeout(timer)
  }, [flip, step])

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go('next') }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go('prev') }
  }
  const onTouchStart = (event: React.TouchEvent) => { touch.current = event.touches[0].clientX }
  const onTouchEnd = (event: React.TouchEvent) => {
    if (touch.current === null) return
    const delta = event.changedTouches[0].clientX - touch.current
    touch.current = null
    if (Math.abs(delta) > 40) go(delta < 0 ? 'next' : 'prev')
  }

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
  const sideOf = (i: number): Side => !wide ? 'single' : i % 2 === 0 ? 'left' : 'right'
  // Closed: only the cover shows, centred. It slides to the middle as the cover opens.
  const landing = flip ? index + (flip.dir === 'next' ? step : -step) : index
  const closed = landing === 0
  const shown = seq[wide ? landing + 1 : landing]
  const entry = shown && (shown.kind === 'ticket' || shown.kind === 'note') ? shown.entry : null
  const caption = closed ? t('nbTapOpen') : entry ? `${entry.home} ${t('vs')} ${entry.away}` : shown?.kind === 'inside' ? t('nbTitle') : t('nbAccounts')

  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <div className="section-head">
        <h2 id="ledger-title">{t('recordTitle')}</h2>
        <p>{t('recordLead')}</p>
      </div>
      <InkFilter />
      <div className="nb" data-wide={wide} data-closed={closed} tabIndex={0} onKeyDown={onKey} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-roledescription={t('nbTitle')}>
        <button type="button" className="nb__arrow" data-dir="prev" onClick={() => go('prev')} disabled={!canPrev} aria-label={t('nbPrev')}>
          <svg viewBox="0 0 14 44" aria-hidden="true"><polyline points="11,3 3,22 11,41" /></svg>
        </button>
        <div className="nb__book">
          <div className="nb__spread">
            {base.map((i, slot) => <PageView key={`${slot}-${i}`} page={seq[i]} number={numberOf(i)} side={sideOf(i)} />)}
            {leaf && (
              <div className="nb__leaf" data-side={leaf.side} data-dir={flip!.dir} aria-hidden="true">
                <div className="nb__face nb__face--front"><PageView page={seq[leaf.front]} number={numberOf(leaf.front)} side={leaf.side === 'full' ? 'single' : sideOf(leaf.front)} /></div>
                <div className="nb__face nb__face--back"><PageView page={leaf.back >= 0 ? seq[leaf.back] : null} number={numberOf(leaf.back)} side={leaf.side === 'full' ? 'single' : sideOf(leaf.back)} /></div>
              </div>
            )}
            <button type="button" className="nb__zone" data-dir="prev" tabIndex={-1} aria-hidden="true" onClick={() => go(closed ? 'next' : 'prev')} />
            <button type="button" className="nb__zone" data-dir="next" tabIndex={-1} aria-hidden="true" onClick={() => go('next')} />
          </div>
        </div>
        <button type="button" className="nb__arrow" data-dir="next" onClick={() => go('next')} disabled={!canNext} aria-label={t('nbNext')}>
          <svg viewBox="0 0 14 44" aria-hidden="true"><polyline points="3,3 11,22 3,41" /></svg>
        </button>
        <p className="nb__caption" key={caption} aria-live="polite">{caption}</p>
      </div>
    </section>
  )
}
