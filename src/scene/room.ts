import * as THREE from 'three'
import { animateFly, buildFly } from './fly3d'
import { drawBroadcast, drawCalendar, drawPennant, type BroadcastInfo } from './screens'

export interface CalendarInfo { month: string; days: number; firstWeekday: number; circled: number | null }

const PALETTE = {
  normal: { wall: '#3f3b2b', light: '#ffc27a', fog: '#2a271c', hemiSky: '#8c7a55' },
  red: { wall: '#5e1714', light: '#ff7a5c', fog: '#2c0a08', hemiSky: '#a3463a' },
}

const canvasTexture = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { canvas, texture }
}

const box = (w: number, h: number, d: number, color: string, roughness = 0.8) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness }))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

// The fly's room: desk, CRT with the next match, a desk lamp, a wall calendar.
export class Room {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40)
  private readonly fly = buildFly()
  private readonly walls: THREE.MeshStandardMaterial
  private readonly lamp: THREE.SpotLight
  private readonly hemi: THREE.HemisphereLight
  private readonly screen = canvasTexture(640, 480)
  private readonly calendar = canvasTexture(320, 360)
  private readonly screenMaterial: THREE.MeshStandardMaterial
  private readonly pennant: THREE.Mesh
  private readonly target = new THREE.Vector3(-0.25, 1.0, -0.75)
  private pointer = { x: 0, y: 0 }
  private red = false
  thinking = false

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.45
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.walls = new THREE.MeshStandardMaterial({ color: PALETTE.normal.wall, roughness: 0.95 })
    const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), this.walls)
    back.position.set(0, 2.5, -1.6)
    back.receiveShadow = true
    const side = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), this.walls)
    side.rotation.y = Math.PI / 2
    side.position.set(-2.4, 2.5, 1)
    side.receiveShadow = true
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: '#3a2a1f', roughness: 0.85 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(back, side, floor)

    // Desk.
    const desk = new THREE.Group()
    const top = box(2.4, 0.08, 0.9, '#5a3f2b', 0.7)
    top.position.y = 0.92
    desk.add(top)
    for (const [x, z] of [[-1.1, -0.38], [1.1, -0.38], [-1.1, 0.38], [1.1, 0.38]]) {
      const legMesh = box(0.07, 0.9, 0.07, '#3d2a1c')
      legMesh.position.set(x, 0.45, z)
      desk.add(legMesh)
    }
    desk.position.set(-0.2, 0, -1.05)
    this.scene.add(desk)

    // CRT television with the broadcast.
    const tv = new THREE.Group()
    tv.add(box(0.86, 0.68, 0.62, '#d6ccb6', 0.55))
    this.screenMaterial = new THREE.MeshStandardMaterial({ map: this.screen.texture, emissive: '#ffffff', emissiveMap: this.screen.texture, emissiveIntensity: 0.85, roughness: 0.3 })
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.525), this.screenMaterial)
    glass.position.z = 0.312
    tv.add(glass)
    const knob = box(0.05, 0.05, 0.03, '#3b342a')
    knob.position.set(0.37, -0.27, 0.32)
    tv.add(knob)
    tv.position.set(-0.55, 1.3, -1.2)
    tv.rotation.y = 0.28
    this.scene.add(tv)

    // Desk lamp.
    const lampGroup = new THREE.Group()
    const metal = new THREE.MeshStandardMaterial({ color: '#c9962e', roughness: 0.35, metalness: 0.4 })
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 20), metal)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 8), metal)
    arm.position.set(0, 0.27, 0)
    arm.rotation.z = 0.25
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.18, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#c9962e', roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide, emissive: '#5a3b0a' }))
    shade.position.set(-0.08, 0.55, 0.05)
    shade.rotation.z = 0.9
    lampGroup.add(base, arm, shade)
    lampGroup.position.set(0.6, 0.96, -1.15)
    this.scene.add(lampGroup)
    this.lamp = new THREE.SpotLight(PALETTE.normal.light, 70, 7, 0.95, 0.6, 1.4)
    this.lamp.position.set(0.5, 1.55, -1.05)
    this.lamp.target.position.set(-0.2, 0.9, -0.3)
    this.lamp.castShadow = true
    this.lamp.shadow.mapSize.set(1024, 1024)
    this.lamp.shadow.bias = -0.0008
    this.scene.add(this.lamp, this.lamp.target)

    this.hemi = new THREE.HemisphereLight(PALETTE.normal.hemiSky, '#2a1d12', 2.2)
    const fill = new THREE.PointLight('#cfd9e0', 14, 10, 1.6)
    fill.position.set(2.6, 2.8, 2.6)
    // The TV glows onto the fly's face.
    const tvGlow = new THREE.PointLight('#b8d6c8', 4, 3, 2)
    tvGlow.position.set(-0.45, 1.3, -0.8)
    this.scene.add(this.hemi, fill, tvGlow)

    // Wall calendar and (Marea Roja) pennant.
    const calendar = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.56), new THREE.MeshStandardMaterial({ map: this.calendar.texture, roughness: 0.9 }))
    calendar.position.set(0.75, 2.05, -1.59)
    this.scene.add(calendar)
    const pennantCanvas = canvasTexture(300, 200)
    drawPennant(pennantCanvas.canvas)
    this.pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.5), new THREE.MeshStandardMaterial({ map: pennantCanvas.texture, roughness: 0.9, side: THREE.DoubleSide }))
    this.pennant.position.set(-0.6, 2.25, -1.58)
    this.pennant.visible = false
    this.scene.add(this.pennant)

    // Standing in front of the desk, turned toward the TV.
    this.fly.root.position.set(0.15, 0, -0.05)
    this.fly.root.rotation.y = 0.45
    this.scene.add(this.fly.root)

    this.scene.fog = new THREE.Fog(PALETTE.normal.fog, 6, 14)
    this.scene.background = new THREE.Color(PALETTE.normal.fog)
  }

  setBroadcast(info: BroadcastInfo) {
    drawBroadcast(this.screen.canvas, info)
    this.screen.texture.needsUpdate = true
  }

  setCalendar(info: CalendarInfo) {
    drawCalendar(this.calendar.canvas, info.month, info.days, info.firstWeekday, info.circled, this.red)
    this.calendar.texture.needsUpdate = true
  }

  setRed(red: boolean) {
    this.red = red
    const palette = red ? PALETTE.red : PALETTE.normal
    this.walls.color.set(palette.wall)
    this.lamp.color.set(palette.light)
    this.hemi.color.set(palette.hemiSky)
    ;(this.scene.fog as THREE.Fog).color.set(palette.fog)
    ;(this.scene.background as THREE.Color).set(palette.fog)
    this.pennant.visible = red
  }

  setPointer(x: number, y: number) {
    this.pointer = { x, y }
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    // Narrow screens pull back so the fly and the TV both stay in frame.
    this.camera.fov = this.camera.aspect < 0.8 ? 52 : this.camera.aspect < 1.2 ? 44 : 36
    this.camera.updateProjectionMatrix()
  }

  render(time: number, still: boolean) {
    const t = still ? 0 : time
    const drift = still ? 0 : Math.sin(t * 0.12) * 0.12
    // Over the fly's right shoulder, far enough to see the fly whole and read the TV.
    const angle = 0.78 + drift + this.pointer.x * 0.12
    const radius = 4.8
    this.camera.position.set(this.target.x + Math.sin(angle) * radius, 2.15 + this.pointer.y * 0.18, this.target.z + Math.cos(angle) * radius)
    this.camera.lookAt(this.target)
    animateFly(this.fly, t, this.thinking)
    this.screenMaterial.emissiveIntensity = still ? 0.85 : 0.8 + Math.sin(t * 50) * 0.02 + Math.sin(t * 3.1) * 0.03
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.scene.traverse(object => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose()
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(material)) material.forEach(entry => entry.dispose())
      else material?.dispose()
    })
    this.screen.texture.dispose()
    this.calendar.texture.dispose()
    this.renderer.dispose()
  }
}
