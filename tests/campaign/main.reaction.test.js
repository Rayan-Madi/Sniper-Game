import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { MAIN_SRC, analyse } from '../gfx/mainSource.js'
import { MISSIONS } from '../../src/campaign/missions/index.js'
import { MESSAGES_DE_FUITE } from '../../src/campaign/escape.js'
import { SON } from '../../src/shot/tuning.js'
import { harnais, NOMS_REGLES } from './reglesHarnais.js'

// La réaction des cibles et leur fuite vers une sortie, dans le jeu (spec du lot 3, §2 f, approche B, décision 4 et
// tests 3a : « Une cible qui atteint une sortie provoque l'échec » ; plan du lot 3a, tâche A8). Les fonctions de main.js
// qui les mènent (killTarget, coupEntendu, avancerRegles, checkFledTargets…) sont exécutées telles quelles
// (tests/campaign/reglesHarnais.js), sur de vrais PNJ (procéduraux, sur un sol nu) menés image par image dans l'ordre
// de la boucle :
// - une copie de M2 avec la ruelle que le sous-lot 3b lui donnera (sortie à (-10 ; -22), 0,4 s de stupeur, chute vue
//   jusqu'à 15 m) : Marc abattu à côté de Luc, Luc voit sa chute, se fige 0,4 s, puis court vers la ruelle ; il
//   l'atteint 0,4 + (8,38 - 0,5) / 4,8 = 2,04 s après le coup : échec, au texte des sorties ;
// - un tir manqué, sans silencieux : les frères réagissent au son du départ (45 m : 0,13 s), puis fuient ; au silencieux,
//   rien à entendre ;
// - M2 telle qu'aujourd'hui (sans sortie) : la fuite immédiate autour de l'impact, comme avant (non-régression).
//
// Témoin : le main.js d'avant la tâche (commit 23cc56e) : Luc fuit dès le coup, à l'opposé de Marc, et la mission
// échoue par le cône quand il quitte le champ (« Une cible a fui votre champ de vision »), jamais à la ruelle (vu
// rouge) ; la non-régression y est verte. Le son du départ et le câblage de shoot n'y existent pas : leurs témoins sont
// des mutations du main.js d'aujourd'hui, plus bas et dans le journal de la tâche.

vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})
let NPC, STATES
beforeEach(async () => {
  vi.useFakeTimers()
  ;({ NPC, STATES } = await import('../../src/npc.js'))
  return () => vi.useRealTimers()
})

const M2 = MISSIONS[1]
const RUELLE = M2_SORTIE()
function M2_SORTIE() {
  return { ...MISSIONS[1], sorties: ['ruelle'], abris: [], reaction: { stupeurS: 0.4, rayonChuteM: 15 }, perteDeVueS: null }
}
const LIEUX = { sorties: { ruelle: { x: -10, z: -22 } }, abris: {} }

// La caméra au poste de M2 (le toit nord), le regard sur la place.
function cameraM2() {
  const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
  c.position.set(0, 19.35, 22.15)
  c.lookAt(0, 0, -19.5)
  c.updateMatrixWorld()
  return c
}

// Luc et Marc, à 1,2 m l'un de l'autre au milieu de l'encaissement (plan de 3b), immobiles jusqu'au coup.
function freres(m) {
  const opts = { isTarget: true, color: 0xcc4422, allure: m.allure, bounds: { minX: -30, maxX: 30, minZ: -40, maxZ: 10 } }
  const luc = new NPC({ ...opts, x: -2, z: -19.5 }), marc = new NPC({ ...opts, x: -3.2, z: -19.5 })
  luc.cibleId = 0; marc.cibleId = 1
  for (const n of [luc, marc]) { n.lockState = STATES.IDLE; n.state = STATES.IDLE }
  return { luc, marc }
}

// Les images jusqu'à `finS` secondes (ou l'échec) ; à chaque image, `voir(t)`.
function mener(h, finS, voir = () => {}) {
  for (let i = 0; i < finS * 60 && h.s.etat().gamePhase === 'playing'; i++) { h.image(); voir(h.s.etat().missionClock) }
}

