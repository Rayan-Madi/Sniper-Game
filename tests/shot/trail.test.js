import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Sillage de la balle (spec du lot 2, §3.3 ; plan, tâche T3) : une traînée fine parcourt la trajectoire pendant le temps
// de vol, visible dans la lunette, puis s'efface ; le trait d'impact (un traceur de 0,12 s dessiné seulement à
// l'impact) est supprimé.
//
// Témoin : avant le lot 2 (commit df6dd66), rien n'était dessiné pendant le vol (mesuré dans Chrome sans interface :
// aucun objet hors carte pendant les 0,45 s), puis main.js posait spawnTracer(départ, impact) à la résolution. Sans
// spawnTrail, le tir est rejoué ainsi (tirAvant) et les tests y échouent sur ce qui est dessiné.
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

let scene, E
beforeEach(async () => {
  vi.resetModules()
  ;({ scene } = await import('../../src/scene.js'))
  E = await import('../../src/effects.js')
  scene.clear()
})

const FROM = new THREE.Vector3(0, 9.5, 28), TO = new THREE.Vector3(2, 1.2, -4)
const VOL = 0.45

// Un tir : le sillage au départ ; avant le lot 2, le traceur à la résolution. avance(dt) fait passer le temps du jeu
// comme la boucle de main.js (résolution de la balle, puis updateEffects).
function tirer(from = FROM, to = TO, vol = VOL) {
  let t = 0, resolu = false
  if (E.spawnTrail) E.spawnTrail(from, to, vol)
  const tir = {
    avance(dt) {
      t += dt
      if (!E.spawnTrail && !resolu && t >= vol - 1e-9) { resolu = true; E.spawnTracer(from, to) }
      E.updateEffects(dt)
    },
    // Images de 1/60 s (la dernière plus courte) jusqu'au temps `fin` après le tir.
    jusqua(fin) { while (fin - t > 1e-9) tir.avance(Math.min(1 / 60, fin - t)) },
  }
  return tir
}
const lignes = () => scene.children.filter(o => o.isLine)
// Points du trait dessiné (dans l'ordre de la géométrie) et leur position sur le trajet, de 0 (départ) à 1 (impact).
function trait(line) {
  const p = line.geometry.attributes.position
  const pts = []
  for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(line.matrixWorld))
  const d = TO.clone().sub(FROM), L2 = d.lengthSq()
  return pts.map(q => {
    const s = q.clone().sub(FROM).dot(d) / L2
    const ecart = q.distanceTo(FROM.clone().addScaledVector(d, s))   // distance au trajet
    return { s, ecart }
  })
}

describe('sillage pendant le vol', () => {
  it('dès le départ et jusqu\'à l\'impact, un trait fin parcourt la trajectoire, sa tête au rythme du vol', () => {
    const tir = tirer()
    for (const t of [0.05, 0.15, 0.3, 0.44]) {
      tir.jusqua(t)
      const l = lignes()
      expect(l.length, `${t} s : un trait dans la scène`).toBe(1)
      const pts = trait(l[0])
      for (const p of pts) expect(p.ecart, `${t} s : sur la trajectoire`).toBeLessThan(1e-6)
      const tete = Math.max(...pts.map(p => p.s)), queue = Math.min(...pts.map(p => p.s))
      expect(tete, `${t} s : la tête`).toBeCloseTo(t / VOL, 6)
      expect(queue, `${t} s : la queue suit la tête`).toBeLessThan(tete)
      expect(queue).toBeGreaterThanOrEqual(0)
    }
  })

  it('un trait fin : une ligne, pas un volume, et jamais écarté de l\'image par une enveloppe périmée', () => {
    const tir = tirer()
    for (let i = 0; i < 20; i++) tir.avance(1 / 60)   // 0,33 s
    const [l] = lignes()
    expect(l?.isLine, 'une ligne pendant le vol').toBe(true)
    expect(l.material.isLineBasicMaterial).toBe(true)
    // La lunette regarde l'impact, zoom ×12 (5°) : le trait, qui y monte, doit être rendu.
    const cam = new THREE.PerspectiveCamera(5, 16 / 9, 0.1, 500)
    cam.position.copy(FROM); cam.lookAt(TO); cam.updateMatrixWorld()
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
    expect(!l.frustumCulled || frustum.intersectsObject(l)).toBe(true)
  })

  it('après l\'impact, il s\'efface et quitte la scène', () => {
    const tir = tirer()
    for (let i = 0; i < 26; i++) tir.avance(1 / 60)   // 0,43 s : encore en vol
    const [l] = lignes()
    expect(l, 'en vol').toBeDefined()
    const enVol = l.material.opacity
    for (let i = 0; i < 6; i++) tir.avance(1 / 60)    // 0,53 s : arrivé
    expect(lignes()).toContain(l)
    expect(l.material.opacity, 'il s\'efface après l\'impact').toBeLessThan(enVol)
    for (let i = 0; i < 30; i++) tir.avance(1 / 60)   // 1,03 s
    expect(lignes()).toEqual([])
  })

  it('le temps de vol vient du tir : un vol de 0,13 s (Vélocité 4) est parcouru en 0,13 s', () => {
    const tir = tirer(FROM, TO, 0.13)
    for (let i = 0; i < 6; i++) tir.avance(1 / 60)    // 0,1 s
    const [l] = lignes()
    expect(l, 'en vol').toBeDefined()
    expect(Math.max(...trait(l).map(p => p.s))).toBeCloseTo(0.1 / 0.13, 6)
  })
})

