import { describe, it, expect } from 'vitest'
import { instantDeReaction, reagir, creerAlarme } from '../../src/campaign/alarm.js'
import { SON } from '../../src/shot/tuning.js'
import { fuiteParSorties } from '../../src/campaign/escape.js'
import { moduleModifie } from './moduleModifie.js'

// La réaction des cibles à un coup (spec du lot 3, §2 f, approche B ; plan du lot 3a, tâche A8) : une cible réagit au
// plus tôt du son du départ (entendu d / 343 s après le coup, d sa distance au tireur ; jamais au silencieux) et de la
// chute d'un collègue (cible ou garde) tombé à moins de rayonChuteM et en vue, plus la stupeur de sa mission ; ensuite
// elle fuit vers une sortie ou un abri. Seules réagissent ainsi les cibles d'une mission qui déclare des sorties ou des
// abris : sans eux, le cône de 80° et la fuite immédiate d'aujourd'hui restent la règle.
//
// Témoins (par mutation de src/campaign/alarm.js, chacune vue rouge, deux rejouées plus bas) : le son pris à la vitesse
// de la balle au lieu de celle du son ; la chute comptée hors de vue ; la stupeur oubliée ; le plus tard des deux au
// lieu du plus tôt ; une réaction plus tardive qui remplace la première ; une cible d'une mission sans sortie qui réagit.

// Un PNJ réduit à ce que lit le module : son état et sa position.
const pnj = (x, z, o = {}) => ({ alive: true, isTarget: true, isGuard: false, isCivilian: false, onVehicle: false, state: 'walk', mesh: { position: { x, y: 0, z } }, ...o })
// Une mission à sorties (une copie de M2 que le sous-lot 3b fera : la ruelle), sa réaction : 0,4 s de stupeur, chute vue
// jusqu'à 15 m.
const AVEC_SORTIE = { numero: 2, sorties: ['ruelle'], abris: [], reaction: { stupeurS: 0.4, rayonChuteM: 15 } }
const SANS_SORTIE = { numero: 1, sorties: [], abris: [], reaction: null }

// Deux cas joués sur le module, et sur ses copies fautives (témoins rejoués, plus bas).
function casCoupDeFeu({ reagir }) {
  const oeil = [0, 10, 0]
  const a = pnj(0, -34.3), b = pnj(3, -34.3)
  const r = reagir({ son: { t: 1, depuis: oeil }, chutes: [] }, [a, b], AVEC_SORTIE)
  expect(r.map(x => x.pnj)).toEqual([a, b])
  const da = Math.hypot(34.3, 10)
  expect(r[0].tBrut).toBeCloseTo(1 + da / 343, 9)
  expect(r[0].t).toBeCloseTo(1 + da / 343 + 0.4, 9)
  expect(r[0].depuis).toEqual(oeil)
}
function casPlusTot({ creerAlarme }) {
  const a = pnj(0, 0)
  const al = creerAlarme()
  al.planifier([{ pnj: a, tBrut: 1.254, t: 1.654, depuis: [0, 10, 0] }])
  al.planifier([{ pnj: a, tBrut: 0.54, t: 0.94, depuis: [3, 0, 0] }])
  al.planifier([{ pnj: a, tBrut: 2, t: 2.4, depuis: [9, 9, 9] }])
  expect(al.avancer(0.6)).toEqual([{ pnj: a, quoi: 'stupeur', depuis: [3, 0, 0] }])
  expect(al.avancer(0.94)).toEqual([{ pnj: a, quoi: 'fuite', depuis: [3, 0, 0] }])
  expect(al.avancer(3)).toEqual([])
}

