import { describe, it, expect, vi, afterEach } from 'vitest'
import { SEANCE } from '../../src/bar/reglages.js'
import { createSeance, heureDe, JAMAIS_REPORTES } from '../../src/bar/seance.js'
import { ECHANGES, REACTIONS, DIALOGUES } from '../../src/bar/textes.js'
import { estimate } from '../../src/briefing/kit.js'

// La soirée du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.6, §3.9 et §10 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B6). Chaque test de comportement a été vu rouge sur le témoin écrit
// à côté de son assertion, glissé seul dans le module fini, puis vert.

const DT = 1 / 60                                          // une image à 60 Hz
const PRES = 1e-6                                          // les instants se comparent à un millionième de seconde près

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const echange = id => ECHANGES.find(e => e.id === id)
const duree = r => estimate(r.texte) / 1000                // une réplique dure son estimation (kit.js:10)
// la durée d'un échange joué sans attente : ses répliques, et 0,4 s entre deux
const dureeEchange = (id, avant = 0) => avant + echange(id).repliques.reduce((s, r) => s + duree(r), 0)
  + (echange(id).repliques.length - 1) * SEANCE.enchainementS
const enCours = (interlocuteur, fini = false) => ({ interlocuteur, fini })   // un dialogue de Viktor (src/bar/dialogue.js)

// Fait avancer la soirée image par image jusqu'à `jusqua` (secondes de jeu) ; ctx(t) : la situation de chaque image
// (palier de la jauge, dialogue en cours, renseignements appris), lue à son début. Rend [instant de fin d'image, émis].
function jouer(s, jusqua, ctx = () => ({})) {
  const notes = []
  for (let k = Math.round((jusqua - s.t) / DT); k > 0; k--) {
    const c = ctx(s.t)
    for (const e of s.update(DT, c)) notes.push([s.t, e])
  }
  return notes
}
const quand = (notes, filtre) => notes.filter(([, e]) => filtre(e)).map(([t]) => t)
const departs = notes => notes.filter(([, e]) => e.type === 'echange').map(([t, e]) => [e.id, t])
// émis à l'image qui contient l'instant attendu : au plus une image plus tard ; deux, quand il attendait la fin d'un
// dialogue (vue au début de l'image suivante)
const vers = (t, attendu, images = 1) => t >= attendu - PRES && t < attendu + images * DT + PRES
const soupconEntre = (de, a) => t => ({ palier: t >= de && t < a ? 'soupcon' : 'calme' })

describe('les réglages de la soirée', () => {
  it('les valeurs de reglages.js sont celles de la spec (§3.6, §3.7, §3.9)', () => {
    expect(SEANCE).toEqual({
      debutMin: 18 * 60 + 10, minuteS: 10.5, enchainementS: 0.4, placesS: { ouvriers: 10.5 }, silenceEntreeSorelS: 3,
      sonnerie: { coups: 3, intervalleS: 1.5 }, d2S: 315, pisteS: 150, sortieAutoS: 6, reportS: 20, reportEssais: 2,
      sortieSoupcon: 60, toilettesS: [240, 300],
    })
    expect(JAMAIS_REPORTES).toEqual(['appel', 'R3'])
  })
})

describe('l\'horloge', () => {
  it('18:10 à l\'entrée, « 18:36 » à 273 s, 18:50 à 420 s : 10,5 s par minute', () => {
    expect([0, 10.4, 10.5, 210, 273, 420].map(t => heureDe(t))).toEqual(['18:10', '18:10', '18:11', '18:30', '18:36', '18:50'])
    expect(heureDe(273 - 1e-12)).toBe('18:36')             // un instant atteint au calcul compte (témoin : sans tolérance, 18:35)
    expect(heureDe(50 * 10.5)).toBe('19:00')               // si un dialogue retient la fin (témoin : « 18:60 »)
    const s = createSeance()
    expect(s.heure).toBe('18:10')
    jouer(s, 273)
    expect(s.t).toBeCloseTo(273, 9)
    expect(s.heure).toBe('18:36')                          // 16 380 images de 1/60 s
  })
})

