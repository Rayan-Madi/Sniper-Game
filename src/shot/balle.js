import * as THREE from 'three'
import { trajectoire } from './ballistics.js'
import { BALLE } from './tuning.js'

// La balle en vol (spec du lot 3, §2 c, approche B ; plan du lot 3a, tâche A4). Module pur : three pour les maths, ni
// DOM ni scène.
//
// Lancée au coup (lancerBalle), elle suit sa trajectoire (src/shot/ballistics.js) sur l'horloge de la mission. À chaque
// image, main.js fait avancer les PNJ et le convoi, puis la balle (avancerBalle) : le bout de trajectoire parcouru
// depuis l'image d'avant est cherché, segment par segment, contre le monde du moment par `toucher` (dans le jeu,
// impactSurSegment de src/shot/occlusion.js : les zones des PNJ à leur pose, le décor solide, le cadenas, les vitres).
// Au premier impact, son instant est interpolé dans le segment, à la distance de l'impact (la vitesse de la balle n'y
// change que de quelques cent-millièmes) : jamais la fin de l'image. Une balle qui n'a rien rencontré au bout de
// BALLE.volMaxS est perdue, là où elle est alors.
//
// toucher(segment) reçoit { ray (THREE.Ray du début du segment, direction unitaire), longueur (m), depuisM (de l'œil
// au début du segment), t0, t1 (temps de vol aux deux bouts, s) } et rend { impact, traversees } : impact, ce que la
// balle rencontre sur le segment ({ kind: 'npc' | 'decor', point, distance depuis le début du segment, … }) ou null ;
// traversees, les vitres traversées avant lui ([{ point, normale, surface, distance }]).

// Segments de la prévision du coup (le bout du sillage) : la corde s'écarte de la courbe de 2,8 cm au plus, et le coup
// ne cherche le monde que quatre fois sur les 0,6 s du vol.
const PAS_PREVISION_S = 0.15

// La balle d'un tir parti à tTir (horloge de la mission, s) de `origine` le long de la visée `dir` (le réticule), à
// v0 m/s, sous une pesanteur de g m/s², la lunette réglée à `zero` m (null : sans réglage).
// → { traj (la trajectoire), tTir, t (le temps de vol déjà cherché, s), traversees (vitres traversées jusque-là) }
export function lancerBalle({ origine, dir, v0, g, zero = null, tTir = 0 }) {
  return { traj: trajectoire({ origine, dir, v0, g, zero }), tTir, t: 0, traversees: [] }
}

// Le trajet de t0 à t1 (temps de vol), segment par segment au pas donné, jusqu'au premier impact. Les traversées sont
// rendues à vu(t, traversée) au fil des segments. → { tVol, impact } ou null.
function parcourir(traj, t0, t1, toucher, pas, vu = null) {
  for (const s of traj.segmentsEntre(t0, t1, pas)) {
    const dir = s.b.clone().sub(s.a)
    const longueur = dir.length()
    if (!(longueur > 0)) continue
    const ray = new THREE.Ray(s.a, dir.divideScalar(longueur))
    const { impact = null, traversees = [] } = toucher({ ray, longueur, depuisM: s.a.distanceTo(traj.origine), t0: s.t0, t1: s.t1 }) || {}
    const tVol = d => s.t0 + (s.t1 - s.t0) * Math.min(1, d / longueur)
    if (vu) for (const v of traversees) vu(tVol(v.distance), v)
    if (impact) return { tVol: tVol(impact.distance), impact }
  }
  return null
}

// L'arrivée de la balle : t, l'instant de l'impact sur l'horloge de la mission ; impact ; traversees, les vitres
// traversées depuis le coup, chacune à son instant ([{ t, point, normale, surface }]).
const arrivee = (balle, tVol, impact) => ({ t: balle.tTir + tVol, impact, traversees: balle.traversees.slice() })

// Fait voler la balle jusqu'au temps de la mission t (la fin de l'image, après que les PNJ ont bougé). → null tant
// qu'elle vole ; son arrivée sinon : { t, impact, traversees }, impact valant { kind: 'rien', point } pour une balle
// perdue au bout de BALLE.volMaxS (point : là où elle est alors).
export function avancerBalle(balle, t, toucher) {
  const fin = Math.min(t - balle.tTir, BALLE.volMaxS)
  const vu = (tVol, v) => balle.traversees.push({ t: balle.tTir + tVol, point: v.point.clone(), normale: v.normale.clone(), surface: v.surface })
  const r = parcourir(balle.traj, balle.t, fin, toucher, BALLE.segmentMaxS, vu)
  if (r) return arrivee(balle, r.tVol, r.impact)
  balle.t = Math.max(balle.t, fin)
  if (balle.t >= BALLE.volMaxS) return arrivee(balle, BALLE.volMaxS, { kind: 'rien', point: balle.traj.pointA(BALLE.volMaxS) })
  return null
}

// Prévision au coup, le monde tel qu'il est : le temps de vol (s) jusqu'au premier impact, ou BALLE.volMaxS s'il n'y a
// rien. main.js en tire le bout du sillage (src/effects.js), que l'arrivée recale si le monde a bougé entre-temps. La
// balle n'avance pas.
export function predireImpact(balle, toucher) {
  const r = parcourir(balle.traj, 0, BALLE.volMaxS, toucher, PAS_PREVISION_S)
  return r ? r.tVol : BALLE.volMaxS
}
