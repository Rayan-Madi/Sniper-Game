import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'

// Décor qui arrête la balle (spec du lot 2, §3.4 ; plan, tâche T5). maps.js pose userData.solid = true sur ce que ses
// primitives créent (box, plane, cylinder, bâtiments, voitures), avec userData.surface : 'pierre' par défaut, 'metal'
// pour les conteneurs, voitures, jeeps, grue, tonneaux, 'bois' pour les caisses, tables, bancs, 'sol' pour les sols.
// Pluie, lumières, vitres, peinture au sol et marqueurs des cibles ne sont jamais solides. La liste des solides de la
// carte est tenue par maps.js (solidMeshes()), vidée par clear() ; ?solides=1 teinte les solides (setSolidTint).
//
// Témoin : avant le lot 2 (commit ac004b6), rien n'est marqué : aucun rayon ne rencontre de maillage solide, la liste
// des solides est vide et la teinte de vérification n'existe pas (vus rouges).

// maps.js pose ses objets dans la scène du jeu : une vraie THREE.Scene ici, sans rendu ni lumières.
vi.mock('../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

import { scene } from '../src/scene.js'
import * as maps from '../src/maps.js'
import { NPC } from '../src/npc.js'
import { withSeed } from '../src/gfx/memtest.js'

const { MAP_BUILDERS, clearMap, makeJeep } = maps
// Absents avant le lot 2 : la liste vide et une teinte sans effet, pour que les tests échouent sur leurs assertions.
const solidMeshes = () => (maps.solidMeshes ? maps.solidMeshes() : [])
const setSolidTint = on => { if (maps.setSolidTint) maps.setSolidTint(on) }

const NAMES = ['M1 rue', 'M2 place', 'M3 port', 'M4 base', 'M5 convoi', 'M6 fête']
// Chaque carte tire fenêtres, arbres, rochers au hasard : une graine par carte, comme la route ?memtest=1.
const build = i => withSeed(1000 + i, MAP_BUILDERS[i])
const v = (x, y, z) => new THREE.Vector3(x, y, z)

// Premier maillage solide sur le rayon (origine, direction) dans toute la scène, ce qui n'est pas solide étant
// traversé : { surface, point, objet } ou null. Les intersections sont toutes relevées (rayon depuis l'origine).
function premierSolide(origin, dir) {
  scene.updateMatrixWorld(true)
  const rc = new THREE.Raycaster(origin, dir.clone().normalize())
  for (const h of rc.intersectObjects(scene.children, true)) {
    if (h.object.isMesh && h.object.userData.solid) return { surface: h.object.userData.surface, point: h.point, objet: h.object }
  }
  return null
}
const vers = (from, to) => premierSolide(from, to.clone().sub(from))
// Maillages de la scène (carte affichée) qui vérifient pred.
function maillages(pred) {
  const out = []
  scene.traverse(o => { if (o.isMesh && pred(o)) out.push(o) })
  return out
}
const couleur = o => o.material.color.getHex()
const centre = o => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())

