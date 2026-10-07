import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Décor d'une manche PvP (spec du lot 1 §4.2, tâche L3) : arène (pvpMap.js), foule de 54 PNJ, avatars des deux rôles,
// laser du sniper, pistolet du contre-tueur (enfant de son avatar, armPnj). La fin de manche (releaseRoundScene, que
// endRound et la route ?memtest=1 appellent) libère tout ce que la manche possède, rien des modèles GLB partagés.
// QUITTER passe aussi par releaseRoundScene, et un nouveau décor ne remplace jamais l'ancien sans le retirer.

vi.mock('../../src/main.js', () => ({ setCampaignPaused: vi.fn() }))
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500),
    renderer: { render() {}, domElement: document.createElement('canvas') },
    setLighting() {},
  }
})
const intro = vi.hoisted(() => ({ active: false, onDone: null }))
vi.mock('../../src/pvpIntro.js', () => ({
  playPvpIntro(role, arena, onTick, onDone) { intro.active = true; intro.onDone = onDone },
  isPvpIntroActive: () => intro.active,
  stopPvpIntro() { intro.active = false; intro.onDone = null },
}))
const gltf = vi.hoisted(() => ({ loaded: [] }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeCharacter } = await import('./fakeGltf.js')
  return {
    GLTFLoader: class {
      async loadAsync(url) { const g = fakeCharacter(); gltf.loaded.push({ url, ...g }); return g }
    },
  }
})

import * as THREE from 'three'
import { createFakeRenderer, trackDisposals } from './fakeRenderer.js'
import { resourcesOf, countDisposals } from './fakeGltf.js'

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
const HTML = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

// Modules neufs à chaque test (cache des modèles, ressources déjà libérées par dispose.js, état de la manche) ; le
// DOM du jeu est remis à neuf, les écouteurs de pvp.js réenregistrés.
let pvp, scene, MAP_BUILDERS
beforeEach(async () => {
  vi.resetModules()
  gltf.loaded = []
  document.body.innerHTML = HTML.slice(HTML.indexOf('<body'), HTML.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
  HTMLElement.prototype.requestPointerLock = function () {}
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ;({ scene } = await import('../../src/scene.js'))
  ;({ MAP_BUILDERS } = await import('../../src/maps.js'))
  await (await import('../../src/characters.js')).preloadCharacters()
  pvp = await import('../../src/pvp.js')
  pvp.initMultiplayerMenu()
  scene.clear()
  MAP_BUILDERS[0]()   // la rue derrière le menu, comme au démarrage
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

// Objets ajoutés à la scène par fn.
const addedBy = fn => { const before = new Set(scene.children); fn(); return scene.children.filter(o => !before.has(o)) }
const glbResources = () => gltf.loaded.flatMap(g => resourcesOf(g.scene))
// Le groupe d'un avatar (contre-tueur) : le seul ajout qui porte un modèle animé sans être un PNJ de la foule. Il est
// ajouté en dernier par buildRoundScene.
const avatarGroup = added => added[added.length - 1]

describe('fin de manche, niveau 1 : tout ce que la manche possède est libéré, rien des modèles partagés', () => {
  for (const role of ['sniper', 'pnj']) {
    it(`rôle ${role} : arène, foule, avatar, laser et pistolet`, () => {
      const added = addedBy(() => pvp.buildRoundScene(4242, role))
      expect(added.length).toBeGreaterThan(54 + 100)
      // Pistolet du contre-tueur armé : un maillage ajouté au groupe de son avatar, comme armPnj
      const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.4), new THREE.MeshStandardMaterial())
      avatarGroup(added).add(pistol)
      createFakeRenderer().render(scene)   // textures d'os de la foule et de l'avatar
      const tracks = added.map(o => trackDisposals(o))
      const glb = countDisposals(glbResources())
      pvp.releaseRoundScene()
      for (const o of added) expect(scene.children).not.toContain(o)
      expect(tracks.flatMap(t => t.leaks())).toEqual([])
      expect(tracks.flatMap(t => t.sharedFreed())).toEqual([])
      expect(glb.labels).toEqual([])
      pvp.releaseRoundScene()   // idempotente : rien de plus
      expect(tracks.flatMap(t => t.freedTwice())).toEqual([])
    })
  }
})

describe('fin de manche, niveau 2 : faux renderer', () => {
  it('5 arènes de suite (même graine, comme la route ?memtest=1) : Δ = 0 après la 1re', () => {
    const r = createFakeRenderer()
    const mounted = [], released = []
    for (let i = 0; i < 5; i++) {
      pvp.buildRoundScene(4242, 'sniper')
      r.render(scene)
      mounted.push(r.info())
      pvp.releaseRoundScene()
      r.render(scene)
      released.push(r.info())
    }
    expect(mounted[0].textures).toBeGreaterThanOrEqual(55 * 2)   // une texture d'os par maillage animé (foule, avatar)
    for (const c of mounted) expect(c).toEqual(mounted[0])
    for (const c of released) expect(c).toEqual(released[0])
  })
})

describe('QUITTER et nouveau décor', () => {
  it('QUITTER avec une manche encore montée retire et libère tout, la rue revient', () => {
    const added = addedBy(() => pvp.buildRoundScene(77, 'sniper'))
    createFakeRenderer().render(scene)
    const tracks = added.map(o => trackDisposals(o))
    $('btn-mp-quit').onclick()
    for (const o of added) expect(scene.children).not.toContain(o)
    expect(tracks.flatMap(t => t.leaks())).toEqual([])
    expect(scene.background.getHexString()).toBe('87a0b0')   // la rue du menu
  })

  it('deux décors de suite sans fin de manche : l\'ancien ne reste pas dans la scène', () => {
    const first = addedBy(() => pvp.buildRoundScene(77, 'sniper'))
    createFakeRenderer().render(scene)
    const tracks = first.map(o => trackDisposals(o))
    pvp.buildRoundScene(78, 'sniper')
    for (const o of first) expect(scene.children).not.toContain(o)
    expect(tracks.flatMap(t => t.leaks())).toEqual([])
    pvp.releaseRoundScene()
  })

  it('départ de manche reçu pendant une manche (relais) : l\'avatar de l\'adversaire n\'est pas remplacé sans être retiré', () => {
    $('btn-mp-create').onclick()
    const ws = FakeWebSocket.last
    ws.open()
    ws.receive({ t: 'created', room: 'ABCD' })
    const first = addedBy(() => ws.receive({ t: 'start', role: 'sniper', serverTime: 111 }))
    const avatar = avatarGroup(first)
    ws.receive({ t: 'start', role: 'sniper', serverTime: 222 })
    expect(scene.children).not.toContain(avatar)
    const crowdLeft = first.filter(o => scene.children.includes(o))
    expect(crowdLeft).toEqual([])
  })
})
