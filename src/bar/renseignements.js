// Ce que Viktor apprend au Bivouac, et ce que le convoi en tire (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md
// §3.3, §3.11 et §5.1 ; plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B6). Module pur : ni DOM, ni three, ni
// minuteur, ni hasard. Aucun tiret cadratin dans les textes (tests/texts.test.js).
//
// Le carnet (createCarnet) tient ce que Viktor sait : les quatre renseignements du carnet « CE QU'IL ME FAUT » (trajet,
// vehicule, place, heure) et trois drapeaux de récit (leurre, appel, allie), qui changent le briefing II et le journal,
// jamais la difficulté (§3.3). Son état est celui du contrat de sortie du bar (§3.11) et de la sauvegarde (§6) :
// renseignements, sept booléens.
//
// effetsSurLeConvoi(r) est le contrat avec le convoi (sous-lot 3d du lot 3) : ce que le convoi doit à ce que Viktor a
// appris, sans aléa, jamais une devinette à 50 % (§5.1). Valeurs : CONVOI de src/bar/reglages-convoi.js. Jamais
// d'import de src/bar/reglages.js ici : le convoi importe ce module au démarrage du jeu, et tous les réglages du bar y
// entreraient avec lui (relecture de l'étape 1 ; tests/bar/renseignements.test.js, « ce que tire le contrat avec le
// convoi »).
import { CONVOI } from './reglages-convoi.js'

// Les sept noms, dans l'ordre du contrat de sortie ; les quatre du carnet d'abord.
export const NOMS = Object.freeze(['trajet', 'vehicule', 'place', 'heure', 'leurre', 'appel', 'allie'])
export const QUATRE = Object.freeze(NOMS.slice(0, 4))

// Ce que le convoi doit savoir pour être celui de la spec du lot 3 (M5 : le virage, 13,5 s, la barre, le freinage,
// l'arrivée calme), avec le leurre de la décision 1 (H1 : Haas sous la casquette dans la jeep 3, Kessler tête nue). Le
// sous-lot 3d se construit dessus tant que l'étape 2 du bar n'est pas fusionnée (src/campaign/missions/m5.js lit
// effetsSurLeConvoi(RENSEIGNEMENTS_COMPLETS), tâche B18) ; appel et allie, du récit seulement, n'y changent rien.
export const RENSEIGNEMENTS_COMPLETS = Object.freeze({ trajet: true, vehicule: true, place: true, heure: true, leurre: true,
  appel: false, allie: false })

// Fige un objet et tout ce qu'il contient.
function gele(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const x of Object.values(v)) gele(x)
  }
  return v
}

// un nom de renseignement ; un nom inconnu (ou hérité, comme « toString ») est une erreur, jamais ignoré en silence
function nom(n) {
  if (!NOMS.includes(n)) throw new Error(`carnet du Bivouac : renseignement inconnu « ${n} »`)
  return n
}

// ─── Le carnet ─────────────────────────────────────────────────────
// connus : les noms sus dès le départ (option de développement infos, spec §3.13), sans tampon.
// apprendre(noms) : un nom, ou une liste (l'effet apprend d'un dialogue, src/bar/dialogue.js) ; rend les noms appris à
// cet appel, dans l'ordre, sans ceux déjà sus : le tampon NOTÉ, le son et la ligne du carnet ne tombent qu'une fois. Tous
// les noms sont lus avant d'en apprendre un : un nom inconnu lève une erreur et l'appel n'apprend rien.
// connait(nom) ; appris : combien des quatre sont sus (les drapeaux n'en sont pas) ; renseignements : les sept booléens,
// une copie.
export function createCarnet(connus = []) {
  const sus = new Set(connus.map(nom))
  return {
    apprendre(noms) {
      const lus = (Array.isArray(noms) ? noms : [noms]).map(nom)
      const nouveaux = []
      for (const n of lus) if (!sus.has(n)) { sus.add(n); nouveaux.push(n) }
      return nouveaux
    },
    connait: n => sus.has(nom(n)),
    get appris() { return QUATRE.filter(n => sus.has(n)).length },
    get renseignements() { return Object.fromEntries(NOMS.map(n => [n, sus.has(n)])) },
  }
}

// ─── Les textes du convoi (§5.1) ───────────────────────────────────
// La fiche du dossier (#target-dossier généralisé, tâche A7 du lot 3) : le titre, la cible, le véhicule et la place
// (connus ou « ? »), puis la casquette si Viktor sait que c'est un leurre.
export const FICHE = gele({
  titre: 'DOSSIER 05',
  cible: 'COL. KESSLER · AUCUNE PHOTO',
  vehicule: { connu: 'VÉHICULE 2 SUR 3', inconnu: 'VÉHICULE ?' },
  place: { connu: 'CÔTÉ PASSAGER', inconnu: 'PLACE ?' },
  leurre: 'CASQUETTE AU 3 : LEURRE',
})

