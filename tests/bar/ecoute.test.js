import { describe, it, expect } from 'vitest'
import { ECOUTE, SOUPCON } from '../../src/bar/reglages.js'
import {
  audibilite, transmission, intelligibilite, decouper, fragilites, affichage, masquer, acquis, MURMURES, MASQUE,
} from '../../src/bar/ecoute.js'
import { BOITES, FOYERS, PLACES, SIEGES, ANCRES, dansZone } from '../../src/bar/plan.js'
import { forwardOf } from '../../src/prologue/fpsController.js'

// L'écoute du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.4 et §10 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B2). Chaque test de comportement a été vu rouge sur le témoin écrit
// à côté de son assertion : d'abord sur une écoute naïve qui réunissait ces témoins (et sur le plan aux coordonnées de
// départ de la spec, pour le tableau des places), puis un à un, glissés seuls dans l'écoute finie.

const LOIN = { x: 50, z: 50 }                       // un juke-box hors de portée : seul le bruit de la salle (0,08)
const vers = (de, a) => ({ x: a.x - de.x, z: a.z - de.z })
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const CALME = ECOUTE.voix.normale, MEFIANCE = ECOUTE.voix.baissee, COMBINE = ECOUTE.voix.combine

describe('les réglages de l\'écoute', () => {
  it('les valeurs de reglages.js sont celles de la spec (§3.4)', () => {
    expect(ECOUTE).toMatchObject({ pleineM: 2.5, nulleM: 5, orientationLibreDeg: 75, orientationDos: 0.9, bruitFond: 0.08,
      bruitJukebox: 0.25, jukeboxM: 4, murmuresSous: 0.15, fragiliteMax: 0.7, fragiliteCle: 0.8, changementSousTitre: 0.25,
      porteeBips: 1.6, voixBipeesMax: 3 })
    expect(ECOUTE.voix).toEqual({ normale: 1, baissee: 0.7, rires: 1.25, combine: 0.35 })
    expect(ECOUTE.transmission).toEqual({ mur: 0.05, cloison: 0.6, porte: 0.9, meuble: 1 })
    expect(ECOUTE.passeBas).toEqual({ baseHz: 600, plageHz: 2400 })
    expect(SOUPCON.effets.voixEscorte).toBe(ECOUTE.voix.baissee)   // la voix baissée de l'escorte n'est écrite qu'une fois
  })
})

