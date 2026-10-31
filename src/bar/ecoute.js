// L'écoute du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.4). Module pur : ni DOM, ni three, ni
// minuteur, et un hasard toujours à graine. Ce que Viktor comprend d'une réplique, à chaque image :
//   I = A(d / voix) × T × O(α) × (1 − N), entre 0 et 1
// d : distance au sol de son oreille à la bouche ; T : ce que laissent passer les boîtes du plan coupées par la ligne
// oreille-bouche (src/bar/plan.js) ; α : angle entre son regard et la source ; N : le bruit de la salle et du juke-box.
// Chaque mot d'une réplique a une fragilité tirée d'une graine propre à la réplique (0,8 pour un mot-clé) : il s'affiche
// si I l'atteint au moment où sa première lettre est frappée, puis ne change plus. Un renseignement s'apprend à la fin
// de sa réplique si tous ses mots-clés se sont affichés. Valeurs : ECOUTE de src/bar/reglages.js.
//
// Une réplique : { texte, motsCles?, renseignement? } ; motsCles, les expressions du texte qu'il faut lire pour
// apprendre le renseignement (« vieille route », « sept heures et quart »), reconnues sans égard à la casse ni à la
// ponctuation, à chacune de leurs occurrences ; une réplique qui porte un renseignement en a au moins une (sinon,
// erreur). Les mots sont ceux de la frappe (motsDe, src/ui/frappe.js) : les morceaux du texte entre deux blancs, un
// morceau sans lettre ni chiffre (« ? », « … ») rattaché au mot d'avant par une espace insécable, si bien qu'il ne se
// masque jamais seul (choix de B5, spec §3.4, « Réglé en B5 »).
//
// Côté frappe (src/ui/frappe.js, tâche B4) : quand la première lettre du mot i est frappée, on retient l'I du moment ;
// affichage(Is, f) dit ce qui s'est affiché, masquer(mots frappés, Is, f) donne le sous-titre, et à la fin de la
// réplique, acquis(replique, affichage(Is, f)).
import { ECOUTE } from './reglages.js'
import { coupe } from './plan.js'
import { generateur } from '../shot/acoustics.js'
import { motsDe } from '../ui/frappe.js'

export const MURMURES = '(murmures)'   // tout le sous-titre, quand rien n'a été frappé au-dessus de ECOUTE.murmuresSous
export const MASQUE = '…'              // un mot masqué, ou plusieurs voisins fondus en un seul

const DEGRES = 180 / Math.PI

// A(x), x : la distance rapportée à la voix (m). 1 jusqu'à pleineM, 0 dès nulleM, une courbe douce entre les deux.
export function audibilite(x) {
  const { pleineM, nulleM } = ECOUTE
  if (x <= pleineM) return 1
  if (x >= nulleM) return 0
  const u = (nulleM - x) / (nulleM - pleineM)
  return u * u * (3 - 2 * u)
}

// Ce que laisse passer une boîte ; un son inconnu est une erreur : une boîte mal écrite ne doit pas devenir transparente
// en silence.
function laisse(boite) {
  if (!Object.hasOwn(ECOUTE.transmission, boite.son)) {
    throw new Error(`écoute : son inconnu « ${boite.son} » (${boite.id ?? 'boîte sans nom'})`)
  }
  return ECOUTE.transmission[boite.son]
}

// T : produit de ce que laissent passer les boîtes que le segment a → b traverse (longer une boîte, s'arrêter contre
// elle ou toucher son coin ne la traverse pas, plan.js:coupe). Un meuble laisse tout passer.
export function transmission(a, b, boites) {
  let T = 1
  for (const boite of boites) {
    const passe = laisse(boite)
    if (passe !== 1 && coupe(a, b, boite)) T *= passe
  }
  return T
}

// O(α), α en degrés de 0 à 180 : 1 jusqu'à orientationLibreDeg, puis linéaire jusqu'à orientationDos dos tourné.
function orientation(alpha) {
  const { orientationLibreDeg: libre, orientationDos: dos } = ECOUTE
  return alpha <= libre ? 1 : 1 - (1 - dos) * (alpha - libre) / (180 - libre)
}

// N : le brouhaha de la salle, plus le juke-box en deçà de jukeboxM (pas de juke-box : la salle seule).
function bruit(oreille, jukebox) {
  const { bruitFond, bruitJukebox, jukeboxM } = ECOUTE
  if (!jukebox) return bruitFond
  return bruitFond + bruitJukebox * Math.max(0, 1 - Math.hypot(jukebox.x - oreille.x, jukebox.z - oreille.z) / jukeboxM)
}

