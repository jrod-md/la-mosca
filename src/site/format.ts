import type { Language } from './i18n'

const TIME_ZONE = 'America/Panama'
const locale = (language: Language) => language === 'es' ? 'es-PA' : 'en-US'

export const money = (value: number) => `B/. ${value.toFixed(2)}`
export const odds = (value: number) => value.toFixed(2)

export const kickoff = (iso: string, language: Language) =>
  new Intl.DateTimeFormat(locale(language), { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export const day = (iso: string, language: Language) =>
  new Intl.DateTimeFormat(locale(language), { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

export const shortDay = (iso: string, language: Language) =>
  new Intl.DateTimeFormat(locale(language), { timeZone: TIME_ZONE, day: 'numeric', month: 'short' }).format(new Date(iso))

export const percent = (value: number) => `${Math.round(value * 100)}%`
