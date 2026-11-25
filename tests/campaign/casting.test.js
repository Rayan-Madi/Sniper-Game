import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MISSIONS, castingDesCivils } from '../../src/campaign/missions/index.js'
import { MODELS } from '../../src/characters.js'

// Casting de chaque mission (spec du lot 3, §2 d, §3 « Modèle imposé », décisions 5 et 6 ; plan du lot 3a, tâche A6) :
// les données que mountLevel passe à spawnCharacter (tests/campaign/main.casting.test.js les y voit arriver).
// - Chaque cible a son modèle, celui de son portrait (§3) : M1 Markov, gangster_man_01 ; M2 Luc et Marc,
//   gangster_man_02 ; M3 Vosko, gangster_man_01, et Mira, mafia_woman_03 ; M4 Verne, mafia_woman_02, Halder,
//   mafia_henchman, et Rossi, mafia_woman_01 ; M5 Kessler, mafia_boss ; M6 le commanditaire, gangster_man_02
//   (décision 6). Sans teinte du modèle entier : la texture de son portrait. Le polo de Marc est beige (#d9c19a, la
//   couleur de son signe au briefing), sur son seul maillage (Ch01_Shirt) ; celui du commanditaire, sombre (décision 6).
// - Les sosies d'une cible sont écartés des civils de sa mission (civils.exclure) : M1 sans le tailleur bleu de
//   mafia_woman_02 (le costume bleu nuit de Markov) ; M2 sans gangster_man_02 (les frères) ; M3 sans mafia_woman_02 ni
//   mafia_woman_03 (Mira, et un tailleur sombre aux cheveux tirés qui mêle les signes des deux cibles : les civils du
//   port sont des dockers, gangster_man_02) ; M4 sans mafia_woman_02 (Verne).
// - Les gardes de M4 sont en mafia_boss, l'armure sable de sa texture (décision 5) : en mafia_henchman, le modèle des
//   gardes, Halder en aurait quatre sosies. L'escorte de M5 garde le modèle des gardes jusqu'au sous-lot 3d, qui compose
//   le convoi (voir la spec, précisions de la tâche A6).
// - Le personnage de secours (modèle absent) a le sexe du modèle : femme pour mafia_woman_*, sans tirage.
// Règle « aucun modèle partagé », par mission (spec §5, risque 7) : aucun garde ni civil d'une mission ne peut avoir le
// modèle d'une de ses cibles, sauf en M6, où la foule le partage exprès (décision 6 : seul son comportement trahit le
// commanditaire).
//
// Témoin : sur les données d'avant la tâche (commit 201da61), aucune cible n'a de modèle ni d'exclusion : chaque test
// de ce fichier rougit (vus rouges) ; la règle des sosies est rejouée plus bas sur des données qui la violent.

const ROOT = resolve(__dirname, '../..')
const fichier = url => String(url).split('/').pop().replace(/\.glb$/, '')
const variantes = cfg => (cfg.variants ? cfg.variants.map(v => v.url) : [cfg.url])
const POOLS = Object.fromEntries(Object.entries(MODELS).map(([type, cfg]) => [type, variantes(cfg).map(fichier)]))
const DECLARES = Object.values(POOLS).flat()

const VISAGES = {
  1: ['gangster_man_01'],                                     // Markov
  2: ['gangster_man_02', 'gangster_man_02'],                  // Luc, Marc
  3: ['gangster_man_01', 'mafia_woman_03'],                   // Vosko, Mira
  4: ['mafia_woman_02', 'mafia_henchman', 'mafia_woman_01'],  // Verne, Halder, Rossi
  5: ['mafia_boss'],                                          // Kessler
  6: ['gangster_man_02'],                                     // le commanditaire
}
const SOMBRE = 0x3a3f4a
const TEINTES_PAR_MAILLAGE = { 2: [undefined, { Ch01_Shirt: 0xd9c19a }], 6: [{ Ch01_Shirt: SOMBRE }] }
const EXCLUS = { 1: ['mafia_woman_02'], 2: ['gangster_man_02'], 3: ['mafia_woman_02', 'mafia_woman_03'], 4: ['mafia_woman_02'] }
const GARDES = { 4: 'mafia_boss' }

