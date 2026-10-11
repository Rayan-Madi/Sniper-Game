import * as THREE from 'three'
import { ZONES } from './tuning.js'

// Zones touchées calées sur les os (spec du lot 2, §3.4). Module pur : three pour les maths, ni DOM ni scène.
//
// Une zone : { part: 'tete' | 'torse' | 'membre', a, b, r }, en coordonnées monde, recalculée sur la pose du moment.
// C'est une capsule de rayon r autour du segment [a, b] ; une sphère quand a et b sont confondus.
// - tête : sphère au milieu des os Head (base du crâne) et HeadTop_End (sommet), ZONES.tete, et sphère du bas du
//   visage (bouche, menton), ZONES.machoire : le crâne s'arrête vers l'os Head, alors que le visage descend plus bas
//   devant lui ;
// - torse : capsule des hanches (Hips) au haut du dos (Spine2), ZONES.torse ; son bout arrondi monte jusqu'à l'os
//   Neck, à la base du cou, sans mordre sur le menton comme le ferait une capsule qui finirait à Neck ;
// - cou : capsule de Neck jusqu'à 4 cm sous l'os Head, ZONES.cou, comptée torse : finie sur l'os Head, son bout arrondi
//   dépasserait de 6 cm dans la base du crâne ;
// - membres : bras (Arm → ForeArm → Hand), mains (Hand → HandMiddle1), jambes (UpLeg → Leg → Foot), pieds
//   (Foot → ToeBase), ZONES.bras, ZONES.jambe, ZONES.pied.

// Nom Mixamo nu d'un os : les modèles ont un préfixe variable (« mixamorig7:Hips », « mixamorig12:Hips »,
// « mixamorig:Hips »), dont GLTFLoader retire les deux-points (PropertyBinding.sanitizeNodeName) : « mixamorig7Hips ».
export function boneKey(name) {
  return (name || '').replace(/^mixamorig\d*:?/i, '')
}

// Os que les zones utilisent : tous présents dans chacun des sept modèles du jeu (tests/shot/glb-bones.test.js).
export const REQUIRED_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End',
  ...['Left', 'Right'].flatMap(s => ['Arm', 'ForeArm', 'Hand', 'HandMiddle1', 'UpLeg', 'Leg', 'Foot', 'ToeBase'].map(o => s + o))]

// Frontière de la tête et du cou, dans le repère de la tête (axe de sa base vers son sommet, visage vers le +Z de l'os
// Head, tourné vers l'avant sur les sept modèles), mesurée contre leur maillage, de face et de dos, debout et assis
// (tests/shot/glb-bones.test.js) :
// - bas du visage : centre de sa sphère au-dessus de la base de la tête, dans son axe, et vers le visage (m) ;
// - cou : il s'arrête à COU_SOUS_TETE sous la base de la tête, son bout arrondi n'en dépasse plus que de 2 cm.
const VISAGE = { haut: 0.03, avant: 0.04 }
const COU_SOUS_TETE = 0.04
const _q = new THREE.Quaternion()

// Sphère du bas du visage (comptée tête), posée depuis la base de la tête ; null si le visage est dans l'axe.
function basDuVisage(base, axe, face) {
  face = face.clone().addScaledVector(axe, -face.dot(axe))
  if (face.lengthSq() < 1e-8) return null
  const c = base.clone().addScaledVector(axe, VISAGE.haut).addScaledVector(face.normalize(), VISAGE.avant)
  return { part: 'tete', a: c, b: c.clone(), r: ZONES.machoire }
}

// Capsule du cou (comptée torse), de sa base à COU_SOUS_TETE sous la base de la tête ; une sphère sur sa base quand
// elle est plus haute que ce point (chez mafia_boss, Neck n'est qu'à 3 cm de Head).
function cou(neck, base, axe) {
  const haut = base.clone().addScaledVector(axe, -COU_SOUS_TETE)
  return { part: 'torse', a: neck.clone(), b: haut.clone().sub(neck).dot(axe) > 0 ? haut : neck.clone(), r: ZONES.cou }
}

// Os d'un modèle par nom nu, relevés une fois par instance (le clone d'un PNJ garde ses os jusqu'à sa libération).
const bonesCache = new WeakMap()
function bonesOf(model) {
  let bones = bonesCache.get(model)
  if (!bones) {
    bones = {}
    model.traverse(o => { if (o.isBone) { const k = boneKey(o.name); if (!bones[k]) bones[k] = o } })
    bonesCache.set(model, bones)
  }
  return bones
}

