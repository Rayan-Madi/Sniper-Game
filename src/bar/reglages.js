// Réglages du Bivouac, le bar de M5 (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md) : toutes les valeurs de
// ressenti et d'équilibrage du bar, en un seul endroit, à part de src/shot/tuning.js (que le lot 3 réécrit en parallèle ;
// un renvoi d'une ligne y sera ajouté à la fusion). Module pur (ni DOM ni three). Chaque valeur dit en une ligne ce
// qu'elle change en jeu. « Fais le dur » (spec §0.1) : on part de ces valeurs exigeantes et on n'assouplit qu'en jouant.
// Catégories de personnes, communes au regard et à la jauge : escorte (Dussart, Lenoir, Mattei, Haas, Sorel), fernand,
// civil (Lise, les ouvriers), albert.

// ─── Le regard qui fixe (§3.5) ─────────────────────────────────────
// Viktor fixe une personne quand le centre de l'écran est à moins de atan(rayonTeteM / d) + margeDeg de sa tête (d : la
// distance), qu'elle le voit et qu'elle n'est pas son interlocuteur. Son temps de fixation monte tant que cela dure et
// redescend sinon ; au-delà de la tolérance, elle remarque Viktor (événement « remarque » de la jauge de soupçon).
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
    voixEscorte: 0.7,   // dès MÉFIANCE, l'escorte parle plus bas : mots-clés compris à 2,1 m au lieu de 3,0 m (§3.4)
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
// Décision 7 de la spec (G4), tranchée le 28 octobre 2026 : 10 s, 6 s face à Sorel.
export const DIALOGUE = {
  minuterieS: 10,       // temps pour choisir une réponse en conversation ; à l'échéance, le silence
  minuterieSorelS: 6,   // le même face à Sorel, qui n'attend pas
}
