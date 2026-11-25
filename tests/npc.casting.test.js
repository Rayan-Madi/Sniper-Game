import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// NPC et son casting (spec du lot 3, §2 d, approche B ; plan du lot 3a, tâche A6) : NPC passe ses options de casting
// à spawnCharacter (model, strict, teinte, teinteMaillage, exclure ; tests/characters.casting.test.js) et reçoit son
// rôle d'ombre (shadowRole) de qui le crée, détaché du pool de son modèle. Avant la tâche, l'ombre suivait le pool :
// une cible au modèle du pool des civils avait l'ombre des civils (le commanditaire de M6, par modelType), si bien que
// Verne (mafia_woman_02, pool des civils) n'aurait pas eu d'ombre en Moyen (rapport de M4).
//
// Témoin : sur le npc.js d'avant la tâche (commit 201da61), qui n'a ni casting ni shadowRole, les tests du modèle
// imposé, de l'ombre donnée et de l'erreur rougissent (vus rouges) ; l'ombre par défaut et le pool du rôle sans casting
// sont ceux d'avant.
vi.mock('../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeModel } = await import('./gfx/fakeGltf.js')
  return { GLTFLoader: class { async loadAsync(url) { return fakeModel(url) } } }
})

let NPC, MODELS
async function charger({ models = true } = {}) {
  vi.resetModules()
  const characters = await import('../src/characters.js')
  ;({ MODELS } = characters)
  ;({ NPC } = await import('../src/npc.js'))
  if (models) {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await characters.preloadCharacters()
    vi.restoreAllMocks()
  }
}
beforeEach(() => charger())
afterEach(() => vi.restoreAllMocks())

const BOUNDS = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
const fichier = url => url.split('/').pop().replace(/\.glb$/, '')
const cible = extra => new NPC({ isTarget: true, color: 0xcc4422, x: 0, z: 0, bounds: BOUNDS, ...extra })
const HASARDS = [0, 0.34, 0.5, 0.67, 0.999]
const avecHasard = (r, f) => {
  const s = vi.spyOn(Math, 'random').mockReturnValue(r)
  try { return f() } finally { s.mockRestore() }
}

describe('NPC passe son casting à spawnCharacter', () => {
  it('Verne : une cible au modèle du pool des civils, la même quel que soit le hasard', () => {
    for (const r of HASARDS) {
      const npc = avecHasard(r, () => cible({ casting: { model: 'mafia_woman_02', strict: true } }))
      expect(npc.character && fichier(npc.character.cfg.url), `hasard ${r}`).toBe('mafia_woman_02')
      npc.dispose()
    }
  })

  it('un modèle que le jeu n\'a pas, en mode strict : le PNJ n\'est pas créé, l\'erreur le nomme', () => {
    expect(() => cible({ casting: { model: 'mafia_inconnu', strict: true } })).toThrow(/mafia_inconnu/)
  })

  it('sans casting : un modèle tiré dans le pool du rôle (la foule du PvP), comme avant', () => {
    const pool = t => (MODELS[t].variants ? MODELS[t].variants.map(v => v.url) : [MODELS[t].url])
    for (const r of HASARDS) {
      const c = avecHasard(r, () => cible({}))
      const g = avecHasard(r, () => new NPC({ isGuard: true, color: 0x334433, x: 1, z: 1, bounds: BOUNDS }))
      const v = avecHasard(r, () => new NPC({ isCivilian: true, color: 0x7a6aaa, x: 2, z: 2, bounds: BOUNDS }))
      expect(pool('target')).toContain(c.character.cfg.url)
      expect(pool('guard')).toContain(g.character.cfg.url)
      expect(pool('civilian')).toContain(v.character.cfg.url)
      for (const n of [c, g, v]) n.dispose()
    }
  })
})

describe('shadowRole : le rôle d\'ombre que donne qui crée le PNJ, détaché du pool de son modèle', () => {
  it('donné : le commanditaire de M6, une cible à l\'ombre des civils', () => {
    expect(cible({ casting: { model: 'gangster_man_02', strict: true }, shadowRole: 'civil' }).shadowRole).toBe('civil')
  })

  it('par défaut, celui de son rôle, quel que soit le pool de son modèle (Verne garde l\'ombre des cibles)', () => {
    expect(cible({ casting: { model: 'mafia_woman_02', strict: true } }).shadowRole).toBe('cible')
    expect(cible({}).shadowRole).toBe('cible')
    expect(new NPC({ isGuard: true, color: 0x334433, x: 1, z: 1, bounds: BOUNDS }).shadowRole).toBe('garde')
    expect(new NPC({ isCivilian: true, color: 0x7a6aaa, x: 2, z: 2, bounds: BOUNDS }).shadowRole).toBe('civil')
  })

  it('sans modèle chargé (personnage de secours) : le même rôle d\'ombre', async () => {
    await charger({ models: false })
    const npc = cible({ casting: { model: 'gangster_man_02', strict: true }, shadowRole: 'civil', female: false })
    expect(npc.character).toBeNull()
    expect(npc.shadowRole).toBe('civil')
  })
})
