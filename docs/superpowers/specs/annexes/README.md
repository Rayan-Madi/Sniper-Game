# Annexes des specs

Mesures et relevés qui servent de référence aux specs de `docs/superpowers/specs/`. Les fichiers JSON sont produits par des scripts du dépôt : on ne les écrit pas à la main.

## Mesure mémoire du lot 1 (`2026-10-07-memtest-*.json`)

### Ce que c'est

`scripts/memtest.mjs` ouvre la route de développement `?memtest=1` dans Chrome sans interface (rendu logiciel SwiftShader, profil jetable, aucun port de débogage : `--dump-dom` seulement) et relève les compteurs du renderer (`renderer.info`) après chaque étape d'une partie scriptée. La route ne passe pas par `requestAnimationFrame` (il ne tourne ni sans interface ni dans un onglet masqué) : la boucle du jeu est suspendue, chaque étape monte sa scène avec les fonctions du jeu lui-même, rend 3 images par appel direct à `renderer.render`, puis mesure.

| Étapes | Monté par |
|---|---|
| `menu` | `showMenu()` : la rue construite au démarrage ; depuis la tâche L2, `showMenu` libère la carte courante et reconstruit la rue |
| `premiere-image` | depuis la tâche L7 : `clearEntities()` puis `prepareLevel(1)` (M1 montée et ses shaders compilés, comme pendant son briefing), attente de la compilation (`renderer.compileAsync`), puis la première image, chronométrée ; avec `--sans-precompilation`, `mountLevel(1)` seul, comme avant L7. Voir « Après la tâche L7 » |
| `M1` à `M6` | `clearEntities()` puis `mountLevel(n)`, comme `launchLevel` puis `startLevel` |
| `menu-campagne` | `showMenu()` après la campagne |
| `M6-1` à `M6-10` | dix relances de M6 |
| `menu-m6` | `showMenu()` |
| `pvp-1` à `pvp-5` | `buildRoundScene(graine, 'sniper')` de `pvp.js`, la manche précédente retirée par `releaseRoundScene()` (comme `endRound`) |
| `menu-final` | fin de manche, bouton QUITTER VERS LE MENU (`quitToMenu`, qui reconstruit la rue), puis `showMenu()` sous la graine du menu, tirée à nouveau |

Chaque étape tire son hasard d'une graine fixe (une par mission, une pour les arènes) : deux montages de M6 placent la même foule avec les mêmes modèles, et les écarts mesurés viennent seulement de ce qui n'est pas libéré. Avant la tâche L2, le décor du menu, construit au démarrage, gardait un hasard libre : ses géométries variaient de quelques unités d'un lancement à l'autre, d'où la marge de 2 % du critère « partie complète ». Depuis L2, chaque étape `menu` reconstruit la rue avec la graine du menu (`menu-final` seulement depuis la relecture de L3 : voir « Après la tâche L3 »).

