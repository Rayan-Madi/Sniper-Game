import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'

// Ce que la balle touche en premier (spec du lot 2, §3.4 et §4 ; plan, tâche T5) : les zones des PNJ (npcHit), le
// décor solide de la carte (maillages marqués userData.solid par maps.js, jeeps du convoi) et le cadenas du port ;
// resolveImpact garde le plus proche : { kind: 'npc' }, { kind: 'decor' } ou { kind: 'rien' } (point au loin).
// solidHit cherche le décor sur le rayon : ce qui n'est pas solide est traversé, et les OCCLUSION.departM premiers
// mètres devant l'œil ne comptent pas (le poste : le joueur est posé sur la face arrière du rebord de sa fenêtre en
// M6, dans le muret de son toit en M2).
//
// Témoin : avant le lot 2 (commit ac004b6), la balle allait au PNJ le plus proche quoi qu'il y ait devant, puis au
// cadenas, sinon au sol (plan y = groundY) ou 40 m devant ; aucun décor n'était cherché. Sans src/shot/occlusion.js,
// les tests tournent sur cette règle (resolutionAvant, aucun décor) et échouent sur elle (vus rouges).

vi.mock('../../src/scene.js', async () => {
  const THREE = await import('three')
  return { scene: new THREE.Scene(), setLighting: () => {} }
})

const OCC_JS = '../../src/shot/occlusion.js'   // chemin dans une variable : Vite refuserait le fichier si le module manque
const occ = await import(/* @vite-ignore */ OCC_JS).catch(() => null)
const tuning = await import('../../src/shot/tuning.js')
const LOIN = tuning.OCCLUSION?.loinM ?? 1000
const DEPART = tuning.OCCLUSION?.departM ?? 0.5

// La règle d'avant le lot 2, vue avec les entrées de resolveImpact : le PNJ le plus proche quoi qu'il y ait devant,
// sinon le cadenas (la seule « boîte » testée), sinon le sol de la carte ou 40 m devant.
function resolutionAvant({ ray, npcHits = [], decorHit = null, groundY = 0 }) {
  const npc = [...npcHits].filter(Boolean).sort((a, b) => a.distance - b.distance)[0]
  if (npc) return { kind: 'npc', ...npc }
  if (decorHit && decorHit.cadenas) return { kind: 'decor', ...decorHit }
  const point = new THREE.Vector3()
  if (!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY), point)) ray.at(40, point)
  return { kind: 'rien', point }
}
// Avant le lot 2 : seul le cadenas (sa boîte) était cherché, aucun maillage du décor.
function decorAvant(ray, objets, boites = []) {
  for (const b of boites) {
    const p = ray.intersectBox(b.box, new THREE.Vector3())
    if (p) return { ...b, box: undefined, point: p, distance: p.distanceTo(ray.origin), normal: new THREE.Vector3() }
  }
  return null
}
const resolveImpact = occ ? occ.resolveImpact : resolutionAvant
const solidHit = occ ? occ.solidHit : decorAvant

const v = (x, y, z) => new THREE.Vector3(x, y, z)
const rayon = (from, dir) => new THREE.Ray(from.clone(), dir.clone().normalize())
const vers = (from, to) => rayon(from, to.clone().sub(from))

// Un maillage de décor : boîte w × h × d centrée en (x, y, z), solide ou non, avec sa matière.
function boite(w, h, d, [x, y, z], { solid = true, surface = 'pierre', basic = false } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basic ? new THREE.MeshBasicMaterial() : new THREE.MeshLambertMaterial())
  m.position.set(x, y, z)
  if (solid) { m.userData.solid = true; m.userData.surface = surface }
  m.updateMatrixWorld(true)
  return m
}
// Impact d'un PNJ (forme de npcHit) à `distance` sur le rayon.
const pnjSur = (ray, distance, npc = { nom: 'pnj' }, part = 'torse') => ({ npc, part, point: ray.at(distance, new THREE.Vector3()), distance })

