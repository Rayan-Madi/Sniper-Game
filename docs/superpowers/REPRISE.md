# Prompt de reprise : Sniper-Game

> À coller tel quel au début d'une nouvelle conversation Claude Code ouverte dans le dossier du jeu.
> Mis à jour le 7 octobre 2026, après le lot 0 (corrections de l'audit de reprise) et la réécriture de l'historique (`main` à jour sur GitHub).
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

Fait et fusionné dans `main` (tout est relu et testé, **326 tests verts**) :
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

1. **Lot 1 : socle technique** (spec `docs/superpowers/specs/2026-10-07-lot1-socle-technique-design.md`, plan `docs/superpowers/plans/2026-10-07-lot1-socle-technique.md`) : panneau de performances, route `?memtest=1` et `scripts/memtest.mjs`, libération de toute la mémoire GPU (rien n'est libéré hors de l'enquête aujourd'hui), réglages Auto, Bas, Moyen et Haut, écran de chargement des modèles, effets atténués, plein écran, précompilation pendant le briefing. Il passe avant le gameplay : les fuites faussent toute mesure, et les longues distances ajoutent de la charge.
2. **Lot 2 : gameplay A, « le tir »** : ouverture de lunette animée, recul, culasse, son d'impact retardé par la distance, occlusion par le décor (on tire aujourd'hui à travers les murs), zones tête et torse calées sur les os ; **réévaluer la difficulté du tremblement**, réglée quand la lunette ne zoomait pas.
3. **Lot 3 : gameplay B, distances, postes, identification** : plan lointain et `camera.far` (200 aujourd'hui), temps de vol et chute de balle, zoom par mission, postes conformes aux briefings (toit, grue, château d'eau, verrière), marqueurs retirés à partir de M2, casting imposé, fin différée de M3.
4. **Lot 4 : kill-cams** : caméra qui suit la balle, tampon et fiche barrée (scène générée par maquette comme les autres cinématiques), PNG à transparence passés en WebP pour tenir le budget de la spec cinématiques §8 (moins de 1,5 Mo ; ≈ 1,36 Mo hors enquête, ≈ 1,45 Mo avec).
5. **Lot 5 : légèreté, le poids** : GLB compressés (gltf-transform, gratuit), animations partagées (≈ 6,3 Mo en double), niveaux de détail des foules, chargement à la demande (24,9 Mo de modèles partent aujourd'hui avant tout clic), bundle principal sous 700 kB (783 kB aujourd'hui).
6. **Lot 6 : multijoueur** : démarrage de manche quand les deux intros sont finies, champ d'adresse du relais, relais sous Electron.

## Bugs et restes connus

- **Sauvegardes d'avant le lot 0** : une sauvegarde faite après une réussite puis un retour au menu pointe encore sur la mission réussie ; elle la propose une fois (et la recrédite), puis tout se normalise. Pour M6 réussie sans épilogue vu, le menu affiche REPRENDRE : MISSION 6 au lieu de VOIR LA FIN.
- **Échec** : si une cible fuit pendant les 600 ms qui suivent un civil abattu, l'écran dit « Une cible a fui » au lieu du civil (`triggerFleeGameOver` pourrait respecter `failPending`).
- **Convoi, repli procédural** (modèles GLB absents seulement) : le corps couché d'un occupant abattu dépasse de la jeep.
- **Enquête** : le passage entre la console et le battant ouvert de la porte d'entrée est fermé (0,43 m pour 0,56 m d'emprise) ; on atteint le téléphone par le milieu de l'entrée. Vu de très près sous un certain angle, le bord du drap éclairé par la lampe prend une teinte pêche (mélange de la lampe ambre et du ciel bleu, pas un bug de code).
- **Interface** : en 1280 × 720, l'aide des commandes passe sur deux lignes ; deux libellés du journal de Viktor sont peu contrastés (2,3:1 et 2,9:1) ; les tirets cadratins restent dans les répliques des scènes générées.
- `scripts/verif-mission.mjs`, scénario `aide-reussite` : non concluant une fois sur trois quand le premier tir touche un civil (problème du script, pas du jeu).

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
  Le serveur des maquettes a son propre cache (`docs/superpowers/maquettes/cinematiques/vite.config.js`) : les deux peuvent tourner ensemble. Tests : `npx vitest run` (326 attendus). Build : `npx vite build`. Routes de dev : `?cine=<id>&freeze=<ms>` (cinématiques), `?enquete=1&cam=x,y,z,lacet,tangage&ouvrir=<indice>&indices=n&stats=1` (enquête). Accroches de dev dans la console : `__mem()`, `__aim()`, `__mission()`.
- **Captures et pilotage** : `scripts/shots.mjs` (cinématiques) et `scripts/verif-mission.mjs` (campagne), Chrome sans interface, chemin `--screenshot` absolu, `--user-data-dir` jetable, **jamais de port de débogage fixe** (`--remote-debugging-port=0`, port relu dans `DevToolsActivePort`) : un port fixe a déjà fait piloter par erreur le navigateur d'une autre session. Si le volet du navigateur intégré est caché, `requestAnimationFrame` ne tourne pas : tester le rendu par captures sans interface.
- **Worktrees** : ne pas mettre `node_modules` en jonction, ou retirer la jonction (`cmd /c rmdir`) avant `git worktree remove`, qui la suit et vide le `node_modules` du dépôt principal.
- Style « dossier du fixeur » : Anton (le fixeur) n'est jamais vu et ne dit jamais « tu entres » ; Viktor tire toujours de loin et en hauteur.