describe('la transmission (T)', () => {
  const haut = { x: 0, z: -1 }, bas = { x: 0, z: 1 }
  // un mur de 0,2 m sur la ligne z = 0, de x = −5 à 5, percé d'une porte de x = −0,5 à 0,5
  const murPerce = [
    { minX: -5, maxX: -0.5, minZ: -0.1, maxZ: 0.1, son: 'mur' },
    { minX: -0.5, maxX: 0.5, minZ: -0.1, maxZ: 0.1, son: 'porte' },
    { minX: 0.5, maxX: 5, minZ: -0.1, maxZ: 0.1, son: 'mur' },
  ]

  it('une cloison laisse passer 0,6 ; deux murs se multiplient ; un meuble ne retient rien', () => {
    expect(transmission(haut, bas, [])).toBe(1)
    const cloison = [{ minX: -1, maxX: 1, minZ: -0.05, maxZ: 0.05, son: 'cloison' }]
    expect(transmission(haut, bas, cloison)).toBeCloseTo(0.6, 12)          // témoin : tout ou rien, 0
    const deuxMurs = [{ minX: -1, maxX: 1, minZ: -0.6, maxZ: -0.4, son: 'mur' }, { minX: -1, maxX: 1, minZ: 0.4, maxZ: 0.6, son: 'mur' }]
    expect(transmission(haut, bas, deuxMurs)).toBeCloseTo(0.05 * 0.05, 12)   // témoin : tout ou rien, 0
    expect(transmission(haut, bas, [{ minX: -1, maxX: 1, minZ: -0.3, maxZ: 0.3, son: 'meuble' }])).toBe(1)
  })

  it('une porte laisse passer 0,9 seulement dans son axe ; à côté d\'elle, c\'est le mur', () => {
    expect(transmission({ x: 0, z: -2 }, { x: 0, z: 2 }, murPerce)).toBeCloseTo(0.9, 12)     // en face (témoin : tout ou rien, 0)
    expect(transmission({ x: -1, z: -2 }, { x: 1, z: 2 }, murPerce)).toBeCloseTo(0.9, 12)    // de biais, par l'ouverture
    expect(transmission({ x: 2, z: -2 }, { x: 2, z: 2 }, murPerce)).toBeCloseTo(0.05, 12)    // à côté de la porte
    // en rasant le mur : le segment traverse l'épaisseur du mur de part et d'autre de l'ouverture
    expect(transmission({ x: -5, z: -0.5 }, { x: 5, z: 0.5 }, murPerce)).toBeCloseTo(0.05 * 0.9 * 0.05, 12)
  })

  it('longer une boîte, s\'arrêter contre elle ou toucher son coin ne la coupe pas', () => {
    const b = [{ minX: 0, maxX: 1, minZ: 0, maxZ: 1, son: 'mur' }]
    expect(transmission({ x: -1, z: 0 }, { x: 2, z: 0 }, b)).toBe(1)        // le long de son bord (témoin : bord compté, 0,05)
    expect(transmission({ x: -1, z: 0.5 }, { x: 0, z: 0.5 }, b)).toBe(1)    // jusqu'à sa face
    expect(transmission({ x: -1, z: -1 }, { x: 0, z: 0 }, b)).toBe(1)       // jusqu'à son coin
    expect(transmission({ x: -1, z: 0.5 }, { x: 0.01, z: 0.5 }, b)).toBeCloseTo(0.05, 12)   // un centimètre dedans : coupée
  })

  it('un son inconnu est une erreur, jamais ignoré', () => {
    expect(() => transmission(haut, bas, [{ minX: -1, maxX: 1, minZ: -0.1, maxZ: 0.1, son: 'vitre' }])).toThrow(/vitre/)
  })
})

