import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Décor d'une manche PvP : buildRoundScene (arène, foule, laser, avatar) et releaseRoundScene sont ceux du jeu
// (onMatchStart, endRound) et ceux de la route ?memtest=1, qui monte des arènes hors réseau. On vérifie que la route
// monte exactement ce que monte un vrai départ de manche, et que la fin de manche retire tout ce qui a été ajouté.

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
let pvp, scene

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
  ;({ scene } = await import('../../src/scene.js'))
  pvp = await import('../../src/pvp.js')
  pvp.initMultiplayerMenu()
})

afterEach(() => {
  if ($('mp-result').style.display === 'flex') $('btn-mp-quit').onclick()
  $('mp-result').style.display = 'none'
})

// Départ de manche reçu du relais (intro de rôle en cours), comme dans le jeu.
function startMatch(role, serverTime) {
  intro.active = false; intro.onDone = null
  $('btn-mp-create').onclick()
  const ws = FakeWebSocket.last
  ws.open()
  ws.receive({ t: 'created', room: 'ABCD' })
  ws.receive({ t: 'start', role, serverTime })
  return ws
}

// Empreinte des objets de la scène : type et position. L'avatar (dernier ajouté) est placé ensuite par setupSniper
// ou setupPnj : seul son type compte.
const print = o => `${o.type}@${o.position.toArray().map(v => v.toFixed(3)).join(',')}`
const fingerprint = () => scene.children.map((o, i) => i === scene.children.length - 1 ? o.type : print(o))
// Objets ajoutés à la scène par fn (la manche retire aussi la rue du menu : seuls les ajouts comptent).
const addedBy = fn => { const before = new Set(scene.children); fn(); return scene.children.filter(o => !before.has(o)) }
const stillThere = objs => objs.filter(o => scene.children.includes(o)).length

describe('décor d\'une manche PvP', () => {
  it('buildRoundScene monte exactement ce que monte un départ de manche (même seed, même rôle)', () => {
    let ws
    const added = addedBy(() => { ws = startMatch('sniper', 777) })
    const game = fingerprint()
    expect(added.length).toBeGreaterThan(54)   // arène, 54 PNJ de foule, laser, avatar
    ws.receive({ t: 'peer_left' })              // fin de manche : endRound
    expect(stillThere(added)).toBe(0)

    const route = addedBy(() => pvp.buildRoundScene(777, 'sniper'))
    expect(fingerprint()).toEqual(game)
    expect(route.length).toBe(added.length)
    pvp.releaseRoundScene()
    expect(stillThere(route)).toBe(0)
  })

  it('la fin de manche retire tout ce que la manche a ajouté, pour les deux rôles', () => {
    for (const role of ['sniper', 'pnj']) {
      let ws
      const added = addedBy(() => { ws = startMatch(role, 4242) })
      expect(added.length).toBeGreaterThan(54)
      ws.receive({ t: 'peer_left' })
      expect(stillThere(added)).toBe(0)
      $('btn-mp-quit').onclick()
    }
  })

  it('pièces d\'arme cachées chez le sniper, visibles chez le contre-tueur', () => {
    const sniper = pvp.buildRoundScene(9, 'sniper')
    expect(sniper.partSpots.length).toBeGreaterThan(0)
    expect(sniper.partSpots.every(p => p.mesh.visible === false)).toBe(true)
    pvp.releaseRoundScene()
    const pnj = pvp.buildRoundScene(9, 'pnj')
    expect(pnj.partSpots.every(p => p.mesh.visible === true)).toBe(true)
    pvp.releaseRoundScene()
  })
})
