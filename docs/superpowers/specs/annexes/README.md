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

- **rien sur le bureau** : fenêtre cachée (`show: false` ; une fenêtre montrée par un autre code est recachée aussitôt et la fumée sort rouge), son coupé, exceptions du processus principal rattrapées (jamais la boîte de dialogue d'Electron) ;
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
- **délais de garde** : 60 s par étape du scénario et 3 min en tout dans le processus principal (la fumée se ferme seule, rouge), 5 min dans le script (Electron et ses processus fils tués, code 2) ;
- **aucun téléchargement** : le script lit le binaire d'Electron dans `node_modules/electron` (`path.txt`, puis `dist/`) sans `require('electron')`, qui le téléchargerait s'il manquait (environ 100 Mo) ; binaire absent, il le dit (« node node_modules/electron/install.js ») et sort en 2 ; avec `--exe`, il ne le cherche pas.

Commandes exactes sur la machine partagée des chantiers : le build par le verrou des tests, la fumée par le verrou Chrome (un seul Electron ou Chrome sans interface à la fois) ; `<copie>` nomme la copie de travail.

```bash
bash /c/Users/shark/Sniper-Game-reprise/.superpowers/sdd/verrou.sh tests "<copie> build" -- npx vite build
bash /c/Users/shark/Sniper-Game-reprise/.superpowers/sdd/verrou.sh chrome "<copie> fumée" -- node scripts/fumee.mjs
# le jeu empaqueté (tâche E2), après npm run dist :
bash /c/Users/shark/Sniper-Game-reprise/.superpowers/sdd/verrou.sh chrome "<copie> fumée" -- node scripts/fumee.mjs --exe=release/win-unpacked/Sniper.exe
```

**Refus avant tout lancement** (code 2, aucun profil créé, rien de lancé) :

- un argument autre qu'un seul `--exe=<chemin non vide>` : « --exe chemin » avec une espace (qui ferait vérifier `dist/` à la place du paquet), « --exe= » vide, deux `--exe=`, argument inconnu ; le script répond « argument refusé » et donne l'usage ;
- sans `--exe`, `dist/index.html` absent : « lancer npx vite build » ;
- avec `--exe`, un paquet sans le mode fumée, c'est-à-dire sans la chaîne `--fumee` dans `resources/app.asar` (ou dans `resources/app/electron/main.js` sans asar) : par exemple un paquet construit avant E1, que rien ne lie au commit (`release/` est ignoré par git). Lancé, il ignorerait `--fumee` et `--profil` et ouvrirait le jeu normal, fenêtre visible, sur le profil du joueur ; le script répond « exécutable sans mode --fumee : relancer npm run dist » ;
- build périmé : un fichier de `src/`, de `public/`, `index.html` ou `vite.config.js` plus récent que `dist/index.html` (avec `--exe` : plus récent que `resources/app.asar`, `electron/` compris, le processus principal étant dans le paquet) ; le script répond « build périmé : relancer npx vite build » (ou `npm run dist`) et nomme les fichiers en cause ;
- avec `--exe`, un exécutable introuvable.

**Pendant la fumée** :

- `electron/main.js` écrit « [fumee] debut » dès son départ : sans cette ligne au bout de 30 s, le script arrête Electron et ses processus fils (`taskkill /F /T`) et sort en 2 (exécutable qui ignore le mode) ;
- interrompue une fois Electron lancé (Ctrl+C, Ctrl+Pause, arrêt demandé : `SIGINT`, `SIGBREAK`, `SIGTERM`), elle arrête l'arbre d'Electron (`taskkill /F /T`), supprime le profil et sort en 130 ; ces gestionnaires sont retirés en fin normale. Un `node` tué de force (console fermée, `taskkill` sur node, outil qui coupe la commande) ne passe par aucun gestionnaire : vérifier alors qu'aucun `electron.exe` ne reste (`tasklist`) et supprimer le dossier `sniper-fumee-*` laissé dans `%TEMP%` ;
- un profil impossible à supprimer après 20 essais espacés de 300 ms (fichier encore tenu par un processus fils de Chromium ou par l'antivirus) est signalé sur la sortie d'erreur, « profil jetable non supprimé : <chemin> », à supprimer à la main ; le verdict du jeu n'en dépend pas (même code de sortie).

Sortie : d'abord ce qui est vérifié, `build vérifié : dist/index.html du <date> ; commit <commit court>, <n> lignes dans git status --porcelain` (avec `--exe`, la date de `resources/app.asar`) : `dist/` et `release/` sont ignorés par git, rien d'autre ne lie le verdict à un commit. Puis le JSON du scénario (`electron`, `origine`, `echecs`, `requetesBloquees`, `modeles`, `images`, `mission`, `sauvegarde`, `dureeMs`), puis FUMÉE VERTE ou FUMÉE ROUGE et ses raisons ; code 0 (vert), 1 (rouge), 2 (refus, ou aucun résultat : Electron arrêté avant d'écrire, sans « [fumee] debut » au bout de 30 s, ou tué au délai de garde), 130 (interrompue). Le vert demande le code 0 d'Electron **et** le critère 12 de la spec, relu par le script dans le JSON : aucun échec, aucune requête bloquée, des modèles chargés et aucun en échec, des images toutes décodées, la sauvegarde relue.

Garde : `tests/electron.fumee.test.js` (faux module `electron` et faux jeu monté dans jsdom ; le script lancé pour de vrai dans un bac à sable sans Electron ni exécutable, ou avec un lancement factice), chaque test vu rouge sur le code d'avant ou par mutation (garde réseau coupée, requête non comptée, modèle, image ou sauvegarde non vérifiés, délai de garde absent, sortie avant que la ligne de résultat soit écrite, `data-modeles` posé trop tôt, verdict vert sans résultat, binaire Electron résolu par `require`, etc. : 33 mutations, toutes vues rouges ; puis 5 à la relecture du profil obligatoire : profil temporaire créé par `electron/main.js`, profil absent non refusé, refus sans sortie rouge, fenêtre créée après un refus, chemin refusé par Electron non rattrapé, toutes vues rouges). Relecture finale de E1 : 18 tests neufs ou resserrés rouges sur le code de `1b9ec53`, 9 pour ce qu'ils exigent (« [fumee] debut » absente, profil non vide accepté, profil introuvable confié à Electron, sauvegarde d'un profil déjà servi remplacée par celle de M3, « --exe chemin » pris pour la fumée de `dist/`, paquet sans mode fumée lancé, build périmé accepté, aucune identité du build) et 9 faute des fonctions neuves du script ; puis 22 mutations, toutes vues rouges (garde sans réponse ou filtrée sur `https`, `webSecurity: !fumee`, sortie à 0 malgré des échecs, moitié rouge sur le stockage de la verte, faux `app.setPath` laxiste, profil introuvable laissé à Electron, sous-cadre, cadre principal, page arrêtée, promesse rejetée, filet de 2 s, délai d'étape, Échap envoyé une seule fois, contrôle de `--fumee` retiré, attente de « [fumee] debut » retirée, signaux ni posés ni retirés, profil restant tu, `public/` oublié, identité du build absente, `--exe=` vide accepté).

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

**Origine retenue : `file://`**, selon la règle de la spec du lot 5 (§3.2 : protocole `app://jeu` en repli, seulement si la fumée échoue sous `file://`) et de la tâche E1 du plan. C'est la décision T3 de la feuille de route des chantiers parallèles (`feuille-de-route.md` §5, hors dépôt), à ne pas confondre avec la tâche T3 du lot 2 (la culasse). `fetch` et les modules ES du build (`<script type="module" crossorigin>`, morceaux chargés par `import()`) marchent sous `file://` dans Electron 42.5.0 : le protocole `app://jeu` n'a pas été nécessaire. Le `localStorage` des sauvegardes appartient à cette origine : ne plus la changer une fois une version publiée (spec du lot 5, §3.2).

**Pour le lot 6 (tâche R5, qui se rebase sur ce `electron/main.js`)** :

- garder en tête de `createWindow` la ligne `if (fumee && fumeeFinie) return` (aucune fenêtre après un refus du profil), et le même bloc `webPreferences` dans les deux modes (testé) ;
- sous `file://`, toute page locale a l'origine « file:// », qui ne désigne pas le jeu à elle seule : vérifier l'expéditeur des IPC contre l'URL exacte chargée par le processus principal (`file:///…/dist/index.html`, cadre principal) ;
- la garde de la fumée bloque et compte `ws://127.0.0.1` comme toute requête `ws` : une étape de fumée où la page se connecte au relais demandera une exception étroite (le port du relais ouvert par le processus principal), comptée à part ;
- la fumée sort par `app.exit`, qui n'émet ni `before-quit` ni `will-quit` : une étape qui ouvre le relais le ferme elle-même avant la fin ;
- le faux module `electron` de `tests/electron.fumee.test.js` n'a ni `ipcMain` ni `setWindowOpenHandler` : l'étendre comme celui de `tests/electron.test.js`.

**Témoin rouge réel** : le même build cassé de trois façons le temps d'une fumée, puis remis en place (fichiers comparés à leurs sources) : `models/mafia_woman_03.glb` retiré, `briefing/img/portrait-seconde-cam.jpg` retirée, une image `http://exemple.invalid/fumee.png` ajoutée à `index.html`. La fumée sort rouge (code 1) et nomme les trois : `"modeles":{"charges":6,"echecs":["./models/mafia_woman_03.glb"]}` et « [characters] échec ./models/mafia_woman_03.glb TypeError: Failed to fetch » à chacun des trois chargements de la page, « image non chargée : briefing/img/portrait-seconde-cam.jpg » (largeur 0), la requête `http` bloquée et comptée trois fois. Après chaque fumée : aucun processus Electron, aucun profil jetable restant, aucun dossier `sniper-game` dans `%APPDATA%`.

**Profil obligatoire, vérifié sur le vrai Electron 42.5.0** (relecture de E1, même jour) : `electron . --fumee` sans `--profil` sort en 1 au bout de 1,8 s, avec « profil jetable manquant ». Avec `--profil=profil-relatif`, il sort en 1 avec « profil jetable refusé par Electron : profil-relatif (Path must be absolute) ». Dans les deux cas : aucun dossier `sniper-fumee-*` dans `%TEMP%`, aucun dossier `sniper-game` dans `%APPDATA%`, rien dans le dossier de travail, aucun processus Electron restant. La fumée complète, refaite ensuite, reste verte (4,1 s, mêmes chiffres que ci-dessus). Depuis la relecture finale, `electron/main.js` lit le dossier avant de le confier à Electron : un chemin qui n'existe pas sort sur « profil jetable introuvable » (c'est le cas d'un `profil-relatif` absent du dossier de travail), un dossier non vide sur « profil jetable non vide ». Ces deux refus ne sont vérifiés qu'au faux module : sur la machine partagée, le vrai Electron ne se lance que par `node scripts/fumee.mjs`, qui crée toujours un dossier vide.

La fumée ne joue pas la mission (aucun tir) : elle prouve que le jeu construit démarre hors ligne, charge ses modèles et ses images, lance une mission et relit sa sauvegarde après un rechargement de la page (même processus Electron : la relance du jeu sur le même profil n'est pas vérifiée). Le jeu empaqueté (`--exe`) se vérifie à la tâche E2.