describe('trait d\'impact supprimé', () => {
  it('effects.js n\'exporte plus spawnTracer', () => {
    expect(E.spawnTracer).toBeUndefined()
  })
})

// Relecture de T3, faite à la tâche T5 (spec du lot 2, §3.3) : au coup, le bout du sillage est ce que la balle rencontre
// sur son rayon (resolveImpact : un PNJ qui marche, le décor, sinon un point au loin). À la fin du vol, la résolution
// peut trouver autre chose (le PNJ est sorti de la ligne : le mur derrière lui) ; main.js recale alors le bout du
// sillage sur le point résolu (retargetTrail), et la tête du sillage y arrive.
// Témoin : sans retargetTrail, le sillage finissait là où le PNJ était au coup (vu rouge).
describe('bout du sillage recalé à la résolution', () => {
  const recaler = (trail, to) => { if (E.retargetTrail) E.retargetTrail(trail, to) }
  // Le PNJ visé au coup était en TO ; à la fin du vol, la balle va plus loin sur le rayon du tir, jusqu'au mur. Ce rayon
  // part de l'œil, 0,4 m au-dessus du canon (FROM, départ du sillage) : le mur n'est pas sur la ligne du canon à TO.
  const OEIL = FROM.clone().add(new THREE.Vector3(-0.15, 0.4, 0))
  const MUR = TO.clone().add(TO.clone().sub(OEIL).multiplyScalar(0.4))

  it('la tête du sillage arrive au point résolu à la fin du vol, puis le sillage s\'efface', () => {
    const trail = E.spawnTrail(FROM, TO, VOL)
    for (let i = 0; i < 26; i++) E.updateEffects(1 / 60)   // 0,433 s : la balle vole encore
    recaler(trail, MUR)                                   // image de la résolution (main.js : resolveBullet)
    E.updateEffects(1 / 60)                               // 0,45 s : arrivée
    const [l] = lignes()
    const p = l.geometry.attributes.position
    const tete = new THREE.Vector3().fromBufferAttribute(p, 1)
    expect(tete.distanceTo(MUR), `tête en ${tete.toArray()}`).toBeLessThan(1e-4)
    for (let i = 0; i < 30; i++) E.updateEffects(1 / 60)
    expect(lignes()).toEqual([])
  })

  it('pendant le vol, le sillage recalé reste sur la ligne du départ au point résolu', () => {
    const trail = E.spawnTrail(FROM, TO, VOL)
    recaler(trail, MUR)
    E.updateEffects(0.2)
    const [l] = lignes()
    const p = l.geometry.attributes.position
    const dir = MUR.clone().sub(FROM).normalize()
    for (let i = 0; i < 2; i++) {
      const q = new THREE.Vector3().fromBufferAttribute(p, i).sub(FROM)
      expect(q.clone().addScaledVector(dir, -q.dot(dir)).length()).toBeLessThan(1e-4)
    }
  })

  it('un sillage déjà effacé ou retiré (relance de la mission) : sans effet ni erreur', () => {
    const trail = E.spawnTrail(FROM, TO, VOL)
    E.clearEffects()
    expect(() => recaler(trail, MUR)).not.toThrow()
    expect(() => recaler(null, MUR)).not.toThrow()
    expect(lignes()).toEqual([])
  })
})
