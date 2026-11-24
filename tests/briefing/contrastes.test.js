import { describe, it, expect } from 'vitest'
import { KITS, lireCss } from './analyse-scenes.js'

// Contraste des petits textes gris du kit (audit de design du 24 novembre 2026, CIN-6 ; spec §3.3) : une étiquette tient
// 4,5:1 au moins sur son fond, qu'elle serve à jouer ou non. Le gris à 0,5 de la source de l'écoute (.who) et des clés
// du dossier (.fl .k) tombait à 4,1:1 ; l'aide PASSER du jeu (#briefing-root .k-skip), blanc à 0,35 en 11 px, à 3,0:1.
// Ils passent à 0,62 (5,7:1 sur le dossier) et 0,6 (7,4:1 sur le noir).
// Contraste WCAG : luminance relative de la couleur du texte composée sur le fond nommé.

const lineaire = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const luminance = ([r, g, b]) => 0.2126 * lineaire(r) + 0.7152 * lineaire(g) + 0.0722 * lineaire(b)
const sur = ([r, g, b, a = 1], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)]
const contraste = (texte, fond) => {
  const [x, y] = [luminance(sur(texte, fond)), luminance(fond)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// Fonds nommés, tous opaques (feuille du kit) : le fond de .st ; le centre de .bg, le plus clair (son dégradé radial
// rgba(40,52,70,.35) posé sur le fond) ; le dossier, haut et bas de son dégradé (rgba(16,19,27,.97) sur le centre,
// rgba(10,12,18,.97) sur le fond) ; le noir du conteneur du jeu (#briefing-root).
const FOND = [6, 7, 11]
const CENTRE = sur([40, 52, 70, 0.35], FOND)
const FONDS_DE_SCENE = { 'fond de la scène': FOND, 'centre du fond': CENTRE, 'haut du dossier': sur([16, 19, 27, 0.97], CENTRE), 'bas du dossier': sur([10, 12, 18, 0.97], FOND) }
const FONDS_DU_CONTENEUR = { 'noir du conteneur': [0, 0, 0], 'fond de la scène': FOND }

// couleur déclarée par la règle (seule règle de ce sélecteur dans la feuille), lue en [r, g, b, a]
const couleurDe = (css, selecteur) => {
  const regles = lireCss(css).regles.filter(r => r.selecteurs.includes(selecteur))
  expect(regles, selecteur).toHaveLength(1)
  const valeur = regles[0].declarations.find(([p]) => p === 'color')?.[1]
  const m = valeur && valeur.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/)
  expect(m, `${selecteur} : couleur rgba attendue, lu ${valeur}`).toBeTruthy()
  return m.slice(1).map(Number)
}

const ecartsAuSeuil = (couleur, fonds) => Object.entries(fonds)
  .map(([nom, fond]) => [nom, contraste(couleur, fond)])
  .filter(([, r]) => r < 4.5)
  .map(([nom, r]) => `${nom} : ${r.toFixed(2)}:1`)

describe.each(KITS.map(k => [k.nom, k]))('contrastes du %s', (nom, kit) => {
  it.each(['.st .who', '.st .fl .k'])('%s : gris du texte à 0,62, 4,5:1 au moins sur le fond comme sur le dossier', selecteur => {
    const couleur = couleurDe(kit.css, selecteur)
    expect(ecartsAuSeuil(couleur, FONDS_DE_SCENE)).toEqual([])
    expect(couleur).toEqual([215, 220, 207, 0.62])
  })
})

it('aide PASSER du jeu (#briefing-root .k-skip) : blanc à 0,6, 4,5:1 au moins sur le noir du conteneur et sur la scène', () => {
  const couleur = couleurDe(KITS[0].css, '#briefing-root .k-skip')
  expect(ecartsAuSeuil(couleur, FONDS_DU_CONTENEUR)).toEqual([])
  expect(couleur).toEqual([255, 255, 255, 0.6])
})

// L'outil, sur les chiffres de l'audit : 0,5 donnait 4,1:1, 0,62 donne 5,7:1 sur le dossier ; 0,35 et 0,6 sur le noir,
// 3,0:1 et 7,4:1.
it('outil de contraste : les chiffres de l\'audit', () => {
  const dossier = FONDS_DE_SCENE['haut du dossier']
  expect(contraste([215, 220, 207, 0.5], dossier)).toBeCloseTo(4.1, 1)
  expect(contraste([215, 220, 207, 0.62], dossier)).toBeCloseTo(5.7, 1)
  expect(contraste([255, 255, 255, 0.35], [0, 0, 0])).toBeCloseTo(3.0, 1)
  expect(contraste([255, 255, 255, 0.6], [0, 0, 0])).toBeCloseTo(7.4, 1)
})
