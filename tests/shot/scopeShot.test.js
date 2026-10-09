import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Le coup de feu vu dans la lunette (spec du lot 2, §3.3 ; plan, tâche T3) : ce que drawScope (src/scope.js) dessine
// après un tir. Écran de 1280 × 720.
// - Lueur : l'éclair blanc plein écran (0,22) devient une lueur chaude brève sur les bords de la lunette, à 0,12, et à
//   0,06 en effets atténués (lot 1).
// - Culasse : une petite jauge discrète sous le réticule tant qu'on ne peut pas tirer.
//
// Témoins : sur la lunette d'avant le lot 2 (commit df6dd66), les tests imitent les appels de main.js quand une fonction
// neuve manque : au tir, shotFlash(effectsReduced()) de comfort.js (le voile blanc sur toute la page) ; pour la
// culasse, rien (elle n'existait pas). Ils y échouent sur ce que le joueur voit.

const W = 1280, H = 720
const R = Math.min(W, H) * 0.38          // rayon de la lunette ouverte (pixels CSS)
let S, comfort, ctx, gradients, rects

beforeEach(async () => {
  document.body.innerHTML = '<canvas id="scope-canvas" style="display:none"></canvas>'
  Object.defineProperty(window, 'innerWidth', { value: W, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: H, configurable: true, writable: true })
  vi.resetModules()
  vi.useFakeTimers()
  ctx = document.getElementById('scope-canvas').getContext('2d')
  gradients = []; rects = []
  ctx.createRadialGradient = (x0, y0, r0, x1, y1, r1) => {
    const g = { x0, y0, r0, x1, y1, r1, stops: [], addColorStop(o, c) { this.stops.push({ o, c }) } }
    gradients.push(g)
    return g
  }
  ctx.fillRect = (x, y, w, h) => { rects.push({ x, y, w, h, alpha: ctx.globalAlpha ?? 1, style: ctx.fillStyle }) }
  S = await import('../../src/scope.js')
  comfort = await import('../../src/comfort.js')
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = '' })

function image(dt = 1 / 60) {
  gradients = []; rects = []
  S.updateScope(dt)
  S.drawScope()
}
const images = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) image(dt) }
const ouvrir = () => { S.showScope(); images(12) }   // 200 ms : ouverte à 100 %

// Le coup de feu, comme main.js le signale à l'écran. Avant le lot 2 : shotFlash(reduced) de comfort.js.
const tir = reduced => (S.shotGlow ? S.shotGlow(reduced) : comfort.shotFlash(reduced))

// Couleur rgba(r, g, b, a) d'un arrêt de dégradé.
const rgba = c => { const m = /rgba?\(([^)]+)\)/.exec(c); return m ? m[1].split(',').map(Number) : null }
const chaud = ([r, g, b]) => r >= 200 && r - b >= 60 && g < r
// Dégradé chaud dessiné à cette image (la lueur) : son opacité la plus forte, et le rayon où elle culmine.
function lueur() {
  for (const g of gradients) {
    const stops = g.stops.map(s => ({ o: s.o, c: rgba(s.c) })).filter(s => s.c && chaud(s.c))
    if (!stops.length) continue
    const pic = stops.reduce((a, b) => (b.c[3] > a.c[3] ? b : a))
    return { alpha: pic.c[3], rayonPic: g.r0 + (g.r1 - g.r0) * pic.o, centre: [g.x1, g.y1] }
  }
  return null
}
// Voile plein écran resté dans la page (l'éclair d'avant le lot 2).
const voile = () => [...document.body.querySelectorAll('div')].find(d => d.style.position === 'fixed')

describe('lueur du coup de feu', () => {
  it('effets normaux : lueur chaude à 0,12 sur le bord de la lunette, plus de voile blanc sur tout l\'écran', () => {
    ouvrir()
    tir(false)
    image()
    expect(voile(), 'voile plein écran').toBeUndefined()
    const l = lueur()
    expect(l, 'lueur chaude dessinée').not.toBe(null)
    expect(l.alpha).toBeCloseTo(0.12, 2)
    expect(l.centre).toEqual([W / 2, H / 2])
    expect(l.rayonPic / R, 'la lueur culmine au bord de la lunette').toBeGreaterThan(0.85)
    expect(l.rayonPic / R).toBeLessThan(1.15)
  })

  it('effets atténués : lueur à 0,06', () => {
    ouvrir()
    tir(true)
    image(1e-4)
    expect(voile(), 'voile plein écran').toBeUndefined()
    expect(lueur()?.alpha).toBeCloseTo(0.06, 3)
  })

  it('brève : éteinte 0,2 s après le coup', () => {
    ouvrir()
    tir(false)
    image()
    expect(lueur(), 'juste après le coup').not.toBe(null)
    images(12)   // 200 ms
    expect(lueur(), '200 ms après le coup').toBe(null)
    expect(voile(), 'voile plein écran').toBeUndefined()
  })

  it('elle baisse d\'image en image', () => {
    ouvrir()
    tir(false)
    let avant = Infinity
    for (let i = 0; i < 6; i++) {
      image()
      const a = lueur()?.alpha ?? 0
      if (i === 0) expect(a, 'première image').toBeGreaterThan(0.1)
      expect(a).toBeLessThanOrEqual(avant)
      avant = a
    }
    expect(avant).toBeLessThan(0.12)
  })
})

describe('jauge de la culasse', () => {
  // Rectangles de la jauge : sous le centre du réticule (point central à H/2), petits.
  const jauge = () => rects.filter(r => r.y > H / 2 + 10 && r.y < H / 2 + R / 5 && r.h <= 4 && r.w <= R / 3)

  it('à mi-course : une petite barre discrète sous le réticule, remplie à moitié', () => {
    ouvrir()
    S.setBoltProgress?.(0.5)
    image()
    const j = jauge()
    expect(j.length, 'rectangles de la jauge').toBeGreaterThanOrEqual(2)
    const fond = j.reduce((a, b) => (b.w > a.w ? b : a))
    const plein = j.find(r => r !== fond)
    expect(fond.x + fond.w / 2, 'centrée sous le réticule').toBeCloseTo(W / 2, 6)
    expect(plein.x).toBeCloseTo(fond.x, 6)
    expect(plein.w / fond.w).toBeCloseTo(0.5, 6)
    expect(Math.max(...j.map(r => r.alpha)), 'discrète').toBeLessThanOrEqual(0.6)
  })

  it('elle se remplit avec la culasse et disparaît quand on peut tirer', () => {
    ouvrir()
    S.setBoltProgress?.(0.25)
    image()
    const quart = jauge()
    expect(quart.length).toBeGreaterThanOrEqual(2)
    const f = quart.reduce((a, b) => (b.w > a.w ? b : a))
    expect(quart.find(r => r !== f).w / f.w).toBeCloseTo(0.25, 6)
    S.setBoltProgress?.(1)
    image()
    expect(jauge()).toEqual([])
  })
})
