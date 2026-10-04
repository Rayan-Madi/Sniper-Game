// Convertit une maquette de cinématique (docs/superpowers/maquettes/cinematiques/*.html) en module de scène du jeu.
// Le module exporte la classe de la scène, son CSS, le HTML de #st et start(K, ctx) qui exécute le
// script de la maquette avec le K fourni (ctx.search remplace location.search ; setTimeout et
// requestAnimationFrame passent par K.at pour être annulés au démontage).
// CLI : node scripts/port-maquette.mjs   → régénère src/briefing/scenes/*.js
import { JSDOM } from 'jsdom'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function portMaquette(html, { name, imgExt = {} }) {
  const doc = new JSDOM(html).window.document
  const st = doc.getElementById('st')
  if (!st) throw new Error(`${name} : la maquette n'a pas de #st`)
  const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n')
  const script = [...doc.querySelectorAll('script:not([src])')].map(s => s.textContent).join('\n')
  const fix = s => s.replace(/(["'(\s])img\/([a-z0-9_-]+)\.png/g, (m, pre, base) => `${pre}briefing/img/${base}.${imgExt[base] || 'png'}`)
  const out = { css: fix(css), html: fix(st.innerHTML), script: fix(script) }
  // garde contre une réécriture muette : un chemin `img/…` que le regex ne reconnaît pas serait servi à la racine (404)
  for (const [partie, texte] of Object.entries(out)) {
    const oubli = texte.match(/(?<!briefing\/)\bimg\/[^\s"'()`]+\.(?:png|jpe?g|webp)/i)
    if (oubli) throw new Error(`${name} : image non réécrite vers briefing/img dans le ${partie} : ${oubli[0]}`)
  }
  return [
    `// Généré par scripts/port-maquette.mjs depuis docs/superpowers/maquettes/cinematiques/${name}.html — ne pas modifier à la main.`,
    `export const stClass = ${JSON.stringify(st.className)}`,
    `export const css = ${JSON.stringify(out.css)}`,
    `export const html = ${JSON.stringify(out.html)}`,
    `export function start(K, ctx = {}) {`,
    `  const location = { search: ctx.search || '', href: 'http://briefing.local/' + (ctx.search || '') }`,
    `  const setTimeout = (fn, ms = 0) => K.at(ms, fn)            // minuteurs de la scène suivis par le kit :`,
    `  const requestAnimationFrame = fn => K.at(16, fn)           // annulés quand on passe ou démonte`,
    out.script,
    `}`,
    ``,
  ].join('\n')
}

// id de scène du jeu → maquette (sans .html) dans docs/superpowers/maquettes/cinematiques/
export const SCENES = {
  m1: 'briefing-m1', m2: 'briefing-m2', m3: 'briefing-m3', m4: 'briefing-m4', m5: 'briefing-m5', m6: 'briefing-m6',
  epilogue: 'epilogue', 'prologue-a': 'prologue-a', 'prologue-b': 'prologue-b',
}

// Source du module de scène `id`, telle que la CLI l'écrit (repo = racine du dépôt).
export function generateScene(id, repo) {
  const file = SCENES[id]
  if (!file) throw new Error(`scène inconnue : ${id}`)
  const html = readFileSync(join(repo, 'docs', 'superpowers', 'maquettes', 'cinematiques', file + '.html'), 'utf8')
  const imgDir = join(repo, 'public', 'briefing', 'img')
  const imgExt = {}
  for (const m of html.matchAll(/img\/([a-z0-9_-]+)\.png/g)) imgExt[m[1]] = existsSync(join(imgDir, m[1] + '.jpg')) ? 'jpg' : 'png'
  return portMaquette(html, { name: file, imgExt })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
  const out = join(repo, 'src', 'briefing', 'scenes')
  mkdirSync(out, { recursive: true })
  for (const id of Object.keys(SCENES)) {
    writeFileSync(join(out, id + '.js'), generateScene(id, repo))
    console.log('scène générée :', id)
  }
}
