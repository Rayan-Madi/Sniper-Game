import { describe, it, expect, vi, afterEach } from 'vitest'

// Allure des PNJ (plan du lot 3a, tâche A2) : le pas des cibles, des civils et des gardes, et les cibles imprévisibles,
// viennent de la mission (src/campaign/missions/, champ allure), dont src/levels.js a été vidé dans la tâche. Le PNJ les
// reçoit de mountLevel (main.js) ; sans allure (PvP), il garde le pas d'avant : 0,5 m/s, 0,4 pour les gardes.
//
// Témoin : avec le npc.js d'avant la tâche (commit 71edf6a), qui lisait levelData (targetSpeed, guardSpeed,
// unpredictable), l'allure passée est ignorée : cibles et civils à 0,5 m/s, gardes à 0,4, aucune cible imprévisible
// (trois tests vus rouges). Le cas sans allure (PvP) est une non-régression : vert avant comme après.

vi.mock('../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

const { scene } = await import('../src/scene.js')
const { NPC } = await import('../src/npc.js')
const { MISSIONS } = await import('../src/campaign/missions/index.js')

const crees = []
const pnj = opts => { const n = new NPC({ color: 0x888888, x: 0, z: 0, ...opts }); crees.push(n); return n }
afterEach(() => { for (const n of crees.splice(0)) scene.remove(n.mesh); vi.restoreAllMocks() })

describe('allure des PNJ : celle de la mission', () => {
  const allure = { cibles: 0.8, gardes: 0.6, imprevisibles: true }

  it('pas des cibles, que les civils suivent aussi, et pas des gardes', () => {
    expect(pnj({ isTarget: true, allure }).speed).toBe(0.8)
    expect(pnj({ isCivilian: true, allure }).speed).toBe(0.8)
    expect(pnj({ isGuard: true, allure }).speed).toBe(0.6)
  })

  // Le hasard figé à 0,99 : une cible imprévisible change d'activité au bout de 1,2 + 0,99 × 2 s, les autres PNJ au bout
  // de 2,5 + 0,99 × 5 s.
  it('cibles imprévisibles : elles changent d\'activité plus souvent ; ni les civils ni les gardes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    expect(pnj({ isTarget: true, allure }).stateInterval).toBeCloseTo(3.18, 9)
    expect(pnj({ isCivilian: true, allure }).stateInterval).toBeCloseTo(7.45, 9)
    expect(pnj({ isGuard: true, allure }).stateInterval).toBeCloseTo(7.45, 9)
    expect(pnj({ isTarget: true, allure: { ...allure, imprevisibles: false } }).stateInterval).toBeCloseTo(7.45, 9)
  })

  it('sans allure (PvP) : 0,5 m/s, 0,4 pour les gardes, aucune cible imprévisible', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    expect(pnj({ isTarget: true }).speed).toBe(0.5)
    expect(pnj({ isCivilian: true }).speed).toBe(0.5)
    expect(pnj({ isGuard: true }).speed).toBe(0.4)
    expect(pnj({ isTarget: true }).stateInterval).toBeCloseTo(7.45, 9)
  })

  it('M1 à M6 : le pas de leur mission', () => {
    for (const m of MISSIONS) {
      expect(pnj({ isTarget: true, allure: m.allure }).speed, `M${m.numero}`).toBe(m.allure.cibles)
      expect(pnj({ isGuard: true, allure: m.allure }).speed, `M${m.numero}`).toBe(m.allure.gardes)
    }
  })
})
