// Harnais des règles de la mission (spec du lot 3, §2 f et g ; plan du lot 3a, tâche A8) : les fonctions de main.js qui
// les mènent, exécutées telles quelles (executer, tests/gfx/mainSource.js), avec les vrais modules (alarm.js, escape.js,
// window.js, radio.js, phase.js), le vrai rayon contre le décor (solidHit) et des PNJ fournis par le test (de vrais NPC,
// ou des doublures). Le reste du jeu (son, HUD, écrans de fin) est fait de doublures qui écrivent dans un journal.
//
// Seules les fonctions que `source` déclare sont exécutées : le même test se joue sur un main.js d'avant la tâche
// (témoin), qui n'a pas les fonctions neuves. La garde de câblage de chaque test vérifie que le main.js d'aujourd'hui
// les a toutes (NOMS_REGLES).
import * as THREE from 'three'
import { MAIN_SRC, analyse, executer } from '../gfx/mainSource.js'
import { creerAlarme, reagir } from '../../src/campaign/alarm.js'
import { creerFuite, fuiteParSorties, issueLaPlusProche } from '../../src/campaign/escape.js'
import { creerFenetres } from '../../src/campaign/window.js'
import { creerRadio } from '../../src/campaign/radio.js'
import { canFinish, canFail, canPause, creerFin } from '../../src/campaign/phase.js'
import { solidHit } from '../../src/shot/occlusion.js'
import { FUITE, OCCLUSION, STRESS } from '../../src/shot/tuning.js'

export const NOMS_REGLES = [
  'monterRegles', 'signaler', 'coupEntendu', 'surUneMort', 'garderLesCorps', 'planifierReactions', 'voitLaChute',
  'enVueDuTireur', 'ligneDeVue', 'fuirVersLaSortie', 'avancerRegles', 'echeanceDeFenetre', 'direALaRadio',
  'killTarget', 'killCivilian', 'hitGuard', 'checkWin', 'lancerFin', 'startKillcam',
  'checkFledTargets', 'isInCameraFOV', 'fleeNearby', 'reactNearby', 'checkGuardAlert', 'pauseGame', 'resumeGame',
]

// mission, lieux : la mission en cours et ses lieux (resoudreAncres) ; cibles, gardes, autres : ses PNJ ; camera : à
// l'œil du poste, regard posé ; objets : le décor solide ; silencieux : l'amélioration. → { s (fonctions, etat, poser),
// journal, image(dt) (une image de la boucle, dans son ordre), killFeed }.
export function harnais({ mission, lieux, cibles = [], gardes = [], autres = [], camera, objets = [], silencieux = false, source = MAIN_SRC }) {
  const a = analyse(source)
  const journal = { echecs: [], fuitesCone: 0, fil: [], radio: [], radioCoupee: 0, killcam: 0, reussites: 0, alertes: [], barrees: [] }
  const killFeed = document.createElement('div')
  let s = null
  const etat = () => s.etat()
  // L'échec, gardé comme triggerGameOver le garde (canFail : jamais pendant le ralenti, jamais après la réussite)
  const finir = raison => {
    const e = etat()
    if (!canFail({ phase: e.gamePhase, killcam: e.killcamActive })) return
    journal.echecs.push(raison); s.poser({ gamePhase: 'dead' })
  }
  s = executer(NOMS_REGLES.filter(n => a.fns.has(n)), {
    THREE, camera, document, setTimeout,
    // la mission
    currentMission: mission, currentAnchors: lieux, gamePhase: 'playing', missionClock: 0, missionToken: 1,
    npcs: [...cibles, ...gardes, ...autres], targets: cibles, guards: gardes, civilians: autres.filter(n => n.isCivilian),
    killcamActive: false, timeScale: 1, failPending: false, dernierTirMortel: null, moralLockMesh: null,
    convoyCar: null, convoyTarget: null, alertActive: false, statShots: 0,
    score: 0, stress: 0, lastTargetKillAt: -99999, STRESS, FUITE, OCCLUSION,
    // les règles (tâche A8) : neuves à chaque départ, comme startLevel les monte (monterRegles)
    alarme: creerAlarme(), fuite: null, fenetres: null, radio: null, fin: null,
    reagir, creerFuite, fuiteParSorties, issueLaPlusProche, creerFenetres, creerRadio, creerFin, canFinish, creerAlarme,
    solidHit, missionSolids: () => objets,
    missionPhase: () => { const e = etat(); return { phase: e.gamePhase, killcam: e.killcamActive, failPending: e.failPending } },
    // le reste du jeu
    getStats: () => ({ silenced: silencieux }),
    targetScore: () => 100, addKillFeed: (texte, danger) => journal.fil.push(danger ? `!${texte}` : texte),
    barrerCible: (el, id) => journal.barrees.push(id), dossierEl: null, effectsReduced: () => false,
    triggerGameOver: finir, triggerFleeGameOver: () => { journal.fuitesCone++; finir('Une cible a fui votre champ de vision') },
    triggerAlert: raison => journal.alertes.push(raison), triggerLevelClear: () => journal.reussites++,
    playCivilKill: () => {}, playRadio: dureeS => journal.radio.push(dureeS), updateHUD: () => {}, killFeed,
    guardHit: () => ({ meurt: true, feed: 'Garde abattu', gardesReagissent: false, alerte: false }),
    // la pause (pauseGame, resumeGame) : son écran, la lunette et la souris, les bips coupés
    canPause, renderLost: false, pauseEl: document.createElement('div'), settingsEl: document.createElement('div'),
    hideScope: () => {}, releaseMouse: () => {}, stopRadio: () => journal.radioCoupee++, clock: { getDelta: () => 0 },
  }, source)
  if (s.fns.monterRegles) s.fns.monterRegles()
  else s.poser({ fuite: creerFuite(mission, lieux), fenetres: creerFenetres(mission.fenetres), radio: creerRadio(mission.radio), fin: creerFin(mission.fin) })
  // Une image de la boucle (loop, main.js), dans son ordre : les PNJ, la fuite des cibles, le temps de la mission, la balle
  // (aucune ici), les règles.
  const image = (dt = 1 / 60) => {
    if (s.etat().gamePhase !== 'playing') return
    const { timeScale } = s.etat()
    const d = dt * timeScale
    for (const n of s.etat().npcs) n.update(d)
    if (s.fns.checkFledTargets) s.fns.checkFledTargets(d)
    if (s.etat().gamePhase !== 'playing') return
    s.poser({ missionClock: s.etat().missionClock + d })
    if (s.fns.avancerRegles) s.fns.avancerRegles()
  }
  return { s, journal, image, killFeed }
}
