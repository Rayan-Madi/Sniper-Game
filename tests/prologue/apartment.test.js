import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { buildApartment } from '../../src/prologue/apartment.js'
import { moveCircle } from '../../src/prologue/fpsController.js'
import { CLUES, PHONE } from '../../src/prologue/clues.js'

const IDS = [...CLUES.map(c => c.id), PHONE.id]
// emprise du joueur : moveCircle teste un carré de demi-côté r = 0,28 (rayon par défaut de createFpsController)
const R = 0.28
// le carré du joueur centré en p chevauche la boîte b (un contact bord à bord ne compte pas, même tolérance que moveCircle)
const blocks = (p, b, r = R) => {
  const E = 1e-6
  return p.x + r > b.minX + E && p.x - r < b.maxX - E && p.z + r > b.minZ + E && p.z - r < b.maxZ - E
}
// marche en ligne droite par petits pas, comme le contrôleur
const walk = (apt, from, to, steps = 400) => {
  let p = { ...from }
  for (let i = 0; i < steps; i++) p = moveCircle(p, (to.x - from.x) / steps, (to.z - from.z) / steps, R, apt.colliders)
  return p
}

describe('l\'appartement', () => {
  // budget relevé par le prologue v2 (spec docs/superpowers/specs/2026-10-11-prologue-v2-design.md §5, au lieu de 47 et
  // 16 600) : toujours fusionné par matériau. Mesuré par stats() après l'architecture intérieure et sa relecture :
  // 48 objets, 27 398 triangles (en jeu : 45 appels, 27 294 triangles au départ) ; après le mobilier (N4) : 50 objets
  // (le velours du fauteuil, les images aux murs), 42 962 triangles (en jeu : 47 appels, 42 858 triangles au départ) ;
  // après sa relecture (l'écharpe pliée au crochet), 43 218 triangles (en jeu : 47 appels, 43 114 triangles au départ).
  // Il reste environ 1 800 triangles : une tâche qui ajoute de la géométrie en retire ailleurs, ou relève le budget
  // par une décision écrite. Toute hausse est un choix assumé : mettre ce test à jour en même temps que REPRISE.md.
  it('tient le budget relevé : au plus 80 objets dessinés et 45 000 triangles', () => {
    const apt = buildApartment()
    const { drawables, triangles } = apt.stats()
    expect(drawables).toBeLessThanOrEqual(80)
    expect(triangles).toBeLessThanOrEqual(45000)
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

  it('le départ est sur le palier et hors de toute collision, emprise du joueur comprise', () => {
    const apt = buildApartment()
    expect(apt.start).toMatchObject({ x: 6, z: 7.85, yaw: 0 })
    for (const b of apt.colliders) expect(blocks(apt.start, b)).toBe(false)
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

  // Chaque ancre a un point d'accès (le dernier point de sa route) : le joueur y tient avec son emprise, à moins de
  // 1,5 m de l'ancre, et il y arrive depuis le palier en marchant, étape par étape, sans être arrêté.
  it('les ancres des indices sont accessibles : un point où le joueur tient, à moins de 1,5 m, relié au palier', () => {
    const apt = buildApartment()
    const PORTE = { x: 6.0, z: 5.8 }   // juste derrière la porte d'entrée
    const routes = {
      serrure: [{ x: 6.0, z: 7.6 }],
      lutte: [PORTE, { x: 6.4, z: 6.0 }],
      corps: [PORTE, { x: 9.6, z: 5.8 }],                                // devant le drap, côté couloir du salon
      photo: [PORTE, { x: 10.6, z: 5.8 }, { x: 10.6, z: 6.3 }],
      mot: [PORTE, { x: 9.4, z: 5.8 }, { x: 9.4, z: 4.2 }],              // entre le drap et la table basse
      doudou: [PORTE, { x: 6.0, z: 5.15 }, { x: 2.45, z: 5.15 }, { x: 2.45, z: 3.9 }],
      // milieu de l'entrée : le passage entre la console et le battant ouvert (0,43 m) est plus étroit que le joueur
      telephone: [PORTE, { x: 5.6, z: 5.6 }],
    }
    const bad = []
    for (const id of IDS) {
      const route = routes[id], reach = route[route.length - 1], a = apt.anchors[id]
      if (Math.hypot(a.x - reach.x, a.z - reach.z) >= 1.5) bad.push(`${id} : point d'accès à plus de 1,5 m de l'ancre`)
      if (apt.colliders.some(b => blocks(reach, b))) bad.push(`${id} : l'emprise du joueur chevauche une collision au point d'accès`)
      let p = apt.start
      for (const q of route) {
        p = walk(apt, p, q)
        if (Math.hypot(p.x - q.x, p.z - q.z) > 1e-3) { bad.push(`${id} : arrêté avant (${q.x} ; ${q.z})`); break }
      }
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  // prologue v2 : toutes les textures de chaque matériau (carte, carte émissive…), pas seulement la carte ; les moulures,
  // menuiseries, radiateurs et luminaires sont fusionnés dans les maillages parcourus ici
  it('dispose libère géométries, matériaux, textures et la carte d\'ombre', () => {
    const apt = buildApartment()
    const geos = new Set(), mats = new Set(), maps = new Set()
    apt.group.traverse(o => {
      if (o.geometry) geos.add(o.geometry)
      for (const m of [].concat(o.material || [])) { mats.add(m); for (const k in m) if (m[k] && m[k].isTexture) maps.add(m[k]) }
    })
    expect(maps.size).toBeGreaterThan(10)
    // le mobilier (N4) en est : le velours du fauteuil, les images aux murs et leur planche dessinée en canvas
    const byName = n => [...mats].find(m => m.name === n)
    expect(byName('velours'), 'velours du fauteuil').toBeDefined()
    expect(byName('tableaux'), 'images aux murs').toBeDefined()
    expect(maps.has(byName('tableaux').map)).toBe(true)
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

// l'écran du téléphone pendant la vibration de la fin (spec docs/superpowers/specs/2026-10-11-enquete-fin-design.md §3.6)
describe('l\'appartement : l\'écran du téléphone', () => {
  const screenOf = apt => {
    let s = null
    apt.targets.find(t => t.userData.clueId === PHONE.id).traverse(o => { for (const m of [].concat(o.material || [])) if (m.userData.baseEmissive === 0x0b1220) s = m })
    return s
  }
  const idle = apt => { const seen = []; for (let i = 0; i < 120; i++) { apt.update(0.05); seen.push(screenOf(apt).emissiveIntensity) } return seen }

  it('setPhoneLight allume l\'écran au-delà de son clignotement de repos, et le tient malgré update', () => {
    const apt = buildApartment()
    const rest = Math.max(...idle(apt))                         // témoin : au repos, l'écran s'allume ~1 s toutes les 5,5 s
    apt.setPhoneLight(1)
    expect(screenOf(apt).emissiveIntensity).toBeGreaterThan(rest)
    const held = idle(apt)
    expect(Math.min(...held)).toBeGreaterThan(rest)              // 6 s : le clignotement de repos ne reprend pas la main
    apt.setPhoneLight(0.5)
    const half = screenOf(apt).emissiveIntensity
    expect(half).toBeLessThan(held[0]); expect(half).toBeGreaterThan(3)
    apt.dispose()
  })

  it('setPhoneLight(null) rend l\'écran à sa valeur de base, éteint, sans saut vers un clignotement en cours', () => {
    const apt = buildApartment()
    apt.update(0.5)                                             // en plein clignotement de repos
    expect(screenOf(apt).emissiveIntensity).toBeGreaterThan(3)
    apt.setPhoneLight(1); apt.update(0.05)
    apt.setPhoneLight(null)
    apt.update(0.05)
    expect(screenOf(apt).emissiveIntensity).toBe(3)              // la valeur de base, pas la suite du clignotement
    apt.dispose()
  })
})

// ── prologue v2 : un appartement moins cubique (spec docs/superpowers/specs/2026-10-11-prologue-v2-design.md §5) ──
// Sondes au rayon contre le décor tel qu'il est dessiné : maillages visibles et opaques seulement (ni lueurs, ni vitres,
// ni sang, ni volumes de visée invisibles, ni pluie).
const H = 2.6, V3 = (...a) => new THREE.Vector3(...a)
const r3 = v => Math.round(v * 1000) / 1000
const visible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true }
function probes(apt) {
  apt.group.updateMatrixWorld(true)
  const meshes = []; apt.group.traverse(o => { if (o.isMesh && !o.material.transparent && visible(o)) meshes.push(o) })
  const ray = new THREE.Raycaster()
  // premier objet opaque touché depuis o dans la direction d (undefined si rien avant far)
  const first = (o, d, far = 10) => {
    ray.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize()); ray.near = 0; ray.far = far
    return ray.intersectObjects(meshes, false)[0]
  }
  // distance au premier objet opaque, depuis o dans la direction d (Infinity si rien avant far)
  const hit = (o, d, far = 10) => { const h = first(o, d, far); return h ? h.distance : Infinity }
  // saillie de ce qui est posé sur la face d'un mur au point (x, y, z) de cette face, normale (nx, nz) vers la pièce :
  // 0 sur le mur nu, positive devant lui, négative dans un renfoncement
  const proud = (x, y, z, nx, nz) => 0.2 - hit([x + nx * 0.2, y, z + nz * 0.2], [-nx, 0, -nz], 0.5)
  // balaie la face le long du mur (de a à b, pas de 5 mm) : saillies relevées
  const scan = (face, y, a, b, step = 0.005) => {
    const out = []
    for (let s = a; s <= b + 1e-9; s += step) out.push(face.alongX ? proud(s, y, face.at, 0, face.n) : proud(face.at, y, s, face.n, 0))
    return out
  }
  // hauteur du premier dessus touché par un rayon vertical tiré de y0 vers le bas (le sol est en y = 0)
  const top = (x, z, y0 = 1.5) => y0 - hit([x, y0, z], [0, -1, 0], y0 + 0.1)
  return { first, hit, proud, scan, top }
}

describe('l\'appartement : l\'architecture intérieure', () => {
  // un point libre de chaque mur des pièces (ni meuble, ni ouverture) : [lieu, x, z, nx, nz] sur la face du mur
  const WALLS = [
    ['entrée, mur du palier', 5.0, 6.94, 0, -1], ['entrée, mur du palier', 7.2, 6.94, 0, -1],
    ['entrée, mur de la cuisine', 5.0, 4.56, 0, 1], ['entrée, mur de la cuisine', 7.0, 4.56, 0, 1],
    ['entrée, mur du couloir', 4.56, 6.35, 1, 0], ['entrée, mur du salon', 7.44, 4.75, -1, 0],
    ['salon, mur du canapé', 7.9, 1.06, 0, 1], ['salon, mur du canapé', 11.5, 1.06, 0, 1],
    ['salon, mur de l\'étagère', 9.5, 6.94, 0, -1], ['salon, mur de l\'étagère', 12.2, 6.94, 0, -1],
    ['salon, mur de la fenêtre', 12.44, 1.2, -1, 0], ['salon, mur de la fenêtre', 12.44, 6.8, -1, 0],
    ['salon, mur de l\'entrée', 7.56, 3.0, 1, 0],
    ['couloir, fond', 0.56, 5.15, 1, 0], ['couloir, mur des parents', 0.9, 5.74, 0, -1], ['couloir, mur des parents', 4.0, 5.74, 0, -1],
    ['couloir, mur de la chambre', 1.2, 4.56, 0, 1], ['couloir, mur de la chambre', 3.8, 4.56, 0, 1],
    ['chambre, mur de la fenêtre', 0.65, 0.86, 0, 1], ['chambre, mur de la fenêtre', 3.9, 0.86, 0, 1],
    ['chambre, mur de gauche', 0.56, 2.65, 1, 0], ['chambre, mur de droite', 4.44, 2.65, -1, 0],
    ['chambre, mur du couloir', 1.2, 4.44, 0, -1], ['chambre, mur du couloir', 4.1, 4.44, 0, -1],
  ]

  it('une corniche court sous le plafond de chaque pièce : elle déborde du mur en haut, le mur reparaît 20 cm plus bas', () => {
    const apt = buildApartment(), { proud } = probes(apt), bad = []
    for (const [lieu, x, z, nx, nz] of WALLS) {
      const top = proud(x, H - 0.015, z, nx, nz), below = proud(x, H - 0.2, z, nx, nz)
      if (!(top >= 0.03)) bad.push(`${lieu} (${x} ; ${z}) : ${r3(top)} m sous le plafond`)
      if (!(Math.abs(below) < 0.005)) bad.push(`${lieu} (${x} ; ${z}) : ${r3(below)} m à 20 cm du plafond`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('des plinthes moulurées de 10 cm : épaisses au pied, amincies en tête, rien au-dessus', () => {
    const apt = buildApartment(), { proud } = probes(apt), bad = []
    for (const [lieu, x, z, nx, nz] of WALLS) {
      const foot = proud(x, 0.02, z, nx, nz), head = proud(x, 0.095, z, nx, nz), above = proud(x, 0.14, z, nx, nz)
      if (!(foot >= 0.012)) bad.push(`${lieu} (${x} ; ${z}) : pied ${r3(foot)}`)
      if (!(head > 0.002 && head < foot - 0.003)) bad.push(`${lieu} (${x} ; ${z}) : tête ${r3(head)} (pied ${r3(foot)})`)
      if (!(Math.abs(above) < 0.002)) bad.push(`${lieu} (${x} ; ${z}) : ${r3(above)} à 14 cm`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  // relecture de N3 : des plinthes couraient aussi sur des faces que personne ne voit (des triangles pris au budget de N4)
  it('les plinthes ne courent que dans les pièces dessinées : rien côté cuisine, côté parents ni dehors', () => {
    const apt = buildApartment(), { proud } = probes(apt), bad = []
    // [lieu, x, z, nx, nz] sur la face du mur, normale vers le côté qu'on ne voit pas
    const UNSEEN = [
      ['cuisine, mur de l\'entrée', 5.0, 4.44, 0, -1], ['cuisine, mur de l\'entrée', 7.0, 4.44, 0, -1],
      ['cuisine, mur du salon', 7.44, 3.0, -1, 0], ['cuisine, mur de la chambre', 4.56, 2.65, 1, 0],
      ['parents, mur du couloir', 1.0, 5.86, 0, 1], ['parents, mur du couloir', 3.5, 5.86, 0, 1],
      ['parents, au-delà de l\'arche du couloir', 4.44, 6.4, -1, 0],
      ['dehors, salon', 10.0, 0.94, 0, -1], ['dehors, salon', 10.0, 7.06, 0, 1],
      ['dehors, salon', 12.56, 1.5, 1, 0], ['dehors, sous la baie', 12.56, 4.0, 1, 0],
      ['dehors, couloir', 0.44, 5.15, -1, 0], ['dehors, chambre', 0.44, 2.65, -1, 0],
      ['dehors, chambre', 1.0, 0.74, 0, -1], ['dehors, sous la fenêtre de la chambre', 2.3, 0.74, 0, -1],
      ['dehors, palier', 4.94, 7.8, -1, 0], ['dehors, palier', 7.06, 7.8, 1, 0], ['dehors, palier', 6.0, 8.56, 0, 1],
    ]
    for (const [lieu, x, z, nx, nz] of UNSEEN) {
      const v = proud(x, 0.02, z, nx, nz)
      if (!(Math.abs(v) < 0.002)) bad.push(`${lieu} (${x} ; ${z}) : ${r3(v)}`)
    }
    // et elles restent au bout des longueurs coupées, contre les angles des pièces dessinées
    const KEPT = [
      ['entrée, mur du salon, contre la cuisine', 7.44, 4.58, -1, 0], ['entrée, mur de la cuisine, contre le salon', 7.42, 4.56, 0, 1],
      ['entrée, mur de la cuisine, contre le couloir', 4.58, 4.56, 0, 1], ['entrée, mur du palier, contre le salon', 7.42, 6.94, 0, -1],
      ['couloir, au bout de l\'arche', 4.44, 5.72, -1, 0], ['couloir, avant l\'arche', 4.44, 4.58, -1, 0],
      ['palier, contre la porte', 5.3, 7.06, 0, 1], ['palier, contre la porte', 6.7, 7.06, 0, 1],
    ]
    for (const [lieu, x, z, nx, nz] of KEPT) {
      const v = proud(x, 0.02, z, nx, nz)
      if (!(v >= 0.01)) bad.push(`${lieu} (${x} ; ${z}) : ${r3(v)}, plus de plinthe`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  // les ouvertures : mur le long de x (z constant) ou de z ; faces habillées (côté des coordonnées croissantes : 1) ;
  // côtés de l'ouverture qui reçoivent un montant de chambranle (le côté gâche de la porte d'entrée est l'indice
  // « serrure » ; dans le couloir, l'arche touche les murs)
  const OPENINGS = [
    { nom: 'porte de la chambre', alongX: true, line: 4.5, from: 2.0, to: 2.9, top: 2.05, faces: [1, -1] },
    { nom: 'porte de la cuisine', alongX: true, line: 4.5, from: 5.6, to: 6.5, top: 2.05, faces: [1], closed: true },
    { nom: 'porte des parents', alongX: true, line: 5.8, from: 1.5, to: 2.4, top: 2.05, faces: [-1], closed: true },
    { nom: 'arche du salon', alongX: false, line: 7.5, from: 5.0, to: 6.6, top: 2.2, faces: [-1, 1] },
    { nom: 'arche du couloir, côté entrée', alongX: false, line: 4.5, from: 4.6, to: 5.7, top: 2.2, faces: [1], sides: ['to'] },
    { nom: 'arche du couloir, côté couloir', alongX: false, line: 4.5, from: 4.6, to: 5.7, top: 2.2, faces: [-1], sides: [] },
    { nom: 'porte d\'entrée', alongX: true, line: 7, from: 5.55, to: 6.45, top: 2.05, faces: [-1], sides: ['from'], noLining: true },
  ]

  it('chaque porte et chaque arche a son chambranle mouluré, en relief d\'au moins 2 cm, montants et traverse', () => {
    const apt = buildApartment(), { proud } = probes(apt), bad = []
    for (const o of OPENINGS) for (const s of o.faces) {
      const at = o.line + s * 0.06, p = (along, y) => o.alongX ? proud(along, y, at, 0, s) : proud(at, y, along, s, 0)
      const checks = [['traverse', (o.from + o.to) / 2, o.top + 0.055]]
      for (const side of o.sides || ['from', 'to']) checks.push([`montant ${side}`, side === 'from' ? o.from - 0.055 : o.to + 0.055, 1.0])
      for (const [part, along, y] of checks) { const v = p(along, y); if (!(v >= 0.02)) bad.push(`${o.nom} (face ${s}) : ${part} ${r3(v)}`) }
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('les ouvertures sont habillées d\'un bâti : l\'embrasure ne montre plus le bout brut du mur', () => {
    const apt = buildApartment(), { hit } = probes(apt), bad = []
    for (const o of OPENINGS) {
      if (o.noLining || o.sides) continue
      const mid = (o.from + o.to) / 2, half = (o.to - o.from) / 2
      const plane = o.closed ? o.line - o.faces[0] * 0.03 : o.line   // derrière le battant d'une porte fermée
      for (const dir of [-1, 1]) {
        const d = o.alongX ? hit([mid, 1.0, plane], [dir, 0, 0], 1) : hit([plane, 1.0, mid], [0, 0, dir], 1)
        if (!(d <= half - 0.01)) bad.push(`${o.nom} (vers ${dir}) : ${r3(d)} pour ${half}`)
      }
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  // relecture de N3 : le battant laissait 2 mm de jour contre son bâti (côtés et traverse), une fente sur le vide de la
  // pièce derrière, qui n'est pas dessinée
  it('les portes fermées remplissent leur bâti : aucun jour entre le battant et le bâti, ni sur les côtés ni en tête', () => {
    const apt = buildApartment(), { hit } = probes(apt), bad = []
    const T = 0.12, back = 0.3, step = 0.0005
    for (const o of OPENINGS.filter(p => p.closed)) {
      const s = o.faces[0], face = o.line + s * T / 2
      // rayon perpendiculaire au mur, tiré de 30 cm devant sa face vue : il doit s'arrêter avant d'avoir traversé le mur
      const through = (a, y) => !Number.isFinite(o.alongX ? hit([a, y, face + s * back], [0, 0, -s], back + T + 0.01) : hit([face + s * back, y, a], [-s, 0, 0], back + T + 0.01))
      const holes = new Set()
      for (const y of [0.5, 1.5]) for (let k = 0; k * step <= 0.02; k++) {
        if (through(o.from + 0.012 + k * step, y)) holes.add(`côté from à ${y} m`)
        if (through(o.to - 0.012 - k * step, y)) holes.add(`côté to à ${y} m`)
      }
      for (const a of [o.from + 0.2, (o.from + o.to) / 2]) for (let k = 0; k * step <= 0.02; k++) if (through(a, o.top - 0.012 - k * step)) holes.add('en tête')
      for (const h of holes) bad.push(`${o.nom} : jour ${h}`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('les portes fermées sont à panneaux à plate-bande : du battant au panneau, la saillie monte en biseau', () => {
    const apt = buildApartment(), { scan } = probes(apt), bad = []
    const doors = [
      { nom: 'porte de la cuisine', face: { alongX: true, at: 4.56, n: 1 }, a: 5.65, b: 6.45 },
      { nom: 'porte des parents', face: { alongX: true, at: 5.74, n: -1 }, a: 1.55, b: 2.35 },
      { nom: 'porte de la chambre, ouverte', face: { alongX: true, at: 4.44, n: -1 }, a: 3.0, b: 3.72 },
    ]
    for (const d of doors) for (const y of [0.5, 1.45]) {
      const levels = new Set(scan(d.face, y, d.a, d.b).filter(Number.isFinite).map(v => Math.round(v * 1000)))
      if (levels.size < 4) bad.push(`${d.nom} à ${y} m : ${levels.size} niveaux (${[...levels].join(', ')} mm)`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('les fenêtres sont posées au fond d\'une embrasure, à petits bois, sur un appui', () => {
    const apt = buildApartment(), { hit } = probes(apt), bad = []
    // runs : nombre de barreaux traversés (suites d'échantillons qui touchent la menuiserie à moins de 50 cm)
    const runs = ds => { let n = 0, prev = false; for (const d of ds) { const on = d < 0.5; if (on && !prev) n++; prev = on } return n }
    const range = (a, b, step = 0.005) => { const r = []; for (let s = a; s <= b + 1e-9; s += step) r.push(s); return r }
    // salon : baie x = 12,5 (face 12,44), z 2 à 6, y 0,9 à 2,3 ; sondes depuis x = 12,2 vers +x
    const across = range(2.2, 5.8).map(z => hit([12.2, 1.25, z], [1, 0, 0], 3))
    const depth = Math.min(...across.filter(d => d < 0.5)) + 12.2 - 12.44
    if (!(depth >= 0.12)) bad.push(`salon : menuiserie à ${r3(depth)} m derrière le mur`)
    if (runs(across) < 5) bad.push(`salon : ${runs(across)} montants à travers la baie`)
    const up = range(1.08, 2.15).map(y => hit([12.2, y, 2.5], [1, 0, 0], 3))
    if (runs(up) < 2) bad.push(`salon : ${runs(up)} traverses dans un vantail`)
    // chambre : fenêtre z = 0,8 (face 0,86), x 1,4 à 3,2, y 1 à 2,2 ; sondes depuis z = 1,1 vers −z
    const acrossC = range(1.55, 3.05).map(x => hit([x, 1.3, 1.1], [0, 0, -1], 3))
    const depthC = Math.min(...acrossC.filter(d => d < 0.5)) + 0.86 - 1.1
    if (!(depthC >= 0.12)) bad.push(`chambre : menuiserie à ${r3(depthC)} m derrière le mur`)
    const upC = range(1.12, 2.08).map(y => hit([1.85, y, 1.1], [0, 0, -1], 3))
    if (runs(upC) < 2) bad.push(`chambre : ${runs(upC)} traverses dans un vantail`)
    // appui : une tablette sous chaque fenêtre, qui déborde dans la pièce
    const sill = (x, z, y0) => y0 - hit([x, y0, z], [0, -1, 0], 2)
    const s1 = sill(12.42, 4.0, 1.3), s2 = sill(2.3, 0.875, 1.4)
    if (!(s1 > 0.9 && s1 < 0.96)) bad.push(`salon : appui à ${r3(s1)} m`)
    if (!(s2 > 1.0 && s2 < 1.06)) bad.push(`chambre : appui à ${r3(s2)} m`)
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('chaque rideau pend d\'une tringle, sous la corniche', () => {
    const apt = buildApartment(), { hit } = probes(apt), bad = []
    for (const [lieu, x, z] of [['salon, à gauche', 12.34, 1.7], ['salon, à droite', 12.34, 6.3], ['chambre, à gauche', 1.1, 0.96], ['chambre, à droite', 3.5, 0.96]]) {
      const d = hit([x, 2.55, z], [0, -1, 0], 3)
      if (!(d < 0.15)) bad.push(`${lieu} : rien sous ${r3(d)} m`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('un radiateur sous chaque fenêtre ; celui de la chambre arrête le joueur', () => {
    const apt = buildApartment(), { scan } = probes(apt)
    expect(Math.max(...scan({ alongX: false, at: 12.44, n: -1 }, 0.45, 3.4, 4.6))).toBeGreaterThanOrEqual(0.05)   // salon
    expect(Math.max(...scan({ alongX: true, at: 0.86, n: 1 }, 0.4, 1.45, 1.75))).toBeGreaterThanOrEqual(0.05)     // chambre, à gauche du lit
    expect(walk(apt, { x: 1.5, z: 2.0 }, { x: 1.5, z: 1.0 }).z).toBeGreaterThan(1.2)
    apt.dispose()
  })

  // occulteurs à jour : la visée (interact.js) et le regard vers le téléphone ne traversent ni une porte ni son cadre
  it('les portes, leurs chambranles et leurs bâtis arrêtent la visée, comme les murs', () => {
    const apt = buildApartment(); apt.group.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(), first = (o, d) => { ray.set(V3(...o), V3(...d)); ray.far = 3; const h = ray.intersectObjects(apt.occluders, true)[0]; return h ? h.distance : Infinity }
    expect(first([1.95, 1.0, 5.15], [0, 0, 1])).toBeLessThan(0.62)      // porte des parents, battant en z = 5,75
    expect(first([6.05, 1.0, 5.5], [0, 0, -1])).toBeLessThan(0.96)      // porte de la cuisine, battant en z = 4,55
    expect(first([7.575, 1.0, 4.0], [0, 0, 1])).toBeLessThan(0.95)      // le long du mur du salon : chambranle de l'arche
    expect(first([2.45, 1.0, 4.5], [1, 0, 0])).toBeLessThan(0.45)       // dans l'ouverture de la chambre : son bâti
    apt.dispose()
  })

  it('un interrupteur près de chaque porte, une prise dans chaque pièce : des plaques fines sur le mur', () => {
    const apt = buildApartment(), { scan } = probes(apt), bad = []
    const plate = v => v >= 0.004 && v <= 0.025
    const SWITCHES = [
      ['entrée, porte palière', { alongX: true, at: 6.94, n: -1 }, 6.56, 6.95],
      ['salon, arche', { alongX: false, at: 7.56, n: 1 }, 4.4, 4.9],
      ['couloir, porte des parents', { alongX: true, at: 5.74, n: -1 }, 0.95, 1.4],
      ['chambre, sa porte', { alongX: true, at: 4.44, n: -1 }, 1.45, 1.9],
    ]
    for (const [lieu, face, a, b] of SWITCHES) if (![1.05, 1.1, 1.15].some(y => scan(face, y, a, b).some(plate))) bad.push(`interrupteur : ${lieu}`)
    const OUTLETS = [
      ['entrée', { alongX: true, at: 4.56, n: 1 }, 6.7, 7.4],
      ['salon', { alongX: true, at: 1.06, n: 1 }, 7.6, 8.1],
      ['couloir', { alongX: true, at: 5.74, n: -1 }, 3.6, 4.3],
      ['chambre', { alongX: true, at: 0.86, n: 1 }, 3.28, 3.7],
    ]
    for (const [lieu, face, a, b] of OUTLETS) if (![0.25, 0.3].some(y => scan(face, y, a, b).some(plate))) bad.push(`prise : ${lieu}`)
    expect(bad).toEqual([])
    apt.dispose()
  })

  // relecture de N3 : la rosace, trop plate (2,4 cm de creux, aucun relief qui accroche la lumière), se lisait d'en
  // dessous comme un disque uni
  it('la rosace du salon est en relief : deux tores marqués autour du bouton, pas un disque plat', () => {
    const apt = buildApartment(), { hit } = probes(apt)
    // profondeur sous le plafond, de 5 à 24 cm de l'axe (au-delà du cache-piton), au milieu d'une facette ; rayons tirés
    // vers le haut entre le globe et la rosace
    const a = Math.PI / 24, depth = []
    for (let r = 0.05; r <= 0.24 + 1e-9; r += 0.0025) depth.push(H - (2.4 + hit([10 + r * Math.cos(a), 2.4, 4 + r * Math.sin(a)], [0, 1, 0], 1)))
    expect(Math.max(...depth)).toBeGreaterThanOrEqual(0.035)
    // tores : creux locaux qui dominent d'au moins 8 mm le champ de part et d'autre
    const rings = depth.filter((d, i) => {
      if (!(i > 0 && i < depth.length - 1 && d >= depth[i - 1] && d > depth[i + 1])) return false
      return Math.min(...depth.slice(0, i)) <= d - 0.008 && Math.min(...depth.slice(i + 1)) <= d - 0.008
    })
    expect(rings.length).toBeGreaterThanOrEqual(2)
    apt.dispose()
  })

  it('un luminaire au plafond de chaque pièce, éteint : aucune lumière de plus', () => {
    const apt = buildApartment(), { hit } = probes(apt), bad = []
    const lights = []; apt.group.traverse(o => { if (o.isLight) lights.push(o) })
    // rayons vers le haut, depuis 1,75 m (au-dessus des meubles, sous un globe suspendu), autour du milieu de la pièce
    for (const [lieu, cx, cz] of [['entrée', 6.0, 5.75], ['salon', 10.0, 4.0], ['couloir', 2.5, 5.15], ['chambre', 2.5, 2.65]]) {
      let lowest = Infinity
      for (let dx = -0.25; dx <= 0.25 + 1e-9; dx += 0.05) for (let dz = -0.25; dz <= 0.25 + 1e-9; dz += 0.05) lowest = Math.min(lowest, hit([cx + dx, 1.75, cz + dz], [0, 1, 0], 1))
      if (!(1.75 + lowest < H - 0.03)) bad.push(`${lieu} : plafond nu`)
    }
    expect(bad).toEqual([])
    // la lampe, le ciel, la lune, la veilleuse : les seules lumières, comme avant
    expect(lights.length).toBe(Object.keys(apt.lights).length)
    for (const l of Object.values(apt.lights)) expect(lights.includes(l)).toBe(true)
    apt.dispose()
  })
})

// ── prologue v2, tâche N4 : un mobilier qui a vécu (spec docs/superpowers/specs/2026-10-11-prologue-v2-design.md §5,
// « Mobilier ») : arêtes adoucies, canapé à coussins, fauteuil, table basse à plateau épais, étagère, lit de la petite,
// console à tiroir, tapis aux bords souples, petits objets de famille ──
describe('l\'appartement : le mobilier', () => {
  // rotation autour de y (celle de three) : point local (lx, lz) d'un meuble centré en (cx, cz), tourné de ry
  const turn = (cx, cz, ry, lx, lz) => [cx + lx * Math.cos(ry) + lz * Math.sin(ry), cz - lx * Math.sin(ry) + lz * Math.cos(ry)]
  // longueurs des suites d'échantillons consécutifs qui vérifient ok
  const runs = (vals, ok) => { const out = []; let n = 0; for (const v of vals) { if (ok(v)) n++; else { if (n) out.push(n); n = 0 } } if (n) out.push(n); return out }
  const range = (a, b, step) => { const r = []; for (let s = a; s <= b + 1e-9; s += step) r.push(s); return r }

  it('les meubles ont les arêtes adoucies : à 3 mm du bord, le dessus descend déjà un peu', () => {
    const apt = buildApartment(), { top } = probes(apt), bad = []
    // [meuble, point du dessus loin des bords, point à 3 mm d'un bord, d'où tirer le rayon]
    const PIECES = [
      ['table basse', [9.2, 3.1], [9.2, 2.803], 1.5],
      ['console de l\'entrée', [4.78, 6.0], [4.987, 6.0], 1.2],
      ['étagère, couronnement', [11.2, 6.82], [11.2, 6.658], 2.3],
      ['table de chevet', [2.95, 1.0], [2.95, 1.267], 0.95],
      ['coffre à jouets, couvercle', [1.2, 3.9], [1.357, 3.9], 0.95],
      ['lit, tête', [2.3, 0.93], [2.3, 0.952], 0.95],
      ['lit, pied', [2.3, 2.68], [2.3, 2.702], 0.95],
      // la chaise renversée près de l'arche, couchée sur son dossier : le chant avant de son siège, debout, à 44 cm
      // (épaisseur de 3,5 cm suivant (0,94 ; −0,34) : à 3 mm de sa face, 14,5 mm de son milieu)
      ['chaise renversée, chant du siège', [8.2823, 6.4427], [8.2959, 6.4377], 0.8],
    ]
    for (const [nom, c, e, y0] of PIECES) {
      const hc = top(...c, y0), he = top(...e, y0), drop = hc - he
      // un bord vif ne descend pas ; un rayon qui manque le meuble tombe bien plus bas
      if (!(drop >= 0.002 && drop <= 0.02)) bad.push(`${nom} : dessus ${r3(hc)}, à 3 mm du bord ${r3(he)}`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('le canapé : coussins d\'assise bombés, dossier à coussins, accoudoirs arrondis', () => {
    const apt = buildApartment(), { top, hit } = probes(apt), bad = []
    // assise : deux coussins (x 8,9 et 9,9), z 1,32 à 2,12 ; à 3 cm de leur bord avant, le dessus est plus bas qu'au milieu
    for (const x of [8.9, 9.9]) {
      const mid = top(x, 1.72, 1.0), front = top(x, 2.09, 1.0)
      if (!(mid - front >= 0.015 && mid - front <= 0.08)) bad.push(`assise en x = ${x} : milieu ${r3(mid)}, avant ${r3(front)}`)
    }
    // dossier : vu de face à 72 cm, chaque coussin bombe ; entre les deux, un creux d'au moins 3 cm
    const depth = x => hit([x, 0.72, 2.6], [0, 0, -1], 2)
    const seam = Math.max(...range(9.38, 9.42, 0.005).map(depth)), mids = [depth(8.9), depth(9.9)]
    if (!(seam - Math.max(...mids) >= 0.03)) bad.push(`dossier : creux ${r3(seam)} pour des coussins à ${mids.map(r3).join(' et ')}`)
    // accoudoirs (x 8,22 à 8,40 et 10,40 à 10,58) : à 2 cm du bord extérieur, le dessus est déjà plus bas d'1 cm
    for (const [nom, mid, out] of [['gauche', 8.31, 8.24], ['droit', 10.49, 10.56]]) {
      const a = top(mid, 1.7, 1.0), b = top(out, 1.7, 1.0)
      if (!(a - b >= 0.01 && a - b <= 0.1)) bad.push(`accoudoir ${nom} : milieu ${r3(a)}, bord ${r3(b)}`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  // les coussins sont tirés d'une sphère : sa couture (deux colonnes de sommets confondues) ne doit pas s'ouvrir ; une
  // fente de 0,3 mm laissait voir le socle du canapé, et tout rayon tiré sur la couture passait au travers
  it('les coussins d\'assise du canapé sont d\'un seul tenant : aucune fente sur leur couture', () => {
    const apt = buildApartment(), { top } = probes(apt), bad = []
    for (const cx of [8.905, 9.895]) for (const dx of range(-0.45, 0.45, 0.01)) {
      const h = top(cx + dx, 1.72, 1.0)
      if (!(h >= 0.4)) bad.push(`x = ${r3(cx + dx)} : ${r3(h)}`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('un fauteuil dans l\'angle du salon : une assise, un dossier, et on ne passe pas au travers', () => {
    const apt = buildApartment(), { top } = probes(apt)
    const C = [11.45, 1.85], RY = -0.95                         // tourné vers la table basse
    const seat = top(...C, 1.5), back = top(...turn(...C, RY, 0, -0.3), 1.5)
    expect(seat, 'assise').toBeGreaterThan(0.38); expect(seat, 'assise').toBeLessThan(0.52)
    expect(back, 'dossier').toBeGreaterThan(0.75)
    expect(walk(apt, { x: 11.4, z: 3.0 }, { x: 11.4, z: 1.3 }).z).toBeGreaterThan(2.2)
    apt.dispose()
  })

  it('la table basse a un plateau épais : 6 cm sous le mot, posé au même endroit', () => {
    const apt = buildApartment(), { top, hit } = probes(apt)
    const upper = top(9.2, 3.1), under = 0.2 + hit([9.2, 0.2, 3.1], [0, 1, 0], 0.5)
    expect(upper).toBeCloseTo(0.4, 2)                           // le mot reste posé à 40,5 cm
    expect(upper - under).toBeGreaterThanOrEqual(0.055)
    apt.dispose()
  })

  it('la console de l\'entrée a un vrai tiroir : façade entourée d\'un jour fin, un bouton pour l\'ouvrir', () => {
    const apt = buildApartment(), { hit } = probes(apt)
    // coupe verticale de la façade au milieu du tiroir (z = 6,35) : x touché par un rayon tiré vers le mur
    const xs = range(0.66, 0.8, 0.0005).map(y => 5.2 - hit([5.2, y, 6.35], [-1, 0, 0], 1))
    const front = [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]   // le plan de la façade (médiane)
    // jours : suites de points en retrait d'au moins 4 mm, hautes d'au plus 6 mm, profondes d'au plus 5 cm
    const grooves = []
    let start = -1
    xs.forEach((x, i) => {
      const inGroove = x < front - 0.004
      if (inGroove && start < 0) start = i
      if ((!inGroove || i === xs.length - 1) && start >= 0) { grooves.push(xs.slice(start, inGroove ? i + 1 : i)); start = -1 }
    })
    const fine = grooves.filter(g => g.length * 0.0005 <= 0.006 && front - Math.min(...g) <= 0.05)
    expect(fine.length, `jours : ${grooves.map(g => `${g.length * 0.5} mm de haut, ${r3(front - Math.min(...g))} m de fond`).join(' ; ')}`).toBeGreaterThanOrEqual(2)
    expect(5.2 - hit([5.2, 0.735, 6.35], [-1, 0, 0], 1) - front, 'bouton').toBeGreaterThanOrEqual(0.015)
    apt.dispose()
  })

  it('l\'étagère : des livres de hauteurs et de couleurs variées, et une pile de livres couchés', () => {
    const apt = buildApartment(), { first } = probes(apt)
    const heights = new Set(), colors = new Set(), stacks = []
    for (const s of [0.045, 0.515, 0.965, 1.415]) {   // dessus des planches ; rayons tirés sous la planche du dessus
      const hs = range(10.56, 11.84, 0.005).map(x => {
        const h = first([x, s + 0.4, 6.8], [0, -1, 0], 0.5)
        if (!h) return 0
        const c = h.object.geometry.attributes.color
        if (h.object.material.name === 'livres' && c) colors.add(new THREE.Color(c.getX(h.face.a), c.getY(h.face.a), c.getZ(h.face.a)).getHexString())
        return s + 0.4 - h.distance - s
      })
      for (const h of hs) if (h > 0.17) heights.add(Math.round(h * 100))
      stacks.push(Math.max(0, ...runs(hs, h => h >= 0.03 && h <= 0.16)) * 0.005)
    }
    expect(heights.size, 'hauteurs de livres debout (au cm)').toBeGreaterThanOrEqual(6)
    expect(colors.size, 'couleurs de livres').toBeGreaterThanOrEqual(12)
    expect(Math.max(...stacks), 'pile de livres couchés (largeur, m)').toBeGreaterThanOrEqual(0.12)
    apt.dispose()
  })

  it('le lit de la petite : une couette moelleuse qui tombe sur les côtés, un oreiller bombé', () => {
    const apt = buildApartment(), { top, hit } = probes(apt), bad = []
    const mid = top(2.3, 2.0, 1.0)
    for (const x of [1.9, 2.7]) { const e = top(x, 2.0, 1.0); if (!(mid - e >= 0.012 && mid - e <= 0.08)) bad.push(`couette : milieu ${r3(mid)}, en x = ${x} ${r3(e)}`) }
    const side = 1.5 + hit([1.5, 0.3, 2.0], [1, 0, 0], 1)
    if (!(side <= 1.83)) bad.push(`couette : rien ne tombe sur le côté avant x = ${r3(side)}`)
    const p = top(2.3, 1.13, 1.0)
    for (const x of [2.06, 2.54]) { const e = top(x, 1.13, 1.0); if (!(p - e >= 0.015 && p - e <= 0.1)) bad.push(`oreiller : milieu ${r3(p)}, en x = ${x} ${r3(e)}`) }
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('les tapis ont des bords souples : un ourlet roulé sur les longs côtés, des franges aux petits côtés', () => {
    const apt = buildApartment(), { top } = probes(apt), bad = []
    // franges : à 1 cm du petit côté, une suite serrée de brins posés au sol, séparés par des jours (au moins un brin
    // tous les 2 cm ; un brin tous les 6 cm se lisait comme les graduations d'une règle)
    const FRINGES = [
      ['salon, côté arche', 7.99, 2.25, 4.55], ['salon, côté fenêtre', 11.21, 2.25, 4.1],
      ['couloir, côté fond', 1.19, 4.82, 5.48], ['couloir, côté entrée', 4.21, 4.82, 5.48],
    ]
    for (const [lieu, x, z0, z1] of FRINGES) {
      const strands = runs(range(z0, z1, 0.002).map(z => top(x, z, 0.05)), h => h > 0.0008).length
      if (strands < (z1 - z0) / 0.02) bad.push(`franges, ${lieu} : ${strands} brins sur ${r3(z1 - z0)} m`)
    }
    // ourlet : à 2 mm du long côté, le bord roulé dépasse le champ du tapis
    for (const [lieu, x, z, zIn] of [['salon, côté canapé', 9.4, 2.202, 2.6], ['salon, côté arche', 9.0, 4.598, 4.3], ['couloir', 3.6, 4.802, 5.15]]) {
      const edge = top(x, z, 0.05), field = top(x, zIn, 0.05)
      if (!(edge - field >= 0.0015 && edge < 0.02)) bad.push(`ourlet, ${lieu} : bord ${r3(edge)}, champ ${r3(field)}`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  it('des objets de famille : le manteau de la petite à la patère de l\'entrée, une plante, des images aux murs', () => {
    const apt = buildApartment(), { top, proud, first } = probes(apt), bad = []
    if (!(proud(5.05, 1.64, 4.56, 0, 1) >= 0.015)) bad.push('patère de l\'entrée')
    if (!(proud(4.85, 1.3, 4.56, 0, 1) >= 0.04)) bad.push('manteau à la patère')
    // la plante, entre le canapé et le fauteuil, contre le mur : on la voit de tout le salon (derrière le fauteuil, dans
    // l'angle de la fenêtre, seules deux pointes de feuilles en dépassaient)
    let plant = 0
    for (const dx of range(-0.1, 0.1, 0.025)) for (const dz of range(-0.1, 0.1, 0.025)) plant = Math.max(plant, top(10.85 + dx, 1.32 + dz, 1.5))
    if (!(plant >= 0.6)) bad.push(`plante du salon : ${r3(plant)} m`)
    // les images : un cadre sur le mur, et ce qu'on voit au milieu est une image (une carte de texture)
    const PICTURES = [
      ['salon, au-dessus du canapé, à gauche', [8.9, 1.52, 1.26], [0, 0, -1], 1.06],
      ['salon, au-dessus du canapé, à droite', [9.9, 1.52, 1.26], [0, 0, -1], 1.06],
      ['couloir', [3.3, 1.55, 5.3], [0, 0, 1], 5.74],
      ['chambre, le dessin', [4.2, 1.3, 2.2], [1, 0, 0], 4.44],
    ]
    for (const [lieu, o, d, wall] of PICTURES) {
      const h = first(o, d, 1)
      const off = h ? Math.abs(wall - (d[0] ? h.point.x : h.point.z)) : NaN
      if (!h || !h.object.material.map || !(off >= 0.003 && off <= 0.06)) bad.push(`${lieu} : ${h ? `${h.object.material.name}, à ${r3(off)} m du mur` : 'rien'}`)
    }
    expect(bad).toEqual([])
    apt.dispose()
  })

  // l'écharpe de la petite, pendue à la patère de l'entrée (crochet en x = 5,25, mur en z = 4,56) : deux plaques planes
  // de 13 cm, aussi larges en haut qu'en bas, se lisaient comme deux planches, presque un rideau (relecture de N4)
  it('l\'écharpe de la petite pend comme un tissu : des plis sur sa largeur, ramassée au crochet, des franges au bout', () => {
    const apt = buildApartment(), { first } = probes(apt), bad = []
    const RED = new THREE.Color(0x9a3440)
    // profondeur (z) de l'écharpe vue de face, depuis l'entrée ; null si le rayon touche autre chose
    const scarfZ = (x, y) => {
      const h = first([x, y, 5.0], [0, 0, -1], 1)
      const c = h && h.object.material.name === 'livres' && h.object.geometry.attributes.color
      if (!c) return null
      const i = h.face.a
      return Math.abs(c.getX(i) - RED.r) + Math.abs(c.getY(i) - RED.g) + Math.abs(c.getZ(i) - RED.b) < 0.01 ? h.point.z : null
    }
    const xs = range(5.05, 5.5, 0.002)
    // suites de points de l'écharpe sans saut de plus de 3 mm (un pan, ou ce qu'on en voit)
    const pieces = zs => {
      const out = []; let cur = []
      zs.forEach((z, i) => {
        if (z !== null && cur.length && Math.abs(z - cur[cur.length - 1].z) < 0.003) cur.push({ x: xs[i], z })
        else { if (cur.length) out.push(cur); cur = z === null ? [] : [{ x: xs[i], z }] }
      })
      if (cur.length) out.push(cur)
      return out
    }
    // plis : sur la largeur, la surface monte et descend ; une plaque plane, arrondie aux bords, change de pente une fois
    for (const y of [1.25, 1.35, 1.45]) {
      let turns = 0
      for (const p of pieces(xs.map(x => scarfZ(x, y)))) {
        if (p.length < 15) continue
        let last = 0
        for (let i = 1; i < p.length; i++) {
          const dz = p[i].z - p[i - 1].z, s = Math.abs(dz) > 0.00015 ? Math.sign(dz) : 0
          if (s && last && s !== last) turns++
          if (s) last = s
        }
      }
      if (turns < 2) bad.push(`plis en y = ${y} : ${turns} changement(s) de pente`)
    }
    // ramassée au crochet : juste sous la patère, bien plus étroite qu'en bas
    const width = y => { const on = xs.filter(x => scarfZ(x, y) !== null); return on.length ? on[on.length - 1] - on[0] : 0 }
    const top = width(1.58), low = width(1.25)
    if (!(low > 0.1 && top <= 0.6 * low)) bad.push(`largeur sous le crochet ${r3(top)}, en bas ${r3(low)}`)
    // franges : sous le bout d'un pan, au moins quatre brins séparés, de 12 mm de large au plus
    let strands = 0
    for (const y of range(0.95, 1.25, 0.01)) {
      const runsHere = pieces(xs.map(x => scarfZ(x, y)))
      if (runsHere.every(p => p[p.length - 1].x - p[0].x <= 0.012)) strands = Math.max(strands, runsHere.length)
    }
    if (strands < 4) bad.push(`franges : ${strands} brin(s)`)
    expect(bad).toEqual([])
    apt.dispose()
  })
})
