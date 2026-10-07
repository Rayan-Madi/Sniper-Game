import { describe, it, expect } from 'vitest'
import { levelShortcut } from '../../src/campaign/shortcuts.js'

// Raccourci de développement : 1 à 6 depuis le menu ou un écran de fin lance la mission. Il lit e.code (touche
// physique) : sur le clavier AZERTY de Rayan, la rangée du haut donne &é"'(- en e.key, jamais un chiffre.
const DEV_MENU = { dev: true, phase: 'menu', overlayOpen: false }

describe('raccourci de mission : touches physiques', () => {
  it('AZERTY : la touche 3 de la rangée du haut (code Digit3, caractère ") lance la mission 3', () => {
    expect(levelShortcut('Digit3', DEV_MENU)).toBe(3)
  })

  it('pavé numérique : Numpad6 lance la mission 6', () => {
    expect(levelShortcut('Numpad6', DEV_MENU)).toBe(6)
  })

  it('les six missions, rangée du haut et pavé numérique', () => {
    for (let n = 1; n <= 6; n++) {
      expect(levelShortcut('Digit' + n, DEV_MENU)).toBe(n)
      expect(levelShortcut('Numpad' + n, DEV_MENU)).toBe(n)
    }
  })

  it('hors de 1 à 6, ou un caractère au lieu d\'un code : rien', () => {
    for (const code of ['Digit7', 'Digit0', 'Numpad0', 'Numpad7', 'KeyA', 'Quote', '3', 'Digit33']) {
      expect(levelShortcut(code, DEV_MENU)).toBe(null)
    }
  })
})

describe('raccourci de mission : réservé au développement, jamais par-dessus le jeu', () => {
  it('en production : rien', () => {
    expect(levelShortcut('Digit3', { ...DEV_MENU, dev: false })).toBe(null)
  })

  it('pendant une mission, une pause, un briefing ou l\'enquête : rien', () => {
    for (const phase of ['playing', 'paused', 'briefing', 'investigation']) {
      expect(levelShortcut('Digit3', { ...DEV_MENU, phase })).toBe(null)
    }
  })

  it('au menu, après un échec ou une réussite : la mission est lancée', () => {
    for (const phase of ['menu', 'dead', 'cleared']) {
      expect(levelShortcut('Digit3', { ...DEV_MENU, phase })).toBe(3)
    }
  })

  it('écran multijoueur ou paramètres ouverts : rien (on y tape des codes de partie)', () => {
    expect(levelShortcut('Digit3', { ...DEV_MENU, overlayOpen: true })).toBe(null)
  })
})
