# Cinématiques — design

> Sous-projet 1 sur 3 de la refonte de Sniper (cinématiques → gameplay → légèreté).
> Statut : **à valider par Rayan**. Rédigé le 2 octobre 2026.

## 1. Objectif

Remplacer les cinématiques 3D actuelles (`src/cinematic3d.js`), jugées « robotiques », par des cinématiques en **motion design** dans un style unique, le **« dossier du fixeur »**. Ce style doit à la fois raconter l'histoire et **servir le gameplay**, en montrant au joueur qui chercher, comment le reconnaître et d'où il tire.

Ce que le joueur doit ressentir : un écran de surveillance qui grésille, des dossiers qui s'ouvrent, une voix qui le guide, et une histoire de vengeance cohérente du prologue à l'épilogue.

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Style | Motion design 2D/2,5D en HTML/CSS/SVG par-dessus le jeu. Pas de 3D, sauf dans l'enquête jouable du prologue. |
| Habillage commun | Allumage CRT, scanlines, grain, ligne de tracking, glitchs aléatoires (déchirure horizontale + séparation rouge/cyan), coupures fortes aux changements de plan, « SIGNAL PERDU » avant le carton-titre. |
| Narrateur | **Anton, le fixeur** : marchand d'informations, jamais vu, uniquement une voix radio. Un peu cynique, parle de ses sources et de ce que l'info lui coûte, loyal envers Viktor. |
| Héros | **Viktor**, ancien tireur d'élite de l'armée. Le réseau a voulu le recruter, il a refusé par principe, et sa femme et sa fille ont été tuées pour le lui faire payer. Il parle en **voix intérieure**. |
| Lien Viktor ↔ Anton | Anton avait appris le contrat et a tenté de prévenir Viktor : appel manqué de 18:52 + message vocal « Viktor, sors ta famille de là. Maintenant. ». Trop tard. Viktor rappelle ce numéro. Anton l'aide d'abord par culpabilité. |
| Règle de cohérence | Viktor tire toujours depuis un poste éloigné et en hauteur. Anton ne dit jamais « tu entres ». |
| Voix | Pour l'instant, **bips synthétiques** (marmonnement radio procédural) + sous-titres tapés. Plus tard, une fois les textes figés : vraies voix (service de voix IA, offre gratuite à vérifier) jouées à travers un filtre radio ou téléphone. Les voix Windows sont écartées (effet « Siri »). |
| Son | 100 % procédural, comme `src/audio.js`, et soumis au volume général du jeu. |
| Corps | Toujours hors champ : drap, sang, doudou, marqueurs de police. Jamais de cadavre montré, surtout pas celui de l'enfant. |
| Casting | **Provisoire.** Les visages viennent des modèles 3D actuels, rendus en « photos de surveillance ». Le casting définitif sera traité à part. |

## 3. Périmètre

**Dans ce sous-projet :**
1. **Prologue**, en trois temps : cinématique du refus → **enquête jouable** dans l'appartement → cinématique de l'appel d'Anton et du tableau de chasse.
2. **Six briefings** de mission (M1 à M6), chacun avec sa propre pièce centrale.
3. **Épilogue**, en deux variantes selon le choix moral du port (M3).
4. La mécanique commune : passer au clavier ou au clic, ne jouer qu'au premier essai, pouvoir revoir le briefing.

**Hors périmètre** (traités plus tard) :
- **Cinématiques de mort des cibles (kill-cams).** Ce sont des moments 3D en jeu, qui demandent un prototype dans le moteur. Ce sous-projet prévoit seulement leur point d'accroche (§ 6.6).
- **Casting définitif des visages et voix finales.**
- **Intro PvP** (`src/pvpIntro.js`), qui reste inchangée.
- **Alignement des distances de tir.** Les briefings annoncent 31 à 430 m, alors que le jeu tire aujourd'hui entre 20 et 43 m. C'est à régler avec la refonte du gameplay.

## 4. Contenu

Les maquettes validées servent de référence exacte (textes, timing, mise en page). Elles sont dans `docs/superpowers/maquettes/cinematiques/` : `kit.css`, `kit.js`, `prologue.html`, `briefing-m1.html` à `briefing-m6.html`, `epilogue.html`, et `img/`.

