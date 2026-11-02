import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Casting strict (spec du lot 3, §2 d, approche B ; plan du lot 3a, tâche A6) : spawnCharacter(type, { model, strict,
// teinte, teinteMaillage, exclure }).
// - model : le modèle imposé, par son fichier, cherché dans tous les pools (Verne, mafia_woman_02, est dans celui des
//   civils ; Halder, mafia_henchman, dans celui des gardes), sans tirage, quel que soit le hasard ; il garde la
//   configuration de son pool.
// - strict : une erreur plutôt que la retombée en silence (spec §0 : avant la tâche, match filtrait le seul pool du
//   rôle et retombait sur tout le pool) : modèle imposé ou exclu inconnu, maillage de teinteMaillage absent du modèle.
// - Un modèle connu mais pas chargé (fichier en échec) rend null, le personnage de secours, jamais un autre visage.
// - teinte : sans tirage ; 0xffffff garde les matériaux du modèle. teinteMaillage : la teinte d'un maillage seulement
//   (le polo de Marc), sur une copie de son matériau.
// - exclure : les sosies écartés du tirage des civils, un seul tirage parmi les autres modèles du pool.
// Sans option, rien ne change : tests/pvp/tirages.test.js (la foule du PvP, à graine fixe, tirée comme avant).
//
// Témoin : sur le characters.js d'avant la tâche (commit 201da61), qui ignore ces options et tire toujours modèle et
// teinte, ces tests rougissent, sauf la retombée hors du mode strict, qui est celle d'avant (vus rouges).

const loader = vi.hoisted(() => ({ echecs: [] }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeModel } = await import('./gfx/fakeGltf.js')
  return {
    GLTFLoader: class {
      async loadAsync(url) {
        if (loader.echecs.some(f => url.endsWith(`/${f}.glb`))) throw new Error('404 ' + url)
        return fakeModel(url)
      }
    },
  }
})

let C, isShared
async function charger(echecs = []) {
  vi.resetModules()
  loader.echecs = echecs
  C = await import('../src/characters.js')
  ;({ isShared } = await import('../src/gfx/dispose.js'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await C.preloadCharacters()
  vi.restoreAllMocks()
}
beforeEach(() => charger())
afterEach(() => vi.restoreAllMocks())

const fichier = url => url.split('/').pop().replace(/\.glb$/, '')
const POOL = { gangster_man_01: 'target', mafia_boss: 'target', mafia_woman_01: 'target', mafia_henchman: 'guard',
  gangster_man_02: 'civilian', mafia_woman_02: 'civilian', mafia_woman_03: 'civilian' }
const TOUS = Object.keys(POOL)
const HASARDS = [0, 0.2, 0.34, 0.5, 0.67, 0.8, 0.999]
const avecHasard = (r, f) => {
  const s = vi.spyOn(Math, 'random').mockReturnValue(r)
  try { return f() } finally { s.mockRestore() }
}
const source = nom => C.loadedModel(nom).scene
const materiaux = root => { const out = []; root.traverse(o => { if (o.isSkinnedMesh) out.push(o.material) }); return out }
const maillage = (root, nom) => root.getObjectByName(nom)

describe('model : le modèle imposé, cherché dans tous les pools, sans tirage', () => {
  it('chacun des sept modèles, demandé à chaque pool, quel que soit le hasard : lui, avec la configuration de son pool', () => {
    for (const nom of TOUS) {
      for (const type of ['target', 'guard', 'civilian']) {
        for (const r of HASARDS) {
          const ch = avecHasard(r, () => C.spawnCharacter(type, { model: nom, strict: true }))
          expect(ch && fichier(ch.cfg.url), `${nom} demandé au pool ${type}, hasard ${r}`).toBe(nom)
          expect(ch.cfg.fitHeight, nom).toBe(C.MODELS[POOL[nom]].fitHeight)
          expect(ch.model.userData.url, 'le clone du modèle demandé').toBe(ch.cfg.url)
        }
      }
    }
  })

  it('Verne et Halder comme cibles : mafia_woman_02 (pool des civils), mafia_henchman (pool des gardes)', () => {
    expect(fichier(C.spawnCharacter('target', { model: 'mafia_woman_02', strict: true }).cfg.url)).toBe('mafia_woman_02')
    expect(fichier(C.spawnCharacter('target', { model: 'mafia_henchman', strict: true }).cfg.url)).toBe('mafia_henchman')
  })

  it('par son fichier, avec ou sans .glb, ou par son adresse', () => {
    for (const nom of ['mafia_boss', 'mafia_boss.glb', '/models/mafia_boss.glb']) {
      expect(fichier(C.spawnCharacter('civilian', { model: nom, strict: true }).cfg.url), nom).toBe('mafia_boss')
    }
  })

  // Les tirages d'un personnage : son modèle, sa taille, sa teinte (plus ceux de three, qui tire l'identifiant de chaque
  // objet qu'il crée). Avec 0, le pool des civils donne gangster_man_02 et la teinte blanche, sans copie de matériau : le
  // même clone qu'avec le modèle et la teinte imposés. Seule la taille reste tirée.
  it('le modèle et la teinte imposés ne tirent rien : deux tirages de moins que le tirage du pool', () => {
    const tirages = f => {
      let n = 0
      const s = vi.spyOn(Math, 'random').mockImplementation(() => { n++; return 0 })
      try { f() } finally { s.mockRestore() }
      return n
    }
    const libre = tirages(() => C.spawnCharacter('civilian'))
    const impose = tirages(() => C.spawnCharacter('civilian', { model: 'gangster_man_02', strict: true, teinte: 0xffffff }))
    expect(libre - impose).toBe(2)
  })
})

describe('strict : une erreur plutôt que la retombée', () => {
  it('un modèle inconnu est une erreur qui le nomme', () => {
    expect(() => C.spawnCharacter('target', { model: 'gangster_man_09', strict: true })).toThrow(/modèle inconnu.*gangster_man_09/)
  })

  it('sans strict, un modèle inconnu retombe sur un modèle tiré dans le pool du rôle (la règle de match, d\'avant)', () => {
    for (const r of HASARDS) {
      const ch = avecHasard(r, () => C.spawnCharacter('target', { model: 'gangster_man_09' }))
      expect(POOL[fichier(ch.cfg.url)], `hasard ${r}`).toBe('target')
    }
  })

  it('un maillage de teinteMaillage que le modèle n\'a pas est une erreur qui le nomme ; sans strict, il est ignoré', () => {
    expect(() => C.spawnCharacter('civilian', { model: 'gangster_man_02', strict: true, teinteMaillage: { Ch01_Polo: 0xd9c19a } }))
      .toThrow(/Ch01_Polo.*gangster_man_02/)
    const ch = C.spawnCharacter('civilian', { model: 'gangster_man_02', teinte: 0xffffff, teinteMaillage: { Ch01_Polo: 0xd9c19a } })
    expect(materiaux(ch.model)).toEqual(materiaux(source('gangster_man_02')))
  })

  it('un modèle exclu inconnu est une erreur qui le nomme', () => {
    expect(() => C.spawnCharacter('civilian', { exclure: ['mafia_woman_09'], strict: true })).toThrow(/modèle inconnu.*mafia_woman_09/)
  })
})

describe('un modèle connu mais pas chargé : null (le personnage de secours), jamais un autre visage', () => {
  beforeEach(() => charger(['gangster_man_01']))

  it('gangster_man_01 en échec : null à chaque hasard, en mode strict ou non ; les autres modèles du pool, eux', () => {
    expect(C.poolUrls('target').map(fichier)).toEqual(['mafia_boss', 'mafia_woman_01'])
    for (const r of HASARDS) {
      for (const strict of [true, false]) {
        expect(avecHasard(r, () => C.spawnCharacter('target', { model: 'gangster_man_01', strict })), `hasard ${r}`).toBeNull()
      }
      expect(fichier(avecHasard(r, () => C.spawnCharacter('target', { model: 'mafia_boss', strict: true })).cfg.url)).toBe('mafia_boss')
    }
  })
})

describe('teinte : imposée, sans tirage', () => {
  // Avec 0,5, le tirage prendrait une teinte du milieu de la liste, jamais la blanche.
  it('0xffffff : la texture telle quelle, les matériaux du modèle (partagés)', () => {
    const ch = avecHasard(0.5, () => C.spawnCharacter('civilian', { model: 'mafia_woman_03', strict: true, teinte: 0xffffff }))
    const src = materiaux(source('mafia_woman_03'))
    expect(src).toHaveLength(2)
    expect(materiaux(ch.model).every((m, i) => m === src[i])).toBe(true)
  })

  it('une autre teinte : celle-là, sur des copies à l\'instance, textures du modèle gardées', () => {
    const ch = avecHasard(0.5, () => C.spawnCharacter('civilian', { model: 'mafia_woman_03', strict: true, teinte: 0x123456 }))
    const src = materiaux(source('mafia_woman_03'))
    materiaux(ch.model).forEach((m, i) => {
      expect(m).not.toBe(src[i])
      expect(isShared(m)).toBe(false)
      expect(m.color.getHex()).toBe(0x123456)
      expect(m.map).toBe(src[i].map)
    })
  })
})

describe('teinteMaillage : la teinte d\'un maillage seulement (le polo de Marc)', () => {
  it('le polo sur une copie de son matériau, le reste du corps aux matériaux du modèle', () => {
    const ch = avecHasard(0.5, () => C.spawnCharacter('civilian', { model: 'gangster_man_02', strict: true, teinte: 0xffffff,
      teinteMaillage: { Ch01_Shirt: 0xd9c19a } }))
    expect(fichier(ch.cfg.url)).toBe('gangster_man_02')
    const src = source('gangster_man_02')
    expect(maillage(ch.model, 'Ch01_Body').material).toBe(maillage(src, 'Ch01_Body').material)
    const polo = maillage(ch.model, 'Ch01_Shirt').material, poloSource = maillage(src, 'Ch01_Shirt').material
    expect(polo).not.toBe(poloSource)
    expect(isShared(polo)).toBe(false)
    expect(polo.color.getHex()).toBe(0xd9c19a)
    expect(polo.map).toBe(poloSource.map)
  })

  it('avec une teinte du modèle entier : le maillage cité prend la sienne, les autres celle du modèle', () => {
    const ch = C.spawnCharacter('civilian', { model: 'gangster_man_02', strict: true, teinte: 0xccbbaa, teinteMaillage: { Ch01_Shirt: 0xd9c19a } })
    expect(maillage(ch.model, 'Ch01_Body').material.color.getHex()).toBe(0xccbbaa)
    expect(maillage(ch.model, 'Ch01_Shirt').material.color.getHex()).toBe(0xd9c19a)
  })
})

describe('exclure : les sosies écartés du tirage, un seul tirage parmi les autres', () => {
  const GRILLE = Array.from({ length: 100 }, (_, i) => i / 100)

  it('pool des civils sans gangster_man_02 : jamais lui ; mafia_woman_02 sous 0,5, mafia_woman_03 au-delà', () => {
    for (const r of GRILLE) {
      const ch = avecHasard(r, () => C.spawnCharacter('civilian', { exclure: ['gangster_man_02'], strict: true }))
      expect(fichier(ch.cfg.url), `hasard ${r}`).toBe(r < 0.5 ? 'mafia_woman_02' : 'mafia_woman_03')
    }
  })

  it('deux exclus (les civils du port, des dockers) : le dernier seul', () => {
    for (const r of GRILLE) {
      const ch = avecHasard(r, () => C.spawnCharacter('civilian', { exclure: ['mafia_woman_02', 'mafia_woman_03.glb'], strict: true }))
      expect(fichier(ch.cfg.url), `hasard ${r}`).toBe('gangster_man_02')
    }
  })

  it('tout le pool exclu : null (le personnage de secours)', () => {
    expect(C.spawnCharacter('civilian', { exclure: ['gangster_man_02', 'mafia_woman_02', 'mafia_woman_03'], strict: true })).toBeNull()
  })
})
