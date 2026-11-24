// Gardes de phase de la mission (mode histoire), appelées par main.js avant chaque changement de phase.
// m = { phase, killcam, failPending } : phase de jeu, ralenti de la dernière cible en cours, civil abattu dont
// l'échec tombe 600 ms plus tard. Les minuteurs de fin (kill-cam, civil) ne s'arrêtent pas en pause : ces gardes
// empêchent un écran de fin de s'ouvrir sous la pause, sous une cinématique ou par-dessus un autre écran de fin.

// Échap pendant le ralenti ou juste après un civil abattu : la fin de mission arrive de toute façon, la pause attend.
export function canPause(m) {
  return m.phase === 'playing' && !m.killcam && !m.failPending
}

// Une balle tirée pendant le ralenti ne serait jamais résolue. Après un civil abattu, la mission est déjà perdue :
// une dernière cible abattue dans les 600 ms lancerait la kill-cam, qui refuse l'échec, et la mission serait réussie.
export function canShoot(m) {
  return m.phase === 'playing' && !m.killcam && !m.failPending
}

// Fin de la kill-cam : la réussite n'est enregistrée que si la mission est encore en cours, jamais après un échec,
// jamais deux fois, jamais sous la pause ni sous un briefing revu.
export function canClear(m) {
  return m.phase === 'playing'
}

// Échec (civil abattu, cible en fuite, convoi parti) : en jeu ou en pause, jamais pendant le ralenti de la
// dernière cible ni après la réussite, jamais deux fois.
export function canFail(m) {
  return (m.phase === 'playing' || m.phase === 'paused') && !m.killcam
}

// REVOIR LE BRIEFING depuis la pause : jamais avec un échec en attente, qui tomberait sous la cinématique.
export function canRebrief(m) {
  return m.phase === 'paused' && !m.failPending
}

// La fin de la mission (le ralenti de la dernière cible, tout de suite ou à l'échéance du calme ; lancerFin et la boucle
// de main.js) : en jeu seulement, jamais deux fois, jamais sous la pause, jamais avec l'échec d'un civil abattu en
// attente. Sans cette garde, l'échéance du calme tombée dans les 600 ms qui suivent un civil abattu lancerait la
// kill-cam, qui refuse l'échec, et la mission serait réussie.
export function canFinish(m) {
  return m.phase === 'playing' && !m.killcam && !m.failPending
}

// Conditions que tantQue peut nommer (champ fin de la mission) : main.js en tient l'état à jour.
//   cadenas : le cadenas du choix moral n'est pas tiré (« fin au tir ou à l'échéance », rapport de M3 du lot 3)
export const CONDITIONS_DE_FIN = ['cadenas']

// Fin de mission paramétrable (spec du lot 3, §2 g ; plan du lot 3a, tâche A8 ; contrat avec le lot 4), d'après le champ
// fin { calmeS, tantQue } de la mission. calmeS à 0 (differee faux) : la fin est immédiate, le ralenti à la mort de la
// dernière cible, comme avant le lot 3. Sinon, lancer(t) à cette mort ouvre le calme : la mission reste en jeu (la pause,
// le tir, le cadenas, l'échec d'un civil abattu), et la fin vient à l'échéance, t + calmeS (horloge de la mission : la
// pause l'arrête), ou plus tôt dès que la condition tantQue tombe. echue(t, conditions) : vrai dès lors ; conditions,
// l'état de chaque condition de CONDITIONS_DE_FIN ({ cadenas: vrai tant qu'il tient }).
export function creerFin({ calmeS = 0, tantQue = null } = {}) {
  let echeance = null
  return {
    get differee() { return calmeS > 0 },
    get lancee() { return echeance !== null },
    lancer(t) { if (echeance === null) echeance = t + calmeS },
    echue(t, conditions = {}) {
      return echeance !== null && (t >= echeance || (tantQue !== null && !conditions[tantQue]))
    },
    resteS(t) { return echeance === null ? null : Math.max(0, echeance - t) },
  }
}
