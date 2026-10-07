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
