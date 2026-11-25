import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { MAIN_SRC, executer } from '../gfx/mainSource.js'
import { MISSIONS, missionFor } from '../../src/campaign/missions/index.js'
import { afficherFiche, barrerCible } from '../../src/campaign/fiche.js'

// La fiche des cibles dans le jeu (spec du lot 3, §2 e et tests 3a : « Fiche : nombre d'entrées = cibles nommées » ;
// plan du lot 3a, tâche A7). startLevel et killTarget de main.js sont exécutés tels quels (executer,
// tests/gfx/mainSource.js), sur le vrai HUD d'index.html, avec le vrai module de la fiche et les vraies missions ; le
// reste du jeu (montage, son, horloge) est fait de doublures :
// - au départ de chaque mission, #target-dossier s'affiche, titré « DOSSIER 0n », une entrée par cible de la mission ;
// - à la mort d'une cible, l'entrée de son cibleId est barrée, et elle seule ; d'un coup (sans le trait animé) en
//   effets atténués ;
// - la mission relancée, ou la suivante, repart d'une fiche vierge.
//
// Témoin : sur le main.js d'avant la tâche (commit fcb5151), la fiche reste cachée de M1 à M5 et n'a qu'un texte en
// M6, et rien n'est barré à la mort d'une cible (vus rouges). Plus bas, chaque pièce du câblage retirée du main.js
// d'aujourd'hui fait rougir.

const ROOT = resolve(__dirname, '../..')

// Le HUD du jeu, tel qu'index.html le déclare.
function poserHud() {
  const page = new DOMParser().parseFromString(readFileSync(resolve(ROOT, 'index.html'), 'utf8'), 'text/html')
  document.body.replaceChildren(document.importNode(page.getElementById('game-hud'), true))
  return document.getElementById('target-dossier')
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren() })

// startLevel et killTarget dans une portée faite de doublures ; reduit : le réglage des effets atténués.
function jeu(source = MAIN_SRC, { reduit = false } = {}) {
  const dossierEl = poserHud()
  const s = executer(['startLevel', 'killTarget'], {
    // départ de la mission
    clearEntities: () => {}, mountLevel: () => {}, missionFor, missionToken: 1, upgradeState: { totalScore: 0 },
    currentMission: null, currentMapInfo: {}, moralLockMesh: null, gamePhase: 'menu', MAX_LEVEL: 6,
    breathMeter: 1, isHolding: false, holdBreathKey: false, statShots: 0, statHits: 0, statStart: 0, statAlerts: 0,
    timeScale: 1, killcamActive: false, failPending: false, lastTargetKillAt: -99999,
    stress: 0, alertActive: false, alertTimer: 0, balle: null, lastImpact: null, dernierTirMortel: null,
    telemetre: { reset() {} }, distanceVisee: null, missionClock: 0, bolt: { reset() {} }, score: 0,
    hudEl: document.getElementById('game-hud'), hudLevel: document.getElementById('hud-level'),
    alertBanner: document.getElementById('alert-banner'), instruction: { style: {} },
    startMissionAmbience: () => {}, updateHUD: () => {}, clock: { getDelta: () => 0 }, addKillFeed: () => {},
    // mort d'une cible
    targetScore: () => 100, STRESS: { cibleAbattue: 0.1 }, convoyTarget: null, convoyCar: null,
    fleeNearby: () => 0, reactNearby: () => {}, guards: [], camera: { position: new THREE.Vector3() },
    getStats: () => ({ silenced: true }), checkGuardAlert: () => {}, checkWin: () => {},
    // les règles de la mission (tâche A8), hors de ce que vérifie ce test
    monterRegles: () => {}, signaler: () => {}, surUneMort: () => {},
    // la fiche
    dossierEl, afficherFiche, barrerCible, effectsReduced: () => reduit,
  }, source)
  // La mission n, comme le jeu la lance : mountLevel l'a posée (currentMission) avant la suite du départ
  const lancer = n => { s.poser({ currentMission: missionFor(n) }); s.fns.startLevel(n) }
  const cible = cibleId => ({ cibleId, die() {}, onVehicle: false, isStill: () => true, mesh: { position: new THREE.Vector3() } })
  return { dossierEl, lancer, tuer: id => s.fns.killTarget(cible(id)) }
}

