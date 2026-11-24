import { describe, it, expect, vi, afterEach } from 'vitest'
import { creerVoix, creerChoeur, reglageBips } from '../../src/bar/voix.js'
import { VOIX, ECOUTE } from '../../src/bar/reglages.js'
import { PERSONNES } from '../../src/bar/textes.js'
import { BOITES, FOYERS, PLACES, TABLES } from '../../src/bar/plan.js'
import { audibilite, transmission } from '../../src/bar/ecoute.js'
import { fauxAudio, valeur, frequence, aAtteint, premier, branches, enCours } from './fauxAudio.js'

// Les voix bipées du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.2, §3.4 et §8 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B7). Chaque test de comportement a été vu rouge sur le témoin écrit
// à côté de son assertion, glissé seul dans le module fini, puis vert.

const FAUX = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
const DT = 1 / 60
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

// Fait avancer la voix (ou le chœur) de `duree` secondes, image par image, le temps audio avec elle.
function avance(f, v, duree, reglage = { gain: 1 }) {
  for (let k = Math.round(duree / DT); k > 0; k--) { f.avancer(DT); v.update(DT, reglage) }
}
const timbre = (qui, plus = {}) => ({ ...VOIX.timbres[qui], graine: 7, ...plus })
// les oscillateurs qui atteignent le nœud `vers`
const vers = (oscs, n) => oscs.filter(o => aAtteint(o, n))
const panoramiques = f => f.noeuds.filter(n => n.genre === 'panoramique')

describe('les timbres des voix (§3.2)', () => {
  it('chaque personne qui parle au Bivouac a son timbre, à la hauteur de la spec', () => {
    const T = VOIX.timbres
    for (const qui of Object.keys(PERSONNES)) expect(T[qui], qui).toBeTruthy()   // témoin : une personne sans timbre
    const hauteurs = { fernand: [85, 110], dussart: [78, 100], lenoir: [120, 160], mattei: [100, 130], haas: [60, 80],
      sorel: [95, 120], lise: [190, 260], albert: [90, 120] }
    for (const [qui, h] of Object.entries(hauteurs)) expect([T[qui].f0Min, T[qui].f0Max], qui).toEqual(h)
    expect(T.colonel.f0Max).toBeLessThanOrEqual(100)       // le combiné, plus grave que le timbre « phone » (100 à 175 Hz)
    expect([T.viktor.f0Min, T.viktor.f0Max]).toEqual([72, 107])   // la voix intérieure des cinématiques (sound.js:58)
    expect(T.fernand.debit).toBeLessThan(1)                // lent
    expect(T.lenoir.debit).toBeGreaterThan(1)              // rapide
    expect(T.lise.debit).toBeGreaterThan(1)
    expect(T.haas.pauses).toBeGreaterThan(VOIX.defaut.pauses)        // rare
    expect(T.sorel.pauses).toBeLessThan(VOIX.defaut.pauses)          // régulier
    expect(T.dussart.syllabeS[1]).toBeLessThan(VOIX.defaut.syllabeS[1])   // syllabes courtes
    expect(T.mattei.crete[0]).toBeLessThan(VOIX.defaut.crete[0])     // éclats : des syllabes bien plus fortes que d'autres
  })

  it('les syllabes partent de la hauteur de la personne', () => {
    for (const qui of ['lise', 'haas', 'colonel']) {
      const f = fauxAudio(); const t = timbre(qui)
      const v = creerVoix(f.audio, t)
      v.parler(20); avance(f, v, 20)
      const oscs = f.oscillateurs()
      expect(oscs.length, qui).toBeGreaterThan(20)
      for (const o of oscs) {
        // la syllabe part entre f0 et f0 × (1 + glissement), et retombe à f0 × chute (sound.js:56-57)
        expect(frequence(o), qui).toBeGreaterThanOrEqual(t.f0Min - 1e-9)
        expect(frequence(o), qui).toBeLessThanOrEqual(t.f0Max * (1 + t.glissement) + 1e-9)
        const f0 = o.frequency.exponentialRampToValueAtTime.mock.calls[0][0] / t.chute
        expect(f0, qui).toBeGreaterThanOrEqual(t.f0Min - 1e-9)   // témoin : la hauteur du timbre « phone » pour tous
        expect(f0, qui).toBeLessThanOrEqual(t.f0Max + 1e-9)
        expect(o.type).toBe('sawtooth')
      }
      v.dispose()
    }
  })

  it('le débit, les pauses et la longueur des syllabes changent la façon de parler', () => {
    const syllabes = qui => {
      const f = fauxAudio(); const v = creerVoix(f.audio, timbre(qui))
      v.parler(30); avance(f, v, 30)
      const oscs = f.oscillateurs()
      const duree = oscs.reduce((s, o) => s + o.stop.mock.calls[0][0] - o.start.mock.calls[0][0], 0) / oscs.length
      v.dispose()
      return { n: oscs.length, duree }
    }
    expect(syllabes('lenoir').n).toBeGreaterThan(syllabes('fernand').n * 1.3)   // témoin : débit ignoré (le même nombre)
    expect(syllabes('haas').n).toBeLessThan(syllabes('albert').n * 0.8)        // témoin : pauses ignorées
    expect(syllabes('dussart').duree).toBeLessThan(syllabes('albert').duree)  // témoin : durée des syllabes ignorée
  })
})

