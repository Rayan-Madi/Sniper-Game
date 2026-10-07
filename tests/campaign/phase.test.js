import { describe, it, expect } from 'vitest'
import { canClear } from '../../src/campaign/phase.js'
import { recordClear } from '../../src/campaign/progress.js'

describe('fin de la kill-cam : la réussite n\'est enregistrée que si la mission est encore en cours', () => {
  it('mission en cours : la réussite est acceptée', () => {
    expect(canClear({ phase: 'playing' })).toBe(true)
  })

  it('joueur mort pendant le ralenti : la réussite est refusée', () => {
    expect(canClear({ phase: 'dead' })).toBe(false)
  })

  it('réussite déjà enregistrée : pas une seconde fois', () => {
    expect(canClear({ phase: 'cleared' })).toBe(false)
  })

  it('retour au menu : pas d\'écran de réussite par-dessus', () => {
    expect(canClear({ phase: 'menu' })).toBe(false)
  })

  // Tant que la pause reste possible pendant la kill-cam, refuser ici bloquerait la mission (cibles toutes
  // abattues, plus rien pour la terminer). A3 interdit la pause pendant la kill-cam : ce cas changera alors.
  it('pause prise pendant le ralenti : la réussite arrive quand même', () => {
    expect(canClear({ phase: 'paused' })).toBe(true)
  })

  it('mort pendant le ralenti : ni points, ni score, ni mission suivante (RÉESSAYER relance la même mission)', () => {
    const s = { points: 1, totalScore: 400, currentLevel: 2, campaignDone: false }
    const m = { phase: 'playing' }
    m.phase = 'dead'   // un échec tombe pendant la kill-cam de la dernière cible
    // fin du ralenti, comme main.js : la réussite n'est enregistrée que si la garde l'accepte
    if (canClear(m)) recordClear(s, { level: 2, reward: 2, score: 1250 })
    expect(s).toEqual({ points: 1, totalScore: 400, currentLevel: 2, campaignDone: false })
  })
})
