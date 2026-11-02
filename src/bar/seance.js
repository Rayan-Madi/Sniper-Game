// La soirée du Bivouac, minute par minute (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.9, avec le report
// du §3.6 ; plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B6). Module pur : ni DOM, ni minuteur, ni horloge,
// ni hasard. La soirée n'avance que par update(dt), au temps de jeu : en pause, on ne l'appelle pas, et horloge,
// échanges et répliques sont figés. Valeurs : SEANCE de src/bar/reglages.js ; échanges : ECHANGES de src/bar/textes.js.
//
// L'horloge va de 18:10 à 18:50 en 420 s (10,5 s par minute). Les échanges partent à leur instant (t, ou la place que
// leur donne SEANCE.placesS) et se jouent une réplique à la fois : chacune dure son estimation (350 + 62 × longueur ms,
// src/briefing/kit.js:10), la suivante commence SEANCE.enchainementS plus tard. Plusieurs échanges peuvent se jouer en
// même temps (R1 et R2) ; la coquille du bar (tâche B11) n'en sous-titre qu'un, le plus intelligible (§3.4).
//
// Les règles de la soirée :
// - personne ne tient deux conversations : un échange attend que chacun de ses gens ait fini celui où il parle, et que
//   le dialogue de Viktor avec l'un d'eux soit fini (Lise qui lui parle ne sert pas la table A) ;
// - en SOUPÇON, un échange porteur d'un renseignement ne commence pas : il est reporté (nouvel essai SEANCE.reportS
//   plus tard, SEANCE.reportEssais fois), puis perdu. La règle se lit quand il devrait commencer ; un échange commencé
//   va jusqu'au bout. L'appel et le départ (JAMAIS_REPORTES) ne se reportent pas : le colonel appelle à son heure, le
//   convoi part à la sienne (sinon, en SOUPÇON, l'escorte ne partirait jamais) ;
// - l'entrée de Sorel sonne la clochette, et les tables se taisent SEANCE.silenceEntreeSorelS : aucun autre échange ne
//   commence, ni aucune réplique, avant la fin de ce silence ; Sorel commande ensuite ;
// - l'appel : SEANCE.sonnerie.coups sonneries, puis Fernand décroche ;
// - D2 : Sorel s'approche de Viktor à SEANCE.d2S, ou dès SOUPÇON, une fois entré ; jamais pendant qu'il parle (l'appel),
//   ni pendant un dialogue, ni une fois le départ commencé ; une seule fois (un dialogue de Sorel lancé ailleurs, par le
//   regard qui fixe, « Restez assis. », compte) ;
// - la piste : rien d'appris à SEANCE.pisteS, Viktor pense « Ils ne parleront pas devant le zinc. », une fois, après un
//   dialogue en cours ;
// - la fin (Albert, « Le 7 a gagné. ») attend la fin d'un dialogue en cours ; Viktor sort de lui-même SEANCE.sortieAutoS
//   après, ou à la fin d'un dialogue ouvert entre-temps ;
// - sortir(S) : la sortie volontaire par la porte ; avec S à SEANCE.sortieSoupcon ou plus, Sorel le suit : démasqué.
//
// createSeance({ programme, reglages }) rend { update(dt, situation), sortir(S), statut(id), occupe(qui), t, heure,
// enCours, fini, sorelEntre, escortePartie, tablesMuettes, wcOccupe }. situation, lue à chaque image : { palier, dialogue,
// appris } ; palier : celui de la jauge (src/bar/soupcon.js) ; dialogue : le dialogue en cours (createDialogue de
// src/bar/dialogue.js, ou { interlocuteur, fini }), ou null ; appris : combien des quatre renseignements Viktor sait
// (carnet.appris, src/bar/renseignements.js).
// update rend ce qui s'est passé, dans l'ordre du temps (un grand pas rattrape ce qui était dû) :
// { type: 'clochette' } ; { type: 'reaction', id } (une clé de REACTIONS de src/bar/textes.js : bonsoir, piste,
// sortieSoupcon) ; { type: 'echange', id, essai } quand un échange commence (essai : ses reports passés) ;
// { type: 'silenceTables', dureeS } ; { type: 'sonnerie', coup } ; { type: 'replique', echange, rang, replique, foyer,
// dureeS, debutS } quand une réplique commence (replique : celle de textes.js ; foyer : le sien, ou celui de l'échange ;
// debutS : l'instant de la soirée où elle commence, au plus tard la fin de l'image qui l'émet : la frappe rattrape
// l'écart) ; { type: 'finEchange', id } à la fin de sa
// dernière réplique ; { type: 'reporte', id, essai, prochainS } ; { type: 'perdu', id } ; { type: 'dialogue', id }
// (D2 : l'arbre « sorel » de DIALOGUES) ; { type: 'sortie', resultat: 'sorti', auto } ; { type: 'demasque', cause }.
// Ce qui dépend de la situation (un dialogue fini, le palier) se voit à l'image où elle est donnée : ce qu'un dialogue
// retenait part au plus tôt au début de l'image qui le voit fini.
import { SEANCE } from './reglages.js'
import { ECHANGES } from './textes.js'
import { PALIERS } from './soupcon.js'
import { estimate } from '../briefing/kit.js'

