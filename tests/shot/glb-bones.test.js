// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { REQUIRED_BONES, boneKey, zonesFromSkeleton, rayVsZones } from '../../src/shot/hitzones.js'
import { ZONES } from '../../src/shot/tuning.js'

// Zones touchées sur les vrais modèles (spec du lot 2, §4 et §6 ; plan, tâche T4). Les sept GLB du dépôt sont tous
// des personnages Mixamo, mais à préfixe variable (« mixamorig: », « mixamorig7: », « mixamorig12: »…) :
// 1. les os dont les zones ont besoin existent dans chacun, lus dans l'en-tête JSON, sous le nom que GLTFLoader leur
//    donne (deux-points retirés) ;
// 2. les rayons de ZONES (src/shot/tuning.js) collent aux maillages : chaque modèle chargé, ajusté à sa taille de jeu
//    comme dans characters.js, posé debout (Idle) et assis (Talk, le commanditaire de M6), chaque sommet rattaché à
//    l'os qui le porte le plus : la distance typique (médiane) de la peau à la zone de sa partie reste proche du rayon ;
// 3. un rayon qui passe à 25 cm devant la poitrine ne touche aucune zone, alors que l'ancienne boîte le touchait ;
//    la tête, debout comme assise, est touchée sur l'os ;
// 4. la tête compte pour la tête jusqu'à sa frontière avec le cou, de face (bouche et menton) comme de dos (base du
//    crâne) : des rayons horizontaux sur l'axe du visage, comparés au maillage lui-même (le premier triangle touché,
//    rattaché à l'os qui le porte le plus), ne comptent jamais pour le corps tant qu'ils touchent la tête, hors d'une
//    bande de tolérance au bas de la tête (les 2 derniers cm du menton, les 3 derniers cm de la base du crâne) ; la
//    gorge, plus de 3,5 cm sous le menton, ne compte pas pour la tête.
//
// Témoin : sans le préfixe numéroté (boneKey qui ne retire que « mixamorig »), cinq modèles sur sept n'ont plus aucun
// os requis (vu rouge) ; avec la sphère de 13 cm de rayon d'avant cette tâche, elle dépasse de plus d'un quart la
// distance typique de la peau sur trois modèles (gangster_man_01 et 02, mafia_woman_01 : vu rouge), et avec 13 cm de
// diamètre elle passe sous la peau des sept (vu rouge). Point 4, vu rouge sur les zones d'avant la relecture de T4
// (sphère du crâne seule, cou fini sur l'os Head) : la bouche comptait pour le torse sur les quatorze poses, la base du
// crâne sur onze ; vu rouge aussi avec un torse qui monterait jusqu'à Neck (le visage compte pour le torse sur douze
// poses, mafia_boss compris), avec un cou fini sur l'os Head (la base du crâne, sur onze) et avec une sphère du bas
// du visage de 10 cm (la gorge compte pour la tête sur huit).

const DIR = resolve(__dirname, '../../public/models')
const FILES = readdirSync(DIR).filter(f => f.endsWith('.glb')).sort()
// Taille de jeu (characters.js, MODELS) : cibles et gardes 1,85 m, civils 1,8 m.
const FIT = { 'gangster_man_01.glb': 1.85, 'mafia_boss.glb': 1.85, 'mafia_woman_01.glb': 1.85, 'mafia_henchman.glb': 1.85,
  'gangster_man_02.glb': 1.8, 'mafia_woman_02.glb': 1.8, 'mafia_woman_03.glb': 1.8 }

function header(file) {
  const buf = readFileSync(resolve(DIR, file))
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'))
}

describe('os des sept modèles du dépôt (en-tête JSON)', () => {
  it('sept modèles', () => {
    expect(FILES).toEqual(Object.keys(FIT).sort())
  })

  for (const file of FILES) {
    it(`${file} : tous les os des zones existent`, () => {
      const json = header(file)
      const names = new Set((json.skins || []).flatMap(s => s.joints.map(j => boneKey(THREE.PropertyBinding.sanitizeNodeName(json.nodes[j].name)))))
      expect(REQUIRED_BONES.filter(b => !names.has(b))).toEqual([])
    })
  }
})

