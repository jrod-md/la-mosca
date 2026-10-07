import { useMemo, useState } from 'react'
import type { Selection } from '../brain/odor'
import { BETS_HISTORY_URL } from './data'
import { kickoff, money, odds as formatOdds, percent } from './format'
import { useLanguage, useT, type MessageKey } from './i18n'
import type { Story } from './story'
import type { Brain } from './useBrain'

const STATUS_KEY = { open: 'open', won: 'won', lost: 'lost', void: 'void' } as const

export const selectionLabel = (t: ReturnType<typeof useT>, selection: Selection, home: string, away: string) =>
  selection === 'draw' ? t('draw') : t(selection, { team: selection === 'home' ? home : away })

export default function Slip({ story, brain }: { story: Story; brain: Brain | null }) {
  const t = useT()
  const { language } = useLanguage()
  const [specific, setSpecific] = useState(false)
  const exhibition = useMemo(() => specific && brain && story.fixture && story.odds ? brain.fly().exhibit(story.fixture, story.odds) : null, [specific, brain, story])
  const { featured, bet } = story

  if (featured.kind === 'empty') return <section className="slip" aria-labelledby="slip-title"><h2 id="slip-title" className="slip__eyebrow">{t('slipTitle')}</h2><p className="slip__note">{t('slipEmpty')}</p></section>

  const eyebrow: MessageKey = featured.kind === 'open' ? 'slipOpen' : featured.kind === 'thinking' ? 'slipThinking' : featured.kind === 'passed' ? 'slipTitle' : 'slipSettled'
  const chosen = story.options?.find(option => option.selection === story.selection)

  return (
    <section className="slip" aria-labelledby="slip-title" data-status={bet?.status ?? featured.kind}>
      <h2 id="slip-title" className="slip__eyebrow">{t(eyebrow)}</h2>
      <p className="slip__match">
        <span>{story.homeName}</span>
        <span className="slip__vs">{t('vs')}</span>
        <span>{story.awayName}</span>
      </p>
      {story.kickoff && <p className="slip__when">{kickoff(story.kickoff, language)}{story.venue ? ` · ${story.venue}` : ''}</p>}

      {featured.kind === 'passed' && <p className="slip__pick">{t('slipPassed')}</p>}
      {story.pending && <p className="slip__pick slip__pick--pending" aria-live="polite">{t('brainLoading')}</p>}
      {story.selection && (
        <>
          <p className="slip__pick">{selectionLabel(t, story.selection, story.homeName, story.awayName)}</p>
          <dl className="slip__figures">
            <div><dt>{t('odds')}</dt><dd>{formatOdds(bet?.odds ?? chosen?.odds ?? 0)}</dd></div>
            {bet && <div><dt>{t('stake')}</dt><dd>{money(bet.stake)}</dd></div>}
            {bet && bet.status === 'open' && <div><dt>{t('toWin')}</dt><dd>{money(bet.stake * bet.odds)}</dd></div>}
            {bet && bet.status !== 'open' && <div><dt>{t('paid')}</dt><dd>{money(bet.payout)}</dd></div>}
          </dl>
          {bet && (
            <p className="slip__tags">
              <span className="tag" data-status={bet.status}>{t(STATUS_KEY[bet.status])}{bet.result ? ` · ${bet.result}` : ''}</span>
              {bet.dared && <span className="tag">{t('dared')}</span>}
              {bet.tilted && <span className="tag">{t('tilted')}</span>}
            </p>
          )}
        </>
      )}
      {featured.kind === 'thinking' && <p className="slip__note">{t('slipThinkingNote')}</p>}
      {bet && <p className="slip__note">{t('placedAt')} {kickoff(bet.placedAt, language)} · <a href={BETS_HISTORY_URL} target="_blank" rel="noreferrer">{t('proof')}</a></p>}

      {story.odds && brain && (
        <div className="slip__specific">
          <button type="button" className="text-button" aria-expanded={specific} onClick={() => setSpecific(value => !value)}>
            {specific ? t('lessSpecific') : t('moreSpecific')}
          </button>
          {exhibition && (
            <div className="exhibition">
              <p className="slip__note">{t('exhibitionNote')}</p>
              <dl>
                <div><dt>{t('totals')}</dt><dd>{t(exhibition.totals[0].key === 'over' ? 'over' : 'under')} <small>@{formatOdds(exhibition.totals[0].odds)} · {percent(exhibition.totals[0].probability)}</small></dd></div>
                <div><dt>{t('btts')}</dt><dd>{t(exhibition.btts[0].key === 'yes' ? 'yes' : 'no')} <small>@{formatOdds(exhibition.btts[0].odds)} · {percent(exhibition.btts[0].probability)}</small></dd></div>
                <div><dt>{t('score')}</dt><dd>{exhibition.score[0].key} <small>@{formatOdds(exhibition.score[0].odds)} · {percent(exhibition.score[0].probability)}</small></dd></div>
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
