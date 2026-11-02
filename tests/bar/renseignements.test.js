import { describe, it, expect, vi, afterEach } from 'vitest'
import { CONVOI } from '../../src/bar/reglages.js'
import { createCarnet, effetsSurLeConvoi, NOMS, QUATRE, RENSEIGNEMENTS_COMPLETS, FICHE, RADIO } from '../../src/bar/renseignements.js'

// Ce que Viktor apprend au Bivouac, et ce que le convoi en tire (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md
// §3.3, §3.11, §5.1 et §10 ; plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B6). Chaque test de comportement a
// été vu rouge sur le témoin écrit à côté de son assertion, glissé seul dans le module fini, puis vert.

afterEach(() => vi.restoreAllMocks())

// RENSEIGNEMENTS_COMPLETS, sauf ceux nommés
const sauf = (...noms) => ({ ...RENSEIGNEMENTS_COMPLETS, ...Object.fromEntries(noms.map(n => [n, false])) })
// les seize combinaisons des quatre renseignements, avec ou sans le leurre
function combinaisons(leurre = false) {
  const out = []
  for (let k = 0; k < 16; k++) out.push({ ...Object.fromEntries(QUATRE.map((n, i) => [n, ((k >> i) & 1) === 1])), leurre })
  return out
}
const pareil = (a, b) => JSON.stringify(a) === JSON.stringify(b)

describe('le carnet de Viktor', () => {
  it('un renseignement ne s\'apprend qu\'une fois : le tampon NOTÉ ne tombe qu\'à la première', () => {
    const c = createCarnet()
    expect(c.apprendre('trajet')).toEqual(['trajet'])
    expect(c.apprendre('trajet')).toEqual([])              // témoin : le nom rendu à chaque fois (un tampon par réplique)
    // l'effet apprend d'un choix de dialogue (F4.1 : l'heure et Fernand allié), un doublon compté une fois
    expect(c.apprendre(['heure', 'allie', 'heure'])).toEqual(['heure', 'allie'])
    expect([c.connait('trajet'), c.connait('heure'), c.connait('allie'), c.connait('place')]).toEqual([true, true, true, false])
  })

  it('appris ne compte que les quatre renseignements, jamais les drapeaux de récit', () => {
    const c = createCarnet()
    c.apprendre(['leurre', 'appel', 'allie'])
    expect(c.appris).toBe(0)                               // témoin : tout ce qui est connu compté, 3
    c.apprendre('vehicule')
    expect(c.appris).toBe(1)
  })

  it('renseignements : le contrat de sortie (§3.11), sept booléens dans l\'ordre, et une copie', () => {
    const c = createCarnet()
    c.apprendre(['place', 'appel'])
    const r = c.renseignements
    expect(r).toEqual({ trajet: false, vehicule: false, place: true, heure: false, leurre: false, appel: true, allie: false })
    expect(Object.keys(r)).toEqual(NOMS)
    r.trajet = true
    expect(c.connait('trajet')).toBe(false)                // témoin : l'état du carnet rendu tel quel
    expect(c.renseignements.trajet).toBe(false)
  })

  it('un nom inconnu est une erreur, jamais ignoré en silence, et l\'appel fautif n\'apprend rien', () => {
    const c = createCarnet()
    expect(() => c.apprendre('trajets')).toThrow(/trajets/)   // témoin : nom inconnu ignoré
    expect(() => c.apprendre('toString')).toThrow()        // un nom hérité n'est pas un renseignement
    expect(() => c.connait('casquette')).toThrow(/casquette/)
    expect(() => c.apprendre(['heure', 'heures'])).toThrow(/heures/)
    expect(c.connait('heure')).toBe(false)                 // témoin : appris un à un avant de lire le suivant
    expect(() => createCarnet(['vieille route'])).toThrow()
  })

  it('les renseignements du départ (option de développement infos) sont connus d\'office, sans tampon', () => {
    const c = createCarnet(['trajet', 'heure'])
    expect(c.renseignements).toMatchObject({ trajet: true, heure: true, vehicule: false, place: false })
    expect(c.appris).toBe(2)
    expect(c.apprendre(['heure', 'place'])).toEqual(['place'])   // témoin : le carnet de départ ignoré
  })
})