describe('une voix bipe au temps de jeu', () => {
  it('ne bipe qu\'à update : 5 s sans update ne font aucune syllabe, et ne laissent aucun minuteur', () => {
    vi.useFakeTimers(FAUX)
    const f = fauxAudio(); const v = creerVoix(f.audio, timbre('dussart'))
    v.parler(4)
    vi.advanceTimersByTime(5000)
    expect(f.ctx.createOscillator).not.toHaveBeenCalled()   // témoin : syllabes par setInterval, comme sound.js:51
    expect(vi.getTimerCount()).toBe(0)
    avance(f, v, 1)
    expect(f.ctx.createOscillator).toHaveBeenCalled()
    v.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('n\'appelle jamais Math.random : le hasard des syllabes est à graine', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random appelé') })
    const f = fauxAudio()
    const v = creerVoix(f.audio, timbre('mattei'))
    v.parler(10); avance(f, v, 10)                          // témoin : la hauteur tirée par Math.random (sound.js:55)
    const c = creerChoeur(f.audio)
    c.parler('lise', 5); c.parler('sorel', 5)
    avance(f, c, 5, { sources: { lise: { gain: 1 }, sorel: { gain: 1 } } })
    expect(f.oscillateurs().length).toBeGreaterThan(0)
    v.dispose(); c.dispose()
  })

  it('même graine et mêmes pas de temps : mêmes syllabes ; autre graine : d\'autres', () => {
    const suite = graine => {
      const f = fauxAudio(); const v = creerVoix(f.audio, timbre('sorel', { graine }))
      v.parler(6); avance(f, v, 6)
      return f.oscillateurs().map(o => [frequence(o), o.start.mock.calls[0][0]])
    }
    expect(suite(3)).toEqual(suite(3))
    expect(suite(3)).not.toEqual(suite(4))                  // témoin : graine ignorée (un générateur commun au module)
  })

  it('se tait à la fin de sa réplique, ou dès taire()', () => {
    const f = fauxAudio(); const v = creerVoix(f.audio, timbre('lise'))
    v.parler(2)
    expect(v.parle).toBe(true)
    avance(f, v, 2)
    const n = f.oscillateurs().length
    expect(n).toBeGreaterThan(3)
    expect(v.parle).toBe(false)
    avance(f, v, 3)
    expect(f.oscillateurs().length).toBe(n)                 // témoin : une réplique qui ne finit jamais
    v.parler(5); avance(f, v, 0.5)
    v.taire()
    const m = f.oscillateurs().length
    avance(f, v, 3)
    expect(f.oscillateurs().length).toBe(m)                 // témoin : taire() sans effet
    expect(v.parle).toBe(false)
    v.dispose()
  })

  it('inaudible (gain sous le seuil), la réplique avance sans biper', () => {
    const f = fauxAudio(); const v = creerVoix(f.audio, timbre('dussart'))
    v.parler(2)
    avance(f, v, 1, { gain: 0 })
    expect(f.oscillateurs()).toHaveLength(0)                // témoin : des syllabes créées à gain nul
    avance(f, v, 1, { gain: 1 })
    const n = f.oscillateurs().length
    expect(n).toBeGreaterThan(0)
    avance(f, v, 2, { gain: 1 })
    expect(f.oscillateurs()).toHaveLength(n)                // témoin : la réplique arrêtée tant qu'on ne l'entend pas
    v.dispose()
  })

  it('un grand pas de temps ne fait pas de rafale : seules les syllabes de la fin du pas sonnent', () => {
    const f = fauxAudio(); const v = creerVoix(f.audio, timbre('lenoir'))
    v.parler(60)
    f.avancer(30); v.update(30, { gain: 1 })
    expect(f.oscillateurs().length).toBeLessThanOrEqual(1)  // témoin : toutes les syllabes dues rattrapées, plus de 150
    v.dispose()
  })

  it('suspendu (avant le geste du joueur), le contexte ne reçoit aucune syllabe à jouer d\'un coup à la reprise', () => {
    const f = fauxAudio({ etat: 'suspended' }); const v = creerVoix(f.audio, timbre('dussart'))
    v.parler(3); avance(f, v, 2)
    expect(f.oscillateurs()).toHaveLength(0)                // témoin : syllabes créées contexte suspendu
    f.ctx.state = 'running'; avance(f, v, 1)
    expect(f.oscillateurs().length).toBeGreaterThan(0)
    v.dispose()
  })
})

describe('la chaîne d\'une voix', () => {
  it('gain, coupure et panoramique viennent de l\'écoute ; elle sort vers sa sortie et sa réverbération', () => {
    const f = fauxAudio()
    const sortie = f.ctx.createGain(); const reverberation = f.ctx.createGain()
    const t = timbre('sorel')
    const v = creerVoix(f.audio, { ...t, sortie, reverberation })
    v.parler(3); avance(f, v, 1, { gain: 0.5, coupure: 1200, pan: -0.4 })
    const [pan] = panoramiques(f)
    expect(valeur(pan.pan)).toBeCloseTo(-0.4, 9)           // témoin : panoramique ignoré
    const coupure = f.noeuds.find(n => n.genre === 'filtre' && n.sorties.has(pan))
    expect(coupure.type).toBe('lowpass')
    expect(valeur(coupure.frequency)).toBeCloseTo(1200, 9) // témoin : coupure ignorée
    const entree = f.noeuds.find(n => n.genre === 'gain' && n.sorties.has(coupure))
    expect(valeur(entree.gain)).toBeCloseTo(t.niveau * 0.5, 9)   // témoin : gain ignoré
    const oscs = f.oscillateurs()
    expect(oscs.length).toBeGreaterThan(0)
    for (const o of oscs) {
      expect(aAtteint(o, sortie)).toBe(true)
      expect(aAtteint(o, reverberation)).toBe(true)
      expect(aAtteint(o, f.dest)).toBe(false)               // la sortie donnée, pas la destination du jeu
    }
    // le timbre : un passe-bande et un passe-bas fixes, entre les syllabes et l'entrée
    const bande = f.noeuds.find(n => n.genre === 'filtre' && n.type === 'bandpass')
    expect(valeur(bande.frequency)).toBe(t.bande.hz)
    expect(valeur(bande.Q)).toBe(t.bande.q)
    v.dispose()
  })

  it('le colonel a le lit de ligne du timbre « phone » (bruit à 1,8 kHz, sound.js:42-46) tant qu\'il parle ; les autres, non', () => {
    const f = fauxAudio(); const sortie = f.ctx.createGain()
    const t = timbre('colonel')
    expect(t.ligne).toEqual({ hz: 1800, q: 1, niveau: 0.022 })   // le crépitement de « phone » (sound.js:44-45)
    const v = creerVoix(f.audio, { ...t, sortie })
    const lits = f.ctx.createBufferSource.mock.results.map(r => r.value)
    expect(lits).toHaveLength(1)                            // témoin : le colonel sans lit de ligne, comme une voix de la salle
    const [lit] = lits
    expect(lit.loop).toBe(true)
    expect(lit.start).toHaveBeenCalled()
    const filtre = premier(lit, n => n.genre === 'filtre')
    expect([filtre.type, valeur(filtre.frequency), valeur(filtre.Q)]).toEqual(['bandpass', 1800, 1])
    const porte = premier(lit, n => n.genre === 'gain')
    // le lit entre dans la chaîne à son entrée (niveau × gain de l'écoute, puis coupure et panoramique), sans passer par
    // le timbre des syllabes, comme le crépitement de sound.js va droit au gain de la voix
    const [pan] = panoramiques(f)
    const coupure = f.noeuds.find(n => n.genre === 'filtre' && n.sorties.has(pan))
    const entree = f.noeuds.find(n => n.genre === 'gain' && n.sorties.has(coupure))
    expect([...porte.sorties]).toEqual([entree])
    expect(aAtteint(lit, sortie)).toBe(true)
    avance(f, v, 0.5, { gain: 0.8 })
    expect(valeur(porte.gain)).toBe(0)                      // silencieux : la ligne se tait
    v.parler(1); avance(f, v, 0.5, { gain: 0.8 })
    expect(valeur(porte.gain)).toBeCloseTo(t.ligne.niveau, 9)   // témoin : un lit qui ne s'ouvre jamais
    expect(valeur(entree.gain)).toBeCloseTo(t.niveau * 0.8, 9)
    avance(f, v, 0.6, { gain: 0.8 })
    expect(valeur(porte.gain)).toBe(0)                      // témoin : un lit qui reste ouvert après la réplique
    v.parler(1); avance(f, v, 0.2, { gain: 0.8 }); v.taire(); avance(f, v, 0.1, { gain: 0.8 })
    expect(valeur(porte.gain)).toBe(0)                      // taire() ferme la ligne
    v.dispose()
    expect(lit.stop).toHaveBeenCalled()                     // témoin : lit en boucle jamais arrêté
    expect(branches(f).filter(n => n !== sortie)).toEqual([])
    // une voix de la salle n'a pas de ligne
    const g = fauxAudio(); const s = creerVoix(g.audio, timbre('sorel'))
    s.parler(1); avance(g, s, 1)
    expect(g.ctx.createBufferSource).not.toHaveBeenCalled()
    s.dispose()
  })

  it('le lit de ligne est tiré à graine : jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random appelé') })
    const echantillons = graine => {
      const f = fauxAudio(); const v = creerVoix(f.audio, timbre('colonel', { graine }))
      const d = f.ctx.createBufferSource.mock.results[0].value.buffer.getChannelData(0)
      v.dispose()
      return [...d.slice(0, 32)]
    }
    expect(echantillons(3)).toEqual(echantillons(3))        // témoin : le bruit du lit tiré par Math.random (sound.js:17)
    expect(echantillons(3)).not.toEqual(echantillons(4))    // témoin : graine ignorée
    expect(echantillons(3).some(x => x !== 0)).toBe(true)
  })

  it('les syllabes finies se débranchent au fil du temps audio, sans attendre dispose()', () => {
    const f = fauxAudio(); const v = creerVoix(f.audio, timbre('lenoir'))
    const fixes = f.noeuds.length                           // la chaîne de la voix, créée d'emblée
    v.parler(4); avance(f, v, 4)
    expect(f.oscillateurs().length).toBeGreaterThan(10)
    avance(f, v, 1)
    expect(branches(f).filter(n => f.noeuds.indexOf(n) >= fixes)).toEqual([])   // témoin : syllabes jamais débranchées
    v.dispose()
  })

  it('dispose() débranche tout, arrête toute source, ne touche à rien de partagé, et rend la voix muette', () => {
    vi.useFakeTimers(FAUX)
    const f = fauxAudio(); const v = creerVoix(f.audio, timbre('mattei'))
    v.parler(5)
    for (let k = 0; k < 300 && !enCours(f).length; k++) { f.avancer(DT); v.update(DT, { gain: 1 }) }
    expect(enCours(f).length).toBeGreaterThan(0)            // une syllabe en cours
    v.dispose()
    expect(branches(f)).toEqual([])                         // témoin : syllabes en cours oubliées
    expect(enCours(f)).toEqual([])
    expect(f.dest.disconnect).not.toHaveBeenCalled()        // la destination du jeu est partagée
    expect(f.ctx.close).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    v.dispose()                                             // deux fois : sans erreur
    const n = f.noeuds.length
    v.parler(3); avance(f, v, 1)
    expect(f.noeuds).toHaveLength(n)
  })

  it('sans contexte audio, tout est muet et rien ne lève', () => {
    for (const audio of [null, undefined, { ctx: null, dest: null }]) {
      const v = creerVoix(audio, timbre('fernand'))
      v.parler(2); v.update(1, { gain: 1, coupure: 900, pan: 0.3 }); v.taire(); v.dispose()
      const c = creerChoeur(audio)
      c.parler('fernand', 2); c.update(1, { sources: { fernand: { gain: 1 } }, sousTitre: 'fernand' })
      expect(c.actives).toEqual([])
      c.dispose()
    }
  })
})

