# Prompt de reprise — Sniper-Game

> À coller tel quel au début d'une nouvelle conversation Claude Code ouverte dans le dossier du jeu.
> Mis à jour le 7 octobre 2026, après la fusion de l'enquête jouable (`main` à jour sur GitHub).
>
> **Sur un autre PC** : ce fichier est sur GitHub. Ouvrir Claude Code dans un dossier vide et commencer par :
> « Clone https://github.com/Rayan-Madi/Sniper-Game, fais `npm install`, puis lis docs/superpowers/REPRISE.md et reprends à partir de là. »
> Ne sont PAS sur GitHub (restés sur le premier PC) : les journaux de chantier `.superpowers/sdd/`, la config des serveurs
> `.claude/launch.json` (à recréer, contenu ci-dessous) et la mémoire de Claude. Tout l'essentiel est dans les specs et les plans.

---

On reprend mon jeu **Sniper-Game** (Three.js 0.185 + Vite 8, build Electron, son 100 % procédural, mode histoire en 6 missions + PvP 1v1). Réponds-moi **toujours en français**. Je délègue beaucoup : tu peux utiliser des sous-agents et des workflows, commiter, **fusionner dans `main` après relecture et pousser sur GitHub** sans me redemander. Préviens-moi quand c'est fini. Mon PC s'éteint parfois en pleine session : tiens un journal pour pouvoir reprendre.