describe('resolveImpact : le premier sur le rayon l\'emporte', () => {
  const ray = rayon(v(0, 1.5, 30), v(0, 0, -1))

  it('PNJ derrière un mur : la balle s\'arrête sur le mur (décor)', () => {
    const mur = boite(4, 3, 0.3, [0, 1.5, 10])
    const decor = solidHit(ray, [mur])
    const r = resolveImpact({ ray, npcHits: [pnjSur(ray, 30)], decorHit: decor })
    expect(r.kind).toBe('decor')
    expect(r.point.z).toBeCloseTo(10.15, 6)
    expect(r.surface).toBe('pierre')
  })

  it('PNJ devant le mur : le PNJ, sa zone et son point', () => {
    const mur = boite(4, 3, 0.3, [0, 1.5, 10])
    const npc = { nom: 'devant' }
    const r = resolveImpact({ ray, npcHits: [pnjSur(ray, 12, npc, 'tete')], decorHit: solidHit(ray, [mur]) })
    expect(r).toMatchObject({ kind: 'npc', npc, part: 'tete' })
    expect(r.point.z).toBeCloseTo(18, 6)
  })

  it('plusieurs PNJ sur la ligne : le plus proche', () => {
    const a = { nom: 'a' }, b = { nom: 'b' }
    const r = resolveImpact({ ray, npcHits: [pnjSur(ray, 25, a), pnjSur(ray, 14, b)], decorHit: null })
    expect(r.npc).toBe(b)
  })

  it('rien sur la ligne : la balle part au loin, sur son rayon', () => {
    const r = resolveImpact({ ray, npcHits: [], decorHit: null })
    expect(r.kind).toBe('rien')
    expect(r.point.distanceTo(ray.origin)).toBeCloseTo(LOIN, 6)
    expect(ray.distanceToPoint(r.point)).toBeLessThan(1e-6)
  })

  // Relecture de T3 : le sillage finit au point d'impact ; un tir manqué vers le haut s'arrêtait en l'air à 40 m.
  it('tir vers le ciel : le point au loin n\'est plus à 40 m, il est au-delà des 430 m du lot 3', () => {
    const haut = rayon(v(0, 10, 28), v(0, 20, -38))
    const r = resolveImpact({ ray: haut, npcHits: [], decorHit: null, groundY: 0.345 })
    expect(r.kind).toBe('rien')
    expect(r.point.distanceTo(haut.origin)).toBeGreaterThan(430)
  })

  it('le cadenas (boîte du décor) derrière un PNJ : le PNJ ; devant : le cadenas', () => {
    const cadenas = { box: new THREE.Box3(v(-0.45, 1, 4.8), v(0.45, 2, 5.5)), surface: 'metal', cadenas: true }
    const lock = solidHit(ray, [], [cadenas])
    expect(lock).toMatchObject({ cadenas: true, surface: 'metal' })
    expect(resolveImpact({ ray, npcHits: [pnjSur(ray, 20)], decorHit: lock }).kind).toBe('npc')
    const r = resolveImpact({ ray, npcHits: [pnjSur(ray, 27)], decorHit: lock })
    expect(r).toMatchObject({ kind: 'decor', cadenas: true })
    expect(r.point.z).toBeCloseTo(5.5, 6)
  })
})

