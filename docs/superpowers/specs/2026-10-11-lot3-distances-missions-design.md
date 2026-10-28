# Lot 3 : distances, postes, identification (conception)

> Conçu le 11 octobre 2026 à partir de six rapports en lecture seule (un par mission, briefing contre carte réelle) et d'une synthèse d'architecte, rangés dans `.superpowers/sdd/2026-10-07-reprise/lot3/`. Carte blanche de Rayan (« je te fais confiance ») : les décisions de goût du §4 sont prises sur recommandation et lui sont signalées ; il peut revenir sur chacune.
> Prérequis : le lot 2 fusionné (zones sur le squelette, `solidMeshes()`, `resolveImpact`, `planShotSounds`).
> Légende des sources : [V] vérifié dans le code, [R-Mx] repris du rapport de la mission x, [D] déduit ou proposé.

## 0. Constats qui orientent l'architecture [V]

> Relevés le 11 octobre 2026, avant la fusion du lot 2 : les numéros de ligne sont des repères à revérifier, pas des adresses à jour. Depuis la tâche A1 du lot 3a, `src/maps.js` n'existe plus : il est découpé en `src/maps/`.

- **Plan lointain unique à 200 m.** `src/scene.js:11` : `PerspectiveCamera(60, …, 0.1, 200)`.
- **Soleil fixe et cadre d'ombre unique.** Le soleil est fixé en (20, 40, 10) et le cadre d'ombre vaut ±60 m (`scene.js:32-41`). `setLighting` ne règle que les intensités et les couleurs, jamais la position (`scene.js:79-86`). Tout réglage par carte doit donc être **remis à zéro** au menu, en PvP et dans l'enquête.
- **Zoom de départ ×4 partout** (`main.js:579`). La molette va de ×3 à `6 + 2 × Lunette` (`main.js:1193`, `upgrades.js:77`) et la Lunette va au plus au niveau 3 (`upgrades.js:5`), soit ×12 au maximum.
- **Temps de vol fixe** : `bulletDelay: 0.45 - velocity*0.08` (`upgrades.js:74`). Il est décompté en `main.js:1402-1405`.
- **Règle de fuite** : un cône fixe de 80° plus une distance de 12 m (`main.js:1097-1116`). À 155 m ou 430 m, elle ne se déclenche jamais.
- **Casting.** `spawnCharacter` filtre par `match` **dans le seul pool du rôle**, et retombe **en silence** sur tout le pool si rien ne correspond (`characters.js:173-176`). `NPC` ne passe aucune option (`npc.js:207`). Imposer Verne (pool civil) ou Halder (pool garde) comme cible demande donc une recherche dans tous les pools, et la retombée silencieuse rendrait un test de casting menteur.
- **Fin de mission.** La dernière cible lance tout de suite le ralenti, puis la réussite au bout de 1,5 s (`main.js:1118-1145`). La fin différée de M3 touche donc ce chemin.
- **Obstacles des PNJ.** Seules les `box()` de hauteur ≥ 1,1 m posées au sol deviennent des obstacles (`maps.js:46` avant A1, aujourd'hui `box()` dans `src/maps/prims.js`). Des `InstancedMesh` n'en produiraient aucun. `src/gfx/dispose.js` ne parcourt que `o.geometry`, sans traitement propre aux `InstancedMesh` (aucune occurrence) : il faudra appeler `.dispose()` sur l'instance [D].
- **Tailles des fichiers.** `maps.js` fait 954 lignes, `main.js` 1 677 lignes, et `MAP_BUILDERS` est un tableau de 6 fonctions (`maps.js:947-954` avant A1, aujourd'hui dans `src/maps/index.js`).
- **Lot 2.** Sur `lot2-tir`, seules T1 à T3 sont faites (lunette, recul, culasse ; commits `71578af`, `df6dd66`, `f9f645c`). Le lot 3 a besoin de T4 (zones sur les os), T5 (`solidMeshes()`, `resolveImpact`) et T6 (`planShotSounds`, retard `distance/343`) (spec du lot 2 §3.1, §3.4, §3.5). **Le lot 3 ne commence qu'après la fusion du lot 2.**
- **Budgets du lot 1.** Les seuils chiffrés ne portent que sur M6 : triangles ≤ 1,5 M en Moyen et ≤ 1,4 M en Bas, plus les Δ = 0 du memtest (spec du lot 1 §6). Pour les autres missions, il n'existe que des relevés : en Moyen à la vue de départ, M1 608 appels pour 386 k triangles, M2 382 pour 642 k, M3 156 pour 606 k, M4 212 pour 856 k, M5 297 pour 486 k, M6 294 pour 1,42 M (`docs/superpowers/specs/annexes/README.md`, « Après la tâche L4 »). Je propose plus bas des plafonds par mission [D].

## 1. Découpage

**Mon avis franc sur le découpage proposé** (3a « tir à longue distance », 3b « missions conformes ») : il coupe au mauvais endroit.

- En M3 et M4, la longue distance **est** la mise en conformité. Le brouillard, le plan lointain, le zoom et la densité de décor ne se règlent qu'avec le poste et le décor en place.
- À l'inverse, l'identification (marqueurs, casting, fiche HUD), la balistique, la règle de fuite et les profils de caméra ne dépendent d'aucune carte. Ce sont des briques communes que chaque mission remplit avec ses données.

Je propose donc **un socle transverse, puis des sous-lots par groupe de cartes**. Chaque sous-lot se termine par les captures et les parcours de ses missions.

| Étape | Contenu | Taille [D] | Dépend de |
|---|---|---|---|
| **3.0 Sonde de lisibilité** (porte de décision) | Route de dev `?poste=x,y,z&regard=…&far=…&brume=…&soleil=…&zoom=…`, lue par `capture-mission.mjs`. On capture à 155, 138 et 430 m, à ×8, ×12 et ×20, en Moyen et en Bas, avec les modèles imposés posés sur la zone actuelle. **Rayan juge les captures** : si 430 m est illisible, M4 passe au repli de 120 à 250 m (REPRISE.md:55) | XS (½ j) | Rien (route de dev jetable) |
| **3a Socle** | Données de mission, découpage de `maps.js`, profil de caméra (near, far, brume, soleil) avec remise à zéro, zoom par mission, balistique en segments, réglage de la lunette, télémètre, enregistrement du dernier tir mortel (contrat avec le lot 4), casting par modèle, marqueurs retirés à partir de M2, fiche HUD multiple, module de réaction et de fuite (sorties, abris, perte de vue ; le cône reste la règle par défaut), lignes radio d'Anton en bips | M à L | Lot 2 fusionné |
| **3b Missions proches** : M1, M2, M6, plus le menu | Décor du menu séparé, toit et nuit de M1, appel au téléphone (pose commune à M1 et M6), boucherie, ruelle et paire des frères en M2, verrière, rôles fixes de la fête et vitre en M6 | M | 3a |
| **3c Port et base** : M3, M4 | Portiques, quai et Kalina, château d'eau, dépôt et sol de 4 km, décor fusionné et instancié, routines, fenêtre « deux tirs » et fenêtre de 6 s, fin différée de M3 | L | 3a, 3.0 |
| **3d Convoi** : M5 | Trajectoire courbe à profil de vitesse, colline en relief, couchant (direction du soleil), places inversées, fenêtre de 13,5 s, alerte qui accélère le convoi | M | 3a |

- **Ordre** : 3.0, puis 3a, 3b, 3c, 3d.
  - 3b vient avant 3c parce qu'il valide le modèle de données sur des cartes simples, et parce que la séparation du menu doit précéder la réécriture de M1.
  - 3c et 3d s'échangent sans difficulté. Je les garde séquentiels : les deux touchent `main.js` et la colonne vertébrale des cartes, donc des conflits sont certains en parallèle.
- **Alternative écartée : un sous-lot par mission.** Six relectures de branche, alors que M1, M2 et M6 partagent la nuit, le téléphone, la paire et la fiche.

## 2. Conception par sous-lot

### 3a Socle

**a) Où vivent les données de mission**

| | Approche | Pour | Contre |
|---|---|---|---|
| A | Étendre ce que rendent les builders (aujourd'hui `cameraPos`, `moralLock`, `convoy`, `hiddenTarget`…) | Rien de nouveau | Mélange décor et règles de jeu, intestable sans la scène simulée, `maps.js` déjà à 954 lignes |
| **B (reco)** | Module **pur** `src/campaign/missions/m1.js … m6.js`, plus un `index.js` : poste, réglage de la lunette, zoom, profil de caméra, casting, routines, sorties, fenêtres, fiche, radio. La carte rend des **ancres nommées** (`oeil`, `pointAppel`, `ruelle`, `abris[]`, `sorties[]`, `places[]`) | Testable sans `three` ni DOM ; une mission se lit d'un coup d'œil | Un contrat ancres et données à tenir par test |
| C | Description déclarative chargée en JSON | Éditable hors code | Surdimensionné, perd le typage implicite |

- `maps.js` est découpé en `src/maps/` : `prims.js` (`box`, `cylinder`, `building`, `car`, marquage `solid`), puis un fichier par carte, plus `menu.js`.
- Ce découpage est un **déplacement pur**, fait en premier. Preuve : captures `capture-mission.mjs` identiques à l'octet près avant et après, et `memtest --check` vert. Ce n'est pas un test de comportement, donc aucun témoin rouge n'est exigé.

**b) Profil de caméra par mission**
- `applyCameraProfile(camera, scene, sun, profil)` et `resetCameraProfile()`, purs sur des objets fournis :
  - `near` et `far` ;
  - brume `{ type: 'lin'|'exp2', couleur, debut, fin | densite }` ;
  - `sunPos` et cible du soleil ;
  - cadre d'ombre.
- `setLighting` gagne `sunPos`, avec (20, 40, 10) par défaut.
- Appelé dans `mountLevel`. Remis à zéro dans `showMenu`, au départ du PvP et à la fin de l'enquête, qui sauve déjà near et far (`prologue/investigation.js:377, 398-399` [R-M4]).

**c) Balistique**

