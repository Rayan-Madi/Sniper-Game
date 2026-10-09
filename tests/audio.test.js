import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Audio (spec du lot 1 §4.2, tâche L3). La nappe de mission baisse en 1,2 s quand la mission s'arrête : son gain doit
// être débranché du maître à la fin de ce fondu, sinon chaque mission laisse un nœud branché. Le PvP joue sur le
// contexte commun d'audio.js, à travers son maître : un seul AudioContext, et le volume du jeu s'applique au PvP.

vi.mock('../src/main.js', () => ({ setCampaignPaused: vi.fn() }))
vi.mock('../src/scene.js', async () => {
  const THREE = await import('three')
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500),
    renderer: { render() {}, domElement: document.createElement('canvas') },
    setLighting() {},
  }
})
const intro = vi.hoisted(() => ({ onDone: null }))
vi.mock('../src/pvpIntro.js', () => ({
  playPvpIntro(role, arena, onTick, onDone) { intro.onDone = onDone },
  isPvpIntroActive: () => !!intro.onDone,
  stopPvpIntro() { intro.onDone = null },
}))

// Faux AudioContext horodaté : currentTime avance à la main ; chaque nœud sait à quoi il est branché et qui lui est
// branché ; les paramètres gardent leurs automatisations.
const param = () => ({
  value: 0, events: [],
  setValueAtTime(v, t) { this.events.push(['set', v, t]) },
  linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]) },
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]) },
})
// Nœuds créés depuis le début du test (sons du tir), dans l'ordre.
const created = []
function node(kind) {
  const n = {
    kind, inputs: new Set(), outputs: new Set(), gain: param(), frequency: param(), pan: param(), Q: param(),
    type: '', loop: false, buffer: null, startAt: null, stopAt: null,
    connect(n) { this.outputs.add(n); n.inputs.add(this); return n },
    disconnect() { for (const o of this.outputs) o.inputs.delete(this); this.outputs.clear() },
    start(t = 0) { this.startAt = t }, stop(t = 0) { this.stopAt = t },
  }
  created.push(n)
  return n
}
class ClockedAudioContext {
  static made = 0
  constructor() { ClockedAudioContext.made++; this.currentTime = 0; this.sampleRate = 100; this.state = 'running'; this.destination = node('destination') }
  createGain() { return node('gain') }
  createOscillator() { return node('oscillator') }
  createBufferSource() { return node('buffer') }
  createBiquadFilter() { return node('filter') }
  createStereoPanner() { return node('panner') }
  createBuffer(ch, length) { return { length, getChannelData: () => new Float32Array(length) } }
}

beforeEach(() => {
  vi.resetModules()
  ClockedAudioContext.made = 0
  created.length = 0
  vi.stubGlobal('AudioContext', ClockedAudioContext)
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

// Gains branchés sur le maître (la nappe en est un).
const gainsOn = master => [...master.inputs].filter(n => n.kind === 'gain')

describe('nappe de mission', () => {
  it('stopMissionAmbience baisse le gain en 1,2 s puis le débranche du maître, une fois le fondu fini à l\'horloge audio', async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext(), master = audio.masterNode()
    audio.startMissionAmbience()
    const [amb] = gainsOn(master)
    expect(amb).toBeDefined()
    ctx.currentTime = 10
    audio.stopMissionAmbience()
    expect(amb.gain.events.at(-1)).toEqual(['linear', 0.0001, 11.2])   // fondu jusqu'à 11,2 s
    ctx.currentTime = 11; vi.advanceTimersByTime(1000)
    expect(master.inputs.has(amb)).toBe(true)                           // en plein fondu : toujours branché
    vi.advanceTimersByTime(1000)                                        // 2 s de minuteur, horloge audio en retard
    expect(master.inputs.has(amb)).toBe(true)                           // à 11 s, le fondu n'est pas fini
    ctx.currentTime = 11.3; vi.advanceTimersByTime(1000)
    expect(master.inputs.has(amb)).toBe(false)                          // fondu fini : débranché
    expect(vi.getTimerCount()).toBe(0)
  })

  it('relancée avant la fin du fondu : l\'ancienne nappe est débranchée, la nouvelle reste branchée', async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext(), master = audio.masterNode()
    audio.startMissionAmbience()
    const [first] = gainsOn(master)
    audio.stopMissionAmbience()
    audio.startMissionAmbience()                 // REVOIR LE BRIEFING puis retour, mission relancée…
    const second = gainsOn(master).find(g => g !== first)
    expect(second).toBeDefined()
    audio.stopMissionAmbience()                  // second arrêt : n'arrête que la nappe en cours
    audio.startMissionAmbience()
    const third = gainsOn(master).find(g => g !== first && g !== second)
    ctx.currentTime = 2; vi.advanceTimersByTime(2000)
    expect(master.inputs.has(first)).toBe(false)
    expect(master.inputs.has(second)).toBe(false)
    expect(master.inputs.has(third)).toBe(true)
    audio.stopMissionAmbience()
    audio.stopMissionAmbience()                  // arrêt en double (échec puis menu) : sans effet
    ctx.currentTime = 4; vi.advanceTimersByTime(2000)
    expect(gainsOn(master)).toEqual([])
  })
})

