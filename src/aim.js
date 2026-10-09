// Visée de la campagne : champ de vision de la lunette, cadrage de départ, conversion entre angle et pixels,
// tremblement et stress.
// Module pur (ni DOM ni three) : main.js et scope.js l'appellent, les tests l'importent directement.
import { TREMBLEMENT, STRESS, APNEE } from './shot/tuning.js'

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

// ─── Angle et pixels écran ─────────────────────────────────────────
// Caméra perspective de champ vertical fovDeg sur un écran de screenHeight pixels (pixels carrés : la même échelle en x
// et en y, quelle que soit la largeur). Une direction écartée de `mrad` milliradians de l'axe, sur un axe de l'écran,
// tombe à mradToPixels(…) pixels du centre ; pixelsToMrad en est l'inverse exact.
export function mradToPixels(mrad, fovDeg, screenHeight) {
  return (screenHeight / 2) * Math.tan(mrad / 1000) / Math.tan(fovDeg * Math.PI / 360)
}

export function pixelsToMrad(px, fovDeg, screenHeight) {
  return 1000 * Math.atan(px / (screenHeight / 2) * Math.tan(fovDeg * Math.PI / 360))
}

// ─── Tremblement ───────────────────────────────────────────────────
// Un pas du tremblement de la lunette. t = { x, y, vx, vy, phase } est muté (milliradians dans le jeu, x vers la droite,
// y vers le bas de l'écran) ; p = { intensity, sway, breathRate } dans la même unité ; rand() dans [0, 1).
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

  const damp = TREMBLEMENT.amortissement ** k
  t.vx *= damp
  t.vy *= damp
  t.x += t.vx * dt
  t.y += t.vy * dt
  // Rappel doux vers le centre (moins fort = dérive plus ample)
  const recall = TREMBLEMENT.rappel ** k
  t.x *= recall
  t.y *= recall
}

// Écart quadratique moyen radial (racine de la moyenne de x² + y²) que stepTremble atteint en régime établi avec les
// paramètres p, à pas dt fixe. Calcul exact du schéma discret (son approximation continue surestime de 9 % à 60 i/s) :
// - à-coups : variance stationnaire du couple vitesse-position (a : amortissement, b : rappel, sur un pas) ;
// - dérive : gain du filtre à la fréquence de la respiration en x, à 0,7 fois cette fréquence en y.
export function trembleRms(p, dt) {
  const k = dt * 60
  const a = TREMBLEMENT.amortissement ** k, b = TREMBLEMENT.rappel ** k
  const kick2 = p.intensity * p.intensity * k / 12            // variance d'un à-coup (uniforme, d'amplitude intensity·√k)
  const vv = a * a * kick2 / (1 - a * a)                       // variance de la vitesse
  const vx = b * b * dt * dt * vv * (1 + a * b) / ((1 - a * b) * (1 - b * b))   // variance de la position, par axe
  const gain2 = w => {
    const c = Math.cos(w * dt)
    return (a * b * dt * dt) ** 2 / ((1 - 2 * a * c + a * a) * (1 - 2 * b * c + b * b))
  }
  const sway2 = p.sway * p.sway / 2 * (gain2(p.breathRate) + gain2(0.7 * p.breathRate))
  return Math.sqrt(2 * vx + sway2)
}

const clamp01 = v => Math.max(0, Math.min(1, v))

// ─── Stress ────────────────────────────────────────────────────────
// Un pas du stress (0 à 1), en secondes et non plus en images : il monte lunette ouverte (rate : Sang-froid,
// getStats().stressRate), redescend lunette fermée, et l'apnée en ajoute (holding). Vitesses dans src/shot/tuning.js.
export function stepStress(stress, dt, { scoped, holding = false, rate = 1 }) {
  const pente = scoped ? STRESS.monteeParS * rate : -STRESS.descenteParS
  return clamp01(stress + pente * dt + (holding ? APNEE.stressParS * dt : 0))
}

// Écart quadratique moyen visé (mrad) pour un stress de 0 à 1, apnée relâchée et Stabilité 0 : la parabole qui passe
// par les trois cibles de tuning.js (stress 0, 0,5 et 1).
export function trembleTarget(stress) {
  const s = clamp01(stress)
  const { calme, stressMi, stressPlein } = TREMBLEMENT
  return Math.max(0, calme * 2 * (s - 0.5) * (s - 1) - stressMi * 4 * s * (s - 1) + stressPlein * 2 * s * (s - 0.5))
}

// Paramètres de stepTremble (mrad) pour un stress donné : la forme du mouvement de tuning.js, ramenée à l'amplitude
// visée × scale (Stabilité) × steady (apnée). Le calcul se fait pour le pas dt de l'image : l'écart en régime établi
// vaut la cible à toute cadence, et ne dépend pas du zoom (l'angle est converti en pixels à l'affichage seulement).
export function trembleParams(stress, { scale = 1, steady = 1 } = {}, dt = 1 / 60) {
  const s = clamp01(stress)
  const { aCoups, derive, respiration } = TREMBLEMENT
  const shape = { intensity: aCoups[0] + aCoups[1] * s * s, sway: derive[0] + derive[1] * s, breathRate: respiration[0] + respiration[1] * s }
  const gain = trembleTarget(s) * scale * steady / trembleRms(shape, dt > 0 ? dt : 1 / 60)
  return { intensity: shape.intensity * gain, sway: shape.sway * gain, breathRate: shape.breathRate }
}
