import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import * as THREE from 'three'
import { fakeMixamo } from './fakeMixamo.js'

// Zones touchées calées sur les os (spec du lot 2, §3.4 et §4 ; plan, tâche T4). Ce que la balle touche sur un PNJ :
// avant le lot 2, une boîte de 0,8 × 2 × 0,8 m centrée à 1 m au-dessus des pieds (getBounds), qui ne suivait ni la
// pose ni l'animation, et la tête était « tout ce qui dépasse 1,45 m ». Désormais : une sphère sur la tête (entre les
// os Head et HeadTop_End), des capsules sur le torse, le cou, les bras et les jambes, recalculées sur la pose du
// moment ; la boîte, élargie de 0,3 m de chaque côté, ne sert plus que de préfiltre.
//
// Témoin : sur la logique d'avant le lot 2 (sortie telle quelle dans npcHit), un rayon qui passe à 25 cm devant le
// torse touchait, un bras comptait pour le torse, la tête d'une cible assise comptait pour le torse et, en plongée,
// l'épaule et la poitrine comptaient pour la tête (vus rouges).

vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})
// Préfixes des vrais modèles : « mixamorig: » (mafia_boss, mafia_henchman), « mixamorig12: » (gangster_man_02), etc.
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const { fakeMixamo } = await import('./fakeMixamo.js')
  const prefixes = { gangster_man_01: 'mixamorig7', gangster_man_02: 'mixamorig12', mafia_boss: 'mixamorig',
    mafia_henchman: 'mixamorig', mafia_woman_01: 'mixamorig4', mafia_woman_02: 'mixamorig8', mafia_woman_03: 'mixamorig2' }
  return {
    GLTFLoader: class {
      async loadAsync(url) {
        const key = Object.keys(prefixes).find(k => url.includes(k))
        return fakeMixamo({ prefix: prefixes[key] })
      }
    },
  }
})

// Modules neufs pour chaque groupe de tests : avec les modèles chargés, ou sans (repli procédural).
let NPC, hz
async function load({ models = true } = {}) {
  vi.resetModules()
  const { scene } = await import('../../src/scene.js')
  const characters = await import('../../src/characters.js')
  ;({ NPC } = await import('../../src/npc.js'))
  hz = await import('../../src/shot/hitzones.js')
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  if (models) await characters.preloadCharacters()
  log.mockRestore()
  scene.clear()
}
afterEach(() => vi.restoreAllMocks())

const BOUNDS = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }
// PNJ posé à (x, sol, z), taille d'ajustement sans variation (Math.random à 0,5 pendant sa création).
function pnj(extra = {}, at = [2, 0.2, -3]) {
  const r = vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const n = new NPC({ isTarget: true, color: 0xcc4422, x: at[0], z: at[2], groundY: at[1], bounds: BOUNDS, ...extra })
  r.mockRestore()
  return n
}
// Commanditaire de M6 : assis au téléphone (clip Talk, pose assise), joué jusqu'au bout du fondu.
function assis() {
  const n = pnj({ hideMarker: true, lockState: 'phone', onPhone: true, modelType: 'civilian' })
  n.update(0.5); n.update(0.5)
  return n
}

// Position d'un os du modèle dans le monde (nom Mixamo nu, quel que soit le préfixe).
function os(npc, bare) {
  let found = null
  npc.character.model.traverse(o => { if (o.isBone && o.name.replace(/^mixamorig\d*/, '') === bare) found = o })
  npc.mesh.updateMatrixWorld(true)
  return found.getWorldPosition(new THREE.Vector3())
}
const teteDe = npc => os(npc, 'Head').lerp(os(npc, 'HeadTop_End'), 0.5)
const milieu = (a, b) => a.clone().lerp(b, 0.5)
// Rayon vers un point : depuis 30 m devant (+Z) à la même hauteur, ou depuis `from`.
const deFace = p => new THREE.Ray(new THREE.Vector3(p.x, p.y, p.z + 30), new THREE.Vector3(0, 0, -1))
const depuis = (from, p) => new THREE.Ray(from.clone(), p.clone().sub(from).normalize())
// Poste en hauteur : 20 m au-dessus et 25 m devant le PNJ (tir en plongée, environ 38°).
const poste = npc => npc.mesh.position.clone().add(new THREE.Vector3(0, 20, 25))