// Rayons horizontaux (ou plongeants) vers un objet connu de chaque carte : surface attendue, et ce que doit valoir le
// point touché (coordonnée et valeur, à 2 cm près). Positions relevées dans maps.js.
const CAS = [
  // M1 rue
  [0, 'mur d\'un immeuble (pierre)', v(0, 5, -12), v(-1, 0, 0), 'pierre', ['x', -13]],
  [0, 'voiture garée (metal)', v(0, 0.6, 0), v(-1, 0, 0), 'metal', ['x', -4.45]],
  [0, 'chaussée (sol), tirée du poste', v(0, 8, 30), v(3, -8, -26), 'sol', ['y', 0.01]],
  [0, 'poubelle (metal)', v(-4, 0.4, 20), v(0, 0, -1), 'metal', ['z', 14.3]],
  // M2 place
  [1, 'immeuble de la place (pierre)', v(0, 6, 0.5), v(-1, 0, 0), 'pierre', ['x', -17]],
  [1, 'voiture garée (metal)', v(-15, 0.6, 10), v(0, 0, 1), 'metal', ['z', 15.8]],
  [1, 'banc (bois)', v(5, 0.2, 0), v(1, 0, 0), 'bois', ['x', 9.1]],
  [1, 'vasque de la fontaine (pierre)', v(0, 0.4, 8), v(0, 0, -1), 'pierre', null],
  [1, 'dalles de la place (sol)', v(0, 10, 0), v(-7, -10, -7), 'sol', ['y', 0]],
  // M3 port
  [2, 'conteneurs empilés à droite (metal)', v(10, 1.4, -5), v(1, 0, 0), 'metal', ['x', 18.4]],
  [2, 'conteneur rouge du cadenas (metal)', v(-10, 1.5, 2), v(-1, 0, 0), 'metal', ['x', -15.2]],
  [2, 'mur de l\'entrepôt (pierre)', v(0, 9.5, 0), v(0, 0, -1), 'pierre', ['z', -20]],
  [2, 'porte métallique de l\'entrepôt (metal)', v(9, 4, 0), v(0, 0, -1), 'metal', ['z', -19.95]],
  [2, 'grue (metal)', v(28, 12, 0), v(0, 0, -1), 'metal', ['z', -9.55]],
  [2, 'dalle du quai (sol), tirée du poste', v(0, 10, 28), v(3, -9.655, -30), 'sol', ['y', 0.345]],
  // M4 base
  [3, 'baraquement (pierre)', v(0, 3, -8), v(-1, 0, 0), 'pierre', ['x', -20]],
  [3, 'camion (metal)', v(0, 1, 6), v(-1, 0, 0), 'metal', ['x', -13.5]],
  [3, 'tarmac (sol), tiré du poste', v(0, 14.5, 21), v(3, -14.3, -29), 'sol', ['y', 0.2]],
  [3, 'hangar (pierre)', v(-10, 5, -10), v(0, 0, -1), 'pierre', ['z', -24]],
  // M5 convoi
  [4, 'glissière de sécurité (metal)', v(0.3, 0.7, 2), v(0, 0, -1), 'metal', ['z', 0.74]],
  [4, 'blindé en épave (metal)', v(30, 1, 6), v(1, 0, 0), 'metal', ['x', 31]],
  [4, 'route (sol), tirée du poste', v(0, 7, 24), v(2, -6.8, -28), 'sol', ['y', 0.2]],
  [4, 'promontoire du poste (pierre)', v(0, 3, 20), v(0, 0, 1), 'pierre', ['z', 24]],
  // M6 fête
  [5, 'mur du fond de la salle (pierre)', v(0, 4, -20), v(0, 0, -1), 'pierre', ['z', -24.85]],
  [5, 'canapé (bois)', v(8, 0.45, -18), v(0, 0, -1), 'bois', ['z', -21.4]],
  [5, 'table basse (bois)', v(8, 0.2, -18), v(0, 0, -1), 'bois', ['z', -20.05]],
  // Le poste est sur la face arrière du rebord de la fenêtre : rayon pris un mètre devant (le seuil de départ de la
  // balle est le sujet de tests/shot/occlusion.test.js).
  [5, 'parquet sous la piste de danse (sol), tiré devant le poste', v(0.08, 8.64, 4), v(2, -9, -25), 'sol', ['y', 0]],
  [5, 'rambarde de la baie (metal)', v(3, 1, -10), v(0, 0, -1), 'metal', ['z', -15.9]],
]

describe('décor solide : un rayon vers un mur, un conteneur, une voiture touche un maillage solide de la bonne matière', () => {
  for (const [i, quoi, from, dir, surface, attendu] of CAS) {
    it(`${NAMES[i]} : ${quoi}`, () => {
      build(i)
      const hit = premierSolide(from, dir)
      expect(hit, 'un maillage solide sur le rayon').not.toBe(null)
      expect(hit.surface).toBe(surface)
      if (attendu) expect(Math.abs(hit.point[attendu[0]] - attendu[1]), `point touché ${hit.point.toArray()}`).toBeLessThanOrEqual(0.02)
    })
  }

  it('M1 rue : un tronc d\'arbre est en bois, son feuillage ne l\'est pas (la balle traverse les feuilles)', () => {
    build(0)
    const troncs = maillages(o => o.geometry.type === 'CylinderGeometry' && couleur(o) === 0x5a3a1a)
    const feuillages = maillages(o => o.geometry.type === 'SphereGeometry' && couleur(o) === 0x2d5a1a)
    expect(troncs.length).toBeGreaterThan(5)
    expect(feuillages.length).toBe(troncs.length)
    for (const t of troncs) {
      const c = centre(t)
      const hit = vers(c.clone().add(v(0.6, 0, 0)), c)
      expect(hit?.surface).toBe('bois')
      expect(hit.objet).toBe(t)
    }
    for (const f of feuillages) expect(f.userData.solid).not.toBe(true)
  })

  it('M3 port : les conteneurs empilés à gauche et à droite sont en métal', () => {
    build(2)
    for (const [x, sens] of [[-10, -1], [10, 1]]) {
      for (const y of [1.4, 4.2]) {
        const hit = premierSolide(v(x, y, -5.5), v(sens, 0, 0))
        expect(hit?.surface, `x ${x}, y ${y}`).toBe('metal')
      }
    }
  })

  it('M4 base : les tonneaux sont en métal', () => {
    build(3)
    const tonneaux = maillages(o => o.geometry.type === 'CylinderGeometry' && [0x4a6a3a, 0x6a5a2a].includes(couleur(o)))
    expect(tonneaux).toHaveLength(10)
    for (const t of tonneaux) {
      const c = centre(t)
      expect(vers(c.clone().add(v(0, 0, 0.8)), c)?.objet).toBe(t)
      expect(t.userData.surface).toBe('metal')
    }
  })

  it('M5 convoi : les rochers sont de la pierre, touchés par-dessus', () => {
    build(4)
    const rochers = maillages(o => o.geometry.type === 'IcosahedronGeometry')
    expect(rochers).toHaveLength(16)
    for (const r of rochers) {
      const c = centre(r)
      const hit = vers(c.clone().add(v(0, 6, 0)), c)
      expect(hit?.objet).toBe(r)
      expect(hit.surface).toBe('pierre')
    }
  })
})

