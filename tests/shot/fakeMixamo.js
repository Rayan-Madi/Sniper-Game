// Personnage synthétique au squelette Mixamo complet (tests des zones touchées, spec du lot 2 §3.4 et §4) : les os que
// les sept modèles du jeu ont tous (Hips, Spine à Spine2, Neck, Head, HeadTop_End, épaules, bras, mains, jambes,
// pieds), placés comme ceux de gangster_man_01 au repos, rendus symétriques et tournés vers +Z. Les noms suivent le
// préfixe variable des modèles (« mixamorig7:Hips », « mixamorig12:Hips », « mixamorig:Hips ») et passent par
// PropertyBinding.sanitizeNodeName comme dans GLTFLoader, qui retire les deux-points : « mixamorig7Hips ».
//
// Un corps (boîte de 0,5 × 1,8 × 0,3 m, pieds à 0, lié aux hanches) donne la boîte dont spawnCharacter tire l'échelle.
// Clips : Idle (immobile), Talk et Sit (pose assise mesurée sur les modèles : hanches à 0,58 m, cuisses à
// l'horizontale, tibias à la verticale, tête vers 1,26 m), Walk (cuisses à ±0,5 rad).
import * as THREE from 'three'

// Position des os dans le monde, debout (m). Côté gauche du personnage : +X.
export const REST = {
  Hips: [0, 1.03, 0], Spine: [0, 1.13, 0], Spine1: [0, 1.25, 0], Spine2: [0, 1.38, 0],
  Neck: [0, 1.53, 0], Head: [0, 1.6, 0], HeadTop_End: [0, 1.82, 0],
  LeftShoulder: [0.07, 1.52, 0], LeftArm: [0.2, 1.45, 0], LeftForeArm: [0.24, 1.17, 0], LeftHand: [0.26, 0.96, 0],
  LeftHandMiddle1: [0.26, 0.85, 0],
  LeftUpLeg: [0.09, 0.97, 0], LeftLeg: [0.11, 0.53, 0], LeftFoot: [0.12, 0.1, 0], LeftToeBase: [0.12, 0.02, 0.15],
  LeftToe_End: [0.12, 0.02, 0.22],
}
for (const [k, [x, y, z]] of Object.entries(REST)) if (k.startsWith('Left')) REST['Right' + k.slice(4)] = [-x, y, z]

const PARENT = {
  Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck', HeadTop_End: 'Head',
  LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', LeftHandMiddle1: 'LeftHand',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot', LeftToe_End: 'LeftToeBase',
}
for (const [k, p] of Object.entries(PARENT)) if (k.startsWith('Left')) PARENT['Right' + k.slice(4)] = p.replace(/^Left/, 'Right')

const quat = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray()

// { scene, animations, bones } : bones, os par nom Mixamo nu (« Head »).
export function fakeMixamo({ prefix = 'mixamorig7' } = {}) {
  const name = bare => THREE.PropertyBinding.sanitizeNodeName(`${prefix}:${bare}`)
  const root = new THREE.Group()
  root.name = 'RootNode'
  const bones = {}
  for (const bare of Object.keys(REST)) { bones[bare] = new THREE.Bone(); bones[bare].name = name(bare) }
  for (const [bare, b] of Object.entries(bones)) {
    const p = PARENT[bare]
    const [x, y, z] = REST[bare]
    if (p) { const [px, py, pz] = REST[p]; b.position.set(x - px, y - py, z - pz); bones[p].add(b) }
    else { b.position.set(x, y, z); root.add(b) }
  }
  root.updateMatrixWorld(true)

  const list = Object.values(bones)
  const geo = new THREE.BoxGeometry(0.5, 1.8, 0.3).translate(0, 0.9, 0)
  const n = geo.attributes.position.count
  const hips = list.indexOf(bones.Hips)
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => i % 4 ? 0 : hips), 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => i % 4 ? 0 : 1), 4))
  const body = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial())
  body.name = 'Body'
  root.add(body)
  root.updateMatrixWorld(true)
  body.bind(new THREE.Skeleton(list))

  const q = (bare, ...vals) => new THREE.QuaternionKeyframeTrack(`${bones[bare].name}.quaternion`, [0, 1], [...vals, ...vals])
  const seated = (clip) => new THREE.AnimationClip(clip, 1, [
    new THREE.VectorKeyframeTrack(`${bones.Hips.name}.position`, [0, 1], [0, 0.58, 0, 0, 0.58, 0]),
    q('LeftUpLeg', ...quat(-Math.PI / 2, 0, 0)), q('RightUpLeg', ...quat(-Math.PI / 2, 0, 0)),
    q('LeftLeg', ...quat(Math.PI / 2, 0, 0)), q('RightLeg', ...quat(Math.PI / 2, 0, 0)),
  ])
  const animations = [
    new THREE.AnimationClip('Idle', 1, [q('Spine', ...quat(0, 0, 0))]),
    new THREE.AnimationClip('Walk', 1, [
      new THREE.QuaternionKeyframeTrack(`${bones.LeftUpLeg.name}.quaternion`, [0, 0.5, 1], [...quat(0.5, 0, 0), ...quat(-0.5, 0, 0), ...quat(0.5, 0, 0)]),
      new THREE.QuaternionKeyframeTrack(`${bones.RightUpLeg.name}.quaternion`, [0, 0.5, 1], [...quat(-0.5, 0, 0), ...quat(0.5, 0, 0), ...quat(-0.5, 0, 0)]),
    ]),
    seated('Talk'),
    seated('Sit'),
  ]
  return { scene: root, animations, bones }
}
