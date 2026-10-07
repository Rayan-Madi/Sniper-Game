// Visée de la campagne : champ de vision de la lunette, cadrage de départ, tremblement.
// Module pur (ni DOM ni three) : main.js et scope.js l'appellent, les tests l'importent directement.

export const BASE_FOV = 60

// Champ de vision (degrés) de la caméra de jeu : zoomé lunette ouverte, normal lunette fermée.
export function fovFor(zoom, scoped) {
  return scoped ? BASE_FOV / zoom : BASE_FOV
}

// Angles de départ pour regarder de `from` vers `to` (tableaux [x, y, z], format des cartes).
// Euler(pitch, yaw, 0, 'YXZ') appliqué à (0, 0, -1) donne (-sin yaw · cos pitch, sin pitch, -cos yaw · cos pitch).
export function aimAngles(from, to) {
  let dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2]
  const len = Math.hypot(dx, dy, dz) || 1
  dx /= len; dy /= len; dz /= len
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.asin(Math.max(-1, Math.min(1, dy))) }
}

// Un pas du tremblement de la lunette (pixels écran). t = { x, y, vx, vy, phase } est muté ;
// p = { intensity, sway, breathRate } ; rand() dans [0, 1).
// Réglé pour 60 images par seconde (k = 1, physique d'origine) et ramené à dt pour toute autre fréquence :
// à-coups en bruit blanc (amplitude en racine de k), amortissements élevés à la puissance k.
export function stepTremble(t, p, dt, rand) {
  const k = dt * 60
  const kick = p.intensity * Math.sqrt(k)
  t.vx += (rand() - 0.5) * kick
  t.vy += (rand() - 0.5) * kick

  // Oscillation lente de respiration : dérive en huit
  t.phase += dt * p.breathRate
  t.vx += Math.cos(t.phase) * p.sway * dt
  t.vy += Math.sin(t.phase * 0.7) * p.sway * dt

  const damp = 0.91 ** k
  t.vx *= damp
  t.vy *= damp
  t.x += t.vx * dt
  t.y += t.vy * dt
  // Rappel doux vers le centre (moins fort = dérive plus ample)
  const recall = 0.97 ** k
  t.x *= recall
  t.y *= recall
}
