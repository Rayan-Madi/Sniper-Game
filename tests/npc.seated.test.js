import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { MAIN_SRC, analyse } from './gfx/mainSource.js'
import { LEVELS } from '../src/levels.js'

// Commanditaire de M6 (spec du lot 2, §3.7) : assis sur le canapé (clip Talk, une pose assise, le groupe posé à
// seatY), il ne danse jamais et reste assis tant qu'il négocie, même quand un tir le fait sursauter. Une fois en fuite,
// il se lève et court (clip Run) sur le parquet : avant le lot 2, il gardait le clip Talk et glissait assis à 5,6 m/s,
// 20 cm au-dessus du sol. En se levant, il passe devant l'assise (standUp de la carte), au-dessus de ses pieds : resté
// à la place de ses hanches assises, il courait le long du canapé, les jambes dans la banquette (vu en capture).
// Faux modèle Mixamo (tests/gfx/fakeGltf.js) complété des clips Talk (hanches 40 cm plus bas, comme les vrais modèles)
// et Run, que portent les sept GLB du jeu ; vraie carte M6 (canapés, table basse, obstacles).
//
// Témoin : au commit 04a4bd7, le commanditaire en fuite garde le clip Talk et reste à 20 cm du sol (vu rouge) ; avant
// le pas en avant, il court dans la banquette (vu rouge).
vi.mock('../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three')
  const { fakeCharacter } = await import('./gfx/fakeGltf.js')
  return {
    GLTFLoader: class {
      async loadAsync() {
        const g = fakeCharacter()
        const hips = (times, ys) => new THREE.VectorKeyframeTrack('mixamorigHips.position', times, ys.flatMap(y => [0, y, 0]))
        g.animations.push(
          new THREE.AnimationClip('Talk', 2, [hips([0, 2], [0.6, 0.6])]),
          new THREE.AnimationClip('Run', 0.6, [hips([0, 0.3, 0.6], [1.0, 0.95, 1.0])]),
        )
        return g
      }
    },
  }
})

let NPC, STATES, maps, M6
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.resetModules()
  const characters = await import('../src/characters.js')
  ;({ NPC, STATES } = await import('../src/npc.js'))
  maps = await import('../src/maps.js')
  await characters.preloadCharacters()
  M6 = maps.MAP_BUILDERS[5]()   // la fête : canapés, table basse, leurs obstacles ; le commanditaire et son canapé
})
afterEach(() => vi.restoreAllMocks())

const SHOT_FROM = new THREE.Vector3(0, 9, 5)   // la fenêtre d'en face

// Comme mountLevel en M6 : modèle de la foule, verrouillé au téléphone, fuite vers les côtés, assis sur le canapé.
function commanditaire() {
  const h = M6.hiddenTarget
  const npc = new NPC({ isTarget: true, color: 0xcc4422, x: h.spawn[0], z: h.spawn[1], groundY: M6.groundY,
    levelData: LEVELS[5], bounds: M6.spawnBounds, fleeSideways: true, hideMarker: true,
    lockState: STATES.PHONE, onPhone: true, modelType: 'civilian', standUp: h.standUp })
  npc.mesh.position.y = h.seatY
  return npc
}
const run = (npc, seconds, dt = 1 / 60) => { for (let s = 0; s < seconds - 1e-9; s += dt) npc.update(dt) }
// Poids d'un clip dans la pose : 0 s'il ne joue pas (three donne un poids de 1 à une action jamais lancée).
const weight = (npc, clip) => { const a = npc.character.actions[clip]; return a.isRunning() ? a.getEffectiveWeight() : 0 }
const hipsY = npc => {
  npc.mesh.updateMatrixWorld(true)
  let y = null
  npc.mesh.traverse(o => { if (o.isBone && o.name === 'mixamorigHips') y = o.getWorldPosition(new THREE.Vector3()).y })
  return y
}
// Meubles de la carte à hauteur des jambes (maillages solides hors sols, entre 5 cm et 1 m) traversés par un PNJ en
// (x, z) : jambes et bassin tenus à 15 cm de part et d'autre de son axe.
const JAMBES = 0.15
function meublesTraverses(x, z) {
  const out = []
  for (const m of maps.solidMeshes()) {
    if (m.userData.surface === 'sol') continue
    const b = new THREE.Box3().setFromObject(m)
    if (b.max.y < 0.05 || b.min.y > 1) continue
    if (x > b.min.x - JAMBES && x < b.max.x + JAMBES && z > b.min.z - JAMBES && z < b.max.z + JAMBES) out.push(m)
  }
  return out
}

