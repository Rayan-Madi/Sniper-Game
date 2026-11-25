import { describe, it, expect } from 'vitest'
import { RENSEIGNEMENTS, CHOIX_ECHEC, m5Neuf, etapeM5, apresBar, apresEchecConvoi, apresReussiteM5, nettoyerM5 }
  from '../../src/campaign/etapes.js'
import { jumpToLevel } from '../../src/campaign/progress.js'
import { NOMS } from '../../src/bar/renseignements.js'

// Les deux temps de M5 dans la sauvegarde (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §2, §3.11 et §6 ;
// plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B13). Chaque test de comportement a été vu rouge sur le
// témoin écrit à côté de son assertion, glissé seul dans le module fini (ou, pour jumpToLevel, sur progress.js d'avant la
// tâche), puis vert. La sauvegarde elle-même (saveProgress, loadProgress, resetCampaignFlags, resetProgress) est tenue
// par tests/upgrades.test.js.

const RIEN = { trajet: false, vehicule: false, place: false, heure: false, leurre: false, appel: false, allie: false }
const NEUF = { etape: 'bar', renseignements: RIEN, couverture: null }
// ce que rend le bar (contrat de sortie du §3.11, src/bar/index.js) après une soirée : trajet, heure et le leurre
const APPRIS = { ...RIEN, trajet: true, heure: true, leurre: true }
const COUVERTURE = { soupconMax: 25.3, paliers: { mefiance: false, soupcon: false }, dureeS: 427.2 }
const sortie = (resultat, en = {}) => ({ resultat, renseignements: { ...APPRIS }, couverture: structuredClone(COUVERTURE), ...en })
// un état de campagne en M5, Viktor sorti du bar avec trajet, heure et le leurre
const auConvoi = () => ({ currentLevel: 5, campaignDone: false,
  m5: { etape: 'convoi', renseignements: { ...APPRIS }, couverture: structuredClone(COUVERTURE) } })
const auBar = () => ({ currentLevel: 5, campaignDone: false, m5: m5Neuf() })

describe('M5 au départ', () => {
  it('une partie neuve commence au bar, rien d\'appris, sans couverture', () => {
    expect(m5Neuf()).toEqual(NEUF)                         // témoin : la couverture vide de PARTIR SANS ENTRER au lieu de null
  })

  it('chaque départ est un objet neuf : en changer un ne change pas le suivant', () => {
    const a = m5Neuf()
    a.etape = 'convoi'; a.renseignements.trajet = true
    expect(m5Neuf()).toEqual(NEUF)                         // témoin : un seul objet de départ, rendu à chaque appel
  })

  it('les sept renseignements sont ceux du contrat de sortie du bar, dans son ordre (test de données)', () => {
    expect(RENSEIGNEMENTS).toEqual(NOMS)
    expect(Object.keys(m5Neuf().renseignements)).toEqual(NOMS)
  })
})

describe('etapeM5 : où reprend M5', () => {
  it('lit l\'étape sauvegardée', () => {
    expect(etapeM5(auConvoi())).toBe('convoi')             // témoin : toujours le bar
    expect(etapeM5(auBar())).toBe('bar')
  })

  it('un état sans m5 (ancienne sauvegarde) ou abîmé reprend au bar, sans erreur', () => {
    expect(etapeM5({ currentLevel: 5 })).toBe('bar')       // témoin : state.m5.etape lu tel quel, TypeError
    expect(etapeM5({ currentLevel: 5, m5: null })).toBe('bar')
    expect(etapeM5({ currentLevel: 5, m5: { etape: 'Convoi' } })).toBe('bar')   // témoin : toute étape non 'bar' vaut convoi
    expect(etapeM5({ currentLevel: 5, m5: 'convoi' })).toBe('bar')
  })
})