describe('l\'intelligibilité (I = A(d / voix) × T × O(α) × (1 − N))', () => {
  const oreille = { x: 0, z: 0 }, devant = { x: 0, z: -1 }
  const aDevant = (d, voix = CALME) => ({ x: 0, z: -d, voix })

  it('A : tout jusqu\'à 2,5 m, rien dès 5 m, une courbe douce entre les deux', () => {
    expect(audibilite(0)).toBe(1)
    expect(audibilite(2.5)).toBe(1)
    expect(audibilite(3)).toBeCloseTo(0.64 * 1.4, 12)     // u = 0,8 : u²(3 − 2u)
    expect(audibilite(3.75)).toBeCloseTo(0.5, 12)
    expect(audibilite(5)).toBe(0)
    expect(audibilite(9)).toBe(0)
    for (let x = 2.5; x < 5; x += 0.01) expect(audibilite(x + 0.01)).toBeLessThanOrEqual(audibilite(x))
  })

  it('la voix divise la distance : baissée, on comprend moins loin ; au combiné, presque rien', () => {
    expect(intelligibilite(oreille, devant, aDevant(3), [], LOIN)).toBeCloseTo(audibilite(3) * 0.92, 12)
    expect(intelligibilite(oreille, devant, aDevant(2.1, MEFIANCE), [], LOIN)).toBeCloseTo(audibilite(3) * 0.92, 12)   // témoin : voix constante, 0,92
    expect(intelligibilite(oreille, devant, aDevant(1.05, COMBINE), [], LOIN)).toBeCloseTo(audibilite(3) * 0.92, 12)   // témoin : voix constante, 0,92
    expect(intelligibilite(oreille, devant, aDevant(3, ECOUTE.voix.rires), [], LOIN)).toBeCloseTo(0.92, 12)           // les rires portent
    expect(intelligibilite(oreille, devant, aDevant(1, 0), [], LOIN)).toBe(0)        // sans voix, rien
  })

  it('les murs comptent : une cloison entre l\'oreille et la bouche retient 40 %', () => {
    const cloison = [{ minX: -1, maxX: 1, minZ: -1.05, maxZ: -0.95, son: 'cloison' }]
    expect(intelligibilite(oreille, devant, aDevant(2), cloison, LOIN)).toBeCloseTo(0.6 * 0.92, 12)   // témoin : murs ignorés, 0,92
  })

  it('se tourner un peu suffit : O vaut 1 jusqu\'à 75°, puis baisse jusqu\'à 0,9 dos tourné', () => {
    const source = aDevant(2)
    const tourne = deg => forwardOf(deg * Math.PI / 180)   // regard tourné de deg depuis la source (lacet 0 : vers −z)
    expect(intelligibilite(oreille, tourne(0), source, [], LOIN)).toBeCloseTo(0.92, 12)
    expect(intelligibilite(oreille, tourne(75), source, [], LOIN)).toBeCloseTo(0.92, 12)
    expect(intelligibilite(oreille, tourne(127.5), source, [], LOIN)).toBeCloseTo(0.92 * 0.95, 12)    // témoin : distance seule, 1
    expect(intelligibilite(oreille, tourne(-127.5), source, [], LOIN)).toBeCloseTo(0.92 * 0.95, 12)   // à droite comme à gauche
    expect(intelligibilite(oreille, tourne(180), source, [], LOIN)).toBeCloseTo(0.92 * 0.9, 12)
  })

  it('le juke-box couvre les voix : N = 0,33 tout contre, 0,08 au-delà de 4 m', () => {
    const source = aDevant(2)
    expect(intelligibilite(oreille, devant, source, [], { x: 0, z: 0 })).toBeCloseTo(1 - 0.33, 12)    // témoin : distance seule, 1
    expect(intelligibilite(oreille, devant, source, [], { x: 2, z: 0 })).toBeCloseTo(1 - 0.08 - 0.125, 12)
    expect(intelligibilite(oreille, devant, source, [], { x: 4, z: 0 })).toBeCloseTo(0.92, 12)
    expect(intelligibilite(oreille, devant, source, [], null)).toBeCloseTo(0.92, 12)   // pas de juke-box : la salle seule
  })

  it('portée des mots-clés (§3.4) : environ 3,0 m au calme, 2,1 m en MÉFIANCE, 1,1 m au combiné', () => {
    const portee = voix => {
      let d = 0
      while (intelligibilite(oreille, devant, aDevant(d, voix), [], LOIN) >= ECOUTE.fragiliteCle) d += 0.001
      return d
    }
    expect(Math.abs(portee(CALME) - 3.0)).toBeLessThan(0.1)
    expect(Math.abs(portee(MEFIANCE) - 2.1)).toBeLessThan(0.1)     // témoin : voix constante, 3,07
    expect(Math.abs(portee(COMBINE) - 1.1)).toBeLessThan(0.1)      // témoin : voix constante, 3,07
  })
})

