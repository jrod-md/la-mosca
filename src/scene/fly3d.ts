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

const abdomenTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const context = canvas.getContext('2d')!
  context.fillStyle = '#c29a5c'
  context.fillRect(0, 0, 64, 256)
  // Texture v runs from the abdomen's tip (top) to its base (bottom). A male Drosophila has a
  // solid dark tip, then thin brown bands on each tergite (thin and brown, or it reads as a bee).
  context.fillStyle = '#3b2a1a'
  context.fillRect(0, 0, 64, 62)
  context.fillStyle = '#6e5233'
  for (let i = 0; i < 4; i++) context.fillRect(0, 88 + i * 40, 64, 7)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Wing veins drawn as thin dark lines on the membrane.
const wingVeins = (material: THREE.Material) => {
  const points = [
    [0, 0, 0.12, 0.74], [0, 0, 0.04, 0.8], [0.01, 0.05, -0.04, 0.7], [0.02, 0.1, -0.07, 0.48],
    [0.07, 0.38, -0.05, 0.4], [0.09, 0.58, 0.02, 0.6],
  ].flatMap(([x1, y1, x2, y2]) => [x1, y1, 0.002, x2, y2, 0.002])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  return new THREE.LineSegments(geometry, material)
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
  const chitin = new THREE.MeshStandardMaterial({ color: '#9a7a4e', roughness: 0.55, metalness: 0.05, flatShading: true })
  const legMaterial = new THREE.MeshStandardMaterial({ color: '#7a6040', roughness: 0.6, flatShading: true })
  const dark = new THREE.MeshStandardMaterial({ color: '#2b231c', roughness: 0.7, flatShading: true })
  const eye = new THREE.MeshStandardMaterial({ color: '#c0261d', roughness: 0.3, metalness: 0.1, flatShading: true, emissive: '#3a0705' })
  const wingMaterial = new THREE.MeshPhysicalMaterial({ color: '#e4ecea', roughness: 0.15, transparent: true, opacity: 0.42, side: THREE.DoubleSide, iridescence: 0.6, depthWrite: false })
  const veinMaterial = new THREE.LineBasicMaterial({ color: '#4a3d2e', transparent: true, opacity: 0.7 })

  const root = new THREE.Group()
  const body = new THREE.Group()
  body.position.y = 0.62
  root.add(body)

  // Big, humped thorax: the fly's powerhouse, wider than the head and the abdomen's base.
  const thorax = new THREE.Mesh(facet(0.3, 1), chitin)
  thorax.scale.set(0.95, 0.92, 1.0)
  thorax.position.y = 0.04
  thorax.castShadow = true
  body.add(thorax)
  // A few dark macrochaetae (bristles) along the back.
  for (const [x, z] of [[-0.1, -0.12], [0.1, -0.12], [-0.13, 0.05], [0.13, 0.05], [-0.07, 0.16], [0.07, 0.16]]) {
    const bristle = segment(0.1, 0.008, dark)
    bristle.position.set(x, 0.33, z)
    bristle.rotation.x = Math.PI - 0.9
    body.add(bristle)
  }

  // Short, rounded abdomen joined broadly to the thorax (no ant waist), tip angled down.
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshStandardMaterial({ map: abdomenTexture(), roughness: 0.6, flatShading: true }))
  abdomen.scale.set(0.95, 1.08, 0.88)
  abdomen.rotation.x = Math.PI / 2 + 0.35
  abdomen.position.set(0, -0.06, 0.36)
  abdomen.castShadow = true
  body.add(abdomen)

  const head = new THREE.Group()
  head.position.set(0, 0.08, -0.33)
  body.add(head)
  const skull = new THREE.Mesh(facet(0.15, 1), chitin)
  skull.scale.set(1.1, 1, 0.75)
  skull.castShadow = true
  head.add(skull)
  // The signature: huge red compound eyes covering most of the head's sides.
  for (const side of [-1, 1]) {
    const compound = new THREE.Mesh(facet(0.15, 2), eye)
    compound.scale.set(0.72, 1.08, 1)
    compound.position.set(side * 0.12, 0.01, -0.02)
    compound.castShadow = true
    head.add(compound)
  }
  const proboscis = segment(0.09, 0.028, dark)
  proboscis.position.set(0, -0.1, -0.08)
  proboscis.rotation.x = 0.5
  head.add(proboscis)

  // Short stubby antennae on the face, each with a feathery arista.
  const antennae: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const antenna = segment(0.07, 0.02, legMaterial)
    antenna.position.set(side * 0.035, 0.05, -0.13)
    antenna.rotation.set(0.6, 0, side * 0.25)
    const arista = segment(0.09, 0.005, dark)
    arista.position.y = -0.06
    arista.rotation.set(0.9, 0, side * 0.6)
    for (let i = 1; i <= 3; i++) {
      const hair = segment(0.03, 0.003, dark)
      hair.position.y = -0.025 * i
      hair.rotation.z = side * 1.2
      arista.add(hair)
    }
    antenna.add(arista)
    head.add(antenna)
    antennae.push(antenna)
  }

  // Exactly two wings, held flat and overlapping over the abdomen.
  const wingShape = new THREE.Shape()
  wingShape.moveTo(0, 0)
  wingShape.bezierCurveTo(0.14, 0.05, 0.2, 0.42, 0.1, 0.78)
  wingShape.bezierCurveTo(0.02, 0.88, -0.1, 0.8, -0.08, 0.5)
  wingShape.bezierCurveTo(-0.07, 0.25, -0.05, 0.08, 0, 0)
  const wings: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const mount = new THREE.Group()
    mount.position.set(side * 0.08, 0.26, 0.04)
    mount.rotation.y = side * 0.14
    mount.rotation.z = side * -0.12
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape, 10), wingMaterial)
    // Slightly below horizontal so the wings follow the abdomen's downward slope.
    wing.rotation.x = Math.PI / 2 + 0.12
    if (side < 0) wing.scale.x = -1
    wing.add(wingVeins(veinMaterial))
    wing.renderOrder = 2
    mount.add(wing)
    body.add(mount)
    wings.push(wing)
    // Haltere: a tiny balancing knob behind each wing.
    const haltere = segment(0.07, 0.008, legMaterial)
    haltere.position.set(side * 0.2, 0.06, 0.2)
    haltere.rotation.set(-0.6, 0, side * 1.1)
    const knob = new THREE.Mesh(facet(0.022, 0), legMaterial)
    knob.position.y = -0.07
    haltere.add(knob)
    body.add(haltere)
  }

  const frontLegs: THREE.Group[] = []
  const hips: [number, number, 'front' | 'mid' | 'hind'][] = [[-0.18, 'front' as const], [0, 'mid' as const], [0.16, 'hind' as const]]
    .flatMap(([z, kind]) => [[-1, z as number, kind], [1, z as number, kind]] as [number, number, 'front' | 'mid' | 'hind'][])
  for (const [side, z, kind] of hips) {
    // Short, strongly bent legs: femur out and slightly up, tibia down, tarsus on the floor.
    // The front pair reaches forward toward the desk and rubs.
    const mount = kind === 'front'
      ? leg(legMaterial, [0.22, 0.26, 0.12], [side * 0.6, side * -0.3, side * -0.2])
      : leg(legMaterial, [0.26, 0.42, 0.16], [side * 1.7, side * -1.3, side * -0.4])
    mount.position.set(side * 0.17, -0.14, z)
    mount.rotation.x = kind === 'front' ? 1.1 : kind === 'mid' ? -0.05 : -0.4
    if (kind === 'front') frontLegs.push(mount)
    body.add(mount)
  }

  root.scale.setScalar(1.2)
  return { root, head, abdomen, wings, frontLegs, antennae }
}

// Idle life: breathing, wing shiver, the unmistakable front-leg rub, an occasional glance.
export const animateFly = (rig: FlyRig, time: number, thinking: boolean) => {
  rig.abdomen.scale.x = 0.95 + Math.sin(time * 2.1) * 0.015
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
  rig.antennae.forEach((antenna, i) => { antenna.rotation.z = (i === 0 ? -1 : 1) * 0.25 + Math.sin(time * (thinking ? 14 : 3) + i) * (thinking ? 0.12 : 0.04) })
}
