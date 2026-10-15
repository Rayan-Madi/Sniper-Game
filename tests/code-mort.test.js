import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { MAIN_SRC, analyse, callsInNode, readSource } from './gfx/mainSource.js'

// Code mort du tir et des échecs (spec du lot 2, §3.7 ; plan, tâche T7 ; audit de reprise, rapport-gameplay §1 et §7) :
// - le flash de bouche (spawnMuzzle, effects.js) n'était jamais lancé, la détection du tireur par les gardes
//   (detectsShooter, npc.js) jamais appelée, si bien que leur champ de vision (guardFOV, levels.js) ne servait à rien ;
//   movingTarget (levels.js) n'était jamais lu, getHeadPosition (npc.js) ni hasModel (characters.js) jamais appelés.
//   Si un lot a de nouveau besoin d'un de ces noms, il le retire de la liste ;
// - « Vous avez été repéré », texte d'échec par défaut posé au départ de chaque mission et dans index.html, ne
//   s'affichait jamais : chaque échec (civil abattu, cible en fuite, convoi parti) passe sa cause à triggerGameOver.
//   Plus de texte par défaut : un échec sans cause se verrait (écran vide), au lieu d'afficher une cause fausse.
//
// Témoin : au commit 04a4bd7, ces gardes sont rouges (vu avant le retrait), sauf « chaque appel passe sa cause », qui
// garde la règle déjà suivie.

const ROOT = resolve(__dirname, '..')
const a = analyse(MAIN_SRC)
const texte = n => a.source.slice(n.start, n.end)
const INDEX = readSource(join(ROOT, 'index.html'))

// Tout le code du dépôt, avec son chemin depuis la racine : le jeu (src, index.html), les scripts (parcours, mémoire,
// captures), les tests (hors cette garde, qui nomme ce qu'elle cherche), les outils de dev, Electron et le serveur du
// PvP. La spec (§3.7, précisions de T7) dit le grep fait sur les sources, les scripts, les tests et index.html : à la
// relecture de T7, la garde ne parcourait que src et index.html.
const DOSSIERS = ['src', 'scripts', 'tests', 'dev', 'electron', 'server']
const CODE = /\.(js|mjs|cjs|html)$/
const CETTE_GARDE = 'tests/code-mort.test.js'
function sources() {
  const out = [{ path: 'index.html', text: INDEX }]
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p) }
      else if (CODE.test(e.name)) out.push({ path: relative(ROOT, p).replace(/\\/g, '/'), text: readSource(p) })
    }
  }
  for (const d of DOSSIERS) walk(join(ROOT, d))
  return out.filter(s => s.path !== CETTE_GARDE)
}

describe('code mort retiré', () => {
  const MORTS = ['spawnMuzzle', 'detectsShooter', 'guardFOV', 'movingTarget', 'getHeadPosition', 'hasModel']
  for (const nom of MORTS) {
    it(`${nom} : plus nulle part dans le code`, () => {
      const re = new RegExp(`\\b${nom}\\b`)
      expect(sources().filter(s => re.test(s.text)).map(s => s.path)).toEqual([])
    })
  }
})

describe('échec : chaque échec dit sa cause, plus de texte par défaut', () => {
  const fn = a.fns.get('triggerGameOver')
  const appels = callsInNode(a, a.program).filter(c => c.callee === 'triggerGameOver')

  it('chaque appel de triggerGameOver passe sa cause, un texte écrit', () => {
    expect(fn, 'triggerGameOver dans main.js').toBeTruthy()
    expect(appels.length).toBeGreaterThanOrEqual(3)   // civil abattu, cible en fuite, convoi parti
    for (const c of appels) {
      const src = a.source.slice(c.start, c.end)
      expect(src, src).toMatch(/^triggerGameOver\(\s*'[^']+'\s*\)$/)
    }
  })

  it('triggerGameOver affiche sa cause sans condition', () => {
    const poses = fn.body.body.filter(n => n.type === 'ExpressionStatement' && /game-over-reason/.test(texte(n)))
    expect(poses.map(texte)).toEqual(["document.getElementById('game-over-reason').textContent = reason"])
  })

  it('« Vous avez été repéré » n\'est plus nulle part : ni au départ d\'une mission, ni dans index.html', () => {
    expect(sources().filter(s => /été repéré/.test(s.text)).map(s => s.path)).toEqual([])
    const doc = new DOMParser().parseFromString(INDEX, 'text/html')
    expect(doc.getElementById('game-over-reason').textContent).toBe('')
  })
})
