import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsIn, topLevelCalls } from './mainSource.js'

// Câblage des réglages graphiques dans main.js (spec du lot 1 §4.3, tâche L4). Les pièces ont leurs tests (presetFor
// et le contrôleur de résolution dans quality.test.js, applyRenderQuality dans scene.quality.test.js, l'ombre des
// personnages dans npc.shadows.test.js) ; main.js ne s'importe pas sous jsdom, cette garde vérifie en lisant le source
// qu'elles sont appelées là où il faut :
// - applyQuality (préréglage, renderer, ombre des personnages, résolution dynamique remise à 1) au démarrage, après
//   loadSettings et avant la première image, au changement de réglage, à chaque montage de mission et au retour au
//   menu (la résolution dynamique ne pilote l'échelle qu'en mission) ;
// - la boucle nourrit la résolution dynamique, qui réapplique la densité de pixels quand l'échelle change ;
// - le panneau de performances et le compteur de l'enquête suivent le réglage « Afficher les performances ».

const IMPORTS = {
  presetFor: './gfx/quality.js',
  createResolutionController: './gfx/quality.js',
  applyRenderQuality: './scene.js',
  setNpcShadows: './npc.js',
}

const CALLS = [
  ['applyQuality', 'presetFor'],
  ['applyQuality', 'createResolutionController'],
  ['applyQuality', 'applyRenderQuality'],
  ['applyQuality', 'setNpcShadows'],       // PNJ créés ensuite
  ['applyQuality', 'npc.applyShadows'],    // PNJ déjà en scène (changement de réglage en pause)
  ['setGraphics', 'applyQuality'],         // changement de réglage, tout de suite
  ['setGraphics', 'saveSettings'],
  ['mountLevel', 'applyQuality'],
  ['showMenu', 'applyQuality'],            // hors mission : échelle 1
  ['loop', 'feedResolution'],
  ['feedResolution', 'resolution.push'],
  ['feedResolution', 'applyRenderQuality'],
]

// Fonctions qui lisent le réglage « Afficher les performances ».
const READS_SHOW_STATS = ['syncStatsPanel', 'investigate']

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
  // Démarrage : loadSettings, puis applyQuality, avant la première image (loop)
  const top = topLevelCalls(a).map(c => c.callee)
  const iLoad = top.indexOf('loadSettings'), iApply = top.indexOf('applyQuality'), iLoop = top.indexOf('loop')
  if (iApply < 0) faults.push('applyQuality n\'est pas appelée au démarrage')
  else if (!(iLoad >= 0 && iLoad < iApply && (iLoop < 0 || iApply < iLoop))) faults.push('applyQuality n\'est pas appelée entre loadSettings et loop')
  for (const fn of READS_SHOW_STATS) {
    const node = a.fns.get(fn)
    if (!node || !source.slice(node.start, node.end).includes('settings.showStats')) faults.push(`${fn} ne lit pas settings.showStats`)
  }
  return faults
}

describe('main.js : réglages graphiques branchés', () => {
  it('préréglage, résolution dynamique et ombre des personnages appliqués là où il faut', () => {
    expect(wiringFaults(SRC)).toEqual([])
  })
})

describe('témoins de la garde', () => {
  const mutated = (next) => { expect(next).not.toBe(SRC); return next }

  for (const [fn, callee] of CALLS) {
    it(`${fn} sans ${callee}() : rouge`, () => {
      const c = (callsIn(analyse(SRC), fn) || []).find(x => x.callee === callee)
      expect(c, `${fn} n'appelle déjà plus ${callee}() : témoin impossible`).toBeDefined()
      const next = mutated(SRC.slice(0, c.start) + 'void 0' + SRC.slice(c.end))
      expect(wiringFaults(next)).toContain(`${fn} n'appelle pas ${callee}()`)
    })
  }

  for (const [name, from] of Object.entries(IMPORTS)) {
    it(`${name} remplacé par une copie locale vide : rouge`, () => {
      const s = analyse(SRC).imports.get(name)?.node
      expect(s, `${name} n'est déjà plus importé : témoin impossible`).toBeDefined()
      const next = mutated(SRC.slice(0, s.start) + `${name} as ${name}Importe` + SRC.slice(s.end) + `\nfunction ${name}() {}\n`)
      expect(wiringFaults(next)).toContain(`${name} n'est pas importé de ${from}`)
    })
  }

  it('applyQuality retirée du démarrage : rouge', () => {
    const c = topLevelCalls(analyse(SRC)).find(x => x.callee === 'applyQuality')
    expect(c, 'applyQuality n\'est déjà plus appelée au démarrage : témoin impossible').toBeDefined()
    const next = mutated(SRC.slice(0, c.start) + SRC.slice(c.end))
    expect(wiringFaults(next)).toContain('applyQuality n\'est pas appelée au démarrage')
  })

  it('applyQuality appelée avant loadSettings : rouge', () => {
    const a = analyse(SRC)
    const apply = topLevelCalls(a).find(x => x.callee === 'applyQuality')
    const load = topLevelCalls(a).find(x => x.callee === 'loadSettings')
    expect(apply && load, 'appels de démarrage introuvables : témoin impossible').toBeTruthy()
    const text = SRC.slice(apply.start, apply.end)
    const without = SRC.slice(0, apply.start) + SRC.slice(apply.end)
    const next = mutated(without.slice(0, load.start) + text + '\n' + without.slice(load.start))
    expect(wiringFaults(next)).toContain('applyQuality n\'est pas appelée entre loadSettings et loop')
  })

  for (const fn of READS_SHOW_STATS) {
    it(`${fn} sans settings.showStats : rouge`, () => {
      const node = analyse(SRC).fns.get(fn)
      expect(node, `${fn} absente : témoin impossible`).toBeDefined()
      const body = SRC.slice(node.start, node.end)
      expect(body.includes('settings.showStats'), `${fn} ne lit déjà pas le réglage : témoin impossible`).toBe(true)
      const next = mutated(SRC.slice(0, node.start) + body.replaceAll('settings.showStats', 'false') + SRC.slice(node.end))
      expect(wiringFaults(next)).toContain(`${fn} ne lit pas settings.showStats`)
    })
  }
})
