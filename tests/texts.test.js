import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseSync } from 'vite'

// Règle du dépôt : aucun tiret cadratin (U+2014) dans ce que lit le joueur ; deux-points, virgule ou point médian
// selon le contexte. Sont gardés toutes les chaînes littérales du code du jeu (hors commentaires) et le texte visible
// d'index.html. Restent hors garde les scènes de cinématique (src/briefing/scenes, générées depuis les maquettes) :
// leurs répliques seront reprises au lot voix.

const ROOT = resolve(__dirname, '..')
const DASH = '\u2014'

// Chaînes littérales d'un source JS ('…', "…" et morceaux fixes des `…`), avec leur ligne. Les commentaires n'y sont pas.
function jsStrings(name, source) {
  const { program, errors } = parseSync(name, source)
  if (errors.length) throw new Error(`${name} : analyse impossible (${errors[0].message})`)
  const found = []
  const line = offset => source.slice(0, offset).split('\n').length
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    if (node.type === 'Literal' && typeof node.value === 'string') found.push({ line: line(node.start), text: node.value })
    if (node.type === 'TemplateElement') found.push({ line: line(node.start), text: node.value.cooked ?? node.value.raw })
    for (const k in node) if (k !== 'parent') walk(node[k])
  }
  walk(program)
  return found
}

// Texte qu'une page HTML affiche : titre, nœuds texte hors <script>/<style>, attributs lus par le joueur.
// Les commentaires HTML et la feuille de style n'y sont pas.
const SHOWN_ATTRS = ['placeholder', 'title', 'alt', 'aria-label']
function htmlTexts(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const found = [doc.title]
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.parentElement.closest('script, style, template')) found.push(n.data)
  }
  for (const el of doc.querySelectorAll('*')) for (const a of SHOWN_ATTRS) if (el.hasAttribute(a)) found.push(el.getAttribute(a))
  return found.filter(t => t.trim())
}

describe('relevé des textes (outils du garde-fou)', () => {
  it('JS : prend les chaînes et les morceaux de gabarit, laisse les commentaires', () => {
    const src = "// a \u2014 b\n/* c \u2014 d */\nconst s = 'e \u2014 f'\nconst t = `g \u2014 ${s} h`\nconst r = /x/\n"
    expect(jsStrings('x.js', src)).toEqual([
      { line: 3, text: 'e \u2014 f' },
      { line: 4, text: 'g \u2014 ' },
      { line: 4, text: ' h' },
    ])
  })

  it('HTML : prend le texte affiché et les attributs lus, laisse commentaires, styles et scripts', () => {
    const html = '<html><head><title>T</title><style>/* \u2014 */ p::before { content: "" }</style></head><body>' +
      '<!-- a \u2014 b --><p>c <b>d</b></p><input placeholder="e"><script>const x = "\u2014"</script></body></html>'
    expect(htmlTexts(html)).toEqual(['T', 'c ', 'd', 'e'])
  })
})

describe('textes du jeu sans tiret cadratin', () => {
  const files = readdirSync(join(ROOT, 'src'), { recursive: true })
    .map(f => f.replaceAll('\\', '/'))
    .filter(f => f.endsWith('.js') && !f.startsWith('briefing/scenes/'))

  it('le relevé couvre bien le code du jeu (main.js, l\'enquête, le kit des cinématiques)', () => {
    for (const f of ['main.js', 'levels.js', 'pvp.js', 'prologue/investigation.js', 'briefing/index.js', 'briefing/kit.js']) {
      expect(files).toContain(f)
    }
    const main = jsStrings('main.js', readFileSync(join(ROOT, 'src', 'main.js'), 'utf8'))
    expect(main.length).toBeGreaterThan(200)
    expect(main.some(s => s.text.includes('JOURNAL DE VIKTOR'))).toBe(true)
  })

  it('aucune chaîne littérale de src/ (hors scènes de cinématique) ne contient U+2014', () => {
    const found = []
    for (const f of files) {
      for (const s of jsStrings(f, readFileSync(join(ROOT, 'src', f), 'utf8'))) {
        if (s.text.includes(DASH)) found.push(`src/${f}:${s.line}  ${s.text.trim().slice(0, 80)}`)
      }
    }
    expect(found).toEqual([])
  })

  it('aucun texte visible d\'index.html ne contient U+2014', () => {
    const texts = htmlTexts(readFileSync(join(ROOT, 'index.html'), 'utf8'))
    expect(texts.some(t => t.includes('CLIC GAUCHE'))).toBe(true)
    expect(texts.filter(t => t.includes(DASH)).map(t => t.trim())).toEqual([])
  })
})
