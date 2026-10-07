// Journal de Viktor : la page de carnet montrée entre deux missions (showJournal dans main.js).

// Papier de la page : les deux teintes de son dégradé, de la plus claire à la plus foncée.
export const JOURNAL_PAPER = ['#d8cfb8', '#c9bfa4']

// Note de bas de page (P.S.) après la mission `level`, ou null. Après le port (mission 3), elle dit le choix moral
// dans les deux sens, comme l'épilogue (variantes « libres » et « enfermés »). Encres foncées : au moins 4,5:1 sur
// le papier (vert 4,9:1, brun rouge 5,3:1 sur la teinte la plus foncée).
export function journalNote(level, { freedVictims }) {
  if (level !== 3) return null
  return freedVictims
    ? { text: 'P.S. Je les ai vus courir hors du conteneur. Libres.', color: '#2a522a' }
    : { text: 'P.S. Le conteneur rouge est resté fermé. Je l\'entends encore.', color: '#6e3226' }
}
