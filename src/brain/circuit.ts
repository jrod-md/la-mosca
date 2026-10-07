// Real MaleCNS mushroom body connectivity, indexed for fast simulation.
// Only connections between PN, KC, MBON and DAN roles that the learning model uses are indexed.
export type Role = 'pn' | 'kc' | 'mbon' | 'dan_reward' | 'dan_punishment'

interface RawNode { id: string; type: string | null; role: Role; annotations?: Record<string, unknown> }
interface RawGraph {
  metadata: { dataset: string; realConnectivity: boolean; methodology: { contentSha256: string } }
  nodes: RawNode[]
  edges: { source: string; target: string; weight: number }[]
}

export interface Neuron { id: string; type: string; transmitter: string | null }

export interface MbCircuit {
  sha: string
  pn: Neuron[]
  kc: Neuron[]
  mbon: Neuron[]
  danReward: Neuron[]
  danPunishment: Neuron[]
  // PN -> KC synapse counts, grouped per KC.
  kcInputs: { pn: number; weight: number }[][]
  // KC -> MBON synapse counts; index in this list is the plastic weight index.
  kcToMbon: { kc: number; mbon: number; weight: number }[]
  mbonInputTotal: number[]
  // -1 avoid .. +1 approach, from which DAN class innervates each MBON (see valenceBasis).
  mbonValence: number[]
  // Share (0..1, relative to the most innervated MBON) of reward / punishment DAN input per MBON.
  rewardCoupling: number[]
  punishmentCoupling: number[]
}

export const VALENCE_BASIS = 'Reward (PAM) DANs innervate compartments whose MBONs promote avoidance; punishment (PPL1) DANs innervate approach compartments (Aso et al. 2014). Valence = (PPL1 - PAM) DAN->MBON synapses / total.'

export const buildCircuit = (raw: unknown): MbCircuit => {
  const graph = raw as RawGraph
  if (!graph?.metadata?.realConnectivity || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Not a real connectivity extract')
  const byRole = (role: Role) => graph.nodes.filter(node => node.role === role)
    .map(node => ({ id: node.id, type: node.type ?? 'unknown', transmitter: (node.annotations?.consensusNt ?? node.annotations?.predictedNt ?? null) as string | null }))
  const circuit = { pn: byRole('pn'), kc: byRole('kc'), mbon: byRole('mbon'), danReward: byRole('dan_reward'), danPunishment: byRole('dan_punishment') }
  if (Object.values(circuit).some(list => !list.length)) throw new Error('Circuit is missing a role')
  const index = (list: Neuron[]) => new Map(list.map((neuron, i) => [neuron.id, i]))
  const pnIndex = index(circuit.pn), kcIndex = index(circuit.kc), mbonIndex = index(circuit.mbon)
  const reward = new Set(circuit.danReward.map(neuron => neuron.id)), punishment = new Set(circuit.danPunishment.map(neuron => neuron.id))

  const kcInputs: MbCircuit['kcInputs'] = circuit.kc.map(() => [])
  const kcToMbon: MbCircuit['kcToMbon'] = []
  const rewardIn = circuit.mbon.map(() => 0), punishmentIn = circuit.mbon.map(() => 0)
  for (const edge of graph.edges) {
    if (!Number.isInteger(edge.weight) || edge.weight <= 0) throw new Error('Invalid synapse weight')
    const pn = pnIndex.get(edge.source), kc = kcIndex.get(edge.target), sourceKc = kcIndex.get(edge.source), mbon = mbonIndex.get(edge.target)
    if (pn !== undefined && kc !== undefined) kcInputs[kc].push({ pn, weight: edge.weight })
    if (sourceKc !== undefined && mbon !== undefined) kcToMbon.push({ kc: sourceKc, mbon, weight: edge.weight })
    if (mbon !== undefined && reward.has(edge.source)) rewardIn[mbon] += edge.weight
    if (mbon !== undefined && punishment.has(edge.source)) punishmentIn[mbon] += edge.weight
  }
  const mbonInputTotal = circuit.mbon.map(() => 0)
  for (const synapse of kcToMbon) mbonInputTotal[synapse.mbon] += synapse.weight
  const maxReward = Math.max(...rewardIn, 1), maxPunishment = Math.max(...punishmentIn, 1)
  return {
    sha: graph.metadata.methodology.contentSha256,
    ...circuit,
    kcInputs,
    kcToMbon,
    mbonInputTotal,
    mbonValence: circuit.mbon.map((_, i) => rewardIn[i] + punishmentIn[i] ? (punishmentIn[i] - rewardIn[i]) / (punishmentIn[i] + rewardIn[i]) : 0),
    rewardCoupling: rewardIn.map(value => value / maxReward),
    punishmentCoupling: punishmentIn.map(value => value / maxPunishment),
  }
}

export interface Perception {
  activeKcs: number[]
  mbon: number[]
  // Net approach drive: valence-weighted MBON output, roughly -1..1.
  drive: number
}

// Fraction of KCs left active after global (APL-like) inhibition; a modeling choice, APL is not in the extract.
export const KC_SPARSITY = 0.1

export const perceive = (circuit: MbCircuit, weights: readonly number[], odor: readonly number[]): Perception => {
  const active = new Set(odor)
  const drive = circuit.kcInputs.map(inputs => {
    const total = inputs.reduce((sum, input) => sum + input.weight, 0)
    return total ? inputs.reduce((sum, input) => sum + (active.has(input.pn) ? input.weight : 0), 0) / total : 0
  })
  const winners = Math.max(1, Math.round(circuit.kc.length * KC_SPARSITY))
  const activeKcs = drive.map((value, kc) => ({ value, kc })).filter(entry => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.kc - b.kc).slice(0, winners).map(entry => entry.kc).sort((a, b) => a - b)
  const on = new Set(activeKcs)
  const mbon = circuit.mbon.map(() => 0)
  circuit.kcToMbon.forEach((synapse, i) => { if (on.has(synapse.kc)) mbon[synapse.mbon] += weights[i] })
  // Relative to an average odor at initial weights (KC_SPARSITY of total input).
  for (let i = 0; i < mbon.length; i++) mbon[i] = circuit.mbonInputTotal[i] ? mbon[i] / (circuit.mbonInputTotal[i] * KC_SPARSITY) : 0
  const totalValence = circuit.mbonValence.reduce((sum, value, i) => sum + (circuit.mbonInputTotal[i] ? Math.abs(value) : 0), 0) || 1
  return { activeKcs, mbon, drive: circuit.mbonValence.reduce((sum, value, i) => sum + value * mbon[i], 0) / totalValence }
}