// Les échanges que la soirée connaît par leur nom (ECHANGES de src/bar/textes.js).
export const ENTREE_SOREL = 'entreeSorel'
export const APPEL = 'appel'
export const DEPART = 'R3'
export const FIN_SOIREE = 'fin'
export const JAMAIS_REPORTES = Object.freeze([APPEL, DEPART])
const SOREL = 'sorel'          // le lieutenant, et l'arbre de D2 dans DIALOGUES (son interlocuteur)
const RANG_SOUPCON = PALIERS.indexOf('soupcon')

// Les instants se comparent à un milliardième près, comme dans la jauge, la frappe et les dialogues : un instant atteint
// au calcul tombe à son image, pas à la suivante.
const EPS = 1e-9

// un pas de temps invalide (NaN, absent, négatif, infini) compte pour zéro, comme dans la jauge
const secondes = d => (Number.isFinite(d) && d > 0 ? d : 0)
const deux = n => String(n).padStart(2, '0')

// L'heure de la soirée à l'instant t (secondes de jeu depuis l'entrée de Viktor) : « 18:10 » à 0, « 18:36 » à 273 s.
export function heureDe(t, reglages = SEANCE) {
  const minutes = reglages.debutMin + Math.floor(t / reglages.minuteS + EPS)
  return `${deux(Math.floor(minutes / 60) % 24)}:${deux(minutes % 60)}`
}

