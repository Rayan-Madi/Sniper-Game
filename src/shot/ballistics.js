import * as THREE from 'three'
import { BALLE } from './tuning.js'

// Trajectoire de la balle (spec du lot 3, §2 c, approche B). Module pur : three pour les maths, ni DOM ni scène.
//
// Sans traînée : p(t) = o + v0·u·t + ½·g·t², la pesanteur tirant vers -Y. u est la visée (dir, unitaire) relevée de
// angleDeZero(zero) dans son plan vertical : la balle monte au-dessus de la ligne de visée, la recroise à la distance de
// réglage de la lunette (celle qu'annonce Anton, décision 1), puis passe dessous. Le temps t part du coup. La traînée
// est négligée (approche C écartée : un gain invisible à 430 m) ; à la place, la vitesse de bouche est celle d'une
// balle déjà ralentie (BALLE.vitesse, src/shot/tuning.js).

const HAUT = new THREE.Vector3(0, 1, 0)

// Angle (rad) dont relever un tir à l'horizontale pour qu'il recroise la ligne de visée à `distance` m : la portée d'un
// tir sans traînée donne sin 2θ = g·d / v0². 0 sans réglage (distance absente ou nulle). C'est un réglage de stand, à
// l'horizontale : en plongée, la pesanteur ne tire plus qu'en partie en travers de la visée et la balle passe un peu
// haut (de 1 à 6 mm aux postes du lot 3).
export function angleDeZero(distance, v0 = BALLE.vitesse, g = BALLE.gravite) {
  if (!(distance > 0)) return 0
  const s = g * distance / (v0 * v0)
  if (s > 1) throw new RangeError(`réglage hors de portée : ${distance} m à ${v0} m/s`)
  return 0.5 * Math.asin(s)
}

// La trajectoire d'un tir parti de `origine` le long de la visée `dir`, à v0 m/s, sous une pesanteur de g m/s², la
// lunette réglée à `zero` m (null : sans réglage). Les vecteurs donnés sont copiés.
// → { origine, dir (unitaire), v0, g, zero, u (direction de départ), pointA(t, out), vitesseA(t, out),
//     segmentsEntre(t0, t1, pasMaxS) }
export function trajectoire({ origine, dir, v0 = BALLE.vitesse, g = BALLE.gravite, zero = null }) {
  const o = origine.clone()
  const d = dir.clone().normalize()
  // Le haut de la visée, dans son plan vertical : la verticale, moins sa part le long de la visée (le tangage du jeu
  // est borné à -1,35 et 0,5 rad, la visée n'est jamais verticale)
  const haut = HAUT.clone().addScaledVector(d, -d.y).normalize()
  const theta = angleDeZero(zero, v0, g)
  const u = d.clone().multiplyScalar(Math.cos(theta)).addScaledVector(haut, Math.sin(theta))

  // Position de la balle t secondes après le coup.
  const pointA = (t, out = new THREE.Vector3()) => {
    out.copy(o).addScaledVector(u, v0 * t)
    out.y -= 0.5 * g * t * t
    return out
  }
  // Vitesse de la balle t secondes après le coup (m/s) : v0·u + g·t (le rejeu du lot 4 la suit).
  const vitesseA = (t, out = new THREE.Vector3()) => {
    out.copy(u).multiplyScalar(v0)
    out.y -= g * t
    return out
  }
  // Le trajet de t0 à t1 en segments droits bout à bout, aucun plus long que pasMaxS : [{ t0, t1, a, b }], a et b les
  // positions aux deux instants. À 0,05 s, la corde s'écarte de la courbe de g·Δt²/8, 3 mm. Vide si t1 <= t0.
  const segmentsEntre = (t0, t1, pasMaxS = BALLE.segmentMaxS) => {
    if (!(t1 > t0)) return []
    const n = Math.max(1, Math.ceil((t1 - t0) / pasMaxS - 1e-9))
    const segs = []
    for (let i = 0; i < n; i++) {
      const ta = i ? segs[i - 1].t1 : t0
      const tb = i === n - 1 ? t1 : t0 + (t1 - t0) * (i + 1) / n
      segs.push({ t0: ta, t1: tb, a: pointA(ta), b: pointA(tb) })
    }
    return segs
  }
  return { origine: o, dir: d, v0, g, zero, u, pointA, vitesseA, segmentsEntre }
}
