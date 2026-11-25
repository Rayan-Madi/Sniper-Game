import { describe, it, expect, vi } from 'vitest'

// Décor des cartes (spec du lot 1 §4.2, §5) : changer de carte libère toute la carte précédente, pluie du port
// comprise. Les cartes (src/maps/) n'ont besoin que de la scène du jeu : une vraie THREE.Scene ici, sans rendu ni
// lumières. Depuis la tâche A1 du lot 3a, le menu a son décor à lui (src/maps/menu.js) : il est libéré comme une carte.
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  // Caméra et soleil : le décor du menu y pose son profil de caméra (src/gfx/cameraProfile.js)
  return {
    scene: new THREE.Scene(), setLighting: () => {},
    camera: new THREE.PerspectiveCamera(), sun: new THREE.DirectionalLight(),
  }
})

import { scene } from '../../src/scene.js'
import { MAP_BUILDERS, buildMenuDecor, clearMap, makeJeep, isMapObject } from '../../src/maps/index.js'
import { withSeed, seedOf } from '../../src/gfx/memtest.js'
import { createFakeRenderer, drawnGeometries, trackDisposals } from './fakeRenderer.js'

const NAMES = ['rue (M1)', 'place (M2)', 'port (M3)', 'base (M4)', 'convoi (M5)', 'fête (M6)']
// Chaque carte tire fenêtres, arbres, rochers au hasard : une graine par carte, comme la route ?memtest=1, qui a aussi
// sa graine pour le menu.
const build = i => withSeed(1000 + i, MAP_BUILDERS[i])
const buildMenu = () => withSeed(seedOf({ type: 'menu' }), buildMenuDecor)
const DECORS = [
  ...NAMES.map((name, i) => [name, () => build(i)]),
  ['menu (la rue figée de src/maps/menu.js)', buildMenu],
]

describe('cartes, niveau 1 : clearMap libère tout ce que la carte a créé', () => {
  DECORS.forEach(([name, construire]) => {
    it(name, () => {
      clearMap()
      construire()
      const t = trackDisposals(scene)
      expect(t.owned()).toBeGreaterThan(40)
      clearMap()
      expect(scene.children).toHaveLength(0)
      expect(t.leaks()).toEqual([])
      expect(t.sharedFreed()).toEqual([])
      expect(t.freedTwice()).toEqual([])
    })
  })

  it('construire une carte libère la précédente (pluie du port comprise)', () => {
    clearMap()
    build(2)
    const rain = scene.children.find(o => o.isPoints)
    expect(rain).toBeTruthy()
    let freed = 0
    rain.geometry.addEventListener('dispose', () => freed++)
    const t = trackDisposals(scene)
    build(0)
    expect(freed).toBe(1)
    expect(t.leaks()).toEqual([])
  })

  it('isMapObject : vrai pour le décor de la carte affichée seulement', () => {
    clearMap()
    build(0)
    const decor = scene.children[0]
    expect(isMapObject(decor)).toBe(true)
    expect(isMapObject(makeJeep())).toBe(false)   // la jeep du convoi n'est pas du décor
    clearMap()
    expect(isMapObject(decor)).toBe(false)
  })
})

describe('cartes, niveau 2 : faux renderer, menu → M1 à M6 → menu', () => {
  it('après chaque changement, le renderer ne compte que la carte affichée, et le menu revient à sa référence', () => {
    clearMap()
    const r = createFakeRenderer()
    buildMenu(); r.render(scene)
    const ref = r.info()
    expect(ref.geometries).toBe(drawnGeometries(scene))
    NAMES.forEach((name, i) => {
      build(i); r.render(scene)
      expect(r.info().geometries, name).toBe(drawnGeometries(scene))
    })
    buildMenu(); r.render(scene)
    expect(r.info()).toEqual(ref)
    clearMap(); r.render(scene)
    expect(r.info()).toEqual({ geometries: 0, textures: 0 })
  })
})