| | Approche | Pour | Contre |
|---|---|---|---|
| A | Rayon figé au clic, délai = distance du point touché / vitesse, chute ajoutée au point d'impact | Petit changement | Faux dès que la chute dépasse un obstacle ou une tête ; la caméra du lot 4 n'a pas de trajectoire à suivre |
| **B (reco)** | Trajectoire analytique `p(t) = o + v·u·t + ½·g·t²` (sans traînée), découpée en segments. **À chaque image**, le segment parcouru passe par `resolveImpact` du lot 2 contre les solides et les zones des PNJ à leur pose du moment | Avance sur les cibles mobiles naturelle, chute juste contre le décor, trajectoire réutilisable telle quelle par le lot 4 | Quelques raycasts par image pendant au plus 0,6 s : coût négligeable |
| C | Traînée intégrée (coefficient balistique G7) | Réalisme | Réglage de lunette et tables complexes pour un gain invisible à 430 m |

- Module `src/shot/ballistics.js` :
  - `trajectoire({ origine, dir, v0, g, zero })` ;
  - `pointA(t)` ;
  - `segmentsEntre(t0, t1)` ;
  - `angleDeZero(distance)`, qui relève le tir pour croiser la ligne de visée à la distance de réglage.
- Vitesse : 800 m/s, puis 950 m/s au niveau 4 de Vélocité (+37,5 m/s par niveau). Elle remplace `bulletDelay`.
- Chiffres [calcul] : 430 m donnent 0,54 s de vol et 1,41 m de chute sans réglage. Avec la lunette réglée à 430 m, l'écart dans la zone 412 à 448 m va de -5 à +6 cm : négligeable devant le rayon du torse (15 cm).
- **Télémètre** dans la lunette : distance au point visé (rayon contre solides, sol et zones), arrondie au mètre, rafraîchie à 10 Hz. Il affiche aussi la distance de réglage (« ZÉRO 430 m »).
- **`dernierTirMortel`** : `{ origine, dir, v0, g, zero, tTir, tImpact, point, cibleId, zone }`, enregistré à chaque mort de cible nommée. C'est le contrat avec le lot 4.

