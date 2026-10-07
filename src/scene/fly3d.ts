import * as THREE from 'three'

// A stylized, flat-shaded Drosophila built from primitives: no external model or license needed.
// Human scale on purpose (Stonkfly-style): the fly stands at its desk like any other bettor.

export type FlyMood = 'idle' | 'thinking' | 'sleeping' | 'nervous' | 'celebrating'

export interface FlyRig {
  root: THREE.Group
  body: THREE.Group
  head: THREE.Group
  abdomen: THREE.Mesh
  wings: THREE.Mesh[]
  frontLegs: THREE.Group[]
  // Every leg mount with its resting swing, for the night-time wriggle.
  legs: { mount: THREE.Group; restX: number; side: number }[]
  antennae: THREE.Mesh[]
  // A small bed, shown only while the fly sleeps.
  bed: THREE.Group
}

const BODY_Y = 0.62
// Mattress top in the fly's local units; on its back, the thorax rests on it.
const MATTRESS_TOP = 0.36

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
  const legs: FlyRig['legs'] = []
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
    legs.push({ mount, restX: mount.rotation.x, side })
    body.add(mount)
  }

  // The bed: a low wooden frame, a mattress, a pillow and a blanket over the far end.
  const bed = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3f2b', roughness: 0.75 })
  const cloth = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
  const block = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    bed.add(mesh)
  }
  block(0.95, 0.14, 1.7, wood, 0, 0.17, 0)
  for (const [x, z] of [[-0.42, -0.8], [0.42, -0.8], [-0.42, 0.8], [0.42, 0.8]]) block(0.07, 0.24, 0.07, wood, x, 0.12, z)
  block(0.95, 0.5, 0.08, wood, 0, 0.3, -0.84)
  block(0.88, 0.12, 1.6, cloth('#d9d4c4'), 0, MATTRESS_TOP - 0.06, 0)
  block(0.5, 0.1, 0.28, cloth('#efe9da'), 0, MATTRESS_TOP + 0.05, -0.62)
  block(0.92, 0.08, 0.7, cloth('#6d4f7a'), 0, MATTRESS_TOP + 0.03, 0.46)
  bed.visible = false
  root.add(bed)

  root.scale.setScalar(1.2)
  return { root, body, head, abdomen, wings, frontLegs, legs, antennae, bed }
}

// Idle life: breathing, wing shiver, the unmistakable front-leg rub, an occasional glance.
// Moods: asleep on its back like Gregor Samsa, legs waving helplessly; pacing and buzzing before a
// national team match; hopping with open wings after Panama wins one.
export const animateFly = (rig: FlyRig, time: number, mood: FlyMood) => {
  const { body } = rig
  const sleeping = mood === 'sleeping', nervous = mood === 'nervous', celebrating = mood === 'celebrating'
  rig.bed.visible = sleeping

  body.rotation.set(0, 0, sleeping ? Math.PI : 0)
  body.position.set(0, BODY_Y, 0)
  if (sleeping) body.position.y = MATTRESS_TOP + 0.34
  if (nervous) {
    body.position.x = Math.sin(time * 0.9) * 0.22
    body.position.y += Math.abs(Math.sin(time * 15)) * 0.012
    body.rotation.y = Math.cos(time * 0.9) * 0.45
  }
  if (celebrating) {
    body.position.y += Math.max(0, Math.sin(time * 5)) * 0.3
    body.rotation.y = Math.sin(time * 1.3) * 0.7
  }

  rig.abdomen.scale.x = 0.95 + (sleeping ? Math.sin(time * 0.9) * 0.03 : Math.sin(time * 2.1) * 0.015)
  rig.wings.forEach((wing, i) => {
    const side = i === 0 ? -1 : 1
    const spread = celebrating ? 0.55 + Math.sin(time * 9) * 0.15 : 0
    wing.parent!.rotation.y = side * (0.14 + spread)
    wing.rotation.y = sleeping ? 0 : Math.sin(time * (nervous || celebrating ? 60 : 23) + i) * (nervous || celebrating ? 0.09 : 0.015)
  })

  rig.legs.forEach(({ mount, restX, side }, i) => {
    mount.rotation.x = sleeping ? restX + Math.sin(time * 1.6 + i * 1.1) * 0.35 : restX
    mount.rotation.z = sleeping ? side * Math.sin(time * 1.3 + i) * 0.2 : 0
    mount.rotation.y = 0
  })
  if (!sleeping) {
    const rub = Math.sin(time * (nervous ? 13 : mood === 'thinking' ? 9 : 6))
    rig.frontLegs.forEach((mount, i) => {
      const side = i % 2 === 0 ? -1 : 1
      mount.rotation.z = side * 0.18 * rub
      mount.rotation.y = side * 0.12 * rub
    })
  }

  const glance = sleeping || nervous ? 0 : Math.max(0, Math.sin(time * 0.35) - 0.8) * 5
  rig.head.rotation.y = sleeping ? 0 : 0.15 + glance * 0.6 + Math.sin(time * 0.7) * 0.05
  rig.head.rotation.x = sleeping ? 0.15 : Math.sin(time * 0.5) * 0.04
  const twitch = nervous ? [16, 0.14] : mood === 'thinking' ? [14, 0.12] : sleeping ? [0.8, 0.05] : [3, 0.04]
  rig.antennae.forEach((antenna, i) => { antenna.rotation.z = (i === 0 ? -1 : 1) * 0.25 + Math.sin(time * twitch[0] + i) * twitch[1] })
}
