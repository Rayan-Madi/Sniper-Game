import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { creerSon } from '../../src/bar/son.js'
import { creerVoix } from '../../src/bar/voix.js'
import { SON, VOIX, ECOUTE } from '../../src/bar/reglages.js'
import { impulseResponse } from '../../src/shot/acoustics.js'
import { fauxAudio, valeur, frequence, atteint, aAtteint, premier, branches, enCours } from './fauxAudio.js'

// Le son de la salle du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.12 et §8 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B7). Chaque test de comportement a été vu rouge sur le témoin écrit
// à côté de son assertion, glissé seul dans le module fini, puis vert.

const FAUX = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
const DT = 1 / 60
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const CALME = { presents: 8, soupcon: 0, palier: 'calme' }
// Fait avancer la salle de `duree` secondes, image par image, le temps audio avec elle.
function avance(f, son, duree, situation = CALME) {
  for (let k = Math.round(duree / DT); k > 0; k--) { f.avancer(DT); son.update(DT, situation) }
}
const bandeDe = o => premier(o, n => n.genre === 'filtre' && n.type === 'bandpass')
const filtres = (f, type) => f.noeuds.filter(n => n.genre === 'filtre' && n.type === type)
const syllabes = (oscs, hz) => oscs.filter(o => o.type === 'sawtooth' && bandeDe(o) && bandeDe(o).frequency.value === hz)
const debut = o => o.start.mock.calls[0][0]
const convolution = f => f.noeuds.find(n => n.genre === 'convolution')
const DB = db => 10 ** (db / 20)
const proche = (a, b) => Math.abs(a - b) < 1e-6
// les appels interdits dans src/bar/ (spec §10, plan : contraintes globales) que contient un source, commentaires ôtés
const appelsInterdits = source => {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  return ['Math.random', 'setTimeout', 'setInterval'].filter(nom => new RegExp(`\\b${nom.replace('.', '\\.')}\\s*\\(`).test(code))
}

// Les nœuds de la salle, retrouvés dans le graphe
const busBrouhaha = f => [...f.noeuds.find(n => n.genre === 'panoramique' && proche(valeur(n.pan), SON.brouhaha.pans[0])).sorties][0]
const filtreJukebox = (f, T) => filtres(f, 'lowpass').find(n => proche(valeur(n.frequency), SON.jukebox.coupure.baseHz + SON.jukebox.coupure.plageHz * T))
const busJukebox = (f, T) => f.noeuds.find(n => n.genre === 'gain' && n.sorties.has(filtreJukebox(f, T)))

describe('aucun minuteur, aucun hasard sans graine', () => {
  it('aucun module du bar n\'appelle Math.random, setTimeout ni setInterval', () => {
    const dossier = resolve(__dirname, '../../src/bar')
    const fichiers = readdirSync(dossier).filter(n => n.endsWith('.js'))
    expect(fichiers).toEqual(expect.arrayContaining(['voix.js', 'son.js', 'seance.js']))
    for (const nom of fichiers) expect(appelsInterdits(readFileSync(resolve(dossier, nom), 'utf8')), nom).toEqual([])
    // témoin : le son des cinématiques, qui tire ses syllabes par setInterval et son bruit par Math.random
    const kit = readFileSync(resolve(__dirname, '../../src/briefing/sound.js'), 'utf8')
    expect(appelsInterdits(kit)).toEqual(expect.arrayContaining(['Math.random', 'setTimeout']))
    expect(appelsInterdits('// setTimeout(f) dans un commentaire\nconst x = 1 /* Math.random() */')).toEqual([])
  })

  it('la salle n\'appelle jamais Math.random, bruits compris', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random appelé') })
    const f = fauxAudio()
    const son = creerSon(f.audio)                           // témoin : le bruit blanc de sound.js:17, tiré par Math.random
    avance(f, son, 30, { presents: 8, soupcon: 70, palier: 'soupcon' })
    son.clochette(); son.sonnerie(); son.note(); son.pas()
    avance(f, son, 1)
    expect(f.oscillateurs().length).toBeGreaterThan(50)
    son.stop()
  })

  it('rien ne sonne ni ne se programme hors d\'update : aucun minuteur, de la création à l\'arrêt', () => {
    vi.useFakeTimers(FAUX)
    const f = fauxAudio()
    const son = creerSon(f.audio)
    const n = f.noeuds.length
    vi.advanceTimersByTime(5000)
    expect(f.noeuds).toHaveLength(n)                        // la salle ne fait rien d'elle-même
    expect(vi.getTimerCount()).toBe(0)
    avance(f, son, 5); son.clochette(); son.sonnerie(); son.note(); son.pas()
    expect(vi.getTimerCount()).toBe(0)
    son.stop()
    expect(vi.getTimerCount()).toBe(0)                      // témoin : débranchement différé par setTimeout (sound.js:107)
  })
})