**d) Casting**

| | Approche | Pour | Contre |
|---|---|---|---|
| A | Passer `match` par `NPC`, dans le pool du rôle | 2 lignes | Impossible pour Verne et Halder (autres pools), retombée silencieuse |
| **B (reco)** | `spawnCharacter(type, { model, strict: true, teinte, teinteMaillage })` : recherche dans **tous** les pools ; en mode strict, erreur au lieu de la retombée ; `shadowRole` explicite dans `NPC`, détaché du pool | Couvre les 9 cibles nommées, rend le test honnête | Il faut garder l'ordre des tirages au hasard du PvP (`pvp.js:525` [R-M1]) : aucun `Math.random` de plus quand aucune option n'est passée |
| C | Pools redéfinis par mission | Flexible | Duplique les tables, même problème de retombée |

- La teinte par maillage sert à Marc (Ch01_Shirt seul) : le matériau est copié, puis libéré par `disposeObject`.
- Les exclusions par mission (`civils.exclure`) évitent les sosies.

**e) Identification**
- `marqueurs: true` seulement dans `m1.js`. Toute cible des autres missions a `hideMarker` et une ombre de rôle « civil » (fuite d'identité par l'ombre, `quality.js:20` [R-M2]).
- `#target-dossier` généralisé : de 1 à 3 entrées (portrait `-lo`, nom, signe), un ordre de tir, une ligne barrée à la mort. Le titre est dynamique (« DOSSIER 02 »).

**f) Réaction et fuite** (`src/campaign/alarm.js`, `src/campaign/escape.js`, purs)

| | Approche | Pour | Contre |
|---|---|---|---|
| A | Cône proportionnel au champ zoomé | Trivial | Toujours arbitraire, injuste à ×20 |
| **B (reco)** | **Sorties et abris nommés** fournis par la carte, avec échec à l'arrivée ; plus, en option par mission, une **perte de vue** (rayon contre les solides) au-delà de N s. Réaction = min(son à `d_pnj/343` si pas de silencieux ; collègue qui tombe à moins de R m et en vue) + stupeur | Traduit chaque consigne d'Anton ; marche à toute distance | Équilibrage mission par mission (valeurs dans `tuning.js`) |
| C | Chrono global par mission seulement | Simple | Ne joue ni la ruelle ni les igloos |

