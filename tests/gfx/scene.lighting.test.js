import { describe, it, expect, vi, beforeAll } from 'vitest'

// Lumières et profil de départ du vrai src/scene.js (spec du lot 3, §2 b ; plan du lot 3a, tâche A3) :
// - setLighting gagne sunPos, la position du soleil, (20, 40, 10) par défaut : chaque décor qui règle ses lumières
//   (cartes, menu, arène du PvP, sol nu de la sonde) remet le soleil à sa place, et une mission qui l'a déplacé (le midi
//   de M4, le couchant de M5) ne le laisse pas au décor suivant ;
// - initScene part du profil hors mission : plans de 0,1 à 200 m, soleil en (20, 40, 10) visé vers l'origine, cadre
//   d'ombre de ±60 m, brume du menu.
// initScene tourne sur un faux WebGLRenderer (pas de WebGL sous jsdom) : la caméra, la scène et les lumières sont
// celles du jeu.
//
// Témoins : avant la tâche (commit 69ab74a), setLighting ne touche jamais à la position du soleil (sunPos ignoré, et
// sans lui le soleil reste où la mission l'a mis : vus rouges). initScene posait déjà plans et soleil, mais son cadre
// d'ombre de ±60 m sans recalcul de la projection (celle de three, ±5 m, jusqu'à la création de la carte d'ombre au
// premier rendu) et une brume de 40 à 120 m : deux valeurs mortes, que le premier rendu et le décor du menu
// remplaçaient avant la première image (vu rouge sur la projection de l'ombre, vérifiée avant la brume).

vi.mock('three', async importOriginal => {
  const THREE = await importOriginal()
  class WebGLRenderer {
    constructor() { this.shadowMap = { enabled: false, type: THREE.PCFShadowMap } }
    setSize() {}
  }
  return { ...THREE, WebGLRenderer }
})

const THREE = await import('three')
const S = await import('../../src/scene.js')

beforeAll(() => {
  document.body.innerHTML = '<canvas id="canvas"></canvas>'
  S.initScene()
})

const r = v => +v.toFixed(9)
const projection = cam => cam.projectionMatrix.elements.map(r)

describe('setLighting : la position du soleil', () => {
  it('sans sunPos, le soleil revient en (20, 40, 10) : une mission qui l\'a déplacé ne le laisse pas au décor suivant', () => {
    S.sun.position.set(4, 60, 2)   // le midi de M4 (sous-lot 3c)
    S.setLighting({ ambientI: 1.25, sunI: 0.55, fillI: 0.65, sunColor: 0x9fb0dc, ambColor: 0xa6b2d6 })   // l'arène du PvP
    expect(S.sun.position.toArray()).toEqual([20, 40, 10])
  })

  it('avec sunPos, il va où on le demande', () => {
    S.setLighting({ sunPos: [-30, 23, 95] })
    expect(S.sun.position.toArray()).toEqual([-30, 23, 95])
    S.setLighting()
    expect(S.sun.position.toArray()).toEqual([20, 40, 10])
  })

  it('intensités et couleurs comme avant, défauts compris', () => {
    S.setLighting({ sunI: 0.6, sunColor: 0x9fb0dd })
    expect([S.ambient.intensity, S.ambient.color.getHex()]).toEqual([0.6, 0xfff0e0])
    expect([S.sun.intensity, S.sun.color.getHex()]).toEqual([0.6, 0x9fb0dd])
    expect(S.fill.intensity).toBe(0.4)
  })
})

describe('initScene : le profil hors mission', () => {
  it('plans de 0,1 à 200 m, soleil en (20, 40, 10) visé vers l\'origine, cadre d\'ombre de ±60 m, brume du menu', () => {
    // Profil d'une scène neuve : initScene la recrée, avec sa caméra et ses lumières.
    S.initScene()
    const { camera, scene, sun } = S
    const o = sun.shadow.camera
    expect([camera.near, camera.far]).toEqual([0.1, 200])
    expect(projection(camera)).toEqual(projection(new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.1, 200)))
    expect(sun.position.toArray()).toEqual([20, 40, 10])
    expect(new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld).toArray()).toEqual([0, 0, 0])
    expect([o.left, o.right, o.top, o.bottom]).toEqual([-60, 60, 60, -60])
    expect(projection(o)).toEqual(projection(new THREE.OrthographicCamera(-60, 60, 60, -60, 0.5, 200)))
    expect(scene.fog.isFog && !scene.fog.isFogExp2).toBe(true)
    expect([scene.fog.color.getHex(), scene.fog.near, scene.fog.far]).toEqual([0x87a0b0, 50, 140])
  })
})
