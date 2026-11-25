// La coquille du Bivouac, le bar de M5 (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.4 à §3.11 et §3.13 ;
// plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B11) : le chef d'orchestre, sur le patron de l'enquête
// (src/prologue/investigation.js). Monte la salle et ses patrons dans une scène à elle (rendue par le renderer et la
// caméra du jeu), le contrôleur et la visée, la soirée, la jauge, les regards, l'écoute, les dialogues, les voix et le son
// de la salle ; démonte tout à la fin. Rien n'est branché au jeu (étape 1) : dev/bar.html?jouer=1 le joue seul.
//
// startBar({ renderer, camera, audio, root, onDone, options }) → { scene, update(dt), stop(), debug }. onDone une seule
// fois, jamais pendant l'appel, avec le contrat du §3.11 :
//   { resultat: 'sorti' | 'demasque' | 'passe' | 'abandon' | 'erreur',
//     renseignements: { trajet, vehicule, place, heure, leurre, appel, allie },   // booléens
//     couverture: { soupconMax, paliers: { mefiance, soupcon }, dureeS } }
// options (développement) : cam ('x,y,z,lacet,tangage' ou { x, y, z, yaw, pitch } : pose de départ, sans carte ni
// pause), t (partir à cet instant de la soirée : ce qui précède est passé, Sorel entré après 210 s), soupcon (S de
// départ), infos (renseignements sus d'avance, liste ou 'trajet,heure'), verre ('demi' ou 'cafe' : déjà servi), stats.
//
// Tout avance par update(dt), au temps de jeu : aucun minuteur (ni setTimeout, ni setInterval, ni Math.random). En
// pause, la boucle appelle toujours update : seuls le son (la musique, 10 dB plus bas), l'invite de REPRENDRE refusé et le
// noir de fin comptent ce temps réel ; horloge, frappe, bips, minuterie et jauge sont figés. Une image, dans l'ordre : le
// pas de Viktor, la soirée, le dialogue, l'écoute, les pensées et réactions, les déclencheurs, les patrons, les regards
// puis la jauge (et ses remarques, src/bar/regard.js), la salle, les voix et le son, la visée, l'interface.
//
// L'interface (tâche B12) : la jauge (œil, barre graduée, plancher hachuré, palier), l'anneau de fixation, les arcs du
// bord, la vignette rouge, les lignes de texte (qui parle : le rôle, puis le nom une fois prononcé ; une flèche quand la
// source sort du champ), le panneau de dialogue, le carnet et son tampon NOTÉ, l'heure, l'invite et son anneau de
// maintien ; puis les fins : la scène du démasqué (2,5 s au temps de jeu, §3.10) et le bilan « DOSSIER 05 » avec le
// téléphone d'Anton (§3.11). onSortie(contrat), facultatif, est appelé une fois au début du bilan (sorti, passe), avec le
// contrat que rendra onDone : la sauvegarde peut se faire avant le bilan (§6). Valeurs : INTERFACE de reglages.js.
import * as THREE from 'three'
import css from './bar.css?inline'   // le texte de la feuille, minifié au build (?raw le gardait tel quel, commentaires compris)
import { creerSalle } from './salle.js'
import { creerCasting } from './patrons.js'
import { createSeance, ESCORTE } from './seance.js'
import { createSoupcon, PALIERS } from './soupcon.js'
import { createRegards } from './regard.js'
import { intelligibilite, transmission, fragilites, affichage, masquer, acquis } from './ecoute.js'
import { createDialogue, libelleChoix } from './dialogue.js'
import { createCarnet, QUATRE } from './renseignements.js'
import { creerChoeur, reglageBips } from './voix.js'
import { creerSon } from './son.js'
import { BOITES, FOYERS, PLACES, ANCRES, SIEGES, TABLES, dansZone, lacetVers, itineraire } from './plan.js'
import { ECOUTE, SOUPCON, COUVERTURE, COQUILLE, DIALOGUE, INTERFACE, SON } from './reglages.js'
import { PERSONNES, RENSEIGNEMENTS, LEURRE, CARNET, ECHANGES, ALBERT, REGARDS, REACTIONS, OBJETS, DIALOGUES, CARTE, BILAN, bilan as bilanDe } from './textes.js'
import { createFrappe, dureeFrappe } from '../ui/frappe.js'
import { createFpsController, forwardOf } from '../prologue/fpsController.js'
import { createInteract } from '../prologue/interact.js'
import { generateur } from '../shot/acoustics.js'
import { estimate } from '../briefing/kit.js'
import { settings, effectsReduced } from '../settings.js'

const EPS = 1e-9
const K = COQUILLE
const RANG = Object.fromEntries(PALIERS.map((p, i) => [p, i]))
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
// libellé d'une touche sans la carte du clavier : KeyW → W, Digit1 → 1, ArrowUp → ↑ (comme l'enquête)
const FLECHES = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
const keyLabel = code => FLECHES[code] || (code === 'Space' ? 'ESPACE' : String(code || '?').replace(/^(Key|Digit|Numpad)/, '').toUpperCase())
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const ECHANGE = new Map(ECHANGES.map(e => [e.id, e]))
const SIEGE = new Map(SIEGES.map(s => [s.id, s]))
const RESULTATS = Object.freeze(['sorti', 'demasque', 'passe', 'abandon', 'erreur'])
const I = INTERFACE
const PALIER_LIBELLE = { calme: 'CALME', mefiance: 'MÉFIANCE', soupcon: 'SOUPÇON', demasque: 'DÉMASQUÉ' }
const PLAFOND = SOUPCON.paliers.demasque.monte
const TABLES_ESCORTE = Object.freeze(['dussart', 'lenoir', 'mattei', 'haas'])   // les deux tables qui se lèvent (§3.10)
// la forme d'un mot pour reconnaître un nom prononcé : minuscules, sans la ponctuation qui l'entoure
const forme = mot => String(mot).normalize('NFC').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const NOMS = Object.entries(PERSONNES).filter(([, p]) => p.nom).map(([id, p]) => [id, forme(p.nom)])

// la pose de l'option cam : 'x,y,z,lacet,tangage' ou { x, y, z, yaw, pitch }
function lirePose(cam) {
  if (!cam) return null
  const v = typeof cam === 'string' ? cam.split(',').map(Number) : [cam.x, cam.y, cam.z, cam.yaw ?? cam.lacet, cam.pitch ?? cam.tangage]
  const [x, y, z, yaw = 0, pitch = 0] = v
  if (![x, y, z, yaw, pitch].every(Number.isFinite)) throw new Error(`bar : pose de caméra illisible (${String(cam)})`)
  return { x, y, z, yaw, pitch }
}
const lireInfos = infos => (Array.isArray(infos) ? infos : String(infos || '').split(',')).map(s => s.trim()).filter(Boolean)

const HTML = `
  <div class="bar-fx"><div class="bar-scan"></div><div class="bar-vig"></div><div class="bar-vignette" id="bar-vignette"></div></div>
  <div class="bar-arcs"><i class="arc gauche" id="bar-arc-g"></i><i class="arc droite" id="bar-arc-d"></i></div>
  <div class="bar-jauge p-calme" id="bar-jauge">
    <svg class="bar-oeil" viewBox="0 0 28 16" aria-hidden="true">
      <g class="ouvert"><path d="M2 8 Q14 -2.5 26 8 Q14 18.5 2 8 Z"/><circle cx="14" cy="8" r="3.4"/></g>
      <g class="clos"><path d="M2 8 Q14 15.5 26 8"/><path d="M2 8 Q14 4.5 26 8"/></g>
    </svg>
    <div class="bar-barre"><i class="niveau"></i><i class="plancher"></i>${[SOUPCON.paliers.mefiance.monte, SOUPCON.paliers.soupcon.monte].map(v => `<b style="left:${v / PLAFOND * 100}%"></b>`).join('')}</div>
    <span class="bar-palier">CALME</span>
  </div>
  <div class="bar-heure" id="bar-heure"><i class="pt"></i><span class="tx">LE BIVOUAC · 18:10</span></div>
  <div class="bar-carnet" id="bar-carnet"><h4><span class="titre"></span><b class="compte"></b></h4><ul></ul></div>
  <div class="bar-cross"></div>
  <div class="bar-anneau" id="bar-anneau"></div>
  <div class="bar-prompt" id="bar-prompt"><span class="avant"></span><span class="touche"><i class="anneau"></i><b></b></span><span class="tx"></span></div>
  <div class="bar-pensee" id="bar-pensee"><span class="spk"></span><span class="tx"></span></div>
  <div class="bar-reaction" id="bar-reaction"><span class="spk"></span><span class="tx"></span></div>
  <div class="bar-sub" id="bar-sub"><span class="spk"></span><span class="tx"></span></div>
  <div class="bar-aide" id="bar-aide"></div>
  <div class="bar-dialogue" id="bar-dialogue" hidden>
    <div class="bar-onglet"></div>
    <div class="bar-replique"><span class="did"></span><span class="tx"></span></div>
    <ol class="bar-choix"></ol>
    <div class="bar-minuterie"><i></i></div>
  </div>
  <div class="bar-black" id="bar-black"></div>
  <div class="bar-demasque" id="bar-demasque" hidden><div class="tampon"></div></div>
  <div class="bar-bilan" id="bar-bilan" hidden>
    <div class="fiche"><div class="onglet"></div><ul></ul></div>
    <div class="bar-tel"><div class="ecran"><span class="de"></span><span class="msg"></span></div></div>
    <p class="viktor"><span class="spk">VIKTOR</span><span class="tx"></span></p>
  </div>
  <div class="bar-card" id="bar-card">
    <div class="d"></div>
    <div class="l"></div>
    <p class="texte"></p>
    <p class="consigne"></p>
    <div class="k"></div>
    <div class="go"></div>
    <button type="button" class="partir" id="bar-card-partir"></button>
  </div>
  <div class="bar-pause" id="bar-pause" hidden>
    <h2>PAUSE</h2>
    <button type="button" id="bar-reprendre">REPRENDRE</button>
    <p class="bar-retry" id="bar-retry" hidden>CLIQUE ENCORE POUR REPRENDRE</p>
    <button type="button" id="bar-sortir">SORTIR DU BAR</button>
    <button type="button" id="bar-menu">MENU PRINCIPAL</button>
  </div>`

