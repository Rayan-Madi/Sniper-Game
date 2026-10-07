# Annexes des specs

Mesures et relevés qui servent de référence aux specs de `docs/superpowers/specs/`. Les fichiers JSON sont produits par des scripts du dépôt : on ne les écrit pas à la main.

## Mesure mémoire du lot 1 (`2026-10-07-memtest-*.json`)

### Ce que c'est

`scripts/memtest.mjs` ouvre la route de développement `?memtest=1` dans Chrome sans interface (rendu logiciel SwiftShader, profil jetable, aucun port de débogage : `--dump-dom` seulement) et relève les compteurs du renderer (`renderer.info`) après chaque étape d'une partie scriptée. La route ne passe pas par `requestAnimationFrame` (il ne tourne ni sans interface ni dans un onglet masqué) : la boucle du jeu est suspendue, chaque étape monte sa scène avec les fonctions du jeu lui-même, rend 3 images par appel direct à `renderer.render`, puis mesure.

| Étapes | Monté par |
|---|---|
| `menu` | `showMenu()` : la rue construite au démarrage ; depuis la tâche L2, `showMenu` libère la carte courante et reconstruit la rue |
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
node scripts/memtest.mjs --annexe=2026-10-07-memtest-apres-lot1.json   # recopie le résultat sous ce nom
node scripts/memtest.mjs --images=5 --qualite=bas                      # images rendues par étape ; qualité transmise à la route
```

Variables : `CHROME` (chemin de Chrome), `BASE_URL` (défaut `http://localhost:5173/`), `BUDGET_MS` (budget de temps virtuel de Chrome, défaut 1 200 000 ; la mesure prend environ 3 min 30 en temps réel). Sans `--qualite`, les seuils de triangles sont ceux du préréglage Moyen.

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
- **Triangles** : 2,65 M à la vue de départ de M6 (personnages jamais écartés hors champ, ombre de chacun d'eux), 5,5 M dans l'arène PvP. Seuils visés : 1,5 M en Moyen, 0,8 M en Bas.

### Après la tâche L3

Mesure du 8 octobre 2026 sur `129e7f5` plus la correction de l'étape `menu-final` décrite ci-dessous (`shots/memtest-2026-10-07T23-41-50.json`, dossier local, horodatage en UTC). Ce n'est pas encore l'annexe de fin de lot (tâche L8).

| Étape | Géométries | Textures | Programmes | Appels | Triangles |
|---|---|---|---|---|---|
| menu | 409 | 3 | 5 | 540 | 10 506 |
| M6, puis M6-1 à M6-10 | 127 | 184 | 31 | 442 | 2 657 836 |
| menu-campagne | 447 | 32 | 31 | 540 | 10 506 |
| menu-m6 | 447 | 32 | 31 | 540 | 10 506 |
| pvp-1 à pvp-5 | 122 | 357 | 36 | 770 | 5 494 500 |
| menu-final | 447 | 32 | 36 | 540 | 10 506 |

- **Relances de M6 et arènes PvP** : Δ = 0 d'un montage à l'autre (géométries, textures, programmes).
- **Du menu au retour de campagne, +38 géométries et +29 textures** : ce sont exactement les ressources des sept modèles GLB, comptées dans les fichiers (primitives des maillages, textures référencées par les matériaux) : `gangster_man_01` 9 et 4, `mafia_boss` 2 et 2, `mafia_woman_01` 7 et 4, `mafia_henchman` 2 et 7, `gangster_man_02` 5 et 3, `mafia_woman_02` 7 et 4, `mafia_woman_03` 6 et 5. Marquées partagées au chargement, elles partent au GPU la première fois qu'un personnage les dessine et y restent pour toute la session, voulu (spec §4.2). Le menu de départ n'a dessiné aucun personnage : le critère « partie complète » du §6 (géométries ≤ menu + 2 %, textures ≤ menu + 2) ne peut donc pas tenir tel qu'écrit. Reformulation proposée pour L8 : ligne L8 du plan.
- **`menu-final`, +2 géométries (449) jusqu'à cette correction** : depuis L2, l'étape portait 449 géométries, 542 appels et 10 452 triangles, contre 447, 540 et 10 506 aux autres étapes menu. Pas un modèle : les sept sont déjà tous dessinés à `menu-campagne` (les 38 géométries sont toutes les leurs) et le PvP n'en charge pas d'autre. La cause était la route : le bouton QUITTER (`quitToMenu`) reconstruit la rue avec le début de la suite à graine du menu, puis `showMenu` la libère et en reconstruit une autre avec la suite. Cette seconde rue a autant de géométries (466 dans les deux cas, comptées sous jsdom) mais d'autres tirages (fenêtres allumées et leurs linteaux, place et taille des arbres) : à la vue du menu, elle dessine 2 objets de plus (542 appels), donc envoie 2 géométries de plus au GPU (le renderer n'envoie que ce qu'il dessine). Avant L2, `showMenu` ne reconstruisait pas la rue et l'écart n'existait pas. Depuis la relecture de L3, `showMenu` tire à nouveau la graine du menu : `menu-final` est identique à `menu-campagne` et à `menu-m6` à l'unité près, ce qui montre aussi que l'arène, la foule, les avatars, le laser et le pistolet du PvP ne laissent rien derrière eux.

## Captures déterministes (`scripts/capture-mission.mjs`)

Pour comparer deux versions du code image par image, à la vue de départ d'une mission ou sur le menu : `Math.random` à graine, `requestAnimationFrame` et `performance.now` pilotés à la main (20 images de 1/60 s), minuteurs du jeu de 1 s et plus sur cette même horloge (aide de 5 s, indice du cadenas), fondus CSS figés, rendu logiciel SwiftShader. Même code : mêmes octets PNG, vérifié sur deux passes.

```bash
node scripts/capture-mission.mjs avant-lot1 menu 1 2 3 4 5 6   # shots/avant-lot1/menu.png, m1.png … m6.png
cmp shots/avant-lot1/m3.png shots/apres-l1/m3.png              # comparaison à l'octet près
```

`GPU=1` rend sur la carte graphique (plus rapide) ; deux sessions peuvent alors différer d'un niveau de couleur sur quelques pixels (shaders compilés par le pilote) : pour une comparaison à l'octet, rester en SwiftShader.

Les captures d'avant le lot 1 sont dans `shots/avant-lot1/` (dossier local, non versionné), prises avec les fichiers de `b8b3f4b`. Après l'extraction de `mountLevel`, `unmountLevel`, `buildRoundScene` et `releaseRoundScene` (tâche L1), le menu et les six missions sont identiques à l'octet près (`shots/apres-l1/`). Après la libération des ressources (tâche L2), ils le sont encore (`shots/l2/`).

Après la tâche L3 (PNJ libérés, modèles partagés, personnages écartés hors champ), le menu et M5 restent identiques à l'octet près, mais M1, M3 et M6 changent (`shots/l3/`) : la teinte blanche ne copie plus le matériau du modèle, et chaque copie en moins est un identifiant de moins tiré par three.js (`generateUUID` consomme `Math.random`). Le hasard à graine place alors la foule autrement à partir du premier PNJ blanc. Contre-épreuve : avec la copie rétablie le temps d'une capture (`shots/l3-clone/`), le menu, M1, M3, M5 et M6 sont identiques à l'octet près à ceux de L2. Ni le marquage des modèles partagés, ni la libération des PNJ, ni l'écartement hors champ ne change donc ces images ; pour comparer avant et après le lot 1, M1, M3 et M6 se comparent à l'œil (personnages présents, textures intactes), plus à l'octet.

**Retour au menu** (tâche L2) : la cible `retour<n>` joue la mission n, tire trois balles qui passent au-dessus des PNJ (trois trous d'impact au sol, poussière et traceur encore en vie), met en pause, revient au MENU, puis capture `retour-m<n>.png`. Le script affiche `__decor()` avant et après le retour : accroche de dev de `main.js` qui donne la couleur du fond de la scène et le type des objets qui ne sont ni la carte affichée ni les trois lumières du jeu.

```bash
node scripts/capture-mission.mjs l2 retour3   # shots/l2/retour-m3.png
```

Avant L2, le port restait derrière le menu avec son cadenas (`{"fond":"0a1520","horsCarte":["Group"]}`) ; après L2, la rue est reconstruite et rien d'autre ne reste (`{"fond":"87a0b0","horsCarte":[]}`).

**Attente des modèles** : jusqu'à L2, le script comptait aussi les messages « [characters] chargé » de la première page, celle qui pose la sauvegarde et qui charge encore ses modèles quand on la quitte. Le clic sur COMMENCER partait alors parfois avant la fin du chargement de la page rechargée : 488 tirages de hasard en moins avant le clic (les identifiants des objets three.js en consomment), donc d'autres fenêtres allumées, d'autres tonneaux, d'autres PNJ, au même code, environ une capture sur trois. Seuls comptent désormais les messages de la page rechargée (son contexte d'exécution).
