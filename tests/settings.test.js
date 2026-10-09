import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

// Effets atténués en vigueur (spec du lot 1 §4.5, tâche L6) : effectsReduced() combine le réglage et la préférence du
// système, relue à chaque appel (flash du tir, lancement d'une cinématique).
describe('effets atténués en vigueur', () => {
  let system = false
  const asked = []
  beforeEach(() => {
    system = false; asked.length = 0
    window.matchMedia = q => { asked.push(q); return { matches: q === '(prefers-reduced-motion: reduce)' && system } }
  })
  afterEach(() => { delete window.matchMedia })

  it('Auto suit le système, relu à chaque appel', async () => {
    const s = await load()
    expect(s.reducedMotion).toBe('auto')
    expect(mod.effectsReduced()).toBe(false)
    system = true
    expect(mod.effectsReduced()).toBe(true)
    expect(asked).toContain('(prefers-reduced-motion: reduce)')
  })

  it('Oui force les effets atténués, Non les effets normaux, quel que soit le système', async () => {
    const s = await load({ ...OLD_SAVE, reducedMotion: 'oui' })
    expect(mod.effectsReduced()).toBe(true)
    s.reducedMotion = 'non'; system = true
    expect(mod.effectsReduced()).toBe(false)
  })

  it('navigateur sans matchMedia : Auto donne des effets normaux', async () => {
    delete window.matchMedia
    await load()
    expect(mod.effectsReduced()).toBe(false)
  })
})
