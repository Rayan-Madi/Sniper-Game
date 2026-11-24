import { describe, it, expect, vi } from 'vitest'
import { playCinematic } from '../../src/briefing/index.js'
import { SCENES, lireScene, lireModule, chainesDe, textesDuHtml, contenusCss, TIRET_CADRATIN as T } from './analyse-scenes.js'

// G6 (spec cinématiques v2, §3.1) : aucun tiret cadratin (U+2014) dans ce que le joueur voit d'une scène : le texte du
// HTML de #st (nœuds texte et attributs, dont les data-* que la scène tape à l'écran), les chaînes du script (dont les
// répliques) et les valeurs `content:` de sa feuille. Commentaires et titre de la page n'y sont pas : le joueur ne les
// voit pas. tests/texts.test.js garde le reste du jeu et laisse les scènes de côté ; ce fichier les prend.
// Les tirets de ce fichier s'écrivent ${T} : aucun tiret cadratin dans le dépôt hors des textes d'origine.

// Exception (spec §3.1, G6) : m5, que le chantier du bar possède (briefing-m5.html) et dont il retire les tirets ; seuls
// les textes de la v1 sont tolérés, au caractère près, et l'exception tombe avec eux (au plus tard en C16).
const EXCEPTIONS = {
  m5: [`SOURCE : RADIO DU CONVOI ${T} CANAL 3 · 19:12`, `${T} 1998 ${T}`],
}

// Textes visibles d'une scène qui contiennent un tiret cadratin, chacun avec son origine.
function tiretsDe(scene) {
  const trouves = []
  for (const t of textesDuHtml(scene.html)) if (t.includes(T)) trouves.push({ ou: 'html', texte: t })
  for (const s of chainesDe(scene.corps, scene.source)) if (s.texte.includes(T)) trouves.push({ ou: `script, ligne ${s.ligne} du module`, texte: s.texte })
  for (const c of contenusCss(scene.css)) if (c.texte.includes(T)) trouves.push({ ou: `content, ligne ${c.ligne} du CSS`, texte: c.texte })
  return trouves
}

describe('relevé des textes d\'une scène (outils de la garde)', () => {
  it('HTML : nœuds texte et valeurs des attributs (data-* compris), sans styles ni scripts', () => {
    const html = `<div data-c="a ${T} b"><b>c</b> d<style>.x::before { content: "${T}" }</style></div><script>const s = "${T}"</script>`
    expect(textesDuHtml(html)).toEqual(['c', 'd', `a ${T} b`])
  })

  it('script : chaînes et morceaux fixes des gabarits du corps de start, commentaires laissés de côté', () => {
    const source = `export const css = "/* ${T} */"\nexport function start(K) {\n  // un ${T} commentaire\n  const a = 'r ${T} s' /* ${T} */\n  K.say(\`t \${a} u\`)\n}\n`
    const { corps } = lireModule(source)
    expect(chainesDe(corps, source)).toEqual([
      { ligne: 4, texte: `r ${T} s` },
      { ligne: 5, texte: 't ' },
      { ligne: 5, texte: ' u' },
    ])
  })

  it('CSS : valeurs de content (échappements décodés), commentaires laissés de côté', () => {
    const css = `/* ${T} */ .a::before { content: "x ${T} y" } .b::after { content: '\\2014' } .c { color: red }`
    expect(contenusCss(css).map(c => c.texte)).toEqual([`"x ${T} y"`, `'${T}'`])
  })
})

describe.each(Object.keys(SCENES))('G6 : scène %s', id => {
  const scene = lireScene(id)
  const exceptions = EXCEPTIONS[id] || []

  it('le relevé voit la scène (garde-fou : html, chaînes du script)', () => {
    expect(textesDuHtml(scene.html).length).toBeGreaterThan(5)
    expect(chainesDe(scene.corps, scene.source).length).toBeGreaterThan(5)
  })

  it('aucun tiret cadratin dans le texte visible : html, chaînes du script, content du CSS', () => {
    const tirets = tiretsDe(scene).filter(t => !exceptions.includes(t.texte))
    expect(tirets.map(t => `${t.ou} : ${t.texte.trim().slice(0, 90)}`)).toEqual([])
  })
})

describe.each(Object.entries(EXCEPTIONS))('G6 : exception de %s', (id, textes) => {
  it('la scène existe, et chaque texte toléré y est encore (sinon le retirer d\'EXCEPTIONS)', () => {
    expect(SCENES[id], `${id} n'est pas une scène du convertisseur`).toBeDefined()
    const vus = new Set(tiretsDe(lireScene(id)).map(t => t.texte))
    expect(textes.filter(e => !vus.has(e))).toEqual([])
  })
})

// Décision D2 (spec §4) : la réplique de M6 qui portait un tiret se dit à deux voix, sur deux lignes. Un saut de ligne
// sépare « Ils sont tous morts ? » de « Oui. Il ne reste que vous. », et #trans le garde à l'écran (white-space:
// pre-line) ; sans cette règle, le saut de ligne s'affiche comme une espace et les deux voix se lisent d'un seul tenant.
describe('G6 : la réplique de M6 à deux voix (décision D2)', () => {
  it('tapée dans l\'écoute avec son saut de ligne, que #trans garde à l\'écran (white-space: pre-line)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
    document.body.innerHTML = '<div id="briefing-root" hidden></div>'
    try {
      const handle = await playCinematic('m6', { params: {} })
      const trans = document.querySelector('#briefing-root #trans')
      for (let t = 0; t < 6000 && !trans.textContent.endsWith('»'); t += 100) await vi.advanceTimersByTimeAsync(100)
      const vu = { texte: trans.textContent, blancs: getComputedStyle(trans).whiteSpace }
      handle.cancel()
      expect(vu).toEqual({ texte: '« Ils sont tous morts ?\nOui. Il ne reste que vous. »', blancs: 'pre-line' })
    } finally {
      vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = ''
    }
  })
})
