import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import * as occ from '../../src/shot/occlusion.js'
import { npcHit } from '../../src/shot/hitzones.js'
import { OCCLUSION } from '../../src/shot/tuning.js'

// Ce que la balle rencontre sur un segment de sa trajectoire (spec du lot 3, §2 c ; plan du lot 3a, tâche A4) :
// impactSurSegment (src/shot/occlusion.js) cherche, du début du segment à sa fin, le PNJ (npcHit : ses zones à la pose
// du moment), le décor solide et le cadenas (solidHit), garde le premier (resolveImpact) et relève les vitres traversées
// avant lui. Les OCCLUSION.departM premiers mètres devant l'œil ne comptent pas pour le décor (l'appui du poste) : ils
// ne sont qu'au début du premier segment.
//
// Témoin : firstHit de main.js d'avant la tâche (npcHit, solidHit, resolveImpact sur le rayon du coup, sans fin), qui
// tient lieu d'impactSurSegment tant qu'il manque. Vus rouges : un mur, un PNJ ou le cadenas au-delà du bout du
// segment étaient touchés, aucune vitre n'était relevée, et un muret à 30 cm du début d'un segment lointain était
// ignoré (les 50 cm de l'appui comptés à chaque segment, pas seulement devant l'œil).

const avant = ({ ray, npcs = [], objets = [], boites = [] }) => {
  const npc = npcHit(ray, npcs)
  const r = occ.resolveImpact({ ray, npcHits: npc ? [npc] : [], decorHit: occ.solidHit(ray, objets, boites) })
  return { impact: r.kind === 'rien' ? null : r }
}
const impactSurSegment = occ.impactSurSegment || avant

const v = (x, y, z) => new THREE.Vector3(x, y, z)
// Segment de `longueur` m vers -Z, partant de `debut`, à depuisM m de l'œil.
const segment = (debut, longueur, depuisM = 0) => ({ ray: new THREE.Ray(debut.clone(), v(0, 0, -1)), longueur, depuisM })

// Mur solide (10 × 10 m, 20 cm d'épaisseur) dont la face avant est en z.
function mur(z, { surface = 'pierre', solide = true, x = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 0.2), new THREE.MeshLambertMaterial())
  m.position.set(x, 1, z - 0.1)
  if (solide) { m.userData.solid = true; m.userData.surface = surface }
  m.updateMatrixWorld(true)
  return m
}
const vitre = z => { const m = mur(z, { solide: false }); m.userData.surface = 'verre'; return m }
// PNJ de la forme qu'attend npcHit : un torse et une tête, debout en (x, 0, z).
function pnj(z, x = 0) {
  const pos = v(x, 0, z)
  return {
    alive: true,
    getBounds: () => ({ center: pos.clone().add(v(0, 1, 0)), size: v(0.8, 2, 0.8) }),
    hitZones: () => [{ part: 'torse', a: pos.clone().add(v(0, 0.9, 0)), b: pos.clone().add(v(0, 1.4, 0)), r: 0.15 },
      { part: 'tete', a: pos.clone().add(v(0, 1.62, 0)), b: pos.clone().add(v(0, 1.62, 0)), r: 0.1 }],
  }
}
const DEBUT = v(0, 1.2, 0)

