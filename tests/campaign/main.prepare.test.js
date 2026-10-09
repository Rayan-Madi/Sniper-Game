import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsIn } from '../gfx/mainSource.js'

// Câblage de la préparation pendant le briefing dans main.js (spec du lot 1 §4.6, tâche L7). L'enchaînement a ses
// tests (campaign/prepare.js) ; main.js ne s'importe pas sous jsdom, cette garde vérifie ses points d'appel en lisant
// le source :
// - launchLevel prépare la mission seulement quand un briefing se joue (après le départ direct du briefing déjà vu),
//   en phase 'briefing', modèles attendus (charactersSettled, charactersReady), lancement abandonné ou rendu
//   interrompu sans montage (missionToken, renderLost), sur l'écran noir de la cinématique (schedule: afterPaint), que
//   la cinématique attend pour démarrer (ready), et transmet la préparation au départ (enterLevel, startLevel) ;
// - prepareLevel monte la mission par mountLevel, la fonction du jeu, puis compile ses shaders ;
// - startLevel reprend la mission préparée, et ne démonte et ne monte que si elle ne l'est pas ;
// - la boucle ne rend rien en phase 'briefing' : la mission montée n'apparaît jamais sous la cinématique.
// Sans cette garde, retirer la préparation de launchLevel ne ferait rougir aucun test : seul le memtest le verrait.

const IMPORTS = { prepareDuringBriefing: './campaign/prepare.js', afterPaint: './campaign/prepare.js' }

const body = (a, name) => { const fn = a.fns.get(name); return fn ? a.source.slice(fn.body.start, fn.body.end) : null }
const param = (a, name, i) => {
  const p = a.fns.get(name)?.params[i]
  return !p ? null : p.type === 'AssignmentPattern' ? p.left.name : p.name
}
const texts = (a, fn, callee) => (callsIn(a, fn) || []).filter(c => c.callee === callee).map(c => a.source.slice(c.start, c.end))

function wiringFaults(source) {
  const a = analyse(source)
  const faults = []
  for (const [name, from] of Object.entries(IMPORTS)) {
    if (a.imports.get(name)?.from !== from) faults.push(`${name} n'est pas importé de ${from}`)
  }

  // prepareLevel : la mission montée par la fonction du jeu, puis ses shaders compilés
  if (!a.fns.has('prepareLevel')) faults.push('prepareLevel absente de main.js')
  else {
    if (!texts(a, 'prepareLevel', 'mountLevel').length) faults.push('prepareLevel ne monte pas la mission par mountLevel')
    if (!texts(a, 'prepareLevel', 'renderer.compile').includes('renderer.compile(scene, camera)')) faults.push('prepareLevel ne compile pas les shaders de la scène')
  }

  // launchLevel : une préparation, sur le chemin du briefing seulement, transmise au départ
  const launch = body(a, 'launchLevel') || ''
  const preps = texts(a, 'launchLevel', 'prepareDuringBriefing')
  if (preps.length !== 1) faults.push(`launchLevel appelle prepareDuringBriefing ${preps.length} fois au lieu d'une`)
  else {
    const at = launch.indexOf('prepareDuringBriefing(')
    const direct = launch.search(/enterLevel\(n\);? return\b/)
    const phase = launch.indexOf("gamePhase = 'briefing'")
    if (direct < 0 || at < direct) faults.push('mission préparée aussi sans briefing')
    if (phase < 0 || at < phase) faults.push('mission préparée hors de la phase briefing')
    const prep = preps[0]
    if (!/\bprepareLevel\(n\)/.test(prep)) faults.push('la préparation ne passe pas par prepareLevel')
    for (const id of ['charactersSettled', 'charactersReady']) if (!new RegExp(`\\b${id}\\b`).test(prep)) faults.push(`la préparation ne passe pas ${id}`)
    const current = /isCurrent: \(\) => ([^\n,]*)/.exec(prep)
    if (!current || !/\bmissionToken\b/.test(current[1])) faults.push('mission préparée pour un lancement abandonné')
    if (!current || !/!renderLost\b/.test(current[1])) faults.push('mission préparée sous le rendu interrompu')
    if (!/\bschedule: afterPaint\b/.test(prep)) faults.push('mission montée avant que l\'écran noir de la cinématique soit affiché')
    const v = /(\w+) = prepareDuringBriefing\(/.exec(launch)
    if (!v || !texts(a, 'launchLevel', 'enterLevel').includes(`enterLevel(n, ${v[1]})`)) faults.push('la fin du briefing ne transmet pas la préparation')
    if (!v || !texts(a, 'launchLevel', 'cinematic').some(t => t.includes(`ready: ${v[1]}.begun`))) faults.push('la cinématique démarre sans attendre le montage')
  }

  // enterLevel puis startLevel : la préparation va jusqu'au départ, qui la reprend
  const ep = param(a, 'enterLevel', 1)
  if (!ep || !texts(a, 'enterLevel', 'startLevel').includes(`startLevel(n, ${ep})`)) faults.push('enterLevel ne transmet pas la préparation à startLevel')
  const sp = param(a, 'startLevel', 1)
  const start = body(a, 'startLevel') || ''
  const taken = sp && new RegExp(`(\\w+) = [^\\n]*\\b${sp}\\.take\\(\\)`).exec(start)
  if (!taken) faults.push('startLevel ne reprend pas la mission préparée')
  else {
    for (const call of ['clearEntities()', 'mountLevel(n)']) {
      const all = texts(a, 'startLevel', call.slice(0, call.indexOf('('))).length
      const guarded = start.split(`if (!${taken[1]}) ${call}`).length - 1
      if (all !== 1 || guarded !== 1) faults.push(`startLevel appelle ${call} sur une mission déjà préparée`)
    }
  }

  // Rien n'est rendu en phase 'briefing' : la boucle s'arrête avant renderer.render(scene, camera)
  const loop = body(a, 'loop') || ''
  const stop = loop.search(/if \(gamePhase === 'briefing'[^)]*\) return\b/)
  if (stop < 0 || stop > loop.indexOf('renderer.render(scene, camera)')) faults.push('la boucle rend la scène pendant la cinématique')
  return faults
}

