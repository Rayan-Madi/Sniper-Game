// Les dialogues à choix du Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.8 et §3.14 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B5). Module pur : ni DOM, ni minuteur, ni horloge, ni hasard. Un
// dialogue n'avance que par update(dt), au temps de jeu : en pause, on ne l'appelle pas, et frappe, minuterie et
// répliques sont figées. Valeurs : DIALOGUE de src/bar/reglages.js. Les arbres du Bivouac (D1, D2, D3) sont dans
// src/bar/textes.js.
//
// Un arbre : { id, interlocuteur, entree, minuterieS?, noeuds: { id: nœud } }. interlocuteur : à qui parle Viktor (le
// regard qui fixe l'exclut, src/bar/regard.js ; la vue pivote vers lui, hors effets atténués) ; minuterieS : le temps
// pour répondre, quand ce n'est pas reglages.minuterieS (l'arbre de Sorel, src/bar/textes.js, y met
// DIALOGUE.minuterieSorelS) ; entree : le premier nœud.
// Un nœud est :
// - une réplique { qui, dit, didascalie?, didascalieApres? } (qui : la personne qui la dit ; didascalie : un geste ou un
//   ton, affiché avant ou après les mots, jamais frappé), suivie
//   - de choix : { choix: [choix], silence } ;
//   - ou de rien : { effets?, suite } (ses effets tombent à la fin de la réplique) ;
// - un aiguillage { aiguillage: [{ si?, suite }] } : la première branche dont la condition est remplie ; seule la
//   dernière est sans condition. Il ne dit rien et ne prend pas de temps.
// Un choix : { texte, didascalie?, didascalieApres?, reponse?, si?, effets?, suite } ; texte : ce que Viktor répond, le
// libellé du choix ; reponse : ce qu'on lui répond, une chaîne (dite par le qui du nœud) ou { qui?, texte, didascalie?,
// didascalieApres? } ; si : la condition pour que le choix soit montré. Le silence, quand la minuterie expire :
// { reponse?, effets?, suite, revient? } ; revient : au premier silence, la réponse est dite et la question revient une
// fois ; au second, ses effets seulement, puis sa suite (D2, Sorel : « Vous réfléchissez beaucoup. »). Une suite : l'id
// d'un nœud, ou FIN. Pas de boucle : chaque nœud est atteint, et au plus une fois par chemin (verifierArbre).
//
// Les conditions (si) : { couverture, renseignement, sans, soupconMin, soupconSous }, toutes remplies ; lues dans etat,
// un objet vivant (des accesseurs conviennent) : { couverture, renseignements, soupcon }. couverture : 'routier', ou
// null pour aucune ; renseignement et sans : un nom de renseignements (trajet, vehicule, place, heure, leurre, appel,
// allie), qui vaut exactement true ou non ; soupconMin et soupconSous : S à cette valeur ou plus, ou en dessous (S
// inconnu : ni l'un ni l'autre). Elles se lisent au moment où les choix s'affichent (les choix montrés ne changent plus
// ensuite) et où l'on passe un aiguillage.
//
// Les effets (EFFETS) ne sont pas appliqués ici : ils sont émis, une seule fois par issue, et l'appelant (la coquille du
// bar, tâche B11) les applique avant l'image suivante. soupcon : n, jauge.evenement('choix', n) ; evenement : un
// événement de la jauge (silence, silenceSorel) ; demasque : true, jauge.evenement('demasque') ; verre : 'demi' ou
// 'cafe', Viktor tient un verre (§3.7) ; couverture : 'routier' ; apprend : des noms de renseignements, au carnet ; muet :
// la personne ne parle plus à Viktor ; aide : une aide affichée ; surveille : true, « Je vous ai à l'œil » (la baisse de
// la jauge divisée par deux jusqu'à la fin, §3.14) ; ouvre : l'id d'un dialogue rendu possible (la suite de D1).
//
// Le temps : une réplique dure son estimation (350 + 62 × longueur ms, src/briefing/kit.js:10), frappée en 0,8 de ce
// temps (src/ui/frappe.js) ; la suivante commence DIALOGUE.enchainementS plus tard. Les choix s'affichent
// DIALOGUE.choixApresS après la fin de la frappe de la question, et la minuterie part ; clock() à DIALOGUE.ticsS de
// l'échéance. Un choix fait dire son texte à Viktor aussitôt, puis la réponse ; à la fin de la dernière réplique de
// l'issue tombent ses effets, puis vient sa suite. Les effets d'une issue sont la dernière chose que rend update :
// ce qui suit, et les conditions qu'on y lit, attendent l'image suivante, sans perdre de temps de jeu (ce qui était dû
// se rattrape).
//
// createDialogue(arbre, { etat, reglages }) rend { update(dt), choisir(n), deplacer(pas), valider(), toutAfficher(),
// touche(e), phase, qui, texte, didascalie, didascalieApres, choix, surbrillance, restant, delai, noeud, interlocuteur,
// fini }. update rend ce qui a été émis, dans l'ordre : { type: 'replique', qui, texte, didascalie, didascalieApres,
// dureeS } quand une réplique commence (les bips durent dureeS ; ceux de Viktor sont 'inner') ; { type: 'choix', noeud,
// choix: [{ n, texte }] } quand les choix s'affichent ; { type: 'tic', restant } ; { type: 'effets', noeud, issue,
// effets } (issue : le numéro du choix montré au joueur, de 1 à 3 après les conditions, le n de l'événement 'choix'
// et non le rang du choix dans les données ; 'silence' ; ou null pour un nœud sans choix) ; { type: 'fin' }, une fois.
// phase : 'parole' (une réplique, ou l'attente des choix), 'choix', 'fin'. texte : la réplique en cours, frappée (sans
// masque : la ponctuation y est rattachée à son mot par une espace insécable, motsDe de src/ui/frappe.js).
import { DIALOGUE } from './reglages.js'
import { createFrappe, dureeFrappe } from '../ui/frappe.js'
import { estimate } from '../briefing/kit.js'