describe('le convoi selon les renseignements : effetsSurLeConvoi (§5.1)', () => {
  it('les réglages du convoi sont ceux de la spec (§5.1, décision 2 tranchée en G1)', () => {
    expect(CONVOI).toEqual({
      fenetre: {
        virage: { dureeS: 13.5, barre: true, freinage: true },
        ligneDroite: { dureeS: 9, barre: false, freinage: false },
      },
      arrivee: {
        calme: { avantFenetreS: 40, stressDepart: 0 },
        juste: { avantFenetreS: 8, stressDepart: 0.5 },
      },
      pointsParRenseignement: 50,
    })
    expect(NOMS).toEqual(['trajet', 'vehicule', 'place', 'heure', 'leurre', 'appel', 'allie'])
    expect(QUATRE).toEqual(['trajet', 'vehicule', 'place', 'heure'])
  })

  it('les quatre connus donnent le M5 de la spec du lot 3 : virage, 13,5 s, barre, freinage, arrivée calme', () => {
    const e = effetsSurLeConvoi({ trajet: true, vehicule: true, place: true, heure: true })
    expect(e.poste).toBe('virage')                         // témoin : la ligne droite pour tous
    expect(e.fenetre).toEqual({ dureeS: 13.5, barre: true, freinage: true })
    expect(e.arrivee).toEqual({ avantFenetreS: 40, stressDepart: 0 })
    expect(e.fiche).toEqual(['DOSSIER 05', 'COL. KESSLER · AUCUNE PHOTO', 'VÉHICULE 2 SUR 3', 'CÔTÉ PASSAGER'])
    expect(e.bonus).toEqual({ points: 200, lignes: ['RENSEIGNEMENTS 4 / 4'] })
    expect(Object.keys(e)).toEqual(['poste', 'fenetre', 'arrivee', 'fiche', 'radio', 'bonus'])
    // la constante du sous-lot 3d (tant que l'étape 2 du bar n'est pas fusionnée) : le même convoi, la casquette en plus
    expect(RENSEIGNEMENTS_COMPLETS).toEqual({ trajet: true, vehicule: true, place: true, heure: true, leurre: true,
      appel: false, allie: false })
    const c = effetsSurLeConvoi(RENSEIGNEMENTS_COMPLETS)
    expect({ ...c, fiche: null }).toEqual({ ...e, fiche: null })
    expect(c.fiche).toEqual([...e.fiche, 'CASQUETTE AU 3 : LEURRE'])
  })

  it('un renseignement manqué coûte ce que dit le tableau du §5.1, jamais une devinette', () => {
    const sansTrajet = effetsSurLeConvoi(sauf('trajet'))
    expect(sansTrajet.poste).toBe('ligneDroite')
    expect(sansTrajet.fenetre).toEqual({ dureeS: 9, barre: false, freinage: false })   // témoin : 13,5 s gardées sur la ligne droite
    expect(effetsSurLeConvoi(sauf('heure')).arrivee).toEqual({ avantFenetreS: 8, stressDepart: 0.5 })
    expect(effetsSurLeConvoi(sauf('vehicule')).fiche).toEqual(['DOSSIER 05', 'COL. KESSLER · AUCUNE PHOTO', 'VÉHICULE ?',
      'CÔTÉ PASSAGER', 'CASQUETTE AU 3 : LEURRE'])
    expect(effetsSurLeConvoi(sauf('place')).fiche).toEqual(['DOSSIER 05', 'COL. KESSLER · AUCUNE PHOTO', 'VÉHICULE 2 SUR 3',
      'PLACE ?', 'CASQUETTE AU 3 : LEURRE'])
    expect(effetsSurLeConvoi({})).toMatchObject({          // rien appris (PARTIR SANS ENTRER, décision 8 en G5)
      poste: 'ligneDroite', arrivee: { avantFenetreS: 8, stressDepart: 0.5 },
      fiche: ['DOSSIER 05', 'COL. KESSLER · AUCUNE PHOTO', 'VÉHICULE ?', 'PLACE ?'],
      bonus: { points: 0, lignes: ['RENSEIGNEMENTS 0 / 4'] },
    })
  })

  it('chaque inconnu ne change que ses champs, dans chacune des seize combinaisons', () => {
    const champs = {                                       // ce que chaque renseignement change, et lui seul
      trajet: ['poste', 'fenetre', 'radio', 'bonus'],
      vehicule: ['fiche', 'radio', 'bonus'],
      place: ['fiche', 'radio', 'bonus'],
      heure: ['arrivee', 'radio', 'bonus'],
      leurre: ['fiche'],                                   // un drapeau de récit : jamais la difficulté (§3.3)
      appel: [],
      allie: [],
    }
    for (const leurre of [false, true]) {
      for (const r of combinaisons(leurre)) {
        const e = effetsSurLeConvoi(r)
        for (const [nom, attendus] of Object.entries(champs)) {
          const autre = effetsSurLeConvoi({ ...r, [nom]: r[nom] !== true })
          const changes = Object.keys(e).filter(k => !pareil(e[k], autre[k]))
          expect(changes, `${nom} basculé depuis ${JSON.stringify(r)}`).toEqual(attendus)   // témoin : effets constants
        }
      }
    }
  })

  it('la radio du convoi : l\'heure au départ, la fenêtre, la jeep 2 selon ce qu\'on sait, et ce que dit qui', () => {
    expect(effetsSurLeConvoi(RENSEIGNEMENTS_COMPLETS).radio).toEqual([
      { evenement: 'depart', qui: 'anton', texte: 'Sept heures et quart. Ils roulent.' },
      { evenement: 'approche', qui: 'anton', texte: 'Ils arrivent. Respire.' },
      { evenement: 'fenetre', qui: 'viktor', texte: 'Ils freinent. Treize secondes.' },
      { evenement: 'jeep2', qui: 'viktor', texte: 'Deuxième véhicule. Côté passager.' },
      { evenement: 'leurreAbattu', qui: 'viktor', texte: 'La casquette. Ce n\'était pas lui.' },
      { evenement: 'alerte', qui: 'viktor', texte: 'Ils accélèrent.' },
      { evenement: 'cibleAbattue', qui: 'anton', texte: 'C\'est fait. La moto, maintenant.' },
    ])
    expect(effetsSurLeConvoi({}).radio).toEqual([             // sans rien : pas d'approche, la ligne droite, rien sur la jeep 2
      { evenement: 'depart', qui: 'anton', texte: 'Tu es juste. Ils sont déjà là.' },
      { evenement: 'fenetre', qui: 'viktor', texte: 'Ils ne freineront pas. Neuf secondes.' },
      { evenement: 'leurreAbattu', qui: 'viktor', texte: 'La casquette. Ce n\'était pas lui.' },
      { evenement: 'alerte', qui: 'viktor', texte: 'Ils accélèrent.' },
      { evenement: 'cibleAbattue', qui: 'anton', texte: 'C\'est fait. La moto, maintenant.' },
    ])
    const jeep2 = r => effetsSurLeConvoi(r).radio.find(l => l.evenement === 'jeep2')?.texte ?? null
    expect(jeep2({ vehicule: true })).toBe('Deuxième véhicule.')   // la moitié connue (témoin : la ligne entière)
    expect(jeep2({ place: true })).toBe('Côté passager.')
    expect(jeep2({ trajet: true, heure: true })).toBe(null)
  })

  it('seul exactement true compte : une sauvegarde abîmée ne vaut pas un renseignement', () => {
    const e = effetsSurLeConvoi({ trajet: 'true', vehicule: 1, place: {}, heure: true, leurre: 'oui' })
    expect(e.poste).toBe('ligneDroite')                    // témoin : lecture par vérité (« true » compté vrai)
    expect(e.fiche).toEqual(['DOSSIER 05', 'COL. KESSLER · AUCUNE PHOTO', 'VÉHICULE ?', 'PLACE ?'])
    expect(e.bonus.points).toBe(50)
    for (const rien of [undefined, null, 'trajet', 42]) expect(effetsSurLeConvoi(rien)).toEqual(effetsSurLeConvoi({}))
  })

  it('aucun aléa : deux appels identiques donnent le même objet, sans tirer au hasard', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random appelé') })
    for (const leurre of [false, true]) {
      for (const r of combinaisons(leurre)) {
        expect(effetsSurLeConvoi(r)).toEqual(effetsSurLeConvoi({ ...r }))   // témoin : une fenêtre tirée par Math.random
      }
    }
  })

  it('le résultat est figé jusqu\'au fond : le convoi ne peut pas changer les réglages du bar', () => {
    const e = effetsSurLeConvoi(RENSEIGNEMENTS_COMPLETS)
    const nonFiges = []
    const visiter = (v, ou) => {
      if (!v || typeof v !== 'object') return
      if (!Object.isFrozen(v)) nonFiges.push(ou)
      for (const [k, x] of Object.entries(v)) visiter(x, `${ou}.${k}`)
    }
    visiter(e, 'effets')
    expect(nonFiges).toEqual([])                           // témoin : Object.freeze en surface seulement
    expect(() => { e.fenetre.dureeS = 99 }).toThrow()
    expect(CONVOI.fenetre.virage.dureeS).toBe(13.5)
    for (const v of [FICHE, RADIO]) { nonFiges.length = 0; visiter(v, 'textes'); expect(nonFiges).toEqual([]) }
  })

  it('fiche et radio sans tiret cadratin, dans toutes les combinaisons (couvert aussi par tests/texts.test.js)', () => {
    const avecTiret = []
    for (const leurre of [false, true]) {
      for (const r of combinaisons(leurre)) {
        const e = effetsSurLeConvoi(r)
        const textes = [...e.fiche, ...e.radio.map(l => l.texte), ...e.bonus.lignes]
        for (const t of textes) if (t.includes('\u2014')) avecTiret.push(t)   // échappé, comme tests/texts.test.js
      }
    }
    expect(avecTiret).toEqual([])                          // témoin : un tiret cadratin dans « Ils accélèrent. »
  })
})
