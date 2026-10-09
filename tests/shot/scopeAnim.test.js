import { describe, it, expect } from 'vitest'
import { createScopeAnim } from '../../src/shot/scopeAnim.js'
import { scopeFov, fovFor, BASE_FOV } from '../../src/aim.js'
import { LUNETTE } from '../../src/shot/tuning.js'

// Lunette animée (spec du lot 2, §3.2 ; plan, tâche T2) : ouverture en 180 ms, fermeture en 120 ms, zoom lissé qui
// atteint 95 % de la cible en 120 ms (exponentielle), le tout indépendant de la cadence d'image.

const CADENCES = [30, 60, 144, 240]

// Temps (s) au bout duquel cond(état) devient vrai, image par image à `fps` ; l'état est celui que rend update(dt).
function tempsPour(anim, cond, fps, max = 2) {
  const dt = 1 / fps
  let t = 0
  for (;;) {
    t += dt
    if (cond(anim.update(dt))) return t
    if (t > max) return Infinity
  }
}

// Témoin : la lunette d'avant le lot 2 (scope.js et syncFov, commit e671587), ouverte et zoomée d'un coup.
function lunetteInstantanee(zoom0 = 4) {
  let ouverte = false, zoom = zoom0
  return {
    open() { ouverte = true }, close() { ouverte = false }, shut() { ouverte = false },
    setZoom(z) { zoom = z },
    update() { return { openness: ouverte ? 1 : 0, zoom } },
  }
}

describe('ouverture et fermeture', () => {
  it('les durées de tuning.js sont celles de la spec (§3.2)', () => {
    expect(LUNETTE).toMatchObject({ ouvertureMs: 180, fermetureMs: 120, zoomMs: 120 })
    expect(LUNETTE.reticuleA).toBeCloseTo(2 / 3, 12)
  })

  for (const fps of CADENCES) {
    it(`ouverte à 100 % en 180 ms, à ${fps} i/s`, () => {
      const anim = createScopeAnim()
      anim.open()
      const t = tempsPour(anim, e => e.openness >= 1, fps)
      expect(t, `${(t * 1000).toFixed(1)} ms`).toBeGreaterThanOrEqual(0.18 - 1e-9)
      expect(t, `${(t * 1000).toFixed(1)} ms`).toBeLessThan(0.18 + 1 / fps + 1e-9)
    })

    it(`fermée en 120 ms, à ${fps} i/s`, () => {
      const anim = createScopeAnim()
      anim.open(); anim.update(1)
      anim.close()
      const t = tempsPour(anim, e => e.openness <= 0, fps)
      expect(t, `${(t * 1000).toFixed(1)} ms`).toBeGreaterThanOrEqual(0.12 - 1e-9)
      expect(t, `${(t * 1000).toFixed(1)} ms`).toBeLessThan(0.12 + 1 / fps + 1e-9)
    })
  }

  it('l\'ouverture avance avec le temps, pas avec les images : même ouverture à 90 ms à toute cadence', () => {
    // 90 ms en pas de 1/fps, plus un reste : la cadence ne change que le découpage.
    for (const fps of CADENCES) {
      const anim = createScopeAnim()
      anim.open()
      const n = Math.floor(0.09 * fps)
      let e
      for (let i = 0; i < n; i++) e = anim.update(1 / fps)
      e = anim.update(0.09 - n / fps)
      expect(e.openness, `${fps} i/s`).toBeCloseTo(0.5, 9)
    }
  })

  it('témoin : la lunette d\'avant le lot 2 s\'ouvre dès la première image, la mesure le voit', () => {
    const anim = lunetteInstantanee()
    anim.open()
    expect(tempsPour(anim, e => e.openness >= 1, 60)).toBeLessThan(0.02)
  })

  it('rouverte pendant sa fermeture, elle repart d\'où elle en est (pas de saut)', () => {
    const anim = createScopeAnim()
    anim.open(); anim.update(1)
    anim.close(); expect(anim.update(0.06).openness).toBeCloseTo(0.5, 9)   // la moitié des 120 ms
    anim.open(); expect(anim.update(0.045).openness).toBeCloseTo(0.75, 9)   // un quart des 180 ms
  })

  it('shut() la ferme d\'un coup (pause, échec, fin de mission)', () => {
    const anim = createScopeAnim()
    anim.open(); anim.update(1)
    anim.shut()
    expect(anim.update(0).openness).toBe(0)
    expect(anim.opening).toBe(false)
  })

  it('un pas nul ou invalide ne change rien', () => {
    const anim = createScopeAnim()
    anim.open(); anim.update(0.09)
    for (const dt of [0, -1, NaN, undefined]) expect(anim.update(dt).openness).toBeCloseTo(0.5, 9)
  })
})

