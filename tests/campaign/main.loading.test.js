import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsIn, callsInNode } from '../gfx/mainSource.js'

// Câblage du chargement des modèles et du contexte perdu dans main.js (spec du lot 1 §4.4). main.js ne s'importe pas
// sous jsdom : les aides (campaign/loading.js, characters.js) ont leurs tests, cette garde vérifie leurs points d'appel
// en lisant le source. Critère du §6 : aucune mission ne démarre avec des PNJ procéduraux si les modèles sont encore en
// cours de chargement. startLevel (qui monte la mission, mountLevel) n'est donc appelée que par enterLevel, qui passe
// par startWhenReady : avant ce lot, launchLevel l'appelait directement, sans rien attendre.

const IMPORTS = {
  startWhenReady: './campaign/loading.js',
  waitForCharacters: './campaign/loading.js',
  createLoadingScreen: './campaign/loading.js',
  watchContextLoss: './campaign/loading.js',
  charactersReady: './characters.js',
  charactersProgress: './characters.js',
  charactersSettled: './characters.js',
}

// [fonction de main.js, appel qu'elle doit faire, nombre d'appels attendus (1 par défaut)]
const CALLS = [
  ['launchLevel', 'enterLevel', 2],   // briefing déjà vu, et à la fin du briefing
  ['enterLevel', 'startWhenReady'],
  ['enterLevel', 'waitForCharacters'],
  ['enterLevel', 'startLevel'],
  ['onRenderLost', 'pauseGame'],      // la partie s'arrête derrière l'écran « Le rendu a été interrompu »
  ['onRenderLost', 'releaseMouse'],   // le pointeur revient pour cliquer RECHARGER
]

// Identifiants que enterLevel doit passer à startWhenReady et waitForCharacters (sans les appeler elle-même)
const REFS = { enterLevel: ['charactersSettled', 'charactersReady', 'charactersProgress'] }

// Noms des fonctions de main.js (et '(module)' pour le premier niveau) qui appellent `callee`.
function callersOf(a, callee) {
  const out = new Set()
  for (const [name, fn] of a.fns) if (callsInNode(a, fn.body).some(c => c.callee === callee)) out.add(name)
  const top = a.program.body.filter(n => n.type !== 'FunctionDeclaration' && n.type !== 'ImportDeclaration')
  if (callsInNode(a, top).some(c => c.callee === callee)) out.add('(module)')
  return [...out].sort()
}

// Instruction de premier niveau qui appelle `callee`, et les appels qu'elle contient (arguments compris).
function topLevelCall(a, callee) {
  const st = a.program.body.find(n => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression'
    && a.source.slice(n.expression.callee.start, n.expression.callee.end) === callee)
  return st ? { text: a.source.slice(st.start, st.end), calls: callsInNode(a, st).map(c => c.callee) } : null
}

function wiringFaults(source) {
  const a = analyse(source)
  const faults = []
  for (const [name, from] of Object.entries(IMPORTS)) {
    if (a.imports.get(name)?.from !== from) faults.push(`${name} n'est pas importé de ${from}`)
  }
  for (const [fn, callee, count = 1] of CALLS) {
    const calls = callsIn(a, fn)
    if (!calls) faults.push(`${fn} absente de main.js`)
    else if (calls.filter(c => c.callee === callee).length < count) faults.push(`${fn} n'appelle pas ${callee}()`)
  }
  for (const [fn, ids] of Object.entries(REFS)) {
    const node = a.fns.get(fn)
    if (!node) continue
    const body = a.source.slice(node.body.start, node.body.end)
    for (const id of ids) if (!new RegExp(`\\b${id}\\b`).test(body)) faults.push(`${fn} ne passe pas ${id}`)
  }
  const starters = callersOf(a, 'startLevel')
  if (starters.join() !== 'enterLevel') faults.push(`startLevel appelée hors de enterLevel : ${starters.join(', ')}`)
  const watch = topLevelCall(a, 'watchContextLoss')
  if (!watch) faults.push('watchContextLoss n\'est pas appelée au chargement')
  else {
    if (!watch.text.includes('renderer.domElement')) faults.push('watchContextLoss n\'écoute pas le canevas du renderer')
    if (!watch.text.includes('onRenderLost')) faults.push('watchContextLoss ne passe pas onRenderLost')
    if (!watch.calls.includes('location.reload')) faults.push('contexte rendu sans rechargement de la page')
  }
  const reload = a.program.body.find(n => n.type === 'ExpressionStatement' && a.source.slice(n.start, n.end).includes("'btn-context-reload'"))
  if (!reload || !callsInNode(a, reload).some(c => c.callee === 'location.reload')) faults.push('RECHARGER ne recharge pas la page')
  return faults
}

