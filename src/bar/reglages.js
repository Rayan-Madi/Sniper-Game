// Réglages du Bivouac, le bar de M5 (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md) : toutes les valeurs de
// ressenti et d'équilibrage du bar, en un seul endroit, à part de src/shot/tuning.js (que le lot 3 réécrit en parallèle ;
// un renvoi d'une ligne y sera ajouté à la fusion). Module pur (ni DOM ni three). Chaque valeur dit en une ligne ce
// qu'elle change en jeu. « Fais le dur » (spec §0.1) : on part de ces valeurs exigeantes et on n'assouplit qu'en jouant.
// Catégories de personnes, communes au regard et à la jauge : escorte (Dussart, Lenoir, Mattei, Haas, Sorel), fernand,
// civil (Lise, les ouvriers), albert.

// ─── L'écoute (§3.4) ───────────────────────────────────────────────
// Ce que Viktor comprend d'une réplique (src/bar/ecoute.js) : I = A(d / voix) × T × O(α) × (1 − N), entre 0 et 1 ; d, la
// distance de son oreille à la bouche ; T, ce que laissent passer les boîtes du plan entre les deux ; α, l'angle entre
// son regard et la source ; N, le bruit de la salle et du juke-box. Un mot s'affiche si I atteint sa fragilité au moment
// où il est frappé. Au calme et loin du juke-box, les mots-clés passent jusqu'à 3,0 m environ ; en MÉFIANCE, 2,1 m ; la
// voix du colonel dans le combiné, 1,1 m.
export const ECOUTE = {
  pleineM: 2.5,         // A = 1 en deçà de cette distance (rapportée à la voix) : tout s'entend
  nulleM: 5,            // A = 0 au-delà ; entre les deux, une courbe douce u²(3 − 2u), u = (5 − x) / 2,5
  voix: {               // force de la voix d'une réplique : la distance est divisée par elle
    normale: 1,         // une conversation de table
    baissee: 0.7,       // l'escorte dès MÉFIANCE (SOUPCON.effets.voixEscorte) : mots-clés à 2,1 m au lieu de 3,0 m
    rires: 1.25,        // les éclats et les rires portent plus loin
    combine: 0.35,      // la voix du colonel dans le combiné du téléphone : à 1,1 m au plus
  },
  transmission: {       // ce que laisse passer une boîte coupée par la ligne oreille-bouche (produit sur les boîtes)
    mur: 0.05,          // un mur plein : presque rien
    cloison: 0.6,       // la cloison du couloir des toilettes : on entend, on ne comprend plus les mots-clés
    porte: 0.9,         // une porte, seulement si la ligne passe par elle ; à côté, c'est le mur
    meuble: 1,          // le zinc, une table : rien n'est retenu (le meuble arrête le pas, pas la voix)
  },
  orientationLibreDeg: 75,   // jusqu'à cet angle entre le regard et la source, O = 1 : se tourner un peu suffit
  orientationDos: 0.9,  // O dos tourné (180°), linéaire depuis 75° : fixer est inutile, tourner le dos coûte peu
  bruitFond: 0.08,      // N loin de tout : le brouhaha de la salle (I ne dépasse jamais 0,92)
  bruitJukebox: 0.25,   // ajouté à N tout contre le juke-box, décroît jusqu'à jukeboxM
  jukeboxM: 4,          // au-delà de cette distance du juke-box, il ne couvre plus les voix
  murmuresSous: 0.15,   // en deçà, le sous-titre n'est que « (murmures) », sans bips intelligibles
  fragiliteMax: 0.7,    // fragilité d'un mot ordinaire, tirée à graine entre 0 et cette valeur
  fragiliteCle: 0.8,    // fragilité d'un mot-clé : il faut I ≥ 0,8 quand il est frappé pour le lire
  changementSousTitre: 0.25,   // un seul échange sous-titré, le plus intelligible ; on n'en change que s'il est dépassé de tant
  porteeBips: 1.6,      // gain des voix bipées : A(d / (1,6 × voix)) × T, on entend plus loin qu'on ne comprend
  passeBas: { baseHz: 600, plageHz: 2400 },   // coupure des voix bipées : 600 + 2 400 × T Hz, assourdies par les murs
  voixBipeesMax: 3,     // au plus trois voix bipées à la fois : la sous-titrée et les deux suivantes
}

