import * as THREE from 'three'

// Panama City at night across the bay, seen through the window. Real 3D depth, so the skyline
// shifts with parallax as the camera drifts. Everything is unlit and fog-free: it glows on its own.

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647

const canvasTexture = (width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { canvas, texture }
}

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

// Visitor's local hour -> phase. Night covers 19:00-05:00.
export const phaseAt = (hour: number): DayPhase => hour >= 5 && hour < 7 ? 'dawn' : hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night'

const SKIES: Record<DayPhase | 'red', [string, string]> = {
  night: ['#04071a', '#2b2848'],
  dawn: ['#3b4f86', '#f2a98c'],
  day: ['#5f9fd8', '#cfe3f2'],
  dusk: ['#2a2350', '#e98a4f'],
  red: ['#1a0406', '#8a1c14'],
}

// Lit windows at night (fewer at dusk and dawn); by day, light facades with dark glass.
const facade = (seed: number, tone: string, daylight: boolean, lit: number) => canvasTexture(64, 256, context => {
  const random = seeded(seed)
  context.fillStyle = daylight ? ['#9aa7b8', '#b3bcc6', '#8c99aa'][seed % 3] : tone
  context.fillRect(0, 0, 64, 256)
  for (let y = 6; y < 252; y += 9) {
    for (let x = 4; x < 60; x += 8) {
      const on = random() < lit
      const tint = random(), alpha = 0.55 + random() * 0.45
      if (daylight) {
        context.fillStyle = '#3e4c60'
        context.globalAlpha = 0.85
        context.fillRect(x, y, 4, 5)
      } else if (on) {
        context.fillStyle = tint < 0.8 ? '#ffd58c' : '#bcd8ff'
        context.globalAlpha = alpha
        context.fillRect(x, y, 4, 5)
      }
    }
  }
  context.globalAlpha = 1
})

const drawSky = (context: CanvasRenderingContext2D, red: boolean, phase: DayPhase) => {
  const { width, height } = context.canvas
  // The water line sits at ~72% down this canvas once mapped onto the sky plane.
  const [top, horizon] = SKIES[red ? 'red' : phase]
  const gradient = context.createLinearGradient(0, 0, 0, height * 0.72)
  gradient.addColorStop(0, top)
  gradient.addColorStop(1, horizon)
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
  if (phase === 'day' && !red) return
  const random = seeded(11)
  for (let i = 0; i < (phase === 'night' || red ? 90 : 20); i++) {
    context.fillStyle = `rgba(255, 255, 255, ${0.25 + random() * 0.55})`
    context.fillRect(random() * width, random() * height * 0.5, 1.5, 1.5)
  }
  if (red) {
    for (const [cx, cy, r] of [[0.3, 0.42, 30], [0.55, 0.36, 24], [0.75, 0.48, 20]]) {
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2
        context.fillStyle = i % 2 ? '#ff6b57' : '#ffe1d6'
        context.fillRect(cx * width + Math.cos(angle) * r, cy * height + Math.sin(angle) * r, 3, 3)
      }
    }
  }
}

export interface City {
  group: THREE.Group
  setLook(red: boolean, phase: DayPhase): void
  dispose(): void
}

