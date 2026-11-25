import { describe, it, expect } from 'vitest'
import { creerFenetres } from '../../src/campaign/window.js'

// Les fenêtres de tir (spec du lot 3, §2 g ; plan du lot 3a, tâche A8) : une fenêtre s'ouvre au premier signal de son
// événement de départ (le premier tir, l'entrée dans le virage, le décroché), dure dureeS, et son échéance, une fois,
// fait échouer la mission, coûte une pénalité, ou signale un événement. La fin de la mission les arrête toutes.
//
// Témoins (par mutation de src/campaign/window.js, chacune vue rouge) : l'échéance rendue à chaque image au lieu d'une
// fois ; la fenêtre rouverte à chaque signal de son départ ; l'échéance rendue après arreter().

const M4 = { nom: 'triple', depart: 'premier-tir', dureeS: 6, echeance: { echec: 'Un officier a gagné un igloo.' } }
const PENALITE = { nom: 'lente', depart: 'tir', dureeS: 2, echeance: { penalite: 50, fil: 'Trop lent (-50 pts)' } }

describe('creerFenetres', () => {
  it('fermée tant que son départ n\'est pas signalé : aucune échéance, aucune fenêtre ouverte', () => {
    const f = creerFenetres([M4])
    f.signaler('depart', 0)
    expect(f.avancer(100)).toEqual([])
    expect(f.ouvertes(100)).toEqual([])
  })

  it('ouverte au premier tir (t = 3) : 6 s plus tard, son échéance, une seule fois', () => {
    const f = creerFenetres([M4])
    f.signaler('premier-tir', 3)
    expect(f.ouvertes(4.5)).toEqual([{ nom: 'triple', dureeS: 6, resteS: 4.5 }])
    expect(f.avancer(8.99)).toEqual([])
    expect(f.avancer(9)).toEqual([{ nom: 'triple', echeance: M4.echeance, t: 9 }])
    expect(f.avancer(9.5)).toEqual([])
    expect(f.ouvertes(9.5)).toEqual([])
  })

  it('un second signal de son départ ne la rouvre pas, ne la prolonge pas', () => {
    const f = creerFenetres([M4])
    f.signaler('premier-tir', 3)
    f.signaler('premier-tir', 5)
    expect(f.avancer(9).map(e => e.t)).toEqual([9])
  })

  it('plusieurs fenêtres, chacune son départ ; leurs échéances dans l\'ordre de leurs instants', () => {
    const f = creerFenetres([M4, PENALITE])
    f.signaler('premier-tir', 0)
    f.signaler('tir', 0)
    expect(f.avancer(10).map(e => e.nom)).toEqual(['lente', 'triple'])
  })

  it('arreter() (la fin de la mission) : plus d\'échéance, plus de fenêtre ouverte, plus d\'ouverture', () => {
    const f = creerFenetres([M4, PENALITE])
    f.signaler('premier-tir', 0)
    f.arreter()
    f.signaler('tir', 1)
    expect(f.avancer(10)).toEqual([])
    expect(f.ouvertes(1)).toEqual([])
  })

  it('sans fenêtre (les six missions d\'aujourd\'hui) : rien', () => {
    const f = creerFenetres([])
    f.signaler('premier-tir', 0)
    expect(f.avancer(1e6)).toEqual([])
  })
})
