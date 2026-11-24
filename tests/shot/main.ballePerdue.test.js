import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { MAIN_SRC, executer } from '../gfx/mainSource.js'
import { lancerBalle, avancerBalle } from '../../src/shot/balle.js'
import { impactSurSegment } from '../../src/shot/occlusion.js'
import { planShotSounds } from '../../src/shot/soundPlan.js'
import { missFeed } from '../../src/shot/score.js'
import { isHit } from '../../src/campaign/rank.js'
import { STRESS } from '../../src/shot/tuning.js'
import { MISSIONS } from '../../src/campaign/missions/index.js'
import { fuiteParSorties } from '../../src/campaign/escape.js'

// Ce qu'un tir manqué fait autour de lui (spec du lot 3, §2 c, précisions de la tâche A4 ; relecture de A4). Une balle
// perdue (rien rencontré au bout de BALLE.volMaxS, 0,6 s, soit 480 m) l'est là où elle est : ni son ni réaction, même
// s'il y a des PNJ autour de ce point. En M4 à 430 m (sous-lot 3c), une balle passée au-dessus de ceux du fond de la
// zone, à 448 m, se perdra à une trentaine de mètres d'eux, tout près des rayons de fuite (20 m), de réaction (28 m) et
// d'alerte des gardes (25 m, alerte à 12 m). Le stress du tir manqué monte toujours, et le fil dit « Tir manqué ».
// Contre-épreuve : la balle arrêtée par un mur au même endroit fait fuir, réagir, et le garde donne l'alerte.
//
// resolveBullet de main.js, avec roleDe, fleeNearby, reactNearby et checkGuardAlert, est exécuté tel quel (executer,
// tests/gfx/mainSource.js : main.js ne s'importe pas sous jsdom), sur une balle qui a vraiment volé (lancerBalle,
// avancerBalle, impactSurSegment, images de 1/60 s).
//
// Témoin : le resolveBullet de la tâche A4 (71f3c0e) faisait réagir autour du point d'une balle perdue comme autour
// d'un impact sur le décor. Vu rouge : le civil fuit, le fil dit « Tir manqué : cibles en fuite » (2 rouges). Reproduit
// plus bas sur le source d'aujourd'hui, la condition sur le décor retirée.

const OEIL = new THREE.Vector3(0, 10, 0)

// Mur de 400 × 400 m, d'un mètre d'épaisseur, sa face avant à d m devant l'œil.
function mur(d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(400, 400, 1), new THREE.MeshLambertMaterial())
  m.position.set(0, OEIL.y, -d - 0.5)
  m.userData.solid = true; m.userData.surface = 'pierre'
  m.updateMatrixWorld(true)
  return m
}

// Un tir droit devant, la lunette réglée à 430 m, mené comme la boucle de main.js le mène (des images de 1/60 s) contre
// le décor `objets` : la balle et son arrivée.
function voler(objets) {
  const tTir = 5
  const balle = lancerBalle({ origine: OEIL, dir: new THREE.Vector3(0, 0, -1), v0: 800, g: 9.81, zero: 430, tTir })
  Object.assign(balle, { sillage: {}, vue: { lacet: 0, tangage: 0, zoom: 20, fov: 3 }, sTir: null })
  const toucher = seg => impactSurSegment({ ...seg, objets })
  for (let i = 1; i <= 60; i++) {
    const arrivee = avancerBalle(balle, tTir + i / 60, toucher)
    if (arrivee) return { balle, arrivee }
  }
  throw new Error('la balle n\'est jamais arrivée')
}

// Un PNJ posé à dx m (en X) du point où la balle s'arrête : il relève ce qui le fait fuir ou réagir.
function pnj(point, dx, { garde = false } = {}) {
  return {
    alive: true, state: 'idle', isTarget: false, isCivilian: !garde, isGuard: garde,
    mesh: { position: point.clone().add(new THREE.Vector3(dx, 0, 0)) },
    fuites: [], reactions: [],
    flee(depuis) { this.fuites.push(depuis.clone()); this.state = 'flee' },
    react(depuis) { this.reactions.push(depuis.clone()) },
  }
}

