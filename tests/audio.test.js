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
  setTargetAtTime(v, t, tc) { this.events.push(['target', v, t, tc]) },
  cancelScheduledValues(t) { this.events.push(['cancel', t]) },
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
  createConvolver() { const n = node('convolver'); n.normalize = true; return n }
  createBuffer(ch, length, sampleRate) {
    const data = Array.from({ length: ch }, () => new Float32Array(length))
    return { numberOfChannels: ch, length, sampleRate, getChannelData: i => data[i] }
  }
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

// Son du tir, tâche T6 (spec du lot 2, §3.5) : l'impact de ce que la balle touche, joué distance / 343 s après son
// arrivée (le calendrier vient de src/shot/soundPlan.js) ; l'écho de la carte, une seule ConvolverNode par mission
// (réponse de src/shot/acoustics.js), où partent le départ du coup et les impacts lointains, à SON.echoDb, libérée au
// démontage ; plus de bip d'arcade ; la pluie de l'enquête reprise par la mission du port, avec fondus.
//
// Témoins (avant la tâche T6, commit ea35614) : aucun écho (mountEcho et unmountEcho n'existaient pas : sans effet),
// l'arrivée de la balle ne sonnait que le bip d'une cible touchée, tout de suite (playKill), le décor rien, et la nappe
// de mission n'avait jamais de pluie. Les tests tournent sur ces règles quand les fonctions manquent (vus rouges).
const { SON } = await import('../src/shot/tuning.js')
const { impulseResponse } = await import('../src/shot/acoustics.js')
const avantT6 = audio => ({
  mountEcho: audio.mountEcho ?? (() => {}),
  unmountEcho: audio.unmountEcho ?? (() => {}),
  playShotSounds: audio.playShotSounds ?? (plan => { if (plan.some(s => s.son === 'impact-chair')) audio.playKill() }),
  audioState: audio.audioState ?? (() => ({})),
})
// Le signal de n atteint-il cible (par ses sorties, de proche en proche) ?
const atteint = (n, cible, vus = new Set()) => n === cible || (!vus.has(n) && (vus.add(n), [...n.outputs].some(o => atteint(o, cible, vus))))
const sources = () => created.filter(n => n.kind === 'oscillator' || n.kind === 'buffer')
const convolvers = () => created.filter(n => n.kind === 'convolver')
const IMPACTS = ['impact-chair', 'impact-metal', 'impact-pierre', 'impact-bois', 'impact-sol']