describe('le tableau du §6 : après le bar', () => {
  it('sorti : le convoi, avec ce que Viktor a appris et sa couverture ; à sauvegarder avant le bilan', () => {
    const s = auBar()
    const out = sortie('sorti')
    expect(apresBar(s, out)).toBe(true)
    expect(s.m5).toEqual({ etape: 'convoi', renseignements: APPRIS, couverture: COUVERTURE })   // témoin : la couverture oubliée
    expect(etapeM5(s)).toBe('convoi')
  })

  it('l\'état garde une copie : le contrat du bar changé ensuite ne le change pas', () => {
    const s = auBar()
    const out = sortie('sorti')
    apresBar(s, out)
    out.renseignements.place = true; out.couverture.paliers.soupcon = true; out.couverture.soupconMax = 80
    // témoin : le contrat gardé tel quel (s.m5.renseignements = out.renseignements)
    expect(s.m5).toEqual({ etape: 'convoi', renseignements: APPRIS, couverture: COUVERTURE })
  })

  it('passé (PARTIR SANS ENTRER) : le convoi, sans renseignement (décision 8) ; à sauvegarder', () => {
    const s = auBar()
    const couverture = { soupconMax: 0, paliers: { mefiance: false, soupcon: false }, dureeS: 0 }   // celle de src/bar/index.js
    // témoin : seul « sorti » mène au convoi
    expect(apresBar(s, { resultat: 'passe', renseignements: { ...RIEN }, couverture })).toBe(true)
    expect(s.m5).toEqual({ etape: 'convoi', renseignements: RIEN, couverture })
  })

  it('erreur : le convoi, avec ce qui était appris (§3.10, la partie ne se bloque jamais) ; à sauvegarder', () => {
    const s = auBar()
    // la sortie de secours de src/bar/index.js, quand même le contrat a levé : couverture nulle
    expect(apresBar(s, { resultat: 'erreur', renseignements: { ...RIEN, heure: true }, couverture: null, error: new Error('x') }))
      .toBe(true)                                          // témoin : seul « sorti » mène au convoi
    expect(s.m5).toEqual({ etape: 'convoi', renseignements: { ...RIEN, heure: true }, couverture: null })
    const t = auBar()
    expect(apresBar(t, sortie('erreur'))).toBe(true)
    expect(t.m5).toEqual({ etape: 'convoi', renseignements: APPRIS, couverture: COUVERTURE })
  })

  it('démasqué : rien ne change, rien à sauvegarder (RECOMMENCER rejoue le bar, tout à zéro)', () => {
    const s = auBar()
    const avant = s.m5
    expect(apresBar(s, sortie('demasque'))).toBe(false)    // témoin : toute fin mène au convoi
    expect(s.m5).toBe(avant)
    expect(s.m5).toEqual(NEUF)
  })

  it('abandon (MENU PRINCIPAL de la pause) : rien ne change, rien à sauvegarder ; M5 reprendra au bar', () => {
    const s = auBar()
    const avant = s.m5
    expect(apresBar(s, sortie('abandon'))).toBe(false)     // témoin : tout sauf démasqué mène au convoi
    expect(s.m5).toBe(avant)
    expect(etapeM5(s)).toBe('bar')
  })

  it('le contrat est nettoyé comme une sauvegarde : un booléen n\'est vrai que s\'il vaut true, une couverture invalide est nulle', () => {
    const s = auBar()
    apresBar(s, { resultat: 'sorti', renseignements: { ...RIEN, trajet: 'true', heure: true, casquette: true },
      couverture: { soupconMax: 'beaucoup', paliers: {}, dureeS: 12 } })
    // témoin : le contrat recopié sans nettoyage
    expect(s.m5).toEqual({ etape: 'convoi', renseignements: { ...RIEN, heure: true }, couverture: null })
  })

  it('une sortie absente ou un résultat inconnu est une erreur, et l\'état ne change pas', () => {
    const s = auBar()
    const avant = s.m5
    expect(() => apresBar(s, undefined)).toThrow()         // B16 : run.next() sans argument se voit
    // témoin : un résultat inconnu mené au convoi
    expect(() => apresBar(s, { resultat: 'fini', renseignements: { ...APPRIS }, couverture: null })).toThrow(/fini/)
    expect(() => apresBar(s, { renseignements: { ...APPRIS } })).toThrow()
    expect(s.m5).toBe(avant)
    expect(s.m5).toEqual(NEUF)
  })
})

describe('le tableau du §6 : après le convoi', () => {
  it('convoi raté, RECOMMENCER : rien ne change, les renseignements restent (décision 5) ; rien à sauvegarder', () => {
    const s = auConvoi()
    const avant = s.m5
    expect(apresEchecConvoi(s, 'recommencer')).toBe(false) // témoin : tout choix remet le bar
    expect(s.m5).toBe(avant)
    expect(etapeM5(s)).toBe('convoi')
  })

  it('convoi raté, REVOIR LE BRIEFING ou MENU PRINCIPAL : rien ne change non plus', () => {
    for (const choix of ['briefing', 'menu']) {
      const s = auConvoi()
      expect(apresEchecConvoi(s, choix)).toBe(false)       // témoin : tout choix remet le bar
      expect(s.m5).toEqual(auConvoi().m5)
    }
  })

  it('convoi raté, RETOURNER AU BIVOUAC : le bar, tout à zéro ; à sauvegarder', () => {
    const s = auConvoi()
    expect(apresEchecConvoi(s, 'bivouac')).toBe(true)
    expect(s.m5).toEqual(NEUF)                             // témoin : seule l'étape remise au bar, renseignements gardés
  })

  it('les quatre choix de l\'écran d\'échec, et un choix inconnu est une erreur', () => {
    expect(CHOIX_ECHEC).toEqual(['recommencer', 'briefing', 'menu', 'bivouac'])
    const s = auConvoi()
    expect(() => apresEchecConvoi(s, 'retour')).toThrow(/retour/)   // témoin : choix inconnu ignoré
    expect(s.m5).toEqual(auConvoi().m5)
  })

  it('M5 réussie : le bar, tout à zéro ; le rapport lit ce que Viktor savait, rendu par la transition', () => {
    const s = auConvoi()
    const savait = apresReussiteM5(s)
    expect(savait).toEqual(auConvoi().m5)                  // témoin : le nouvel état rendu (bar, tout faux)
    expect(s.m5).toEqual(NEUF)
    expect(etapeM5(s)).toBe('bar')
  })

  it('jumpToLevel (raccourci de développement) remet M5 au bar, tout à zéro', () => {
    const s = { ...auConvoi(), points: 0, totalScore: 0, currentLevel: 6, campaignDone: true }
    jumpToLevel(s, 5)                                     // témoin : progress.js:19-22, qui ne touche pas m5
    expect(s.m5).toEqual(NEUF)
    expect(s.currentLevel).toBe(5)
    expect(s.campaignDone).toBe(false)
    const t = auConvoi()
    jumpToLevel(t, 2)
    expect(etapeM5(t)).toBe('bar')
  })
})

