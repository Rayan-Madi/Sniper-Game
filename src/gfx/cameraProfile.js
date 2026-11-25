// Profil de caméra d'une mission (spec du lot 3, §2 b ; plan du lot 3a, tâche A3) : plans proche et lointain de la
// caméra, brume de la scène, position et cible du soleil, cadre de son ombre. Une mission le décrit dans ses données
// (champ profil, src/campaign/missions/) ; mountLevel (main.js) l'applique après avoir construit sa carte, qui ne pose
// plus de brume. Le soleil d'une mission se règle donc uniquement dans son profil : une carte qui le déplacerait
// elle-même serait écrasée sans bruit par le profil, posé après elle. Hors mission, tout revient au profil hors mission
// (resetCameraProfile) : le décor du menu au démarrage, à showMenu et à QUITTER du PvP (src/maps/menu.js), l'arène du
// PvP avec sa propre brume (src/pvpMap.js), et la fin de l'enquête (stopInvestigation, src/prologue/stop.js). Sans
// cela, le plan lointain de 1 700 m de M4, sa brume ou son soleil de midi déborderaient sur le menu, le PvP et les
// captures déterministes (spec, §5, risque 4).
// Fonctions pures sur les objets qu'on leur donne (la caméra, la scène et le soleil du jeu, src/scene.js, ou des
// doublures dans les tests) ; seul three est importé.
import * as THREE from 'three'

// Fige un objet et tout ce qu'il contient.
function figer(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') figer(v)
  return Object.freeze(o)
}

// Le profil hors mission : la caméra, le soleil et le cadre d'ombre que le jeu posait partout avant le lot 3
// (initScene), et la brume du menu (la rue figée de src/maps/menu.js). Figé : chaque remise à zéro le repose tel quel.
//   near, far     plans proche et lointain de la caméra (m)
//   brume         { type: 'lin', couleur, debut, fin } (m) ou { type: 'exp2', couleur, densite }
//   soleil        { pos, cible } : position du soleil et point qu'il vise ([x, y, z], m) ; la direction de la lumière
//                 et des ombres va de l'une à l'autre
//   cadreOmbre    demi-côté du cadre de l'ombre du soleil autour de sa cible (m)
export const PROFIL_HORS_MISSION = figer({
  near: 0.1, far: 200,
  brume: { type: 'lin', couleur: 0x87a0b0, debut: 50, fin: 140 },
  soleil: { pos: [20, 40, 10], cible: [0, 0, 0] },
  cadreOmbre: 60,
})

// La brume three d'un profil : une THREE.Fog (linéaire, de debut à fin) ou une THREE.FogExp2 (exponentielle, de
// densité densite), de la couleur du profil. Une autre sorte est une erreur, pas une brume au hasard.
function brumeDe(brume) {
  if (brume.type === 'lin') return new THREE.Fog(brume.couleur, brume.debut, brume.fin)
  if (brume.type === 'exp2') return new THREE.FogExp2(brume.couleur, brume.densite)
  throw new Error(`profil de caméra : brume « ${brume.type} » inconnue (lin ou exp2)`)
}

// Pose le profil : la caméra garde son champ et son format (la lunette et le menu les règlent), seuls ses plans
// changent, projection recalculée. La cible du soleil n'est pas ajoutée à la scène (le relevé des objets hors carte
// de __decor et du memtest ne bouge pas) : sa matrice est recalculée ici, rien ne le fait à chaque image. La projection
// de la caméra d'ombre aussi : three ne la recalcule qu'à la création de la carte d'ombre.
export function applyCameraProfile(camera, scene, sun, profil) {
  camera.near = profil.near
  camera.far = profil.far
  camera.updateProjectionMatrix()
  scene.fog = brumeDe(profil.brume)
  sun.position.set(...profil.soleil.pos)
  sun.target.position.set(...profil.soleil.cible)
  sun.target.updateMatrixWorld()
  const c = profil.cadreOmbre, ombre = sun.shadow.camera
  ombre.left = -c; ombre.right = c; ombre.top = c; ombre.bottom = -c
  ombre.updateProjectionMatrix()
}

// Remet le profil hors mission.
export function resetCameraProfile(camera, scene, sun) {
  applyCameraProfile(camera, scene, sun, PROFIL_HORS_MISSION)
}
