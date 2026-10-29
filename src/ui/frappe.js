// La frappe d'un sous-titre au temps de jeu (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.4 et §3.14 ;
// plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B4). Module pur : ni DOM, ni minuteur, ni horloge, ni hasard.
// Une réplique se tape lettre à lettre, et seulement quand on appelle update(dt) : en pause, on ne l'appelle pas, elle
// est figée. (La frappe de l'enquête, par setTimeout, src/prologue/investigation.js:167-177, continue pendant la pause :
// un reste connu de REPRISE.md, qu'elle corrigera en passant par ce module.)
//
// dire(texte, dureeS, { masque }) remplace la réplique en cours, dont rien ne reste ; rien de la nouvelle n'est frappé
// avant le prochain update. Elle se tape en dureeS secondes de jeu (absente : dureeFrappe(texte) ; nulle ou invalide :
// toute à la prochaine image), lettres régulièrement espacées : la k-ième des n à k × dureeS / n, la dernière à dureeS,
// et fini devient vrai. Les mots sont les morceaux du texte entre deux blancs, ceux de decouper (src/bar/ecoute.js).
// La fonction masque(i, mot) dit si le mot i est masqué : elle est appelée une seule fois par mot, dans l'ordre, quand sa
// première lettre est frappée, et sa réponse ne change plus, même si ce qu'elle a lu change ensuite (absente ou fausse :
// rien n'est masqué). Un mot masqué s'affiche « … » dès cette lettre ; des mots masqués voisins n'en font qu'un. Un texte
// qui n'est pas une chaîne, ou une option masque qui n'est pas une fonction, est une erreur, et la réplique en cours
// continue. toutAfficher() frappe d'un coup ce qui reste (clic droit, ou Espace lue par e.code 'Space', branchés par
// l'appelant) : les mots restants se décident à cet instant.
//
// texte : ce qui est frappé, mots masqués en « … », les mots séparés d'une espace (comme masquer, src/bar/ecoute.js) ;
// motsFrappes : les mots commencés, en clair, le dernier coupé à sa dernière lettre frappée ; fini : toute la réplique
// est frappée (vrai sans réplique).
//
// Au Bivouac (tâches B11 et B12) : masque retient l'I du moment, Is[i], et rend !affichage(Is, f)[i] ; le sous-titre
// d'écoute est masquer(motsFrappes, Is, f), qui dit aussi « (murmures) » ; quand fini devient vrai, la réplique apprend
// son renseignement si acquis(replique, affichage(Is, f)) (src/bar/ecoute.js, tests/ui/frappe.test.js).
import { estimate } from '../briefing/kit.js'

// La frappe prend les 8 dixièmes de la durée estimée d'une réplique (estimate, src/briefing/kit.js:10, en ms) : la voix
// finit après le texte. Même règle que les cinématiques (kit.js:177) et l'enquête (investigation.js:179).
export const PART_FRAPPEE = 0.8
export const MASQUE = '…'      // un mot masqué, ou plusieurs voisins fondus en un seul (le MASQUE de src/bar/ecoute.js)

// La k-ième lettre tombe à k × durée / n, qui ne se calcule qu'à un arrondi près en images de 1/60 s : sans cette
// tolérance, une lettre due pile sur une image tomberait à la suivante.
const EPS = 1e-9

// un pas de temps ou une durée invalide (NaN, négatif, infini) compte pour zéro, comme dans src/bar/soupcon.js
const secondes = d => (Number.isFinite(d) && d > 0 ? d : 0)
const blanc = c => /\s/.test(c)

// La durée de frappe d'une réplique, en secondes de jeu.
export const dureeFrappe = texte => PART_FRAPPEE * estimate(texte) / 1000

export function createFrappe() {
  let lettres = []      // la réplique, lettre à lettre (une lettre accentuée ou « … » compte pour une)
  let mots = []         // { mot, debut, fin } : indices de sa première lettre et de la lettre qui le suit
  let masques = []      // la décision de chaque mot commencé
  let masque = null, duree = 0, t = 0
  let frappees = 0      // lettres frappées
  let commences = 0     // mots dont la première lettre est frappée : décidés

  // Frappe jusqu'à la lettre `cible` (exclue). Chaque mot commencé en route est décidé à cet instant, dans l'ordre ;
  // pendant l'appel de masque, seules les lettres d'avant ce mot comptent comme frappées.
  function frapper(cible) {
    while (commences < mots.length && mots[commences].debut < cible) {
      const i = commences
      frappees = mots[i].debut
      masques[i] = !!(masque && masque(i, mots[i].mot))
      commences = i + 1
    }
    frappees = cible
  }
  // ce qui est frappé du mot i
  const vu = i => lettres.slice(mots[i].debut, Math.min(mots[i].fin, frappees)).join('')

  return {
    dire(texte, dureeS, options = {}) {
      if (typeof texte !== 'string') throw new TypeError(`frappe : le texte doit être une chaîne (reçu : ${typeof texte})`)
      if (options === null || typeof options !== 'object') throw new TypeError('frappe : options attendues sous la forme { masque }')
      const m = options.masque || null     // absente ou fausse ({ masque: ecoute && fn }) : rien n'est masqué
      if (m !== null && typeof m !== 'function') throw new TypeError('frappe : masque doit être une fonction (i, mot) qui rend vrai si le mot est masqué')
      lettres = [...texte]
      mots = []
      lettres.forEach((c, k) => {
        if (blanc(c)) return
        const dernier = mots[mots.length - 1]
        if (dernier && dernier.fin === k) { dernier.mot += c; dernier.fin = k + 1 } else mots.push({ mot: c, debut: k, fin: k + 1 })
      })
      masques = []; masque = m; t = 0; frappees = 0; commences = 0
      duree = dureeS == null ? dureeFrappe(texte) : secondes(dureeS)
    },
    update(dt) {
      const n = lettres.length
      if (frappees >= n) return
      t += secondes(dt)
      frapper(duree > 0 ? Math.min(n, Math.floor(t * n / duree + EPS)) : n)
    },
    toutAfficher() { frapper(lettres.length) },
    get texte() {
      const sortie = []
      for (let i = 0; i < commences; i++) {
        if (!masques[i]) sortie.push(vu(i))
        else if (sortie[sortie.length - 1] !== MASQUE) sortie.push(MASQUE)
      }
      return sortie.join(' ')
    },
    get motsFrappes() { return mots.slice(0, commences).map((_, i) => vu(i)) },
    get fini() { return frappees >= lettres.length },
  }
}