describe('npcHit : ce que la balle touche sur un PNJ (modèle à squelette)', () => {
  beforeAll(() => load())

  it('rayon dans la tête : tête', () => {
    const n = pnj()
    expect(hz.npcHit(deFace(teteDe(n)), [n])).toMatchObject({ npc: n, part: 'tete' })
  })

  it('rayon dans la poitrine : torse', () => {
    const n = pnj()
    expect(hz.npcHit(deFace(os(n, 'Spine1')), [n])).toMatchObject({ npc: n, part: 'torse' })
  })

  it('rayon dans l\'avant-bras : membre', () => {
    const n = pnj()
    expect(hz.npcHit(deFace(milieu(os(n, 'LeftForeArm'), os(n, 'LeftHand'))), [n])).toMatchObject({ npc: n, part: 'membre' })
  })

  it('rayon dans la cuisse : membre', () => {
    const n = pnj()
    expect(hz.npcHit(deFace(milieu(os(n, 'RightUpLeg'), os(n, 'RightLeg'))), [n])).toMatchObject({ npc: n, part: 'membre' })
  })

  it('rayon qui frôle à 25 cm devant le torse : raté (l\'ancienne boîte le touchait)', () => {
    const n = pnj()
    const p = os(n, 'Spine1')
    const ray = new THREE.Ray(new THREE.Vector3(p.x + 30, p.y, p.z + 0.25), new THREE.Vector3(-1, 0, 0))
    const { center, size } = n.getBounds()
    expect(ray.intersectsBox(new THREE.Box3().setFromCenterAndSize(center, size)), 'la boîte d\'avant le lot 2 le touche').toBe(true)
    expect(hz.npcHit(ray, [n])).toBeNull()
  })

  it('point d\'impact sur la surface de la zone, distance depuis l\'origine du rayon', () => {
    const n = pnj()
    const c = teteDe(n)
    const hit = hz.npcHit(deFace(c), [n])
    expect(hit.point.z).toBeGreaterThan(c.z)
    expect(hit.point.z - c.z).toBeLessThan(0.2)
    expect(hit.distance).toBeCloseTo(30 - (hit.point.z - c.z), 6)
  })

  it('le PNJ le plus proche sur la ligne l\'emporte ; un PNJ abattu est ignoré', () => {
    const devant = pnj({}, [2, 0.2, -3]), derriere = pnj({}, [2, 0.2, -6])
    const ray = deFace(os(devant, 'Spine1'))
    expect(hz.npcHit(ray, [derriere, devant]).npc).toBe(devant)
    devant.alive = false
    expect(hz.npcHit(ray, [derriere, devant]).npc).toBe(derriere)
  })

  it('rien sur la ligne : null', () => {
    const n = pnj()
    expect(hz.npcHit(new THREE.Ray(new THREE.Vector3(0, 30, 0), new THREE.Vector3(0, 1, 0)), [n])).toBeNull()
  })
})

describe('npcHit : cible assise (M6) et tir en plongée', () => {
  beforeAll(() => load())

  it('cible assise : la tête est détectée sur l\'os, bien sous 1,45 m', () => {
    const n = assis()
    const c = teteDe(n)
    expect(c.y - n.mesh.position.y, 'tête de la pose assise').toBeLessThan(1.4)
    expect(hz.npcHit(deFace(c), [n])).toMatchObject({ npc: n, part: 'tete' })
  })

  it('cible assise : la poitrine compte pour le torse', () => {
    const n = assis()
    expect(hz.npcHit(deFace(os(n, 'Spine1')), [n])).toMatchObject({ part: 'torse' })
  })

  it('cible assise : le genou, hors de l\'ancienne boîte, est touché grâce au préfiltre élargi', () => {
    const n = assis()
    const k = os(n, 'LeftLeg')
    const ray = new THREE.Ray(new THREE.Vector3(k.x + 30, k.y, k.z + 0.04), new THREE.Vector3(-1, 0, 0))
    const { center, size } = n.getBounds()
    expect(ray.intersectsBox(new THREE.Box3().setFromCenterAndSize(center, size)), 'hors de la boîte d\'avant le lot 2').toBe(false)
    expect(hz.npcHit(ray, [n])).toMatchObject({ part: 'membre' })
  })

  it('en plongée, l\'épaule n\'est pas la tête', () => {
    const n = pnj()
    const hit = hz.npcHit(depuis(poste(n), os(n, 'LeftArm')), [n])
    expect(hit).not.toBeNull()
    expect(hit.part).not.toBe('tete')
  })

  it('en plongée, la poitrine compte pour le torse', () => {
    const n = pnj()
    expect(hz.npcHit(depuis(poste(n), os(n, 'Spine1')), [n])).toMatchObject({ part: 'torse' })
  })

  it('en plongée, la tête reste la tête', () => {
    const n = pnj()
    expect(hz.npcHit(depuis(poste(n), teteDe(n)), [n])).toMatchObject({ part: 'tete' })
  })

  it('cible assise vue en plongée : tête', () => {
    const n = assis()
    expect(hz.npcHit(depuis(poste(n), teteDe(n)), [n])).toMatchObject({ part: 'tete' })
  })
})