export const FIN = 'fin'

// Les instants se comparent à un milliardième près, comme dans la jauge et la frappe : une échéance atteinte au calcul
// tombe à son image, pas à la suivante.
const EPS = 1e-9

// un pas de temps invalide (NaN, absent, négatif, infini) compte pour zéro, comme dans la jauge
const secondes = d => (Number.isFinite(d) && d > 0 ? d : 0)
const texteNonVide = v => typeof v === 'string' && v.length > 0

// ─── Les touches (lues par e.code : le clavier de Rayan est AZERTY) ──
const CODES_CHOIX = Object.freeze({ Digit1: 1, Digit2: 2, Digit3: 3, Numpad1: 1, Numpad2: 2, Numpad3: 3 })
const CODES_VALIDER = Object.freeze(['KeyE', 'Enter', 'NumpadEnter'])

// Le choix (1 à 3) d'une touche physique, e.code : la rangée des chiffres ou le pavé numérique ; null sinon. Jamais
// e.key : sur un clavier AZERTY, Digit1 écrit « & ».
export function choixDepuisCode(code) {
  return typeof code === 'string' && Object.hasOwn(CODES_CHOIX, code) ? CODES_CHOIX[code] : null
}

// Le libellé du choix n : toujours « 1 » à « 3 ». La carte du clavier que l'interface a en main pour ses autres touches
// (navigator.keyboard.getLayoutMap(), comme keyName dans src/prologue/investigation.js:292) n'est pas consultée, exprès :
// la touche Digit1 d'un clavier AZERTY écrit « & », mais le choix 1 se lit « 1 ».
export function libelleChoix(n) {
  if (n !== 1 && n !== 2 && n !== 3) throw new RangeError(`dialogue : pas de choix ${String(n)} (de 1 à 3)`)
  return String(n)
}

// ─── Conditions et effets ──────────────────────────────────────────
const CONDITIONS = Object.freeze({
  couverture: { lisible: v => v === null || texteNonVide(v), remplie: (v, e) => (e.couverture ?? null) === v },
  renseignement: { lisible: texteNonVide, remplie: (v, e) => e.renseignements?.[v] === true },
  sans: { lisible: texteNonVide, remplie: (v, e) => e.renseignements?.[v] !== true },
  soupconMin: { lisible: Number.isFinite, remplie: (v, e) => e.soupcon >= v - EPS },
  soupconSous: { lisible: Number.isFinite, remplie: (v, e) => e.soupcon < v - EPS },
})
const remplie = (si, etat) => !si || Object.entries(si).every(([cle, v]) => CONDITIONS[cle].remplie(v, etat))