describe('le programme de la soirée', () => {
  it('l\'entrée : la clochette et le « Bonsoir. » de Fernand, une seule fois', () => {
    const s = createSeance()
    expect(s.update(DT)).toEqual([{ type: 'clochette' }, { type: 'reaction', id: 'bonsoir' }])
    const types = jouer(s, 10).map(([, e]) => e.type)
    expect(types).not.toContain('clochette')               // témoin : à chaque image
    expect(types).not.toContain('reaction')
  })

  it('sans soupçon ni dialogue, chaque échange part à son heure, dans l\'ordre du §3.9', () => {
    const notes = jouer(createSeance(), 440)
    const attendus = [['ouvriers', 10.5], ['A3', 21], ['B3', 42], ['A1', 63], ['B1', 95], ['A4', 126], ['A2a', 147],
      ['B2', 168], ['C2', 189], ['entreeSorel', 210], ['A2b', 231], ['appel', 273], ['R1', 357], ['R2', 357], ['R3', 389],
      ['fin', 420]]
    const vus = departs(notes)
    expect(vus.map(([id]) => id)).toEqual(attendus.map(([id]) => id))   // témoin : les places de la soirée ignorées
    for (const [i, [id, t]] of attendus.entries()) expect(vers(vus[i][1], t), `${id} à ${vus[i][1]}`).toBe(true)   // témoin : tout lancé à la première image
    expect(heureDe(vus.find(([id]) => id === 'appel')[1])).toBe('18:36')
    expect(notes.filter(([, e]) => e.type === 'echange').every(([, e]) => e.essai === 0)).toBe(true)
    // ce que la coquille du bar lira dans les textes : les réactions et D2 y sont
    for (const [, e] of notes) if (e.type === 'reaction') expect(Object.keys(REACTIONS)).toContain(e.id)
    expect(notes.filter(([, e]) => e.type === 'dialogue').map(([, e]) => DIALOGUES[e.id].interlocuteur)).toEqual(['sorel'])
  })

  it('un échange se joue une réplique à la fois, chacune le temps de sa voix, puis 0,4 s jusqu\'à la suivante', () => {
    const notes = jouer(createSeance(), 90)
    const a1 = echange('A1')
    const repliques = notes.filter(([, e]) => e.type === 'replique' && e.echange === 'A1')
    expect(repliques.map(([, e]) => e.rang)).toEqual([0, 1, 2, 3, 4, 5])
    let debut = 63
    for (const [i, [t, e]] of repliques.entries()) {
      expect(e).toEqual({ type: 'replique', echange: 'A1', rang: i, replique: a1.repliques[i], foyer: 'A',
        dureeS: duree(a1.repliques[i]), debutS: expect.any(Number) })
      expect(e.debutS).toBeCloseTo(debut, 6)               // témoin : répliques collées, sans les 0,4 s
      expect(vers(t, debut), `réplique ${i}`).toBe(true)
      debut += duree(a1.repliques[i]) + SEANCE.enchainementS
    }
    const fin = quand(notes, e => e.type === 'finEchange' && e.id === 'A1')
    expect(fin.length).toBe(1)
    expect(vers(fin[0], 63 + dureeEchange('A1'))).toBe(true)
  })

  it('une réplique part de son foyer, ou de celui de son échange : Sorel dit « On y va. » au zinc, la suite à la porte', () => {
    const notes = jouer(createSeance(), 410)
    const r3 = notes.filter(([, e]) => e.type === 'replique' && e.echange === 'R3').map(([, e]) => e.foyer)
    expect(r3).toEqual(['zinc', 'porte', 'porte', 'zinc', 'porte', 'zinc'])   // témoin : le foyer de l'échange pour toutes
  })
})

