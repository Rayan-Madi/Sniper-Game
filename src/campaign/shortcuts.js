// Raccourcis clavier de la campagne (mode histoire). Toujours sur e.code (touche physique) : sur un clavier AZERTY,
// la rangée du haut donne &é"'(- en e.key, jamais un chiffre.

// Phases où un chiffre ne doit jamais lancer une mission : la partie, sa pause, une cinématique, l'attente des
// modèles (écran PRÉPARATION DU DOSSIER), l'enquête.
const BUSY = new Set(['playing', 'paused', 'briefing', 'loading', 'investigation'])

// Numéro de mission demandé par le raccourci de développement (1 à 6, rangée du haut ou pavé numérique), ou null.
// Jamais en production, jamais pendant une partie, jamais quand un écran multijoueur ou les paramètres sont ouverts
// (overlayOpen : on y tape des codes de partie et des touches à remapper). overlayOpen est un booléen ou une
// fonction : main.js passe une fonction coûteuse (getComputedStyle), appelée en dernier, seulement sur une touche
// de mission en dev hors partie.
export function levelShortcut(code, { dev, phase, overlayOpen } = {}) {
  if (!dev || BUSY.has(phase)) return null
  const m = /^(Digit|Numpad)([1-6])$/.exec(code)
  if (!m) return null
  const open = typeof overlayOpen === 'function' ? overlayOpen() : overlayOpen
  return open ? null : Number(m[2])
}
