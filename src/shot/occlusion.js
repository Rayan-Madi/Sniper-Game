import * as THREE from 'three'
import { OCCLUSION } from './tuning.js'

// Ce que la balle touche en premier (spec du lot 2, §3.4). Module pur : three pour les maths, ni DOM ni scène.
//
// Trois sortes d'obstacles sur le rayon du tir : les PNJ (leurs zones, npcHit dans hitzones.js), le décor solide
// (maillages marqués userData.solid par maps.js : la carte et les jeeps du convoi) et le cadenas du port (sa boîte,
// plus large que lui). resolveImpact garde le plus proche ; s'il n'y a rien, la balle part au loin.

const _raycaster = new THREE.Raycaster()
const _normalMatrix = new THREE.Matrix3()

// Normale d'une face de boîte au point p (sur sa surface) : l'axe dont p touche une borne.
function boxNormal(box, p) {
  let best = Infinity
  const n = new THREE.Vector3()
  for (const [axis, i] of [['x', 0], ['y', 1], ['z', 2]]) {
    for (const [bound, sign] of [[box.min[axis], -1], [box.max[axis], 1]]) {
      const d = Math.abs(p[axis] - bound)
      if (d < best) { best = d; n.set(0, 0, 0).setComponent(i, sign) }
    }
  }
  return n
}

// Matrices du monde à jour pour `objets`, leurs enfants et leurs parents, chacun recalculé une seule fois : les pièces
// d'une voiture, que solidMeshes() rend une à une, ne recalculent pas leur groupe chacune (relecture de T5). Un objet
// dont un parent est dans la liste vient avec lui ; les parents des autres passent une fois, de la racine vers le bas.
function updateMatrices(objets) {
  const liste = new Set(objets)
  const faits = new Set()
  const parents = o => {
    const p = o.parent
    if (!p || faits.has(p)) return
    parents(p)
    p.updateWorldMatrix(false, false)
    faits.add(p)
  }
  for (const o of liste) {
    let couvert = false
    for (let p = o.parent; p && !couvert; p = p.parent) couvert = liste.has(p)
    if (couvert) continue
    parents(o)
    o.updateWorldMatrix(false, true)
  }
}

// Le décor solide que le rayon (THREE.Ray, direction unitaire) rencontre en premier : parmi `objets` (maillages et
// groupes, leurs enfants compris ; seuls comptent les maillages marqués userData.solid, le reste est traversé) et parmi
// `boites` ({ box: THREE.Box3, surface, … } : le cadenas du port, dont les autres champs passent au résultat).
// Ce qui est à moins de OCCLUSION.departM de l'origine ne compte pas : l'appui du poste (le rebord de la fenêtre de M6,
// sur la face arrière duquel est l'œil ; le muret de M2, qui l'entoure).
// → { point, normal (unitaire, monde, tournée vers le tireur), surface, distance, objet (le maillage touché), … } ou null.
// Les matrices des objets sont recalculées ici : les jeeps roulent, la boucle du jeu ne les met à jour qu'au rendu.
export function solidHit(ray, objets = [], boites = []) {
  let best = null
  _raycaster.set(ray.origin, ray.direction)
  _raycaster.near = OCCLUSION.departM
  _raycaster.far = Infinity
  updateMatrices(objets)
  for (const h of _raycaster.intersectObjects(objets, true)) {
    if (!h.object.isMesh || !h.object.userData.solid) continue
    const normal = h.face.normal.clone().applyNormalMatrix(_normalMatrix.getNormalMatrix(h.object.matrixWorld)).normalize()
    if (normal.dot(ray.direction) > 0) normal.negate()   // face arrière d'un objet à double face
    best = { point: h.point.clone(), normal, surface: h.object.userData.surface, distance: h.distance, objet: h.object }
    break
  }
  for (const { box, ...marques } of boites) {
    const point = ray.intersectBox(box, new THREE.Vector3())
    if (!point) continue
    const distance = point.distanceTo(ray.origin)
    if (distance < OCCLUSION.departM || (best && best.distance <= distance)) continue
    best = { ...marques, point, normal: boxNormal(box, point), distance, objet: null }
  }
  return best
}

// Ce que la balle touche : le plus proche sur le rayon, des PNJ (npcHits : { npc, part, point, distance }, ceux que
// npcHit a trouvés) et du décor (decorHit : solidHit). → { kind: 'npc', npc, part, point, distance },
// { kind: 'decor', point, normal, surface, distance, objet, … } ou { kind: 'rien', point } : le point au loin, à
// OCCLUSION.loinM sur le rayon (la balle file vers l'horizon ; le sillage y va).
export function resolveImpact({ ray, npcHits = [], decorHit = null }) {
  let best = null
  for (const h of npcHits) if (h && (!best || h.distance < best.distance)) best = { kind: 'npc', ...h }
  if (decorHit && (!best || decorHit.distance < best.distance)) best = { kind: 'decor', ...decorHit }
  return best || { kind: 'rien', point: ray.at(OCCLUSION.loinM, new THREE.Vector3()) }
}
