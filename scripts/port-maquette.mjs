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
  return [
    `// Généré par scripts/port-maquette.mjs depuis docs/superpowers/maquettes/cinematiques/${name}.html — ne pas modifier à la main.`,
    `export const stClass = ${JSON.stringify(st.className)}`,
    `export const css = ${JSON.stringify(fix(css))}`,
    `export const html = ${JSON.stringify(fix(st.innerHTML))}`,
    `export function start(K, ctx = {}) {`,
    `  const location = { search: ctx.search || '', href: 'http://briefing.local/' + (ctx.search || '') }`,
    `  const setTimeout = (fn, ms = 0) => K.at(ms, fn)            // minuteurs de la scène suivis par le kit :`,
    `  const requestAnimationFrame = fn => K.at(16, fn)           // annulés quand on passe ou démonte`,
    fix(script),
    `}`,
    ``,
  ].join('\n')
}

const SCENES = { m1: 'briefing-m1', m2: 'briefing-m2', m3: 'briefing-m3', m4: 'briefing-m4', m5: 'briefing-m5', m6: 'briefing-m6', epilogue: 'epilogue' }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
  const src = join(repo, 'docs', 'superpowers', 'maquettes', 'cinematiques')
  const imgDir = join(repo, 'public', 'briefing', 'img')
  const out = join(repo, 'src', 'briefing', 'scenes')
  mkdirSync(out, { recursive: true })
  for (const [id, file] of Object.entries(SCENES)) {
    const html = readFileSync(join(src, file + '.html'), 'utf8')
    const imgExt = {}
    for (const m of html.matchAll(/img\/([a-z0-9_-]+)\.png/g)) imgExt[m[1]] = existsSync(join(imgDir, m[1] + '.jpg')) ? 'jpg' : 'png'
    writeFileSync(join(out, id + '.js'), portMaquette(html, { name: file, imgExt }))
    console.log('scène générée :', id)
  }
}
