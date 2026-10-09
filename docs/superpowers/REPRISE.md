# Prompt de reprise : Sniper-Game

> À coller tel quel au début d'une nouvelle conversation Claude Code ouverte dans le dossier du jeu.
> Mis à jour le 9 octobre 2026, à la fin du lot 1 (socle technique, branche `lot1-socle`), après le lot 0 (corrections de l'audit de reprise) et la réécriture de l'historique du 7 octobre.
>
> **Sur un autre PC** : ce fichier est sur GitHub. Ouvrir Claude Code dans un dossier vide et commencer par :
> « Clone https://github.com/Rayan-Madi/Sniper-Game, fais `npm install`, puis lis docs/superpowers/REPRISE.md et reprends à partir de là. »
> **L'historique a été réécrit le 7 octobre 2026** (trailers retirés, auteurs unifiés) : une copie clonée avant cette date n'est plus compatible. Repartir d'un clone neuf, ou, s'il n'y a rien de local à garder : `git fetch origin` puis `git reset --hard origin/main`.
> Ne sont PAS sur GitHub : les journaux de chantier `.superpowers/sdd/` (exclus par `.git/info/exclude`), la config des serveurs `.claude/launch.json` (à recréer, contenu ci-dessous) et la mémoire de Claude. Tout l'essentiel est dans les specs et les plans.

---

On reprend mon jeu **Sniper-Game** (Three.js 0.185 + Vite 8, build Electron, son 100 % procédural, mode histoire en 6 missions + PvP 1v1). Réponds-moi **toujours en français**. Je délègue beaucoup : tu peux utiliser des sous-agents et des workflows, commiter, **fusionner dans `main` après relecture et pousser sur GitHub** sans me redemander. Préviens-moi quand c'est fini. Mon PC s'éteint parfois en pleine session : tiens un journal pour pouvoir reprendre.

Ce que j'attends : le résultat le plus « stylé » possible (qualité visuelle et narrative avant tout), jouable sur un PC correct de milieu de gamme (pas de config extrême), et **rien de payant** pour l'instant (pas d'abonnement, pas de service payant ; pas ma propre voix).

## L'histoire en bref

- **Viktor Kane**, ancien tireur d'élite, a refusé par principe de travailler pour un réseau criminel (appel du 21 février, « Un tir, cent mille »). Le **14 mars**, sa femme et sa fille sont tuées chez lui. **Anton**, un fixeur qui vend des infos (jamais vu, voix radio seulement), avait tenté de le prévenir : message à 18:52 depuis un numéro jetable (06 39 98 41 07) ; sa femme a appelé à 19:04 depuis le fixe ; Viktor, rentré à 21:47, avait oublié son téléphone (en silencieux). Il rappelle Anton à 22:41, qui lui donne les noms. Dans l'épilogue, Anton rappelle depuis ce même numéro jetable.
- Les cibles : **M1** Markov (traite humaine, le marché) ; **M2** les frères Sanctechair, Luc et Marc (bouchers) ; **M3** Vosko le passeur et Mira, au port. **Choix moral** : libérer ou non les victimes enfermées (`upgradeState.freedVictims`), ce qui change l'**épilogue** (variantes `libres` / `enfermes`) et le journal de Viktor ; **M4** trois officiers, Verne, Halder et Rossi ; **M5** le colonel Kessler, « sans visage », dans un convoi ; **M6** le commanditaire, inconnu.
- Tout le texte des cinématiques est dans les maquettes (`docs/superpowers/maquettes/cinematiques/*.html`).

## Où on en est

Fait, relu et testé (**728 tests verts** avec le lot 1 ; 326 à la fin du lot 0) ; les points 1 à 4 sont fusionnés dans `main`, le lot 1 (point 5) l'est après la relecture finale de sa branche `lot1-socle` :
1. **Briefings M1-M6 et épilogue** en motion design « dossier du fixeur » (Plan 1) : kit `src/briefing/kit.js`, `playCinematic` dans `src/briefing/index.js`, scènes générées depuis les maquettes par `scripts/port-maquette.mjs` (ne jamais éditer `src/briefing/scenes/*.js` à la main).
2. **Prologue** en deux cinématiques (Plan 2) : `prologue-a` et `prologue-b`, une fois par campagne (`upgradeState.prologueSeen`).
3. **Enquête jouable** entre A et B (Plan 3) : `src/prologue/`. Budget gardé par un test (au plus 47 maillages et 16 600 triangles par `stats()` ; mesuré en jeu : 44 appels, 16 446 triangles).
4. **Lot 0 : corrections de l'audit de reprise** (plan `docs/superpowers/plans/2026-10-07-lot0-corrections.md`) :
   - visée : la lunette zoome vraiment (`src/aim.js`, `fovFor`), tremblement indépendant des images par seconde, cadrage de départ juste ;
   - progression : la mission suivante est enregistrée dès la réussite (`src/campaign/progress.js`, `recordClear`, `campaignDone`, VOIR LA FIN depuis le menu), plus de points rejoués ;
   - fin de mission : gardes de phase (`src/campaign/phase.js`) ; pause impossible pendant la kill-cam ou un échec en attente ; REVOIR LE BRIEFING depuis la pause rejoue la cinématique et revient à la pause sans recommencer ; FANTÔME possible avec le cadenas ; minuteurs protégés par `missionToken` ;
   - clavier : raccourci de mission 1 à 6 en `e.code`, réservé au mode dev (`src/campaign/shortcuts.js`) ; apnée relâchée sur Alt-Tab ;
   - monde : PNJ posés sur le sol de chaque carte (`groundY`), colonel abattu qui suit sa jeep (`src/campaign/convoy.js`) ;
   - PvP : la touche D va à droite (`src/pvpMath.js`), modèles chargés dans un ordre stable, perte du relais et départ de l'adversaire annoncés ;
   - Electron : modèles en chemin relatif (`import.meta.env.BASE_URL`), `npm run electron:dev` marche sous Windows, `Soldier.glb` et `model_check.html` retirés ;
   - cinématiques : compteurs justes en mode gel, compteur de M5 au rythme des silhouettes, numéro jetable d'Anton dans l'épilogue, `reset()` du kit propre, musique coupée bien débranchée ;
   - enquête : plus d'écoute du message au double-clic sur le téléphone (garde de 600 ms), ancre du téléphone vraiment atteignable ;
   - textes visibles du jeu sans tiret cadratin (test garde-fou `tests/texts.test.js`), journal du port selon le choix ;
   - outils : cache Vite à part pour le serveur des maquettes (sans lui, lancer les deux serveurs cassait le jeu en 504) ; `scripts/verif-mission.mjs` rejoue des parcours de campagne dans Chrome sans interface.
5. **Lot 1 : socle technique** (spec `docs/superpowers/specs/2026-10-07-lot1-socle-technique-design.md`, dont le §8 consigne les décisions du 9 octobre 2026 ; plan `docs/superpowers/plans/2026-10-07-lot1-socle-technique.md` ; mesures et captures dans `docs/superpowers/specs/annexes/README.md`) :
   - mesure : panneau de performances (`src/gfx/stats.js` : images par seconde, durée d'image p50 et p95, appels, triangles, géométries, textures, programmes, tas JS), affiché par `?stats=1` dans toutes les phases ou par le réglage « Afficher les performances » ; route de développement `?memtest=1` (partie scriptée : menu, première image de M1, M1 à M6, menu, 10 montages de M6, 5 arènes PvP, menu ; `renderer.info` relevé en JSON après chaque étape ; `&qualite=bas`, `&images=3`, `&precompilation=0`) ; `scripts/memtest.mjs`, qui la lance dans Chrome sans interface (`--check` applique les seuils du §6 de la spec, `--annexe=<nom>.json`, `--qualite=`, `--temps-reel --gpu` pour les durées, `--sans-precompilation`) ; `scripts/capture-mission.mjs`, captures déterministes à l'octet près (menu, vue de départ d'une mission, retour au menu ; `QUALITE=`, `IMAGES=`, `BASE_URL=`) ;
   - mémoire : `src/gfx/dispose.js` (`markShared`, `disposeObject`) libère tout ce que le jeu crée (cartes, PNJ, effets de tir, trous d'impact, cadenas, jeeps, arène et foule PvP) sans jamais toucher aux ressources partagées des modèles GLB ; la rue est reconstruite au menu ; un seul contexte audio, PvP compris ;
   - réglages graphiques, section « Affichage » des Paramètres : Qualité Auto, Bas, Moyen, Haut (`src/gfx/quality.js`) ; Auto rend comme Moyen avec une résolution dynamique (échelle de 0,7 à 1) qui remonte à la cadence de l'écran ; ombre des personnages selon le préréglage (Bas : aucune ; Moyen : cibles et gardes ; Haut : tous, le rendu d'avant le lot) ; personnages écartés hors champ (sphère d'instance de 1,25 fois la hauteur) ;
   - chargement : écran PRÉPARATION DU DOSSIER tant que les modèles arrivent (jamais de PNJ procéduraux au départ d'une mission ou d'une manche, 20 s d'attente au plus) ; contexte WebGL perdu rattrapé (écran modal, RECHARGER) ;
   - confort : Effets atténués (Auto suit `prefers-reduced-motion`, Oui, Non) : flash du tir à 0,06, aucune secousse, glitchs des cinématiques au tiers, carton SIGNAL PERDU figé ; bouton Plein écran ;
   - précompilation : la mission se monte et ses shaders se compilent sur l'écran noir d'ouverture de son briefing ;
   - chiffres, avant le lot contre après, en Moyen (README des annexes, « Après le lot 1 ») : après toute une partie, retour au menu à 3 288 géométries et 3 553 textures avant, 447 et 32 après (dont les 38 et 29 des sept modèles, gardées pour la session) ; chaque relance de M6 ajoutait 89 géométries et 155 textures, chaque arène PvP 84 et 329 : plus rien ; triangles de M6 à la vue de départ, 2,65 M avant, 1,42 M en Moyen, 1,33 M en Bas ; arène PvP, 5,5 M avant, 2,75 M ; première image de M1 à froid (RTX 3080), 1,18 s avant, 0,41 s après ; arrêt entre la cinématique et M6, d'environ 2,8 s à 0,5 à 0,7 s. Les cinq seuils du §6 de la spec sont tenus en Moyen et en Bas (`node scripts/memtest.mjs --check`).

À lire pour le contexte : les specs `docs/superpowers/specs/` (cinématiques, enquête, lot 1) et les plans `docs/superpowers/plans/`.

## Décisions de Rayan (7 octobre 2026)

- **« Aucun corps montré »** ne vaut que pour **la femme et la fille de Viktor**. Les cibles peuvent mourir à l'écran (chute, sang) ; les photos de victimes du briefing M1 restent.
- **Distances** : le jeu rejoint les briefings : environ 155 m en M3, 430 m en M4, environ 138 m en M5 (repli vers 120-250 m pour M4 seulement si la cible devient illisible). M1, M2 et M6 sont déjà dans la plage.
- **Marqueurs rouges** au-dessus des cibles : gardés en M1 (tutoriel), retirés à partir de M2 ; on identifie les cibles par les signes du briefing, avec une fiche dans le HUD.
- **M3** : fin différée. Après la dernière cible, quelques secondes au calme où Anton pousse au choix du cadenas ; la kill-cam vient ensuite.
- **Kill-cams** : **caméra qui suit la balle** jusqu'à l'impact sur la dernière cible, puis tampon « dossier du fixeur » et fiche barrée ; petite fiche barrée non bloquante pour les autres cibles.
- **Casting** : un modèle imposé par cible nommée (celui de son portrait), les frères distingués par des accessoires et la teinte.
- **Voix** : **on garde les bips**, pas de voix (ni synthèse ni service en ligne).
- **Historique Git** : réécrit le 7 octobre 2026 (trailers `Co-Authored-By` retirés, auteurs unifiés sous Rayan Madi).

Questions encore ouvertes :
- dans l'enquête, une fois la fiche du téléphone ouverte, la seule sortie est ÉCOUTER : ajouter un REPOSER pour chercher les indices manquants ?
- PvP hors réseau local : par défaut, réseau local avec un champ « adresse du relais » (pas d'hébergement payant).

## Suite prévue (dans cet ordre)

1. **Lot 2 : gameplay A, « le tir »** : ouverture de lunette animée, recul, culasse, son d'impact retardé par la distance, occlusion par le décor (on tire aujourd'hui à travers les murs), zones tête et torse calées sur les os ; **réévaluer la difficulté du tremblement**, réglée quand la lunette ne zoomait pas. Spec et plan rédigés le 9 octobre 2026 dans le journal local (`.superpowers/sdd/2026-10-07-reprise/2026-10-09-lot2-le-tir-design.md` et `2026-10-09-lot2-le-tir.md`, sur ce PC seulement) : à ranger dans `docs/superpowers/specs/` et `plans/` une fois le lot 1 fusionné, puis branche `lot2-tir`. Juger sa charge avec les outils du lot 1 (`?stats=1`, `scripts/memtest.mjs --check`).
2. **Lot 3 : gameplay B, distances, postes, identification** : plan lointain et `camera.far` (200 aujourd'hui), temps de vol et chute de balle, zoom par mission, postes conformes aux briefings (toit, grue, château d'eau, verrière), marqueurs retirés à partir de M2, casting imposé, fin différée de M3.
3. **Lot 4 : kill-cams** : caméra qui suit la balle, tampon et fiche barrée (scène générée par maquette comme les autres cinématiques), PNG à transparence passés en WebP pour tenir le budget de la spec cinématiques §8 (moins de 1,5 Mo ; ≈ 1,36 Mo hors enquête, ≈ 1,45 Mo avec).
4. **Lot 5 : légèreté, le poids** : GLB compressés (gltf-transform, gratuit), animations partagées (≈ 6,3 Mo en double), niveaux de détail des foules (objectif repris du lot 1 : 0,8 M triangles en Bas à la vue de départ de M6, contre 1,33 M après le lot 1, la géométrie des 27 PNJ seule), chargement à la demande (24,9 Mo de modèles partent aujourd'hui avant tout clic), bundle principal sous 700 kB (796 kB après le lot 1, 783 kB après le lot 0).
5. **Lot 6 : multijoueur** : démarrage de manche quand les deux intros sont finies, champ d'adresse du relais, relais sous Electron ; flash rouge de l'alarme PvP (environ 2,7 Hz pendant 2,5 s) et secousses du téléphone et de l'alarme à faire suivre les effets atténués (reporté du lot 1, spec du lot 1 §4.5 et §8).

## Bugs et restes connus

- **Sauvegardes d'avant le lot 0** : une sauvegarde faite après une réussite puis un retour au menu pointe encore sur la mission réussie ; elle la propose une fois (et la recrédite), puis tout se normalise. Pour M6 réussie sans épilogue vu, le menu affiche REPRENDRE : MISSION 6 au lieu de VOIR LA FIN.
- **Échec** : si une cible fuit pendant les 600 ms qui suivent un civil abattu, l'écran dit « Une cible a fui » au lieu du civil (`triggerFleeGameOver` pourrait respecter `failPending`).
- **Convoi, repli procédural** (modèles GLB absents seulement) : le corps couché d'un occupant abattu dépasse de la jeep.
- **Enquête** : le passage entre la console et le battant ouvert de la porte d'entrée est fermé (0,43 m pour 0,56 m d'emprise) ; on atteint le téléphone par le milieu de l'entrée. Vu de très près sous un certain angle, le bord du drap éclairé par la lampe prend une teinte pêche (mélange de la lampe ambre et du ciel bleu, pas un bug de code).
- **Interface** : en 1280 × 720, l'aide des commandes passe sur deux lignes ; deux libellés du journal de Viktor sont peu contrastés (2,3:1 et 2,9:1) ; les tirets cadratins restent dans les répliques des scènes générées.
- `scripts/verif-mission.mjs`, scénario `aide-reussite` : non concluant une fois sur trois quand le premier tir touche un civil (problème du script, pas du jeu).
- **Restes du lot 1** (détail dans sa spec, §4.3, §4.5, §4.6 et §8) :
  - cas rare : une mission lancée alors que les modèles chargent encore (REPRENDRE juste après l'ouverture du jeu, briefing pas encore vu) se monte à leur arrivée, en pleine cinématique, qu'elle fige de 0,1 à 0,4 s ; gardé tel quel (pistes au plan du lot 1, tâche L7) ;
  - l'écran noir qui ouvre un briefing s'allonge du temps du montage de la mission (0,4 s en M6 sur la RTX 3080, sans doute 0,8 à 1 s sur un PC de milieu de gamme, non mesuré) ; l'arrêt qui suit la cinématique, lui, raccourcit bien plus ;
  - la première image d'une mission compile encore un programme d'ombre et envoie les textures des modèles (environ 0,15 s) ; suite possible : `renderer.initTexture` pendant le briefing ;
  - PvP : alarme et secousses ignorent les effets atténués (lot multijoueur) ; 0,8 M triangles en Bas pour M6 (lot poids) ;
  - résolution dynamique d'Auto, limites connues : une gigue d'appel au-delà de 1,5 ms, ou un à-coup de plus d'une seconde juste après une remontée, peuvent la retenir sous 1 ;
  - Plein écran jamais essayé sous Electron (à vérifier à la main).

## Comment on travaille (à garder)

- Skills superpowers : `brainstorming` → spec dans `docs/superpowers/specs/` → `writing-plans` → exécution par sous-agents (implémenteur → relecture conformité + qualité → correction) avec un journal `.superpowers/sdd/<date>-<sujet>/progress.md` → relecture finale de branche → fusion en avance rapide dans `main` → push. Si ces skills ne sont pas installées sur la machine, suivre le même processus à la main.
- **Tests avec témoin rouge** : un test n'est accepté que s'il a été vu rouge sur l'ancien comportement (une fonction absente ne compte pas). `main.js` ne s'importe pas sous jsdom : la logique à tester est sortie dans des modules purs (`src/aim.js`, `src/campaign/*`, `src/pvpMath.js`).
- Environnement : Node 22.16 suffit (jsdom 30 avertit EBADENGINE mais les tests passent ; Node 24 reste recommandé) ; Windows + Git Bash ; Chrome installé pour les captures (`C:/Program Files/Google/Chrome/Application/chrome.exe` par défaut, variable `CHROME` sinon).
- **Commits** en français dans le style du dépôt (`fix(jeu): …`, `feat(…)`, `docs: …`), **sans aucun trailer `Co-Authored-By` ni attribution Claude**, sans tiret cadratin. Identité du dépôt : `Rayan Madi <madirayan75015@gmail.com>` (`git config user.name` / `user.email` en local).
- Serveurs : `.claude/launch.json` (non versionné ; à recréer s'il manque) :
  ```json
  { "version": "0.0.1", "configurations": [
    { "name": "sniper-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 },
    { "name": "maquettes", "runtimeExecutable": "npx", "runtimeArgs": ["vite", "docs/superpowers/maquettes/cinematiques", "--port", "5193", "--strictPort"], "port": 5193 }
  ] }
  ```
  Le serveur des maquettes a son propre cache (`docs/superpowers/maquettes/cinematiques/vite.config.js`) : les deux peuvent tourner ensemble. Tests : `npx vitest run` (728 attendus). Build : `npx vite build`. Routes de dev : `?cine=<id>&freeze=<ms>` (cinématiques), `?enquete=1&cam=x,y,z,lacet,tangage&ouvrir=<indice>&indices=n&stats=1` (enquête), `?stats=1` (panneau de performances, toutes phases), `?memtest=1&qualite=bas` (mesure mémoire, lue par `scripts/memtest.mjs`). Accroches de dev dans la console : `__mem()`, `__aim()`, `__aimAt()`, `__mission()`, `__decor()`.
- **Captures et pilotage** : `scripts/shots.mjs` (cinématiques), `scripts/verif-mission.mjs` (campagne), `scripts/capture-mission.mjs` (captures déterministes, à comparer à l'octet) et `scripts/memtest.mjs` (mesure mémoire et triangles, seuils du lot 1 avec `--check` ; mode d'emploi dans `docs/superpowers/specs/annexes/README.md`), Chrome sans interface, chemin `--screenshot` absolu, `--user-data-dir` jetable, **jamais de port de débogage fixe** (`--remote-debugging-port=0`, port relu dans `DevToolsActivePort`) : un port fixe a déjà fait piloter par erreur le navigateur d'une autre session. Si le volet du navigateur intégré est caché, `requestAnimationFrame` ne tourne pas : tester le rendu par captures sans interface.
- **Worktrees** : ne pas mettre `node_modules` en jonction, ou retirer la jonction (`cmd /c rmdir`) avant `git worktree remove`, qui la suit et vide le `node_modules` du dépôt principal.
- Style « dossier du fixeur » : Anton (le fixeur) n'est jamais vu et ne dit jamais « tu entres » ; Viktor tire toujours de loin et en hauteur.