describe('sons du PvP', () => {
  const $ = id => document.getElementById(id)
  class FakeWebSocket {
    static OPEN = 1
    static last = null
    constructor() { this.readyState = 0; FakeWebSocket.last = this }
    send() {}
    close() { this.readyState = 3 }
  }

  async function playRound() {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8')
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
    HTMLElement.prototype.requestPointerLock = function () {}
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const audio = await import('../src/audio.js')
    const pvp = await import('../src/pvp.js')
    pvp.initMultiplayerMenu()
    audio.audioContext()   // le contexte du jeu (sons du menu, cinématiques)
    $('btn-mp-create').onclick()
    const ws = FakeWebSocket.last
    ws.readyState = 1; ws.onopen()
    const msg = m => ws.onmessage({ data: JSON.stringify(m) })
    msg({ t: 'created', room: 'ABCD' })
    msg({ t: 'start', role: 'sniper', serverTime: 99 })
    intro.onDone()                               // fin de l'intro : musique et brouhaha de la fête
    vi.advanceTimersByTime(900)                  // quelques temps de musique
    msg({ t: 'ability', kind: 'phone' })         // sonnerie positionnée
    msg({ t: 'ability', kind: 'alarm' })         // alarme (bips)
    return audio
  }

  it('un seul AudioContext pour tout le jeu : le PvP n\'en crée pas', async () => {
    await playRound()
    expect(ClockedAudioContext.made).toBe(1)
  })

  it('tout le PvP passe par le maître du jeu (le volume s\'y applique) : seul le maître va aux haut-parleurs', async () => {
    const audio = await playRound()
    const master = audio.masterNode()
    expect([...audio.audioContext().destination.inputs]).toEqual([master])
    expect(master.inputs.size).toBeGreaterThan(3)   // musique, sonnerie, bips de l'alarme
  })

  it('garde sur le source : pvp.js n\'instancie aucun AudioContext', () => {
    const src = readFileSync(resolve(__dirname, '../src/pvp.js'), 'utf8')
    expect(src).not.toMatch(/AudioContext\s*\|\||new\s*\(?\s*(window\.)?(webkit)?AudioContext/)
  })
})

// Sons du coup de feu (spec du lot 2, §3.3 et §3.5 ; plan, tâche T3) : un « crack » supersonique bref en plus de la
// détonation (le tir au silencieux garde son son), et la culasse, ouverte puis refermée (instants donnés par
// src/shot/bolt.js, joués par la boucle de main.js).
describe('sons du coup de feu', () => {
  // Le nœud atteint-il le maître (par ses sorties, de proche en proche) ?
  const reaches = (n, master, seen = new Set()) => n === master || (!seen.has(n) && (seen.add(n), [...n.outputs].some(o => reaches(o, master, seen))))
  // Sources de bruit d'un son, avec le filtre qui les suit : { filtre, type, freq, duree (s) }.
  const bruits = ctx => created.filter(n => n.kind === 'buffer').map(src => {
    const f = [...src.outputs].find(o => o.kind === 'filter')
    return { src, type: f?.type, freq: f?.frequency.value, duree: src.buffer.length / ctx.sampleRate }
  })
  // Gain de départ le plus fort parmi les nœuds créés (le niveau du son).
  const pic = () => Math.max(0, ...created.filter(n => n.kind === 'gain').flatMap(g => g.gain.events.filter(e => e[0] === 'set').map(e => e[1])))
  const crack = ctx => bruits(ctx).filter(b => b.type === 'highpass' && b.freq >= 2000 && b.duree <= 0.03)

  it('tir sans silencieux : la détonation et un crack supersonique bref (bruit aigu de 30 ms au plus), vers le maître', async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext(), master = audio.masterNode()
    created.length = 0
    audio.playShot()
    const c = crack(ctx)
    expect(c.length, 'crack').toBe(1)
    expect(reaches(c[0].src, master)).toBe(true)
    expect(created.some(n => n.kind === 'oscillator' && n.type === 'sawtooth'), "détonation d'avant le lot 2").toBe(true)
  })

  // Non-régression : « avec silencieux, le son actuel » (spec §3.5).
  it("tir au silencieux : le son d'avant, sans crack", async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext()
    created.length = 0
    audio.playSilencedShot()
    expect(crack(ctx)).toEqual([])
    expect(bruits(ctx).map(b => [b.type, b.freq])).toEqual([['bandpass', 800]])
  })

  for (const nom of ['playBoltOpen', 'playBoltClose']) {
    it(`${nom} : un claquement métallique bref, plus discret que le tir, vers le maître`, async () => {
      const audio = await import('../src/audio.js')
      const ctx = audio.audioContext(), master = audio.masterNode()
      created.length = 0
      audio.playShot()
      const tir = pic()
      created.length = 0
      ctx.currentTime = 3
      audio[nom]()
      const b = bruits(ctx)
      expect(b.length, 'bruits du mécanisme').toBeGreaterThanOrEqual(1)
      expect(b.some(x => x.freq >= 1500), 'métallique : bruit filtré haut').toBe(true)
      expect(b.every(x => reaches(x.src, master))).toBe(true)
      const fin = Math.max(...created.filter(n => n.stopAt !== null).map(n => n.stopAt))
      expect(fin - 3, 'bref').toBeLessThanOrEqual(0.3)
      expect(Math.min(...created.filter(n => n.startAt !== null).map(n => n.startAt)), 'joué maintenant').toBeGreaterThanOrEqual(3)
      expect(pic(), 'plus discret que le tir').toBeLessThanOrEqual(tir / 2)
    })
  }
})
