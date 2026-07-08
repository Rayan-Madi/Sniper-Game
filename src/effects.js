import * as THREE from 'three'
import { scene } from './scene.js'

let effects = []

// Traceur : ligne lumineuse du tireur vers le point d'impact
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
  const parts = []
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.05 + Math.random() * 0.06, 4, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    )
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
  effects.push({ obj: group, parts, life: 0.7, maxLife: 0.7, type: 'impact' })
}

// Poussière au sol (tir manqué)
export function spawnDust(pos) {
  spawnImpact(pos, 0x998877, 8)
}

// Flash de bouche (muzzle flash) à la position de la caméra
export function spawnMuzzle(pos, dir) {
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 6, 6),
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
      for (const p of e.parts) {
        p.vel.y -= 9 * dt                       // gravité
        p.mesh.position.addScaledVector(p.vel, dt)
        p.mesh.material.opacity = t
      }
    }

    if (e.life <= 0) {
      scene.remove(e.obj)
      effects.splice(i, 1)
    }
  }
}

export function clearEffects() {
  for (const e of effects) scene.remove(e.obj)
  effects = []
}