describe('copie de M2 avec la ruelle : Marc abattu, Luc voit sa chute, se fige, court, et la mission échoue à la ruelle', () => {
  function scene(source = MAIN_SRC) {
    const { luc, marc } = freres(RUELLE)
    const h = harnais({ mission: RUELLE, lieux: LIEUX, cibles: [luc, marc], camera: cameraM2(), source, silencieux: true })
    h.s.fns.killTarget(marc)
    return { h, luc }
  }

  it('Luc figé (stupeur) jusqu\'à 0,4 s, tourné vers Marc, puis en fuite vers la ruelle', () => {
    const { h, luc } = scene()
    const etats = {}
    let cap = null
    mener(h, 1, t => {
      for (const k of [0.2, 0.38, 0.45]) if (t >= k && !etats[k]) etats[k] = luc.state
      if (t >= 0.2 && cap === null) cap = luc.mesh.rotation.y
    })
    expect(etats).toEqual({ 0.2: STATES.REACT, 0.38: STATES.REACT, 0.45: STATES.FLEE })
    expect(cap, 'tourné vers Marc, à -X').toBeCloseTo(-Math.PI / 2, 6)
    const vers = new THREE.Vector3(-10 - luc.mesh.position.x, 0, -22 - luc.mesh.position.z).normalize()
    expect(luc.fleeDir.dot(vers)).toBeGreaterThan(0.999)
  })

  it('il atteint la ruelle 2,04 s après le coup : échec, au texte des sorties ; jamais par le cône', () => {
    const { h } = scene()
    mener(h, 10)
    expect(h.journal.echecs).toEqual([MESSAGES_DE_FUITE.sortie])
    expect(h.journal.fuitesCone).toBe(0)
    expect(h.s.etat().missionClock).toBeCloseTo(0.4 + (Math.hypot(8, 2.5) - 0.5) / 4.8, 1)
  })
})

describe('le son du départ : un tir manqué fait réagir les cibles d\'une mission à sorties', () => {
  it('sans silencieux : les frères, à 45 m, figés au son (0,13 s), puis en fuite (0,53 s)', () => {
    const { luc, marc } = freres(RUELLE)
    const h = harnais({ mission: RUELLE, lieux: LIEUX, cibles: [luc, marc], camera: cameraM2() })
    h.s.poser({ statShots: 1 })
    h.s.fns.coupEntendu({ silenced: false })
    const son = luc.mesh.position.clone().setY(0).distanceTo(cameraM2().position) / SON.vitesse
    const etats = []
    mener(h, 1, t => etats.push([t, luc.state]))
    const premier = e => etats.find(([, s]) => s === e)?.[0]
    expect(premier(STATES.REACT)).toBeGreaterThanOrEqual(son - 1e-9)
    expect(premier(STATES.REACT)).toBeLessThan(son + 1 / 60)
    expect(premier(STATES.FLEE)).toBeGreaterThanOrEqual(son + 0.4 - 1e-9)
    expect(premier(STATES.FLEE)).toBeLessThan(son + 0.4 + 1 / 60)
    expect(marc.state).toBe(STATES.FLEE)
  })

  it('au silencieux : rien à entendre, personne ne bouge', () => {
    const { luc, marc } = freres(RUELLE)
    const h = harnais({ mission: RUELLE, lieux: LIEUX, cibles: [luc, marc], camera: cameraM2(), silencieux: true })
    h.s.poser({ statShots: 1 })
    h.s.fns.coupEntendu({ silenced: true })
    mener(h, 3)
    expect([luc.state, marc.state]).toEqual([STATES.IDLE, STATES.IDLE])
  })

  it('une mission sans sortie (M2 d\'aujourd\'hui) : le son ne fait réagir personne, comme avant', () => {
    const { luc, marc } = freres(M2)
    const h = harnais({ mission: M2, lieux: { sorties: {}, abris: {} }, cibles: [luc, marc], camera: cameraM2() })
    h.s.poser({ statShots: 1 })
    h.s.fns.coupEntendu({ silenced: false })
    mener(h, 3)
    expect([luc.state, marc.state]).toEqual([STATES.IDLE, STATES.IDLE])
  })
})

