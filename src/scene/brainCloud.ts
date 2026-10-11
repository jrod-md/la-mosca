import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import type { MbCircuit } from '../brain/circuit'
import { randomFor } from '../brain/random'
import type { MorphologyAsset } from '../site/useBrain'

// Line width in CSS pixels: thin enough to read single branches, dense enough to glow where they bundle.
const LINE_WIDTH = 1.1

export type NeuronRole = 'pn' | 'kc' | 'mbon' | 'dan_reward' | 'dan_punishment'

// What lights up: the odor's PNs, the KCs that survive sparsening, MBON drive with its valence,
// and dopamine from the most recent settled bet.
export interface Activity {
  pn: Set<number>
  kc: Set<number>
  mbon: number[]
  dopamine: 'reward' | 'punishment' | null
}

// One neuron's slice of the segment buffer.
interface NeuronCloud { role: NeuronRole; index: number; start: number; count: number }

const COLORS = {
  idle: new THREE.Color('#4d6157'),
  pn: new THREE.Color('#ffc061'),
  kc: new THREE.Color('#f2ecd8'),
  approach: new THREE.Color('#7ff0c8'),
  avoid: new THREE.Color('#b993ff'),
  reward: new THREE.Color('#ffc061'),
  punishment: new THREE.Color('#b993ff'),
}

// Schematic mushroom body when morphology is unavailable: antennal lobe -> calyx -> peduncle -> lobes.
const schematicPath = (role: NeuronRole, key: string): THREE.Vector3[] => {
  const random = randomFor(`schematic:${key}`)
  const jitter = (scale: number) => new THREE.Vector3((random() - 0.5) * scale, (random() - 0.5) * scale, (random() - 0.5) * scale)
  const calyx = new THREE.Vector3(0.1, 0.55, -0.45)
  const heel = new THREE.Vector3(-0.05, 0.05, 0.35)
  switch (role) {
    case 'pn': return [new THREE.Vector3(-0.15, -0.55, 0.55).add(jitter(0.3)), new THREE.Vector3(0.2, 0.15, -0.2).add(jitter(0.2)), calyx.clone().add(jitter(0.3))]
    case 'kc': {
      const lobe = random() < 0.5 ? new THREE.Vector3(-0.1, 0.85, 0.5) : new THREE.Vector3(-0.75, 0.05, 0.45)
      return [calyx.clone().add(jitter(0.35)), heel.clone().add(jitter(0.12)), lobe.add(jitter(0.25))]
    }
    case 'mbon': {
      const from = random() < 0.5 ? new THREE.Vector3(-0.1, 0.8, 0.5) : new THREE.Vector3(-0.7, 0.05, 0.45)
      return [from.add(jitter(0.25)), new THREE.Vector3(0.35, 0.3, 0.2).add(jitter(0.3)), new THREE.Vector3(0.8, 0.45, -0.1).add(jitter(0.3))]
    }
    default: {
      const to = random() < 0.5 ? new THREE.Vector3(-0.1, 0.75, 0.5) : new THREE.Vector3(-0.65, 0.05, 0.45)
      return [new THREE.Vector3(0.45, -0.75, 0.2).add(jitter(0.3)), new THREE.Vector3(0.1, -0.2, 0.4).add(jitter(0.2)), to.add(jitter(0.25))]
    }
  }
}

const sampleCurve = (points: THREE.Vector3[], count: number) => new THREE.CatmullRomCurve3(points).getSpacedPoints(count - 1)

