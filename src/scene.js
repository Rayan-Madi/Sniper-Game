import * as THREE from 'three'

export let scene, camera, renderer
export let ambient, sun, fill

export function initScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87a0b0)
  scene.fog = new THREE.Fog(0x87a0b0, 40, 120)

  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200)
  camera.position.set(0, 8, 30)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('canvas'),
    antialias: true,
    powerPreference: 'high-performance',   // force le GPU dédié si dispo
  })
  renderer.setSize(innerWidth, innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))   // netteté sur écrans HD
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // Rendu "cinéma" : tone mapping filmique (couleurs riches, hautes lumières douces)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.35

  // Lumières (intensités ajustables par chaque map via setLighting)
  ambient = new THREE.AmbientLight(0xfff0e0, 0.6)
  scene.add(ambient)

  sun = new THREE.DirectionalLight(0xfff0cc, 1.2)
  sun.position.set(20, 40, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 200
  sun.shadow.camera.left = -60
  sun.shadow.camera.right = 60
  sun.shadow.camera.top = 60
  sun.shadow.camera.bottom = -60
  scene.add(sun)

  fill = new THREE.DirectionalLight(0xc0d8ff, 0.4)
  fill.position.set(-10, 10, -10)
  scene.add(fill)

  // NOTE : pas de buildEnvironment() ici — chaque map construit son propre décor
  // (sinon les bâtiments de la rue se superposeraient sur toutes les maps)

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
  })
}

// Règle l'éclairage selon l'ambiance de la map (jour / nuit / intérieur)
export function setLighting({ ambientI = 0.6, sunI = 1.2, fillI = 0.4, sunColor = 0xfff0cc, ambColor = 0xfff0e0 } = {}) {
  if (!ambient) return
  ambient.intensity = ambientI
  ambient.color.setHex(ambColor)
  sun.intensity = sunI
  sun.color.setHex(sunColor)
  fill.intensity = fillI
}

function buildEnvironment() {
  // Sol
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshLambertMaterial({ color: 0x7a8a6a })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // Route
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 80),
    new THREE.MeshLambertMaterial({ color: 0x444444 })
  )
  road.rotation.x = -Math.PI / 2
  road.position.y = 0.01
  scene.add(road)

  // Bâtiments
  const buildings = [
    { x: -18, z: -10, w: 10, h: 14, d: 10, color: 0x8a7a6a },
    { x:  18, z: -8,  w: 8,  h: 18, d: 8,  color: 0x7a8a7a },
    { x: -16, z: 10,  w: 12, h: 10, d: 8,  color: 0x9a8a7a },
    { x:  16, z: 12,  w: 10, h: 12, d: 10, color: 0x6a7a8a },
    { x:  0,  z: -25, w: 14, h: 20, d: 12, color: 0x7a6a5a },
    { x: -30, z: 5,   w: 8,  h: 9,  d: 8,  color: 0x8a9a8a },
    { x:  28, z: -2,  w: 8,  h: 16, d: 8,  color: 0x6a8a7a },
  ]

  for (const b of buildings) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      new THREE.MeshLambertMaterial({ color: b.color })
    )
    mesh.position.set(b.x, b.h / 2, b.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)

    // Fenêtres
    for (let i = 0; i < 6; i++) {
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.6),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0xffee88 : 0x334455 })
      )
      win.position.set(
        b.x + (Math.random() - 0.5) * (b.w - 2),
        b.h * 0.3 + Math.random() * b.h * 0.4,
        b.z + b.d / 2 + 0.01
      )
      scene.add(win)
    }
  }

  // Arbres
  for (let i = 0; i < 20; i++) {
    const x = (Math.random() - 0.5) * 60
    const z = (Math.random() - 0.5) * 50
    if (Math.abs(x) < 5) continue
    addTree(x, z)
  }

  // Voitures garées
  const carColors = [0xcc2222, 0x2244cc, 0x888888, 0x224422, 0xccaa22]
  for (let i = 0; i < 6; i++) {
    addCar(-5 + i * 0.2, 0.4, -8 + i * 4, carColors[i % carColors.length])
  }
}

function addTree(x, z) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 2, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a3a1a })
  )
  trunk.position.set(x, 1, z)
  trunk.castShadow = true
  scene.add(trunk)

  const foliage = new THREE.Mesh(
    new THREE.SphereGeometry(1.6 + Math.random(), 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x2d5a1a })
  )
  foliage.position.set(x, 3.5, z)
  foliage.castShadow = true
  scene.add(foliage)
}

function addCar(x, y, z, color) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.8, 4.5),
    new THREE.MeshLambertMaterial({ color })
  )
  body.position.set(x, y, z)
  body.castShadow = true
  scene.add(body)

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.7, 2.4),
    new THREE.MeshLambertMaterial({ color })
  )
  roof.position.set(x, y + 0.75, z - 0.2)
  scene.add(roof)
}
