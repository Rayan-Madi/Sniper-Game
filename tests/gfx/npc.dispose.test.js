import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'

// PNJ et modèles partagés (spec du lot 1 §4.2, tâche L3). Les modèles GLB sont chargés une fois et marqués partagés :
// leurs géométries et textures servent à toutes les instances et ne sont jamais libérées. Un PNJ possède son clone
// (SkeletonUtils : squelettes à lui, donc ses textures d'os), ses matériaux teintés (clonés, sauf la teinte blanche
// 0xffffff qui garde le matériau du modèle), ses marqueurs (cône et anneau) et le téléphone du commanditaire. Un PNJ
// procédural (modèle absent) possède tout. NPC.dispose libère ce qu'il possède et rien du modèle ; le corps d'un PNJ
// abattu est retiré au bout de 8 s de jeu, par update, et libéré.
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})
const gltf = vi.hoisted(() => ({ loaded: [] }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeCharacter } = await import('./fakeGltf.js')
  return {
    GLTFLoader: class {
      async loadAsync(url) { const g = fakeCharacter(); gltf.loaded.push({ url, ...g }); return g }
    },
  }
})

import { createFakeRenderer, trackDisposals } from './fakeRenderer.js'
import { resourcesOf, countDisposals } from './fakeGltf.js'

// Modules neufs à chaque test : le cache des modèles (characters.js) et l'ensemble des ressources déjà libérées
// (dispose.js) ne passent pas d'un test à l'autre (sinon une ressource partagée libérée à tort par un test précédent
// ne le serait plus dans le suivant, et son témoin resterait vert).
let scene, NPC, characters, isShared, MAP_BUILDERS, withSeed
async function load({ models = true } = {}) {
  vi.resetModules()
  gltf.loaded = []
  ;({ scene } = await import('../../src/scene.js'))
  characters = await import('../../src/characters.js')
  ;({ NPC } = await import('../../src/npc.js'))
  ;({ isShared } = await import('../../src/gfx/dispose.js'))
  ;({ MAP_BUILDERS } = await import('../../src/maps.js'))
  ;({ withSeed } = await import('../../src/gfx/memtest.js'))
  if (models) await characters.preloadCharacters()
  scene.clear()
}
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await load()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const BOUNDS = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
const civilian = (extra = {}) => new NPC({ isCivilian: true, color: 0x7a6aaa, x: 1, z: 2, bounds: BOUNDS, ...extra })
const KINDS = {
  'cible marquée': () => new NPC({ isTarget: true, color: 0xcc4422, x: 0, z: 0, bounds: BOUNDS }),
  'garde': () => new NPC({ isGuard: true, color: 0x334433, x: 3, z: -2, bounds: BOUNDS }),
  'civil teinté': () => civilian(),
  'commanditaire au téléphone': () => new NPC({ isTarget: true, color: 0xcc4422, x: 4, z: 4, bounds: BOUNDS,
    hideMarker: true, lockState: 'phone', onPhone: true, modelType: 'civilian' }),
}

// Ressources de tous les modèles chargés : aucune ne doit émettre 'dispose'.
const glbResources = () => gltf.loaded.flatMap(g => resourcesOf(g.scene))
const skinnedIn = root => { const out = []; root.traverse(o => { if (o.isSkinnedMesh) out.push(o) }); return out }

describe('modèles GLB : chargés une fois, partagés', () => {
  it('géométries, matériaux et textures des modèles sont marqués partagés au chargement', () => {
    expect(gltf.loaded).toHaveLength(7)
    const res = glbResources()
    expect(res.length).toBeGreaterThan(0)
    expect(res.filter(r => !isShared(r)).map(r => r.isTexture ? 'Texture' : r.type)).toEqual([])
  })

  it('teinte blanche 0xffffff : l\'instance garde les matériaux du modèle, sans copie', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)   // première variante, première teinte (0xffffff)
    const ch = characters.spawnCharacter('civilian')
    const source = gltf.loaded.find(g => g.url.endsWith(ch.cfg.url)).scene
    const mats = skinnedIn(ch.model).map(m => m.material)
    const sourceMats = skinnedIn(source).map(m => m.material)
    expect(mats).toHaveLength(2)
    expect(mats.every((m, i) => m === sourceMats[i])).toBe(true)
  })

  it('autre teinte : matériaux copiés, à l\'instance (non partagés), textures du modèle gardées', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)   // teinte du milieu de la liste, jamais la blanche
    const ch = characters.spawnCharacter('civilian')
    const tint = ch.cfg.tints[Math.floor(0.5 * ch.cfg.tints.length)]
    expect(tint).not.toBe(0xffffff)
    const source = gltf.loaded.find(g => g.url.endsWith(ch.cfg.url)).scene
    const [body] = skinnedIn(ch.model), [sourceBody] = skinnedIn(source)
    expect(body.material).not.toBe(sourceBody.material)
    expect(isShared(body.material)).toBe(false)
    expect(body.material.color.getHex()).toBe(tint)
    expect(body.material.map).toBe(sourceBody.material.map)
    expect(isShared(body.material.map)).toBe(true)
  })

  it('corps marqué transparent mais opaque (gangster_man_02) : rendu opaque, avec ou sans copie du matériau', () => {
    for (const r of [0, 0.5]) {
      vi.spyOn(Math, 'random').mockReturnValue(r)
      const [body] = skinnedIn(characters.spawnCharacter('civilian').model)
      expect([body.material.transparent, body.material.depthWrite]).toEqual([false, true])
    }
  })
})

