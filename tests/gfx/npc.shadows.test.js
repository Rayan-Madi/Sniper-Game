import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Ombre des personnages selon le préréglage (spec du lot 1 §4.3, tâche L4) : Haut, tous ; Moyen et Auto, cibles et
// gardes ; Bas, aucun. Jusqu'ici chaque personnage projetait son ombre (characters.js, makePerson), ce qui doublait
// ses triangles par la passe d'ombre. Le mode s'applique aux PNJ créés ensuite (setNpcShadows) et aux PNJ déjà en
// scène (applyShadows). Seuls les maillages qui projetaient une ombre à la création en projettent une : jamais les
// marqueurs, ni les yeux du modèle procédural. Le commanditaire de M6 (modèle de la foule, sans marqueur) suit la
// règle des civils : une ombre qu'aucun danseur n'a le trahirait.
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeCharacter } = await import('./fakeGltf.js')
  return { GLTFLoader: class { async loadAsync() { return fakeCharacter() } } }
})

let npcMod
async function load({ models = true } = {}) {
  vi.resetModules()
  const characters = await import('../../src/characters.js')
  npcMod = await import('../../src/npc.js')
  if (models) await characters.preloadCharacters()
}
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await load()
})
afterEach(() => vi.restoreAllMocks())

const BOUNDS = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
const KINDS = {
  'cible marquée': () => new npcMod.NPC({ isTarget: true, color: 0xcc4422, x: 0, z: 0, bounds: BOUNDS }),
  'garde': () => new npcMod.NPC({ isGuard: true, color: 0x334433, x: 3, z: -2, bounds: BOUNDS }),
  'civil': () => new npcMod.NPC({ isCivilian: true, color: 0x7a6aaa, x: 1, z: 2, bounds: BOUNDS, partyMode: true }),
  'commanditaire (modèle de la foule)': () => new npcMod.NPC({ isTarget: true, color: 0xcc4422, x: 4, z: 4, bounds: BOUNDS,
    hideMarker: true, lockState: 'phone', onPhone: true, modelType: 'civilian' }),
}
const EXPECTED = {   // projette une ombre ?
  tous: { 'cible marquée': true, 'garde': true, 'civil': true, 'commanditaire (modèle de la foule)': true },
  'cibles-gardes': { 'cible marquée': true, 'garde': true, 'civil': false, 'commanditaire (modèle de la foule)': false },
  aucun: { 'cible marquée': false, 'garde': false, 'civil': false, 'commanditaire (modèle de la foule)': false },
}

const meshes = npc => { const out = []; npc.mesh.traverse(o => { if (o.isMesh) out.push(o) }); return out }
const casting = npc => meshes(npc).filter(m => m.castShadow)
const markers = npc => [npc.mesh.userData.marker, npc.mesh.userData.ring].filter(Boolean)

for (const models of [true, false]) {
  describe(models ? 'personnages GLB' : 'personnages procéduraux (modèles absents)', () => {
    beforeEach(async () => { if (!models) await load({ models: false }) })

    // Maillages qui projettent une ombre au réglage d'avant le lot 1 (mode « tous »), par sorte de PNJ.
    function reference(kind) {
      npcMod.setNpcShadows('tous')
      const npc = KINDS[kind]()
      return casting(npc).length
    }

    for (const mode of Object.keys(EXPECTED)) {
      it(`mode ${mode}`, () => {
        for (const kind of Object.keys(KINDS)) {
          const n = reference(kind)
          expect(n, kind).toBeGreaterThan(0)
          npcMod.setNpcShadows(mode)
          const npc = KINDS[kind]()
          expect(casting(npc).length, kind).toBe(EXPECTED[mode][kind] ? n : 0)
        }
      })
    }

    it('les marqueurs ne projettent jamais d\'ombre, quel que soit le mode', () => {
      for (const mode of Object.keys(EXPECTED)) {
        npcMod.setNpcShadows(mode)
        const npc = KINDS['cible marquée']()
        expect(markers(npc)).toHaveLength(2)
        for (const m of markers(npc)) expect(m.castShadow).toBe(false)
      }
    })

    it('PNJ déjà en scène : applyShadows éteint puis rallume exactement les mêmes maillages', () => {
      npcMod.setNpcShadows('tous')
      for (const kind of Object.keys(KINDS)) {
        const npc = KINDS[kind]()
        const before = casting(npc)
        npc.applyShadows('aucun')
        expect(casting(npc), kind).toEqual([])
        npc.applyShadows('cibles-gardes')
        expect(casting(npc), kind).toEqual(EXPECTED['cibles-gardes'][kind] ? before : [])
        npc.applyShadows('tous')
        expect(casting(npc), kind).toEqual(before)
      }
    })
  })
}

describe('mode courant', () => {
  it('« tous » par défaut (rendu d\'avant le lot 1), puis celui posé par setNpcShadows', () => {
    expect(npcMod.npcShadowMode()).toBe('tous')
    npcMod.setNpcShadows('aucun')
    expect(npcMod.npcShadowMode()).toBe('aucun')
  })
})
