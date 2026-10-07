import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MAX_LEVEL, recordClear, jumpToLevel } from '../../src/campaign/progress.js'

let U
beforeEach(async () => { localStorage.clear(); vi.resetModules(); U = await import('../../src/upgrades.js') })
// Simule un redémarrage du jeu : état en mémoire neuf, puis lecture de la sauvegarde (comme main.js au chargement).
const reload = async () => { vi.resetModules(); const M = await import('../../src/upgrades.js'); M.loadProgress(); return M }

describe('réussite d\'une mission', () => {
  it('la campagne compte six missions', () => {
    expect(MAX_LEVEL).toBe(6)
  })

  it('réussir M2 crédite les points et le score, et passe à la mission 3', () => {
    const s = { points: 1, totalScore: 400, currentLevel: 2, campaignDone: false }
    const r = recordClear(s, { level: 2, reward: 2, score: 1250 })
    expect(s.currentLevel).toBe(3)
    expect(s.points).toBe(3)
    expect(s.totalScore).toBe(1250)
    expect(s.campaignDone).toBe(false)
    expect(r).toEqual({ cleared: 2, last: false })
  })

  it('après un redémarrage, la sauvegarde reprend à la mission suivante et ne propose plus de rejouer la mission réussie', async () => {
    U.state.currentLevel = 2; U.state.points = 1; U.state.totalScore = 400
    recordClear(U.state, { level: 2, reward: 2, score: 1250 })
    U.saveProgress()
    const M = await reload()
    expect(M.state.currentLevel).toBe(3)
    expect(M.state.points).toBe(3)
    expect(M.state.totalScore).toBe(1250)
    expect(M.state.campaignDone).toBe(false)
  })

  it('réussir M5 mène à la dernière mission sans finir la campagne', () => {
    const s = { points: 0, totalScore: 0, currentLevel: 5, campaignDone: false }
    const r = recordClear(s, { level: 5, reward: 3, score: 3000 })
    expect(s.currentLevel).toBe(6)
    expect(s.campaignDone).toBe(false)
    expect(r.last).toBe(false)
  })

  it('réussir M6 finit la campagne : on reste sur la mission 6, drapeau levé', () => {
    const s = { points: 0, totalScore: 0, currentLevel: 6, campaignDone: false }
    const r = recordClear(s, { level: 6, reward: 3, score: 5000 })
    expect(s.currentLevel).toBe(MAX_LEVEL)
    expect(s.campaignDone).toBe(true)
    expect(r).toEqual({ cleared: 6, last: true })
  })

  it('une campagne finie le reste après un redémarrage (le menu propose la fin, pas un rejeu de M6)', async () => {
    U.state.currentLevel = 6
    recordClear(U.state, { level: 6, reward: 3, score: 5000 })
    U.saveProgress()
    const M = await reload()
    expect(M.state.currentLevel).toBe(6)
    expect(M.state.campaignDone).toBe(true)
  })

  it('une nouvelle campagne remet le drapeau « campagne finie » à zéro', () => {
    U.state.campaignDone = true
    U.resetCampaignFlags()
    expect(U.state.campaignDone).toBe(false)
  })
})

describe('saut direct à une mission (raccourci de développement)', () => {
  it('sur une campagne finie, sauter en M3 puis la réussir reprend en M4, sans proposer la fin', () => {
    const s = { points: 0, totalScore: 0, currentLevel: 6, campaignDone: true }
    jumpToLevel(s, 3)
    expect(s.currentLevel).toBe(3)
    expect(s.campaignDone).toBe(false)
    recordClear(s, { level: 3, reward: 2, score: 900 })
    expect(s.currentLevel).toBe(4)
    expect(s.campaignDone).toBe(false)
  })

  it('sauter en M6 puis la réussir finit de nouveau la campagne', () => {
    const s = { points: 0, totalScore: 0, currentLevel: 6, campaignDone: true }
    jumpToLevel(s, 6)
    recordClear(s, { level: 6, reward: 3, score: 5000 })
    expect(s.currentLevel).toBe(6)
    expect(s.campaignDone).toBe(true)
  })
})
