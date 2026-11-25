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

// ─── Les voix bipées (§3.2, §3.4) ──────────────────────────────────
// Chaque personne parle en bips (src/bar/voix.js), sur la recette de la voix des cinématiques (src/briefing/sound.js:51-63),
// mais au temps de jeu (update) et tirée à graine. À chaque pas (pasS divisé par le débit), la voix se tait un moment
// (pauses), laisse passer le pas (saut) ou dit une syllabe : une dent de scie de hauteur tirée entre f0Min et f0Max, qui
// part jusqu'à glissement au-dessus et retombe à chute, d'une durée et d'une crête tirées dans leurs bornes ; puis le
// timbre de la personne (un passe-bande et un passe-bas fixes) et son niveau. Ce que l'écoute en laisse (gain selon la
// distance et les murs, coupure, panoramique : reglageBips de src/bar/voix.js) suit, dans la chaîne de la personne.
const VOIX_SALLE = {    // une voix de la salle, sans filtre de radio : le timbre « phone » de sound.js
  f0Min: 100,           // hauteur la plus basse d'une syllabe (Hz)
  f0Max: 175,           // la plus haute (Hz)
  debit: 1,             // pas par seconde rapportés à 8 (un pas toutes les 0,125 s, sound.js:51) : plus, plus rapide
  pauses: 0.12,         // probabilité, à chaque pas, de se taire un moment : plus, plus rare
  pauseS: [0.25, 0.65], // durée d'un de ces silences (s)
  saut: 0.2,            // probabilité de laisser passer un pas sans syllabe
  syllabeS: [0.05, 0.16],   // durée d'une syllabe (s) : plus court, plus haché
  glissement: 0.25,     // une syllabe part jusqu'à 25 % au-dessus de sa hauteur…
  chute: 0.85,          // … et retombe à 85 % de sa hauteur…
  chuteS: 0.11,         // … en ce temps (s) : l'intonation d'une syllabe
  attaqueS: 0.015,      // montée d'une syllabe jusqu'à sa crête (s)
  crete: [0.5, 0.9],    // crête d'une syllabe, tirée entre ces bornes : un écart large fait des éclats
  bande: { hz: 950, q: 0.8 },   // passe-bande du timbre : là où la voix sonne
  passeBas: 2600,       // passe-bas du timbre (Hz) : plus bas, plus sourd
  niveau: 0.45,         // niveau de la voix entendue de près, sans mur (gain de l'écoute à 1)
  ligne: null,          // lit de ligne d'une voix au téléphone, { hz, q, niveau } : un bruit passe-bande sous les syllabes,
                        // ouvert tant qu'elle parle, avant le niveau et l'écoute (le crépitement de voice, sound.js:42-46)
}
const voix = plus => ({ ...VOIX_SALLE, ...plus })
export const VOIX = {
  pasS: 0.125,          // un pas, au débit 1 : une syllabe peut partir à chaque pas
  seuilGain: 0.001,     // sous ce gain, une voix ne bipe pas (on ne l'entendrait pas), mais sa réplique avance
  retardMaxS: 0.05,     // une syllabe due depuis plus longtemps (un grand pas de temps) ne sonne pas : jamais de rafale
  lissageS: 0.03,       // constante de temps des réglages de la chaîne : gain, coupure, panoramique sans craquement (s)
  coupureOuverteHz: 18000,   // la coupure d'une voix quand l'appelant n'en donne pas (Viktor : rien ne l'assourdit)
  defaut: VOIX_SALLE,
  timbres: {            // une voix par personne (§3.2), aux clés de PERSONNES (src/bar/textes.js)
    fernand: voix({ f0Min: 85, f0Max: 110, debit: 0.75 }),             // lent
    dussart: voix({ f0Min: 78, f0Max: 100, syllabeS: [0.04, 0.09] }),  // syllabes courtes
    lenoir: voix({ f0Min: 120, f0Max: 160, debit: 1.3 }),              // rapide
    mattei: voix({ f0Min: 100, f0Max: 130, crete: [0.3, 1] }),         // éclats
    haas: voix({ f0Min: 60, f0Max: 80, pauses: 0.35 }),                // rare
    sorel: voix({ f0Min: 95, f0Max: 120, pauses: 0.05, saut: 0.1, syllabeS: [0.08, 0.12] }),   // régulier
    lise: voix({ f0Min: 190, f0Max: 260, debit: 1.3, bande: { hz: 1150, q: 0.8 } }),           // rapide, la seule voix de femme
    albert: voix({ f0Min: 90, f0Max: 120 }),
    // le combiné du téléphone : le timbre « phone », plus grave (100 à 175 Hz dans sound.js), bande étroite et nasillarde,
    // avec le lit de ligne de « phone » (bruit à 1 800 Hz, 0,022 : sound.js:44-45), à juger à l'écoute (B19)
    colonel: voix({ f0Min: 70, f0Max: 100, bande: { hz: 1000, q: 1.6 }, ligne: { hz: 1800, q: 1, niveau: 0.022 } }),
    'ouvrier-1': voix({ f0Min: 95, f0Max: 150, bande: { hz: 700, q: 0.7 }, passeBas: 900 }),   // bruit de salle, comme le brouhaha
    'ouvrier-2': voix({ f0Min: 110, f0Max: 180, bande: { hz: 700, q: 0.7 }, passeBas: 900 }),
    // Viktor : la voix intérieure des cinématiques (« inner », sound.js:54-58), qu'aucun mur n'assourdit
    viktor: voix({ f0Min: 72, f0Max: 107, bande: { hz: 700, q: 0.8 }, passeBas: 1600, niveau: 0.4 }),
  },
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

// ─── La soirée (§3.9) ──────────────────────────────────────────────
// L'horloge et le programme du Bivouac (src/bar/seance.js). Les échanges partent à l'instant que leur donne
// src/bar/textes.js (ECHANGES, t) ; la soirée place ceux qui n'en ont pas, et décide du reste : l'entrée de Sorel, la
// sonnerie de l'appel, D2, la piste, la fin et la sortie.
export const SEANCE = {
  debutMin: 18 * 60 + 10,   // 18:10, l'heure à l'entrée de Viktor
  minuteS: 10.5,        // secondes de jeu par minute de la soirée : de 18:10 à 18:50 en 420 s, « 18:36 » à 273 s
  enchainementS: DIALOGUE.enchainementS,   // entre deux répliques d'un échange, comme dans un dialogue
  placesS: {            // l'instant des échanges sans heure dans src/bar/textes.js
    ouvriers: 10.5,     // 18:11 : la cimenterie, au mange-debout de la porte, quand Viktor vient d'entrer à côté d'eux
  },
  silenceEntreeSorelS: 3,   // Sorel entre (18:30) : clochette, les tables se taisent ce temps, puis il commande au zinc
  sonnerie: { coups: 3, intervalleS: 1.5 },   // L'APPEL : trois sonneries, une par intervalle, puis Fernand décroche
  d2S: 315,             // 18:40 : Sorel s'approche de Viktor (D2) ; plus tôt dès SOUPÇON, une fois Sorel entré
  pisteS: 150,          // rien d'appris à cet instant : Viktor pense « Ils ne parleront pas devant le zinc. » (une fois)
  sortieAutoS: 6,       // après « Le 7 a gagné. » d'Albert, Viktor sort de lui-même au bout de ce temps
  reportS: SOUPCON.effets.reportS,          // en SOUPÇON, un échange porteur d'un renseignement est retenté toutes les 20 s
  reportEssais: SOUPCON.effets.reportEssais,   // deux fois, puis il est perdu
  sortieSoupcon: SOUPCON.paliers.soupcon.monte,   // passer la porte avec S à 60 ou plus : Sorel le suit, démasqué (§3.6)
  toilettesS: COUVERTURE.toilettesS,        // le routier occupe le WC de 240 à 300 s : l'attendre est un prétexte (§3.7)
}

// ─── Le convoi selon les renseignements (§5.1) ─────────────────────
// Ce que le convoi (sous-lot 3d du lot 3) doit à ce que Viktor a appris au bar (effetsSurLeConvoi,
// src/bar/renseignements.js). Jamais de pile ou face : un renseignement manquant coûte du temps, de la vitesse ou tend un
// piège visible, jamais une devinette. Valeurs de départ, à régler en 3d en jouant.
export const CONVOI = {
  fenetre: {            // la fenêtre de tir, selon le poste (TRAJET)
    virage: { dureeS: 13.5, barre: true, freinage: true },        // TRAJET appris : l'épingle du calvaire (le M5 de la spec
                        // du lot 3 : 13,5 s à 8,5 m/s), barre FENÊTRE DE TIR à l'entrée, freinage et feux stop
    ligneDroite: { dureeS: 9, barre: false, freinage: false },    // TRAJET manqué (décision 2, G1) : la butte à 140 m de la
                        // ligne droite, 12,5 m/s (115 m de route), ni freinage, ni feux stop, ni barre
  },
  arrivee: {            // quand la mission commence, et le stress de Viktor à ce moment (HEURE)
    calme: { avantFenetreS: 40, stressDepart: 0 },   // HEURE apprise : environ 40 s de calme avant que la jeep 2 n'entre dans la fenêtre
    juste: { avantFenetreS: 8, stressDepart: 0.5 },  // HEURE manquée : la jeep 2 à 8 s de la fenêtre, Viktor essoufflé ; le
                        // stress retombe de 0,5 par seconde lunette fermée (STRESS.descenteParS, src/shot/tuning.js) : la
                        // seconde de calme est prise sur la fenêtre
  },
  pointsParRenseignement: 50,   // bonus du rapport par renseignement (§5.3) ; le +100 d'un bar sans MÉFIANCE vient de la
                        // couverture, hors de ce contrat (tâche B17)
}

// ─── Le son de la salle (§3.12) ────────────────────────────────────
// La salle du Bivouac (src/bar/son.js) : brouhaha, verres, juke-box, tiercé à la télé, clochette et porte, sonnerie du
// téléphone, cœur, NOTÉ, pas, et sa réverbération. Tout est procédural, tiré à graine, et n'avance que par update(dt) ;
// en pause, plus de syllabes, et la musique 10 dB plus bas. Les sons ponctuels reprennent les recettes du kit des
// cinématiques (tone et noise de src/briefing/sound.js) et de l'enquête (src/prologue/ambience.js).
export const SON = {
  graine: 0x0b1fa0c5,   // graine du hasard de la salle : la même soirée sonne pareil d'une partie à l'autre
  lissageS: 0.03,       // constante de temps des réglages continus (juke-box, télé) : pas de craquement (s)
  reverberation: {
    acoustique: 'interieur',   // réponse impulsionnelle de src/shot/acoustics.js : une pièce, courte et sourde
    envoiDb: -20,       // part des voix et des verres envoyée dans la réverbération (dB)
  },
  brouhaha: {           // la salle qui parle, continue : trois générateurs de syllabes et un lit de bruit sourd
    timbre: voix({ f0Min: 90, f0Max: 220, bande: { hz: 700, q: 0.7 }, passeBas: 900, niveau: 0.3 }),   // un générateur
    pans: [-0.6, 0, 0.6],   // un générateur par panoramique : la salle à gauche, devant, à droite
    lit: { passeBas: 400, niveau: 0.05 },   // le lit de bruit sous les syllabes : coupé à 400 Hz, son niveau
    niveau: 0.5,        // niveau du brouhaha, salle pleine, au calme
    presentsPlein: 8,   // présents d'une salle pleine : le niveau suit présents / 8, plafonné à 1
    canard: [           // le soupçon fait taire la salle : facteur du niveau dès que S atteint « des » (le plus haut d'abord)
      { des: 85, facteur: 0.35 },
      { des: SOUPCON.paliers.soupcon.monte, facteur: 0.7 },
    ],
    demasque: { facteur: 0.1, dureeS: 0.8 },   // démasqué : la salle se tait, à 0,1 de son niveau en 0,8 s (§3.10)
    lissageS: 0.3,      // constante de temps des autres changements de niveau du brouhaha (s)
  },
  verres: {             // un verre qui tinte quelque part dans la salle
    partielsHz: [2600, 3900, 5300],   // trois partiels sinus
    amplitudes: [1, 0.55, 0.3],       // le plus grave domine
    niveau: 0.04,       // niveau du premier partiel
    declinS: [0.25, 0.4],   // déclin d'un tintement, tiré entre ces bornes (s)
    intervalleS: [3, 8],    // d'un verre au suivant, tiré entre ces bornes (s)
    panMax: 0.6,        // panoramique tiré entre −panMax et panMax
  },
  jukebox: {            // la musique du juke-box (recette de music, sound.js:78-96), continue, même en pause
    accords: [          // quatre accords en la mineur (la m, ré m, fa, mi) : basse et nappe (Hz)
      { basse: 110, notes: [220, 261.63, 329.63] },
      { basse: 73.42, notes: [220, 293.66, 349.23] },
      { basse: 87.31, notes: [220, 261.63, 349.23] },
      { basse: 82.41, notes: [207.65, 246.94, 329.63] },
    ],
    bpm: 84,            // tempo de la basse : un coup par temps
    tempsParAccord: 4,  // temps par accord : une mesure de 2,86 s
    motif: [1, 1, 1.5, 1],   // la basse de chaque temps : fondamentale, fondamentale, quinte, fondamentale
    nappe: 0.05,        // niveau de chaque note de la nappe (sound.js:93)
    nappeAttaqueS: 0.9, // montée de la nappe (sound.js:89) (s)
    basse: 0.12,        // niveau de la basse en triangle
    basseS: 0.45,       // durée d'une note de basse (s)
    craquements: { parS: 6, niveau: 0.3, souffle: 0.008, boucleS: 3 },   // le disque : clics par seconde, leur niveau, le souffle, la boucle (s)
    coupure: { baseHz: 450, plageHz: 3000 },   // passe-bas 450 + 3 000 × T Hz : les murs et la salle l'assourdissent
    niveau: 0.6,        // niveau du juke-box
    pauseDb: -10,       // en pause, la musique continue, baissée d'autant (dB)
    avanceS: 0.1,       // les notes se programment ce temps à l'avance sur l'horloge audio : un tempo sans à-coups (s)
  },
  tierce: {             // la télé à tube : le tiercé, une voix rapide et nasillarde, par bouffées
    timbre: voix({ f0Min: 140, f0Max: 230, debit: 1.6, pauses: 0.04, saut: 0.1, bande: { hz: 1800, q: 3 }, passeBas: 3500, niveau: 0.18 }),
    bouffeeS: [4, 9],   // durée d'une bouffée du commentateur, tirée entre ces bornes (s)
    silenceS: [6, 15],  // silence entre deux bouffées, tiré entre ces bornes (s)
  },
  clochette: {          // la clochette de la porte : entrées, départ
    partielsHz: [1900, 2600], amplitudes: [0.07, 0.045], dureeS: 0.6,   // deux partiels sinus, leur niveau, leur durée (s)
    grincement: {       // le grincement de la porte de l'enquête (ambience.js:92)
      bruit: { hz: 520, finHz: 240, q: 9, dureeS: 1.6, niveau: 0.07 },
      ton: { hz: 95, finHz: 70, dureeS: 1.3, niveau: 0.03 },
    },
  },
  sonnerie: {           // le téléphone mural : une sonnerie à cloche, frappée par son marteau (trois à 273 s, B6)
    partielsHz: [1180, 1520],   // les deux timbres de la cloche
    dureeS: 1,          // durée d'une sonnerie (s)
    frappesParS: 20,    // coups de marteau par seconde
    niveau: 0.05,       // niveau d'un coup
    reste: 0.15,        // ce que la cloche garde de son niveau entre deux coups
    traineS: 0.25,      // après la dernière frappe, la cloche sonne encore ce temps en s'éteignant (s)
  },
  coeur: {              // le battement du kit (heart, sound.js:122), dès SOUPÇON
    coups: [            // les deux coups d'un battement : hauteur, glissée jusqu'à finHz, durée, crête, retard (s)
      { hz: 58, finHz: 40, dureeS: 0.16, crete: 0.8, retardS: 0 },
      { hz: 52, finHz: 36, dureeS: 0.2, crete: 0.6, retardS: 0.22 },
    ],
    niveau: 0.6,        // le cœur de l'enquête (HEART_GAIN, src/prologue/ambience.js)
    intervalleS: [1.1, 0.6],   // d'un battement au suivant : 1,1 s à S = soupcon[0], 0,6 s à soupcon[1], linéaire entre
    soupcon: [SOUPCON.paliers.soupcon.monte, SOUPCON.paliers.demasque.monte],
  },
  note: {               // NOTÉ : le papier (paper, sound.js:115) et le crayon qui gratte
    papier: { hz: 2200, finHz: 3800, q: 0.8, dureeS: 0.22, niveau: 0.12 },
    crayon: { hz: 3500, q: 2, dureeS: 0.3, traits: 3, niveau: 0.05, retardS: 0.12 },   // traits : trois coups de crayon
  },
  pas: {                // un pas de Viktor (amb.step, ambience.js:96), sur le parquet
    bruit: { hz: 420, dureeS: 0.07, niveau: 0.1 },
    ton: { hz: 68, dureeS: 0.09, niveau: 0.12 },
    bois: { hz: 1100, q: 4, dureeS: 0.03, niveau: 0.03 },   // le parquet qui claque un peu
  },
}

// ─── La salle (§3.1, §8, §9) ───────────────────────────────────────
// Le décor du Bivouac (src/bar/salle.js) : brouillard, lumières et ce qui bouge dans la salle. La géométrie (cotes des
// meubles, couleurs des matières) reste dans salle.js, comme celle de l'appartement de l'enquête ; ici, ce qui se règle à
// l'œil en jouant. Les intensités sont en unités physiques de three (r185) : le renderer du jeu les rend en ACES, à
// l'exposition de 1,35 (src/scene.js).
export const DECOR = {
  graine: 0x0b1f5a11,   // graine du hasard du décor (bouteilles, usure, rythme du néon et de la télé) : la même salle à chaque montage
  brouillard: { couleur: 0x1a120c, pres: 7, loin: 22 },   // Fog de la salle : brun chaud, sans effet à moins de 7 m, opaque à 22 m
  soleil: {             // le soleil de 18 h, bas, à travers la vitrine et ses stores : la seule lumière qui projette une ombre
    couleur: 0xffb070,
    intensite: 7,       // sans décroissance (un soleil) : les lames de lumière au sol et sur les murs
    vise: [2.6, 1.2, 4],   // où il vise (x, y, z) : le milieu de la vitrine ; il est posé dehors, à « distance » de ce point
    hauteurDeg: 14,     // au-dessus de l'horizon : un soleil bas, de 18 h
    azimutDeg: 40,      // depuis le sud (la vitrine), vers l'ouest : ses lames filent vers le nord-est de la salle
    distance: 40,       // assez loin pour que ses rayons soient presque parallèles (m)
    angle: 0.13,        // demi-ouverture du cône (rad) : toute la vitrine, vue de 40 m
    penombre: 0.1,      // bord du cône adouci
    carte: 1024,        // côté de la carte d'ombre (spec §8)
  },
  ciel: { haut: 0xe0b080, bas: 0x7a5030, intensite: 2.2 },   // l'hémisphère : la salle se lit sans source visible ; en bas, ce que renvoie le parquet
  lampes: {             // les quatre PointLight sans ombre (spec §8) : couleur, intensité, portée (m)
    zinc: { couleur: 0xffa458, intensite: 7, portee: 7 },      // les globes au-dessus du zinc
    tele: { couleur: 0x9ab4ff, intensite: 1.4, portee: 4 },     // la télé du tiercé
    couloir: { couleur: 0xffd090, intensite: 2.4, portee: 4.5 }, // l'ampoule nue du couloir des toilettes
    jukebox: { couleur: 0xff7038, intensite: 1.6, portee: 3 },   // le juke-box et ses tubes de couleur
  },
  neon: {               // « LE BIV UAC » : le O mort essaie parfois de se rallumer (jamais plus de 3 éclats par seconde, §9)
    mort: 0.02,         // éclat du O éteint (multiplie sa couleur) : un tube froid qu'on devine ; à 0,045, le O se lisait
                        // encore et l'enseigne disait « LE BIVOUAC » (captures de la relecture de B9)
    allume: 1,          // éclat du O quand il se rallume
    reposS: [7, 13],    // entre deux salves, le O reste mort, tiré entre ces bornes (s)
    eclats: [1, 3],     // nombre d'éclats d'une salve, tiré entre ces bornes
    eclatS: [0.06, 0.12],   // durée d'un éclat (s)
    entreS: [0.34, 0.45],   // d'un début d'éclat au suivant, dans une salve (s) : plus de 1/3 s, jamais plus de 3 par seconde
                        // même si une salve en comptait plus de 3 (tests/bar/salle.test.js)
  },
  tele: {               // le tiercé : la course défile, la lumière change à chaque plan (pas de scintillement)
    defilement: 0.07,   // tours de la bande de la course par seconde ; effets atténués : la course reste fixe (§9)
    planS: [2.5, 6],    // durée d'un plan, tirée entre ces bornes (s)
    eclat: [0.55, 1],   // éclat d'un plan, tiré entre ces bornes ; effets atténués : la moyenne, fixe
  },
  ventilateur: { toursParS: 0.7 },   // le ventilateur du plafond : tours par seconde (au temps de jeu)
}

// ─── Les patrons (§3.2) ────────────────────────────────────────────
// Les personnes du Bivouac (src/bar/patrons.js) : qui joue qui, et comment le corps bouge par-dessus les clips des
// modèles (les 7 GLB ont les mêmes 20 clips). La teinte remplace la couleur des matériaux de la personne (copiés), qui
// multiplie leur texture, comme dans characters.js (blanc : la texture telle quelle) ; avec la pénombre et le tablier,
// elles écartent les sosies (§12, risque 1) : à juger sur captures.
export const PATRONS = {
  graine: 0x0b1fb10a,   // graine du casting : tailles, instants et vitesses des clips, la même salle à chaque montage
  casting: [            // dix personnes (§8 : ≤ 10, ≤ 300 000 triangles, ≤ 40 maillages animés, aucun gangster_man_01)
    // siege : un siège de SIEGES (src/bar/plan.js) ; poste : une ancre de ANCRES où la personne se tient debout
    { role: 'fernand', modele: 'gangster_man_02', teinte: 0xd6cfc6, poste: 'fernand', accessoire: 'verre' },   // âgé, il essuie un verre
    { role: 'dussart', modele: 'mafia_boss', teinte: 0xd9d6d0, siege: 'A-sud' },          // dos au mur, sur la banquette
    { role: 'lenoir', modele: 'mafia_boss', teinte: 0xffffff, siege: 'A-nord' },          // teinte claire : la texture telle quelle
    { role: 'mattei', modele: 'mafia_boss', teinte: 0xcfcbd6, siege: 'B-sud', accessoire: 'cartes' },
    { role: 'haas', modele: 'mafia_boss', teinte: 0xc9cec2, siege: 'B-nord', accessoire: 'cartes' },
    { role: 'sorel', modele: 'mafia_boss', teinte: 0x8e8e98, poste: 'sorel.entree', absent: true },   // sombre ; entre à 18:30
    { role: 'lise', modele: 'mafia_woman_03', teinte: 0xffffff, poste: 'lise.zinc', lacet: Math.PI / 2, accessoire: 'tablier' },
    { role: 'albert', modele: 'gangster_man_02', teinte: 0xc4bcaf, siege: 'D-nord' },     // face à la télé
    { role: 'ouvrier-1', modele: 'gangster_man_02', teinte: 0xaebccb, poste: 'ouvriers.0', accessoire: 'verre' },   // bleu de travail
    { role: 'ouvrier-2', modele: 'gangster_man_02', teinte: 0xcbb99f, poste: 'ouvriers.1', accessoire: 'verre' },
  ],
  clips: {
    assis: { chaise: 'Sit', banquette: 'Talk', tabouret: 'Talk' },   // le clip d'une personne assise, selon son siège
    debout: 'Idle',     // debout, sur place
    marche: 'Walk',     // en marche
    gestes: ['Look', 'Point', 'Threaten', 'Wave'],   // sur ordre, le haut du corps seul (le bas garde sa pose)
    vitesse: [0.92, 1.08],   // vitesse d'un clip, tirée à graine entre ces bornes : personne ne bouge en même temps
    fonduS: 0.35,       // passage d'un clip à l'autre (s), en courbe douce, sans à-coup
  },
  assise: {             // le corps posé sur son siège (chaise 0,45 m, tabouret 0,75 m, banquette 0,45 m)
    enfoncementM: 0.025,   // il s'y enfonce au plus de tant : la planche de la chaise (3 cm) cache le dessous des cuisses
    rayonM: 0.2,        // l'assise, autour du bassin : ce qui la touche (le bas des fesses et des cuisses)
    piedsMaxM: 0.04,    // sur une chaise ou la banquette, les pieds au plus à tant du sol : qui est trop petit pour sa chaise
                        // (un petit gangster_man_02 en Sit, relevé jusqu'à l'assise, les avait à 6,2 cm) grandit au montage
                        // jusqu'à les y poser (§10 : « pieds au sol », à moins de 5 cm)
  },
  tete: {               // la tête tournée par-dessus le clip (os Head et Neck), vers l'interlocuteur ou vers Viktor
    maxDeg: 70,         // jamais plus loin de la face du corps
    tangageMaxDeg: 25,  // vers le haut ou vers le bas
    reponseS: 0.45,     // le temps de tourner la tête vers ce qu'elle suit (ressort amorti : départ et arrivée en douceur)
    partCou: 0.4,       // la part du cou dans la rotation, le reste à la tête
    hochementDeg: 4,    // qui parle hoche la tête de tant…
    hochementHz: 1.7,   // … à ce rythme
    hochementFonduS: 0.4,   // le hochement vient quand on se met à parler et s'en va quand on se tait, en tant (s)
  },
  marche: {
    vitesse: 1.1,       // m/s : Lise et Sorel marchent sans se presser (Viktor : 1,6 m/s)
    vitesseClip: 1.25,  // m/s qu'avance le clip Walk à sa vitesse (estimé) : le pas suit le sol ; à juger sur la marche
                        // de Lise (risque 5 : la marche qui glisse)
    rayonM: 0.25,       // l'emprise au sol de qui marche (moveCircle, itinéraires)
    virageS: 0.3,       // le temps de se tourner vers où l'on va
    arriveeM: 0.03,     // arrivé à un point de passage à moins de tant
    bloqueS: 0.8,       // retenu par une boîte sans avancer pendant tant : la marche s'arrête (bloque)
    retenuSous: 0.2,    // une image où l'on avance de moins de cette part de son pas compte comme retenue (bloqueS)
  },
  lever: {
    dureeS: 0.9,        // se lever ou s'asseoir (s)
    demi: 0.5,          // « il se lève à demi » : la pose debout à moitié
    reculM: 0.47,       // debout, il recule de tant derrière sa chaise ou son tabouret (passé la moitié du lever) : sur
                        // place, l'assise et le dossier lui traversaient les jambes. Mesuré sur les GLB en Idle, au plus
                        // grand de heightVar : 0,45 m pour mafia_boss (armure et bras devant lui), 0,40 m pour les deux
                        // autres ; 0,38 m sur un tabouret (revue de B10). Jamais sur la banquette, adossée au mur
  },
  ombre: {              // l'ombre de contact peinte sous chacun (aucun personnage ne projette d'ombre : §3.2, §8)
    assis: [0.8, 1.0],  // largeur et profondeur (m) sous une personne assise, ses pieds devant elle
    debout: [0.6, 0.6], // sous une personne debout
    opacite: 0.5,       // au plus noir, sous le bassin : une ombre douce, pas une tache
    avantAssisM: 0.18,  // assis, son centre avance de tant devant le bassin : sous les cuisses, vers les pieds
  },
  capsule: { rayonM: 0.22, hauteurM: 1.0, sousTeteM: 0.4 },   // ce qu'on vise (E) : 1 m centré 0,4 m sous la tête, d'au-dessus d'elle au buste
}