describe('main.js : les missions attendent les modèles, le contexte perdu est rattrapé', () => {
  it('chaque aide est importée de son module et appelée là où il faut', () => {
    expect(wiringFaults(SRC)).toEqual([])
  })
})

// Témoins : chaque mutation reproduit un câblage manquant ; elle doit changer le source et faire apparaître son défaut.
describe('témoins de la garde', () => {
  const mutated = (next) => { expect(next).not.toBe(SRC); return next }
  const a = analyse(SRC)

  it('launchLevel qui lance startLevel directement, comme avant ce lot : rouge', () => {
    const fn = a.fns.get('launchLevel')
    const body = SRC.slice(fn.start, fn.end)
    const next = mutated(SRC.slice(0, fn.start) + body.replaceAll('enterLevel(n)', 'startLevel(n)') + SRC.slice(fn.end))
    const faults = wiringFaults(next)
    expect(faults).toContain('launchLevel n\'appelle pas enterLevel()')
    expect(faults).toContain('startLevel appelée hors de enterLevel : enterLevel, launchLevel')
  })

  // Chaque appel attendu retiré tour à tour (les deux chemins de launchLevel, chacun de son côté).
  for (const [fn, callee] of CALLS) {
    const found = (callsIn(a, fn) || []).filter(x => x.callee === callee)
    it(`${fn} sans ${callee}() : rouge`, () => {
      expect(found.length, `${fn} n'appelle déjà plus ${callee}() : témoin impossible`).toBeGreaterThan(0)
      for (const c of found) {
        const next = mutated(SRC.slice(0, c.start) + 'void 0' + SRC.slice(c.end))
        expect(wiringFaults(next)).toContain(`${fn} n'appelle pas ${callee}()`)
      }
    })
  }

  for (const [name, from] of Object.entries(IMPORTS)) {
    it(`${name} remplacé par une copie locale : rouge`, () => {
      const s = a.imports.get(name)?.node
      expect(s, `${name} n'est déjà plus importé : témoin impossible`).toBeDefined()
      const next = mutated(SRC.slice(0, s.start) + `${name} as ${name}Importe` + SRC.slice(s.end) + `\nfunction ${name}() {}\n`)
      expect(wiringFaults(next)).toContain(`${name} n'est pas importé de ${from}`)
    })
  }

  it('enterLevel qui attend sans dire si les modèles sont déjà prêts : rouge', () => {
    const fn = a.fns.get('enterLevel')
    const body = SRC.slice(fn.start, fn.end)
    const next = mutated(SRC.slice(0, fn.start) + body.replace(/charactersSettled/g, '() => false') + SRC.slice(fn.end))
    expect(wiringFaults(next)).toContain('enterLevel ne passe pas charactersSettled')
  })

  it('un autre départ direct de startLevel (raccourci, route) : rouge', () => {
    const next = mutated(SRC + '\nfunction raccourci() { startLevel(2) }\n')
    expect(wiringFaults(next)).toContain('startLevel appelée hors de enterLevel : enterLevel, raccourci')
  })

  it('sans écoute du contexte perdu : rouge', () => {
    const st = topLevelCall(a, 'watchContextLoss')
    expect(st, 'watchContextLoss n\'est déjà plus appelée : témoin impossible').not.toBeNull()
    const next = mutated(SRC.replace(st.text, ''))
    expect(wiringFaults(next)).toContain('watchContextLoss n\'est pas appelée au chargement')
  })

  it('contexte rendu sans rechargement : rouge', () => {
    const st = topLevelCall(a, 'watchContextLoss')
    const next = mutated(SRC.replace(st.text, st.text.replace('location.reload()', 'void 0')))
    expect(wiringFaults(next)).toContain('contexte rendu sans rechargement de la page')
  })

  it('RECHARGER sans rechargement : rouge', () => {
    const st = a.program.body.find(n => n.type === 'ExpressionStatement' && SRC.slice(n.start, n.end).includes("'btn-context-reload'"))
    expect(st, 'RECHARGER n\'est déjà plus branché : témoin impossible').toBeDefined()
    const text = SRC.slice(st.start, st.end)
    const next = mutated(SRC.replace(text, text.replace('location.reload()', 'void 0')))
    expect(wiringFaults(next)).toContain('RECHARGER ne recharge pas la page')
  })
})