describe('impactSurSegment : du début du segment à sa fin, pas au-delà', () => {
  it('un mur au-delà du bout du segment n\'est pas touché ; avant le bout, il l\'est, à sa distance sur le segment', () => {
    expect(impactSurSegment({ ...segment(DEBUT, 13), objets: [mur(-20)] }).impact).toBeNull()
    const { impact } = impactSurSegment({ ...segment(DEBUT, 13), objets: [mur(-10)] })
    expect(impact).toMatchObject({ kind: 'decor', surface: 'pierre' })
    expect(impact.distance).toBeCloseTo(10, 6)
    expect(impact.normal.z).toBeCloseTo(1, 6)
  })

  it('un PNJ au-delà du bout n\'est pas touché ; sur le segment, si, avec sa zone, son point et sa distance', () => {
    const loin = pnj(-30)
    expect(impactSurSegment({ ...segment(DEBUT, 13), npcs: [loin] }).impact).toBeNull()
    const pres = pnj(-8)
    const { impact } = impactSurSegment({ ...segment(DEBUT, 13), npcs: [pres] })
    expect(impact).toMatchObject({ kind: 'npc', npc: pres, part: 'torse' })
    expect(impact.distance).toBeCloseTo(8 - 0.15, 6)
    expect(impact.point.z).toBeCloseTo(-8 + 0.15, 6)
  })

  // Un segment peut partir dans la boîte grossière d'un PNJ (élargie de 30 cm de chaque côté) et finir avant d'en
  // sortir : images courtes (à 360 i/s, 2,2 m par image), ou plongée raide, où la boîte de 2,6 m de haut se traverse de
  // haut en bas. Le PNJ doit alors être cherché dès le début du segment : la boîte se franchit à 0 m, pas à sa sortie.
  // Témoin : npcHit de la tâche A4 avant sa relecture prenait le point de sortie de la boîte (rendu par
  // THREE.Ray.intersectBox quand l'origine y est) pour son entrée, au-delà du bout du segment, et sautait le PNJ (vu
  // rouge : la balle traversait le torse).
  it('un segment parti dans la boîte grossière d\'un PNJ, plus court qu\'elle : la zone devant lui est touchée', () => {
    const p = pnj(-5)   // boîte élargie de z = -4,3 à -5,7 ; torse de z = -4,85 à -5,15
    const { impact } = impactSurSegment({ ...segment(v(0, 1.2, -4.4), 0.6), npcs: [p] })
    expect(impact, 'le torse, à 45 cm du début du segment').toMatchObject({ kind: 'npc', npc: p, part: 'torse' })
    expect(impact.distance).toBeCloseTo(0.45, 6)
    // la même boîte, la zone au-delà du bout du segment : rien
    expect(impactSurSegment({ ...segment(v(0, 1.2, -4.4), 0.3), npcs: [p] }).impact).toBeNull()
  })

  it('le premier l\'emporte : un mur devant le PNJ arrête la balle, un PNJ devant le mur est touché', () => {
    expect(impactSurSegment({ ...segment(DEBUT, 13), npcs: [pnj(-9)], objets: [mur(-5)] }).impact.kind).toBe('decor')
    expect(impactSurSegment({ ...segment(DEBUT, 13), npcs: [pnj(-5)], objets: [mur(-9)] }).impact.kind).toBe('npc')
  })

  it('le cadenas (une boîte) : au-delà du bout, pas touché ; sur le segment, touché, avec ses marques', () => {
    const boite = c => [{ box: new THREE.Box3().setFromCenterAndSize(v(0, 1.2, c), v(0.9, 1, 0.7)), surface: 'metal', cadenas: true }]
    expect(impactSurSegment({ ...segment(DEBUT, 13), boites: boite(-20) }).impact).toBeNull()
    expect(impactSurSegment({ ...segment(DEBUT, 13), boites: boite(-6) }).impact).toMatchObject({ kind: 'decor', surface: 'metal', cadenas: true })
  })

  it('l\'appui du poste (les 50 premiers cm devant l\'œil) n\'arrête pas la balle, au premier segment seulement', () => {
    expect(OCCLUSION.departM).toBe(0.5)
    // Premier segment : un rebord à 30 cm de l'œil est traversé (M6 : l'œil est sur la face arrière du rebord)
    expect(impactSurSegment({ ...segment(DEBUT, 13, 0), objets: [mur(-0.3)] }).impact).toBeNull()
    // Plus loin sur la trajectoire, à 30 cm du début d'un segment qui part à 13 m de l'œil : touché
    const { impact } = impactSurSegment({ ...segment(DEBUT, 13, 13), objets: [mur(-0.3)] })
    expect(impact?.kind).toBe('decor')
    expect(impact.distance).toBeCloseTo(0.3, 6)
    // Un segment qui part à 20 cm de l'œil : seuls ses 30 premiers cm sont l'appui
    expect(impactSurSegment({ ...segment(DEBUT, 13, 0.2), objets: [mur(-0.25)] }).impact).toBeNull()
    expect(impactSurSegment({ ...segment(DEBUT, 13, 0.2), objets: [mur(-0.35)] }).impact?.kind).toBe('decor')
  })
})

describe('impactSurSegment : les vitres traversées (dernierTirMortel.traversees, contrat du lot 4)', () => {
  it('une vitre avant l\'impact est relevée (point, normale vers le tireur, matière, distance) ; une après, non', () => {
    const r = impactSurSegment({ ...segment(DEBUT, 13), objets: [mur(-9)], vitres: [vitre(-4), vitre(-11)] })
    expect(r.impact.kind).toBe('decor')
    expect(r.traversees, 'vitres traversées').toHaveLength(1)
    const [t] = r.traversees
    expect(t).toMatchObject({ surface: 'verre' })
    expect(t.distance).toBeCloseTo(4, 6)
    expect(t.point.distanceTo(v(0, 1.2, -4))).toBeLessThan(1e-6)
    expect(t.normale.z).toBeCloseTo(1, 6)
  })

  it('sans impact sur le segment, les vitres du segment sont relevées ; celles d\'après son bout, non', () => {
    const r = impactSurSegment({ ...segment(DEBUT, 13), vitres: [vitre(-2), vitre(-7), vitre(-15)] })
    expect(r.impact).toBeNull()
    expect(r.traversees.map(t => +t.distance.toFixed(6))).toEqual([2, 7])
  })

  it('les deux faces d\'une même vitre comptent pour une traversée ; ce qui n\'est pas du verre n\'en est pas une', () => {
    const feuillage = mur(-3, { solide: false })   // ni solide ni verre : traversé sans être relevé
    const r = impactSurSegment({ ...segment(DEBUT, 13), vitres: [vitre(-5), feuillage] })
    expect(r.traversees).toHaveLength(1)
    expect(r.traversees[0].distance).toBeCloseTo(5, 6)
  })
})

describe('solidHit garde son contrat d\'avant pour un rayon sans bornes', () => {
  // Non-régression : sans options, l'appui de 50 cm devant l'origine et aucune limite au loin.
  it('sans options : 50 cm d\'appui, rien au loin', () => {
    const ray = new THREE.Ray(DEBUT.clone(), v(0, 0, -1))
    expect(occ.solidHit(ray, [mur(-0.3)])).toBeNull()
    expect(occ.solidHit(ray, [mur(-900)]).distance).toBeCloseTo(900, 6)
  })
})