- Le cône actuel reste la règle quand une mission ne déclare aucune sortie : chaque sous-lot bascule ses missions une à une.

**g) Autres briques**
- **Fenêtres** (`src/campaign/window.js`) : départ sur un événement (premier tir, entrée dans le virage, décroché), durée, échéance qui provoque un échec ou une pénalité.
- **Radio** (`src/campaign/radio.js`) : événement → ligne d'Anton dans le fil, avec bips (REPRISE.md:60). Le support HUD du « fil » est [D] à vérifier.
- **Fin de mission paramétrable** : `fin: { calmeS, tantQue }`, branchée sur `campaign/phase.js`.

**Tests 3a** (chacun vu rouge avant le code)

| Test | Témoin rouge aujourd'hui |
|---|---|
| Temps de vol = d/v ± 2 % à 31, 155 et 430 m | Délai fixe de 0,45 s : rouge à 155 m |
| Avec le réglage à 430 m, impact à moins de 2 cm de la ligne de visée à 430 m ; sans réglage, chute de 1,41 ± 0,05 m | Fonction absente : ne compte pas. Le témoin est un tir simulé dans `main` extrait, sans chute |
| Segment qui passe 3 cm au-dessus d'un muret à 100 m mais le touche avec la chute : décor touché | Rayon droit : passe |
| 50 montages par mission : modèle imposé 100 % du temps, et erreur si le modèle n'existe pas | Environ 1 fois sur 3 pour Markov ; Verne jamais |
| Ordre des tirages du PvP identique à graine fixe | Vert aujourd'hui, doit le rester (non-régression) |
| Aucun marqueur de M2 à M6 | Rouge |
| Ombre « civil » pour les cibles de M2 à M6 en Moyen | Rouge |
| Fiche : nombre d'entrées = cibles nommées, aucun tiret cadratin (`tests/texts.test.js`) | Rouge en M1 à M5 |
| Après menu, PvP et enquête : near 0,1, far 200, soleil (20, 40, 10), brume du menu | Rouge dès qu'une mission change le profil sans remise à zéro |
| Une cible qui atteint une sortie provoque l'échec ; sans sortie déclarée, le cône s'applique comme avant | Le premier rouge, le second vert (non-régression) |

**Critères de fin 3a**
- `npx vitest run` vert, `npx vite build` sans erreur, `memtest --check` vert en Moyen et en Bas.
- Captures inchangées après le découpage de `maps.js`. Après les marqueurs, seuls les marqueurs disparaissent des captures de M2 à M6.

### 3b Missions proches : M1, M2, M6, menu

**Choix**

| Sujet | A | B | C | Reco |
|---|---|---|---|---|
| Menu | La nouvelle M1 sert aussi de menu | **Ancienne rue figée en `maps/menu.js`** | Décor de menu neuf | **B** : références du memtest intactes, orbite de caméra déjà réglée (sinon elle traverse les immeubles [R-M1]) |
| Téléphone à l'oreille | Clip Mixamo téléchargé (poids, licence à vérifier) | **Pose procédurale des os du bras droit après `mixer.update`, objet `_addPhoneProp` sur `RightHand`** | Objet seul, sans pose | **B**, un module `phonePose.js` partagé par Markov (M1), le commanditaire (M6) et Mira à l'alerte (M3) |
| Foule de M6 | Rôles tirés au hasard (aujourd'hui) | **`src/campaign/party.js`, rôles fixes à graine** : 10 danseurs, 4 au bar, 2 au DJ, 2 debout, 6 assis, 1 téléphone | | **B** |
| Paire des frères | Deux PNJ indépendants | **Routine `suiveur`** (décalage dans le repère du meneur) | | **B**, réutilisée par Mira en M3 |

**Tests 3b**

| Test | Témoin rouge aujourd'hui |
|---|---|
| L'œil n'est dans aucun solide, et aucun solide n'est à moins de near + 0,1 m | M2 (œil dans la dalle) et M6 (dans l'immeuble) |
| Rayons de l'œil vers une grille de la zone des cibles : aucun solide touché | M1 (arbres au hasard) |
| Aucune apparition dans un obstacle | M6 (cible dans le canapé) |
| Distance de l'œil au point de référence à ±10 % de l'annonce | Vert aujourd'hui pour M1, M2 et M6 : non-régression |
| M2 : le survivant atteint l'embouchure de la ruelle en 2,8 ± 0,1 s, puis échec | Rouge (fuite sans fin) |
| M6 : exactement un téléphone à l'oreille parmi 24 invités, 10 danseurs fixes, place de la cible qui change selon la graine | Rouge |
| M1 : Markov tient le téléphone pendant l'appel, et le garde reste à 3 m ou moins de lui | Rouge |
| Le menu garde ses compteurs du memtest du lot 1 à l'unité près | Vert : non-régression du décor figé |