describe('le chœur des voix du bar (§3.4 : au plus 3 voix bipées)', () => {
  it('au plus trois voix bipent à la fois : la sous-titrée, puis les deux plus fortes', () => {
    const f = fauxAudio()
    const c = creerChoeur(f.audio, { graine: 5 })
    const qui = ['dussart', 'lenoir', 'mattei', 'haas', 'fernand']
    for (const q of qui) c.parler(q, 20)
    const sources = { dussart: { gain: 0.9 }, lenoir: { gain: 0.8 }, mattei: { gain: 0.7 }, haas: { gain: 0.6 }, fernand: { gain: 0.5 } }
    avance(f, c, 4, { sources, sousTitre: 'haas' })
    expect(c.actives).toEqual(['haas', 'dussart', 'lenoir'])   // témoin : sans limite, les cinq
    const pans = panoramiques(f)
    const bipent = pans.filter(p => vers(f.oscillateurs(), p).length > 0)
    expect(bipent).toHaveLength(ECOUTE.voixBipeesMax)
    c.dispose()
  })

  it('une voix retenue mais inaudible ne compte pas, et la place passe à la suivante', () => {
    const f = fauxAudio(); const c = creerChoeur(f.audio)
    for (const q of ['sorel', 'lise', 'albert', 'haas']) c.parler(q, 10)
    avance(f, c, 1, { sources: { sorel: { gain: 0 }, lise: { gain: 0.3 }, albert: { gain: 0.2 }, haas: { gain: 0.1 } }, sousTitre: 'sorel' })
    expect(c.actives).toEqual(['lise', 'albert', 'haas'])  // témoin : Sorel retenu à gain nul, Haas écarté
  })

  it('une personne sans timbre est une erreur ; une voix ne se crée qu\'au premier mot', () => {
    const f = fauxAudio(); const c = creerChoeur(f.audio)
    expect(() => c.parler('kessler', 2)).toThrow(/kessler/)
    expect(f.noeuds).toHaveLength(1)                        // la destination seule : aucune voix tant que personne ne parle
    c.parler('albert', 1)
    expect(c.parle('albert')).toBe(true)
    expect(c.parle('lise')).toBe(false)
    c.taire('albert')
    expect(c.parle('albert')).toBe(false)
    c.dispose()
    expect(branches(f)).toEqual([])
  })
})

