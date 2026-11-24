// Données de mission (spec du lot 3, §2 a, approche B ; plan du lot 3a, tâche A2). Une mission par fichier, m1.js à
// m6.js : des données pures (ni three ni DOM), que main.js lit au montage de la mission (mountLevel) et que les tâches
// du socle branchent une à une. Elles portent les valeurs du jeu d'aujourd'hui ; les sous-lots 3b à 3d y mettent les
// vraies, mission par mission.
//
// La carte d'une mission (MAP_BUILDERS[numero - 1], src/maps/) ne dit que son décor : son sol (groundY), son écho
// (acoustics), sa pluie (rain) et ses ancres nommées (ancres). La mission cite ces ancres par leur nom ; chaque ancre
// citée existe dans sa carte, de la bonne sorte (contrat gardé par tests/campaign/missions.test.js).
//
// Sortes d'ancres (ancres d'une carte) :
//   point     [x, y, z] (m) : oeil (l'œil du tireur), regard (le point regardé au départ), cadenas (M3)…
//   zone      { minX, maxX, minZ, maxZ } (m) : le rectangle où les PNJ apparaissent et marchent
//   route     { z, depart, sens } : une route le long de X, à z ; un véhicule y entre à x = depart, vers +X (sens 1) ou
//             vers -X (sens -1)
//   places    { nom: { x, z, assise, debout } } : où une cible est posée ; assise : la hauteur du personnage assis (m),
//             debout : [dx, dz], où il se tient une fois levé, depuis l'assise (m) ; les deux sont facultatifs
//   sorties   { nom: { x, z } } et abris { nom: { x, z } } : sorties et abris nommés (spec §2 f) ; aucun aujourd'hui
// Chaque carte rend oeil, zone, places, sorties et abris (ces trois-là vides au besoin), plus les points et routes que
// ses missions citent.
//
// Champs d'une mission :
//   numero       1 à 6 : l'ordre de la campagne, et sa carte, MAP_BUILDERS[numero - 1]
//   nom          le titre du HUD
//   points       les points d'amélioration gagnés à la réussite
//   poste        { oeil, regard } : ancres de l'œil du tireur et du point regardé au départ ; regard null : la vue part
//                à l'horizontale, vers -Z
//   zone         ancre de la zone des PNJ
//   zoom         { depart, min, max } : zoom de la lunette au départ (posé par mountLevel), le plus petit et le plus grand
//                à la molette (au moins ×1) ; max est celui de base, que l'amélioration Lunette multiplie par
//                1 + 0,15 × niveau (décision 2 ; getStats().maxZoomScale, src/upgrades.js ; bornesDuZoom, src/aim.js)
//   zero         le réglage de la lunette (m) : la distance qu'annonce Anton au briefing (décision 1 de la spec du lot 3),
//                affichée « ZÉRO n m » ; la balle recroise la ligne de visée à cette distance (src/shot/ballistics.js).
//                Déjà la vraie valeur, même pour M3, M4 et M5, que leurs sous-lots (3c, 3d) n'ont pas encore mises à
//                leur distance : de 20 à 44 m de leur poste, la balle y passe au-dessus de la visée, de 2 à 4 cm en M3
//                et M5, de 6 à 13 cm en M4 (réglée à 430 m)
//   profil       profil de caméra (spec §2 b) : near et far (m) ; brume { type: 'lin', couleur, debut, fin } ou
//                { type: 'exp2', couleur, densite } ; soleil { pos, cible } ; cadreOmbre, le demi-côté du cadre d'ombre
//                du soleil (m). mountLevel l'applique après la carte (applyCameraProfile, src/gfx/cameraProfile.js),
//                qui ne pose plus de brume ; hors mission (menu, PvP, fin de l'enquête), le profil hors mission revient.
//                Le soleil d'une mission se règle ici seulement : la carte ne le déplace pas (le profil, posé après
//                elle, l'écraserait sans bruit).
//   casting      { cibles, gardes, civils } (spec §2 d ; tâche A6 : chaque cible a son visage, sans tirage).
//                cibles : une entrée par cible, { modele, femme }, posée au hasard dans la zone. modele : le modèle de
//                son portrait, le fichier d'un modèle de src/characters.js (MODELS), cherché dans tous les pools ; une
//                erreur au montage s'il n'existe pas. femme : le sexe du personnage de secours (modèle absent), celui du
//                modèle. Facultatifs : teinte (celle du modèle entier ; sans elle, aucune : la texture du portrait),
//                teinteMaillage ({ maillage: teinte } : celle de ces maillages seulement, le polo de Marc), place (une
//                ancre de places, où la cible est posée au lieu du hasard), routine ('telephone' : assise au téléphone,
//                tant qu'elle ne fuit pas).
//                gardes { nombre, modele, teinte } : leur nombre ; modele, le modèle de tous les gardes de la mission
//                (et leur teinte, aucune sans elle), sinon un modèle tiré dans le pool des gardes.
//                civils { nombre, danse, exclure } : un nombre, ou [min, max] tiré au hasard (nombreDeCivils) ; danse : la
//                foule danse (la fête) ; exclure : les modèles écartés de leur tirage, les sosies des cibles (la règle
//                « aucun modèle partagé » vaut par mission ; la foule de M6 partage exprès celui du commanditaire)
//   allure       { cibles, gardes, imprevisibles } : le pas des PNJ (m/s), celui des cibles, que les civils suivent
//                aussi, et celui des gardes ; imprevisibles : les cibles changent d'activité plus souvent (src/npc.js)
//   marqueurs    le marqueur rouge au-dessus des cibles : en M1 seulement, le tutoriel (tâche A7). Sans marqueur, les
//                cibles ont l'ombre des civils (mountLevel) : une ombre que les civils n'ont pas les désignerait
//   fiche        { ordre, entrees } : la fiche des cibles dans le HUD (#target-dossier, src/campaign/fiche.js ; tâche
//                A7). entrees : une par cible, { cibleId, nom, role, signe, portrait } : cibleId, l'indice de sa cible
//                dans casting.cibles (le HUD la barre à sa mort, le lot 4 la retrouve par lui) ; nom, role et signe,
//                ceux de son briefing ; portrait, le nom de l'image de son briefing (portrait(nom),
//                src/campaign/portraits.js), ou null sans photo. ordre : les entrées suivent l'ordre de tir du
//                briefing, numérotées dans le HUD (M3, M4)
//   fuite        'opposee' : un PNJ fuit à l'opposé du tir ; 'laterale' : vers la sortie latérale la plus proche (±X)
//   sorties, abris  noms d'ancres où une fuite fera échouer la mission (spec §2 f, tâche A8) ; aucune aujourd'hui : le
//                cône de 80° décide (main.js, checkFledTargets)
//   fenetres     fenêtres de tir (spec §2 g, tâche A8) ; aucune aujourd'hui
//   radio        lignes d'Anton dans le fil (spec §2 g, tâche A8) ; aucune aujourd'hui
//   fin          { calmeS } : les secondes de calme après la dernière cible, avant la fin ; 0 : la fin d'aujourd'hui, le
//                ralenti sur la dernière cible, puis la réussite (tâche A8 : fin différée de M3)
//   choixMoral   (M3 seulement) { cadenas, indice { apresS, texte }, points, victimes } : l'ancre du cadenas, l'indice
//                que le fil donne apresS secondes après le départ, les points et les victimes libérées par un tir sur
//                le cadenas
//   convoi       (M5 seulement) { route, vitesse } : l'ancre de la route, la vitesse du convoi (m/s)
import m1 from './m1.js'
import m2 from './m2.js'
import m3 from './m3.js'
import m4 from './m4.js'
import m5 from './m5.js'
import m6 from './m6.js'

