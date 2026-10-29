// M4, la base (spec du lot 3, §3 ; plan du lot 3a, tâche A2) : la mission telle que le jeu la joue aujourd'hui. Le
// sous-lot 3c la refait d'après son briefing : le château d'eau à 430 m, Verne, Halder et Rossi, « 3 tirs en 6 s ».
// Champs et ancres : voir index.js ; la carte est src/maps/m4-base.js.
export default {
  numero: 4,
  nom: 'Niveau 4 : Base militaire',
  points: 3,

  poste: { oeil: 'oeil', regard: 'regard' },   // le bord avant de la tour de garde, qui plonge vers la cour
  zone: 'zone',
  zoom: { depart: 4, min: 3, max: 6 },
  zero: 430,  // réglage de la lunette (m) : la distance qu'annonce Anton au briefing
  profil: {
    near: 0.1, far: 200,
    brume: { type: 'lin', couleur: 0x9ab0c0, debut: 70, fin: 160 },
    soleil: { pos: [20, 40, 10], cible: [0, 0, 0] },
    cadreOmbre: 60,
  },

  casting: {
    cibles: [{}, {}, {}],
    gardes: 4,
    civils: { nombre: [3, 5] },
  },
  allure: { cibles: 0.8, gardes: 0.6, imprevisibles: true },
  marqueurs: true,
  fiche: null,

  fuite: 'opposee',
  sorties: [],
  abris: [],
  fenetres: [],
  radio: [],
  fin: { calmeS: 0 },
}