// Ce qui n'arrête jamais une balle : la pluie, les lumières, tout ce qui brille de lui-même (lampes, phares, néons,
// fenêtres éclairées, peinture au sol, soleil couchant : MeshBasicMaterial), les vitres, les drapeaux et le feuillage.
describe('jamais solide : pluie, lumières, vitres, peinture, marqueurs', () => {
  NAMES.forEach((name, i) => {
    it(`${name} : pluie, lumières et maillages lumineux ne sont pas solides`, () => {
      build(i)
      let lumineux = 0
      scene.traverse(o => {
        if (o.isPoints || o.isLight) expect(o.userData.solid, `${o.type}`).not.toBe(true)
        if (o.isMesh && o.material.isMeshBasicMaterial) { lumineux++; expect(o.userData.solid, `${o.geometry.type} ${couleur(o).toString(16)}`).not.toBe(true) }
      })
      expect(lumineux).toBeGreaterThan(0)
    })
  })

  it('M3 port : la pluie est dans la scène, pas dans les solides', () => {
    build(2)
    const pluie = []
    scene.traverse(o => { if (o.isPoints) pluie.push(o) })
    expect(pluie).toHaveLength(1)
    expect(solidMeshes()).not.toContain(pluie[0])
  })

  it('M1 rue : un rayon à travers une fenêtre éclairée d\'un immeuble la traverse et s\'arrête sur le mur', () => {
    build(0)
    scene.updateMatrixWorld(true)
    const from = v(-19.25, 5.25, 0), dir = v(0, 0, -1)
    const hits = new THREE.Raycaster(from, dir).intersectObjects(scene.children, true)
    expect(hits[0].object.material.isMeshBasicMaterial, 'la fenêtre est devant le mur').toBe(true)
    expect(hits[0].point.z).toBeCloseTo(-4.98, 3)
    const hit = premierSolide(from, dir)
    expect(hit?.surface).toBe('pierre')
    expect(hit.point.z).toBeCloseTo(-5, 3)
  })

  it('M1 rue : les vitres teintées des voitures ne sont pas solides, la carrosserie l\'est', () => {
    build(0)
    const vitres = maillages(o => couleur(o) === 0x101720)
    expect(vitres).toHaveLength(5)
    for (const w of vitres) {
      expect(w.userData.solid).not.toBe(true)
      expect(w.parent.children.filter(o => o.userData.solid && o.userData.surface === 'metal').length).toBeGreaterThan(10)
    }
  })

  it('M4 base : le drapeau (tissu) n\'est pas solide, son mât l\'est', () => {
    build(3)
    const drapeau = maillages(o => o.geometry.type === 'PlaneGeometry' && couleur(o) === 0x335533)
    expect(drapeau).toHaveLength(1)
    expect(drapeau[0].userData.solid).not.toBe(true)
    expect(premierSolide(v(-8, 4, 6), v(0, 0, -1))?.surface).toBe('metal')
  })

  it('M6 fête : les bouteilles du bar (verre) ne sont pas solides, le bar l\'est', () => {
    build(5)
    const bouteilles = maillages(o => o.geometry.type === 'CylinderGeometry' && Math.abs(centre(o).y - 1.55) < 0.01)
    expect(bouteilles).toHaveLength(4)
    for (const b of bouteilles) expect(b.userData.solid).not.toBe(true)
    expect(premierSolide(v(-10, 0.6, -15), v(0, 0, -1))?.surface).toBe('bois')
  })

  it('les marqueurs des cibles et les PNJ ne sont jamais solides', () => {
    build(0)
    const npc = new NPC({ isTarget: true, color: 0xcc4422, x: 0, z: 0, bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } })
    expect(npc.mesh.userData.marker).toBeTruthy()
    npc.mesh.traverse(o => { if (o.isMesh) expect(o.userData.solid).not.toBe(true) })
    expect(solidMeshes().some(m => { let p = m; while (p) { if (p === npc.mesh) return true; p = p.parent } return false })).toBe(false)
    npc.dispose()
  })
})