**Critères de fin 3b**
- **Distance** au point de référence : M1 31,1 m (fourchette 27,9 à 34,1) ; M2 45,4 m en oblique pour une annonce de 42 m (+8 %) ; M6 37,7 m (34,2 à 41,8).
- **Lisibilité** en 1080p au zoom maximum de base [calcul] :

  | Mission | Zoom | Silhouette | Signe |
  |---|---|---|---|
  | M1 | ×6 | 358 px | téléphone à ×4 : 14,6 px |
  | M2 | ×6 | 245 px | polo : 75 px |
  | M6 | ×4 | 194 px | téléphone : 12 px |

  Seuil commun : silhouette ≥ 80 px, signe ≥ 10 px.
- **Budgets en Moyen** à la vue de départ :
  - M1 ≤ 650 appels (608 aujourd'hui) ;
  - M2 ≤ 450 appels (382) ;
  - M6 : triangles ≤ 1,5 M en Moyen et ≤ 1,4 M en Bas (seuil du lot 1), appels ≤ 330.
- `memtest --check` vert. Captures du menu identiques ; captures de M1, M2 et M6 refaites et validées par Rayan.

### 3c Port et base : M3, M4

> Décision 11 (§4) : **Rayan garde 430 m** (28 octobre 2026, « fais le dur, on est sur une mission proche de la fin »). Les chiffres de M4 de cette section, calculés à 430 m, restent valables. La lisibilité est assurée par le zoom maximum de la mission et par l'amélioration Lunette (décision 2 : ×20 de base, jusqu'à ×29 au niveau 3).

**Choix**

| Sujet | A | B | C | Reco |
|---|---|---|---|---|
| Décor de l'entre-deux | `box()` comme aujourd'hui (un appel par boîte) | **Fusion par matériau et surface (`mergeGeometries`), `InstancedMesh` pour les répétitions (conteneurs, igloos, broussailles)** ; obstacles et solides enregistrés explicitement | Décor en GLB (poids, droits) | **B** |
| Profondeur | **Plan proche par carte** (M3 0,5 ; M4 1,0) | `logarithmicDepthBuffer` (touche tous les shaders) | Profondeur inversée (exige une profondeur flottante [R-M4]) | **A** |
| Brume | Linéaire partout | Exponentielle partout | **Par carte** : M3 exponentielle de densité 0,0035 ; M4 linéaire de 150 à 1 600 m, qui cache le bord du sol | **C** |

**Nouvelles briques**
- Fonctions `portique()` et `chateauDEau()`.
- Routines `navette` (Vosko) et `poste fixe` (gardes de M4).
- Fenêtres : « deux tirs » en M3 (réaction au son à 0,45 s, téléphone, abri), 6,0 s en M4 (son à 1,25 s, ou réaction immédiate à moins de 15 m d'un collègue qui tombe ; course vers l'igloo).
- Fin différée de M3 : 12 s de calme, cadenas tirable, aucun ralenti avant l'échéance, retrait des corps suspendu.

**Tests 3c**

| Test | Témoin rouge aujourd'hui |
|---|---|
| Distance du poste au centre de la zone : 155 ± 10 % (M3) et 430 ± 10 % (M4) ; 90 % des positions tirées à ±10 % | 29,8 m et environ 30 m |
| `dispose` d'un `InstancedMesh` : Δ géométries = 0 sur 10 montages | Rouge sans `.dispose()` [D] |
| Conteneurs instanciés présents dans les obstacles des PNJ et dans les solides | Rouge |
| M3 : après la 2e cible, phase calme de 12 ± 0,1 s, cadenas touchable, puis réussite | Ralenti immédiat |
| M4 : morts à t = 0, 1,5 et 3 s, réussite ; une seule mort à t = 0, premier survivant à l'abri à 6,0 ± 0,2 s, puis échec | Rouge |
| Vitre de la cabine et pluie non solides ; montants hors de l'axe de visée | Rouge sur le premier point dès que la cabine existe sans marquage |

**Critères de fin 3c**
- **Lisibilité** en 1080p, validée sur captures par Rayan en Moyen et en Bas :
  - M3 à ×10 (maximum de base) : corps 123 px, torse 30 px ;
  - M4 à ×20 : corps 86 px, tête 12,5 px (calcul à 430 m ; à 250 m, après la décision 11, la sonde mesure 109 px et une tête de 15 px en Bas).
- **Budgets en Moyen** à la vue de départ [proposition] :
  - décor seul ≤ 200 appels et ≤ 300 k triangles ;
  - vue complète ≤ 450 appels et ≤ 1,2 M triangles ;
  - p95 de la durée d'image (RTX 3080, `--temps-reel --gpu`) au plus égal à celui de M6 après le lot 1.
- `memtest --check` vert.

### 3d Convoi : M5

**Choix**

