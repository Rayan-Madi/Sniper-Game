import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Perte du relais en pleine partie : net.js émet 'disconnected' quand la
// socket se ferme. Sans écouteur, la manche continuait seule (les messages
// partent dans le vide). On rejoue un vrai démarrage de manche par la socket
// (faux WebSocket), avec le vrai net.js, puis on coupe la liaison.

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
// Intro pilotable : on décide quand elle se termine.
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
  close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 0) }
  // côté serveur
  open() { this.readyState = 1; this.onopen && this.onopen() }
  receive(msg) { this.onmessage && this.onmessage({ data: JSON.stringify(msg) }) }
  drop() { this.readyState = 3; this.onclose && this.onclose() }
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
let pvp

beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
  HTMLElement.prototype.requestPointerLock = function () {}
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('requestAnimationFrame', () => 1)   // la boucle ne tourne qu'une fois, à la main
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  pvp = await import('../../src/pvp.js')
  pvp.initMultiplayerMenu()
})

// Crée une partie et reçoit le départ de manche : l'intro de rôle est en cours.
function startMatch(role) {
  intro.active = false; intro.onDone = null
  $('btn-mp-create').onclick()
  const ws = FakeWebSocket.last
  ws.open()
  ws.receive({ t: 'created', room: 'ABCD' })
  ws.receive({ t: 'start', role, serverTime: 123456 })
  expect(intro.active).toBe(true)
  expect($('mp-result').style.display).not.toBe('flex')
  return ws
}

afterEach(async () => {
  // Retour au menu entre deux scénarios (sans fin de manche, l'écran de fin n'a pas de bouton visible).
  // Une manche restée ouverte est d'abord close proprement (départ de l'adversaire).
  if ($('mp-hud').style.display === 'block') FakeWebSocket.last.receive({ t: 'peer_left' })
  if ($('mp-result').style.display === 'flex') $('btn-mp-quit').onclick()
  $('mp-result').style.display = 'none'
  await new Promise(r => setTimeout(r, 5))         // les fermetures de socket en attente arrivent ici
})

describe('perte du relais en PvP', () => {
  beforeEach(() => { $('mp-hud').style.display = 'none' })

  it('pendant l\'intro : l\'intro s\'arrête et l\'écran de fin s\'affiche, sans revanche', () => {
    const ws = startMatch('sniper')
    ws.drop()
    expect(intro.active).toBe(false)
    expect($('mp-result').style.display).toBe('flex')
    expect($('mp-result-title').textContent).toBe('CONNEXION PERDUE')
    expect($('btn-mp-rematch').style.display).toBe('none')
  })

  it('en pleine manche : la manche s\'arrête (HUD masqué, écran de fin, sans revanche)', () => {
    const ws = startMatch('pnj')
    intro.active = false; intro.onDone()        // fin de l'intro : la manche démarre
    expect($('mp-hud').style.display).toBe('block')
    ws.drop()
    expect($('mp-hud').style.display).toBe('none')
    expect($('mp-result').style.display).toBe('flex')
    expect($('mp-result-title').textContent).toBe('CONNEXION PERDUE')
    expect($('btn-mp-rematch').style.display).toBe('none')
  })

  it('adversaire parti puis socket fermée : un seul écran de fin, celui du départ de l\'adversaire', () => {
    const ws = startMatch('sniper')
    intro.active = false; intro.onDone()
    ws.receive({ t: 'peer_left' })
    const title = $('mp-result-title').textContent
    expect($('mp-result').style.display).toBe('flex')
    ws.drop()
    expect($('mp-result-title').textContent).toBe(title)
  })

  it('annuler la création de partie ne montre pas d\'écran de fin', async () => {
    $('btn-mp-create').onclick()
    const ws = FakeWebSocket.last
    ws.open()
    $('btn-mp-create-cancel').onclick()
    await new Promise(r => setTimeout(r, 5))       // l'événement close arrive après coup
    expect(ws.readyState).toBe(3)
    expect($('mp-result').style.display).not.toBe('flex')
  })

  // Une socket remplacée (net.connect) ou abandonnée (net.disconnect) peut
  // annoncer sa fermeture après coup : elle ne doit pas couper la manche
  // jouée sur la nouvelle socket.
  it('code erroné puis nouvel essai : la fermeture tardive de l\'ancienne socket ne coupe pas la manche', async () => {
    intro.active = false; intro.onDone = null
    $('btn-mp-join-show').onclick()
    $('mp-join-input').value = 'ZZZZ'
    $('btn-mp-join-go').onclick()
    const old = FakeWebSocket.last
    old.open()
    old.receive({ t: 'error', message: 'Room introuvable.' })
    $('mp-join-input').value = 'ABCD'
    $('btn-mp-join-go').onclick()                  // net.connect ferme l'ancienne socket
    const ws = FakeWebSocket.last
    expect(ws).not.toBe(old)
    ws.open()
    ws.receive({ t: 'joined', room: 'ABCD' })
    ws.receive({ t: 'start', role: 'pnj', serverTime: 123456 })
    intro.active = false; intro.onDone()           // la manche démarre avant l'écho du close
    await new Promise(r => setTimeout(r, 5))
    expect(old.readyState).toBe(3)
    expect($('mp-result').style.display).not.toBe('flex')
    expect($('mp-hud').style.display).toBe('block')
  })

  it('annuler puis recréer : la fermeture tardive de la socket annulée ne coupe pas la manche', async () => {
    $('btn-mp-create').onclick()
    const old = FakeWebSocket.last
    old.open()
    $('btn-mp-create-cancel').onclick()            // net.disconnect : le close arrive plus tard
    startMatch('sniper')
    intro.active = false; intro.onDone()
    await new Promise(r => setTimeout(r, 5))
    expect(old.readyState).toBe(3)
    expect($('mp-result').style.display).not.toBe('flex')
    expect($('mp-hud').style.display).toBe('block')
  })
})
