import { describe, it, expect } from 'vitest'
import { journalNote, JOURNAL_PAPER } from '../../src/campaign/journal.js'

// Rapport de contraste WCAG 2 entre deux couleurs #rrggbb (de 1 à 21).
function contrast(a, b) {
  const lum = hex => {
    const n = parseInt(hex.slice(1), 16)
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// La page du journal après le port (mission 3) dit le choix moral, dans les deux sens : l'épilogue a lui aussi
// deux variantes (?port=libres / enfermes).
describe('journal de Viktor : note de bas de page', () => {
  it('outil : le contraste WCAG donne les valeurs de référence', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrast('#ffffff', '#777777')).toBe(contrast('#777777', '#ffffff'))
  })

  it('port, victimes libérées : il les a vus courir', () => {
    expect(journalNote(3, { freedVictims: true }).text).toBe('P.S. Je les ai vus courir hors du conteneur. Libres.')
  })

  it('les deux notes du port se lisent sur le papier : contraste d\'au moins 4,5:1 sur les deux teintes du dégradé', () => {
    const notes = [true, false].map(freedVictims => journalNote(3, { freedVictims }))
    const faibles = []
    for (const { color } of notes) {
      for (const paper of JOURNAL_PAPER) {
        const r = contrast(color, paper)
        if (r < 4.5) faibles.push(`${color} sur ${paper} : ${r.toFixed(2)}:1`)
      }
    }
    expect(faibles).toEqual([])
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