| Sujet | A | B | C | Reco |
|---|---|---|---|---|
| Route | Droite, ralentie | **Trajectoire paramétrée par la longueur parcourue (arcs et droites), profil de vitesse** dans `convoy.js` pur | Véhicules physiques | **B** |
| Colline | Empilement de boîtes | **Plan déplacé** (environ 8 k triangles, `surface: sol`) | Carte de hauteurs en texture | **B** |
| Soleil couchant | Disque peint seulement | **Direction du soleil dans le profil** (12 à 15°), biais d'ombre réglé | | **B** |

**Tests 3d**

| Test | Témoin rouge aujourd'hui |
|---|---|
| Fenêtre de 13,5 ± 0,2 s à 8,5 m/s dans le virage | Ligne droite |
| Kessler en place passager de la jeep 2, côté tourné vers le poste | Banquette arrière, chauffeur côté tireur |
| Avance mesurée = v_convoi × d / v_balle ± 5 % | 0,45 s fixe |
| Alerte : fenêtre restante divisée par environ 2,4 | Rouge |
| Soleil remis à zéro après M5 | Rouge |

**Critères de fin 3d**
- **Distance** : fenêtre entre 125 et 150 m, donc à ±10 % de 138. Le rapport M5 donne 123 m en sortie de fenêtre : il faut déplacer le poste d'environ 2 m [D].
- **Lisibilité** à ×12 : corps 166 px, partie assise visible 49 px.
- **Budget** : ≤ 350 appels et ≤ 700 k triangles en Moyen.
- **Bord du sol** : un sol d'au moins 2 km, ou un anneau de reliefs. La brume exponentielle n'atteint que 47 % à 500 m [calcul], donc le bord d'un sol de 1 km serait visible.

## 3. Tableau par mission

| | Poste | Distance (annonce, puis lot 3) | Œil, plongée | Heure, lumière | Signes | Modèle imposé | Consigne d'Anton jouable | Ce qui change dans la carte |
|---|---|---|---|---|---|---|---|---|
| **M1** | Toit d'un immeuble de 13 m, au muret côté rue | 31, puis 31,1 m au point d'appel (zone de 24,6 à 38) | Œil à (10 ; 14,2 ; 26,1), 24,5° | 22 h 47, nuit (recette de M2), lampe au point d'appel | Costume bleu nuit, téléphone, garde du corps à 3 m ou moins ; **marqueur gardé** | `gangster_man_01`, sans teinte ; civils sans `mafia_woman_02` | « Une balle » : mention UNE BALLE au rapport ; « Il décroche » dans le fil | Rue en travers, 8 étals en 2 rangées, camionnette, arbres fixes, brume de 40 à 110 m ; décor du menu séparé |
| **M2** | Toit de 18 m, muret de 1 m | 42, puis 41,7 m à l'horizontale (45,4 m en oblique) | Œil à (0 ; 19,35 ; 22,15), 23,5° | 23 h, lumière chaude devant la vitrine | Polo blanc (Luc), polo beige (Marc), toujours ensemble, sacoche (à trancher) | `gangster_man_02` ×2, teinte sur Ch01_Shirt seulement ; modèle exclu des civils | « Enchaîne, < 2 s » : survivant stupéfait 0,4 s puis course vers la ruelle (2,8 s), échec à l'embouchure ; bonus ENCHAÎNÉ si moins de 2 s | Boucherie (enseigne, auvent rayé, vitrine), ruelle, étal, lampadaires aux coins, sol de 200 m, fenêtres retournées, nom « La place » |
| **M3** | Cabine de la grue G3 | 155, puis 142,5 à 167 m (centre 154,3) | Œil à (-28 ; 41 ; 146), 14,9° | 23 h 41 à 23 h 54, pluie autour du joueur, projecteurs au sodium | Vosko : costume sombre, va-et-vient vers le conteneur. Mira : t-shirt clair, chignon, registre, à 1,2 à 1,5 m de lui | `gangster_man_01` (Vosko), `mafia_woman_03` (Mira, [R-M3] à confirmer par un rendu) ; dockers en `gangster_man_02` casqués | « Deux tirs sans temps mort » : le survivant réagit au son (0,45 s), téléphone puis abri, échec « Mira a donné l'alerte ». Ordre Vosko puis Mira récompensé. Cadenas : fin différée de 12 s | 3 portiques, Kalina, quai de 420 m, eau visible, parc de conteneurs instancié, entrepôt en fond, brume exponentielle 0,0035, near 0,5, far 600, zoom de ×6 à ×10, réglage de la lunette à 155 m |
| **M4** | Passerelle du château d'eau | 430, puis 412 à 448 m (décision 11 : 430 m gardés par Rayan) | Œil à (0 ; 37,5 ; 428,5), 4,9° ; au repli (0 ; 37,5 ; 247,35), 8,4° | Midi, soleil vers (4, 60, 2), ciel dégagé | Verne : tailleur bleu nuit, chignon, planchette. Halder : casque noir. Rossi : cheveux courts, chemise blanche | `mafia_woman_02`, `mafia_henchman`, `mafia_woman_01` ; gardes en `mafia_boss` (à trancher) ; 0 civil | « 3 tirs en 6 s » : chrono dès le 1er tir, son à 1,25 s, course vers les igloos, échec à l'arrivée ; ordre V, H, R en bonus, TRIPLÉ | Château d'eau, 6 igloos et aire, hangars, piste, sol de 4 km texturé, collines, brume linéaire de 150 à 1 600 m, near 1,0, far 1 700, zoom de ×8 à ×20 |
| **M5** | Crête de colline, à 18 à 22 m au-dessus de la route | 138, puis 125 à 150 m | Environ 8° | 19 h 42, couchant derrière à gauche | Véhicule 2 sur 3, place passager ; casquette d'officier | `mafia_boss` avec casquette procédurale ; escorte en `mafia_boss` (à trancher) | « 13 s » : barre FENÊTRE DE TIR à l'entrée du virage. « Vise devant » : avance réelle d'environ 1,5 m (à trancher). Une alerte accélère le convoi | Virage en épingle de R ≈ 60 m, freinage et feux stop, colline, bosquets, moto, sol ≥ 2 km, brume exponentielle 0,0016, near 0,5, far 1 000, zoom de ×6 à ×12 |
| **M6** | Atelier sous verrière, au ras de la façade | 38, puis 35 à 42,6 m (piste à 37,7 m) | Œil à (0 ; 17,6 ; 14,2), 22,7 à 27,1° | 23 h, nuit, fête audible et étouffée | Ne danse pas, téléphone à l'oreille droite, écran qui éclaire la joue ; place tirée parmi les 14 non-danseurs | Modèle masculin (à trancher) ; 23 civils | Fuite vers la porte d'entrée, échec au franchissement ; fenêtre de 90 s liée à l'appel (à trancher) | Immeuble du tireur reculé de 9 m, rue de 29,5 m, baie vitrée non solide (surface `verre`), salon réaménagé, porte ENTRÉE, plaque VILLA MOREAU, zoom de départ ×3 |

