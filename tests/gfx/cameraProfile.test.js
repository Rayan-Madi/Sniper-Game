import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { applyCameraProfile, resetCameraProfile, PROFIL_HORS_MISSION } from '../../src/gfx/cameraProfile.js'

// Profil de caméra par mission (spec du lot 3, §2 b ; plan du lot 3a, tâche A3) : src/gfx/cameraProfile.js pose, sur la
// caméra, la scène et le soleil qu'on lui donne, les plans proche et lointain de la caméra, la brume de la scène
// (linéaire ou exponentielle), la position et la cible du soleil, le cadre de son ombre. resetCameraProfile remet le
// profil hors mission : celui du menu, du démarrage, de l'arène du PvP (sa brume mise à part) et du retour de l'enquête.
// Ce qui compte, c'est ce que three lit au rendu : la projection de la caméra (recalculée seulement par
// updateProjectionMatrix), la position de la cible du soleil dans le monde (matrixWorld : la cible n'est pas dans la
// scène, rien ne la recalcule à chaque image) et la projection de la caméra d'ombre (three ne la recalcule qu'à la
// création de la carte d'ombre). La mesure (etat) les relit, pas seulement les champs.
//
// Témoins : ces règles n'existent pas avant la tâche (plan lointain, brume, soleil et cadre posés une fois pour toutes
// par initScene et les cartes) ; les parcours hors mission qui les exigent sont vus rouges dans
// cameraProfile.horsMission.test.js (menu, PvP) et tests/prologue/stop.test.js (fin de l'enquête), et le câblage de
// main.js dans main.cameraProfile.test.js. Ici, le témoin montre que la mesure voit un profil posé champ par champ sans
// recalcul.

const r = v => +v.toFixed(9)
const projection = cam => cam.projectionMatrix.elements.map(r)
const position = o => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).toArray().map(r)
const brumeDe = f => (!f ? null : f.isFogExp2
  ? { type: 'exp2', couleur: f.color.getHex(), densite: f.density }
  : { type: 'lin', couleur: f.color.getHex(), debut: f.near, fin: f.far })

// Caméra, scène et soleil comme ceux du jeu au démarrage (src/scene.js, initScene, avant la tâche).
function jeu() {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x87a0b0, 40, 120)
  const sun = new THREE.DirectionalLight(0xfff0cc, 1.2)
  sun.position.set(20, 40, 10)
  sun.castShadow = true
  Object.assign(sun.shadow.camera, { near: 0.5, far: 200, left: -60, right: 60, top: 60, bottom: -60 })
  sun.shadow.camera.updateProjectionMatrix()
  scene.add(sun)
  return { camera, scene, sun }
}

// Ce que three lit au rendu.
function etat({ camera, scene, sun }) {
  const o = sun.shadow.camera
  return {
    plans: [camera.near, camera.far], projection: projection(camera),
    brume: brumeDe(scene.fog),
    soleil: sun.position.toArray().map(r), cible: position(sun.target),
    cadre: [o.left, o.right, o.top, o.bottom], projectionOmbre: projection(o),
  }
}

// Ce que three doit lire avec ce profil, pour une caméra de ce champ et de ce format.
function attendu(p, { fov = 60, aspect = 16 / 9 } = {}) {
  const c = p.cadreOmbre
  return {
    plans: [p.near, p.far], projection: projection(new THREE.PerspectiveCamera(fov, aspect, p.near, p.far)),
    brume: { ...p.brume },
    soleil: [...p.soleil.pos], cible: [...p.soleil.cible],
    cadre: [-c, c, c, -c], projectionOmbre: projection(new THREE.OrthographicCamera(-c, c, c, -c, 0.5, 200)),
  }
}

// Profils de longue distance comme ceux que les sous-lots 3c et 3d poseront (spec du lot 3, §3) : la base de M4 à 430 m
// (midi, brume linéaire jusqu'à 1 600 m), le port de M3 (brume exponentielle), le couchant de M5 (soleil bas, visé
// devant la route).
const M4 = { near: 1, far: 1700, brume: { type: 'lin', couleur: 0x9ab0c0, debut: 150, fin: 1600 },
  soleil: { pos: [4, 60, 2], cible: [0, 0, 0] }, cadreOmbre: 40 }
const M3 = { near: 0.5, far: 600, brume: { type: 'exp2', couleur: 0x0a1520, densite: 0.0035 },
  soleil: { pos: [20, 40, 10], cible: [0, 0, 0] }, cadreOmbre: 60 }
const M5 = { near: 0.5, far: 1000, brume: { type: 'exp2', couleur: 0xb0a088, densite: 0.0016 },
  soleil: { pos: [-30, 23, 95], cible: [0, 0, -4] }, cadreOmbre: 80 }