describe('npcHit : modèle procédural (modèles absents)', () => {
  beforeAll(() => load({ models: false }))
  const proc = () => { const n = pnj(); expect(n.character).toBeNull(); return n }
  const pivot = (n, k, local = [0, 0, 0]) => { n.mesh.updateMatrixWorld(true); return n.mesh.userData[k].localToWorld(new THREE.Vector3(...local)) }

  it('rayon dans la tête : tête', () => {
    const n = proc()
    expect(hz.npcHit(deFace(pivot(n, 'head', [0, 0.14, 0])), [n])).toMatchObject({ part: 'tete' })
  })

  it('rayon dans la poitrine : torse', () => {
    const n = proc()
    expect(hz.npcHit(deFace(n.mesh.localToWorld(new THREE.Vector3(0, 1.25, 0))), [n])).toMatchObject({ part: 'torse' })
  })

  it('rayon dans le bras : membre', () => {
    const n = proc()
    expect(hz.npcHit(deFace(pivot(n, 'handL')), [n])).toMatchObject({ part: 'membre' })
  })

  it('rayon à 25 cm devant le torse : raté', () => {
    const n = proc()
    const p = n.mesh.localToWorld(new THREE.Vector3(0, 1.25, 0.25))
    expect(hz.npcHit(new THREE.Ray(p.clone().setX(p.x + 30), new THREE.Vector3(-1, 0, 0)), [n])).toBeNull()
  })
})

describe('rayVsZones : rayon contre sphères et capsules', () => {
  beforeAll(() => load({ models: false }))

  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  const sphere = { part: 'tete', a: V(0, 0, 0), b: V(0, 0, 0), r: 1 }
  const capsule = { part: 'torse', a: V(0, -1, 0), b: V(0, 1, 0), r: 0.5 }

  it('sphère : entrée sur la surface', () => {
    const hit = hz.rayVsZones(new THREE.Ray(V(0, 0, 5), V(0, 0, -1)), [sphere])
    expect(hit.part).toBe('tete')
    expect(hit.distance).toBeCloseTo(4, 9)
    expect(hit.point.distanceTo(V(0, 0, 1))).toBeLessThan(1e-9)
  })

  it('capsule : le corps, puis les deux bouts arrondis', () => {
    expect(hz.rayVsZones(new THREE.Ray(V(5, 0, 0), V(-1, 0, 0)), [capsule]).distance).toBeCloseTo(4.5, 9)
    expect(hz.rayVsZones(new THREE.Ray(V(5, 1.3, 0), V(-1, 0, 0)), [capsule]).distance).toBeCloseTo(5 - 0.4, 9)
    expect(hz.rayVsZones(new THREE.Ray(V(5, -1.3, 0), V(-1, 0, 0)), [capsule]).distance).toBeCloseTo(5 - 0.4, 9)
    expect(hz.rayVsZones(new THREE.Ray(V(5, 1.51, 0), V(-1, 0, 0)), [capsule])).toBeNull()
    expect(hz.rayVsZones(new THREE.Ray(V(5, 0, 0.51), V(-1, 0, 0)), [capsule])).toBeNull()
  })

  it('rayon dans l\'axe de la capsule : le bout arrondi', () => {
    expect(hz.rayVsZones(new THREE.Ray(V(0.3, 5, 0), V(0, -1, 0)), [capsule]).distance).toBeCloseTo(5 - 1.4, 9)
  })

  it('zone derrière l\'origine du rayon : rien', () => {
    expect(hz.rayVsZones(new THREE.Ray(V(0, 0, 5), V(0, 0, 1)), [sphere, capsule])).toBeNull()
  })

  it('la zone la plus proche l\'emporte', () => {
    const loin = { part: 'membre', a: V(0, 0, -3), b: V(0, 0, -3), r: 1 }
    expect(hz.rayVsZones(new THREE.Ray(V(0, 0, 5), V(0, 0, -1)), [loin, sphere]).part).toBe('tete')
  })

  it('aucune zone : null', () => {
    expect(hz.rayVsZones(new THREE.Ray(V(0, 0, 5), V(0, 0, -1)), [])).toBeNull()
  })
})