const LISIBLES = Object.freeze({
  soupcon: Number.isFinite,
  evenement: texteNonVide,
  demasque: v => v === true,
  verre: texteNonVide,
  couverture: texteNonVide,
  apprend: v => Array.isArray(v) && v.length > 0 && v.every(texteNonVide),
  muet: texteNonVide,
  aide: texteNonVide,
  surveille: v => v === true,
  ouvre: texteNonVide,
})
export const EFFETS = Object.freeze(Object.keys(LISIBLES))

// ─── Vérification d'un arbre ───────────────────────────────────────

// L'arbre est-il bien formé ? Rend l'arbre, ou lève une erreur qui dit ce qui ne va pas (les données de
// src/bar/textes.js sont fausses) : suite ou entrée inconnue, nœud jamais atteint, boucle, condition ou effet inconnu
// ou illisible, réplique sans qui ni dit, choix sans texte, nœud à choix sans silence, aiguillage sans branche par
// défaut. Ce qui dépend de l'état (2 à 3 choix montrés) se contrôle quand les choix s'affichent.
export function verifierArbre(arbre) {
  if (!arbre || typeof arbre !== 'object') throw new Error('dialogue : arbre absent')
  const erreur = message => { throw new Error(`dialogue « ${String(arbre.id)} » : ${message}`) }
  if (!texteNonVide(arbre.id)) erreur('sans id')
  if (!texteNonVide(arbre.interlocuteur)) erreur('sans interlocuteur')
  if (arbre.minuterieS !== undefined && !(Number.isFinite(arbre.minuterieS) && arbre.minuterieS > 0)) erreur('minuterie illisible')
  const { noeuds } = arbre
  if (!noeuds || typeof noeuds !== 'object') erreur('sans nœuds')
  if (Object.hasOwn(noeuds, FIN)) erreur(`un nœud ne peut s'appeler « ${FIN} »`)

  const condition = (si, ou) => {
    if (si === undefined || si === null) return
    if (typeof si !== 'object') erreur(`${ou} : condition illisible`)
    for (const [cle, v] of Object.entries(si)) {
      if (!Object.hasOwn(CONDITIONS, cle)) erreur(`${ou} : condition inconnue « ${cle} »`)
      if (!CONDITIONS[cle].lisible(v)) erreur(`${ou} : condition « ${cle} » illisible (${JSON.stringify(v)})`)
    }
  }
  const effets = (e, ou) => {
    if (e === undefined) return
    if (!e || typeof e !== 'object') erreur(`${ou} : effets illisibles`)
    for (const [cle, v] of Object.entries(e)) {
      if (!Object.hasOwn(LISIBLES, cle)) erreur(`${ou} : effet inconnu « ${cle} »`)
      if (!LISIBLES[cle](v)) erreur(`${ou} : effet « ${cle} » illisible (${JSON.stringify(v)})`)
    }
  }
  const didascalies = (r, ou) => {
    for (const cle of ['didascalie', 'didascalieApres']) {
      if (r[cle] !== undefined && !texteNonVide(r[cle])) erreur(`${ou} : ${cle} illisible`)
    }
  }
  const reponse = (r, ou) => {
    if (r === undefined || texteNonVide(r)) return
    if (!r || typeof r !== 'object' || !texteNonVide(r.texte)) erreur(`${ou} : réponse sans texte`)
    if (r.qui !== undefined && !texteNonVide(r.qui)) erreur(`${ou} : réponse sans qui`)
    didascalies(r, ou)
  }

  const aretes = new Map()   // id → les suites du nœud (le retour d'un silence qui revient n'en est pas une)
  for (const [id, n] of Object.entries(noeuds)) {
    const ici = `nœud « ${id} »`
    if (!n || typeof n !== 'object') erreur(`${ici} : illisible`)
    const suites = []
    if (n.aiguillage !== undefined) {
      if (!Array.isArray(n.aiguillage) || !n.aiguillage.length) erreur(`${ici} : aiguillage vide`)
      n.aiguillage.forEach((b, k) => {
        if ((k === n.aiguillage.length - 1) !== (b.si === undefined || b.si === null)) {
          erreur(`${ici} : seule la dernière branche de l'aiguillage est sans condition, et elle l'est toujours`)
        }
        condition(b.si, ici)
        suites.push(b.suite)
      })
    } else {
      if (!texteNonVide(n.qui)) erreur(`${ici} : sans qui`)
      if (typeof n.dit !== 'string') erreur(`${ici} : sans dit`)
      didascalies(n, ici)
      if (n.choix !== undefined) {
        if (!Array.isArray(n.choix) || !n.choix.length) erreur(`${ici} : choix vides`)
        if (n.suite !== undefined || n.effets !== undefined) {
          erreur(`${ici} : un nœud à choix a ses suites et ses effets dans ses choix et son silence`)
        }
        n.choix.forEach((c, k) => {
          const ou = `${ici}, choix ${k + 1}`
          if (!c || !texteNonVide(c.texte)) erreur(`${ou} : sans texte`)
          didascalies(c, ou)
          reponse(c.reponse, ou)
          condition(c.si, ou)
          effets(c.effets, ou)
          suites.push(c.suite)
        })
        if (!n.silence || typeof n.silence !== 'object') erreur(`${ici} : sans silence (l'issue quand la minuterie expire)`)
        reponse(n.silence.reponse, `${ici}, silence`)
        effets(n.silence.effets, `${ici}, silence`)
        suites.push(n.silence.suite)
      } else {
        if (n.silence !== undefined) erreur(`${ici} : un silence sans choix`)
        effets(n.effets, ici)
        suites.push(n.suite)
      }
    }
    for (const s of suites) {
      if (s !== FIN && !(texteNonVide(s) && Object.hasOwn(noeuds, s))) erreur(`${ici} : suite inconnue « ${String(s)} »`)
    }
    aretes.set(id, suites)
  }
  if (!(texteNonVide(arbre.entree) && Object.hasOwn(noeuds, arbre.entree))) erreur(`entrée inconnue « ${String(arbre.entree)} »`)

  // depuis l'entrée, chaque nœud atteint, et aucun chemin qui repasse par un nœud
  const vus = new Map()      // id → 'en cours' (sur le chemin) ou 'fait'
  const parcourir = id => {
    if (id === FIN || vus.get(id) === 'fait') return
    if (vus.get(id) === 'en cours') erreur(`boucle par le nœud « ${id} »`)
    vus.set(id, 'en cours')
    for (const s of aretes.get(id)) parcourir(s)
    vus.set(id, 'fait')
  }
  parcourir(arbre.entree)
  const orphelins = Object.keys(noeuds).filter(id => !vus.has(id))
  if (orphelins.length) erreur(`nœud jamais atteint : ${orphelins.join(', ')}`)
  return arbre
}

