import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { stepConvoy } from '../../src/campaign/convoy.js'

// Convoi de M5 tel que startLevel le monte : la jeep du colonel (chauffeur + colonel à l'arrière) et une escorte.
// La route est une dalle dont le dessus est à 0,2 m (maps.js, buildMapConvoy).
function makeConvoy(groundY = 0.2, z = -4) {
  const npc = () => ({ alive: true, mesh: new THREE.Object3D() })
  const driver = npc(), colonel = npc(), escort = npc()
  const mid = { mesh: new THREE.Object3D(), offsetX: 0, riders: [
    { npc: driver, dx: 0.6, dy: 0.62, dz: 0.55 },
    { npc: colonel, dx: -1.4, dy: 0.82, dz: 0 },
  ] }
  const lead = { mesh: new THREE.Object3D(), offsetX: 16, riders: [{ npc: escort, dx: 0.6, dy: 0.62, dz: 0.55 }] }
  const convoy = { baseX: -55, z, groundY, dir: 1, speed: 8.5, vehicles: [lead, mid] }
  return { convoy, mid, lead, driver, colonel, escort }
}

// Avance de `seconds` par pas de 1/60 s, comme la boucle du jeu. Vrai si le convoi s'est échappé.
function run(convoy, seconds, target) {
  for (let i = 0; i < Math.round(seconds * 60); i++) if (stepConvoy(convoy, 1 / 60, target)) return true
  return false
}

describe('convoi de M5 : jeeps et occupants posés sur la route', () => {
  it('les jeeps roulent sur le dessus de la route (0,2 m), pas enfoncées dedans', () => {
    const { convoy, mid, lead } = makeConvoy()
    run(convoy, 1)
    expect(mid.mesh.position.y).toBeCloseTo(0.2, 9)
    expect(lead.mesh.position.y).toBeCloseTo(0.2, 9)
    expect(mid.mesh.position.x).toBeCloseTo(convoy.baseX, 9)
    expect(lead.mesh.position.x).toBeCloseTo(convoy.baseX + 16, 9)
    expect(mid.mesh.position.z).toBe(-4)
  })

  it('les occupants vivants sont assis à la hauteur de leur siège au-dessus de la route', () => {
    const { convoy, mid, driver, colonel } = makeConvoy()
    run(convoy, 1, colonel)
    expect(driver.mesh.position.y).toBeCloseTo(0.2 + 0.62, 9)
    expect(colonel.mesh.position.y).toBeCloseTo(0.2 + 0.82, 9)
    expect(colonel.mesh.position.x).toBeCloseTo(mid.mesh.position.x - 1.4, 9)
    expect(colonel.mesh.rotation.y).toBeCloseTo(Math.PI / 2, 9)   // face au sens de la marche
  })

  it('route déplacée à z = -6 : jeeps et occupants suivent l\'axe de la route du convoi, pas un z en dur', () => {
    const { convoy, mid, lead, driver, colonel, escort } = makeConvoy(0.2, -6)
    run(convoy, 1, colonel)
    expect(mid.mesh.position.z).toBeCloseTo(-6, 9)
    expect(lead.mesh.position.z).toBeCloseTo(-6, 9)
    expect(driver.mesh.position.z).toBeCloseTo(-6 + 0.55, 9)
    expect(escort.mesh.position.z).toBeCloseTo(-6 + 0.55, 9)
    expect(colonel.mesh.position.z).toBeCloseTo(-6, 9)
  })
})

describe('convoi de M5 : le colonel abattu reste dans sa jeep', () => {
  it('la jeep roule encore à 15 % : le corps du colonel la suit au lieu de rester suspendu en l\'air', () => {
    const { convoy, mid, colonel } = makeConvoy()
    run(convoy, 3, colonel)
    // killTarget : le colonel meurt, la jeep part en roue libre
    colonel.alive = false
    convoy.speed *= 0.15
    const xMort = colonel.mesh.position.x
    run(convoy, 2, null)
    expect(mid.mesh.position.x).toBeGreaterThan(xMort + 1.4 + 2)   // la jeep a bien avancé (2,55 m)
    expect(colonel.mesh.position.x).toBeCloseTo(mid.mesh.position.x - 1.4, 9)
    expect(colonel.mesh.position.y).toBeCloseTo(0.2 + 0.82, 9)
    expect(colonel.mesh.position.z).toBeCloseTo(-4, 9)
  })

  it('le corps garde la rotation de sa chute (seule la position suit la jeep)', () => {
    const { convoy, colonel } = makeConvoy()
    run(convoy, 1, colonel)
    colonel.alive = false
    colonel.mesh.rotation.set(Math.PI / 2, 0.4, 0)   // modèle procédural couché par die()
    run(convoy, 1, null)
    expect(colonel.mesh.rotation.x).toBeCloseTo(Math.PI / 2, 9)
    expect(colonel.mesh.rotation.y).toBeCloseTo(0.4, 9)
  })
})

describe('convoi de M5 : fin de la traversée', () => {
  it('colonel vivant au bout de la route : il s\'échappe', () => {
    const { convoy, colonel } = makeConvoy()
    expect(run(convoy, 20, colonel)).toBe(true)
  })

  it('colonel abattu : le convoi s\'immobilise à x = 60, pas de nouveau passage', () => {
    const { convoy, colonel } = makeConvoy()
    colonel.alive = false
    expect(run(convoy, 20, null)).toBe(false)
    expect(convoy.baseX).toBe(60)
  })
})