// I, de 0 à 1. oreille : { x, z } ; regard : direction au sol { x, z }, de n'importe quelle longueur (forwardOf du
// contrôleur) ; source : { x, z, voix } (voix de ECOUTE.voix, normale si absente ; nulle ou négative, rien) ; boites :
// celles du plan ; jukebox : { x, z } ou null.
export function intelligibilite(oreille, regard, source, boites, jukebox) {
  const voix = source.voix ?? ECOUTE.voix.normale
  if (!(voix > 0)) return 0
  const dx = source.x - oreille.x, dz = source.z - oreille.z
  const d = Math.hypot(dx, dz)
  const A = audibilite(d / voix)
  if (A === 0) return 0
  // angle entre le regard et la source, par atan2 (exact à 0° comme à 180°) ; sans direction, rien ne se perd
  const alpha = d > 0 && (regard.x || regard.z)
    ? Math.atan2(Math.abs(regard.x * dz - regard.z * dx), regard.x * dx + regard.z * dz) * DEGRES : 0
  const I = A * transmission(oreille, source, boites) * orientation(alpha) * (1 - bruit(oreille, jukebox))
  return Math.min(1, Math.max(0, I))
}

// ─── Les mots ──────────────────────────────────────────────────────

// la forme d'un mot pour reconnaître un mot-clé : minuscules, apostrophe droite, sans la ponctuation qui l'entoure
const forme = mot => mot.normalize('NFC').toLowerCase().replace(/’/g, '\'').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

// Les mots de la réplique, dans l'ordre : [{ mot, cle }] ; cle : il fait partie d'un mot-clé. Un mot-clé absent du texte,
// ou sans lettre ni chiffre, est une erreur (les données de src/bar/textes.js sont fausses), comme un renseignement
// sans mot-clé, qui ne s'apprendrait jamais sans que rien ne le dise.
export function decouper(replique) {
  const texte = replique.texte.trim()
  const motsCles = replique.motsCles || []
  if (replique.renseignement && !motsCles.length) {
    throw new Error(`écoute : « ${replique.texte} » porte le renseignement « ${replique.renseignement} » sans mot-clé`)
  }
  const mots = motsDe(texte).map(({ mot }) => ({ mot, cle: false }))
  const formes = mots.map(m => forme(m.mot))
  for (const expression of motsCles) {
    const cherche = expression.trim().split(/\s+/).map(forme)
    if (!cherche.every(Boolean)) throw new Error(`écoute : mot-clé vide ou sans lettre « ${expression} » dans « ${replique.texte} »`)
    let trouve = false
    for (let i = 0; i + cherche.length <= formes.length; i++) {
      if (!cherche.every((f, k) => formes[i + k] === f)) continue
      trouve = true
      for (let k = 0; k < cherche.length; k++) mots[i + k].cle = true
    }
    if (!trouve) throw new Error(`écoute : mot-clé « ${expression} » absent de « ${replique.texte} »`)
  }
  return mots
}

// graine d'une réplique tirée de son texte (FNV-1a, comme les acoustiques de src/shot/acoustics.js)
function graineDu(texte) {
  let h = 0x811c9dc5
  for (const ch of String(texte)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return h >>> 0
}

// La fragilité de chaque mot : fragiliteCle pour un mot-clé, sinon tirée entre 0 et fragiliteMax par le générateur à
// graine de src/shot/acoustics.js. Même réplique et même graine : mêmes fragilités, d'une image à l'autre. Un tirage par
// mot, mot-clé compris : changer les mots-clés ne déplace pas les autres.
export function fragilites(replique, graine = graineDu(replique.texte)) {
  const hasard = generateur(graine)
  return decouper(replique).map(m => {
    const tirage = hasard()
    return m.cle ? ECOUTE.fragiliteCle : tirage * ECOUTE.fragiliteMax
  })
}

const auMoment = (I, i) => (Array.isArray(I) ? I[i] : I)
const audible = v => Number.isFinite(v) && v >= ECOUTE.murmuresSous

// Ce qui s'affiche de chaque mot : I atteint sa fragilité, et les murmures sont passés. I : un nombre pour tous les mots,
// ou l'I de chacun au moment où il a été frappé (absent : pas encore frappé, pas affiché).
export function affichage(I, fragilites) {
  return fragilites.map((f, i) => { const v = auMoment(I, i); return audible(v) && v >= f })
}

// Le sous-titre des mots (ceux déjà frappés) : les mots masqués deviennent « … », plusieurs voisins n'en font qu'un ;
// « (murmures) » si aucun n'a été frappé au-dessus de murmuresSous.
export function masquer(mots, I, fragilites) {
  if (!mots.length) return ''
  if (!mots.some((_, i) => audible(auMoment(I, i)))) return MURMURES
  const vus = affichage(I, fragilites)
  const sortie = []
  mots.forEach((mot, i) => {
    if (vus[i]) sortie.push(mot)
    else if (sortie[sortie.length - 1] !== MASQUE) sortie.push(MASQUE)
  })
  return sortie.join(' ')
}

// Le renseignement de la réplique est-il appris ? Oui si elle en porte un et que chacun de ses mots-clés s'est affiché
// au moment où il a été frappé (affiches : affichage(Is, fragilites), un booléen par mot). Être à portée au début de la
// réplique ne suffit pas. Un renseignement a toujours au moins un mot-clé : decouper refuse le contraire.
export function acquis(replique, affiches) {
  if (!replique.renseignement) return false
  const cles = decouper(replique).flatMap((m, i) => (m.cle ? [i] : []))
  return cles.every(i => affiches[i] === true)
}