## 4. Décisions (11 octobre 2026, sur recommandation, signalées à Rayan)

1. **Réglage de la lunette** : réglée sur la distance qu'annonce Anton, affichée « ZÉRO n m » (pas de réglage manuel).
2. **Amélioration Lunette** : zoom maximum de la mission × (1 + 0,15 × niveau).
3. **Avance en M5** : balistique réelle ; la maquette de M5 passe de « ≈ 4 m » à « ≈ 1,5 m » et la scène est régénérée par `port-maquette.mjs`.
4. **Survivant à l'abri ou alerte donnée** (M2, M3, M4) : échec, comme la fuite aujourd'hui.
5. **Gardes et escorte de M4 et M5** : `mafia_boss` en armure sable (Halder se distingue, escorte « sans visage », moins de triangles).
6. **Commanditaire de M6** : `gangster_man_02` au polo teinté sombre maintenant ; un modèle libre en costume au lot 5 si le sosie gêne à l'écran.
7. **Distance de M6** : 38 m exacts, immeuble du tireur reculé de 9 m.
8. **Fenêtre liée à l'appel en M6** : oui, 90 s ; l'écran s'éteint et il se lève.
9. **M3** : aucun garde (comme le briefing) ; 14 silhouettes procédurales libérées par le cadenas.
10. **Détails** : pas de livraison minutée en M1 (tutoriel) ; sacoche de Luc dans la fiche HUD seulement ; M5 désert avec bosquets et vieille route ; vent hors du lot 3 (le drapeau de M4 reste du décor).

**Porte de décision 3.0** : les captures de la sonde de lisibilité (155, 138 et 430 m, ×8 à ×20, Moyen et Bas) sont envoyées à Rayan. Critère par défaut s'il ne répond pas avant la fin de 3a : silhouette ≥ 80 px et signe d'identification ≥ 10 px en Bas au zoom maximum de base de la mission ; sinon M4 passe au repli de 120 à 250 m.

