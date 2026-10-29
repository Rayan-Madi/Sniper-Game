import { describe, it, expect } from 'vitest'
import * as T from '../../src/shot/telemetre.js'
import { TELEMETRE } from '../../src/shot/tuning.js'

// Télémètre de la lunette (spec du lot 3, §2 c ; plan du lot 3a, tâche A4) : la distance au point visé (un rayon contre
// le décor solide, le sol et les zones des PNJ, main.js), arrondie au mètre, rafraîchie 10 fois par seconde : la
// mesure, un lancer de rayon, n'est pas refaite à chaque image, et le chiffre ne tremble pas avec le réticule entre
// deux relevés. La lunette affiche aussi le réglage, « ZÉRO 430 m » (décision 1).
//
// Témoins (module neuf : par mutation, vus rouges à la tâche A4) : une mesure à chaque image (60 par seconde au lieu de
// 10 : 3 rouges), la distance non arrondie (2 rouges), la première mesure attendue un dixième de seconde à l'ouverture
// de la lunette (2 rouges).

describe('réglages', () => {
  it('10 Hz, portée de 2 km', () => {
    expect(TELEMETRE.periodeS).toBe(0.1)
    expect(TELEMETRE.porteeM).toBe(2000)
  })
})

describe('createTelemetre : une mesure tous les dixièmes de seconde, arrondie au mètre', () => {
  // `n` images de dt ; la distance mesurée vaut distance(t) au temps t. → les valeurs affichées et le nombre de mesures.
  function images(tel, n, dt, distance) {
    let mesures = 0, t = 0
    const vus = []
    for (let i = 0; i < n; i++) {
      t += dt
      vus.push(tel.update(dt, () => { mesures++; return distance(t) }))
    }
    return { vus, mesures }
  }

  it('10 mesures par seconde à 60 i/s comme à 144 i/s (11 avec celle de l\'ouverture)', () => {
    for (const fps of [60, 144, 37]) {
      const { mesures } = images(T.createTelemetre(), fps, 1 / fps, () => 100)
      expect(mesures, `${fps} i/s`).toBeGreaterThanOrEqual(10)
      expect(mesures, `${fps} i/s`).toBeLessThanOrEqual(11)
    }
  })

  it('entre deux mesures, la valeur affichée ne bouge pas, même si le point visé change', () => {
    const { vus } = images(T.createTelemetre(), 60, 1 / 60, t => 100 + t * 30)
    const changements = vus.filter((x, i) => i && x !== vus[i - 1]).length
    expect(changements).toBeLessThanOrEqual(10)
    expect(new Set(vus).size).toBeGreaterThan(5)   // elle suit tout de même la visée
  })

  it('arrondie au mètre', () => {
    const tel = T.createTelemetre()
    expect(tel.update(1 / 60, () => 142.49)).toBe(142)
    tel.reset()
    expect(tel.update(1 / 60, () => 429.5)).toBe(430)
  })

  it('rien de mesuré (le ciel, ou au-delà de la portée) : null', () => {
    expect(T.createTelemetre().update(1 / 60, () => null)).toBeNull()
  })

  it('la première image (lunette qui s\'ouvre) mesure tout de suite ; reset (lunette fermée) repart de zéro', () => {
    const tel = T.createTelemetre()
    expect(tel.update(1 / 60, () => 31.2)).toBe(31)
    expect(tel.update(1 / 60, () => 99)).toBe(31)   // un soixantième après : pas encore
    tel.reset()
    expect(tel.update(1 / 60, () => 99)).toBe(99)
  })
})

describe('textes de la lunette', () => {
  it('la distance au mètre, l\'espace des milliers, et « --- m » sans mesure', () => {
    expect(T.texteDistance(31)).toBe('31 m')
    expect(T.texteDistance(430)).toBe('430 m')
    expect(T.texteDistance(1250)).toBe('1 250 m')
    expect(T.texteDistance(null)).toBe('--- m')
  })

  it('le réglage : « ZÉRO 430 m » ; rien sans réglage', () => {
    expect(T.texteZero(430)).toBe('ZÉRO 430 m')
    expect(T.texteZero(31)).toBe('ZÉRO 31 m')
    expect(T.texteZero(null)).toBe('')
  })

  it('aucun tiret cadratin', () => {
    for (const s of [T.texteDistance(null), T.texteDistance(31), T.texteZero(155)]) expect(s).not.toContain('\u2014')
  })
})
