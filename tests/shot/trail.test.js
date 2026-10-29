import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { trajectoire } from '../../src/shot/ballistics.js'

// Sillage de la balle (spec du lot 2, §3.3 ; plan du lot 2, tâche T3 ; spec du lot 3, §2 c, tâche A4) : une traînée
// fine parcourt la trajectoire pendant le temps de vol, visible dans la lunette, puis s'efface. Depuis la tâche A4, la
// balle vole sur une courbe (elle monte au-dessus de la visée, la recroise à la distance de réglage, puis tombe) : la
// tête du sillage est la balle elle-même, partie du canon (sous la lunette, un peu à droite), qui rejoint sa
// trajectoire en arrivant au point d'impact ; sa queue la suit sur la même courbe.
//
// Témoins : avant le lot 2 (commit df6dd66), rien n'était dessiné pendant le vol (vu rouge à la tâche T3). Avant la
// tâche A4, le sillage était un trait droit du canon au point d'impact : appelé comme le main.js d'avant l'appelait (du
// canon au point d'impact de la courbe, pour le temps du vol), sa tête passe jusqu'à 35,4 cm sous la balle d'un tir à
// 430 m, la lunette réglée ou non : la flèche d'une parabole sur sa corde, g·t²/8, ne dépend que du temps de vol (vu
// rouge à la tâche A4, avec le src/effects.js de 97336ed dans un témoin ponctuel, non versionné).

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

const v = (x, y, z) => new THREE.Vector3(x, y, z)
const OEIL = v(0, 9.5, 28)
const CANON = OEIL.clone().add(v(0.15, -0.4, 0))   // départ du sillage : 0,4 m sous l'œil, 0,15 m à droite
// Tir à 430 m sans réglage : la plus forte courbure (1,41 m de chute), un vol de 0,5375 s jusqu'au mur.
const TRAJ = trajectoire({ origine: OEIL, dir: v(0, 0, -1), v0: 800, g: 9.81, zero: null })
const VOL = 430 / 800

const lignes = () => scene.children.filter(o => o.isLine)
// Les deux points du trait dessiné (queue, tête), dans le monde.
function trait(line = lignes()[0]) {
  const p = line.geometry.attributes.position
  return [0, 1].map(i => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(line.matrixWorld))
}
// Où doit être un point du sillage à τ secondes de vol, pour une fin de vol `fin` : sur la trajectoire, décalé du canon
// d'autant moins qu'il approche de l'impact.
const attendu = (tau, fin = VOL, traj = TRAJ, depart = CANON) =>
  traj.pointA(tau).addScaledVector(depart.clone().sub(traj.origine), Math.max(0, 1 - tau / fin))
// Images de 1/60 s (la dernière plus courte) jusqu'au temps `t` après le tir, en partant de `depuis`.
function jusqua(t, depuis = 0) { for (let x = depuis; t - x > 1e-9; x += 1 / 60) E.updateEffects(Math.min(1 / 60, t - x)) }

describe('le sillage suit la balle sur sa trajectoire', () => {
  it('sa tête est la balle : partie du canon, elle suit la courbe et arrive au point d\'impact', () => {
    E.spawnTrail(CANON, TRAJ, VOL)
    let t = 0
    for (const tau of [0.05, 0.15, 0.27, 0.4, 0.5]) {
      jusqua(tau, t); t = tau
      const [, tete] = trait()
      expect(tete.distanceTo(attendu(tau)), `${tau} s`).toBeLessThan(1e-4)
    }
    jusqua(VOL, t)
    expect(trait()[1].distanceTo(TRAJ.pointA(VOL)), 'à l\'impact').toBeLessThan(1e-4)
  })

  it('à mi-vol, la tête est bien sur la courbe, au-dessus de la corde du canon à l\'impact (la balle tombe ensuite)', () => {
    E.spawnTrail(CANON, TRAJ, VOL)
    jusqua(VOL / 2)
    const [, tete] = trait()
    const corde = CANON.clone().lerp(TRAJ.pointA(VOL), 0.5)
    expect(tete.y - corde.y).toBeGreaterThan(0.3)   // la flèche d'un vol de 0,54 s : g·t²/8 = 35 cm
  })

  it('réglé à 430 m : il monte au-dessus de la visée et y redescend à l\'impact', () => {
    const regle = trajectoire({ origine: OEIL, dir: v(0, 0, -1), v0: 800, g: 9.81, zero: 430 })
    E.spawnTrail(CANON, regle, VOL)
    jusqua(VOL / 2)
    expect(trait()[1].distanceTo(attendu(VOL / 2, VOL, regle))).toBeLessThan(1e-4)
    expect(trait()[1].y - OEIL.y, 'au-dessus de la ligne de visée à mi-vol').toBeGreaterThan(0.1)
  })

  it('sa queue la suit à 35 % du vol, sur la même courbe', () => {
    E.spawnTrail(CANON, TRAJ, VOL)
    jusqua(0.4)
    const [queue] = trait()
    expect(queue.distanceTo(attendu(0.4 - 0.35 * VOL))).toBeLessThan(1e-4)
  })

  it('un trait fin : une ligne, pas un volume, et jamais écarté de l\'image par une enveloppe périmée', () => {
    E.spawnTrail(CANON, TRAJ, VOL)
    jusqua(0.33)
    const [l] = lignes()
    expect(l?.isLine, 'une ligne pendant le vol').toBe(true)
    expect(l.material.isLineBasicMaterial).toBe(true)
    const cam = new THREE.PerspectiveCamera(5, 16 / 9, 0.1, 1000)
    cam.position.copy(OEIL); cam.lookAt(TRAJ.pointA(VOL)); cam.updateMatrixWorld()
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
    expect(!l.frustumCulled || frustum.intersectsObject(l)).toBe(true)
  })
})

