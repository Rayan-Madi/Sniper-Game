import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { groundForward, groundRight } from '../../src/pvpMath.js'

const UP = new THREE.Vector3(0, 1, 0)
const YAWS = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, -Math.PI / 4, -Math.PI / 2, -2.5]

describe('repère au sol du contre-tueur', () => {
  it('l\'avant est (sin yaw, 0, cos yaw), horizontal et unitaire', () => {
    for (const yaw of YAWS) {
      const f = groundForward(yaw)
      expect(f.x).toBeCloseTo(Math.sin(yaw), 9)
      expect(f.y).toBe(0)
      expect(f.z).toBeCloseTo(Math.cos(yaw), 9)
    }
  })

  it('la droite vaut avant × haut, pour 8 lacets', () => {
    for (const yaw of YAWS) {
      const expected = groundForward(yaw).cross(UP)
      const r = groundRight(yaw)
      expect(r.x).toBeCloseTo(expected.x, 9)
      expect(r.y).toBeCloseTo(expected.y, 9)
      expect(r.z).toBeCloseTo(expected.z, 9)
    }
  })

  it('au départ (yaw = π, caméra vers -Z), la droite est +X', () => {
    const r = groundRight(Math.PI)
    expect(r.x).toBeCloseTo(1, 9)
    expect(r.y).toBeCloseTo(0, 9)
    expect(r.z).toBeCloseTo(0, 9)
  })
})
