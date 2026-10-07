import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// L'aide des commandes (#instruction, « CLIC DROIT : viser… ») n'appartient qu'aux 5 premières secondes d'une mission :
// startLevel l'allume, son minuteur l'éteint. Au chargement de la page, le menu s'affiche par-dessus le décor ; l'aide
// ne doit pas transparaître dessous avant toute mission.
// La page est montée telle qu'écrite (feuille de style d'index.html comprise), sans exécuter main.js.
beforeAll(() => {
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const s of doc.head.querySelectorAll('style')) document.head.appendChild(document.importNode(s, true))
  for (const s of doc.body.querySelectorAll('script')) s.remove()
  document.body.innerHTML = doc.body.innerHTML
})

describe('aide des commandes au chargement de la page', () => {
  it('elle est invisible tant qu\'aucune mission ne l\'a allumée (opacité 0 dans la feuille de style)', () => {
    const help = document.getElementById('instruction')
    expect(help).not.toBeNull()
    expect(getComputedStyle(help).opacity).toBe('0')
  })

  it('le fondu reste en place : startLevel l\'allume et l\'éteint par son opacité', () => {
    expect(getComputedStyle(document.getElementById('instruction')).transition).toContain('opacity')
  })
})