// La radio du convoi (tâche A8 du lot 3 : le fil et les bips d'Anton). Anton ne voit rien : il parle de l'heure et de
// ce qu'il sait ; ce qui se voit dans la lunette, c'est Viktor qui le dit. Jusqu'au lot 4 seulement pour la cible
// abattue : la kill-cam suspend la radio à la mort de la dernière cible (spec §5.1).
export const RADIO = gele({
  depart: { qui: 'anton', heure: 'Sept heures et quart. Ils roulent.', sansHeure: 'Tu es juste. Ils sont déjà là.' },
  approche: { qui: 'anton', texte: 'Ils arrivent. Respire.' },   // seulement avec l'heure : sans elle, ils sont déjà là
  fenetre: { qui: 'viktor', virage: 'Ils freinent. Treize secondes.', ligneDroite: 'Ils ne freineront pas. Neuf secondes.' },
  jeep2: { qui: 'viktor', vehicule: 'Deuxième véhicule.', place: 'Côté passager.' },   // la moitié connue, ou rien
  leurreAbattu: { qui: 'viktor', texte: 'La casquette. Ce n\'était pas lui.' },
  alerte: { qui: 'viktor', texte: 'Ils accélèrent.' },
  cibleAbattue: { qui: 'anton', texte: 'C\'est fait. La moto, maintenant.' },
})

// La ligne du rapport (§5.3) ; « · COUVERTURE INTACTE » et le +100 d'un bar sans MÉFIANCE viennent de la couverture,
// hors de ce contrat (tâche B17).
const ligneRapport = n => `RENSEIGNEMENTS ${n} / ${QUATRE.length}`

// ─── Le contrat avec le convoi ─────────────────────────────────────
// r : les renseignements (de la forme du contrat de sortie), dont seul exactement true compte (une sauvegarde abîmée ne
// vaut pas un renseignement) ; absent ou qui n'est pas un objet : rien n'est su. Rend un objet neuf, figé jusqu'au fond :
// { poste, fenetre: { dureeS, barre, freinage }, arrivee: { avantFenetreS, stressDepart }, fiche, radio: [{ evenement,
// qui, texte }], bonus: { points, lignes } }. Chaque renseignement ne change que ses champs : TRAJET le poste, la fenêtre
// et sa ligne de radio ; HEURE l'arrivée et les lignes du départ ; VÉHICULE et PLACE leur ligne de la fiche et celle de
// la jeep 2 ; les quatre, le bonus ; le leurre, sa ligne de la fiche ; appel et allie, rien.
export function effetsSurLeConvoi(r) {
  const sait = n => r !== null && typeof r === 'object' && r[n] === true
  const poste = sait('trajet') ? 'virage' : 'ligneDroite'
  const n = QUATRE.filter(sait).length
  const jeep2 = [sait('vehicule') && RADIO.jeep2.vehicule, sait('place') && RADIO.jeep2.place].filter(Boolean).join(' ')
  const ligne = (evenement, qui, texte) => ({ evenement, qui, texte })
  return gele({
    poste,
    fenetre: { ...CONVOI.fenetre[poste] },
    arrivee: { ...CONVOI.arrivee[sait('heure') ? 'calme' : 'juste'] },
    fiche: [
      FICHE.titre,
      FICHE.cible,
      FICHE.vehicule[sait('vehicule') ? 'connu' : 'inconnu'],
      FICHE.place[sait('place') ? 'connu' : 'inconnu'],
      ...(sait('leurre') ? [FICHE.leurre] : []),
    ],
    radio: [
      ligne('depart', RADIO.depart.qui, sait('heure') ? RADIO.depart.heure : RADIO.depart.sansHeure),
      ...(sait('heure') ? [ligne('approche', RADIO.approche.qui, RADIO.approche.texte)] : []),
      ligne('fenetre', RADIO.fenetre.qui, RADIO.fenetre[poste]),
      ...(jeep2 ? [ligne('jeep2', RADIO.jeep2.qui, jeep2)] : []),
      ...['leurreAbattu', 'alerte', 'cibleAbattue'].map(e => ligne(e, RADIO[e].qui, RADIO[e].texte)),
    ],
    bonus: { points: n * CONVOI.pointsParRenseignement, lignes: [ligneRapport(n)] },
  })
}
