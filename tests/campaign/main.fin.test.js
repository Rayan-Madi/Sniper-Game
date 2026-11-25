import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { MAIN_SRC, analyse, callsIn } from '../gfx/mainSource.js'
import { MISSIONS } from '../../src/campaign/missions/index.js'
import { dureeDeLigne } from '../../src/campaign/radio.js'
import { harnais } from './reglesHarnais.js'

// La fin de mission paramétrable, dans le jeu (spec du lot 3, §2 c et g ; plan du lot 3a, tâche A8 ; contrat avec le
// lot 4 : « la fin paramétrable passe par une seule fonction lancerFin(dernierTirMortel) (immédiate, ou à l'échéance du
// calme en M3) ; le retrait des corps est suspendu dès la première mort »). killTarget, checkWin, lancerFin,
// startKillcam, avancerRegles et killCivilian de main.js sont exécutés tels quels (tests/campaign/reglesHarnais.js), sur
// de vrais PNJ (procéduraux), menés image par image dans l'ordre de la boucle, minuteurs du jeu compris (faux minuteurs
// avancés avec les images) :
// - fin immédiate (M1, comme les six missions d'aujourd'hui) : le ralenti à la mort de la dernière cible, la réussite
//   1,5 s plus tard (non-régression) ;
// - fin différée (une copie de M3 avec les 12 s de calme que le sous-lot 3c lui donnera, et sa ligne d'Anton au calme) :
//   à la mort de Mira, pas de ralenti ; la mission reste en jeu 12 s, Anton parle, les corps restent ; puis le ralenti et
//   la réussite ; tantQue 'cadenas' : le cadenas tiré, la fin vient tout de suite ;
// - l'échéance du calme tombée juste après un civil abattu : pas de ralenti, l'échec arrive (canFinish) ;
// - les fenêtres de tir s'arrêtent à la fin.
//
// Témoin : le main.js d'avant la tâche (commit 23cc56e) lance le ralenti à la mort de Mira, ne dit rien, et le corps de
// Vosko part au bout de 8 s (vus rouges) ; la fin immédiate y est verte. Les autres témoins sont des mutations du
// main.js d'aujourd'hui (journal de la tâche).

vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})
let NPC, STATES, scene
beforeEach(async () => {
  vi.useFakeTimers()
  ;({ NPC, STATES } = await import('../../src/npc.js'))
  ;({ scene } = await import('../../src/scene.js'))
})
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

const CALME = 'Eux deux, c\'est fait. Le cadenas... c\'est toi qui vois.'
const M3_CALME = { ...MISSIONS[2], fin: { calmeS: 12 }, radio: [{ evenement: 'calme', texte: CALME }] }

function camera() {
  const c = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
  c.position.set(0, 12, 20)
  c.lookAt(0, 0, 0)
  c.updateMatrixWorld()
  return c
}

const pnj = (m, x, z, o = {}) => {
  const n = new NPC({ color: 0xcc4422, x, z, allure: m.allure, bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, ...o })
  n.lockState = STATES.IDLE; n.state = STATES.IDLE
  return n
}

// La mission m, ses cibles (et un civil) ; tuer(cible, derniere) : la balle mortelle arrive (resolveBullet pose le
// dernier tir mortel, puis killTarget) ; mener(s) : les images de la boucle, minuteurs du jeu avancés avec elles.
function jeu(m, { source = MAIN_SRC, fenetres } = {}) {
  const cibles = m.casting.cibles.map((c, i) => Object.assign(pnj(m, -1 + 1.3 * i, 0, { isTarget: true }), { cibleId: i }))
  const civil = pnj(m, 6, 4, { isCivilian: true })
  const mission = fenetres ? { ...m, fenetres } : m
  const h = harnais({ mission, lieux: { sorties: {}, abris: {} }, cibles, autres: [civil], camera: camera(), source, silencieux: true })
  document.body.append(h.killFeed)
  const tuer = (cible, derniere) => {
    h.s.poser({ dernierTirMortel: { cible, cibleId: cible.cibleId, derniere, fin: m.fin.calmeS > 0 ? 'differee' : 'immediate' } })
    h.s.fns.killTarget(cible)
  }
  const mener = (secondes, voir = () => {}) => {
    for (let i = 0; i < Math.round(secondes * 60); i++) { h.image(); vi.advanceTimersByTime(1000 / 60); voir(h.s.etat()) }
  }
  return { h, cibles, civil, tuer, mener }
}

describe('fin immédiate (M1, les six missions d\'aujourd\'hui) : non-régression', () => {
  it('Markov abattu : le ralenti tout de suite, la réussite 1,5 s plus tard', () => {
    const { h, cibles, tuer, mener } = jeu(MISSIONS[0])
    tuer(cibles[0], true)
    expect(h.s.etat()).toMatchObject({ killcamActive: true, timeScale: 0.18 })
    mener(1.4)
    expect(h.journal.reussites).toBe(0)
    mener(0.2)
    expect(h.journal.reussites).toBe(1)
  })
})

