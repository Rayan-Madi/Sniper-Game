import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { creerSalle, OBJETS_VISABLES } from '../../src/bar/salle.js'
import { BOITES, SIEGES, PLACES, dansZone } from '../../src/bar/plan.js'
import { DECOR } from '../../src/bar/reglages.js'
import { createInteract } from '../../src/prologue/interact.js'
import { trackDisposals, createFakeRenderer } from '../gfx/fakeRenderer.js'
import { withSeed } from '../../src/gfx/memtest.js'

// La salle du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.1, §8, §9 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B9). Chaque test de comportement a été vu rouge sur le témoin
// écrit à côté de son assertion, glissé seul dans la salle finie.

const R = 0.28   // emprise de Viktor au sol (moveCircle)
const PERSONNES = new Set([...SIEGES.filter(s => s.occupant).map(s => s.occupant), 'ouvrier-1', 'ouvrier-2'])
const dans = (p, b) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ
const chevauche = (p, b, r) => p.x + r > b.minX + 1e-6 && p.x - r < b.maxX - 1e-6 && p.z + r > b.minZ + 1e-6 && p.z - r < b.maxZ - 1e-6

// Le premier objet opaque et visible du décor sur le rayon (les lueurs, la vitre et les verres, transparents, ne
// comptent pas : ils n'arrêtent ni le regard ni le pas)
function impact(salle, [x, y, z], [dx, dy, dz]) {
  const opaques = []
  salle.group.updateMatrixWorld(true)
  salle.group.traverseVisible(o => { if (o.isMesh && !o.material.transparent) opaques.push(o) })
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, dz).normalize())
  return ray.intersectObjects(opaques, false)[0] || null
}
const hauteurSous = (salle, x, z, depuis = 2.9) => { const h = impact(salle, [x, depuis, z], [0, -1, 0]); return h ? h.point.y : -Infinity }

function texturesDe(group) {
  const set = new Set()
  group.traverse(o => { for (const m of [].concat(o.material || [])) for (const k in m) if (m[k] && m[k].isTexture) set.add(m[k]) })
  return [...set]
}

describe('la salle du Bivouac : budget', () => {
  // spec §8 : décor seul, au plus 80 maillages et 60 000 triangles, fusionné par matériau (createBatcher)
  it('tient le budget du décor : au plus 80 maillages et 60 000 triangles', () => {
    const salle = creerSalle()
    const { drawables, triangles } = salle.stats()
    expect(drawables).toBeGreaterThan(10)
    expect(drawables).toBeLessThanOrEqual(80)                                // témoin : une boîte par meuble
    expect(triangles).toBeGreaterThan(5000)
    expect(triangles).toBeLessThanOrEqual(60000)
    salle.dispose()
  })

  it('aucun InstancedMesh (non traité par gfx/dispose.js) ni maillage animé', () => {
    const salle = creerSalle()
    salle.group.traverse(o => {
      expect(o.isInstancedMesh, o.name).not.toBe(true)                      // témoin : les bouteilles en InstancedMesh
      expect(o.isSkinnedMesh, o.name).not.toBe(true)
    })
    salle.dispose()
  })

  it('textures dessinées en canvas : 5 Mpx au plus en tout', () => {
    const salle = creerSalle()
    const px = texturesDe(salle.group).reduce((s, t) => s + t.image.width * t.image.height, 0)
    expect(px).toBeGreaterThan(0)
    expect(px / 1e6).toBeLessThanOrEqual(5)                                 // témoin : une planche de 2048 × 2048 de plus
    salle.dispose()
  })
})

