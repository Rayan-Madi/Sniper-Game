import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Impacts sur le décor (spec du lot 2, §3.4 ; plan, tâche T5) : une marque orientée par la normale de la surface,
// posée dessus (géométrie et matériau partagés, plafond de MARQUES.max = 24 comme les trous au sol d'avant), et une
// gerbe selon la matière : étincelles sur le métal, éclats et poussière sur la pierre, échardes sur le bois,
// poussière sur le sol (celle des tirs manqués d'avant).
//
// Témoin : avant le lot 2 (commit ac004b6), un tir manqué faisait toujours la même poussière, lancée vers le haut
// (spawnDust), et un trou couché à plat sur le sol (spawnBulletHole, sans normale), même contre un mur ; sans
// spawnSpray, les tests tournent sur cette poussière et échouent sur elle (vus rouges).
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

// La gerbe : spawnSpray, ou avant le lot 2 la poussière des tirs manqués, quelle que soit la matière.
const gerbe = (point, normal, surface) => (E.spawnSpray ? E.spawnSpray(point, normal, surface) : E.spawnDust(point))
const nuages = () => scene.children.filter(o => o.isGroup)
const particules = () => nuages().flatMap(g => g.children)
const v = (x, y, z) => new THREE.Vector3(x, y, z)
const P = v(-15.2, 2.2, -0.6)
// Normales des cas du jeu : flanc d'un conteneur (vers +X), mur face au tireur (+Z), sol (+Y), dessous d'une poutre
// (-Y), et une face de rocher en biais.
const NORMALES = { flanc: v(1, 0, 0), mur: v(0, 0, 1), sol: v(0, 1, 0), dessous: v(0, -1, 0), biais: v(0.5, 0.6, 0.62).normalize() }
const luminance = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

describe('gerbe : elle jaillit de la surface touchée, du côté du tireur', () => {
  for (const surface of ['metal', 'pierre', 'bois', 'sol']) {
    for (const [nom, n] of Object.entries(NORMALES)) {
      it(`${surface}, normale ${nom} : toutes les particules s'éloignent de la surface (40 gerbes)`, async () => {
        const { withSeed } = await import('../../src/gfx/memtest.js')
        withSeed(7, () => { for (let i = 0; i < 40; i++) gerbe(P, n, surface) })   // hasard à graine, tirages variés
        E.updateEffects(0.02)
        const ps = particules()
        expect(ps.length).toBeGreaterThan(4)
        for (const p of ps) expect(p.position.clone().sub(P).dot(n), `${surface} ${nom}`).toBeGreaterThan(0)
      })
    }
  }
})

describe('gerbe : selon la matière', () => {
  it('métal : des étincelles vives et lumineuses (hors tone mapping), éteintes en moins de 0,4 s', () => {
    gerbe(P, NORMALES.flanc, 'metal')
    const [g] = nuages()
    const m = g.children[0].material
    expect(m.toneMapped).toBe(false)
    expect(luminance(m.color)).toBeGreaterThan(0.6)
    expect(m.color.r).toBeGreaterThan(m.color.b)   // chaudes
    for (const p of g.children) {
      if (!p.geometry.boundingSphere) p.geometry.computeBoundingSphere()
      expect(p.geometry.boundingSphere.radius * p.scale.x).toBeLessThan(0.04)   // plus fines que la poussière
    }
    E.updateEffects(0.2)
    expect(nuages()).toHaveLength(1)
    E.updateEffects(0.2)
    expect(nuages()).toHaveLength(0)
  })

  it('pierre : des éclats et un nuage de poussière, gris, plus lent', () => {
    gerbe(P, NORMALES.mur, 'pierre')
    const g = nuages()
    expect(g).toHaveLength(2)
    for (const n of g) {
      const c = n.children[0].material.color
      expect(Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b), 'gris').toBeLessThan(0.12)
    }
    // Le nuage de poussière (plus grosses particules) s'éloigne moins vite que les éclats
    const taille = n => n.children[0].scale.x
    const [eclats, poussiere] = [...g].sort((a, b) => taille(a) - taille(b))
    const ecart = n => Math.max(...n.children.map(p => p.position.distanceTo(P)))
    E.updateEffects(0.1)
    expect(ecart(poussiere)).toBeLessThan(ecart(eclats))
  })

  it('bois : des échardes brunes', () => {
    gerbe(P, NORMALES.mur, 'bois')
    const [g] = nuages()
    const c = g.children[0].material.color
    expect(c.r).toBeGreaterThan(c.g)
    expect(c.g).toBeGreaterThan(c.b)
    expect(c.r - c.b).toBeGreaterThan(0.15)
  })

  it('sol : la poussière des tirs manqués d\'avant', () => {
    gerbe(P, NORMALES.sol, 'sol')
    const [g] = nuages()
    expect(g.children[0].material.color.getHex()).toBe(0x998877)
    expect(g.children).toHaveLength(8)
  })

  it('les quatre matières donnent quatre gerbes différentes', () => {
    const signature = surface => {
      scene.clear()
      gerbe(P, NORMALES.mur, surface)
      return nuages().map(g => g.children[0].material.color.getHexString() + '×' + g.children.length).join('+')
    }
    expect(new Set(['metal', 'pierre', 'bois', 'sol'].map(signature)).size).toBe(4)
  })
})

