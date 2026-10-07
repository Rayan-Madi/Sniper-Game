import { describe, it, expect, beforeEach } from 'vitest'
import { frameStats, createStatsPanel } from '../../src/gfx/stats.js'

// Durées d'image en ms : images par seconde = 1000 / moyenne ; p50 et p95 au rang le plus proche (valeur réellement
// observée, jamais interpolée) : rang = ⌈p × n⌉ dans la liste triée.
describe('frameStats', () => {
  it('tableau vide : tout à zéro', () => {
    expect(frameStats([])).toEqual({ fps: 0, p50: 0, p95: 0 })
  })

  it('images régulières à 60 i/s', () => {
    const s = frameStats(Array(120).fill(1000 / 60))
    expect(s.fps).toBeCloseTo(60, 6)
    expect(s.p50).toBeCloseTo(1000 / 60, 6)
    expect(s.p95).toBeCloseTo(1000 / 60, 6)
  })

  it('quatre durées connues, dans le désordre', () => {
    // moyenne 25 ms → 40 i/s ; triées 10 20 30 40 : p50 au rang 2 (20), p95 au rang 4 (40)
    expect(frameStats([40, 10, 30, 20])).toEqual({ fps: 40, p50: 20, p95: 40 })
  })

  it('1 à 100 ms : p50 = 50, p95 = 95, moyenne 50,5', () => {
    const s = frameStats(Array.from({ length: 100 }, (_, i) => 100 - i))
    expect(s.p50).toBe(50)
    expect(s.p95).toBe(95)
    expect(s.fps).toBeCloseTo(1000 / 50.5, 9)
  })

  it('une image lente sur 120 pèse sur la moyenne, pas sur la p95', () => {
    const s = frameStats([...Array(119).fill(16), 200])
    expect(s.p50).toBe(16)
    expect(s.p95).toBe(16)
    expect(s.fps).toBeCloseTo(1000 / ((119 * 16 + 200) / 120), 9)
  })

  it('sept images lentes sur 120 font monter la p95', () => {
    // rang de la p95 : ⌈0,95 × 120⌉ = 114 ; 114 images à 16 ms puis 6 à 50 ms → la 114e vaut 16, avec 7 lentes elle vaut 50
    expect(frameStats([...Array(114).fill(16), ...Array(6).fill(50)]).p95).toBe(16)
    expect(frameStats([...Array(113).fill(16), ...Array(7).fill(50)]).p95).toBe(50)
  })

  it('ne modifie pas le tableau reçu', () => {
    const a = [30, 10, 20]
    frameStats(a)
    expect(a).toEqual([30, 10, 20])
  })
})

// Faux renderer : compte les lectures de renderer.info (une par rafraîchissement du panneau).
function fakeRenderer({ calls = 312, triangles = 1254321, geometries = 461, textures = 31, programs = 14 } = {}) {
  const r = { reads: 0 }
  Object.defineProperty(r, 'info', {
    get() {
      r.reads++
      return { render: { calls, triangles }, memory: { geometries, textures }, programs: Array(programs).fill({}) }
    },
  })
  return r
}

describe('createStatsPanel', () => {
  let parent
  beforeEach(() => { parent = document.createElement('div'); document.body.appendChild(parent) })

  it('masqué par défaut : rien dans la page, renderer.info jamais lu', () => {
    const renderer = fakeRenderer()
    const panel = createStatsPanel({ renderer, parent })
    for (let i = 0; i < 200; i++) panel.update(10)
    expect(panel.visible).toBe(false)
    expect(renderer.reads).toBe(0)
    expect(parent.textContent).toBe('')
  })

  it('affiché : au plus 4 rafraîchissements par seconde de jeu', () => {
    const renderer = fakeRenderer()
    const panel = createStatsPanel({ renderer, parent })
    panel.show()
    for (let i = 0; i < 100; i++) panel.update(10)   // 1 s d'images à 10 ms
    expect(renderer.reads).toBe(4)
    for (let i = 0; i < 300; i++) panel.update(1000 / 60)   // 5 s à 60 i/s
    expect(renderer.reads).toBeLessThanOrEqual(4 + 20)
    expect(renderer.reads).toBeGreaterThanOrEqual(4 + 19)
  })

  it('affiche images par seconde, durées, appels, triangles, géométries, textures et programmes', () => {
    const panel = createStatsPanel({ renderer: fakeRenderer(), parent })
    panel.show()
    for (let i = 0; i < 100; i++) panel.update(10)
    const t = parent.textContent.replace(/\s+/g, ' ')
    expect(panel.visible).toBe(true)
    expect(t).toContain('100 i/s')
    expect(t).toContain('10.0/10.0 ms')
    expect(t).toContain('312 appels')
    expect(t).toContain('1.25 M tri')
    expect(t).toContain('461 géo')
    expect(t).toContain('31 tex')
    expect(t).toContain('14 prog')
  })

  it('images par seconde : moyenne glissante sur la dernière seconde', () => {
    const panel = createStatsPanel({ renderer: fakeRenderer(), parent })
    panel.show()
    for (let i = 0; i < 120; i++) panel.update(50)    // 6 s à 20 i/s
    for (let i = 0; i < 100; i++) panel.update(10)    // puis 1 s à 100 i/s
    expect(parent.textContent).toContain('100 i/s')
  })

  it('p95 au-dessus du budget de 22 ms : signalée', () => {
    const panel = createStatsPanel({ renderer: fakeRenderer(), parent })
    panel.show()
    for (let i = 0; i < 40; i++) panel.update(10)
    expect(parent.querySelector('[data-lent]')).toBeNull()
    for (let i = 0; i < 40; i++) panel.update(30)
    expect(parent.querySelector('[data-lent]')).not.toBeNull()
  })

  it('masqué de nouveau : plus aucune lecture, panneau caché', () => {
    const renderer = fakeRenderer()
    const panel = createStatsPanel({ renderer, parent })
    panel.show()
    for (let i = 0; i < 30; i++) panel.update(10)
    panel.hide()
    const reads = renderer.reads
    for (let i = 0; i < 200; i++) panel.update(10)
    expect(panel.visible).toBe(false)
    expect(renderer.reads).toBe(reads)
    expect(parent.firstElementChild.style.display).toBe('none')
  })
})
