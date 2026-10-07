import { describe, it, expect } from 'vitest'
import { canPause, canShoot, canClear, canFail, canRebrief } from '../../src/campaign/phase.js'
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

  // La pause est refusée pendant la kill-cam (canPause) : la fin du ralenti tombe toujours en 'playing'.
  // Une réussite qui arriverait quand même sous la pause la laisserait affichée par-dessus l'écran de fin.
  it('mission en pause : la réussite est refusée', () => {
    expect(canClear({ phase: 'paused' })).toBe(false)
  })

  it('briefing revu depuis la pause : la réussite est refusée', () => {
    expect(canClear({ phase: 'briefing' })).toBe(false)
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

// Petit simulateur de la mission, branché sur les gardes exactement comme main.js les appelle :
// pauseGame (Échap), resumeGame, shoot, startKillcam puis la fin de son minuteur (triggerLevelClear),
// les échecs (triggerGameOver, triggerFleeGameOver, triggerConvoyEscaped), killCivilian (échec 600 ms plus tard)
// et REVOIR LE BRIEFING depuis la pause (cinématique par-dessus la mission figée, puis retour à la pause).
function mission() {
  const s = {
    phase: 'playing', killcam: false, failPending: false,
    pauseShown: false, clearShown: false, failShown: false,
    shots: 0, alive: 2, score: 750,   // la partie en cours : ce que REVOIR LE BRIEFING ne doit pas perdre
  }
  const m = () => ({ phase: s.phase, killcam: s.killcam, failPending: s.failPending })
  return {
    s,
    pause()        { if (canPause(m())) { s.phase = 'paused'; s.pauseShown = true } },
    resume()       { if (s.phase === 'paused') { s.phase = 'playing'; s.pauseShown = false } },
    shoot()        { if (canShoot(m())) s.shots++ },
    lastTargetDown() { s.alive = 0; s.killcam = true },
    killcamEnd()   { if (canClear(m())) { s.phase = 'cleared'; s.clearShown = true } },
    fail()         { if (canFail(m())) { s.phase = 'dead'; s.pauseShown = false; s.failShown = true } },
    civilianDown() { s.failPending = true },
    rebrief()      { if (canRebrief(m())) { s.pauseShown = false; s.phase = 'briefing' } },
    rebriefEnd()   { s.phase = 'paused'; s.pauseShown = true },
  }
}

describe('séquences de fin de mission (gardes de phase)', () => {
  it('kill-cam puis Échap : la pause est refusée, la réussite arrive sans pause par-dessus', () => {
    const g = mission()
    g.lastTargetDown()
    g.pause()
    expect(g.s.phase).toBe('playing')
    expect(g.s.pauseShown).toBe(false)
    g.killcamEnd()
    expect(g.s.phase).toBe('cleared')
    expect(g.s.clearShown).toBe(true)
    expect(g.s.pauseShown).toBe(false)
  })

  it('réussite puis échec : la mission reste réussie, pas d\'écran d\'échec par-dessus', () => {
    const g = mission()
    g.lastTargetDown()
    g.killcamEnd()
    g.fail()
    expect(g.s.phase).toBe('cleared')
    expect(g.s.failShown).toBe(false)
  })

  it('échec pendant la kill-cam : refusé, la réussite arrive', () => {
    const g = mission()
    g.lastTargetDown()
    g.fail()
    expect(g.s.phase).toBe('playing')
    g.killcamEnd()
    expect(g.s.phase).toBe('cleared')
  })

  it('civil abattu puis Échap : la pause est refusée, l\'échec arrive sans pause par-dessus', () => {
    const g = mission()
    g.civilianDown()
    g.pause()
    expect(g.s.phase).toBe('playing')
    expect(g.s.pauseShown).toBe(false)
    g.fail()   // le minuteur de 600 ms
    expect(g.s.phase).toBe('dead')
    expect(g.s.failShown).toBe(true)
    expect(g.s.pauseShown).toBe(false)
  })

  it('pause puis REVOIR LE BRIEFING puis fin de cinématique : retour à la pause, partie intacte', () => {
    const g = mission()
    g.pause()
    g.rebrief()
    expect(g.s.phase).toBe('briefing')
    expect(g.s.pauseShown).toBe(false)
    // rien ne doit finir la mission sous la cinématique
    g.fail(); g.killcamEnd(); g.shoot(); g.pause()
    expect(g.s.phase).toBe('briefing')
    g.rebriefEnd()
    expect(g.s.phase).toBe('paused')
    expect(g.s.pauseShown).toBe(true)
    expect(g.s).toMatchObject({ alive: 2, score: 750, shots: 0, failShown: false, clearShown: false })
    g.resume()
    expect(g.s.phase).toBe('playing')
  })

  it('tir pendant la kill-cam : refusé (la balle ne serait jamais résolue)', () => {
    const g = mission()
    g.lastTargetDown()
    g.shoot()
    expect(g.s.shots).toBe(0)
  })

  // Avec la vélocité au maximum, une balle met 0,13 s : sans cette garde, la dernière cible abattue dans les
  // 600 ms qui suivent un civil lancerait la kill-cam, qui refuse l'échec, et la mission serait réussie.
  it('tir après un civil abattu : refusé, la mission ne peut plus être réussie', () => {
    const g = mission()
    g.civilianDown()
    g.shoot()
    expect(g.s.shots).toBe(0)
  })
})

describe('gardes de phase, cas limites', () => {
  it('REVOIR LE BRIEFING est refusé pendant qu\'un échec est en attente', () => {
    expect(canRebrief({ phase: 'paused', killcam: false, failPending: true })).toBe(false)
    expect(canRebrief({ phase: 'paused', killcam: false, failPending: false })).toBe(true)
  })

  it('REVOIR LE BRIEFING n\'existe que depuis la pause', () => {
    for (const phase of ['playing', 'briefing', 'cleared', 'dead', 'menu']) {
      expect(canRebrief({ phase, killcam: false, failPending: false })).toBe(false)
    }
  })

  it('l\'échec est accepté en jeu et en pause, jamais ailleurs', () => {
    expect(canFail({ phase: 'playing', killcam: false })).toBe(true)
    expect(canFail({ phase: 'paused', killcam: false })).toBe(true)
    for (const phase of ['briefing', 'cleared', 'dead', 'menu', 'investigation']) {
      expect(canFail({ phase, killcam: false })).toBe(false)
    }
  })

  it('la pause n\'existe qu\'en jeu', () => {
    for (const phase of ['paused', 'briefing', 'cleared', 'dead', 'menu']) {
      expect(canPause({ phase, killcam: false, failPending: false })).toBe(false)
    }
    expect(canPause({ phase: 'playing', killcam: false, failPending: false })).toBe(true)
  })
})