export function startBar({ renderer, camera, audio = null, root = document.body, onDone = () => {}, onSortie = null, options = {} } = {}) {
  const opts = options || {}
  const journal = []          // ce qui s'est passé, au temps de la soirée (vérification réelle, accroches de développement)
  const listening = []        // [cible, type, fonction] à retirer au démontage
  let salle = null, casting = null, scene = null, controller = null, interact = null
  let seance = null, jauge = null, regards = null, carnet = null, son = null, choeur = null
  let saved = null, savedAuto = null, style = null, ui = null, $ = () => null
  let ready = false, started = false, stopped = false, reported = false, pause = false
  let fin = null              // { resultat, t } : le noir de fin court (temps réel)
  let reprise = null          // temps réel depuis REPRENDRE, tant que le verrou n'est pas revenu
  let layout = null           // carte du clavier (navigator.keyboard) : libellés des touches selon la disposition
  let cam = null, attenue = false, hasard = null

  // ── Viktor ──
  const viktor = { posture: 'debout', siege: null, verre: null, couverture: null, surveille: false, interdite: false }
  const oeil = { x: 0, y: 0, z: 0 }          // l'œil de Viktor, objet partagé (les têtes qui le suivent le relisent)
  const direction = { x: 0, y: 0, z: -1 }    // le centre de l'écran
  let regardSol = { x: 0, z: -1 }             // le regard au sol
  let maintien = null                          // E tenu sur la porte ou le juke-box : { cible, par, t }
  let verreTenu = null                         // le verre en vue (§3.7) : { group, possedes }

  // ── la soirée ──
  const ecoutes = []          // répliques épiées en cours : frappe, I du moment, voix (§3.4)
  let sousTitre = null        // l'écoute sous-titrée
  const entendus = new Set()  // échanges dont une réplique s'est affichée en entier
  const paroles = { pensee: { file: [], cur: null }, reaction: { file: [], cur: null } }   // Viktor ; ce qu'on lui dit
  let dialogue = null         // { id, d } : le dialogue en cours (src/bar/dialogue.js)
  const faits = new Set()     // dialogues déjà joués (D1, F3, L1, L2) ; D2 : la soirée s'en souvient
  const ouverts = new Set()   // dialogues que d'autres ont ouverts (effet ouvre : « fernand-photo »)
  const enAttente = []        // dialogues déclenchés, ouverts dès que l'interlocuteur est libre
  const muets = new Set()     // personnes qui ne parlent plus à Viktor (effet muet)
  let aide = null             // { texte, t } : l'aide affichée (effet aide)
  const compteurs = { joue: 0, sansVerre: 0, zinc: 0, tables: 0, jukebox: 0, murmure: 0 }
  let photoVue = false, sansCommandeFait = false, premiereRemarque = false, l2Du = false, albertParle = false, liseServie = false
  const coupsOeil = new Map() // en MÉFIANCE : qui jette un coup d'œil à Viktor → secondes restantes
  let prochainCoup = 0
  const choregraphie = new Map()   // rôle → étapes à suivre (se lever, aller, s'asseoir, sortir)
  const voixDe = new Map()    // qui parle → d'où vient sa voix ({ x, z, voix } ou 'direct')
  let dussartApproche = false, demasque = false
  let saut = false            // option t : la soirée passe sans être jouée
  // ── l'interface (B12) ──
  const nommes = new Set()    // les personnes dont le nom s'est lu (le sous-titre dit alors le nom, et non plus le rôle)
  const tampons = new Map()   // renseignement → l'instant de la soirée où il s'est appris (le tampon NOTÉ du carnet)
  const arcs = new Map()      // homme de l'escorte qui vient de remarquer Viktor → secondes d'arc restantes
  let vuParQuiCompte = false  // quelqu'un dont le regard compte pour la jauge voit Viktor (l'œil ouvert)
  const cache = new Map()     // ce qui est déjà écrit dans le DOM, pour ne pas le réécrire à chaque image
  const changer = (cle, v, fn) => { if (cache.get(cle) !== v) { cache.set(cle, v); fn(v) } }

  const note = (type, champs = {}) => { const e = { t: seance ? +seance.t.toFixed(3) : 0, type, ...champs }; journal.push(e); return e }
  const locked = () => !!document.pointerLockElement
  const listen = (target, type, fn, o) => { target.addEventListener(type, fn, o); listening.push([target, type, fn, o]) }
  const report = payload => {
    if (reported) return
    reported = true
    try { onDone(payload) } catch (e) { console.error('[bar]', e) }
  }
  const patron = role => (casting ? casting.patrons.get(role) || null : null)
  const present = role => { const p = patron(role); return !!p && p.present }

  // ── le contrat de sortie (§3.11) ──
  function contrat(resultat) {
    if (!RESULTATS.includes(resultat)) throw new Error(`bar : résultat inconnu « ${resultat} »`)
    const rien = !carnet || resultat === 'passe'
    const renseignements = rien ? createCarnet().renseignements : carnet.renseignements
    const couverture = resultat === 'passe' || !jauge || !seance
      ? { soupconMax: 0, paliers: { mefiance: false, soupcon: false }, dureeS: 0 }
      : { soupconMax: jauge.max, paliers: jauge.paliersAtteints, dureeS: seance.t }
    return { resultat, renseignements, couverture }
  }

  // ─── Ce qui se dit sans masque : les pensées de Viktor, ce qu'on lui dit ───
  // qui : 'viktor' (sa voix intérieure, la ligne de pensée) ou une personne (la ligne des sous-titres) ; une ligne à la
  // fois par place, la suivante DIALOGUE.enchainementS après la fin de la précédente ; frappée au temps de jeu.
  function dire(qui, texte, { didascalie = null } = {}) {
    if (saut) return
    const place = qui === 'viktor' ? paroles.pensee : paroles.reaction
    place.file.push({ qui, texte: texte || '', didascalie })
    note(qui === 'viktor' ? 'pensee' : 'reaction', { qui, texte: texte || '', didascalie })
  }
  function avancerParoles(g) {
    for (const place of Object.values(paroles)) {
      const cur = place.cur
      if (cur) {
        cur.t += g
        cur.frappe.update(g)
        if (cur.t >= cur.dureeS + K.sousTitreS - EPS || (place.file.length && cur.t >= cur.dureeS + DIALOGUE.enchainementS - EPS)) place.cur = null
      }
      if (!place.cur && place.file.length) {
        const p = place.file.shift()
        const frappe = createFrappe()
        frappe.dire(p.texte)
        place.cur = { ...p, frappe, t: 0, dureeS: estimate(p.texte || p.didascalie || '') / 1000 }
        if (p.texte) parler(p.qui, place.cur.dureeS, p.qui === 'viktor' ? 'direct' : null)
      }
    }
  }
  // Espace ou clic droit hors dialogue : la pensée ou la réaction en cours se frappe d'un coup ; jamais une réplique
  // épiée (spec §3.4, « Réglé en B4 » : il suffirait d'être à portée à l'instant de l'appui).
  function toutAfficherParoles() {
    for (const place of Object.values(paroles)) if (place.cur && !place.cur.frappe.fini) place.cur.frappe.toutAfficher()
  }

  // une voix qui bipe : d'où elle vient (null : la tête de la personne, suivie à chaque image)
  function parler(qui, dureeS, source) {
    if (!choeur || !(dureeS > 0)) return
    voixDe.set(qui, source)
    choeur.parler(qui, dureeS)
  }

  // ─── L'écoute : les répliques des échanges (§3.4) ───
  // Une réplique émise par la soirée se frappe au temps de jeu ; chaque mot se décide à sa première lettre, à l'I de
  // l'image (calculé avant la frappe), puis ne change plus. Son renseignement s'apprend à la fin de sa frappe si tous ses
  // mots-clés se sont affichés. Pendant un dialogue de Viktor, il ne suit aucune table : I = 0 (aucun sous-titre d'une
  // autre table, §3.4, et ce que le joueur lit est exactement ce qu'il sait).
  function ecouter({ echange, rang, replique, foyer, dureeS, debutS }) {
    const f = fragilites(replique)                 // lève sur une donnée fausse : une erreur d'image
    const point = FOYERS[foyer]
    if (!point) throw new Error(`bar : foyer inconnu « ${foyer} » (${echange})`)
    const voix = ECOUTE.voix[replique.voix ?? 'normale']
    if (!(voix > 0)) throw new Error(`bar : voix inconnue « ${replique.voix} » (${echange})`)
    const e = { echange, rang, replique, qui: replique.qui, foyer: point, voix, escorte: ESCORTE.includes(replique.qui),
      f, Is: [], I: 0, frappe: createFrappe(), dureeS, debut: debutS, horloge: debutS, ecoule: 0, finie: false, gain: 0 }
    e.frappe.dire(replique.texte, dureeFrappe(replique.texte), { masque: i => { e.Is[i] = e.I; return !affichage(e.Is, e.f)[i] } })
    ecoutes.push(e)
    parler(replique.qui, Math.max(0, debutS + dureeS - seance.t), { x: point.x, z: point.z, get voix() { return voixEcoute(e) } })
    note('replique', { echange, rang, qui: replique.qui })
  }
  // la voix d'une réplique : la sienne, baissée pour l'escorte dès MÉFIANCE (§3.6)
  const voixEcoute = e => e.voix * (e.escorte && RANG[jauge.palier] >= RANG.mefiance ? SOUPCON.effets.voixEscorte : 1)
  function avancerEcoutes() {
    for (const e of ecoutes) {
      e.I = dialogue ? 0 : intelligibilite(oeil, regardSol, { x: e.foyer.x, z: e.foyer.z, voix: voixEcoute(e) }, BOITES, ANCRES.jukebox)
      e.gain = reglageBips(oeil, regardSol, { x: e.foyer.x, z: e.foyer.z, voix: voixEcoute(e) }, BOITES).gain
      const pas = Math.max(0, seance.t - e.horloge)
      e.horloge = seance.t
      e.ecoule += pas
      if (!e.frappe.fini) {
        e.frappe.update(pas)
        if (e.frappe.fini) finDeFrappe(e)
      }
      if (!e.finie && e.ecoule >= e.dureeS - EPS) e.finie = true
    }
    for (let i = ecoutes.length - 1; i >= 0; i--) {
      if (ecoutes[i].ecoule >= ecoutes[i].dureeS + K.sousTitreS - EPS) {
        if (sousTitre === ecoutes[i]) sousTitre = null
        ecoutes.splice(i, 1)
      }
    }
    // un seul échange sous-titré, le plus intelligible ; on n'en change que s'il est dépassé de changementSousTitre, ou
    // fini (la réplique suivante du même échange lui succède)
    let meilleur = null
    for (const e of ecoutes) if (!e.finie && (e.I > 0 || e.gain > 0) && (!meilleur || e.I > meilleur.I)) meilleur = e
    if (meilleur && (!sousTitre || sousTitre.finie || meilleur.I > sousTitre.I + ECOUTE.changementSousTitre - EPS)) sousTitre = meilleur
  }
  function finDeFrappe(e) {
    const vus = affichage(e.Is, e.f)
    if (vus.every(Boolean)) entendus.add(e.echange)
    if (acquis(e.replique, vus)) apprendre(e.replique.renseignement, e.echange)
    if (e.replique.drapeau && vus.every(Boolean)) apprendre(e.replique.drapeau, e.echange)
  }
  // Un renseignement (ou un drapeau) appris : le son NOTÉ, la ligne du carnet et la pensée de Viktor, une seule fois.
  function apprendre(noms, source) {
    const nouveaux = carnet.apprendre(noms)
    if (!nouveaux.length) return
    note('appris', { noms: nouveaux, source })
    for (const n of nouveaux) tampons.set(n, seance ? seance.t : 0)
    for (const n of nouveaux) {
      if (n === 'appel' || n === 'allie') continue
      if (son) son.note()
      dire('viktor', n === 'leurre' ? LEURRE.pensee : RENSEIGNEMENTS[n].pensee)
    }
    afficherCarnet()
  }

  // ─── La soirée (src/bar/seance.js) ───
  function traiterSoiree(e) {
    if (saut) { traiterSaut(e); return }
    switch (e.type) {
      case 'clochette': if (son) son.clochette(); break
      case 'reaction': reaction(e.id); break
      case 'sonnerie': if (son) son.sonnerie(); note('sonnerie', { coup: e.coup }); break
      case 'replique': ecouter(e); quandReplique(e); break
      case 'echange': note('echange', { id: e.id, essai: e.essai }); quandEchange(e.id); break
      case 'finEchange': note('finEchange', { id: e.id }); quandFinEchange(e.id); break
      case 'reporte': note('reporte', { id: e.id, essai: e.essai }); break
      case 'perdu': note('perdu', { id: e.id }); break
      case 'silenceTables': note('silenceTables', { dureeS: e.dureeS }); break
      case 'dialogue': ouvrirDialogue(e.id, { force: true }); break
      case 'sortie': finir(e.resultat); break
      case 'demasque': demasquer(e.cause); break
      default: break
    }
  }
  // option t : la soirée passe sans être jouée ; seul ce qui change la salle est tenu (Sorel entré, l'escorte partie)
  function traiterSaut(e) {
    if (e.type === 'echange' && e.id === 'entreeSorel') quandEchange(e.id)
    else if (e.type === 'finEchange' && e.id === 'R3') quandFinEchange(e.id)
    else if (e.type === 'sortie') finir(e.resultat)
  }
  function reaction(id) {
    const r = REACTIONS[id]
    if (!r) throw new Error(`bar : réaction inconnue « ${id} »`)
    dire(r.qui, r.texte)
  }

  // ─── Ce que font les gens de la salle quand la soirée le dit ───
  // Une chorégraphie : des étapes suivies l'une après l'autre (se lever, aller quelque part par les points de passage,
  // s'asseoir, sortir de la salle), dès que la personne est prête.
  function programmer(role, etapes) {
    if (!patron(role)) return
    choregraphie.set(role, etapes.map(e => ({ ...e })))
  }
  function avancerChoregraphie() {
    for (const [role, etapes] of choregraphie) {
      const p = patron(role)
      while (etapes.length) {
        const e = etapes[0]
        if (p.enMarche) break
        if (e.type === 'lever') {
          if (!e.fait) { e.fait = true; if (p.pose === 'assis') p.seLever() }
          if (p.pose === 'assis') break
        } else if (e.type === 'aller') {
          if (p.pose === 'assis') break
          if (!e.fait) {
            e.fait = true
            const vers = typeof e.vers === 'function' ? e.vers() : e.vers
            const chemin = itineraire(p.position, vers)
            if (chemin && chemin.length) { p.marcher(chemin, { lacet: e.lacet ?? null }); break }
          }
        } else if (e.type === 'asseoir') {
          if (p.pose !== 'assis') p.asseoir(e.siege)
        } else if (e.type === 'present') {
          p.setPresent(e.oui)
        }
        etapes.shift()
      }
      if (!etapes.length) choregraphie.delete(role)
    }
  }
  // un point à approcheM de Viktor, du côté de qui vient
  const pres = role => () => {
    const p = patron(role).position, d = distance(p, oeil) || 1
    return { x: oeil.x + (p.x - oeil.x) / d * K.approcheM, z: oeil.z + (p.z - oeil.z) / d * K.approcheM }
  }
  // retour au zinc : Lise face au comptoir, comme au montage (PATRONS.casting) ; Sorel devant le zinc, tourné vers Fernand
  const versZinc = role => [role === 'lise'
    ? { type: 'aller', vers: ANCRES.lise.zinc, lacet: Math.PI / 2 }
    : { type: 'aller', vers: ANCRES.sorel.zinc, lacet: lacetVers(ANCRES.sorel.zinc, FOYERS.zinc) }]
  const versPoste = () => [{ type: 'aller', vers: ANCRES.fernand, lacet: ANCRES.fernand.lacet }]

  function quandEchange(id) {
    if (id === 'entreeSorel') {
      programmer('sorel', [{ type: 'present', oui: true }, ...versZinc('sorel')])
    } else if (id === 'appel') {
      programmer('fernand', [{ type: 'aller', vers: ANCRES.combine, lacet: lacetVers(ANCRES.combine, ANCRES.telephone) }])
    } else if (id === 'R3') {
      for (const role of ESCORTE) if (role !== 'sorel' && present(role)) programmer(role, [{ type: 'lever' }, { type: 'aller', vers: ANCRES.sorel.sortie }])
    } else if (id === 'fin') {
      const albert = patron('albert')
      if (albert) albert.geste('Wave')
    }
  }
  function quandReplique(e) {
    if (e.echange === 'appel' && e.rang === 1) programmer('sorel', [{ type: 'aller', vers: ANCRES.sorel.telephone, lacet: lacetVers(ANCRES.combine, ANCRES.telephone) }])
    if (e.echange === 'appel' && e.rang === 2) programmer('fernand', versPoste())
    if (e.echange === 'R3' && e.rang === 1) programmer('sorel', [{ type: 'aller', vers: ANCRES.sorel.sortie }])
  }
  function quandFinEchange(id) {
    const ech = ECHANGE.get(id)
    if (id === 'appel') programmer('sorel', versZinc('sorel'))
    if (id === 'A4') programmer('lise', versZinc('lise'))
    if (id === 'R3') {
      for (const role of ESCORTE) { choregraphie.delete(role); const p = patron(role); if (p) p.setPresent(false) }
    }
    if (id === 'fin') { const albert = patron('albert'); if (albert) albert.geste(null) }
    // ce que Viktor se dit à la fin d'un échange : toujours pour la fin, seulement s'il l'a entendu sinon
    if (ech && ech.pensee && (id === 'fin' || entendus.has(id))) dire('viktor', ech.pensee)
  }

  // ─── Les dialogues à choix (src/bar/dialogue.js) ───
  const etatDialogue = {
    get couverture() { return viktor.couverture },
    get renseignements() { return carnet.renseignements },
    get soupcon() { return jauge.S },
  }
  // force : la soirée l'ouvre elle-même (D2), sans attendre
  function ouvrirDialogue(id, { force = false } = {}) {
    if (dialogue || fin || stopped) return false
    const arbre = DIALOGUES[id]
    if (!arbre) throw new Error(`bar : dialogue inconnu « ${id} »`)
    const qui = arbre.interlocuteur
    if (!force && (muets.has(qui) || seance.occupe(qui) || !present(qui))) return false
    dialogue = { id, d: createDialogue(arbre, { etat: etatDialogue }) }
    faits.add(id)
    annulerMaintien()
    if (interact) interact.clear()
    controller.setFrozen(true)
    note('dialogue', { id })
    if (qui === 'sorel' || qui === 'lise') programmer(qui, [{ type: 'aller', vers: pres(qui) }])
    afficherDialogue()
    return true
  }
  function fermerDialogue() {
    const { id, d } = dialogue
    dialogue = null
    note('finDialogue', { id })
    const qui = d.interlocuteur
    if (qui === 'sorel' && !seance.escortePartie) programmer('sorel', versZinc('sorel'))
    if (qui === 'lise') programmer('lise', versZinc('lise'))
    if (!fin && !pause) controller.setFrozen(false)
    afficherDialogue()
  }
  function avancerDialogue(g) {
    if (!dialogue) return
    const d = dialogue.d
    for (const e of d.update(g)) {
      if (e.type === 'replique') {
        parler(e.qui, e.dureeS, e.qui === 'viktor' ? 'direct' : null)
        note('ligne', { qui: e.qui, texte: e.texte })
      } else if (e.type === 'choix') note('choix', { noeud: e.noeud, choix: e.choix.map(c => c.texte) })
      else if (e.type === 'tic') { if (son) son.tic() }
      else if (e.type === 'effets') { note('effets', { noeud: e.noeud, issue: e.issue, effets: e.effets }); appliquerEffets(e.effets) }
      else if (e.type === 'fin') { fermerDialogue(); return }
      if (!dialogue || fin) return
    }
  }
  function appliquerEffets(ef) {
    if (ef.soupcon != null) evenementJauge('choix', ef.soupcon)
    if (ef.evenement) evenementJauge(ef.evenement)
    if (ef.verre) servir(ef.verre)
    if (ef.couverture) viktor.couverture = ef.couverture
    if (ef.apprend) apprendre(ef.apprend, dialogue ? dialogue.id : null)
    if (ef.muet) muets.add(ef.muet)
    if (ef.aide) { aide = { texte: ef.aide, t: 0 }; note('aide', { texte: ef.aide }) }
    if (ef.surveille) viktor.surveille = true
    if (ef.ouvre) ouverts.add(ef.ouvre)
    if (ef.demasque) evenementJauge('demasque')
  }
  // les dialogues que des déclencheurs attendent : ouverts dès que l'interlocuteur est libre, dans l'ordre ; retirés
  // s'ils sont déjà joués, si l'interlocuteur ne parle plus à Viktor, ou (L1) si un verre lui a été servi entre-temps
  function ouvrirEnAttente() {
    while (!dialogue && !fin && enAttente.length) {
      const id = enAttente[0]
      if (faits.has(id) || muets.has(DIALOGUES[id].interlocuteur) || (id === 'lise-commande' && viktor.verre)) { enAttente.shift(); continue }
      if (!ouvrirDialogue(id)) return
      enAttente.shift()
    }
  }
  const attendre = id => { if (!faits.has(id) && !enAttente.includes(id)) enAttente.push(id) }

  // ─── Le verre (§3.7) ───
  function servir(sorte) {
    viktor.verre = sorte
    note('verre', { sorte })
    if (!scene) return
    if (!verreTenu) {
      const group = new THREE.Group(); group.name = 'verre-tenu'
      const vitre = new THREE.MeshPhongMaterial({ color: 0xd8e4e8, transparent: true, opacity: 0.32, shininess: 80, depthWrite: false })
      const liquide = new THREE.MeshPhongMaterial({ color: K.verre.demi, shininess: 30 })
      const verre = new THREE.CylinderGeometry(0.034, 0.028, 0.11, 16, 1, true)
      const dedans = new THREE.CylinderGeometry(0.031, 0.026, 0.075, 16).translate(0, -0.015, 0)
      const a = new THREE.Mesh(dedans, liquide), b = new THREE.Mesh(verre, vitre)
      b.renderOrder = 1
      group.add(a, b)
      scene.add(group)
      verreTenu = { group, liquide, possedes: [vitre, liquide, verre, dedans] }
    }
    verreTenu.liquide.color.setHex(sorte === 'cafe' ? K.verre.cafe : K.verre.demi)
    verreTenu.group.visible = true
  }
  const _v = new THREE.Vector3()
  function placerVerre() {
    if (!verreTenu) return
    _v.fromArray(K.verre.position).applyQuaternion(camera.quaternion).add(camera.position)
    verreTenu.group.position.copy(_v)
    verreTenu.group.quaternion.copy(camera.quaternion)
  }

  // ─── La jauge (src/bar/soupcon.js) ───
  function evenementJauge(nom, valeur) {
    const avant = jauge.S
    const emis = jauge.evenement(nom, valeur)
    note('jauge', { evenement: nom, valeur: valeur ?? null, avant, apres: jauge.S })
    suivreJauge(emis)
  }
  function suivreJauge(emis) {
    for (const e of emis) {
      if (e.type === 'palier') {
        note('palier', { de: e.de, vers: e.vers, premiere: e.premiere })
        if (e.vers === 'mefiance' && e.premiere && present('mattei')) dire('mattei', REACTIONS.mefiance.texte)
        if (e.vers === 'soupcon' && e.premiere) dire('viktor', REACTIONS.soupconViktor.texte)
        if (e.vers === 'soupcon' && seance && !seance.sorelEntre && present('dussart') && !dussartApproche) {
          dussartApproche = true
          dire('lenoir', REACTIONS.soupcon.texte)
          programmer('dussart', [{ type: 'lever' }, { type: 'aller', vers: pres('dussart') }])
        }
        if (RANG[e.vers] < RANG.soupcon && dussartApproche && present('dussart')) {
          dussartApproche = false
          programmer('dussart', [{ type: 'aller', vers: SIEGE.get('A-sud') }, { type: 'asseoir', siege: 'A-sud' }])
        }
      } else if (e.type === 'demasque') demasquer('jauge')
    }
  }

  // ─── La fin ───
  // Démasqué (§3.10) : « Toi. Debout. » (Sorel une fois entré, Dussart avant ; personne une fois l'escorte partie), puis
  // la fin. La séquence de 2,5 s (les têtes, les tables qui se lèvent, COUVERTURE GRILLÉE) est celle de la tâche B12.
  // Sorti par la porte en SOUPÇON, Sorel a déjà dit « Hé. Vous. Attendez. » : personne ne dit « Toi. Debout. » à un homme
  // debout sur le seuil.
  function demasquer(cause) {
    if (fin || demasque) return
    demasque = true
    note('demasque', { cause })
    if (jauge.palier !== 'demasque') suivreJauge(jauge.evenement('demasque'))
    const r = REACTIONS.demasque
    const qui = cause === 'sortieSoupcon' || seance.escortePartie ? null : seance.sorelEntre ? r.qui : r.quiAvantSorel
    const dit = qui && present(qui) ? qui : null
    if (dit) {
      paroles.reaction.file.length = 0; paroles.reaction.cur = null   // il coupe ce qui se disait : on le lit tout de suite
      dire(dit, r.texte)
      const p = patron(dit)
      if (p.pose === 'assis') p.seLever()
    }
    choregraphie.clear()
    finir('demasque')
    if (fin) fin.qui = dit
  }
  function sortir() {
    if (fin || !seance) return
    note('sortir', { S: jauge.S })
    for (const e of seance.sortir(jauge.S)) traiterSoiree(e)
  }
  // La fin : le noir tombe (démasqué : après sa scène), puis la scène du démasqué, le bilan (sorti, passe) ou rien
  // (abandon) ; onDone quand elle est jouée (image).
  function finir(resultat) {
    if (fin || stopped) return
    const mode = resultat === 'demasque' ? 'demasque' : resultat === 'sorti' || resultat === 'passe' ? 'bilan' : 'noir'
    fin = { resultat, t: 0, mode, faits: new Set(), qui: null, bilan: null }
    note('fin', { resultat })
    annulerMaintien()
    arcs.clear()
    if ($('#bar-card')) $('#bar-card').hidden = true
    if ($('#bar-pause')) $('#bar-pause').hidden = true
    if (ui) ui.classList.remove('en-pause')   // finie depuis la pause (SORTIR DU BAR) : la scène du démasqué bat de nouveau
    if (controller) controller.setFrozen(true)
    if (interact) interact.clear()
    if (mode !== 'demasque') noir()
    if (mode === 'bilan' && typeof onSortie === 'function') {
      try { onSortie(contrat(resultat)) } catch (e) { console.error('[bar]', e) }
    }
  }
  function noir() {
    const black = $('#bar-black')
    if (black) { black.classList.add('end'); black.classList.remove('off') }
  }
  // une étape de la fin, une seule fois, dès son instant
  const une = (cle, quand, fn) => { if (fin.t >= quand - EPS && !fin.faits.has(cle)) { fin.faits.add(cle); fn() } }
  const allumer = el => { if (!el) return; el.hidden = false; void el.offsetWidth; el.classList.add('on') }

  // Démasqué (§3.10), au temps de jeu : qui parle se lève et dit « Toi. Debout. », toutes les têtes se tournent vers
  // Viktor, la salle se tait (le son, au palier DÉMASQUÉ), les deux tables se lèvent, le noir, le tampon COUVERTURE GRILLÉE.
  function sceneDemasque(g) {
    const D = I.demasque
    une('tables', D.tablesS, () => {
      for (const r of TABLES_ESCORTE) { const p = patron(r); if (p && p.present && p.pose === 'assis') p.seLever() }
    })
    une('noir', D.noirS, noir)
    une('tampon', D.tamponS, () => allumer($('#bar-demasque')))
    avancerParoles(g)
    for (const p of casting.liste) if (p.present) { p.regarder(oeil); p.parler(!!choeur && choeur.parle(p.role)) }
    if (fin.qui && present(fin.qui)) pivoter(g, patron(fin.qui).personne)
    controller.update(0)
    suivreOeil()
    casting.update(g)
    voixEtSon(g, false)
    placerVerre()
    afficher()
  }

  // Le bilan « DOSSIER 05 » et le téléphone (§3.11), sur le noir : les quatre lignes, apprises (la valeur et NOTÉ) ou
  // INCONNU ; le téléphone vibre (les salves de l'enquête), ANTON, « Alors ? » tapé ; la réponse de Viktor. La salle reste
  // derrière la porte (la musique plus bas, comme en pause).
  function preparerBilan() {
    const donnees = bilanDe(fin.resultat === 'passe' || !carnet ? {} : carnet.renseignements)
    const el = $('#bar-bilan')
    fin.bilan = { donnees, message: null, reponse: null }
    if (!el) return
    el.querySelector('.onglet').textContent = donnees.titre
    el.querySelector('ul').innerHTML = donnees.lignes.map(l => `<li class="${l.appris ? 'su' : 'inconnu'}"><span class="lib">${esc(l.libelle)}</span>`
      + `<span class="val">${esc(l.valeur)}</span>${l.appris ? `<i class="tampon">${esc(BILAN.tampon)}</i>` : ''}</li>`).join('')
    el.querySelector('.de').textContent = donnees.telephone.de
  }
  function sceneBilan(g) {
    const B = I.bilan
    if (!fin.bilan) preparerBilan()
    const b = fin.bilan, el = $('#bar-bilan')
    une('fiche', B.ficheS, () => allumer(el))
    if (el) {
      el.querySelectorAll('li').forEach((li, k) => une(`ligne${k}`, B.ficheS + k * B.ligneS, () => li.classList.add('on')))
      const tel = el.querySelector('.bar-tel')
      une('telephone', B.telephoneS, () => tel.classList.add('on'))
      for (let k = 0; k < B.salves; k++) {
        const debut = B.telephoneS + k * (B.salveS + B.ecartS)
        une(`salve${k}`, debut, () => { tel.classList.add('vibre'); if (son) son.vibre() })
        une(`finSalve${k}`, debut + B.salveS, () => tel.classList.remove('vibre'))
      }
    }
    une('message', B.messageS, () => { b.message = createFrappe(); b.message.dire(b.donnees.telephone.message) })
    une('viktor', B.viktorS, () => {
      b.reponse = createFrappe(); b.reponse.dire(b.donnees.viktor)
      parler('viktor', estimate(b.donnees.viktor) / 1000, 'direct')
      if (el) el.querySelector('.viktor').classList.add('on')
    })
    if (b.message) { b.message.update(g); if (el) changer('bilan.msg', b.message.texte, v => { el.querySelector('.msg').textContent = v }) }
    if (b.reponse) { b.reponse.update(g); if (el) changer('bilan.viktor', b.reponse.texte, v => { el.querySelector('.viktor .tx').textContent = v }) }
    voixEtSon(g, true)
    if (choeur) choeur.update(g, { sources: { viktor: { gain: 1, pan: 0 } }, sousTitre: null })
  }

  // une erreur en cours de route ne bloque pas la partie : on termine en « erreur », avec ce qui est appris. Pendant une
  // fin déjà décidée (la scène du démasqué, le bilan), son résultat tient (relecture de B12) : une partie perdue ne mène
  // pas au convoi, et onDone rend le contrat qu'onSortie a reçu ; l'erreur y est jointe.
  function fail(error) {
    console.error('[bar]', error)
    if (stopped) return
    let payload
    try { payload = { ...contrat(fin ? fin.resultat : 'erreur'), error } } catch (e) { payload = { resultat: 'erreur', renseignements: createCarnet().renseignements, couverture: null, error } }
    stop()
    report(payload)
  }

  // ─── Les poses de Viktor (§3.7) ───
  function asseoir(siege) {
    viktor.posture = 'assis'; viktor.siege = siege
    annulerMaintien()
    controller.setPose({ x: siege.x, z: siege.z, y: siege.oeil, yaw: siege.lacet, pitch: -0.12 })
    controller.setMoveLocked(true)
    note('assis', { siege: siege.id })
    if (!viktor.verre) attendre('lise-commande')
  }
  function accouder() {
    const P = PLACES.mangeDeboutEst
    viktor.posture = 'accoude'; viktor.siege = null
    annulerMaintien()
    controller.setPose({ x: P.x, z: P.z, y: K.oeilDebout, yaw: P.lacet, pitch: -0.05 })
    controller.setMoveLocked(true)
    note('accoude')
  }
  function seRelever() {
    if (viktor.posture === 'debout') return
    const p = controller.position
    viktor.posture = 'debout'; viktor.siege = null
    controller.setPose({ x: p.x, z: p.z, y: K.oeilDebout })
    controller.setMoveLocked(false)
    note('debout')
  }
  const poseJauge = () => (viktor.posture === 'debout' ? 'debout' : viktor.verre ? 'pose' : viktor.posture === 'assis' ? 'assis' : 'debout')

  // ─── Agir : E ou le clic gauche ───
  function typeDe(id) {
    const c = [...salle.cibles, ...casting.cibles].find(x => x.userData.barId === id)
    return c ? c.userData.type : null
  }
  function appuyer(par) {
    if (!started || fin || pause || dialogue) return
    if (viktor.posture !== 'debout') { seRelever(); return }
    const id = interact.current
    if (!id) return
    const type = typeDe(id)
    if (type === 'siege') asseoir(SIEGE.get(id))
    else if (type === 'place') accouder()
    else if (type === 'objet') {
      if (id === 'porte' || id === 'jukebox') maintien = { cible: id, par, t: 0 }
      else if (id === 'photo') { photoVue = true; dire('viktor', OBJETS.photo.pensee) }
      else if (id === 'journal') { dire('viktor', OBJETS.journal.une); dire('viktor', OBJETS.journal.pensee) }
      else if (id === 'fenetre') dire('viktor', OBJETS.fenetre.pensee)
    } else if (type === 'personne') parlerA(id)
  }
  function relacher(par) { if (maintien && maintien.par === par) annulerMaintien() }
  function annulerMaintien() { maintien = null }
  function parlerA(id) {
    if (id === 'albert') { if (!albertParle) { albertParle = true; dire('albert', ALBERT.parle) } }
    else if (id === 'fernand') attendre(!faits.has('fernand') ? 'fernand' : ouverts.has('fernand-photo') ? 'fernand-photo' : 'fernand')
    else if (id === 'lise' && !viktor.verre) attendre('lise-commande')
  }
  const peutParler = id => (id === 'albert' && !albertParle) || (id === 'fernand' && !muets.has('fernand')
    && (!faits.has('fernand') || (ouverts.has('fernand-photo') && !faits.has('fernand-photo')))) || (id === 'lise' && !viktor.verre && !faits.has('lise-commande'))
  function avancerMaintien(g) {
    if (!maintien) return
    if (interact.current !== maintien.cible || viktor.posture !== 'debout') { annulerMaintien(); return }
    maintien.t += g
    if (maintien.t < K.maintienS - EPS) return
    const cible = maintien.cible
    annulerMaintien()
    if (cible === 'porte') sortir()
    else { compteurs.jukebox = K.jukeboxPretexteS; note('jukebox') }
  }

  // ─── Les déclencheurs hors de l'horloge (§3.9, « Réglé en B6 ») ───
  function declencheurs(g, p) {
    compteurs.joue += g
    const auComptoir = dansZone('comptoir', p)
    if (auComptoir && !faits.has('fernand')) attendre('fernand')                       // D1, au premier passage au zinc
    if (auComptoir && faits.has('fernand')) compteurs.zinc += g
    if (ouverts.has('fernand-photo') && (photoVue || compteurs.zinc >= K.zincS - EPS)) attendre('fernand-photo')   // F3
    if (!viktor.verre) {
      compteurs.sansVerre += g
      if (compteurs.sansVerre >= K.liseCommandeS - EPS) attendre('lise-commande')     // L1
      if (!sansCommandeFait && compteurs.sansVerre >= COUVERTURE.sansCommandeS - EPS) {
        sansCommandeFait = true
        evenementJauge('sansCommande')
        if (present('lise')) dire('lise', REACTIONS.sansCommande.texte)
      }
    }
    // 90 s cumulées à moins de 3 m d'une table de l'escorte (§3.6), tant qu'elle est là
    if (!seance.escortePartie && (distance(p, TABLES.A) < SOUPCON.presenceTablesM || distance(p, TABLES.B) < SOUPCON.presenceTablesM)) {
      compteurs.tables += g
      if (compteurs.tables >= SOUPCON.presenceTablesS - EPS) { compteurs.tables = 0; evenementJauge('presenceTables') }
    }
    // Lise part servir la table A un peu avant A4 (« Je te ressers, Dussart ? ») ; elle revient au zinc à sa fin
    const a4 = ECHANGE.get('A4')
    if (!liseServie && seance.t >= a4.t - K.liseServirAvantS - EPS && seance.statut('A4') === 'attente' && present('lise')
      && !(dialogue && dialogue.d.interlocuteur === 'lise')) {
      liseServie = true
      programmer('lise', [{ type: 'aller', vers: ANCRES.lise.A, lacet: lacetVers(ANCRES.lise.A, TABLES.A) }])
    }
    if (compteurs.jukebox > 0) compteurs.jukebox = Math.max(0, compteurs.jukebox - g)
    // Albert murmure devant la course, écouté comme un échange (§3.14)
    compteurs.murmure -= g
    if (compteurs.murmure <= 0 && !seance.occupe('albert') && present('albert')) {
      const [a, b] = K.murmuresAlbertS
      compteurs.murmure = a + hasard() * (b - a)
      if (!ecoutes.some(e => e.qui === 'albert' && !e.finie)) {
        const texte = ALBERT.murmures[Math.floor(hasard() * ALBERT.murmures.length)]
        ecouter({ echange: 'albert', rang: 0, replique: { qui: 'albert', texte }, foyer: 'albert', dureeS: estimate(texte) / 1000, debutS: seance.t })
      }
    }
    if (aide) { aide.t += g; if (aide.t >= estimate(aide.texte) / 1000 + K.sousTitreS * 2) aide = null }
  }
  function pretexte(p) {
    if (viktor.posture === 'accoude' || distance(p, PLACES.mangeDeboutEst) < K.pretexteM) return 'flechettes'
    if (seance.wcOccupe && distance(p, PLACES.entreeCouloir) < K.pretexteM) return 'toilettes'
    if (compteurs.jukebox > 0 && distance(p, ANCRES.jukebox) < K.pretexteM * 1.5) return 'jukebox'
    return null
  }

  // ─── Les regards et la jauge (§3.5, §3.6) : l'ordre de regard.js ───
  function regardsEtJauge(g, p) {
    const emis = regards.update(g, { oeil, direction, interlocuteur: dialogue ? dialogue.d.interlocuteur : null,
      assisAvecVerre: viktor.posture === 'assis' && !!viktor.verre })
    const temoins = [...regards.temoins]
    const interdite = dansZone('interdite', p)
    if (interdite && present('fernand') && !temoins.includes('fernand')) temoins.push('fernand')   // il voit toujours le zinc
    const vu = temoins.some(c => SOUPCON.temoins[c] > 0)
    vuParQuiCompte = vu
    if (interdite && !viktor.interdite && vu) evenementJauge('surprisZoneInterdite')
    viktor.interdite = interdite
    const sources = [...regards.sources]
    if (interdite) sources.push('zoneInterdite')
    if (ESCORTE.some(r => present(r) && distance(patron(r).personne, p) < SOUPCON.tropPresM)) sources.push('tropPres')
    if (dansZone('privee', p) && !viktor.verre) sources.push(pretexte(p) ? 'zonePriveePretexte' : 'zonePrivee')
    // les −2/s de la table d'Albert (§3.14) : une fois qu'il a parlé à Albert, tant qu'il est assis à sa chaise libre
    suivreJauge(jauge.update(g, { sources, temoins, pose: poseJauge(),
      baisseEnPlus: albertParle && viktor.siege && viktor.siege.id === 'D-ouest' ? COUVERTURE.albertBaisse : 0,
      facteurBaisse: viktor.surveille ? SOUPCON.surveilleBaisse : 1 }))
    if (fin) return
    for (const e of emis) {
      if (e.type === 'remarque') {
        note('remarque', { qui: e.qui, categorie: e.categorie })
        if (e.categorie === 'escorte') arcs.set(e.qui, I.arcS)
        evenementJauge('remarque', e.categorie)
        if (!premiereRemarque) { premiereRemarque = true; dire('viktor', REACTIONS.premiereFixation.texte) }
        if (e.categorie === 'escorte' && !l2Du) { l2Du = true; attendre('lise-regard') }
      } else if (e.type === 'replique') {
        const r = (REGARDS[e.qui] || [])[e.rang]
        if (!r) continue
        dire(e.qui, r.texte, { didascalie: r.didascalie || null })
        if (e.qui === 'haas' && e.rang === 2) patron('haas').seLever({ demi: true })
        if (r.lance && !dialogue) ouvrirDialogue(r.lance, { force: true })
      }
      if (fin) return
    }
  }

  // ─── Les têtes de la salle : qui suit Viktor, qui écoute qui ───
  function tetes(g) {
    if (RANG[jauge.palier] >= RANG.mefiance && !seance.escortePartie) {
      prochainCoup -= g
      if (prochainCoup <= 0) {
        const [a, b] = SOUPCON.effets.regardS
        prochainCoup = a + hasard() * (b - a)
        const la = ESCORTE.filter(present)
        if (la.length) coupsOeil.set(la[Math.floor(hasard() * la.length)], K.regardMefianceS)
      }
    }
    for (const [r, s] of coupsOeil) { if (s - g <= 0) coupsOeil.delete(r); else coupsOeil.set(r, s - g) }
    const parlent = new Map()   // échange → qui parle
    for (const e of ecoutes) if (!e.finie) parlent.set(e.echange, e.qui)
    for (const p of casting.liste) {
      if (!p.present) continue
      const role = p.role
      p.parler(!!choeur && choeur.parle(role))
      let vers = null
      if (regards.etat(role).alerte > 0 || (dialogue && dialogue.d.interlocuteur === role) || coupsOeil.has(role)) vers = oeil
      else {
        for (const [echange, qui] of parlent) {
          const ech = ECHANGE.get(echange)
          if (qui !== role && ech && ech.repliques.some(x => x.qui === role) && present(qui)) { vers = patron(qui).personne; break }
        }
      }
      p.regarder(vers)
    }
  }

  // ─── Les voix et le son de la salle ───
  function voixEtSon(g, enPause) {
    const situation = {
      presents: casting ? casting.liste.filter(p => p.present).length : 0,
      soupcon: jauge.S, palier: jauge.palier,
      jukebox: { T: transmission(oeil, ANCRES.jukebox, BOITES), pan: reglageBips(oeil, regardSol, ANCRES.jukebox, BOITES).pan, gain: 1 },
      tele: { T: transmission(oeil, ANCRES.tele, BOITES), pan: reglageBips(oeil, regardSol, ANCRES.tele, BOITES).pan },
    }
    if (son) son.update(Math.min(g, 0.05), { pause: enPause, ...situation })
    if (enPause || !choeur) return
    const sources = {}
    for (const [qui, src] of voixDe) {
      if (!choeur.parle(qui)) { voixDe.delete(qui); continue }
      if (src === 'direct') { sources[qui] = { gain: 1, pan: 0 }; continue }
      const point = src || (patron(qui) ? patron(qui).personne : FOYERS.combine)
      sources[qui] = reglageBips(oeil, regardSol, { x: point.x, z: point.z, voix: src && src.voix }, BOITES)
    }
    choeur.update(g, { sources, sousTitre: sousTitre && !sousTitre.finie ? sousTitre.qui : null })
  }

  // ─── Une image ───
  function image(dt) {
    const reel = Math.min(Math.max(+dt || 0, 0), 0.1)
    if (fin) {
      fin.t += reel
      if (fin.mode === 'demasque') sceneDemasque(reel)
      else if (fin.mode === 'bilan') sceneBilan(reel)
      const duree = fin.mode === 'demasque' ? I.demasque.dureeS : fin.mode === 'bilan' ? I.bilan.finS : K.noirFinS
      if (fin.t >= duree - EPS) { const payload = contrat(fin.resultat); stop(); report(payload) }
      return
    }
    if (!started) { controller.update(0); return }
    if (pause) {
      if (reprise !== null) {
        reprise += reel
        if (reprise >= K.repriseS - EPS && !locked()) { reprise = null; $('#bar-retry').hidden = false }
      }
      controller.update(0)
      voixEtSon(reel, true)
      return
    }
    jouer(reel)
  }
  // La vue pivote vers qui parle à Viktor (dialogue, démasqué), hors effets atténués (§3.8, §9 : le panneau dit qui parle)
  function pivoter(g, point) {
    if (attenue || !point || !controller) return
    const p = controller.position, dx = point.x - p.x, dz = point.z - p.z, d = Math.hypot(dx, dz)
    if (d < 1e-3) return
    const lacet = Math.atan2(-dx, -dz), tangage = Math.atan2((point.y ?? camera.position.y) - camera.position.y, d)
    const k = 1 - Math.exp(-g / I.pivot.reponseS)
    const ecart = Math.atan2(Math.sin(lacet - controller.yaw), Math.cos(lacet - controller.yaw))
    controller.setPose({ x: p.x, z: p.z, yaw: controller.yaw + ecart * k, pitch: controller.pitch + (tangage - controller.pitch) * k })
  }
  // l'œil de Viktor, le centre de l'écran et le regard au sol, relus sur le contrôleur
  function suivreOeil() {
    const p = controller.position
    oeil.x = p.x; oeil.y = camera.position.y; oeil.z = p.z
    const yaw = controller.yaw, pitch = controller.pitch
    direction.x = -Math.sin(yaw) * Math.cos(pitch); direction.y = Math.sin(pitch); direction.z = -Math.cos(yaw) * Math.cos(pitch)
    regardSol = forwardOf(yaw)
    return p
  }
  function jouer(g) {
    if (dialogue && present(dialogue.d.interlocuteur)) pivoter(g, patron(dialogue.d.interlocuteur).personne)
    for (const [r, s] of arcs) { if (s - g <= EPS) arcs.delete(r); else arcs.set(r, s - g) }
    controller.update(!dialogue && viktor.posture === 'debout' && (locked() || cam) ? g : 0)
    const p = suivreOeil()

    for (const e of seance.update(g, { palier: jauge.palier, dialogue: dialogue ? dialogue.d : null, appris: carnet.appris })) {
      traiterSoiree(e)
      if (fin) return
    }
    avancerDialogue(g)
    if (dialogue && dialogue.d.fini) fermerDialogue()
    if (fin) return
    avancerEcoutes()
    avancerParoles(g)
    declencheurs(g, p)
    if (fin) return
    ouvrirEnAttente()
    avancerChoregraphie()
    tetes(g)
    casting.update(g)
    regardsEtJauge(g, p)
    if (fin) return
    salle.update(g)
    salle.setWcOccupe(seance.wcOccupe)
    voixEtSon(g, false)
    placerVerre()
    scene.updateMatrixWorld()   // la visée lit les matrixWorld des cibles
    const viser = !dialogue && viktor.posture === 'debout'
    if (viser) interact.update(); else interact.clear()
    avancerMaintien(g)
    afficher()
  }

  // ─── L'interface (tâche B12) ───
  // qui parle : le rôle, puis le nom une fois qu'il s'est lu à l'écran (§3.4, comme « INCONNU » devenu « ANTON »)
  const nom = qui => {
    const p = PERSONNES[qui]
    if (!p) return String(qui).toUpperCase()
    return p.nom && nommes.has(qui) ? p.nom : p.role
  }
  function entendreNoms(texte) {
    if (!texte) return
    for (const mot of texte.split(/\s+/)) {
      const f = forme(mot)
      if (f) for (const [id, n] of NOMS) if (f === n) nommes.add(id)
    }
  }
  // d'où vient une voix, vue de Viktor : 'gauche' ou 'droite' hors du champ de la caméra, null dedans
  function cote(point) {
    if (!point) return null
    const dx = point.x - oeil.x, dz = point.z - oeil.z
    const devant = dx * regardSol.x + dz * regardSol.z, droite = -dx * regardSol.z + dz * regardSol.x
    if (Math.hypot(devant, droite) < 1e-6) return null
    const demi = Math.atan(Math.tan(camera.fov * Math.PI / 360) * (camera.aspect || 1))
    if (Math.atan2(Math.abs(droite), devant) <= demi) return null
    return droite > 0 ? 'droite' : 'gauche'
  }
  const etiquette = (qui, point) => {
    const c = cote(point)
    return `${c === 'gauche' ? '‹ ' : ''}${nom(qui)}${c === 'droite' ? ' ›' : ''}`
  }
  function ligne(el, spk, texte, on) {
    if (!el) return
    const id = el.id
    changer(`${id}.spk`, spk, v => { el.querySelector('.spk').textContent = v })
    changer(`${id}.tx`, texte, v => { el.querySelector('.tx').textContent = v })
    changer(`${id}.on`, on, v => el.classList.toggle('on', v))
  }
  const texteParole = cur => (cur ? [cur.didascalie ? `(${cur.didascalie})` : '', cur.frappe.texte].filter(Boolean).join(' ') : '')
  const pointDe = qui => (present(qui) ? patron(qui).personne : null)

  function afficher() {
    if (!ui) return
    const t = seance.t
    // l'heure, et son point qui s'éteint et se rallume au temps de jeu (fixe en effets atténués, §9)
    changer('heure', `LE BIVOUAC · ${seance.heure}`, v => { $('#bar-heure .tx').textContent = v })
    changer('heure.pt', !attenue && Math.floor(t / I.pointHeureS + EPS) % 2 === 1, v => $('#bar-heure .pt').classList.toggle('off', v))
    afficherJauge()
    afficherRegard()
    // les lignes : la pensée de Viktor, ce qu'on lui dit, le sous-titre d'écoute (jamais pendant un dialogue ni à la fin)
    const pe = paroles.pensee.cur
    ligne($('#bar-pensee'), 'VIKTOR', texteParole(pe), !!pe)
    const re = paroles.reaction.cur, reOn = !!re && (!dialogue || !!fin)
    if (reOn) entendreNoms(re.frappe.texte)
    ligne($('#bar-reaction'), re ? etiquette(re.qui, pointDe(re.qui)) : '', texteParole(re), reOn)
    const st = sousTitre, stOn = !!st && !dialogue && !fin
    const stTexte = st ? masquer(st.frappe.motsFrappes, st.Is, st.f) : ''
    if (stOn) entendreNoms(stTexte)
    ligne($('#bar-sub'), st ? etiquette(st.qui, st.foyer) : '', stTexte, stOn)
    changer('aide', aide ? aide.texte : '', v => { $('#bar-aide').textContent = v; $('#bar-aide').classList.toggle('on', !!v) })
    afficherInvite()
    afficherCarnet()
    afficherDialogue()
    if (statsEl) statsEl.textContent = `appels ${renderer.info.render.calls} · triangles ${renderer.info.render.triangles}`
  }

  // la jauge (§3.6) : l'œil, la barre graduée à 30 et 60, le plancher hachuré, le palier ; la vignette rouge dès SOUPÇON
  function afficherJauge() {
    const palier = jauge.palier, rang = RANG[palier]
    changer('jauge.classe', `bar-jauge p-${palier}${vuParQuiCompte ? ' vu' : ''}`, v => { $('#bar-jauge').className = v })
    changer('jauge.palier', PALIER_LIBELLE[palier], v => { $('#bar-jauge .bar-palier').textContent = v })
    changer('jauge.S', +(jauge.S / PLAFOND * 100).toFixed(2), v => { $('#bar-jauge .niveau').style.width = `${v}%` })
    changer('jauge.plancher', +(jauge.plancher / PLAFOND * 100).toFixed(2), v => { $('#bar-jauge .plancher').style.width = `${v}%` })
    // le battement de la jauge et de la vignette suit celui du cœur (SON.coeur : de 1,1 s à S = 60 jusqu'à 0,6 s à 100)
    const [lent, vite] = SON.coeur.intervalleS, [s0, s1] = SON.coeur.soupcon
    const bat = lent + (vite - lent) * Math.min(1, Math.max(0, (jauge.S - s0) / (s1 - s0)))
    changer('bat', bat.toFixed(2), v => ui.style.setProperty('--bat', `${v}s`))
    changer('vignette', rang >= RANG.soupcon, v => $('#bar-vignette').classList.toggle('on', v))
  }

  // l'anneau de fixation (la fixation la plus avancée, rapportée à la tolérance de la personne : rouge au-delà) et les arcs
  // du bord vers un homme de l'escorte hors champ qui vient de remarquer Viktor
  function afficherRegard() {
    let rapport = 0
    if (!fin) {
      for (const p of casting.liste) {
        if (!p.present) continue
        const e = regards.etat(p.role)
        if (e.fixation > 0 && Number.isFinite(e.tolerance) && e.tolerance > 0) rapport = Math.max(rapport, e.fixation / e.tolerance)
      }
    }
    const a = $('#bar-anneau')
    changer('anneau.p', +Math.min(1, rapport).toFixed(3), v => a.style.setProperty('--p', String(v)))
    changer('anneau.on', rapport > 0, v => a.classList.toggle('on', v))
    changer('anneau.rouge', rapport >= 1 - EPS, v => a.classList.toggle('rouge', v))
    let g = false, d = false
    for (const role of arcs.keys()) {
      const c = cote(pointDe(role))
      if (c === 'gauche') g = true
      else if (c === 'droite') d = true
    }
    changer('arc.g', g, v => $('#bar-arc-g').classList.toggle('on', v))
    changer('arc.d', d, v => $('#bar-arc-d').classList.toggle('on', v))
  }

  // l'invite de ce qu'on vise ; maintenir E (sortir, une pièce) remplit l'anneau ambré autour de la touche
  function afficherInvite() {
    const id = fin || dialogue ? null : interact.current, k = keyName('KeyE')
    let texte = '', tenir = false
    if (!fin && !dialogue && viktor.posture !== 'debout') texte = 'SE LEVER'
    else if (id) {
      const type = typeDe(id)
      if (type === 'siege') texte = 'S\'ASSEOIR'
      else if (type === 'place') texte = 'S\'ACCOUDER'
      else if (id === 'porte') { tenir = true; texte = `SORTIR · RENSEIGNEMENTS ${carnet.appris} / ${QUATRE.length}` }
      else if (id === 'jukebox') { tenir = true; texte = 'UNE PIÈCE' }
      else if (type === 'objet' && OBJETS[id]) texte = 'REGARDER'
      else if (type === 'personne' && peutParler(id)) texte = 'PARLER'
    }
    const pr = $('#bar-prompt')
    changer('invite.k', k, v => { pr.querySelector('.touche b').textContent = v })
    // « MAINTENIR E : SORTIR », comme l'enquête : le verbe avant la touche et son anneau
    changer('invite.avant', tenir ? 'MAINTENIR ' : '', v => { pr.querySelector('.avant').textContent = v })
    changer('invite.tx', texte ? ` : ${texte}` : '', v => { pr.querySelector('.tx').textContent = v })
    changer('invite.on', !!texte, v => pr.classList.toggle('on', v))
    changer('invite.maintien', tenir, v => pr.classList.toggle('maintien', v))
    changer('invite.p', tenir ? +Math.min(1, maintienEnCours() / K.maintienS).toFixed(3) : 0, v => pr.style.setProperty('--p', String(v)))
    changer('croix', !!id && viktor.posture === 'debout', v => $('.bar-cross').classList.toggle('on', v))
  }
  const maintienEnCours = () => (maintien ? maintien.t : 0)

  // le panneau de dialogue : onglet, réplique, choix 1 à 3 (créés quand ils changent ; la surbrillance suit la touche
  // sans les recréer), la minuterie qui raccourcit, du ton du texte puis rouge sur ses 3 dernières secondes (BAR-3)
  function afficherDialogue() {
    const el = $('#bar-dialogue')
    if (!el) return
    const ouvert = !!dialogue && !fin
    changer('dialogue.ouvert', ouvert, v => { el.hidden = !v })
    if (!ouvert) return
    const d = dialogue.d
    const replique = d.qui ? `${nom(d.qui)} : ${d.texte}` : ''
    entendreNoms(d.texte)
    changer('dialogue.onglet', nom(d.interlocuteur), v => { el.querySelector('.bar-onglet').textContent = v })
    changer('dialogue.did', d.didascalie ? `(${d.didascalie}) ` : '', v => { el.querySelector('.did').textContent = v })
    changer('dialogue.tx', replique, v => { el.querySelector('.bar-replique .tx').textContent = v })
    const liste = el.querySelector('.bar-choix'), choix = d.choix
    changer('dialogue.choix', `${dialogue.id}#${choix.map(c => c.texte).join('|')}`, () => {
      liste.innerHTML = choix.map(c => `<li data-n="${c.n}"><b>${libelleChoix(c.n)}</b> ${esc(c.texte)}</li>`).join('')
      cache.delete('dialogue.surbrillance')
    })
    changer('dialogue.surbrillance', d.surbrillance, n => { for (const li of liste.children) li.classList.toggle('on', +li.dataset.n === n) })
    const m = el.querySelector('.bar-minuterie')
    changer('dialogue.minuterie', d.restant == null ? 0 : +Math.max(0, d.restant / d.delai).toFixed(4), v => { m.querySelector('i').style.transform = `scaleX(${v})` })
    changer('dialogue.alerte', d.restant != null && d.restant <= I.minuterieAlerteS + EPS, v => m.classList.toggle('alerte', v))
  }

  // le carnet « CE QU'IL ME FAUT » : une ligne par renseignement, le tampon NOTÉ un temps sur ce qui vient de s'apprendre,
  // le compte ; il ne bloque rien (rien ne s'arrête quand il change)
  function afficherCarnet() {
    const el = $('#bar-carnet')
    if (!el || !carnet) return
    const r = carnet.renseignements, t = seance ? seance.t : 0
    const frais = n => tampons.has(n) && t - tampons.get(n) < I.noteS - EPS
    const tampon = n => (frais(n) ? `<i class="tampon">${esc(CARNET.tampon)}</i>` : '')
    const cle = QUATRE.concat('leurre').map(n => `${r[n] ? 1 : 0}${frais(n) ? 'n' : ''}`).join('')
    changer('carnet.titre', CARNET.titre, v => { el.querySelector('.titre').textContent = v })
    changer('carnet.compte', `${carnet.appris} / ${QUATRE.length}`, v => {
      const b = document.createElement('b'); b.className = 'compte'; b.textContent = v      // un élément neuf : sa frappe rejoue
      el.querySelector('.compte').replaceWith(b)
    })
    changer('carnet.lignes', cle, () => {
      const lignes = QUATRE.map(n => `<li class="${r[n] ? 'su' : ''}">${esc(RENSEIGNEMENTS[n].libelle)}${r[n] ? ` · ${esc(RENSEIGNEMENTS[n].valeur)}` : ''}${tampon(n)}</li>`)
      if (r.leurre) lignes.splice(2, 0, `<li class="su">${esc(LEURRE.carnet)}${tampon('leurre')}</li>`)
      el.querySelector('ul').innerHTML = lignes.join('')
    })
  }
  // libellé d'une touche physique selon la disposition du clavier, sinon dérivé du code
  const keyName = code => { const k = layout && layout.get(code); return k ? String(k).toUpperCase() : keyLabel(code) }
  function montrerTouches() {
    const k = settings.pvpKeys, codes = [k.forward, k.left, k.back, k.right]
    const rendre = libelles => {
      const el = $('.bar-card .k'); if (!el) return
      const kb = s => `<kbd>${esc(s)}</kbd>`
      el.innerHTML = `<span>${libelles.map(kb).join('')} SE DÉPLACER</span><i></i><span>SOURIS : REGARDER</span><i></i>` +
        `<span>${kb(keyName('KeyE'))} AGIR</span><i></i><span>${kb('1')}${kb('2')}${kb('3')} RÉPONDRE</span><i></i><span>${kb('ÉCHAP')} PAUSE</span>`
    }
    rendre(codes.map(keyLabel))
    try {
      const kbd = navigator.keyboard
      if (kbd && typeof kbd.getLayoutMap === 'function') kbd.getLayoutMap().then(map => { if (stopped) return; layout = map; rendre(codes.map(keyName)) }, () => {})
    } catch (e) { /* libellés dérivés des codes */ }
  }

  // ─── Départ, pause ───
  function commencer() {
    if (started) return
    started = true
    const ctx = audio && audio.ctx
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') { try { ctx.resume().catch(() => {}) } catch (e) { /* le son attendra */ } }
    const black = $('#bar-black'); void black.offsetWidth; black.classList.add('off')
    note('debut', { t: seance.t })
    dire('viktor', OBJETS.entree.pensee)
    afficherCarnet()
  }
  function demanderVerrou() {
    if (stopped || fin) return
    if (locked()) quandVerrou(); else controller.lock(renderer.domElement)
  }
  function reprendre() {
    demanderVerrou()
    reprise = locked() ? null : 0
  }
  function quandVerrou() {
    if (stopped || fin || !locked()) return
    $('#bar-card').hidden = true; $('#bar-pause').hidden = true
    $('#bar-retry').hidden = true; reprise = null
    if (pause) { pause = false; ui.classList.remove('en-pause'); note('reprise') }
    controller.setFrozen(!!dialogue)
    if (!started) commencer()
  }
  function mettreEnPause() {
    if (!started || fin || stopped || cam || pause) return
    pause = true
    ui.classList.add('en-pause')   // les battements CSS (vignette, jauge, anneau, arcs) s'arrêtent avec le reste (§3.10)
    controller.setFrozen(true)
    annulerMaintien()
    if (interact) interact.clear()
    reprise = null
    $('#bar-retry').hidden = true
    $('#bar-pause').hidden = false
    note('pause')
  }

  // ─── Écouteurs ───
  const garde = fn => e => { try { fn(e) } catch (error) { fail(error) } }
  const onKey = garde(e => {
    if (!started || fin || pause) return
    if (dialogue) { dialogue.d.touche(e); return }
    if (e.repeat) return
    if (e.code === 'KeyE') appuyer('touche')
    else if (e.code === 'Space') toutAfficherParoles()
  })
  const onKeyUp = garde(e => { if (e.code === 'KeyE') relacher('touche') })
  const onMouse = garde(e => {
    if (!locked() || !started || fin || pause) return
    if (dialogue) { if (e.button === 0) dialogue.d.valider(); else if (e.button === 2) dialogue.d.toutAfficher(); return }
    if (e.button === 0) appuyer('souris')
    else if (e.button === 2) toutAfficherParoles()
  })
  const onMouseUp = garde(e => { if (e.button === 0) relacher('souris') })
  const onWheel = garde(e => { if (dialogue && locked() && e.deltaY) dialogue.d.deplacer(Math.sign(e.deltaY)) })
  const onLock = garde(quandVerrou)
  // fenêtre quittée (Alt-Tab) : les touches tenues ne recevront pas leur keyup → on les relâche, maintien compris
  const onBlur = () => {
    annulerMaintien()
    if (controller && !controller.frozen) { controller.setFrozen(true); controller.setFrozen(false) }
  }

  // ─── Démontage : idempotent, ne lève jamais ───
  function stop() {
    if (stopped) return
    stopped = true
    const safe = fn => { try { fn() } catch (e) { console.error('[bar] démontage :', e) } }
    for (const [t, type, fn, o] of listening) safe(() => t.removeEventListener(type, fn, o))
    listening.length = 0
    if (controller) safe(() => controller.dispose())
    if (interact) safe(() => interact.clear())
    if (choeur) safe(() => choeur.dispose())
    if (son) safe(() => son.stop())
    if (casting) safe(() => casting.dispose())
    if (salle) safe(() => salle.dispose())
    if (verreTenu) safe(() => verreTenu.possedes.forEach(x => x.dispose()))
    if (scene) safe(() => scene.clear())
    if (saved) safe(() => {
      camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far
      camera.position.copy(saved.position)
      camera.rotation.order = saved.order
      camera.quaternion.copy(saved.quaternion)
      camera.updateProjectionMatrix()
    })
    if (savedAuto !== null) safe(() => { renderer.shadowMap.autoUpdate = savedAuto })
    safe(() => { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock() })
    if (ui) safe(() => ui.remove())
    if (style) safe(() => style.remove())
  }

  // ─── Montage ───
  let statsEl = null
  try {
    cam = lirePose(opts.cam)
    attenue = !!effectsReduced()
    hasard = generateur(K.graine)
    // le premier murmure d'Albert, tiré comme les suivants : jamais à l'entrée, avec « Bonsoir. » et la pensée d'entrée
    compteurs.murmure = K.murmuresAlbertS[0] + hasard() * (K.murmuresAlbertS[1] - K.murmuresAlbertS[0])
    salle = creerSalle({ attenue })
    casting = creerCasting()
    scene = new THREE.Scene()
    scene.fog = salle.brouillard
    scene.background = salle.brouillard.color
    scene.add(salle.group, casting.group)

    // caméra et ombres du jeu : sauvegardées avant toute retouche (le contrôleur change l'ordre de rotation)
    saved = { fov: camera.fov, near: camera.near, far: camera.far, position: camera.position.clone(), quaternion: camera.quaternion.clone(), order: camera.rotation.order }
    camera.fov = K.camera.fov; camera.near = K.camera.near; camera.far = K.camera.far
    camera.updateProjectionMatrix()
    savedAuto = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false     // l'ombre du soleil est calculée à la première image, puis figée
    renderer.shadowMap.needsUpdate = true

    jauge = createSoupcon()
    carnet = createCarnet(lireInfos(opts.infos))
    seance = createSeance()
    regards = createRegards(casting.personnes)
    son = creerSon(audio)
    choeur = creerChoeur(audio, { reverberation: son.reverberation })
    const depart = ANCRES.depart
    controller = createFpsController({ camera, colliders: salle.collisions, eye: K.oeilDebout, speed: K.vitesse,
      start: { x: depart.x, z: depart.z, yaw: depart.lacet, pitch: K.tangageDepart }, balancement: !attenue,
      onStep: () => { if (son) son.pas() }, onUnlock: () => mettreEnPause(), onMoveKey: () => seRelever() })
    interact = createInteract({ camera, targets: [...salle.cibles, ...casting.cibles], occluders: salle.occultants, cle: 'barId' })
    if (cam) controller.setPose(cam)
    controller.update(0)
    oeil.x = controller.position.x; oeil.y = camera.position.y; oeil.z = controller.position.z
    scene.updateMatrixWorld()
    try { renderer.compile(scene, camera) } catch (e) { /* précompilation facultative */ }

    // interface (sans z-index : l'ordre du DOM fait l'empilement ; le noir couvre la salle, la carte et la pause le noir)
    style = document.createElement('style'); style.id = 'bar-css'; style.textContent = css
    document.head.appendChild(style)
    ui = document.createElement('div'); ui.id = 'bar-root'; ui.className = 'bar'
    ui.classList.toggle('bar-reduced', attenue)
    ui.innerHTML = HTML
    if (opts.stats) { ui.insertAdjacentHTML('beforeend', '<div class="bar-stats" id="bar-stats"></div>'); }
    root.appendChild(ui)
    $ = sel => ui.querySelector(sel)
    statsEl = $('#bar-stats')
    const carte = $('#bar-card')
    carte.querySelector('.d').textContent = CARTE.lieu
    carte.querySelector('.texte').textContent = CARTE.texte
    carte.querySelector('.consigne').textContent = CARTE.consigne
    carte.querySelector('.go').textContent = CARTE.commencer
    $('#bar-card-partir').textContent = CARTE.partir
    $('#bar-demasque .tampon').textContent = REACTIONS.demasque.tampon
    montrerTouches()

    carte.addEventListener('click', garde(demanderVerrou))
    $('#bar-reprendre').addEventListener('click', garde(reprendre))
    // sortie de secours si le navigateur refuse le verrou : le clic ne remonte pas jusqu'à la carte (décision 8 : rien)
    $('#bar-card-partir').addEventListener('click', garde(e => { e.stopPropagation(); finir('passe') }))
    $('#bar-sortir').addEventListener('click', garde(() => { $('#bar-pause').hidden = true; sortir() }))
    $('#bar-menu').addEventListener('click', garde(() => finir('abandon')))
    controller.enable()
    listen(document, 'keydown', onKey)
    listen(document, 'keyup', onKeyUp)
    listen(document, 'mousedown', onMouse)
    listen(document, 'mouseup', onMouseUp)
    listen(document, 'wheel', onWheel, { passive: true })
    listen(document, 'pointerlockchange', onLock)
    listen(window, 'blur', onBlur)

    // options de départ : le soupçon, le verre, l'instant de la soirée
    if (Number.isFinite(+opts.soupcon) && +opts.soupcon > 0) suivreJauge(jauge.evenement('choix', +opts.soupcon))
    if (opts.verre) servir(opts.verre === 'cafe' ? 'cafe' : 'demi')
    if (Number.isFinite(+opts.t) && +opts.t > 0) {
      saut = true
      try {
        for (let reste = +opts.t; reste > EPS && !fin;) {
          const pas = Math.min(reste, 1)
          reste -= pas
          for (const e of seance.update(pas, { palier: jauge.palier, dialogue: null, appris: carnet.appris })) traiterSoiree(e)
        }
      } finally { saut = false }
      note('saut', { t: seance.t })
    }
    ready = true

    // caméra posée (captures, réglages) : ni carte ni verrou, la soirée commence tout de suite
    if (cam) { carte.hidden = true; commencer() }
  } catch (error) {
    console.error('[bar] démarrage impossible :', error)
    let payload
    try { payload = { ...contrat('erreur'), error } } catch (e) { payload = { resultat: 'erreur', renseignements: createCarnet().renseignements, couverture: null, error } }
    stop()
    queueMicrotask(() => report(payload))
  }

  // accroches de développement (dev/bar.html?jouer=1 ; la route ?bar=1 du jeu, tâche B16)
  const debug = {
    journal,
    get renderer() { return renderer },
    get salle() { return salle }, get casting() { return casting }, get seance() { return seance }, get jauge() { return jauge },
    get carnet() { return carnet }, get regards() { return regards }, get controller() { return controller },
    get interact() { return interact }, get son() { return son }, get choeur() { return choeur },
    get dialogue() { return dialogue ? dialogue.d : null },
    get ecoutes() { return ecoutes.map(e => ({ echange: e.echange, rang: e.rang, qui: e.qui, I: e.I, frappe: e.frappe, finie: e.finie })) },
    // l'état de la soirée (__bar() du §7) : S, plancher, palier, horloge, renseignements, I par foyer, f_p par personne
    etat() {
      const mode = stopped ? 'fini' : fin ? 'sortie' : !started ? 'carte' : pause ? 'pause' : dialogue ? 'dialogue'
        : viktor.posture === 'debout' ? 'exploration' : 'assis'
      const I = Object.fromEntries(Object.entries(FOYERS).map(([k, f]) => [k, intelligibilite(oeil, regardSol, f, BOITES, ANCRES.jukebox)]))
      const fixations = casting ? Object.fromEntries(casting.liste.map(p => [p.role, regards.etat(p.role).fixation])) : {}
      const st = sousTitre ? { qui: sousTitre.qui, texte: masquer(sousTitre.frappe.motsFrappes, sousTitre.Is, sousTitre.f) } : null
      const pe = paroles.pensee.cur ? { qui: 'viktor', texte: paroles.pensee.cur.frappe.texte } : null
      const re = paroles.reaction.cur ? { qui: paroles.reaction.cur.qui, texte: paroles.reaction.cur.frappe.texte } : null
      const dl = dialogue ? { id: dialogue.id, phase: dialogue.d.phase, qui: dialogue.d.qui, texte: dialogue.d.texte,
        choix: dialogue.d.choix, restant: dialogue.d.restant } : null
      return { mode, t: seance ? seance.t : 0, heure: seance ? seance.heure : null, S: jauge ? jauge.S : 0,
        plancher: jauge ? jauge.plancher : 0, palier: jauge ? jauge.palier : null, max: jauge ? jauge.max : 0,
        renseignements: carnet ? carnet.renseignements : null, appris: carnet ? carnet.appris : 0,
        posture: viktor.posture, verre: viktor.verre, couverture: viktor.couverture, position: controller ? { ...controller.position } : null,
        I, fixations, sousTitre: st, pensee: pe, reaction: re, dialogue: dl, enCours: seance ? seance.enCours : [] }
    },
    // Viktor debout en (x, z), le regard selon lacet et tangage (__barAller du §7)
    aller(x, z, lacet = controller.yaw, tangage = controller.pitch) {
      seRelever()
      controller.setPose({ x, z, y: K.oeilDebout, yaw: lacet, pitch: tangage })
      controller.update(0)
    },
    asseoir(id) { const s = SIEGE.get(id); if (!s) throw new Error(`bar : siège inconnu « ${id} »`); seRelever(); asseoir(s); controller.update(0) },
    // avance la soirée de s secondes, par pas fixes (__barAvance du §7) : déterministe
    avancer(s, pas = 1 / 60) { for (let k = Math.round(s / pas); k > 0 && !stopped; k--) api.update(pas) },
    // pose S (__barSoupcon du §7), au plancher près
    soupcon(v) { if (jauge && Number.isFinite(+v)) evenementJauge('choix', +v - jauge.S) },
  }

  const api = {
    scene,
    debug,
    stop,
    update(dt) {
      if (stopped || !ready) return
      try { image(dt) } catch (error) { fail(error) }
    },
  }
  return api
}
