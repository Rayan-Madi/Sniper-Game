// Les fenêtres de tir (spec du lot 3, §2 g ; plan du lot 3a, tâche A8). Module pur : ni three ni DOM.
//
// Une fenêtre (champ fenetres de la mission, src/campaign/missions/) : { nom, depart, dureeS, echeance }. Elle s'ouvre au
// premier signal de son événement de départ (depart : un événement de la mission, EVENEMENTS de
// src/campaign/missions/index.js ; le premier tir, l'entrée dans le virage, le décroché), dure dureeS, et son échéance
// tombe une fois :
//   { echec: texte }            la mission échoue, ce texte à l'écran d'échec
//   { penalite: points, fil }   le score perd ces points, le fil le dit
//   { evenement: nom }          l'événement est signalé à la mission (la radio, d'autres fenêtres ; décision 8 : à la
//                               fin de l'appel de M6, l'écran s'éteint et il se lève)
// La fin de la mission (la mort de la dernière cible, lancerFin de main.js) les arrête toutes : plus rien n'échoit.
export function creerFenetres(defs = []) {
  const etats = defs.map(def => ({ def, ouverteA: null, echue: false }))
  let arretees = false
  return {
    // L'événement de la mission, à l'instant t (horloge de la mission) : ouvre les fenêtres fermées qui l'attendent.
    signaler(evenement, t) {
      if (arretees) return
      for (const e of etats) if (e.def.depart === evenement && e.ouverteA === null) e.ouverteA = t
    },
    // Les échéances tombées d'ici t, dans l'ordre de leurs instants, une fois chacune : [{ nom, echeance, t }].
    avancer(t) {
      if (arretees) return []
      const out = []
      for (const e of etats) {
        if (e.ouverteA === null || e.echue) continue
        const fin = e.ouverteA + e.def.dureeS
        if (fin <= t) { e.echue = true; out.push({ nom: e.def.nom, echeance: e.def.echeance, t: fin }) }
      }
      return out.sort((a, b) => a.t - b.t)
    },
    // Les fenêtres ouvertes à t, pour le HUD et les vérifications : [{ nom, dureeS, resteS }].
    ouvertes(t) {
      if (arretees) return []
      return etats.filter(e => e.ouverteA !== null && !e.echue && t < e.ouverteA + e.def.dureeS)
        .map(e => ({ nom: e.def.nom, dureeS: e.def.dureeS, resteS: e.ouverteA + e.def.dureeS - t }))
    },
    arreter() { arretees = true },
  }
}
