import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsInNode } from './mainSource.js'

// Câblage de la route ?memtest=1 dans main.js (spec du lot 1, §6 reformulé le 9 octobre 2026, §8 ; tâche L8). Le
// critère « partie complète » ajoute au menu de départ les ressources des modèles chargés : la route les relève
// (modelResources de characters.js, testée dans npc.dispose.test.js) et les publie avec chaque relevé (measure, testée
// dans memtest.test.js), jamais un nombre écrit en dur dans checkMemtest. main.js ne s'importe pas sous jsdom : cette
// garde lit le source. Sans elle, une route qui ne publierait plus ces nombres ne se verrait qu'au memtest, en Chrome.
function faults(source) {
  const a = analyse(source)
  const out = []
  const imp = a.imports.get('modelResources')
  if (!imp || imp.from !== './characters.js') out.push('modelResources importé de ./characters.js')
  const calls = callsInNode(a, a.program)
  const measures = calls.filter(c => c.callee === 'measure')
  if (!measures.length) out.push('appel de measure')
  for (const m of measures) {
    if (!calls.some(c => c.callee === 'modelResources' && c.start > m.start && c.end < m.end)) out.push('measure(…, modelResources())')
  }
  return out
}

describe('route ?memtest=1 : ressources des modèles publiées avec chaque relevé', () => {
  it('main.js importe modelResources de characters.js et le passe à measure', () => {
    expect(faults(SRC)).toEqual([])
  })

  it('témoin : un relevé sans modelResources fait rougir la garde', () => {
    const sans = SRC.replace('measure(renderer.info, performance.memory, modelResources())', 'measure(renderer.info, performance.memory)')
    expect(sans).not.toBe(SRC)
    expect(faults(sans)).toEqual(['measure(…, modelResources())'])
  })
})
