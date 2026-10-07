import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as THREE from 'three'

// maps.js et npc.js posent leurs objets dans la scène du jeu : une vraie THREE.Scene ici, sans rendu ni lumières.
vi.mock('../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

import { scene } from '../src/scene.js'
import { MAP_BUILDERS } from '../src/maps.js'
import { NPC } from '../src/npc.js'

const NAMES = ['M1 marché', 'M2 parking', 'M3 port', 'M4 base', 'M5 convoi', 'M6 fête']

// Le sol est une grande surface horizontale tournée vers le haut : plus de 8 m de côté dans les deux sens (pas une
// flaque, un passage piéton, une ligne de marquage ni une fontaine). Un sol de zone d'apparition est sous 3 m :
// au-dessus, c'est un toit ou un plafond (celui de la salle de fête, en M6, est à 8 m).
const LARGE = 8
const PLAFOND = 3

// Hauteur du sol sous (x, z) : rayon vertical lancé depuis y = 50, intersection retenue la plus haute.
function groundAt(x, z) {
  scene.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0))
  let best = null
  for (const hit of ray.intersectObjects(scene.children, true)) {
    if (!hit.object.isMesh || !hit.face || hit.point.y > PLAFOND) continue
    const n = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
    if (n.y < 0.999) continue
    const size = new THREE.Box3().setFromObject(hit.object).getSize(new THREE.Vector3())
    if (size.x <= LARGE || size.z <= LARGE) continue
    if (best === null || hit.point.y > best) best = hit.point.y
  }
  return best
}

// Centre de la zone d'apparition et quatre points intérieurs fixes (au quart et aux trois quarts).
function samplePoints(b) {
  const at = (fx, fz) => [b.minX + fx * (b.maxX - b.minX), b.minZ + fz * (b.maxZ - b.minZ)]
  return [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)]
}

describe('sol des cartes : chaque carte déclare la hauteur de son sol (groundY)', () => {
  MAP_BUILDERS.forEach((build, i) => {
    it(`${NAMES[i]} : groundY est un nombre`, () => {
      expect(typeof build().groundY).toBe('number')
    })
  })
})

describe('sol des cartes : groundY est bien la hauteur du sol sous la zone d\'apparition', () => {
  MAP_BUILDERS.forEach((build, i) => {
    it(`${NAMES[i]} : le sol mesuré vaut groundY à 2 cm près`, () => {
      const info = build()
      const groundY = info.groundY ?? 0   // absent : les PNJ sont posés à 0
      for (const [x, z] of samplePoints(info.spawnBounds)) {
        const y = groundAt(x, z)
        expect(y, `sol introuvable en (${x}, ${z})`).not.toBe(null)
        expect(Math.abs(y - groundY), `sol mesuré ${y} en (${x}, ${z}), groundY ${groundY}`).toBeLessThanOrEqual(0.02)
      }
    })
  })

  it('valeurs attendues : 0,345 m sur la dalle du port, 0,2 m sur le tarmac et sur la route du convoi, 0 ailleurs', () => {
    expect(MAP_BUILDERS.map(b => b().groundY)).toEqual([0, 0, 0.345, 0.2, 0.2, 0])
  })
})

describe('PNJ posés sur le sol de la carte', () => {
  beforeAll(() => { vi.useFakeTimers() })   // die() retire le corps au bout de 8 s
  afterAll(() => { vi.useRealTimers() })

  it('position initiale : les pieds sur groundY', () => {
    const npc = new NPC({ x: 2, z: -3, groundY: 0.345 })
    expect(npc.mesh.position.y).toBeCloseTo(0.345, 9)
    expect(npc.mesh.position.x).toBe(2)
    expect(npc.mesh.position.z).toBe(-3)
    scene.remove(npc.mesh)
  })

  it('sans groundY (PvP, menu) : les pieds à 0', () => {
    const npc = new NPC({ x: 0, z: 0 })
    expect(npc.mesh.position.y).toBe(0)
    scene.remove(npc.mesh)
  })

  it('chute du modèle procédural : couché 0,2 m au-dessus du sol de la carte, pas sous la dalle', () => {
    const npc = new NPC({ x: 0, z: 0, groundY: 0.345 })
    npc.die()
    expect(npc.mesh.position.y).toBeCloseTo(0.345 + 0.2, 9)
    scene.remove(npc.mesh)
  })
})