describe('le brouhaha (§3.12)', () => {
  it('trois générateurs de syllabes de 90 à 220 Hz, passe-bas 900 Hz, à −0,6, 0 et 0,6, et un lit de bruit sous 400 Hz', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    avance(f, son, 10)
    const b = SON.brouhaha.timbre
    expect([b.f0Min, b.f0Max, b.passeBas]).toEqual([90, 220, 900])
    const oscs = syllabes(f.oscillateurs(), b.bande.hz)
    expect(oscs.length).toBeGreaterThan(60)
    for (const o of oscs) {
      expect(frequence(o)).toBeGreaterThanOrEqual(90)
      expect(frequence(o)).toBeLessThanOrEqual(220 * (1 + b.glissement) + 1e-9)
    }
    const pans = new Set(oscs.map(o => valeur(premier(o, n => n.genre === 'panoramique').pan)))
    expect([...pans].sort((x, y) => x - y)).toEqual([-0.6, 0, 0.6])   // témoin : un seul générateur
    const bus = busBrouhaha(f)
    for (const o of oscs) expect(aAtteint(o, bus)).toBe(true)
    const lit = f.noeuds.find(n => n.genre === 'tampon' && n.loop && atteint(n, bus))
    expect(lit).toBeTruthy()
    expect(premier(lit, n => n.genre === 'filtre').frequency.value).toBe(400)
    expect(atteint(bus, f.dest)).toBe(true)
    son.stop()
  })

  it('suit le nombre de présents et se fait plus discret quand le soupçon monte (canard 1 ; 0,7 dès 60 ; 0,35 dès 85)', () => {
    const cas = [
      [{ presents: 8, soupcon: 0, palier: 'calme' }, 1],
      [{ presents: 4, soupcon: 0, palier: 'calme' }, 0.5],
      [{ presents: 12, soupcon: 0, palier: 'calme' }, 1],
      [{ presents: 8, soupcon: 59, palier: 'mefiance' }, 1],
      [{ presents: 8, soupcon: 60, palier: 'soupcon' }, 0.7],
      [{ presents: 8, soupcon: 84, palier: 'soupcon' }, 0.7],
      [{ presents: 8, soupcon: 85, palier: 'soupcon' }, 0.35],
      [{ presents: 6, soupcon: 90, palier: 'soupcon' }, 0.75 * 0.35],
    ]
    for (const [situation, facteur] of cas) {
      const f = fauxAudio(); const son = creerSon(f.audio)
      avance(f, son, 0.5, situation)
      expect(valeur(busBrouhaha(f).gain), JSON.stringify(situation)).toBeCloseTo(SON.brouhaha.niveau * facteur, 9)   // témoin : canard ignoré
      expect(son.etat().brouhaha).toBeCloseTo(SON.brouhaha.niveau * facteur, 9)
      son.stop()
    }
  })

  it('démasqué, le brouhaha tombe à 0,1 en 0,8 s (§3.10)', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    avance(f, son, 1)
    avance(f, son, 0.1, { presents: 8, soupcon: 100, palier: 'demasque' })
    const g = busBrouhaha(f).gain
    expect(valeur(g)).toBeCloseTo(SON.brouhaha.niveau * 0.1, 9)   // témoin : le canard de 85, 0,35
    const [, , tau] = g.setTargetAtTime.mock.calls.at(-1)
    expect(Math.exp(-0.8 / tau)).toBeLessThanOrEqual(0.05)  // à 95 % au moins de la descente au bout de 0,8 s
    son.stop()
  })
})

