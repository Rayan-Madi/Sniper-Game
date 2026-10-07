import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Ce que mountLevel ajoute à la carte et que unmountLevel retire (spec du lot 1 §4.2) : le cadenas du port et les
// trois jeeps du convoi. Retirés, ils libèrent leurs ressources ; les occupants des jeeps (des PNJ) ne sont pas
// touchés : ils ne sont pas enfants des jeeps et partent avec les autres PNJ.
vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

import { scene } from '../../src/scene.js'
import { buildMoralLock, releaseMoralLock } from '../../src/campaign/lock.js'
import { releaseConvoy } from '../../src/campaign/convoy.js'
import { makeJeep } from '../../src/maps.js'
import { createFakeRenderer, trackDisposals } from './fakeRenderer.js'

const LOCK_POS = [-16.5, 1.35, 5.15]   // moralLock.pos du port (maps.js)

// Convoi comme le monte mountLevel : trois jeeps dans la scène, un occupant par jeep (un objet de la scène à part).
function convoy() {
  const vehicles = [0x2a3a4a, 0x3a4a2a, 0x4a3a2a].map((color, i) => {
    const mesh = makeJeep(color)
    scene.add(mesh)
    const rider = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.5), new THREE.MeshBasicMaterial())
    scene.add(rider)
    return { mesh, offsetX: 16 * (1 - i), riders: [{ npc: { alive: true, mesh: rider }, dx: 0.6, dy: 0.62, dz: 0.55 }] }
  })
  return { baseX: -55, z: -4, groundY: 0.2, dir: 1, speed: 8.5, vehicles }
}

beforeEach(() => { scene.clear() })

describe('cadenas du port', () => {
  it('releaseMoralLock le retire et libère corps, anse et halo', () => {
    const lock = buildMoralLock(LOCK_POS)
    expect(scene.children).toContain(lock.mesh)
    expect(lock.mesh.children).toContain(lock.light)
    const t = trackDisposals(lock.mesh)
    expect(t.owned()).toBe(4)   // 2 géométries, 2 matériaux
    releaseMoralLock(lock.mesh)
    expect(scene.children).not.toContain(lock.mesh)
    expect(t.leaks()).toEqual([])
    expect(t.freedTwice()).toEqual([])
  })
})

describe('jeeps du convoi', () => {
  it('releaseConvoy retire et libère les trois jeeps, sans toucher aux occupants', () => {
    const c = convoy()
    const riders = c.vehicles.map(v => v.riders[0].npc.mesh)
    const jeeps = c.vehicles.map(v => trackDisposals(v.mesh))
    const kept = riders.map(r => trackDisposals(r))
    releaseConvoy(c)
    expect(scene.children).toEqual(riders)
    for (const t of jeeps) {
      expect(t.leaks()).toEqual([])
      expect(t.freedTwice()).toEqual([])
    }
    expect(kept.map(t => t.freed())).toEqual([0, 0, 0])
  })
})

describe('faux renderer : dix relances du port et du convoi', () => {
  it('Δ = 0 entre la 1re et la 10e relance (cadenas et jeeps retirés à chaque fois)', () => {
    const r = createFakeRenderer()
    const mount = () => {
      const lock = buildMoralLock(LOCK_POS)
      const c = convoy()
      r.render(scene)
      for (const v of c.vehicles) {   // les PNJ sont l'affaire de leur propre test (L3) : retirés à la main ici
        const m = v.riders[0].npc.mesh
        scene.remove(m); m.geometry.dispose()
      }
      releaseMoralLock(lock.mesh)
      releaseConvoy(c)
      r.render(scene)
    }
    mount()
    const ref = r.info()
    for (let i = 0; i < 9; i++) mount()
    expect(r.info()).toEqual(ref)
  })
})