// ─── Le dialogue ───────────────────────────────────────────────────

// etat : de quoi lire les conditions (ci-dessus) ; reglages : de la forme de DIALOGUE.
export function createDialogue(arbre, { etat = {}, reglages = DIALOGUE } = {}) {
  verifierArbre(arbre)
  const { choixApresS, enchainementS, ticsS } = reglages
  const delai = arbre.minuterieS ?? reglages.minuterieS
  const tics = [...ticsS].sort((a, b) => b - a)
  const frappe = createFrappe()
  const silences = new Map()  // id du nœud → silences déjà passés
  const file = [{ type: 'aller', vers: arbre.entree }]   // ce qui vient, dans l'ordre
  let pas = null              // ce qui se passe : une réplique, ou une question (sa réplique, puis ses choix)
  let t = 0                   // le temps du dialogue, en secondes de jeu
  let curseur = 0             // l'instant où commence ce qui vient
  let finParole = -Infinity   // la fin de la dernière réplique dite : la suivante attend enchainementS de plus
  let ligne = null            // la dernière réplique commencée
  let noeud = null
  let surbrillance = 0
  let fini = false

  // une réplique à dire ; r : une chaîne, ou { qui?, texte, didascalie?, didascalieApres? } (un nœud prête son dit)
  const replique = (qui, r) => (typeof r === 'string'
    ? { type: 'replique', qui, texte: r, didascalie: null, didascalieApres: null }
    : { type: 'replique', qui: r.qui ?? qui, texte: r.texte, didascalie: r.didascalie ?? null, didascalieApres: r.didascalieApres ?? null })
  const choixMontres = () => (!fini && pas && pas.type === 'question' && pas.choix ? pas.choix : null)

  // Passe au nœud `vers` : FIN termine ; un aiguillage choisit sa branche ; une réplique se dit, puis ses choix ou sa suite.
  function aller(vers, emis) {
    if (vers === FIN) {
      fini = true
      emis.push({ type: 'fin' })
      return
    }
    const n = arbre.noeuds[vers]
    if (n.aiguillage) {
      file.unshift({ type: 'aller', vers: n.aiguillage.find(b => remplie(b.si, etat)).suite })
      return
    }
    noeud = vers
    const dit = replique(n.qui, { texte: n.dit, didascalie: n.didascalie, didascalieApres: n.didascalieApres })
    if (n.choix) file.unshift({ ...dit, type: 'question', noeud: vers })
    else file.unshift(dit, ...(n.effets ? [{ type: 'effets', noeud: vers, issue: null, effets: n.effets }] : []), { type: 'aller', vers: n.suite })
  }

  // Les choix s'affichent : ceux dont la condition est remplie, 2 ou 3 ; la minuterie part.
  function montrer(p, apparition, emis) {
    const choix = arbre.noeuds[p.noeud].choix.filter(c => remplie(c.si, etat))
    if (choix.length < 2 || choix.length > 3) {
      throw new Error(`dialogue « ${arbre.id} » : ${choix.length} choix montrés au nœud « ${p.noeud} » (de 2 à 3)`)
    }
    p.choix = choix
    p.echeance = apparition + delai
    p.tics = 0
    surbrillance = 1
    emis.push({ type: 'choix', noeud: p.noeud, choix: choix.map((c, i) => ({ n: i + 1, texte: c.texte })) })
  }

  // La question est close à `instant` (un choix, ou l'échéance) ; son issue vient aussitôt, sans attendre enchainementS.
  function clore(etapes, instant) {
    pas = null
    curseur = instant
    finParole = -Infinity
    surbrillance = 0
    file.unshift(...etapes)
  }

  // La minuterie a expiré : l'issue silence.
  function silence(p) {
    const n = arbre.noeuds[p.noeud], s = n.silence
    const fois = (silences.get(p.noeud) ?? 0) + 1
    silences.set(p.noeud, fois)
    const revient = s.revient === true && fois === 1
    const etapes = []
    if (s.reponse && !(s.revient === true && fois > 1)) etapes.push(replique(n.qui, s.reponse))
    if (s.effets) etapes.push({ type: 'effets', noeud: p.noeud, issue: 'silence', effets: s.effets })
    etapes.push({ type: 'aller', vers: revient ? p.noeud : s.suite })
    clore(etapes, p.echeance)
  }

  // Fait passer le temps jusqu'à t : ce qui est dû commence, se frappe, s'affiche ou se clôt, dans l'ordre.
  function avancer(emis) {
    while (!fini) {
      if (!pas) {
        const suivant = file.shift()
        if (suivant.type === 'aller') { aller(suivant.vers, emis); continue }
        if (suivant.type === 'effets') {
          emis.push({ type: 'effets', noeud: suivant.noeud, issue: suivant.issue, effets: suivant.effets })
          return            // la suite attend l'image suivante : l'appelant applique les effets d'abord
        }
        pas = suivant        // une réplique, ou une question
        pas.debut = Math.max(curseur, finParole + enchainementS)
        pas.duree = estimate(pas.texte) / 1000
        pas.finFrappe = pas.debut + dureeFrappe(pas.texte)
        pas.nourri = 0
      }
      if (t < pas.debut - EPS) return
      if (!pas.commence) {
        pas.commence = true
        frappe.dire(pas.texte)
        ligne = pas
        emis.push({ type: 'replique', qui: pas.qui, texte: pas.texte, didascalie: pas.didascalie, didascalieApres: pas.didascalieApres, dureeS: pas.duree })
      }
      const ecoule = t - pas.debut                        // la frappe suit le temps du dialogue
      if (ecoule > pas.nourri) { frappe.update(ecoule - pas.nourri); pas.nourri = ecoule }
      if (pas.type === 'replique') {
        const fin = pas.debut + pas.duree
        if (t < fin - EPS) return
        curseur = fin
        finParole = fin
        pas = null
        continue
      }
      if (!pas.choix) {
        const apparition = pas.finFrappe + choixApresS
        if (t < apparition - EPS) return
        montrer(pas, apparition, emis)
      }
      while (pas.tics < tics.length && t >= pas.echeance - tics[pas.tics] - EPS) emis.push({ type: 'tic', restant: tics[pas.tics++] })
      if (t < pas.echeance - EPS) return
      silence(pas)
    }
  }

  function valider() {
    const choix = choixMontres()
    if (!choix) return false
    const c = choix[surbrillance - 1], n = arbre.noeuds[pas.noeud]
    const etapes = [replique('viktor', { texte: c.texte, didascalie: c.didascalie, didascalieApres: c.didascalieApres })]
    if (c.reponse) etapes.push(replique(n.qui, c.reponse))
    if (c.effets) etapes.push({ type: 'effets', noeud: pas.noeud, issue: surbrillance, effets: c.effets })
    etapes.push({ type: 'aller', vers: c.suite })
    clore(etapes, t)
    return true
  }
  function choisir(n) {
    const choix = choixMontres()
    if (!choix || !Number.isInteger(n) || n < 1 || n > choix.length) return false
    surbrillance = n
    return valider()
  }
  function deplacer(sens) {
    const choix = choixMontres()
    const vers = choix ? Math.min(choix.length, Math.max(1, surbrillance + Math.sign(sens))) : 0
    if (!choix || !Number.isFinite(vers) || vers === surbrillance) return false
    surbrillance = vers
    return true
  }
  // Espace ou clic droit : la réplique en cours se frappe d'un coup (jamais une réplique écoutée : celles d'un dialogue
  // n'ont pas de masque). Les choix suivent alors de choixApresS ; une réplique sans choix garde sa durée.
  function toutAfficher() {
    if (fini || !pas || !pas.commence || frappe.fini) return false
    frappe.toutAfficher()
    pas.finFrappe = Math.min(pas.finFrappe, t)
    return true
  }

  return {
    update(dt) {
      if (fini) return []
      t += secondes(dt)
      const emis = []
      avancer(emis)
      return emis
    },
    choisir,
    deplacer,
    valider,
    toutAfficher,
    // Une touche pressée, lue par e.code : Digit1 à Digit3 et Numpad1 à Numpad3 choisissent ; ArrowUp et ArrowDown
    // déplacent la surbrillance ; KeyE, Enter et NumpadEnter valident ; Space frappe la réplique d'un coup. Rend vrai si
    // elle a fait quelque chose. Une touche maintenue (e.repeat) ne compte qu'à son premier appui : un chiffre gardé
    // enfoncé ne répond pas à la question suivante, E maintenu (sortie, juke-box) ne valide pas des choix qui apparaissent.
    // (Pendant un dialogue, l'appelant ne donne ses touches à personne d'autre.)
    touche(e) {
      if (e && e.repeat) return false
      const code = e ? e.code : undefined
      const n = choixDepuisCode(code)
      if (n !== null) return choisir(n)
      if (code === 'ArrowUp') return deplacer(-1)
      if (code === 'ArrowDown') return deplacer(1)
      if (CODES_VALIDER.includes(code)) return valider()
      if (code === 'Space') return toutAfficher()
      return false
    },
    get phase() { return fini ? 'fin' : choixMontres() ? 'choix' : 'parole' },
    get qui() { return ligne ? ligne.qui : null },
    get texte() { return frappe.texte },
    get didascalie() { return ligne ? ligne.didascalie : null },
    get didascalieApres() { return ligne ? ligne.didascalieApres : null },
    get choix() { const c = choixMontres(); return c ? c.map((x, i) => ({ n: i + 1, texte: x.texte })) : [] },
    get surbrillance() { return choixMontres() ? surbrillance : 0 },
    get restant() { return choixMontres() ? Math.max(0, pas.echeance - t) : null },
    get delai() { return delai },
    get noeud() { return noeud },
    get interlocuteur() { return arbre.interlocuteur },
    get fini() { return fini },
  }
}
