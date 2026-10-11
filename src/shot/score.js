import { SCORE_ZONE } from './tuning.js'

// Conséquences d'une touche sur un PNJ, et le fil d'un tir manqué (spec du lot 2, §3.4), sorties de main.js pour être
// testées. Module pur.

// Points d'une cible abattue : 400 à bord d'un véhicule, 250 immobile, 120 en mouvement, multipliés selon la zone
// touchée (SCORE_ZONE : tête ×2, torse ×1, membre ×0,6). La cible meurt quelle que soit la zone. Points entiers.
export function targetScore({ onVehicle, still, part }) {
  const base = onVehicle ? 400 : (still ? 250 : 120)
  return Math.round(base * (SCORE_ZONE[part] ?? 1))
}

// Garde touché : il tombe toujours. Sans silencieux, le bruit du tir déclenche l'alerte ; au silencieux, les autres
// gardes réagissent sans alerte ; au silencieux amélioré, personne ne réagit.
export function guardHit({ silenced, superSilenced }) {
  if (superSilenced) return { meurt: true, alerte: false, gardesReagissent: false, feed: 'Garde éliminé [silencieux+]' }
  if (silenced) return { meurt: true, alerte: false, gardesReagissent: true, feed: 'Garde éliminé [silencieux]' }
  return { meurt: true, alerte: true, gardesReagissent: false, feed: 'Garde éliminé' }
}

// Tir manqué (la balle s'arrête dans le décor ou part au loin) : le fil ne parle de fuite que si des PNJ fuient
// vraiment (fuyards : ceux que le point d'impact a fait fuir). Une balle partie au loin (point à 1 km) ou tirée au
// silencieux ne fait fuir personne : « Tir manqué » seul (relecture de T5).
export function missFeed(fuyards) {
  return fuyards > 0 ? 'Tir manqué : cibles en fuite' : 'Tir manqué'
}
