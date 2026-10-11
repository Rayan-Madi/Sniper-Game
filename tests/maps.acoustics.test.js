import { describe, it, expect, vi } from 'vitest'

// Acoustique de chaque carte (spec du lot 2, §3.5 ; plan, tâche T6) : la carte dit son acoustique (info.acoustics),
// dont main.js monte l'écho (une ConvolverNode par mission, src/audio.js) : rue (M1), place (M2), port (M3), base
// (M4), colline (M5), interieur (M6). Le port dit aussi sa pluie (info.rain), que la nappe de la mission fait entendre.
//
// Témoin : avant la tâche T6 (commit ea35614), aucune carte ne disait son acoustique ni sa pluie (la pluie de M3 était
// muette) : vus rouges.

vi.mock('../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

const { MAP_BUILDERS, clearMap } = await import('../src/maps.js')
const { ACOUSTIQUES } = await import('../src/shot/tuning.js')
const { withSeed } = await import('../src/gfx/memtest.js')

const ATTENDU = ['rue', 'place', 'port', 'base', 'colline', 'interieur']
const NOMS = ['M1 rue', 'M2 place', 'M3 port', 'M4 base', 'M5 convoi', 'M6 fête']
const infos = MAP_BUILDERS.map((build, i) => withSeed(1000 + i, build))
clearMap()

describe('acoustique de chaque carte', () => {
  infos.forEach((info, i) => {
    it(`${NOMS[i]} : ${ATTENDU[i]}, une acoustique réglée dans ACOUSTIQUES`, () => {
      expect(info.acoustics).toBe(ATTENDU[i])
      expect(Object.hasOwn(ACOUSTIQUES, info.acoustics)).toBe(true)
    })
  })
})

describe('pluie', () => {
  it('le port (M3) a sa pluie, audible ; aucune autre carte', () => {
    expect(infos.map(info => !!info.rain)).toEqual([false, false, true, false, false, false])
  })
})