describe('jeeps du convoi : solides, en métal, sauf le pare-brise', () => {
  it('un rayon vers le flanc d\'une jeep touche du métal ; le pare-brise vitré n\'est pas solide', () => {
    clearMap()
    const jeep = makeJeep()
    scene.add(jeep)
    jeep.position.set(0, 0.2, -4)
    const hit = premierSolide(v(0, 1, 5), v(0, 0, -1))
    expect(hit?.surface).toBe('metal')
    let parts = 0
    jeep.traverse(o => {
      if (!o.isMesh) return
      if (o.material.transparent) expect(o.userData.solid, 'pare-brise').not.toBe(true)
      else if (!o.material.isMeshBasicMaterial) { parts++; expect(o.userData.solid).toBe(true); expect(o.userData.surface).toBe('metal') }
    })
    expect(parts).toBeGreaterThan(20)
    jeep.removeFromParent()
  })
})

describe('liste des solides de la carte (solidMeshes), vidée par clear()', () => {
  NAMES.forEach((name, i) => {
    it(`${name} : exactement les maillages solides de la carte affichée`, () => {
      build(i)
      const attendus = maillages(o => o.userData.solid === true)
      expect(attendus.length).toBeGreaterThan(20)
      expect(new Set(solidMeshes())).toEqual(new Set(attendus))
      expect(solidMeshes()).toHaveLength(attendus.length)
    })
  })

  it('une carte construite remplace la liste de la précédente ; clearMap la vide', () => {
    build(2)
    const port = solidMeshes().slice()
    expect(port.length).toBeGreaterThan(20)
    build(5)
    for (const m of port) expect(solidMeshes()).not.toContain(m)
    clearMap()
    expect(solidMeshes()).toEqual([])
  })
})

// Route de développement ?solides=1 (spec du lot 2, §6) : chaque maillage solide prend la couleur de sa matière, pour une
// vérification à l'œil ; le reste garde la sienne.
describe('?solides=1 : teinte des solides par matière', () => {
  it('après setSolidTint(true), chaque solide a la teinte de sa matière, les autres maillages gardent la leur', () => {
    setSolidTint(true)
    try {
      for (let i = 0; i < 6; i++) {
        const avant = withSeed(1000 + i, () => { setSolidTint(false); MAP_BUILDERS[i](); return maillages(() => true).map(couleur) })
        setSolidTint(true)
        build(i)
        const apres = maillages(() => true)
        const teintes = maps.SOLID_TINTS || {}
        const parMatiere = {}
        apres.forEach((o, k) => {
          if (o.userData.solid) {
            expect(couleur(o), `${NAMES[i]} ${o.userData.surface}`).toBe(teintes[o.userData.surface])
            parMatiere[o.userData.surface] = true
          } else expect(couleur(o)).toBe(avant[k])
        })
        expect(parMatiere.sol, `${NAMES[i]} : un sol teinté`).toBe(true)
      }
      const couleurs = Object.values(maps.SOLID_TINTS || {})
      expect(new Set(couleurs).size).toBe(4)
    } finally { setSolidTint(false) }
  })

  it('une jeep construite pendant la vérification est teintée aussi', () => {
    setSolidTint(true)
    try {
      const jeep = makeJeep()
      jeep.traverse(o => { if (o.isMesh && o.userData.solid) expect(couleur(o)).toBe((maps.SOLID_TINTS || {}).metal) })
      let solides = 0
      jeep.traverse(o => { if (o.isMesh && o.userData.solid) solides++ })
      expect(solides).toBeGreaterThan(20)
    } finally { setSolidTint(false) }
  })
})