describe('le juke-box (§3.12)', () => {
  it('sa coupure suit ce que laissent passer les murs : 450 + 3 000 × T Hz', () => {
    for (const T of [1, 0.6, 0.05, 0.3]) {
      const f = fauxAudio(); const son = creerSon(f.audio)
      avance(f, son, 0.5, { ...CALME, jukebox: { T, pan: -0.5 } })
      const filtre = filtreJukebox(f, T)
      expect(filtre, `T = ${T}`).toBeTruthy()               // témoin : coupure constante
      expect(son.etat().jukebox.coupure).toBeCloseTo(450 + 3000 * T, 9)
      expect(valeur(premier(filtre, n => n.genre === 'panoramique').pan)).toBeCloseTo(-0.5, 9)
      son.stop()
    }
  })

  it('quatre accords, une basse en triangle à 84 bpm, des craquements en boucle', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    const J = SON.jukebox
    expect(J.accords).toHaveLength(4)
    expect(J.bpm).toBe(84)
    const mesure = J.tempsParAccord * 60 / J.bpm
    avance(f, son, 2 * J.accords.length * mesure)
    const bus = busJukebox(f, 1)
    const basses = f.oscillateurs().filter(o => o.type === 'triangle' && aAtteint(o, bus))
    expect(basses.length).toBeGreaterThanOrEqual(2 * J.accords.length * J.tempsParAccord)
    basses.slice(0, 2 * J.accords.length * J.tempsParAccord).forEach((o, k) => {
      expect(debut(o) - debut(basses[0])).toBeCloseTo(k * 60 / J.bpm, 6)   // témoin : un autre tempo
      const accord = J.accords[Math.floor(k / J.tempsParAccord) % J.accords.length]
      expect(frequence(o)).toBeCloseTo(accord.basse * J.motif[k % J.tempsParAccord], 6)
    })
    const nappes = f.oscillateurs().filter(o => o.type === 'sine' && aAtteint(o, bus))
    expect(nappes.slice(0, 3).map(frequence)).toEqual(J.accords[0].notes)
    const craquements = f.noeuds.find(n => n.genre === 'tampon' && n.loop && atteint(n, bus))
    expect(craquements).toBeTruthy()
    son.stop()
  })
})

describe('la pause (§3.12 : plus de syllabes, musique à −10 dB)', () => {
  it('5 s de pause : aucune syllabe, aucun verre, aucun battement ; la musique continue 10 dB plus bas', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    const tendu = { presents: 8, soupcon: 70, palier: 'soupcon' }
    avance(f, son, 10, tendu)
    const avant = f.oscillateurs().length
    expect(valeur(busJukebox(f, 1).gain)).toBeCloseTo(SON.jukebox.niveau, 9)
    avance(f, son, 5, { ...tendu, pause: true })
    const pendant = f.oscillateurs(avant)
    expect(pendant.filter(o => o.type === 'sawtooth')).toEqual([])   // témoin : pause ignorée, brouhaha et tiercé bavardent
    expect(pendant.filter(o => frequence(o) > 2000)).toEqual([])      // aucun verre
    expect(pendant.filter(o => frequence(o) < 60)).toEqual([])        // aucun battement de cœur
    expect(pendant.filter(o => o.type === 'triangle').length).toBeGreaterThan(4)   // la basse du juke-box continue
    expect(valeur(busJukebox(f, 1).gain)).toBeCloseTo(SON.jukebox.niveau * DB(-10), 9)
    expect(son.etat().pause).toBe(true)
    avance(f, son, 2, tendu)
    expect(f.oscillateurs(avant).filter(o => o.type === 'sawtooth').length).toBeGreaterThan(0)
    expect(valeur(busJukebox(f, 1).gain)).toBeCloseTo(SON.jukebox.niveau, 9)
    son.stop()
  })
})

