import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as THREE from 'three'
import { MAIN_SRC, executer } from '../gfx/mainSource.js'

// Casting au montage (spec du lot 3, §2 d et tests 3a : « 50 montages par mission : modèle imposé 100 % du temps, et
// erreur si le modèle n'existe pas » ; plan du lot 3a, tâche A6). mountLevel de main.js est exécuté tel quel (executer,
// tests/gfx/mainSource.js), avec le vrai NPC, le vrai casting (src/characters.js), les vraies missions et les ancres
// des vraies cartes ; faux modèles distincts par leur adresse, aux maillages nommés comme ceux des vrais
// (tests/gfx/fakeGltf.js, fakeModel). Sur 50 montages de chaque mission, au hasard du jeu :
// - chaque cible a le modèle de son portrait (spec §3, décision 6), sans teinte du modèle entier, sauf le polo beige de
//   Marc et le polo sombre du commanditaire (sur leur seul maillage, Ch01_Shirt) ;
// - les gardes de M4 sont en mafia_boss, l'armure sable de sa texture (décision 5) ; les autres, dans le pool des gardes ;
// - aucun civil n'a le modèle d'un sosie écarté par sa mission (civils.exclure) ;
// - l'ombre des cibles suit leur marqueur (tâche A7) : celle des cibles en M1, le tutoriel, qui a le sien ; celle des
//   civils de M2 à M6, sans marqueur (tests/campaign/main.identification.test.js). La mission donne ce rôle d'ombre à
//   la cible (shadowRole), jamais pris au pool de son modèle (Verne : tests/gfx/npc.shadows.test.js).
// Une mission qui cite un modèle que le jeu n'a pas ne se monte pas : l'erreur nomme le modèle.
//
// Témoin : sur le main.js et les missions d'avant la tâche (commit 201da61), Markov n'a son modèle qu'une fois sur
// trois environ, Verne jamais, et rien n'écarte les sosies (vus rouges). Plus bas, chaque pièce du câblage est retirée
// du main.js d'aujourd'hui, et un test rougit.

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
const { NPC, STATES } = await import('../../src/npc.js')
const { MAP_BUILDERS, clearMap } = await import('../../src/maps/index.js')
const { withSeed } = await import('../../src/gfx/memtest.js')
const { isShared } = await import('../../src/gfx/dispose.js')
const { MISSIONS, missionFor, resoudreAncres, nombreDeCivils, castingDesCivils } = await import('../../src/campaign/missions/index.js')

// Les cartes, construites une fois (hasard à graine) : mountLevel les reçoit telles quelles à chaque montage.
const CARTES = MAP_BUILDERS.map((build, i) => withSeed(1000 + i, build))
clearMap()

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await characters.preloadCharacters()
})
afterAll(() => vi.restoreAllMocks())

const fichier = url => url.split('/').pop().replace(/\.glb$/, '')