describe('la salle du Bivouac : lumière', () => {
  it('une seule lumière projette : le soleil à travers les stores, carte de 1024²', () => {
    const salle = creerSalle()
    const casters = [], points = [], hemis = [], autres = []
    salle.group.traverse(o => {
      if (!o.isLight) return
      if (o.castShadow) casters.push(o)
      if (o.isPointLight) points.push(o)
      else if (o.isHemisphereLight) hemis.push(o)
      else if (!o.isSpotLight) autres.push(o)
    })
    expect(casters).toEqual([salle.lumieres.soleil])                         // témoin : le néon qui projette aussi
    expect(salle.lumieres.soleil.isSpotLight).toBe(true)
    expect(salle.lumieres.soleil.shadow.mapSize.toArray()).toEqual([1024, 1024])
    expect(points.length).toBeGreaterThan(0)
    expect(points.length).toBeLessThanOrEqual(4)                            // témoin : une PointLight par lampe (5)
    expect(hemis.length).toBe(1)
    expect(autres).toEqual([])
    salle.dispose()
  })

  it('le brouillard de la salle : Fog(0x1a120c, 7, 22)', () => {
    const salle = creerSalle()
    expect(salle.brouillard.isFog).toBe(true)
    expect(salle.brouillard.color.getHex()).toBe(0x1a120c)
    expect([salle.brouillard.near, salle.brouillard.far]).toEqual([7, 22])
    expect(DECOR.brouillard).toEqual({ couleur: 0x1a120c, pres: 7, loin: 22 })
    salle.dispose()
  })

  it('les stores projettent leurs lames, le soleil vient de la vitrine (sud) et tombe bas', () => {
    const salle = creerSalle()
    const s = salle.lumieres.soleil
    expect(s.position.z).toBeGreaterThan(4.5)                                // dehors, derrière la vitrine
    const d = s.target.position.clone().sub(s.position).normalize()
    const elevation = Math.asin(-d.y) * 180 / Math.PI
    expect(elevation).toBeGreaterThan(8); expect(elevation).toBeLessThan(30) // soleil bas, de 18 h
    const lames = []
    salle.group.traverse(o => { if (o.isMesh && o.material.name === 'stores') lames.push(o) })
    expect(lames.length).toBe(1)
    expect(lames[0].castShadow).toBe(true)                                   // témoin : stores sans ombre portée
    salle.dispose()
  })
})

