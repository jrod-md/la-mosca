import * as THREE from 'three'

// A stylized, flat-shaded Drosophila built from primitives: no external model or license needed.
// Human scale on purpose (Stonkfly-style): the fly stands at its desk like any other bettor.

export interface FlyRig {
  root: THREE.Group
  head: THREE.Group
  abdomen: THREE.Mesh
  wings: THREE.Mesh[]
  frontLegs: THREE.Group[]
  antennae: THREE.Mesh[]
}

const facet = (radius: number, detail = 1) => new THREE.IcosahedronGeometry(radius, detail)

const stripedTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const context = canvas.getContext('2d')!
  context.fillStyle = '#b39466'
  context.fillRect(0, 0, 64, 256)
  context.fillStyle = '#3a2c1f'
  // Dark tergite bands along the abdomen, thicker toward the tip.
  for (let i = 0; i < 6; i++) context.fillRect(0, 34 + i * 34, 64, 8 + i * 2.5)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const segment = (length: number, radius: number, material: THREE.Material) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius, length, 6), material)
  mesh.geometry.translate(0, -length / 2, 0)
  mesh.castShadow = true
  return mesh
}

// Three-part leg. Angles are absolute-ish bends around the body's z axis (+ points outward for
// side = 1). The returned mount is free for posing (forward/back swing, animation).
const leg = (material: THREE.Material, lengths: [number, number, number], bends: [number, number, number]) => {
  const mount = new THREE.Group()
  const hip = new THREE.Group()
  hip.rotation.z = bends[0]
  mount.add(hip)
  hip.add(segment(lengths[0], 0.03, material))
  const knee = new THREE.Group()
  knee.position.y = -lengths[0]
  knee.rotation.z = bends[1]
  hip.add(knee)
  knee.add(segment(lengths[1], 0.024, material))
  const ankle = new THREE.Group()
  ankle.position.y = -lengths[1]
  ankle.rotation.z = bends[2]
  knee.add(ankle)
  ankle.add(segment(lengths[2], 0.017, material))
  return mount
}