describe('le report sous SOUPÇON (§3.6)', () => {
  it('un échange porteur d\'un renseignement est reporté toutes les 20 s, deux fois, puis perdu', () => {
    const s = createSeance()
    const notes = jouer(s, 130, soupconEntre(60, 120))
    const a1 = notes.filter(([, e]) => ['reporte', 'perdu', 'echange'].includes(e.type) && e.id === 'A1')
    expect(a1.map(([, e]) => e)).toEqual([                 // témoin : sans report, A1 part à 63 s
      { type: 'reporte', id: 'A1', essai: 1, prochainS: 83 },
      { type: 'reporte', id: 'A1', essai: 2, prochainS: 103 },
      { type: 'perdu', id: 'A1' },
    ])
    expect(a1.map(([t]) => t).every((t, i) => vers(t, [63, 83, 103][i]))).toBe(true)
    expect(s.statut('A1')).toBe('perdu')
    expect(notes.some(([, e]) => e.type === 'replique' && e.echange === 'A1')).toBe(false)
    // B1, à 95 s, n'a eu que deux essais sous SOUPÇON : le troisième, à 135 s, passe
    expect(s.statut('B1')).toBe('reporte')
    const b1 = jouer(s, 140).filter(([, e]) => e.type === 'echange' && e.id === 'B1')
    expect(b1.map(([t, e]) => [vers(t, 135), e.essai])).toEqual([[true, 2]])
  })

  it('le SOUPÇON retombé avant le nouvel essai, l\'échange se joue à cet essai', () => {
    const s = createSeance()
    const notes = jouer(s, 110, soupconEntre(60, 70))
    const a1 = notes.filter(([, e]) => ['reporte', 'perdu', 'echange'].includes(e.type) && e.id === 'A1')
    expect(a1.map(([, e]) => e.type)).toEqual(['reporte', 'echange'])   // témoin : perdu dès le premier report
    expect(vers(a1[1][0], 83)).toBe(true)
    expect(a1[1][1].essai).toBe(1)
    expect(s.statut('A1')).toBe('fini')
  })

  it('un échange sans renseignement se joue sous SOUPÇON, comme l\'appel et le départ, qui ont leur heure', () => {
    const notes = jouer(createSeance(), 400, () => ({ palier: 'soupcon' }))
    const vus = Object.fromEntries(departs(notes))
    for (const [id, t] of [['ouvriers', 10.5], ['A3', 21], ['B3', 42], ['B2', 168], ['C2', 189], ['entreeSorel', 210]]) {
      expect(vers(vus[id], t), id).toBe(true)              // témoin : tout échange reporté
    }
    expect(vers(vus.appel, 273)).toBe(true)                 // témoin : l'appel reporté avec les autres porteurs
    expect(vus.R3).toBeDefined()
    expect(vers(vus.R3, 389)).toBe(true)
    for (const id of ['A1', 'B1', 'A4', 'A2a', 'A2b', 'R1', 'R2']) expect(vus[id], id).toBeUndefined()
  })
})

describe('qui parle avec qui', () => {
  it('personne ne tient deux conversations : un échange attend que ses gens aient fini l\'autre', () => {
    const s = createSeance()
    const notes = jouer(s, 170, soupconEntre(120, 130))    // A4 (Dussart, Lise) reporté de 126 à 146 s
    const vus = Object.fromEntries(departs(notes))
    expect(vers(vus.A4, 146)).toBe(true)
    const finA4 = 146 + dureeEchange('A4')
    expect(vers(vus.A2a, finA4)).toBe(true)                 // Dussart encore à A4 à 147 s (témoin : A2a lancé par-dessus)
    expect(quand(notes, e => e.type === 'echange' && e.id === 'A2a')[0]).toBeGreaterThanOrEqual(finA4 - PRES)
  })

  it('ni avec Viktor : un échange attend la fin du dialogue de l\'un de ses gens', () => {
    const notes = jouer(createSeance(), 150, t => ({ dialogue: t >= 120 && t < 140 ? enCours('lise') : null }))
    const vus = Object.fromEntries(departs(notes))
    expect(vus.A4).toBeGreaterThanOrEqual(140)              // témoin : le dialogue ignoré, A4 à 126 s
    expect(vers(vus.A4, 140, 2)).toBe(true)
    const avecFini = jouer(createSeance(), 150, t => ({ dialogue: t >= 120 ? enCours('lise', t >= 140) : null }))
    expect(vers(Object.fromEntries(departs(avecFini)).A4, 140, 2)).toBe(true)   // un dialogue fini ne retient plus personne
  })

  it('deux tables parlent en même temps : R1 et R2 à 357 s ; occupe et enCours disent qui parle', () => {
    const s = createSeance()
    jouer(s, 357.5)
    expect(s.enCours).toEqual(['R1', 'R2'])                 // témoin : une seule conversation à la fois dans la salle
    expect(['dussart', 'lenoir', 'haas', 'mattei', 'fernand', 'sorel'].map(q => s.occupe(q)))
      .toEqual([true, true, true, true, false, false])
    expect(s.statut('R1')).toBe('cours')
    expect(() => s.statut('R4')).toThrow(/R4/)
  })
})

