import { describe, it, expect, vi, afterEach } from 'vitest'
import * as THREE from 'three'
import { startInvestigation } from '../../src/prologue/investigation.js'
import { stopInvestigation } from '../../src/prologue/stop.js'
import { resetCameraProfile } from '../../src/gfx/cameraProfile.js'

// Fin de l'enquête du prologue (spec du lot 3, §2 b ; plan du lot 3a, tâche A3, relecture de A3) : achevée (run.next)
// ou abandonnée (abortInvestigation), elle passe par stopInvestigation (src/prologue/stop.js). L'enquête se démonte et
// rend la caméra du jeu telle qu'elle l'a trouvée, PUIS le profil hors mission revient : plans de 0,1 à 200 m, brume du
// menu, soleil en (20, 40, 10) visé vers l'origine, cadre d'ombre de ±60 m. Ici, la vraie enquête (startInvestigation,
// sur un faux renderer) part après une mission au profil de longue distance, comme la base de M4 que posera le
// sous-lot 3c ; la caméra, la scène et le soleil sont des doublures faites comme ceux du jeu (src/scene.js). Le câblage
// de main.js (run.next et abortInvestigation passent par stopInvestigation, rien d'autre n'arrête l'enquête) est gardé
// par tests/gfx/main.cameraProfile.test.js ; le menu et le PvP, par cameraProfile.horsMission.test.js.
//
// Témoins : avec la fin d'avant la tâche A3 (commit 69ab74a, l'arrêt de l'enquête seul), la caméra garde les plans de la
// mission, la scène sa brume, le soleil sa position, sa cible et son cadre ; avec la remise à zéro AVANT l'arrêt,
// l'enquête repose par-dessus les plans de la mission, qu'elle avait trouvés (vus rouges, stopInvestigation réduit à
// chacune). Les deux sont rejoués plus bas, sur la vraie enquête, et la comparaison y est exigée fausse.

const fakeRenderer = () => ({
  domElement: document.createElement('canvas'), render: vi.fn(), compile: vi.fn(),
  shadowMap: { autoUpdate: true, needsUpdate: false }, info: { render: { calls: 0, triangles: 0 } },
})

// La caméra, la scène et le soleil du jeu, créés comme initScene les crée.
function jeu() {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
  const scene = new THREE.Scene()
  const sun = new THREE.DirectionalLight(0xfff0cc, 1.2)
  sun.castShadow = true
  Object.assign(sun.shadow.camera, { near: 0.5, far: 200 })
  scene.add(sun)
  return { camera, scene, sun }
}

// Une mission au profil de longue distance, posé jusqu'au bout (projections et cible du soleil recalculées), comme le
// posera la base de M4 : plans de 1 à 1 700 m, brume exponentielle, soleil de midi visé devant le poste, cadre resserré.
function missionDeLongueDistance({ camera, scene, sun }) {
  camera.near = 1; camera.far = 1700; camera.updateProjectionMatrix()
  scene.fog = new THREE.FogExp2(0x9ab0c0, 0.0012)
  sun.position.set(4, 60, 2)
  sun.target.position.set(0, 0, -40); sun.target.updateMatrixWorld()
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 })
  sun.shadow.camera.updateProjectionMatrix()
}

const r = v => +v.toFixed(9)
const projection = cam => cam.projectionMatrix.elements.map(r)
const brumeDe = f => (!f ? null : f.isFogExp2
  ? { type: 'exp2', couleur: f.color.getHex(), densite: f.density }
  : { type: 'lin', couleur: f.color.getHex(), debut: f.near, fin: f.far })

// Ce que three lit au rendu : la projection de la caméra, la cible du soleil dans le monde, la projection de la caméra
// d'ombre (pas seulement les champs).
function etat({ camera, scene, sun }) {
  const o = sun.shadow.camera
  return {
    plans: [camera.near, camera.far], projection: projection(camera), brume: brumeDe(scene.fog),
    soleil: sun.position.toArray(), cible: new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld).toArray(),
    cadre: [o.left, o.right, o.top, o.bottom], projectionOmbre: projection(o),
  }
}

// Le profil hors mission, au champ et au format de la caméra du moment.
function horsMission({ camera }) {
  return {
    plans: [0.1, 200], projection: projection(new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.1, 200)),
    brume: { type: 'lin', couleur: 0x87a0b0, debut: 50, fin: 140 },
    soleil: [20, 40, 10], cible: [0, 0, 0],
    cadre: [-60, 60, 60, -60], projectionOmbre: projection(new THREE.OrthographicCamera(-60, 60, 60, -60, 0.5, 200)),
  }
}

// La vraie enquête, lancée sur la caméra du jeu (elle la sauve, puis pose ses plans de 0,05 à 40 m).
function enquete(j) {
  const renderer = fakeRenderer()
  const handle = startInvestigation({ renderer, camera: j.camera, onDone: vi.fn() })
  expect([j.camera.near, j.camera.far], 'l\'enquête a pris la caméra').toEqual([0.05, 40])
  return { renderer, handle }
}

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; document.head.innerHTML = '' })

describe('fin de l\'enquête, après une mission au profil de longue distance', () => {
  it('en cours (achevée par run.next, ou abandonnée) : l\'enquête se démonte, puis le profil hors mission revient', () => {
    const j = jeu()
    missionDeLongueDistance(j)
    const { renderer, handle } = enquete(j)
    stopInvestigation({ handle }, j.camera, j.scene, j.sun)
    expect(etat(j)).toEqual(horsMission(j))
    // démontée : son interface retirée, le champ de la caméra et les ombres du jeu rendus
    expect(document.querySelector('#enq-root')).toBeNull()
    expect(j.camera.fov).toBe(60)
    expect(renderer.shadowMap.autoUpdate).toBe(true)
  })

  it('abandonnée avant que son module n\'arrive (pas encore de poignée) : le profil hors mission revient quand même', () => {
    const j = jeu()
    missionDeLongueDistance(j)
    stopInvestigation({ handle: null }, j.camera, j.scene, j.sun)
    expect(etat(j)).toEqual(horsMission(j))
  })

  it('un démontage qui lève : l\'erreur est journalisée, le profil hors mission revient quand même', () => {
    const j = jeu()
    missionDeLongueDistance(j)
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    const panne = new Error('démontage impossible')
    expect(() => stopInvestigation({ handle: { stop() { throw panne } } }, j.camera, j.scene, j.sun)).not.toThrow()
    expect(erreur).toHaveBeenCalledWith('[enquête]', panne)
    expect(etat(j)).toEqual(horsMission(j))
  })
})

describe('témoins', () => {
  it('l\'arrêt seul (la fin d\'avant la tâche A3) rend la caméra trouvée : les plans, la brume et le soleil de la mission', () => {
    const j = jeu()
    missionDeLongueDistance(j)
    const mission = etat(j)
    const { handle } = enquete(j)
    handle.stop()
    expect(etat(j)).toEqual(mission)
    expect(etat(j)).not.toEqual(horsMission(j))
  })

  it('la remise à zéro avant l\'arrêt : l\'enquête repose ensuite les plans de la mission', () => {
    const j = jeu()
    missionDeLongueDistance(j)
    const { handle } = enquete(j)
    resetCameraProfile(j.camera, j.scene, j.sun)
    handle.stop()
    expect([j.camera.near, j.camera.far]).toEqual([1, 1700])
    expect(etat(j)).not.toEqual(horsMission(j))
  })
})
