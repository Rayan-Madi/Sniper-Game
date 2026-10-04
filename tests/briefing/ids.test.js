import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { playCinematic, registerScene } from '../../src/briefing/index.js'

// Garde-fou : une cinématique est montée dans #briefing-root, par-dessus le DOM du jeu. Si une scène
// réutilise un id du jeu (ex. #hud, #dossier), les règles CSS `#id` d'index.html s'appliquent à ses éléments
// (le dossier de M1 restait en display:none). Les ids de scène et du jeu doivent donc rester disjoints.

// Vitest se lance à la racine du dépôt (import.meta.url n'est pas une URL file: sous jsdom).
const RACINE = process.cwd()
const lire = chemin => readFileSync(join(RACINE, chemin), 'utf8')

// Ids injectés par le moteur lui-même, en plus de ceux écrits dans le HTML des scènes : le kit (k-…) et
// playCinematic, qui enveloppe chaque scène dans <div id="st">.
const IDS_INJECTES = {
  'src/briefing/kit.js': ['k-crt', 'k-bf', 'k-lost', 'k-black', 'k-glf', 'k-glt', 'k-gld', 'k-glo1', 'k-glo2', 'k-replay', 'k-lbl'],
  'src/briefing/index.js': ['st', 'k-kit-css'],
}

function ajouter(table, id, fichier) {
  if (!table.has(id)) table.set(id, new Set())
  table.get(id).add(fichier)
}

// Ids déclarés ou lus par le jeu : attributs id="…" (HTML ou gabarits JS), `.id = '…'`,
// getElementById('…') et l'aide el('…') de pvp.js.
function idsDuTexte(texte, fichier, table) {
  const motifs = [
    /\bid\s*=\s*"([^"$\s]+)"/g,
    /\bid\s*=\s*'([^'$\s]+)'/g,
    /\.id\s*=\s*['"]([^'"$\s]+)['"]/g,
    /getElementById\(\s*['"]([^'"$\s]+)['"]\s*\)/g,
    /(?<![\w.$])el\(\s*['"]([^'"$\s]+)['"]\s*\)/g,
  ]
  for (const motif of motifs) for (const m of texte.matchAll(motif)) ajouter(table, m[1], fichier)
}

function fichiersJs(dossier) {
  const out = []
  for (const f of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
    const chemin = dossier + '/' + f.name
    if (f.isDirectory()) { if (chemin !== 'src/briefing') out.push(...fichiersJs(chemin)) }
    else if (f.name.endsWith('.js')) out.push(chemin)
  }
  return out
}

function idsDuJeu() {
  const table = new Map()
  idsDuTexte(lire('index.html'), 'index.html', table)
  for (const f of fichiersJs('src')) idsDuTexte(lire(f), f, table)
  return table
}

async function idsDesScenes() {
  const modules = import.meta.glob('../../src/briefing/scenes/*.js')
  const table = new Map()
  for (const [chemin, charger] of Object.entries(modules)) {
    const fichier = 'src/briefing/scenes/' + chemin.split('/').pop()
    const { html } = await charger()
    for (const m of html.matchAll(/\bid="([^"]+)"/g)) ajouter(table, m[1], fichier)
    // ids posés par le script au démarrage : on monte la scène, on relève le DOM, on la démonte
    registerScene('ids:' + fichier, charger)
    const root = document.createElement('div'); document.body.appendChild(root)
    const handle = await playCinematic('ids:' + fichier, { root })
    for (const el of root.querySelectorAll('[id]')) ajouter(table, el.id, fichier)
    handle.cancel(); root.remove()
  }
  return table
}

describe('ids des cinématiques et du jeu', () => {
  it('le test voit bien les ids connus des deux côtés (sinon il ne garde rien)', async () => {
    const jeu = idsDuJeu(), scenes = await idsDesScenes()
    for (const id of ['menu', 'canvas', 'briefing-root', 'game-hud', 'target-dossier']) expect(jeu.has(id), `id du jeu « ${id} » non détecté`).toBe(true)
    for (const id of ['scene', 'radio', 'sub', 'title', 'trans', 'wave', 'lgt']) expect(scenes.has(id), `id de scène « ${id} » non détecté`).toBe(true)
    expect(scenes.size).toBeGreaterThan(50)
  })

  it('la liste des ids injectés correspond à ce que le moteur injecte vraiment', () => {
    for (const [fichier, ids] of Object.entries(IDS_INJECTES)) {
      const source = lire(fichier)
      // posé soit par un attribut id="…" dans un gabarit, soit par une affectation `.id = '…'`
      for (const id of ids) expect(source.includes(`id="${id}"`) || new RegExp(`\\.id\\s*=\\s*['"]${id}['"]`).test(source), `id injecté « ${id} » absent de ${fichier}`).toBe(true)
    }
  })

  it('aucun id de scène ou du kit ne collisionne avec un id du jeu', async () => {
    const jeu = idsDuJeu()
    const cinematiques = await idsDesScenes()
    for (const [fichier, ids] of Object.entries(IDS_INJECTES)) for (const id of ids) ajouter(cinematiques, id, fichier)
    const collisions = [...cinematiques.keys()].filter(id => jeu.has(id)).sort()
    const detail = collisions.map(id => `  #${id} — jeu : ${[...jeu.get(id)].join(', ')} ; cinématique : ${[...cinematiques.get(id)].join(', ')}`)
    expect(collisions, `ids présents à la fois dans le jeu et dans les cinématiques :\n${detail.join('\n')}\n`).toEqual([])
  })
})