// Modèles cités par une mission (cibles, gardes, exclus), et ceux que le jeu n'a pas (« M4 : mafia_woman_09 »).
const modelesCites = m => [...m.casting.cibles.map(c => c.modele), m.casting.gardes.modele, ...(m.casting.civils.exclure || [])]
  .filter(v => v !== undefined)
const modelesInconnus = m => modelesCites(m).filter(x => !DECLARES.includes(fichier(x))).map(x => `M${m.numero} : ${x}`)

// Maillages cités par teinteMaillage que le GLB du modèle n'a pas (« M2 : gangster_man_02 Ch01_Polo ») ; en-tête JSON
// du GLB : les nœuds qui portent un maillage (GLTFLoader donne leur nom au maillage animé,
// tests/campaign/casting.glb.test.js).
function maillagesAbsents(m) {
  const out = []
  for (const c of m.casting.cibles.filter(x => x.teinteMaillage)) {
    const buf = readFileSync(resolve(ROOT, 'public', 'models', `${c.modele}.glb`))
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'))
    const noms = json.nodes.filter(n => n.mesh !== undefined).map(n => n.name)
    for (const nom of Object.keys(c.teinteMaillage)) if (!noms.includes(nom)) out.push(`M${m.numero} : ${c.modele} ${nom}`)
  }
  return out
}

// Modèles que peuvent avoir les gardes et les civils d'une mission (casting.gardes.modele, sinon le pool des gardes ;
// le pool des civils sans ses exclus).
function modelesDesFigurants(m) {
  const g = m.casting.gardes.nombre > 0 ? (m.casting.gardes.modele ? [m.casting.gardes.modele] : POOLS.guard) : []
  const exclus = (m.casting.civils.exclure || []).map(fichier)
  const n = m.casting.civils.nombre
  const c = (Array.isArray(n) ? n[1] : n) > 0 ? POOLS.civilian.filter(x => !exclus.includes(x)) : []
  return { gardes: g, civils: c }
}

// Sosies : les cibles d'une mission dont le modèle peut sortir pour un de ses gardes ou de ses civils.
function sosies(m) {
  const { gardes, civils } = modelesDesFigurants(m)
  return m.casting.cibles.map(c => c.modele).filter(x => gardes.includes(x) || civils.includes(x))
}

describe('chaque cible a son visage : le modèle de son portrait (spec §3, décision 6)', () => {
  it('M1 Markov ; M2 Luc et Marc ; M3 Vosko et Mira ; M4 Verne, Halder et Rossi ; M5 Kessler ; M6 le commanditaire', () => {
    expect(Object.fromEntries(MISSIONS.map(m => [m.numero, m.casting.cibles.map(c => c.modele)]))).toEqual(VISAGES)
  })

  it('chaque modèle cité par une mission est un modèle du jeu (cibles, gardes, exclus)', () => {
    const cites = MISSIONS.flatMap(modelesCites)
    expect(cites.length, 'modèles cités par les six missions').toBe(16)   // 10 cibles, les gardes de M4, 5 exclus
    expect(MISSIONS.flatMap(modelesInconnus)).toEqual([])
  })

  it("témoin : un modèle que le jeu n'a pas, cité par une cible, des gardes ou des exclus, est relevé", () => {
    const m = MISSIONS[3]
    const faux = { ...m, casting: { cibles: [{ ...m.casting.cibles[0], modele: 'mafia_woman_09' }, ...m.casting.cibles.slice(1)],
      gardes: { ...m.casting.gardes, modele: 'mafia_boss_2' }, civils: { ...m.casting.civils, exclure: ['mafia_woman_02.glb', 'woman_02'] } } }
    expect(modelesInconnus(faux)).toEqual(['M4 : mafia_woman_09', 'M4 : mafia_boss_2', 'M4 : woman_02'])
  })

  it('sans teinte du modèle entier (la texture du portrait) ; le polo beige de Marc et le polo sombre du commanditaire, seuls', () => {
    for (const m of MISSIONS) {
      expect(m.casting.cibles.map(c => c.teinte), `M${m.numero}`).toEqual(m.casting.cibles.map(() => undefined))
      const attendu = TEINTES_PAR_MAILLAGE[m.numero] || m.casting.cibles.map(() => undefined)
      expect(m.casting.cibles.map(c => c.teinteMaillage), `M${m.numero}`).toEqual(attendu)
    }
  })

  it('les maillages cités par teinteMaillage existent dans le vrai modèle', () => {
    expect(MISSIONS.flatMap(m => m.casting.cibles.flatMap(c => Object.keys(c.teinteMaillage || {}))), 'maillages cités')
      .toEqual(['Ch01_Shirt', 'Ch01_Shirt'])   // le polo de Marc, celui du commanditaire
    expect(MISSIONS.flatMap(maillagesAbsents)).toEqual([])
  })

  it("témoin : un maillage que le vrai modèle n'a pas est relevé", () => {
    const m = MISSIONS[1]
    const faux = { ...m, casting: { ...m.casting, cibles: [m.casting.cibles[0], { ...m.casting.cibles[1], teinteMaillage: { Ch01_Polo: 0xd9c19a } }] } }
    expect(maillagesAbsents(faux)).toEqual(['M2 : gangster_man_02 Ch01_Polo'])
  })

  it('le personnage de secours a le sexe du modèle : femme pour mafia_woman_*, homme sinon', () => {
    for (const m of MISSIONS) {
      expect(m.casting.cibles.map(c => c.femme), `M${m.numero}`).toEqual(m.casting.cibles.map(c => /^mafia_woman_/.test(c.modele)))
    }
  })
})