describe('les heures de Sorel', () => {
  it('Sorel entre à 210 s : clochette, les tables se taisent 3 s, puis « Un café, Fernand. »', () => {
    const s = createSeance()
    jouer(s, 209.9)
    expect(s.sorelEntre).toBe(false)
    const notes = jouer(s, 216)
    const a210 = notes.filter(([t]) => vers(t, 210)).map(([, e]) => e.type)
    expect(a210).toEqual(['echange', 'clochette', 'silenceTables'])
    expect(notes.find(([, e]) => e.type === 'silenceTables')[1].dureeS).toBe(3)
    const cafe = notes.find(([, e]) => e.type === 'replique' && e.echange === 'entreeSorel')
    expect(cafe[1].replique.texte).toBe('Un café, Fernand.')
    expect(vers(cafe[0], 213)).toBe(true)                   // témoin : silence ignoré, réplique à 210 s
    expect(s.sorelEntre).toBe(true)
  })

  it('pendant ce silence, aucune autre table ne commence d\'échange', () => {
    const programme = [
      { id: 'entreeSorel', t: 9, foyer: 'zinc', repliques: [{ qui: 'sorel', texte: 'Un café, Fernand.' }] },
      { id: 'X', t: 10, foyer: 'A', repliques: [{ qui: 'lenoir', texte: 'Quoi ?' }] },
    ]
    const s = createSeance({ programme })
    const notes = jouer(s, 11)
    expect(s.tablesMuettes).toBe(true)
    notes.push(...jouer(s, 12.5))
    expect(s.tablesMuettes).toBe(false)
    const x = notes.find(([, e]) => e.type === 'echange' && e.id === 'X')
    expect(vers(x[0], 12)).toBe(true)                       // témoin : silence ignoré, X à 10 s
  })

  it('un échange en cours garde le silence : sa réplique suivante attend la fin des 3 s', () => {
    const programme = [
      { id: 'Y', t: 8, foyer: 'B', repliques: [{ qui: 'haas', texte: 'Il veut que je mette sa casquette.' },
        { qui: 'mattei', texte: 'Belote.' }] },
      { id: 'entreeSorel', t: 9, foyer: 'zinc', repliques: [{ qui: 'sorel', texte: 'Un café, Fernand.' }] },
    ]
    const notes = jouer(createSeance({ programme }), 14)
    const belote = notes.find(([, e]) => e.type === 'replique' && e.replique.texte === 'Belote.')
    expect(vers(belote[0], 12)).toBe(true)                  // due à 8 + 2,458 + 0,4 = 10,86 s (témoin : silence ignoré)
  })

  it('l\'appel : trois sonneries, une toutes les 1,5 s, puis Fernand décroche', () => {
    const notes = jouer(createSeance(), 280)
    const sonneries = notes.filter(([, e]) => e.type === 'sonnerie')
    expect(sonneries.map(([, e]) => e.coup)).toEqual([1, 2, 3])
    expect(sonneries.map(([t], i) => vers(t, 273 + 1.5 * i))).toEqual([true, true, true])
    const bivouac = notes.find(([, e]) => e.type === 'replique' && e.echange === 'appel')
    expect(bivouac[1].replique.texte).toBe('Bivouac. … Oui, mon colonel. Il est là.')
    expect(vers(bivouac[0], 277.5)).toBe(true)              // témoin : Fernand décroche à 273 s, sous la sonnerie
  })

  it('D2 : Sorel s\'approche à 315 s, une seule fois', () => {
    const notes = jouer(createSeance(), 430)
    const d2 = notes.filter(([, e]) => e.type === 'dialogue')
    expect(d2.map(([, e]) => e)).toEqual([{ type: 'dialogue', id: 'sorel' }])   // témoin : à chaque image
    expect(vers(d2[0][0], 315)).toBe(true)
  })

  it('D2 dès SOUPÇON, mais seulement Sorel entré, et pas pendant qu\'il parle au téléphone', () => {
    const avant = jouer(createSeance(), 250, soupconEntre(150, 160))
    expect(quand(avant, e => e.type === 'dialogue')).toEqual([])   // témoin : D2 avant l'entrée de Sorel
    const apres = jouer(createSeance(), 250, soupconEntre(240, 250))
    expect(vers(quand(apres, e => e.type === 'dialogue')[0], 240, 2)).toBe(true)   // le palier se lit au début de l'image
    const s = createSeance()
    const appel = jouer(s, 300, soupconEntre(280, 400))
    expect(quand(appel, e => e.type === 'dialogue')).toEqual([])   // témoin : D2 pendant l'appel, Sorel au combiné
    const finAppel = 273 + dureeEchange('appel', SEANCE.sonnerie.coups * SEANCE.sonnerie.intervalleS)
    const suite = jouer(s, 310, soupconEntre(280, 400))
    expect(vers(quand(suite, e => e.type === 'dialogue')[0], finAppel)).toBe(true)
  })

  it('D2 lancé par le regard (« Restez assis. ») ne se relance pas ; et plus de D2 une fois le départ commencé', () => {
    const regard = jouer(createSeance(), 430, t => ({ dialogue: t >= 230 && t < 260 ? enCours('sorel') : null }))
    expect(quand(regard, e => e.type === 'dialogue')).toEqual([])   // témoin : le dialogue de Sorel ignoré, D2 à 315 s
    // Fernand retient Viktor de 300 à 395 s : le départ (où il parle) attend, D2 aussi ; le départ passe d'abord
    const retenu = jouer(createSeance(), 430, t => ({ dialogue: t >= 300 && t < 395 ? enCours('fernand') : null }))
    expect(vers(Object.fromEntries(departs(retenu)).R3, 395, 2)).toBe(true)
    expect(quand(retenu, e => e.type === 'dialogue')).toEqual([])   // témoin : D2 après le départ de Sorel
  })

  it('l\'escorte est partie quand la porte s\'est refermée sur le départ', () => {
    const s = createSeance()
    jouer(s, 390)
    expect(s.statut('R3')).toBe('cours')
    expect(s.escortePartie).toBe(false)
    jouer(s, 389 + dureeEchange('R3') + 2 * DT)
    expect(s.escortePartie).toBe(true)                      // témoin : partie dès le début du départ
  })
})

