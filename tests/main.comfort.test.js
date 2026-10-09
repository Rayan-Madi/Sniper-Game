import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MAIN_SRC as SRC, analyse, callsIn, callsInNode } from './gfx/mainSource.js'

// Câblage du confort dans main.js et index.html (spec du lot 1 §4.5, tâche L6). Les pièces ont leurs tests (comfort,
// settings, kit et playCinematic) ; main.js ne s'importe pas sous jsdom, cette garde vérifie en lisant le source :
// - le flash du tir passe par shotFlash(effectsReduced()), et plus aucun flash à 0,22 n'est écrit en dur ;
// - toute cinématique passe par cinematic(), qui transmet reducedMotion: effectsReduced() à playCinematic (le réglage
//   et le système relus à chaque lancement) ;
// - le bouton Plein écran de la section « Affichage » est branché au chargement par bindFullscreenButton.

const IMPORTS = {
  shotFlash: './comfort.js',
  bindFullscreenButton: './comfort.js',
  effectsReduced: './settings.js',
}

const CALLS = [
  ['shoot', 'shotFlash'],
  ['shoot', 'effectsReduced'],
  ['cinematic', 'playCinematic'],
  ['cinematic', 'effectsReduced'],
]

const HTML = readFileSync(resolve(__dirname, '../index.html'), 'utf8')

// Noms des fonctions de main.js (et '(module)' pour le premier niveau) qui appellent `callee`.
function callersOf(a, callee) {
  const out = new Set()
  for (const [name, fn] of a.fns) if (callsInNode(a, fn.body).some(c => c.callee === callee)) out.add(name)
  const top = a.program.body.filter(n => n.type !== 'FunctionDeclaration' && n.type !== 'ImportDeclaration')
  if (callsInNode(a, top).some(c => c.callee === callee)) out.add('(module)')
  return [...out].sort()
}

// Instruction de premier niveau qui appelle `callee` : son texte, ou null.
function topLevelCallText(a, callee) {
  const st = a.program.body.find(n => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression'
    && a.source.slice(n.expression.callee.start, n.expression.callee.end) === callee)
  return st ? a.source.slice(st.start, st.end) : null
}

const callText = (a, fn, callee) => {
  const c = (callsIn(a, fn) || []).find(x => x.callee === callee)
  return c ? a.source.slice(c.start, c.end) : null
}

function wiringFaults(source) {
  const a = analyse(source)
  const faults = []
  for (const [name, from] of Object.entries(IMPORTS)) {
    if (a.imports.get(name)?.from !== from) faults.push(`${name} n'est pas importé de ${from}`)
  }
  for (const [fn, callee] of CALLS) {
    const calls = callsIn(a, fn)
    if (!calls) faults.push(`${fn} absente de main.js`)
    else if (!calls.some(c => c.callee === callee)) faults.push(`${fn} n'appelle pas ${callee}()`)
  }
  const flash = callText(a, 'shoot', 'shotFlash')
  if (flash && !flash.includes('effectsReduced()')) faults.push('le flash du tir ne suit pas effectsReduced()')
  if (/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.22\s*\)/.test(source)) faults.push('main.js garde un flash à 0,22 écrit en dur')
  const play = callText(a, 'cinematic', 'playCinematic')
  if (play && !/reducedMotion\s*:\s*effectsReduced\(\)/.test(play)) faults.push('cinematic ne transmet pas reducedMotion: effectsReduced() à playCinematic')
  const callers = callersOf(a, 'playCinematic')
  if (callers.join() !== 'cinematic') faults.push(`playCinematic appelée hors de cinematic (${callers.join(', ')})`)
  const bind = topLevelCallText(a, 'bindFullscreenButton')
  if (!bind || !bind.includes("getElementById('set-fullscreen')")) faults.push('le bouton set-fullscreen n\'est pas branché au chargement')
  return faults
}

function htmlFaults(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const faults = []
  const btn = doc.querySelector('#settings-display button#set-fullscreen')
  if (!btn) return ['pas de bouton #set-fullscreen dans la section Affichage']
  if (btn.getAttribute('type') !== 'button') faults.push('le bouton Plein écran n\'est pas de type button')
  const labelled = (btn.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => doc.getElementById(id)?.textContent.trim())
  if (!labelled.includes('Plein écran')) faults.push('le bouton n\'est pas étiqueté « Plein écran »')
  return faults
}