describe('la salle du Bivouac : ce qu\'on voit est ce qui arrête', () => {
  it('les collisions sont les boîtes du plan', () => {
    const salle = creerSalle()
    expect(salle.collisions).toBe(BOITES)
    salle.dispose()
  })

  it('les murs, les cloisons et les portes fermées sont dessinés sur leurs boîtes', () => {
    const salle = creerSalle()
    const rayons = [
      ['mur est', [0, 1.6, 0], [1, 0, 0], 'x', 6],
      ['mur nord', [0.5, 1.6, 0], [0, 0, -1], 'z', -4.5],
      ['mur ouest, au nord de la cuisine', [0, 1.6, -3.3], [-1, 0, 0], 'x', -6],
      // l'enduit nu, entre l'ardoise (x de -3,17 à -2,53) et le juke-box (x de -1,95 à -1,25) : en x = -2,8, le
      // rayon touchait le panneau de l'ardoise, à 2,5 cm du mur, et passait encore l'enduit reculé de 10 cm
      // (témoin de la boîte décalée, relecture de B9)
      ['mur sud plein', [-2.0, 1.6, 0], [0, 0, 1], 'z', 4.5, 'enduit'],
      ['allège de la vitrine', [2.6, 0.5, 2.0], [0, 0, 1], 'z', 4.5],
      ['porte d\'entrée', [3.5, 1.0, 3.0], [0, 0, 1], 'z', 4.5],
      ['réserve, face est', [-2.5, 1.6, 3.5], [-1, 0, 0], 'x', -3.8],
      ['réserve, face nord', [-5.0, 1.6, 0], [0, 0, 1], 'z', 2.5],
      ['cloison ouest du couloir', [-2.0, 1.6, -6], [-1, 0, 0], 'x', -2.6],
      ['cloison est du couloir', [-2.0, 1.6, -6], [1, 0, 0], 'x', -1.4],
      ['porte du WC', [-2.0, 1.6, -5], [0, 0, -1], 'z', -7.5],
    ]
    for (const [nom, o, d, axe, attendu, matiere] of rayons) {
      const h = impact(salle, o, d)
      expect(h, nom).not.toBeNull()
      expect(Math.abs(h.point[axe] - attendu), `${nom} : ${h && h.point[axe]}`).toBeLessThan(0.05)   // témoin : boîte décalée
      if (matiere) expect(h.object.material.name, nom).toBe(matiere)          // témoin : le rayon en x = -2,8, qui touche l'ardoise
    }
    salle.dispose()
  })

  // un meuble tient dans sa boîte : dedans, à 0,1 m de chaque bord, on tombe sur lui ; dehors, au-delà de l'emprise de
  // Viktor (0,3 m), sur le sol, sauf là où se trouve une autre boîte ou une chaise
  it('chaque meuble est dessiné dans sa boîte du plan', () => {
    const salle = creerSalle()
    const meubles = BOITES.filter(b => b.son === 'meuble' && !PERSONNES.has(b.id))
    expect(meubles.map(b => b.id)).toEqual(expect.arrayContaining(['zinc', 'etageres', 'table-A', 'table-B', 'table-C', 'table-D',
      'mange-debout-est', 'mange-debout-porte', 'jukebox', 'babyfoot', 'banquette-A']))
    const pres = p => SIEGES.some(s => Math.hypot(s.x - p.x, s.z - p.z) < 0.34)
    const bad = []
    for (const b of meubles) {
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2
      for (const [x, z] of [[cx, cz], [b.minX + 0.1, cz], [b.maxX - 0.1, cz], [cx, b.minZ + 0.1], [cx, b.maxZ - 0.1]]) {
        if (hauteurSous(salle, x, z) < 0.3) bad.push(`${b.id} : rien en (${x.toFixed(2)} ; ${z.toFixed(2)})`)   // témoin : boîte décalée
      }
      for (const [x, z] of [[b.minX - 0.3, cz], [b.maxX + 0.3, cz], [cx, b.minZ - 0.3], [cx, b.maxZ + 0.3]]) {
        const p = { x, z }
        if (BOITES.some(o => dans(p, o)) || pres(p)) continue
        const y = hauteurSous(salle, x, z)
        if (y > 0.05) bad.push(`${b.id} : déborde en (${x.toFixed(2)} ; ${z.toFixed(2)}), y = ${y.toFixed(2)}`)
      }
    }
    expect(bad).toEqual([])
    salle.dispose()
  })

  it('chaque siège du plan est dessiné à sa hauteur : chaise 0,45 m, tabouret 0,75 m', () => {
    const salle = creerSalle()
    for (const s of SIEGES) {
      const y = hauteurSous(salle, s.x, s.z, 1.3)
      expect(Math.abs(y - s.hauteur), `${s.id} : ${y.toFixed(3)}`).toBeLessThan(0.03)   // témoin : tabourets à la hauteur des chaises
    }
    salle.dispose()
  })

  // B10 : Dussart s'assoit sur la banquette (A-sud) ; le décor y garde la banquette seule, son assise à 0,45 m
  it('aucune chaise sur la banquette : le siège de Dussart est son assise', () => {
    const salle = creerSalle()
    const s = SIEGES.find(x => x.banquette)
    expect(s.id).toBe('A-sud')
    expect(Math.abs(hauteurSous(salle, s.x, s.z, 1.3) - 0.45)).toBeLessThan(0.03)
    // derrière lui, là où serait le dossier d'une chaise (0,2 m, jusqu'à 0,85 m), l'assise de la banquette seule
    expect(hauteurSous(salle, s.x, s.z + 0.2, 1.3)).toBeLessThan(0.5)        // témoin : une chaise posée sur la banquette
    salle.dispose()
  })

  it('la porte de l\'arrière-cuisine est entrouverte, sur son pivot, du côté de la cuisine', () => {
    const salle = creerSalle()
    const p = salle.porteCuisine
    expect(p.isObject3D).toBe(true)
    const a = Math.abs(p.rotation.y)
    expect(a).toBeGreaterThan(0.2); expect(a).toBeLessThan(1.2)
    const b = new THREE.Box3().setFromObject(p)
    expect(b.max.x).toBeLessThanOrEqual(-5.99)                                 // elle s'ouvre vers la cuisine, pas dans la salle
    salle.dispose()
  })
})

