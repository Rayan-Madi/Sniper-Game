import { describe, it, expect, afterEach } from 'vitest'
import * as THREE from 'three'
import * as B from '../../src/shot/balle.js'
import * as occ from '../../src/shot/occlusion.js'
import { npcHit } from '../../src/shot/hitzones.js'
import { state as amelioration } from '../../src/upgrades.js'

// La balle en vol (spec du lot 3, §2 c, approche B ; plan du lot 3a, tâche A4) : partie de l'œil le long de la visée,
// relevée pour croiser la ligne de visée à la distance de réglage de la lunette, elle suit p(t) = o + v0·u·t + ½·g·t²
// (sans traînée). À chaque image, main.js fait avancer les PNJ, puis le segment que la balle a parcouru est cherché
// contre le décor solide et les zones des PNJ à leur pose du moment ; le temps de l'impact est interpolé dans le
// segment. Le tir est simulé ici comme la boucle de main.js le mène : des images de dt, les PNJ d'abord.
//
// Témoin : le tir de main.js d'avant la tâche, extrait tel quel dans src/shot/balle.js (rayon droit pris au coup,
// résolu au bout de getStats().bulletDelay, 0,45 s sans Vélocité, contre ce qu'il y a sur le rayon à cet instant).
// Sans impactSurSegment (src/shot/occlusion.js), le monde est cherché comme le faisait main.js (firstHit : npcHit,
// solidHit, resolveImpact sur le rayon sans fin). Vus rouges sur ce témoin (18 rouges) : temps de vol, chute, muret,
// temps de l'impact, cible menée, balle perdue, vitre traversée, prévision du sillage (absente). Restent verts, comme
// voulu, les deux contre-épreuves (muret à 10 cm, cible visée là où elle était). Témoins par mutation du module de la
// tâche : l'instant de l'impact pris à la fin de son segment au lieu d'être interpolé (10 rouges : jusqu'à 16 ms
// d'écart à 60 i/s, 11 ms à 31 m), une prévision qui rend toujours 0,6 s (1 rouge).

const V0 = 800, G = 9.81
const OEIL = new THREE.Vector3(0, 10, 0)
const DEVANT = new THREE.Vector3(0, 0, -1)

// Ce que main.js cherche sur un segment : impactSurSegment ; avant la tâche, firstHit sur le rayon du coup, sans fin.
const toucher = monde => seg => {
  if (occ.impactSurSegment) return occ.impactSurSegment({ ...seg, ...monde })
  const npc = npcHit(seg.ray, monde.npcs || [])
  const r = occ.resolveImpact({ ray: seg.ray, npcHits: npc ? [npc] : [], decorHit: occ.solidHit(seg.ray, monde.objets || [], monde.boites || []) })
  return { impact: r.kind === 'rien' ? null : r, traversees: [] }
}

// Le tir mené comme la boucle de main.js : des images de dt après le coup ; à chaque image, le monde bouge d'abord
// (chaqueImage(t) : les PNJ), puis la balle avance jusqu'au temps de la mission. → l'arrivée, ou null après tMax.
function voler(balle, monde = {}, { dt = 1 / 60, tTir = 0, chaqueImage = null, tMax = 2 } = {}) {
  for (let i = 1; i * dt <= tMax + 1e-9; i++) {
    const t = tTir + i * dt
    chaqueImage?.(t - tTir)
    const r = B.avancerBalle(balle, t, toucher(monde))
    if (r) return r
  }
  return null
}
const tirer = ({ zero = null, v0 = V0, origine = OEIL, dir = DEVANT, tTir = 0 } = {}) =>
  B.lancerBalle({ origine, dir: dir.clone().normalize(), v0, g: G, zero, tTir })

// Calcul analytique, indépendant du module : angle de réglage d'un tir à l'horizontale, position sur la trajectoire.
const angle = (zero, v0 = V0) => (zero ? 0.5 * Math.asin(G * zero / (v0 * v0)) : 0)
function attendu(t, { zero = null, v0 = V0, origine = OEIL, dir = DEVANT } = {}) {
  const d = dir.clone().normalize()
  const haut = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize()
  const th = angle(zero, v0)
  const u = d.clone().multiplyScalar(Math.cos(th)).addScaledVector(haut, Math.sin(th))
  return origine.clone().addScaledVector(u, v0 * t).add(new THREE.Vector3(0, -0.5 * G * t * t, 0))
}

// Panneau solide de 400 × 400 m, d'un mètre d'épaisseur, sa face avant à d m devant l'œil (plan z = -d).
function panneau(d, { surface = 'pierre' } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(400, 400, 1), new THREE.MeshLambertMaterial())
  m.position.set(0, OEIL.y, -d - 0.5)
  m.userData.solid = true; m.userData.surface = surface
  m.updateMatrixWorld(true)
  return m
}
// Vitre de 20 × 20 m, 1 cm d'épaisseur, sa face avant à d m : la balle la traverse (verre, pas solide).
function vitre(d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.01), new THREE.MeshLambertMaterial())
  m.position.set(0, OEIL.y, -d - 0.005)
  m.userData.surface = 'verre'
  m.updateMatrixWorld(true)
  return m
}
// Muret de 1 m de haut et de 30 cm d'épaisseur, sa face avant à 100 m, son dessus `sous` m sous la ligne de visée.
function muret(sous) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 0.3), new THREE.MeshLambertMaterial())
  m.position.set(0, OEIL.y - sous - 0.5, -100.15)
  m.userData.solid = true; m.userData.surface = 'pierre'
  m.updateMatrixWorld(true)
  return m
}