describe('le tableau des places (§3.1 et §10)', () => {
  // Viktor à sa place, le regard de la place (lacet de src/bar/plan.js, convention de forwardOf), le juke-box du plan
  const ecoute = (place, foyer, voix, regard = forwardOf(place.lacet)) =>
    intelligibilite(place, regard, { ...foyer, voix }, BOITES, ANCRES.jukebox)
  const { chaiseOuestD, mangeDeboutEst, entreeCouloir } = PLACES

  it('chaise ouest de la table d\'Albert, à 1,9 m de A : I ≥ 0,85 au calme et en MÉFIANCE, sans regarder la table', () => {
    expect(distance(chaiseOuestD, FOYERS.A)).toBeCloseTo(1.9, 1)            // témoin : coordonnées de départ, 2,25 m
    expect(ecoute(chaiseOuestD, FOYERS.A, CALME)).toBeGreaterThanOrEqual(0.85)
    expect(ecoute(chaiseOuestD, FOYERS.A, MEFIANCE)).toBeGreaterThanOrEqual(0.85)
    expect(dansZone('privee', chaiseOuestD)).toBe(true)                     // à portée de la table, mais assis : couvert
  })

  it('chaise nord de la table C, à 4,7 m de A : I < 0,8', () => {
    const chaiseNordC = SIEGES.find(s => s.id === 'C-nord')
    expect(Math.abs(distance(chaiseNordC, FOYERS.A) - 4.7)).toBeLessThan(0.1)
    expect(ecoute(chaiseNordC, FOYERS.A, CALME, vers(chaiseNordC, FOYERS.A))).toBeLessThan(0.8)
  })

  it('mange-debout est, à 2,6 m de B : I ≥ 0,85 au calme, < 0,8 en MÉFIANCE', () => {
    expect(Math.abs(distance(mangeDeboutEst, FOYERS.B) - 2.6)).toBeLessThan(0.1)
    expect(dansZone('privee', mangeDeboutEst)).toBe(false)                  // juste hors de la zone privée de B
    expect(ecoute(mangeDeboutEst, FOYERS.B, CALME)).toBeGreaterThanOrEqual(0.85)
    expect(ecoute(mangeDeboutEst, FOYERS.B, MEFIANCE)).toBeLessThan(0.8)     // témoin : voix constante, 0,91
  })

  it('entrée du couloir, à 1,0 m du combiné : la voix du colonel ≥ 0,8 ; à 2 m, < 0,5', () => {
    expect(distance(entreeCouloir, FOYERS.combine)).toBeCloseTo(1.0, 1)
    expect(transmission(entreeCouloir, FOYERS.combine, BOITES)).toBe(1)      // rien entre lui et le téléphone
    expect(ecoute(entreeCouloir, FOYERS.combine, COMBINE)).toBeGreaterThanOrEqual(0.8)
    // un pas en arrière, sur la même ligne : à 2 m du combiné
    const d = distance(entreeCouloir, FOYERS.combine), u = vers(FOYERS.combine, entreeCouloir)
    const recule = { x: FOYERS.combine.x + 2 * u.x / d, z: FOYERS.combine.z + 2 * u.z / d, lacet: entreeCouloir.lacet }
    expect(transmission(recule, FOYERS.combine, BOITES)).toBe(1)
    expect(ecoute(recule, FOYERS.combine, COMBINE)).toBeLessThan(0.5)       // témoin : voix constante, 0,92
  })

  it('derrière la cloison du couloir : T = 0,6, et ni Sorel ni le colonel n\'y donnent un mot-clé', () => {
    const derriere = { x: -2.0, z: -4.2, lacet: 0 }                          // dans le sas des toilettes, face au WC
    expect(dansZone('discrete', derriere)).toBe(true)
    expect(transmission(derriere, FOYERS.combine, BOITES)).toBeCloseTo(0.6, 12)   // témoin : murs ignorés, 1
    expect(ecoute(derriere, FOYERS.combine, CALME)).toBeLessThan(0.8)       // Sorel (témoins : murs ignorés, distance seule)
    expect(ecoute(derriere, FOYERS.combine, COMBINE)).toBeLessThan(0.8)     // le colonel
  })

  it('hors des places prévues, aucun siège libre n\'entend un mot-clé du socle, même tourné vers lui (« fais le dur »)', () => {
    const socle = [['table A', FOYERS.A, CALME], ['table B', FOYERS.B, CALME], ['Sorel au téléphone', FOYERS.combine, CALME],
      ['le colonel au combiné', FOYERS.combine, COMBINE], ['Sorel à la porte', FOYERS.porte, CALME]]
    const libres = SIEGES.filter(s => !s.occupant && s.id !== chaiseOuestD.siege)
    expect(libres.length).toBeGreaterThanOrEqual(8)                         // les tabourets du zinc et la table C
    for (const siege of libres) {
      for (const [nom, foyer, voix] of socle) {
        expect(ecoute(siege, foyer, voix, vers(siege, foyer)), `${siege.id} ← ${nom}`).toBeLessThan(ECOUTE.fragiliteCle)
      }
    }
    // témoin : tabouret nord au départ de la spec (z = −2), à 2,1 m du combiné : Sorel s'y entend à 0,92
  })
})

