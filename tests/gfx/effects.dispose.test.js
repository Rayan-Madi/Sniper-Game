import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Effets de tir et trous d'impact (spec du lot 1 §4.2) : créés en rafale, à chaque tir. Une géométrie de particule
// partagée, un seul matériau par éclaboussure (son opacité baisse) libéré en fin de vie, le traceur libère ce qu'il
// possède ; les trous d'impact partagent une géométrie et un matériau, jamais libérés.
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

import { MAX_HOLES } from '../../src/effects.js'
import { createFakeRenderer, drawnGeometries, trackDisposals } from './fakeRenderer.js'

// Modules neufs à chaque test : effects.js garde sa géométrie de particule partagée et dispose.js l'ensemble des
// ressources déjà libérées, qui ne doivent pas passer d'un test à l'autre. Sinon un test ne voit pas une ressource
// partagée libérée à tort : un test précédent l'a déjà libérée (et retenue comme telle), elle ne l'est plus une
// seconde fois. Avec les modules gardés, « tir manqué » restait vert sous une libération du partagé.
let scene, spawnTracer, spawnImpact, spawnDust, spawnMuzzle, updateEffects, clearEffects, spawnBulletHole,
  clearBulletHoles, isShared
beforeEach(async () => {
  vi.resetModules()
  ;({ scene } = await import('../../src/scene.js'))
  ;({ spawnTracer, spawnImpact, spawnDust, spawnMuzzle, updateEffects, clearEffects, spawnBulletHole, clearBulletHoles }
    = await import('../../src/effects.js'))
  ;({ isShared } = await import('../../src/gfx/dispose.js'))
  scene.clear()
})

const FROM = new THREE.Vector3(0, 9.5, 28), AT = new THREE.Vector3(2, 1.2, -4)
// Tir touché comme resolveBullet : traceur et éclaboussure de 16 particules. Tir manqué : traceur et poussière.
const hit = () => { spawnTracer(FROM, AT); spawnImpact(AT, 0xaa2222, 16) }
const miss = () => { spawnTracer(FROM, AT); spawnDust(AT) }
const expire = () => updateEffects(1)   // la plus longue vie d'un effet est de 0,7 s
const splashes = () => scene.children.filter(o => o.isGroup)

describe('effets de tir, niveau 1 : en fin de vie, tout ce qui est possédé est libéré, rien de partagé', () => {
  for (const [name, shot] of [['tir touché', hit], ['tir manqué', miss], ['flash de bouche', () => spawnMuzzle(FROM, new THREE.Vector3(0, 0, -1))]]) {
    it(name, () => {
      shot()
      const t = trackDisposals(scene)
      expect(t.owned()).toBeGreaterThan(0)
      expire()
      expect(scene.children).toHaveLength(0)
      expect(t.leaks()).toEqual([])
      expect(t.sharedFreed()).toEqual([])
      expect(t.freedTwice()).toEqual([])
    })
  }

  it('clearEffects (relance, retour au menu) libère aussi les effets encore en vie', () => {
    hit(); miss()
    const t = trackDisposals(scene)
    clearEffects()
    expect(scene.children).toHaveLength(0)
    expect(t.leaks()).toEqual([])
    expect(t.sharedFreed()).toEqual([])
  })
})

describe('éclaboussure : une géométrie partagée, un matériau par impact', () => {
  it('toutes les particules partagent une géométrie marquée ; chaque impact a un seul matériau, à lui', () => {
    spawnImpact(AT, 0xaa2222, 16); spawnImpact(AT, 0x998877, 8)
    const [a, b] = splashes()
    const geos = new Set([...a.children, ...b.children].map(p => p.geometry))
    expect(geos.size).toBe(1)
    expect(isShared([...geos][0])).toBe(true)
    expect(new Set(a.children.map(p => p.material)).size).toBe(1)
    expect(new Set(b.children.map(p => p.material)).size).toBe(1)
    expect(a.children[0].material).not.toBe(b.children[0].material)
    expect(isShared(a.children[0].material)).toBe(false)
    expect(a.children[0].material.color.getHex()).toBe(0xaa2222)
    expect(b.children[0].material.color.getHex()).toBe(0x998877)
  })

  it('les particules gardent leur taille (rayon de 0,05 à 0,11 m) et leur nombre', () => {
    spawnImpact(AT, 0xaa2222, 16)
    const [g] = splashes()
    expect(g.children).toHaveLength(16)
    for (const p of g.children) {
      if (!p.geometry.boundingSphere) p.geometry.computeBoundingSphere()
      const r = p.geometry.boundingSphere.radius * p.scale.x
      expect(r).toBeGreaterThanOrEqual(0.05 - 1e-9)
      expect(r).toBeLessThanOrEqual(0.11 + 1e-9)
    }
  })

  it('l\'opacité baisse avec la vie de l\'impact', () => {
    spawnImpact(AT, 0xaa2222, 16)
    const [g] = splashes()
    updateEffects(0.35)
    expect(g.children[0].material.opacity).toBeCloseTo(0.5, 6)
  })
})

describe('effets de tir, niveau 2 : faux renderer', () => {
  for (const [name, shot] of [['100 tirs touchés', hit], ['100 tirs manqués', miss]]) {
    it(`${name} puis fin de vie : Δ = 0`, () => {
      const r = createFakeRenderer()
      shot(); r.render(scene); expire(); r.render(scene)
      const ref = r.info()   // après un premier tir : seule la géométrie de particule partagée reste comptée
      expect(ref.geometries).toBeLessThanOrEqual(1)
      for (let i = 0; i < 100; i++) { shot(); r.render(scene) }
      expect(r.info().geometries).toBe(drawnGeometries(scene))
      expire(); r.render(scene)
      expect(r.info()).toEqual(ref)
    })
  }
})

describe('trous d\'impact', () => {
  const at = i => new THREE.Vector3(i * 0.3, 0.345, 2)

  it(`les ${MAX_HOLES} derniers restent, tous sur une géométrie et un matériau partagés`, () => {
    for (let i = 0; i < 30; i++) spawnBulletHole(at(i))
    const holes = scene.children
    expect(holes).toHaveLength(MAX_HOLES)
    expect(holes[0].position.x).toBeCloseTo(6 * 0.3, 9)   // les 6 plus anciens sont partis
    expect(new Set(holes.map(h => h.geometry)).size).toBe(1)
    expect(new Set(holes.map(h => h.material)).size).toBe(1)
    expect(isShared(holes[0].geometry) && isShared(holes[0].material)).toBe(true)
  })

  it('le trou le plus ancien est retiré sans rien libérer, clearBulletHoles non plus', () => {
    const first = spawnBulletHole(at(0))
    let n = 0
    first.geometry.addEventListener('dispose', () => n++)
    first.material.addEventListener('dispose', () => n++)
    for (let i = 1; i <= MAX_HOLES; i++) spawnBulletHole(at(i))
    expect(scene.children).not.toContain(first)
    clearBulletHoles()
    expect(scene.children).toHaveLength(0)
    expect(n).toBe(0)
  })

  it('faux renderer : 100 tirs manqués, toujours une seule géométrie de trou comptée', () => {
    const r = createFakeRenderer()
    for (let i = 0; i < 100; i++) { spawnBulletHole(at(i)); r.render(scene) }
    expect(r.info().geometries).toBe(1)
    clearBulletHoles()
    for (let i = 0; i < 100; i++) { spawnBulletHole(at(i)); r.render(scene) }
    expect(r.info().geometries).toBe(1)
  })
})
