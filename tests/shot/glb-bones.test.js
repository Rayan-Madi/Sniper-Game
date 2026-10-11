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
//    la tête, debout comme assise, est touchée sur l'os.
//
// Témoin : sans le préfixe numéroté (boneKey qui ne retire que « mixamorig »), cinq modèles sur sept n'ont plus aucun
// os requis (vu rouge) ; avec la sphère de 13 cm de rayon d'avant cette tâche, elle dépasse de plus d'un quart la
// distance typique de la peau sur trois modèles (gangster_man_01 et 02, mafia_woman_01 : vu rouge), et avec 13 cm de
// diamètre elle passe sous la peau des sept (vu rouge).

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
