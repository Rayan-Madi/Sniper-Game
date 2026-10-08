import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsIn } from './mainSource.js'

// Câblage de la libération dans main.js (spec du lot 1 §4.2). main.js ne s'importe pas sous jsdom (canevas WebGL, DOM
// du jeu) : les aides (lock.js, convoy.js, effects.js, maps.js) ont leurs propres tests, ce fichier garde leurs points
// d'appel en lisant le source. Chaque appel attendu est cherché dans le corps de la fonction nommée, et la fonction
// appelée doit venir du bon module (pas d'une copie locale qui ne libérerait rien). Sans cette garde, retirer
// removeMoralLock() d'unmountLevel ou MAP_BUILDERS[0]() de showMenu ne ferait rougir aucun test : seuls le memtest et
// la capture retour<n> le verraient, à la main.

// Ce que main.js doit importer, et d'où.
const IMPORTS = {
  releaseConvoy: './campaign/convoy.js',
  releaseMoralLock: './campaign/lock.js',
  clearEffects: './effects.js',
  clearBulletHoles: './effects.js',
  spawnBulletHole: './effects.js',
  MAP_BUILDERS: './maps.js',
}

// [fonction de main.js, appel qu'elle doit faire]
const CALLS = [
  ['startLevel', 'clearEntities'],        // relance, mission suivante
  ['clearEntities', 'unmountLevel'],
  ['unmountLevel', 'clearConvoy'],        // jeeps libérées
  ['unmountLevel', 'removeMoralLock'],    // sinon le cadenas du port restait sous le menu, dans la rue
  ['unmountLevel', 'clearBulletHoles'],
  ['unmountLevel', 'clearEffects'],       // effets encore en vie libérés
  ['unmountLevel', 'npc.dispose'],        // PNJ libérés (clone, matériaux teintés, marqueurs), modèles partagés gardés
  ['clearConvoy', 'releaseConvoy'],
  ['removeMoralLock', 'releaseMoralLock'],
  ['mountLevel', 'removeMoralLock'],
  ['showMenu', 'unmountLevel'],
  ['showMenu', 'MAP_BUILDERS[0]'],        // la carte de la mission est libérée, la rue revient derrière le menu
  ['resolveBullet', 'removeMoralLock'],   // cadenas tiré
  ['resolveBullet', 'spawnBulletHole'],   // tir manqué : trou sur la géométrie et le matériau partagés
]

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
  return faults
}

describe('main.js : points de retrait branchés', () => {
  it('chaque aide de libération est importée de son module et appelée là où le jeu retire', () => {
    expect(wiringFaults(SRC)).toEqual([])
  })
})

// Témoins : la garde rougit sur chaque câblage retiré. Une mutation qui ne changerait rien au source est refusée (le
// témoin ne prouverait rien). Chaque témoin vérifie le défaut que sa mutation ajoute : si main.js perd vraiment un
// appel, seuls la garde et le témoin de cet appel rougissent.
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

  it('fonction de retrait renommée : rouge', () => {
    const next = mutated(SRC.replace('function removeMoralLock()', 'function retirerCadenas()'))
    expect(wiringFaults(next)).toContain('removeMoralLock absente de main.js')
  })
})