describe('zonesFromSkeleton : zones d\'un squelette Mixamo', () => {
  beforeAll(() => load({ models: false }))

  function posed(prefix, clip = null, t = 0) {
    const { scene, animations } = fakeMixamo({ prefix })
    const holder = new THREE.Group()
    holder.position.set(4, 0.35, -2)
    holder.rotation.y = 0.7
    holder.add(scene)
    holder.updateMatrixWorld(true)
    if (clip) {
      const mixer = new THREE.AnimationMixer(scene)
      mixer.clipAction(animations.find(a => a.name === clip)).play()
      mixer.update(t)   // sans updateMatrixWorld : la boucle du jeu ne recalcule les matrices qu'au rendu
    }
    return { scene, holder }
  }
  const bone = (scene, bare) => { let b = null; scene.traverse(o => { if (o.isBone && o.name.endsWith(bare) && !b) b = o }); return b }
  const worldOf = (scene, bare) => { scene.updateMatrixWorld(true); return bone(scene, bare).getWorldPosition(new THREE.Vector3()) }

  it('une tête, un torse et un cou, des membres : bras, mains, jambes, pieds', () => {
    const z = hz.zonesFromSkeleton(posed('mixamorig7').scene)
    expect(z.filter(x => x.part === 'tete')).toHaveLength(1)
    expect(z.filter(x => x.part === 'torse')).toHaveLength(2)
    expect(z.filter(x => x.part === 'membre')).toHaveLength(12)
  })

  it('même résultat quel que soit le préfixe des os (mixamorig, mixamorig7, mixamorig12, deux-points)', () => {
    const ref = hz.zonesFromSkeleton(posed('mixamorig7').scene)
    for (const prefix of ['mixamorig', 'mixamorig12', 'mixamorig2']) {
      const z = hz.zonesFromSkeleton(posed(prefix).scene)
      expect(z.map(x => [x.part, x.r])).toEqual(ref.map(x => [x.part, x.r]))
      z.forEach((x, i) => { expect(x.a.distanceTo(ref[i].a)).toBeLessThan(1e-9); expect(x.b.distanceTo(ref[i].b)).toBeLessThan(1e-9) })
    }
    // nom brut, deux-points compris (os renommés autrement que par GLTFLoader)
    const { scene } = posed('mixamorig7')
    scene.traverse(o => { if (o.isBone) o.name = o.name.replace(/^mixamorig7/, 'mixamorig7:') })
    expect(hz.zonesFromSkeleton(scene)).toHaveLength(ref.length)
  })

  it('la sphère de la tête est entre les os Head et HeadTop_End', () => {
    const { scene } = posed('mixamorig7')
    const tete = hz.zonesFromSkeleton(scene).find(x => x.part === 'tete')
    const c = worldOf(scene, 'Head').lerp(worldOf(scene, 'HeadTop_End'), 0.5)
    expect(tete.a.distanceTo(c)).toBeLessThan(1e-9)
    expect(tete.b.distanceTo(c)).toBeLessThan(1e-9)
  })

  it('la sphère de la tête suit l\'os Head quand on anime le squelette (pose assise)', () => {
    const debout = hz.zonesFromSkeleton(posed('mixamorig7').scene).find(x => x.part === 'tete')
    const { scene } = posed('mixamorig7', 'Talk', 0.5)
    const tete = hz.zonesFromSkeleton(scene).find(x => x.part === 'tete')
    const c = worldOf(scene, 'Head').lerp(worldOf(scene, 'HeadTop_End'), 0.5)
    expect(tete.a.distanceTo(c)).toBeLessThan(1e-9)
    expect(debout.a.y - tete.a.y, 'la tête descend de 45 cm en s\'asseyant').toBeCloseTo(0.45, 2)
  })

  it('zones en coordonnées monde : elles suivent le groupe du PNJ, déplacé ou tourné depuis', () => {
    const { scene, holder } = posed('mixamorig7')
    const avant = hz.zonesFromSkeleton(scene).find(x => x.part === 'tete').a.clone()
    holder.position.x += 3
    expect(hz.zonesFromSkeleton(scene).find(x => x.part === 'tete').a.x - avant.x).toBeCloseTo(3, 9)
    holder.rotation.x = Math.PI / 2   // couché : la tête passe à l'horizontale du bassin
    const z = hz.zonesFromSkeleton(scene)
    const torse = z.find(x => x.part === 'torse')
    expect(Math.abs(z.find(x => x.part === 'tete').a.y - torse.a.y)).toBeLessThan(0.05)
  })

  it('squelette sans os reconnu : aucune zone', () => {
    const g = new THREE.Group(); const b = new THREE.Bone(); b.name = 'Bone001'; g.add(b)
    expect(hz.zonesFromSkeleton(g)).toEqual([])
  })
})

describe('accès aux zones depuis le PNJ (npc.js)', () => {
  it('hitZones : les zones du squelette du modèle', async () => {
    await load()
    const n = pnj()
    expect(n.hitZones()).toEqual(hz.zonesFromSkeleton(n.character.model))
  })

  it('hitZones : les zones du modèle procédural, faute de modèle', async () => {
    await load({ models: false })
    const n = pnj()
    expect(n.hitZones()).toEqual(hz.zonesFromProcedural(n.mesh))
    expect(n.hitZones().map(x => x.part).sort()).toEqual([...Array(12).fill('membre'), 'tete', 'torse', 'torse'])
  })
})