describe("sons de l'arrivée de la balle", () => {
  for (const son of IMPACTS) {
    it(`${son} : joué à l'instant du calendrier (0,1 s plus tard), bref, vers le maître`, async () => {
      const audio = await import('../src/audio.js')
      const ctx = audio.audioContext(), master = audio.masterNode()
      const a = avantT6(audio)
      ctx.currentTime = 5
      created.length = 0
      a.playShotSounds([{ son, at: 0.1, echo: false }])
      const s = sources()
      expect(s.length, 'sons joués').toBeGreaterThan(0)
      expect(Math.min(...s.map(n => n.startAt))).toBeCloseTo(5.1, 9)
      for (const n of s) {
        expect(n.startAt).toBeGreaterThanOrEqual(5.1 - 1e-9)
        expect(n.stopAt - 5.1, 'bref').toBeLessThanOrEqual(0.6)
        expect(atteint(n, master)).toBe(true)
      }
    })
  }

  // Composantes d'un son : [nature, forme d'onde ou filtre, fréquence], triées.
  const freqDe = n => (n.kind === 'oscillator' ? (n.frequency.events[0]?.[1] ?? n.frequency.value)
    : [...n.outputs].find(o => o.kind === 'filter')?.frequency.value ?? 0)
  const composantes = () => sources().map(n => {
    const f = [...n.outputs].find(o => o.kind === 'filter')
    return n.kind === 'oscillator' ? `osc:${n.type}:${Math.round(freqDe(n))}` : `bruit:${f?.type}:${Math.round(freqDe(n))}`
  }).sort().join(' ')
  const ecoute = async son => {
    const audio = await import('../src/audio.js')
    audio.audioContext()
    created.length = 0
    avantT6(audio).playShotSounds([{ son, at: 0, echo: false }])
    return { composantes: composantes(), s: sources() }
  }

  it('chaque matière a son propre son', async () => {
    const vus = new Set()
    for (const son of IMPACTS) vus.add((await ecoute(son)).composantes)
    expect(vus.size).toBe(IMPACTS.length)
  })

  it('la chair : un son mat, sans note (rien de tonal au-dessus de 200 Hz, bruit filtré sous 1,5 kHz)', async () => {
    const { s } = await ecoute('impact-chair')
    expect(s.length).toBeGreaterThan(0)
    for (const n of s) expect(freqDe(n), n.kind).toBeLessThanOrEqual(n.kind === 'oscillator' ? 200 : 1500)
  })

  it('le métal : un claquement aigu qui sonne (une note au-dessus de 1,5 kHz tenue 0,15 s au moins)', async () => {
    const { s } = await ecoute('impact-metal')
    const notes = s.filter(n => n.kind === 'oscillator' && freqDe(n) >= 1500 && n.stopAt - n.startAt >= 0.15)
    expect(notes.length).toBeGreaterThan(0)
  })

  it('plan vide ou son inconnu : silence, sans erreur', async () => {
    const audio = await import('../src/audio.js')
    audio.audioContext()
    created.length = 0
    const a = avantT6(audio)
    expect(() => { a.playShotSounds([]); a.playShotSounds([{ son: 'inconnu', at: 0 }]) }).not.toThrow()
    expect(sources()).toEqual([])
  })

  // Relecture de T6 : le niveau des sons d'impact se règle dans tuning.js (SON.impactDb, en dB par rapport à la
  // recette d'audio.js), comme celui de l'écho : Rayan règle son tir dans un seul fichier (spec du lot 2, §3.1 et
  // §3.8). Témoin vu rouge : les niveaux étaient écrits en dur dans audio.js, la table de réglage restait sans effet.
  it("le niveau de chaque son d'impact se règle dans tuning.js (SON.impactDb, en dB)", async () => {
    const { SON: reglages } = await import('../src/shot/tuning.js')   // l'instance que lit audio.js (modules remis à neuf)
    const audio = await import('../src/audio.js')
    audio.audioContext()
    // Gain de départ de chaque composante (source → filtre éventuel → gain)
    const gainDeSource = n => { let g = n; while (g && g.kind !== 'gain') g = [...g.outputs][0]; return g.gain.events.find(e => e[0] === 'set')[1] }
    const niveaux = son => {
      created.length = 0
      avantT6(audio).playShotSounds([{ son, at: 0, echo: false }])
      return sources().map(gainDeSource)
    }
    const recette = Object.fromEntries(IMPACTS.map(son => [son, niveaux(son)]))
    reglages.impactDb = { ...reglages.impactDb, metal: 6, chair: -6 }
    for (const son of IMPACTS) {
      const k = { 'impact-metal': 10 ** (6 / 20), 'impact-chair': 10 ** (-6 / 20) }[son] ?? 1
      const n = niveaux(son)
      expect(n.length, son).toBe(recette[son].length)
      n.forEach((v, i) => expect(v, `${son}, composante ${i}`).toBeCloseTo(recette[son][i] * k, 9))
    }
  })
})

describe("plus de bip d'arcade", () => {
  it("audio.js n'a plus le bip de confirmation (880 puis 660 Hz) : c'est le son de l'impact qui confirme", async () => {
    const audio = await import('../src/audio.js')
    expect(audio.playKill).toBeUndefined()
  })
})