// ── Modèles chargés (GLTFLoader sous Node : les textures échouent sans bruit, la géométrie et les os suffisent ;
// GLTFLoader lit URL sur `self`, que Node n'a pas) ──
async function loadModel(file) {
  const buf = readFileSync(resolve(DIR, file))
  const gltf = await new Promise((ok, ko) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, ko))
  // Ajusté comme spawnCharacter : hauteur de jeu, pieds au sol
  const model = gltf.scene
  model.updateMatrixWorld(true)
  model.scale.multiplyScalar(FIT[file] / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y)
  model.updateMatrixWorld(true)
  model.position.y -= new THREE.Box3().setFromObject(model).min.y
  model.updateMatrixWorld(true)
  return { model, animations: gltf.animations, mixer: new THREE.AnimationMixer(model) }
}

function pose(m, clip) {
  m.mixer.stopAllAction()
  m.mixer.clipAction(m.animations.find(a => a.name === clip)).reset().play()
  m.mixer.setTime(0.3)
  m.model.updateMatrixWorld(true)
}

const bones = model => { const b = {}; model.traverse(o => { if (o.isBone) b[boneKey(o.name)] = o }); return b }
const at = (b, k) => b[k].getWorldPosition(new THREE.Vector3())
const segDist = (p, a, b) => new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p)
const median = xs => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

// Partie de chaque sommet (os qui le porte le plus) et distance à la zone de cette partie.
function skinDistances(model, zones) {
  const head = zones.find(z => z.part === 'tete'), torso = zones.filter(z => z.part === 'torse')[0]
  const b = bones(model)
  const arms = ['Left', 'Right'].flatMap(s => [[at(b, s + 'Arm'), at(b, s + 'ForeArm')], [at(b, s + 'ForeArm'), at(b, s + 'Hand')]])
  const legs = ['Left', 'Right'].flatMap(s => [[at(b, s + 'UpLeg'), at(b, s + 'Leg')], [at(b, s + 'Leg'), at(b, s + 'Foot')]])
  const d = { tete: [], torse: [], bras: [], jambe: [] }
  const v = new THREE.Vector3()
  model.traverse(m => {
    if (!m.isSkinnedMesh) return
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, pos = m.geometry.attributes.position
    for (let i = 0; i < pos.count; i += 3) {
      let j = 0
      for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, j)) j = k
      const bone = boneKey(m.skeleton.bones[si.getComponent(i, j)].name)
      m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld)
      if (bone === 'Head' || bone === 'HeadTop_End') d.tete.push(v.distanceTo(head.a))
      else if (/^(Hips|Spine\d?)$/.test(bone)) d.torse.push(segDist(v, torso.a, torso.b))
      else if (/(Arm|ForeArm)$/.test(bone)) d.bras.push(Math.min(...arms.map(([p, q]) => segDist(v, p, q))))
      else if (/(UpLeg|Leg)$/.test(bone)) d.jambe.push(Math.min(...legs.map(([p, q]) => segDist(v, p, q))))
    }
  })
  return Object.fromEntries(Object.entries(d).map(([k, xs]) => [k, median(xs)]))
}