| Cinématique | Pièce centrale | Durée |
|---|---|---|
| Prologue (cinématique 1) | Vue subjective : le téléphone en main, l'appel du recruteur (« Un tir, cent mille »), Viktor raccroche. | ~15 s |
| Prologue (enquête) | Appartement en vue à la première personne (§ 5). | 2 à 4 min (joueur) |
| Prologue (cinématique 2) | Message vocal d'Anton → rappel → « Je vends des infos… » → tableau de chasse épinglé fiche par fiche → titre « SNIPER ». | ~45 s |
| M1 — Markov | L'écoute téléphonique, le dossier, les victimes, le toit du marché. | ~40 s |
| M2 — Les frères | L'écran fendu en deux, les dossiers en miroir, les étiquettes de boucherie. | ~36 s |
| M3 — Le passeur | Vosko et Mira (agrandissement d'image de surveillance, fiches côte à côte, ordre de tir), le manifeste au second plan, la grue. | ~44 s |
| M4 — Les officiers | Le tableau en liège, les fils rouges, la vue satellite, le château d'eau. | ~39 s |
| M5 — Le convoi | Le colonel sans photo, la carte, le chrono de la fenêtre de tir, le schéma « vise devant ». | ~42 s |
| M6 — Le commanditaire | Le dossier caviardé, les sources barrées, l'invitation, le plan de la fête, la verrière. | ~45 s |
| Épilogue | Le mur barré, le dernier appel d'Anton, la variante du port, le cadre photo au matin. | ~50 s |

La cinématique 2 du prologue **remplace** le passage maquetté « couloir → cadre photo → rapport classé → Anton appelle », puisque ces moments deviennent jouables. On garde son tableau de chasse et sa conclusion. Il y a une adaptation : dans la maquette Anton appelle, alors qu'ici **Viktor rappelle**. L'écran du téléphone montre donc un appel sortant vers « NUMÉRO MASQUÉ » qui sonne puis décroche, et la première réplique d'Anton répond au rappel : *« Tu as eu mon message. Trop tard, je sais. »*

## 5. L'enquête jouable du prologue

**Intention :** le premier moment jouable apprend la compétence centrale du jeu, observer les détails pour comprendre et identifier. Il n'y a ni échec ni chrono.

**Déroulé :**
1. Le 14 mars, 21:47. Viktor arrive devant sa porte : elle est forcée.
2. Le joueur se déplace (ZQSD/WASD, ce sont les touches remappables `settings.pvpKeys`), regarde à la souris (verrouillage du pointeur) et examine avec **E** quand un objet est visé (surbrillance + « E — Examiner »).
3. Examiner un objet ouvre une **fiche d'indice** dans le style dossier, avec une phrase de Viktor en voix intérieure. Les indices prévus :
   - la serrure forcée ;
   - les traces de lutte dans l'entrée (meuble renversé, verre brisé) ;
   - le salon : deux corps sous un drap, du sang au sol, la photo de famille tombée et fêlée ;
   - la chambre de la petite : le doudou par terre ;
   - le mot laissé par les tueurs : *« Tu aurais dû dire oui. »* ;
   - le téléphone de Viktor, sur le meuble de l'entrée. Ce jour-là, il l'avait oublié en partant : c'est pour ça que l'avertissement ne lui est jamais parvenu. *« Ce jour-là, j'avais oublié mon téléphone. »*
4. Le téléphone ne s'ouvre qu'après au moins **4 indices**. Avant, l'examiner donne seulement une phrase de Viktor (*« Pas encore… Je dois comprendre ce qui s'est passé. »*) et il reste en surbrillance. Une fois débloqué, il affiche deux appels manqués :
   - « NUMÉRO MASQUÉ · 18:52 », avec un message vocal : celui d'Anton ;
   - « MAISON · 19:04 » : sa femme a essayé de le joindre.

   Le joueur écoute le message, puis choisit « Rappeler », et on passe à la cinématique 2.
