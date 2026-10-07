// Raccourcis clavier de la campagne (mode histoire). Toujours sur e.code (touche physique) : sur un clavier AZERTY,
// la rangée du haut donne &é"'(- en e.key, jamais un chiffre.

// Phases où un chiffre ne doit jamais lancer une mission : la partie, sa pause, une cinématique, l'enquête.
const BUSY = new Set(['playing', 'paused', 'briefing', 'investigation'])

// Numéro de mission demandé par le raccourci de développement (1 à 6, rangée du haut ou pavé numérique), ou null.
// Jamais en production, jamais pendant une partie, jamais quand un écran multijoueur ou les paramètres sont ouverts
// (overlayOpen : on y tape des codes de partie et des touches à remapper).
export function levelShortcut(code, { dev, phase, overlayOpen } = {}) {
  if (!dev || BUSY.has(phase) || overlayOpen) return null
  const m = /^(Digit|Numpad)([1-6])$/.exec(code)
  return m ? Number(m[2]) : null
}
