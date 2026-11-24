// La fuite des cibles (spec du lot 3, §2 f, approche B, et décision 4 ; plan du lot 3a, tâche A8). Module pur : ni three
// ni DOM ; les positions sont lues dans mesh.position ({ x, y, z }), la vue du tireur et le cône viennent de main.js.
//
// Une mission qui déclare des sorties ou des abris (champs sorties et abris : des noms d'ancres de sa carte) échoue
// quand une cible en fuite en atteint un (décision 4 : « survivant à l'abri ou alerte donnée : échec, comme la fuite
// aujourd'hui »), à FUITE.rayonArriveeM près ; en option (champ perteDeVueS), quand une cible en fuite reste hors de la
// vue du tireur plus de perteDeVueS secondes (un rayon contre le décor solide). Une telle mission n'applique plus le
// cône : à ×20, il ferait échouer pour un pas de côté. Sans sortie ni abri (les six missions d'aujourd'hui), le cône
// d'avant le lot 3 décide : une cible en fuite hors du cône de FUITE.coneDeg autour du regard, à plus de
// FUITE.coneDistanceM de la caméra (main.js le mesure). Chaque sous-lot bascule ses missions une à une.
//
// Seule une cible EN FUITE (état 'flee') échoue en arrivant : une cible qui marche dans sa zone, ou que sa routine mène
// près d'un abri, ne fait pas échouer la mission. La cible fuit vers l'issue la plus proche (fuirVersLaSortie, main.js),
// au bout de sa réaction (src/campaign/alarm.js).
import { FUITE } from '../shot/tuning.js'

// Messages de l'échec à l'arrivée, par sorte d'issue, quand la mission n'en donne pas pour cette issue (fuiteMessages).
export const MESSAGES_DE_FUITE = {
  sortie: 'Une cible s\'est échappée',
  abri: 'Une cible s\'est mise à l\'abri',
}

// Vrai si la mission déclare au moins une sortie ou un abri : ses cibles réagissent au coup (alarm.js) et fuient vers
// eux, le cône ne compte plus.
export function fuiteParSorties(m) {
  return !!m && (m.sorties.length > 0 || m.abris.length > 0)
}

// Les issues de la mission, prises dans ses lieux (resoudreAncres, src/campaign/missions/index.js), dans l'ordre de ses
// champs : [{ nom, sorte: 'sortie' | 'abri', x, z }].
export function issuesDe(m, lieux) {
  const de = (noms, groupe, sorte) => noms.map(nom => ({ nom, sorte, x: lieux[groupe][nom].x, z: lieux[groupe][nom].z }))
  return [...de(m.sorties, 'sorties', 'sortie'), ...de(m.abris, 'abris', 'abri')]
}

// L'issue la plus proche de [x, z], avec sa distance (m) : { nom, sorte, x, z, distance } ; null sans issue.
export function issueLaPlusProche([x, z], issues) {
  let best = null
  for (const i of issues) {
    const distance = Math.hypot(i.x - x, i.z - z)
    if (!best || distance < best.distance) best = { ...i, distance }
  }
  return best
}

// Vrai si [x, z] a atteint l'issue (à FUITE.rayonArriveeM ou moins, au sol).
export function arrive([x, z], issue) {
  return Math.hypot(issue.x - x, issue.z - z) <= FUITE.rayonArriveeM
}

// Le texte de l'échec quand une cible atteint cette issue : celui que la mission donne pour elle (fuiteMessages, par nom
// d'issue), sinon celui de sa sorte.
export function messageDeFuite(m, issue) {
  return (m.fuiteMessages && m.fuiteMessages[issue.nom]) || MESSAGES_DE_FUITE[issue.sorte]
}

// La fuite de la mission m, sur ses lieux. verifier(cibles, dt, { horsDuCone, enVue }), à chaque image : la première
// cible qui fait échouer la mission, ou null.
//   { cible, cause: 'cone' }                      sans sortie ni abri : en fuite et horsDuCone(cible)
//   { cible, cause: 'sortie' | 'abri', issue, message }   une issue atteinte (message : messageDeFuite)
//   { cible, cause: 'perteDeVue' }                 en fuite et hors de vue (enVue(cible) faux) plus de m.perteDeVueS s
// Les cibles mortes ou à bord d'un véhicule ne fuient pas à pied : jamais comptées.
export function creerFuite(m, lieux) {
  const parSorties = fuiteParSorties(m)
  const issues = parSorties ? issuesDe(m, lieux) : []
  const cachee = new Map()   // cible en fuite → secondes passées hors de vue, d'affilée
  return {
    parSorties,
    issues,
    verifier(cibles, dt, { horsDuCone, enVue }) {
      for (const c of cibles) {
        if (!c.alive || c.onVehicle || c.state !== 'flee') continue
        if (!parSorties) {
          if (horsDuCone(c)) return { cible: c, cause: 'cone' }
          continue
        }
        const p = c.mesh.position
        for (const issue of issues) {
          if (arrive([p.x, p.z], issue)) return { cible: c, cause: issue.sorte, issue, message: messageDeFuite(m, issue) }
        }
        if (m.perteDeVueS != null) {
          const s = enVue(c) ? 0 : (cachee.get(c) || 0) + dt
          cachee.set(c, s)
          if (s > m.perteDeVueS) return { cible: c, cause: 'perteDeVue' }
        }
      }
      return null
    },
  }
}
