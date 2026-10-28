// Le plan du Bivouac, le bar de M5 (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.1). Module pur : ni DOM,
// ni three. Une seule source de vérité pour le pas de Viktor (moveCircle de src/prologue/fpsController.js), la
// transmission du son (src/bar/ecoute.js) et la ligne de vue (vueLibre, ici) : les boîtes au sol BOITES, { id, minX,
// maxX, minZ, maxZ, son }. son : mur, cloison, porte ou meuble ; ce qu'il laisse passer de la voix est dans
// ECOUTE.transmission (src/bar/reglages.js) ; la vue, seul un meuble la laisse passer. Puis les zones, les sièges, les
// places d'écoute prévues, les foyers des conversations et les ancres des personnes et des objets.
//
// Repère de l'enquête : x vers l'est, −z vers le nord, origine au centre du sol de la salle (12 × 9 m, plafond à 3 m).
// Lacet du contrôleur : 0 regarde vers −z, positif tourne à gauche (forwardOf). Les murs sont posés hors de la salle,
// 0,2 m d'épaisseur : l'intérieur va exactement de −6 à 6 en x et de −4,5 à 4,5 en z. Viktor occupe au sol un carré de
// 0,28 m de demi-côté (moveCircle).
//
// Coordonnées de départ de la spec réglées en tâche B2 par le tableau des places (tests/bar/ecoute.test.js) :
// - la table D (Albert) en (2,3 ; 1,4) : sa chaise ouest est à 1,9 m de A, que Viktor y entend sans la regarder ;
// - le juke-box en (−1,6 ; 4,1), à 4,2 m de cette chaise : il ne couvre pas la table A pour elle ;
// - les cinq tabourets de z = −0,8 à 2,4 : le plus au nord est à 3,3 m du combiné, aucun n'entend l'appel ;
// - le couloir des toilettes s'ouvre par un sas de 0,6 m dans la salle, à côté du téléphone : derrière sa cloison,
//   l'appel ne passe qu'à 0,6 ;
// - le mange-debout est contre le mur est : Viktor accoudé à 2,6 m de B, juste hors de sa zone privée.

export const SALLE = Object.freeze({ minX: -6, maxX: 6, minZ: -4.5, maxZ: 4.5, plafond: 3 })
export const SONS = Object.freeze(['mur', 'cloison', 'porte', 'meuble'])
const EP = 0.2   // épaisseur des murs, posés hors de la salle

const point = (x, z, plus = {}) => Object.freeze({ x, z, ...plus })
const boite = (id, minX, maxX, minZ, maxZ, son) => Object.freeze({ id, minX, maxX, minZ, maxZ, son })
const carre = (id, c, demi, son = 'meuble') => boite(id, c.x - demi, c.x + demi, c.z - demi, c.z + demi, son)

// Le lacet du contrôleur qui regarde de `de` vers `vers` : forwardOf(lacetVers(de, vers)) pointe vers `vers`.
export const lacetVers = (de, vers) => Math.atan2(-(vers.x - de.x), -(vers.z - de.z))

// ─── Les tables et les sièges ──────────────────────────────────────

export const TABLES = Object.freeze({
  A: point(1.5, 3.3),     // Dussart et Lenoir, près de la vitrine
  B: point(4.3, -3.0),    // Mattei et Haas, la belote dans la pénombre du coin nord-est
  C: point(1.5, -0.8),    // libre, au milieu de la salle
  D: point(2.3, 1.4),     // Albert, tourné vers la télé
})
const DEMI_TABLE = 0.3    // tables rondes de 0,6 m de diamètre, comptées comme un carré au sol
const RECUL = 0.62        // du centre d'une table au centre d'une chaise : le carré de Viktor assis ne touche pas la table
const DEMI_PERSONNE = 0.25   // un patron assis ou un ouvrier debout, au sol