describe('fin différée (copie de M3 à 12 s de calme)', () => {
  it('Vosko à 0 s, Mira à 1,5 s : pas de ralenti à sa mort ; 12 s de calme en jeu, puis le ralenti et la réussite', () => {
    const { h, cibles, tuer, mener } = jeu(M3_CALME)
    tuer(cibles[0], false)
    mener(1.5)
    tuer(cibles[1], true)
    expect(h.s.etat(), 'à la mort de Mira').toMatchObject({ killcamActive: false, timeScale: 1, gamePhase: 'playing' })
    const debut = h.s.etat().missionClock
    let ralenti = null
    mener(14, e => { if (ralenti === null && e.killcamActive) ralenti = e.missionClock - debut })
    expect(ralenti, 'le ralenti, 12 s après la mort de Mira').toBeGreaterThanOrEqual(12 - 1e-9)
    expect(ralenti).toBeLessThan(12 + 1 / 60 + 1e-9)
    expect(h.journal.reussites).toBe(1)
  })

  it('au début du calme, Anton parle : sa ligne dans le fil, sous son nom, et ses bips le temps de la ligne', () => {
    const { h, cibles, tuer, mener } = jeu(M3_CALME)
    tuer(cibles[0], false)
    mener(1.5)
    tuer(cibles[1], true)
    mener(0.1)
    expect(h.journal.radio).toEqual([dureeDeLigne(CALME)])
    const ligne = h.killFeed.querySelector('.kill-entry.radio')
    expect(ligne?.textContent).toBe(`ANTON${CALME}`)
    expect(ligne.querySelector('.radio-qui').textContent).toBe('ANTON')
  })

  it('les corps restent dès la première mort : celui de Vosko encore là à la fin du calme (13,5 s)', () => {
    const { h, cibles, tuer, mener } = jeu(M3_CALME)
    tuer(cibles[0], false)
    mener(1.5)
    tuer(cibles[1], true)
    mener(12.1)
    expect(h.s.etat().killcamActive).toBe(true)
    for (const c of cibles) {
      expect(c.disposed, `cible ${c.cibleId}`).toBeFalsy()
      expect(scene.children).toContain(c.mesh)
    }
  })

  it('tantQue \'cadenas\' : le cadenas tiré pendant le calme, la fin vient tout de suite', () => {
    const { h, cibles, tuer, mener } = jeu({ ...M3_CALME, fin: { calmeS: 12, tantQue: 'cadenas' } })
    h.s.poser({ moralLockMesh: {} })
    tuer(cibles[0], false)
    tuer(cibles[1], true)
    mener(4)
    expect(h.s.etat().killcamActive).toBe(false)
    h.s.poser({ moralLockMesh: null })   // removeMoralLock, au tir sur le cadenas
    mener(1 / 60)
    expect(h.s.etat().killcamActive).toBe(true)
  })

  it('l\'échéance du calme 0,2 s après un civil abattu : pas de ralenti, l\'échec arrive', () => {
    const { h, cibles, civil, tuer, mener } = jeu(M3_CALME)
    tuer(cibles[0], false)
    tuer(cibles[1], true)
    mener(11.8)
    h.s.fns.killCivilian(civil)
    mener(1)
    expect(h.s.etat().killcamActive).toBe(false)
    expect(h.journal.echecs).toEqual(['Vous avez éliminé un civil innocent'])
    expect(h.journal.reussites).toBe(0)
  })
})

// Pendant le ralenti d'une fin immédiate, canFail refuse déjà l'échec ; pendant le calme d'une fin différée, la mission
// est en jeu et l'accepterait : l'échéance d'une fenêtre y ferait échouer une mission déjà gagnée.
describe('les fenêtres de tir s\'arrêtent à la fin', () => {
  it('fin différée : une fenêtre de 3 s ouverte au premier tir, les deux cibles abattues à 1 s ; pendant le calme, plus d\'échec', () => {
    const { h, cibles, tuer, mener } = jeu(M3_CALME, { fenetres: [{ nom: 'f', depart: 'premier-tir', dureeS: 3, echeance: { echec: 'Trop tard.' } }] })
    h.s.poser({ statShots: 1 })
    h.s.fns.coupEntendu({ silenced: true })
    mener(1)
    tuer(cibles[0], false)
    tuer(cibles[1], true)
    mener(14)
    expect(h.journal.echecs).toEqual([])
    expect(h.journal.reussites).toBe(1)
  })
})

describe('câblage (contrat avec le lot 4) : lancerFin, la seule porte de la fin', () => {
  const a = analyse(MAIN_SRC)
  it('checkWin passe le dernier tir mortel à lancerFin ; startKillcam n\'est appelé que par lancerFin et avancerRegles', () => {
    expect(MAIN_SRC.slice(a.fns.get('checkWin').start, a.fns.get('checkWin').end)).toMatch(/lancerFin\(dernierTirMortel\)/)
    const appelants = [...a.fns.keys()].filter(f => (callsIn(a, f) || []).some(c => c.callee === 'startKillcam'))
    expect(appelants.sort()).toEqual(['avancerRegles', 'lancerFin'])
  })
})
