import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Vitres de la carte (spec du lot 3, §2 c ; contrat du lot 4, K0 : dernierTirMortel.traversees ; plan du lot 3a, tâche
// A4). Une vitre laisse passer la balle comme le reste du verre (traversable), mais sa traversée est relevée sur la
// trajectoire : le rejeu de la kill-cam y fera ses éclats (la baie de M6, la cabine de la grue de M3, que les sous-lots
// 3b et 3c poseront). src/maps/prims.js la marque (vitre : plus solide, matière 'verre') et relève celles de la carte
// affichée (vitres), que main.js passe à la recherche du segment (impactSurSegment, src/shot/occlusion.js).
//
// Témoins (fonctions neuves : par mutation, vus rouges à la tâche A4) : une vitre restée solide (1 rouge), une liste
// des vitres qui survit à la carte d'avant (1 rouge).

vi.mock('../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {}, camera: new THREE.PerspectiveCamera(), sun: new THREE.DirectionalLight() }
})

const prims = await import('../src/maps/prims.js')
const maps = await import('../src/maps/index.js')
const { impactSurSegment } = await import('../src/shot/occlusion.js')
const { withSeed } = await import('../src/gfx/memtest.js')

const carreau = (z = -5) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.02), new THREE.MeshLambertMaterial())
  m.position.set(0, 1, z)
  return m
}
beforeEach(() => prims.clear())

describe('vitre : la balle la traverse, sa traversée est relevée', () => {
  it('ses maillages ne sont plus solides, leur matière est le verre ; la carte la relève parmi ses vitres', () => {
    const pane = prims.add(prims.vitre(prims.solide(carreau(), 'pierre')))
    expect(pane.userData.solid).toBeFalsy()
    expect(pane.userData.surface).toBe('verre')
    expect(maps.vitres()).toEqual([pane])
    expect(maps.solidMeshes()).not.toContain(pane)
  })

  it('un groupe : chacun de ses maillages', () => {
    const g = new THREE.Group()
    const a = carreau(), b = carreau(-6)
    g.add(a, b)
    prims.add(prims.vitre(g))
    expect(maps.vitres()).toEqual([a, b])
  })

  it('le verre traversable d\'avant (vitres des voitures, bouteilles) n\'est pas relevé : il ne laisse pas de trace', () => {
    prims.add(prims.traversable(carreau()))
    expect(maps.vitres()).toEqual([])
  })

  it('la carte suivante ne garde pas les vitres de la précédente (clear)', () => {
    prims.add(prims.vitre(carreau()))
    expect(maps.vitres()).toHaveLength(1)
    prims.clear()
    expect(maps.vitres()).toEqual([])
  })

  it('aucune des six cartes n\'en pose encore (les sous-lots 3b et 3c le feront)', () => {
    maps.MAP_BUILDERS.forEach((build, i) => {
      withSeed(1000 + i, build)
      expect(maps.vitres(), `M${i + 1}`).toEqual([])
    })
  })

  it('la recherche du segment relève la traversée d\'une vitre de la carte', () => {
    const pane = prims.add(prims.vitre(carreau(-5)))
    pane.updateMatrixWorld(true)
    const r = impactSurSegment({ ray: new THREE.Ray(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)), longueur: 13, vitres: maps.vitres() })
    expect(r.impact).toBeNull()
    expect(r.traversees).toHaveLength(1)
    expect(r.traversees[0].point.z).toBeCloseTo(-4.99, 6)
  })
})
