// M3, le port (spec du lot 3, §3 ; plan du lot 3a, tâche A2) : la mission telle que le jeu la joue aujourd'hui. Le
// sous-lot 3c la refait d'après son briefing : la grue à 155 m, Vosko et Mira, « deux tirs sans temps mort », fin
// différée au calme pour le choix du cadenas. Champs et ancres : voir index.js ; la carte est src/maps/m3-port.js.
export default {
  numero: 3,
  nom: 'Niveau 3 : Port',
  points: 2,

  poste: { oeil: 'oeil', regard: 'regard' },   // la pile de conteneurs, qui vise le quai en contrebas
  zone: 'zone',
  zoom: { depart: 4, min: 3, max: 6 },
  profil: {
    near: 0.1, far: 200,
    brume: { type: 'lin', couleur: 0x0a1520, debut: 35, fin: 95 },
    soleil: { pos: [20, 40, 10], cible: [0, 0, 0] },
    cadreOmbre: 60,
  },

  casting: {
    cibles: [{}, {}],
    gardes: 3,
    civils: { nombre: [3, 5] },
  },
  allure: { cibles: 0.7, gardes: 0.5, imprevisibles: true },
  marqueurs: true,
  fiche: null,

  fuite: 'opposee',
  sorties: [],
  abris: [],
  fenetres: [],
  radio: [],
  fin: { calmeS: 0 },

  // Choix moral : un tir sur le cadenas du conteneur rouge libère les victimes enfermées (upgradeState.freedVictims, dont
  // dépendent le journal de Viktor et l'épilogue) ; chaque essai de la mission repart d'un choix vierge.
  choixMoral: {
    cadenas: 'cadenas',
    indice: { apresS: 5, texte: '👂 Des coups sourds... le conteneur rouge, à gauche.' },
    points: 150,
    victimes: 3,
  },
}
