import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { missImpact } from '../../src/campaign/impact.js'

// Rayon de tir de `from` vers `to` (format des cartes : [x, y, z]).
function ray(from, to) {
  const o = new THREE.Vector3(...from)
  return new THREE.Ray(o, new THREE.Vector3(...to).sub(o).normalize())
}

describe('tir manqué : la balle finit sur le sol de la carte', () => {
  it('port : la balle finit sur la dalle du quai (0,345 m), pas sous sa surface', () => {
    const { point } = missImpact(ray([0, 10, 28], [3, 0.345, -2]), 0.345)
    expect(point.y).toBeCloseTo(0.345, 9)
    expect(point.x).toBeCloseTo(3, 9)
    expect(point.z).toBeCloseTo(-2, 9)
  })

  it('port : le trou d\'impact est posé sur la dalle (3,5 cm au-dessus, comme sur un sol à 0)', () => {
    const { hole } = missImpact(ray([0, 10, 28], [3, 0.345, -2]), 0.345)
    expect(hole.y).toBeCloseTo(0.345 + 0.035, 9)
    expect(hole.x).toBeCloseTo(3, 9)
    expect(hole.z).toBeCloseTo(-2, 9)
  })

  it('carte au sol à 0 : la balle finit à 0, le trou à 0,035', () => {
    const { point, hole } = missImpact(ray([0, 8, 30], [-2, 0, 4]), 0)
    expect(point.y).toBeCloseTo(0, 9)
    expect(point.x).toBeCloseTo(-2, 9)
    expect(hole.y).toBeCloseTo(0.035, 9)
  })

  it('tir vers le ciel : la balle finit 40 m devant, sans trou au sol', () => {
    const r = ray([0, 10, 28], [0, 30, -10])
    const { point, hole } = missImpact(r, 0.345)
    expect(point.distanceTo(r.origin)).toBeCloseTo(40, 9)
    expect(hole).toBe(null)
  })
})
