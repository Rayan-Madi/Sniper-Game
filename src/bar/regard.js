// Le regard qui fixe, au Bivouac (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.5). Module pur : ni DOM,
// ni three, ni minuteur ; il n'avance que par update(dt), au temps de jeu (en pause, on ne l'appelle pas : il est figé).
// Valeurs : REGARD de src/bar/reglages.js, ou les réglages qu'on lui passe ; la vue s'arrête aux boîtes du plan
// (src/bar/plan.js, BOITES par défaut).
//
// Viktor fixe une personne quand le centre de l'écran est à θmax(d) = atan(rayonTeteM / d) + margeDeg ou moins de sa
// tête (d : de son œil à cette tête), qu'elle le voit et qu'elle n'est pas son interlocuteur. Elle le voit s'il est à
// coneDeg ou moins de sa face (coneAlerteDeg quand elle est alertée) et que rien n'arrête la vue entre eux. Son temps de
// fixation f_p monte alors au temps de jeu ; sinon, il redescend `oubli` fois plus vite, jusqu'à 0. Atteindre sa
// tolérance (× verre si Viktor est assis avec un verre) la fait remarquer Viktor, une fois par épisode : l'épisode ne
// se clôt que quand f_p revient à 0. Elle est alors alertée alerteS secondes, et ses répliques tombent quand f_p atteint
// la tolérance plus chaque délai de repliquesS : regard détourné, f_p redescend et la suite attend. Au-delà de la
// tolérance, une fixation qui dure est une source de la jauge de soupçon (src/bar/soupcon.js).
//
// Qui voit Viktor se décide ici, par le cône et la ligne de vue de chacun, jamais par une zone du plan : la zone
// discrète (couloir des toilettes) est un lieu, pas un abri (spec §3.1, « Réglé en B2 »). Les témoins de la jauge en
// viennent, y compris pour sa baisse « hors de la vue de tous » ; l'interlocuteur en est un, même s'il n'est pas fixé.
//
// Une image du bar (tâche B11) : emis = regards.update(dt, vue) ; jauge.update(dt, { sources: regards.sources,
// temoins: regards.temoins, … }) ; puis jauge.evenement('remarque', e.categorie) pour chaque remarque émise. La remarque
// tombe à la fin de l'image où la tolérance est atteinte et la montée continue part de l'image suivante : Sorel fixé
// 3 s à 2 m fait 12 à 1,2 s, puis 18 en 1,8 s, soit 30, l'exemple du §3.6 (tests/bar/regard.test.js).
import { REGARD } from './reglages.js'
import { BOITES, vueLibre } from './plan.js'

const DEGRES = 180 / Math.PI

// Les temps et les angles se comparent à un milliardième près, comme dans la jauge : 72 images de 1/60 s font 1,2 s au
// calcul, pas toujours en flottants. Un f_p qui redescend s'arrête à 0, pas sur un reste d'arrondi qui garderait son
// épisode ouvert ; une alerte aussi.
const EPS = 1e-9

// un pas de temps invalide (NaN, absent, négatif, infini) compte pour zéro, comme dans la jauge
const secondes = d => (Number.isFinite(d) && d > 0 ? d : 0)
const point3 = v => v != null && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)

// θmax(d), en degrés : la tête à d mètres de l'œil est fixée si le centre de l'écran en est à cet angle ou moins.
export function seuilFixation(d, reglages = REGARD) {
  return Math.atan(reglages.rayonTeteM / d) * DEGRES + reglages.margeDeg
}

// La personne voit-elle Viktor ? Il est à coneDeg ou moins de sa face (coneAlerteDeg si elle est alertée), et rien
// n'arrête la vue entre eux au sol (vueLibre : un mur, une cloison ou une porte l'arrêtent, un meuble ou une personne
// la laissent passer). personne : { x, z, lacet } ; x, z : sa tête au sol ; lacet : sa face, dans la convention du
// contrôleur (forwardOf de src/prologue/fpsController.js : 0 regarde vers −z). viktor : { x, z }, son œil au sol.
export function voitViktor(personne, viktor, boites = BOITES, alerte = false, reglages = REGARD) {
  const dx = viktor.x - personne.x, dz = viktor.z - personne.z
  const fx = -Math.sin(personne.lacet), fz = -Math.cos(personne.lacet)
  const angle = Math.atan2(Math.abs(fx * dz - fz * dx), fx * dx + fz * dz) * DEGRES   // exact à 0° comme à 180°
  return angle <= (alerte ? reglages.coneAlerteDeg : reglages.coneDeg) + EPS && vueLibre(personne, viktor, boites)
}

// Le centre de l'écran (direction, de n'importe quelle longueur, depuis l'œil) est-il sur la tête de p ?
function surLaTete(p, oeil, direction, reglages) {
  const vx = p.x - oeil.x, vy = p.y - oeil.y, vz = p.z - oeil.z
  const cx = direction.y * vz - direction.z * vy, cy = direction.z * vx - direction.x * vz, cz = direction.x * vy - direction.y * vx
  const angle = Math.atan2(Math.hypot(cx, cy, cz), direction.x * vx + direction.y * vy + direction.z * vz) * DEGRES
  return angle <= seuilFixation(Math.hypot(vx, vy, vz), reglages) + EPS
}

