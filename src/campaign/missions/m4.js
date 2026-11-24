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
    cibles: [
      { modele: 'mafia_woman_02', femme: true },    // Verne : tailleur bleu nuit, chignon
      { modele: 'mafia_henchman', femme: false },   // Halder : casque noir, « jamais sans son casque »
      { modele: 'mafia_woman_01', femme: true },    // Rossi : cheveux courts, chemise blanche
    ],
    // En armure sable (mafia_boss, décision 5 de la spec du lot 3) : Halder a le modèle des gardes de son pool
    gardes: { nombre: 4, modele: 'mafia_boss' },
    civils: { nombre: [3, 5], exclure: ['mafia_woman_02'] },   // aucun sosie de Verne
  },
  allure: { cibles: 0.8, gardes: 0.6, imprevisibles: true },
  marqueurs: false,   // aucun marqueur après le tutoriel (M1) : la fiche du HUD et les signes du briefing (tâche A7)
  // Les trois officiers du briefing (CIBLE 1 à 3, leur grade), dans l'ordre de ses pastilles : Verne, Halder, Rossi.
  // Leurs signes sont ceux de leurs portraits (spec du lot 3, §3), sans la planchette de Verne : le plan de 3c la lui
  // donne (tâche 3c.10) sans changer son signe ici ; à y ajouter (spec, précisions de la tâche A7 ; plan du lot 3a, A9).
  fiche: {
    ordre: true,
    entrees: [
      { cibleId: 0, nom: 'VERNE', role: 'COMMANDANT', signe: 'TAILLEUR BLEU NUIT · CHIGNON', portrait: 'mafia-woman-02' },
      { cibleId: 1, nom: 'HALDER', role: 'CAPITAINE', signe: 'CASQUE NOIR', portrait: 'mafia-henchman' },
      { cibleId: 2, nom: 'ROSSI', role: 'LIEUTENANT', signe: 'CHEVEUX COURTS · CHEMISE BLANCHE', portrait: 'mafia-woman-01' },
    ],
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
