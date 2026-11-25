import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

// M5 en deux temps (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §6 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B13) : la sauvegarde se souvient de l'étape (le bar ou le convoi),
// de ce que Viktor a appris au Bivouac et de sa couverture. Les transitions sont dans src/campaign/etapes.js
// (tests/campaign/etapes.test.js). Chaque test a été vu rouge sur upgrades.js d'avant la tâche (témoin écrit à côté de
// son assertion), puis vert.
describe('M5 : l\'étape et les renseignements du Bivouac dans la sauvegarde', () => {
  const RIEN = { trajet: false, vehicule: false, place: false, heure: false, leurre: false, appel: false, allie: false }
  const NEUF = { etape: 'bar', renseignements: RIEN, couverture: null }
  const CONVOI = { etape: 'convoi', renseignements: { ...RIEN, trajet: true, place: true, heure: true, allie: true },
    couverture: { soupconMax: 64.5, paliers: { mefiance: true, soupcon: true }, dureeS: 412.8 } }

  // Un faux localStorage, qui garde ce qu'on y écrit sous forme de texte (la vérification réelle de la tâche :
  // aller-retour saveProgress, loadProgress).
  function fauxStockage() {
    const m = new Map()
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) },
      removeItem: k => { m.delete(k) }, clear: () => m.clear(), lu: k => JSON.parse(m.get(k)) }
  }
  afterEach(() => vi.unstubAllGlobals())

  it('une campagne neuve est au bar, rien d\'appris', () => {
    expect(U.state.m5).toEqual(NEUF)                       // témoin : l'état d'avant la tâche, sans m5
  })

  it('aller-retour sur un faux localStorage : l\'étape, les sept renseignements et la couverture reviennent', async () => {
    const stock = fauxStockage()
    vi.stubGlobal('localStorage', stock)
    U.state.currentLevel = 5
    U.state.m5 = structuredClone(CONVOI)
    U.saveProgress()
    expect(stock.lu('sniper-save').m5).toEqual(CONVOI)     // témoin : saveProgress d'avant la tâche, qui n'écrit pas m5
    const M = await reload()
    expect(M.state.currentLevel).toBe(5)
    expect(M.state.m5).toEqual(CONVOI)
  })

  it('une ancienne sauvegarde sans m5 reprend au bar, tout à zéro, même si la mémoire disait le convoi', () => {
    U.state.m5 = structuredClone(CONVOI)
    localStorage.setItem('sniper-save', JSON.stringify({ currentLevel: 5, briefingSeen: [true, true, true, true, true, false] }))
    expect(U.loadProgress()).toBe(true)
    expect(U.state.m5).toEqual(NEUF)                       // témoin : loadProgress d'avant la tâche, qui laisse m5 tel quel
    expect(U.state.currentLevel).toBe(5)
  })

  it('une sauvegarde abîmée est nettoyée au chargement', async () => {
    localStorage.setItem('sniper-save', JSON.stringify({ currentLevel: 5,
      m5: { etape: 'convoi', renseignements: { trajet: 'true', heure: true, vehicule: 1 }, couverture: { soupconMax: 'beaucoup' } } }))
    const M = await reload()
    // témoin : loadProgress d'avant la tâche (m5 absent) ; puis d.m5 recopié sans nettoyage
    expect(M.state.m5).toEqual({ etape: 'convoi', renseignements: { ...RIEN, heure: true }, couverture: null })
    localStorage.setItem('sniper-save', JSON.stringify({ currentLevel: 5, m5: { etape: 'quai', renseignements: { trajet: true } } }))
    const N = await reload()
    expect(N.state.m5).toEqual(NEUF)
  })

  it('une nouvelle campagne (resetCampaignFlags) remet M5 au bar, tout à zéro', () => {
    U.state.m5 = structuredClone(CONVOI)
    U.resetCampaignFlags()
    expect(U.state.m5).toEqual(NEUF)                       // témoin : resetCampaignFlags d'avant la tâche
  })

  it('effacer la sauvegarde (resetProgress) remet aussi M5 au bar', () => {
    U.state.m5 = structuredClone(CONVOI); U.saveProgress()
    U.resetProgress()
    expect(U.state.m5).toEqual(NEUF)                       // témoin : resetProgress d'avant la tâche
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

// Lunette (spec du lot 3, décision 2 ; plan du lot 3a, tâche A5) : le zoom maximum de la mission, multiplié par
// 1 + 0,15 × niveau (×1,45 au niveau 3 : ×29 pour les ×20 de M4 au sous-lot 3c), au lieu d'un maximum fixe de
// 6 + 2 × niveau dans toutes les missions. Le maximum de la mission et la molette : src/aim.js (bornesDuZoom), câblés
// dans main.js (tests/shot/main.zoom.test.js, où la molette d'avant la tâche sert de témoin). Témoin : le getStats
// d'avant la tâche n'a que le maximum fixe, maxZoom (vu rouge).
describe('Lunette : le zoom maximum de la mission, relevé de 15 % par niveau (décision 2)', () => {
  it('facteur 1, 1,15, 1,3 et 1,45 du niveau 0 au niveau 3', () => {
    const vus = [0, 1, 2, 3].map(n => { U.state.levels.zoom = n; return U.getStats().maxZoomScale })
    // Arrondis à 1e-12 près ; un facteur absent (le getStats d'avant la tâche) donne NaN : une différence relevée par
    // l'assertion, pas une erreur
    expect(vus.map(f => Math.round(f * 1e12) / 1e12)).toEqual([1, 1.15, 1.3, 1.45])
  })

  it('plus de maximum fixe (maxZoom : 6 + 2 × niveau, de ×6 à ×12 quelle que soit la mission)', () => {
    U.state.levels.zoom = 3
    expect('maxZoom' in U.getStats()).toBe(false)
  })
})