describe('temps de vol : la balle met d / v à arriver (spec §2 c, 800 m/s, 950 m/s au niveau 4 de Vélocité)', () => {
  afterEach(() => { amelioration.levels.velocity = 0 })
  // Le niveau de Vélocité du joueur est posé comme en jeu (main.js tire avec la vitesse que getStats() en déduit ; le
  // témoin, avec son délai, getStats().bulletDelay : 0,13 s au niveau 4).
  it.each([[31, 0], [155, 0], [430, 0], [430, 4]])('à %i m, Vélocité au niveau %i : d / v à 2 % près', (d, niveau) => {
    amelioration.levels.velocity = niveau
    const v0 = 800 + 37.5 * niveau
    const a = voler(tirer({ zero: d, v0 }), { objets: [panneau(d)] })
    expect(a?.impact?.kind, 'la balle arrive dans le panneau').toBe('decor')
    expect(a.t).toBeGreaterThan(d / v0 * 0.98)
    expect(a.t).toBeLessThan(d / v0 * 1.02)
  })
})

describe('chute et réglage de la lunette (décision 1 : réglée sur la distance qu\'annonce Anton)', () => {
  it('réglée à 430 m : impact à moins de 2 cm de la ligne de visée à 430 m ; sans réglage : 1,41 m plus bas, à 5 cm près', () => {
    const regle = voler(tirer({ zero: 430 }), { objets: [panneau(430)] })
    expect(Math.abs(regle.impact.point.y - OEIL.y), 'réglée à 430 m').toBeLessThan(0.02)
    const brut = voler(tirer({ zero: null }), { objets: [panneau(430)] })
    expect(OEIL.y - brut.impact.point.y, 'sans réglage').toBeGreaterThan(1.41 - 0.05)
    expect(OEIL.y - brut.impact.point.y, 'sans réglage').toBeLessThan(1.41 + 0.05)
  })

  // Spec §2 c : « l'écart dans la zone 412 à 448 m va de -5 à +6 cm ». Calculé de nouveau : de +5,7 cm à 412 m à
  // -6,2 cm à 448 m, négligeable devant le rayon du torse (15 cm).
  it('réglée à 430 m, la balle reste à moins de 6,5 cm de la ligne de visée de 412 à 448 m', () => {
    const ecarts = [412, 421, 430, 439, 448].map(d => voler(tirer({ zero: 430 }), { objets: [panneau(d)] }).impact.point.y - OEIL.y)
    expect(ecarts[0]).toBeGreaterThan(0.05)
    expect(ecarts[4]).toBeLessThan(-0.05)
    for (const e of ecarts) expect(Math.abs(e)).toBeLessThan(0.065)
  })
})

describe('le décor arrête la balle sur sa trajectoire, pas sur la ligne de visée', () => {
  it('ligne de visée 3 cm au-dessus d\'un muret à 100 m : la balle tombe dedans (sans réglage, et réglée à 31 m)', () => {
    for (const zero of [null, 31]) {
      const a = voler(tirer({ zero }), { objets: [muret(0.03), panneau(300)] })
      expect(a?.impact?.kind, `réglage ${zero}`).toBe('decor')
      expect(a.impact.point.z, `réglage ${zero} : le muret, pas le mur du fond`).toBeCloseTo(-100, 1)
    }
  })

  it('témoin : 10 cm au-dessus du muret, la chute (7,7 cm à 100 m) ne suffit pas, la balle finit dans le mur du fond', () => {
    for (const zero of [null, 31]) {
      const a = voler(tirer({ zero }), { objets: [muret(0.10), panneau(300)] })
      expect(a.impact.point.z, `réglage ${zero}`).toBeCloseTo(-300, 1)
    }
  })
})

describe('temps de l\'impact (contrat du lot 4, K0) : interpolé dans le segment, pas la fin de l\'image', () => {
  // Analytique : la balle atteint le plan z = -430 à t = 430 / (v0 · cos θ).
  const exact = 430 / (V0 * Math.cos(angle(430)))
  it.each([60, 37, 144])('tir à 430 m, images à %i i/s : à 0,5 ms du calcul', fps => {
    const a = voler(tirer({ zero: 430 }), { objets: [panneau(430)] }, { dt: 1 / fps })
    expect(Math.abs(a.t - exact)).toBeLessThan(0.0005)
  })

  it('sur l\'horloge de la mission : un tir parti à 12,34 s arrive à 12,34 s + le temps de vol', () => {
    const a = voler(tirer({ zero: 430, tTir: 12.34 }), { objets: [panneau(430)] }, { tTir: 12.34 })
    expect(Math.abs(a.t - 12.34 - exact)).toBeLessThan(0.0005)
  })
})