// Les regards de la salle sur Viktor. personnes : [{ id, categorie, x, y, z, lacet }] ; x, y, z : sa tête (l'os Head) ;
// lacet : sa face (recommandé : celle de son corps ou de son siège, pas celle de sa tête tournée, à trancher en B10 et
// B11 : spec §3.5, « Réglé en B3 ») ; categorie : une clé de reglages.tolerance (escorte, civil, fernand, albert) ;
// present (facultatif) : false tant que la personne est absente (Sorel avant 18:30, src/bar/patrons.js) : elle ne voit
// pas Viktor et n'est pas fixée ; sans le champ, elle est là. Le module garde ces objets, pas le tableau : l'appelant
// modifie sur place x, y, z, lacet et present de chacun avant chaque image, sans jamais remplacer l'objet (un objet neuf
// ne serait pas lu). Une catégorie inconnue, ou deux fois le même id, est une erreur.
export function createRegards(personnes, reglages = REGARD, boites = BOITES) {
  const { tolerance, verre, oubli, alerteS, repliquesS } = reglages
  const suivis = new Map()
  for (const p of personnes) {
    if (!Object.hasOwn(tolerance, p.categorie)) throw new Error(`regard : catégorie inconnue « ${p.categorie} » (${p.id})`)
    if (suivis.has(p.id)) throw new Error(`regard : la personne « ${p.id} » est en double`)
    suivis.set(p.id, { p, f: 0, tolerance: tolerance[p.categorie], voit: false, fixe: false, source: false, alerte: 0,
      remarque: false, repliques: 0 })
  }
  let temoins = [], sources = []

  function suivi(id) {
    const s = suivis.get(id)
    if (!s) throw new Error(`regard : personne inconnue « ${id} »`)
    return s
  }

  return {
    // dt : secondes de jeu. oeil : { x, y, z }, l'œil de Viktor ; direction : { x, y, z }, le centre de l'écran (de
    // n'importe quelle longueur, jamais nulle) ; interlocuteur : l'id de qui parle avec Viktor (null hors dialogue) ;
    // assisAvecVerre : les tolérances sont alors multipliées par reglages.verre. Rend ce qui a été émis, dans l'ordre des
    // personnes : { type: 'remarque', qui, categorie }, une fois par épisode, puis { type: 'replique', qui, rang } (rang :
    // l'indice dans repliquesS, 0 à la tolérance). Tout est contrôlé avant que rien ne change.
    update(dt, { oeil, direction, interlocuteur = null, assisAvecVerre = false } = {}) {
      const pas = secondes(dt)
      if (pas === 0) return []
      if (!point3(oeil)) throw new Error('regard : l\'œil de Viktor n\'est pas un point { x, y, z }')
      if (!point3(direction) || Math.hypot(direction.x, direction.y, direction.z) === 0) {
        throw new Error('regard : la direction du regard est nulle ou illisible')
      }
      if (interlocuteur != null) suivi(interlocuteur)
      for (const { p } of suivis.values()) {
        if (!point3(p) || !Number.isFinite(p.lacet)) throw new Error(`regard : la tête ou la face de « ${p.id} » est illisible`)
      }
      const emis = []
      temoins = []
      sources = []
      for (const s of suivis.values()) {
        const { p } = s
        const alertee = s.alerte > EPS               // l'alerte couvre toute l'image où elle court encore
        s.alerte = s.alerte - pas > EPS ? s.alerte - pas : 0
        s.tolerance = tolerance[p.categorie] * (assisAvecVerre ? verre : 1)
        s.voit = p.present !== false && voitViktor(p, oeil, boites, alertee, reglages)
        s.fixe = s.voit && p.id !== interlocuteur && surLaTete(p, oeil, direction, reglages)
        const avant = s.f
        s.f = s.fixe ? avant + pas : (avant - oubli * pas > EPS ? avant - oubli * pas : 0)
        if (s.f === 0) { s.remarque = false; s.repliques = 0 }   // l'épisode est clos
        s.source = s.fixe && avant >= s.tolerance - EPS          // au-delà de la tolérance depuis l'image d'avant
        if (s.fixe && !s.remarque && s.f >= s.tolerance - EPS) {
          s.remarque = true
          s.alerte = alerteS
          emis.push({ type: 'remarque', qui: p.id, categorie: p.categorie })
        }
        while (s.fixe && s.remarque && s.repliques < repliquesS.length && s.f >= s.tolerance + repliquesS[s.repliques] - EPS) {
          emis.push({ type: 'replique', qui: p.id, rang: s.repliques })
          s.repliques++
        }
        if (s.voit) temoins.push(p.categorie)
        if (s.source) sources.push({ nom: 'fixation', qui: p.categorie })
      }
      return emis
    },

    // pour la jauge (src/bar/soupcon.js), d'après la dernière image : la catégorie de chaque personne qui voit Viktor
    // (Albert compris, sans poids), et une source par fixation au-delà de la tolérance
    get temoins() { return temoins },
    get sources() { return sources },

    // l'état d'une personne après la dernière image (anneau de fixation, têtes qui suivent, accroches de développement) :
    // fixation (f_p, s), tolerance (s), fixe, voit, alerte (s restantes)
    etat(id) {
      const { f, tolerance: t, fixe, voit, alerte } = suivi(id)
      return { fixation: f, tolerance: t, fixe, voit, alerte }
    },
  }
}
