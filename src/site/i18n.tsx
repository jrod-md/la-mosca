import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Language = 'es' | 'en'
const STORAGE_KEY = 'la-mosca-language'

const es = {
  brand: 'La Mosca',
  tagline: 'Le di B/. 100 a un cerebro de mosca para que apueste en el fútbol panameño.',
  language: 'Idioma',
  sceneLabel: 'La mosca en su cuarto, frente a la tele con el próximo partido',
  seleToday: 'Hoy juega la Sele',
  seleHeader: 'La Sele',
  slipTitle: 'La jugada',
  slipOpen: 'Apuesta abierta',
  slipThinking: 'Lo que está pensando',
  slipThinkingNote: 'Así decidiría hoy con lo que ha aprendido. La apuesta oficial la hace sola cada mañana a las 7:00.',
  slipSettled: 'Última apuesta',
  slipPassed: 'No le olió bien. Pasó de este partido.',
  slipEmpty: 'No hay partidos de la liga en los próximos días.',
  pick: 'Jugada',
  odds: 'Cuota',
  stake: 'Apostó',
  toWin: 'Cobraría',
  paid: 'Cobró',
  placedAt: 'Decidida',
  proof: 'Registro público',
  dared: 'Se atrevió',
  tilted: 'Tilteada',
  won: 'Ganó',
  lost: 'Perdió',
  void: 'Anulada',
  open: 'Abierta',
  home: 'Gana {team}',
  draw: 'Empate',
  away: 'Gana {team}',
  vs: 'vs',
  moreSpecific: 'Más específica',
  lessSpecific: 'Menos',
  exhibitionNote: 'Exhibición. No cuenta para el saldo y no aprende de esto.',
  totals: 'Goles',
  over: 'Más de 2.5',
  under: 'Menos de 2.5',
  btts: 'Ambos anotan',
  yes: 'Sí',
  no: 'No',
  score: 'Marcador',
  bankroll: 'Saldo',
  bankrollNote: 'Balboas de mentira. Empezó con B/. 100.',
  boldness: 'Audacia',
  streak: 'Racha',
  winsInRow: '{n} ganadas seguidas',
  lossesInRow: '{n} perdidas seguidas',
  oneWin: 'Viene de ganar',
  oneLoss: 'Viene de perder',
  noStreak: 'Sin racha',
  brainTitle: 'El cerebro',
  brainLead: '296 neuronas del cuerpo pedunculado, el centro de aprendizaje de la mosca, con sus conexiones reales.',
  brainLegendPn: 'Entrada: el olor de cada opción',
  brainLegendKc: 'Células de Kenyon: memoria',
  brainLegendMbon: 'Salida: acercarse o evitar',
  brainLegendDan: 'Dopamina: premio y castigo',
  brainReal: 'Conectividad real (MaleCNS v1.0). Actividad simulada.',
  brainSchematic: 'Posiciones esquemáticas mientras carga la morfología real.',
  brainMorphology: 'Morfología real de cada neurona.',
  brainLoading: 'Cargando el cerebro…',
  drives: 'Ganas de apostar',
  drivesNote: 'Impulso neto de las neuronas de salida ante cada opción.',
  recordTitle: 'La libreta',
  recordEmpty: 'Todavía no debuta en vivo. Su primera apuesta oficial sale el {date} a las 7:00 a.m.',
  colDate: 'Fecha',
  colMatch: 'Partido',
  colPick: 'Jugada',
  colOdds: 'Cuota',
  colStake: 'Monto',
  colResult: 'Resultado',
  colBalance: 'Saldo',
  infancyTitle: 'Su infancia',
  infancyLead: 'Antes de debutar vivió {matches} partidos reales de la LPF ({from} a {to}), en orden y sin saber los resultados.',
  infancyStats: '{bets} apuestas, {won} ganadas, {bankruptcies} quiebra(s). Practicó con plata de mentira y debutó con B/. 100 limpios.',
  infancyChart: 'Saldo durante la infancia',
  tastesTitle: 'Sus gustos',
  tastesLead: 'Nació con preferencias que salen de la estructura de su cerebro. Con cada apuesta se le mueven.',
  innate: 'Al nacer',
  learned: 'Ahora',
  tastesNote: 'Nunca apuesta por los equipos que le dan aversión, así que nunca aprende que a veces ganan.',
  howTitle: 'Cómo funciona',
  how1: 'Partidos y resultados reales de la LPF. Las cuotas salen de un modelo Elo entrenado con 973 partidos.',
  how2: 'Cada opción le llega como un olor. Las neuronas reales del cuerpo pedunculado deciden si se acerca o lo evita.',
  how3: 'Si gana, la dopamina de premio cambia sus sinapsis; si pierde, la de castigo. Aprende como aprende una mosca.',
  how4: 'Cada apuesta queda en el historial público de GitHub antes del partido. Nadie puede cambiarla después.',
  disclaimer: 'Dinero ficticio. Esto no es una casa de apuestas y no apuestes lo que diga una mosca.',
  sources: 'Datos neuronales: MaleCNS v1.0, HHMI Janelia FlyEM (CC BY 4.0). Partidos: TheSportsDB y API-Football. El proyecto selecciona y transforma estos datos; no implica respaldo de sus autores.',
  repo: 'Código e historial',
  updated: 'Actualizado {date}',
  flyPick: 'La mosca: {pick}',
} as const

type Dictionary = { [K in keyof typeof es]: string }