describe('la salle du Bivouac : ce qu\'on vise', () => {
  const capsules = salle => new Map(salle.cibles.map(c => [c.userData.barId, c]))

  it('une capsule invisible par siège libre, par objet à examiner et au mange-debout est ; aucun maillage animé', () => {
    const salle = creerSalle()
    const c = capsules(salle)
    expect(c.size).toBe(salle.cibles.length)                                // identifiants uniques
    const libres = SIEGES.filter(s => !s.occupant)
    for (const s of libres) {
      const k = c.get(s.id)
      expect(k, s.id).toBeDefined()
      expect(Math.hypot(k.position.x - s.x, k.position.z - s.z), s.id).toBeLessThan(0.05)
      expect(k.userData.type).toBe('siege')
    }
    for (const s of SIEGES.filter(x => x.occupant)) expect(c.has(s.id), s.id).toBe(false)
    expect(OBJETS_VISABLES).toEqual(['photo', 'journal', 'fenetre', 'jukebox', 'cible', 'porte', 'wc'])
    for (const id of OBJETS_VISABLES) expect(c.get(id), id).toBeDefined()
    expect(c.get('mangeDeboutEst').userData).toMatchObject({ type: 'place', pretexte: PLACES.mangeDeboutEst.pretexte })
    for (const k of salle.cibles) {
      expect(k.visible, k.userData.barId).toBe(false)                        // témoin : capsules visibles
      k.traverse(o => expect(o.isSkinnedMesh).not.toBe(true))
    }
    salle.dispose()
  })

  it('les occultants sont les murs, cloisons et portes du plan, invisibles', () => {
    const salle = creerSalle()
    const opaques = BOITES.filter(b => b.son !== 'meuble')
    expect(salle.occultants.length).toBe(opaques.length)
    for (const o of salle.occultants) {
      const b = opaques.find(x => x.id === o.userData.boite)
      expect(b, o.userData.boite).toBeDefined()
      expect(o.visible).toBe(false)
      const bb = new THREE.Box3().setFromObject(o)
      expect([bb.min.x, bb.max.x, bb.min.z, bb.max.z].map(v => +v.toFixed(6))).toEqual([b.minX, b.maxX, b.minZ, b.maxZ])
      expect(bb.min.y).toBeLessThanOrEqual(0); expect(bb.max.y).toBeGreaterThanOrEqual(3)
    }
    salle.dispose()
  })

  // Chaque cible se vise (centre de l'écran, 2,2 m) depuis un point où Viktor tient debout, hors de la zone interdite,
  // sans qu'un mur ou une porte ne l'arrête (createInteract, clé barId)
  it('chaque objet, chaque siège libre et le mange-debout se visent depuis un point où Viktor tient', () => {
    const salle = creerSalle()
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 40)
    const interact = createInteract({ camera, targets: salle.cibles, occluders: salle.occultants, cle: 'barId' })
    const centre = new THREE.Vector3(), introuvables = []
    salle.group.updateMatrixWorld(true)
    for (const k of salle.cibles) {
      const id = k.userData.barId
      k.getWorldPosition(centre)
      let vu = false
      for (let i = -20; i <= 20 && !vu; i++) for (let j = -20; j <= 20 && !vu; j++) {
        const p = { x: centre.x + i * 0.1, z: centre.z + j * 0.1 }
        if (BOITES.some(b => chevauche(p, b, R)) || dansZone('interdite', p)) continue
        camera.position.set(p.x, 1.65, p.z); camera.lookAt(centre)
        if (interact.update() === id) vu = true
      }
      if (!vu) introuvables.push(id)                                          // témoin : la photo derrière le mur nord
    }
    expect(introuvables).toEqual([])
    salle.dispose()
  })
})

