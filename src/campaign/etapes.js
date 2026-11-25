// M5 en deux temps dans la sauvegarde : le Bivouac, puis le convoi (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md
// §2, §3.11 et §6 ; plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B13). Module pur : ni DOM, ni stockage, ni
// minuteur, ni hasard. Il dit où reprend M5 et ce que chaque fin change dans l'état de campagne (src/upgrades.js, state) ;
// sauvegarder reste à l'appelant (saveProgress), quand une transition le demande.
//
// state.m5 = { etape: 'bar' | 'convoi',
//              renseignements: { trajet, vehicule, place, heure, leurre, appel, allie },   // booléens
//              couverture: { soupconMax, paliers: { mefiance, soupcon }, dureeS } | null }
// Au bar, rien n'est appris et il n'y a pas de couverture : aucune transition n'y mène autrement (tableau du §6).

// Les sept renseignements du contrat de sortie du bar, dans son ordre (NOMS de src/bar/renseignements.js, recopiés ici :
// la sauvegarde est dans le bundle principal, le bar se charge à la demande ; tests/campaign/etapes.test.js les compare).
export const RENSEIGNEMENTS = Object.freeze(['trajet', 'vehicule', 'place', 'heure', 'leurre', 'appel', 'allie'])

// Les fins du bar (contrat de sortie du §3.11) : celles qui mènent au convoi, et celles qui laissent M5 au bar.
const VERS_LE_CONVOI = ['sorti', 'passe', 'erreur']
const RESTE_AU_BAR = ['demasque', 'abandon']   // démasqué : écran d'échec, RECOMMENCER rejoue le bar ; abandon : menu

// Les choix de l'écran d'échec du convoi : seul RETOURNER AU BIVOUAC change l'état (décision 5).
export const CHOIX_ECHEC = Object.freeze(['recommencer', 'briefing', 'menu', 'bivouac'])

const objet = v => v !== null && typeof v === 'object' && !Array.isArray(v)
// un booléen de la sauvegarde n'est vrai que s'il vaut exactement true (« true », 1 ou {} n'en sont pas)
const vrai = v => v === true
const nombre = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

// M5 au départ : le bar, rien d'appris, sans couverture. Un objet neuf à chaque appel.
export function m5Neuf() {
  return { etape: 'bar', renseignements: Object.fromEntries(RENSEIGNEMENTS.map(n => [n, false])), couverture: null }
}

// La couverture du bar (§3.11), ou null si elle est absente ou invalide : S de 0 à 100 (la jauge, §3.6), une durée de
// soirée finie et positive, des paliers. Seuls ses champs sont gardés, dans un objet neuf.
function nettoyerCouverture(c) {
  if (!objet(c) || !nombre(c.soupconMax, 0, 100) || !nombre(c.dureeS, 0, Infinity) || !objet(c.paliers)) return null
  return { soupconMax: c.soupconMax, paliers: { mefiance: vrai(c.paliers.mefiance), soupcon: vrai(c.paliers.soupcon) },
    dureeS: c.dureeS }
}

// L'état de M5 relu d'une sauvegarde (ou d'un contrat de sortie) : toujours l'un de ceux du tableau du §6. Absent ou
// abîmé : le bar ; étape inconnue : le bar ; au bar, tout à zéro ; un booléen n'est vrai que s'il vaut true ; seuls les
// sept renseignements restent ; une couverture invalide devient null. Un objet neuf, jamais le brut.
export function nettoyerM5(brut) {
  if (!objet(brut) || brut.etape !== 'convoi') return m5Neuf()
  const r = objet(brut.renseignements) ? brut.renseignements : {}
  return { etape: 'convoi', renseignements: Object.fromEntries(RENSEIGNEMENTS.map(n => [n, vrai(r[n])])),
    couverture: nettoyerCouverture(brut.couverture) }
}

// Où reprend M5 : 'bar' ou 'convoi'. Un état sans m5 (ancienne sauvegarde) ou abîmé reprend au bar.
export function etapeM5(state) {
  return nettoyerM5(state && state.m5).etape
}

// Après le bar, avec le contrat de sortie { resultat, renseignements, couverture } de src/bar/index.js (onSortie au
// début du bilan pour sorti et passe, onDone pour erreur). Sorti, passé ou erreur : le convoi, avec ce que Viktor a appris
// et sa couverture, nettoyés comme une sauvegarde ; rend true, à sauvegarder avant le bilan. Démasqué ou abandon : rien
// ne change ; rend false. Une sortie absente ou un résultat inconnu est une erreur (state intact).
export function apresBar(state, sortie) {
  const resultat = objet(sortie) ? sortie.resultat : undefined
  if (RESTE_AU_BAR.includes(resultat)) return false
  if (!VERS_LE_CONVOI.includes(resultat)) throw new Error(`M5 : fin du bar inconnue « ${resultat} »`)
  state.m5 = nettoyerM5({ etape: 'convoi', renseignements: sortie.renseignements, couverture: sortie.couverture })
  return true
}

// Après un échec du convoi, selon le bouton de l'écran d'échec (CHOIX_ECHEC). RETOURNER AU BIVOUAC ('bivouac') : le bar,
// tout à zéro ; rend true, à sauvegarder. RECOMMENCER, REVOIR LE BRIEFING, MENU PRINCIPAL : rien ne change, les
// renseignements restent (décision 5) ; rend false. Un choix inconnu est une erreur (state intact).
export function apresEchecConvoi(state, choix) {
  if (!CHOIX_ECHEC.includes(choix)) throw new Error(`M5 : choix inconnu après l'échec du convoi « ${choix} »`)
  if (choix !== 'bivouac') return false
  state.m5 = m5Neuf()
  return true
}

// M5 réussie : le bar, tout à zéro, sauvegardé avec la réussite (recordClear, puis saveProgress). Rend l'état d'avant,
// nettoyé : ce que Viktor savait, que le rapport lit (§5.3) une fois l'état remis à zéro.
export function apresReussiteM5(state) {
  const savait = nettoyerM5(state.m5)
  state.m5 = m5Neuf()
  return savait
}

// Remet M5 au bar, tout à zéro : nouvelle campagne, sauvegarde effacée, saut direct à une mission (src/upgrades.js,
// src/campaign/progress.js).
export function remettreM5(state) {
  state.m5 = m5Neuf()
}
