import * as THREE from 'three'

// ─── Repère au sol du contre-tueur (PvP) ─────────────────────────────
// Le lacet yaw est celui de pvp.js : l'avant vaut (sin yaw, 0, cos yaw),
// donc yaw = π regarde vers -Z (départ du contre-tueur).

export function groundForward(yaw) {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
}

// Droite = avant × haut. À yaw = π (vue vers -Z), elle vaut +X.
export function groundRight(yaw) {
  return new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw))
}
