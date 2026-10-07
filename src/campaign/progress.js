// Progression de la campagne (mode histoire) : ce qu'une mission réussie change dans l'état sauvegardé.
export const MAX_LEVEL = 6        // dernier niveau (la fête)

// Enregistre une réussite dans l'état de campagne (muté) et renvoie { cleared, last }.
// La mission suivante est enregistrée tout de suite : une sauvegarde faite à la réussite ne doit jamais
// proposer de rejouer la mission déjà payée (points et score crédités une seule fois).
// Après la dernière mission, currentLevel reste à MAX_LEVEL et campaignDone passe à true : le menu propose la fin.
export function recordClear(state, { level, reward, score }) {
  state.totalScore = score
  state.points += reward
  const last = level >= MAX_LEVEL
  if (last) { state.currentLevel = MAX_LEVEL; state.campaignDone = true }
  else state.currentLevel = level + 1
  return { cleared: level, last }
}

// Saut direct à une mission (raccourci de développement) : la campagne reprend à cette mission, elle n'est plus
// finie. Sinon, rejouer M3 sur une campagne finie puis la réussir laisserait le menu sur VOIR LA FIN.
export function jumpToLevel(state, level) {
  state.currentLevel = level
  state.campaignDone = false
}
