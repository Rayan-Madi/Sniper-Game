import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { MAIN_SRC, executer } from '../gfx/mainSource.js'
import { lancerBalle } from '../../src/shot/balle.js'
import { BALLE, STRESS, SILLAGE } from '../../src/shot/tuning.js'

// La vue que le coup garde (balle.vue, que le dernier tir mortel recopie : contrat du lot 4, le rejeu de la kill-cam
// commence dans la lunette) et le rayon du tir (dir) partent du même regard (spec du lot 3, §2 c, précisions de la
// tâche A4 ; relecture de A4). La souris peut bouger entre la dernière image, où aimMissionCamera a cadré la caméra, et
// le clic : le regard (yaw, pitch) n'est alors plus celui de la caméra. Le coup recadre la caméra sur le regard du clic
// avant de prendre le rayon : le rayon, la vue gardée et le canon du sillage partent du regard du clic.
//
// shoot, rayonDuReticule, aimMissionCamera et syncFov de main.js sont exécutés tels quels (executer,
// tests/gfx/mainSource.js : main.js ne s'importe pas sous jsdom), sur une vraie caméra de three ; le reste du coup
// (culasse, sons, sillage) est doublé.
//
// Témoin : le shoot de la tâche A4 (71f3c0e), qui prenait le rayon sur la caméra de l'image et la vue sur le regard du
// clic. Vu rouge : la vue s'écarte du rayon du mouvement de souris (3 rouges). Reproduit plus bas sur le source
// d'aujourd'hui, le recadrage retiré.

const L = 1280, H = 720
const ZOOM = 8
const RECUL = { yaw: 0.0007, pitch: 0.0021 }   // recul résiduel du coup d'avant, compris dans le regard

function monter(source, tremble) {
  const camera = new THREE.PerspectiveCamera(60, L / H, 0.1, 200)
  return executer(['shoot', 'rayonDuReticule', 'aimMissionCamera', 'syncFov'], {
    THREE, camera, innerWidth: L, innerHeight: H,
    currentAnchors: { oeil: [0, 37.5, 0] }, currentMission: { zero: 430 },
    yaw: 0, pitch: 0, recoilOffset: { ...RECUL },
    balle: null, missionClock: 12, statShots: 0, stress: 0, STRESS, BALLE,
    isScopeReady: () => true, canShoot: () => true, missionPhase: () => ({ phase: 'playing' }),
    bolt: { ready: () => true, fire: () => {} },
    getStats: () => ({ boltS: 1.2, silenced: false, v0: 800 }),
    shotGlow: () => {}, effectsReduced: () => false, playShot: () => {}, playSilencedShot: () => {},
    getTrembleOffset: () => tremble, getScopeFov: () => 60 / ZOOM, getEffectiveZoom: () => ZOOM,
    lancerBalle, convoyCar: null, abscisseConvoi: () => null,
    spawnTrail: () => ({}), MUZZLE: new THREE.Vector3(...SILLAGE.canon), predireImpact: () => BALLE.volMaxS,
    toucherSegment: () => ({ impact: null, traversees: [] }),
    recoil: { kick: () => {} },
    coupEntendu: () => {},   // le coup entendu par les règles de la mission (tâche A8), hors de ce que vérifie ce test
  }, source)
}

// Une image (la boucle cadre la caméra sur le regard : lacet 0,4 rad, tangage -0,08 rad), puis la souris bouge le
// regard de `bouge` (rad : un mouvement d'une image à 60 i/s, en suivant une cible), puis le clic tire. → la balle.
function tirApresMouvement({ source = MAIN_SRC, tremble = { x: 0, y: 0 }, bouge = { yaw: 0.004, pitch: -0.002 } } = {}) {
  const s = monter(source, tremble)
  s.poser({ yaw: 0.4, pitch: -0.08 })
  s.fns.aimMissionCamera()
  s.poser({ yaw: 0.4 + bouge.yaw, pitch: -0.08 + bouge.pitch })
  s.fns.shoot()
  return s.etat().balle
}

// Direction d'un regard, posé comme aimMissionCamera le pose (Euler YXZ, sans roulis).
const direction = (lacet, tangage) => new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(tangage, lacet, 0, 'YXZ'))

describe('le coup : la vue gardée et le rayon du tir partent du même regard, même si la souris a bougé depuis l\'image', () => {
  it('réticule au centre : la vue gardée vise exactement le long du rayon du tir', () => {
    const b = tirApresMouvement()
    expect(direction(b.vue.lacet, b.vue.tangage).angleTo(b.traj.dir)).toBeLessThan(1e-6)
  })

  it('le rayon part du regard du clic (le mouvement de souris compris, le recul résiduel aussi)', () => {
    const b = tirApresMouvement()
    expect(direction(0.404 + RECUL.yaw, -0.082 + RECUL.pitch).angleTo(b.traj.dir)).toBeLessThan(1e-6)
  })

  // Le rejeu du lot 4 pose la caméra sur la vue gardée : le rayon du tir doit y retomber sur le réticule tel qu'il
  // était dessiné au coup, décalé du tremblement.
  it('tremblement compris : une caméra posée sur la vue gardée retrouve le rayon sous le réticule du coup', () => {
    const tremble = { x: 37, y: -21 }
    const b = tirApresMouvement({ tremble })
    const rejeu = new THREE.PerspectiveCamera(b.vue.fov, L / H, 0.1, 1000)
    rejeu.position.copy(b.traj.origine)
    rejeu.quaternion.setFromEuler(new THREE.Euler(b.vue.tangage, b.vue.lacet, 0, 'YXZ'))
    rejeu.updateMatrixWorld()
    const ecran = b.traj.origine.clone().addScaledVector(b.traj.dir, 100).project(rejeu)
    expect(b.vue.fov).toBe(60 / ZOOM)
    expect(ecran.x * L / 2, 'réticule en X (px)').toBeCloseTo(tremble.x, 3)
    expect(-ecran.y * H / 2, 'réticule en Y (px)').toBeCloseTo(tremble.y, 3)
  })
})

describe('témoin', () => {
  it('le shoot d\'avant la relecture de A4, sans recadrage : la vue s\'écarte du rayon du mouvement de souris', () => {
    const recadrage = '  aimMissionCamera()\n  const ray = rayonDuReticule()'
    expect(MAIN_SRC.split(recadrage), 'recadrage introuvable dans shoot, ou plusieurs fois : témoin impossible').toHaveLength(2)
    const b = tirApresMouvement({ source: MAIN_SRC.replace(recadrage, '  const ray = rayonDuReticule()') })
    const ecart = direction(b.vue.lacet, b.vue.tangage).angleTo(b.traj.dir)
    expect(ecart, 'la vue s\'écarte du rayon du mouvement de souris (0,0045 rad, 1,9 m à 430 m)').toBeGreaterThan(0.004)
    expect(ecart).toBeLessThan(0.005)
    expect(direction(0.4 + RECUL.yaw, -0.08 + RECUL.pitch).angleTo(b.traj.dir), 'le rayon de l\'image').toBeLessThan(1e-6)
  })
})
