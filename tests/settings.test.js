import { describe, it, expect, vi, beforeEach } from 'vitest'

// Réglages persistés (spec du lot 1 §4.3, tâche L4) : trois champs neufs, graphics ('auto' | 'bas' | 'moyen' |
// 'haut'), showStats (booléen) et reducedMotion ('auto' | 'oui' | 'non'). Une sauvegarde d'avant le lot 1 ne les a
// pas : elle prend les valeurs par défaut. Une valeur inconnue ou d'un autre type (sauvegarde abîmée, version future)
// aussi, sans rien perdre des autres réglages.

const KEY = 'sniper-settings'
let mod
async function load(saved) {
  vi.resetModules()
  localStorage.clear()
  if (saved !== undefined) localStorage.setItem(KEY, typeof saved === 'string' ? saved : JSON.stringify(saved))
  mod = await import('../src/settings.js')
  mod.loadSettings()
  return mod.settings
}
beforeEach(() => localStorage.clear())

const OLD_SAVE = {   // sauvegarde d'avant le lot 1
  volume: 40, sensitivity: 150, invertY: true,
  pvpKeys: { forward: 'KeyZ', left: 'KeyQ', back: 'KeyS', right: 'KeyD', ability1: 'Digit1', ability2: 'Digit2', ability3: 'Digit3', emote: 'KeyE' },
}

describe('réglages graphiques et de confort', () => {
  it('première partie : Auto, panneau masqué, effets atténués selon le système', async () => {
    const s = await load()
    expect([s.graphics, s.showStats, s.reducedMotion]).toEqual(['auto', false, 'auto'])
  })

  it('sauvegarde d\'avant le lot 1 : les nouveaux champs prennent leur valeur par défaut, le reste est gardé', async () => {
    const s = await load(OLD_SAVE)
    expect([s.graphics, s.showStats, s.reducedMotion]).toEqual(['auto', false, 'auto'])
    expect([s.volume, s.sensitivity, s.invertY, s.pvpKeys.forward]).toEqual([40, 150, true, 'KeyZ'])
  })

  it('valeurs valides gardées', async () => {
    for (const [graphics, showStats, reducedMotion] of [['bas', true, 'oui'], ['moyen', false, 'non'], ['haut', true, 'auto']]) {
      const s = await load({ ...OLD_SAVE, graphics, showStats, reducedMotion })
      expect([s.graphics, s.showStats, s.reducedMotion]).toEqual([graphics, showStats, reducedMotion])
    }
  })

  it('valeur inconnue ou d\'un autre type : valeur par défaut, les autres réglages gardés', async () => {
    const cases = [
      { graphics: 'ultra', showStats: 'oui', reducedMotion: true },
      { graphics: null, showStats: 1, reducedMotion: 'Oui' },
      { graphics: 2, showStats: null, reducedMotion: {} },
    ]
    for (const bad of cases) {
      const s = await load({ ...OLD_SAVE, ...bad })
      expect([s.graphics, s.showStats, s.reducedMotion]).toEqual(['auto', false, 'auto'])
      expect([s.volume, s.sensitivity, s.invertY]).toEqual([40, 150, true])
    }
  })

  it('sauvegarde illisible : tout par défaut', async () => {
    const s = await load('{pas du json')
    expect([s.graphics, s.showStats, s.reducedMotion, s.volume]).toEqual(['auto', false, 'auto', 70])
  })

  it('aller-retour par saveSettings', async () => {
    let s = await load()
    s.graphics = 'bas'; s.showStats = true; s.reducedMotion = 'non'
    mod.saveSettings()
    const raw = localStorage.getItem(KEY)
    vi.resetModules()
    mod = await import('../src/settings.js')
    localStorage.setItem(KEY, raw)
    mod.loadSettings()
    s = mod.settings
    expect([s.graphics, s.showStats, s.reducedMotion]).toEqual(['bas', true, 'non'])
  })
})