11. **Porte de décision 3.0 mesurée (28 octobre 2026, tâche S0), puis tranchée par Rayan le même jour : M4 GARDE 430 m.** La sonde, au critère par défaut, proposait le repli à 250 m ; Rayan a regardé les deux captures et répondu « fais le dur, on est sur une mission proche de la fin ». La lisibilité à 430 m passe par le zoom : ×20 de base, et l'amélioration Lunette (décision 2) le porte jusqu'à ×29 au niveau 3 (silhouette d'environ 90 px et tête d'environ 13 px en Bas, par proportion des mesures de la sonde). Critère par défaut appliqué par la sonde (`?sonde=1`, `scripts/capture-mission.mjs sonde`), en pixels réellement rendus en Bas, au zoom maximum de base, le plus petit personnage décidant ; mesures et 26 captures dans `annexes/2026-10-28-sonde-lisibilite.json` et son dossier (README des annexes, « Lot 3 : sonde de lisibilité »).
    - M3 tient à 155 m (×10 : silhouette de 87 px pour Mira, buste de 23 px) et M5 à 138 m (×12 : 125 px, tête de 22 px).
    - M4 ne tient pas à 430 m (×20 : 63 px pour Verne, la plus petite des trois, et une tête de 9 px) ; le critère n'y tiendrait que jusqu'à 340 m environ. Au haut de la fourchette du repli, 250 m, il tient avec de la marge (109 px, tête de 15 px). Repli écarté par Rayan : 3c construit M4 à 430 m.
    - **Ce qui tranche, c'est la façon de compter les pixels.** En Bas, le jeu dessine dans un tampon de 1 440 × 810, agrandi d'un tiers pour remplir l'écran de 1 920 × 1 080. La sonde compte les pixels du tampon, comme le risque 2 du §5 (« environ 65 px réels en Bas ») : 63 px pour Verne, tête de 9 px. À l'écran, donc sur les captures, Verne fait environ 84 px et sa tête 12 px : comptés ainsi, les pixels tiendraient le critère à 430 m (en Moyen, où tampon et écran coïncident, la sonde mesure 84 px et une tête de 11 px).
    - Les calculs de la spec se vérifient sur le vrai rendu : silhouettes mesurées de 0,96 à 1,02 fois le calcul.
    - À ×20, les trois officiers se distinguent pourtant à leur tenue même à 430 m (tailleur bleu nuit, armure noire, chemise blanche) : le critère est plus sévère que l'œil. Les deux images à comparer, `sonde-430m-x20-bas.jpg` et `sonde-250m-x20-bas.jpg`, ont été envoyées à Rayan le 28 octobre 2026, avec la différence entre pixels du tampon et pixels de l'écran : il a gardé 430 m.

## 5. Risques principaux

1. **Le lot 2 n'est pas fini** : T4 à T6 restent à faire [V]. Le socle s'appuie sur `resolveImpact`, `solidMeshes()` et `planShotSounds` : tout glissement du lot 2 repousse le lot 3.
2. **Lisibilité à 430 m.** 86 px à ×20 en 1080p, environ 65 px réels en Bas ou en Auto [calcul]. La sonde 3.0 est la porte de décision. Si c'est illisible, c'est le repli de 120 à 250 m. Mesuré le 28 octobre 2026 : 63 px dans le tampon de Bas (environ 84 px à l'écran), sous le critère ; Rayan garde pourtant 430 m (décision 11, §4) : la tête se vise au zoom maximum, porté à ×29 par l'amélioration Lunette.
3. **Nuit illisible sans marqueur** (M1, M2, M3). Les `PointLight` en unités physiques n'éclairent presque rien à 5 à 7 m [R-M2, R-M3]. Il faut des lumières dimensionnées en candelas et un contrôle sur captures en Bas.
4. **Fuite d'état global entre cartes** : soleil, near et far, brume, cadre d'ombre. Elle dégraderait le menu, le PvP, l'enquête et les captures déterministes. Parade : `resetCameraProfile` et ses tests, plus `memtest` (menu-final identique).
5. **Budgets** : un décor de 400 m en `box()` ferait exploser les appels de dessin ; les `InstancedMesh` ne sont pas libérés par `dispose.js` [V] ; la kill-cam du lot 4 verra l'entre-deux de près.
6. **Difficulté.** Capsules serrées, balle réelle et stress à 0,07/s qui monte pendant le repérage (69 cm d'écart après 7 s à 430 m [R-M4]). Fenêtre de 35 ms sur cible mobile en M5 [R-M5]. Fenêtre d'environ 1,65 s en M2 [R-M2]. Tout passe par `tuning.js` et des parcours `verif-mission`.
7. **Casting.** La retombée silencieuse de `spawnCharacter` (`characters.js:174-175`) [V] fausserait les tests sans le mode strict. L'ordre des tirages du PvP est à garder. Plusieurs cibles nommées partagent un modèle (Markov et Vosko ; les frères, les dockers et peut-être le commanditaire) : la règle « aucun modèle partagé » devient une règle par mission.
8. **Taille de `main.js`** (1 677 lignes [V]). Sans extraction en modules purs, les tests avec témoin rouge sont impossibles (REPRISE.md:96).
9. **Captures et références.** Celles de M1 à M6 sont à refaire, toutes jugées par Rayan. Les seuils du memtest évoluent avec far et le décor : il faut les republier dans l'annexe.
10. **Contrat avec le lot 4.** `dernierTirMortel` et la trajectoire doivent suffire à la caméra qui suit la balle : ralenti d'environ ×0,02 à 31 m, d'environ ×0,3 à 430 m [D]. Ce contrat est à figer dans la spec du lot 3 avant 3c.