// mountLevel exécuté tel quel, dans une portée faite de doublures (ce qui ne touche pas au casting : écho, profil de
// caméra, lunette, cadenas, jeeps) et des vrais modules du casting.
function monteur(source = MAIN_SRC, mission = null) {
  return executer(['mountLevel'], {
    removeMoralLock: () => {}, applyQuality: () => {},
    currentMission: null, missionFor: mission ? () => mission : missionFor,
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

// Ce que montre un PNJ : son modèle, les teintes de ses copies de matériau (maillage → couleur ; les matériaux du
// modèle, partagés, n'y sont pas) et son rôle d'ombre.
function vu(npc) {
  const teintes = {}
  npc.character.model.traverse(o => { if (o.isSkinnedMesh && !isShared(o.material)) teintes[o.name] = o.material.color.getHexString() })
  return { modele: fichier(npc.character.cfg.url), teintes, ombre: npc.shadowRole }
}

// n montages de la mission numero ; chacun relevé ({ cibles, gardes, civils }), puis ses PNJ libérés.
function montages(numero, n, { source, mission } = {}) {
  const s = monteur(source, mission)
  const out = []
  for (let k = 0; k < n; k++) {
    s.poser({ npcs: [], targets: [], guards: [], civilians: [] })
    s.fns.mountLevel(numero)
    const { targets, guards, civilians, npcs } = s.etat()
    out.push({ cibles: targets.map(vu), gardes: guards.map(vu), civils: civilians.map(vu) })
    for (const npc of npcs) npc.dispose()
    scene.clear()
  }
  return out
}

const VISAGES = {
  1: ['gangster_man_01'], 2: ['gangster_man_02', 'gangster_man_02'], 3: ['gangster_man_01', 'mafia_woman_03'],
  4: ['mafia_woman_02', 'mafia_henchman', 'mafia_woman_01'], 5: ['mafia_boss'], 6: ['gangster_man_02'],
}
const POLOS = { 2: [{}, { Ch01_Shirt: 'd9c19a' }], 6: [{ Ch01_Shirt: '3a3f4a' }] }
const OMBRES = { 1: 'cible', 2: 'civil', 3: 'civil', 4: 'civil', 5: 'civil', 6: 'civil' }
const EXCLUS = { 1: ['mafia_woman_02'], 2: ['gangster_man_02'], 3: ['mafia_woman_02', 'mafia_woman_03'], 4: ['mafia_woman_02'], 5: [], 6: [] }
const CIVILS = ['gangster_man_02', 'mafia_woman_02', 'mafia_woman_03']

// Les écarts au casting attendu sur des montages de la mission numero (vide : conforme).
function ecarts(numero, vus) {
  const out = new Set()
  for (const v of vus) {
    v.cibles.forEach((c, i) => {
      if (c.modele !== VISAGES[numero][i]) out.add(`cible ${i} : ${c.modele} au lieu de ${VISAGES[numero][i]}`)
      const polo = (POLOS[numero] || [])[i] || {}
      if (JSON.stringify(c.teintes) !== JSON.stringify(polo)) out.add(`cible ${i} : teintes ${JSON.stringify(c.teintes)} au lieu de ${JSON.stringify(polo)}`)
      if (c.ombre !== OMBRES[numero]) out.add(`cible ${i} : ombre ${c.ombre} au lieu de ${OMBRES[numero]}`)
    })
    if (v.cibles.length !== VISAGES[numero].length) out.add(`${v.cibles.length} cibles`)
    for (const g of v.gardes) {
      const attendu = numero === 4 ? 'mafia_boss' : 'mafia_henchman'
      if (g.modele !== attendu) out.add(`garde en ${g.modele} au lieu de ${attendu}`)
      if (numero === 4 && Object.keys(g.teintes).length) out.add(`garde de M4 teinté ${JSON.stringify(g.teintes)}`)
      if (g.ombre !== 'garde') out.add(`garde à l'ombre ${g.ombre}`)
    }
    for (const c of v.civils) {
      if (EXCLUS[numero].includes(c.modele)) out.add(`civil en ${c.modele}, sosie écarté`)
      if (!CIVILS.includes(c.modele)) out.add(`civil en ${c.modele}, hors du pool des civils`)
      if (c.ombre !== 'civil') out.add(`civil à l'ombre ${c.ombre}`)
    }
  }
  return [...out]
}

describe('50 montages par mission : chaque cible a son visage, aucun sosie parmi les figurants', () => {
  for (const m of MISSIONS) {
    it(`M${m.numero} : ${VISAGES[m.numero].join(', ')}`, () => {
      const vus = montages(m.numero, 50)
      expect(ecarts(m.numero, vus)).toEqual([])
      // L'exclusion n'écarte que les sosies : les autres modèles du pool des civils sortent encore
      const civils = new Set(vus.flatMap(v => v.civils.map(c => c.modele)))
      const restants = m.casting.civils.nombre === 0 ? [] : CIVILS.filter(x => !EXCLUS[m.numero].includes(x))
      expect([...civils].sort(), 'modèles des civils sur 50 montages').toEqual(restants)
    })
  }
})

describe('une mission qui cite un modèle que le jeu n\'a pas ne se monte pas', () => {
  it('M1 avec Markov en gangster_man_09 : erreur qui nomme le modèle', () => {
    const faux = { ...MISSIONS[0], casting: { ...MISSIONS[0].casting, cibles: [{ ...MISSIONS[0].casting.cibles[0], modele: 'gangster_man_09' }] } }
    expect(() => montages(1, 1, { mission: faux })).toThrow(/gangster_man_09/)
  })

  it('M2 avec un civil exclu inconnu : erreur qui le nomme', () => {
    const faux = { ...MISSIONS[1], casting: { ...MISSIONS[1].casting, civils: { nombre: 3, exclure: ['gangster_man_9'] } } }
    expect(() => montages(2, 1, { mission: faux })).toThrow(/gangster_man_9/)
  })
})

// Témoins du câblage : chaque pièce retirée du main.js d'aujourd'hui fait rougir un des tests plus haut.
describe('témoins du câblage de mountLevel', () => {
  const sans = (avant, apres = '') => {
    expect(MAIN_SRC.split(avant), `« ${avant} » absent de main.js, ou plusieurs fois : témoin impossible`).toHaveLength(2)
    return MAIN_SRC.replace(avant, apres)
  }
  const CASTING_CIBLE = 'casting: { model: c.modele, strict: true, teinte: c.teinte ?? 0xffffff, teinteMaillage: c.teinteMaillage },'

  it('les cibles sans casting : Verne et Halder tirés dans le pool des cibles', () => {
    const vus = montages(4, 10, { source: sans(CASTING_CIBLE) })
    expect(ecarts(4, vus).some(e => /^cible 0 : .* au lieu de mafia_woman_02$/.test(e))).toBe(true)
  })

  it('le casting des cibles sans strict : un modèle inconnu retombe en silence sur le pool des cibles', () => {
    const source = sans(CASTING_CIBLE, CASTING_CIBLE.replace(' strict: true,', ''))
    const faux = { ...MISSIONS[0], casting: { ...MISSIONS[0].casting, cibles: [{ ...MISSIONS[0].casting.cibles[0], modele: 'gangster_man_09' }] } }
    expect(() => montages(1, 1, { source, mission: faux })).not.toThrow()
  })

  it('les cibles sans la teinte blanche par défaut : teintes tirées au hasard', () => {
    const source = sans(CASTING_CIBLE, CASTING_CIBLE.replace(' teinte: c.teinte ?? 0xffffff,', ''))
    expect(ecarts(1, montages(1, 10, { source })).some(e => /^cible 0 : teintes /.test(e))).toBe(true)
  })

  it('sans le rôle d\'ombre donné : le commanditaire de M6 à l\'ombre des cibles', () => {
    const source = sans("shadowRole: m.marqueurs ? 'cible' : 'civil',")
    expect(ecarts(6, montages(6, 1, { source }))).toContain('cible 0 : ombre cible au lieu de civil')
  })

  it('les gardes sans le modèle de leur mission : ceux de M4 en mafia_henchman, sosies de Halder', () => {
    const source = sans('casting: gardes.modele ? { model: gardes.modele, strict: true, teinte: gardes.teinte ?? 0xffffff } : null,')
    expect(ecarts(4, montages(4, 3, { source }))).toContain('garde en mafia_henchman au lieu de mafia_boss')
  })

  it('les civils sans les exclusions de leur mission : les frères de M2 ont des sosies', () => {
    const source = sans('casting: castingDesCivils(m),')
    expect(ecarts(2, montages(2, 20, { source }))).toContain('civil en gangster_man_02, sosie écarté')
  })
})

// Le personnage de secours (modèle absent : jamais au départ d'une mission depuis le lot 1, sauf fichier en échec) a
// le sexe de son modèle, donné par la mission : plus de tirage au hasard (avant la tâche, 40 % de femmes pour toute
// cible sans femme). On relève les options que mountLevel passe à NPC.
describe('le personnage de secours de chaque cible a le sexe de son modèle, sans tirage', () => {
  it('Mira, Verne et Rossi en femmes ; les autres en hommes ; aucun tirage pour le sexe', () => {
    const options = []
    class NpcRelevee { constructor(o) { options.push(o); this.mesh = new THREE.Group(); this.alive = true } dispose() {} }
    for (const m of MISSIONS) {
      const s = monteur()
      s.poser({ NPC: NpcRelevee, npcs: [], targets: [], guards: [], civilians: [] })
      const avant = options.length
      const r = vi.spyOn(Math, 'random').mockReturnValue(0.1)   // un tirage sous 0,4 aurait donné une femme
      try { s.fns.mountLevel(m.numero) } finally { r.mockRestore() }
      const cibles = options.slice(avant).filter(o => o.isTarget)
      expect(cibles.map(o => o.female), `M${m.numero}`).toEqual(m.casting.cibles.map(c => /^mafia_woman_/.test(c.modele)))
    }
  })
})

// Les victimes que libère le cadenas de M3 sont des civils de la mission (tirer sur l'une d'elles fait échouer) : les
// sosies que la mission écarte de ses civils le sont aussi d'elles. Sinon, l'une pouvait sortir du conteneur avec le
// visage de Mira (mafia_woman_03), ou le tailleur sombre de mafia_woman_02, pendant que Mira est encore en vie. Le tir
// sur le cadenas de resolveBullet de main.js est exécuté tel quel (avec roleDe), au hasard posé à chaque valeur : le
// pool des civils sans exclusion y donnerait mafia_woman_02 à 0,5 et mafia_woman_03 à 0,7.
//
// Témoin : le main.js d'avant la tâche crée les victimes sans casting ; rejoué plus bas sur le source d'aujourd'hui,
// les victimes sans les exclusions de leur mission prennent ces deux visages.
describe('les victimes libérées par le cadenas de M3 : aucun sosie des cibles', () => {
  const M3 = MISSIONS[2]
  const HASARDS = [0, 0.2, 0.34, 0.5, 0.7, 0.99]

  // Le cadenas touché, au hasard r pour chaque tirage : les modèles des victimes libérées.
  function liberer(r, source = MAIN_SRC) {
    const civilians = []
    const s = executer(['resolveBullet', 'roleDe'], {
      balle: { sillage: {}, tTir: 0, traj: { origine: new THREE.Vector3(0, 10, 30) }, sTir: null },
      stress: 0, score: 0, statHits: 0, lastImpact: null, dernierTirMortel: null, targets: [], convoyCar: null,
      getStats: () => ({ silenced: false }), retargetTrail: () => {}, planShotSounds: () => [], playShotSounds: () => {},
      isHit: () => true, spawnImpact: () => {}, addKillFeed: () => {}, updateHUD: () => {},
      moralLockMesh: { position: new THREE.Vector3(4, 1, -2) }, removeMoralLock: () => {}, upgradeState: {},
      currentMission: M3, currentAnchors: resoudreAncres(M3, CARTES[2].ancres), mapGround: () => 0,
      NPC, npcs: [], civilians, castingDesCivils,
      signaler: () => {},   // l'événement du cadenas (tâche A8), hors de ce que vérifie ce test
    }, source)
    const hasard = vi.spyOn(Math, 'random').mockReturnValue(r)
    try {
      s.fns.resolveBullet({ impact: { kind: 'decor', cadenas: true, point: new THREE.Vector3(4, 1, -2), surface: 'metal' }, t: 0.2 })
    } finally { hasard.mockRestore() }
    const modeles = civilians.map(v => fichier(v.character.cfg.url))
    for (const v of civilians) v.dispose()
    scene.clear()
    return modeles
  }

  it(`${M3.choixMoral.victimes} victimes à chaque hasard, aucune au visage de Mira ni au tailleur de mafia_woman_02`, () => {
    for (const r of HASARDS) {
      const modeles = liberer(r)
      expect(modeles, `hasard ${r}`).toHaveLength(M3.choixMoral.victimes)
      expect(modeles.filter(x => M3.casting.civils.exclure.includes(x)), `hasard ${r}`).toEqual([])
    }
  })

  it('témoin : les victimes sans les exclusions de leur mission prennent les deux visages écartés', () => {
    const avant = MAIN_SRC.replace(/(\n\s*)casting: castingDesCivils\(currentMission\),/, '')
    expect(avant, 'casting des victimes introuvable dans resolveBullet : témoin impossible').not.toBe(MAIN_SRC)
    const vus = new Set(HASARDS.flatMap(r => liberer(r, avant)))
    expect([...vus].filter(x => M3.casting.civils.exclure.includes(x)).sort()).toEqual(['mafia_woman_02', 'mafia_woman_03'])
  })
})
