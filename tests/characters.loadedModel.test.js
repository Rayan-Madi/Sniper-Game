import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

// Modèle chargé désigné par son fichier, cherché dans tous les pools (characters.js, loadedModel) : la sonde de
// lisibilité (route ?sonde=1, spec du lot 3 §1 « 3.0 ») pose les modèles imposés de la spec §3, dont deux hors du pool
// de leur rôle : Verne (mafia_woman_02) est dans celui des civils, Halder (mafia_henchman) dans celui des gardes.
//
// Témoin : avant la tâche S0 (commit 267ca90), le seul moyen de demander un modèle par son nom est
// spawnCharacter(type, { match }), qui ne cherche que dans le pool du rôle, retombe en silence sur tout le pool quand
// rien ne correspond (spec du lot 3, §0) et tire au hasard. Demandée comme cible, Verne sort sous les traits d'un autre
// modèle. Sans loadedModel, les tests tournent sur cette règle (regleAvant) et échouent sur elle (vus rouges). Depuis
// la tâche A6 du lot 3, l'option match n'existe plus : spawnCharacter impose un modèle par l'option model, cherchée
// dans tous les pools (tests/characters.casting.test.js) ; regleAvant ne sert qu'au témoin, sur le code d'avant S0.

// Faux GLTFLoader : chaque fichier rend une scène vide qui porte son adresse.
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three')
  return {
    GLTFLoader: class {
      loadAsync(url) {
        const scene = new THREE.Group()
        scene.userData.url = url
        return Promise.resolve({ scene, animations: [] })
      }
    },
  }
})

const C = await import('../src/characters.js')

const regleAvant = nom => {
  const c = C.spawnCharacter('target', { match: nom })
  return c ? { cfg: c.cfg, type: 'target', scene: null } : null
}
const loadedModel = C.loadedModel ?? regleAvant

const fichier = url => url.split('/').pop().replace(/\.glb$/, '')
const urlsOf = cfg => (cfg.variants ? cfg.variants.map(v => v.url) : [cfg.url])

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await C.preloadCharacters()
  vi.restoreAllMocks()
})
afterEach(() => vi.restoreAllMocks())

describe('loadedModel : un modèle chargé par son nom, dans tous les pools', () => {
  it('chaque modèle du jeu est trouvé par son nom, avec la configuration de son pool', () => {
    for (const [type, cfg] of Object.entries(C.MODELS)) {
      for (const url of urlsOf(cfg)) {
        const m = loadedModel(fichier(url))
        expect(m && m.type, fichier(url)).toBe(type)
        expect(m.cfg.url).toBe(url)
        expect(m.cfg.fitHeight).toBe(cfg.fitHeight)
      }
    }
  })

  it('Verne (pool des civils) et Halder (pool des gardes) aussi', () => {
    expect(loadedModel('mafia_woman_02')).toMatchObject({ type: 'civilian', cfg: { url: expect.stringMatching(/mafia_woman_02\.glb$/) } })
    expect(loadedModel('mafia_henchman')).toMatchObject({ type: 'guard', cfg: { url: expect.stringMatching(/mafia_henchman\.glb$/) } })
  })

  it('par son adresse ou son nom de fichier', () => {
    expect(loadedModel('/models/mafia_boss.glb')?.cfg.url).toMatch(/mafia_boss\.glb$/)
    expect(loadedModel('mafia_boss.glb')?.cfg.url).toMatch(/mafia_boss\.glb$/)
  })

  it('la scène rendue est celle du modèle chargé (partagée : la sonde la clone)', () => {
    const a = loadedModel('mafia_woman_01'), b = loadedModel('mafia_woman_01')
    expect(a.scene).toBeTruthy()
    expect(a.scene).toBe(b.scene)
    expect(a.scene.userData.url).toMatch(/mafia_woman_01\.glb$/)
  })

  it('un modèle inconnu : null, sans retomber sur un autre', () => {
    expect(loadedModel('mafia_inconnu')).toBeNull()
    expect(loadedModel('')).toBeNull()
  })

  // Le PvP tire ses modèles avec une graine partagée par les deux machines : chercher un modèle ne consomme aucun
  // tirage (spec du lot 3, §2 d).
  it('aucun tirage au hasard', () => {
    const spy = vi.spyOn(Math, 'random')
    loadedModel('mafia_woman_02')
    loadedModel('gangster_man_01')
    expect(spy).not.toHaveBeenCalled()
  })
})
