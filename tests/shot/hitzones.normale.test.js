import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { rayVsZones, npcHit } from '../../src/shot/hitzones.js'

// Normale de la zone touchée (contrat du lot 4, K0 : dernierTirMortel.normale, « de la zone au point, si disponible »)
// : rayVsZones rend, avec la zone, le point et la distance, la normale sortante de la sphère ou de la capsule au point
// d'entrée ; npcHit la transmet. Le rejeu de la kill-cam y oriente la gerbe et la secousse.
// Témoin : rayVsZones d'avant la tâche A4 ne rendait que { part, point, distance } (vu rouge).

const v = (x, y, z) => new THREE.Vector3(x, y, z)
const rayon = (o, d) => new THREE.Ray(o.clone(), d.clone().normalize())
const tete = { part: 'tete', a: v(0, 1.6, 0), b: v(0, 1.6, 0), r: 0.1 }
const torse = { part: 'torse', a: v(0, 0.9, 0), b: v(0, 1.4, 0), r: 0.15 }

describe('rayVsZones : la normale de la zone au point d\'entrée', () => {
  it('sphère de la tête, touchée de face : la normale regarde le tireur', () => {
    const hit = rayVsZones(rayon(v(0, 1.6, 30), v(0, 0, -1)), [tete])
    expect(hit?.normal, 'la normale de la zone').toBeInstanceOf(THREE.Vector3)
    expect(hit.part).toBe('tete')
    expect(hit.normal.distanceTo(v(0, 0, 1))).toBeLessThan(1e-9)
  })

  it('sphère touchée de biais : la normale va du centre au point, unitaire', () => {
    const hit = rayVsZones(rayon(v(0.06, 1.65, 30), v(0, 0, -1)), [tete])
    expect(hit?.normal, 'la normale de la zone').toBeInstanceOf(THREE.Vector3)
    const attendue = hit.point.clone().sub(tete.a).normalize()
    expect(hit.normal.distanceTo(attendue)).toBeLessThan(1e-9)
    expect(hit.normal.length()).toBeCloseTo(1, 12)
  })

  it('capsule du torse, touchée sur le flanc en plongée : perpendiculaire à son axe, du côté du tireur', () => {
    const o = v(20, 21.15, 0)
    const hit = rayVsZones(rayon(o, v(0, 1.15, 0).sub(o)), [torse])
    expect(hit?.normal, 'la normale de la zone').toBeInstanceOf(THREE.Vector3)
    expect(hit.part).toBe('torse')
    expect(Math.abs(hit.normal.y)).toBeLessThan(1e-9)      // l'axe du torse est vertical
    expect(hit.normal.x).toBeCloseTo(1, 9)                  // vers le tireur (+X)
  })

  it('bout arrondi d\'une capsule : la normale part du bout de l\'axe', () => {
    const hit = rayVsZones(rayon(v(0, 10, 0), v(0, -1, 0)), [torse])
    expect(hit?.normal, 'la normale de la zone').toBeInstanceOf(THREE.Vector3)
    expect(hit.normal.distanceTo(v(0, 1, 0))).toBeLessThan(1e-9)
  })

  it('rayon parti de l\'intérieur de la zone : la normale fait face au rayon', () => {
    const hit = rayVsZones(rayon(v(0, 1.6, 0), v(0, 0, -1)), [tete])
    expect(hit?.normal, 'la normale de la zone').toBeInstanceOf(THREE.Vector3)
    expect(hit.distance).toBe(0)
    expect(hit.normal.distanceTo(v(0, 0, 1))).toBeLessThan(1e-9)
  })

  it('npcHit transmet la normale de la zone touchée', () => {
    const pnj = { alive: true, getBounds: () => ({ center: v(0, 1, 0), size: v(0.8, 2, 0.8) }), hitZones: () => [torse, tete] }
    const hit = npcHit(rayon(v(0, 1.6, 30), v(0, 0, -1)), [pnj])
    expect(hit?.normal, 'la normale de la zone').toBeInstanceOf(THREE.Vector3)
    expect(hit.npc).toBe(pnj)
    expect(hit.normal.distanceTo(v(0, 0, 1))).toBeLessThan(1e-9)
  })
})

describe('npcHit borné au bout du segment', () => {
  it('far : un PNJ plus loin que far sur le rayon n\'est pas touché', () => {
    const pnj = { alive: true, getBounds: () => ({ center: v(0, 1, -30), size: v(0.8, 2, 0.8) }),
      hitZones: () => [{ ...torse, a: v(0, 0.9, -30), b: v(0, 1.4, -30) }] }
    const r = rayon(v(0, 1.2, 0), v(0, 0, -1))
    expect(npcHit(r, [pnj], { far: 20 })).toBeNull()
    expect(npcHit(r, [pnj], { far: 40 })?.npc).toBe(pnj)
    expect(npcHit(r, [pnj])?.npc).toBe(pnj)   // sans borne, comme avant
  })
})
