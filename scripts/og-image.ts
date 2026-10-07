// Share preview: renders dist/og.png (1200x630) with the fly's current pick and fills the share
// meta placeholders in dist/index.html. Runs after `vite build`, so every daily data commit that
// rebuilds the site also refreshes the card.
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { buildCircuit } from '../src/brain/circuit'
import { Fly, type Bet, type BetBook, type FlyState } from '../src/brain/fly'
import type { UpcomingMatch } from '../src/odds/upcoming'
import { teamName } from '../src/football/teams'

const SITE = 'https://la-mosca.pages.dev'
const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'))
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const { state } = read<{ state: FlyState }>('data/fly/state.json')
const book = read<BetBook>('data/fly/bets.json')
const upcoming = read<{ matches: UpcomingMatch[] }>('data/fly/upcoming.json').matches
const now = new Date().toISOString()

// `pick` is natural text ("va con Plaza Amador"); the card shows it uppercased.
interface Card { eyebrow: string; pick: string; match: string; when: string; odds: number | null; stake: number | null; red: boolean }

const when = (iso: string, id: string) => new Intl.DateTimeFormat('es-PA', {
  timeZone: id.startsWith('elo:') ? 'UTC' : 'America/Panama', weekday: 'short', day: 'numeric', month: 'short',
  ...(id.startsWith('elo:') ? {} : { hour: 'numeric', minute: '2-digit' }),
}).format(new Date(iso))

const pickLine = (selection: string, home: string, away: string) => selection === 'draw' ? 'va al empate' : `va con ${selection === 'home' ? home : away}`

const cardFor = (): Card => {
  const names = (bet: Bet) => [bet.homeName ?? teamName(bet.home), bet.awayName ?? teamName(bet.away)]
  const open = book.bets.filter(bet => bet.status === 'open').sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0]
  if (open) {
    const [home, away] = names(open)
    return { eyebrow: 'APUESTA ABIERTA', pick: pickLine(open.selection, home, away), match: `${home} vs ${away}`, when: when(open.kickoff, open.matchId), odds: open.odds, stake: open.stake, red: open.matchId.startsWith('elo:') }
  }
  const next = upcoming.filter(match => match.odds && match.kickoff > now).sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0]
  if (next?.odds) {
    // Same preview the site shows: a private copy of the fly decides; the official bet comes at 07:00.
    const fly = new Fly(buildCircuit(read('src/data/generated/malecns_mushroom_body.json')), structuredClone(state))
    const choice = fly.decide({ id: next.id, home: next.home.key, away: next.away.key }, next.odds).choice
    return {
      eyebrow: 'LO QUE ESTÁ PENSANDO',
      pick: choice ? pickLine(choice.selection, next.home.name, next.away.name) : 'no le huele bien',
      match: `${next.home.name} vs ${next.away.name}`, when: when(next.kickoff, next.id),
      odds: choice?.odds ?? null, stake: null, red: next.competition === 'panama',
    }
  }
  const last = book.bets.filter(bet => bet.status !== 'open').sort((a, b) => a.kickoff.localeCompare(b.kickoff)).at(-1)
  if (last) {
    const [home, away] = names(last)
    return { eyebrow: last.status === 'won' ? 'GANÓ' : last.status === 'lost' ? 'PERDIÓ' : 'ANULADA', pick: pickLine(last.selection, home, away), match: `${home} vs ${away}`, when: last.result ? `Quedó ${last.result}` : '', odds: last.odds, stake: last.stake, red: false }
  }
  return { eyebrow: 'LA MOSCA', pick: 'espera el próximo partido', match: 'Liga Panameña de Fútbol', when: '', odds: null, stake: null, red: false }
}

// A flat, stylized fruit fly in profile, matching the 3D one: big red eye, humped thorax, banded abdomen.
const fly = (x: number, y: number) => `
  <g transform="translate(${x} ${y})">
    <g stroke="#7a6040" stroke-width="7" stroke-linecap="round" fill="none">
      <path d="M150 210 L120 270 L100 330"/><path d="M190 215 L190 280 L205 335"/><path d="M230 205 L270 265 L300 320"/>
      <path d="M120 190 L60 175 L20 190"/>
    </g>
    <ellipse cx="290" cy="150" rx="120" ry="78" fill="#c29a5c"/>
    <path d="M330 80 L345 225" stroke="#6e5233" stroke-width="12"/><path d="M370 92 L380 215" stroke="#6e5233" stroke-width="12"/>
    <path d="M395 110 Q420 150 395 200 Q430 160 410 120 Z" fill="#3b2a1a"/>
    <ellipse cx="400" cy="150" rx="18" ry="58" fill="#3b2a1a"/>
    <ellipse cx="185" cy="140" rx="95" ry="88" fill="#9a7a4e"/>
    <path d="M170 60 L160 30 M200 58 L205 26 M230 70 L245 42" stroke="#2b231c" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="300" cy="95" rx="170" ry="44" fill="#e4ecea" fill-opacity="0.45" stroke="#cfd8d5" stroke-width="3" transform="rotate(-8 300 95)"/>
    <path d="M150 92 Q300 75 445 95 M160 100 Q300 98 430 112" stroke="#4a3d2e" stroke-opacity="0.5" stroke-width="3" fill="none"/>
    <circle cx="75" cy="150" r="58" fill="#9a7a4e"/>
    <circle cx="62" cy="140" r="54" fill="#c0261d"/>
    <circle cx="44" cy="122" r="14" fill="#f2b1a8" fill-opacity="0.55"/>
    <path d="M30 98 L8 70 M8 70 L-6 62 M8 70 L-2 78" stroke="#2b231c" stroke-width="5" stroke-linecap="round"/>
  </g>`