describe('la fin de la soirée', () => {
  it('la fin attend le dialogue en cours, puis Viktor sort de lui-même 6 s après « Le 7 a gagné. »', () => {
    const s = createSeance()
    const notes = jouer(s, 460, t => ({ dialogue: t >= 410 && t < 440 ? enCours('lise') : null }))
    const fin = quand(notes, e => e.type === 'echange' && e.id === 'fin')
    expect(fin.length).toBe(1)
    expect(vers(fin[0], 440, 2)).toBe(true)                 // témoin : fin immédiate, à 420 s
    const sortie = notes.filter(([, e]) => e.type === 'sortie')
    expect(sortie.map(([, e]) => e)).toEqual([{ type: 'sortie', resultat: 'sorti', auto: true }])
    expect(vers(sortie[0][0], 440 + dureeEchange('fin') + 6, 2)).toBe(true)   // témoin : sortie à la fin de l'échange
    expect(s.fini).toBe(true)
    expect(s.update(DT)).toEqual([])
  })

  it('la sortie automatique attend aussi un dialogue ouvert pendant ses 6 s', () => {
    const notes = jouer(createSeance(), 460, t => ({ dialogue: t >= 423 && t < 450 ? enCours('lise') : null }))
    expect(vers(quand(notes, e => e.type === 'sortie')[0], 450, 2)).toBe(true)   // témoin : sortie sans attendre, à 427 s
  })

  it('la piste à 150 s si rien n\'est appris, une fois, après un dialogue en cours', () => {
    const piste = notes => quand(notes, e => e.type === 'reaction' && e.id === 'piste')
    const rien = jouer(createSeance(), 300)
    expect(piste(rien).length).toBe(1)                      // témoin : à chaque image
    expect(vers(piste(rien)[0], 150)).toBe(true)
    expect(piste(jouer(createSeance(), 300, t => ({ appris: t >= 100 ? 1 : 0 })))).toEqual([])   // témoin : piste malgré un renseignement
    const retenue = jouer(createSeance(), 300, t => ({ dialogue: t >= 145 && t < 160 ? enCours('lise') : null }))
    expect(vers(piste(retenue)[0], 160, 2)).toBe(true)         // témoin : la piste par-dessus le dialogue
  })

  it('sortie volontaire : sous 60, sorti ; à 60 ou plus, Sorel le suit et le démasque (S lu, §3.6)', () => {
    const s = createSeance()
    jouer(s, 30)
    expect(s.sortir(59.9)).toEqual([{ type: 'sortie', resultat: 'sorti', auto: false }])
    expect(s.fini).toBe(true)
    expect(s.update(DT)).toEqual([])
    expect(s.sortir(80)).toEqual([])                        // une seule sortie
    const d = createSeance()
    expect(d.sortir(60)).toEqual([{ type: 'reaction', id: 'sortieSoupcon' }, { type: 'demasque', cause: 'sortieSoupcon' }])   // témoin : seuil au-delà de 60
    expect(createSeance().sortir(60 - 1e-12)[0].type).toBe('reaction')   // à l'arrondi près, comme la jauge
    expect(() => createSeance().sortir(NaN)).toThrow()
  })

  it('les toilettes sont occupées de 240 à 300 s', () => {
    const s = createSeance()
    const vu = []
    for (const t of [239.9, 240.1, 299.9, 300.1]) { jouer(s, t); vu.push(s.wcOccupe) }
    expect(vu).toEqual([false, true, true, false])         // témoin : toujours libre
  })
})