// Chaise : le groupe du personnage posé au sol, sans calage ; tabouret : relevé de 0,33 m, pieds sur le repose-pieds
// (mesuré sur les GLB, spec §3.1). oeil : la hauteur de la caméra de Viktor assis (setPose({ y })).
export const TYPES_SIEGE = Object.freeze({
  chaise: Object.freeze({ hauteur: 0.45, oeil: 1.2, decalage: 0 }),
  tabouret: Object.freeze({ hauteur: 0.75, oeil: 1.45, decalage: 0.33 }),
})

const PORTE = point(3.5, 4.5)                // la porte d'entrée, au mur sud
const SEUIL = point(3.5, 3.95)               // juste à l'intérieur de la porte : on y entre, on y sort, Sorel y parle
const TELE = point(5.95, 1.5, { y: 2.3 })    // la télé à tube, en hauteur sur le mur est : le tiercé
const COMBINE = point(-3.0, -4.1)            // le combiné à l'oreille de qui téléphone, devant le téléphone mural
const MANGE_DEBOUT_PORTE = point(4.7, 3.4)   // le mange-debout des ouvriers, près de la porte

// Un siège : sa place (x, z, où Viktor ou le patron s'assoit), son lacet (vers sa table, ou vers `regarde`), sa table et
// son occupant (null : libre, Viktor peut s'y asseoir).
const siege = (id, type, table, x, z, occupant = null, regarde = TABLES[table]) =>
  Object.freeze({ id, type, table, x, z, lacet: lacetVers({ x, z }, regarde), occupant, ...TYPES_SIEGE[type] })
const autour = (table, cote) => {   // la place d'une chaise d'un côté de sa table
  const t = TABLES[table], [dx, dz] = { nord: [0, -1], sud: [0, 1], est: [1, 0], ouest: [-1, 0] }[cote]
  return [t.x + dx * RECUL, t.z + dz * RECUL]
}
const chaise = (table, cote, occupant, regarde) =>
  siege(`${table}-${cote}`, 'chaise', table, ...autour(table, cote), occupant, regarde)

export const SIEGES = Object.freeze([
  // le zinc : cinq tabourets face au comptoir (aucun au bout nord, trop près du téléphone)
  ...[-0.8, 0, 0.8, 1.6, 2.4].map((z, i) => siege(`tabouret-${i + 1}`, 'tabouret', 'zinc', -3.2, z, null, { x: -4.1, z })),
  chaise('C', 'nord'), chaise('C', 'sud'), chaise('C', 'ouest'),
  chaise('D', 'ouest'),                                  // la place d'écoute de la table A, tournée vers la télé
  chaise('D', 'nord', 'albert', TELE),                   // Albert regarde la course
  // Dussart, face à la porte, mais adossé à rien : « dos au mur, face à la porte » (spec §3.2) n'est tenu par aucune
  // chaise de A, la porte étant dans le mur de la vitrine. Place provisoire, à reprendre avec B9 et B10 (A-sud contre
  // la vitrine, ou une banquette), puis relancer le tableau des places (spec §3.1, « Réglé en B2 »).
  chaise('A', 'ouest', 'dussart', PORTE),
  chaise('A', 'nord', 'lenoir'),                         // Lenoir, dos à la salle
  chaise('B', 'nord', 'haas'),                           // Haas, face à la salle
  chaise('B', 'sud', 'mattei'),                          // Mattei, dos à la salle
])

// ─── Les ancres ────────────────────────────────────────────────────
// Objets à regarder (E) et personnes debout ou qui se déplacent ; les assis sont dans SIEGES. y : hauteur, pour ce qui
// est au mur ou sur un meuble.

