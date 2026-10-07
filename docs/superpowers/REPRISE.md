# Prompt de reprise — Sniper-Game

> À coller tel quel au début d'une nouvelle conversation Claude Code ouverte dans le dossier du jeu.
> Mis à jour le 7 octobre 2026, après la fusion de l'enquête jouable (main = `af8b22e`).
>
> **Sur un autre PC** : ce fichier est sur GitHub. Ouvrir Claude Code dans un dossier vide et commencer par :
> « Clone https://github.com/Rayan-Madi/Sniper-Game, fais `npm install`, puis lis docs/superpowers/REPRISE.md et reprends à partir de là. »
> Ne sont PAS sur GitHub (restés sur le premier PC) : les journaux de chantier `.superpowers/sdd/`, la config des serveurs
> `.claude/launch.json` (à recréer, contenu ci-dessous) et la mémoire de Claude. Tout l'essentiel est dans les specs et les plans.

---

On reprend mon jeu **Sniper-Game** (Three.js 0.185 + Vite 8, build Electron, son 100 % procédural, mode histoire en 6 missions + PvP 1v1). Réponds-moi **toujours en français**. Je délègue beaucoup : tu peux utiliser des sous-agents et des workflows, commiter, **fusionner dans `main` après relecture et pousser sur GitHub** sans me redemander. Préviens-moi quand c'est fini. Mon PC s'éteint parfois en pleine session : tiens un journal pour pouvoir reprendre.

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

## Comment on travaille (à garder)

- Skills superpowers : `brainstorming` → spec dans `docs/superpowers/specs/` → `writing-plans` → exécution par sous-agents (implémenteur → relecture conformité + qualité → correction) avec un journal `.superpowers/sdd/<date>-<sujet>/progress.md` → revue finale de branche → fusion en avance rapide dans `main` → push.
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
