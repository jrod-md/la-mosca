import type { Language } from './i18n'

const TIME_ZONE = 'America/Panama'
const locale = (language: Language) => language === 'es' ? 'es-PA' : 'en-US'

export const money = (value: number) => `B/. ${value.toFixed(2)}`
export const odds = (value: number) => value.toFixed(2)

export const kickoff = (iso: string, language: Language) =>
  new Intl.DateTimeFormat(locale(language), { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

// National team fixtures (ids "elo:...") only publish the date, so they are shown without a time.
export const timeKnown = (matchId: string) => !matchId.startsWith('elo:')

export const matchTime = (iso: string, matchId: string, language: Language) =>
  timeKnown(matchId) ? kickoff(iso, language) : new Intl.DateTimeFormat(locale(language), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))

export const day = (iso: string, language: Language) =>
  new Intl.DateTimeFormat(locale(language), { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

export const shortDay = (iso: string, language: Language) =>
  new Intl.DateTimeFormat(locale(language), { timeZone: TIME_ZONE, day: 'numeric', month: 'short' }).format(new Date(iso))

export const percent = (value: number) => `${Math.round(value * 100)}%`