describe('ce que les bips d\'une source donnent à entendre (§3.4, « Son des voix »)', () => {
  const NORD = { x: 0, z: -1 }
  it('gain A(d / (1,6 × voix)) × T, coupure 600 + 2 400 × T, panoramique sin(azimut)', () => {
    const o = { x: 0, z: 0 }
    const a2 = reglageBips(o, NORD, { x: 0, z: -2 }, [])
    expect(a2).toEqual({ gain: 1, coupure: 3000, pan: 0 })  // à 2 m : 2 / 1,6 = 1,25 m, en deçà de 2,5 m
    const a5 = reglageBips(o, NORD, { x: 0, z: -5 }, [])
    expect(a5.gain).toBeCloseTo(audibilite(5 / 1.6), 12)    // on entend les bips plus loin qu'on ne comprend (5 m)
    expect(a5.gain).toBeGreaterThan(0.8)                    // témoin : gain A(d / voix), 0
    const bas = reglageBips(o, NORD, { x: 0, z: -4, voix: ECOUTE.voix.baissee }, [])
    expect(bas.gain).toBeCloseTo(audibilite(4 / (1.6 * 0.7)), 12)   // la voix baissée porte moins loin
    expect(reglageBips(o, NORD, { x: 3, z: 0 }, []).pan).toBeCloseTo(1, 12)    // à droite (est)
    expect(reglageBips(o, NORD, { x: -3, z: 0 }, []).pan).toBeCloseTo(-1, 12)  // à gauche ; témoin : panoramique inversé
    expect(reglageBips(o, NORD, { x: 1, z: -1 }, []).pan).toBeCloseTo(Math.SQRT1_2, 12)
    expect(reglageBips(o, NORD, { x: 0, z: 3 }, []).pan).toBeCloseTo(0, 12)    // dans le dos : au centre
    expect(reglageBips(o, NORD, { x: 0, z: -2, voix: 0 }, []).gain).toBe(0)
  })

  it('les murs assourdissent : la cloison du couloir donne T = 0,6, coupure 2 040 Hz', () => {
    // à l'entrée du couloir, le combiné est à 1 m sans rien entre eux ; de l'autre côté de la cloison ouest, T = 0,6
    const derriere = { x: -2.25, z: -4.1 }                  // dans le couloir, la cloison ouest entre lui et le combiné
    const T = transmission(derriere, FOYERS.combine, BOITES)
    expect(T).toBeCloseTo(ECOUTE.transmission.cloison, 12)
    const r = reglageBips(derriere, { x: -1, z: 0 }, FOYERS.combine, BOITES)
    expect(r.coupure).toBeCloseTo(600 + 2400 * 0.6, 9)      // témoin : murs ignorés, 3 000
    expect(r.gain).toBeCloseTo(audibilite(Math.hypot(0.75, 0) / 1.6) * 0.6, 9)
    const libre = reglageBips(PLACES.entreeCouloir, { x: 0, z: -1 }, FOYERS.combine, BOITES)
    expect(libre.coupure).toBe(3000)
    // la table A depuis la table B, au travers de toute la salle : les bips passent encore un peu
    const loin = reglageBips(TABLES.B, { x: 0, z: 1 }, FOYERS.A, BOITES)
    expect(loin.gain).toBeGreaterThan(0)
    expect(loin.gain).toBeLessThan(0.3)
  })
})