describe('marque d\'impact : orientée par la normale, posée sur la surface', () => {
  const normaleDuDisque = m => new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion)

  for (const [nom, n] of Object.entries(NORMALES)) {
    it(`normale ${nom} : le disque est à plat sur la surface, décollé de 1 à 5 cm vers le tireur`, () => {
      const m = E.spawnBulletHole(P, n)
      m.updateMatrixWorld()
      expect(normaleDuDisque(m).dot(n)).toBeCloseTo(1, 6)
      const d = m.position.clone().sub(P)
      expect(d.dot(n)).toBeGreaterThanOrEqual(0.01)
      expect(d.dot(n)).toBeLessThanOrEqual(0.05)
      expect(d.clone().addScaledVector(n, -d.dot(n)).length(), 'sur la normale du point').toBeLessThan(1e-9)
    })
  }

  it('sans normale : à plat sur le sol, 3,5 cm au-dessus (le trou des tirs manqués d\'avant)', () => {
    const m = E.spawnBulletHole(v(3, 0.345, -2))
    expect(normaleDuDisque(m).y).toBeCloseTo(1, 6)
    expect(m.position.y).toBeCloseTo(0.345 + 0.035, 6)
  })

  it('MAX_HOLES vient de MARQUES.max (src/shot/tuning.js)', async () => {
    const { MARQUES } = await import('../../src/shot/tuning.js')
    expect(E.MAX_HOLES).toBe(MARQUES.max)
    expect(MARQUES.max).toBe(24)
  })
})

describe('gerbes : ressources (spec du lot 1 §4.2)', () => {
  it('toutes les particules partagent la géométrie de particule partagée ; un matériau à chaque nuage, à lui', async () => {
    const { isShared } = await import('../../src/gfx/dispose.js')
    for (const s of ['metal', 'pierre', 'bois', 'sol']) gerbe(P, NORMALES.mur, s)
    const g = nuages()
    expect(g).toHaveLength(5)
    const geos = new Set(particules().map(p => p.geometry))
    expect(geos.size).toBe(1)
    expect(isShared([...geos][0])).toBe(true)
    const mats = g.map(n => n.children[0].material)
    expect(new Set(mats).size).toBe(5)
    for (const n of g) expect(new Set(n.children.map(p => p.material)).size).toBe(1)
    for (const m of mats) expect(isShared(m)).toBe(false)
  })
})

// Une jeep du convoi touchée (M5) : la marque est rattachée à la jeep et roule avec elle, au lieu de rester en l'air
// sur la route. Témoin : sans support, la marque restait à sa place (vu rouge).
describe('marque sur un objet qui bouge', () => {
  it('rattachée au support : même place et même orientation au moment du tir, puis elle suit la jeep', () => {
    const jeep = new THREE.Group()
    jeep.position.set(-20, 0.2, -4); jeep.rotation.y = 0.3
    scene.add(jeep)
    jeep.updateMatrixWorld(true)
    const n = NORMALES.mur
    const m = E.spawnBulletHole(P, n, jeep)
    const monde = () => { m.updateMatrixWorld(true); return { p: m.getWorldPosition(new THREE.Vector3()), q: m.getWorldQuaternion(new THREE.Quaternion()) } }
    const t0 = monde()
    expect(t0.p.clone().sub(P).dot(n)).toBeCloseTo(0.035, 6)
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(t0.q).dot(n)).toBeCloseTo(1, 6)
    jeep.position.x += 5
    jeep.updateMatrixWorld(true)
    expect(monde().p.x - t0.p.x).toBeCloseTo(5, 6)
    E.clearBulletHoles()
    expect(m.parent).toBe(null)
  })
})
