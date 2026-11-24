import { describe, it, expect } from 'vitest'
import { creerRadio, dureeDeLigne } from '../../src/campaign/radio.js'
import { estimate } from '../../src/briefing/kit.js'

// La radio d'Anton en mission (spec du lot 3, §2 g ; plan du lot 3a, tâche A8 ; contrat avec le lot 4) : un événement
// de la mission (le départ, le premier tir, le calme…) fait dire à Anton les lignes de la mission qui l'attendent, apresS
// secondes plus tard, au plus `fois` fois (une par défaut). Une ligne à la fois : la suivante attend que la précédente
// soit dite, le temps des bips (la règle des cinématiques, 350 ms et 62 ms par caractère). suspendre() la fait taire (la
// pause ; la kill-cam du lot 4), la ligne en cours coupée ; reprendre() la rend.
//
// Témoins (par mutation de src/campaign/radio.js, chacune vue rouge) : deux lignes dites ensemble ; `fois` ignoré (la
// ligne redite à chaque événement) ; apresS ignoré ; une ligne dite pendant la suspension ; la ligne coupée qui garde
// le canal jusqu'à sa fin prévue.

const L = (evenement, texte, o = {}) => ({ evenement, texte, ...o })

describe('dureeDeLigne : le temps des bips, la règle des cinématiques', () => {
  it('350 ms plus 62 ms par caractère, en secondes ; la même que estimate (src/briefing/kit.js)', () => {
    for (const t of ['Il décroche.', 'Eux deux, c\'est fait. Le cadenas... c\'est toi qui vois.', '']) {
      expect(dureeDeLigne(t)).toBeCloseTo(estimate(t) / 1000, 12)
    }
  })
})

describe('creerRadio', () => {
  it('une ligne sur son événement : dite tout de suite, avec sa durée', () => {
    const r = creerRadio([L('calme', 'Eux deux, c\'est fait.')])
    r.signaler('depart', 0)
    expect(r.avancer(1)).toEqual([])
    r.signaler('calme', 2)
    expect(r.avancer(2)).toEqual([{ evenement: 'calme', texte: 'Eux deux, c\'est fait.', dureeS: dureeDeLigne('Eux deux, c\'est fait.') }])
    expect(r.avancer(10)).toEqual([])
  })

  it('apresS : dite apresS secondes après l\'événement', () => {
    const r = creerRadio([L('depart', 'Des coups sourds.', { apresS: 5 })])
    r.signaler('depart', 0)
    expect(r.avancer(4.99)).toEqual([])
    expect(r.avancer(5).map(l => l.texte)).toEqual(['Des coups sourds.'])
  })

  it('une fois par défaut ; fois : n', () => {
    const r = creerRadio([L('tir', 'Un.'), L('tir', 'Encore.', { fois: 2 })])
    for (let i = 0; i < 4; i++) r.signaler('tir', i * 10)
    const dites = []
    for (let t = 0; t < 60; t += 0.5) dites.push(...r.avancer(t).map(l => l.texte))
    expect(dites).toEqual(['Un.', 'Encore.', 'Encore.'])
  })

  it('une ligne à la fois : la suivante attend la fin de la précédente', () => {
    const r = creerRadio([L('tir', 'Première ligne.'), L('tir', 'Seconde.')])
    r.signaler('tir', 0)
    expect(r.avancer(0).map(l => l.texte)).toEqual(['Première ligne.'])
    const fin = dureeDeLigne('Première ligne.')
    expect(r.avancer(fin - 0.01)).toEqual([])
    expect(r.avancer(fin).map(l => l.texte)).toEqual(['Seconde.'])
  })

  it('les lignes en attente passent dans l\'ordre de leurs instants', () => {
    const r = creerRadio([L('depart', 'Tard.', { apresS: 3 }), L('depart', 'Tôt.', { apresS: 1 })])
    r.signaler('depart', 0)
    const dites = []
    for (let t = 0; t < 10; t += 0.1) dites.push(...r.avancer(t).map(l => l.texte))
    expect(dites).toEqual(['Tôt.', 'Tard.'])
  })

  it('suspendre() : rien n\'est dit ; la ligne en cours est coupée ; reprendre() : la suivante tout de suite', () => {
    const r = creerRadio([L('tir', 'Une ligne assez longue.'), L('tir', 'La suivante.')])
    r.signaler('tir', 0)
    r.avancer(0)
    r.suspendre()
    expect(r.suspendue).toBe(true)
    expect(r.avancer(0.5)).toEqual([])
    expect(r.avancer(30)).toEqual([])
    r.reprendre()
    expect(r.suspendue).toBe(false)
    expect(r.avancer(0.6).map(l => l.texte)).toEqual(['La suivante.'])
  })

  it('sans ligne (les six missions d\'aujourd\'hui) : silence', () => {
    const r = creerRadio([])
    r.signaler('depart', 0); r.signaler('calme', 1)
    expect(r.avancer(100)).toEqual([])
  })
})
