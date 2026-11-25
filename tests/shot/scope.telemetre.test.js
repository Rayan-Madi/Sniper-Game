import { describe, it, expect, vi, beforeEach } from 'vitest'

// Le télémètre et le réglage dans la lunette (spec du lot 3, §2 c et décision 1 ; plan du lot 3a, tâche A4), vus comme
// le joueur les voit : ce que drawScope écrit dans son canevas. En bas à droite de la lentille, dans la vignette noire,
// en miroir de l'indicateur de zoom (en bas à gauche) : la distance au point visé, puis « ZÉRO 430 m ». Ils
// apparaissent avec le réticule (le dernier tiers de l'ouverture). Écran de 1280 × 720.
//
// Témoin : la lunette d'avant la tâche n'écrit que le zoom (vu rouge ; setZero et setTelemetre y manquent, les appels
// sont sautés et le test échoue sur ce qui est écrit).

const W = 1280, H = 720
let S, textes

beforeEach(async () => {
  document.body.innerHTML = '<canvas id="scope-canvas" style="display:none"></canvas>'
  Object.defineProperty(window, 'innerWidth', { value: W, configurable: true, writable: true })
  Object.defineProperty(window, 'innerHeight', { value: H, configurable: true, writable: true })
  vi.resetModules()
  const ctx = document.getElementById('scope-canvas').getContext('2d')
  textes = []
  ctx.fillText = (text, x, y) => textes.push({ text: String(text), x, y, font: ctx.font, align: ctx.textAlign, style: ctx.fillStyle })
  S = await import('../../src/scope.js')
})

// Lunette ouverte depuis `n` images de 1/60 s (15 : ouverte à 100 %, réticule en place), puis une image dessinée.
function ouvrir(n = 15) {
  S.showScope()
  for (let i = 0; i < n; i++) { S.updateScope(1 / 60); textes = []; S.drawScope() }
}
const ecrit = t => textes.find(x => x.text === t)
const R = Math.min(W, H) * 0.38   // rayon de la lentille ouverte (src/scope.js)

describe('le télémètre dans la lunette', () => {
  it('lunette ouverte : la distance mesurée et le réglage, en bas à droite, dans la vignette noire', () => {
    S.setZoom(4, { instant: true })
    S.setZero?.(430)
    S.setTelemetre?.(142)
    ouvrir()
    const distance = ecrit('142 m'), zero = ecrit('ZÉRO 430 m'), zoom = ecrit('4.0×')
    expect(distance, 'la distance au point visé').toBeTruthy()
    expect(zero, 'le réglage de la lunette').toBeTruthy()
    expect(zoom, 'le zoom, toujours là').toBeTruthy()
    // en miroir du zoom : à droite du centre, aligné à droite, la distance au-dessus du réglage
    expect(zero.align).toBe('right')
    expect(distance.align).toBe('right')
    expect(zero.x).toBeCloseTo(W - zoom.x, 6)
    expect(zero.y).toBeCloseTo(zoom.y, 6)
    expect(distance.y).toBeLessThan(zero.y)
    // hors de la lentille : sur le noir, jamais par-dessus l'image
    for (const t of [distance, zero]) expect(Math.hypot(t.x - W / 2, t.y - H / 2), t.text).toBeGreaterThan(R)
  })

  it('la distance se lit d\'abord : plus grande et plus claire que le réglage, qui a la taille et le ton du zoom', () => {
    S.setZero?.(155)
    S.setTelemetre?.(31)
    ouvrir()
    const distance = ecrit('31 m'), zero = ecrit('ZÉRO 155 m'), zoom = textes.find(x => x.text.endsWith('×'))
    expect(distance && zero && zoom, 'les trois écrits').toBeTruthy()
    const taille = t => +/(\d+)px/.exec(t.font)[1]
    expect(taille(distance)).toBeGreaterThan(taille(zero))
    expect(taille(zero)).toBe(taille(zoom))
    expect(zero.style).toBe(zoom.style)
    const alpha = s => +/,\s*([\d.]+)\)$/.exec(s)[1]
    expect(alpha(distance.style)).toBeGreaterThan(alpha(zero.style))
  })

  it('rien de mesuré (le ciel) : « --- m »', () => {
    S.setZero?.(31)
    S.setTelemetre?.(null)
    ouvrir()
    expect(ecrit('--- m')).toBeTruthy()
  })

  it('la mesure suit setTelemetre d\'une image à l\'autre', () => {
    S.setZero?.(38)
    S.setTelemetre?.(29)
    ouvrir()
    expect(ecrit('29 m')).toBeTruthy()
    S.setTelemetre?.(31)
    textes = []; S.drawScope()
    expect(ecrit('31 m')).toBeTruthy()
    expect(ecrit('29 m')).toBeUndefined()
  })

  it('pendant l\'ouverture, avant le réticule (les deux premiers tiers), rien n\'est écrit', () => {
    S.setZero?.(430)
    S.setTelemetre?.(142)
    ouvrir(5)   // 83 ms sur les 180 de l'ouverture
    expect(textes).toEqual([])
  })

  it('sans réglage (hors mission), pas de ligne de réglage', () => {
    S.setZero?.(null)
    S.setTelemetre?.(142)
    ouvrir()
    expect(ecrit('142 m')).toBeTruthy()
    expect(textes.some(t => t.text.startsWith('ZÉRO'))).toBe(false)
  })
})