export const buildCity = (): City => {
  const group = new THREE.Group()
  const disposables: { dispose(): void }[] = []
  const basic = (parameters: THREE.MeshBasicMaterialParameters) => {
    const material = new THREE.MeshBasicMaterial({ fog: false, toneMapped: false, ...parameters })
    disposables.push(material)
    return material
  }

  const sky = canvasTexture(512, 256, context => drawSky(context, false, 'night'))
  disposables.push(sky.texture)
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(320, 120), basic({ map: sky.texture }))
  skyPlane.rotation.y = Math.PI / 2
  skyPlane.position.set(-150, 28, -40)
  group.add(skyPlane)

  // The bay, with the city's lights stretched across it.
  const drawWater = (daylight: boolean) => canvasTexture(256, 256, context => {
    const random = seeded(23)
    context.fillStyle = daylight ? '#4f7390' : '#04060d'
    context.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 120; i++) {
      context.fillStyle = daylight ? `rgba(230, 240, 250, ${0.1 + random() * 0.25})` : `rgba(255, 205, 135, ${0.08 + random() * 0.3})`
      context.fillRect(random() * 256, random() * 256, 2, 6 + random() * 18)
    }
  })
  const waters = { night: drawWater(false).texture, day: drawWater(true).texture }
  disposables.push(waters.night, waters.day)
  const waterMaterial = basic({ map: waters.night })
  const bay = new THREE.Mesh(new THREE.PlaneGeometry(140, 240), waterMaterial)
  bay.rotation.x = -Math.PI / 2
  bay.position.set(-80, -12, -40)
  group.add(bay)

  // Towers: a few instanced batches, densest where the window's line of sight lands.
  const random = seeded(5)
  const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  disposables.push(geometry)
  const tones = ['#0c1020', '#10142a', '#0a0d18']
  // Per batch: [night, dusk/dawn, day] facades.
  const facades = tones.map((tone, i) => [facade(100 + i * 17, tone, false, 0.4), facade(100 + i * 17, tone, false, 0.18), facade(100 + i * 17, tone, true, 0)].map(entry => entry.texture))
  facades.flat().forEach(texture => disposables.push(texture))
  const towerMaterials = facades.map(([night]) => basic({ map: night }))
  const batches = towerMaterials.map(material => new THREE.InstancedMesh(geometry, material, 40))
  const matrix = new THREE.Matrix4()
  const used = batches.map(() => 0)
  // Across the bay, far enough that towers look small through the window. Measured by raycast:
  // at x ~ -70 the window spans about y -9..3, so rooftops stay mostly below y ~ -1.
  for (let i = 0; i < 110; i++) {
    const z = -78 + random() * 70
    const downtown = Math.abs(z + 42) < 16
    const height = downtown ? 5 + random() * 6.5 : 2 + random() * 4
    const width = 2.6 + random() * 3
    const batch = i % batches.length
    if (used[batch] >= 40) continue
    matrix.compose(new THREE.Vector3(-62 - random() * 30, -12, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * 0.3), new THREE.Vector3(width, height, 2.6 + random() * 3))
    batches[batch].setMatrixAt(used[batch]++, matrix)
  }
  batches.forEach((batch, i) => { batch.count = used[i]; group.add(batch) })

  // A twisted tower in the spirit of the F&F Tower.
  const slabFacades = [facade(77, '#141a33', false, 0.4), facade(77, '#141a33', false, 0.18), facade(77, '#141a33', true, 0)].map(entry => entry.texture)
  slabFacades.forEach(texture => disposables.push(texture))
  const slabMaterial = basic({ map: slabFacades[0] })
  const slab = new THREE.BoxGeometry(3.4, 0.62, 3.4)
  disposables.push(slab)
  for (let i = 0; i < 19; i++) {
    const piece = new THREE.Mesh(slab, slabMaterial)
    piece.position.set(-64, -11.7 + i * 0.64, -40)
    piece.rotation.y = i * 0.11
    group.add(piece)
  }

  // Shoreline lights along the bay walk.
  const shoreMaterial = basic({ color: '#ffcf8a' })
  const shore = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 160), shoreMaterial)
  disposables.push(shore.geometry)
  shore.position.set(-58, -11.8, -40)
  group.add(shore)

  return {
    group,
    setLook(red, phase) {
      drawSky(sky.canvas.getContext('2d')!, red, phase)
      sky.texture.needsUpdate = true
      const variant = phase === 'night' ? 0 : phase === 'day' ? 2 : 1
      towerMaterials.forEach((material, i) => { material.map = facades[i][variant]; material.needsUpdate = true })
      slabMaterial.map = slabFacades[variant]
      slabMaterial.needsUpdate = true
      waterMaterial.map = phase === 'day' ? waters.day : waters.night
      waterMaterial.needsUpdate = true
      shoreMaterial.color.set(phase === 'day' ? '#c9c2b0' : '#ffcf8a')
    },
    dispose() {
      disposables.forEach(item => item.dispose())
    },
  }
}
