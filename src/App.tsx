import { lazy, Suspense, useMemo } from 'react'
import { flyState, mareaRoja, REPO_URL, stateUpdatedAt } from './site/data'
import { day, kickoff, money, percent } from './site/format'
import { LanguageProvider, useLanguage, useT } from './site/i18n'
import BrainPanel from './site/BrainPanel'
import { Infancy, Ledger, Tastes } from './site/Record'
import Slip, { selectionLabel } from './site/Slip'
import { SELECTION_INDEX, useStory } from './site/story'
import { useBrain } from './site/useBrain'

const RoomScene = lazy(() => import('./scene/RoomScene'))

function Page() {
  const t = useT()
  const { language, setLanguage } = useLanguage()
  const brain = useBrain()
  const story = useStory(brain)
  const red = useMemo(() => mareaRoja(), [])

  const broadcast = useMemo(() => {
    const option = story.options?.find(entry => entry.selection === story.selection)
    const odds = story.odds ? [story.odds.result.home, story.odds.result.draw, story.odds.result.away] as [number, number, number]
      : story.options ? story.options.map(entry => entry.odds) as [number, number, number] : null
    const footer = story.featured.kind === 'passed' ? t('slipPassed')
      : story.selection ? t('flyPick', { pick: `${selectionLabel(t, story.selection, story.homeName, story.awayName)}${option ? ` @${option.odds.toFixed(2)}` : ''}` })
        : t('brainLoading')
    return {
      header: red ? t('mareaRoja') : story.competition === 'panama' ? 'Panamá' : 'LPF',
      when: story.kickoff ? kickoff(story.kickoff, language) : '',
      home: story.homeName || t('brand'),
      away: story.awayName || '',
      odds,
      pick: story.selection ? SELECTION_INDEX[story.selection] : null,
      footer,
      red,
    }
  }, [story, language, red, t])

  const calendar = useMemo(() => {
    const date = new Date(story.kickoff ?? Date.now())
    const local = new Date(date.toLocaleString('en-US', { timeZone: 'America/Panama' }))
    const first = new Date(local.getFullYear(), local.getMonth(), 1)
    return {
      month: new Intl.DateTimeFormat(language === 'es' ? 'es-PA' : 'en-US', { month: 'long' }).format(local),
      days: new Date(local.getFullYear(), local.getMonth() + 1, 0).getDate(),
      firstWeekday: first.getDay(),
      circled: story.kickoff ? local.getDate() : null,
    }
  }, [story.kickoff, language])

  const { winStreak, lossStreak } = flyState
  const streak = winStreak === 1 ? t('oneWin') : winStreak > 1 ? t('winsInRow', { n: winStreak })
    : lossStreak === 1 ? t('oneLoss') : lossStreak > 1 ? t('lossesInRow', { n: lossStreak }) : t('noStreak')

  return (
    <div className="page" data-marea={red}>
      <header className="masthead">
        <p className="wordmark">{t('brand')}</p>
        <p className="masthead__tagline">{t('tagline')}</p>
        <div className="lang" role="group" aria-label={t('language')}>
          {(['es', 'en'] as const).map(code => (
            <button key={code} type="button" aria-pressed={language === code} onClick={() => setLanguage(code)}>{code.toUpperCase()}</button>
          ))}
        </div>
      </header>

      <main className="stage">
        <div className="stage__scene">
          <Suspense fallback={<div className="scene" />}>
            <RoomScene broadcast={broadcast} calendar={calendar} red={red} thinking={story.featured.kind === 'thinking'} label={t('sceneLabel')} />
          </Suspense>
          {red && <p className="marea-banner"><strong>{t('mareaRoja')}</strong> {t('mareaRojaNote')}</p>}
        </div>

        <div className="stage__story">
          <Slip story={story} brain={brain} />
          <dl className="status-line">
            <div><dt>{t('bankroll')}</dt><dd className="status-line__money">{money(flyState.bankroll)}</dd></div>
            <div><dt>{t('boldness')}</dt><dd>{percent(flyState.boldness)}</dd></div>
            <div><dt>{t('streak')}</dt><dd>{streak}</dd></div>
          </dl>
          <p className="fine">{t('bankrollNote')}</p>
        </div>
      </main>

      <div className="sections">
        <BrainPanel brain={brain} story={story} />
        <Ledger />
        <Tastes />
        <Infancy />
        <section className="how" aria-labelledby="how-title">
          <div className="section-head"><h2 id="how-title">{t('howTitle')}</h2></div>
          <ol>
            <li>{t('how1')}</li>
            <li>{t('how2')}</li>
            <li>{t('how3')}</li>
            <li>{t('how4')}</li>
          </ol>
        </section>
      </div>

      <footer className="footer">
        <p className="footer__disclaimer">{t('disclaimer')}</p>
        <p className="fine">{t('sources')}</p>
        <p className="fine"><a href={REPO_URL} target="_blank" rel="noreferrer">{t('repo')}</a> · {t('updated', { date: day(stateUpdatedAt, language) })}</p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <Page />
    </LanguageProvider>
  )
}