// Zones d'un modèle GLB animé, sur sa pose du moment : les matrices sont recalculées ici, la boucle du jeu ne le
// faisant qu'au rendu (le mixer a pu avancer depuis). Os manquants : les zones qui en dépendent sont omises ; sans
// hanches ni tête, aucune zone.
export function zonesFromSkeleton(model) {
  const bones = bonesOf(model)
  if (!bones.Hips || !bones.Head) return []
  model.updateWorldMatrix(true, true)
  const at = k => bones[k] ? bones[k].getWorldPosition(new THREE.Vector3()) : null
  const zones = []
  const capsule = (part, ka, kb, r) => {
    const a = at(ka), b = at(kb)
    if (a && b) zones.push({ part, a, b, r })
  }

  // Tête : sans HeadTop_End, le sommet est pris un rayon au-dessus de Head, dans le prolongement du cou
  const head = at('Head'), neck = at('Neck')
  let top = at('HeadTop_End')
  if (!top) top = head.clone().addScaledVector(neck ? head.clone().sub(neck).normalize() : new THREE.Vector3(0, 1, 0), 2 * ZONES.tete)
  const c = head.clone().lerp(top, 0.5)
  zones.push({ part: 'tete', a: c, b: c.clone(), r: ZONES.tete })
  const axe = top.clone().sub(head).normalize()
  const visage = basDuVisage(head, axe, new THREE.Vector3(0, 0, 1).applyQuaternion(bones.Head.getWorldQuaternion(_q)))
  if (visage) zones.push(visage)

  // Torse et cou
  capsule('torse', 'Hips', ['Spine2', 'Spine1', 'Spine', 'Neck'].find(k => bones[k]), ZONES.torse)
  if (neck) zones.push(cou(neck, head, axe))

  // Membres
  for (const s of ['Left', 'Right']) {
    capsule('membre', s + 'Arm', s + 'ForeArm', ZONES.bras)
    capsule('membre', s + 'ForeArm', s + 'Hand', ZONES.bras)
    capsule('membre', s + 'Hand', s + 'HandMiddle1', ZONES.bras)
    capsule('membre', s + 'UpLeg', s + 'Leg', ZONES.jambe)
    capsule('membre', s + 'Leg', s + 'Foot', ZONES.jambe)
    capsule('membre', s + 'Foot', s + 'ToeBase', ZONES.pied)
  }
  return zones
}

// Zones du modèle procédural (makePerson, src/npc.js : modèles absents), tirées de ses groupes articulés : pivot de
// la tête (userData.head, au cou), épaules (armL, armR) et mains (handL, handR, filles des coudes), hanches (legL,
// legR), genoux (premier groupe de chaque hanche). Mêmes zones et mêmes rayons que sur un squelette.
export function zonesFromProcedural(group) {
  const u = group.userData
  if (!u.head || !u.legL || !u.legR) return []
  group.updateWorldMatrix(true, true)
  const w = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z))
  const zones = []

  const headBase = w(u.head)
  const c = w(u.head, 0, 0.14, 0)   // centre de la sphère de la tête (makePerson)
  zones.push({ part: 'tete', a: c, b: c.clone(), r: ZONES.tete })
  // Repère de la tête : son pivot monte selon son +Y, le visage (nez, yeux) est vers son +Z
  const axe = w(u.head, 0, 1, 0).sub(headBase).normalize()
  const visage = basDuVisage(headBase, axe, w(u.head, 0, 0, 1).sub(headBase))
  if (visage) zones.push(visage)
  const hips = w(u.legL).lerp(w(u.legR), 0.5)
  const up = headBase.clone().sub(hips).normalize()
  const neck = headBase.clone().addScaledVector(up, -0.1)   // base du cou, comme l'os Neck
  zones.push({ part: 'torse', a: hips, b: neck.clone().addScaledVector(up, -ZONES.torse), r: ZONES.torse })
  zones.push(cou(neck, headBase, axe))

  for (const [arm, hand] of [[u.armL, u.handL], [u.armR, u.handR]]) {
    if (!arm || !hand) continue
    const elbow = w(hand.parent), wrist = w(hand)
    zones.push({ part: 'membre', a: w(arm), b: elbow, r: ZONES.bras })
    zones.push({ part: 'membre', a: elbow, b: wrist, r: ZONES.bras })
    zones.push({ part: 'membre', a: wrist, b: w(hand, 0, -0.06, 0), r: ZONES.bras })
  }
  for (const hip of [u.legL, u.legR]) {
    const knee = hip.children.find(o => o.isGroup)
    if (!knee) continue
    const k = w(knee), ankle = w(knee, 0, -0.4, 0)
    zones.push({ part: 'membre', a: w(hip), b: k, r: ZONES.jambe })
    zones.push({ part: 'membre', a: k, b: ankle, r: ZONES.jambe })
    zones.push({ part: 'membre', a: w(knee, 0, -0.42, -0.04), b: w(knee, 0, -0.42, 0.18), r: ZONES.pied })
  }
  return zones
}