describe('cible en mouvement : le segment de chaque image est cherché contre la pose du moment', () => {
  // PNJ de la forme qu'attend npcHit (boîte grossière, zones) : torse et tête d'un homme debout, qui court le long de X.
  function coureur(x0, z, vx) {
    const n = { alive: true, pos: new THREE.Vector3(x0, 0, z) }
    n.getBounds = () => ({ center: n.pos.clone().add(new THREE.Vector3(0, 1, 0)), size: new THREE.Vector3(0.8, 2, 0.8) })
    n.hitZones = () => {
      const tete = n.pos.clone().add(new THREE.Vector3(0, 1.62, 0))
      return [{ part: 'torse', a: n.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), b: n.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), r: 0.15 },
        { part: 'tete', a: tete, b: tete.clone(), r: 0.1 }]
    }
    n.courir = t => { n.pos.x = x0 + vx * t }
    return n
  }
  // À 430 m, il court à 6,4 m/s (une fuite en M4) : au coup, il est 3,44 m avant le point où la balle l'attend.
  const vol = Math.hypot(8.85, 430) / V0
  const tirSur = x => tirer({ zero: 430, dir: new THREE.Vector3(x, 1.15, -430).sub(OEIL) })

  it('mené du temps de vol (0,54 s), il est touché au torse', () => {
    const n = coureur(-6.4 * vol, -430, 6.4)
    const a = voler(tirSur(0), { npcs: [n] }, { chaqueImage: t => n.courir(t) })
    expect(a?.impact?.kind).toBe('npc')
    expect(a.impact.npc).toBe(n)
    expect(a.impact.part).toBe('torse')
  })

  it('visé là où il est au coup, il n\'y est plus quand la balle passe', () => {
    const n = coureur(-6.4 * vol, -430, 6.4)
    const a = voler(tirSur(-6.4 * vol), { npcs: [n] }, { chaqueImage: t => n.courir(t) })
    expect(a?.impact?.kind).not.toBe('npc')
  })
})

describe('une balle qui ne rencontre rien', () => {
  it('est perdue au bout de 0,6 s, là où elle est alors (à 480 m) : point au loin, rien de touché', () => {
    const a = voler(tirer({ zero: 155 }), {})
    expect(a?.impact?.kind).toBe('rien')
    expect(a.t).toBeCloseTo(0.6, 9)
    expect(a.impact.point.distanceTo(attendu(0.6, { zero: 155 }))).toBeLessThan(1e-6)
  })
})

describe('vitres traversées (contrat du lot 4, K0 : dernierTirMortel.traversees)', () => {
  it('une vitre avant l\'impact est relevée : instant, point, normale vers le tireur, matière ; pas celle d\'après', () => {
    const a = voler(tirer({ zero: 430 }), { objets: [panneau(430)], vitres: [vitre(200), vitre(500)] })
    expect(a?.impact?.kind).toBe('decor')
    expect(a.traversees, 'les vitres traversées').toHaveLength(1)
    const [v] = a.traversees
    expect(v.surface).toBe('verre')
    expect(v.point.z).toBeCloseTo(-200, 3)
    expect(v.point.distanceTo(attendu(v.t, { zero: 430 }))).toBeLessThan(0.01)
    expect(v.normale.z).toBeCloseTo(1, 6)
    expect(Math.abs(v.t - 200 / (V0 * Math.cos(angle(430))))).toBeLessThan(0.0005)
  })

  it('sans vitre, aucune traversée', () => {
    expect(voler(tirer({ zero: 430 }), { objets: [panneau(430)] }).traversees).toEqual([])
  })
})

describe('prévision au coup : le bout du sillage (spec du lot 2, §3.3 : il finit au point d\'impact)', () => {
  it('le temps de vol jusqu\'au premier obstacle, le monde tel qu\'il est au coup', () => {
    expect(B.predireImpact, 'predireImpact').toBeTypeOf('function')
    for (const d of [31, 155, 430]) {
      const t = B.predireImpact(tirer({ zero: d }), toucher({ objets: [panneau(d)] }))
      expect(Math.abs(t - d / (V0 * Math.cos(angle(d)))), `${d} m`).toBeLessThan(0.002)
    }
  })

  it('rien devant : la balle part jusqu\'au bout de son vol (0,6 s)', () => {
    expect(B.predireImpact(tirer({ zero: 155 }), toucher({}))).toBeCloseTo(0.6, 9)
  })

  it('la prévision ne fait pas avancer la balle : elle part toujours du canon', () => {
    const b = tirer({ zero: 155 })
    B.predireImpact(b, toucher({ objets: [panneau(155)] }))
    const a = voler(b, { objets: [panneau(155)] })
    expect(Math.abs(a.t - 155 / (V0 * Math.cos(angle(155))))).toBeLessThan(0.0005)
  })
})
