import * as THREE from 'three'
import { scene } from './scene.js'
import { markShared, disposeObject } from './gfx/dispose.js'

let effects = []

// Ressources communes aux effets, créées en rafale à chaque tir (spec du lot 1 §4.2) : une seule géométrie de
// particule (sphère de rayon 1, mise à l'échelle de chaque particule) et une pour le flash de bouche, marquées
// partagées et jamais libérées. Ce qui change d'un effet à l'autre (l'opacité qui baisse) reste à l'effet : un seul
// matériau par éclaboussure, partagé par ses particules, libéré avec elle en fin de vie.
let particleGeo = null, flashGeo = null
const particleGeometry = () => particleGeo || (particleGeo = markShared(new THREE.SphereGeometry(1, 4, 4)))
const flashGeometry = () => flashGeo || (flashGeo = markShared(new THREE.SphereGeometry(0.4, 6, 6)))

// Traceur : ligne lumineuse du tireur vers le point d'impact (géométrie et matériau à lui, libérés en fin de vie)
export function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()])
  const mat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.9 })
  const line = new THREE.Line(geo, mat)
  scene.add(line)
  effects.push({ obj: line, life: 0.12, maxLife: 0.12, type: 'tracer' })
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

    if (e.type === 'tracer' || e.type === 'flash') {
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
