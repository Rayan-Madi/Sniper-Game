import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import * as THREE from 'three'
import { MAIN_SRC, executer } from '../gfx/mainSource.js'

// Identification sans marqueur (spec du lot 3, §2 e et tests 3a : « Aucun marqueur de M2 à M6 », « Ombre « civil » pour
// les cibles de M2 à M6 en Moyen » ; plan du lot 3a, tâche A7 ; décision de Rayan du 7 octobre 2026, REPRISE.md :
// marqueurs gardés en M1, le tutoriel, retirés à partir de M2). mountLevel de main.js est exécuté tel quel (executer,
// tests/gfx/mainSource.js), avec le vrai NPC, le vrai casting, les vraies missions et les ancres des vraies cartes :
// - M1 garde le marqueur rouge au-dessus de Markov, et son ombre de cible ;
// - de M2 à M6, aucune cible n'a de marqueur ; en Moyen (et en Auto, qui rend comme Moyen), seules les cibles et les
//   gardes projettent une ombre (npcCastsShadow, src/gfx/quality.js) : une cible qui en projetterait une se
//   distinguerait des civils, d'où l'ombre des civils pour elles (quality.js ; rapport M2 du lot 3).
//
// Témoin : sur les missions d'avant la tâche (commit fcb5151), les cibles de M2 à M5 ont leur marqueur et l'ombre des
// cibles (vus rouges). Plus bas, le câblage de mountLevel retiré du main.js d'aujourd'hui fait aussi rougir.

vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeModel } = await import('../gfx/fakeGltf.js')
  return { GLTFLoader: class { async loadAsync(url) { return fakeModel(url) } } }
})

const { scene } = await import('../../src/scene.js')
const characters = await import('../../src/characters.js')
const { NPC, STATES, setNpcShadows, npcShadowMode } = await import('../../src/npc.js')
const { MAP_BUILDERS, clearMap } = await import('../../src/maps/index.js')
const { withSeed } = await import('../../src/gfx/memtest.js')
const { presetFor } = await import('../../src/gfx/quality.js')
const { MISSIONS, missionFor, resoudreAncres, nombreDeCivils, castingDesCivils } = await import('../../src/campaign/missions/index.js')

const CARTES = MAP_BUILDERS.map((build, i) => withSeed(1000 + i, build))
clearMap()

const MODE_D_AVANT = npcShadowMode()
beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await characters.preloadCharacters()
})
afterAll(() => vi.restoreAllMocks())
afterEach(() => setNpcShadows(MODE_D_AVANT))

// mountLevel exécuté tel quel, dans une portée faite de doublures pour ce qui ne touche pas aux PNJ.
function monteur(source = MAIN_SRC) {
  return executer(['mountLevel'], {
    removeMoralLock: () => {}, applyQuality: () => {},
    currentMission: null, missionFor,
    MAP_BUILDERS: CARTES.map(info => () => info), currentMapInfo: null,
    applyCameraProfile: () => {}, camera: new THREE.PerspectiveCamera(), scene, sun: null,
    mountEcho: () => {}, currentAnchors: null, resoudreAncres,
    moralLockMesh: null, moralLockBox: null, moralLockLight: null,
    buildMoralLock: () => ({ mesh: null, box: null, light: null }),
    yaw: 0, pitch: 0, aimAngles: () => ({ yaw: 0, pitch: 0 }),
    setZoom: () => {}, setZero: () => {}, recoil: { reset() {} }, recoilOffset: null,
    mapGround: () => 0, NPC, STATES, npcs: [], targets: [], guards: [], civilians: [], nombreDeCivils, castingDesCivils,
    convoyCar: null, convoyTarget: null, makeJeep: () => new THREE.Group(),
  }, source)
}

// Ce que montre un PNJ : son marqueur (cône et anneau), et s'il projette une ombre (tous ses maillages qui le peuvent).
const ombre = npc => {
  const porteurs = []
  npc.mesh.traverse(o => { if (o.isSkinnedMesh) porteurs.push(o) })
  if (!porteurs.length) throw new Error('PNJ sans maillage animé : modèle non chargé')
  const n = porteurs.filter(o => o.castShadow).length
  return n === 0 ? 'aucune' : n === porteurs.length ? 'portée' : 'partielle'
}
const vu = npc => ({ marqueur: !!(npc.mesh.userData.marker || npc.mesh.userData.ring), ombre: ombre(npc) })

// Un montage de la mission numero, ombres des personnages en Moyen ; relevé de ses PNJ, puis libérés.
function monter(numero, { source } = {}) {
  setNpcShadows(presetFor('moyen', 1).npcShadows)
  const s = monteur(source)
  s.poser({ npcs: [], targets: [], guards: [], civilians: [] })
  s.fns.mountLevel(numero)
  const { targets, guards, civilians, npcs } = s.etat()
  const out = { cibles: targets.map(vu), gardes: guards.map(vu), civils: civilians.map(vu) }
  for (const npc of npcs) npc.dispose()
  scene.clear()
  return out
}

describe('données : le marqueur rouge seulement en M1, le tutoriel', () => {
  it('marqueurs : M1 oui ; M2, M3, M4, M5 et M6 non', () => {
    expect(Object.fromEntries(MISSIONS.map(m => [m.numero, m.marqueurs]))).toEqual({ 1: true, 2: false, 3: false, 4: false, 5: false, 6: false })
  })
})

describe('au montage, en Moyen : le marqueur et l\'ombre de chaque cible', () => {
  it('Moyen : les cibles et les gardes projettent une ombre, pas les civils (la règle que les cibles de M2 à M6 suivent)', () => {
    expect(presetFor('moyen', 1).npcShadows).toBe('cibles-gardes')
    expect(presetFor('auto', 1).npcShadows).toBe('cibles-gardes')
  })

  it('M1 : Markov a son marqueur et l\'ombre des cibles, comme son garde', () => {
    const v = monter(1)
    expect(v.cibles).toEqual([{ marqueur: true, ombre: 'portée' }])
    expect(v.gardes.every(g => g.ombre === 'portée')).toBe(true)
  })

  for (const numero of [2, 3, 4, 5, 6]) {
    it(`M${numero} : aucune cible marquée, aucune ombre de cible : celle des civils`, () => {
      const v = monter(numero)
      expect(v.cibles).toHaveLength(missionFor(numero).casting.cibles.length)
      expect(v.cibles).toEqual(v.cibles.map(() => ({ marqueur: false, ombre: 'aucune' })))
      for (const c of v.civils) expect(c, 'un civil').toEqual({ marqueur: false, ombre: 'aucune' })
    })
  }
})

// Témoins du câblage : chaque pièce retirée du main.js d'aujourd'hui fait rougir.
describe('témoins du câblage de mountLevel', () => {
  const remplace = (avant, apres) => {
    expect(MAIN_SRC.split(avant), `« ${avant} » absent de main.js, ou plusieurs fois : témoin impossible`).toHaveLength(2)
    return MAIN_SRC.replace(avant, apres)
  }

  it('les cibles sans hideMarker : le marqueur revient en M2', () => {
    const v = monter(2, { source: remplace('hideMarker: !m.marqueurs,', '') })
    expect(v.cibles.map(c => c.marqueur)).toEqual([true, true])
  })

  it('les cibles au rôle d\'ombre des cibles : leur ombre les trahit en M4', () => {
    const v = monter(4, { source: remplace("shadowRole: m.marqueurs ? 'cible' : 'civil',", "shadowRole: 'cible',") })
    expect(v.cibles.map(c => c.ombre)).toEqual(['portée', 'portée', 'portée'])
  })
})
