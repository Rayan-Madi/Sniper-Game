// La frappe d'un sous-titre au temps de jeu (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.4 et §3.14 ;
// plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B4). Module pur : ni DOM, ni minuteur, ni horloge, ni hasard.
// Une réplique se tape lettre à lettre, et seulement quand on appelle update(dt) : en pause, on ne l'appelle pas, elle
// est figée. (La frappe de l'enquête, par setTimeout, src/prologue/investigation.js:167-177, continue pendant la pause :
// un reste connu de REPRISE.md, qu'elle corrigera en passant par ce module.)
//
// dire(texte, dureeS, { masque }) remplace la réplique en cours, dont rien ne reste ; rien de la nouvelle n'est frappé
// avant le prochain update. Elle se tape en dureeS secondes de jeu (absente : dureeFrappe(texte) ; nulle ou invalide :
// toute à la prochaine image), lettres régulièrement espacées : la k-ième des n à k × dureeS / n, la dernière à dureeS,
// et fini devient vrai. Les mots sont ceux de motsDe (ci-dessous), que decouper (src/bar/ecoute.js) prend aussi : les
// morceaux du texte entre deux blancs, la ponctuation seule (« ? », « … ») rattachée à son mot par une espace insécable.
// La fonction masque(i, mot) dit si le mot i est masqué : elle est appelée une seule fois par mot, dans l'ordre, quand sa
// première lettre est frappée, et sa réponse ne change plus, même si ce qu'elle a lu change ensuite (absente ou fausse :
// rien n'est masqué). Un mot masqué s'affiche « … » dès cette lettre ; des mots masqués voisins n'en font qu'un. Si masque
// lève une erreur, elle remonte d'update ou de toutAfficher, jamais avalée : le mot n'est ni décidé ni frappé, et il se
// redécide au prochain appel (rien n'est perdu ; tant que masque échoue, l'erreur revient à chaque appel). Un texte qui
// n'est pas une chaîne, ou une option masque qui n'est pas une fonction, est une erreur, et la réplique en cours
// continue. toutAfficher() frappe d'un coup ce qui reste (clic droit, ou Espace lue par e.code 'Space', branchés par
// l'appelant) : les mots restants se décident à cet instant.
//
// texte : ce qui est frappé, mots masqués en « … », les mots séparés d'une espace (comme masquer, src/bar/ecoute.js) ;
// motsFrappes : les mots commencés, en clair, le dernier coupé à sa dernière lettre frappée (les blancs qu'un mot
// englobe y sont déjà insécables) ; fini : toute la réplique est frappée (vrai sans réplique).
//
// Au Bivouac (tâches B11 et B12) : masque retient l'I du moment, Is[i], et rend !affichage(Is, f)[i] ; le sous-titre
// d'écoute est masquer(motsFrappes, Is, f), qui dit aussi « (murmures) » ; quand fini devient vrai, la réplique apprend
// son renseignement si acquis(replique, affichage(Is, f)) (src/bar/ecoute.js, tests/ui/frappe.test.js). masque ne fait
// que lire : l'I de l'image, calculé avant update, et f = fragilites(replique), calculées avant dire (elles lèvent sur
// une donnée fausse). toutAfficher ne sert qu'aux répliques sans masque (Viktor, dialogues, objets) : sur une réplique
// écoutée, il ferait apprendre le renseignement avant la fin de la réplique (spec §3.4, « Réglé en B4 »).
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

export const INSECABLE = ' '
const PLEIN = /[\p{L}\p{N}]/u        // un mot a au moins une lettre ou un chiffre

// Les lettres de debut à fin (exclue), les blancs qu'elles englobent écrits en une seule espace insécable.
const ecrire = (lettres, debut, fin) => lettres.slice(debut, fin).join('').replace(/\s+/g, INSECABLE)

// Les mots d'un texte, dans l'ordre : [{ mot, debut, fin }], debut et fin comptés en lettres de [...texte] (une lettre
// accentuée ou « … » compte pour une), fin exclue. Un mot est un morceau du texte entre deux blancs ; un morceau sans
// lettre ni chiffre (« ? », « ! », « … », un guillemet) se rattache au mot d'avant, ou au suivant s'il ouvre le texte (un
// texte sans lettre ni chiffre ne fait qu'un mot) : il se frappe, s'affiche et se masque avec lui, jamais seul. Les
// blancs que le mot englobe s'écrivent en une seule espace insécable, qui ne coupe pas la ligne (choix de B5, spec §3.4,
// « Réglé en B5 » : « Tu es sourd ? » donne « Tu », « es », « sourd ? », insécable).
export function motsDe(texte) {
  const lettres = [...texte]
  const morceaux = []
  lettres.forEach((c, k) => {
    if (blanc(c)) return
    const dernier = morceaux[morceaux.length - 1]
    if (dernier && dernier.fin === k) dernier.fin = k + 1
    else morceaux.push({ debut: k, fin: k + 1 })
  })
  const mots = []
  let ouvre = null      // la ponctuation qui ouvre le texte attend le premier mot : son début
  for (const m of morceaux) {
    if (PLEIN.test(lettres.slice(m.debut, m.fin).join(''))) {
      mots.push({ debut: ouvre ?? m.debut, fin: m.fin })
      ouvre = null
    } else if (mots.length) mots[mots.length - 1].fin = m.fin
    else ouvre ??= m.debut
  }
  if (ouvre !== null) mots.push({ debut: ouvre, fin: morceaux[morceaux.length - 1].fin })
  return mots.map(m => ({ mot: ecrire(lettres, m.debut, m.fin), debut: m.debut, fin: m.fin }))
}

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
  // ce qui est frappé du mot i (ses blancs, insécables)
  const vu = i => ecrire(lettres, mots[i].debut, Math.min(mots[i].fin, frappees))

  return {
    dire(texte, dureeS, options = {}) {
      if (typeof texte !== 'string') throw new TypeError(`frappe : le texte doit être une chaîne (reçu : ${typeof texte})`)
      if (options === null || typeof options !== 'object') throw new TypeError('frappe : options attendues sous la forme { masque }')
      const m = options.masque || null     // absente ou fausse ({ masque: ecoute && fn }) : rien n'est masqué
      if (m !== null && typeof m !== 'function') throw new TypeError('frappe : masque doit être une fonction (i, mot) qui rend vrai si le mot est masqué')
      lettres = [...texte]
      mots = motsDe(texte)
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