describe('les mots masqués', () => {
  const A1 = { texte: 'La nationale a des yeux. Sur la vieille route, il n\'y a personne.', motsCles: ['vieille route'], renseignement: 'trajet' }
  const motsDe = r => decouper(r).map(m => m.mot)

  it('découpe la réplique en mots et repère ses mots-clés, quelles que soient la casse et la ponctuation', () => {
    const A2a = { texte: 'Il monte devant. À droite. Il veut voir la route.', motsCles: ['devant', 'à droite'], renseignement: 'place' }
    expect(decouper(A2a)).toEqual([{ mot: 'Il', cle: false }, { mot: 'monte', cle: false }, { mot: 'devant.', cle: true },
      { mot: 'À', cle: true }, { mot: 'droite.', cle: true }, { mot: 'Il', cle: false }, { mot: 'veut', cle: false },
      { mot: 'voir', cle: false }, { mot: 'la', cle: false }, { mot: 'route.', cle: false }])
    // une expression entière, à chacune de ses occurrences, jamais un de ses mots isolé
    const r = { texte: 'À droite, à la frontière. Il monte à droite.', motsCles: ['à droite'] }
    expect(decouper(r).map(m => m.cle)).toEqual([true, true, false, false, false, false, false, true, true])   // témoin : mot à mot, « à » de « à la frontière » marqué
    const heure = { texte: 'Sept heures et quart, devant la caserne.', motsCles: ['sept heures et quart'] }
    expect(decouper(heure).map(m => m.cle)).toEqual([true, true, true, true, false, false, false])
    expect(decouper({ texte: '  Belote.  ' })).toEqual([{ mot: 'Belote.', cle: false }])
  })

  it('un mot-clé absent de sa réplique, ou vide, est une erreur', () => {
    expect(() => decouper({ texte: 'Le col, c\'est fini.', motsCles: ['vieille route'] })).toThrow(/vieille route/)
    expect(() => decouper({ texte: 'Bivouac. … Oui, mon colonel.', motsCles: [' '] })).toThrow(/vide/)   // témoin : trouvé sur « … »
  })

  it('fragilité : 0,8 pour les mots-clés, de 0 à 0,7 pour les autres, tirée d\'une graine propre à la réplique', () => {
    const mots = decouper(A1), f = fragilites(A1, 99)
    expect(f).toHaveLength(mots.length)
    mots.forEach((m, i) => {
      if (m.cle) expect(f[i]).toBe(0.8)
      else { expect(f[i]).toBeGreaterThanOrEqual(0); expect(f[i]).toBeLessThan(0.7) }
    })
    expect(new Set(f.filter((_, i) => !mots[i].cle)).size).toBeGreaterThan(5)   // tirées, pas une valeur pour tous
    expect(fragilites(A1, 99)).toEqual(f)
    expect(fragilites(A1, 98)).not.toEqual(f)
    expect(fragilites(A1)).toEqual(fragilites({ ...A1 }))                    // sans graine : celle du texte
  })

  it('même masquage pour une même réplique et un même I, d\'une image à l\'autre', () => {
    const mots = motsDe(A1)
    const premiere = masquer(mots, 0.4, fragilites(A1))
    expect(premiere).toContain(MASQUE)                                       // ni tout…
    expect(premiere.split(' ').filter(m => m !== MASQUE).length).toBeGreaterThan(2)   // …ni rien : le test a un sens
    for (let image = 0; image < 60; image++) {
      expect(masquer(mots, 0.4, fragilites(A1))).toBe(premiere)             // témoin : hasard à chaque image
    }
  })

  it('un mot s\'affiche si I atteint sa fragilité ; des mots masqués voisins se fondent en un seul « … »', () => {
    const mots = ['Il', 'monte', 'devant.', 'À', 'droite.'], f = [0.1, 0.5, 0.8, 0.8, 0.3]
    expect(masquer(mots, 0.4, f)).toBe('Il … droite.')                       // témoin : un « … » par mot, « Il … … … droite. »
    expect(masquer(mots, 0.5, f)).toBe('Il monte … droite.')                 // I égal à la fragilité : le mot passe
    expect(masquer(mots, 0.8, f)).toBe('Il monte devant. À droite.')
    expect(masquer(mots, 0.2, f)).toBe('Il …')
    expect(affichage(0.4, f)).toEqual([true, false, false, false, true])
    expect(masquer([], 0.9, [])).toBe('')
    expect(MASQUE).toBe('…')
  })

  it('sous I = 0,15 : « (murmures) », même pour les mots les plus solides', () => {
    const mots = ['Il', 'monte', 'devant.'], solides = [0, 0, 0]
    expect(masquer(mots, 0.149, solides)).toBe(MURMURES)                     // témoin : sans seuil, « Il monte devant. »
    expect(masquer(mots, 0.15, solides)).toBe('Il monte devant.')
    expect(affichage(0.149, solides)).toEqual([false, false, false])
    expect(MURMURES).toBe('(murmures)')
  })

  it('chaque mot garde l\'I du moment où il a été frappé', () => {
    const mots = ['Il', 'monte', 'devant.', 'À', 'droite.'], f = [0.1, 0.5, 0.05, 0.05, 0.3]
    const auMoment = [0.9, 0.9, 0.1, 0.1, 0.9]                                // Viktor s'éloigne, puis revient
    expect(masquer(mots, auMoment, f)).toBe('Il monte … droite.')
    expect(affichage(auMoment, f)).toEqual([true, true, false, false, true])
    expect(masquer(mots.slice(0, 2), auMoment, f)).toBe('Il monte')          // seuls les mots déjà frappés
    expect(masquer(mots, [0.1, 0.1, 0.1, 0.1, 0.1], f)).toBe(MURMURES)
    expect(affichage([0.9], f)).toEqual([true, false, false, false, false])  // pas encore frappé : pas affiché
  })
})