// ─── Le regard qui fixe (§3.5) ─────────────────────────────────────
// Viktor fixe une personne (src/bar/regard.js) quand le centre de l'écran est à moins de atan(rayonTeteM / d) + margeDeg
// de sa tête (d : la distance), qu'elle le voit et qu'elle n'est pas son interlocuteur. Son temps de fixation monte tant
// que cela dure et redescend sinon ; au-delà de la tolérance, elle remarque Viktor (événement « remarque » de la jauge de
// soupçon).
export const REGARD = {
  rayonTeteM: 0.1,      // demi-largeur de la tête visée (m) : seuil de 6,8° à 1,5 m, 5,9° à 2 m, 4,9° à 3 m, 4,1° à 5 m
  margeDeg: 3,          // ajoutée à l'angle de la tête : le centre de l'écran n'a pas besoin d'être pile sur elle
  coneDeg: 70,          // une personne voit Viktor s'il est à 70° ou moins de sa face, ligne de vue libre
  coneAlerteDeg: 110,   // son cône quand elle est alertée : elle le suit des yeux
  oubli: 2,             // regard détourné, le temps de fixation redescend deux fois plus vite qu'il n'est monté
  tolerance: {          // secondes de fixation tolérées avant d'être remarqué, selon qui l'on fixe
    escorte: 1.2,       // un homme du colonel : les plus vifs
    civil: 2,           // Lise, un ouvrier
    fernand: 3,         // le patron, qui en a vu d'autres
    albert: Infinity,   // jamais : Albert ne quitte pas la course des yeux
  },
  verre: 1.3,           // tolérances multipliées par ce facteur quand Viktor est assis avec un verre
  alerteS: 10,          // une fois remarqué, la personne reste alertée ce temps (cône à 110°, tête qui suit Viktor)
  repliquesS: [0, 1.5, 3],   // ses répliques : à la tolérance dépassée, puis 1,5 s et 3 s plus tard si la fixation dure
}

// ─── La jauge de soupçon (§3.6) ────────────────────────────────────
// S va de 0 à 100 (src/bar/soupcon.js). À chaque image, ou bien S monte (une source est active et quelqu'un voit Viktor :
// somme des montées × poids du témoin le plus sévère), ou bien il redescend vers le plancher, jamais les deux. Les
// événements le montent d'un coup, et certains montent aussi le plancher : les fautes laissent une trace.
export const SOUPCON = {
  temoins: {            // poids du témoin le plus sévère qui voit Viktor : la hausse en est multipliée
    escorte: 1,         // un homme du colonel
    fernand: 0.8,       // le patron
    civil: 0.5,         // Lise, un ouvrier
    albert: 0,          // ne voit rien, un abri : seul témoin, Viktor est hors de la vue de tous
  },
  montees: {            // par seconde, additionnées, seulement si quelqu'un voit Viktor (× poids du témoin)
    fixation: 10,       // fixer quelqu'un au-delà de sa tolérance, × poids de la personne fixée
    tropPres: 6,        // debout à moins de tropPresM d'un homme de l'escorte
    zonePrivee: 2.5,    // debout en zone privée (autour des tables A et B), sans couverture (ni verre ni prétexte)
    zonePriveePretexte: 0.5,   // la même avec un prétexte (fléchettes, attente des toilettes)
    zoneInterdite: 12,  // derrière le zinc ou dans l'arrière-cuisine (Fernand voit toujours le zinc)
  },
  deboutSeulement: ['tropPres', 'zonePrivee', 'zonePriveePretexte'],   // assis ou posé, ces montées ne comptent pas
  tropPresM: 1.3,       // en deçà de cette distance d'un homme de l'escorte, Viktor debout est trop près
  evenements: {         // montée immédiate de S et du plancher, en points
    remarque: {         // une tolérance de fixation dépassée, une fois par épisode (§3.5), selon qui remarque
      escorte: { s: 12, plancher: 10 },   // remarqué par un homme du colonel
      civil: { s: 6, plancher: 3 },       // par Lise ou un ouvrier
      fernand: { s: 4, plancher: 2 },     // par Fernand
    },
    surprisZoneInterdite: { s: 25, plancher: 10 },   // surpris derrière le zinc ou dans l'arrière-cuisine
    presenceTables: { s: 10, plancher: 5 },          // presenceTablesS cumulées près d'une table de l'escorte
    sansCommande: { s: 10, plancher: 0 },            // COUVERTURE.sansCommandeS sans rien commander (Lise s'en mêle)
    silence: { s: 8, plancher: 0 },                  // la minuterie d'une réponse expire
    silenceSorel: { s: 10, plancher: 0 },            // la même face à Sorel (sa question revient une fois)
    flechettes: { s: 15, plancher: 0 },              // trois fléchettes dans le mille (bonus) : Mattei le remarque
  },
  presenceTablesS: 90,  // temps cumulé près d'une table de l'escorte avant l'événement presenceTables ; le compteur repart
  presenceTablesM: 3,   // distance au centre d'une table de l'escorte (A, B) en deçà de laquelle ce temps compte
  baisses: {            // par seconde, quand rien ne monte, sous le regard de quelqu'un, selon la pose de Viktor
    debout: 3,          // debout, ou accoudé sans verre
    assis: 3,           // assis sans verre : comme debout, la lecture la plus dure (décision 10 de la spec, ouverte)
    pose: 5,            // posé (§3.7) : assis, ou accoudé au mange-debout, un verre à la main
  },
  baisseHorsDeVue: 5,   // par seconde quand personne ne voit Viktor (Albert ne compte pas), quelle que soit sa pose
  plancherMax: 55,      // le plancher ne monte jamais plus haut ; à 52 ou plus, il garde en SOUPÇON qui l'a atteint
                        // (le §3.6 se contredit là-dessus : décision 9 de la spec, ouverte ; 55 en attendant)
  paliers: {            // entrée à « monte », sortie seulement sous « redescend » : l'écart évite le clignotement
    mefiance: { monte: 30, redescend: 22 },   // MÉFIANCE : l'escorte baisse la voix, des regards vers Viktor
    soupcon: { monte: 60, redescend: 52 },    // SOUPÇON : renseignements reportés, Sorel ou Dussart s'approche
    demasque: { monte: 100 },                 // DÉMASQUÉ : S plafonne là ; on n'en redescend pas, le bar échoue
  },
  effets: {             // ce que les paliers changent ailleurs (écoute, personnages, soirée)
    voixEscorte: ECOUTE.voix.baissee,   // dès MÉFIANCE, l'escorte parle plus bas : mots-clés à 2,1 m au lieu de 3,0 m (§3.4)
    regardS: [8, 12],   // dès MÉFIANCE, un homme de l'escorte jette un regard vers Viktor toutes les 8 à 12 s
    reportS: 20,        // en SOUPÇON, un échange porteur d'un renseignement est retenté toutes les 20 s
    reportEssais: 2,    // deux fois, puis il est perdu
  },
}

