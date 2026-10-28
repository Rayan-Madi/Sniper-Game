import { describe, it, expect } from 'vitest'
import { moveCircle, forwardOf } from '../../src/prologue/fpsController.js'
import {
  SALLE, SONS, BOITES, ZONES, TYPES_SIEGE, SIEGES, TABLES, PLACES, FOYERS, ANCRES, dansZone, zonesDe, coupe, vueLibre, lacetVers,
} from '../../src/bar/plan.js'

// Le plan du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.1 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B2). Chaque test de comportement a été vu rouge sur le témoin écrit
// à côté de son assertion : sur un plan aux coordonnées de départ de la spec, ou glissé seul dans le plan fini.

// emprise de Viktor : moveCircle teste un carré de demi-côté r = 0,28 (rayon par défaut de createFpsController)
const R = 0.28
const PAS = 0.05
const PROCHE = 1e-9

// Toutes les positions atteignables depuis `depart` par pas de 0,05 m sur les deux axes, comme le contrôleur : un pas
// compte s'il n'est pas retenu par une boîte. La grille est bornée (±15 m) : un plan mal fermé ne fait pas tourner le
// test à l'infini, il en sort.
function atteignables(depart, boites) {
  const vus = new Map([['0,0', depart]])
  const file = [[0, 0]]
  for (let k = 0; k < file.length; k++) {
    const [i, j] = file[k]
    const p = { x: depart.x + i * PAS, z: depart.z + j * PAS }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, cle = `${ni},${nj}`
      if (vus.has(cle) || Math.abs(ni * PAS) > 15 || Math.abs(nj * PAS) > 15) continue
      const cible = { x: depart.x + ni * PAS, z: depart.z + nj * PAS }
      const n = moveCircle(p, di * PAS, dj * PAS, R, boites)
      if (Math.abs(n.x - cible.x) > PROCHE || Math.abs(n.z - cible.z) > PROCHE) continue
      vus.set(cle, cible)
      file.push([ni, nj])
    }
  }
  return [...vus.values()]
}
// `cible` est atteinte si l'une des positions atteignables voisines s'y rend sans être retenue
const atteint = (positions, cible, boites) => positions.some(p => {
  if (Math.abs(p.x - cible.x) > PAS || Math.abs(p.z - cible.z) > PAS) return false
  const n = moveCircle(p, cible.x - p.x, cible.z - p.z, R, boites)
  return Math.abs(n.x - cible.x) < PROCHE && Math.abs(n.z - cible.z) < PROCHE
})
const libres = () => SIEGES.filter(s => !s.occupant)
// les sièges libres et les places d'écoute, avec leur nom
const cibles = () => [...libres().map(s => [s.id, s]), ...Object.entries(PLACES)]

