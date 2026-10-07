import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { buildApartment } from '../../src/prologue/apartment.js'
import { moveCircle } from '../../src/prologue/fpsController.js'
import { CLUES, PHONE } from '../../src/prologue/clues.js'

const IDS = [...CLUES.map(c => c.id), PHONE.id]
const inside = (p, b) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ
// marche en ligne droite par petits pas, comme le contrôleur
const walk = (apt, from, to, steps = 400) => {
  let p = { ...from }
  for (let i = 0; i < steps; i++) p = moveCircle(p, (to.x - from.x) / steps, (to.z - from.z) / steps, 0.28, apt.colliders)
  return p
}

describe('l\'appartement', () => {
  it('tient le budget : moins de 60 objets dessinés et de 50 000 triangles', () => {
    const apt = buildApartment()
    const { drawables, triangles } = apt.stats()
    expect(drawables).toBeLessThan(60)
    expect(triangles).toBeLessThan(50000)
    apt.dispose()
  })

  it('une seule lumière projette une ombre : la lampe renversée', () => {
    const apt = buildApartment()
    const casters = []; apt.group.traverse(o => { if (o.isLight && o.castShadow) casters.push(o) })
    expect(casters).toEqual([apt.lights.spot])
    expect(apt.lights.spot.isSpotLight).toBe(true)
    apt.dispose()
  })

  it('chaque indice et le téléphone ont une cible visable, une ancre, et des matériaux à eux seuls (avec émissif)', () => {
    const apt = buildApartment()
    expect(apt.targets.map(t => t.userData.clueId).sort()).toEqual([...IDS].sort())
    const owner = new Map()   // matériau → indice qui l'utilise : la surbrillance d'un indice ne doit rien allumer d'autre
    for (const t of apt.targets) {
      expect(apt.anchors[t.userData.clueId]).toBeDefined()
      t.traverse(o => {
        for (const m of [].concat(o.material || [])) {
          expect(m.emissive, t.userData.clueId).toBeDefined()
          expect(owner.get(m) ?? t.userData.clueId).toBe(t.userData.clueId)
          owner.set(m, t.userData.clueId)
        }
      })
    }
    apt.group.traverse(o => {
      let inTarget = false
      for (let p = o; p; p = p.parent) if (p.userData && p.userData.clueId) inTarget = true
      if (!inTarget) for (const m of [].concat(o.material || [])) expect(owner.has(m)).toBe(false)
    })
    apt.dispose()
  })

  it('la porte d\'entrée s\'ouvre sans erreur', () => {
    const apt = buildApartment()
    apt.openDoor()
    expect(() => { for (let i = 0; i < 30; i++) apt.update(0.1) }).not.toThrow()
    apt.dispose()
  })

  it('le départ est sur le palier et hors de toute collision', () => {
    const apt = buildApartment()
    expect(apt.start).toMatchObject({ x: 6, z: 7.85, yaw: 0 })
    for (const b of apt.colliders) expect(inside(apt.start, b)).toBe(false)
    apt.dispose()
  })

  it('on passe la porte d\'entrée, l\'arche du salon, le couloir et la porte de la chambre', () => {
    const apt = buildApartment()
    expect(walk(apt, { x: 6.0, z: 7.85 }, { x: 6.0, z: 5.8 }).z).toBeLessThan(6.0)        // porte d'entrée
    expect(walk(apt, { x: 6.0, z: 5.8 }, { x: 8.6, z: 5.8 }).x).toBeGreaterThan(8.3)       // arche du salon
    expect(walk(apt, { x: 5.2, z: 5.15 }, { x: 2.45, z: 5.15 }).x).toBeLessThan(2.7)       // couloir
    expect(walk(apt, { x: 2.45, z: 5.15 }, { x: 2.45, z: 3.6 }).z).toBeLessThan(3.9)       // chambre de la petite
    apt.dispose()
  })

  it('les murs et les portes fermées arrêtent le joueur', () => {
    const apt = buildApartment()
    expect(walk(apt, { x: 10, z: 4 }, { x: 14, z: 4 }).x).toBeLessThan(12.5)              // fenêtre du salon
    expect(walk(apt, { x: 6.05, z: 5.4 }, { x: 6.05, z: 3.0 }).z).toBeGreaterThan(4.5)     // porte de la cuisine
    expect(walk(apt, { x: 1.95, z: 5.15 }, { x: 1.95, z: 7.0 }).z).toBeLessThan(5.8)       // porte des parents
    apt.dispose()
  })

  it('les formes sous le drap arrêtent le joueur', () => {
    const apt = buildApartment()
    expect(walk(apt, { x: 9.2, z: 4.8 }, { x: 11.9, z: 4.8 }).x).toBeLessThan(9.7)         // par l'arche, vers la fenêtre
    expect(walk(apt, { x: 10.6, z: 5.9 }, { x: 10.6, z: 3.7 }).z).toBeGreaterThan(5.5)     // depuis l'étagère, vers la table
    apt.dispose()
  })

  it('les ancres des indices sont accessibles (à moins de 1,5 m d\'un point atteignable)', () => {
    const apt = buildApartment()
    const reach = { serrure: { x: 6.0, z: 7.6 }, lutte: { x: 6.4, z: 6.0 }, corps: { x: 9.6, z: 5.6 }, photo: { x: 10.6, z: 6.3 }, mot: { x: 9.5, z: 4.2 }, doudou: { x: 2.45, z: 3.9 }, telephone: { x: 5.4, z: 6.3 } }
    for (const id of IDS) {
      const a = apt.anchors[id]
      expect(Math.hypot(a.x - reach[id].x, a.z - reach[id].z), id).toBeLessThan(1.5)
      for (const b of apt.colliders) expect(inside(reach[id], b), `${id} : point d'accès dans une collision`).toBe(false)
    }
    apt.dispose()
  })

  it('dispose libère géométries, matériaux, textures et la carte d\'ombre', () => {
    const apt = buildApartment()
    const geos = new Set(), mats = new Set(), maps = new Set()
    apt.group.traverse(o => {
      if (o.geometry) geos.add(o.geometry)
      for (const m of [].concat(o.material || [])) { mats.add(m); if (m.map) maps.add(m.map) }
    })
    const spies = [...geos, ...mats, ...maps].map(x => vi.spyOn(x, 'dispose'))
    const shadow = vi.spyOn(apt.lights.spot.shadow, 'dispose')
    apt.dispose()
    for (const s of spies) expect(s).toHaveBeenCalled()
    expect(shadow).toHaveBeenCalled()
    expect(apt.group.children.length).toBe(0)
  })

  // finition : coupé au bord de l'image, l'ancien abat-jour (cône lisse, brun éclairé d'orange) se lisait comme un doigt
  it('l\'abat-jour se lit comme un abat-jour : tissu sombre et pas couleur chair dehors, lueur chaude dedans', () => {
    const apt = buildApartment()
    const byMat = name => { const r = []; apt.group.traverse(o => { if (o.material && o.material.name === name) r.push(o) }); return r }
    const [outer] = byMat('abatJour'), [inner] = byMat('abatJourDedans')
    expect(outer, 'tissu extérieur').toBeDefined(); expect(inner, 'intérieur').toBeDefined()
    const hsl = c => c.getHSL({})
    const o = hsl(outer.material.color)
    expect(o.l).toBeLessThan(0.25)                                   // un tissu sombre…
    const h = o.h * 360
    expect(h >= 330 || h <= 5 || (h >= 90 && h <= 260), `teinte ${h.toFixed(0)}° : bordeaux, vert ou gris-bleu, pas chair`).toBe(true)
    expect(outer.material.side).toBe(THREE.FrontSide)                // dehors seulement : la lueur ne traverse pas le tissu
    expect(outer.material.emissiveIntensity * Math.max(...outer.material.emissive.toArray())).toBeLessThan(0.7)
    expect(inner.material.side).toBe(THREE.BackSide)                 // la face intérieure, vue par l'ouverture
    const i = hsl(inner.material.color)
    expect(i.l).toBeGreaterThan(0.45); expect(i.h * 360).toBeGreaterThan(15); expect(i.h * 360).toBeLessThan(50)   // chaude
    apt.dispose()
  })

  it('update anime sans erreur', () => {
    const apt = buildApartment()
    expect(() => { for (let i = 0; i < 10; i++) apt.update(0.016) }).not.toThrow()
    apt.dispose()
  })
})
