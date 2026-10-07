import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parseSync } from 'vite'

// Règle du dépôt : aucun tiret cadratin (U+2014) dans ce que lit le joueur ; deux-points, virgule ou point médian
// selon le contexte. Sont gardés toutes les chaînes littérales du code du jeu (hors commentaires), le texte visible
// d'index.html et les valeurs de `content:` des feuilles de style (src/**/*.css, <style> d'index.html). Restent hors
// garde les scènes de cinématique (src/briefing/scenes, générées depuis les maquettes) : leurs répliques seront reprises
// au lot voix.

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

// Valeurs des déclarations `content:` d'une feuille de style, avec leur ligne (texte que les ::before/::after affichent).
// Les commentaires sont d'abord blanchis (les lignes restent en place). Une chaîne entre guillemets est lue en entier :
// un « ; » ou un « } » dedans ne coupe pas la valeur. Les échappements CSS (\2014, \002014) sont décodés.
const CSS_STRING = String.raw`"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'`
function cssContents(css) {
  const clean = css.replace(new RegExp(String.raw`${CSS_STRING}|/\*[\s\S]*?\*/`, 'g'),
    t => t.startsWith('/*') ? t.replace(/[^\n]/g, ' ') : t)
  const unescape = s => s.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => {
    const c = parseInt(h, 16)
    return String.fromCodePoint(c > 0 && c <= 0x10ffff && (c < 0xd800 || c > 0xdfff) ? c : 0xfffd)
  })
  const decl = new RegExp(String.raw`(?<=[{;]\s*)content\s*:((?:${CSS_STRING}|[^;}"'])*)`, 'g')
  return [...clean.matchAll(decl)].map(m => ({ line: clean.slice(0, m.index).split('\n').length, text: unescape(m[1].trim()) }))
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

  it('CSS : prend les valeurs de content (échappements décodés), laisse commentaires, sélecteurs et autres propriétés', () => {
    const css = '/* a \u2014 b */\n' +
      '.x::before { content: "c \u2014 d"; color: red }\n' +
      '.y { justify-content: center; align-content: start }\n' +
      ".z::after{content:'\\2014 e;f'}\n" +
      '.content:hover { color: blue }\n' +
      '.w::before { /* g */ content: "\\0020141" }\n'
    expect(cssContents(css)).toEqual([
      { line: 2, text: '"c \u2014 d"' },
      { line: 4, text: "'\u2014e;f'" },
      { line: 6, text: '"\u20141"' },
    ])
  })
})

describe('textes du jeu sans tiret cadratin', () => {
  const sources = readdirSync(join(ROOT, 'src'), { recursive: true }).map(f => f.replaceAll('\\', '/'))
  const files = sources.filter(f => f.endsWith('.js') && !f.startsWith('briefing/scenes/'))
  const sheets = sources.filter(f => f.endsWith('.css'))

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

  it('aucun content: des feuilles de style (src/**/*.css, <style> d\'index.html) ne contient U+2014', () => {
    expect(sheets).toEqual(expect.arrayContaining(['briefing/kit.css', 'prologue/enquete.css']))
    const contents = []
    for (const f of sheets) {
      for (const c of cssContents(readFileSync(join(ROOT, 'src', f), 'utf8'))) contents.push({ where: `src/${f}:${c.line}`, text: c.text })
    }
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      const before = html.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1
      for (const c of cssContents(m[1])) contents.push({ where: `index.html:${before + c.line}`, text: c.text })
    }
    // le relevé voit bien les déclarations existantes (cadenas des capacités PvP, croix de visée de l'enquête)
    expect(contents.some(c => c.where.startsWith('index.html') && c.text.includes('\u{1F512}'))).toBe(true)
    expect(contents.some(c => c.where.startsWith('src/prologue/enquete.css'))).toBe(true)
    expect(contents.filter(c => c.text.includes(DASH)).map(c => `${c.where}  ${c.text}`)).toEqual([])
  })
})