describe('solidHit : le décor solide sur le rayon', () => {
  const ray = rayon(v(0, 1.5, 30), v(0, 0, -1))

  it('mur : point sur sa face, normale tournée vers le tireur, matière, distance', () => {
    const hit = solidHit(ray, [boite(4, 3, 0.3, [0, 1.5, 10], { surface: 'metal' })])
    expect(hit).not.toBe(null)
    expect(hit.point.toArray().map(c => +c.toFixed(6))).toEqual([0, 1.5, 10.15])
    expect(hit.normal.toArray().map(c => +c.toFixed(6))).toEqual([0, 0, 1])
    expect(hit.surface).toBe('metal')
    expect(hit.distance).toBeCloseTo(19.85, 6)
  })

  it('ce qui n\'est pas solide est traversé : une vitre devant le mur', () => {
    const vitre = boite(4, 3, 0.02, [0, 1.5, 12], { solid: false, basic: true })
    const mur = boite(4, 3, 0.3, [0, 1.5, 10])
    const hit = solidHit(ray, [vitre, mur])
    expect(hit?.point.z).toBeCloseTo(10.15, 6)
  })

  it('le plus proche des solides, dans l\'ordre du rayon et non de la liste', () => {
    const loin = boite(4, 3, 0.3, [0, 1.5, 0], { surface: 'pierre' })
    const pres = boite(4, 3, 0.3, [0, 1.5, 20], { surface: 'bois' })
    expect(solidHit(ray, [loin, pres])?.surface).toBe('bois')
  })

  it('un sol (plan tourné) vu en plongée : normale vers le haut', () => {
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshLambertMaterial())
    sol.rotation.x = -Math.PI / 2; sol.position.y = 0.2
    sol.userData.solid = true; sol.userData.surface = 'sol'
    const hit = solidHit(vers(v(0, 14.5, 21), v(3, 0.2, -8)), [sol])
    expect(hit.surface).toBe('sol')
    expect(hit.point.y).toBeCloseTo(0.2, 6)
    expect(hit.normal.y).toBeCloseTo(1, 6)
  })

  it('un rocher aplati (échelle non uniforme, comme ceux de M5) : la normale reste perpendiculaire à sa face, tournée vers le tireur', () => {
    const rocher = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), new THREE.MeshLambertMaterial())
    rocher.scale.set(1, 0.4, 1); rocher.rotation.set(0.4, 1.1, 0.6)
    rocher.userData.solid = true; rocher.userData.surface = 'pierre'
    const from = v(6, 5, 0.3), to = v(0, 0, 0.3)
    const hit = solidHit(vers(from, to), [rocher])
    expect(hit).not.toBe(null)
    // La normale attendue : celle de la face touchée, recalculée depuis ses sommets dans le monde
    rocher.updateMatrixWorld(true)
    const raw = new THREE.Raycaster(from, to.clone().sub(from).normalize()).intersectObject(rocher)[0]
    const pos = rocher.geometry.attributes.position
    const [a, b, c] = [raw.face.a, raw.face.b, raw.face.c].map(i => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(rocher.matrixWorld))
    const attendue = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
    expect(Math.abs(hit.normal.dot(attendue))).toBeCloseTo(1, 6)
    expect(hit.normal.dot(to.clone().sub(from))).toBeLessThan(0)
  })

  it('un objet à double face touché par derrière : la normale est retournée vers le tireur', () => {
    const drap = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }))
    drap.position.z = 5   // face avant vers +Z
    drap.userData.solid = true; drap.userData.surface = 'metal'
    const hit = solidHit(rayon(v(0, 0, 0), v(0, 0, 1)), [drap])
    expect(hit?.normal.z).toBeCloseTo(-1, 6)
  })

  it('un groupe (jeep, voiture) : sa pièce solide, pas sa vitre ; la position du moment, même sans rendu depuis', () => {
    const jeep = new THREE.Group()
    const vitre = boite(0.05, 0.8, 1.9, [1.2, 1.6, 0], { solid: false })
    const caisse = boite(5, 0.7, 2.4, [0, 0.75, 0], { surface: 'metal' })
    jeep.add(vitre, caisse)
    jeep.updateMatrixWorld(true)
    jeep.position.set(10, 0.2, -4)   // la jeep a roulé, aucun rendu n'a recalculé ses matrices
    const hit = solidHit(rayon(v(10, 1, 20), v(0, 0, -1)), [jeep])
    expect(hit?.objet).toBe(caisse)
    expect(hit.point.z).toBeCloseTo(-2.8, 6)
  })

  // Relecture de T5 : solidHit recalculait la chaîne des parents de chaque maillage listé ; les pièces d'une voiture,
  // que solidMeshes() rend une à une, recalculaient ainsi leur groupe autant de fois qu'elles sont nombreuses, et la
  // scène une fois par maillage. Témoin : au commit bd5f820, le groupe de la voiture est recalculé 20 fois, la scène 22
  // (vu rouge).
  it('chaque objet recalculé une seule fois par tir : la voiture listée pièce par pièce, la jeep entière, un mur, sous une scène', () => {
    const scene = new THREE.Scene()
    const voiture = new THREE.Group()
    const pieces = Array.from({ length: 20 }, (_, i) => boite(0.2, 0.6, 2, [-2 + i * 0.2, 0.8, 0], { surface: 'metal' }))
    voiture.add(...pieces)
    const jeep = new THREE.Group()
    jeep.add(boite(5, 0.7, 2.4, [0, 0.75, 0], { surface: 'metal' }), boite(0.05, 0.8, 1.9, [1.2, 1.6, 0], { solid: false }))
    jeep.position.set(30, 0, 0)
    const mur = boite(4, 3, 0.3, [-30, 1.5, 0])
    scene.add(voiture, jeep, mur)
    scene.updateMatrixWorld(true)
    voiture.position.set(10, 0.2, -4)   // la voiture a bougé, aucun rendu n'a recalculé ses matrices

    const calculs = new Map()
    scene.traverse(o => {
      const updateMatrix = o.updateMatrix
      o.updateMatrix = function () { calculs.set(o, (calculs.get(o) || 0) + 1); return updateMatrix.call(this) }
    })
    const hit = solidHit(rayon(v(10, 1, 20), v(0, 0, -1)), [...pieces, jeep, mur])

    expect(calculs.get(voiture), 'le groupe de la voiture').toBe(1)
    expect(calculs.get(scene), 'la scène').toBe(1)
    expect(Math.max(...calculs.values()), 'aucun objet recalculé deux fois').toBe(1)
    expect(calculs.size, 'tous recalculés : scène, voiture et ses 20 pièces, jeep et ses 2 pièces, mur').toBe(26)
    // Les matrices sont à jour : la balle trouve la voiture là où elle est maintenant
    expect(pieces).toContain(hit?.objet)
    expect(hit.point.z).toBeCloseTo(-3, 6)
  })

  // En M6, l'œil est sur la face arrière du rebord (z = 5) : à l'arrondi près, le rayon part de dedans (rien) ou de la
  // face (touchée à 0 m). Ici le rebord est posé 1 cm devant l'œil : il est toujours touché, à 1 cm.
  it(`les ${DEPART} premiers mètres devant l'œil ne comptent pas : l'appui du poste (rebord de sa fenêtre, à 1 cm) n'arrête pas le tir`, () => {
    const rebord = boite(4, 3, 0.2, [0, 9, 4.89])   // face arrière en z = 4,99, 1 cm devant l'œil
    const mur = boite(30, 8, 0.3, [0, 4, -25])
    const ray6 = vers(v(0, 9, 5), v(0, 4, -24.85))
    expect(new THREE.Raycaster(ray6.origin, ray6.direction).intersectObject(rebord)[0]?.distance, 'le rebord est touché à 1 cm').toBeLessThan(0.011)
    const hit = solidHit(ray6, [rebord, mur])
    expect(hit?.objet).toBe(mur)
  })

  it('au-delà de ces premiers mètres, un obstacle arrête la balle', () => {
    const muret = boite(4, 1, 0.2, [0, 1, 30 - DEPART - 0.2])
    expect(solidHit(ray, [muret])?.objet).toBe(muret)
  })

  it('le cadenas : sa boîte, en métal, normale de la face touchée', () => {
    const cadenas = { box: new THREE.Box3(v(-0.45, 1, 4.8), v(0.45, 2, 5.5)), surface: 'metal', cadenas: true }
    const hit = solidHit(ray, [], [cadenas])
    expect(hit).toMatchObject({ cadenas: true, surface: 'metal' })
    expect(hit.point.z).toBeCloseTo(5.5, 6)
    expect(hit.normal.toArray().map(c => +c.toFixed(6))).toEqual([0, 0, 1])
    expect(hit.box).toBeUndefined()
    // Un mur devant le cadenas l'emporte
    expect(solidHit(ray, [boite(4, 3, 0.3, [0, 1.5, 8])], [cadenas]).cadenas).toBeFalsy()
  })

  it('rien de solide sur le rayon : null', () => {
    expect(solidHit(ray, [boite(4, 3, 0.3, [0, 10, 10])])).toBe(null)
  })
})