describe('durée du sillage', () => {
  it('le temps de vol vient du tir : un vol de 0,04 s (31 m) est parcouru en 0,04 s', () => {
    const court = trajectoire({ origine: OEIL, dir: v(0, -0.2, -1), v0: 800, g: 9.81, zero: 31 })
    E.spawnTrail(CANON, court, 0.04)
    jusqua(0.03)
    expect(trait()[1].distanceTo(attendu(0.03, 0.04, court))).toBeLessThan(1e-4)
  })

  it('après l\'impact, il s\'efface (0,25 s) et quitte la scène', () => {
    E.spawnTrail(CANON, TRAJ, VOL)
    jusqua(VOL - 0.01)
    const [l] = lignes()
    const enVol = l.material.opacity
    jusqua(VOL + 0.1, VOL - 0.01)
    expect(lignes()).toContain(l)
    expect(l.material.opacity).toBeLessThan(enVol)
    jusqua(VOL + 0.26, VOL + 0.1)
    expect(lignes()).toEqual([])
  })
})

// Le bout du sillage, prévu au coup (src/shot/balle.js, predireImpact : le monde tel qu'il est au coup), est recalé à
// l'arrivée de la balle sur l'instant de l'impact (main.js, resolveBullet) : un PNJ sorti de la ligne (la balle va
// plus loin, jusqu'au mur), ou entré dedans (elle s'arrête plus tôt). La tête du sillage y arrive.
// Témoin (tâche T5) : sans retargetTrail, le sillage finissait là où le PNJ était au coup (vu rouge).
describe('bout du sillage recalé à l\'arrivée de la balle', () => {
  it('la balle va plus loin que prévu : la tête continue sur la courbe jusqu\'au nouvel impact, puis s\'efface', () => {
    const trail = E.spawnTrail(CANON, TRAJ, 0.3)   // prévu : un PNJ à 240 m
    jusqua(0.29)
    E.retargetTrail(trail, VOL)                     // il est sorti de la ligne : le mur à 430 m
    jusqua(0.45, 0.29)
    expect(trait()[1].distanceTo(attendu(0.45, VOL)), 'en vol, au-delà du point prévu').toBeLessThan(1e-4)
    jusqua(VOL, 0.45)
    expect(trait()[1].distanceTo(TRAJ.pointA(VOL)), 'au nouvel impact').toBeLessThan(1e-4)
    jusqua(VOL + 0.26, VOL)
    expect(lignes()).toEqual([])
  })

  it('la balle s\'arrête plus tôt que prévu : la tête est au point d\'impact, le sillage s\'efface de là', () => {
    const trail = E.spawnTrail(CANON, TRAJ, VOL)
    jusqua(0.2)
    E.retargetTrail(trail, 0.2)
    E.updateEffects(1 / 60)
    expect(trait()[1].distanceTo(TRAJ.pointA(0.2))).toBeLessThan(1e-4)
    jusqua(0.2 + 0.26, 0.2 + 1 / 60)
    expect(lignes()).toEqual([])
  })

  it('un sillage déjà effacé ou retiré (relance de la mission) : sans effet ni erreur', () => {
    const trail = E.spawnTrail(CANON, TRAJ, VOL)
    E.clearEffects()
    expect(() => E.retargetTrail(trail, VOL)).not.toThrow()
    expect(() => E.retargetTrail(null, VOL)).not.toThrow()
    expect(lignes()).toEqual([])
  })
})

describe('trait d\'impact supprimé (lot 2)', () => {
  it('effects.js n\'exporte plus spawnTracer', () => {
    expect(E.spawnTracer).toBeUndefined()
  })
})