const ouvrier = (x, z) => point(x, z, { lacet: lacetVers({ x, z }, MANGE_DEBOUT_PORTE) })
export const ANCRES = Object.freeze({
  depart: point(SEUIL.x, SEUIL.z, { lacet: 0 }),       // Viktor entre : la porte dans le dos, la salle devant lui
  porte: PORTE,                                        // la porte et sa clochette ; on sort en maintenant E
  telephone: point(-3.0, -4.45, { y: 1.5 }),           // le téléphone mural à fil, au mur nord, au bout du zinc
  combine: COMBINE,                                    // le combiné à l'oreille de qui téléphone (Fernand, puis Sorel)
  jukebox: point(-1.6, 4.1),
  tele: TELE,
  cible: point(5.95, -1.5, { y: 1.73 }),               // la cible de fléchettes
  photo: point(-4.6, -4.45, { y: 1.7 }),               // « BRIGADE MOTORISÉE 14 », au mur nord, au-dessus du passage
  journal: point(-4.1, 0.4, { y: 1.12 }),              // le journal du jour, sur le zinc
  fenetre: point(5.5, 4.45, { y: 1.5 }),               // la vitrine : le château d'eau
  wc: point(-2.0, -7.45),                              // la porte « OCCUPÉ », au fond du couloir
  cuisine: point(-5.95, -2.2),                         // la porte de l'arrière-cuisine, entrouverte
  babyfoot: point(-0.6, 0.9),
  fernand: point(-4.9, -0.4, { lacet: -Math.PI / 2 }), // derrière le zinc, face aux tabourets
  lise: Object.freeze({                                // là où Lise s'arrête pour servir
    zinc: point(-3.4, -2.4), A: point(2.2, 2.75), B: point(3.5, -2.6), C: point(2.2, -0.8), D: point(2.95, 2.0),
  }),
  sorel: Object.freeze({                               // l'entrée (18:30), le zinc, l'appel (18:36), le départ
    entree: SEUIL, zinc: point(-3.4, -1.9), telephone: COMBINE, sortie: SEUIL,
  }),
  ouvriers: Object.freeze([ouvrier(4.7, 2.85), ouvrier(5.25, 3.4)]),   // debout, face à leur mange-debout
})

// ─── Les foyers des conversations ──────────────────────────────────
// D'où part la voix d'un échange, pour l'écoute : le centre de la table, le combiné, la porte.

export const FOYERS = Object.freeze({
  A: TABLES.A,
  B: TABLES.B,
  zinc: point(-4.1, -1.9),         // au bout nord du zinc : Fernand derrière, Lise ou Sorel devant (C2, l'entrée de Sorel)
  combine: ANCRES.combine,         // l'appel : Fernand, Sorel, et la voix du colonel dans le combiné
  porte: SEUIL,                    // Sorel à la porte (le départ, R3)
  ouvriers: MANGE_DEBOUT_PORTE,
  albert: point(...autour('D', 'nord')),
})

// ─── Les places d'écoute prévues (§3.1) ────────────────────────────
// Les seules d'où l'on entend les mots-clés d'un foyer ; ailleurs, on entend sans eux (« fais le dur »). lacet : le
// regard naturel de la place, qui ne fixe pas la source. ecoute : le foyer qu'elle entend.

const D_OUEST = SIEGES.find(s => s.id === 'D-ouest')
const place = (x, z, regarde, plus) => point(x, z, { lacet: lacetVers({ x, z }, regarde), ...plus })
export const PLACES = Object.freeze({
  // assise près d'Albert, à 1,9 m de A, face à la télé : la table A est de côté
  chaiseOuestD: place(D_OUEST.x, D_OUEST.z, TABLES.D, { siege: D_OUEST.id, ecoute: 'A' }),
  // accoudé au mange-debout est, tourné vers la cible : à 2,6 m de B, juste hors de sa zone privée
  mangeDeboutEst: place(5.0, -0.45, ANCRES.cible, { ecoute: 'B', pretexte: 'flechettes' }),
  // dans la file des toilettes, face au WC, devant le sas : à 1 m du combiné, rien entre les deux
  entreeCouloir: place(-2.4, -3.3, ANCRES.wc, { ecoute: 'combine', pretexte: 'toilettes' }),
})

// ─── Les boîtes ────────────────────────────────────────────────────

