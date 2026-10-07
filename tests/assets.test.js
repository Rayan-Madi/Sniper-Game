import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

// Le build Electron ouvre dist/index.html en file:// : un chemin absolu
// « /models/x.glb » y devient file:///C:/models/x.glb, introuvable.
// Tout ce qui part de public/ doit donc être chargé en chemin relatif
// (import.meta.env.BASE_URL), et public/ ne doit livrer que ce qui sert.

const ROOT = resolve(__dirname, '..')
const SRC = join(ROOT, 'src')
const MODELS_DIR = join(ROOT, 'public', 'models')

const jsFiles = readdirSync(SRC, { recursive: true })
  .filter(f => f.endsWith('.js'))
  .map(f => join(SRC, f))

describe('assets livrés avec le jeu', () => {
  it('aucun chemin absolu vers public/ dans src/ (cassé sous file://)', () => {
    const found = []
    for (const file of jsFiles) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/['"`]\/(models|briefing)\//.test(line)) found.push(`${file.slice(ROOT.length + 1)}:${i + 1}`)
      })
    }
    expect(found).toEqual([])
  })

  it('chaque modèle de public/models/ est utilisé par src/characters.js', () => {
    const characters = readFileSync(join(SRC, 'characters.js'), 'utf8')
    const unused = readdirSync(MODELS_DIR).filter(f => f.endsWith('.glb') && !characters.includes(`'${f}'`) && !characters.includes(`/${f}'`))
    expect(unused).toEqual([])
  })

  it('chaque modèle cité par src/characters.js existe dans public/models/', () => {
    const characters = readFileSync(join(SRC, 'characters.js'), 'utf8')
    const cited = [...characters.matchAll(/([\w-]+\.glb)/g)].map(m => m[1])
    const present = new Set(readdirSync(MODELS_DIR))
    expect(cited.length).toBeGreaterThan(0)
    expect(cited.filter(f => !present.has(f))).toEqual([])
  })

  it('public/ ne livre aucune page qui charge du code depuis internet', () => {
    const pages = readdirSync(join(ROOT, 'public'), { recursive: true }).filter(f => f.endsWith('.html'))
    const online = pages.filter(f => /https?:\/\//.test(readFileSync(join(ROOT, 'public', f), 'utf8')))
    expect(online).toEqual([])
  })
})
