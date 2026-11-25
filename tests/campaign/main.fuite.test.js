import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { MAIN_SRC, analyse, executer } from '../gfx/mainSource.js'
import { MISSIONS } from '../../src/campaign/missions/index.js'
import { creerFuite, fuiteParSorties, MESSAGES_DE_FUITE } from '../../src/campaign/escape.js'
import { solidHit } from '../../src/shot/occlusion.js'
import { FUITE, OCCLUSION } from '../../src/shot/tuning.js'

// La fuite des cibles dans le jeu (spec du lot 3, §2 f et tests 3a : « Une cible qui atteint une sortie provoque
// l'échec ; sans sortie déclarée, le cône s'applique comme avant » ; plan du lot 3a, tâche A8). checkFledTargets,
// isInCameraFOV, enVueDuTireur, ligneDeVue et fleeNearby de main.js sont exécutés tels quels (executer,
// tests/gfx/mainSource.js), avec le vrai module de la fuite (src/campaign/escape.js) et le vrai rayon contre le décor
// (solidHit) :
// - une mission à sorties (une copie de M2 avec la ruelle que le sous-lot 3b lui donnera) échoue quand une cible en fuite
//   atteint la sortie, au texte de la sortie ; le cône n'y compte plus ; en option, la perte de vue ;
// - sans sortie ni abri (les six missions d'aujourd'hui), le cône d'avant : non-régression ;
// - dans une mission à sorties, les cibles ne fuient plus autour d'un impact (fleeNearby) : leur fuite passe par leur
//   réaction (tests/campaign/main.reaction.test.js), vers une issue ; les civils fuient comme avant.
//
// Témoin : le main.js d'avant la tâche (commit 23cc56e), où seules ses fonctions d'alors sont exécutées
// (executerPresentes) : la sortie atteinte ne fait rien échouer, la cible hors du cône échoue malgré la sortie, la
// perte de vue ne compte pas, et la cible fuit autour de l'impact (7 rouges) ; le cône sans sortie y est vert.

// Les fonctions de `noms` que `source` déclare, exécutées telles quelles : le même test se joue sur un main.js d'avant
// la tâche, qui n'a pas les fonctions neuves. La garde « câblage » plus bas vérifie que le main.js d'aujourd'hui les a
// toutes.
const NOMS = ['checkFledTargets', 'isInCameraFOV', 'enVueDuTireur', 'ligneDeVue', 'fleeNearby']
function executerPresentes(portee, source) {
  const a = analyse(source)
  return executer(NOMS.filter(n => a.fns.has(n)), portee, source)
}

const AVEC_SORTIE = { ...MISSIONS[1], sorties: ['ruelle'], abris: [], reaction: { stupeurS: 0.4, rayonChuteM: 15 }, perteDeVueS: null }
const LIEUX = { sorties: { ruelle: { x: -10, z: -22 } }, abris: { igloo: { x: 8, z: -30 } } }

// Une cible (ou un civil) réduite à ce que lisent ces fonctions.
const pnj = (x, z, o = {}) => ({
  alive: true, isTarget: true, isCivilian: false, onVehicle: false, state: 'flee', mesh: { position: new THREE.Vector3(x, 0, z) },
  fuites: [], flee(depuis) { this.fuites.push(depuis.clone()); this.state = 'flee' }, ...o,
})

// Un mur solide de 40 × 20 m, à z (sa face avant tournée vers la caméra).
function mur(z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 0.5), new THREE.MeshLambertMaterial())
  m.position.set(0, 5, z)
  m.userData.solid = true; m.userData.surface = 'pierre'
  m.updateMatrixWorld(true)
  return m
}

// La mission m en jeu, sur LIEUX : la caméra à l'œil (0, 10, 0), le regard vers -Z ; `cibles` et `autres` PNJ ; le
// décor solide `objets`. → { s (les fonctions), echecs (textes de triggerGameOver), fuites (appels de
// triggerFleeGameOver) }.
function jeu(m, cibles, { autres = [], objets = [], source = MAIN_SRC } = {}) {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
  camera.position.set(0, 10, 0)
  camera.updateMatrixWorld()
  const journal = { echecs: [], fuites: 0 }
  const s = executerPresentes({
    THREE, camera, FUITE, OCCLUSION, solidHit, missionSolids: () => objets,
    targets: cibles, npcs: [...cibles, ...autres], currentMission: m, fuiteParSorties,
    fuite: creerFuite(m, LIEUX),
    triggerGameOver: raison => journal.echecs.push(raison), triggerFleeGameOver: () => journal.fuites++,
  }, source)
  // Une image : la boucle appelle checkFledTargets(dt) (checkFledTargets() avant la tâche)
  const image = (dt = 1 / 60) => s.fns.checkFledTargets(dt)
  return { s, journal, image }
}