describe('le cœur (§3.12 : dès SOUPÇON, de 1,1 s à 0,6 s)', () => {
  const battements = (situation, duree = 12) => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    avance(f, son, duree, situation)
    const coups = f.oscillateurs().filter(o => frequence(o) === SON.coeur.coups[0].hz)
    son.stop()
    return coups.map(debut)
  }
  const ecart = t => (t.at(-1) - t[0]) / (t.length - 1)
  it('bat en SOUPÇON, d\'autant plus vite que S monte', () => {
    expect(ecart(battements({ presents: 8, soupcon: 60, palier: 'soupcon' }))).toBeCloseTo(1.1, 1)
    expect(ecart(battements({ presents: 8, soupcon: 80, palier: 'soupcon' }))).toBeCloseTo(0.85, 1)   // témoin : intervalle fixe
    expect(ecart(battements({ presents: 8, soupcon: 100, palier: 'soupcon' }))).toBeCloseTo(0.6, 1)
    expect(ecart(battements({ presents: 8, soupcon: 55, palier: 'soupcon' }))).toBeCloseTo(1.1, 1)    // sous 60, encore en SOUPÇON
  })
  it('se tait hors du SOUPÇON, quel que soit S', () => {
    expect(battements({ presents: 8, soupcon: 59, palier: 'mefiance' })).toEqual([])
    expect(battements({ presents: 8, soupcon: 70, palier: 'calme' })).toEqual([])   // témoin : cœur sur S ≥ 60
  })
  it('chaque battement est celui du kit (58 puis 52 Hz), au niveau du cœur de l\'enquête', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    avance(f, son, 0.5, { presents: 8, soupcon: 70, palier: 'soupcon' })
    const [c1, c2] = SON.coeur.coups
    const o1 = f.oscillateurs().find(o => frequence(o) === c1.hz), o2 = f.oscillateurs().find(o => frequence(o) === c2.hz)
    expect([c1.hz, c2.hz]).toEqual([58, 52])
    expect(debut(o2) - debut(o1)).toBeCloseTo(0.22, 9)
    const crete = o => premier(o, n => n.genre === 'gain').gain.linearRampToValueAtTime.mock.calls[0][0]
    expect(crete(o1)).toBeCloseTo(0.8 * SON.coeur.niveau, 9)
    expect(crete(o2)).toBeCloseTo(0.6 * SON.coeur.niveau, 9)
    son.stop()
  })
})

describe('les verres et le tiercé (§3.12)', () => {
  it('un verre tinte toutes les 3 à 8 s : trois partiels à 2,6, 3,9 et 5,3 kHz, déclin de 0,25 à 0,4 s, dans la réverbération', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    avance(f, son, 120)
    const partiels = f.oscillateurs().filter(o => SON.verres.partielsHz.includes(frequence(o)))
    expect(SON.verres.partielsHz).toEqual([2600, 3900, 5300])
    const instants = [...new Set(partiels.map(debut))]
    expect(instants.length).toBeGreaterThanOrEqual(120 / 8 - 1)
    expect(instants.length).toBeLessThanOrEqual(120 / 3 + 1)
    for (let i = 1; i < instants.length; i++) {
      expect(instants[i] - instants[i - 1]).toBeGreaterThanOrEqual(3 - DT)   // témoin : un verre toutes les 2 s
      expect(instants[i] - instants[i - 1]).toBeLessThanOrEqual(8 + DT)
    }
    for (const t of instants) expect(partiels.filter(o => debut(o) === t).map(frequence).sort()).toEqual([2600, 3900, 5300])
    for (const o of partiels) {
      const duree = o.stop.mock.calls[0][0] - debut(o)
      expect(duree).toBeGreaterThanOrEqual(0.25)
      expect(duree).toBeLessThanOrEqual(0.4 + 0.05)
      expect(aAtteint(o, convolution(f))).toBe(true)        // témoin : verres hors de la réverbération
    }
    son.stop()
  })

  it('le tiercé parle par bouffées, nasillard (passe-bande 1,8 kHz), réglé par l\'écoute de la télé', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    avance(f, son, 120, { ...CALME, tele: { T: 0.25, pan: 0.8, gain: 0.5 } })
    const oscs = syllabes(f.oscillateurs(), 1800)
    expect(oscs.length).toBeGreaterThan(50)
    const t = oscs.map(debut)
    const trous = t.slice(1).map((x, i) => x - t[i])
    const silences = trous.filter(d => d >= SON.tierce.silenceS[0] - 0.2)
    expect(silences.length).toBeGreaterThanOrEqual(3)       // témoin : la télé parle sans arrêt
    // entre deux silences, une bouffée ne dure pas plus que bouffeeS[1]
    let debutBouffee = t[0]
    for (let i = 1; i < t.length; i++) {
      if (t[i] - t[i - 1] >= SON.tierce.silenceS[0] - 0.2) debutBouffee = t[i]
      else expect(t[i] - debutBouffee).toBeLessThanOrEqual(SON.tierce.bouffeeS[1] + 0.2)
    }
    const pan = premier(oscs[0], n => n.genre === 'panoramique')
    expect(valeur(pan.pan)).toBeCloseTo(0.8, 9)
    const coupure = f.noeuds.find(n => n.genre === 'filtre' && n.sorties.has(pan))
    expect(valeur(coupure.frequency)).toBeCloseTo(ECOUTE.passeBas.baseHz + ECOUTE.passeBas.plageHz * 0.25, 9)
    const entree = f.noeuds.find(n => n.genre === 'gain' && n.sorties.has(coupure))
    expect(valeur(entree.gain)).toBeCloseTo(SON.tierce.timbre.niveau * 0.5, 9)
    son.stop()
  })
})