const render = (card: Card) => {
  const palette = card.red ? { bg1: '#5e1714', bg2: '#2c0a08', accent: '#ff8a70', ink: '#fbe9e4' } : { bg1: '#3f3b2b', bg2: '#1f1c14', accent: '#ffc061', ink: '#f2ecda' }
  const headline = escape(card.pick.toUpperCase())
  const size = headline.length > 26 ? 66 : headline.length > 18 ? 80 : 96
  const figures = [card.odds && `@${card.odds.toFixed(2)}`, card.stake && `APOSTÓ B/. ${card.stake.toFixed(2)}`].filter(Boolean).join('   ·   ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.bg1}"/><stop offset="1" stop-color="${palette.bg2}"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <ellipse cx="300" cy="560" rx="260" ry="30" fill="#000" fill-opacity="0.25"/>
  ${fly(60, 190)}
  <text x="620" y="110" font-family="Big Shoulders Display" font-weight="800" font-size="44" fill="${palette.accent}" letter-spacing="2">LA MOSCA</text>
  <text x="620" y="190" font-family="Atkinson Hyperlegible" font-weight="700" font-size="26" fill="${palette.ink}" fill-opacity="0.7" letter-spacing="3">${escape(card.eyebrow)}</text>
  ${wrap(headline, 560).map((line, i) => `<text x="620" y="${270 + i * (size * 0.95)}" font-family="Big Shoulders Display" font-weight="800" font-size="${size}" fill="${palette.ink}">${line}</text>`).join('\n  ')}
  <text x="620" y="430" font-family="Atkinson Hyperlegible" font-weight="700" font-size="${card.match.length > 30 ? 26 : 30}" fill="${palette.ink}">${escape(card.match)}</text>
  <text x="620" y="470" font-family="Atkinson Hyperlegible" font-size="26" fill="${palette.ink}" fill-opacity="0.75">${escape(card.when)}</text>
  <text x="620" y="530" font-family="Big Shoulders Display" font-weight="800" font-size="48" fill="${palette.accent}">${escape(figures)}</text>
  <text x="620" y="590" font-family="Atkinson Hyperlegible" font-size="22" fill="${palette.ink}" fill-opacity="0.7">Saldo B/. ${state.bankroll.toFixed(2)} de mentira · la-mosca.pages.dev</text>
</svg>`
}

// Greedy word wrap by an approximate condensed-display glyph width.
function wrap(text: string, width: number, perChar = 0.42 * 80): string[] {
  const lines: string[] = []
  for (const word of text.split(' ')) {
    const current = lines.at(-1)
    if (current && (current.length + word.length + 1) * perChar <= width) lines[lines.length - 1] = `${current} ${word}`
    else lines.push(word)
  }
  return lines.slice(0, 2)
}

const card = cardFor()
const png = new Resvg(render(card), {
  font: { loadSystemFonts: false, defaultFontFamily: 'Atkinson Hyperlegible', fontFiles: ['scripts/fonts/BigShouldersDisplay-ExtraBold.ttf', 'scripts/fonts/AtkinsonHyperlegible-Regular.ttf', 'scripts/fonts/AtkinsonHyperlegible-Bold.ttf'] },
}).render().asPng()
writeFileSync('dist/og.png', png)

const description = `La mosca ${card.pick}${card.odds ? ` @${card.odds.toFixed(2)}` : ''}: ${card.match}${card.when ? `, ${card.when}` : ''} · Saldo B/. ${state.bankroll.toFixed(2)} de mentira`
const html = readFileSync('dist/index.html', 'utf8')
  .replaceAll('__OG_IMAGE__', `${SITE}/og.png?v=${now.slice(0, 10)}`)
  .replaceAll('__OG_DESCRIPTION__', escape(description))
writeFileSync('dist/index.html', html)
console.log(`Share card: ${card.eyebrow} / ${description}`)