describe('écho de la carte', () => {
  const monte = async (acoustique = 'port') => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext(), master = audio.masterNode()
    const a = avantT6(audio)
    created.length = 0
    a.mountEcho(acoustique)
    return { audio, ctx, master, a, conv: convolvers()[0] }
  }

  it("une ConvolverNode, chargée de la réponse de l'acoustique (stéréo, à graine), vers le maître", async () => {
    const { ctx, master, conv, a } = await monte('port')
    expect(convolvers().length).toBe(1)
    const ir = impulseResponse('port', ctx.sampleRate)
    expect(conv.buffer.numberOfChannels).toBe(2)
    expect(conv.buffer.length).toBe(ir.length)
    expect(conv.buffer.getChannelData(0)).toEqual(ir.canaux[0])
    expect(conv.buffer.getChannelData(1)).toEqual(ir.canaux[1])
    expect(atteint(conv, master)).toBe(true)
    expect(a.audioState().echo).toBe('port')
  })

  it(`l'envoi vers l'écho est à ${SON.echoDb} dB`, async () => {
    const { conv } = await monte('rue')
    const envois = [...(conv?.inputs ?? [])]
    expect(envois.length).toBe(1)
    expect(envois[0].kind).toBe('gain')
    expect(envois[0].gain.value).toBeCloseTo(10 ** (SON.echoDb / 20), 6)
  })

  it('le départ du coup y part, détonation et crack, comme le tir au silencieux', async () => {
    const { audio, conv, master } = await monte('place')
    for (const tir of ['playShot', 'playSilencedShot']) {
      created.length = 0
      audio[tir]()
      expect(sources().length).toBeGreaterThan(0)
      for (const n of sources()) {
        expect(atteint(n, conv), `${tir} : vers l'écho`).toBe(true)
        expect(atteint(n, master), `${tir} : vers le maître`).toBe(true)
      }
    }
  })

  it('un impact lointain y part, pas un impact proche (il va seulement au maître)', async () => {
    const { a, conv, master } = await monte('base')
    created.length = 0
    a.playShotSounds([{ son: 'impact-pierre', at: 0, echo: true }])
    expect(sources().length).toBeGreaterThan(0)
    for (const n of sources()) expect(atteint(n, conv)).toBe(true)
    created.length = 0
    a.playShotSounds([{ son: 'impact-pierre', at: 0, echo: false }])
    expect(sources().length).toBeGreaterThan(0)
    for (const n of sources()) { expect(atteint(n, conv)).toBe(false); expect(atteint(n, master)).toBe(true) }
  })

  it("une seule par mission : remontée (mission relancée), l'ancienne est débranchée et lâchée", async () => {
    const { a, master, conv: premiere } = await monte('port')
    expect(premiere).toBeDefined()
    a.mountEcho('rue')
    const [, seconde] = convolvers()
    expect(seconde).toBeDefined()
    expect(premiere.outputs.size + premiere.inputs.size).toBe(0)
    expect(premiere.buffer).toBeNull()
    expect(created.filter(n => n.kind === 'convolver' && atteint(n, master))).toEqual([seconde])
    expect(a.audioState().echo).toBe('rue')
  })

  it("libérée au démontage : débranchée, réponse lâchée ; le tir suivant ne va plus qu'au maître", async () => {
    const { audio, a, master, conv } = await monte('colline')
    expect(conv).toBeDefined()
    const [envoi] = [...conv.inputs]
    expect(envoi).toBeDefined()
    a.unmountEcho()
    expect(conv.outputs.size + conv.inputs.size).toBe(0)
    expect(envoi.outputs.size).toBe(0)
    expect(conv.buffer).toBeNull()
    expect(a.audioState().echo).toBeNull()
    created.length = 0
    audio.playShot()
    for (const n of sources()) expect(atteint(n, master)).toBe(true)
    expect(() => a.unmountEcho()).not.toThrow()   // démontage en double (menu après un échec)
  })

  it("acoustique inconnue (menu, PvP) : pas d'écho, le tir sonne quand même", async () => {
    const { audio, a, master } = await monte('inconnue')
    a.mountEcho(undefined)
    expect(convolvers()).toEqual([])
    expect(a.audioState().echo).toBeNull()
    created.length = 0
    audio.playShot()
    expect(sources().length).toBeGreaterThan(0)
    for (const n of sources()) expect(atteint(n, master)).toBe(true)
  })
})