const en: Dictionary = {
  brand: 'La Mosca',
  tagline: 'I gave a fly brain B/. 100 to bet on Panamanian football.',
  language: 'Language',
  sceneLabel: 'The fly in its room, facing the TV showing the next match',
  seleToday: 'Panama plays today',
  seleHeader: 'Panama',
  slipTitle: 'The pick',
  slipOpen: 'Open bet',
  slipThinking: 'What it is thinking',
  slipThinkingNote: 'How it would decide today with what it has learned. The official bet is placed on its own every morning at 7:00.',
  slipSettled: 'Last bet',
  slipPassed: 'It did not like the smell. It passed on this match.',
  slipEmpty: 'No league matches in the next few days.',
  pick: 'Pick',
  odds: 'Odds',
  stake: 'Stake',
  toWin: 'Would collect',
  paid: 'Collected',
  placedAt: 'Decided',
  proof: 'Public record',
  dared: 'Dared',
  tilted: 'Tilted',
  won: 'Won',
  lost: 'Lost',
  void: 'Void',
  open: 'Open',
  home: '{team} to win',
  draw: 'Draw',
  away: '{team} to win',
  vs: 'vs',
  moreSpecific: 'Be more specific',
  lessSpecific: 'Less',
  exhibitionNote: 'Exhibition. It does not touch the bankroll and the fly does not learn from it.',
  totals: 'Goals',
  over: 'Over 2.5',
  under: 'Under 2.5',
  btts: 'Both teams score',
  yes: 'Yes',
  no: 'No',
  score: 'Score',
  bankroll: 'Bankroll',
  bankrollNote: 'Fake balboas. It started with B/. 100.',
  boldness: 'Boldness',
  streak: 'Streak',
  winsInRow: '{n} wins in a row',
  lossesInRow: '{n} losses in a row',
  oneWin: 'Coming off a win',
  oneLoss: 'Coming off a loss',
  noStreak: 'No streak',
  brainTitle: 'The brain',
  brainLead: '296 mushroom body neurons, the fly’s learning center, with their real connections.',
  brainLegendPn: 'Input: the smell of each option',
  brainLegendKc: 'Kenyon cells: memory',
  brainLegendMbon: 'Output: approach or avoid',
  brainLegendDan: 'Dopamine: reward and punishment',
  brainReal: 'Real connectivity (MaleCNS v1.0). Simulated activity.',
  brainSchematic: 'Schematic positions while the real morphology loads.',
  brainMorphology: 'Real morphology of every neuron.',
  brainLoading: 'Loading the brain…',
  drives: 'Urge to bet',
  drivesNote: 'Net drive of the output neurons toward each option.',
  recordTitle: 'The ledger',
  recordEmpty: 'It has not debuted live yet. Its first official bet goes out on {date} at 7:00 a.m.',
  colDate: 'Date',
  colMatch: 'Match',
  colPick: 'Pick',
  colOdds: 'Odds',
  colStake: 'Stake',
  colResult: 'Result',
  colBalance: 'Balance',
  infancyTitle: 'Its childhood',
  infancyLead: 'Before its debut it lived through {matches} real LPF matches ({from} to {to}), in order and without knowing the results.',
  infancyStats: '{bets} bets, {won} won, {bankruptcies} bankruptcy(ies). It practiced with fake money and debuted with a clean B/. 100.',
  infancyChart: 'Bankroll during childhood',
  tastesTitle: 'Its tastes',
  tastesLead: 'It was born with preferences that come from the structure of its brain. Every bet nudges them.',
  innate: 'At birth',
  learned: 'Now',
  tastesNote: 'It never bets on teams it dislikes, so it never learns that they sometimes win.',
  howTitle: 'How it works',
  how1: 'Real LPF fixtures and results. Odds come from an Elo model trained on 973 matches.',
  how2: 'Each option reaches it as a smell. Real mushroom body neurons decide whether to approach or avoid.',
  how3: 'A win releases reward dopamine that reshapes its synapses; a loss, punishment dopamine. It learns the way a fly learns.',
  how4: 'Every bet lands in the public GitHub history before kickoff. Nobody can change it afterwards.',
  disclaimer: 'Fake money. This is not a sportsbook, and do not bet on what a fly says.',
  sources: 'Neural data: MaleCNS v1.0, HHMI Janelia FlyEM (CC BY 4.0). Matches: TheSportsDB and API-Football. The project selects and transforms this data; no endorsement by its authors is implied.',
  repo: 'Code and history',
  updated: 'Updated {date}',
  flyPick: 'The fly: {pick}',
}

export const dictionary = { es, en }
export type MessageKey = keyof typeof es

const LanguageContext = createContext<{ language: Language; setLanguage: (language: Language) => void }>({ language: 'es', setLanguage: () => undefined })

const initialLanguage = (): Language => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'es' || stored === 'en') return stored
  } catch { /* storage unavailable */ }
  // Spanish first: the audience is Panamanian. English is one tap away.
  return 'es'
}

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>(initialLanguage)
  useEffect(() => {
    document.documentElement.lang = language
    try { window.localStorage.setItem(STORAGE_KEY, language) } catch { /* storage unavailable */ }
  }, [language])
  const value = useMemo(() => ({ language, setLanguage }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export const useLanguage = () => useContext(LanguageContext)

export const useT = () => {
  const { language } = useLanguage()
  return (key: MessageKey, values: Record<string, string | number> = {}) =>
    dictionary[language][key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`))
}