Ce que j'attends : le résultat le plus « stylé » possible (qualité visuelle et narrative avant tout), jouable sur un PC correct de milieu de gamme (pas de config extrême), et **rien de payant** pour l'instant (pas d'abonnement, pas de service payant ; pas ma propre voix).

## L'histoire en bref

- **Viktor Kane**, ancien tireur d'élite, a refusé par principe de travailler pour un réseau criminel (appel du 21 février, « Un tir, cent mille »). Le **14 mars**, sa femme et sa fille sont tuées chez lui. **Anton**, un fixeur qui vend des infos (jamais vu, voix radio seulement), avait tenté de le prévenir : message à 18:52 depuis un numéro jetable (06 39 98 41 07) ; sa femme a appelé à 19:04 depuis le fixe ; Viktor, rentré à 21:47, avait oublié son téléphone (en silencieux). Il rappelle Anton à 22:41, qui lui donne les noms.
- Les cibles : **M1** Markov (traite humaine, le marché) ; **M2** les frères Sanctechair, Luc et Marc (bouchers) ; **M3** Vosko le passeur et Mira, au port — **choix moral** : libérer ou non les victimes enfermées (`upgradeState.freedVictims`), qui change l'**épilogue** (variantes `libres` / `enfermes`) ; **M4** trois officiers, Verne, Halder et Rossi ; **M5** le colonel Kessler, « sans visage », dans un convoi ; **M6** le commanditaire, inconnu.
- Tout le texte des cinématiques est dans les maquettes (`docs/superpowers/maquettes/cinematiques/*.html`).

## Où on en est

La refonte a 3 sous-projets : **cinématiques** (presque fini) → **gameplay** → **légèreté**.

Fait et fusionné dans `main` (tout est relu, testé, 174 tests verts) :
1. **Briefings M1-M6 et épilogue** en motion design « dossier du fixeur » (Plan 1) : kit `src/briefing/kit.js`, `playCinematic` dans `src/briefing/index.js`, scènes générées depuis les maquettes `docs/superpowers/maquettes/cinematiques/` par `scripts/port-maquette.mjs` (ne jamais éditer `src/briefing/scenes/*.js` à la main).
2. **Prologue** en deux cinématiques (Plan 2) : `prologue-a` (l'offre, le refus, « 14 MARS · 21:47 ») et `prologue-b` (la messagerie, le rappel d'Anton, le tableau de chasse). L'ancienne intro 3D (`cinematic3d.js`, `cutscene.js`) est supprimée. Le prologue se joue une fois par campagne (`upgradeState.prologueSeen`).
3. **Enquête jouable** entre A et B (Plan 3) : `src/prologue/` — appartement 3D procédural fusionné par matériau, déplacement FPS (touches de `settings.pvpKeys`), 6 indices + le téléphone, fiches d'indice avec photo, pause « REPRENDRE / PASSER L'ENQUÊTE », son (pluie, cœur, voix intérieure). Budgets tenus (≤ 44 appels de dessin, ≤ 16 500 triangles). Chargée à la demande (chunk de 77 kB).

À lire pour le contexte : les specs `docs/superpowers/specs/2026-10-02-cinematiques-design.md` (avec sa note « Écarts assumés au Plan 2 ») et `docs/superpowers/specs/2026-10-04-enquete-design.md`, les plans `docs/superpowers/plans/`, et les journaux `.superpowers/sdd/*/progress.md` (non versionnés, sur ma machine).

## À me faire tester ou trancher

- **Recette à la souris** de l'enquête (la revue l'a jouée dans un Chrome piloté, mais je ne l'ai pas encore faite moi-même) : COMMENCER → cinématique A → carte « 14 MARS · 21:47 » → clic → se déplacer, examiner les 6 indices, téléphone verrouillé puis ouvert, Échap → pause → REPRENDRE, « ÉCOUTER LE MESSAGE » → cinématique B → briefing M1.
- Questions ouvertes :
  - le bouton « REVOIR LE BRIEFING » de la pause **recommence la mission** : garder, ou le renommer ?
  - le compteur « 12 / 24 » du briefing M5 ne montre que 9 silhouettes ;
  - dans l'épilogue, le dernier appel d'Anton affiche encore « NUMÉRO MASQUÉ » alors qu'au prologue il appelle d'un numéro jetable (06 39 98 41 07) ;
  - une fois la fiche du téléphone ouverte, la seule sortie est « ÉCOUTER » : un joueur à 4 ou 5 indices ne peut plus chercher les autres (conforme à la spec, à confirmer) ;
  - les briefings annoncent des tirs de 31 à 430 m, alors que le jeu tire entre 20 et 43 m (à régler avec le gameplay).

## Suite prévue

1. Fin du sous-projet cinématiques : **kill-cams** (cinématiques de mort des cibles, à prototyper dans le moteur ; point d'accroche prévu en spec §6.6), **casting** définitif (les deux frères partagent un visage, le « boss » est un soldat en armure), **voix** finales (service de voix IA gratuit, quand les textes sont figés — pas de voix Windows, pas ma voix).
2. Sous-projet **gameplay** (distances de tir, sensations, missions).
3. Sous-projet **légèreté** : le jeu n'appelle `dispose()` nulle part, la mémoire GPU monte à chaque mission (mesuré : 346 géométries au menu → 1 284 après les 6 missions) ; le bundle principal fait 779 kB (+31 kB de modules three partagés avec l'enquête : voir le découpage `manualChunks`).

Budget de poids des cinématiques (spec §8) : moins de 1,5 Mo ajouté au total ; on en est à ≈ 1,36 Mo (images des portraits dans `public/briefing/img/`, recompressées par `scripts/compress-briefing-img.ps1`). Toute nouvelle image (casting, kill-cams) doit tenir dans la marge, ou passer les PNG à transparence en WebP.

## Bugs et restes connus

- **PvP** : le vecteur « droite » du contre-tueur est inversé (`src/pvp.js`, vers la ligne 625 : la touche D fait aller à gauche). À corriger avec le gameplay.
- **Build Electron** : les modèles 3D sont chargés par un chemin absolu `/models/…`, qui casse sous `file://` (spec cinématiques §11). Les images des cinématiques, elles, sont en chemin relatif.
- **Enquête** (mineurs relevés à la revue finale) : entre le battant ouvert de la porte d'entrée et la console il reste 0,45 m, un peu juste pour longer le battant jusqu'au téléphone (on passe par le milieu de l'entrée) ; vu de très près sous un certain angle, le bord du drap éclairé par la lampe prend une teinte pêche.

## Comment on travaille (à garder)

- Skills superpowers : `brainstorming` → spec dans `docs/superpowers/specs/` → `writing-plans` → exécution par sous-agents (implémenteur → relecture conformité + qualité → correction) avec un journal `.superpowers/sdd/<date>-<sujet>/progress.md` → revue finale de branche → fusion en avance rapide dans `main` → push. Si ces skills ne sont pas installées sur la machine, suivre le même processus à la main.
- Environnement : **Node 24** (jsdom 30 exige Node ≥ 22.22) ; Windows + Git Bash ; Chrome installé pour les captures (`C:/Program Files/Google/Chrome/Application/chrome.exe` par défaut dans `scripts/shots.mjs`, variable `CHROME` sinon).
- Commits en français dans le style du dépôt, terminés par `Co-Authored-By: Claude …`.
- Serveurs : `.claude/launch.json` (non versionné ; à recréer s'il manque) :
  ```json
  { "version": "0.0.1", "configurations": [
    { "name": "sniper-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 },
    { "name": "maquettes", "runtimeExecutable": "npx", "runtimeArgs": ["vite", "docs/superpowers/maquettes/cinematiques", "--port", "5193", "--strictPort"], "port": 5193 }
  ] }
  ```
  Tests : `npx vitest run` (174 attendus). Build : `npx vite build`. Routes de dev : `?cine=<id>&freeze=<ms>` (cinématiques), `?enquete=1&cam=x,y,z,lacet,tangage&ouvrir=<indice>&indices=n&stats=1` (enquête). Captures : `scripts/shots.mjs` (Chrome sans interface ; sous Windows, chemin `--screenshot` absolu et `--user-data-dir` jetable). Si le volet du navigateur intégré est caché, `requestAnimationFrame` ne tourne pas : tester le rendu par captures sans interface.
- Style « dossier du fixeur » : Anton (le fixeur) n'est jamais vu et ne dit jamais « tu entres » ; Viktor tire toujours de loin et en hauteur ; aucun corps montré.