describe('les sosies écartés des gardes et des civils de chaque mission', () => {
  it('civils sans les sosies des cibles : M1, M2, M3 et M4 ; ni M5 (sans civil) ni M6 (la foule partage le visage exprès)', () => {
    expect(Object.fromEntries(MISSIONS.filter(m => m.casting.civils.exclure).map(m => [m.numero, m.casting.civils.exclure])))
      .toEqual(EXCLUS)
  })

  // Les options que mountLevel et le cadenas de M3 passent à chaque civil (tests/campaign/main.casting.test.js).
  it('castingDesCivils : les exclus de la mission en mode strict ; rien sans exclusion (le pool des civils, comme avant)', () => {
    expect(Object.fromEntries(MISSIONS.map(m => [m.numero, castingDesCivils(m)]))).toEqual({
      1: { exclure: EXCLUS[1], strict: true }, 2: { exclure: EXCLUS[2], strict: true }, 3: { exclure: EXCLUS[3], strict: true },
      4: { exclure: EXCLUS[4], strict: true }, 5: null, 6: null,
    })
  })

  it('les gardes de M4 en mafia_boss (décision 5), sans teinte ; ceux des autres missions dans le pool des gardes', () => {
    expect(Object.fromEntries(MISSIONS.filter(m => m.casting.gardes.modele).map(m => [m.numero, m.casting.gardes.modele])))
      .toEqual(GARDES)
    for (const m of MISSIONS) expect(m.casting.gardes.teinte, `M${m.numero}`).toBeUndefined()
  })

  it('aucun garde ni civil d\'une mission n\'a le modèle d\'une de ses cibles, sauf en M6 (décision 6)', () => {
    const out = Object.fromEntries(MISSIONS.map(m => [m.numero, sosies(m)]))
    expect(out).toEqual({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: ['gangster_man_02'] })
  })

  // Témoins de la règle : les sosies que le jeu avait avant la tâche, rejoués sur les données d'aujourd'hui.
  it.each([
    ['M2 sans l\'exclusion des frères', 1, m => ({ ...m.casting, civils: { ...m.casting.civils, exclure: undefined } }), ['gangster_man_02', 'gangster_man_02']],
    ['M4 aux gardes du pool (Halder cloné en garde)', 3, m => ({ ...m.casting, gardes: { nombre: 4 } }), ['mafia_henchman']],
    ['M4 sans l\'exclusion de Verne', 3, m => ({ ...m.casting, civils: { ...m.casting.civils, exclure: undefined } }), ['mafia_woman_02']],
    ['M3 qui n\'exclut que mafia_woman_02', 2, m => ({ ...m.casting, civils: { ...m.casting.civils, exclure: ['mafia_woman_02'] } }), ['mafia_woman_03']],
  ])('témoin : %s : relevé', (_, i, casting, attendu) => {
    expect(sosies({ ...MISSIONS[i], casting: casting(MISSIONS[i]) })).toEqual(attendu)
  })
})