describe('main.js et index.html : confort branché', () => {
  it('flash du tir, cinématiques et plein écran branchés là où il faut', () => {
    expect(wiringFaults(SRC)).toEqual([])
  })

  it('index.html : bouton Plein écran dans la section Affichage, étiqueté', () => {
    expect(htmlFaults(HTML)).toEqual([])
  })
})

describe('témoins de la garde', () => {
  const mutated = (next) => { expect(next).not.toBe(SRC); return next }

  for (const [fn, callee] of CALLS) {
    it(`${fn} sans ${callee}() : rouge`, () => {
      const c = (callsIn(analyse(SRC), fn) || []).find(x => x.callee === callee)
      expect(c, `${fn} n'appelle déjà plus ${callee}() : témoin impossible`).toBeDefined()
      const next = mutated(SRC.slice(0, c.start) + '(void 0)' + SRC.slice(c.end))
      expect(wiringFaults(next)).toContain(`${fn} n'appelle pas ${callee}()`)
    })
  }

  for (const [name, from] of Object.entries(IMPORTS)) {
    it(`${name} remplacé par une copie locale : rouge`, () => {
      const s = analyse(SRC).imports.get(name)?.node
      expect(s, `${name} n'est déjà plus importé : témoin impossible`).toBeDefined()
      const next = mutated(SRC.slice(0, s.start) + `${name} as ${name}Importe` + SRC.slice(s.end) + `\nfunction ${name}() {}\n`)
      expect(wiringFaults(next)).toContain(`${name} n'est pas importé de ${from}`)
    })
  }

  it('flash du tir à effets fixes (shotFlash(false)) : rouge', () => {
    const t = callText(analyse(SRC), 'shoot', 'shotFlash')
    expect(t, 'shoot n\'appelle pas shotFlash : témoin impossible').toBeTruthy()
    const next = mutated(SRC.replace(t, 'shotFlash(false)'))
    expect(wiringFaults(next)).toContain('le flash du tir ne suit pas effectsReduced()')
  })

  it('ancien flash à 0,22 remis dans main.js : rouge', () => {
    const next = mutated(SRC + "\nfunction flashScreen() { const f = document.createElement('div'); f.style.cssText = 'background:rgba(255,255,255,0.22)' }\n")
    expect(wiringFaults(next)).toContain('main.js garde un flash à 0,22 écrit en dur')
  })

  it('cinematic qui ne transmet plus reducedMotion : rouge', () => {
    const t = callText(analyse(SRC), 'cinematic', 'playCinematic')
    expect(t, 'cinematic n\'appelle pas playCinematic : témoin impossible').toBeTruthy()
    const next = mutated(SRC.replace(t, t.replace(/reducedMotion\s*:\s*effectsReduced\(\)/, 'reducedMotion: false')))
    expect(wiringFaults(next)).toContain('cinematic ne transmet pas reducedMotion: effectsReduced() à playCinematic')
  })

  it('une cinématique lancée sans passer par cinematic : rouge', () => {
    const next = mutated(SRC + "\nfunction rejouer() { playCinematic('m1', {}) }\n")
    expect(wiringFaults(next)).toContain('playCinematic appelée hors de cinematic (cinematic, rejouer)')
  })

  it('bouton Plein écran non branché : rouge', () => {
    const t = topLevelCallText(analyse(SRC), 'bindFullscreenButton')
    expect(t, 'bindFullscreenButton n\'est pas appelée au chargement : témoin impossible').toBeTruthy()
    const next = mutated(SRC.replace(t, ''))
    expect(wiringFaults(next)).toContain('le bouton set-fullscreen n\'est pas branché au chargement')
  })

  it('index.html sans le bouton, ou sans son étiquette : rouge', () => {
    expect(HTML).toContain('id="set-fullscreen"')
    expect(htmlFaults(HTML.replace('id="set-fullscreen"', 'id="set-autre"'))).toEqual(['pas de bouton #set-fullscreen dans la section Affichage'])
    expect(htmlFaults(HTML.replace('>Plein écran<', '>Écran<'))).toContain('le bouton n\'est pas étiqueté « Plein écran »')
  })
})