describe('main.js : la mission se monte et ses shaders se compilent pendant le briefing', () => {
  it('préparation dans launchLevel, montage et compilation dans prepareLevel, reprise dans startLevel', () => {
    expect(wiringFaults(SRC)).toEqual([])
  })
})

// Témoins : chaque mutation reproduit un câblage manquant ; elle doit changer le source et faire apparaître son défaut.
describe('témoins de la garde', () => {
  const mutated = (next) => { expect(next).not.toBe(SRC); return next }
  const a = analyse(SRC)
  const inFn = (name, from, to) => {
    const fn = a.fns.get(name)
    expect(fn, `${name} absente : témoin impossible`).toBeDefined()
    const text = SRC.slice(fn.start, fn.end)
    return mutated(SRC.slice(0, fn.start) + text.replace(from, to) + SRC.slice(fn.end))
  }
  const prepCall = () => {
    const c = (callsIn(a, 'launchLevel') || []).find(x => x.callee === 'prepareDuringBriefing')
    expect(c, 'launchLevel ne prépare déjà plus : témoin impossible').toBeDefined()
    return SRC.slice(c.start, c.end)
  }

  it('launchLevel sans préparation, comme avant la tâche L7 : rouge', () => {
    expect(wiringFaults(inFn('launchLevel', prepCall(), 'null'))).toContain('launchLevel appelle prepareDuringBriefing 0 fois au lieu d\'une')
  })

  it('mission préparée aussi quand le briefing est déjà vu : rouge', () => {
    const next = inFn('launchLevel', /enterLevel\(n\);? return\b/, m => `${prepCall()}; ${m}`)
    expect(wiringFaults(next)).toContain('launchLevel appelle prepareDuringBriefing 2 fois au lieu d\'une')
  })

  it('préparation placée avant le départ direct du briefing déjà vu : rouge', () => {
    const fn = a.fns.get('launchLevel')
    const text = SRC.slice(fn.start, fn.end)
    const st = /\n[^\n]*\bprepareDuringBriefing\([\s\S]*?\n {2}\}\)\n/.exec(text)
    expect(st, 'instruction de préparation introuvable : témoin impossible').not.toBeNull()
    const moved = text.replace(st[0], '\n').replace(/\n[^\n]*if \([^\n]*enterLevel\(n\);? return\b[^\n]*/, m => st[0].replace(/\n$/, '') + m)
    const next = mutated(SRC.slice(0, fn.start) + moved + SRC.slice(fn.end))
    const faults = wiringFaults(next)
    expect(faults).toContain('mission préparée aussi sans briefing')
    expect(faults).toContain('mission préparée hors de la phase briefing')
  })

  it('préparation sans prepareLevel : rouge', () => {
    expect(wiringFaults(inFn('launchLevel', /prepareLevel\(n\)/, 'mountLevel(n)'))).toContain('la préparation ne passe pas par prepareLevel')
  })

  it('préparation qui n\'attend pas les modèles : rouge', () => {
    const next = inFn('launchLevel', /settled: charactersSettled/, 'settled: () => true')
    expect(wiringFaults(next)).toContain('la préparation ne passe pas charactersSettled')
  })

  it('préparation pour un lancement abandonné : rouge', () => {
    const next = inFn('launchLevel', /isCurrent: \(\) => [^\n,]*/, 'isCurrent: () => !renderLost')
    expect(wiringFaults(next)).toContain('mission préparée pour un lancement abandonné')
  })

  it('préparation sous le rendu interrompu : rouge', () => {
    const next = inFn('launchLevel', / && !renderLost\b/, '')
    expect(wiringFaults(next)).toContain('mission préparée sous le rendu interrompu')
  })

  it('montage dans le clic, avant l\'écran noir : rouge', () => {
    const next = inFn('launchLevel', /\n[^\n]*schedule: afterPaint,?/, '')
    expect(wiringFaults(next)).toContain('mission montée avant que l\'écran noir de la cinématique soit affiché')
  })

  it('cinématique qui démarre sans attendre le montage : rouge', () => {
    const next = inFn('launchLevel', /\n[^\n]*ready: \w+\.begun,?/, '')
    expect(wiringFaults(next)).toContain('la cinématique démarre sans attendre le montage')
  })

  it('fin du briefing sans la préparation : rouge', () => {
    const next = inFn('launchLevel', /enterLevel\(n, \w+\)/, 'enterLevel(n)')
    expect(wiringFaults(next)).toContain('la fin du briefing ne transmet pas la préparation')
  })

  it('enterLevel qui ne transmet pas la préparation : rouge', () => {
    const next = inFn('enterLevel', /startLevel\(n, \w+\)/, 'startLevel(n)')
    expect(wiringFaults(next)).toContain('enterLevel ne transmet pas la préparation à startLevel')
  })

  it('startLevel qui remonte toujours, comme avant la tâche L7 : rouge', () => {
    const next = inFn('startLevel', /if \(!\w+\) mountLevel\(n\)/, 'mountLevel(n)')
    expect(wiringFaults(next)).toContain('startLevel appelle mountLevel(n) sur une mission déjà préparée')
  })

  it('startLevel qui démonte la mission préparée : rouge', () => {
    const next = inFn('startLevel', /if \(!\w+\) clearEntities\(\)/, 'clearEntities()')
    expect(wiringFaults(next)).toContain('startLevel appelle clearEntities() sur une mission déjà préparée')
  })

  it('startLevel qui ne reprend pas la préparation : rouge', () => {
    const next = inFn('startLevel', /\b(\w+)\.take\(\)/, 'false')
    expect(wiringFaults(next)).toContain('startLevel ne reprend pas la mission préparée')
  })

  it('prepareLevel sans compilation : rouge', () => {
    expect(wiringFaults(inFn('prepareLevel', 'renderer.compile(scene, camera)', 'void 0'))).toContain('prepareLevel ne compile pas les shaders de la scène')
  })

  it('prepareLevel sans mountLevel : rouge', () => {
    expect(wiringFaults(inFn('prepareLevel', /mountLevel\(n\)/, 'void 0'))).toContain('prepareLevel ne monte pas la mission par mountLevel')
  })

  it('boucle qui rend pendant le briefing : rouge', () => {
    const next = inFn('loop', /\n[^\n]*if \(gamePhase === 'briefing'[^)]*\) return\b[^\n]*/, '')
    expect(wiringFaults(next)).toContain('la boucle rend la scène pendant la cinématique')
  })

  for (const [name, from] of Object.entries(IMPORTS)) {
    it(`${name} remplacé par une copie locale : rouge`, () => {
      const s = a.imports.get(name)?.node
      expect(s, `${name} n'est déjà plus importé : témoin impossible`).toBeDefined()
      const next = mutated(SRC.slice(0, s.start) + `${name} as ${name}Importe` + SRC.slice(s.end) + `\nfunction ${name}() {}\n`)
      expect(wiringFaults(next)).toContain(`${name} n'est pas importé de ${from}`)
    })
  }
})
