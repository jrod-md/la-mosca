import type { TeamRef } from './types'

// Explicit source-id mapping, cross-checked against TheSportsDB lookupteam idAPIfootball.
// Names differ across sources ("Veraguas" vs "Veraguas United"), so matching is never done
// by name. Unmapped ids keep their own identity.
export interface CanonicalTeam {
  id: string
  name: string
  sourceIds: readonly string[]
}

export const LPF_TEAMS: readonly CanonicalTeam[] = [
  { id: 'alianza', name: 'Alianza FC', sourceIds: ['af:2881', 'tsdb:139733'] },
  { id: 'arabe-unido', name: 'Árabe Unido', sourceIds: ['af:2882', 'tsdb:139738'] },
  { id: 'atletico-chiriqui', name: 'Atlético Chiriquí', sourceIds: ['af:4675'] },
  { id: 'potros-del-este', name: 'Potros del Este', sourceIds: ['af:2886', 'tsdb:139735'] }, // Formerly Costa del Este; same club per both providers.
  { id: 'herrera', name: 'Herrera FC', sourceIds: ['af:15619', 'tsdb:145085'] },
  { id: 'independiente', name: 'Independiente', sourceIds: ['af:2890', 'tsdb:139108'] },
  { id: 'plaza-amador', name: 'Plaza Amador', sourceIds: ['af:2883', 'tsdb:139737'] },
  { id: 'san-francisco', name: 'San Francisco FC', sourceIds: ['af:2887', 'tsdb:139109'] },
  { id: 'sporting-sm', name: 'Sporting San Miguelito', sourceIds: ['af:2889', 'tsdb:139739'] },
  { id: 'tauro', name: 'Tauro FC', sourceIds: ['af:2885', 'tsdb:139107'] },
  { id: 'umecit', name: 'UMECIT', sourceIds: ['af:20788', 'tsdb:147060'] },
  { id: 'union-cocle', name: 'Unión Coclé', sourceIds: ['af:27364', 'tsdb:154406'] },
  { id: 'universitario', name: 'Universitario', sourceIds: ['af:2888', 'tsdb:139736'] },
  { id: 'veraguas', name: 'Veraguas United', sourceIds: ['af:15620', 'tsdb:145086'] },
]

const BY_SOURCE = new Map(LPF_TEAMS.flatMap(team => team.sourceIds.map(sourceId => [sourceId, team] as const)))

export const teamKey = (team: TeamRef): string => BY_SOURCE.get(team.sourceId)?.id ?? team.sourceId
export const isMappedTeam = (team: TeamRef): boolean => BY_SOURCE.has(team.sourceId)
export const teamName = (key: string): string => LPF_TEAMS.find(team => team.id === key)?.name ?? key