describe('instantDeReaction : le plus tôt du son et d\'une chute vue, plus la stupeur', () => {
  it('le son du départ : tTir + d / 343 (430 m : 1,25 s ; 155 m : 0,45 s)', () => {
    expect(instantDeReaction({ tTir: 0, distanceTireurM: 430 })).toBeCloseTo(430 / 343, 9)
    expect(instantDeReaction({ tTir: 2, distanceTireurM: 155 })).toBeCloseTo(2 + 155 / SON.vitesse, 9)
    expect(430 / SON.vitesse).toBeCloseTo(1.254, 3)
  })

  it('au silencieux, rien à entendre : sans chute vue, aucune réaction (Infinity)', () => {
    expect(instantDeReaction({ tTir: 0, distanceTireurM: 30, silencieux: true })).toBe(Infinity)
  })

  it('la chute d\'un collègue en vue, à moins de rayonChuteM, avant le son : elle décide', () => {
    const chutes = [{ t: 0.54, distanceM: 3, enVue: true }]
    expect(instantDeReaction({ tTir: 0, distanceTireurM: 430, chutes, rayonChuteM: 15 })).toBe(0.54)
  })

  it('une chute hors de vue, ou plus loin que rayonChuteM, ne compte pas', () => {
    expect(instantDeReaction({ tTir: 0, distanceTireurM: 430, chutes: [{ t: 0.54, distanceM: 3, enVue: false }], rayonChuteM: 15 }))
      .toBeCloseTo(430 / 343, 9)
    expect(instantDeReaction({ tTir: 0, distanceTireurM: 430, chutes: [{ t: 0.54, distanceM: 16, enVue: true }], rayonChuteM: 15 }))
      .toBeCloseTo(430 / 343, 9)
  })

  it('le son avant la chute : le son décide ; la stupeur s\'ajoute au plus tôt des deux', () => {
    const chutes = [{ t: 0.9, distanceM: 2, enVue: true }]
    expect(instantDeReaction({ tTir: 0, distanceTireurM: 34.3, chutes, rayonChuteM: 15, stupeurS: 0.4 })).toBeCloseTo(0.1 + 0.4, 9)
  })
})

describe('reagir : les cibles d\'une mission à sorties ou abris, et elles seules', () => {
  const oeil = [0, 10, 0]

  it('le coup de feu : chaque cible vivante à pied, au son, plus la stupeur ; la source est le tireur', () => {
    casCoupDeFeu({ reagir })
  })

  it('ni civil, ni garde, ni cible morte, en fuite ou à bord d\'un véhicule', () => {
    const pnjs = [pnj(0, 0, { isTarget: false, isCivilian: true }), pnj(0, 0, { isTarget: false, isGuard: true }),
      pnj(0, 0, { alive: false }), pnj(0, 0, { state: 'flee' }), pnj(0, 0, { onVehicle: true })]
    expect(reagir({ son: { t: 0, depuis: oeil }, chutes: [] }, pnjs, AVEC_SORTIE)).toEqual([])
  })

  it('une mission sans sortie ni abri : personne (le cône et la fuite immédiate d\'aujourd\'hui décident)', () => {
    expect(reagir({ son: { t: 0, depuis: oeil }, chutes: [] }, [pnj(0, -30)], SANS_SORTIE)).toEqual([])
    expect(reagir({ son: { t: 0, depuis: oeil }, chutes: [] }, [pnj(0, -30)], { ...AVEC_SORTIE, sorties: [], abris: ['igloo'] }))
      .toHaveLength(1)
  })

  it('la chute d\'un collègue vu à 1,2 m : la cible réagit à l\'instant de la chute, tournée vers lui', () => {
    const marc = pnj(-3.2, -19.5, { alive: false }), luc = pnj(-2, -19.5)
    const vus = []
    const r = reagir({ son: null, chutes: [{ t: 3, pnj: marc }] }, [marc, luc], AVEC_SORTIE,
      { enVue: (obs, tombe) => { vus.push([obs, tombe]); return true } })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ pnj: luc, tBrut: 3, depuis: [-3.2, 0, -19.5] })
    expect(r[0].t).toBeCloseTo(3.4, 9)
    expect(vus).toEqual([[luc, marc]])
  })

  it('un garde qui tombe est un collègue ; la ligne de vue n\'est cherchée qu\'à portée de la chute', () => {
    const garde = pnj(0, 0, { isTarget: false, isGuard: true, alive: false }), pres = pnj(5, 0), loin = pnj(40, 0)
    let rayons = 0
    const r = reagir({ son: null, chutes: [{ t: 1, pnj: garde }] }, [garde, pres, loin], AVEC_SORTIE,
      { enVue: () => { rayons++; return true } })
    expect(r.map(x => x.pnj)).toEqual([pres])
    expect(rayons).toBe(1)
  })

  it('la chute cachée par le décor : pas de réaction sans le son (au silencieux)', () => {
    const marc = pnj(-3.2, -19.5, { alive: false }), luc = pnj(-2, -19.5)
    expect(reagir({ son: null, chutes: [{ t: 3, pnj: marc }] }, [marc, luc], AVEC_SORTIE, { enVue: () => false })).toEqual([])
  })
})