// ─── La couverture (§3.7) ──────────────────────────────────────────
// Le verre (servi par Fernand ou Lise) et les prétextes coupent ou adoucissent la montée de la zone privée ; posé (assis,
// ou accoudé au mange-debout, un verre à la main), Viktor redescend plus vite (SOUPCON.baisses.pose). Assis ou posé, ni
// « trop près » ni la zone privée ne montent (SOUPCON.deboutSeulement, appliqué par la jauge).
export const COUVERTURE = {
  sansCommandeS: 60,    // sans verre au bout de ce temps : événement sansCommande de la jauge, et la réplique de Lise
  toilettesS: [240, 300],   // le routier occupe le WC de 240 à 300 s : attendre devant la porte est un prétexte
  jukeboxMaintienS: 1,  // mettre une pièce dans le juke-box (un prétexte) : E maintenu ce temps
}

// ─── Les dialogues à choix (§3.8) ──────────────────────────────────
// Décision 7 de la spec (G4), tranchée le 28 octobre 2026 : 10 s, 6 s face à Sorel. Le déroulé (src/bar/dialogue.js) :
// une réplique dure son estimation (350 + 62 × longueur ms, src/briefing/kit.js:10), frappée en 0,8 de ce temps.
export const DIALOGUE = {
  minuterieS: 10,       // temps pour choisir une réponse en conversation ; à l'échéance, le silence
  minuterieSorelS: 6,   // le même face à Sorel, qui n'attend pas
  choixApresS: 0.6,     // les choix s'affichent ce temps après la fin de la frappe de la question, et la minuterie part
  enchainementS: 0.4,   // entre deux répliques qui se suivent, comme les lignes des fiches de l'enquête (investigation.js:274)
  ticsS: [1.5, 1, 0.5], // clock() quand il reste ces temps à la minuterie : toutes les 0,5 s sur la dernière 1,5 s
}
