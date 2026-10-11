import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Effets de tir et trous d'impact (spec du lot 1 §4.2) : créés en rafale, à chaque tir. Une géométrie de particule
// partagée, un seul matériau par éclaboussure (son opacité baisse) libéré en fin de vie, le sillage de la balle (lot 2,
// tâche T3 : il remplace le traceur d'impact) libère ce qu'il possède, les gerbes des impacts sur le décor aussi (lot 2,
// tâche T5 : une par matière, un matériau par nuage) ; les trous d'impact, orientés sur la surface touchée, partagent
// une géométrie et un matériau, jamais libérés.
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
let scene, spawnTrail, spawnImpact, spawnSpray, spawnMuzzle, updateEffects, clearEffects, spawnBulletHole,
  clearBulletHoles, isShared
beforeEach(async () => {
  vi.resetModules()
  ;({ scene } = await import('../../src/scene.js'))
  ;({ spawnTrail, spawnImpact, spawnSpray, spawnMuzzle, updateEffects, clearEffects, spawnBulletHole, clearBulletHoles }
    = await import('../../src/effects.js'))
  ;({ isShared } = await import('../../src/gfx/dispose.js'))
  scene.clear()
})

const FROM = new THREE.Vector3(0, 9.5, 28), AT = new THREE.Vector3(2, 1.2, -4)
// Tir touché : sillage pendant les 0,45 s du vol, puis éclaboussure de 16 particules (resolveBullet). Tir dans le
// décor : sillage et gerbe de la matière touchée (la marque, partagée, est à part). Ils partent ensemble ici : seule
// compte la libération.
const NORMALE = new THREE.Vector3(0, 0, 1)
const hit = () => { spawnTrail(FROM, AT, 0.45); spawnImpact(AT, 0xaa2222, 16) }
const decor = surface => () => { spawnTrail(FROM, AT, 0.45); spawnSpray(AT, NORMALE, surface) }
const miss = decor('sol')
const DECOR = ['metal', 'pierre', 'bois', 'sol'].map(s => [`tir dans le décor (${s})`, decor(s)])
const expire = () => { for (let i = 0; i < 3; i++) updateEffects(1) }   // vol et effacement du sillage compris
const splashes = () => scene.children.filter(o => o.isGroup)

describe('effets de tir, niveau 1 : en fin de vie, tout ce qui est possédé est libéré, rien de partagé', () => {
  for (const [name, shot] of [['tir touché', hit], ...DECOR, ['flash de bouche', () => spawnMuzzle(FROM, new THREE.Vector3(0, 0, -1))]]) {
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
  for (const [name, shot] of [['100 tirs touchés', hit], ...DECOR.map(([n, f]) => ['100 ' + n.replace('tir', 'tirs'), f])]) {
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

  it('faux renderer : 100 tirs dans le décor (sol, murs, flancs), toujours une seule géométrie de trou comptée', () => {
    const r = createFakeRenderer()
    const normales = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)]
    for (let i = 0; i < 100; i++) { spawnBulletHole(at(i), normales[i % 3]); r.render(scene) }
    expect(r.info().geometries).toBe(1)
    clearBulletHoles()
    for (let i = 0; i < 100; i++) { spawnBulletHole(at(i)); r.render(scene) }
    expect(r.info().geometries).toBe(1)
  })

  // Marque sur une jeep du convoi (lot 2, tâche T5) : rattachée à elle. La jeep libérée (releaseConvoy, disposeObject)
  // ne libère pas la géométrie ni le matériau partagés des trous ; clearBulletHoles retire ensuite la marque.
  it("une marque rattachée à une jeep : la jeep libérée, rien du trou ne l'est", async () => {
    const { disposeObject } = await import('../../src/gfx/dispose.js')
    const jeep = new THREE.Group()
    jeep.add(new THREE.Mesh(new THREE.BoxGeometry(5, 0.7, 2.4), new THREE.MeshLambertMaterial()))
    scene.add(jeep)
    const hole = spawnBulletHole(at(0), new THREE.Vector3(0, 0, 1), jeep)
    expect(hole.parent).toBe(jeep)
    const t = trackDisposals(jeep)
    disposeObject(jeep)
    expect(t.sharedFreed()).toEqual([])
    expect(t.leaks()).toEqual([])
    clearBulletHoles()
    expect(hole.parent).toBe(null)
  })
})