5. **Ambiance :** nuit, lumière de rue par les fenêtres, pluie, battements de cœur près du salon, acouphène quand on examine les corps.

**Contraintes :**
- La scène reste légère : géométrie procédurale fusionnée, peu de lumières, **aucun modèle de personnage**, les corps étant des formes sous un drap.
- Elle se joue en moins de 4 minutes.
- Elle réutilise l'habillage du kit pour les fiches d'indice.
- Elle respecte les réglages de sensibilité et d'inversion de la souris (`sensMultiplier`, `invertY`).

## 6. Architecture dans le jeu

### 6.1 Le kit devient un module
- `src/briefing/kit.js` : portage de `kit.js` en module ES. Même contrat (`K.run({ beats })`, `say`/`who`/`cues`), mais monté dans un conteneur `#briefing-root` posé **au-dessus du canvas**, au lieu d'une page autonome.
- `src/briefing/kit.css`, importé par Vite.
- Une cinématique par module, `src/briefing/scenes/{prologue-a,prologue-b,m1…m6,epilogue}.js`. Chacun exporte `mount(root)` (son HTML) et `beats(K, ctx)`. Le HTML et le CSS de chaque maquette sont repris tels quels, préfixés par leur classe.
- Les images vont dans `public/briefing/` (portraits recompressés, environ 40 Ko chacun au lieu de 200 Ko). Elles sont chargées **à la demande**, juste avant leur cinématique.

### 6.2 Un seul point d'entrée
`playCinematic(id, { onDone, variant })` dans `src/briefing/index.js` :
- affiche `#briefing-root`, monte la scène et lance la séquence ;
- **met en pause le rendu WebGL** (`gamePhase = 'cinematic'` ne rend plus la scène 3D), ce qui économise la machine pendant les cinématiques ;
- permet de passer avec **Échap, Entrée, Espace ou un clic**, avec un fondu de sortie. Ça corrige le bug actuel où « APPUYER POUR PASSER » ne marchait qu'au clic ;
- à la sortie : démontage complet (minuteurs, nœuds audio, DOM), puis `onDone()`.

### 6.3 Branchement dans `main.js`
| Aujourd'hui | Demain |
|---|---|
| `startIntroCinematic` (`main.js:103`) | `playCinematic('prologue-a')` → `startInvestigation()` → `playCinematic('prologue-b')` → `launchLevel(1)` |
| `startLevelCinematic(n, …)` (`main.js:282`) | `playCinematic('m' + n)`, **seulement au premier essai** de la mission. Les réessais lancent directement `startLevel(n)`. |
| `startEndingCinematic` (`main.js:159`) | `playCinematic('epilogue', { variant: freed ? 'libres' : 'enfermes' })` |
| `updateCinematic(dt)` (`main.js:1037`) | Supprimé : le kit tourne avec ses propres minuteurs. |