// Sur les vraies cartes (maps.js) et un vrai PNJ (repli procédural, npcHit) : le parcours du tir dans main.js.
describe('sur les cartes du jeu', () => {
  let maps, NPC, npcHit, withSeed
  beforeEach(async () => {
    vi.resetModules()
    maps = await import('../../src/maps.js')
    ;({ NPC } = await import('../../src/npc.js'))
    ;({ npcHit } = await import('../../src/shot/hitzones.js'))
    ;({ withSeed } = await import('../../src/gfx/memtest.js'))
  })
  const solides = () => (maps.solidMeshes ? maps.solidMeshes() : [])
  const BOUNDS = { minX: -20, maxX: 20, minZ: -30, maxZ: 30 }
  function cible(x, z, groundY) {
    const r = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const n = new NPC({ isTarget: true, color: 0xcc4422, x, z, groundY, bounds: BOUNDS })
    r.mockRestore()
    return n
  }
  // Le tir de main.js : PNJ (zones), décor de la carte, puis le premier.
  const tir = (ray, npcs, groundY) => resolveImpact({ ray, npcHits: [npcHit(ray, npcs)].filter(Boolean),
    decorHit: solidHit(ray, solides()), groundY })

  it('M3 port : une cible cachée derrière le conteneur rouge, visée du poste : la balle s\'arrête sur le conteneur (métal)', () => {
    const info = withSeed(1002, maps.MAP_BUILDERS[2])
    const n = cible(-16.5, -3, info.groundY)
    const torse = n.hitZones().find(z => z.part === 'torse')
    const visee = torse.a.clone().lerp(torse.b, 0.5)
    const ray = vers(v(...info.cameraPos), visee)
    expect(npcHit(ray, [n])?.npc, 'le rayon traverse bien la cible').toBe(n)
    const r = tir(ray, [n], info.groundY)
    expect(r.kind).toBe('decor')
    expect(r.surface).toBe('metal')
    expect(r.point.x).toBeCloseTo(-15.2, 2)   // flanc du conteneur
    n.dispose()
  })

  it('M3 port : la même cible à découvert : touchée', () => {
    const info = withSeed(1002, maps.MAP_BUILDERS[2])
    const n = cible(-8, -3, info.groundY)
    const torse = n.hitZones().find(z => z.part === 'torse')
    const r = tir(vers(v(...info.cameraPos), torse.a.clone().lerp(torse.b, 0.5)), [n], info.groundY)
    expect(r).toMatchObject({ kind: 'npc', npc: n, part: 'torse' })
    n.dispose()
  })

  it('M6 fête : du poste (posé sur le rebord de la fenêtre), la cible assise sur le canapé est touchée', () => {
    const info = withSeed(1005, maps.MAP_BUILDERS[5])
    const n = cible(-8, -21.7, info.hiddenTarget.seatY)
    const torse = n.hitZones().find(z => z.part === 'torse')
    const r = tir(vers(v(...info.cameraPos), torse.a.clone().lerp(torse.b, 0.5)), [n], info.groundY)
    expect(r).toMatchObject({ kind: 'npc', npc: n })
    n.dispose()
  })

  // Du poste de chaque carte vers un point de sa zone d'apparition : ni le poste (toit, muret, rebord, plateforme), ni
  // la peinture au sol n'arrêtent la balle, qui finit sur le sol, à sa hauteur (groundY).
  const POINTS = [[3, 4], [-7, -7], [3, -2], [3, -8], [2, -4], [2, -20]]
  POINTS.forEach(([x, z], i) => {
    it(`M${i + 1} : du poste vers (${x}, ${z}), la balle finit sur le sol de la carte`, () => {
      const info = withSeed(1000 + i, maps.MAP_BUILDERS[i])
      const r = tir(vers(v(...info.cameraPos), v(x, info.groundY, z)), [], info.groundY)
      expect(r.kind).toBe('decor')
      expect(r.surface).toBe('sol')
      expect(Math.abs(r.point.y - info.groundY)).toBeLessThanOrEqual(0.011)
      expect(Math.hypot(r.point.x - x, r.point.z - z)).toBeLessThan(0.05)
    })
  })
})