const murs = [
  // nord, ouvert sur le couloir des toilettes (x de −2,6 à −1,4)
  boite('mur-nord-ouest', SALLE.minX - EP, -2.7, SALLE.minZ - EP, SALLE.minZ, 'mur'),
  boite('mur-nord-est', -1.3, SALLE.maxX + EP, SALLE.minZ - EP, SALLE.minZ, 'mur'),
  // ouest, derrière le zinc : la porte de l'arrière-cuisine, entrouverte (on ne passe pas)
  boite('mur-ouest-nord', SALLE.minX - EP, SALLE.minX, SALLE.minZ - EP, -2.6, 'mur'),
  boite('porte-cuisine', SALLE.minX - EP, SALLE.minX, -2.6, -1.8, 'porte'),
  boite('mur-ouest-sud', SALLE.minX - EP, SALLE.minX, -1.8, SALLE.maxZ + EP, 'mur'),
  boite('mur-est', SALLE.maxX, SALLE.maxX + EP, SALLE.minZ - EP, SALLE.maxZ + EP, 'mur'),
  // sud : mur plein, vitrine et stores de x = −1 à 6, la porte d'entrée de x = 3 à 4
  boite('mur-sud', SALLE.minX - EP, -1, SALLE.maxZ, SALLE.maxZ + EP, 'mur'),
  boite('vitrine-ouest', -1, PORTE.x - 0.5, SALLE.maxZ, SALLE.maxZ + EP, 'mur'),
  boite('porte-entree', PORTE.x - 0.5, PORTE.x + 0.5, SALLE.maxZ, SALLE.maxZ + EP, 'porte'),
  boite('vitrine-est', PORTE.x + 0.5, SALLE.maxX + EP, SALLE.maxZ, SALLE.maxZ + EP, 'mur'),
  // le couloir des toilettes : deux cloisons, de la porte du WC jusqu'à 0,6 m dans la salle (le sas, à côté du téléphone)
  boite('cloison-couloir-ouest', -2.7, -2.6, -7.7, -3.9, 'cloison'),
  boite('cloison-couloir-est', -1.4, -1.3, -7.7, -3.9, 'cloison'),
  boite('porte-wc', -2.6, -1.4, -7.7, -7.5, 'porte'),
  // au sud du zinc, la réserve fermée : on ne passe derrière le zinc que par son bout nord
  boite('reserve', SALLE.minX, -3.8, 2.5, SALLE.maxZ, 'mur'),
]
const meubles = [
  boite('zinc', -4.4, -3.8, -3.0, 2.5, 'meuble'),          // façade à x = −3,8, du nord (z = −3) au sud (z = 2,5)
  boite('etageres', SALLE.minX, -5.6, -1.2, 2.5, 'meuble'), // les étagères rétroéclairées et le miroir, derrière le zinc
  carre('table-A', TABLES.A, DEMI_TABLE), carre('table-B', TABLES.B, DEMI_TABLE),
  carre('table-C', TABLES.C, DEMI_TABLE), carre('table-D', TABLES.D, DEMI_TABLE),
  carre('mange-debout-est', point(5.65, -0.45), DEMI_TABLE),
  carre('mange-debout-porte', MANGE_DEBOUT_PORTE, DEMI_TABLE),
  boite('jukebox', ANCRES.jukebox.x - 0.35, ANCRES.jukebox.x + 0.35, 3.8, SALLE.maxZ, 'meuble'),
  boite('babyfoot', ANCRES.babyfoot.x - 0.75, ANCRES.babyfoot.x + 0.75, ANCRES.babyfoot.z - 0.4, ANCRES.babyfoot.z + 0.4, 'meuble'),
]
// les patrons attablés et les ouvriers : on ne les traverse pas (ni la voix ni la vue ne s'y arrêtent)
const personnes = [
  ...SIEGES.filter(s => s.occupant).map(s => carre(s.occupant, s, DEMI_PERSONNE)),
  ...ANCRES.ouvriers.map((o, i) => carre(`ouvrier-${i + 1}`, o, DEMI_PERSONNE)),
]
export const BOITES = Object.freeze([...murs, ...meubles, ...personnes])

