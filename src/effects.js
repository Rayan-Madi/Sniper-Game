import * as THREE from 'three'
import { scene } from './scene.js'
import { markShared, disposeObject } from './gfx/dispose.js'
import { SILLAGE } from './shot/tuning.js'

let effects = []

// Ressources communes aux effets, créées en rafale à chaque tir (spec du lot 1 §4.2) : une seule géométrie de
// particule (sphère de rayon 1, mise à l'échelle de chaque particule) et une pour le flash de bouche, marquées
// partagées et jamais libérées. Ce qui change d'un effet à l'autre (l'opacité qui baisse) reste à l'effet : un seul
// matériau par éclaboussure, partagé par ses particules, libéré avec elle en fin de vie.
let particleGeo = null, flashGeo = null
const particleGeometry = () => particleGeo || (particleGeo = markShared(new THREE.SphereGeometry(1, 4, 4)))
const flashGeometry = () => flashGeo || (flashGeo = markShared(new THREE.SphereGeometry(0.4, 6, 6)))

// Sillage de la balle (spec du lot 2, §3.3) : un trait fin parcourt la trajectoire pendant le temps de vol, sa tête au
// rythme de la balle et sa queue qui s'estompe derrière elle, puis s'efface une fois la balle arrivée. Il remplace le
// traceur dessiné à l'impact seulement. Géométrie (deux points réécrits à chaque image, la queue transparente) et
// matériau à lui, libérés en fin de vie. Réglages : SILLAGE (src/shot/tuning.js).
export function spawnTrail(from, to, flightS) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
  // Queue transparente, tête d'un blanc chaud : le trait s'estompe derrière la balle
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 0.85, 0.6, 0, 1, 0.95, 0.85, 1]), 4))
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: SILLAGE.opacite,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const line = new THREE.Line(geo, mat)
  line.frustumCulled = false   // les points bougent à chaque image : l'enveloppe calculée une fois serait périmée
  scene.add(line)
  const vol = Math.max(1e-3, flightS)
  const e = { obj: line, type: 'trail', from: from.clone(), to: to.clone(), vol, age: 0,
    life: vol + SILLAGE.fonduS, maxLife: vol + SILLAGE.fonduS }
  placeTrail(e)
  effects.push(e)
}

// Points du sillage à son âge : tête au rythme du vol, queue en retard d'une part fixe du trajet, puis effacement.
const _p = new THREE.Vector3()
function placeTrail(e) {
  const pos = e.obj.geometry.attributes.position
  const tete = Math.min(1, e.age / e.vol)
  const queue = Math.max(0, Math.min(1, (e.age - SILLAGE.longueur * e.vol) / e.vol))
  pos.setXYZ(0, ...(_p.lerpVectors(e.from, e.to, queue).toArray()))
  pos.setXYZ(1, ...(_p.lerpVectors(e.from, e.to, tete).toArray()))
  pos.needsUpdate = true
  e.obj.material.opacity = SILLAGE.opacite * Math.max(0, Math.min(1, 1 - (e.age - e.vol) / SILLAGE.fonduS))
}

// Impact : éclaboussure de particules au point touché
export function spawnImpact(pos, color = 0xaa2222, count = 14) {
  const group = new THREE.Group()
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
  const parts = []
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(particleGeometry(), material)
    p.scale.setScalar(0.05 + Math.random() * 0.06)   // rayon de 5 à 11 cm
    p.position.copy(pos)
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 3 + 1,
      (Math.random() - 0.5) * 4
    )
    parts.push({ mesh: p, vel })
    group.add(p)
  }
  scene.add(group)
  effects.push({ obj: group, parts, material, life: 0.7, maxLife: 0.7, type: 'impact' })
}

// Poussière au sol (tir manqué)
export function spawnDust(pos) {
  spawnImpact(pos, 0x998877, 8)
}

// Flash de bouche (muzzle flash) à la position de la caméra
export function spawnMuzzle(pos, dir) {
  const flash = new THREE.Mesh(
    flashGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xffee99, transparent: true, opacity: 0.9 })
  )
  flash.position.copy(pos).add(dir.clone().multiplyScalar(1.2))
  scene.add(flash)
  effects.push({ obj: flash, life: 0.08, maxLife: 0.08, type: 'flash' })
}

export function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]
    e.life -= dt
    const t = Math.max(0, e.life / e.maxLife)

    if (e.type === 'trail') {
      e.age += dt
      placeTrail(e)
    } else if (e.type === 'flash') {
      e.obj.material.opacity = t * 0.9
    } else if (e.type === 'impact') {
      e.material.opacity = t
      for (const p of e.parts) {
        p.vel.y -= 9 * dt                       // gravité
        p.mesh.position.addScaledVector(p.vel, dt)
      }
    }

    if (e.life <= 0) {
      disposeObject(e.obj)   // retiré de la scène ; ce qu'il possède est libéré, la géométrie partagée reste
      effects.splice(i, 1)
    }
  }
}

export function clearEffects() {
  for (const e of effects) disposeObject(e.obj)
  effects = []
}

// Trous d'impact persistants au sol (tirs manqués) : les 24 derniers restent visibles. Tous partagent une géométrie
// et un matériau, marqués partagés : retirer un trou ne libère rien.
let holes = []
let holeGeo = null, holeMat = null
export const MAX_HOLES = 24

export function spawnBulletHole(pos) {
  if (!holeGeo) {
    holeGeo = markShared(new THREE.CircleGeometry(0.09, 8))
    holeMat = markShared(new THREE.MeshBasicMaterial({ color: 0x17130f }))
  }
  const hole = new THREE.Mesh(holeGeo, holeMat)
  hole.rotation.x = -Math.PI / 2
  hole.position.copy(pos)
  scene.add(hole); holes.push(hole)
  if (holes.length > MAX_HOLES) holes.shift().removeFromParent()
  return hole
}

export function clearBulletHoles() {
  for (const h of holes) h.removeFromParent()
  holes = []
}