export const MISSIONS = [m1, m2, m3, m4, m5, m6]

// La mission n (1 à 6), celle de la carte MAP_BUILDERS[(n - 1) % 6].
export function missionFor(n) {
  return MISSIONS[(n - 1) % MISSIONS.length]
}

// Nombre de civils : le nombre fixé, sans tirage ; ou [min, max], un seul tirage (random, Math.random par défaut, à
// graine dans les captures).
export function nombreDeCivils({ nombre }, random = Math.random) {
  return Array.isArray(nombre) ? nombre[0] + Math.floor(random() * (nombre[1] - nombre[0] + 1)) : nombre
}

// Casting des civils d'une mission (options de spawnCharacter, src/characters.js) : les sosies de ses cibles écartés de
// leur tirage, en mode strict (un exclu que le jeu n'a pas est une erreur) ; null sans exclusion (un modèle tiré dans le
// pool des civils, comme avant). Pour les civils du montage et les victimes que libère le cadenas de M3, des civils de
// la mission elles aussi.
export function castingDesCivils(mission) {
  const { exclure } = mission.casting.civils
  return exclure ? { exclure, strict: true } : null
}

const fini = v => typeof v === 'number' && Number.isFinite(v)
const FORMES = {
  point: a => Array.isArray(a) && a.length === 3 && a.every(fini),
  zone: a => !!a && ['minX', 'maxX', 'minZ', 'maxZ'].every(k => fini(a[k])) && a.minX < a.maxX && a.minZ < a.maxZ,
  place: a => !!a && fini(a.x) && fini(a.z) && (a.assise === undefined || fini(a.assise)) &&
    (a.debout === undefined || (Array.isArray(a.debout) && a.debout.length === 2 && a.debout.every(fini))),
  sortie: a => !!a && fini(a.x) && fini(a.z),
  abri: a => !!a && fini(a.x) && fini(a.z),
  route: a => !!a && fini(a.z) && fini(a.depart) && (a.sens === 1 || a.sens === -1),
}
const AVEC_ARTICLE = { point: 'un point', zone: 'une zone', place: 'une place', sortie: 'une sortie', abri: 'un abri', route: 'une route' }