describe('la réverbération (§3.12)', () => {
  it('une ConvolverNode à elle, chargée de la réponse « interieur », envoi à −20 dB, que les voix peuvent rejoindre', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    const convs = f.noeuds.filter(n => n.genre === 'convolution')
    expect(convs).toHaveLength(1)
    const ir = impulseResponse('interieur', f.ctx.sampleRate)
    expect(convs[0].buffer.length).toBe(ir.length)
    ir.canaux.forEach((d, i) => expect(Array.from(convs[0].buffer.getChannelData(i))).toEqual(Array.from(d)))   // témoin : l'écho du port
    expect(son.reverberation.genre).toBe('gain')
    expect(son.reverberation.gain.value).toBeCloseTo(DB(SON.reverberation.envoiDb), 12)
    expect(SON.reverberation.envoiDb).toBe(-20)
    expect(son.reverberation.sorties.has(convs[0])).toBe(true)
    expect(atteint(convs[0], f.dest)).toBe(true)
    const v = creerVoix(f.audio, { ...VOIX.timbres.dussart, reverberation: son.reverberation })
    v.parler(1); for (let k = 0; k < 60; k++) { f.avancer(DT); v.update(DT, { gain: 1 }) }
    expect(f.oscillateurs().filter(o => o.type === 'sawtooth' && aAtteint(o, convs[0])).length).toBeGreaterThan(0)
    // jamais mountEcho : l'écho de la mission est un singleton du jeu (src/audio.js)
    expect(readFileSync(resolve(__dirname, '../../src/bar/son.js'), 'utf8')).not.toMatch(/from '\.\.\/audio\.js'/)
    v.dispose(); son.stop()
  })
})

