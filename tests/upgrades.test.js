import { describe, it, expect, vi, beforeEach } from 'vitest'

let U
beforeEach(async () => { localStorage.clear(); delete window.__freedVictims; vi.resetModules(); U = await import('../src/upgrades.js') })
const reload = async () => { vi.resetModules(); const M = await import('../src/upgrades.js'); M.loadProgress(); return M }

describe('progression de la campagne', () => {
  it('part d\'un port non libéré et d\'aucun briefing vu', () => {
    expect(U.state.freedVictims).toBe(false)
    expect(U.state.briefingSeen).toEqual([false, false, false, false, false, false])
  })

  it('sauvegarde et recharge le choix du port et les briefings vus', async () => {
    U.state.freedVictims = true; U.markBriefingSeen(2); U.saveProgress()
    const M = await reload()
    expect(M.state.freedVictims).toBe(true)
    expect(M.state.briefingSeen).toEqual([false, false, true, false, false, false])
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
    U.state.freedVictims = true; U.markBriefingSeen(5)
    U.resetProgress()
    expect(U.state.freedVictims).toBe(false)
    expect(U.state.briefingSeen[5]).toBe(false)
  })

  it('n\'utilise plus window.__freedVictims', async () => {
    U.state.freedVictims = true; U.saveProgress()
    await reload()
    expect(window.__freedVictims).toBeUndefined()
  })
})
