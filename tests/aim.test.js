import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { BASE_FOV, fovFor, aimAngles, stepTremble } from '../src/aim.js'

// Générateur congruentiel linéaire à graine : la même suite dans [0, 1) à chaque exécution.
function lcg(seed) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

describe('champ de vision de la lunette', () => {
  it('lunette ouverte : 60 / zoom', () => {
    expect(BASE_FOV).toBe(60)
    expect(fovFor(4, true)).toBe(15)
    expect(fovFor(8, true)).toBe(7.5)
  })

  it('lunette fermée : 60, quel que soit le zoom réglé', () => {
    expect(fovFor(4, false)).toBe(60)
    expect(fovFor(12, false)).toBe(60)
  })
})

describe('cadrage de départ', () => {
  // Poste de tir surélevé, cibles tout autour, plus haut et plus bas, dont des cibles décalées en x.
  const poste = [3, 8, 30]
  const cibles = [
    [3, 1, 0], [23, 2, 10], [33, 8, 30], [23, 5, 50],
    [3, 0, 60], [-17, 3, 50], [-27, 12, 30], [-17, 1, 10],
  ]

  for (const cible of cibles) {
    it(`l'Euler YXZ appliqué à (0,0,-1) regarde vers la cible (${cible.join(', ')})`, () => {
      const { yaw, pitch } = aimAngles(poste, cible)
      const vu = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
      const voulu = new THREE.Vector3(cible[0] - poste[0], cible[1] - poste[1], cible[2] - poste[2]).normalize()
      expect(vu.x).toBeCloseTo(voulu.x, 6)
      expect(vu.y).toBeCloseTo(voulu.y, 6)
      expect(vu.z).toBeCloseTo(voulu.z, 6)
    })
  }
})

describe('tremblement de la lunette', () => {
  // Stress à mi-course, sans amélioration ni apnée : (14 + 0,25 × 220), (8 + 0,5 × 30), 1,2 + 0,5 × 1,5.
  const p = { intensity: 69, sway: 23, breathRate: 1.95 }

  // Écart quadratique moyen de x et de y sur la seconde moitié de 10 s simulées (régime établi),
  // cumulé sur 200 parties à graines différentes pour que la mesure ne dépende pas du hasard.
  function dispersion(fps) {
    const dt = 1 / fps, pas = 10 * fps
    let sx = 0, sy = 0, n = 0
    for (let partie = 0; partie < 200; partie++) {
      const rand = lcg(1000 + partie)
      const t = { x: 0, y: 0, vx: 0, vy: 0, phase: 0 }
      for (let i = 0; i < pas; i++) {
        stepTremble(t, p, dt, rand)
        if (i >= pas / 2) { sx += t.x * t.x; sy += t.y * t.y; n++ }
      }
    }
    return { x: Math.sqrt(sx / n), y: Math.sqrt(sy / n) }
  }

  it('la dispersion est la même à 60 et à 144 images par seconde', () => {
    const a = dispersion(60), b = dispersion(144)
    const rx = a.x / b.x, ry = a.y / b.y
    expect(rx, `rapport en x : ${rx.toFixed(3)}`).toBeGreaterThan(0.85)
    expect(rx, `rapport en x : ${rx.toFixed(3)}`).toBeLessThan(1.15)
    expect(ry, `rapport en y : ${ry.toFixed(3)}`).toBeGreaterThan(0.85)
    expect(ry, `rapport en y : ${ry.toFixed(3)}`).toBeLessThan(1.15)
  })

  it('à 60 images par seconde, le ressenti est celui d\'avant (physique d\'origine de scope.js)', () => {
    // Recopie de updateTremble (scope.js, commit ba6fd29) : à-coups et amortissements par image.
    function origine(t, q, dt, rand) {
      t.vx += (rand() - 0.5) * q.intensity
      t.vy += (rand() - 0.5) * q.intensity
      t.phase += dt * q.breathRate
      t.vx += Math.cos(t.phase) * q.sway * dt
      t.vy += Math.sin(t.phase * 0.7) * q.sway * dt
      t.vx *= 0.91; t.vy *= 0.91
      t.x += t.vx * dt; t.y += t.vy * dt
      t.x *= 0.97; t.y *= 0.97
    }
    const a = { x: 0, y: 0, vx: 0, vy: 0, phase: 0 }, b = { ...a }
    const ra = lcg(42), rb = lcg(42)
    for (let i = 0; i < 600; i++) {
      stepTremble(a, p, 1 / 60, ra)
      origine(b, p, 1 / 60, rb)
      for (const k of ['x', 'y', 'vx', 'vy', 'phase']) expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-9)
    }
  })
})