export const buildFly = (): FlyRig => {
  const chitin = new THREE.MeshStandardMaterial({ color: '#6f6252', roughness: 0.55, metalness: 0.05, flatShading: true })
  const dark = new THREE.MeshStandardMaterial({ color: '#2b231c', roughness: 0.7, flatShading: true })
  const eye = new THREE.MeshStandardMaterial({ color: '#b3231d', roughness: 0.25, metalness: 0.1, flatShading: true, emissive: '#3a0705' })
  const wingMaterial = new THREE.MeshPhysicalMaterial({ color: '#dfe8e6', roughness: 0.15, transparent: true, opacity: 0.32, side: THREE.DoubleSide, iridescence: 0.6, depthWrite: false })

  const root = new THREE.Group()
  const body = new THREE.Group()
  body.position.y = 0.8
  root.add(body)

  const thorax = new THREE.Mesh(facet(0.3, 1), chitin)
  thorax.scale.set(0.9, 0.85, 1.05)
  thorax.castShadow = true
  body.add(thorax)

  // Elongated along local y so the texture's bands wrap it, then laid back along +z (the fly faces -z).
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshStandardMaterial({ map: stripedTexture(), roughness: 0.6, flatShading: true }))
  abdomen.scale.set(0.8, 1.2, 0.75)
  abdomen.rotation.x = Math.PI / 2 + 0.25
  abdomen.position.set(0, -0.08, 0.48)
  abdomen.castShadow = true
  body.add(abdomen)

  const head = new THREE.Group()
  head.position.set(0, 0.06, -0.36)
  body.add(head)
  const skull = new THREE.Mesh(facet(0.17, 1), chitin)
  skull.scale.set(1.15, 0.95, 0.8)
  skull.castShadow = true
  head.add(skull)
  for (const side of [-1, 1]) {
    const compound = new THREE.Mesh(facet(0.125, 2), eye)
    compound.scale.set(0.8, 1, 0.95)
    compound.position.set(side * 0.13, 0.02, -0.04)
    compound.castShadow = true
    head.add(compound)
  }
  const proboscis = segment(0.12, 0.03, dark)
  proboscis.position.set(0, -0.08, -0.08)
  proboscis.rotation.x = 0.4
  head.add(proboscis)

  const antennae: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const antenna = segment(0.1, 0.018, dark)
    antenna.position.set(side * 0.04, 0.08, -0.12)
    antenna.rotation.set(2.4, 0, side * 0.35)
    head.add(antenna)
    antennae.push(antenna)
  }

  const wingShape = new THREE.Shape()
  wingShape.moveTo(0, 0)
  wingShape.bezierCurveTo(0.14, 0.05, 0.22, 0.42, 0.1, 0.78)
  wingShape.bezierCurveTo(0.02, 0.9, -0.1, 0.8, -0.08, 0.5)
  wingShape.bezierCurveTo(-0.07, 0.25, -0.05, 0.08, 0, 0)
  const wings: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    // Resting wings lie back over the abdomen, slightly spread.
    const mount = new THREE.Group()
    mount.position.set(side * 0.1, 0.22, 0.05)
    mount.rotation.y = side * 0.22
    mount.rotation.z = side * -0.35
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape, 10), wingMaterial)
    wing.rotation.x = Math.PI / 2 - 0.3
    if (side < 0) wing.scale.x = -1
    mount.add(wing)
    body.add(mount)
    wings.push(wing)
  }

  const frontLegs: THREE.Group[] = []
  const hips: [number, number, 'front' | 'mid' | 'hind'][] = [[-0.22, 'front' as const], [0, 'mid' as const], [0.2, 'hind' as const]]
    .flatMap(([z, kind]) => [[-1, z as number, kind], [1, z as number, kind]] as [number, number, 'front' | 'mid' | 'hind'][])
  for (const [side, z, kind] of hips) {
    // Mid and hind legs plant on the floor; the front pair reaches up to the desk, rubbing.
    // Femur out and up, tibia down to the floor; the front pair reaches forward to the desk.
    const mount = kind === 'front'
      ? leg(chitin, [0.26, 0.3, 0.12], [side * 0.5, side * -0.25, side * -0.2])
      : leg(chitin, [0.3, 0.6, 0.22], [side * 1.9, side * -1.5, side * -0.4])
    mount.position.set(side * 0.18, -0.12, z)
    mount.rotation.x = kind === 'front' ? 1.2 : kind === 'mid' ? -0.1 : -0.45
    if (kind === 'front') frontLegs.push(mount)
    body.add(mount)
  }

  root.scale.setScalar(1.1)
  return { root, head, abdomen, wings, frontLegs, antennae }
}

// Idle life: breathing, wing shiver, the unmistakable front-leg rub, an occasional glance.
export const animateFly = (rig: FlyRig, time: number, thinking: boolean) => {
  rig.abdomen.scale.x = 0.8 + Math.sin(time * 2.1) * 0.015
  rig.wings.forEach((wing, i) => { wing.rotation.y = Math.sin(time * 23 + i) * 0.015 })
  const rub = Math.sin(time * (thinking ? 9 : 6))
  rig.frontLegs.forEach((mount, i) => {
    const side = i % 2 === 0 ? -1 : 1
    mount.rotation.z = side * 0.18 * rub
    mount.rotation.y = side * 0.12 * rub
  })
  const glance = Math.max(0, Math.sin(time * 0.35) - 0.8) * 5
  rig.head.rotation.y = 0.15 + glance * 0.6 + Math.sin(time * 0.7) * 0.05
  rig.head.rotation.x = Math.sin(time * 0.5) * 0.04
  rig.antennae.forEach((antenna, i) => { antenna.rotation.z = (i === 0 ? -1 : 1) * 0.35 + Math.sin(time * (thinking ? 14 : 3) + i) * (thinking ? 0.12 : 0.04) })
}
