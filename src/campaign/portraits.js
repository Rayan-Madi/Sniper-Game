// Portraits des cibles (spec du lot 3, §2 c, contrat avec le lot 4 ; plan du lot 3a, tâche A7) : les images de leurs
// briefings, servies depuis public/briefing/img/. Une mission cite le portrait d'une cible par son nom (fiche.entrees,
// src/campaign/missions/) ; seule portrait(nom) sait où est le fichier et sous quel format. Les portraits dessinés sont en
// WebP depuis le chantier des cinématiques v2 (tâche C0), ceux de M3 restent des JPEG. Toujours l'image complète, jamais
// la vignette -lo des briefings de M3 (40 × 50, floue une fois agrandie).
//
// Chemin RELATIF à la page, comme les modèles (src/characters.js) : BASE_URL vaut '/' en développement, './' dans le
// build (Electron). Les portraits de M3 sont des JPEG dans public/ (scripts/port-maquette.mjs réécrit les .png de leur
// maquette).
const FORMATS = {
  'gangster-man-01': 'webp',  // Markov
  'freres-a': 'webp',         // Luc Sanctechair
  'freres-b': 'webp',         // Marc Sanctechair
  'passeur-cam': 'jpg',       // Vosko
  'seconde-cam': 'jpg',       // Mira
  'mafia-woman-02': 'webp',   // Verne
  'mafia-henchman': 'webp',   // Halder
  'mafia-woman-01': 'webp',   // Rossi
}

// Les noms connus (tests/campaign/fiche.test.js vérifie que chaque fichier existe dans public/).
export const PORTRAITS = Object.keys(FORMATS)

// L'adresse de l'image du portrait nom ; une erreur, qui le nomme, pour un portrait inconnu.
export function portrait(nom) {
  if (!Object.hasOwn(FORMATS, nom)) throw new Error(`portrait inconnu : ${nom}`)
  return `${import.meta.env.BASE_URL}briefing/img/portrait-${nom}.${FORMATS[nom]}`
}
