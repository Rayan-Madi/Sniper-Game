// Personnage synthétique au format d'un modèle GLB Mixamo tel que GLTFLoader le rend (tests du lot 1, tâche L3) :
// un nœud racine, des os nommés comme ceux des modèles (noms assainis par three : PropertyBinding retire les deux-points
// de « mixamorig:Hips »), deux maillages animés qui ont chacun leur squelette sur les mêmes os, des matériaux texturés
// (map, normalMap ; le corps marqué transparent mais opaque, comme celui de gangster_man_02) et des clips Idle, Walk et
// Death. Pour les tests de PNJ (libération) et de la sphère englobante (personnages écartés hors champ).
//
// armature : comme un export FBX vers glTF, os et maillages sous un nœud « Armature » à l'échelle 0,01, géométrie en
// centimètres. Les vrais modèles du jeu n'en ont pas, mais la sphère d'une instance doit rester juste dans ce cas.
import * as THREE from 'three'

const texture = () => new THREE.DataTexture(new Uint8Array(4), 1, 1)

function bone(name, x, y, z) {
  const b = new THREE.Bone()
  b.name = name
  b.position.set(x, y, z)
  return b
}

// Maillage animé : chaque sommet suit un seul os, choisi par pick(x, y, z) (coordonnées en mètres).
function skinnedPart(name, geometry, bones, pick, material, unit) {
  const pos = geometry.attributes.position
  const index = new Uint16Array(pos.count * 4), weight = new Float32Array(pos.count * 4)
  for (let i = 0; i < pos.count; i++) {
    index[i * 4] = bones.indexOf(pick(pos.getX(i) * unit, pos.getY(i) * unit, pos.getZ(i) * unit))
    weight[i * 4] = 1
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4))
  const mesh = new THREE.SkinnedMesh(geometry, material)
  mesh.name = name
  return mesh
}

const quat = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray()

export function fakeCharacter({ armature = false } = {}) {
  const unit = armature ? 0.01 : 1          // mètres par unité de la géométrie et des os
  const u = v => v / unit
  const root = new THREE.Group()
  root.name = 'RootNode'
  const holder = armature ? new THREE.Group() : root
  if (armature) { holder.name = 'Armature'; holder.scale.setScalar(unit); root.add(holder) }

  const hips = bone('mixamorigHips', 0, u(1.0), 0)
  const spine = bone('mixamorigSpine', 0, u(0.3), 0)
  const head = bone('mixamorigHead', 0, u(0.45), 0)
  const hand = bone('mixamorigRightHand', u(-0.32), u(0.3), 0)
  const legL = bone('mixamorigLeftUpLeg', u(0.1), u(-0.05), 0)
  const legR = bone('mixamorigRightUpLeg', u(-0.1), u(-0.05), 0)
  hips.add(spine, legL, legR); spine.add(head, hand)
  holder.add(hips)
  root.updateMatrixWorld(true)
  const bones = [hips, spine, head, hand, legL, legR]

  // Corps : 0,5 × 1,8 × 0,3 m, pieds à 0. Jambes sous 0,95 m, tête au-dessus de 1,45 m, buste entre les deux.
  const bodyPick = (x, y) => y < 0.95 ? (x > 0 ? legL : legR) : y > 1.45 ? head : spine
  const body = skinnedPart('Body', new THREE.BoxGeometry(u(0.5), u(1.8), u(0.3), 2, 9, 1).translate(0, u(0.9), 0), bones,
    bodyPick, new THREE.MeshStandardMaterial({ map: texture(), normalMap: texture(), transparent: true, opacity: 1 }), unit)
  // Veste : 0,56 × 0,6 × 0,36 m sur le buste, son propre matériau et son propre squelette (comme glTF : un skin par maillage).
  const shirt = skinnedPart('Shirt', new THREE.BoxGeometry(u(0.56), u(0.6), u(0.36)).translate(0, u(1.2), 0), bones,
    () => spine, new THREE.MeshStandardMaterial({ map: texture() }), unit)
  holder.add(body, shirt)
  root.updateMatrixWorld(true)
  body.bind(new THREE.Skeleton(bones))
  shirt.bind(new THREE.Skeleton(bones))

  const track = (b, prop, times, values) => (prop === 'quaternion'
    ? new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values)
    : new THREE.VectorKeyframeTrack(`${b.name}.position`, times, values))
  const animations = [
    new THREE.AnimationClip('Idle', 2, [
      track(spine, 'quaternion', [0, 1, 2], [...quat(0, 0, 0), ...quat(0.05, 0, 0), ...quat(0, 0, 0)]),
    ]),
    // Marche : jambes à ±0,6 rad, hanches qui montent et descendent de 3 cm.
    new THREE.AnimationClip('Walk', 1, [
      track(legL, 'quaternion', [0, 0.5, 1], [...quat(0.6, 0, 0), ...quat(-0.6, 0, 0), ...quat(0.6, 0, 0)]),
      track(legR, 'quaternion', [0, 0.5, 1], [...quat(-0.6, 0, 0), ...quat(0.6, 0, 0), ...quat(-0.6, 0, 0)]),
      track(hips, 'position', [0, 0.25, 0.5, 0.75, 1], [0, u(1.0), 0, 0, u(0.97), 0, 0, u(1.0), 0, 0, u(0.97), 0, 0, u(1.0), 0]),
    ]),
    // Mort : le corps bascule en arrière, recule et finit couché (comme les clips Death des modèles, qui déplacent les
    // hanches : le corps couché sort d'une sphère calée sur la marche).
    new THREE.AnimationClip('Death', 1.5, [
      track(hips, 'quaternion', [0, 1.5], [...quat(0, 0, 0), ...quat(-Math.PI / 2, 0, 0)]),
      track(hips, 'position', [0, 1.5], [0, u(1.0), 0, 0, u(0.15), u(-0.6)]),
    ]),
  ]
  return { scene: root, animations }
}

// Géométries, matériaux et textures d'un arbre (ce qu'un GLB du cache partage entre ses instances).
export function resourcesOf(root) {
  const out = new Set()
  root.traverse(o => {
    if (o.geometry) out.add(o.geometry)
    for (const m of o.material ? [].concat(o.material) : []) {
      out.add(m)
      for (const k in m) if (m[k] && m[k].isTexture) out.add(m[k])
    }
  })
  return [...out]
}

// Compte les 'dispose' émis par des ressources (celles des modèles chargés : il doit rester à 0).
export function countDisposals(resources) {
  const counter = { n: 0, labels: [] }
  for (const r of resources) r.addEventListener('dispose', () => { counter.n++; counter.labels.push(r.isTexture ? 'Texture' : r.type) })
  return counter
}
