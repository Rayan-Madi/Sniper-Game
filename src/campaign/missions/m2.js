// M2, les frères (spec du lot 3, §3 ; plan du lot 3a, tâche A2) : la mission telle que le jeu la joue aujourd'hui. Le
// sous-lot 3b la refait d'après son briefing : boucherie, ruelle, Luc et Marc toujours ensemble, fuite vers la ruelle.
// Champs et ancres : voir index.js ; la carte est src/maps/m2-place.js.
export default {
  numero: 2,
  nom: 'Niveau 2 : Parking',
  points: 2,

  poste: { oeil: 'oeil', regard: 'regard' },   // le toit de l'immeuble nord, qui plonge sur le centre de la place
  zone: 'zone',
  zoom: { depart: 4, min: 3, max: 6 },
  profil: {
    near: 0.1, far: 200,
    brume: { type: 'lin', couleur: 0x0a0a18, debut: 40, fin: 100 },
    soleil: { pos: [20, 40, 10], cible: [0, 0, 0] },
    cadreOmbre: 60,
  },

  casting: {
    cibles: [{}, {}],
    gardes: 2,
    civils: { nombre: [3, 5] },
  },
  allure: { cibles: 0.6, gardes: 0.4, imprevisibles: false },
  marqueurs: true,
  fiche: null,

  fuite: 'opposee',
  sorties: [],
  abris: [],
  fenetres: [],
  radio: [],
  fin: { calmeS: 0 },
}
