// Recul (spec du lot 2, §3.3) : à chaque tir, le regard monte de RECUL.angleDeg (avec une dérive latérale tirée au
// hasard, de ±RECUL.deriveDeg) et revient par un ressort amorti. Module pur (ni DOM ni three) : main.js ajoute le
// décalage au regard du joueur, dont les mouvements de souris continuent de s'ajouter ; les tests l'importent
// directement.
//
// Ressort à amortissement critique (le plus rapide sans rebond) : x'' + 2ωx' + ω²x = 0 sur chaque axe. Le coup déplace
// le regard d'un coup, sans vitesse ; il revient alors comme (1 + ωt)·e^(-ωt), sans jamais passer sous la visée du
// joueur. ω est choisi pour qu'il reste RESIDU du recul au bout de RECUL.retourS. Le pas est la solution exacte de
// l'équation sur dt : le recul ne dépend que du temps écoulé, pas du nombre d'images.
import { RECUL } from './tuning.js'

const DEG = Math.PI / 180
// Part du recul qui reste au bout de RECUL.retourS : « revenu » à moins de 5 %.
const RESIDU = 0.05

// u tel que (1 + u)·e^(-u) = r (0 < r < 1), par dichotomie : la fonction décroît de 1 (u = 0) vers 0. La borne haute
// est gardée : le reste à RECUL.retourS est au plus r.
function solveCritical(r) {
  let lo = 0, hi = 60
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if ((1 + mid) * Math.exp(-mid) > r) lo = mid
    else hi = mid
  }
  return hi
}

// rand() dans [0, 1) : la dérive latérale de chaque coup (Math.random en jeu, un générateur à graine en test).
export function createRecoil(t = RECUL, rand = Math.random) {
  const w = solveCritical(RESIDU) / t.retourS
  // Décalage (radians) et sa vitesse, en tangage (positif : vers le haut) et en lacet.
  let p = 0, vp = 0, y = 0, vy = 0

  // Solution exacte sur dt d'un axe du ressort, depuis (x, v).
  const step = (x, v, dt) => {
    const e = Math.exp(-w * dt), c = v + w * x
    return [(x + c * dt) * e, (v - w * c * dt) * e]
  }

  return {
    // Coup de feu : le regard monte, et part à gauche ou à droite au hasard.
    kick() {
      p += t.angleDeg * DEG
      y += (rand() * 2 - 1) * t.deriveDeg * DEG
    },
    // Montage d'une mission : plus de recul en cours.
    reset() { p = vp = y = vy = 0 },
    // Un pas de dt secondes ; rend le décalage de visée en radians. Un pas nul ou invalide ne change rien.
    update(dt) {
      if (dt > 0) {
        ;[p, vp] = step(p, vp, dt)
        ;[y, vy] = step(y, vy, dt)
      }
      return { pitch: p, yaw: y }
    },
  }
}