// programme : les échanges, de la forme d'ECHANGES ; reglages : de la forme de SEANCE. Un programme faux (un nom en
// double, un échange sans réplique ou sans heure) est une erreur dès la création.
export function createSeance({ programme = ECHANGES, reglages = SEANCE } = {}) {
  const { enchainementS, placesS, silenceEntreeSorelS, sonnerie, d2S, pisteS, sortieAutoS, reportS, reportEssais,
    sortieSoupcon, toilettesS } = reglages
  const noms = new Set()
  const echanges = programme.map((e, ordre) => {
    const id = e && e.id
    if (typeof id !== 'string' || noms.has(id)) throw new Error(`soirée du Bivouac : échange « ${id} » sans nom, ou en double`)
    noms.add(id)
    const du = e.t ?? (Object.hasOwn(placesS, id) ? placesS[id] : null)
    if (!Number.isFinite(du) || du < 0) throw new Error(`soirée du Bivouac : échange « ${id} » sans heure`)
    if (!Array.isArray(e.repliques) || e.repliques.length === 0
      || !e.repliques.every(r => r && typeof r.qui === 'string' && typeof r.texte === 'string')) {
      throw new Error(`soirée du Bivouac : échange « ${id} » sans répliques valables`)
    }
    return {
      e, id, ordre, du,
      statut: 'attente',         // puis 'reporte', 'cours', 'fini' ou 'perdu'
      essais: 0,                 // reports passés
      gens: new Set(e.repliques.map(r => r.qui)),
      reportable: !JAMAIS_REPORTES.includes(id) && e.repliques.some(r => r.renseignement != null),
      pasAvant: 0,               // la fin de la dernière image où un dialogue le retenait
      debut: null, rang: 0, prochaine: 0, finReplique: 0, sonneries: 0, coups: 0,
    }
  })

  let t = 0
  let fini = false
  let entree = false
  let d2 = false, d2PasAvant = 0
  let piste = false, pistePasAvant = 0
  let finSoiree = null, sortiePasAvant = 0   // la fin de l'échange de la fin : Viktor sort sortieAutoS plus tard
  let silence = null                          // { de, a, par } : le silence des tables à l'entrée de Sorel
  let sorelEntre = false, depart = false, escortePartie = false
  const libre = new Map()                     // qui → l'instant où il a fini de parler dans un échange

  const parle = qui => echanges.some(x => x.statut === 'cours' && x.gens.has(qui))
  const libreDes = gens => Math.max(0, ...[...gens].map(q => libre.get(q) ?? 0))
  // l'instant x, repoussé à la fin du silence des tables s'il y tombe (sauf pour l'échange qui le fait)
  const tenir = (x, ech) => (silence && ech.id !== silence.par && x >= silence.de - EPS && x < silence.a - EPS ? silence.a : x)

  // Un échange devrait commencer à `quand` : reporté ou perdu en SOUPÇON s'il porte un renseignement, sinon il commence.
  function tenter(x, quand, rang, emis) {
    if (x.reportable && rang >= RANG_SOUPCON) {
      x.essais++
      if (x.essais > reportEssais) {
        x.statut = 'perdu'
        emis.push({ type: 'perdu', id: x.id })
      } else {
        x.statut = 'reporte'
        x.du = quand + reportS
        emis.push({ type: 'reporte', id: x.id, essai: x.essais, prochainS: x.du })
      }
      return
    }
    x.statut = 'cours'
    x.debut = quand
    x.prochaine = quand
    emis.push({ type: 'echange', id: x.id, essai: x.essais })
    if (x.id === ENTREE_SOREL) {
      sorelEntre = true
      silence = { de: quand, a: quand + silenceEntreeSorelS, par: x.id }
      x.prochaine = silence.a
      emis.push({ type: 'clochette' }, { type: 'silenceTables', dureeS: silenceEntreeSorelS })
    }
    if (x.id === APPEL) {
      x.coups = sonnerie.coups
      x.prochaine = quand + sonnerie.coups * sonnerie.intervalleS
    }
    if (x.id === DEPART) depart = true
  }

  // Ce qu'un échange commencé fait ensuite : une sonnerie, une réplique, ou sa fin.
  function suite(x) {
    if (x.sonneries < x.coups) {
      return { quand: x.debut + x.sonneries * sonnerie.intervalleS, faire: emis => emis.push({ type: 'sonnerie', coup: ++x.sonneries }) }
    }
    if (x.rang < x.e.repliques.length) {
      const quand = tenir(x.prochaine, x)
      return { quand, faire: emis => {
        const replique = x.e.repliques[x.rang]
        const dureeS = estimate(replique.texte) / 1000
        emis.push({ type: 'replique', echange: x.id, rang: x.rang, replique, foyer: replique.foyer ?? x.e.foyer, dureeS, debutS: quand })
        x.finReplique = quand + dureeS
        x.prochaine = x.finReplique + enchainementS
        x.rang++
      } }
    }
    return { quand: x.finReplique, faire: emis => {
      x.statut = 'fini'
      for (const q of x.gens) libre.set(q, Math.max(libre.get(q) ?? 0, x.finReplique))
      emis.push({ type: 'finEchange', id: x.id })
      if (x.id === DEPART) escortePartie = true
      if (x.id === FIN_SOIREE) finSoiree = x.finReplique
    } }
  }

  // La prochaine chose due d'ici la fin de l'image (t), la plus tôt ; à égalité : l'entrée, ce que font les échanges
  // commencés, ceux qui commencent (dans l'ordre du programme), D2, la piste, la sortie. null : rien n'est dû.
  function prochaine(c, emis) {
    let mieux = null
    const proposer = (quand, cle, ordre, faire) => {
      if (quand > t + EPS) return
      if (!mieux || quand < mieux.quand - EPS || (Math.abs(quand - mieux.quand) <= EPS
        && (cle < mieux.cle || (cle === mieux.cle && ordre < mieux.ordre)))) mieux = { quand, cle, ordre, faire }
    }
    if (!entree) proposer(0, 0, 0, () => { entree = true; emis.push({ type: 'clochette' }, { type: 'reaction', id: 'bonsoir' }) })
    for (const x of echanges) {
      if (x.statut === 'cours') {
        const s = suite(x)
        proposer(s.quand, 1, x.ordre, () => s.faire(emis))
      } else if ((x.statut === 'attente' || x.statut === 'reporte') && x.du <= t + EPS) {
        if ([...x.gens].some(parle)) continue
        if (c.dialogue && (x.id === FIN_SOIREE || x.gens.has(c.interlocuteur))) { x.pasAvant = t; continue }
        const quand = tenir(Math.max(x.du, x.pasAvant, libreDes(x.gens)), x)
        proposer(quand, 2, x.ordre, () => tenter(x, quand, c.rang, emis))
      }
    }
    if (!d2 && sorelEntre && !depart && !parle(SOREL)) {
      const depuis = Math.min(t >= d2S - EPS ? d2S : Infinity, c.rang >= RANG_SOUPCON ? c.debutImage : Infinity)
      if (c.dialogue) d2PasAvant = t
      else if (depuis < Infinity) {
        proposer(Math.max(depuis, d2PasAvant, libre.get(SOREL) ?? 0), 3, 0, () => {
          d2 = true
          c.dialogue = true            // B11 l'ouvre à cette image : le reste de l'image le voit en cours
          c.interlocuteur = SOREL
          emis.push({ type: 'dialogue', id: SOREL })
        })
      }
    }
    if (!piste && t >= pisteS - EPS) {
      if (c.dialogue) pistePasAvant = t
      else proposer(Math.max(pisteS, pistePasAvant), 4, 0, () => { piste = true; emis.push({ type: 'reaction', id: 'piste' }) })
    }
    if (finSoiree !== null) {
      if (c.dialogue) sortiePasAvant = t
      else proposer(Math.max(finSoiree + sortieAutoS, sortiePasAvant), 5, 0, () => {
        fini = true
        emis.push({ type: 'sortie', resultat: 'sorti', auto: true })
      })
    }
    return mieux
  }

  return {
    update(dt, { palier = 'calme', dialogue = null, appris = 0 } = {}) {
      if (fini) return []
      const rang = PALIERS.indexOf(palier)
      if (rang < 0) throw new Error(`soirée du Bivouac : palier inconnu « ${palier} »`)
      const enDialogue = !!dialogue && dialogue.fini !== true
      const c = { rang, debutImage: t, dialogue: enDialogue, interlocuteur: enDialogue ? dialogue.interlocuteur : null }
      if (c.interlocuteur === SOREL) d2 = true      // D2 lancé ailleurs (le regard qui fixe) : il ne se relance pas
      if (appris > 0) piste = true                  // quelque chose est appris : plus de piste
      t += secondes(dt)
      const emis = []
      for (let n = 0; !fini; n++) {
        if (n > 100000) throw new Error('soirée du Bivouac : la soirée ne s\'arrête pas')
        const p = prochaine(c, emis)
        if (!p) break
        p.faire()
      }
      return emis
    },

    // La sortie volontaire, par la porte (E maintenu, B11) ; S : la jauge à cet instant. Une seule sortie.
    sortir(S) {
      if (fini) return []
      if (!Number.isFinite(S)) throw new Error(`soirée du Bivouac : sortie sans soupçon lisible (${S})`)
      fini = true
      if (S >= sortieSoupcon - EPS) return [{ type: 'reaction', id: 'sortieSoupcon' }, { type: 'demasque', cause: 'sortieSoupcon' }]
      return [{ type: 'sortie', resultat: 'sorti', auto: false }]
    },

    // 'attente', 'reporte', 'cours', 'fini' ou 'perdu' ; un nom inconnu est une erreur.
    statut(id) {
      const x = echanges.find(e => e.id === id)
      if (!x) throw new Error(`soirée du Bivouac : échange inconnu « ${id} »`)
      return x.statut
    },
    // qui parle dans un échange commencé (B11 n'ouvre pas de dialogue avec lui avant qu'il ait fini)
    occupe: qui => parle(qui),

    get t() { return t },
    get heure() { return heureDe(t, reglages) },
    get enCours() { return echanges.filter(x => x.statut === 'cours').map(x => x.id) },
    get fini() { return fini },
    get sorelEntre() { return sorelEntre },        // « Toi. Debout. » : Sorel une fois entré, Dussart avant (§3.10)
    get escortePartie() { return escortePartie },  // la porte s'est refermée sur le départ
    get tablesMuettes() { return !!silence && t >= silence.de - EPS && t < silence.a - EPS },
    get wcOccupe() { return t >= toilettesS[0] - EPS && t < toilettesS[1] - EPS },
  }
}
