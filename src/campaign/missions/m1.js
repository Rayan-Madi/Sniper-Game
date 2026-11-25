// M1, le marché (spec du lot 3, §3 ; plan du lot 3a, tâche A2) : la mission telle que le jeu la joue aujourd'hui. Le
// sous-lot 3b la refait d'après son briefing : toit d'en face, nuit, point d'appel, Markov au téléphone, garde du corps.
// Champs et ancres : voir index.js ; la carte est src/maps/m1-rue.js.
export default {
  numero: 1,
  nom: 'Niveau 1 : Marché',
  points: 1,

  poste: { oeil: 'oeil', regard: null },   // 8 m au-dessus de la route ; la vue part à l'horizontale
  zone: 'zone',
  zoom: { depart: 4, min: 3, max: 6 },
  zero: 31,   // réglage de la lunette (m) : la distance qu'annonce Anton au briefing (« Trente et un mètres. »)
  profil: {
    near: 0.1, far: 200,
    brume: { type: 'lin', couleur: 0x87a0b0, debut: 50, fin: 140 },
    soleil: { pos: [20, 40, 10], cible: [0, 0, 0] },
    cadreOmbre: 60,
  },

  casting: {
    cibles: [{ modele: 'gangster_man_01', femme: false }],   // Markov, au costume bleu nuit de son portrait
    gardes: { nombre: 1 },
    // Sans le tailleur bleu roi de mafia_woman_02, qui passerait pour le costume de Markov
    civils: { nombre: [3, 5], exclure: ['mafia_woman_02'] },
  },
  allure: { cibles: 0.4, gardes: 0.3, imprevisibles: false },
  marqueurs: true,   // le tutoriel : le marqueur rouge reste au-dessus de Markov, les autres missions n'en ont plus (tâche A7)
  // Le dossier du briefing (NOM, ACTIVITÉ, SIGNE) : la fiche y fait le tutoriel des signes, que les missions suivantes
  // jouent sans marqueur. « Il téléphone » s'y ajoutera avec l'appel de Markov (sous-lot 3b).
  fiche: {
    ordre: false,
    entrees: [{ cibleId: 0, nom: 'MARKOV', role: 'TRAITE HUMAINE', signe: 'COSTUME BLEU NUIT', portrait: 'gangster-man-01' }],
  },

  fuite: 'opposee',
  sorties: [],
  abris: [],
  reaction: null,
  perteDeVueS: null,
  fenetres: [],
  radio: [],
  fin: { calmeS: 0 },
}