describe('un renseignement s\'apprend à la fin de sa réplique, si ses mots-clés se sont affichés', () => {
  const A1 = { texte: 'La nationale a des yeux. Sur la vieille route, il n\'y a personne.', motsCles: ['vieille route'], renseignement: 'trajet' }
  // La frappe au temps de jeu (spec §3.14, patron de src/briefing/kit.js:10) : la réplique dure 0,8 × (350 + 62 ×
  // longueur) ms, lettres régulièrement espacées ; instant (s) où la première lettre de chaque mot est frappée.
  const instantsDesMots = texte => {
    const duree = 0.8 * (0.35 + 0.062 * texte.length)
    return [...texte.matchAll(/\S+/g)].map(m => duree * m.index / texte.length)
  }
  // Viktor à ou(t) écoute la table A (voix normale), tourné vers elle : ce qui s'affiche de chaque mot quand il est frappé.
  const ecouter = (replique, ou) => {
    const f = fragilites(replique)
    const auMoment = instantsDesMots(replique.texte).map(t => {
      const p = ou(t)
      return intelligibilite(p, vers(p, FOYERS.A), { ...FOYERS.A, voix: CALME }, BOITES, ANCRES.jukebox)
    })
    return { vus: affichage(auMoment, f), texte: masquer(decouper(replique).map(m => m.mot), auMoment, f) }
  }
  const proche = PLACES.chaiseOuestD                          // la place d'écoute de la table A
  const loin = { x: -2.0, z: -6.5 }                           // au fond du couloir des toilettes
  const avantLesMotsCles = instantsDesMots(A1.texte)[7] - 0.1   // juste avant « vieille »

  it('acquis seulement si les mots-clés ont été affichés au moment de leur frappe', () => {
    expect(decouper(A1)[7].mot).toBe('vieille')
    const parti = ecouter(A1, t => (t < avantLesMotsCles ? proche : loin))   // à portée au début, parti avant les mots-clés
    expect(parti.vus[0]).toBe(true)
    expect(parti.texte).toMatch(/^La nationale .*…$/)
    expect(acquis(A1, parti.vus)).toBe(false)                               // témoin : acquis par proximité au début, vrai
    const arrive = ecouter(A1, t => (t < avantLesMotsCles ? loin : proche))  // loin au début, arrivé avant les mots-clés
    expect(arrive.vus[0]).toBe(false)
    expect(arrive.texte).toMatch(/^… .*vieille route, /)
    expect(acquis(A1, arrive.vus)).toBe(true)                               // témoin : acquis par proximité au début, faux
  })

  it('un seul mot-clé masqué suffit à le perdre ; une réplique sans renseignement n\'apprend rien', () => {
    const tous = decouper(A1).map(() => true)
    expect(acquis(A1, tous)).toBe(true)
    expect(acquis(A1, tous.map((v, i) => i !== 8))).toBe(false)              // « route, » masqué
    expect(acquis(A1, [])).toBe(false)
    expect(acquis({ texte: A1.texte, motsCles: ['vieille route'] }, tous)).toBe(false)   // sans renseignement
    expect(acquis({ texte: 'Belote.', renseignement: 'vehicule' }, [true])).toBe(false)  // sans mot-clé
  })
})
