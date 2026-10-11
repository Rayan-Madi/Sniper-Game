import * as THREE from 'three'
import { scene } from './scene.js'
import { markShared, disposeObject } from './gfx/dispose.js'
import { SILLAGE, MARQUES } from './shot/tuning.js'

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
// matériau à lui, libérés en fin de vie. Réglages : SILLAGE (src/shot/tuning.js). Renvoie le sillage, que
// retargetTrail recale si la balle, à la fin de son vol, touche autre chose que ce qu'on voyait au coup.
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
  return e
}

// Le bout du sillage passe à `to` (le point d'impact résolu à la fin du vol : le PNJ est sorti de la ligne, ou y est
// entré) ; sa tête et sa queue gardent leur place dans le vol. Sans effet sur un sillage déjà effacé ou retiré.
export function retargetTrail(trail, to) {
  if (!trail || !effects.includes(trail)) return
  trail.to.copy(to)
  placeTrail(trail)
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
  effects.push({ obj: group, parts, material, life: 0.7, maxLife: 0.7, type: 'impact', gravity: 9 })
}

// ─── Impacts sur le décor (spec du lot 2, §3.4) ────────────────────
// Gerbes par matière (maps.js, userData.surface) : un ou deux nuages de particules, chacun avec sa couleur, son
// nombre, sa vitesse (m/s, jaillissant de la surface : le long de la normale, avec un écart au hasard dans la
// demi-sphère du tireur), le rayon de ses particules (m), sa durée de vie (s) et sa gravité (m/s²). Lumineux :
// hors tone mapping, en mélange additif (étincelles).
const GERBES = {
  metal: [{ couleur: 0xffcf73, nombre: 12, vitesse: 7, ecart: 0.9, taille: [0.012, 0.028], vie: 0.3, gravite: 9, lumineux: true }],   // étincelles
  pierre: [
    { couleur: 0x8f897d, nombre: 8, vitesse: 4, ecart: 0.7, taille: [0.025, 0.05], vie: 0.6, gravite: 9 },    // éclats
    { couleur: 0xb3aea4, nombre: 6, vitesse: 1.2, ecart: 0.8, taille: [0.07, 0.13], vie: 0.9, gravite: 0.6 }, // poussière
  ],
  bois: [{ couleur: 0x7b5329, nombre: 9, vitesse: 4, ecart: 0.8, taille: [0.018, 0.04], vie: 0.6, gravite: 9 }],   // échardes
  sol: [{ couleur: 0x998877, nombre: 8, vitesse: 3, ecart: 0.8, taille: [0.05, 0.11], vie: 0.7, gravite: 9 }],     // poussière
}

// Gerbe d'un impact sur le décor : au point touché, jaillissant de la surface (normal : unitaire, tournée vers le
// tireur), selon sa matière ('pierre' si inconnue). Particules sur la géométrie partagée, un matériau par nuage,
// libéré en fin de vie.
const _r = new THREE.Vector3()
export function spawnSpray(point, normal, surface) {
  for (const n of GERBES[surface] || GERBES.pierre) {
    const group = new THREE.Group()
    const material = new THREE.MeshBasicMaterial({ color: n.couleur, transparent: true, opacity: 1,
      ...(n.lumineux ? { toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false } : {}) })
    const parts = []
    for (let i = 0; i < n.nombre; i++) {
      const p = new THREE.Mesh(particleGeometry(), material)
      p.scale.setScalar(n.taille[0] + Math.random() * (n.taille[1] - n.taille[0]))
      p.position.copy(point)
      // Écart au hasard ramené dans la demi-sphère de la normale : rien ne part dans la surface
      _r.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      if (_r.lengthSq() < 1e-8) _r.copy(normal)
      _r.normalize()
      const d = _r.dot(normal)
      if (d < 0) _r.addScaledVector(normal, -2 * d)
      const vel = normal.clone().multiplyScalar(0.6 + Math.random() * 0.4).addScaledVector(_r, n.ecart).normalize()
        .multiplyScalar(n.vitesse * (0.5 + Math.random() * 0.5))
      parts.push({ mesh: p, vel })
      group.add(p)
    }
    scene.add(group)
    effects.push({ obj: group, parts, material, life: n.vie, maxLife: n.vie, type: 'impact', gravity: n.gravite })
  }
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
        p.vel.y -= e.gravity * dt               // gravité
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

// Trous d'impact persistants dans le décor (spec du lot 2, §3.4) : les MARQUES.max derniers restent visibles. Tous
// partagent une géométrie et un matériau, marqués partagés : retirer un trou ne libère rien.
let holes = []
let holeGeo = null, holeMat = null
export const MAX_HOLES = MARQUES.max
// Décollement de la marque le long de la normale : au-dessus des flaques du port (1,5 cm) et des fenêtres plaquées sur
// les façades (2 cm), sans scintiller avec la surface.
const HOLE_LIFT = 0.035
const UP = new THREE.Vector3(0, 1, 0), DISC = new THREE.Vector3(0, 0, 1)

// Trou au point touché, à plat sur la surface (normal : unitaire, tournée vers le tireur ; le sol par défaut).
// support : l'objet qui bouge et sur lequel il reste (une jeep du convoi), sinon la scène.
export function spawnBulletHole(pos, normal = UP, support = null) {
  if (!holeGeo) {
    holeGeo = markShared(new THREE.CircleGeometry(0.09, 8))
    holeMat = markShared(new THREE.MeshBasicMaterial({ color: 0x17130f }))
  }
  const hole = new THREE.Mesh(holeGeo, holeMat)
  hole.quaternion.setFromUnitVectors(DISC, normal)   // le disque (dans son plan XY) regarde le long de la normale
  hole.position.copy(pos).addScaledVector(normal, HOLE_LIFT)
  scene.add(hole); holes.push(hole)
  if (support) support.attach(hole)   // garde sa place dans le monde, puis suit le support
  if (holes.length > MAX_HOLES) holes.shift().removeFromParent()
  return hole
}

export function clearBulletHoles() {
  for (const h of holes) h.removeFromParent()
  holes = []
}
