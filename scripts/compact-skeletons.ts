// Derives the small render asset the site loads from the official skeleton export: each neuron as
// a tree of points (p) with the index of each point's parent (l), so the site can draw the real
// branches as lines. Roots, branch points and tips are always kept; straight runs are thinned so a
// neuron stays under MAX_POINTS. Coordinates share the export's single global transform, stored as
// integers (thousandths). The full export stays in the repo as the source of truth.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'

const SOURCE = 'src/data/generated/malecns_mushroom_body_skeletons.json'
const OUTPUT = 'src/data/generated/malecns_mushroom_body_points.json'
const MAX_POINTS = 220
// Source units are 8 nm voxels; the whole mushroom body spans about 48,000 of them.
const MIN_TWIG_LENGTH = Number(process.env.MIN_TWIG ?? 600)
const PRUNE_PASSES = 3

interface SourcePoint { id: number; x: number; y: number; z: number; parent: number }
interface Skeleton {
  metadata: { dataset: string; normalization: { center: number[]; scale: number }; availableNeuronCount: number }
  neurons: { bodyId: number; role: string; points: SourcePoint[] }[]
}

const skeletons = JSON.parse(readFileSync(SOURCE, 'utf8')) as Skeleton
const { center, scale } = skeletons.metadata.normalization
const unit = (value: number) => Math.round(value * 1000)

// Keeps structural points (root, branch points, tips) plus every `stride`-th point of each run,
// rewiring each kept point to its nearest kept ancestor.
const thin = (points: SourcePoint[], stride: number) => {
  const byId = new Map(points.map(point => [point.id, point]))
  const children = new Map<number, number>()
  for (const point of points) if (point.parent !== -1) children.set(point.parent, (children.get(point.parent) ?? 0) + 1)
  const depth = new Map<number, number>()
  const depthOf = (point: SourcePoint): number => {
    const known = depth.get(point.id)
    if (known !== undefined) return known
    // Iterative walk to the root: skeletons are deep enough to overflow a recursive one.
    const chain: SourcePoint[] = []
    let cursor: SourcePoint | undefined = point
    while (cursor && !depth.has(cursor.id)) { chain.push(cursor); cursor = cursor.parent === -1 ? undefined : byId.get(cursor.parent) }
    let value = cursor ? depth.get(cursor.id)! : -1
    for (const entry of chain.reverse()) depth.set(entry.id, ++value)
    return depth.get(point.id)!
  }
  const keep = (point: SourcePoint) => point.parent === -1 || !byId.has(point.parent) || (children.get(point.id) ?? 0) !== 1 || depthOf(point) % stride === 0
  const kept = points.filter(keep)
  const index = new Map(kept.map((point, i) => [point.id, i]))
  const links = kept.map(point => {
    let parent = point.parent === -1 ? undefined : byId.get(point.parent)
    while (parent && !index.has(parent.id)) parent = parent.parent === -1 ? undefined : byId.get(parent.parent)
    return parent ? index.get(parent.id)! : -1
  })
  return { kept, links }
}

// Drops terminal twigs shorter than `minLength` (source units): the fine fuzz that costs most of the
// points and reads as noise at this size. The arbor's trunk and main branches stay.
const prune = (points: SourcePoint[], minLength: number) => {
  let current = points
  for (let pass = 0; pass < PRUNE_PASSES; pass++) {
    const byId = new Map(current.map(point => [point.id, point]))
    const children = new Map<number, number>()
    for (const point of current) if (byId.has(point.parent)) children.set(point.parent, (children.get(point.parent) ?? 0) + 1)
    const drop = new Set<number>()
    for (const leaf of current) {
      if (children.has(leaf.id)) continue
      const twig: number[] = []
      let length = 0, cursor = leaf
      // Walk up the unbranched run that ends in this tip.
      while (byId.has(cursor.parent) && (children.get(cursor.id) ?? 0) <= 1) {
        const parent = byId.get(cursor.parent)!
        length += Math.hypot(cursor.x - parent.x, cursor.y - parent.y, cursor.z - parent.z)
        twig.push(cursor.id)
        cursor = parent
      }
      if (byId.has(leaf.parent) && length < minLength) for (const id of twig) drop.add(id)
    }
    if (!drop.size) break
    current = current.filter(point => !drop.has(point.id))
  }
  return current
}

const neurons = skeletons.neurons.map(neuron => {
  const trimmed = prune(neuron.points, MIN_TWIG_LENGTH)
  let stride = 1
  let result = thin(trimmed, stride)
  while (result.kept.length > MAX_POINTS && stride < 64) result = thin(trimmed, stride *= 2)
  // y is flipped so dorsal is up on screen.
  const p = result.kept.flatMap(point => [unit((point.x - center[0]) / scale), unit(-(point.y - center[1]) / scale), unit((point.z - center[2]) / scale)])
  return { id: String(neuron.bodyId), role: neuron.role, p, l: result.links }
})

const total = neurons.reduce((sum, neuron) => sum + neuron.l.length, 0)
writeFileSync(`${OUTPUT}.tmp`, JSON.stringify({
  metadata: {
    dataset: skeletons.metadata.dataset, derivedFrom: SOURCE, maxPointsPerNeuron: MAX_POINTS, neurons: neurons.length, points: total,
    format: 'p: flat [x, y, z, ...] in thousandths; l: index of each point\'s parent within the neuron, -1 for the root',
    transform: 'normalized = (source - global center) / global scale, y flipped; every neuron shares one transform',
  },
  neurons,
}) + '\n')
renameSync(`${OUTPUT}.tmp`, OUTPUT)
console.log(`${neurons.length} neurons, ${total} render points -> ${OUTPUT}`)
