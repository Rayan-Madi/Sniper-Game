import { describe, it, expect } from 'vitest'
import { bornesDuZoom, zoomApresCran } from '../src/aim.js'

// Zoom de la lunette dans une mission (spec du lot 3, §2 c, précisions de la tâche A5, et décision 2 ; plan du lot 3a,
// tâche A5). Chaque mission dit son zoom (champ zoom { depart, min, max }, src/campaign/missions/) : la molette va de son
// minimum à son maximum, que l'amélioration Lunette relève (facteur 1 + 0,15 × niveau, getStats().maxZoomScale de
// src/upgrades.js). Un cran de molette vaut 0,5, sur la grille de ce pas (×3, ×3,5, ×4…), comme avant la tâche.
//
// Les pièces pures de src/aim.js. Leurs témoins de comportement sont dans tests/shot/main.zoom.test.js, où la molette de
// main.js est exécutée telle quelle, celle d'aujourd'hui et celle d'avant la tâche. Témoins par mutation (vus rouges) :
// le cran d'avant, zoom ± 0,5 sans grille, fait rougir les quatre tests de la grille ci-dessous (×6,9, ×8,7, à un
// cheveu d'un cran, ×7,3) ; bornesDuZoom qui ignore la Lunette, celui de son facteur et ceux des maximums relevés
// (×6,9, ×8,7, ×29) ; la grille prise sans tolérance, celui de l'arrondi des flottants.

const AUJOURDHUI = { depart: 4, min: 3, max: 6 }   // le zoom des six missions d'aujourd'hui
const LOIN = { depart: 8, min: 8, max: 20 }        // M4 telle que le sous-lot 3c la fera (spec §3)

describe('bornes de la molette : le minimum de la mission, et son maximum relevé par la Lunette', () => {
  it('sans la Lunette (facteur 1) : celles de la mission', () => {
    expect(bornesDuZoom(AUJOURDHUI, 1)).toEqual({ min: 3, max: 6 })
    expect(bornesDuZoom(LOIN, 1)).toEqual({ min: 8, max: 20 })
  })

  it('Lunette : le maximum de la mission multiplié par son facteur, le minimum inchangé', () => {
    const b = bornesDuZoom(LOIN, 1.45)
    expect(b.min).toBe(8)
    expect(b.max).toBeCloseTo(29, 9)
    expect(bornesDuZoom(AUJOURDHUI, 1.15).max).toBeCloseTo(6.9, 9)
  })
})

describe('un cran de molette : 0,5 sur la grille de ce pas, entre les bornes', () => {
  const B = { min: 3, max: 6 }

  it('de ×4 : ×4,5 en grossissant, ×3,5 en élargissant', () => {
    expect(zoomApresCran(4, 1, B)).toBe(4.5)
    expect(zoomApresCran(4, -1, B)).toBe(3.5)
  })

  it('aux bornes, un cran de plus ne change rien', () => {
    expect(zoomApresCran(6, 1, B)).toBe(6)
    expect(zoomApresCran(3, -1, B)).toBe(3)
  })

  it('toute la course, de ×3 à ×6 et retour : les crans de 0,5 d\'avant la tâche', () => {
    const vus = []
    let z = 3
    for (let i = 0; i < 8; i++) vus.push(z = zoomApresCran(z, 1, B))
    for (let i = 0; i < 8; i++) vus.push(z = zoomApresCran(z, -1, B))
    expect(vus).toEqual([3.5, 4, 4.5, 5, 5.5, 6, 6, 6, 5.5, 5, 4.5, 4, 3.5, 3, 3, 3])
  })

  // Le maximum relevé par la Lunette n'est pas toujours sur la grille : ×6,9, ×7,8 et ×8,7 pour un maximum de base de ×6.
  it('un maximum hors de la grille (×6,9) : atteint au dernier cran, et le cran suivant vers le large revient sur la grille', () => {
    const b = bornesDuZoom(AUJOURDHUI, 1.15)
    expect(zoomApresCran(6.5, 1, b)).toBe(b.max)
    expect(zoomApresCran(b.max, 1, b)).toBe(b.max)
    expect(zoomApresCran(b.max, -1, b)).toBe(6.5)
  })

  it('×8,7 calculé (6 × 1,45, à l\'arrondi des flottants près) : le cran vers le large tombe pile sur ×8,5', () => {
    const b = bornesDuZoom(AUJOURDHUI, 1 + 0.15 * 3)
    expect(zoomApresCran(b.max, -1, b)).toBe(8.5)
    expect(zoomApresCran(8.5, 1, b)).toBe(b.max)
  })

  // Garde contre l'arrondi des flottants (témoin : la grille prise sans tolérance, vu rouge). Aucun maximum d'aujourd'hui
  // ni du §3 n'y tombe (20 × 1,45 vaut 29 tout juste), mais un maximum relevé qui finirait à 4e-15 de la grille ne doit
  // pas faire perdre un cran.
  it('un zoom à un cheveu d\'un cran (à l\'arrondi des flottants près) compte pour ce cran : un cran entier, jamais nul', () => {
    const b = { min: 8, max: 29 + 4e-15 }
    expect(b.max).toBeGreaterThan(29)
    expect(zoomApresCran(b.max, -1, b)).toBe(28.5)
    expect(zoomApresCran(6.5 + 1e-12, -1, { min: 3, max: 20 })).toBe(6)
    expect(zoomApresCran(6.5 - 1e-12, 1, { min: 3, max: 20 })).toBe(7)
  })

  it('un zoom entre deux crans (×7,3) rejoint la grille : ×7,5 en grossissant, ×7 en élargissant', () => {
    expect(zoomApresCran(7.3, 1, { min: 3, max: 20 })).toBe(7.5)
    expect(zoomApresCran(7.3, -1, { min: 3, max: 20 })).toBe(7)
  })

  it('la mission de longue distance, Lunette au niveau 3 : de ×8 à ×29 en 42 crans, jamais hors des bornes', () => {
    const b = bornesDuZoom(LOIN, 1.45)
    let z = LOIN.depart
    const vus = []
    for (let i = 0; i < 50; i++) vus.push(z = zoomApresCran(z, 1, b))
    expect(vus.indexOf(b.max)).toBe(41)
    expect(vus.slice(0, 41).every((v, i) => v === 8.5 + i * 0.5)).toBe(true)
    for (let i = 0; i < 50; i++) z = zoomApresCran(z, -1, b)
    expect(z).toBe(8)
  })

  it('d\'où qu\'il parte, un cran ne sort jamais des bornes', () => {
    const b = { min: 6, max: 12.4 }
    for (let z = 1; z <= 40; z += 0.37) {
      for (const sens of [1, -1]) {
        const n = zoomApresCran(z, sens, b)
        expect(n, `de ×${z.toFixed(2)}, sens ${sens}`).toBeGreaterThanOrEqual(b.min)
        expect(n, `de ×${z.toFixed(2)}, sens ${sens}`).toBeLessThanOrEqual(b.max)
      }
    }
  })
})
