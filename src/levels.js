export const LEVELS = [
  {
    id: 1,
    name: 'Niveau 1 — Marché',
    targets: 1,
    guards: 1,
    targetSpeed: 0.4,
    guardFOV: 60,
    guardSpeed: 0.3,
    unpredictable: false,
    pointsReward: 1,
  },
  {
    id: 2,
    name: 'Niveau 2 — Parking',
    targets: 2,
    guards: 2,
    targetSpeed: 0.6,
    guardFOV: 70,
    guardSpeed: 0.4,
    unpredictable: false,
    pointsReward: 2,
  },
  {
    id: 3,
    name: 'Niveau 3 — Port',
    targets: 2,
    guards: 3,
    targetSpeed: 0.7,
    guardFOV: 80,
    guardSpeed: 0.5,
    unpredictable: true,
    pointsReward: 2,
  },
  {
    id: 4,
    name: 'Niveau 4 — Base militaire',
    targets: 3,
    guards: 4,
    targetSpeed: 0.8,
    guardFOV: 90,
    guardSpeed: 0.6,
    unpredictable: true,
    pointsReward: 3,
  },
  {
    id: 5,
    name: 'Niveau 5 — Le Convoi',
    targets: 1,             // le colonel, dans une voiture en mouvement
    guards: 4,              // 3 chauffeurs + 1 passager d'escorte
    civilians: 0,
    movingTarget: true,     // la cible roule dans un véhicule
    targetSpeed: 1.0,
    guardFOV: 100,
    guardSpeed: 0.7,
    unpredictable: true,
    pointsReward: 4,
  },
  {
    id: 6,
    name: 'Niveau 6 — La Fête',
    targets: 1,             // le commanditaire — cible unique finale
    guards: 2,
    civilians: 24,          // foule TRÈS dense — un tir raté sur un innocent = échec
    targetSpeed: 0.7,
    guardFOV: 90,
    guardSpeed: 0.5,
    unpredictable: true,
    pointsReward: 5,
  },
]

export function getLevel(n) {
  return LEVELS[Math.min(n - 1, LEVELS.length - 1)]
}