describe('les sons ponctuels (§3.12)', () => {
  it('clochette (1,9 et 2,6 kHz, 0,6 s) et grincement de la porte de l\'enquête', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    const n = f.oscillateurs().length
    son.clochette()
    const oscs = f.oscillateurs(n)
    const cloche = oscs.filter(o => o.type === 'sine')
    expect(cloche.map(frequence)).toEqual(SON.clochette.partielsHz)
    expect(SON.clochette.partielsHz).toEqual([1900, 2600])
    for (const o of cloche) expect(o.stop.mock.calls[0][0] - debut(o)).toBeCloseTo(0.6 + 0.02, 9)
    const grince = oscs.find(o => o.type === 'sawtooth')
    expect(frequence(grince)).toBe(95)                      // ambience.js:92
    expect(grince.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(70, expect.closeTo(1.3, 9))
    son.stop()
  })
  it('sonnerie : une sonnerie à cloche par appel, frappée par son marteau', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    const n = f.oscillateurs().length
    son.sonnerie()
    const oscs = f.oscillateurs(n)
    expect(oscs.map(frequence)).toEqual(SON.sonnerie.partielsHz)
    const g = premier(oscs[0], x => x.genre === 'gain').gain
    const frappes = g.setValueAtTime.mock.calls.length
    expect(frappes).toBeGreaterThanOrEqual(Math.round(SON.sonnerie.frappesParS * SON.sonnerie.dureeS))
    son.sonnerie(); son.sonnerie()
    expect(f.oscillateurs(n)).toHaveLength(3 * SON.sonnerie.partielsHz.length)   // trois sonneries : trois appels (B6)
    son.stop()
  })
  it('sonnerie : la cloche sonne encore SON.sonnerie.traineS après la dernière frappe, un réglage du ressenti', () => {
    const avant = SON.sonnerie.traineS
    try {
      SON.sonnerie.traineS = 0.6                            // une autre traîne que celle de départ
      const f = fauxAudio(); const son = creerSon(f.audio)
      const n = f.oscillateurs().length
      f.avancer(2); son.sonnerie()
      const oscs = f.oscillateurs(n), fin = 2 + SON.sonnerie.dureeS + 0.6
      for (const o of oscs) expect(o.stop.mock.calls[0][0]).toBeCloseTo(fin + 0.02, 9)   // témoin : traîne de 0,25 s écrite en dur
      const g = premier(oscs[0], x => x.genre === 'gain').gain
      expect(g.exponentialRampToValueAtTime.mock.calls.at(-1)).toEqual([0.0001, expect.closeTo(fin, 9)])
      f.avancer(SON.sonnerie.dureeS + 0.6 + 0.04); son.update(DT, CALME)
      expect(branches(f).filter(x => oscs.includes(x))).toHaveLength(oscs.length)   // encore branchée : elle sonne
      f.avancer(0.02); son.update(DT, CALME)
      expect(branches(f).filter(x => oscs.includes(x))).toEqual([])                  // débranchée après sa traîne
      son.stop()
    } finally { SON.sonnerie.traineS = avant }
  })
  it('NOTÉ : le papier et un grattement de crayon (bruit à 3,5 kHz, 0,3 s) ; un pas sur le parquet', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    const s0 = f.ctx.createBufferSource.mock.results.length
    son.note()
    const bruits = f.ctx.createBufferSource.mock.results.slice(s0).map(r => r.value)
    const bandes = bruits.map(b => premier(b, n => n.genre === 'filtre'))
    expect(bandes[0].frequency.premiere).toBe(2200)         // paper() de sound.js
    expect(bandes[0].frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(3800, expect.anything())
    const crayon = bandes.slice(1)
    expect(crayon.length).toBeGreaterThan(0)
    for (const b of crayon) expect(b.frequency.premiere).toBe(3500)
    const fin = Math.max(...bruits.slice(1).map(b => b.stop.mock.calls[0][0]))
    const deb = Math.min(...bruits.slice(1).map(debut))
    expect(fin - deb).toBeCloseTo(0.3 + 0.02, 1)
    const o0 = f.oscillateurs().length
    son.pas()
    expect(f.oscillateurs(o0).map(frequence)).toEqual([68])   // amb.step() de l'enquête (ambience.js:96)
    son.stop()
  })
  it('tic (tâche B12) : le clock() du kit, un carré à 2,6 kHz de 15 ms et un souffle aigu à 4 kHz (la minuterie d\'une réponse, §3.8)', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    const o0 = f.oscillateurs().length, s0 = f.ctx.createBufferSource.mock.results.length
    son.tic()
    const oscs = f.oscillateurs(o0)
    expect(oscs.map(o => [o.type, frequence(o)])).toEqual([['square', SON.tic.ton.hz]])
    expect(oscs[0].stop.mock.calls[0][0] - debut(oscs[0])).toBeCloseTo(0.015 + 0.02, 6)
    const bruits = f.ctx.createBufferSource.mock.results.slice(s0).map(r => r.value)
    expect(bruits.map(b => premier(b, n => n.genre === 'filtre')).map(n => [n.type, n.frequency.premiere])).toEqual([['highpass', 4000]])
    son.stop()
  })
  it('vibre (tâche B12) : une salve du téléphone de l\'enquête (152 et 76 Hz sous un passe-bas à 480 Hz, 0,28 s), débranchée après', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    const o0 = f.oscillateurs().length
    son.vibre()
    const oscs = f.oscillateurs(o0)
    expect(oscs.map(o => [o.type, frequence(o)])).toEqual([['sawtooth', 152], ['square', 76]])   // buzz() d'ambience.js
    const bas = premier(oscs[0], n => n.genre === 'filtre')
    expect([bas.type, valeur(bas.frequency), valeur(bas.Q)]).toEqual(['lowpass', 480, 3])
    expect(premier(oscs[1], n => n.genre === 'filtre')).toBe(bas)
    expect(oscs[0].stop.mock.calls[0][0] - debut(oscs[0])).toBeCloseTo(SON.vibration.dureeS + 0.02, 6)
    avance(f, son, 1)
    expect(oscs.every(o => o.sorties.size === 0)).toBe(true)
    son.stop()
  })
  it('contexte suspendu : ni syllabe, ni note, ni son ponctuel, qui partiraient tous d\'un coup à la reprise', () => {
    const f = fauxAudio({ etat: 'suspended' }); const son = creerSon(f.audio)
    avance(f, son, 3, { presents: 8, soupcon: 70, palier: 'soupcon' })
    son.clochette(); son.sonnerie(); son.note(); son.pas()
    expect(f.oscillateurs()).toEqual([])                    // témoin : sons créés contexte suspendu
    f.ctx.state = 'running'
    avance(f, son, 1)
    expect(f.oscillateurs().length).toBeGreaterThan(0)
    son.stop()
  })
})

