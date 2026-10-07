// Derives the small render asset the site loads from the official skeleton export:
// up to POINTS_PER_NEURON points per neuron, in the export's single global transform, rounded.
// The full export stays in the repo as the source of truth.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'

const SOURCE = 'src/data/generated/malecns_mushroom_body_skeletons.json'
const OUTPUT = 'src/data/generated/malecns_mushroom_body_points.json'
const POINTS_PER_NEURON = 48

interface Skeleton {
  metadata: { dataset: string; normalization: { center: number[]; scale: number }; availableNeuronCount: number }
  neurons: { bodyId: number; role: string; points: { x: number; y: number; z: number }[] }[]
}

const skeletons = JSON.parse(readFileSync(SOURCE, 'utf8')) as Skeleton
const { center, scale } = skeletons.metadata.normalization
const round = (value: number) => Math.round(value * 1000) / 1000

const neurons = skeletons.neurons.map(neuron => {
  const stride = Math.max(1, Math.ceil(neuron.points.length / POINTS_PER_NEURON))
  // y is flipped so dorsal is up on screen.
  const points = neuron.points.filter((_, i) => i % stride === 0)
    .flatMap(point => [round((point.x - center[0]) / scale), round(-(point.y - center[1]) / scale), round((point.z - center[2]) / scale)])
  return { id: String(neuron.bodyId), role: neuron.role, p: points }
})

writeFileSync(`${OUTPUT}.tmp`, JSON.stringify({
  metadata: {
    dataset: skeletons.metadata.dataset, derivedFrom: SOURCE, pointsPerNeuron: POINTS_PER_NEURON, neurons: neurons.length,
    transform: 'normalized = (source - global center) / global scale, y flipped; every neuron shares one transform',
  },
  neurons,
}) + '\n')
renameSync(`${OUTPUT}.tmp`, OUTPUT)
console.log(`${neurons.length} neurons, ${neurons.reduce((sum, neuron) => sum + neuron.p.length / 3, 0)} render points -> ${OUTPUT}`)