describe('le profil hors mission', () => {
  it('la caméra, le soleil et le cadre d\'ombre du jeu d\'avant la tâche (initScene), la brume du menu (src/maps/menu.js)', () => {
    expect(PROFIL_HORS_MISSION).toEqual({
      near: 0.1, far: 200,
      brume: { type: 'lin', couleur: 0x87a0b0, debut: 50, fin: 140 },
      soleil: { pos: [20, 40, 10], cible: [0, 0, 0] },
      cadreOmbre: 60,
    })
  })

  it('il est figé : rien ne peut le modifier par mégarde (chaque remise à zéro le reposerait)', () => {
    expect(() => { PROFIL_HORS_MISSION.far = 1700 }).toThrow(TypeError)
    expect(() => { PROFIL_HORS_MISSION.brume.fin = 1600 }).toThrow(TypeError)
    expect(() => { PROFIL_HORS_MISSION.soleil.pos[1] = 60 }).toThrow(TypeError)
    expect(() => { PROFIL_HORS_MISSION.soleil.cible.push(0) }).toThrow(TypeError)
    expect(PROFIL_HORS_MISSION.far).toBe(200)
  })
})

describe('applyCameraProfile', () => {
  for (const [nom, p] of Object.entries({ M4, M3, M5 })) {
    it(`profil de longue distance (${nom}) : plans, brume, soleil et cadre d'ombre, tels que three les lit`, () => {
      const j = jeu()
      applyCameraProfile(j.camera, j.scene, j.sun, p)
      expect(etat(j)).toEqual(attendu(p))
    })
  }

  it('brume linéaire : une THREE.Fog ; exponentielle : une THREE.FogExp2, chacune de la couleur du profil', () => {
    const j = jeu()
    applyCameraProfile(j.camera, j.scene, j.sun, M4)
    expect(j.scene.fog).toBeInstanceOf(THREE.Fog)
    applyCameraProfile(j.camera, j.scene, j.sun, M3)
    expect(j.scene.fog).toBeInstanceOf(THREE.FogExp2)
    expect(j.scene.fog.color.getHex()).toBe(0x0a1520)
  })

  it('la cible du soleil n\'entre pas dans la scène : aucun objet de plus (relevés de __decor et du memtest)', () => {
    const j = jeu()
    const avant = [...j.scene.children]
    applyCameraProfile(j.camera, j.scene, j.sun, M5)
    expect(j.scene.children).toEqual(avant)
    expect(j.sun.target.parent).toBe(null)
  })

  it('le champ de la caméra et son format restent ceux du moment (la lunette les règle)', () => {
    const j = jeu()
    j.camera.fov = 15; j.camera.aspect = 4 / 3
    applyCameraProfile(j.camera, j.scene, j.sun, M4)
    expect([j.camera.fov, j.camera.aspect]).toEqual([15, 4 / 3])
    expect(projection(j.camera)).toEqual(attendu(M4, { fov: 15, aspect: 4 / 3 }).projection)
  })

  it('le profil donné n\'est pas modifié, et la scène ne garde aucun de ses tableaux', () => {
    const j = jeu()
    const copie = structuredClone(M5)
    applyCameraProfile(j.camera, j.scene, j.sun, M5)
    j.sun.position.x = 99; j.sun.target.position.z = 99; j.scene.fog.density = 1
    expect(M5).toEqual(copie)
  })

  it('une brume d\'une autre sorte : erreur qui la nomme, plutôt qu\'une brume au hasard', () => {
    const j = jeu()
    expect(() => applyCameraProfile(j.camera, j.scene, j.sun, { ...M4, brume: { type: 'exp', couleur: 0, densite: 0.01 } }))
      .toThrow(/brume.*exp/)
  })
})

describe('resetCameraProfile', () => {
  it('après une mission de longue distance, tout revient au profil hors mission', () => {
    for (const p of [M4, M3, M5]) {
      const j = jeu()
      applyCameraProfile(j.camera, j.scene, j.sun, p)
      resetCameraProfile(j.camera, j.scene, j.sun)
      expect(etat(j)).toEqual(attendu(PROFIL_HORS_MISSION))
    }
  })

  it('appliquer le profil hors mission ou le remettre à zéro, c\'est la même chose', () => {
    const a = jeu(), b = jeu()
    applyCameraProfile(a.camera, a.scene, a.sun, M4)
    applyCameraProfile(b.camera, b.scene, b.sun, M4)
    resetCameraProfile(a.camera, a.scene, a.sun)
    applyCameraProfile(b.camera, b.scene, b.sun, PROFIL_HORS_MISSION)
    expect(etat(a)).toEqual(etat(b))
  })
})

describe('témoin de la mesure', () => {
  it('un profil posé champ par champ, sans recalcul : la mesure voit la projection et la cible d\'avant', () => {
    const j = jeu()
    j.camera.near = M5.near; j.camera.far = M5.far
    j.scene.fog = new THREE.FogExp2(M5.brume.couleur, M5.brume.densite)
    j.sun.position.set(...M5.soleil.pos)
    j.sun.target.position.set(...M5.soleil.cible)
    Object.assign(j.sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80 })
    const e = etat(j), a = attendu(M5)
    expect({ ...e, projection: a.projection, cible: a.cible, projectionOmbre: a.projectionOmbre }).toEqual(a)
    expect(e.projection).not.toEqual(a.projection)
    expect(e.cible).not.toEqual(a.cible)
    expect(e.projectionOmbre).not.toEqual(a.projectionOmbre)
  })
})
