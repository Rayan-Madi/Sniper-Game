import { describe, it, expect, vi, beforeEach } from 'vitest'

let U
beforeEach(async () => { localStorage.clear(); delete window.__freedVictims; vi.resetModules(); U = await import('../src/upgrades.js') })
const reload = async () => { vi.resetModules(); const M = await import('../src/upgrades.js'); M.loadProgress(); return M }

describe('progression de la campagne', () => {
  it('part d\'un port non libéré et d\'aucun briefing vu', () => {
    expect(U.state.freedVictims).toBe(false)
    expect(U.state.briefingSeen).toEqual([false, false, false, false, false, false])
  })

  it('sauvegarde et recharge toute la progression : mission, points, score, améliorations, port, briefings, fin', async () => {
    U.state.currentLevel = 4; U.state.points = 5; U.state.totalScore = 2380
    U.state.levels.velocity = 2; U.state.levels.zoom = 1
    U.state.campaignDone = true
    U.state.freedVictims = true; U.markBriefingSeen(2); U.saveProgress()
    const M = await reload()
    expect(M.state.currentLevel).toBe(4)
    expect(M.state.points).toBe(5)
    expect(M.state.totalScore).toBe(2380)
    expect(M.state.levels).toEqual({ velocity: 2, stability: 0, coldblood: 0, zoom: 1, silencer: 0 })
    expect(M.state.campaignDone).toBe(true)
    expect(M.state.freedVictims).toBe(true)
    expect(M.state.briefingSeen).toEqual([false, false, true, false, false, false])
  })

  it('une ancienne sauvegarde sans le champ ne compte pas la campagne comme finie', () => {
    // L'état en mémoire dit « finie » : seule la lecture de la sauvegarde peut le remettre à faux.
    U.state.campaignDone = true
    localStorage.setItem('sniper-save', JSON.stringify({ currentLevel: 6 }))
    expect(U.loadProgress()).toBe(true)
    expect(U.state.currentLevel).toBe(6)
    expect(U.state.campaignDone).toBe(false)
  })

  it('reprend le champ « freed » des anciennes sauvegardes', async () => {
    localStorage.setItem('sniper-save', JSON.stringify({ currentLevel: 4, freed: true }))
    const M = await reload()
    expect(M.state.freedVictims).toBe(true)
    expect(M.state.briefingSeen).toEqual([false, false, false, false, false, false])
  })

  it('une nouvelle campagne remet le port et les briefings vus à zéro', () => {
    U.state.freedVictims = true; U.markBriefingSeen(0)
    U.resetCampaignFlags()
    expect(U.state.freedVictims).toBe(false)
    expect(U.state.briefingSeen).toEqual([false, false, false, false, false, false])
  })

  it('effacer la sauvegarde remet aussi ces drapeaux à zéro', () => {
    U.state.freedVictims = true; U.markBriefingSeen(5); U.state.campaignDone = true; U.saveProgress()
    U.resetProgress()
    expect(U.state.freedVictims).toBe(false)
    expect(U.state.briefingSeen[5]).toBe(false)
    expect(U.state.campaignDone).toBe(false)
    expect(localStorage.getItem('sniper-save')).toBeNull()
  })

  it('n\'utilise plus window.__freedVictims', async () => {
    U.state.freedVictims = true; U.saveProgress()
    await reload()
    expect(window.__freedVictims).toBeUndefined()
  })

  it('le prologue n\'est pas vu au départ, se sauvegarde, et une nouvelle campagne le remet à zéro', async () => {
    expect(U.state.prologueSeen).toBe(false)
    U.markPrologueSeen(); U.saveProgress()
    const M = await reload()
    expect(M.state.prologueSeen).toBe(true)
    M.resetCampaignFlags()
    expect(M.state.prologueSeen).toBe(false)
  })

  it('une ancienne sauvegarde sans le champ ne compte pas le prologue comme vu', async () => {
    localStorage.setItem('sniper-save', JSON.stringify({ currentLevel: 1, briefingSeen: [true, false, false, false, false, false] }))
    const M = await reload()
    expect(M.state.prologueSeen).toBe(false)
  })

  it('effacer la sauvegarde remet aussi le prologue à « non vu »', () => {
    U.markPrologueSeen(); U.saveProgress()
    U.resetProgress()
    expect(U.state.prologueSeen).toBe(false)
    expect(localStorage.getItem('sniper-save')).toBeNull()
  })
})

// Vélocité (spec du lot 3, §2 c ; plan du lot 3a, tâche A4) : la balle part à 800 m/s, 37,5 de plus par niveau, 950 au
// niveau 4 ; cette vitesse remplace le délai fixe (bulletDelay : 0,45 s moins 0,08 par niveau, quelle que soit la
// distance), et la culasse se raccourcit comme avant. Témoin : le getStats d'avant la tâche n'a que bulletDelay (vu
// rouge).
describe('Vélocité : la vitesse de la balle', () => {
  it('800, 837,5, 875, 912,5 et 950 m/s du niveau 0 au niveau 4', () => {
    const vus = [0, 1, 2, 3, 4].map(n => { U.state.levels.velocity = n; return U.getStats().v0 })
    expect(vus).toEqual([800, 837.5, 875, 912.5, 950])
  })

  it('plus de délai fixe (bulletDelay) : la balle met le temps de son vol, et non 0,45 s à toute distance', () => {
    expect('bulletDelay' in U.getStats()).toBe(false)
  })

  it('la culasse se raccourcit toujours avec la Vélocité (1,2 s à 0,9 s)', () => {
    U.state.levels.velocity = 0
    expect(U.getStats().boltS).toBe(1.2)
    U.state.levels.velocity = 4
    expect(U.getStats().boltS).toBe(0.9)
  })
})