- Le bouton **« Revoir le briefing »** apparaît sur l'écran d'échec et dans la pause.
- Les touches 1 à 6 sont **ignorées pendant une cinématique** (c'est un bug connu : un overlay orphelin restait affiché).

### 6.4 Son
Le moteur sonore du kit est fusionné avec `src/audio.js` : un seul `AudioContext`, et un nœud maître soumis à `setMasterVolume`. La musique de cinématique du kit (`tense`/`somber`/`dread`/`pulse`) remplace `startCinematicMusic`.

### 6.5 Voix (prévu pour plus tard)
Chaque réplique peut porter un identifiant (`voice: 'm1-03'`). Si `public/voices/m1-03.ogg` existe, il est joué à travers un filtre (passe-bande + légère saturation : radio pour Anton, téléphone pour les écoutes, aucun filtre pour Viktor), et le temps dure la durée du fichier. Sinon, on joue les bips. **Rien à enregistrer dans ce sous-projet.**

### 6.6 Point d'accroche des kill-cams
`playCinematic` accepte aussi de courtes séquences « surimpression » : un tampon « CIBLE NEUTRALISÉE », la fiche barrée, un mot d'Anton. La kill-cam 3D en jeu viendra s'y brancher plus tard. Elle est hors périmètre.

### 6.7 Enquête jouable
`src/prologue/` :
- `apartment.js` : la géométrie de l'appartement ;
- `fpsController.js` : déplacement et collisions avec la boîte englobante du joueur contre les murs ;
- `interact.js` : visée par rayon, surbrillance, touche E ;
- `clues.js` : les données des indices et leurs fiches.

Il y a une machine à états simple : `exploring` → `examining` (fiche ouverte, déplacement figé) → `phone` → fin.

### 6.8 Ce qu'on supprime
- `src/cinematic3d.js` : les cinématiques de mission, l'intro et la fin. Ça supprime aussi les décors jetables, qui laissaient environ 1 175 géométries en mémoire par partie.
- `src/cutscene.js`, du code mort.
- La musique et la voix téléphone de cinématique dans `src/audio.js`, une fois remplacées.

## 7. État et données

- **Choix moral :** `window.__freedVictims` est aujourd'hui sauvegardé mais **jamais remis à faux** (bug connu). On le remplace par un champ de la sauvegarde, `upgradeState.freedVictims`, remis à `false` au démarrage de la mission 3 et lors d'une nouvelle partie. L'épilogue le lit.
- **Briefing déjà vu :** `upgradeState.briefingSeen[n]`, pour ne rejouer qu'au premier essai. Il est réinitialisé à la nouvelle partie.

## 8. Budgets de performance

- Pendant une cinématique, **aucun rendu WebGL**.
- Pendant l'enquête : moins de 60 appels de dessin, moins de 50 000 triangles, une seule lumière qui projette une ombre (ou aucune).
- **Poids ajouté au téléchargement :** moins de 1,5 Mo au total (images recompressées, chargées à la demande).

## 9. Vérification

- **Mode capture** conservé comme outil de développement : `?cine=m3&freeze=12000` affiche une cinématique figée à un instant donné. Le script de capture en Chrome sans interface (déjà utilisé pour les maquettes) passe dans `scripts/` et produit une planche par cinématique.
- **Contrôles automatiques :** aucune erreur JavaScript sur une lecture complète de chaque cinématique (mode estimé), et démontage propre (plus aucun minuteur ni nœud audio actif après `onDone`).
- **Recette manuelle par Rayan :**
  - parcours complet du prologue à l'épilogue ;
  - passer chaque cinématique au clavier ;
  - réessai d'une mission sans revoir le briefing ;
  - « Revoir le briefing » ;
  - les deux variantes de l'épilogue ;
  - le volume coupé coupe tout.

## 10. Découpage en étapes

Une étape = un ensemble vérifié, commité, puis jouable par Rayan avant la suivante.

1. **Fondations :** module kit + `playCinematic` + pause du rendu + passer au clavier. M1 est branché à la place de la cinématique 3D du niveau 1.
2. **Les 5 autres briefings et l'épilogue**, avec la règle du premier essai, « Revoir le briefing » et la correction du choix moral.
3. **Les cinématiques du prologue** (A et B), branchées sans l'enquête : A enchaîne directement sur B.
4. **L'enquête jouable**, insérée entre A et B.
5. **Nettoyage** : suppression de `cinematic3d.js`, de `cutscene.js` et de l'audio de cinématique devenu inutile, puis contrôle de la mémoire sur une partie complète.

## 11. Risques et questions ouvertes

- **Casting provisoire :** les deux frères partagent un visage, le « boss » est un soldat en armure, et le garde est casqué. → Sous-projet casting.
- **Distances de tir des briefings** à aligner avec la refonte du gameplay.
- **Le build Electron** charge les modèles en chemin absolu `/models/` : ça casse sous `file://` (bug connu). Les nouvelles images utiliseront des chemins relatifs à la base Vite pour ne pas reproduire le problème.
- **Durée du prologue complet** (environ 1 min de cinématique + 2 à 4 min d'enquête) : on garde toujours la possibilité de passer.
- ~~Maquettes non versionnées~~ → **réglé** : elles sont versionnées dans `docs/superpowers/maquettes/cinematiques/` (environ 2,7 Mo, seulement les images utilisées), et le convertisseur lit cette copie.
