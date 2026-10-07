// Journal de Viktor : la page de carnet montrée entre deux missions (showJournal dans main.js).

// Note de bas de page (P.S.) après la mission `level`, ou null. Après le port (mission 3), elle dit le choix moral
// dans les deux sens, comme l'épilogue (variantes « libres » et « enfermés »).
export function journalNote(level, { freedVictims }) {
  if (level !== 3) return null
  return freedVictims
    ? { text: 'P.S. Je les ai vus courir hors du conteneur. Libres.', color: '#7ab87a' }
    : { text: 'P.S. Le conteneur rouge est resté fermé. Je l\'entends encore.', color: '#8a4a3a' }
}
