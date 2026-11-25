import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { trajectoire, angleDeZero } from '../../src/shot/ballistics.js'
import { BALLE } from '../../src/shot/tuning.js'

// Trajectoire de la balle (spec du lot 3, §2 c, approche B ; plan du lot 3a, tâche A4) : p(t) = o + v0·u·t + ½·g·t²,
// sans traînée ; u est la visée relevée de angleDeZero(zero) dans son plan vertical, pour que la balle recroise la
// ligne de visée à la distance de réglage de la lunette (décision 1). Ce que la balle touche, le temps de vol et la
// chute contre un vrai décor sont dans balle.test.js, vus rouges sur le tir d'avant la tâche.
//
// Témoins (module neuf : par mutation, vus rouges à la tâche A4) : l'angle de réglage sans le facteur ½ (la balle
// recroise la visée au double de la distance : 8 rouges), la visée relevée le long de la verticale du monde au lieu du
// haut de la visée (1 rouge), vitesseA sans g·t (1 rouge), un seul segment quelle que soit la durée (2 rouges).

const v = (x, y, z) => new THREE.Vector3(x, y, z)
const OEIL = v(3, 20, -7)

// Écart à la ligne de visée là où la balle franchit le plan perpendiculaire à la visée, à `d` m de l'œil.
function ecartA(traj, d) {
  const dir = traj.dir
  // la balle avance d'à peu près v0 · cos θ le long de la visée par seconde : quelques pas de Newton
  let t = d / traj.v0
  for (let i = 0; i < 8; i++) {
    const le = traj.pointA(t).sub(traj.origine).dot(dir)
    t -= (le - d) / traj.vitesseA(t).dot(dir)
  }
  const rel = traj.pointA(t).sub(traj.origine)
  return rel.sub(dir.clone().multiplyScalar(rel.dot(dir))).length()
}

describe('réglages de la balle (src/shot/tuning.js, BALLE)', () => {
  it('800 m/s à la bouche, +37,5 m/s par niveau de Vélocité (950 au niveau 4), gravité 9,81 m/s²', () => {
    expect(BALLE.vitesse).toBe(800)
    expect(BALLE.vitesse + 4 * BALLE.vitesseParNiveau).toBe(950)
    expect(BALLE.gravite).toBe(9.81)
  })

  it('une balle perdue l\'est au bout de 0,6 s (480 m), au-delà des 448 m de M4 ; segments de 0,05 s au plus', () => {
    expect(BALLE.volMaxS).toBe(0.6)
    expect(BALLE.vitesse * BALLE.volMaxS).toBeGreaterThan(448)
    expect(BALLE.segmentMaxS).toBe(0.05)
  })
})

describe('angleDeZero : l\'angle dont relever le tir pour recroiser la ligne de visée à la distance de réglage', () => {
  it('sans réglage, aucun relèvement', () => {
    expect(angleDeZero(null, 800, 9.81)).toBe(0)
    expect(angleDeZero(0, 800, 9.81)).toBe(0)
  })

  it.each([[31, 800], [155, 800], [430, 800], [430, 950], [138, 875]])('tir à l\'horizontale réglé à %i m (%i m/s) : la balle y recroise la visée à 1 mm près', (d, v0) => {
    const traj = trajectoire({ origine: OEIL, dir: v(0, 0, -1), v0, g: 9.81, zero: d })
    expect(ecartA(traj, d)).toBeLessThan(0.001)
    // et elle passe bien au-dessus avant (la balle monte puis redescend)
    expect(traj.pointA(d / 2 / v0).y).toBeGreaterThan(OEIL.y)
  })

  it('un réglage hors de portée est une erreur, pas un angle inventé', () => {
    expect(() => angleDeZero(70000, 800, 9.81)).toThrow(RangeError)
  })
})