describe('commanditaire de M6 : assis tant qu\'il négocie, debout quand il fuit', () => {
  it('assis, il est sur le canapé de gauche (la carte le pose dans la banquette)', () => {
    const npc = commanditaire()
    const [x, z] = M6.hiddenTarget.spawn
    expect(meublesTraverses(x, z).length).toBeGreaterThan(0)
    expect(npc.mesh.position.y).toBe(M6.hiddenTarget.seatY)
  })

  it('au téléphone, et quand un tir le fait sursauter : clip Talk, sur le canapé', () => {
    const npc = commanditaire()
    run(npc, 1)
    expect(weight(npc, 'Talk')).toBe(1)
    npc.react(SHOT_FROM)
    run(npc, 1)
    expect(weight(npc, 'Talk')).toBe(1)
    expect(npc.mesh.position.y).toBe(M6.hiddenTarget.seatY)
  })

  it('en fuite : il quitte la pose assise (clip Run), descend sur le parquet et court', () => {
    const npc = commanditaire()
    run(npc, 1)
    const seatedHips = hipsY(npc)
    npc.flee(SHOT_FROM)
    run(npc, 1)
    expect(npc.state).toBe(STATES.FLEE)
    expect(weight(npc, 'Run')).toBe(1)
    expect(weight(npc, 'Talk')).toBe(0)
    expect(npc.mesh.position.y).toBe(M6.groundY)            // les pieds sur le parquet, plus à la hauteur du canapé
    // Debout : hanches remontées de 14 à 19 cm selon la taille tirée au hasard (civils : 1,8 m ± 6 %), au moins 10.
    expect(hipsY(npc) - seatedHips).toBeGreaterThan(0.1)
    expect(npc.mesh.position.x).toBeLessThan(M6.hiddenTarget.spawn[0] - 3)   // il court vers la sortie de gauche
  })

  it('il se lève pendant le fondu des clips (0,25 s), sans tomber d\'un coup sur le parquet', () => {
    const npc = commanditaire()
    run(npc, 1)
    npc.flee(SHOT_FROM)
    const ys = []
    for (let i = 0; i < 30; i++) { npc.update(1 / 60); ys.push(npc.mesh.position.y) }
    expect(ys[0]).toBeGreaterThan(0.15)                    // première image de la fuite : encore presque à l'assise
    expect(ys[0]).toBeLessThan(M6.hiddenTarget.seatY)
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThanOrEqual(ys[i - 1])
    expect(ys[14]).toBeCloseTo(0, 6)                       // au parquet au bout de 0,25 s
    expect(ys[29]).toBe(0)
  })

  it('en se levant, il passe devant l\'assise (standUp de la carte), au même rythme', () => {
    const npc = commanditaire()
    const [x0, z0] = M6.hiddenTarget.spawn, [dx, dz] = M6.hiddenTarget.standUp
    run(npc, 1)
    npc.flee(SHOT_FROM)
    run(npc, 0.15)
    expect(npc.mesh.position.z).toBeCloseTo(z0 + 0.6 * dz, 6)   // aux 3/5 du fondu, aux 3/5 du pas
    run(npc, 0.5)
    expect(npc.mesh.position.z).toBeCloseTo(z0 + dz, 6)       // puis il garde cette ligne : sa fuite est latérale
    expect(dx).toBe(0)
    expect(npc.mesh.position.x).toBeLessThan(x0)
  })

  it('debout, il court devant le canapé et derrière la table basse, sans traverser les meubles', () => {
    const npc = commanditaire()
    run(npc, 1)
    npc.flee(SHOT_FROM)
    run(npc, 0.25)   // levé
    const traverses = []
    for (let i = 0; i < 36; i++) {   // 0,6 s de course à 5,6 m/s : il dépasse le canapé et la table basse, vers la gauche
      npc.update(1 / 60)
      const { x, z } = npc.mesh.position
      for (const m of meublesTraverses(x, z)) traverses.push(`${x.toFixed(2)}, ${z.toFixed(2)} : ${m.userData.surface}`)
    }
    expect(traverses).toEqual([])
    expect(npc.mesh.position.x).toBeLessThan(-12)
  })

  it('même chose à 144 images par seconde : le lever suit le temps, pas les images', () => {
    const at = (fps, t) => {
      const npc = commanditaire()
      run(npc, 1, 1 / fps)
      npc.flee(SHOT_FROM)
      run(npc, t, 1 / fps)
      return npc.mesh.position
    }
    const p60 = at(60, 1 / 6), p144 = at(144, 1 / 6)
    expect(p144.y).toBeCloseTo(p60.y, 6)
    expect(p144.y).toBeCloseTo(M6.hiddenTarget.seatY / 3, 6)   // les deux tiers du fondu : un tiers de l'assise reste
    expect(p144.z).toBeCloseTo(p60.z, 6)
    expect(p144.x).toBeCloseTo(p60.x, 6)
  })

  it('les autres cibles gardent la fuite d\'avant : ni descente ni pas en avant (debout, déjà au sol)', () => {
    const npc = new NPC({ isTarget: true, color: 0xcc4422, x: 2, z: -20, groundY: 0.5, bounds: M6.spawnBounds,
      fleeSideways: true })
    run(npc, 0.5)
    const z = npc.mesh.position.z
    npc.flee(SHOT_FROM)
    run(npc, 0.5)
    expect(npc.mesh.position.y).toBe(0.5)
    expect(npc.mesh.position.z).toBe(z)
    expect(weight(npc, 'Run')).toBe(1)
  })
})

describe('câblage dans main.js : le commanditaire reçoit le pas de la carte', () => {
  it('mountLevel passe hiddenTarget.standUp au commanditaire, à lui seul', () => {
    const a = analyse(MAIN_SRC)
    const corps = a.source.slice(a.fns.get('mountLevel').start, a.fns.get('mountLevel').end)
    expect(corps).toMatch(/standUp:\s*useHidden\s*\?\s*hidden\.standUp\s*:\s*null/)
  })
})
