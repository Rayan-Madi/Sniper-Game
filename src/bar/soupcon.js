// La jauge de soupçon du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.6). Module pur : ni DOM,
// ni three, ni minuteur ; elle n'avance que par update(dt), au temps de jeu (en pause, on ne l'appelle pas : elle est
// figée). Valeurs : SOUPCON de src/bar/reglages.js, ou les réglages qu'on lui passe.
//
// S va de 0 à 100. À chaque image, ou bien S monte (des sources sont actives et quelqu'un voit Viktor), ou bien il
// redescend vers le plancher, jamais les deux. Les événements (remarqué, surpris, silence, choix de dialogue…) le
// montent d'un coup, et certains montent aussi le plancher, plafonné : les fautes laissent une trace. Paliers à
// hystérésis : CALME, MÉFIANCE, SOUPÇON, puis DÉMASQUÉ, définitif.
//
// update et evenement rendent ce que la jauge émet : { type: 'palier', de, vers, premiere } quand le palier change (au
// plus une fois par appel ; premiere : on y monte pour la première fois), puis { type: 'demasque' }, une seule fois.
import { SOUPCON } from './reglages.js'

export const PALIERS = Object.freeze(['calme', 'mefiance', 'soupcon', 'demasque'])
const DEMASQUE = PALIERS.length - 1

// Les seuils se comparent à un milliardième près : S s'additionne image par image, et 10 points par seconde pendant 6 s
// font 59,99999999999969 en images de 1/60 s. Sans cette tolérance, un seuil atteint au calcul serait franchi une image
// trop tard en montant, ou une image trop tôt en descendant.
const EPS = 1e-9

// un pas de temps invalide (NaN, absent, négatif, infini) compte pour zéro, comme dans src/prologue/state.js
const secondes = d => (Number.isFinite(d) && d > 0 ? d : 0)

// une valeur des réglages ; un nom inconnu (ou hérité, comme « toString ») est une erreur, jamais ignoré en silence
function lire(table, nom, quoi) {
  if (!Object.hasOwn(table, nom)) throw new Error(`jauge de soupçon : ${quoi} « ${nom} »`)
  return table[nom]
}

// reglages : de la forme de SOUPCON (src/bar/reglages.js).
export function createSoupcon(reglages = SOUPCON) {
  const { temoins: poids, montees, deboutSeulement, evenements, baisses, baisseHorsDeVue, plancherMax, paliers } = reglages
  const seuil = k => paliers[PALIERS[k]]           // { monte, redescend } du palier de rang k
  const plafond = seuil(DEMASQUE).monte
  for (const nom of deboutSeulement) lire(montees, nom, 'source inconnue (deboutSeulement)')
  let S = 0, plancher = 0, max = 0, rang = 0

  // poids du témoin le plus sévère parmi ceux qui voient Viktor ; 0 : personne (Albert ne compte pas)
  const vuPar = temoins => temoins.reduce((m, qui) => Math.max(m, lire(poids, qui, 'témoin inconnu')), 0)
  // montée d'une source active, par seconde, avant le poids du témoin : un nom de SOUPCON.montees, ou { nom: 'fixation',
  // qui } (une fixation compte aussi le poids de la personne fixée). Une source de deboutSeulement (« trop près », la
  // zone privée) ne compte que debout ; lue et contrôlée avant, comme les autres.
  function montee(source, debout) {
    const { nom, qui } = typeof source === 'string' ? { nom: source } : source
    const m = lire(montees, nom, 'source inconnue') * (nom === 'fixation' ? lire(poids, qui, 'témoin inconnu') : 1)
    return debout || !deboutSeulement.includes(nom) ? m : 0
  }
  // un palier compte comme atteint dès que S a touché son seuil d'entrée, même franchi d'un coup
  const atteint = k => max >= seuil(k).monte - EPS

  // Après chaque changement de S : le maximum, puis le palier, qui monte dès son seuil et ne redescend que sous le seuil
  // de sortie du palier courant (hystérésis), et jamais depuis DÉMASQUÉ.
  function suivre() {
    const de = rang, maxAvant = max
    max = Math.max(max, S)
    while (rang < DEMASQUE && S >= seuil(rang + 1).monte - EPS) rang++
    if (rang === de) while (rang > 0 && S < seuil(rang).redescend - EPS) rang--
    if (rang === de) return []
    const premiere = rang > de && maxAvant < seuil(rang).monte - EPS
    const emis = [{ type: 'palier', de: PALIERS[de], vers: PALIERS[rang], premiere }]
    if (rang === DEMASQUE) emis.push({ type: 'demasque' })
    return emis
  }

  return {
    get S() { return S },
    get plancher() { return plancher },
    get palier() { return PALIERS[rang] },
    get max() { return max },
    // pour le contrat de sortie du bar (§3.11, couverture.paliers) et le rang (§5.3)
    get paliersAtteints() { return { mefiance: atteint(1), soupcon: atteint(2) } },

    // dt : secondes de jeu. sources : les montées actives ; assis ou posé, la jauge écarte elle-même « trop près » et la
    // zone privée, qui ne valent que debout (deboutSeulement, §3.6 et §3.7). Reste à l'appelant de choisir, debout, entre
    // zonePrivee, zonePriveePretexte et rien, selon la couverture (verre, prétexte, §3.6). temoins : la catégorie de
    // chaque personne qui voit Viktor. pose : 'debout', 'assis' (sans verre) ou 'pose' (posé, un verre à la main, §3.7).
    update(dt, { sources = [], temoins = [], pose = 'debout' } = {}) {
      const pas = secondes(dt)
      if (pas === 0 || rang === DEMASQUE) return []
      const vu = vuPar(temoins)
      const baisse = lire(baisses, pose, 'pose inconnue')
      const debout = pose === 'debout'
      const hausse = sources.reduce((somme, source) => somme + montee(source, debout), 0) * vu
      if (hausse > 0) S = Math.min(plafond, S + hausse * pas)
      else S = Math.max(plancher, S - (vu > 0 ? baisse : Math.max(baisse, baisseHorsDeVue)) * pas)
      return suivre()
    },

    // nom : un événement de SOUPCON.evenements ; 'remarque' avec la catégorie de qui a remarqué Viktor ; 'choix' avec la
    // valeur du choix de dialogue (de -15 à +30 dans les données) ; 'demasque' (un choix qui démasque, ou sortir en
    // SOUPÇON).
    evenement(nom, valeur) {
      if (rang === DEMASQUE) return []
      let e
      if (nom === 'demasque') e = { s: plafond, plancher: 0 }
      else if (nom === 'choix') {
        if (!Number.isFinite(valeur)) throw new Error(`jauge de soupçon : choix sans valeur (${valeur})`)
        e = { s: valeur, plancher: 0 }
      } else if (nom === 'remarque') e = lire(evenements.remarque, valeur, 'remarque d\'un témoin inconnu')
      else e = lire(evenements, nom, 'événement inconnu')
      plancher = Math.min(plancherMax, plancher + e.plancher)
      S = Math.min(plafond, Math.max(plancher, S + e.s))
      return suivre()
    },
  }
}