describe('creerAlarme : les réactions en attente, menées sur le temps de la mission', () => {
  it('à tBrut la stupeur (la cible se fige, tournée vers la source), à t la fuite ; une fois chacune', () => {
    const a = pnj(0, 0)
    const al = creerAlarme()
    al.planifier([{ pnj: a, tBrut: 1, t: 1.4, depuis: [0, 10, 0] }])
    expect(al.avancer(0.99)).toEqual([])
    expect(al.avancer(1)).toEqual([{ pnj: a, quoi: 'stupeur', depuis: [0, 10, 0] }])
    expect(al.avancer(1.39)).toEqual([])
    expect(al.avancer(1.4)).toEqual([{ pnj: a, quoi: 'fuite', depuis: [0, 10, 0] }])
    expect(al.avancer(5)).toEqual([])
    expect(al.enAttente()).toEqual([])
  })

  it('une image longue : la stupeur puis la fuite, dans l\'ordre, et les cibles dans l\'ordre de leurs instants', () => {
    const a = pnj(0, 0), b = pnj(1, 0)
    const al = creerAlarme()
    al.planifier([{ pnj: a, tBrut: 0.3, t: 0.3, depuis: [0, 0, 0] }, { pnj: b, tBrut: 0.1, t: 0.5, depuis: [0, 0, 0] }])
    expect(al.avancer(1).map(e => [e.pnj === a ? 'a' : 'b', e.quoi])).toEqual([['b', 'stupeur'], ['a', 'stupeur'], ['a', 'fuite'], ['b', 'fuite']])
  })

  it('le plus tôt l\'emporte : la chute vue (0,54 s) avant le son (1,25 s) ; une réaction plus tardive ne change rien', () => {
    casPlusTot({ creerAlarme })
  })

  it('morte ou déjà en fuite d\'ici là : oubliée ; vider() oublie tout', () => {
    const a = pnj(0, 0), b = pnj(1, 0), c = pnj(2, 0)
    const al = creerAlarme()
    al.planifier([{ pnj: a, tBrut: 1, t: 2, depuis: [0, 0, 0] }, { pnj: b, tBrut: 1, t: 2, depuis: [0, 0, 0] }])
    a.alive = false; b.state = 'flee'
    expect(al.avancer(3)).toEqual([])
    al.planifier([{ pnj: c, tBrut: 1, t: 2, depuis: [0, 0, 0] }])
    al.vider()
    expect(al.avancer(3)).toEqual([])
  })
})

// Témoins rejoués : des copies fautives de src/campaign/alarm.js, exécutées telles quelles (moduleModifie), font rougir
// les cas qu'elles visent ; la copie neutre s'y comporte comme le module.
describe('témoins rejoués', () => {
  const copie = remplacement => moduleModifie('src/campaign/alarm.js', remplacement, { SON, fuiteParSorties })
  it('la stupeur oubliée : le coup de feu rougit', () => {
    expect(() => casCoupDeFeu(copie(['t: tBrut + stupeurS, depuis', 't: tBrut, depuis']))).toThrow()
  })
  it('une réaction plus tardive qui remplace la première : le plus tôt ne l\'emporte plus', () => {
    expect(() => casPlusTot(copie(['if (!a || r.t < a.t)', 'if (true)']))).toThrow()
  })
  it('témoin des témoins : la copie neutre passe les deux cas', () => {
    const neutre = copie(['if (!a || r.t < a.t)', 'if (!a || r.t < a.t)'])
    casCoupDeFeu(neutre); casPlusTot(neutre)
  })
})