// ── Le maillage comme vérité : triangles en coordonnées monde sur la pose du moment (skinning recalculé sur le
// processeur), chacun rattaché à l'os qui le porte le plus (poids sommés sur ses trois sommets) ──
const partieDeLOs = os => /^(Head|HeadTop_End)$/.test(os) ? 'tete' : /^(Hips|Spine\d?|Neck|\w+Shoulder)$/.test(os) ? 'torse' : 'membre'
function trianglesAutourDe(model, centre, rayon) {
  const tris = []
  const v = new THREE.Vector3()
  model.traverse(m => {
    if (!m.isSkinnedMesh) return
    const g = m.geometry, idx = g.index, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight
    const monde = []
    for (let i = 0; i < pos.count; i++) { m.getVertexPosition(i, v); monde.push(v.clone().applyMatrix4(m.matrixWorld)) }
    const n = idx ? idx.count : pos.count
    for (let t = 0; t < n; t += 3) {
      const ii = [t, t + 1, t + 2].map(k => idx ? idx.getX(k) : k)
      const P = ii.map(i => monde[i])
      if (P.every(p => p.distanceTo(centre) > rayon)) continue
      const poids = {}
      for (const i of ii) for (let k = 0; k < 4; k++) {
        const os = boneKey(m.skeleton.bones[si.getComponent(i, k)].name)
        poids[os] = (poids[os] || 0) + sw.getComponent(i, k)
      }
      tris.push({ P, part: partieDeLOs(Object.entries(poids).sort((a, b) => b[1] - a[1])[0][0]) })
    }
  })
  return tris
}
// Partie du premier triangle que le rayon traverse (Möller-Trumbore, deux faces), ou null.
function premierTriangle(ray, tris) {
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3(), s = new THREE.Vector3()
  let best = null, bt = Infinity
  for (const tr of tris) {
    const [A, B, C] = tr.P
    e1.subVectors(B, A); e2.subVectors(C, A); p.crossVectors(ray.direction, e2)
    const det = e1.dot(p)
    if (Math.abs(det) < 1e-12) continue
    s.subVectors(ray.origin, A)
    const u = s.dot(p) / det
    if (u < 0 || u > 1) continue
    q.crossVectors(s, e1)
    const w = ray.direction.dot(q) / det
    if (w < 0 || u + w > 1) continue
    const t = e2.dot(q) / det
    if (t > 0 && t < bt) { bt = t; best = tr }
  }
  return best ? best.part : null
}
// Rayons horizontaux sur l'axe du visage (la verticale de l'os Head), de 12 cm sous l'os à 30 cm au-dessus, tous les
// 5 mm, de face ou de dos : le visage regarde vers le +Z de l'os Head (tourné vers l'avant sur les sept modèles).
// Pour chacun, ce que touche le maillage et la zone comptée, à la hauteur `h` (mm) au-dessus du plus bas des rayons
// qui touchent la tête (dessous du menton de face, base du crâne de dos) : `tete`, ceux qui touchent la tête ;
// `corps`, ceux qui touchent le cou ou le torse.
function axeDuVisage(model, sens) {
  const b = bones(model)
  const head = at(b, 'Head')
  const visage = new THREE.Vector3(0, 0, 1).applyQuaternion(b.Head.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize()
  const dir = sens === 'face' ? visage.clone().negate() : visage
  const tris = trianglesAutourDe(model, head, 0.45)
  const zones = zonesFromSkeleton(model)
  const rayons = []
  for (let mm = -120; mm <= 300; mm += 5) {
    const ray = new THREE.Ray(head.clone().setY(head.y + mm / 1000).addScaledVector(dir, -1), dir)
    rayons.push({ mm, maillage: premierTriangle(ray, tris), zone: rayVsZones(ray, zones)?.part ?? null })
  }
  const bas = Math.min(...rayons.filter(r => r.maillage === 'tete').map(r => r.mm))
  rayons.forEach(r => { r.h = r.mm - bas })
  return { tete: rayons.filter(r => r.maillage === 'tete'), corps: rayons.filter(r => r.maillage === 'torse') }
}

// Médiane de la distance peau-zone, en fraction du rayon : bornes tenues par les sept modèles, debout et assis.
const BORNES = { tete: [ZONES.tete, 0.8, 1.3], torse: [ZONES.torse, 0.75, 1.35], bras: [ZONES.bras, 0.55, 1.35], jambe: [ZONES.jambe, 0.7, 1.3] }

describe('les zones collent aux maillages des sept modèles', () => {
  const models = {}
  beforeAll(async () => {
    vi.stubGlobal('self', globalThis)
    const quiet = [vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {})]
    for (const f of FILES) models[f] = await loadModel(f)
    quiet.forEach(s => s.mockRestore())
    vi.unstubAllGlobals()
  }, 60000)

  for (const file of FILES) {
    for (const clip of ['Idle', 'Talk']) {
      it(`${file}, ${clip === 'Idle' ? 'debout' : 'assis'} : rayons proches de la distance typique de la peau à l'os`, () => {
        const m = models[file]
        pose(m, clip)
        const med = skinDistances(m.model, zonesFromSkeleton(m.model))
        for (const [part, [r, lo, hi]] of Object.entries(BORNES)) {
          expect(med[part] / r, `${part} : médiane ${med[part].toFixed(3)} m pour un rayon de ${r} m`).toBeGreaterThanOrEqual(lo)
          expect(med[part] / r, `${part} : médiane ${med[part].toFixed(3)} m pour un rayon de ${r} m`).toBeLessThanOrEqual(hi)
        }
      })

      it(`${file}, ${clip === 'Idle' ? 'debout' : 'assis'} : la tête est touchée sur l'os`, () => {
        const m = models[file]
        pose(m, clip)
        const zones = zonesFromSkeleton(m.model)
        const c = zones.find(z => z.part === 'tete').a
        const hit = rayVsZones(new THREE.Ray(c.clone().add(new THREE.Vector3(0, 0, 30)), new THREE.Vector3(0, 0, -1)), zones)
        expect(hit?.part).toBe('tete')
        if (clip === 'Talk') expect(c.y, 'tête de la pose assise').toBeLessThan(1.4)
      })

      it(`${file}, ${clip === 'Idle' ? 'debout' : 'assis'} : de face, le visage compte pour la tête, bouche comprise, la gorge non`, () => {
        const m = models[file]
        pose(m, clip)
        const { tete, corps } = axeDuVisage(m.model, 'face')
        expect(tete.length, 'rayons qui touchent la tête').toBeGreaterThan(40)
        // à hauteur de bouche (4 cm au-dessus du dessous du menton) : la tête
        expect(tete.find(r => r.h === 40)?.zone, 'à hauteur de bouche').toBe('tete')
        // nulle part au-dessus des 2 derniers centimètres du menton, un tir au visage ne compte pour le corps
        expect(tete.filter(r => r.h >= 20 && r.zone !== 'tete' && r.zone !== null).map(r => `${r.h / 10} cm : ${r.zone}`)).toEqual([])
        // et la gorge, plus de 3,5 cm sous le menton, ne compte pas pour la tête (chez mafia_boss, un col porté par
        // l'os Spine2 monte jusque sous le menton : la balle qui le traverse dans ses 3 premiers cm trouve la mâchoire)
        expect(corps.filter(r => r.h <= -35 && r.zone === 'tete').map(r => `${r.h / 10} cm`)).toEqual([])
      })

      it(`${file}, ${clip === 'Idle' ? 'debout' : 'assis'} : de dos, la base du crâne compte pour la tête`, () => {
        const m = models[file]
        pose(m, clip)
        const { tete } = axeDuVisage(m.model, 'dos')
        // mafia_boss : son col cache la nuque, une quinzaine de rayons seulement touchent la tête de dos
        expect(tete.length, 'rayons qui touchent la tête').toBeGreaterThan(10)
        expect(tete.filter(r => r.h >= 30 && r.zone !== 'tete' && r.zone !== null).map(r => `${r.h / 10} cm : ${r.zone}`)).toEqual([])
      })
    }

    it(`${file}, debout : un rayon à 25 cm devant la poitrine ne touche rien (l'ancienne boîte, si)`, () => {
      const m = models[file]
      pose(m, 'Idle')
      const b = bones(m.model)
      const left = at(b, 'LeftUpLeg').sub(at(b, 'RightUpLeg')).setY(0).normalize()
      const fwd = left.clone().cross(new THREE.Vector3(0, 1, 0))
      const chest = at(b, 'Spine1')
      const ray = new THREE.Ray(chest.clone().addScaledVector(fwd, 0.25).addScaledVector(left, 30), left.clone().negate())
      const oldBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.8, 2, 0.8))
      expect(ray.intersectsBox(oldBox)).toBe(true)
      expect(rayVsZones(ray, zonesFromSkeleton(m.model))).toBeNull()
    })
  }
})