describe('une mission à sorties : la sortie atteinte fait échouer, le cône ne compte plus', () => {
  it('la cible en fuite à la ruelle (dans le champ de la caméra) : échec, au texte des sorties', () => {
    const { journal, image } = jeu(AVEC_SORTIE, [pnj(-10.2, -22.1)])
    image()
    expect(journal).toEqual({ echecs: [MESSAGES_DE_FUITE.sortie], fuites: 0 })
  })

  it('le texte que la mission donne à cette sortie (fuiteMessages)', () => {
    const { journal, image } = jeu({ ...AVEC_SORTIE, fuiteMessages: { ruelle: 'Luc a filé par la ruelle.' } }, [pnj(-10, -22)])
    image()
    expect(journal.echecs).toEqual(['Luc a filé par la ruelle.'])
  })

  it('un abri atteint : échec, au texte des abris (décision 4)', () => {
    const { journal, image } = jeu({ ...AVEC_SORTIE, sorties: [], abris: ['igloo'] }, [pnj(8.3, -30)])
    image()
    expect(journal).toEqual({ echecs: [MESSAGES_DE_FUITE.abri], fuites: 0 })
  })

  it('en fuite derrière la caméra, à 30 m, loin de la ruelle : rien (le cône échouerait)', () => {
    const { journal, image } = jeu(AVEC_SORTIE, [pnj(0, 30)])
    for (let i = 0; i < 60; i++) image()
    expect(journal).toEqual({ echecs: [], fuites: 0 })
  })

  it('perte de vue (perteDeVueS 1) : en fuite derrière un mur plus d\'une seconde, échec ; en vue, rien', () => {
    const m = { ...AVEC_SORTIE, perteDeVueS: 1 }
    const cachee = jeu(m, [pnj(5, -25)], { objets: [mur(-15)] })
    for (let i = 0; i < 59; i++) cachee.image()
    expect(cachee.journal.fuites, 'caché 59 images : pas encore').toBe(0)
    for (let i = 0; i < 3 && !cachee.journal.fuites; i++) cachee.image()
    expect(cachee.journal).toEqual({ echecs: [], fuites: 1 })
    const vue = jeu(m, [pnj(5, -25)], { objets: [mur(-40)] })
    for (let i = 0; i < 120; i++) vue.image()
    expect(vue.journal).toEqual({ echecs: [], fuites: 0 })
  })
})

describe('sans sortie ni abri : le cône d\'avant la tâche (non-régression)', () => {
  const M1 = MISSIONS[0]
  it('en fuite hors du cône de 80°, à plus de 12 m : « Une cible a fui votre champ de vision »', () => {
    const { journal, image } = jeu(M1, [pnj(0, 30)])
    image()
    expect(journal).toEqual({ echecs: [], fuites: 1 })
  })

  it('dans le cône, hors du cône à moins de 12 m de la caméra, ou hors du cône sans fuir : rien', () => {
    for (const c of [pnj(3, -30), pnj(0, 5), pnj(0, 30, { state: 'walk' }), pnj(0, 30, { onVehicle: true }), pnj(0, 30, { alive: false })]) {
      const { journal, image } = jeu(M1, [c])
      image()
      expect(journal, `${c.mesh.position.toArray()} ${c.state}`).toEqual({ echecs: [], fuites: 0 })
    }
  })
})

describe('autour d\'un impact (fleeNearby) : dans une mission à sorties, les cibles ne fuient pas', () => {
  it('copie de M2 à sorties : le civil fuit, la cible non ; un fuyard compté', () => {
    const cible = pnj(1, 0, { state: 'walk' }), civil = pnj(-1, 0, { state: 'walk', isTarget: false, isCivilian: true })
    const { s } = jeu(AVEC_SORTIE, [cible], { autres: [civil] })
    expect(s.fns.fleeNearby(new THREE.Vector3(0, 0, 0), 20)).toBe(1)
    expect(cible.fuites).toHaveLength(0)
    expect(civil.fuites).toHaveLength(1)
  })

  it('M2 d\'aujourd\'hui, sans sortie : la cible fuit aussi, comme avant', () => {
    const cible = pnj(1, 0, { state: 'walk' }), civil = pnj(-1, 0, { state: 'walk', isTarget: false, isCivilian: true })
    const { s } = jeu(MISSIONS[1], [cible], { autres: [civil] })
    expect(s.fns.fleeNearby(new THREE.Vector3(0, 0, 0), 20)).toBe(2)
    expect(cible.fuites).toHaveLength(1)
  })
})

describe('câblage', () => {
  const a = analyse(MAIN_SRC)
  it('main.js a chacune des fonctions exécutées ici', () => {
    expect(NOMS.filter(n => !a.fns.has(n))).toEqual([])
  })

  it('la boucle passe dt à checkFledTargets ; le cône lit FUITE (tuning.js)', () => {
    const loop = MAIN_SRC.slice(a.fns.get('loop').start, a.fns.get('loop').end)
    expect(loop).toMatch(/checkFledTargets\(dt\)/)
    const cone = MAIN_SRC.slice(a.fns.get('isInCameraFOV').start, a.fns.get('isInCameraFOV').end)
    expect(cone).toMatch(/FUITE\.coneDeg/)
  })
})