describe('pluie du port (M3)', () => {
  // La pluie : une source de bruit qui boucle, démarrée et jamais arrêtée tant qu'elle tombe.
  const pluies = () => created.filter(n => n.kind === 'buffer' && n.loop && n.startAt !== null)
  // Son gain : source → passe-bande → passe-haut → gain.
  const gainDe = src => [...[...[...src.outputs][0].outputs][0].outputs][0]

  it("démarrée avec la mission : la pluie de l'enquête (bruit de 6 s en boucle), qui monte en fondu, vers le maître", async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext(), master = audio.masterNode()
    ctx.currentTime = 3
    created.length = 0
    audio.startMissionAmbience({ rain: true })
    const p = pluies()
    expect(p.length).toBe(1)
    expect(p[0].stopAt).toBeNull()
    expect(p[0].buffer.length).toBeGreaterThanOrEqual(6 * ctx.sampleRate)
    expect(atteint(p[0], master)).toBe(true)
    const montee = gainDe(p[0]).gain.events.find(e => e[0] === 'linear')
    expect(montee?.[1]).toBeGreaterThan(0)
    expect(montee?.[2]).toBeGreaterThan(3)       // un fondu, pas un départ sec
    expect(avantT6(audio).audioState().pluie).toBe(true)
    audio.stopMissionAmbience()
  })

  it('coupée avec la mission : fondu, puis la source arrêtée et débranchée ; aucun minuteur ne reste', async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext(), master = audio.masterNode()
    created.length = 0
    audio.startMissionAmbience({ rain: true })
    const [src] = pluies()
    expect(src).toBeDefined()
    const g = gainDe(src)
    ctx.currentTime = 10
    audio.stopMissionAmbience()
    expect(g.gain.events.some(e => e[0] === 'target' && e[1] <= 0.001 && e[2] === 10)).toBe(true)   // fondu à l'arrêt
    expect(atteint(src, master)).toBe(true)                                                          // pas de coupure sèche
    ctx.currentTime = 12; vi.advanceTimersByTime(3000)
    expect(src.stopAt).not.toBeNull()
    expect(atteint(src, master)).toBe(false)
    expect(avantT6(audio).audioState().pluie).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("contexte audio suspendu : la pluie ne tombe pas (et ne se dit pas tombée) ; le départ suivant la fait tomber", async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext()
    created.length = 0
    ctx.state = 'suspended'
    audio.startMissionAmbience({ rain: true })
    expect(pluies()).toEqual([])
    expect(avantT6(audio).audioState().pluie).toBe(false)
    audio.stopMissionAmbience()
    ctx.state = 'running'
    audio.startMissionAmbience({ rain: true })   // retour du briefing revu, contexte repris
    expect(pluies().length).toBe(1)
    expect(avantT6(audio).audioState().pluie).toBe(true)
    audio.stopMissionAmbience()
  })

  it('sans pluie (les autres cartes) : la nappe seule', async () => {
    const audio = await import('../src/audio.js')
    audio.audioContext()
    created.length = 0
    audio.startMissionAmbience()
    audio.startMissionAmbience({ rain: false })
    expect(pluies()).toEqual([])
    audio.stopMissionAmbience()
  })

  it('une seule pluie à la fois ; relancée après un arrêt (REVOIR LE BRIEFING puis retour), une nouvelle', async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext(), master = audio.masterNode()
    created.length = 0
    audio.startMissionAmbience({ rain: true })
    audio.startMissionAmbience({ rain: true })
    expect(pluies().length).toBe(1)
    const [premiere] = pluies()
    audio.stopMissionAmbience()
    audio.startMissionAmbience({ rain: true })
    const seconde = pluies().find(p => p !== premiere)
    expect(seconde).toBeDefined()
    ctx.currentTime = 5; vi.advanceTimersByTime(3000)
    expect(atteint(premiere, master)).toBe(false)
    expect(atteint(seconde, master)).toBe(true)
    audio.stopMissionAmbience()
  })

  // Relecture de T6 : la pluie remplissait son bruit par Math.random, 6 s d'échantillons (288 000 tirages à 48 kHz),
  // et seulement quand le contexte tourne : dans une capture à graine dont le contexte tourne, le hasard tiré après
  // startLevel en M3 était décalé. Témoin vu rouge : 600 tirages au faux contexte (100 Hz) ; dans Chrome, à la vue de
  // départ de M3, 303 687 tirages contexte en marche contre 15 687 contexte suspendu.
  it("la pluie ne déplace pas le hasard du jeu : son bruit vient d'un générateur à graine fixe, pas de Math.random", async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext()
    created.length = 0
    const hasard = vi.spyOn(Math, 'random')
    audio.startMissionAmbience({ rain: true })
    const [premiere] = pluies()
    expect(premiere).toBeDefined()
    expect(hasard).not.toHaveBeenCalled()
    const bruit = premiere.buffer.getChannelData(0)
    expect(bruit.length).toBe(6 * ctx.sampleRate)
    expect(bruit.every(v => v >= -1 && v <= 1)).toBe(true)
    expect(new Set(bruit).size, 'du bruit, ni silence ni constante').toBeGreaterThan(bruit.length * 0.9)
    expect(Math.abs(bruit.reduce((s, v) => s + v, 0) / bruit.length), 'centré').toBeLessThan(0.1)
    audio.stopMissionAmbience()
    audio.startMissionAmbience({ rain: true })
    const seconde = pluies().find(p => p !== premiere)
    expect(seconde).toBeDefined()
    expect(seconde.buffer.getChannelData(0), 'graine fixe : le même bruit à chaque départ').toEqual(bruit)
    expect(hasard).not.toHaveBeenCalled()
    audio.stopMissionAmbience()
  })

  // Relecture de T6 : niveau et montée de la pluie du port dans tuning.js (PLUIE), avec les autres réglages du son.
  // Témoin vu rouge : RAIN, écrit en dur dans audio.js (0,06 en 2 s, quel que soit le réglage).
  it('niveau et montée de la pluie se règlent dans tuning.js (PLUIE)', async () => {
    const t = await import('../src/shot/tuning.js')   // l'instance que lit audio.js (modules remis à neuf)
    const PLUIE = t.PLUIE ?? { niveau: 0.06, monteeS: 2 }   // avant la relecture : la table n'existait pas
    PLUIE.niveau = 0.09; PLUIE.monteeS = 3
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext()
    ctx.currentTime = 4
    created.length = 0
    audio.startMissionAmbience({ rain: true })
    const [src] = pluies()
    expect(src).toBeDefined()
    expect(gainDe(src).gain.events.find(e => e[0] === 'linear')).toEqual(['linear', 0.09, 7])
    audio.stopMissionAmbience()
  })

  // Relecture de T6 : le fondu (setTargetAtTime, constante de 1,2 / 3,75 s) était coupé au bout de 1,2 s, la source
  // arrêtée à 32 dB seulement sous le niveau de la pluie. Témoin vu rouge : il restait 2,4 % du niveau à l'arrêt.
  it("à l'arrêt, le fondu de la pluie va à son terme : 60 dB perdus quand sa source s'arrête, avec la nappe (1,2 s)", async () => {
    const audio = await import('../src/audio.js')
    const ctx = audio.audioContext()
    created.length = 0
    audio.startMissionAmbience({ rain: true })
    const [src] = pluies()
    expect(src).toBeDefined()
    const g = gainDe(src)
    ctx.currentTime = 10
    audio.stopMissionAmbience()
    const fondu = g.gain.events.find(e => e[0] === 'target')
    expect(fondu).toBeDefined()
    let ms = 0
    while (src.stopAt === null && ms < 5000) { vi.advanceTimersByTime(10); ms += 10 }
    expect(src.stopAt).not.toBeNull()
    expect(Math.exp(-(ms / 1000) / fondu[3]), "niveau restant à l'arrêt de la source").toBeLessThanOrEqual(1e-3 + 1e-12)
    expect(ms / 1000, 'coupée avec la nappe').toBeLessThanOrEqual(1.2 + 0.01)
  })
})