// Les ancres que cite la mission, dans l'ordre de ses champs : { champ, sorte, nom }, plus groupe (places, sorties ou
// abris) pour une ancre rangée dans un groupe de la carte ; les autres sont à la racine de ses ancres.
export function ancresCitees(m) {
  const out = [{ champ: 'poste.oeil', sorte: 'point', nom: m.poste.oeil }]
  if (m.poste.regard) out.push({ champ: 'poste.regard', sorte: 'point', nom: m.poste.regard })
  out.push({ champ: 'zone', sorte: 'zone', nom: m.zone })
  m.casting.cibles.forEach((c, i) => {
    if (c.place) out.push({ champ: `casting.cibles[${i}].place`, sorte: 'place', groupe: 'places', nom: c.place })
  })
  m.sorties.forEach((nom, i) => out.push({ champ: `sorties[${i}]`, sorte: 'sortie', groupe: 'sorties', nom }))
  m.abris.forEach((nom, i) => out.push({ champ: `abris[${i}]`, sorte: 'abri', groupe: 'abris', nom }))
  if (m.choixMoral) out.push({ champ: 'choixMoral.cadenas', sorte: 'point', nom: m.choixMoral.cadenas })
  if (m.convoi) out.push({ champ: 'convoi.route', sorte: 'route', nom: m.convoi.route })
  return out
}

// Où va, dans les lieux de la mission, une ancre citée hors des groupes.
const LIEU = { 'poste.oeil': 'oeil', 'poste.regard': 'regard', zone: 'zone', 'choixMoral.cadenas': 'cadenas', 'convoi.route': 'route' }

// Les lieux de la mission : les ancres qu'elle cite, prises telles quelles dans celles de sa carte (ancres).
// { oeil, regard, zone, places, sorties, abris, cadenas, route } : places, sorties et abris ne gardent que les ancres
// citées ; regard, cadenas et route valent null quand la mission n'en cite pas. Erreur, qui nomme la mission, le champ
// et l'ancre, si une ancre citée manque à la carte ou n'a pas la forme de sa sorte.
export function resoudreAncres(m, ancres) {
  const qui = `M${m.numero}`
  if (!ancres) throw new Error(`${qui} : la carte ne rend pas d'ancres`)
  const lieux = { oeil: null, regard: null, zone: null, places: {}, sorties: {}, abris: {}, cadenas: null, route: null }
  const propre = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined)
  for (const c of ancresCitees(m)) {
    const a = propre(c.groupe ? propre(ancres, c.groupe) : ancres, c.nom)
    if (a === undefined) throw new Error(`${qui} : ${c.champ} : l'ancre « ${c.nom} » manque à la carte`)
    if (!FORMES[c.sorte](a)) throw new Error(`${qui} : ${c.champ} : l'ancre « ${c.nom} » n'a pas la forme d'${AVEC_ARTICLE[c.sorte]}`)
    if (c.groupe) lieux[c.groupe][c.nom] = a
    else lieux[LIEU[c.champ]] = a
  }
  return lieux
}