// Distance le long du rayon (direction unitaire) jusqu'à l'entrée dans la capsule [a, b] de rayon r, ou -1. Origine
// dans la capsule : 0. D'après la méthode d'Inigo Quilez (corps cylindrique, puis bouts sphériques).
const _ba = new THREE.Vector3(), _oa = new THREE.Vector3(), _oc = new THREE.Vector3()
function sphereT(ro, rd, center, r) {
  _oc.subVectors(ro, center)
  const b = rd.dot(_oc), c = _oc.dot(_oc) - r * r
  if (c <= 0) return 0                      // origine dans la sphère
  const h = b * b - c
  if (h < 0) return -1
  const t = -b - Math.sqrt(h)
  return t >= 0 ? t : -1
}
function capsuleT(ro, rd, a, b, r) {
  _ba.subVectors(b, a)
  const baba = _ba.dot(_ba)
  if (baba < 1e-12) return sphereT(ro, rd, a, r)
  _oa.subVectors(ro, a)
  const bard = _ba.dot(rd), baoa = _ba.dot(_oa), rdoa = rd.dot(_oa), oaoa = _oa.dot(_oa)
  // Origine dans la capsule
  const s = Math.max(0, Math.min(1, baoa / baba))
  if (oaoa - 2 * s * baoa + s * s * baba <= r * r) return 0
  let best = -1
  const A = baba - bard * bard
  if (A > 1e-12) {
    const B = baba * rdoa - baoa * bard
    const C = baba * oaoa - baoa * baoa - r * r * baba
    const h = B * B - A * C
    if (h >= 0) {
      const t = (-B - Math.sqrt(h)) / A
      const y = baoa + t * bard
      if (t >= 0 && y > 0 && y < baba) best = t
    }
  }
  for (const end of [a, b]) {
    const t = sphereT(ro, rd, end, r)
    if (t >= 0 && (best < 0 || t < best)) best = t
  }
  return best
}

// Zone que le rayon (THREE.Ray, direction unitaire) touche en premier : { part, point, distance }, ou null.
export function rayVsZones(ray, zones) {
  let best = null
  for (const z of zones || []) {
    const t = capsuleT(ray.origin, ray.direction, z.a, z.b, z.r)
    if (t >= 0 && (!best || t < best.distance)) best = { part: z.part, distance: t }
  }
  if (!best) return null
  return { part: best.part, point: ray.at(best.distance, new THREE.Vector3()), distance: best.distance }
}

// Le PNJ vivant que la balle touche en premier sur son rayon : { npc, part, point, distance }, ou null. La boîte
// grossière du PNJ (getBounds), élargie de ZONES.prefiltre de chaque côté (bras tendus, genoux d'une pose assise),
// écarte d'abord ceux que le rayon ne frôle même pas ; les autres sont testés zone par zone (rayVsZones).
const _box = new THREE.Box3()
export function npcHit(ray, npcs) {
  let best = null
  for (const n of npcs) {
    if (!n.alive) continue
    const { center, size } = n.getBounds()
    if (!ray.intersectsBox(_box.setFromCenterAndSize(center, size).expandByScalar(ZONES.prefiltre))) continue
    const hit = rayVsZones(ray, n.hitZones())
    if (hit && (!best || hit.distance < best.distance)) best = { npc: n, ...hit }
  }
  return best
}
