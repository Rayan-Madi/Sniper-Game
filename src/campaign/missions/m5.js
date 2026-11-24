// M5, le convoi (spec du lot 3, §3 ; plan du lot 3a, tâche A2) : la mission telle que le jeu la joue aujourd'hui. Le
// sous-lot 3d la refait d'après son briefing : la crête à 138 m, le virage, Kessler en place passager, « 13 s ».
// Champs et ancres : voir index.js ; la carte est src/maps/m5-convoi.js.
export default {
  numero: 5,
  nom: 'Niveau 5 : Le Convoi',
  points: 4,

  poste: { oeil: 'oeil', regard: 'regard' },   // le promontoire, qui vise la route
  zone: 'zone',
  zoom: { depart: 4, min: 3, max: 6 },
  zero: 138,  // réglage de la lunette (m) : la distance du briefing, lue sur l'échelle de sa carte (Anton ne la chiffre pas)
  profil: {
    near: 0.1, far: 200,
    brume: { type: 'lin', couleur: 0xb0a088, debut: 80, fin: 180 },
    soleil: { pos: [20, 40, 10], cible: [0, 0, 0] },
    cadreOmbre: 60,
  },

  casting: {
    cibles: [{ modele: 'mafia_boss', femme: false }],   // le colonel Kessler, « sans visage », à l'arrière de la jeep du milieu
    // Trois chauffeurs et un passager d'escorte, dans le pool des gardes : le sous-lot 3d compose le convoi, avec leur
    // modèle (décision 5) et le signe de Kessler
    gardes: { nombre: 4 },
    civils: { nombre: 0 },
  },
  allure: { cibles: 1.0, gardes: 0.7, imprevisibles: true },
  marqueurs: false,   // aucun marqueur après le tutoriel (M1) : la fiche du HUD et les signes du briefing (tâche A7)
  // La fiche du briefing (NOM, GRADE, PHOTO : AUCUNE DEPUIS 1998, PLACE) : sans photo, sa place le désigne. Le
  // sous-lot 3d l'assoit à l'avant droit de la jeep, côté passager, comme le dessine le briefing.
  fiche: {
    ordre: false,
    entrees: [{ cibleId: 0, nom: 'KESSLER', role: 'COLONEL', signe: 'VÉHICULE 2 · PASSAGER', portrait: null }],
  },

  fuite: 'opposee',
  sorties: [],
  abris: [],
  fenetres: [],
  radio: [],
  fin: { calmeS: 0 },

  // Le convoi : trois jeeps (escorte, colonel, escorte) qui traversent la route ; le colonel encore vivant à la sortie,
  // la mission échoue. La composition (places des occupants) est montée par mountLevel (main.js).
  convoi: { route: 'route', vitesse: 8.5 },
}