// L'impact ne fige pas les cibles d'une mission à sorties (relecture de A8) : au plus tôt du son du départ et de la chute
// vue d'un collègue (l'instant brut), la cible se fige, jamais à l'arrivée de la balle (reactNearby, dans killTarget et
// dans resolveBullet sur un tir manqué). Les civils et les gardes gardent la réaction d'avant autour de l'impact.
// Témoin : le main.js de la tâche A8 (f60fb99), où reactNearby fige toute cible à 28 ou 30 m de l'impact (vu rouge).
describe('l\'impact ne fige pas les cibles d\'une mission à sorties : seule leur réaction les fige', () => {
  // Un mur entre les frères, de 3 m de haut : de ses yeux, Luc ne voit pas le torse de Marc.
  function murEntreLesFreres() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 4), new THREE.MeshLambertMaterial())
    m.position.set(-2.6, 1.5, -19.5)
    m.userData.solid = true; m.userData.surface = 'pierre'
    m.updateMatrixWorld(true)
    return m
  }
  // Un civil à 24,2 m de Marc : hors de la fuite autour de l'impact (18 m), dans la réaction (30 m).
  function civil() {
    const c = new NPC({ isCivilian: true, color: 0x888888, allure: RUELLE.allure, x: 21, z: -19.5, bounds: { minX: -30, maxX: 30, minZ: -40, maxZ: 10 } })
    c.lockState = STATES.IDLE; c.state = STATES.IDLE
    return c
  }

  it('au silencieux, Marc abattu derrière un mur : Luc ne voit rien, n\'entend rien, et reste immobile ; le civil réagit, comme avant', () => {
    const { luc, marc } = freres(RUELLE)
    const passant = civil()
    const h = harnais({ mission: RUELLE, lieux: LIEUX, cibles: [luc, marc], autres: [passant], camera: cameraM2(),
      objets: [murEntreLesFreres()], silencieux: true })
    h.s.fns.killTarget(marc)
    expect(luc.state).toBe(STATES.IDLE)
    expect(passant.state).toBe(STATES.REACT)
    const etats = new Set()
    mener(h, 3, () => etats.add(luc.state))
    expect([...etats]).toEqual([STATES.IDLE])
    expect(h.journal.echecs).toEqual([])
  })

  it('un tir manqué sans silencieux, la balle (0,06 s) avant le son (0,13 s) : Luc se fige au son, pas à l\'impact', () => {
    const { luc, marc } = freres(RUELLE)
    const h = harnais({ mission: RUELLE, lieux: LIEUX, cibles: [luc, marc], camera: cameraM2() })
    h.s.poser({ statShots: 1 })
    h.s.fns.coupEntendu({ silenced: false })
    const son = luc.mesh.position.clone().setY(0).distanceTo(cameraM2().position) / SON.vitesse
    for (let i = 0; i < 4; i++) h.image()
    expect(h.s.etat().missionClock).toBeLessThan(son)
    // L'impact dans le décor, à 60 cm de Luc, comme resolveBullet le traite sans silencieux
    const impact = new THREE.Vector3(-2.5, 0, -19.2)
    h.s.fns.fleeNearby(impact, 20)
    h.s.fns.reactNearby(impact, 28)
    expect([luc.state, marc.state]).toEqual([STATES.IDLE, STATES.IDLE])
    const etats = []
    mener(h, 1, t => etats.push([t, luc.state]))
    const premier = etats.find(([, s]) => s === STATES.REACT)?.[0]
    expect(premier).toBeGreaterThanOrEqual(son - 1e-9)
    expect(premier).toBeLessThan(son + 1 / 60)
  })
})

describe('non-régression : M2 d\'aujourd\'hui, sans sortie', () => {
  it('Marc abattu : Luc fuit dès le coup, à l\'opposé de Marc, et la mission échoue par le cône', () => {
    const { luc, marc } = freres(M2)
    const h = harnais({ mission: M2, lieux: { sorties: {}, abris: {} }, cibles: [luc, marc], camera: cameraM2(), silencieux: true })
    h.s.fns.killTarget(marc)
    expect(luc.state).toBe(STATES.FLEE)
    expect(luc.fleeDir.x).toBeGreaterThan(0.99)
    mener(h, 20)
    expect(h.journal.fuitesCone).toBe(1)
  })
})

describe('câblage', () => {
  const a = analyse(MAIN_SRC)
  const texte = n => MAIN_SRC.slice(a.fns.get(n).start, a.fns.get(n).end)
  it('main.js a chacune des fonctions des règles', () => {
    expect(NOMS_REGLES.filter(n => !a.fns.has(n))).toEqual([])
  })
  it('le coup de feu s\'entend : shoot appelle coupEntendu(stats), après le compte des tirs', () => {
    const t = texte('shoot')
    expect(t).toMatch(/statShots\+\+[\s\S]*coupEntendu\(stats\)/)
  })
  it('une mort (cible, civil, garde) passe par surUneMort', () => {
    for (const f of ['killTarget', 'killCivilian']) expect(texte(f), f).toMatch(/npc\.die\(\)\s*\n\s*surUneMort\(npc\)/)
    expect(texte('hitGuard')).toMatch(/npc\.die\(\);?\s*surUneMort\(npc\)/)
  })
})