// ─── Les zones ─────────────────────────────────────────────────────
// interdite : derrière le zinc et l'arrière-cuisine (la jauge monte, Fernand voit toujours le zinc) ; privee : 2,5 m
// autour des tables A et B ; discrete : le couloir des toilettes, son sas et le WC, à l'écart de la salle ; comptoir :
// devant le zinc (le premier passage au zinc, les 20 s au zinc). Un rectangle (bornes exclues) ou un cercle.
// La zone discrète est un lieu, jamais un verdict de vue : qui y voit Viktor se décide toujours par vueLibre et le cône
// de chacun (tâches B3 et B11), y compris pour la baisse « hors de la vue de tous », jamais par dansZone('discrete').
// Son couloir s'ouvre au sud sur la salle : on voit son sas de presque partout, et le couloir lui-même de loin dans
// son axe (du centre de la table A, jusqu'à 1,6 m au-delà du mur nord ; de la place de Fernand, 0,75 m).

export const TYPES_ZONE = Object.freeze(['interdite', 'privee', 'discrete', 'comptoir'])
const rect = (zone, minX, maxX, minZ, maxZ) => Object.freeze({ zone, minX, maxX, minZ, maxZ })
const cercle = (zone, c, rayon) => Object.freeze({ zone, x: c.x, z: c.z, rayon })
export const ZONES = Object.freeze([
  rect('interdite', SALLE.minX, -3.8, SALLE.minZ, 2.5),    // derrière le zinc, et le passage à son bout nord
  rect('interdite', -9, SALLE.minX, SALLE.minZ, 0),         // l'arrière-cuisine, derrière sa porte
  cercle('privee', TABLES.A, 2.5),
  cercle('privee', TABLES.B, 2.5),
  rect('discrete', -2.6, -1.4, -7.5, -3.9),                 // le couloir et son sas
  rect('discrete', -2.6, -1.4, -9, -7.5),                   // le WC
  rect('comptoir', -3.8, -2.6, -3.0, 2.5),
])

const contient = (z, p) => ('rayon' in z
  ? Math.hypot(p.x - z.x, p.z - z.z) < z.rayon
  : p.x > z.minX && p.x < z.maxX && p.z > z.minZ && p.z < z.maxZ)

// Le point p est-il dans une zone de ce type ? Un type inconnu est une erreur.
export function dansZone(type, p) {
  if (!TYPES_ZONE.includes(type)) throw new Error(`plan du Bivouac : type de zone inconnu « ${type} »`)
  return ZONES.some(z => z.zone === type && contient(z, p))
}

// Les types de zone qui contiennent p, sans doublon.
export const zonesDe = p => TYPES_ZONE.filter(type => dansZone(type, p))

// ─── Segments et boîtes ────────────────────────────────────────────

// Le segment a → b passe-t-il à l'intérieur de la boîte ? Longer son bord, s'arrêter contre elle ou toucher son coin ne
// compte pas (bornes exclues, comme le contact bord à bord de moveCircle). Méthode des tranches : la part du segment
// (t de 0 à 1) comprise dans la boîte sur chaque axe ; appelée à chaque image, pour chaque foyer et chaque boîte, elle
// n'alloue rien.
export function coupe(a, b, boite) {
  let t0 = 0, t1 = 1
  const dx = b.x - a.x, dz = b.z - a.z
  if (dx === 0) {
    if (a.x <= boite.minX || a.x >= boite.maxX) return false
  } else {
    const ta = (boite.minX - a.x) / dx, tb = (boite.maxX - a.x) / dx
    t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb))
  }
  if (dz === 0) {
    if (a.z <= boite.minZ || a.z >= boite.maxZ) return false
  } else {
    const ta = (boite.minZ - a.z) / dz, tb = (boite.maxZ - a.z) / dz
    t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb))
  }
  return t1 - t0 > 1e-9
}

// Rien n'arrête la vue de a à b : ni mur, ni cloison, ni porte (un meuble, une personne la laissent passer).
export function vueLibre(a, b, boites = BOITES) {
  return !boites.some(boite => boite.son !== 'meuble' && coupe(a, b, boite))
}