describe('ce qui fait la soirée', () => {
  it('un grand pas rattrape ce qui était dû, dans l\'ordre : la même soirée qu\'image par image', () => {
    const resume = notes => notes.map(([, e]) => [e.type, e.id ?? e.echange ?? e.coup ?? '', e.rang ?? ''].join(':'))
    const fine = resume(jouer(createSeance(), 440))
    // D2 ouvre un dialogue que le reste de son image voit en cours (B11 l'ouvre à cette image) : son image finit juste
    // après 315 s, comme une image de 1/60 s ; jouer() ne rapporte pas ce dialogue ensuite (aucune coquille ne l'ouvre).
    const d = createSeance()
    const grosse = resume([d.update(300), d.update(15.01), d.update(124.99)].flat().map(e => [0, e]))
    expect(grosse).toEqual(fine)                           // témoin : les échanges traités l'un après l'autre, pas dans le temps
  })

  it('ni hasard, ni minuteur : rien n\'avance qu\'avec update', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random appelé') })
    const s = createSeance()
    jouer(s, 440)
    expect(vi.getTimerCount()).toBe(0)                      // témoin : la sortie automatique par setTimeout
    const t = s.t
    vi.advanceTimersByTime(10000)
    expect(s.t).toBe(t)
  })

  it('un programme faux, ou une situation fausse, est une erreur, jamais ignoré en silence', () => {
    const r = [{ qui: 'haas', texte: 'Belote.' }]
    expect(() => createSeance({ programme: [{ id: 'X', t: 1, repliques: r }, { id: 'X', t: 2, repliques: r }] })).toThrow(/X/)
    expect(() => createSeance({ programme: [{ id: 'X', t: 1, repliques: [] }] })).toThrow(/X/)
    expect(() => createSeance({ programme: [{ id: 'X', t: null, repliques: r }] })).toThrow(/X/)   // témoin : sans heure, jamais joué
    expect(() => createSeance().update(DT, { palier: 'méfiance' })).toThrow(/méfiance/)
  })
})