Colonnes : `geometries` et `textures` (`renderer.info.memory`, ressources envoyées au GPU et jamais libérées), `programmes` (shaders compilés), `appels` et `triangles` (dernière image rendue, passe d'ombre comprise), `tasMo` (tas JS après un ramasse-miettes forcé). Sous SwiftShader, les durées ne valent rien : seuls les compteurs servent de critère.

`tasMo` est **indicatif** : il n'entre dans aucun critère du §6, et son premier relevé, à l'étape `menu`, dépend du moment où il est pris. Sur quatre lancements du même code, il a valu 50 Mo (la référence ci-dessous), puis 93, 96 et 93 Mo, alors que toutes les étapes suivantes se retrouvent au mégaoctet près d'un lancement à l'autre (M1 50, M6 57, M6-10 60, `menu-final` 57). Pour suivre le tas, partir de l'étape `M1`, jamais du premier relevé. La cause de l'écart n'est pas établie.

### Relancer la mesure

Le serveur de développement doit tourner sur le port 5173 (`npm run dev`), puis :

```bash
node scripts/memtest.mjs                 # mesure seule : tableau à l'écran, résultat dans shots/memtest-<horodatage>.json
node scripts/memtest.mjs --check         # applique les seuils du §6 de la spec du lot 1, code de sortie 1 si l'un est dépassé
node scripts/memtest.mjs --reference     # recopie le résultat dans 2026-10-07-memtest-reference.json
node scripts/memtest.mjs --check --qualite=moyen --annexe=2026-10-07-memtest-apres-lot1.json   # seuils, puis recopie sous ce nom
node scripts/memtest.mjs --check --qualite=moyen --comparer=2026-10-07-memtest-apres-lot1.json  # seuils, et M6 à ±3 % de cette annexe (lot 2)
node scripts/memtest.mjs --images=5 --qualite=bas                      # images rendues par étape ; qualité transmise à la route
node scripts/memtest.mjs --temps-reel --gpu --qualite=moyen            # durées de l'étape premiere-image (temps réel, carte graphique)
node scripts/memtest.mjs --temps-reel --gpu --qualite=moyen --sans-precompilation   # la même, montée comme avant la tâche L7
```

`shots/` est ignoré par git : les mesures (`shots/memtest-….json`) et les captures de `shots/` citées dans ce README restent sur la machine où elles ont été faites et ne se retrouvent pas depuis le dépôt. Seuls les JSON de ce dossier-ci sont versionnés ; pour garder une mesure, `--annexe=<nom>.json`.

`--temps-reel` (tâche L7) remplace `--dump-dom` et son temps virtuel par le protocole DevTools : sous le temps virtuel, `performance.now` ne bouge pas pendant une tâche (une boucle de calcul y dure 0 ms, vérifié), et les durées de l'étape `premiere-image` y valent 0. Port choisi par Chrome (`--remote-debugging-port=0`, relu dans `DevToolsActivePort`), jamais un port fixe. Sur la carte graphique, la mesure complète prend environ 25 s. Les compteurs sont les mêmes dans les deux modes.

Variables : `CHROME` (chemin de Chrome), `BASE_URL` (défaut `http://localhost:5173/`), `BUDGET_MS` (budget de temps virtuel de Chrome, défaut 1 200 000 ; la mesure prend environ 3 min 30 en temps réel). Sans `--qualite`, les seuils de triangles sont ceux du préréglage Moyen.

`--comparer=<annexe>` (lot 2, tâche T8) compare M6 à la vue de départ, triangles et appels de dessin, à la même étape de cette annexe : ±3 % au plus (critère du §5 de la spec du lot 2), code de sortie 1 sinon. Serveur Vite fraîchement lancé : la première mesure pouvait s'arrêter avant toute étape, titre « memtest:modeles » (limite notée à la fin du lot 1) ; depuis le lot 2, elle est relancée une fois d'elle-même, la sortie le dit (« nouvel essai (2/2) ») et le résultat porte le nombre d'essais (`essais`).

Depuis la tâche L4, `--qualite` (`auto`, `bas`, `moyen`, `haut`) est appliqué par la route le temps de la mesure, sans être enregistré ; `data-qualite` du `<pre>` porte le préréglage effectif. Sans `--qualite`, la route mesure celui d'un premier lancement, Auto : les paramètres de Moyen, la résolution dynamique ne tournant pas (la route ne passe pas par la boucle du jeu). Une seule mesure à la fois : trois lancées ensemble se partagent le processeur, épuisent le budget de temps virtuel avant la fin et écrivent leur résultat sous le même nom de fichier.

### Référence d'avant correction (`2026-10-07-memtest-reference.json`)

Relevée le 7 octobre 2026 sur `b8b3f4b` plus l'instrumentation de la tâche L1 (panneau, route, script), avant toute libération de ressource. `--check` y trouve 4 seuils dépassés sur 5 : c'est l'état à corriger.

| Étape | Géométries | Textures | Programmes | Appels | Triangles | Tas (Mo) |
|---|---|---|---|---|---|---|
| menu | 416 | 3 | 5 | 549 | 10 944 | 50 |
| M1 | 876 | 52 | 11 | 630 | 567 572 | 50 |
| M2 | 1146 | 99 | 21 | 393 | 703 390 | 50 |
| M3 | 1211 | 141 | 34 | 179 | 799 412 | 49 |
| M4 | 1291 | 186 | 46 | 221 | 904 528 | 50 |
| M5 | 1464 | 203 | 59 | 297 | 486 082 | 50 |
| M6 | 1553 | 358 | 69 | 448 | 2 645 608 | 57 |
| menu-campagne | 1561 | 358 | 69 | 145 | 2 890 | 49 |
| M6-2 | 1739 | 668 | 69 | 448 | 2 645 608 | 58 |
| M6-10 | 2451 | 1908 | 69 | 448 | 2 645 608 | 60 |
| menu-m6 | 2459 | 1908 | 69 | 145 | 2 890 | 52 |
| pvp-1 | 2543 | 2237 | 78 | 778 | 5 506 390 | 69 |
| pvp-5 | 2879 | 3553 | 78 | 778 | 5 506 390 | 70 |
| menu-final | 3288 | 3553 | 78 | 540 | 10 506 | 57 |

Ce qu'on y lit :

- **Rien ne redescend** : après la campagne, le menu porte 1 561 géométries et 358 textures pour 416 et 3 au départ. Le décor du menu est encore celui de M6 (145 appels, 2 890 triangles au lieu de 549 et 10 944).
- **Chaque relance de M6** ajoute 89 géométries et 155 textures (des textures d'os : une par maillage animé de chacun des 27 PNJ). Les programmes, eux, restent à 69 : les mêmes shaders sont réutilisés.
- **Chaque manche PvP** ajoute 84 géométries et 329 textures (54 PNJ de foule).
- **Tas JS** : les 50 Mo de l'étape `menu` sont un relevé favorable, pas une valeur stable (voir les colonnes plus haut) ; à partir de M1, le tas monte de 50 à 60 Mo au fil des relances de M6 et à 70 Mo dans l'arène PvP.
- **Triangles** : 2,65 M à la vue de départ de M6 (personnages jamais écartés hors champ, ombre de chacun d'eux), 5,5 M dans l'arène PvP. Seuils visés : 1,5 M en Moyen, 0,8 M en Bas (seuil Bas reformulé le 9 octobre 2026, spec §8 : 1,4 M pour le lot 1, 0,8 M au lot poids).

Avec le `checkMemtest` d'après la tâche L8, cette référence dépasse toujours 4 seuils sur 5 (`tests/gfx/memtest.test.js`, « annexes »). Comparaison avec la fin du lot : « Après le lot 1 », plus bas.

### Après la tâche L3

Mesure du 8 octobre 2026 sur `129e7f5` plus la correction de l'étape `menu-final` décrite ci-dessous (`shots/memtest-2026-10-07T23-41-50.json`, dossier local, horodatage en UTC). L'annexe de fin de lot est plus bas (« Après le lot 1 »).

| Étape | Géométries | Textures | Programmes | Appels | Triangles |
|---|---|---|---|---|---|
| menu | 409 | 3 | 5 | 540 | 10 506 |
| M6, puis M6-1 à M6-10 | 127 | 184 | 31 | 442 | 2 657 836 |
| menu-campagne | 447 | 32 | 31 | 540 | 10 506 |
| menu-m6 | 447 | 32 | 31 | 540 | 10 506 |
| pvp-1 à pvp-5 | 122 | 357 | 36 | 770 | 5 494 500 |
| menu-final | 447 | 32 | 36 | 540 | 10 506 |

- **Relances de M6 et arènes PvP** : Δ = 0 d'un montage à l'autre (géométries, textures, programmes).
- **Du menu au retour de campagne, +38 géométries et +29 textures** : ce sont exactement les ressources des sept modèles GLB, comptées dans les fichiers (primitives des maillages, textures référencées par les matériaux) : `gangster_man_01` 9 et 4, `mafia_boss` 2 et 2, `mafia_woman_01` 7 et 4, `mafia_henchman` 2 et 7, `gangster_man_02` 5 et 3, `mafia_woman_02` 7 et 4, `mafia_woman_03` 6 et 5. Marquées partagées au chargement, elles partent au GPU la première fois qu'un personnage les dessine et y restent pour toute la session, voulu (spec §4.2). Le menu de départ n'a dessiné aucun personnage : le critère « partie complète » du §6 (géométries ≤ menu + 2 %, textures ≤ menu + 2) ne peut donc pas tenir tel qu'écrit. Reformulation actée le 9 octobre 2026 (spec §8, reportée au §6) et appliquée à la tâche L8 : ces ressources, relevées par la route, s'ajoutent au menu de départ (« Après le lot 1 »).
- **`menu-final`, +2 géométries (449) jusqu'à cette correction** : depuis L2, l'étape portait 449 géométries, 542 appels et 10 452 triangles, contre 447, 540 et 10 506 aux autres étapes menu. Pas un modèle : les sept sont déjà tous dessinés à `menu-campagne` (les 38 géométries sont toutes les leurs) et le PvP n'en charge pas d'autre. La cause était la route : le bouton QUITTER (`quitToMenu`) reconstruit la rue avec le début de la suite à graine du menu, puis `showMenu` la libère et en reconstruit une autre avec la suite. Cette seconde rue a autant de géométries (466 dans les deux cas, comptées sous jsdom) mais d'autres tirages (fenêtres allumées et leurs linteaux, place et taille des arbres) : à la vue du menu, elle dessine 2 objets de plus (542 appels), donc envoie 2 géométries de plus au GPU (le renderer n'envoie que ce qu'il dessine). Avant L2, `showMenu` ne reconstruisait pas la rue et l'écart n'existait pas. Depuis la relecture de L3, `showMenu` tire à nouveau la graine du menu : `menu-final` est identique à `menu-campagne` et à `menu-m6` à l'unité près, ce qui montre aussi que l'arène, la foule, les avatars, le laser et le pistolet du PvP ne laissent rien derrière eux.

### Après la tâche L4 (réglages graphiques)

Mesures du 9 octobre 2026 sur `1883d77` plus la tâche L4 (`shots/memtest-2026-10-08T23-03-30.json` en Moyen, `shots/memtest-2026-10-08T23-08-04.json` en Bas, dossier local, horodatage en UTC). Géométries, textures et Δ des relances sont ceux d'après L3, à l'unité près, dans les deux préréglages ; seuls changent les programmes (ombres en moins, donc moins de variantes de shaders), les appels et les triangles.

| Vue de départ | Haut (rendu d'avant L4) | Moyen | Bas |
|---|---|---|---|
| M1 | 630 appels, 567 572 | 608, 386 303 | 599, 289 249 |
| M2 | 411, 890 404 | 382, 642 205 | 364, 448 097 |
| M3 | 179, 799 412 | 156, 606 084 | 139, 400 884 |
| M4 | 241, 1 103 970 | 212, 855 771 | 186, 553 517 |
| M5 | 297, 486 082 | 297, 486 082 | 280, 245 961 |
| M6 | 442, 2 657 836 | 294, **1 422 955** | 290, **1 330 361** |
| pvp-1 à pvp-5 | 770, 5 494 500 | 445, 2 748 345 | 445, 2 748 345 |

- **Haut** rend exactement comme avant L4 : compteurs identiques à ceux de la mesure d'après L3 (`shots/memtest-2026-10-07T23-41-50.json`) sur les 23 étapes relevées (la mesure en Haut, lancée en même temps que deux autres, s'est arrêtée à `pvp-4`, faute de temps virtuel), et captures du menu, de M1, M3, M5 et M6 identiques à l'octet près à celles de L3 (`shots/l4-haut/` contre `shots/l3/`). En M5, Moyen rend comme Haut : le convoi n'a que des cibles et des gardes, qui gardent leur ombre en Moyen (capture identique à l'octet aussi).
- **Seuil Moyen de M6 (≤ 1,5 M) : tenu**, 1 422 955.
- **Seuil Bas de M6 (≤ 0,8 M) : dépassé**, 1 330 361. Décomposition relevée dans le jeu (M6 lancée par le menu, 20 images, Chrome sans interface) : les 27 PNJ sont tous dans le champ à la vue de départ, leurs 156 maillages animés font 1 333 420 triangles à eux seuls, la carte moins de 3 000 (1 878 sans ombre). En Bas, plus aucun personnage ne projette d'ombre et la passe d'ombre ne compte plus qu'un millier de triangles : il ne reste que la géométrie propre des personnages, que seuls des niveaux de détail des foules réduiraient (lot poids, hors de ce lot). Le « (ombres des personnages coupées) » du §6 supposait que couper ces ombres suffirait ; la mesure dit que non. Seuil reformulé, acté le 9 octobre 2026 (spec §8, reporté au §6) : Bas ≤ 1,4 M pour le lot 1, 0,8 M au lot poids ; tenu à la mesure de fin de lot (« Après le lot 1 »).
- **Sphère d'instance, rayon 1,25 contre 0,75** (écart de L3 au §4.3 de la spec) : mesure refaite en Moyen et en Bas avec un rayon de 0,75 le temps de deux mesures (`shots/memtest-2026-10-08T23-14-00.json` et `…T23-19-19.json`, jamais commité). Les 25 étapes sont identiques à l'unité près (géométries, textures, programmes, appels, triangles) : aux vues de départ des six missions et de l'arène, aucun personnage n'est assez près du bord du champ pour que le rayon change quoi que ce soit. Le rayon de 1,25 ne coûte donc rien à ces vues ; il évite les personnages coupés en bord d'écran quand on vise ailleurs.

### Après la tâche L7 (précompilation pendant le briefing)

Mesures du 9 octobre 2026 sur `f6b742f` plus la tâche L7, Moyen (dossier local `shots/`, non versionné, horodatage en UTC). Les fichiers cités ici ne se retrouvent donc pas depuis le dépôt : une mesure en temps réel avant et après est versionnée depuis la tâche L8 (« Après le lot 1 », première image d'une mission). Une contre-mesure faite à la relecture de L7 a donné un peu plus pour la première image (1 315 ms avant, 455 ms après), pour un gain du même ordre.

**Étape `premiere-image`** : M1 montée à froid, juste après le menu de départ, comme la première mission d'une session (aucun de ses shaders n'est encore compilé), puis sa première image, chronométrée jusqu'à la lecture d'un pixel (tout ce qu'elle a demandé est exécuté). Elle tire le hasard de M1 : l'étape M1 qui suit dessine les mêmes modèles, et les 25 autres étapes sont identiques à l'unité près à la mesure en Moyen d'après L4 (`shots/memtest-2026-10-09T11-49-50.json` contre `…2026-10-08T23-03-30.json` : géométries, textures, programmes, appels, triangles). Les programmes comptés sont ceux que chaque moment crée (compile), repérés par leur numéro : ils valent aussi sous le temps virtuel.

Carte graphique de Rayan (RTX 3080), `--temps-reel --gpu`, trois mesures de chaque (`shots/memtest-2026-10-09T11-32-37.json`, `…T11-33-24`, `…T11-34-12` ; avant : `…T11-33-01`, `…T11-33-48`, `…T11-34-36`) :

| M1 à froid | Préparation (fil principal) | Attente des shaders (en fond) | Première image | Image suivante |
|---|---|---|---|---|
| Avant L7 (`--sans-precompilation`) : montage au départ de la mission | 81 à 90 ms, 0 programme | | **1 184 à 1 222 ms**, 9 programmes | 11 à 16 ms, 1 programme |
| Après L7 : montage et compilation pendant le briefing | 105 à 132 ms, 8 programmes | 252 à 274 ms | **392 à 409 ms**, 1 programme | 12 à 16 ms, 1 programme |

Dans le jeu lui-même (Chrome sans interface sur la carte graphique, script de diagnostic non versionné : sauvegarde à la mission voulue, COMMENCER, briefing passé au bout de 6 s, `renderer.render` chronométré jusqu'à la lecture d'un pixel ; deux mesures de chaque, `main.js` de `f6b742f` remis le temps des mesures d'avant) :

| Session à froid | Écran noir avant la cinématique | Fin du briefing : montage | Première image de la mission |
|---|---|---|---|
| M1, avant L7 | 56 ms | 0,12 à 0,15 s | 1 274 à 1 401 ms, 9 programmes |
| M1, après L7 | 176 à 180 ms, montage compris | aucun | 443 à 502 ms, 1 programme |
| M6, avant L7 | 57 à 59 ms | 0,35 à 0,41 s | 2 480 à 2 485 ms, 9 programmes |
| M6, après L7 | 400 à 407 ms, montage compris | aucun | 481 à 658 ms, 1 programme |

(Montage au départ relevé sur le départ sans briefing, qui monte comme avant L7 : 123 à 146 ms pour M1, 352 à 412 ms pour M6, clic compris.)

- **Entre la cinématique et la mission, l'arrêt passe d'environ 2,8 s à 0,5 à 0,7 s en M6, et d'environ 1,4 s à 0,5 s en M1**, sur la machine de Rayan. En contrepartie, l'écran noir qui précède la cinématique dure le temps du montage (0,4 s en M6) : le montage bloque le fil principal, il se fait sur l'écran noir déjà peint, et la cinématique ne démarre qu'ensuite (sinon son animation se figeait). Le clic sur le bouton de lancement, lui, rend la main en 45 à 50 ms comme avant (une première version, qui montait dans le clic, le figeait 0,4 s en M6). Ce montage avant l'animation, et non pendant, est un écart au texte du §4.6 de la spec, inscrit à sa relecture de L7 et acté le 9 octobre 2026 (spec §8). Même section : si la cinématique démarre sans les modèles (REPRENDRE juste après l'ouverture du jeu), la mission se monte à leur arrivée, en pleine animation, qu'elle fige le temps de la préparation, de 0,1 à 0,4 s d'après les durées ci-dessus (cas rare).
- **Ce qui reste dans la première image** : un programme de profondeur des ombres pour les personnages animés, compilé par la passe d'ombre, que `renderer.compile` ne parcourt pas, et l'envoi au GPU des textures des modèles (environ 0,15 s : avec les 18 textures de M1 envoyées d'avance par `renderer.initTexture`, 432 ms au lieu de 587 ms dans la même mesure). La deuxième image compile encore une variante de profondeur sans animation, avant comme après L7. Hors du §4.6 de la spec ; suite possible : envoyer les textures pendant le briefing (`renderer.initTexture`).
- **Sous SwiftShader** (temps réel, une mesure de chaque), le rendu logiciel domine : 1 826 ms (9 programmes) avant, 1 584 ms (1 programme) après, pour 440 ms par image ensuite.

### Après le lot 1 (tâche L8) : mesure de fin de lot

Mesures du 9 octobre 2026 sur `5b8e7ec` (toutes les tâches du lot faites), SwiftShader, avec `--check` : en Moyen, `2026-10-07-memtest-apres-lot1.json` (`--qualite=moyen`), et en Bas, `2026-10-07-memtest-apres-lot1-bas.json` (`--qualite=bas`). Les cinq seuils du §6 de la spec, avec les reformulations actées le 9 octobre 2026 (§8), sont tenus dans les deux préréglages (« 5 seuils tenus » ; garde : `tests/gfx/memtest.test.js`, « annexes ») :

| Critère du §6 | Seuil | Moyen | Bas |
|---|---|---|---|
| Mesure complète | aucune étape en erreur | 26 étapes | 26 étapes |
| Partie complète | `menu-campagne` ≤ `menu` × 1,02 + modèles en géométries, ≤ `menu` + 2 + modèles en textures ; `menu-m6` et `menu-final` identiques à `menu-campagne` | 447 ≤ 409 × 1,02 + 38 (455,2) ; 32 ≤ 3 + 2 + 29 (34) ; `menu-m6` et `menu-final` à 447 et 32 | les mêmes |
| 10 montages de M6 | Δ = 0 du 2e au 10e (géométries, textures, programmes) | 127, 184, 31 à chacun | 127, 184, 19 à chacun |
| PvP | Δ = 0 après la 1re arène | 122, 357, 34 à chacune | 122, 357, 22 à chacune |
| Triangles de M6, vue de départ | Moyen ≤ 1,5 M ; Bas ≤ 1,4 M | 1 422 955 | 1 330 361 |

Les nombres des modèles (38 géométries, 29 textures) sont ceux que la route publie avec chaque relevé (`geometriesModeles` et `texturesModeles`, relevés par `modelResources` de `characters.js`), jamais écrits dans `checkMemtest` : ce sont bien ceux comptés dans les fichiers à la relecture de L3 (« Après la tâche L3 »). Géométries et textures sont les mêmes à l'unité près en Moyen et en Bas, et les mêmes qu'aux mesures d'après L3 et L4 ; seuls les programmes, les appels et les triangles changent avec le préréglage (tableau « Après la tâche L4 », dont les chiffres de Moyen et de Bas se retrouvent ici à l'unité près).

**Avant et après le lot 1** (référence d'avant correction, rendue comme Haut faute de préréglage, contre les deux mesures ci-dessus) :

| | Avant le lot (`b8b3f4b`) | Après, Moyen | Après, Bas |
|---|---|---|---|
| Menu de départ : géométries, textures, programmes | 416, 3, 5 | 409, 3, 5 | 409, 3, 5 |
| Retour de campagne (`menu-campagne`) | 1 561, 358, 69 | 447, 32, 31 | 447, 32, 19 |
| Chaque relance de M6 | + 89 géométries, + 155 textures | Δ = 0 | Δ = 0 |
| Chaque arène PvP | + 84 géométries, + 329 textures | Δ = 0 | Δ = 0 |
| Fin de partie (`menu-final`) | 3 288, 3 553, 78 | 447, 32, 34 | 447, 32, 22 |
| Triangles de M6 à la vue de départ | 2 645 608 | 1 422 955 | 1 330 361 |
| Triangles de l'arène PvP | 5 506 390 | 2 748 345 | 2 748 345 |
| Tas JS à `M6-10`, puis à `menu-final` | 60 Mo, 57 Mo | 54 Mo, 51 Mo | 54 Mo, 51 Mo |
| Première image de M1 à froid, RTX 3080 (ci-dessous) | 1 176 ms, 9 programmes | 413 ms, 1 programme | |

- **Plus rien ne s'accumule** : entre le retour de campagne et la fin de partie, la référence prenait encore 1 727 géométries et 3 195 textures (relances de M6, arènes PvP, décor laissé au menu) ; après le lot, rien. Au retour de campagne, il ne reste en plus du menu de départ que les ressources des sept modèles, gardées pour la session (voulu, spec §4.2).
- **Programmes** : 78 à la fin de partie avant le lot, 34 en Moyen et 22 en Bas : les shaders des matériaux libérés partent avec eux, et Moyen et Bas en demandent moins (ombres en moins).
- **Menu de départ, 416 puis 409 géométries** : avant L2, la rue du menu tirait un hasard libre, à quelques géométries près d'un lancement à l'autre ; elle a depuis la graine du menu.
- **Première image** : la colonne « avant » n'est pas `b8b3f4b`, la route n'ayant l'étape `premiere-image` que depuis L7 : c'est le code du lot monté comme avant L7 (`--sans-precompilation`), en Moyen.

**Première image d'une mission** (`2026-10-07-memtest-premiere-image-avant.json` et `2026-10-07-memtest-premiere-image-apres.json`) : `node scripts/memtest.mjs --temps-reel --gpu --qualite=moyen`, avec puis sans `--sans-precompilation`, sur la carte graphique de Rayan (RTX 3080), le jeu de Rayan fermé pendant la mesure. Trois passes en alternance (avant, après, avant, …) ; les deux annexes sont la troisième, les deux premières sont restées dans `shots/` (`memtest-2026-10-09T18-42-31.json` à `…T18-43-45.json`, non versionnés).

| M1 à froid, Moyen | Préparation (fil principal) | Attente des shaders (en fond) | Première image | Image suivante |
|---|---|---|---|---|
| Avant : montée au départ de la mission, comme avant L7 | 85 à 96 ms, 0 programme | | **1 176 ms** dans l'annexe (1 212 et 1 571 ms aux deux autres passes), 9 programmes | 11 à 19 ms, 1 programme |
| Après : montée et shaders compilés pendant le briefing | 106 à 121 ms, 8 programmes | 250 à 339 ms | **413 ms** dans l'annexe (477 et 403 ms aux deux autres passes), 1 programme | 11 à 21 ms, 1 programme |

La première image d'une mission dure environ trois fois moins, comme aux mesures de L7 (1 184 à 1 222 ms avant, 392 à 409 ms après) et à la contre-mesure de sa relecture (1 315 et 455 ms). Les compteurs des deux annexes (géométries, textures, programmes, appels, triangles) sont ceux de la mesure SwiftShader en Moyen, à l'unité près, sur les 26 étapes.

## Captures déterministes (`scripts/capture-mission.mjs`)

Pour comparer deux versions du code image par image, à la vue de départ d'une mission ou sur le menu : `Math.random` à graine, `requestAnimationFrame` et `performance.now` pilotés à la main (20 images de 1/60 s), minuteurs du jeu de 1 s et plus sur cette même horloge (aide de 5 s, indice du cadenas), fondus CSS figés, rendu logiciel SwiftShader. Même code : mêmes octets PNG, vérifié sur deux passes.

```bash
node scripts/capture-mission.mjs avant-lot1 menu 1 2 3 4 5 6   # shots/avant-lot1/menu.png, m1.png … m6.png
cmp shots/avant-lot1/m3.png shots/apres-l1/m3.png              # comparaison à l'octet près
```

`QUALITE=bas` (ou `auto`, `moyen`, `haut`) enregistre ce préréglage dans le profil jetable avant le lancement. Sans elle, le jeu part du préréglage d'un premier lancement, Auto, qui rend comme Moyen à la vue de départ : depuis la tâche L4, une capture sans `QUALITE` n'est donc plus le rendu d'avant le lot. Pour comparer avec les captures d'avant L4, prendre `QUALITE=haut`.

`GPU=1` rend sur la carte graphique (plus rapide) ; deux sessions peuvent alors différer d'un niveau de couleur sur quelques pixels (shaders compilés par le pilote) : pour une comparaison à l'octet, rester en SwiftShader.

Les captures d'avant le lot 1 sont dans `shots/avant-lot1/` (dossier local, non versionné), prises avec les fichiers de `b8b3f4b`. Après l'extraction de `mountLevel`, `unmountLevel`, `buildRoundScene` et `releaseRoundScene` (tâche L1), le menu et les six missions sont identiques à l'octet près (`shots/apres-l1/`). Après la libération des ressources (tâche L2), ils le sont encore (`shots/l2/`).

Après la tâche L3 (PNJ libérés, modèles partagés, personnages écartés hors champ), le menu et M5 restent identiques à l'octet près, mais M1, M3 et M6 changent (`shots/l3/`) : la teinte blanche ne copie plus le matériau du modèle, et chaque copie en moins est un identifiant de moins tiré par three.js (`generateUUID` consomme `Math.random`). Le hasard à graine place alors la foule autrement à partir du premier PNJ blanc. Contre-épreuve : avec la copie rétablie le temps d'une capture (`shots/l3-clone/`), le menu, M1, M3, M5 et M6 sont identiques à l'octet près à ceux de L2. Ni le marquage des modèles partagés, ni la libération des PNJ, ni l'écartement hors champ ne change donc ces images ; pour comparer avant et après le lot 1, M1, M3 et M6 se comparent à l'œil (personnages présents, textures intactes), plus à l'octet.

**Avant et après le lot 1** (tâche L8, 9 octobre 2026) : avant, les fichiers de `b8b3f4b`, extraits par `git archive` dans un dossier temporaire hors du dépôt et servis par un second Vite sur un autre port (`BASE_URL`), sans préréglage (le rendu d'alors, celui de Haut) ; après, `5b8e7ec` en Moyen (`QUALITE=moyen`). Dossiers locaux `shots/l8-avant/` et `shots/l8-moyen/`, non versionnés ; empreintes SHA-256 (16 premiers caractères) :

| Vue | Avant le lot | Après, Moyen | Comparaison |
|---|---|---|---|
| menu | `4c10cd8c7b1aa076` | `4c10cd8c7b1aa076` | identiques à l'octet |
| M1 | `35b5da0d4cab732b` | `1f9320a9125af481` | à l'œil |
| M3 | `ef9221dcf3f8cbd5` | `a0ad90f07a31fe99` | à l'œil |
| M5 | `e06b0935c131d70c` | `e06b0935c131d70c` | identiques à l'octet |
| M5 à 5,5 s (`IMAGES=330`, convoi dans le champ) | `b353885596dedff6` | `b353885596dedff6` | identiques à l'octet |
| M6 | `4f276be540b7ad7e` | `4a1e32d882ada935` | à l'œil |
| cinématique `m1` à 6 et 12 s (`node scripts/shots.mjs m1 6000 12000`) | `e31364e357c09209`, `6e5590b1e737d1ed` | les mêmes | identiques à l'octet |

Les captures d'avant sont identiques à l'octet près à celles de `shots/avant-lot1/` (même code, prises le 7 octobre), et celles d'après à celles de `shots/l4-moyen/` et `shots/l7-apres/`. Aucune régression visible, chaque image regardée :
- menu, M5 (départ, puis convoi dans le champ avec ses occupants et l'ombre des jeeps) et la cinématique : identiques à l'octet près ;
- M1, M3 et M6 : la foule est placée autrement (hasard décalé depuis L3, ci-dessus), mais tous les personnages sont là, avec leurs textures (costumes et cible marquée de M1, tenue camouflée de M3, danseurs de M6), et le décor, ses textures et ses ombres sont intacts (étal, immeubles, arbres, voitures, poubelles en M1) ;
- ombres en Moyen : M1 en Moyen contre M1 en Haut, même code (`QUALITE=haut`, `shots/l8-haut/m1.png`) : 100 pixels diffèrent, tous dans un rectangle de 147 × 14 pixels, au sol, au pied des civils proches du passage piéton et de l'étal. En Moyen, seuls les civils perdent leur ombre (spec §4.3) ; la cible marquée, la carte et leurs ombres sont celles de Haut, au pixel près.

**Retour au menu** (tâche L2) : la cible `retour<n>` joue la mission n, tire trois balles qui passent au-dessus des PNJ (trois trous d'impact au sol, poussière et sillage encore en vie ; traceur avant le lot 2), met en pause, revient au MENU, puis capture `retour-m<n>.png`. Depuis la culasse du lot 2 (tâche T3), le script avance les images jusqu'à `__aim().pret` avant chaque tir (1,2 s entre deux coups) : ces captures ne se comparent plus à l'octet avec celles d'avant. Le script affiche `__decor()` avant et après le retour : accroche de dev de `main.js` qui donne la couleur du fond de la scène et le type des objets qui ne sont ni la carte affichée ni les trois lumières du jeu.

```bash
node scripts/capture-mission.mjs l2 retour3   # shots/l2/retour-m3.png
```

Avant L2, le port restait derrière le menu avec son cadenas (`{"fond":"0a1520","horsCarte":["Group"]}`) ; après L2, la rue est reconstruite et rien d'autre ne reste (`{"fond":"87a0b0","horsCarte":[]}`).

**Coup de feu** (lot 2, tâche T3, 9 octobre 2026) : la cible `tir<n>` ouvre la lunette sur la vue de départ (15 images), tire, puis capture `tir-m<n>.png` `APRES` images plus tard (12 par défaut, 200 ms : balle en vol, sillage qui monte vers le point visé, vue relevée par le recul, jauge de la culasse sous le réticule ; `APRES=4` pour la lueur chaude des bords de la lunette, éteinte en 140 ms). `VISER=cible` (ou `garde`, `civil`, `cadenas`, comme `__aimAt`) vise ce PNJ avant le tir. Le script affiche la course de la culasse, le recul en degrés et l'état de la balle.

```bash
VISER=cible node scripts/capture-mission.mjs t3 tir1          # shots/t3/tir-m1.png
VISER=cible APRES=4 node scripts/capture-mission.mjs t3 tir1  # la lueur du coup de feu
```

Mesuré au commit de T3 : lunette ouverte et à mi-ouverture (`lunette1`, `mi-lunette1`, `lunette2`, `mi-lunette2`) identiques à l'octet près à celles de T2 (`shots/lot2-t2/`) : sans tir, la lunette ne change pas. Après un tir sur la cible de M1 (`VISER=cible`) : à 200 ms, recul de 0,94° encore en cours, culasse à 17 %, sillage visible dans la lunette (`12f1d191bebfe186`) ; à 67 ms, recul de 2,11°, lueur visible (`e843ffb30fbde801`).

**Attente des modèles** : jusqu'à L2, le script comptait aussi les messages « [characters] chargé » de la première page, celle qui pose la sauvegarde et qui charge encore ses modèles quand on la quitte. Le clic sur COMMENCER partait alors parfois avant la fin du chargement de la page rechargée : 488 tirages de hasard en moins avant le clic (les identifiants des objets three.js en consomment), donc d'autres fenêtres allumées, d'autres tonneaux, d'autres PNJ, au même code, environ une capture sur trois. Seuls comptent désormais les messages de la page rechargée (son contexte d'exécution).

## Lot 2 : vérification de fin de lot (tâche T8)

Vérifications du 15 octobre 2026, toutes les tâches du lot faites (T1 à T7, code du jeu de `a817809`), avec les scripts et les tests de la tâche T8. Elles répondent aux critères du §5 de la spec du lot 2 (`docs/superpowers/specs/2026-10-09-lot2-le-tir-design.md`).

### Mémoire et performance (`2026-10-09-memtest-apres-lot2.json`, `2026-10-09-memtest-apres-lot2-bas.json`)

```bash
node scripts/memtest.mjs --check --qualite=moyen --comparer=2026-10-07-memtest-apres-lot1.json --annexe=2026-10-09-memtest-apres-lot2.json
node scripts/memtest.mjs --check --qualite=bas --comparer=2026-10-07-memtest-apres-lot1-bas.json --annexe=2026-10-09-memtest-apres-lot2-bas.json
```

SwiftShader, sur `a817809` (« modifié » dans les annexes : les scripts, les tests et les documents de T8, en cours ; aucun fichier du jeu). Les cinq seuils du lot 1 sont tenus dans les deux préréglages, et les 26 étapes sont identiques à l'unité près à celles de la fin du lot 1 (géométries, textures, programmes, appels, triangles, ressources des modèles) :

| | Fin du lot 1, Moyen | Fin du lot 2, Moyen | Fin du lot 1, Bas | Fin du lot 2, Bas |
|---|---|---|---|---|
| M6 à la vue de départ : appels, triangles | 294, 1 422 955 | 294, 1 422 955 (écart 0 %) | 290, 1 330 361 | 290, 1 330 361 (écart 0 %) |
| Retour de campagne (`menu-campagne`) : géométries, textures, programmes | 447, 32, 31 | 447, 32, 31 | 447, 32, 19 | 447, 32, 19 |
| Relances de M6, arènes PvP | Δ = 0 | Δ = 0 | Δ = 0 | Δ = 0 |
| Fin de partie (`menu-final`) | 447, 32, 34 | 447, 32, 34 | 447, 32, 22 | 447, 32, 22 |
| Tas JS à `M6-10`, puis à `menu-final` (indicatif) | 54 Mo, 51 Mo | 56 Mo, 52 Mo | 54 Mo, 51 Mo | 56 Mo, 52 Mo |

Critère « triangles et appels de dessin en M6 (Moyen) à ±3 % du lot 1 » : tenu, à l'unité près, en Moyen comme en Bas (`--comparer`). Rien de ce que le lot 2 ajoute n'est dessiné à la vue de départ : l'écho est un nœud audio, le marquage du décor ne pose que `userData.solid` et `userData.surface`, et marques, gerbes et sillages n'existent qu'après un tir. Garde : `tests/gfx/memtest.test.js`, « annexes : mesures versionnées du lot 2 » (cinq seuils en Moyen et en Bas, M6 à ±3 % du lot 1 ; témoin : la référence d'avant le lot 1 sort des ±3 %, en triangles comme en appels).

La route `?memtest=1` ne tire aucune balle : la libération des marques, des gerbes et des sillages est gardée par les tests au faux renderer (`tests/gfx/effects.dispose.test.js` : 100 tirs touchés, puis 100 tirs dans le décor de chaque matière, Δ = 0 après leur fin de vie ; marque rattachée à une jeep, rien du trou libéré avec elle), celle de l'écho par `tests/audio.test.js` et `tests/shot/main.sound.test.js` (une seule `ConvolverNode` par mission, débranchée au démontage). Dans le jeu, la capture `retour3` (plus bas) le montre aussi.

**Serveur Vite froid** : la mesure arrêtée avant toute étape (titre « memtest:modeles ») est relancée une fois (`measureWithRetry`, garde : `tests/gfx/memtest.test.js`, témoin vu rouge sur l'ancien comportement, une seule mesure). Essayé sur un second Vite 8.1 lancé à neuf, cache vidé (port 5177, configuration et cache hors du dépôt, arrêté ensuite) : deux mesures, lancées aussitôt le serveur prêt, finies du premier coup. L'arrêt du lot 1 ne s'est donc pas reproduit ; le nouvel essai reste un filet.

### Parcours réels (`scripts/verif-mission.mjs`)

Trois scénarios neufs (`tete`, `culasse`, `difficulte`), avec `occlusion` (tâche T5) et `son` (tâche T6). Chaque scénario de comportement a été vu rouge sur le comportement d'avant le lot 2, remis le temps d'une passe dans `src/main.js` (servi par le Vite du port 5173), puis retiré :

| Scénario | Ce qu'il vérifie | Témoin vu rouge |
|---|---|---|
| `tete` | M2, cible posée à découvert sur la place (à une trentaine de mètres, en plongée), debout puis accroupie (relecture de T8 : `__placer(…, 'react')`, la pose d'un PNJ qui se baisse après un tir proche, le milieu du crâne vers 0,9 m au-dessus des pieds, vérifié avant le tir), et M6, commanditaire assis : lunette ouverte, souffle retenu, visée au milieu du crâne ; la balle touche la tête (`dernierImpact.part`), la cible tombe, le fil dit HEADSHOT | la tête jugée comme avant (au-dessus de 1,45 m) : M2 debout reste vert (toute sa tête dépasse 1,45 m : le bas de la zone, menton compris, est à 1,51 m au moins sur les sept modèles), M2 accroupie rouge (relecture de T8 : sa tête compte pour le torse), M6 rouge (la tête du commanditaire assis compte pour le torse). Avec les boîtes d'avant en entier, M2 accroupie rouge (torse) et M6 rouge aussi : trois essais sur trois, la balle prend un danseur voisin, dont la boîte de 0,8 m déborde sur la ligne de tir |
| `culasse` | M1, visée dans le ciel : trois clics en moins de 1,2 s (pendant le vol, puis balle arrivée) ne donnent qu'un tir ; la culasse revient 1,2 s après le coup à l'horloge de la mission, à une image près (`__aim().horloge`, relevée à la première image où le clic gauche tire de nouveau) ; le clic suivant tire | sans la culasse dans `shoot()` : deux tirs, le second 464 ms après le premier. Relecture de T8 : la durée était lue à l'horloge murale (de 1 100 à 1 800 ms), qu'une machine lente fait dépasser sans défaut du jeu (le pas du jeu est plafonné à 50 ms) : rouge à `RALENTI=20` (2 143 ms), alors que la mesure à l'horloge de la mission y reste verte (1,2 s) ; et elle laissait passer une culasse de 1,3 s (1 318 ms), qui sort maintenant rouge, comme une de 1,15 s (`CULASSE.dureeS`) |
| `occlusion` | M3 : une cible posée derrière le conteneur rouge, visée à travers lui : aucune touche, balle arrêtée sur le métal | sans le décor dans la résolution : la cible touchée à travers le conteneur |

Deux passes de suite de tous les scénarios (19) : 19 verts à chacune, refaites après la relecture de T8 (`tete` et `culasse` ci-dessus, variable `RALENTI=n` du script : processeur de la page ralenti n fois). Pour y arriver, trois corrections du script (aucune du jeu) :
- **un PNJ posé à découvert** pour les tirs qui doivent toucher : les scénarios qui abattent un civil (`aide-briefing`, `aide-echec`, `civil-echap`) et `aide-reussite` posent leur PNJ au milieu de la rue (`__placer`), `tete` pose la cible de M2 sur la place. Depuis que le décor arrête la balle, un civil visé là où il marchait pouvait se trouver derrière un banc ou un étal (relevé sur 15 premiers tirs : 2 dans le bois ou le sol) ; le tir manqué faisait fuir la cible, et l'échec « Une cible a fui » tombait parfois pendant le vol du tir suivant (`aide-briefing` rouge sur une passe). De même, un tir à la tête mené sur une cible de M2 qui marche est passé une fois derrière la tête (au sol, à 46 m) : la cible a changé de pas pendant le vol. La limite connue d'`aide-reussite` (non concluant une fois sur trois, un civil sur la ligne de tir) disparaît du même coup ;
- **une balle figée** : hors de la phase de jeu, une balle en vol ne se résout jamais. Le script attendait son arrivée (20 s, puis rouge) ; il attend désormais qu'elle arrive ou que la mission prenne fin (`BALLE_ARRIVEE`), et `aimAndShoot` rend `null` si la mission a pris fin avant que le tir soit prêt ;
- **relance de la mission** (`restart`, scénario `difficulte`) : depuis la pause (RECOMMENCER LE NIVEAU) ou depuis l'écran d'échec (RÉESSAYER), une fois la balle arrivée ou la mission finie.

### Difficulté (§6 de la spec)

Scénario `difficulte` : M2, cible qui marche (0,6 m/s) ou fuit (4,8 m/s), à une trentaine de mètres en plongée, souffle relâché (apnée en moins : le tremblement entier), la mission relancée avant chaque essai. Rapport sans seuil : le scénario ne rougit que si la mesure elle-même échoue. Une seule passe de 64 essais par mesure, avec le script commité (`0b39686`, 15 octobre 2026, 20 minutes sur la carte graphique). La commande à relancer (le hasard du jeu n'est pas à graine dans ces parcours : les chiffres varient d'une passe à l'autre, voir la dernière remarque) :

```bash
ESSAIS=64 node scripts/verif-mission.mjs difficulte
```

| Mesure | Tête | Torse | Membre | Manqué | Autre PNJ | Non concluant |
|---|---|---|---|---|---|---|
| Au repos (stress proche de 0), visée au crâne, cible menée | 63 | 0 | 0 | 1 | 0 | 0 |
| Stress plein (lunette tenue 14 s), même visée | 30 | 5 | 4 | 25 | 0 | 0 |
| En fuite, visée au torse sans la mener (avance 0), après la culasse | 0 | 0 | 0 | 62 | 0 | 2 |
| En fuite, visée au torse en la menant | 8 | 52 | 0 | 3 | 0 | 1 |

- **Au repos, la touche reste quasi certaine** : 63 tirs sur 64 abattent la cible, tous à la tête (98 %). Le tir manqué tient à la cible qui marche (elle peut changer de pas pendant le vol de 0,45 s), pas au tremblement (0,4 mrad, un peu plus d'un centimètre à 31 m).
- **Sous le stress, elle devient incertaine** : 30 tirs sur 64 à la tête (47 %), 39 sur 64 abattent la cible (61 %). Le §3.6 de la spec prévoyait environ 45 % à la tête pour une cible immobile à 30 m ; un écart radial de 14 cm (4,5 mrad à 31 m) donne 40 % de chances de tomber dans une sphère de 10 cm.
- **Une cible en fuite qu'on ne mène pas est manquée à chaque fois** (0 sur 62 essais concluants) : à 4,8 m/s, elle parcourt 2,2 m pendant le vol. Menée, elle est abattue 60 fois sur 63 essais concluants. C'est le point de la relecture de T3, à juger par Rayan (`docs/superpowers/REPRISE.md`, « Lot 2 : réglages à juger en jouant »).
- Non concluant : la cible n'a pas fui après la balle tirée au-dessus d'elle, ou une cible en fuite (souvent l'autre) est sortie du champ avant le tir suivant (échec « Une cible a fui »).
- Relecture de T8 : la série d'avant (huit passes de 8 essais, dont six faites avec des versions antérieures du script) donnait, dans le même ordre, 61 tirs à la tête au repos, 26 au stress plein (41 %), 0 sur 63 en fuite sans avance et 61 sur 63 menée. Les écarts tiennent au hasard de 64 essais : pour une proportion proche de 45 %, l'écart type est d'environ 6 points, et les deux séries réunies donnent 56 tirs à la tête sur 128 au stress plein (44 %). Les chiffres ci-dessus remplacent cette série.

### Captures avant et après le lot 2

Avant : `main` à `7a39416` (la fin du lot 1 et celle de l'enquête, dont aucune ne touche les missions), extrait par `git archive` hors du dépôt et servi par un second Vite (port 5178, `three` pris dans le `node_modules` du dépôt, cache à part, arrêté ensuite) ; après : la branche `lot2-tir`. Même script des deux côtés (`scripts/capture-mission.mjs`, depuis T8 tolérant à l'accroche `__aim()` d'avant le lot 2, sans `ouverture`), `QUALITE=moyen`, SwiftShader ; tirs avec `VISER=cible` en M1, M3 et M6, droit devant en M5 (le colonel est encore loin sur la route). Dossiers locaux `shots/t8-lot1/` et `shots/t8-lot2/`, non versionnés ; empreintes SHA-256 (16 premiers caractères) :

| Vue | Avant le lot 2 | Après | Comparaison |
|---|---|---|---|
| M1, vue de départ | `1f9320a9125af481` | `1f9320a9125af481` | identiques à l'octet |
| M3, vue de départ | `a0ad90f07a31fe99` | `a0ad90f07a31fe99` | identiques à l'octet |
| M5, vue de départ | `e06b0935c131d70c` | `e06b0935c131d70c` | identiques à l'octet |
| M6, vue de départ | `4a1e32d882ada935` | `4a1e32d882ada935` | identiques à l'octet |
| M1, lunette ouverte (`lunette1`) | `36cd1ee2be2f8e6b` | `0f62458ba92a9543` | au pixel : réticule et barre de stress seulement |
| M3, lunette ouverte | `fad007cffe560135` | `bbd334b94f3a4627` | au pixel : réticule et barre de stress seulement |
| M5, lunette ouverte | `5bbc13115523c57a` | `a055f62ee5cad3c7` | au pixel : réticule et barre de stress seulement |
| M6, lunette ouverte | `e336de88d1dd5df9` | `a0c107d9c13c9eea` | au pixel : réticule et barre de stress seulement |
| M1, 200 ms après un tir (`tir1`) | `d7d44477b23b0776` | `bb4fac73e2ea2d40` | à l'œil |
| M3, après un tir | `b38c93652fc54fd5` | `fdccdcc6658aa39b` | à l'œil |
| M5, après un tir | `2657a1bb8adc2b5f` | `2a3e8573dde664e4` | à l'œil |
| M6, après un tir | `d2ba802ae1643ad8` | `9258b880c74ffe45` | à l'œil |

- **Vues de départ** : identiques à l'octet près avant et après le lot, et identiques à celles de la fin du lot 1 (`shots/l8-moyen/`, tableau « Avant et après le lot 1 ») : le serveur du code d'avant rend bien ce que rendait le lot 1, et le lot 2 ne change rien à la vue de départ (le hasard à graine tire les mêmes nombres : l'écho a son propre générateur, la pluie du port aussi depuis la relecture de T6).
- **Lunette ouverte** (15 images après le clic droit) : 0,3 à 0,4 % des pixels diffèrent, tous sur le réticule et au bout de la barre de stress du HUD. La scène, la vignette et le reste du HUD sont identiques au pixel près : le réticule est déplacé par le tremblement, réglé en milliradians depuis T1, et le stress monte moins vite (0,07 par seconde au lieu de 0,48).
- **Après un tir** : avant le lot, rien ne dit le coup à 200 ms (la cible au centre du réticule, la balle en vol invisible) ; après, la vue est relevée par le recul (0,94° encore, sur les 2,5° du coup), le sillage monte du bas de l'image vers le point visé, et la jauge de la culasse (17 %) barre le trait vertical du réticule sous son centre : c'est le point de la relecture de T3, à juger par Rayan. Personnages, textures, décor et ombres sont intacts dans les quatre missions.
- **Retour au menu** (`retour3`, après trois tirs manqués au port, marques, gerbes et sillage encore en vie) : 16 objets hors de la carte avant le retour (les PNJ, le cadenas, les trois marques et le sillage), aucun au menu (`{"fond":"87a0b0","horsCarte":[]}`).

## Lot 5 : fumée du livrable Electron (tâche E1)

Le jeu installé n'avait jamais été lancé sur ce PC (spec du lot 5, §0.4) : rien ne prouvait qu'il charge ses modèles et ses images sous `file://`, où three charge par `fetch`. `scripts/fumee.mjs` lance le jeu construit (`dist/`) dans Electron en mode `--fumee` (`electron/main.js`, section « Fumée du livrable ») :

- **rien sur le bureau** : fenêtre cachée (`show: false` ; une fenêtre montrée par un autre code est recachée aussitôt et la fumée sort rouge), son coupé, exceptions du processus principal rattrapées (jamais la boîte de dialogue d'Electron), dès la tête de `electron/main.js` : celles de son chargement comprises, par exemple un module absent du paquet, qui lève à son `require` (tâche E2) ;
- **profil jetable** (`--profil=<dossier>`, créé vide puis supprimé par le script) : jamais la sauvegarde du joueur ni son dossier dans `%APPDATA%`. Il est obligatoire, et doit être un dossier existant et vide : `electron/main.js` n'en crée jamais et ne confie jamais à Electron un profil qui a déjà servi. Sans lui, avec un dossier introuvable ou non vide (« profil jetable non vide : <chemin> », par exemple le profil du joueur passé à la main), ou avec un chemin qu'Electron refuse (relatif, ou sans lettre de lecteur), la fumée ne part pas (aucune fenêtre, aucun dossier créé) et sort en 1 ;
- **page jamais ralentie**, bien que cachée : `webContents.setBackgroundThrottling(false)`, posé à l'exécution. C'est le même effet que `backgroundThrottling: false` dans `webPreferences` (lettre de la spec, §3.2), choisi pour laisser intact le bloc `webPreferences` que modifie la tâche R5 du lot 6 (préchargement, bac à sable) ; un test exige ce bloc identique avec et sans `--fumee`, et jamais `webSecurity: false` ;
- **hors ligne** : toute requête `http`, `https`, `ws` ou `wss` de la page est bloquée et comptée (`session.webRequest.onBeforeRequest`, sans filtre : la garde voit chaque requête), boucle locale comprise. « 0 requête » se lit donc « 0 requête http, https, ws ou wss » : une préconnexion ou une prélecture DNS (aucune requête émise), WebRTC et un `file://hôte/partage` (partage réseau Windows) ne sont pas comptés ; le jeu n'en emploie aucun (`index.html` et `src/` relus le 28 octobre 2026) ;
- **scénario joué dans la page** par `executeJavaScript` depuis le processus principal (aucun port de débogage) :
  1. premier lancement : le menu propose COMMENCER (profil vierge), les modèles finissent de charger ; s'il propose autre chose, le profil a déjà servi : la fumée s'arrête là, rouge, sans rien écrire ;
  2. sauvegarde posée (M3 en cours, briefing de M3 pas vu), page rechargée : le menu propose REPRENDRE : MISSION 3 ;
  3. modèles chargés sans repli procédural : `data-modeles` (nombre chargé) et `data-modeles-echecs` (URL en échec), posés sur `<html>` par `src/characters.js` à la fin du chargement, seule trace lisible dans un build (pas de `__mission()`) ;
  4. REPRENDRE joue la cinématique m3 (la route `?cine=` n'existe qu'en développement) : ses quatre `<img>` sont chargées (`complete`, `naturalWidth > 0`) ;
  5. cinématique passée (Échap, renvoyé tant que le délai de grâce du jeu l'ignore) : la mission démarre (HUD) et le jeu note le briefing vu dans sa sauvegarde ;
  6. page rechargée : le menu propose toujours REPRENDRE : MISSION 3, et REPRENDRE va droit à la mission (briefing vu, relu dans la sauvegarde) ;
- **échecs comptés** : chargement en échec (`did-fail-load`), erreur de console, « [characters] échec », écart du scénario, page arrêtée, exception ou promesse rejetée du processus principal ;
- **délais de garde** : 60 s par étape du scénario et 3 min en tout dans le processus principal (la fumée se ferme seule, rouge), 5 min dans le script (Electron et ses processus fils tués, code 2, de nouveau si l'arrêt à 30 s est resté sans effet ; Electron toujours là 10 s après n'est plus attendu : « Pendant la fumée ») ;
- **aucun téléchargement** : le script lit le binaire d'Electron dans `node_modules/electron` (`path.txt`, puis `dist/`) sans `require('electron')`, qui le téléchargerait s'il manquait (environ 100 Mo) ; binaire absent, il le dit (« node node_modules/electron/install.js ») et sort en 2 ; avec `--exe`, il ne le cherche pas.

Commandes exactes sur la machine partagée des chantiers : le build par le verrou des tests, la fumée par le verrou Chrome (un seul Electron ou Chrome sans interface à la fois) ; `<copie>` nomme la copie de travail.

```bash
bash /c/Users/shark/Sniper-Game-reprise/.superpowers/sdd/verrou.sh tests "<copie> build" -- npx vite build
bash /c/Users/shark/Sniper-Game-reprise/.superpowers/sdd/verrou.sh chrome "<copie> fumée" -- node scripts/fumee.mjs
# le jeu empaqueté (tâche E2), après npm run dist :
bash /c/Users/shark/Sniper-Game-reprise/.superpowers/sdd/verrou.sh chrome "<copie> fumée" -- node scripts/fumee.mjs --exe=release/win-unpacked/Sniper.exe
```

**Refus avant tout lancement** (code 2, aucun profil créé, rien de lancé), dans cet ordre :

- un argument autre qu'un seul `--exe=<chemin non vide>` : « --exe chemin » avec une espace (qui ferait vérifier `dist/` à la place du paquet), « --exe= » vide, deux `--exe=`, argument inconnu ; le script répond « argument refusé » et donne l'usage ;
- avec `--exe`, un exécutable introuvable (chemin mal tapé, ou le dossier du paquet au lieu de l'exécutable) : « exécutable introuvable : <chemin> ». Il est vérifié avant le paquet, pour qu'une faute de frappe ne fasse pas reconstruire un paquet sain ;
- avec `--exe`, un paquet sans le mode fumée, c'est-à-dire sans la chaîne `--fumee` dans `resources/app.asar` (ou dans `resources/app/electron/main.js` sans asar) : par exemple un paquet construit avant E1, que rien ne lie au commit (`release/` est ignoré par git). Lancé, il ignorerait `--fumee` et `--profil` et ouvrirait le jeu normal, fenêtre visible, sur le profil du joueur ; le script répond « exécutable sans mode --fumee : relancer npm run dist » ;
- sans `--exe`, `dist/index.html` absent : « dist/index.html introuvable : lancer « npx vite build » avant la fumée » ;
- build périmé : un fichier ou un dossier de `src/` ou de `public/`, `index.html`, `vite.config.js`, `package.json` ou `package-lock.json` (versions des dépendances, three compris) plus récent que `dist/index.html` (avec `--exe` : plus récent que `resources/app.asar`, ou que le dossier `resources/app` pour un paquet sans asar, dont la date ne bouge que quand une entrée y est ajoutée, retirée ou renommée ; `electron/` compris, le processus principal étant dans le paquet) ; le script répond « build périmé : relancer npx vite build » (ou `npm run dist`) et nomme les entrées en cause, un dossier finissant par « / ». Un dossier compte par sa propre date, que NTFS change quand une entrée y est ajoutée, retirée ou renommée : une image retirée de `public/briefing/img`, un fichier déplacé (`git mv` garde sa date) ou copié avec sa date (Explorateur, `copyFileSync`) ne laissent aucun fichier plus récent, mais changent la date de leur dossier (vérifié le 29 octobre 2026). Limite : un contenu changé sans qu'aucune date ne bouge échappe au contrôle, par exemple un fichier écrasé par une copie qui garde sa date (même nom, même dossier) ou une date remise à la main, de même qu'une dépendance changée dans `node_modules` sans que `package-lock.json` change.

**Pendant la fumée** :

- `electron/main.js` écrit « [fumee] debut » dès son départ : sans cette ligne au bout de 30 s, le script arrête Electron et ses processus fils (`taskkill /F /T`) et sort en 2. Le `main.js` du dépôt l'écrit toujours (testé) : le script dit « Electron n'a pas démarré la fumée (bloqué au lancement ?) » ; avec `--exe`, la cause peut aussi être un paquet d'avant cette ligne, qui contient déjà la chaîne `--fumee` (« relancer npm run dist ») ;
- un arrêt peut rester sans effet : un `taskkill` en échec (statut non nul, ou `taskkill` introuvable) est dit sur la sortie d'erreur avec le PID, « taskkill /F /T /PID <pid> : statut <n> (l'arbre d'Electron n'est peut-être pas arrêté) », ou, si `taskkill` est introuvable, le message de l'erreur à la place de « statut <n> » (par exemple « spawnSync taskkill ENOENT »). L'arrêt est refait au délai de garde de 5 min, même après celui de 30 s ; Electron toujours là 10 s après n'est plus attendu : le script dit « Electron toujours là 10 s après son arrêt au délai de garde : plus attendu ; vérifier tasklist et l'arrêter à la main (taskkill /F /T /PID <pid>) », sort en 2 avec « FUMÉE ROUGE (<n> s) : Electron toujours là après son arrêt au délai de garde », suivie de « (aucune ligne « [fumee] debut » au bout de 30 s) » si c'est la première raison de l'arrêt, et rend le verrou Chrome au lieu d'attendre sans fin. Le profil, encore tenu par Electron, peut alors rester (« profil jetable non supprimé ») ;
- le résultat est lu une fois les flux d'Electron fermés : Node ne promet pas qu'ils soient vidés à sa sortie, et la ligne de résultat peut arriver après. L'attente dure 2 s au plus, un processus fils de Chromium pouvant garder le tube ouvert ; à partir de sa sortie, plus rien n'est tué, son PID ayant pu être repris par un autre processus ;
- interrompue une fois Electron lancé, dans sa console, par Ctrl+C (`SIGINT`), Ctrl+Pause (`SIGBREAK`) ou la fermeture de la console (`SIGHUP` : Windows laisse alors à node une dizaine de secondes, selon la documentation de Node, assez si le profil se supprime du premier coup), elle arrête d'abord l'arbre d'Electron (`taskkill /F /T` : Chromium tient les fichiers du profil tant qu'il tourne), supprime ensuite le profil et sort en 130 ; ces gestionnaires sont retirés en fin normale. Chemin vérifié au processus factice seulement, le test émettant le signal lui-même. `SIGTERM` est écouté, mais Windows ne le délivre jamais à node : un arrêt demandé par un autre processus (`process.kill`, `kill` de Git Bash, outil qui coupe la commande) y est un arrêt forcé, comme un `taskkill` sur node, et ne passe par aucun gestionnaire. Après un arrêt forcé, vérifier qu'aucun `electron.exe` (`Sniper.exe` avec `--exe`) ne reste (`tasklist`) et supprimer le dossier `sniper-fumee-*` laissé dans `%TEMP%` ;
- un profil impossible à supprimer après 20 essais espacés de 300 ms (fichier encore tenu par un processus fils de Chromium ou par l'antivirus) est signalé sur la sortie d'erreur, « profil jetable non supprimé : <chemin> », à supprimer à la main ; le verdict du jeu n'en dépend pas (même code de sortie).

Sortie : une fois les refus passés, ce qui est vérifié, `build vérifié : dist/index.html du <date> ; commit <commit court>, <n> lignes dans git status --porcelain` (le nombre de lignes, pas leur contenu ; avec `--exe`, la date de `resources/app.asar`, ou du dossier `resources/app` pour un paquet sans asar) : `dist/` et `release/` sont ignorés par git, rien d'autre ne lie le verdict à un commit. Un build refusé n'est jamais annoncé comme vérifié. Puis le JSON du scénario (`electron`, `origine`, `echecs`, `requetesBloquees`, `modeles`, `images`, `mission`, `sauvegarde`, `dureeMs`), puis FUMÉE VERTE ou FUMÉE ROUGE et ses raisons ; code 0 (vert), 1 (rouge), 2 (refus, ou aucun résultat : Electron arrêté avant d'écrire, sans « [fumee] debut » au bout de 30 s, tué au délai de garde, ou toujours là 10 s après et plus attendu), 130 (interrompue). Le vert demande le code 0 d'Electron **et** le critère 12 de la spec, relu par le script dans le JSON : aucun échec, aucune requête bloquée, des modèles chargés et aucun en échec, des images toutes décodées, la sauvegarde relue.

Garde : `tests/electron.fumee.test.js` (faux module `electron` et faux jeu monté dans jsdom ; le script lancé pour de vrai dans un bac à sable sans Electron ni exécutable, ou avec un lancement factice), chaque test vu rouge sur le code d'avant ou par mutation (garde réseau coupée, requête non comptée, modèle, image ou sauvegarde non vérifiés, délai de garde absent, sortie avant que la ligne de résultat soit écrite, `data-modeles` posé trop tôt, verdict vert sans résultat, binaire Electron résolu par `require`, etc. : 33 mutations, toutes vues rouges ; puis 5 à la relecture du profil obligatoire : profil temporaire créé par `electron/main.js`, profil absent non refusé, refus sans sortie rouge, fenêtre créée après un refus, chemin refusé par Electron non rattrapé, toutes vues rouges). Relecture finale de E1 : 18 tests rouges sur le code de `1b9ec53`, dont 16 témoins, 7 pour ce qu'ils exigent (« [fumee] debut » absente, deux tests ; profil non vide accepté ; profil introuvable confié à Electron ; sauvegarde d'un profil déjà servi remplacée par celle de M3 ; « --exe chemin » pris pour la fumée de `dist/` ; build périmé accepté) et 9 faute des fonctions neuves du script, l'identité du build comprise. Les deux tests `--exe` du bac à sable ne sont pas comptés comme témoins : ils sont rouges parce que l'ancien script a tenté de lancer l'exécutable, absent du bac (`spawn … ENOENT`). Le premier (paquet sans mode fumée) est vu rouge par la mutation du contrôle de `--fumee` (l'une des 22 qui suivent), le second (paquet périmé) par la mutation `electron/` oublié avec `--exe` (second tour, le test passé au lancement factice) ; puis 22 mutations, toutes vues rouges (garde sans réponse ou filtrée sur `https`, `webSecurity: !fumee`, sortie à 0 malgré des échecs, moitié rouge sur le stockage de la verte, faux `app.setPath` laxiste, profil introuvable laissé à Electron, sous-cadre, cadre principal, page arrêtée, promesse rejetée, filet de 2 s, délai d'étape, Échap envoyé une seule fois, contrôle de `--fumee` retiré, attente de « [fumee] debut » retirée, signaux ni posés ni retirés, profil restant tu, `public/` oublié, identité du build absente, `--exe=` vide accepté). Second tour de cette relecture (29 octobre 2026) : les tests de `--exe` passent au lancement factice, où le faux exécutable n'est qu'un fichier texte que rien ne lance ; 12 tests neufs ou resserrés rouges sur le code de `8ddbf71`, 10 pour ce qu'ils exigent (build périmé par `package.json`, par une entrée retirée d'un dossier, sources du build sans leurs dossiers, « build vérifié » imprimé avant un refus, chemin `--exe` mal tapé envoyé à « relancer npm run dist », cause du délai de 30 s, `SIGHUP` sans gestionnaire dans deux tests, ligne de résultat arrivée après « exit » perdue, aucune attente des flux) et 2 faute du code neuf (`tuerArbre` absent, aucune attente entre la sortie d'Electron et la fermeture de ses flux) ; puis 11 mutations du script final, toutes vues rouges (profil supprimé avant l'arbre tué, `taskkill` sans `/T`, attente des flux sans borne, résultat relu à « exit », arbre tué après la sortie d'Electron, délais laissés armés après sa sortie ; pour les tests de `--exe` passés au lancement factice, paquet sans mode fumée accepté, `electron/` oublié avec `--exe`, exécutable ignoré au lancement ; `package-lock.json` oublié ; un dossier passé à `--exe` envoyé à « relancer npm run dist »). Retouches après le second tour (2 novembre 2026) : 4 tests neufs rouges sur le code de `863bab7`, chacun pour ce qu'il exige (un module absent du paquet, qui lève à son `require`, ouvre la boîte de dialogue d'Electron, les gestionnaires étant posés en fin de fichier ; statut d'un `taskkill` en échec tu ; arrêt par défaut qui n'emprunte pas le lanceur synchrone des outils, `tuerArbre` lancé avec le vrai `spawnSync`, `taskkill` étant rendu introuvable pour ce témoin par un `PATH` réduit au dossier de `node.exe` ; arrêt fait une seule fois, le script attendant ensuite sans fin). Les trois tests `--exe` qui exigent « rien lancé » lisent ce qui a été lancé avant d'attendre la fin de `main()`, et un faux Electron lancé par erreur sort au tour suivant : un lancement fautif les rend rouges en quelques millisecondes, sur l'assertion qui le nomme, sans rien laisser dans `%TEMP%`, au lieu du délai de 20 s de vitest et d'un bac à sable laissé. Puis 9 mutations, toutes vues rouges sans rien laisser dans `%TEMP%` (contrôle de `--fumee` retiré et build périmé jamais refusé, rouges en 30 et 16 ms ; arrêt par défaut sans effet ; arrêt fait une seule fois ; attente sans borne après l'arrêt au délai de garde ; dernière raison de l'arrêt gardée au lieu de la première ; statut de `taskkill` tu ; `require('fs')` remonté avant la ligne de la fumée ; `debuterFumee` appelée en fin de fichier).

### Résultat du 28 octobre 2026

Electron **42.5.0** (binaire installé dans la copie `Sniper-Game-fumee`, branche `lot5-fumee`), build de `2e4734c` plus cette tâche :

| Critère 12 de la spec | Résultat |
|---|---|
| Échecs (chargements, console, scénario) | 0 |
| Requêtes réseau, bloquées | 0 |
| Modèles | 7 chargés, 0 en échec : aucun PNJ procédural |
| Images de la cinématique m3 | 4 sur 4 décodées (360 et 40 px de large) |
| Mission lancée par REPRENDRE | HUD `Niveau 3 : Port  ·  3/6` |
| Sauvegarde | posée, lue au menu, notée par le jeu (briefing vu), relue après rechargement |
| Durée du scénario | 3,8 s (4 s avec le lancement d'Electron) |

Relecture finale de E1 (même jour) : fumée refaite sur un build frais, « build vérifié : dist/index.html du 28/10/2026 22:22:02 ; commit b491c75, 0 ligne dans git status --porcelain » ; verte, mêmes chiffres, scénario en 4,1 s. Ensuite : aucun processus Electron, aucun profil `sniper-fumee-*` dans `%TEMP%`.

Second tour de cette relecture (29 octobre 2026) : fumée refaite sur un build frais, « build vérifié : dist/index.html du 29/10/2026 18:07:25 ; commit 8a1bb1d, 0 ligne dans git status --porcelain » ; verte, mêmes chiffres, scénario en 4,4 s (5 s avec le lancement d'Electron). Ensuite : aucun processus Electron, aucun profil `sniper-fumee-*` dans `%TEMP%`.

Retouches après le second tour (2 novembre 2026) : fumée refaite sur un build frais, « build vérifié : dist/index.html du 02/11/2026 19:29:43 ; commit 7f74174, 0 ligne dans git status --porcelain » ; verte, mêmes chiffres, scénario en 5,4 s (6 s avec le lancement d'Electron). Ensuite : aucun processus Electron, aucun profil `sniper-fumee-*` dans `%TEMP%`, aucun dossier `sniper-game` dans `%APPDATA%`.

**Origine retenue : `file://`**, selon la règle de la spec du lot 5 (§3.2 : protocole `app://jeu` en repli, seulement si la fumée échoue sous `file://`) et de la tâche E1 du plan. C'est la décision T3 de la feuille de route des chantiers parallèles (`feuille-de-route.md` §5, hors dépôt), à ne pas confondre avec la tâche T3 du lot 2 (la culasse). T3 ajoute à cette règle l'ordre des replis : d'abord `app://jeu` sans `secure` (un schéma `secure` ferait bloquer l'invité du multijoueur comme contenu mixte), en dernier recours `app://jeu` sécurisé, la socket de l'invité étant alors ouverte par le processus principal ; la spec du lot 5 (§3.2) et le plan (tâche E1) suivent cet ordre. `fetch` et les modules ES du build (`<script type="module" crossorigin>`, morceaux chargés par `import()`) marchent sous `file://` dans Electron 42.5.0 : le protocole `app://jeu` n'a pas été nécessaire. Le `localStorage` des sauvegardes appartient à cette origine : ne plus la changer une fois une version publiée (spec du lot 5, §3.2).

**Pour le lot 6 (tâche R5, qui se rebase sur ce `electron/main.js`)** :

- garder en tête de `createWindow` la ligne `if (fumee && fumeeFinie) return` (aucune fenêtre après un refus du profil), et le même bloc `webPreferences` dans les deux modes (testé) ;
- tout `require` ajouté à `electron/main.js` (celui du relais `ws`, par exemple) vient après la ligne `if (fumee) debuterFumee()`, en tête de fichier, qui pose les gestionnaires d'exception de la fumée : un module absent du paquet y rend la fumée rouge au lieu d'ouvrir la boîte de dialogue d'Electron. Le test « un module requis qui lève au chargement » rend absent, l'un après l'autre, chaque module requis sauf `electron` et `path`, et rougit pour un `require` placé avant cette ligne ;
- sous `file://`, toute page locale a l'origine « file:// », qui ne désigne pas le jeu à elle seule : vérifier l'expéditeur des IPC contre l'URL exacte chargée par le processus principal (`file:///…/dist/index.html`, cadre principal) ;
- la garde de la fumée bloque et compte `ws://127.0.0.1` comme toute requête `ws` : une étape de fumée où la page se connecte au relais demandera une exception étroite (le port du relais ouvert par le processus principal), comptée à part ;
- la fumée sort par `app.exit`, qui n'émet ni `before-quit` ni `will-quit` : une étape qui ouvre le relais le ferme elle-même avant la fin ;
- le faux module `electron` de `tests/electron.fumee.test.js` n'a ni `ipcMain` ni `setWindowOpenHandler` : l'étendre comme celui de `tests/electron.test.js`.

**Témoin rouge réel** : le même build cassé de trois façons le temps d'une fumée, puis remis en place (fichiers comparés à leurs sources) : `models/mafia_woman_03.glb` retiré, `briefing/img/portrait-seconde-cam.jpg` retirée, une image `http://exemple.invalid/fumee.png` ajoutée à `index.html`. La fumée sort rouge (code 1) et nomme les trois : `"modeles":{"charges":6,"echecs":["./models/mafia_woman_03.glb"]}` et « [characters] échec ./models/mafia_woman_03.glb TypeError: Failed to fetch » à chacun des trois chargements de la page, « image non chargée : briefing/img/portrait-seconde-cam.jpg » (largeur 0), la requête `http` bloquée et comptée trois fois. Après chaque fumée : aucun processus Electron, aucun profil jetable restant, aucun dossier `sniper-game` dans `%APPDATA%`.

**Profil obligatoire, vérifié sur le vrai Electron 42.5.0** (relecture de E1, même jour) : `electron . --fumee` sans `--profil` sort en 1 au bout de 1,8 s, avec « profil jetable manquant ». Avec `--profil=profil-relatif`, il sort en 1 avec « profil jetable refusé par Electron : profil-relatif (Path must be absolute) ». Dans les deux cas : aucun dossier `sniper-fumee-*` dans `%TEMP%`, aucun dossier `sniper-game` dans `%APPDATA%`, rien dans le dossier de travail, aucun processus Electron restant. La fumée complète, refaite ensuite, reste verte (4,1 s, mêmes chiffres que ci-dessus). Depuis la relecture finale, `electron/main.js` lit le dossier avant de le confier à Electron : un chemin qui n'existe pas sort sur « profil jetable introuvable » (c'est le cas d'un `profil-relatif` absent du dossier de travail), un dossier non vide sur « profil jetable non vide ». Ces deux refus ne sont vérifiés qu'au faux module : sur la machine partagée, le vrai Electron ne se lance que par `node scripts/fumee.mjs`, qui crée toujours un dossier vide.

La fumée ne joue pas la mission (aucun tir) : elle prouve que le jeu construit démarre hors ligne, charge ses modèles et ses images, lance une mission et relit sa sauvegarde après un rechargement de la page (même processus Electron : la relance du jeu sur le même profil n'est pas vérifiée). Le jeu empaqueté (`--exe`) se vérifie à la tâche E2.

## Cinématiques v2 : coût de rendu (`scripts/cine-perf.mjs`, `2026-10-28-cine-*.json`)

### Ce que c'est

`scripts/cine-perf.mjs` (tâche C3 du plan `docs/superpowers/plans/2026-10-28-cinematiques-v2.md`) joue une cinématique dans le jeu par la route de développement `?cine=<id>`, dans Chrome sans interface en temps réel, rendu sur la carte graphique, page de 1280 × 720. Une sonde injectée avant les scripts de la page relève, du montage de la scène (`#st`) à son démontage :

- la durée de chaque image, l'écart entre deux rappels de `requestAnimationFrame`, comme le panneau de performances du jeu : p50 et p95 au rang le plus proche (comme `frameStats`, `src/gfx/stats.js`), la plus longue et l'instant où elle finit, les images lentes (au-delà de 22 ms, le `BUDGET_MS` du panneau), les images par seconde en moyenne ;
- toutes les 250 ms, les animations en cours : `document.getAnimations()` dans l'état `running` (animations et transitions CSS ; une transition dès sa création, son délai compris) ; le maximum sur la scène et son instant, et le maximum de toutes les animations rendues (finies et en pause comprises).

Plafonds de la spec des cinématiques v2 (§3.6), à processeur ralenti 4 fois : au plus 40 animations en cours, p95 au plus 22 ms et au plus 1,15 fois celle de la v1 de la même scène. Lecture de ces plafonds d'après la référence ci-dessous : spec, §3.6, « Mesuré en C3 », et décision D8 (§4), à trancher par Rayan.

Conditions de mesure, toujours les mêmes (en-tête du script) :

- **modèles des personnages bloqués** (`Network.setBlockedURLs`, `*.glb`) : sur la route `?cine=`, le jeu lance au démarrage le chargement de ses sept modèles, en même temps que la scène, alors qu'en partie un briefing se joue modèles chargés. Leur lecture chargerait les premières secondes de la mesure ; bloqués, ils échouent aussitôt (sept avertissements « [characters] échec » dans la console, attendus) ;
- **page de 1280 × 720** posée par `Emulation.setDeviceMetricsOverride` : sans interface, `--window-size=1280,720` seul donne une page de 1264 × 625 (la fenêtre compte son cadre) ;
- **cadence de l'écran de la machine** : sans écran, Chrome cale ses images sur la synchro de l'écran principal. Sur la machine de Rayan (écran à 180 Hz), les durées d'image sont des multiples de 5,56 ms : une image à l'heure dure 5,6 ms, une image en retard d'une synchro 11,1 ms. La p95 ne bouge donc que par pas de 5,56 ms, et une mesure ne se compare qu'à une mesure de la même machine ;
- **étalon** : la sonde chronomètre une boucle de calcul fixe avant tout script de la page ; sous `--ralenti=4`, elle dure environ quatre fois plus (preuve que le ralenti s'applique à la page) ;
- relevés bruts (chaque durée d'image, chaque relevé d'animations) dans `shots/cine-perf-<cas>-x<ralenti>-<horodatage>.json`, non versionné ; l'annexe ne garde que la synthèse.

### Relancer la mesure

Le serveur de développement du jeu doit tourner (`npm run dev`, port 5173 ; une autre copie : `BASE_URL=http://localhost:<port>/`). Un seul Chrome sans interface à la fois sur la machine, et rien de lourd pendant la mesure (tests, build, partie) : tout ce qui occupe le processeur se lit dans les durées d'image.

```bash
node scripts/cine-perf.mjs m3                         # une mesure : résumé à l'écran, relevés bruts dans shots/
node scripts/cine-perf.mjs m3 --ralenti=4             # processeur de la page ralenti 4 fois (PC de milieu de gamme, spec §3.6)
node scripts/cine-perf.mjs epilogue --params=port=libres --ralenti=4 --annexe=2026-10-28-cine-v2.json   # ajoutée à une annexe (créée au besoin)
node scripts/cine-perf.mjs prologue-b --params=attenue=1   # version atténuée (route ?cine=…&attenue=1)
```

`--annexe=<nom>.json` ajoute la mesure à `docs/superpowers/specs/annexes/<nom>` (créée au besoin) sans retirer les précédentes ; `passe` numérote les mesures d'un même cas au même ralenti. L'annexe de la v1 (`2026-10-28-cine-v1.json`) est close : une autre version, ou la v1 remesurée pour une comparaison, s'écrit dans une autre annexe (celle de la v2 en C17 : `2026-10-28-cine-v2.json`), où le champ `commit` dit la version de chaque mesure. Une mesure en échec (scène jamais montée ou jamais finie, aucune image, erreur dans la console de la page) n'y est pas ajoutée et sort en code 1 ; une option fausse (faute de frappe, scène inconnue, `freeze` dans `--params`) sort en code 2 sans rien lancer. Variables : `CHROME`, `BASE_URL`, `SWIFTSHADER=1` (rendu logiciel, durées sans valeur pour ces plafonds).

Sans `SWIFTSHADER`, la carte graphique est demandée, mais Chrome se replie en silence sur un rendu logiciel quand elle n'est pas disponible. La mesure se fait quand même et le signale : « attention : mesure faite hors de la carte graphique… » à l'écran, champ `avertissement` dans l'annexe et dans les relevés bruts (absent quand tout s'est fait sur la carte), d'après le moteur WebGL (SwiftShader, ou WARP, le « Microsoft Basic Render Driver » de Windows) et la composition (`gpu_compositing` autre que `enabled`). C'est le moteur qui trahit SwiftShader : essayé le 29 octobre sur prologue A (drapeaux de la carte remplacés par ceux de SwiftShader le temps d'une mesure), la composition y restait `enabled`, et la p95 passait de 11,1 à 211 ms.

### Référence de la v1 (`2026-10-28-cine-v1.json`)

Mesures du 28 octobre 2026, de 21 h 18 à 21 h 50, sur `aa121c9` (scènes de la v1, kit d'après la tâche C2), servies par le Vite de la copie `Sniper-Game-cine` : les 10 cas (les neuf scènes, l'épilogue dans ses deux variantes), à processeur normal puis ralenti 4 fois, deux passes de chaque, dans l'ordre ×1, ×4, ×1, ×4 (`--annexe=2026-10-28-cine-v1.json`). 40 mesures, toutes finies sans erreur, toutes dans les mêmes conditions (page de 1280 × 720 visible, composition sur la carte graphique, sept modèles bloqués). Machine de Rayan (Intel Core i7-10700K, 16 fils ; RTX 3080 ; écran à 180 Hz), partagée avec trois autres chantiers : charge du processeur relevée avant chaque cas de 29 à 99 %, et une suite de tests d'une autre copie déjà en cours au départ de 9 des 40 mesures (les trois premiers cas de chaque passe à ×4, les trois derniers de la seconde passe à ×1).

Durées en ms, « passe 1 / passe 2 » ; max : l'image la plus longue et l'instant où elle finit, en s depuis le montage de la scène ; images lentes : au-delà de 22 ms.

Processeur à sa vitesse :

| Cas | p50 | p95 | max (à s) | images lentes | images par seconde | animations en cours au plus (à s) |
|---|---|---|---|---|---|---|
| m1 | 5,6 | 5,7 / 5,6 | 139 (0,2) / 139 (0,2) | 6 / 6 | 178 / 178 | 62 (1,0) / 63 (4,6) |
| m2 | 5,6 | 5,7 / 5,6 | 172 (0,2) / 183 (0,3) | 18 / 18 | 176 / 175 | 28 (16,1) / 28 (16,1) |
| m3 | 5,6 | 5,6 / 5,7 | 189 (0,3) / 150 (0,2) | 14 / 13 | 176 / 176 | 45 (32,2) / 43 (33,0) |
| m4 | 5,6 | 5,7 / 5,7 | 222 (18,0) / 228 (18,0) | 18 / 28 | 174 / 172 | 22 (9,7) / 23 (10,7) |
| m5 | 5,6 | 5,7 / 5,7 | 217 (0,2) / 300 (0,3) | 11 / 14 | 177 / 175 | 40 (17,6) / 40 (17,7) |
| m6 | 5,6 | 5,7 / 5,7 | 139 (0,2) / 145 (0,2) | 13 / 11 | 177 / 177 | 69 (1,1) / 69 (1,1) |
| épilogue, libres | 5,6 | 5,7 / 5,7 | 683 (1,2) / 617 (1,1) | 42 / 38 | 169 / 170 | 45 (25,7) / 45 (25,6) |
| épilogue, enfermés | 5,6 | 5,7 / 5,7 | 733 (1,3) / 778 (1,4) | 42 / 51 | 168 / 166 | 46 (26,1) / 46 (26,2) |
| prologue A | 5,6 | 11,2 / 11,2 | 350 (0,4) / 472 (0,5) | 18 / 30 | 143 / 133 | 13 (13,0) / 13 (13,3) |
| prologue B | 5,6 | 11,2 / 16,1 | 439 (0,5) / 461 (38,6) | 59 / 122 | 140 / 126 | 20 (14,6) / 22 (45,4) |

Processeur ralenti 4 fois (`--ralenti=4`, l'approximation d'un PC de milieu de gamme) :

| Cas | p50 | p95 | max (à s) | images lentes | images par seconde | animations en cours au plus (à s) |
|---|---|---|---|---|---|---|
| m1 | 5,6 | 11,1 / 11,1 | 200 (0,2) / 172 (0,2) | 15 / 15 | 165 / 164 | 62 (1,1) / 62 (1,1) |
| m2 | 5,6 | 11,1 / 11,2 | 356 (0,4) / 400 (0,4) | 22 / 51 | 164 / 148 | 28 (16,1) / 26 (16,4) |
| m3 | 5,6 | 16,6 / 11,3 | 478 (0,5) / 545 (0,5) | 84 / 57 | 116 / 121 | 47 (32,3) / 45 (32,4) |
| m4 | 5,6 | 11,0 / 5,7 | 333 (0,3) / 306 (0,3) | 28 / 30 | 164 / 167 | 21 (9,8) / 21 (13,6) |
| m5 | 5,6 | 11,2 / 11,1 | 994 (1,0) / 1 011 (1,0) | 28 / 14 | 148 / 154 | 40 (18,4) / 40 (18,4) |
| m6 | 5,6 | 11,1 / 11,2 | 311 (0,3) / 300 (0,3) | 26 / 54 | 158 / 143 | 70 (5,0) / 70 (4,9) |
| épilogue, libres | 5,6 | 11,1 / 11,2 | 561 (1,6) / 622 (1,7) | 42 / 70 | 158 / 132 | 45 (26,0) / 45 (26,2) |
| épilogue, enfermés | 5,6 | 11,1 / 11,1 | 578 (1,6) / 678 (1,7) | 56 / 73 | 152 / 143 | 46 (26,5) / 46 (26,5) |
| prologue A | 5,6 | 16,6 / 11,2 | 356 (3,1) / 345 (0,5) | 47 / 32 | 127 / 131 | 13 (13,3) / 13 (13,2) |
| prologue B | 5,6 | 11,2 / 11,2 | 400 (38,6) / 433 (38,7) | 90 / 80 | 129 / 130 | 23 (45,5) / 23 (45,5) |

Ce qu'on y lit :

- **Plafond de 22 ms : tenu partout, avec de la marge.** p50 de 5,6 ms dans les 40 mesures (une image par synchro de l'écran) ; à ×4, p95 de 5,7 à 16,6 ms, soit une à trois synchros. m3 est la scène la plus lourde (116 à 121 images par seconde à ×4, 57 à 84 images lentes), puis les prologues (127 à 131) et l'épilogue (132 à 158).
- **Bruit d'une passe à l'autre** : la p95 saute d'une synchro entre deux passes du même code dans 3 cas sur 10 à ×4 (m3 16,6 puis 11,3 ; m4 11,0 puis 5,7 ; prologue A 16,6 puis 11,2) et dans 1 cas sur 10 à ×1 (prologue B, 11,2 puis 16,1, la seconde fois avec une suite de tests d'une autre copie en cours) ; images lentes et images par seconde varient jusqu'à du simple au double (m2 à ×4 : 22 puis 51 images lentes). « p95 au plus 1,15 fois la v1 » ne se lit donc pas sur une seule passe : 1,15 × 11,1 = 12,8 ms, sous la synchro suivante (16,7 ms), et un saut d'une synchro, que le bruit seul produit, le ferait échouer. Pour comparer une version à cette référence : même machine, passes des deux versions alternées dans la même séance, un écart retenu seulement s'il se répète.
- **L'image la plus longue est celle du montage de la scène** dans 34 mesures sur 40 (0,2 à 1,7 s après l'apparition de `#st` : toute la scène posée dans la page, ses images décodées) : 139 à 778 ms à ×1, 172 à 1 011 ms à ×4 (m5 : une seconde à ×4 ; épilogue : 0,56 à 0,78 s). Ailleurs : m4 à 18,0 s à ×1 (222 et 228 ms, juste après le repère de 17 692 ms qui fait apparaître `#print` et ses tickets), prologue B à 38,6 s (400 à 461 ms) et prologue A une fois à 3,1 s.
- **Animations en cours : au-delà de 40 dès la v1 dans quatre scènes**, les mêmes d'une passe à l'autre à 2 près (rien d'aléatoire n'en décide) : m6 (69 et 70), m1 (62 et 63), m3 (43 à 47), l'épilogue (45 et 46) ; m5 est à 40 tout juste. Une transition compte dès sa création, son délai compris : des fondus échelonnés par `transition-delay` comptent tous ensemble dès que la classe qui les lance est posée. Un relevé toutes les 250 ms peut manquer de quelques unités le sommet d'une pointe brève (m3 : 43 vers 15,8 s au relevé de 100 ms du diagnostic, 41 dans les quatre passes). Détail relevé par deux passes de diagnostic (une sonde non versionnée qui groupe les animations en cours par sorte, nom et élément ; la seconde, le 29 octobre, toutes les 100 ms, sur les pointes de m6 et de m3), puis dans les relevés bruts :
  - m1 et m6 : 55 à 56 transitions `height` des barres de l'onde du kit (`.st .wave i`, `transition: height .09s` dans `kit.css`, hauteurs tirées à nouveau toutes les 90 ms par `K.wave`), pendant l'écoute du téléphone (de 1,0 à 4,6 s en m1, de 1,1 à 7,8 s en m6). Ce sont des transitions de mise en page, pas de composition. Sans elles, m1 ne dépasse pas 19 ;
  - m6 garde, hors de l'écoute, deux pointes au-delà de 40 : 57 à 60 à 24,7 s, au début de la fête, quand les 24 invités apparaissent en fondu (`#guests.on .gst`, `transition: opacity .2s` et 28 ms de délai de plus par invité : 24 transitions en cours ensemble) pendant que 10 danseurs dansent (`m6-dance`) et que la radio parle (5 `k-eq`) ; puis 42 et 43 à 26,2 s, quand les 10 danseurs s'éteignent (`#guests.dim .dn`, 10 transitions `opacity`, la danse continue). Sans l'onde, m6 reste donc au-delà de 40 ;
  - m3 : un fond de 21 animations en continu (pluie, grain, voile, balayage, voyants qui clignotent, ondes `.pulse`, barres qui défilent sur les caméras), 26 quand la radio parle, et trois pointes brèves où plusieurs transitions partent ensemble : 41 vers 16,0 s et 37 à 42 vers 20,8 s, quand les caméras A puis B se réduisent en vignette (`#camA.mini`, `#camB.mini` : `top`, `left`, `width` et `height` en transition, de la mise en page elles aussi, avec les fondus de leurs repères ; vers 16 s, le cadre « ZOOM ×8 » de la caméra B se resserre aussi, `inset` en transition) ; 41 à 47 de 32,2 à 33,4 s, quand tracés (`.draw`), fondus et déplacements du plan et des caméras partent ensemble. Hors de ces pointes : 21 à 36, de 26 à 30 deux relevés sur trois ;
  - épilogue : les 26 grains de poussière (`#dust i`, `epi-dust`) le tiennent entre 34 et 46 tout du long.
  Avec les animations finies et en pause (`getAnimations()` entier) : 14 à 71.
- **Étalon** : 10,8 à 12,3 ms à ×1, 33,9 à 50,3 ms à ×4, sauf une fois 14,8 ms (m2, première passe à ×4) : le ralenti de Chrome suspend le fil principal par tranches, et une boucle de 11 ms peut tomber presque entière dans une tranche active. Cette mesure-là est bien ralentie : image du montage de 356 ms, contre 172 ms à ×1.
- **Durée réelle** : chaque scène dure un peu plus que la formule du séquenceur (tableau « Durée » du §1 de la spec, gardé par G1) : de 27 à 165 ms de plus à ×1, de 77 à 615 ms à ×4, sauf m5 (341 et 396 ms à ×1, 1,1 et 1,2 s à ×4). Les repères partent sur des minuteurs, que les images longues retardent (celle du montage de m5 surtout).

### Hygiène de rendu, tâche C5 (`2026-10-28-cine-c5-avant.json`, `2026-10-28-cine-c5-apres.json`)

C5 a passé en `transform` ce qui défilait en repeignant l'image, sans changer l'image : la pluie des prologues et de M3 (`background-position`), la bande du signal du kit (`.track`, `top`), la bande qui défile et le trait du scanner des caméras de M3 (`.roll`, `.sb`, `top`) ; et la respiration des rayons de l'épilogue, qui jouait sur le `g` d'un svg flouté, joue sur l'opacité de leur conteneur (`.souffle`). Gardes : `tests/briefing/rendu.test.js` (même trajet que la v1, respiration des rayons).

Mesures du 2 novembre 2026, de 19 h 52 à 20 h 06, les quatre scènes touchées (l'épilogue en variante libres), à processeur ralenti 4 fois, servies par le Vite de la copie `Sniper-Game-cine`, en passes alternées dans la même séance : v1, v2, v1, v2. La v1 est servie en remettant à leur état de `7fa375d` les cinq fichiers que le jeu lit pour ces scènes (`src/briefing/kit.css` et les quatre scènes générées), la v2 en les reposant : le champ `commit` vaut donc « 7fa375d (modifié) » dans les deux annexes, et c'est l'annexe qui dit la version (`avant` : v1, `apres` : v2). Machine partagée : deux suites de tests d'autres copies tournaient pendant la première passe de la v1.

Durées en ms, « passe 1 / passe 2 », colonnes comme pour la référence de la v1 :

| Cas | Version | p50 | p95 | max (à s) | images lentes | images par seconde | animations en cours au plus (à s) |
|---|---|---|---|---|---|---|---|
| prologue A | v1 | 11 / 5,6 | 16,7 / 11,2 | 528 (0,8) / 239 (0,5) | 58 / 29 | 98 / 141 | 13 (13,2) / 13 (13,3) |
| prologue A | v2 | 5,6 / 5,6 | 5,7 / 5,7 | 517 (0,7) / 317 (0,5) | 18 / 18 | 163 / 165 | 13 (13,3) / 13 (13,2) |
| prologue B | v1 | 11,1 / 5,6 | 22,2 / 11,3 | 567 (39) / 333 (0,7) | 310 / 134 | 85 / 122 | 23 (45,6) / 23 (45,5) |
| prologue B | v2 | 5,6 / 5,6 | 5,7 / 5,7 | 383 (1,1) / 428 (0,8) | 40 / 88 | 169 / 162 | 21 (45,4) / 23 (45,5) |
| m3 | v1 | 11,1 / 11 | 22,3 / 16,7 | 500 (0,5) / 489 (0,5) | 259 / 156 | 78 / 103 | 45 (32,4) / 45 (32,4) |
| m3 | v2 | 5,6 / 5,6 | 11,1 / 11,1 | 378 (0,4) / 445 (0,4) | 24 / 28 | 163 / 156 | 44 (32,9) / 44 (32,9) |
| épilogue, libres | v1 | 5,8 / 5,6 | 11,3 / 11,1 | 922 (1,9) / 589 (1,6) | 98 / 50 | 106 / 158 | 45 (26,2) / 45 (26) |
| épilogue, libres | v2 | 5,6 / 5,6 | 5,7 / 5,7 | 617 (1,4) / 700 (1,6) | 51 / 48 | 163 / 165 | 45 (25,9) / 45 (26,2) |

Ce qu'on y lit :

- **La v2 gagne dans les quatre cas et dans les deux passes**, bien au-delà du bruit (qui se lit d'une passe de la v1 à l'autre) : p95 de 5,7 ms (une image par synchro de l'écran) en prologue A, prologue B et épilogue, 11,1 ms en m3, contre 11,1 à 22,3 ms pour la v1 dans la même séance ; 156 à 169 images par seconde contre 78 à 158 ; moins d'images lentes (m3 : 24 et 28 contre 259 et 156 ; prologue B : 40 et 88 contre 310 et 134). La v1 de cette séance est plus lente que la référence du 28 octobre (m3 : 78 et 103 images par seconde, contre 116 et 121) : la machine était plus chargée, et la comparaison ne vaut qu'entre passes alternées de la même séance.
- **Animations en cours : inchangées** (13, 21 à 23, 44 et 45, 45), comme attendu : une animation de `transform` compte autant qu'une de `top` dans `getAnimations()`. m3 et l'épilogue restent à leur maximum de la v1 (spec, décision D8, lecture A).
- **L'image la plus longue** reste presque toujours celle du montage de la scène (0,4 à 1,9 s après ; une fois à 39 s, prologue B, v1) : de 317 à 700 ms pour la v2, de 239 à 922 ms pour la v1.

Captures gelées du jeu, v1 contre v2 (`scripts/shots.mjs`, `BASE_URL=http://localhost:5186/`, deux à cinq captures de chaque version au même instant, comparées pixel à pixel ; écart : la plus grande différence d'un canal, sur 255) :

| Capture | v1 contre v1 (bruit) | v2 contre v2 (bruit) | v1 contre v2 |
|---|---|---|---|
| prologue A, 6 000 ms | 1 pixel, écart 1 | identiques à l'octet | identiques à l'octet ; 1 pixel d'écart 1 avec l'autre capture de la v1 |
| prologue B, 4 000 ms | 2 pixels, écart 1 | identiques à l'octet | 2 et 4 pixels, écart 1 |
| m3, 2 000 ms | 113 204 pixels, écart 87 | 143 932 pixels, écart 81 | 118 069 et 136 257 pixels, écart 83 et 85 |
| m3, 23 000 ms | 105 870 pixels, écart 44 | 149 908 pixels, écart 40 | 130 378 et 130 785 pixels, écart 66 et 73 |
| m3 atténué (`attenue=1`), 2 000 ms | identiques à l'octet | identiques à l'octet | 61 pixels, écart 1 |
| m3 atténué, 23 000 ms | identiques à l'octet | identiques à l'octet | 52 pixels, écart 1 |
| épilogue, 40 000 ms | identiques à l'octet (deux fois), 78 pixels d'écart 1 (une fois) | identiques à l'octet (trois fois), 497 pixels d'écart 1 (une fois) | 285 pixels, écart 1 |

- **m3** : le bruit de la v1 (spec §1, « Gel des captures ») vient tout entier de la pluie, posée sur `::before` et `::after` de `#rain` : la règle du gel (`.st.k-frozen *`) ne désigne pas les pseudo-éléments, dont les animations continuent sous le gel, et la capture les prend où elles en sont. En effets atténués, où la jumelle arrête la pluie, deux captures d'une version sont identiques à l'octet, et v1 contre v2 ne diffère que d'un niveau sur une soixantaine de pixels : même image.
- **Prologues** : v1 et v2 identiques à l'octet, au bruit de la v1 près.
- **Épilogue** : 285 pixels d'écart 1, en haut de l'image, dans la lumière des rayons : l'opacité qui respire s'applique maintenant au conteneur, après le flou, au lieu du `g`, avant (mathématiquement la même image ; l'arrondi sur 8 bits diffère d'un niveau). L'épilogue a son propre bruit, de loin en loin, d'un niveau sur quelques centaines de pixels, dans la v1 comme dans la v2.
- **Premier essai écarté** : la pluie, agrandie vers le haut (son coin haut gauche remonté d'une tuile, soit 115,2 px à 1 280 px de large, pas un nombre entier), tombait à une fraction de pixel de sa place : 104 000 pixels d'écart 9 à 11 sur les prologues (le plan de la vitre, en perspective, entier rééchantillonné), 57 000 pixels d'écart 22 sur m3 atténué. Le calque garde donc son coin haut gauche, où le motif s'ancre, grandit en bas et à droite, et chaque tour part d'une tuile plus haut (même motif).
- **Bouts du tour** : animations arrêtées par une feuille ajoutée (page temporaire autour de la maquette, `animation-play-state: paused` et délai négatif), au début et à la fin du tour : la pluie couvre toute la vitre du prologue A et tout le panorama de m3, sans bande découverte ; à mi-tour, la bande du signal passe au milieu de l'image. Captures dans `shots/c5/` (non versionné).

**Relecture de C5 (24 novembre 2026)** : v1 et v2 recapturées par le relecteur (`shots/c5-revue/`, non versionné, même script), prologue A à 6 000 ms et épilogue (libres) à 40 000 ms. Entre elles, le même jour : 5 pixels d'écart 1 au prologue A, identiques à l'octet à l'épilogue. Contre les captures du 2 novembre, v1 comme v2 : 98 184 pixels, écart 34, au prologue A ; 78 126 à 78 338 pixels, écart 23, à l'épilogue ; sur toute l'image, des contours décalés d'une fraction de pixel. L'écart vient de l'environnement, pas de C5 : Chrome a été mis à jour entre les deux dates (dossier de la version 158.0.8127.38 installé le 23 novembre). Les captures de `shots/c5/` ne servent donc de référence à aucune comparaison ultérieure : C6 et les suivantes capturent la v1 et la v2 dans la même séance (spec §1, « Gel des captures »).

## Lot 3 : sonde de lisibilité (porte de décision 3.0, tâche S0)

Mesure du 28 octobre 2026, avant tout changement des cartes (spec du lot 3, §1 « 3.0 » et §4 ; plan du lot 3a, tâche S0). Fichiers : `2026-10-28-sonde-lisibilite.json` (le relevé écrit par le script, critère appliqué) et les 26 captures du dossier `2026-10-28-sonde-lisibilite/` (JPEG de 10 à 35 ko).

### Ce que c'est

La route de développement `?sonde=1` (`src/main.js` ; `src/gfx/sonde.js`, `src/gfx/sondeScene.js`) monte la carte actuelle d'une mission, sans PNJ, place l'œil au poste prévu par la spec, lui donne le profil de la mission (plans proche et lointain, brume, soleil) et le zoom de la lunette. Elle pose les modèles imposés de la spec §3 côte à côte sous le point regardé, tournés vers le poste : sans teinte, à leur hauteur d'ajustement exacte (`fitHeight` de leur pool, sans la variation `heightVar` du jeu : 1,85 m pour les pools des cibles et des gardes, 1,8 m pour celui des civils, où sont Mira et Verne), dans leur pose Idle, sans ombre en Moyen ni en Bas (le rôle d'ombre « civil » des cibles de M2 à M6, spec §2 e). Les cibles restent sur la zone d'apparition actuelle (spec §1 : « les modèles imposés posés sur la zone actuelle ») : seul l'œil recule.

Chaque personnage est mesuré par un rendu d'identification : lui seul, en blanc uni sur noir, sans brume, dans une cible de rendu de la taille du tampon de dessin. Ce sont donc des pixels réellement rendus : en Bas, le tampon fait 1 440 × 810 pour un écran de 1 920 × 1 080, et c'est sur eux que porte le critère de la spec §4. Silhouette : hauteur du masque. Tête : ce qui dépasse au-dessus du bas de ses zones de tir (crâne et bas du visage, `src/shot/hitzones.js`), cheveux et casque compris. Buste : largeur du masque entre les hanches et le bas de la tête, bras compris (le « torse (largeur) » du rapport M3). Les cheveux et les cils des GLB, transparents à opacité nulle et invisibles en jeu, n'entrent pas dans le masque.

`scripts/capture-mission.mjs` (cible `sonde`) ouvre un Chrome neuf par capture (SwiftShader, hasard à graine, écran émulé de 1 920 × 1 080 : sans interface, `--window-size=1920,1080` ne laisse à la page que 1 904 × 985), garde le carré de 838 px qui contient le cercle de la lunette, en JPEG de qualité 85, relève les mesures de la page et applique le critère (`scripts/sonde.mjs`). Le même code redonne les mêmes octets : trois passes pour les postes de 155, 138 et 430 m, deux pour celui de 250 m.

Rendu interrompu : une passe relancée le 28 octobre 2026 sur une machine saturée a perdu le contexte WebGL de deux pages. Le jeu y affichait son écran « LE RENDU A ÉTÉ INTERROMPU », que le script a capturé et versé dans l'annexe sans erreur, à la place de `sonde-250m-x8-bas.jpg` et `sonde-430m-x12-bas.jpg` (deux JPEG identiques de 37 718 octets ; les mesures, prises avant la perte, étaient justes). Ces deux images ont été remises à celles du commit. Depuis, chaque capture est gardée (`scripts/garde-rendu.mjs`) : l'état du rendu est lu dans la page juste avant et juste après elle. Un contexte WebGL perdu, l'écran du rendu interrompu affiché ou une page rechargée font refuser l'image, sans rien écrire, puis refaire la capture dans un Chrome neuf (trois essais en tout, 5 s entre deux). Une passe où une capture échoue malgré tout laisse l'annexe telle quelle. Vérifié dans Chrome en perdant le contexte pour de bon (`WEBGL_lose_context`) sur la page de `sonde-430m-x12-bas` : sans la garde, la capture redonne les 37 718 octets de l'incident ; avec elle, l'image est refusée, et le nouvel essai redonne l'image de l'annexe à l'octet près.

Traçabilité : le relevé porte `267ca90 (modifié)`, car la passe de l'annexe a tourné sur l'arbre de travail de la tâche, avant son commit (`2f93e10`). Le code du jeu n'a pas changé depuis (`970b8ba` et `b89e97e` ne touchent qu'aux scripts de capture, à leurs tests et aux documents), et les passes refaites sur ces commits redonnent les images de l'annexe à l'octet près et ses mesures à l'identique. Sur `2f93e10`, la passe du rendu interrompu redonne les mesures des 26 captures et 24 de leurs images (les deux autres sont l'écran de l'incident). Ces deux-là ont été refaites depuis : `sonde-250m-x8-bas.jpg` sur `970b8ba` (relecture de S0), `sonde-430m-x12-bas.jpg` sur `b89e97e`, avec les cinq autres captures du poste de 430 m, verdict compris. Dossiers locaux, non versionnés : `shots/sonde-lisibilite/`, `shots/relecture-s0/`, `shots/s0-trace-b89e97e/`.

```bash
ANNEXE_SONDE=2026-10-28-sonde-lisibilite node scripts/capture-mission.mjs sonde-lisibilite sonde   # 26 captures, une dizaine de minutes
node scripts/capture-mission.mjs essai sonde-430m                                                   # un seul poste
MISSION=4 PARAMS='poste=0,37.5,428.5&regard=0,1.2,0&zoom=16&far=1700&brume=lin:150:1600&modele=mafia_henchman' node scripts/capture-mission.mjs essai sonde-libre
```

### Postes

| Poste | Mission, carte actuelle | Œil | Point visé (le groupe dessous) | Plongée | Profil | Personnages, de gauche à droite | Signe compté | Zoom maximum de base |
|---|---|---|---|---|---|---|---|---|
| 155 m | M3, le port, de nuit | cabine de la grue G3 (-28 ; 41 ; 146) | centre de la zone (0 ; 1,345 ; -0,5), à 154,3 m | 14,9° | plans à 0,5 et 600 m, brume exponentielle 0,0035, soleil de la carte | Vosko (`gangster_man_01`), Mira (`mafia_woman_03`), à 1,4 m | buste | ×10 |
| 138 m | M5, le convoi | crête, 20 m au-dessus de la route (30 ; 20,2 ; 129,36) | la route (0 ; 1,2 ; -4) | 7,9° | plans à 0,5 et 1 000 m, brume exponentielle 0,0016, couchant derrière à gauche, 13° au-dessus de l'horizon | Kessler (`mafia_boss`) | tête | ×12 |
| 430 m | M4, la base, à midi | château d'eau (0 ; 37,5 ; 428,5) | centre du dépôt (0 ; 1,2 ; 0) | 4,8° | plans à 1 et 1 700 m, brume linéaire de 150 à 1 600 m, soleil vers (4, 60, 2) | Verne (`mafia_woman_02`), Halder (`mafia_henchman`), Rossi (`mafia_woman_01`), à 5 m | tête | ×20 |
| 250 m | M4, haut du repli de 120 à 250 m | château d'eau (0 ; 37,5 ; 247,35) | centre du dépôt | 8,4° | celui de 430 m | les mêmes, à 2,5 m | tête | ×20 |

Le signe compté est celui des critères de la spec (§2, 3c et 3d) : le buste en M3 (costume sombre contre t-shirt clair ; le chignon de Mira n'y fait que 8 px à ×10), la tête en M4 (casque de Halder, chignon de Verne) et en M5 (la casquette d'officier de Kessler, encore à poser). Zooms : ×8, ×12 et ×20, plus le zoom maximum de base de la mission (×10 en M3) ; Moyen et Bas.

### Mesures

Pixels rendus, dans l'ordre silhouette, tête (hauteur), buste (largeur) :

155 m (M3)

| Zoom | Qualité | Vosko : silhouette, tête, buste | Mira : silhouette, tête, buste |
|---|---|---|---|
| ×8 | Moyen | 96, 15, 30 | 92, 13, 25 |
| ×8 | Bas | 72, 11, 22 | 70, 11, 18 |
| ×10 | Moyen | 120, 18, 37 | 116, 17, 31 |
| ×10 | Bas | 90, 14, 28 | 87, 13, 23 |
| ×12 | Moyen | 145, 22, 46 | 140, 21, 37 |
| ×12 | Bas | 108, 17, 34 | 104, 15, 28 |
| ×20 | Moyen | 240, 36, 76 | 232, 34, 62 |
| ×20 | Bas | 180, 27, 57 | 174, 26, 47 |

138 m (M5)

| Zoom | Qualité | Kessler : silhouette, tête, buste |
|---|---|---|
| ×8 | Moyen | 111, 20, 39 |
| ×8 | Bas | 83, 14, 29 |
| ×12 | Moyen | 166, 29, 59 |
| ×12 | Bas | 125, 22, 45 |
| ×20 | Moyen | 277, 49, 98 |
| ×20 | Bas | 207, 36, 74 |

430 m (M4)

| Zoom | Qualité | Verne : silhouette, tête, buste | Halder : silhouette, tête, buste | Rossi : silhouette, tête, buste |
|---|---|---|---|---|
| ×8 | Moyen | 33, 4, 10 | 35, 6, 12 | 34, 5, 10 |
| ×8 | Bas | 26, 4, 8 | 27, 5, 10 | 26, 3, 7 |
| ×12 | Moyen | 51, 7, 15 | 53, 9, 19 | 52, 8, 14 |
| ×12 | Bas | 38, 5, 11 | 40, 7, 14 | 39, 6, 11 |
| ×20 | Moyen | 84, 11, 25 | 88, 15, 31 | 87, 13, 24 |
| ×20 | Bas | 63, 9, 18 | 66, 11, 23 | 65, 10, 18 |

250 m (repli de M4)

| Zoom | Qualité | Verne : silhouette, tête, buste | Halder : silhouette, tête, buste | Rossi : silhouette, tête, buste |
|---|---|---|---|---|
| ×8 | Moyen | 58, 8, 17 | 60, 10, 21 | 60, 9, 17 |
| ×8 | Bas | 43, 6, 13 | 45, 7, 16 | 44, 6, 12 |
| ×12 | Moyen | 87, 12, 25 | 91, 16, 33 | 89, 13, 25 |
| ×12 | Bas | 66, 9, 19 | 68, 11, 25 | 67, 10, 18 |
| ×20 | Moyen | 146, 21, 42 | 152, 26, 54 | 149, 22, 42 |
| ×20 | Bas | 109, 15, 31 | 114, 19, 41 | 112, 17, 32 |

Mesure contre calcul : les silhouettes mesurées valent de 0,96 à 1,02 fois le calcul (`pixelsAttendus`, `src/gfx/sonde.js` : hauteur d'ajustement, plongée, champ vertical de 60 / zoom), sur les 26 captures. L'écart tient à la pose Idle et à l'arrondi au pixel : les calculs de la spec (86 px et 12,5 px à 430 m, 123 px à 155 m, 166 px à 138 m, en 1080p) se vérifient sur le vrai rendu.

### Critère par défaut et décision (spec §4)

Silhouette d'au moins 80 px et signe d'au moins 10 px, en Bas, au zoom maximum de base de la mission ; le plus petit des personnages décide :

| Mission | Distance | Zoom maximum de base | Silhouette, en Bas | Signe, en Bas | Critère |
|---|---|---|---|---|---|
| M3 | 155 m | ×10 | 87 px (Mira) | buste : 23 px (Mira) | tient |
| M5 | 138 m | ×12 | 125 px (Kessler) | tête : 22 px (Kessler) | tient |
| M4 | 430 m | ×20 | 63 px (Verne) | tête : 9 px (Verne) | ne tient pas |
| M4 | 250 m | ×20 | 109 px (Verne) | tête : 15 px (Verne) | tient |

- **M4 passe au repli, à titre provisoire** (décision 11 de la spec, §4 : jusqu'à la réponse de Rayan, ou jusqu'à la fin de 3a s'il n'a pas répondu) : à 430 m, Verne (1,8 m, la plus petite des trois) ne fait que 63 px en Bas à ×20, et sa tête 9 px ; Halder et Rossi 66 et 65 px. Au haut de la fourchette, 250 m, le critère tient avec de la marge (109 px, tête 15 px). Le champ `decisionM4` du relevé est le verdict du critère par défaut, lu en pixels du tampon. Tranché depuis par Rayan, le même jour, après avoir regardé les deux captures : **M4 garde 430 m** (décision 11 de la spec, « fais le dur ») ; le repli est écarté.
- **Pixels du tampon ou de l'écran** : c'est cette lecture qui tranche. Les mesures comptent les pixels du tampon de dessin (en Bas, 1 440 × 810, agrandi d'un tiers pour remplir l'écran de 1 920 × 1 080), comme le risque 2 de la spec (§5 : « environ 65 px réels en Bas ») ; les captures, elles, montrent l'écran. À l'écran, Verne fait environ 84 px à 430 m et sa tête 12 px : comptés ainsi, les pixels tiendraient le critère (en Moyen, où tampon et écran coïncident, 84 px et tête de 11 px). Les deux images à comparer, `sonde-430m-x20-bas.jpg` et `sonde-250m-x20-bas.jpg`, ont été envoyées à Rayan le 28 octobre 2026 avec cette explication.
- Distance où le critère tiendrait encore au même zoom (la taille suit 1 / distance) : environ 340 m pour M4 à ×20, 169 m pour M3 à ×10, 216 m pour M5 à ×12. C'est la silhouette qui lâche la première en M4.
- M3 et M5 tiennent à leur distance.

### Ce que montrent les captures

- **430 m** : à ×20, les trois officiers se distinguent à leur tenue, en Moyen comme en Bas : tailleur bleu nuit (Verne), armure noire et casque (Halder), chemise blanche (Rossi). Leurs têtes ne sont plus que des taches de 9 à 15 px : le chignon de Verne ne se lit pas. À ×8 et ×12, ce sont trois silhouettes de 26 à 53 px. Le critère de la spec (silhouette et tête) est plus sévère que ce que l'œil reconnaît à la tenue : `sonde-430m-x20-bas.jpg` et `sonde-250m-x20-bas.jpg` sont les deux images à comparer pour revenir, ou non, sur la décision.
- **155 m**, de nuit : la taille suffit, mais le costume sombre de Vosko se perd sur le quai sombre, quand le t-shirt clair de Mira se voit. C'est le risque 3 de la spec (nuit illisible sans marqueur) : 3c devra éclairer la zone.
- **138 m** : Kessler se lit à tous les zooms. Il est ici debout sur la route ; assis dans la jeep (3d), seule sa partie haute dépassera.
- **Les cartes d'aujourd'hui** : leur sol s'arrête à 100 m du centre en M3 et M4, à 150 m en M5 ; au-delà, la couleur du fond (bandes unies en haut et en bas des captures de M4 à ×8 et ×12). Sur la ligne de visée de M4, les piliers et la plateforme de l'ancienne tour de garde restent dans le champ, d'où l'écart entre les officiers (5 m, puis 2,5 m à 250 m, où le carré de la lunette ne couvre que 5 m de part et d'autre du point visé à ×20). En M5, l'ancien promontoire du tireur, 30 m devant la route, cacherait Kessler depuis un œil dans l'axe : l'œil est décalé de 30 m le long de la route (visée à 78° de la route). 3c et 3d refont ces cartes.

## Lot 3 : socle vérifié (tâche A9)

Vérifications du 24 novembre 2026, toutes les tâches du socle faites (S0, A1 à A8 et leurs relectures, K0), sur `153696b`. Elles répondent aux critères de fin de 3a (spec du lot 3, §2, « Critères de fin 3a ») et à la tâche A9 du plan du lot 3a.

### Mémoire et performance (`2026-11-24-memtest-socle-lot3.json`, `2026-11-24-memtest-socle-lot3-bas.json`)

```bash
node scripts/memtest.mjs --check --qualite=moyen --comparer=2026-10-09-memtest-apres-lot2.json --annexe=2026-11-24-memtest-socle-lot3.json
node scripts/memtest.mjs --check --qualite=bas --comparer=2026-10-09-memtest-apres-lot2-bas.json --annexe=2026-11-24-memtest-socle-lot3-bas.json
```

SwiftShader, arbre propre (`153696b` dans les annexes : les mesures précèdent tout changement de la tâche A9), une mesure de chaque, finie du premier essai (216 s et 227 s). Les cinq seuils du lot 1 sont tenus en Moyen et en Bas, et M6 reste à ±3 % du lot 2 :

| | Fin du lot 2, Moyen | Socle, Moyen | Fin du lot 2, Bas | Socle, Bas |
|---|---|---|---|---|
| Menu de départ : géométries, textures, programmes, appels, triangles | 409, 3, 5, 540, 10 506 | identique à l'unité | 409, 3, 5, 540, 10 506 | identique à l'unité |
| M6 à la vue de départ : appels, triangles | 294, 1 422 955 | 289 (-1,7 %), 1 390 854 (-2,3 %) | 290, 1 330 361 | 285 (-1,7 %), 1 298 260 (-2,4 %) |
| Retour de campagne (`menu-campagne`) : géométries, textures, programmes | 447, 32, 31 | 447, 32, 39 | 447, 32, 19 | 447, 32, 27 |
| Relances de M6, arènes PvP | Δ = 0 | Δ = 0 | Δ = 0 | Δ = 0 |
| Arène PvP : géométries, textures, programmes, appels, triangles | 122, 357, 34, 445, 2 748 345 | 122, 357, 42, 445, 2 748 345 | 122, 357, 22, 445, 2 748 345 | 122, 357, 30, 445, 2 748 345 |
| Fin de partie (`menu-final`) | 447, 32, 34 | 447, 32, 42 | 447, 32, 22 | 447, 32, 30 |
| Tas JS à `M6-10`, puis à `menu-final` (indicatif) | 56 Mo, 52 Mo | 50 Mo, 47 Mo | 56 Mo, 52 Mo | 50 Mo, 47 Mo |

Vues de départ des missions, appels et triangles :

| Mission | Lot 2, Moyen | Socle, Moyen | Lot 2, Bas | Socle, Bas |
|---|---|---|---|---|
| M1 | 608, 386 303 | 607, 365 940 | 599, 289 249 | 596, 264 710 |
| M2 | 382, 642 205 | 361, 550 293 | 364, 448 097 | 357, 457 699 |
| M3 | 156, 606 084 | 142, 560 526 | 139, 400 884 | 136, 421 635 |
| M4 | 212, 855 771 | 177, 414 211 | 186, 553 517 | 169, 368 707 |
| M5 | 297, 486 082 | 279, 387 260 | 280, 245 961 | 271, 202 072 |
| M6 | 294, 1 422 955 | 289, 1 390 854 | 290, 1 330 361 | 285, 1 298 260 |

- **Hors des missions, seuls les programmes changent** : le menu de départ est celui du lot 2 à l'unité près ; aux retours au menu et dans l'arène PvP, géométries, textures, appels et triangles aussi ; les programmes de shaders, gardés pour la session, sont 8 de plus dans les deux préréglages (les variantes des modèles que dessinent désormais les missions : 7 à la tâche A6, une de plus à la tâche A7).
- **Les missions changent avec leurs visages, leurs marqueurs et leur hasard** : modèles imposés aux cibles et gardes de M4 en `mafia_boss` (A6), marqueurs retirés de M2 à M5 et ombre des cibles coupée en Moyen (A7), PNJ placés autrement en M2, M3 et M4 (chaque objet three tire quatre nombres au hasard pour son identifiant : les objets des marqueurs en moins décalent le hasard à graine). M4 perd ainsi plus de la moitié de ses triangles en Moyen (gardes en `mafia_boss`, plus légers, et ombres des cibles en moins) ; en Bas, sans aucune ombre de personnage, M2 et M3 en gagnent un peu (d'autres PNJ dans le champ). Mêmes nombres, à l'unité près, que la mesure de la tâche A7 (`shots/memtest-2026-11-24T12-35-31.json` et `…T12-39-04.json`, locaux) : la tâche A8 ne change aucune étape.
- Garde : `tests/gfx/memtest.test.js`, « annexes : mesures versionnées du socle du lot 3 » (cinq seuils en Moyen et en Bas sur l'arbre commité, M6 à ±3 % du lot 2, menu de départ du lot 2 à l'unité près, retours au menu et PvP aux géométries, textures, appels et triangles du lot 2 ; témoins : la référence d'avant le lot 1, autre menu ; une arène qui garde une texture ; une étape absente).

### Captures

`QUALITE=moyen`, SwiftShader, `scripts/capture-mission.mjs` de `153696b` des deux côtés. Avant : le code du lot 2, `main` à `3cd328d` (la base de la branche), extrait par `git archive` hors du dépôt et servi par un second Vite (port 5191, `three` pris dans le `node_modules` du dépôt, cache à part, arrêté ensuite) ; après : la branche. Dossiers locaux `shots/a9-lot2/` et `shots/a9-final/`, non versionnés ; empreintes SHA-256 (16 premiers caractères) :

| Vue | Lot 2 | Socle | Comparaison |
|---|---|---|---|
| menu | `8002ed31843e8eba` | `8002ed31843e8eba` | identiques à l'octet |
| M1 | `5307c86dfe74a937` | `94d76d74b4eebadd` | à l'œil : la fiche, les civils |
| M2 | `da2efa9978ecd4de` | `d9bdfb44900bd3fa` | à l'œil : la fiche, les marqueurs, les PNJ |
| M3 | `1ed617aa2bb65bb9` | `98e1134dd5acf35b` | à l'œil : la fiche, le marqueur, les PNJ |
| M4 | `5d5f83c8a0fd3081` | `d5f09b08fdbd3681` | à l'œil : la fiche, les marqueurs, les PNJ et leurs ombres |
| M5 | `9b69c96e54bf74cf` | `b96a66748d6aec3b` | à l'œil : la fiche seule |
| M6 | `002daa8df482e821` | `a5da478f4de9fa85` | à l'œil : la fiche, la foule |

- **Menu identique à l'octet près au lot 2**, capturé le même jour. Contre les captures du lot 2 faites avant le 24 novembre 2026 (`shots/l8-moyen/`, `shots/t8-lot2/`, `shots/lot3-a5-final/` : `4c10cd8c7b1aa076`), 1 386 pixels diffèrent, tous sur le lissage des textes et des cadres des boutons du menu : la machine est passée sous Windows 11 entre-temps (Chrome et rendu des polices), le décor 3D est identique au pixel près ; le code du lot 2, capturé aujourd'hui, donne le menu du socle. Les comparaisons à l'octet se font donc entre captures d'un même jour.
- **M1 à M6, chaque image regardée** (planches côte à côte, avant et après, et masque des pixels qui diffèrent) : dans les six missions, les pixels qui diffèrent sont tous sur la fiche ou sur les personnages (silhouettes, ombres, marqueurs), et le décor est identique au pixel près hors d'eux ; changent la fiche des cibles en haut à gauche (« DOSSIER 0n », qui remplace en M6 l'encadré « CIBLE À IDENTIFIER »), les marqueurs rouges (gardés en M1 seulement), les visages et les places des PNJ (casting de A6, hasard décalé), les gardes de M4 en armure sable (`mafia_boss`) et, en plein jour en M4, l'ombre des cibles. M5 ne change que par sa fiche : le convoi n'est pas encore dans le champ.
- **Socle contre la fin de la tâche A8** (`shots/a8-final/`, même jour) : menu, vues de départ de M1 à M6, lunette ouverte en M2 et M4 et tir visé en M2 et M4 (`VISER=cible`) identiques à l'octet près. Le tir droit devant (sans `VISER`), capturé en plus, touche le parasol de la place en M2 (31 m, un garde alerté) et le sol de l'aire de M4 (34 m).
- **Retours au menu** (`retour1`, `retour3`, `retour6` : trois tirs manqués, pause, MENU) : de 12 à 33 objets hors de la carte avant le retour (PNJ, cadenas, marques, gerbes, sillage), aucun au menu (`{"fond":"87a0b0","horsCarte":[]}`), qui propose COMMENCER, REPRENDRE : MISSION 3 et REPRENDRE : MISSION 6.

### Parcours réels (`scripts/verif-mission.mjs`)

`node scripts/verif-mission.mjs` (sans argument : les 19 scénarios), sur la carte graphique, contre le Vite du port 5173 : **19 verts** en une passe, dont `tete` (M2 debout et accroupie, M6 assis : HEADSHOT), `culasse` (revenue 1,205 s après le coup, à l'horloge de la mission), `occlusion`, `son`, `cadenas`, `convoi`, `civil-echap` et les scénarios de l'aide. Le socle n'en ajoute aucun : ses briques de la tâche A8 (sorties, réaction, fenêtres, radio, fin différée) ne servent encore à aucune mission ; elles sont vérifiées par leurs tests et par les essais dans le vrai jeu de la tâche A8 (spec, précisions de A8).

`difficulte` (8 essais par mesure ; rapport sans seuil, qui ne rougit que si la mesure échoue) :

| Mesure | Tête | Torse | Membre | Manqué | Autre PNJ |
|---|---|---|---|---|---|
| Au repos, visée au crâne, cible menée | 8 | 0 | 0 | 0 | 0 |
| Stress plein (lunette tenue 14 s), même visée | 2 | 2 | 0 | 4 | 0 |
| En fuite, visée au torse sans la mener | 6 | 1 | 0 | 1 | 0 |
| En fuite, visée au torse en la menant | 1 | 7 | 0 | 0 | 0 |

- **La cible en fuite qu'on ne mène pas est désormais touchée** (7 sur 8, contre 0 sur 62 au lot 2) : la balle réelle (tâche A4) vole 0,04 s à 31 m au lieu des 0,45 s fixes d'avant, et la cible n'y parcourt que 19 cm au lieu de 2,2 m. À 430 m (M4, sous-lot 3c), le vol durera 0,54 s et mener redeviendra nécessaire. Le tir au torse d'une cible qui court prend souvent la tête, comme au lot 2 (8 têtes sur 60 touches menées).
- Huit essais ne donnent qu'une tendance : la passe de 64 essais du lot 2 reste la mesure des proportions, à refaire sur les longues distances (plan de 3c, tâche 3c.14).

### Fiche des cibles et lentille de la lunette (relecture de A7)

Mesure de la limite relevée à la relecture de A7 : `#target-dossier` (`index.html` : en haut à gauche, à 24 px du bord et 90 px du haut, largeur `clamp(176px, 16vw, 240px)`) contre le bord noir de la lunette ouverte (`drawScope`, `src/scope.js` : cercle de rayon 1,02 × R au centre de l'écran, R = 0,38 × min(W, H), soit le bord gauche de la lentille à W / 2 - 0,38 × 1,02 × min(W, H) du bord gauche). Chrome sans interface (carte graphique), la mission montée et sa fiche affichée, la fenêtre émulée (`Emulation.setDeviceMetricsOverride`) à dix tailles courantes, puis de 400 à 1 600 px de haut par pas de 10 px dans quatre formats ; à chaque taille, le rectangle de la fiche lu dans la page (`getBoundingClientRect`) : elle touche quand son point le plus proche du centre est à moins de 1,02 × R. Script jetable, hors du dépôt.

| Fenêtre | Fiche de M4 (trois entrées) : largeur × hauteur | Bord de la lentille | Marge (négative : dans la lentille) |
|---|---|---|---|
| 800 × 600 | 176 × 265 | 167 px | -33 px |
| 1 024 × 768 | 176 × 265 | 214 px | 16 px |
| 1 280 × 1 024 | 205 × 236 | 243 px | 55 px |
| 1 280 × 720 | 205 × 236 | 361 px | 134 px |
| 1 366 × 768 | 219 × 236 | 385 px | 147 px |
| 1 920 × 1 080 | 240 × 236 | 541 px | 310 px |

| Format | Plus grande fenêtre où la fiche de M4 touche | M2 (deux entrées) | M3 (deux entrées) |
|---|---|---|---|
| 16:9 | aucune (de 711 × 400 à 2 844 × 1 600) | aucune | aucune |
| 16:10 | 768 × 480 | 768 × 480 | 768 × 480 |
| 4:3 | 947 × 710 | 907 × 680 | 920 × 690 |
| 5:4 | 1 025 × 820 | 938 × 750 | 950 × 760 |

- Au-delà de chacune de ces fenêtres, la fiche ne touche plus la lentille, à aucune taille de la série. Le commentaire d'`index.html` (« dans la marge noire de la lunette jusqu'en 4:3 ») vaut donc à partir de 960 × 720 en 4:3 (1 024 × 768 : 16 px de marge) ; en 800 × 600, la fiche de M4 entre de 33 px dans la lentille, celles de M2 et M3 de 30 et 32 px.
- **En 16:9, « aucune » ne vaut que dans la série** (de 400 à 1 600 px de haut). Par le calcul : à 176 px de large, le bord droit de la fiche est à 200 px du bord gauche (24 + 176), et elle couvre la hauteur du centre de l'écran ; le bord de la lentille est à W / 2 - 0,3876 × H, soit 0,501 × H en 16:9. À 711 × 400, il reste 0,46 px de marge ; sous 400 px de haut (709 × 399 : -0,15 px), la fiche toucherait aussi en 16:9.
- **Lignes coupées** : à 176 px de large (fenêtres de moins de 1 100 px) et jusqu'à 200 px environ, des lignes passent sur deux, dans tous les formats : les signes de M4 (« TAILLEUR BLEU NUIT », « CHEMISE BLANCHE ») jusqu'à 1 248 px de large, les noms des frères de M2 (« LUC SANCTECHAIR », « MARC SANCTECHAIR ») jusqu'à 1 216 px, « CHEVEUX PLAQUÉS » de M3 jusqu'à 1 120 px. Dès 1 280 px de large (205 px de fiche), aucune.
- Non bloquant (les fenêtres de jeu courantes, 1 280 × 720 et au-delà, n'ont ni contact ni ligne coupée) ; reste connu de `docs/superpowers/REPRISE.md`.