describe('trajectoire', () => {
  it('part de l\'œil à la vitesse de bouche, relevée de l\'angle de réglage dans le plan vertical de la visée', () => {
    const dir = v(1, -0.3, -2).normalize()
    const traj = trajectoire({ origine: OEIL, dir, v0: 800, g: 9.81, zero: 155 })
    expect(traj.pointA(0).distanceTo(OEIL)).toBeLessThan(1e-12)
    expect(traj.vitesseA(0).length()).toBeCloseTo(800, 9)
    const u = traj.vitesseA(0).normalize()
    expect(u.angleTo(dir)).toBeCloseTo(angleDeZero(155, 800, 9.81), 9)
    // relevée vers le haut, dans le plan vertical qui contient la visée : ni à gauche ni à droite
    expect(u.y).toBeGreaterThan(dir.y)
    expect(u.clone().cross(dir).dot(v(0, 1, 0))).toBeCloseTo(0, 12)
    expect(traj).toMatchObject({ v0: 800, g: 9.81, zero: 155 })
    expect(traj.dir.distanceTo(dir)).toBeLessThan(1e-12)
    expect(traj.origine.distanceTo(OEIL)).toBeLessThan(1e-12)
  })

  // Les postes du lot 3 plongent : M2 23,5° à 42 m, M3 14,9° à 155 m, M4 4,9° à 430 m, M6 27,1° à 38 m (spec §3).
  // L'angle de réglage est celui d'un tir à l'horizontale (comme une lunette réglée au stand) ; en plongée, la
  // pesanteur ne tire plus qu'en partie en travers de la visée et la balle passe un peu haut, de quelques mm.
  it.each([[42, 23.5], [155, 14.9], [430, 4.9], [38, 27.1], [138, 8]])('réglée à %i m, en plongée de %f° : à moins de 2 cm de la visée à cette distance', (d, deg) => {
    const a = THREE.MathUtils.degToRad(deg)
    const traj = trajectoire({ origine: OEIL, dir: v(Math.sin(0.7) * Math.cos(a), -Math.sin(a), -Math.cos(0.7) * Math.cos(a)), v0: 800, g: 9.81, zero: d })
    expect(ecartA(traj, d)).toBeLessThan(0.02)
  })

  it('sans réglage, elle tombe de ½·g·t² sous la ligne de visée : 1,41 m à 430 m', () => {
    const traj = trajectoire({ origine: OEIL, dir: v(0, 0, -1), v0: 800, g: 9.81, zero: null })
    const t = 430 / 800
    expect(traj.pointA(t).distanceTo(v(OEIL.x, OEIL.y - 0.5 * 9.81 * t * t, OEIL.z - 430))).toBeLessThan(1e-9)
    expect(OEIL.y - traj.pointA(t).y).toBeCloseTo(1.417, 3)
  })

  it('vitesseA(t) = v0·u + g·t : la dérivée de pointA(t)', () => {
    const traj = trajectoire({ origine: OEIL, dir: v(-0.2, -0.1, -1).normalize(), v0: 875, g: 9.81, zero: 430 })
    for (const t of [0, 0.1, 0.33, 0.6]) {
      const h = 1e-4
      const derivee = traj.pointA(t + h).sub(traj.pointA(t - h)).divideScalar(2 * h)
      expect(traj.vitesseA(t).distanceTo(derivee), `t = ${t}`).toBeLessThan(1e-6)
    }
    expect(traj.vitesseA(0.5).y - traj.vitesseA(0).y).toBeCloseTo(-9.81 * 0.5, 9)
  })

  it('pointA et vitesseA écrivent dans le vecteur donné, sans en créer', () => {
    const traj = trajectoire({ origine: OEIL, dir: v(0, 0, -1), v0: 800, g: 9.81, zero: 31 })
    const out = v(0, 0, 0)
    expect(traj.pointA(0.1, out)).toBe(out)
    expect(traj.vitesseA(0.1, out)).toBe(out)
  })

  it('segmentsEntre(t0, t1) : bout à bout de t0 à t1, aucun plus long que le pas, leurs bouts sur la trajectoire', () => {
    const traj = trajectoire({ origine: OEIL, dir: v(0.3, -0.2, -1).normalize(), v0: 800, g: 9.81, zero: 155 })
    for (const [t0, t1, pas] of [[0, 1 / 60, 0.05], [0.2, 0.3, 0.05], [0, 0.6, 0.15], [0.017, 0.1234, 0.02]]) {
      const segs = traj.segmentsEntre(t0, t1, pas)
      expect(segs.length).toBe(Math.ceil((t1 - t0) / pas - 1e-9))
      expect(segs[0].t0).toBe(t0)
      expect(segs[segs.length - 1].t1).toBe(t1)
      segs.forEach((s, i) => {
        if (i) expect(s.t0).toBe(segs[i - 1].t1)
        expect(s.t1 - s.t0).toBeLessThanOrEqual(pas + 1e-12)
        expect(s.a.distanceTo(traj.pointA(s.t0))).toBeLessThan(1e-9)
        expect(s.b.distanceTo(traj.pointA(s.t1))).toBeLessThan(1e-9)
      })
    }
  })

  it('segmentsEntre au pas par défaut (BALLE.segmentMaxS) ; rien entre deux instants égaux', () => {
    const traj = trajectoire({ origine: OEIL, dir: v(0, 0, -1), v0: 800, g: 9.81, zero: 31 })
    expect(traj.segmentsEntre(0, 0.12)).toHaveLength(Math.ceil(0.12 / BALLE.segmentMaxS))
    expect(traj.segmentsEntre(0.2, 0.2)).toEqual([])
  })

  it('garde ses propres vecteurs : déplacer après coup l\'œil ou la visée de l\'appelant ne la change pas', () => {
    const o = OEIL.clone(), dir = v(0, 0, -1)
    const traj = trajectoire({ origine: o, dir, v0: 800, g: 9.81, zero: 155 })
    const avant = traj.pointA(0.2)
    o.set(100, 100, 100); dir.set(1, 0, 0)
    expect(traj.pointA(0.2).distanceTo(avant)).toBe(0)
  })
})
