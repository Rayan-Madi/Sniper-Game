// Réglages du tir (spec du lot 2, §3.8) : toutes les constantes de ressenti et d'équilibrage, en un seul endroit.
// Module pur (ni DOM ni three). Chaque valeur dit en une ligne ce qu'elle change en jeu ; le lot 3 les reréglera à la
// main sur la longue distance (430 m).

// ─── Lunette ───────────────────────────────────────────────────────
export const LUNETTE = {
  ouvertureMs: 180,     // durée de l'ouverture : la vignette se resserre et le champ glisse de 60° vers 60 / zoom
  fermetureMs: 120,     // durée de la fermeture
  reticuleA: 2 / 3,     // part de l'ouverture à partir de laquelle le réticule apparaît (le dernier tiers)
  zoomMs: 120,          // temps pour que le zoom effectif atteigne 95 % du zoom choisi à la molette
}

// ─── Recul ─────────────────────────────────────────────────────────
export const RECUL = {
  angleDeg: 2.5,        // le regard monte d'autant à chaque tir
  deriveDeg: 0.6,       // dérive latérale tirée au hasard, de part et d'autre (±)
  retourS: 0.45,        // temps du retour à moins de 5 % du recul (ressort amorti, sans rebond visible)
}

// ─── Culasse ───────────────────────────────────────────────────────
export const CULASSE = {
  dureeS: [1.2, 1.125, 1.05, 0.975, 0.9],   // temps sans pouvoir tirer après un coup, par niveau de Vélocité (0 à 4)
  ouvertureS: 0.35,     // instant du son d'ouverture de la culasse après le coup
  fermetureS: 0.9,      // instant du son de fermeture
}

// ─── Tremblement de la lunette ─────────────────────────────────────
// Écart quadratique moyen visé, en milliradians, de la visée autour du centre (racine de la moyenne de x² + y², en
// régime établi), apnée relâchée et Stabilité 0 ; même valeur à tous les zooms et à toutes les cadences d'image.
// Entre ces trois points, la loi est la parabole qui y passe. 1 mrad vaut 3 cm à 30 m et 43 cm à 430 m.
export const TREMBLEMENT = {
  calme: 0.35,          // stress 0 : 1 cm à 30 m, 15 cm à 430 m
  stressMi: 1.6,        // stress 0,5 : 5 cm à 30 m, 69 cm à 430 m
  stressPlein: 4.5,     // stress 1 : 14 cm à 30 m, 1,9 m à 430 m
  // Forme du mouvement, reprise du réglage d'avant le lot 2 : seules les proportions comptent, l'amplitude est
  // ramenée aux cibles ci-dessus (trembleParams, src/aim.js).
  aCoups: [14, 220],    // à-coups aléatoires, 14 + 220 × stress² : la part saccadée, qui domine sous le stress
  derive: [8, 30],      // dérive lente en huit (la respiration), 8 + 30 × stress : plus visible au calme
  respiration: [1.2, 1.5],   // fréquence de la respiration (rad/s), 1,2 + 1,5 × stress : le souffle s'accélère
  amortissement: 0.91,  // vitesse du réticule gardée à chaque soixantième de seconde : plus bas, mouvement plus heurté
  rappel: 0.97,         // écart au centre gardé à chaque soixantième de seconde : plus bas, retour plus rapide
}

// ─── Apnée (touche Maj) ────────────────────────────────────────────
export const APNEE = {
  dureeS: 4,            // souffle retenu au plus pendant ce temps
  rechargeS: 6,         // temps pour que la jauge se remplisse de nouveau
  stabilite: 0.15,      // tremblement multiplié par ce facteur pendant l'apnée
  stressParS: 0.10,     // stress ajouté par seconde d'apnée (le manque d'air)
}

// ─── Stress (0 à 1) ────────────────────────────────────────────────
export const STRESS = {
  monteeParS: 0.07,     // lunette ouverte : moitié en 7 s, plein en 14 s (divisé par le Sang-froid)
  descenteParS: 0.5,    // lunette fermée : on se calme en 2 s au plus
  parTir: 0.12,         // chaque coup de feu
  ouvertureLunette: 0.04,   // le clic droit qui ouvre la lunette
  fermetureLunette: 0.06,   // retiré quand on relâche la lunette
  tirManque: 0.15,      // tir manqué sans silencieux : les cibles fuient
  cibleAbattue: 0.1,    // retiré à chaque cible abattue
  gardeTouche: 0.45,    // garde touché sans silencieux : l'alerte part
}

// ─── Score par zone touchée ────────────────────────────────────────
export const SCORE_ZONE = {
  tete: 2,              // tir à la tête : points doublés
  torse: 1,             // torse : points de base
  membre: 0.6,          // bras ou jambe : la cible tombe, mais le tir rapporte moins
}

// ─── Zones touchées (rayons en mètres) ─────────────────────────────
export const ZONES = {
  tete: 0.13,           // sphère de la tête (« sphère de 13 cm » du §3.6 de la spec)
  torse: 0.15,          // capsule du bassin au cou : un rayon qui passe à 25 cm de l'axe la manque
  bras: 0.06,           // capsules des bras
  jambe: 0.08,          // capsules des jambes
}

// ─── Son ───────────────────────────────────────────────────────────
export const SON = {
  vitesse: 343,         // vitesse du son (m/s) : le son de l'impact arrive distance / 343 s après la balle
  echoDb: -18,          // niveau de l'envoi vers l'écho de la carte : plus haut, l'écho se fait plus présent
}

// ─── Marques d'impact ──────────────────────────────────────────────
export const MARQUES = {
  max: 24,              // marques laissées dans le décor au plus ; la plus ancienne part au-delà
}