// Every neuron is drawn as its branches: one line segment from each skeleton point to its parent.
export class BrainCloud {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20)
  private readonly controls: OrbitControls
  private readonly material: LineMaterial
  private readonly colors: Float32Array
  private readonly colorBuffer: THREE.InstancedInterleavedBuffer
  private readonly neurons: NeuronCloud[] = []
  private activity: Activity | null = null
  private readonly color = new THREE.Color()

  constructor(canvas: HTMLCanvasElement, circuit: MbCircuit, morphology: MorphologyAsset | null, still: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const byId = new Map(morphology?.neurons.map(neuron => [neuron.id, neuron]) ?? [])
    // Flat [x1, y1, z1, x2, y2, z2] per segment.
    const segments: number[] = []
    const roles: [NeuronRole, { id: string }[]][] = [['pn', circuit.pn], ['kc', circuit.kc], ['mbon', circuit.mbon], ['dan_reward', circuit.danReward], ['dan_punishment', circuit.danPunishment]]
    for (const [role, list] of roles) {
      list.forEach((neuron, index) => {
        const shape = byId.get(neuron.id)
        const start = segments.length / 6
        if (shape) {
          // Real morphology, already in one shared normalized transform (thousandths); scaled up for the view.
          const push = (i: number) => segments.push(shape.p[i * 3] / 500, shape.p[i * 3 + 1] / 500, shape.p[i * 3 + 2] / 500)
          shape.l.forEach((parent, i) => { if (parent >= 0) { push(parent); push(i) } })
        } else {
          const points = sampleCurve(schematicPath(role, neuron.id), role === 'kc' ? 18 : 28)
          for (let i = 1; i < points.length; i++) segments.push(points[i - 1].x, points[i - 1].y, points[i - 1].z, points[i].x, points[i].y, points[i].z)
        }
        this.neurons.push({ role, index, start, count: segments.length / 6 - start })
      })
    }
    // Centre on the bounding sphere so the brain orbits around its own middle.
    const box = new THREE.Box3()
    const point = new THREE.Vector3()
    for (let i = 0; i < segments.length; i += 3) box.expandByPoint(point.set(segments[i], segments[i + 1], segments[i + 2]))
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    for (let i = 0; i < segments.length; i += 3) {
      segments[i] -= sphere.center.x
      segments[i + 1] -= sphere.center.y
      segments[i + 2] -= sphere.center.z
    }
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(segments)
    this.colors = new Float32Array(segments.length)
    geometry.setColors(this.colors)
    this.colorBuffer = (geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data as THREE.InstancedInterleavedBuffer
    this.colorBuffer.setUsage(THREE.DynamicDrawUsage)
    this.material = new LineMaterial({ linewidth: LINE_WIDTH, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })
    this.scene.add(new LineSegments2(geometry, this.material))
    this.camera.position.set(0, 0.2, sphere.radius * 2.3)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.enablePan = false
    this.controls.minDistance = sphere.radius * 1.2
    this.controls.maxDistance = sphere.radius * 5
    this.controls.autoRotate = !still
    this.controls.autoRotateSpeed = 0.6
  }

  setActivity(activity: Activity | null) {
    this.activity = activity
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.material.resolution.set(width, height)
    // Small screens pack the same branches into fewer pixels: thinner lines keep them apart.
    this.material.linewidth = LINE_WIDTH * Math.min(1, Math.max(0.55, width / 720))
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  // phase 0..1 walks the decision: PN (0-0.25), KC (0.25-0.5), MBON + dopamine (0.5-1).
  render(phase: number) {
    const activity = this.activity
    const ramp = (from: number) => activity ? Math.min(1, Math.max(0, (phase - from) / 0.12)) : 0
    const pn = ramp(0.05), kc = ramp(0.3), out = ramp(0.55), dopamine = ramp(0.75)
    const array = this.colors
    for (const neuron of this.neurons) {
      let target = COLORS.idle, level = 0.3
      if (activity) {
        if (neuron.role === 'pn' && activity.pn.has(neuron.index)) { target = COLORS.pn; level = 0.3 + pn * 0.7 }
        else if (neuron.role === 'kc' && activity.kc.has(neuron.index)) { target = COLORS.kc; level = 0.3 + kc * 0.7 }
        else if (neuron.role === 'mbon') {
          const value = activity.mbon[neuron.index] ?? 0
          target = value >= 0 ? COLORS.approach : COLORS.avoid
          level = 0.25 + out * Math.min(1, Math.abs(value)) * 0.75
        } else if (neuron.role === 'dan_reward' && activity.dopamine === 'reward') { target = COLORS.reward; level = 0.25 + dopamine * 0.75 }
        else if (neuron.role === 'dan_punishment' && activity.dopamine === 'punishment') { target = COLORS.punishment; level = 0.25 + dopamine * 0.75 }
      }
      // Resting neurons stay faint so the lit pathway reads against them (additive blending).
      this.color.copy(COLORS.idle).lerp(target, level).multiplyScalar(0.07 + level * level * 0.95)
      const { r, g, b } = this.color
      // Six floats per segment: start colour, end colour.
      for (let i = neuron.start * 6, end = (neuron.start + neuron.count) * 6; i < end; i += 3) {
        array[i] = r
        array[i + 1] = g
        array[i + 2] = b
      }
    }
    this.colorBuffer.needsUpdate = true
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.controls.dispose()
    this.scene.traverse(object => (object as LineSegments2).geometry?.dispose())
    this.material.dispose()
    this.renderer.dispose()
  }
}
