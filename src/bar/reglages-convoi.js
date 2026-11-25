// Réglages du contrat avec le convoi (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §5.1), à part des autres
// réglages du bar (src/bar/reglages.js) : le convoi (src/campaign/missions/m5.js, sous-lot 3d du lot 3) importe
// effetsSurLeConvoi de src/bar/renseignements.js, au démarrage du jeu, et un module va entier dans un seul morceau du
// build. Rangées dans reglages.js, ces valeurs y faisaient entrer tous les réglages du bar (son, décor, patrons), que son
// morceau chargé à la demande emploie (relecture de l'étape 1). Module pur, sans import : il doit le rester
// (tests/bar/renseignements.test.js, « ce que tire le contrat avec le convoi »).

// ─── Le convoi selon les renseignements (§5.1) ─────────────────────
// Ce que le convoi (sous-lot 3d du lot 3) doit à ce que Viktor a appris au bar (effetsSurLeConvoi,
// src/bar/renseignements.js). Jamais de pile ou face : un renseignement manquant coûte du temps, de la vitesse ou tend un
// piège visible, jamais une devinette. Valeurs de départ, à régler en 3d en jouant.
export const CONVOI = {
  fenetre: {            // la fenêtre de tir, selon le poste (TRAJET)
    virage: { dureeS: 13.5, barre: true, freinage: true },        // TRAJET appris : l'épingle du calvaire (le M5 de la spec
                        // du lot 3 : 13,5 s à 8,5 m/s), barre FENÊTRE DE TIR à l'entrée, freinage et feux stop
    ligneDroite: { dureeS: 9, barre: false, freinage: false },    // TRAJET manqué (décision 2, G1) : la butte à 140 m de la
                        // ligne droite, 12,5 m/s (115 m de route), ni freinage, ni feux stop, ni barre
  },
  arrivee: {            // quand la mission commence, et le stress de Viktor à ce moment (HEURE)
    calme: { avantFenetreS: 40, stressDepart: 0 },   // HEURE apprise : environ 40 s de calme avant que la jeep 2 n'entre dans la fenêtre
    juste: { avantFenetreS: 8, stressDepart: 0.5 },  // HEURE manquée : la jeep 2 à 8 s de la fenêtre, Viktor essoufflé ; le
                        // stress retombe de 0,5 par seconde lunette fermée (STRESS.descenteParS, src/shot/tuning.js) : la
                        // seconde de calme est prise sur la fenêtre
  },
  pointsParRenseignement: 50,   // bonus du rapport par renseignement (§5.3) ; le +100 d'un bar sans MÉFIANCE vient de la
                        // couverture, hors de ce contrat (tâche B17)
}
