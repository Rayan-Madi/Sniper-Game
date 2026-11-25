// M6, la fête (spec du lot 3, §3 ; plan du lot 3a, tâche A2) : la mission telle que le jeu la joue aujourd'hui. Le
// sous-lot 3b la refait d'après son briefing : la verrière, les rôles fixes de la foule, la fuite vers la porte
// d'entrée, la fenêtre liée à l'appel. Champs et ancres : voir index.js ; la carte est src/maps/m6-fete.js.
export default {
  numero: 6,
  nom: 'Niveau 6 : La Fête',
  points: 5,

  poste: { oeil: 'oeil', regard: 'regard' },   // la fenêtre de l'immeuble d'en face, qui vise l'appartement
  zone: 'zone',
  zoom: { depart: 4, min: 3, max: 6 },
  zero: 38,   // réglage de la lunette (m) : la distance qu'annonce Anton au briefing
  profil: {
    near: 0.1, far: 200,
    brume: { type: 'lin', couleur: 0x0a0a14, debut: 60, fin: 130 },
    soleil: { pos: [20, 40, 10], cible: [0, 0, 0] },
    cadreOmbre: 60,
  },

  casting: {
    // Le commanditaire, à identifier : aucune photo, un homme au modèle de la foule (gangster_man_02, décision 6 de la
    // spec du lot 3), au polo sombre, et à l'ombre des civils (sans marqueur). Son comportement le trahit : pendant que
    // tout le monde danse, il reste assis au téléphone, sur le canapé de gauche.
    cibles: [{ modele: 'gangster_man_02', teinteMaillage: { Ch01_Shirt: 0x3a3f4a }, place: 'canape', routine: 'telephone', femme: false }],
    gardes: { nombre: 2 },
    civils: { nombre: 24, danse: true },   // foule très dense : un tir sur un innocent, et la mission échoue
  },
  allure: { cibles: 0.7, gardes: 0.5, imprevisibles: true },
  marqueurs: false,
  // Ce que sait Anton (briefing : DANSE : NON, TÉLÉPHONE : OUI, VISAGE : ????) : ni nom ni photo. « Assis », que disait
  // la fiche d'avant la tâche A7, n'est pas au briefing (rapport M6 du lot 3).
  fiche: {
    ordre: false,
    entrees: [{ cibleId: 0, nom: '???', role: 'COMMANDITAIRE', signe: 'NE DANSE PAS · AU TÉLÉPHONE', portrait: null }],
  },

  fuite: 'laterale',   // dans l'appartement, on court vers la sortie latérale la plus proche
  sorties: [],
  abris: [],
  reaction: null,
  perteDeVueS: null,
  fenetres: [],
  radio: [],
  fin: { calmeS: 0 },
}