const entrees = el => [...el.querySelectorAll('[data-cible-id]')]
const barrees = el => entrees(el).filter(e => e.classList.contains('abattue')).map(e => +e.dataset.cibleId)

describe('au départ de chaque mission : la fiche de ses cibles, une entrée par cible', () => {
  for (const m of MISSIONS) {
    it(`M${m.numero} : « DOSSIER 0${m.numero} », ${m.casting.cibles.length} entrée(s)`, () => {
      const { dossierEl, lancer } = jeu()
      lancer(m.numero)
      expect(dossierEl.style.display).toBe('block')
      expect(dossierEl.querySelector('.fiche-titre')?.textContent).toBe(`DOSSIER 0${m.numero}`)
      expect(entrees(dossierEl).map(e => +e.dataset.cibleId).sort()).toEqual(m.casting.cibles.map((_, i) => i))
    })
  }

  it('la mission suivante, ou relancée : une fiche vierge', () => {
    const { dossierEl, lancer, tuer } = jeu()
    lancer(4); tuer(0)
    lancer(4)
    expect(entrees(dossierEl)).toHaveLength(3)
    expect(barrees(dossierEl)).toEqual([])
    lancer(2)
    expect(entrees(dossierEl)).toHaveLength(2)
  })
})

describe('à la mort d\'une cible : son entrée barrée, retrouvée par cibleId', () => {
  it('M4 : Halder, puis Verne ; Rossi reste', () => {
    const { dossierEl, lancer, tuer } = jeu()
    lancer(4)
    tuer(1)
    expect(barrees(dossierEl)).toEqual([1])
    tuer(0)
    expect(barrees(dossierEl)).toEqual([0, 1])
  })

  it('le trait est animé ; d\'un coup en effets atténués', () => {
    const normal = jeu()
    normal.lancer(3); normal.tuer(0)
    expect(normal.dossierEl.querySelector('.abattue').classList.contains('instantanee')).toBe(false)
    const attenue = jeu(MAIN_SRC, { reduit: true })
    attenue.lancer(3); attenue.tuer(0)
    expect(attenue.dossierEl.querySelector('.abattue').classList.contains('instantanee')).toBe(true)
  })
})

// Témoins du câblage : chaque pièce retirée du main.js d'aujourd'hui fait rougir un des tests plus haut.
describe('témoins du câblage', () => {
  const remplace = (avant, apres = '') => {
    expect(MAIN_SRC.split(avant), `« ${avant} » absent de main.js, ou plusieurs fois : témoin impossible`).toHaveLength(2)
    return MAIN_SRC.replace(avant, apres)
  }

  it('startLevel sans la fiche : rien d\'affiché', () => {
    const { dossierEl, lancer } = jeu(remplace('afficherFiche(dossierEl, currentMission)', '0'))
    lancer(2)
    expect(entrees(dossierEl)).toHaveLength(0)
  })

  it('killTarget sans barrer : la fiche ne bouge pas', () => {
    const { dossierEl, lancer, tuer } = jeu(remplace('barrerCible(dossierEl, npc.cibleId, { anime: !effectsReduced() })', '0'))
    lancer(4); tuer(1)
    expect(barrees(dossierEl)).toEqual([])
  })

  it('killTarget qui ignore les effets atténués : le trait animé quand même', () => {
    const { dossierEl, lancer, tuer } = jeu(remplace('{ anime: !effectsReduced() }', '{ anime: true }'), { reduit: true })
    lancer(4); tuer(1)
    expect(dossierEl.querySelector('.abattue').classList.contains('instantanee')).toBe(false)
  })
})