describe('l\'arrêt (§8 : aucun minuteur ni nœud branché après stop)', () => {
  it('stop() débranche tout, arrête toute source, libère la réverbération, ne touche à rien de partagé', () => {
    vi.useFakeTimers(FAUX)
    const f = fauxAudio(); const son = creerSon(f.audio)
    avance(f, son, 12, { presents: 8, soupcon: 70, palier: 'soupcon' })
    son.clochette(); son.sonnerie(); son.note(); son.pas()
    expect(enCours(f).length).toBeGreaterThan(0)
    son.stop()
    expect(branches(f)).toEqual([])                         // témoin : la boucle des craquements oubliée
    expect(enCours(f)).toEqual([])
    expect(convolution(f).buffer).toBe(null)                // la réponse impulsionnelle est lâchée
    expect(f.dest.disconnect).not.toHaveBeenCalled()        // la destination du jeu est partagée
    expect(f.ctx.close).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    son.stop()                                              // deux fois : sans erreur
    const n = f.noeuds.length
    avance(f, son, 2); son.clochette(); son.sonnerie(); son.note(); son.pas()
    expect(f.noeuds).toHaveLength(n)                        // plus rien ne sonne
    expect(son.reverberation).toBe(null)
  })

  it('en jouant, les sons finis se débranchent au fil du temps audio : le graphe ne grossit pas', () => {
    const f = fauxAudio(); const son = creerSon(f.audio)
    avance(f, son, 60, { presents: 8, soupcon: 70, palier: 'soupcon' })
    son.clochette(); son.sonnerie(); son.note(); son.pas()
    avance(f, son, 3)
    // toute source dont l'arrêt est passé depuis plus d'une image est débranchée, avec les nœuds de son son
    const finies = branches(f).filter(n => n.stop && n.stop.mock.calls.some(([t]) => t !== undefined && t < f.ctx.currentTime - 2 * DT))
    expect(finies).toEqual([])                              // témoin : sons finis jamais débranchés, des milliers
    expect(branches(f).length).toBeLessThan(150)
    son.stop()
  })

  it('sans contexte audio, tout est muet et rien ne lève', () => {
    for (const audio of [null, undefined, { ctx: null, dest: null }]) {
      const son = creerSon(audio)
      expect(son.reverberation).toBe(null)
      son.update(1, { presents: 8, soupcon: 90, palier: 'soupcon', pause: false, jukebox: { T: 0.5 } })
      son.clochette(); son.sonnerie(); son.note(); son.pas()
      expect(son.etat()).toMatchObject({ pause: false })
      son.stop()
    }
  })
})