// Le tir manqué : la balle vole contre `objets`, un civil et un garde sont posés à 6 et 8 m du point où elle s'arrête,
// puis resolveBullet (de `source`) la reçoit. Sans silencieux.
function tirManque(objets, source = MAIN_SRC) {
  const { balle, arrivee } = voler(objets)
  const civil = pnj(arrivee.impact.point, 6), garde = pnj(arrivee.impact.point, -8, { garde: true })
  const journal = { fil: [], alertes: [], sons: [] }
  const s = executer(['resolveBullet', 'roleDe', 'fleeNearby', 'reactNearby', 'checkGuardAlert'], {
    balle, stress: 0, lastImpact: null, statHits: 0, dernierTirMortel: null, alertActive: false,
    npcs: [civil, garde], guards: [garde], currentMission: MISSIONS[3], fuiteParSorties,
    STRESS, planShotSounds, missFeed, isHit,
    getStats: () => ({ silenced: false }),
    retargetTrail: () => {}, playShotSounds: sons => journal.sons.push(...sons),
    spawnSpray: () => {}, spawnBulletHole: () => {}, jeepOf: () => null,
    addKillFeed: texte => journal.fil.push(texte), triggerAlert: raison => journal.alertes.push(raison),
    updateHUD: () => {},
  }, source)
  s.fns.resolveBullet(arrivee)
  return { arrivee, civil, garde, journal, etat: s.etat() }
}

describe('une balle perdue : ni son ni réaction, même près de PNJ', () => {
  it('perdue à 6 m d\'un civil et à 8 m d\'un garde : personne ne fuit ni ne réagit, aucune alerte, aucun son', () => {
    const { arrivee, civil, garde, journal } = tirManque([])
    expect(arrivee.impact.kind, 'la balle s\'est perdue au bout de son vol').toBe('rien')
    expect(arrivee.t - 5).toBeCloseTo(0.6, 9)
    expect({ fuites: civil.fuites.length, reactions: civil.reactions.length }, 'le civil').toEqual({ fuites: 0, reactions: 0 })
    expect({ fuites: garde.fuites.length, reactions: garde.reactions.length }, 'le garde').toEqual({ fuites: 0, reactions: 0 })
    expect(journal.alertes, 'alerte').toEqual([])
    expect(journal.sons, 'sons de l\'impact').toEqual([])
  })

  it('le tir manqué compte toujours : stress du tir manqué, « Tir manqué » au fil, balle finie', () => {
    const { journal, etat } = tirManque([])
    expect(etat.stress).toBeCloseTo(STRESS.tirManque, 12)
    expect(journal.fil).toEqual([missFeed(0)])
    expect(etat.lastImpact.role).toBe('rien')
    expect(etat.balle).toBe(null)
  })

  it('contre-épreuve : arrêtée par un mur au même endroit, elle fait fuir et réagir, et le garde donne l\'alerte', () => {
    const { arrivee, civil, garde, journal, etat } = tirManque([mur(470)])
    expect(arrivee.impact.kind).toBe('decor')
    expect(civil.fuites, 'le civil fuit le point d\'impact').toHaveLength(1)
    expect(civil.fuites[0].distanceTo(arrivee.impact.point)).toBeLessThan(1e-9)
    expect(garde.reactions.length, 'le garde réagit').toBeGreaterThan(0)
    expect(journal.alertes).toEqual(['⚠ Garde alerté par le tir'])
    expect(journal.sons.map(s => s.son)).toEqual(['impact-pierre'])
    expect(journal.fil).toEqual([missFeed(2)])
    expect(etat.stress).toBeCloseTo(STRESS.tirManque, 12)
  })
})

describe('témoin', () => {
  it('le resolveBullet d\'avant la relecture de A4 : le civil fuit le point de la balle perdue, le garde donne l\'alerte', () => {
    const condition = "if (role === 'decor') {\n        fuyards = fleeNearby(shotPos, 20)"
    expect(MAIN_SRC.split(condition), 'condition sur le décor introuvable dans resolveBullet, ou plusieurs fois : témoin impossible').toHaveLength(2)
    const avant = MAIN_SRC.replace(condition, '{\n        fuyards = fleeNearby(shotPos, 20)')
    const { arrivee, civil, garde, journal } = tirManque([], avant)
    expect(arrivee.impact.kind).toBe('rien')
    expect(civil.fuites).toHaveLength(1)
    expect(garde.reactions.length).toBeGreaterThan(0)
    expect(journal.alertes).toEqual(['⚠ Garde alerté par le tir'])
    expect(journal.fil).toEqual([missFeed(2)])
  })
})
