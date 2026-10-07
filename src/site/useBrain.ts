import { useEffect, useState } from 'react'
import { buildCircuit, type MbCircuit } from '../brain/circuit'
import { Fly } from '../brain/fly'
import { flyState } from './data'

export interface SkeletonNeuron { bodyId: number; role: string; points: { x: number; y: number; z: number }[] }
export interface SkeletonAsset { metadata: { normalization: { center: number[]; scale: number } }; neurons: SkeletonNeuron[] }

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
const skeletonModules = import.meta.glob<{ default: SkeletonAsset }>('../data/generated/malecns_mushroom_body_skeletons.json')
let skeletonPromise: Promise<SkeletonAsset | null> | null = null
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
  const [state, setState] = useState<{ loading: boolean; asset: SkeletonAsset | null }>({ loading: enabled, asset: null })
  useEffect(() => {
    if (!enabled) return
    let active = true
    loadSkeletons().then(asset => { if (active) setState({ loading: false, asset }) })
    return () => { active = false }
  }, [enabled])
  return state
}