describe('les boîtes du plan', () => {
  it('chaque boîte a un nom à elle, une étendue et un son connu (mur, cloison, porte, meuble)', () => {
    expect(SONS).toEqual(['mur', 'cloison', 'porte', 'meuble'])
    expect(new Set(BOITES.map(b => b.id)).size).toBe(BOITES.length)
    for (const b of BOITES) {
      expect(SONS, b.id).toContain(b.son)
      expect(b.maxX - b.minX, b.id).toBeGreaterThan(0)
      expect(b.maxZ - b.minZ, b.id).toBeGreaterThan(0)
    }
    expect(SALLE).toEqual({ minX: -6, maxX: 6, minZ: -4.5, maxZ: 4.5, plafond: 3 })   // 12 × 9 m, plafond à 3 m
  })

  it('la salle est close : depuis la porte, on ne sort ni de la salle ni du couloir des toilettes', () => {
    const dedans = p => (p.x > SALLE.minX && p.x < SALLE.maxX && p.z > SALLE.minZ && p.z < SALLE.maxZ) ||
      dansZone('discrete', p)
    const positions = atteignables(ANCRES.depart, BOITES)
    expect(positions.length).toBeGreaterThan(10000)
    expect(positions.filter(p => !dedans(p))).toEqual([])                  // témoin : porte d'entrée retirée, on sort
  })

  it('chaque siège libre et chaque place d\'écoute est atteignable depuis la porte', () => {
    const positions = atteignables(ANCRES.depart, BOITES)
    for (const [nom, c] of cibles()) expect(atteint(positions, c, BOITES), nom).toBe(true)   // témoin : un tabouret dans le comptoir
    expect(cibles().length).toBeGreaterThanOrEqual(12)
    // les objets à regarder (E, à 2,2 m de l'œil au plus) : à portée sans entrer en zone interdite
    const permises = positions.filter(p => !dansZone('interdite', p))
    for (const nom of ['photo', 'journal', 'fenetre', 'jukebox', 'cible']) {
      const o = ANCRES[nom]
      expect(permises.some(p => Math.hypot(p.x - o.x, p.z - o.z) < 1.6), nom).toBe(true)
    }
  })

  it('chacun se tient hors des boîtes, emprise comprise : Viktor au départ, Fernand, Lise et Sorel à leurs points', () => {
    // le carré de demi-côté r centré en p chevauche la boîte b (un contact bord à bord ne compte pas, comme moveCircle)
    const chevauche = (p, b, r) => p.x + r > b.minX + 1e-6 && p.x - r < b.maxX - 1e-6 && p.z + r > b.minZ + 1e-6 && p.z - r < b.maxZ - 1e-6
    for (const b of BOITES) expect(chevauche(ANCRES.depart, b, R), b.id).toBe(false)
    const debout = [['fernand', ANCRES.fernand], ...Object.entries(ANCRES.lise).map(([k, p]) => [`lise ${k}`, p]),
      ...Object.entries(ANCRES.sorel).map(([k, p]) => [`sorel ${k}`, p])]
    expect(debout.length).toBe(10)
    for (const [nom, p] of debout) {
      for (const b of BOITES) expect(chevauche(p, b, 0.25), `${nom} dans ${b.id}`).toBe(false)   // témoin : Lise servant A dans Lenoir
    }
  })

  it('un patron attablé est une boîte : on ne le traverse pas, son siège n\'est pas libre', () => {
    const occupes = SIEGES.filter(s => s.occupant)
    expect(occupes.map(s => s.occupant).sort()).toEqual(['albert', 'dussart', 'haas', 'lenoir', 'mattei'])
    for (const s of occupes) {
      const b = BOITES.find(x => x.id === s.occupant)
      expect(b, s.occupant).toBeDefined()
      expect(b.son).toBe('meuble')
      expect(s.x > b.minX && s.x < b.maxX && s.z > b.minZ && s.z < b.maxZ, s.occupant).toBe(true)
    }
  })
})

describe('les zones', () => {
  it('derrière le zinc et l\'arrière-cuisine sont interdits ; le devant du zinc est le comptoir', () => {
    expect(dansZone('interdite', { x: -5, z: 0 })).toBe(true)              // entre le zinc et les étagères
    expect(dansZone('interdite', { x: -4.5, z: -4 })).toBe(true)           // le passage au bout du zinc
    expect(dansZone('interdite', { x: -7, z: -2.2 })).toBe(true)           // l'arrière-cuisine
    expect(dansZone('interdite', { x: -3.5, z: 0 })).toBe(false)           // devant le zinc
    expect(dansZone('comptoir', { x: -3.2, z: 0 })).toBe(true)
    expect(dansZone('comptoir', { x: 0, z: 0 })).toBe(false)
  })

  it('privée : 2,5 m autour des tables A et B, en cercle', () => {
    expect(dansZone('privee', FOYERS.A)).toBe(true)
    expect(dansZone('privee', { x: FOYERS.A.x + 2.4, z: FOYERS.A.z })).toBe(true)
    expect(dansZone('privee', { x: FOYERS.B.x, z: FOYERS.B.z + 2.6 })).toBe(false)
    expect(dansZone('privee', { x: FOYERS.B.x - 2, z: FOYERS.B.z + 2 })).toBe(false)   // 2,83 m (témoin : zone carrée)
    expect(zonesDe(TABLES.C)).toEqual([])                                   // la table C est libre
  })

  it('discrète : le couloir des toilettes et son sas', () => {
    expect(dansZone('discrete', { x: -2.0, z: -6 })).toBe(true)
    expect(dansZone('discrete', { x: -2.0, z: -4.2 })).toBe(true)
    expect(dansZone('discrete', { x: -2.0, z: -3 })).toBe(false)
    expect(zonesDe({ x: -2.0, z: -6 })).toEqual(['discrete'])
    expect(() => dansZone('cuisine', { x: 0, z: 0 })).toThrow(/cuisine/)   // un type inconnu est une erreur
  })

  it('aucun siège libre ni aucune place d\'écoute en zone interdite', () => {
    for (const [nom, p] of cibles()) {
      expect(dansZone('interdite', p), nom).toBe(false)                     // témoin : l'entrée du couloir derrière le zinc
    }
  })
})