describe('NPC.dispose, niveau 1 : tout ce que le PNJ possède est libéré, rien du modèle partagé', () => {
  for (const [name, make] of Object.entries(KINDS)) {
    it(name, () => {
      const npc = make()
      expect(npc.character).toBeTruthy()
      createFakeRenderer().render(scene)   // premier rendu : chaque squelette crée sa texture d'os
      const t = trackDisposals(npc.mesh)
      const glb = countDisposals(glbResources())
      const skins = skinnedIn(npc.mesh).length
      expect(skins).toBe(2)
      npc.dispose()
      expect(scene.children).not.toContain(npc.mesh)
      expect(t.leaks()).toEqual([])
      expect(t.sharedFreed()).toEqual([])
      expect(t.freedTwice()).toEqual([])
      expect(glb.labels).toEqual([])
      expect(t.freed()).toBeGreaterThanOrEqual(skins)   // au moins les textures d'os
      // L'animation est arrêtée et le mixer ne garde plus rien du clone
      expect(npc.mixer.stats.actions.total).toBe(0)
      expect(npc.mixer.stats.bindings.total).toBe(0)
      npc.dispose()   // deux appels : rien de plus
      expect(t.freedTwice()).toEqual([])
    })
  }

  it('marqueurs de la cible et téléphone du commanditaire : possédés, donc libérés', () => {
    const target = KINDS['cible marquée']()
    const boss = KINDS['commanditaire au téléphone']()
    const marker = target.mesh.userData.marker, ring = target.mesh.userData.ring
    let phone = null
    boss.mesh.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) phone = o })
    expect([marker, ring, phone].every(Boolean)).toBe(true)
    const freed = []
    for (const o of [marker, ring, phone]) for (const r of [o.geometry, o.material]) r.addEventListener('dispose', () => freed.push(r))
    target.dispose(); boss.dispose()
    expect(freed).toHaveLength(6)
  })

  it('PNJ procédural (modèles absents) : tout est à lui, tout est libéré', async () => {
    await load({ models: false })
    const npc = new NPC({ isTarget: true, isGuard: false, color: 0xcc4422, x: 0, z: 0, bounds: BOUNDS, female: true, hat: 0x222222 })
    expect(npc.character).toBe(null)
    const t = trackDisposals(npc.mesh)
    expect(t.shared()).toBe(0)
    npc.dispose()
    expect(scene.children).not.toContain(npc.mesh)
    expect(t.leaks()).toEqual([])
    expect(t.freedTwice()).toEqual([])
  })
})

describe('corps d\'un PNJ abattu', () => {
  const run = (npc, seconds, dt = 1 / 60) => { for (let s = 0; s < seconds; s += dt) npc.update(dt) }

  for (const models of [true, false]) {
    it(`${models ? 'modèle GLB' : 'procédural'} : retiré et libéré au bout de 8 s de jeu, sans minuteur`, async () => {
      if (!models) await load({ models: false })
      vi.useFakeTimers()
      const npc = civilian()
      createFakeRenderer().render(scene)
      const t = trackDisposals(npc.mesh)
      npc.die()
      expect(vi.getTimerCount()).toBe(0)   // plus de setTimeout : la pause et le ralenti comptent comme le jeu
      run(npc, 7.9)
      expect(scene.children).toContain(npc.mesh)
      expect(t.freed()).toBe(0)
      run(npc, 0.2)
      expect(scene.children).not.toContain(npc.mesh)
      expect(t.leaks()).toEqual([])
      run(npc, 1)   // update suivants (le PNJ reste dans la liste de la mission) : rien de plus
      expect(t.freedTwice()).toEqual([])
    })
  }
})

describe('NPC.dispose, niveau 2 : faux renderer', () => {
  // Montage de M6 comme mountLevel : la fête, le commanditaire au téléphone (pool des civils), 2 gardes, 24 civils
  // qui dansent, soit 27 PNJ ; hasard à graine (même foule, mêmes modèles à chaque montage). Démontage comme
  // unmountLevel : chaque PNJ libéré ; la carte, elle, est libérée par la carte suivante (maps.js, tâche L2).
  function mountM6() {
    return withSeed(1006, () => {
      const info = MAP_BUILDERS[5]()
      const b = info.spawnBounds
      const at = () => ({ x: b.minX + Math.random() * (b.maxX - b.minX), z: b.minZ + Math.random() * (b.maxZ - b.minZ) })
      const npcs = [new NPC({ isTarget: true, color: 0xcc4422, x: 0, z: 0, bounds: b, hideMarker: true, lockState: 'phone',
        onPhone: true, modelType: 'civilian' })]
      for (let i = 0; i < 2; i++) npcs.push(new NPC({ isGuard: true, color: 0x334433, ...at(), bounds: b }))
      for (let i = 0; i < 24; i++) npcs.push(new NPC({ isCivilian: true, color: 0x7a6aaa, ...at(), bounds: b, partyMode: true }))
      return npcs
    })
  }

  it('10 montages de M6 (27 PNJ) : Δ = 0 entre le 1er et le 10e', () => {
    const r = createFakeRenderer()
    const counts = []
    for (let k = 0; k < 10; k++) {
      const npcs = mountM6()
      expect(npcs).toHaveLength(27)
      r.render(scene)
      counts.push(r.info())
      for (const npc of npcs) npc.dispose()
      r.render(scene)
    }
    expect(counts[0].textures).toBeGreaterThanOrEqual(27 * 2)   // une texture d'os par maillage animé
    for (const c of counts) expect(c).toEqual(counts[0])
  })
})