describe('zoom lissé', () => {
  // Part du chemin parcouru par le zoom effectif, de `de` vers `vers`.
  const part = (z, de, vers) => (z - de) / (vers - de)

  it('95 % de la cible en 120 ms, quel que soit le découpage en images', () => {
    const decoupages = [7, 12, 29, 1].map(n => Array(n).fill(0.12 / n))
    decoupages.push([0.003, 0.05, 0.001, 0.04, 0.026])   // images irrégulières, 120 ms en tout
    const parts = decoupages.map(pas => {
      const anim = createScopeAnim()
      anim.setZoom(4, { instant: true }); anim.open()
      anim.setZoom(12)
      let e
      for (const dt of pas) e = anim.update(dt)
      return part(e.zoom, 4, 12)
    })
    for (const p of parts) expect(p).toBeCloseTo(0.95, 9)
  })

  for (const fps of [60, 144]) {
    it(`à ${fps} i/s : 95 % atteints à la première image après 120 ms, pas avant`, () => {
      const anim = createScopeAnim()
      anim.setZoom(4, { instant: true })
      anim.setZoom(12)
      const t = tempsPour(anim, e => part(e.zoom, 4, 12) >= 0.95 - 1e-12, fps)
      expect(t).toBeGreaterThanOrEqual(0.12 - 1e-9)
      expect(t).toBeLessThan(0.12 + 1 / fps + 1e-9)
    })
  }

  it('sans dépassement : le zoom effectif monte vers la cible sans jamais la passer, puis s\'y pose', () => {
    const anim = createScopeAnim()
    anim.setZoom(4, { instant: true })
    anim.setZoom(12)
    let avant = 4
    for (let i = 0; i < 120; i++) {
      const { zoom } = anim.update(1 / 60)
      expect(zoom).toBeGreaterThanOrEqual(avant)
      expect(zoom).toBeLessThanOrEqual(12)
      avant = zoom
    }
    expect(avant).toBe(12)
    // Et en dézoomant
    anim.setZoom(3)
    for (let i = 0; i < 120; i++) avant = anim.update(1 / 60).zoom
    expect(avant).toBe(3)
  })

  it('le zoom se lisse lunette fermée aussi, et setZoom(z, { instant: true }) le pose d\'un coup', () => {
    const anim = createScopeAnim()
    anim.setZoom(8, { instant: true })
    expect(anim.update(0).zoom).toBe(8)
    expect(anim.target).toBe(8)
    anim.setZoom(6)
    expect(anim.target).toBe(6)
    expect(anim.update(1 / 60).zoom).toBeGreaterThan(6)
  })

  it('témoin : le zoom d\'avant le lot 2 saute à la cible dès la première image, la mesure le voit', () => {
    const anim = lunetteInstantanee(4)
    anim.setZoom(12)
    expect(tempsPour(anim, e => part(e.zoom, 4, 12) >= 0.95, 60)).toBeLessThan(0.02)
  })
})

describe('champ de vision pendant l\'ouverture (scopeFov)', () => {
  it('60° fermée, 60 / zoom ouverte : les deux bouts de fovFor', () => {
    for (const z of [3, 4, 8, 12]) {
      expect(scopeFov(z, 0)).toBe(BASE_FOV)
      expect(scopeFov(z, 1)).toBeCloseTo(fovFor(z, true), 12)
    }
  })

  it('glisse de 60° vers 60 / zoom sans à-coup : décroît strictement, en partant et en arrivant en douceur', () => {
    const z = 8
    let avant = scopeFov(z, 0)
    for (let i = 1; i <= 100; i++) {
      const f = scopeFov(z, i / 100)
      expect(f).toBeLessThan(avant)
      avant = f
    }
    // Départ et arrivée adoucis : le premier et le dernier centième bougent bien moins qu'un centième du milieu.
    const pas = o => Math.abs(scopeFov(z, o + 0.01) - scopeFov(z, o))
    expect(pas(0)).toBeLessThan(pas(0.5) * 0.1)
    expect(pas(0.99)).toBeLessThan(pas(0.5) * 0.1)
  })

  it('ouverture hors de [0, 1] ramenée aux bornes', () => {
    expect(scopeFov(4, -0.5)).toBe(BASE_FOV)
    expect(scopeFov(4, 1.5)).toBeCloseTo(15, 12)
  })
})
