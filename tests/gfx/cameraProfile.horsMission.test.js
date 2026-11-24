import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'

// Profil de caméra hors mission (spec du lot 3, §2 b et §5 risque 4 ; plan du lot 3a, tâche A3) : une mission pose le
// sien au montage (plans proche et lointain, brume, soleil, cadre d'ombre ; les sous-lots 3c et 3d y mettront 1 700 m de
// plan lointain, une brume exponentielle, un soleil de midi ou de couchant). Rien de cela ne doit déborder hors de la
// mission : le menu (au démarrage, à showMenu et à QUITTER du PvP, qui montent tous le décor du menu) et le départ d'une
// manche PvP reviennent au profil hors mission : plans de 0,1 à 200 m, soleil en (20, 40, 10) visé vers l'origine,
// cadre d'ombre de ±60 m, et la brume du menu (celle de l'arène pour le PvP). La fin de l'enquête est gardée sur la
// vraie enquête par tests/prologue/stop.test.js, et son câblage dans main.js par tests/gfx/main.cameraProfile.test.js.
// Vrais décors (src/maps/menu.js, src/pvp/pvpMap.js), vraie manche PvP (src/pvp/, net.js sur un faux WebSocket) ; la caméra,
// la scène et le soleil sont ceux de src/scene.js, créés comme initScene les crée. setLighting n'y fait rien : la remise à
// zéro doit venir du décor lui-même (le soleil par défaut de setLighting est gardé par tests/gfx/scene.lighting.test.js).
//
// Témoin : avant la tâche (commit 69ab74a), le menu et l'arène ne posent que leur fond et leur brume : après une mission
// au profil de longue distance, la caméra garde ses plans de 1 à 1 700 m, le soleil sa position, sa cible et son cadre
// (vus rouges : menu, départ de manche des deux rôles, QUITTER).

vi.mock('../../src/main.js', () => ({ setCampaignPaused: vi.fn() }))
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  const sun = new THREE.DirectionalLight(0xfff0cc, 1.2)
  sun.position.set(20, 40, 10)
  sun.castShadow = true
  Object.assign(sun.shadow.camera, { near: 0.5, far: 200, left: -60, right: 60, top: 60, bottom: -60 })
  sun.shadow.camera.updateProjectionMatrix()
  const scene = new THREE.Scene()
  scene.add(sun)
  return {
    scene, sun,
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200),
    renderer: { render() {}, domElement: document.createElement('canvas') },
    setLighting() {},
  }
})
const intro = vi.hoisted(() => ({ active: false, onDone: null }))
vi.mock('../../src/pvp/pvpIntro.js', () => ({
  playPvpIntro(role, arena, onTick, onDone) { intro.active = true; intro.onDone = onDone },
  isPvpIntroActive: () => intro.active,
  stopPvpIntro() { intro.active = false; intro.onDone = null },
}))

class FakeWebSocket {
  static OPEN = 1
  static last = null
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWebSocket.last = this }
  send(s) { this.sent.push(JSON.parse(s)) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen && this.onopen() }
  receive(msg) { this.onmessage && this.onmessage({ data: JSON.stringify(msg) }) }
}
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} })
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), pan: param(), type: '', loop: false, buffer: null })
class FakeAudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 100; this.destination = node() }
  createGain() { return node() }
  createOscillator() { return node() }
  createBufferSource() { return node() }
  createBiquadFilter() { return node() }
  createStereoPanner() { return node() }
  createBuffer(ch, length) { return { length, getChannelData: () => new Float32Array(length) } }
}

const $ = (id) => document.getElementById(id)
let scene, camera, sun, buildMenuDecor, pvp

beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
  HTMLElement.prototype.requestPointerLock = function () {}
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ;({ scene, camera, sun } = await import('../../src/scene.js'))
  ;({ buildMenuDecor } = await import('../../src/maps/index.js'))
  pvp = await import('../../src/pvp/index.js')
  pvp.initMultiplayerMenu()
})

afterEach(() => {
  if (intro.active || $('mp-hud').style.display === 'block') FakeWebSocket.last.receive({ t: 'peer_left' })
  if ($('mp-result').style.display === 'flex') $('btn-mp-quit').onclick()
  $('mp-result').style.display = 'none'
})

// Départ de manche reçu du relais, comme dans le jeu (l'intro de rôle commence).
function startMatch(role, serverTime = 4242) {
  intro.active = false; intro.onDone = null
  $('btn-mp-create').onclick()
  const ws = FakeWebSocket.last
  ws.open()
  ws.receive({ t: 'created', room: 'ABCD' })
  ws.receive({ t: 'start', role, serverTime })
  return ws
}

// Une mission au profil de longue distance, posé jusqu'au bout (projections et cible du soleil recalculées), comme le
// posera la base de M4 (sous-lot 3c) : plans de 1 à 1 700 m, brume exponentielle, soleil de midi visé devant le poste,
// cadre d'ombre resserré.
function missionDeLongueDistance() {
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
function etat() {
  const o = sun.shadow.camera
  return {
    plans: [camera.near, camera.far], projection: projection(camera), brume: brumeDe(scene.fog),
    soleil: sun.position.toArray(), cible: new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld).toArray(),
    cadre: [o.left, o.right, o.top, o.bottom], projectionOmbre: projection(o),
  }
}

// Le profil hors mission, au champ et au format du moment (le menu et le PvP règlent le champ eux-mêmes).
function horsMission(brume) {
  return {
    plans: [0.1, 200], projection: projection(new THREE.PerspectiveCamera(camera.fov, camera.aspect, 0.1, 200)), brume,
    soleil: [20, 40, 10], cible: [0, 0, 0],
    cadre: [-60, 60, 60, -60], projectionOmbre: projection(new THREE.OrthographicCamera(-60, 60, 60, -60, 0.5, 200)),
  }
}
const BRUME_DU_MENU = { type: 'lin', couleur: 0x87a0b0, debut: 50, fin: 140 }
const BRUME_DE_L_ARENE = { type: 'lin', couleur: 0x0a0a14, debut: 70, fin: 160 }

describe('après une mission au profil de longue distance', () => {
  it('le menu (démarrage, showMenu, QUITTER du PvP : le décor du menu) revient au profil hors mission, brume du menu', () => {
    missionDeLongueDistance()
    buildMenuDecor()
    expect(etat()).toEqual(horsMission(BRUME_DU_MENU))
  })

  for (const role of ['sniper', 'pnj']) {
    it(`le départ d'une manche PvP (${role}) revient au profil hors mission, brume de l'arène`, () => {
      missionDeLongueDistance()
      startMatch(role)
      expect(intro.active).toBe(true)   // la manche est montée, son intro commence
      expect(etat()).toEqual(horsMission(BRUME_DE_L_ARENE))
    })
  }

  it('QUITTER le PvP : retour au menu, profil hors mission, brume du menu', () => {
    missionDeLongueDistance()
    const ws = startMatch('sniper')
    ws.receive({ t: 'peer_left' })
    $('btn-mp-quit').onclick()
    expect(etat()).toEqual(horsMission(BRUME_DU_MENU))
  })
})
