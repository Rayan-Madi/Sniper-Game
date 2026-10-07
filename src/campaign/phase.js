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