describe('la salle du Bivouac : ce qui bouge', () => {
  // Échantillons d'un élément lumineux (néon au O mort, télé) : un « clignotement » commence par un allumage, une hausse
  // de plus de 20 % d'une image à la suivante ; sauts compte aussi les baisses (en atténué, rien ne doit bouger)
  const allumages = valeurs => valeurs.slice(1).filter((v, i) => v - valeurs[i] > 0.2 * Math.max(Math.abs(valeurs[i]), 1e-3)).length
  const sauts = valeurs => valeurs.slice(1).filter((v, i) => Math.abs(v - valeurs[i]) > 0.2 * Math.max(Math.abs(valeurs[i]), 1e-3)).length
  const relever = (salle, secondes, lire) => { const v = []; for (let i = 0; i < secondes * 60; i++) { salle.update(1 / 60); v.push(lire()) } return v }
  const materiau = (salle, nom) => { let m = null; salle.group.traverse(o => { if (o.material && o.material.name === nom) m = o.material }); return m }

  it('le néon et la télé ne clignotent jamais plus de 3 fois par seconde', () => {
    const salle = creerSalle()
    const o = materiau(salle, 'neonO'), ecran = materiau(salle, 'teleEcran')
    expect(o).not.toBeNull(); expect(ecran).not.toBeNull()
    const lectures = { neon: () => o.color.r, ecran: () => ecran.color.r, lumiere: () => salle.lumieres.tele.intensity }
    let total = 0
    for (let s = 0; s < 90; s++) {
      const sec = Object.fromEntries(Object.entries(lectures).map(([k, f]) => [k, relever(salle, 1, f)]))
      for (const [k, v] of Object.entries(sec)) { const n = allumages(v); total += n; expect(n, `${k}, seconde ${s}`).toBeLessThanOrEqual(3) }   // témoin : grésillement du néon de l'appartement
    }
    expect(total).toBeGreaterThan(0)                                         // ils vivent : ce n'est pas un décor figé
    salle.dispose()
  })

  // La garde du §9 tient d'elle-même, sur toute fenêtre d'une seconde, et pas seulement parce qu'une salve compte au
  // plus 3 éclats (relecture de B9)
  it('deux allumages du O mort sont toujours séparés de plus de 1/3 s', () => {
    const salle = creerSalle()
    const o = materiau(salle, 'neonO')
    const v = relever(salle, 300, () => o.color.r)
    const debuts = []
    v.slice(1).forEach((x, i) => { if (x - v[i] > 0.2 * Math.max(Math.abs(v[i]), 1e-3)) debuts.push((i + 1) / 60) })
    expect(debuts.length).toBeGreaterThan(20)
    const ecarts = debuts.slice(1).map((t, i) => t - debuts[i])
    expect(Math.min(...ecarts)).toBeGreaterThan(1 / 3)                      // témoin : DECOR.neon.entreS à [0.28, 0.45]
    salle.dispose()
  })

  it('effets atténués : néon, télé (course du tiercé comprise) et sa lumière fixes', () => {
    const salle = creerSalle({ attenue: true })
    const o = materiau(salle, 'neonO'), ecran = materiau(salle, 'teleEcran')
    const course = ecran.map.offset.x
    for (const f of [() => o.color.r, () => ecran.color.r, () => salle.lumieres.tele.intensity]) {
      expect(sauts(relever(salle, 30, f))).toBe(0)                          // témoin : attenue ignoré
    }
    expect(ecran.map.offset.x).toBe(course)                                  // témoin : la course défile en atténué
    salle.dispose()
  })

  // three tire les uuid de ses objets par Math.random : le décor, lui, ne doit rien lui devoir (aucun module de src/bar/
  // n'appelle Math.random, tests/bar/son.test.js le vérifie dans le source). Deux montages sous deux graines de
  // Math.random (withSeed de src/gfx/memtest.js) donnent la même géométrie et les mêmes clignotements.
  it('le hasard du décor est à graine : sous deux Math.random différents, la même salle, au montage et en jeu', () => {
    const empreinte = s => {
      const e = []
      s.group.traverse(o => {
        if (!o.isMesh) return
        const p = o.geometry.attributes.position
        let t = 0; for (let i = 0; i < p.count; i += 5) t += p.getX(i) * 3 + p.getY(i) * 5 + p.getZ(i) * 7
        e.push(`${o.name}:${o.material.name}:${p.count}:${t.toFixed(5)}`)
      })
      return e
    }
    const jouer = s => { const v = []; for (let i = 0; i < 1500; i++) { s.update(1 / 60); v.push(materiau(s, 'neonO').color.r, materiau(s, 'teleEcran').color.r) } return v }
    let a, b, ja, jb
    withSeed(1, () => { a = creerSalle(); ja = jouer(a) })
    withSeed(2, () => { b = creerSalle(); jb = jouer(b) })
    expect(empreinte(a)).toEqual(empreinte(b))
    expect(ja).toEqual(jb)                                                   // témoin : néon tiré par Math.random (apartment.js)
    expect(new Set(ja).size).toBeGreaterThan(2)                              // ils ont bougé pendant ces 25 s
    a.dispose(); b.dispose()
  })

  it('update ne renvoie aucune texture au GPU (la course de la télé défile par décalage)', () => {
    const salle = creerSalle()
    const versions = () => texturesDe(salle.group).map(t => t.version)
    const avant = versions()
    const ecran = materiau(salle, 'teleEcran')
    const decalage = ecran.map.offset.x
    for (let i = 0; i < 120; i++) salle.update(1 / 60)
    expect(versions()).toEqual(avant)                                        // témoin : canvas de la télé redessiné à chaque image
    expect(ecran.map.offset.x).not.toBe(decalage)
    salle.dispose()
  })

  it('le ventilateur tourne au temps de jeu', () => {
    const salle = creerSalle()
    const v = salle.ventilateur, a0 = v.rotation.y
    salle.update(0.5)
    expect(v.rotation.y).not.toBe(a0)
    salle.dispose()
  })

  // Rien n'avance hors de update(dt) : ni au rendu (le vrai renderer appelle onBeforeRender sur chaque objet dessiné),
  // ni par stats() ou setWcOccupe(). Sinon la salle bougerait encore en pause (relecture de B9).
  it('rien ne bouge sans update : ni au rendu, ni par stats() ou setWcOccupe()', () => {
    const salle = creerSalle(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera()
    scene.add(salle.group)
    const renderer = createFakeRenderer(), ecran = materiau(salle, 'teleEcran')
    const etat = () => [salle.ventilateur.rotation.y, materiau(salle, 'neonO').color.r, ecran.color.r, ecran.map.offset.x,
      salle.lumieres.tele.intensity]
    salle.update(1 / 60)
    const avant = etat()
    for (let i = 0; i < 120; i++) {
      renderer.render(scene)
      scene.traverseVisible(o => o.onBeforeRender(null, scene, camera, o.geometry, o.material, null))
      salle.stats(); salle.setWcOccupe(i % 2 === 0)
    }
    expect(etat()).toEqual(avant)                                            // témoin : le ventilateur tourné à chaque rendu (onBeforeRender)
    salle.dispose()
  })

  it('la porte du WC dit OCCUPÉ ou LIBRE, sans rien allouer', () => {
    const salle = creerSalle()
    const m = materiau(salle, 'voyantWc')
    expect(m).not.toBeNull()
    const occupe = m.map.offset.y
    salle.setWcOccupe(false)
    const libre = m.map.offset.y
    expect(libre).not.toBe(occupe)
    salle.setWcOccupe(true)
    expect(m.map.offset.y).toBe(occupe)
    salle.dispose()
  })
})

describe('la salle du Bivouac : libération', () => {
  it('dispose libère tout ce que la salle possède, une seule fois, carte d\'ombre comprise', () => {
    const salle = creerSalle()
    const suivi = trackDisposals(salle.group)
    expect(suivi.owned()).toBeGreaterThan(30)
    const ombre = vi.spyOn(salle.lumieres.soleil.shadow, 'dispose')
    salle.dispose()
    expect(suivi.leaks()).toEqual([])                                        // témoin : textures canvas non libérées
    expect(suivi.freedTwice()).toEqual([])
    expect(suivi.shared()).toBe(0)                                           // rien de partagé : aucun modèle GLB
    expect(ombre).toHaveBeenCalled()
    expect(salle.group.children.length).toBe(0)
    salle.dispose()                                                          // une seconde fois : rien
    expect(suivi.freedTwice()).toEqual([])
  })

  // la mesure du memtest (spec §8, « Δ géométries et textures = 0 sur 10 montages »), sur le faux renderer comptable :
  // il compte une ressource à son premier dessin et la décompte à son 'dispose', comme le vrai
  it('dix montages, chacun dessiné puis libéré : le renderer revient à zéro géométrie et zéro texture', () => {
    const renderer = createFakeRenderer()
    const vus = []
    for (let i = 0; i < 10; i++) {
      const scene = new THREE.Scene(), salle = creerSalle()
      scene.add(salle.group)
      renderer.render(scene)
      vus.push(renderer.info())
      salle.update(1 / 60); renderer.render(scene)
      salle.dispose(); scene.remove(salle.group)
      expect(renderer.info(), `montage ${i + 1}`).toEqual({ geometries: 0, textures: 0 })   // témoin : textures canvas non libérées
    }
    expect(vus[0].geometries).toBeGreaterThan(20); expect(vus[0].textures).toBeGreaterThan(5)
    expect(vus.every(v => v.geometries === vus[0].geometries && v.textures === vus[0].textures)).toBe(true)
  })
})