describe('les sièges et les places', () => {
  it('chaise de 0,45 m, œil à 1,20 m ; tabouret de 0,75 m, œil à 1,45 m, patron relevé de 0,33 m', () => {
    expect(TYPES_SIEGE).toEqual({ chaise: { hauteur: 0.45, oeil: 1.2, decalage: 0 }, tabouret: { hauteur: 0.75, oeil: 1.45, decalage: 0.33 } })
    for (const s of SIEGES) expect(s, s.id).toMatchObject({ ...TYPES_SIEGE[s.type] })
    expect(SIEGES.filter(s => s.type === 'tabouret').length).toBe(5)
    expect(new Set(SIEGES.map(s => s.id)).size).toBe(SIEGES.length)
  })

  it('les trois places d\'écoute prévues : la chaise ouest de D, le mange-debout est, l\'entrée du couloir', () => {
    expect(Object.keys(PLACES).sort()).toEqual(['chaiseOuestD', 'entreeCouloir', 'mangeDeboutEst'])
    const siege = SIEGES.find(s => s.id === PLACES.chaiseOuestD.siege)
    expect(siege).toMatchObject({ x: PLACES.chaiseOuestD.x, z: PLACES.chaiseOuestD.z, occupant: null, table: 'D' })
    expect(PLACES.chaiseOuestD.ecoute).toBe('A')
    expect(PLACES.mangeDeboutEst).toMatchObject({ ecoute: 'B', pretexte: 'flechettes' })
    expect(PLACES.entreeCouloir).toMatchObject({ ecoute: 'combine', pretexte: 'toilettes' })
    for (const p of Object.values(PLACES)) expect(FOYERS[p.ecoute]).toBeDefined()
  })

  it('un siège regarde sa table, le tabouret le zinc', () => {
    for (const s of SIEGES.filter(x => x.table !== 'zinc' && x.occupant !== 'albert' && x.occupant !== 'dussart')) {
      const f = forwardOf(s.lacet), t = TABLES[s.table]
      const d = Math.hypot(t.x - s.x, t.z - s.z)
      expect(f.x * (t.x - s.x) / d + f.z * (t.z - s.z) / d, s.id).toBeCloseTo(1, 9)
    }
    for (const s of SIEGES.filter(x => x.table === 'zinc')) expect(forwardOf(s.lacet).x, s.id).toBeCloseTo(-1, 9)
  })
})

describe('la vue et le regard', () => {
  it('lacetVers donne le lacet du contrôleur qui regarde de a vers b', () => {
    for (const [a, b] of [[{ x: 0, z: 0 }, { x: 0, z: -3 }], [{ x: 1, z: 1 }, { x: 4, z: 1 }], [{ x: 0, z: 0 }, { x: -2, z: 2 }]]) {
      const f = forwardOf(lacetVers(a, b)), d = Math.hypot(b.x - a.x, b.z - a.z)
      expect(f.x).toBeCloseTo((b.x - a.x) / d, 12)                          // témoin : atan2(dx, dz), regard inversé
      expect(f.z).toBeCloseTo((b.z - a.z) / d, 12)
    }
  })

  it('un mur, une cloison ou une porte coupent la vue ; un meuble non', () => {
    const a = { x: 0, z: -1 }, b = { x: 0, z: 1 }
    for (const son of ['mur', 'cloison', 'porte']) {
      expect(vueLibre(a, b, [{ minX: -1, maxX: 1, minZ: -0.1, maxZ: 0.1, son }]), son).toBe(false)
    }
    expect(vueLibre(a, b, [{ minX: -1, maxX: 1, minZ: -0.1, maxZ: 0.1, son: 'meuble' }])).toBe(true)
    expect(coupe(a, b, { minX: -1, maxX: 1, minZ: -0.1, maxZ: 0.1 })).toBe(true)
    expect(coupe(a, b, { minX: 0, maxX: 1, minZ: -0.1, maxZ: 0.1 })).toBe(false)   // le long de son bord
    // dans la salle : du zinc, on voit la table A ; du fond du couloir, ni la salle ni le téléphone
    const tabouret = SIEGES.find(s => s.id === 'tabouret-3')
    expect(vueLibre(tabouret, FOYERS.A)).toBe(true)
    expect(vueLibre({ x: -2.0, z: -6.5 }, FOYERS.B)).toBe(false)
    expect(vueLibre({ x: -2.0, z: -4.2 }, FOYERS.combine)).toBe(false)     // la cloison du sas
  })

  it('les foyers, les places et le départ ne sont dans aucune boîte opaque', () => {
    const opaques = BOITES.filter(b => b.son !== 'meuble')
    const dans = (p, b) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ
    for (const p of [...Object.values(FOYERS), ...Object.values(PLACES), ANCRES.depart, ANCRES.combine]) {
      expect(opaques.filter(b => dans(p, b)).map(b => b.id)).toEqual([])
    }
    expect(FOYERS.combine).toEqual(ANCRES.combine)
  })
})
