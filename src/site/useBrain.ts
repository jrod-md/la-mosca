import { useEffect, useState } from 'react'
import { buildCircuit, type MbCircuit } from '../brain/circuit'
import { Fly } from '../brain/fly'
import { flyState } from './data'

// Compact render points derived from the official MaleCNS skeletons (scripts/compact-skeletons.ts):
// p is a flat [x, y, z, ...] list in one shared, normalized transform.
export interface MorphologyNeuron { id: string; role: string; p: number[] }
export interface MorphologyAsset { neurons: MorphologyNeuron[] }

export interface Brain {
  circuit: MbCircuit
  // A private copy of the live fly: previews never touch the committed state.
  fly: () => Fly
}

// The circuit (~0.5 MB) and the optional morphology load on demand, once per page.
const circuitPromise = () => import('../data/generated/malecns_mushroom_body.json').then(module => buildCircuit(module.default))
let brainPromise: Promise<Brain> | null = null
const loadBrain = () => brainPromise ??= circuitPromise().then(circuit => ({ circuit, fly: () => new Fly(circuit, structuredClone(flyState)) }))

// Missing morphology is fine at build time: the glob simply finds nothing.
const skeletonModules = import.meta.glob<{ default: MorphologyAsset }>('../data/generated/malecns_mushroom_body_points.json')
let skeletonPromise: Promise<MorphologyAsset | null> | null = null
const loadSkeletons = () => skeletonPromise ??= (async () => {
  const loader = Object.values(skeletonModules)[0]
  if (!loader) return null
  try { return (await loader()).default } catch { return null }
})()

export const useBrain = () => {
  const [brain, setBrain] = useState<Brain | null>(null)
  useEffect(() => {
    let active = true
    loadBrain().then(value => { if (active) setBrain(value) }, () => undefined)
    return () => { active = false }
  }, [])
  return brain
}

export const useSkeletons = (enabled: boolean) => {
  const [state, setState] = useState<{ loading: boolean; asset: MorphologyAsset | null }>({ loading: enabled, asset: null })
  useEffect(() => {
    if (!enabled) return
    let active = true
    loadSkeletons().then(asset => { if (active) setState({ loading: false, asset }) })
    return () => { active = false }
  }, [enabled])
  return state
}
