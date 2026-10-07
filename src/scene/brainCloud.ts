import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { MbCircuit } from '../brain/circuit'
import { randomFor } from '../brain/random'
import type { MorphologyAsset } from '../site/useBrain'

export type NeuronRole = 'pn' | 'kc' | 'mbon' | 'dan_reward' | 'dan_punishment'

// What lights up: the odor's PNs, the KCs that survive sparsening, MBON drive with its valence,
// and dopamine from the most recent settled bet.
export interface Activity {
  pn: Set<number>
  kc: Set<number>
  mbon: number[]
  dopamine: 'reward' | 'punishment' | null
}

interface NeuronCloud { role: NeuronRole; index: number; start: number; count: number }

const COLORS = {
  idle: new THREE.Color('#55645b'),
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

export class BrainCloud {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 20)
  private readonly controls: OrbitControls
  private readonly colors: THREE.BufferAttribute
  private readonly neurons: NeuronCloud[] = []
  private activity: Activity | null = null
  private readonly color = new THREE.Color()

  constructor(canvas: HTMLCanvasElement, circuit: MbCircuit, morphology: MorphologyAsset | null, still: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const byId = new Map(morphology?.neurons.map(neuron => [neuron.id, neuron]) ?? [])
    const positions: number[] = []
    const roles: [NeuronRole, { id: string }[]][] = [['pn', circuit.pn], ['kc', circuit.kc], ['mbon', circuit.mbon], ['dan_reward', circuit.danReward], ['dan_punishment', circuit.danPunishment]]
    for (const [role, list] of roles) {
      list.forEach((neuron, index) => {
        const shape = byId.get(neuron.id)
        let points: THREE.Vector3[]
        if (shape) {
          // Real morphology, already in one shared normalized transform; scaled up for the view.
          points = []
          for (let i = 0; i < shape.p.length; i += 3) points.push(new THREE.Vector3(shape.p[i] * 2, shape.p[i + 1] * 2, shape.p[i + 2] * 2))
        } else {
          points = sampleCurve(schematicPath(role, neuron.id), role === 'kc' ? 18 : 28)
        }
        this.neurons.push({ role, index, start: positions.length / 3, count: points.length })
        for (const point of points) positions.push(point.x, point.y, point.z)
      })
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this.colors = new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3)
    geometry.setAttribute('color', this.colors)
    geometry.computeBoundingSphere()
    const sphere = geometry.boundingSphere!
    geometry.translate(-sphere.center.x, -sphere.center.y, -sphere.center.z)
    const material = new THREE.PointsMaterial({ size: sphere.radius * 0.022, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    this.scene.add(new THREE.Points(geometry, material))
    this.camera.position.set(0, 0.2, sphere.radius * 2.9)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.enablePan = false
    this.controls.minDistance = sphere.radius * 1.4
    this.controls.maxDistance = sphere.radius * 5
    this.controls.autoRotate = !still
    this.controls.autoRotateSpeed = 0.6
  }

  setActivity(activity: Activity | null) {
    this.activity = activity
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  // phase 0..1 walks the decision: PN (0-0.25), KC (0.25-0.5), MBON + dopamine (0.5-1).
  render(phase: number) {
    const activity = this.activity
    const ramp = (from: number) => activity ? Math.min(1, Math.max(0, (phase - from) / 0.12)) : 0
    const pn = ramp(0.05), kc = ramp(0.3), out = ramp(0.55), dopamine = ramp(0.75)
    const array = this.colors.array as Float32Array
    for (const neuron of this.neurons) {
      let target = COLORS.idle, level = 0.35
      if (activity) {
        if (neuron.role === 'pn' && activity.pn.has(neuron.index)) { target = COLORS.pn; level = 0.35 + pn * 0.65 }
        else if (neuron.role === 'kc' && activity.kc.has(neuron.index)) { target = COLORS.kc; level = 0.35 + kc * 0.65 }
        else if (neuron.role === 'mbon') {
          const value = activity.mbon[neuron.index] ?? 0
          target = value >= 0 ? COLORS.approach : COLORS.avoid
          level = 0.3 + out * Math.min(1, Math.abs(value)) * 0.7
        } else if (neuron.role === 'dan_reward' && activity.dopamine === 'reward') { target = COLORS.reward; level = 0.3 + dopamine * 0.7 }
        else if (neuron.role === 'dan_punishment' && activity.dopamine === 'punishment') { target = COLORS.punishment; level = 0.3 + dopamine * 0.7 }
      }
      this.color.copy(COLORS.idle).lerp(target, level).multiplyScalar(0.35 + level * 0.9)
      for (let i = neuron.start; i < neuron.start + neuron.count; i++) {
        array[i * 3] = this.color.r
        array[i * 3 + 1] = this.color.g
        array[i * 3 + 2] = this.color.b
      }
    }
    this.colors.needsUpdate = true
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.controls.dispose()
    this.scene.traverse(object => {
      const points = object as THREE.Points
      points.geometry?.dispose()
      ;(points.material as THREE.Material | undefined)?.dispose()
    })
    this.renderer.dispose()
  }
}
