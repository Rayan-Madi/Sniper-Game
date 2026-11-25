import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Ce que le PNJ apporte aux règles de la tâche A8 (spec du lot 3, §2 f et contrat avec le lot 4) :
// - fuirVers([x, z]) : une cible court vers une sortie ou un abri (fuirVersLaSortie, main.js), à la vitesse d'une fuite
//   (speed × 8, comme flee), en passant par tout ce que fait une fuite (état 'flee', lever du canapé du commanditaire) ;
// - garderCorps() : le corps d'un PNJ abattu reste jusqu'au démontage de la mission au lieu de partir au bout de 8 s de
//   jeu (fin différée : « retrait des corps suspendu dès la première mort », contrat avec le lot 4).
// PNJ procéduraux (aucun modèle chargé), sur un sol nu.
//
// Témoins : fuirVers et garderCorps n'existent pas avant la tâche (ne comptent pas) ; par mutation de src/npc.js, vus
// rouges : la fuite vers le point remplacée par la fuite à l'opposé du point (flee d'avant la tâche) ; garderCorps sans
// effet sur un corps déjà à terre ; die() qui ignore le corps gardé (removeIn de 8 s).

vi.mock('../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

let NPC, STATES, scene
beforeEach(async () => {
  vi.resetModules()
  ;({ NPC, STATES } = await import('../src/npc.js'))
  ;({ scene } = await import('../src/scene.js'))
})

const ALLURE = { cibles: 0.6, gardes: 0.4, imprevisibles: false }
const cible = (x, z, o = {}) => new NPC({ isTarget: true, color: 0xcc4422, x, z, allure: ALLURE, bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, ...o })

describe('fuirVers : la cible court droit vers le point', () => {
  it('à 4,8 m/s (allure 0,6 × 8) : 10 m en 2,1 s, puis elle y reste', () => {
    const n = cible(0, 0)
    n.fuirVers([6, -8])
    expect(n.state).toBe(STATES.FLEE)
    let t = 0
    while (Math.hypot(n.mesh.position.x - 6, n.mesh.position.z + 8) > 0.05 && t < 10) { n.update(1 / 60); t += 1 / 60 }
    expect(t).toBeGreaterThan(10 / 4.8 - 0.05)
    expect(t).toBeLessThan(10 / 4.8 + 0.05)
    for (let i = 0; i < 60; i++) n.update(1 / 60)
    expect(Math.hypot(n.mesh.position.x - 6, n.mesh.position.z + 8)).toBeLessThan(0.1)
  })

  it('le cap : vers le point dès la première image, quelle que soit la direction d\'où vient le tir', () => {
    const n = cible(2, 2)
    n.fuirVers([-8, 2])
    n.update(1 / 60)
    expect(n.mesh.position.x).toBeLessThan(2)
    expect(n.mesh.position.z).toBeCloseTo(2, 6)
  })

  it('une cible à bord d\'un véhicule ne fuit pas à pied', () => {
    const n = cible(0, 0)
    n.onVehicle = true
    n.fuirVers([5, 0])
    expect(n.state).not.toBe(STATES.FLEE)
  })

  it('flee() d\'après : la fuite à l\'opposé du tir, sans point', () => {
    const n = cible(0, 0)
    n.fuirVers([5, 0])
    n.flee(new THREE.Vector3(0, 0, 5))
    n.update(1 / 60)
    expect(n.mesh.position.z).toBeLessThan(0)
    expect(n.mesh.position.x).toBeCloseTo(0, 6)
  })
})

describe('garderCorps : le corps reste jusqu\'au démontage', () => {
  it('sans : le corps part au bout de 8 s de jeu (avant la tâche, toujours)', () => {
    const n = cible(0, 0)
    n.die()
    for (let i = 0; i < 9 * 60; i++) n.update(1 / 60)
    expect(n.disposed).toBe(true)
    expect(scene.children).not.toContain(n.mesh)
  })

  it('gardé avant la mort : encore là 20 s plus tard', () => {
    const n = cible(0, 0)
    n.garderCorps()
    n.die()
    for (let i = 0; i < 20 * 60; i++) n.update(1 / 60)
    expect(n.disposed).toBeFalsy()
    expect(scene.children).toContain(n.mesh)
  })

  it('gardé après la mort (5 s à terre) : encore là 20 s plus tard ; le démontage le libère', () => {
    const n = cible(0, 0)
    n.die()
    for (let i = 0; i < 5 * 60; i++) n.update(1 / 60)
    n.garderCorps()
    for (let i = 0; i < 20 * 60; i++) n.update(1 / 60)
    expect(n.disposed).toBeFalsy()
    n.dispose()
    expect(scene.children).not.toContain(n.mesh)
  })
})
