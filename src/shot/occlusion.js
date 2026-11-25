import * as THREE from 'three'
import { OCCLUSION } from './tuning.js'
import { npcHit } from './hitzones.js'

// Ce que la balle touche en premier (spec du lot 2, §3.4 ; spec du lot 3, §2 c). Module pur : three pour les maths, ni
// DOM ni scène.
//
// Trois sortes d'obstacles sur un rayon : les PNJ (leurs zones, npcHit dans hitzones.js), le décor solide (maillages
// marqués userData.solid par src/maps/prims.js : la carte et les jeeps du convoi) et le cadenas du port (sa boîte, plus
// large que lui). resolveImpact garde le plus proche. Depuis la tâche A4 du lot 3, la balle vole sur une trajectoire
// (src/shot/balle.js) : impactSurSegment cherche le premier d'entre eux sur chaque segment, du début à la fin, et
// relève les vitres traversées avant lui (vitresTraversees).

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

// Normale de la face touchée, dans le monde, tournée vers le tireur (face arrière d'un objet à double face).
function faceNormal(h, ray) {
  const normal = h.face.normal.clone().applyNormalMatrix(_normalMatrix.getNormalMatrix(h.object.matrixWorld)).normalize()
  if (normal.dot(ray.direction) > 0) normal.negate()
  return normal
}

// Le décor solide que le rayon (THREE.Ray, direction unitaire) rencontre en premier : parmi `objets` (maillages et
// groupes, leurs enfants compris ; seuls comptent les maillages marqués userData.solid, le reste est traversé) et parmi
// `boites` ({ box: THREE.Box3, surface, … } : le cadenas du port, dont les autres champs passent au résultat).
// near : ce qui est plus près de l'origine ne compte pas ; par défaut OCCLUSION.departM, l'appui du poste (le rebord
// de la fenêtre de M6, sur la face arrière duquel est l'œil ; le muret de M2, qui l'entoure). far : rien au-delà (le
// bout d'un segment de la trajectoire) ; sans fin par défaut.
// → { point, normal (unitaire, monde, tournée vers le tireur), surface, distance, objet (le maillage touché), … } ou null.
// Les matrices des objets sont recalculées ici : les jeeps roulent, la boucle du jeu ne les met à jour qu'au rendu.
export function solidHit(ray, objets = [], boites = [], { near = OCCLUSION.departM, far = Infinity } = {}) {
  let best = null
  _raycaster.set(ray.origin, ray.direction)
  _raycaster.near = near
  _raycaster.far = far
  updateMatrices(objets)
  for (const h of _raycaster.intersectObjects(objets, true)) {
    if (!h.object.isMesh || !h.object.userData.solid) continue
    best = { point: h.point.clone(), normal: faceNormal(h, ray), surface: h.object.userData.surface, distance: h.distance, objet: h.object }
    break
  }
  for (const { box, ...marques } of boites) {
    const point = ray.intersectBox(box, new THREE.Vector3())
    if (!point) continue
    const distance = point.distanceTo(ray.origin)
    if (distance < near || distance > far || (best && best.distance <= distance)) continue
    best = { ...marques, point, normal: boxNormal(box, point), distance, objet: null }
  }
  return best
}

// Les vitres que le rayon traverse entre near et far, dans l'ordre : parmi `vitres` (maillages marqués
// userData.surface === 'verre', jamais solides : la baie de M6, la cabine de la grue de M3, sous-lots 3b et 3c), une
// traversée par vitre, à son point d'entrée. → [{ point, normale (tournée vers le tireur), surface, distance }]
export function vitresTraversees(ray, vitres = [], { near = 0, far = Infinity } = {}) {
  if (!vitres.length) return []
  _raycaster.set(ray.origin, ray.direction)
  _raycaster.near = near
  _raycaster.far = far
  updateMatrices(vitres)
  const vues = new Set(), out = []
  for (const h of _raycaster.intersectObjects(vitres, true)) {
    if (!h.object.isMesh || h.object.userData.solid || h.object.userData.surface !== 'verre' || vues.has(h.object)) continue
    vues.add(h.object)
    out.push({ point: h.point.clone(), normale: faceNormal(h, ray), surface: 'verre', distance: h.distance })
  }
  return out
}

// Ce que la balle rencontre sur un segment de sa trajectoire (spec du lot 3, §2 c), du début du segment à sa fin :
// ray part du début du segment (direction unitaire), longueur (m) ; depuisM, la distance de l'œil au début du segment
// (l'appui du poste, les OCCLUSION.departM premiers mètres devant l'œil, n'arrête pas la balle). Le premier sur le
// segment, du PNJ (npcs : leurs zones, npcHit, sur la pose du moment), du décor solide (objets) et du cadenas (boites)
// ; et les vitres traversées avant lui (vitres). → { impact, traversees } : impact, le résultat de resolveImpact
// ({ kind: 'npc' | 'decor', point, distance (depuis le début du segment), … }), null si rien sur le segment ;
// traversees, celles de vitresTraversees, avant l'impact ou sur tout le segment.
export function impactSurSegment({ ray, longueur, depuisM = 0, npcs = [], objets = [], boites = [], vitres = [] }) {
  const npc = npcHit(ray, npcs, { far: longueur })
  const decorHit = solidHit(ray, objets, boites, { near: Math.max(0, OCCLUSION.departM - depuisM), far: longueur })
  const r = resolveImpact({ ray, npcHits: npc ? [npc] : [], decorHit })
  const impact = r.kind === 'rien' ? null : r
  return { impact, traversees: vitresTraversees(ray, vitres, { far: impact ? impact.distance : longueur }) }
}

// Ce que la balle touche : le plus proche sur le rayon, des PNJ (npcHits : { npc, part, point, distance }, ceux que
// npcHit a trouvés) et du décor (decorHit : solidHit). → { kind: 'npc', npc, part, point, distance },
// { kind: 'decor', point, normal, surface, distance, objet, … } ou { kind: 'rien', point } : le point au loin, à
// OCCLUSION.loinM sur le rayon (impactSurSegment n'en garde rien : rien sur le segment ; la balle, elle, n'est perdue
// qu'au bout de son vol, src/shot/balle.js).
export function resolveImpact({ ray, npcHits = [], decorHit = null }) {
  let best = null
  for (const h of npcHits) if (h && (!best || h.distance < best.distance)) best = { kind: 'npc', ...h }
  if (decorHit && (!best || decorHit.distance < best.distance)) best = { kind: 'decor', ...decorHit }
  return best || { kind: 'rien', point: ray.at(OCCLUSION.loinM, new THREE.Vector3()) }
}