describe('nettoyerM5 : la sauvegarde relue', () => {
  it('une sauvegarde au convoi, saine, est rendue telle quelle, en copie', () => {
    const brut = auConvoi().m5
    const m = nettoyerM5(brut)
    expect(m).toEqual(brut)
    expect(m.renseignements).not.toBe(brut.renseignements) // témoin : l'objet brut rendu tel quel
    expect(m.couverture.paliers).not.toBe(brut.couverture.paliers)
  })

  it('absente ou abîmée : le bar, tout à zéro', () => {
    for (const brut of [undefined, null, 'convoi', 42, true, []]) {
      expect(nettoyerM5(brut)).toEqual(NEUF)               // témoin : brut.etape lu sans garde, TypeError sur null
    }
  })

  it('une étape inconnue vaut le bar, et au bar rien n\'est appris', () => {
    const brut = { etape: 'parking', renseignements: { ...APPRIS }, couverture: structuredClone(COUVERTURE) }
    expect(nettoyerM5(brut)).toEqual(NEUF)                 // témoin : étape inconnue gardée
    // aucune transition ne mène au bar avec des renseignements (§6) : une sauvegarde qui le dit est abîmée
    expect(nettoyerM5({ ...brut, etape: 'bar' })).toEqual(NEUF)   // témoin : renseignements gardés au bar
  })

  it('un booléen n\'est vrai que s\'il vaut exactement true, et seuls les sept renseignements restent', () => {
    const m = nettoyerM5({ etape: 'convoi', couverture: null,
      renseignements: { trajet: 'true', vehicule: 1, place: true, heure: {}, leurre: 'false', appel: null, casquette: true } })
    // témoin : !!v, comme les autres drapeaux de loadProgress (« true », 1, {} et « false » vaudraient vrai)
    expect(m.renseignements).toEqual({ ...RIEN, place: true })
    expect(Object.keys(m.renseignements)).toEqual(NOMS)
    const p = nettoyerM5({ etape: 'convoi', renseignements: {},
      couverture: { ...COUVERTURE, paliers: { mefiance: 'true', soupcon: true } } })
    expect(p.couverture.paliers).toEqual({ mefiance: false, soupcon: true })   // témoin : !!v
    expect(nettoyerM5({ etape: 'convoi' }).renseignements).toEqual(RIEN)
  })

  it('une couverture invalide devient null', () => {
    const abimees = ['beaucoup', 12, [], { ...COUVERTURE, soupconMax: '30' }, { ...COUVERTURE, soupconMax: -1 },
      { ...COUVERTURE, soupconMax: 100.5 }, { ...COUVERTURE, soupconMax: null }, { ...COUVERTURE, dureeS: -3 },
      { ...COUVERTURE, dureeS: '427' }, { ...COUVERTURE, dureeS: Infinity }, { ...COUVERTURE, paliers: null },
      { ...COUVERTURE, paliers: 'mefiance' }, { soupconMax: 20, dureeS: 30 }]
    for (const couverture of abimees) {
      // témoin : la couverture gardée telle quelle
      expect(nettoyerM5({ etape: 'convoi', renseignements: { ...APPRIS }, couverture }).couverture).toBe(null)
    }
    // les bornes sont valides : la jauge va de 0 à 100 (§3.6), la soirée commence à 0 s
    const bornes = { soupconMax: 100, paliers: { mefiance: true, soupcon: true }, dureeS: 0 }
    // témoin : bornes exclues
    expect(nettoyerM5({ etape: 'convoi', renseignements: {}, couverture: bornes }).couverture).toEqual(bornes)
    // ce qui n'est pas de la couverture n'est pas gardé
    expect(nettoyerM5({ etape: 'convoi', renseignements: {}, couverture: { ...COUVERTURE, note: 'x' } }).couverture)
      .toEqual(COUVERTURE)
  })
})
