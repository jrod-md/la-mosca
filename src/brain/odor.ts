import { randomFor } from './random'

// Each betting option becomes an "odor": a set of active PN glomeruli (indices into circuit.pn).
// Codes are deterministic project choices; the connectome decides what the fly makes of them.
export const ODOR_SIZE = { team: 8, role: 2, price: 2, draw: 8 }
export const PRICE_BUCKETS = [1.6, 2.2, 3.0, 4.5] as const

export type Selection = 'home' | 'draw' | 'away'

export const glomeruli = (label: string, count: number, total: number): number[] => {
  const random = randomFor(`odor:${label}`)
  const chosen = new Set<number>()
  while (chosen.size < Math.min(count, total)) chosen.add(Math.floor(random() * total))
  return [...chosen].sort((a, b) => a - b)
}

export const priceBucket = (odds: number): number => PRICE_BUCKETS.filter(limit => odds >= limit).length

export const optionOdor = (selection: Selection, team: string | null, odds: number, pnCount: number): number[] => {
  const parts = selection === 'draw'
    ? [glomeruli('draw', ODOR_SIZE.draw, pnCount)]
    : [glomeruli(`team:${team}`, ODOR_SIZE.team, pnCount), glomeruli(`role:${selection}`, ODOR_SIZE.role, pnCount)]
  parts.push(glomeruli(`price:${priceBucket(odds)}`, ODOR_SIZE.price, pnCount))
  return [...new Set(parts.flat())].sort((a, b) => a - b)
}
