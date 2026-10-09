import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Départ d'une manche PvP pendant le chargement des modèles (spec du lot 1 §4.4 et §6) : la manche attend les modèles
// derrière l'écran PRÉPARATION DU DOSSIER, sinon la foule et l'avatar seraient procéduraux (et l'avatar du
// contre-tueur, sans modèle, invisible). Le relais envoie le départ dès que les deux joueurs sont là : celui dont les
// modèles arrivent encore attend chez lui, son intro de rôle et son chrono partent ensuite (ils sont locaux).
// Vrai net.js sur un faux WebSocket, vrai characters.js dont on pilote la fin du chargement.

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
const intro = vi.hoisted(() => ({ active: false, onDone: null, role: null, plays: 0 }))
vi.mock('../../src/pvpIntro.js', () => ({
  playPvpIntro(role, arena, onTick, onDone) { intro.active = true; intro.onDone = onDone; intro.role = role; intro.plays++ },
  isPvpIntroActive: () => intro.active,
  stopPvpIntro() { intro.active = false; intro.onDone = null },
}))
// Chargement des modèles piloté : en cours tant que load.settled est faux, fini quand load.finish() est appelé.
const load = vi.hoisted(() => ({ settled: true, progress: 1, promise: Promise.resolve(), finish: () => {} }))
vi.mock('../../src/characters.js', async (importOriginal) => ({
  ...(await importOriginal()),
  charactersSettled: () => load.settled,
  charactersReady: () => load.promise,
  charactersProgress: () => load.progress,
}))

class FakeWebSocket {
  static OPEN = 1
  static last = null
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWebSocket.last = this }
  send(s) { this.sent.push(JSON.parse(s)) }
  close() { this.readyState = 3; setTimeout(() => this.onclose && this.onclose(), 0) }
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
const wait = ms => new Promise(r => setTimeout(r, ms))
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

// Modèles en cours de chargement jusqu'à load.finish().
beforeEach(() => {
  intro.active = false; intro.onDone = null; intro.role = null; intro.plays = 0
  load.settled = false
  load.progress = 0.4
  load.promise = new Promise(r => { load.finish = () => { load.settled = true; load.progress = 1; r() } })
})

afterEach(async () => {
  load.finish()
  await wait(0)
  if ($('mp-hud').style.display === 'block' || intro.active) FakeWebSocket.last.receive({ t: 'peer_left' })
  if ($('mp-result').style.display === 'flex') $('btn-mp-quit').onclick()
  $('mp-result').style.display = 'none'
  await wait(400)   // fermetures de socket en attente, fondu de l'écran de chargement
})

// Partie créée, départ de manche reçu du relais.
function startMatch(role) {
  $('btn-mp-create').onclick()
  const ws = FakeWebSocket.last
  ws.open()
  ws.receive({ t: 'created', room: 'ABCD' })
  ws.receive({ t: 'start', role, serverTime: 4242 })
  return ws
}
// Objets de la scène à un instant donné ; ce qui a été ajouté ou retiré depuis (la manche retire la rue du menu).
const snap = () => new Set(scene.children)
const added = s => scene.children.filter(o => !s.has(o)).length
const untouched = s => added(s) === 0 && [...s].every(o => scene.children.includes(o))

describe('départ de manche pendant le chargement des modèles', () => {
  it('la manche attend les modèles : rien n\'est monté, pas d\'intro, puis départ à la fin du chargement', async () => {
    const before = snap()
    startMatch('sniper')
    expect(untouched(before)).toBe(true)      // ni arène, ni foule, ni avatar procéduraux
    expect(intro.active).toBe(false)
    await wait(50)
    expect(untouched(before)).toBe(true)
    load.finish()
    await wait(0)
    expect(added(before)).toBeGreaterThan(54)   // arène, 54 PNJ de foule, laser, avatar
    expect(intro.active).toBe(true)
    expect(intro.role).toBe('sniper')
  })

  it('écran PRÉPARATION DU DOSSIER au-delà de 150 ms d\'attente, effacé au départ', async () => {
    startMatch('pnj')
    const screen = $('loading-screen')
    expect(screen.hidden).toBe(true)
    await wait(220)
    expect(screen.hidden).toBe(false)
    expect(screen.classList.contains('on')).toBe(true)
    expect(screen.textContent.replace(/\s+/g, ' ')).toContain('PRÉPARATION DU DOSSIER · 40 %')
    load.finish()
    await wait(0)
    expect(screen.classList.contains('on')).toBe(false)
    await wait(400)
    expect(screen.hidden).toBe(true)
  })

  it('adversaire parti pendant l\'attente : écran de fin, écran de chargement retiré, aucune manche ensuite', async () => {
    const before = snap()
    const ws = startMatch('sniper')
    await wait(220)
    ws.receive({ t: 'peer_left' })
    expect($('mp-result').style.display).toBe('flex')
    expect($('mp-result-title').textContent).toBe('ADVERSAIRE PARTI')
    expect($('loading-screen').classList.contains('on')).toBe(false)
    load.finish()
    await wait(0)
    expect(untouched(before)).toBe(true)
    expect(intro.active).toBe(false)
    expect($('mp-result').style.display).toBe('flex')
  })

  it('relais perdu pendant l\'attente : écran de fin CONNEXION PERDUE, aucune manche ensuite', async () => {
    const before = snap()
    const ws = startMatch('pnj')
    ws.drop()
    expect($('mp-result').style.display).toBe('flex')
    expect($('mp-result-title').textContent).toBe('CONNEXION PERDUE')
    load.finish()
    await wait(0)
    expect(untouched(before)).toBe(true)
    expect(intro.active).toBe(false)
  })

  it('second départ reçu pendant l\'attente : un seul décor monté, celui du dernier départ', async () => {
    const before = snap()
    const ws = startMatch('sniper')
    ws.receive({ t: 'start', role: 'pnj', serverTime: 99 })
    load.finish()
    await wait(0)
    const game = added(before)
    expect(intro.role).toBe('pnj')
    expect(intro.plays).toBe(1)
    ws.receive({ t: 'peer_left' })
    $('btn-mp-quit').onclick()
    // la même manche montée directement : autant d'objets, donc un seul décor dans la partie
    const before2 = snap()
    pvp.buildRoundScene(99, 'pnj')
    expect(added(before2)).toBe(game)
    pvp.releaseRoundScene()
  })

  it('modèles déjà prêts : départ immédiat, dans le même message', () => {
    load.finish()
    const before = snap()
    startMatch('sniper')
    expect(added(before)).toBeGreaterThan(54)
    expect(intro.active).toBe(true)
  })
})
