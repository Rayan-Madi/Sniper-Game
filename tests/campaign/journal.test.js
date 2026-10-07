import { describe, it, expect } from 'vitest'
import { journalNote } from '../../src/campaign/journal.js'

// La page du journal après le port (mission 3) dit le choix moral, dans les deux sens : l'épilogue a lui aussi
// deux variantes (?port=libres / enfermes).
describe('journal de Viktor : note de bas de page', () => {
  it('port, victimes libérées : il les a vus courir', () => {
    expect(journalNote(3, { freedVictims: true })).toEqual({
      text: 'P.S. Je les ai vus courir hors du conteneur. Libres.',
      color: '#7ab87a',
    })
  })

  it('port, conteneur resté fermé : une note sobre, d\'une autre couleur', () => {
    const note = journalNote(3, { freedVictims: false })
    expect(note).not.toBeNull()
    expect(note.text).toBe('P.S. Le conteneur rouge est resté fermé. Je l\'entends encore.')
    expect(note.color).not.toBe(journalNote(3, { freedVictims: true }).color)
  })

  it('autres missions : aucune note, quel que soit le choix du port', () => {
    for (const level of [1, 2, 4, 5, 6]) {
      expect(journalNote(level, { freedVictims: true })).toBeNull()
      expect(journalNote(level, { freedVictims: false })).toBeNull()
    }
  })
})
