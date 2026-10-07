# Lot 0 : corrections rapides (plan d'exécution)

> **Pour les agents :** exécuter tâche par tâche, en TDD (superpowers:test-driven-development), chaque tâche relue avant la suivante. Cases `- [ ]` pour le suivi.

**But :** un socle fiable avant les sous-projets gameplay et kill-cams : les bugs vérifiés par l'audit du 7 octobre 2026 sont corrigés, chaque correction a un test vu rouge puis vert, REPRISE.md redevient exact.

**Architecture :** `src/main.js` n'est pas importable en test (DOM et effets de bord au chargement). Chaque logique corrigée est donc sortie dans un petit module pur (`src/aim.js`, `src/campaign/*.js`, `src/pvpMath.js`) que `main.js`, `scope.js` ou `pvp.js` appellent. Les tâches qui touchent `main.js` s'enchaînent dans une seule branche ; les trois chantiers sans `main.js` (PvP et Electron, cinématiques, enquête) avancent en parallèle dans des worktrees, puis sont fusionnés.

**Pile :** Three.js 0.185, Vite 8, Vitest 5 (jsdom 30), Node 22.16 (avertissement EBADENGINE sans effet), Windows + Git Bash.

**Source :** rapports d'audit dans `.superpowers/sdd/2026-10-07-reprise/audit/` (non versionnés) : `synthese.md` §2 et `contre-verification.md` font foi pour les numéros de ligne (mesurés sur `28e5dcb`).

## Contraintes globales

- Tests : `npx vitest run` doit rester entièrement vert (174 tests au départ, plus ceux du lot).
- **Témoin rouge obligatoire** : un test qui échoue seulement parce que la fonction n'existe pas encore ne prouve rien. Pour chaque comportement corrigé, on écrit d'abord le module pur **avec le comportement actuel recopié à l'identique**, on vérifie que le nouveau test est rouge, puis on corrige. Si ce n'est pas possible, le dire dans le rapport de tâche et expliquer quelle mutation ferait rougir le test.
- Clavier : toujours `e.code`, jamais `e.key`, pour un raccourci (clavier AZERTY de Rayan).
- Ne jamais éditer `src/briefing/scenes/*.js` à la main : modifier la maquette `docs/superpowers/maquettes/cinematiques/*.html`, puis `node scripts/port-maquette.mjs` (lire le script pour la syntaxe), puis `npx vitest run tests/scripts/port-maquette.test.js`.
- Commits en français, style du dépôt : `fix(jeu): …`, `fix(pvp): …`, `fix(cinematiques): …`, `fix(enquete): …`, `fix(electron): …`, `test(…): …`, `docs: …`. **Aucun trailer `Co-Authored-By`**, aucune attribution Claude. Aucun tiret cadratin (U+2014) dans les textes neufs (code visible par le joueur, commits, docs).
- Style narratif « dossier du fixeur » : Anton n'est jamais vu ; Viktor tire de loin et en hauteur.
- Ne pas toucher : `docs/superpowers/specs/*` sauf mention explicite, l'ancienne copie `C:\Users\shark\sniper-game`.

## Organisation

| Piste | Où | Tâches | Fichiers principaux |
|---|---|---|---|
| A (séquentielle) | `C:\Users\shark\Sniper-Game-reprise`, branche `lot0-corrections` | A1 → A2 → A3 → A4 | `main.js`, `scope.js`, `upgrades.js`, `npc.js`, `maps.js` |
| P1 | worktree `…-wt\p1-pvp-electron`, branche `lot0/pvp-electron` | P1 | `pvp.js`, `characters.js`, `net.js`, `electron/main.js`, `package.json`, `public/` |
| P2 | worktree `…-wt\p2-cinematiques`, branche `lot0/cinematiques` | P2 | `src/briefing/kit.js`, maquettes, `scenes/*` (régénérées) |
| P3 | worktree `…-wt\p3-enquete`, branche `lot0/enquete` | P3 | `src/prologue/*`, `tests/prologue/*` |
| Z (finale) | branche `lot0-corrections` après fusion de P1 à P3 | Z1, Z2 | textes visibles, `REPRISE.md` |

---

### Tâche A1 : la visée (zoom appliqué, cadrage de départ, tremblement indépendant des images par seconde)

**Bugs :**
- `startLevel` règle `camera.fov = 60` puis `setZoom(4)` (`main.js:435-437`) ; `setZoom` ne touche pas au champ de vision (`scope.js:17`). Seule la molette l'applique (`main.js:1036`) et la vue reste zoomée lunette fermée.
- `yaw = Math.atan2(dir.x, -dir.z)` (`main.js:429`) est inversé en X pour l'Euler `YXZ` appliqué à (0,0,-1) : il faut `atan2(-dir.x, -dir.z)`. Sans effet aujourd'hui (toutes les cibles ont `dir.x = 0`), mais faux.
- `updateTremble` (`scope.js:22-47`) ajoute ses à-coups et applique ses amortissements 0,91 et 0,97 **par image** : la dispersion dépend du nombre d'images par seconde.

**Fichiers :**
- Créer : `src/aim.js` (pur, sans DOM), `tests/aim.test.js`
- Modifier : `src/scope.js` (`updateTremble` délègue à `stepTremble`), `src/main.js` (`startLevel`, molette, boucle)

**Interfaces produites :**
```js
// src/aim.js
export const BASE_FOV = 60
export function fovFor(zoom, scoped)            // scoped ? BASE_FOV / zoom : BASE_FOV
export function aimAngles(from, to)             // { yaw, pitch } pour Euler(pitch, yaw, 0, 'YXZ') appliqué à (0,0,-1)
export function stepTremble(t, p, dt, rand)     // t = { x, y, vx, vy, phase } muté ; p = { intensity, sway, breathRate } ; rand() dans [0,1)
```

- [ ] **1. Témoin :** créer `src/aim.js` avec `stepTremble` qui recopie **à l'identique** la physique actuelle de `scope.js:29-46` (à-coups par image, `0.91` et `0.97` par image), `aimAngles` avec la formule actuelle `atan2(dir.x, -dir.z)`, et `fovFor` qui reproduit l'actuel (`return BASE_FOV`).
- [ ] **2. Tests (rouges sur le témoin) :** `tests/aim.test.js`
  - `fovFor(4, true) === 15`, `fovFor(4, false) === 60`, `fovFor(8, true) === 7.5`.
  - `aimAngles` : pour 8 directions cibles autour du poste (dont `dir.x ≠ 0`), appliquer `new THREE.Euler(pitch, yaw, 0, 'YXZ')` à `(0,0,-1)` et retrouver la direction normalisée à 1e-6 près.
  - `stepTremble` : générateur à graine (par exemple un LCG écrit dans le test), même intensité, 10 s simulées à 60 i/s puis à 144 i/s ; l'écart quadratique moyen de `x` (sur la seconde moitié, régime établi) doit être dans un rapport compris entre 0,85 et 1,15. Vérifier qu'il est hors de cette plage sur le témoin (l'audit estime un rapport d'environ 2,4).
- [ ] **3. Lancer :** `npx vitest run tests/aim.test.js` : ROUGE sur les trois blocs.
- [ ] **4. Corriger `src/aim.js` :**
  - `fovFor` : `scoped ? BASE_FOV / zoom : BASE_FOV`.
  - `aimAngles` : `yaw = Math.atan2(-dir.x, -dir.z)`, `pitch = Math.asin(clamp(dir.y, -1, 1))`.
  - `stepTremble` : impulsions proportionnelles à `Math.sqrt(dt * 60)` (bruit blanc), force de respiration en `* dt` (inchangée), amortissements `0.91 ** (dt * 60)` et `0.97 ** (dt * 60)`. À 60 i/s le résultat doit rester celui d'aujourd'hui (même ressenti) : ajouter un test qui le vérifie avec la même graine (égalité à 1e-9 sur 600 pas à `dt = 1/60`).
- [ ] **5. Brancher :**
  - `scope.js` : `updateTremble(dt)` calcule `intensity` et `sway` comme aujourd'hui puis appelle `stepTremble(tremble, { intensity, sway, breathRate: 1.2 + stress * 1.5 }, dt, Math.random)` ; `breathPhase` passe dans `tremble.phase`.
  - `main.js` : supprimer `camera.fov = 60 / next` de la molette et le réglage de `startLevel` (garder `setZoom(4)`) ; dans `loop()`, branche `'playing'`, calculer `const f = fovFor(getZoom(), isVisible())` et n'appeler `updateProjectionMatrix()` que si `camera.fov !== f`. Remplacer le calcul `yaw/pitch` de `startLevel` par `aimAngles`.
- [ ] **6. Vérifier :** `npx vitest run` entièrement vert. Contrôle manuel facultatif en dev : `window.__mem` existe déjà ; ajouter, sous `import.meta.env.DEV` seulement, `window.__aim = () => ({ fov: camera.fov, zoom: getZoom(), scoped: isVisible() })` pour les relectures.
- [ ] **7. Commit :** `fix(jeu): la lunette zoome vraiment, le tremblement ne dépend plus des images par seconde`

---

### Tâche A2 : progression sauvegardée dès la réussite (fin des points infinis)

**Bug :** `triggerLevelClear` crédite `points += reward` et `totalScore = score` puis sauvegarde **sans avancer** `currentLevel` (`main.js:648-653`) ; `currentLevel++` n'arrive qu'au clic sur MISSION SUIVANTE (`main.js:159-163`). Quitter vers le menu après une réussite propose de rejouer la même mission, qui recrédite points et score (`startLevel` repart de `score = totalScore`, `main.js:441`). Après M6, rien n'empêche le même rejeu.

**Fichiers :**
- Créer : `src/campaign/progress.js`, `tests/campaign/progress.test.js`
- Modifier : `src/upgrades.js` (champ `campaignDone`), `src/main.js`, `tests/upgrades.test.js`

**Interfaces produites :**
```js
// src/campaign/progress.js
export const MAX_LEVEL = 6
// Enregistre une réussite dans l'état de campagne (muté) et renvoie { cleared, last }.
// Avance currentLevel à cleared + 1, sauf après la dernière mission : currentLevel reste à MAX_LEVEL et campaignDone passe à true.
export function recordClear(state, { level, reward, score })
```
`upgrades.js` : `state.campaignDone` (défaut `false`), sauvegardé, rechargé (`!!d.campaignDone`), remis à `false` par `resetCampaignFlags()` et `resetProgress()`.

- [ ] **1. Témoin :** `recordClear` recopie le comportement actuel (crédite `points` et `totalScore`, ne touche pas `currentLevel`).
- [ ] **2. Tests :** `tests/campaign/progress.test.js`
  - réussite de M2 : `currentLevel === 3`, `points` augmenté de `reward`, `totalScore === score` ;
  - aller-retour réel : `recordClear` puis `saveProgress()` puis remise à zéro de l'état en mémoire puis `loadProgress()` : on est en mission 3 (la sauvegarde ne propose plus de rejouer M2) ;
  - réussite de M6 : `currentLevel === 6`, `campaignDone === true`, `last === true` ;
  - `resetCampaignFlags()` remet `campaignDone` à `false`.
  - Renforcer `tests/upgrades.test.js:13-18` : l'aller-retour vérifie aussi `currentLevel`, `points`, `totalScore`, `levels` et `campaignDone` ; les tests d'effacement vérifient `localStorage.getItem('sniper-save') === null`. Témoin : supprimer `currentLevel` de `saveProgress` (`upgrades.js:34`) doit faire rougir le test renforcé (le faire à la main, constater, remettre).
- [ ] **3. Lancer :** ROUGE sur le témoin.
- [ ] **4. Corriger** `recordClear` et `upgrades.js`.
- [ ] **5. Brancher dans `main.js` :**
  - `triggerLevelClear` : `const n = upgradeState.currentLevel` lu **avant** ; `const { last } = recordClear(upgradeState, { level: n, reward, score })` ; `lastCleared = n` (nouvelle variable de module) ; `saveProgress()`. Le titre et les boutons utilisent `last`.
  - `btn-next-level` : ne fait plus `currentLevel++`, seulement `launchLevel(upgradeState.currentLevel)`.
  - `showJournal` et `renderUpgradeUI` lisent `lastCleared` (« Mission n terminée → Mission n+1 »), plus `currentLevel`.
  - L'épilogue devient une fonction `playEnding()` appelée par `btn-see-ending` et par `btn-start` quand `campaignDone` est vrai ; `refreshMenuButtons` affiche alors `VOIR LA FIN` (et le bouton RECOMMENCER L'HISTOIRE). Le libellé de reprise (`main.js:89`, avec tiret cadratin) devient « REPRENDRE : MISSION n ».
  - `MAX_LEVEL` vient de `src/campaign/progress.js`.
- [ ] **6. Vérifier :** `npx vitest run` vert.
- [ ] **7. Commit :** `fix(jeu): la mission suivante est sauvegardée dès la réussite, plus de points rejoués`

---

### Tâche A3 : fin de mission, pause et kill-cam (gardes de phase), rang, minuteurs, REVOIR LE BRIEFING

**Bugs :**
- Pendant la kill-cam (ralenti de 1,5 s, `main.js:966-986`), Échap met la pause ; le minuteur appelle ensuite `triggerLevelClear` qui laisse la pause affichée par-dessus la réussite. Le tir reste possible pendant le ralenti (balle jamais résolue).
- `triggerLevelClear` n'a aucune garde de phase ; `triggerGameOver` ne masque pas la pause et peut tomber après une réussite.
- Un civil abattu programme l'échec à 600 ms (`main.js:840-845`) : une pause dans cet intervalle fait apparaître l'échec par-dessus la pause.
- Minuteurs sans `missionToken` : indice du cadenas (`main.js:414-418`) et masquage de l'aide (`main.js:568`) : un « Recommencer » rapide les déclenche deux fois.
- Le tir sur le cadenas (`main.js:780-800`) ne compte pas comme touche : libérer les victimes interdit le rang FANTÔME.
- REVOIR LE BRIEFING (pause) recommence la mission (`main.js:193-196`). **Décision (option A de l'audit) :** il rejoue la cinématique par-dessus la mission figée, puis revient à la pause, sans rien perdre.

**Fichiers :**
- Créer : `src/campaign/phase.js`, `src/campaign/rank.js`, `tests/campaign/phase.test.js`, `tests/campaign/rank.test.js`
- Modifier : `src/main.js`

**Interfaces produites :**
```js
// src/campaign/phase.js : gardes pures. m = { phase, killcam, failPending }
export function canPause(m)        // phase === 'playing' && !killcam && !failPending
export function canShoot(m)        // phase === 'playing' && !killcam
export function canClear(m)        // phase === 'playing'
export function canFail(m)         // (phase === 'playing' || phase === 'paused') && !killcam
export function canRebrief(m)      // phase === 'paused' && !failPending
// src/campaign/rank.js
export function rankFor({ shots, hits, alerts })   // { label, color } : FANTÔME si précision 100 % et 0 alerte, PROFESSIONNEL si ≥ 60 % et ≤ 1 alerte, sinon BRUTAL
export function precisionOf({ shots, hits })       // 100 si aucun tir
```

- [ ] **1. Témoins :** `phase.js` recopie les gardes actuelles (`canPause` = phase `'playing'` seulement, `canClear` toujours vrai, `canFail` = phase ≠ `'dead'`, `canShoot` = `'playing'`, `canRebrief` = `'paused'`). `rank.js` recopie les seuils de `main.js:655-660` (libellés `'★ FANTÔME ★'`, `'PROFESSIONNEL'`, `'BRUTAL'` et couleurs inchangés).
- [ ] **2. Tests :** `tests/campaign/phase.test.js` rejoue des séquences en appliquant les gardes comme le fera `main.js` (un petit simulateur dans le test : `pause`, `resume`, `clear`, `fail`, `killcamStart`, `killcamEnd`, `civilianDown`, `rebrief`) :
  - « kill-cam puis Échap » : la pause est refusée, la réussite arrive en `'cleared'` ;
  - « réussite puis échec » : reste `'cleared'` ;
  - « civil abattu puis Échap » : pause refusée, l'échec arrive en `'dead'` ;
  - « pause puis REVOIR LE BRIEFING puis fin de cinématique » : retour en `'paused'`, aucune remise à zéro ;
  - « tir pendant la kill-cam » : refusé.
  `tests/campaign/rank.test.js` : précision 100 % et 0 alerte donne FANTÔME, etc. ; et le cas cadenas : 2 tirs, 2 touches (cible + cadenas) donne FANTÔME. Ce dernier test documente la règle ; la correction est dans `main.js` (étape 5).
- [ ] **3. Lancer :** ROUGE sur les témoins de `phase.js`.
- [ ] **4. Corriger** `phase.js`.
- [ ] **5. Brancher dans `main.js` :**
  - variable `failPending` (remise à `false` dans `startLevel`) ; `killCivilian` la met à `true` avant son minuteur ;
  - `pauseGame` : `if (!canPause(m())) return` où `m()` renvoie `{ phase: gamePhase, killcam: killcamActive, failPending }` ;
  - `shoot` : `canShoot` ; `triggerLevelClear` : `if (!canClear(m())) return` ;
  - `triggerGameOver`, `triggerFleeGameOver`, `triggerConvoyEscaped` : `if (!canFail(m())) return`, et masquent `pauseEl` ;
  - kill-cam : à la fin du minuteur, `timeScale = 1` et retrait de l'overlay dans tous les cas, `triggerLevelClear()` seulement si le jeton correspond ;
  - minuteurs de `startLevel` (indice du cadenas, masquage de l'aide) protégés par `const token = missionToken` ;
  - cadenas touché : `statHits++` ;
  - rapport de fin : `rankFor` et `precisionOf` ;
  - `btn-rebrief-pause` : si `canRebrief(m())`, mémoriser `const t0 = performance.now()`, masquer la pause, `stopMissionAmbience()`, `gamePhase = 'briefing'`, jouer `cinematic('m' + idx, { audio: cinematicAudio(), onDone })` où `onDone` remet `gamePhase = 'paused'`, réaffiche la pause, décale `statStart += performance.now() - t0`, relance `startMissionAmbience()` et fait `clock.getDelta()`. Le bouton REVOIR LE BRIEFING de l'écran d'échec (`btn-rebrief`) garde son comportement (relance avec briefing).
- [ ] **6. Vérifier :** `npx vitest run` vert ; relire que chaque `gamePhase =` de `main.js` respecte les gardes.
- [ ] **7. Commit :** `fix(jeu): fin de mission sans chevauchement (kill-cam, pause, échec), rang FANTÔME avec le cadenas, briefing revu sans recommencer`

---

### Tâche A4 : clavier, sol des cartes, convoi

**Bugs :**
- Raccourci 1 à 6 sur `e.key` (`main.js:1062-1065`) : mort en AZERTY (rangée du haut `&é"'(-`), actif en production, y compris sur les écrans multijoueur `mp-*`. Maj et Échap aussi en `e.key` (`main.js:1047`, `1050`, `1068`). Pas de relâche de l'apnée sur `blur` (Alt-Tab).
- PNJ posés à y = 0 (`npc.js:205`) alors que la dalle du port est à 0,345 m (`maps.js:397`, M3) et le tarmac de la base à 0,2 m (`maps.js:543`, M4) ; la route du convoi (`maps.js:654`, M5) est elle aussi à 0,2 m. Trous de balle et sol des tirs manqués supposent y = 0 (`main.js:805`, `817`).
- M5 : les passagers morts ne suivent plus la jeep (`main.js:1151-1152`) alors qu'elle roule encore à 15 % (`main.js:868-870`) : le corps du colonel reste suspendu en l'air.

**Fichiers :**
- Créer : `src/campaign/shortcuts.js`, `tests/campaign/shortcuts.test.js`, `tests/maps.ground.test.js`
- Modifier : `src/main.js`, `src/maps.js` (chaque builder renvoie `groundY`), `src/npc.js` (option `groundY`)

**Interfaces produites :**
```js
// src/campaign/shortcuts.js
// Numéro de mission demandé par le raccourci de développement, ou null.
export function levelShortcut(code, { dev, phase, overlayOpen })
// null si !dev, si phase ∈ {'playing','paused','briefing','investigation'}, si overlayOpen (écran mp-* ou paramètres visibles) ;
// sinon /^(Digit|Numpad)([1-6])$/ sur code.
```
`maps.js` : chaque builder renvoie `groundY` (hauteur du dessus du sol dans la zone d'apparition : 0 par défaut, 0,345 au port, 0,2 sur le tarmac et sur la route du convoi ; vérifier chaque carte). `NPC` accepte `groundY` (défaut 0) et l'utilise pour sa position initiale et pour la chute procédurale (`npc.js:551`, `groundY + 0.2`).

- [ ] **1. Témoin :** `levelShortcut` recopie l'actuel (`code` interprété comme l'ancien `e.key`, sans garde dev ni overlay) : le test `code = 'Digit3'` doit être rouge.
- [ ] **2. Tests :**
  - `shortcuts.test.js` : `('Digit3', dev, 'menu')` donne 3 ; `('Numpad6', …)` donne 6 ; `('Digit3', prod)` donne null ; `('Digit7')` null ; phase `'playing'` null ; `overlayOpen` null.
  - `maps.ground.test.js` : `vi.mock('../src/scene.js', …)` avec une vraie `THREE.Scene` et `setLighting` vide ; pour chaque builder de `MAP_BUILDERS`, construire la carte, lancer un rayon vertical depuis y = 50 au centre de `spawnBounds` et en quelques points intérieurs fixes ; sur les maillages traversés, retenir l'intersection la plus haute dont la normale est verticale et qui appartient à un maillage plus large que 8 m (le sol, pas un accessoire) ; elle doit valoir `groundY` à 0,02 près. Rouge en M3, M4 et M5 avant correction (`groundY` absent vaut 0).
- [ ] **3. Lancer :** ROUGE.
- [ ] **4. Corriger :**
  - `main.js` : gestionnaires clavier en `e.code` (`ShiftLeft`/`ShiftRight`, `Escape`), raccourci via `levelShortcut(e.code, { dev: import.meta.env.DEV, phase: gamePhase, overlayOpen })` ; `window.addEventListener('blur', () => { holdBreathKey = false })`.
  - `maps.js` : `groundY` dans chaque objet renvoyé.
  - `npc.js` : option `groundY`.
  - `main.js` : `groundY` passé aux PNJ (cibles, gardes, civils, victimes libérées) ; plan du tir manqué à `groundY` ; trous de balle à `groundY + 0.035` et condition `shotPos.y < groundY + 1` ; jeeps et passagers du convoi décalés de `groundY` (vérifier visuellement l'assise par capture) ; les passagers **morts** continuent de suivre la jeep (position mise à jour, rotation inchangée).
- [ ] **5. Vérifier :** `npx vitest run` vert ; captures sans interface de M3 et M5 (voir « Vérifications visuelles » plus bas).
- [ ] **6. Commit :** `fix(jeu): raccourci de mission en e.code et réservé au dev, PNJ posés sur le sol de chaque carte, colonel abattu qui suit sa jeep`

---

### Tâche P1 : PvP, chargement des modèles et Electron

**Bugs :**
- `pnjRight` (`pvp.js:625`) renvoie la gauche : la touche D fait aller à gauche.
- `preloadCharacters` remplit chaque pool dans l'ordre d'arrivée des fichiers (`characters.js:67-70`) : deux machines PvP peuvent tirer des modèles différents malgré la graine partagée.
- `net.js:63` émet `disconnected`, que personne n'écoute : la manche continue seule.
- Chemins absolus `/models/…` (`characters.js:27-29, 34, 43-45`) : cassés sous `file://` (Electron), avatar PvP invisible. `base: './'` est déjà en place (`vite.config.js:4`).
- `electron:dev` en syntaxe POSIX (`package.json:9`), icône `public/icon.png` inexistante référencée par `electron/main.js:16` et `package.json` (`build.win.icon`, `nsis.installerIcon`).
- Poids mort livré : `public/models/Soldier.glb` (2,1 Mo, référencé nulle part) et `public/model_check.html` (charge three 0.160 depuis unpkg, référence un GLB absent).

**Fichiers :**
- Créer : `src/pvpMath.js`, `tests/pvp/pvpMath.test.js`, `tests/assets.test.js`, `tests/characters.test.js`
- Modifier : `src/pvp.js`, `src/characters.js`, `src/net.js` (seulement si utile), `electron/main.js`, `package.json` ; supprimer `public/models/Soldier.glb`, `public/model_check.html`

**Interfaces produites :**
```js
// src/pvpMath.js
export function groundForward(yaw)   // THREE.Vector3(sin yaw, 0, cos yaw)
export function groundRight(yaw)     // THREE.Vector3(-cos yaw, 0, sin yaw) = forward × up
```

- [ ] **1. Témoin :** `groundRight` recopie la formule actuelle `(sin(yaw + π/2), 0, cos(yaw + π/2))`.
- [ ] **2. Tests :**
  - `pvpMath.test.js` : pour 8 lacets, `groundRight(y)` vaut `groundForward(y).cross(new THREE.Vector3(0, 1, 0))` à 1e-9 ; à `yaw = π` (départ du contre-tueur, caméra vers -Z), la droite vaut +X.
  - `assets.test.js` : aucun `['"\`]/(models|briefing)/` dans `src/**/*.js` (rouge : 7 occurrences) ; chaque fichier de `public/models/*.glb` est cité dans `src/characters.js` (rouge : `Soldier.glb`).
  - `characters.test.js` : `vi.mock` de `GLTFLoader` dont `loadAsync` résout dans l'ordre inverse (délais décroissants) ; après `preloadCharacters()`, l'ordre de chaque pool suit l'ordre de `MODELS` (rouge aujourd'hui). Exposer au besoin `poolUrls(type)` pour le test.
- [ ] **3. Lancer :** ROUGE.
- [ ] **4. Corriger :**
  - `pvp.js` : `pnjForward`/`pnjRight` délèguent à `src/pvpMath.js` ; `net.on('disconnected', …)` traité comme `peer_left` (même gestionnaire, sans doublon d'appel à `endRound`).
  - `characters.js` : `const MODEL_DIR = import.meta.env.BASE_URL + 'models/'` ; `Promise.all(variants.map(async v => { try { … return entry } catch { return null } }))` puis `filter(Boolean)` ; commentaires faux corrigés (`characters.js:17`, `:20` : `mafia_boss.glb` est une variante des cibles).
  - `electron/main.js` : `const isDev = process.argv.includes('--dev')` ; plus de propriété `icon` (icône par défaut d'Electron tant qu'aucune n'existe). `package.json` : `"electron:dev": "electron . --dev"`, retirer `build.win.icon` et `build.nsis.installerIcon`.
  - Supprimer `public/models/Soldier.glb` et `public/model_check.html` (`git rm`).
- [ ] **5. Vérifier :**
  - `npx vitest run` vert ;
  - `npx vite build` puis vérifier que `dist/assets/index-*.js` ne contient plus `"/models/` ;
  - test de fumée `file://` sans ouvrir de fenêtre : Chrome sans interface avec `--allow-file-access-from-files --enable-logging=stderr --v=0` sur `dist/index.html` ; les journaux doivent montrer les `[characters] chargé:` des 7 modèles et aucun `[characters] échec`. Ne pas lancer `npx electron .` (fenêtre sur le bureau de Rayan).
**Hors périmètre (lot multijoueur) :** démarrage de manche quand les deux intros sont finies (`intro_done`), champ d'adresse du relais.

- [ ] **6. Commits :** `fix(pvp): la touche D va bien à droite, déconnexion du relais traitée, modèles dans un ordre stable` puis `fix(electron): modèles en chemin relatif, lancement dev sous Windows, poids mort retiré`

---

### Tâche P2 : cinématiques (compteur en mode gel, compteur M5, numéro d'Anton dans l'épilogue)

**Bugs :**
- `K.counter` écrit la valeur finale en mode gel (`src/briefing/kit.js:108`, et la copie de la maquette `docs/superpowers/maquettes/cinematiques/kit.js` vers la ligne 205) : une capture gelée à mi-compteur ment (« 12 / 24 » alors que 9 silhouettes sont allumées). En jeu, le compteur avance pendant sa durée.
- M5 : le compteur doit avancer avec les silhouettes qui s'allument (`briefing-m5.html` autour des lignes 357 et 475-476).
- Épilogue : le dernier appel d'Anton s'affiche « NUMÉRO MASQUÉ / INCONNU » (`epilogue.html:763`), alors qu'il appelle depuis le numéro jetable du prologue (`06 39 98 41 07`) et dit ensuite « Ce numéro n'existera plus demain ». **Décision :** l'appel sonne avec `06 39 98 41 07` et `NUMÉRO INCONNU` (comme `prologue-b.html:545`), puis la séquence existante tape « ANTON » et « IDENTITÉ INCONNUE ». La spec `docs/superpowers/specs/2026-10-02-cinematiques-design.md` se contredit (`:61` réserve « NUMÉRO MASQUÉ » au recruteur, `:81` l'attribue au message d'Anton) : corriger `:81` seulement.

**Fichiers :** `src/briefing/kit.js`, `docs/superpowers/maquettes/cinematiques/kit.js`, `briefing-m5.html`, `epilogue.html`, `src/briefing/scenes/m5.js` et `epilogue.js` (régénérés), spec `:81`, `tests/briefing/kit.test.js`, `tests/briefing/scenes.test.js`

- [ ] **1. Tests (rouges aujourd'hui) :**
  - `kit.test.js` : un compteur de 0 à 12 sur 1 000 ms, démarré à t = 0, scène gelée à 500 ms : le texte vaut 6 (à 1 près) ; gelé à 1 500 ms : 12.
  - `scenes.test.js` : la scène `epilogue` (deux variantes) ne contient pas « NUMÉRO MASQUÉ » et contient `06 39 98 41 07` ; « NUMÉRO MASQUÉ » n'apparaît que dans `prologue-a` et dans l'écoute de M6 (vérifier où il existe aujourd'hui avant d'écrire l'assertion).
  - M5 : en mode gel à l'instant où la 9ᵉ silhouette s'allume, le compteur affiche la valeur correspondante (définir la correspondance dans la maquette, par exemple un pas du compteur par silhouette).
- [ ] **2. Corriger** les deux `kit.js` (calcul de la valeur au temps gelé), les maquettes, puis `node scripts/port-maquette.mjs` pour régénérer `m5` et `epilogue`.
- [ ] **3. Vérifier :** `npx vitest run` vert (dont `port-maquette.test.js`, fidélité). Captures : `node scripts/shots.mjs m5 <ms>` et `node scripts/shots.mjs epilogue <ms>` aux instants concernés (serveur 5173 déjà lancé dans le dépôt principal : dans le worktree, lancer son propre `npx vite --port 5174 --strictPort` en tâche de fond et passer `BASE_URL=http://localhost:5174/`), et `MAQUETTE=1` pour la maquette (port 5193 servi depuis le dépôt principal, donc lancer aussi la sienne sur 5194). Regarder les images.
- [ ] **4. Commit :** `fix(cinematiques): compteurs justes en mode gel, compteur de M5 au rythme des silhouettes, Anton rappelle depuis son numéro jetable`

---

### Tâche P3 : enquête (double-clic sur le téléphone, accès réel au téléphone, budget gardé)

**Bugs :**
- Sur la fiche du téléphone, `act()` passe directement à `finish('listened')` (`investigation.js:272-276`) sans délai de garde : un double-clic sur le téléphone ouvre la fiche **et** écoute le message, ce qui termine l'enquête par accident.
- `tests/prologue/apartment.test.js:95-99` valide le point d'accès du téléphone (5,4 ; 6,3) en ne testant que le **centre** du joueur (`inside`, ligne 8) ; avec son emprise de 0,28 m (`fpsController.js:37`, carré de demi-côté r), ce point chevauche la boîte du battant ouvert. Le passage entre console et battant est de 0,43 m pour 0,56 m d'emprise : fermé.
- Le budget de l'enquête (`REPRISE.md:30` : 44 appels, 16 500 triangles) n'est gardé par aucun test (seuils 60 et 50 000 ; `stats()` mesure 47 maillages et 16 550 triangles).

**Décision :** on ne change pas la règle « la fiche du téléphone ne sort que par ÉCOUTER » (question posée à Rayan à part) ; on corrige seulement l'écoute accidentelle et les tests qui mentent.

**Fichiers :** `src/prologue/investigation.js`, `src/prologue/apartment.js` (ancre du téléphone), `tests/prologue/investigation.test.js`, `tests/prologue/apartment.test.js`

- [ ] **1. Tests (rouges aujourd'hui) :**
  - `investigation.test.js` : deux `act()` à 150 ms d'écart sur le téléphone (déverrouillé) laissent la fiche ouverte et ne terminent pas l'enquête ; un `act()` après 700 ms écoute bien le message.
  - `apartment.test.js` : l'aide `inside` est remplacée par un test d'emprise (boîte du joueur élargie de r = 0,28 contre chaque boîte de collision) ; chaque ancre d'indice doit avoir un point atteignable à moins de 1,5 m **avec l'emprise**, et ce point doit être relié à l'entrée par un chemin libre (utiliser `walk` ou `moveCircle` du contrôleur depuis la porte d'entrée). Rouge sur l'ancre actuelle du téléphone.
  - Budget : `stats()` donne au plus 47 maillages et au plus 16 600 triangles (valeurs mesurées : toute hausse doit être un choix assumé et ce test mis à jour en même temps que `REPRISE.md`).
- [ ] **2. Corriger :** délai de garde de 600 ms entre l'ouverture de la fiche du téléphone et l'écoute (horodatage à l'ouverture, `act()` ignoré avant) ; ancre du téléphone déplacée vers un point atteignable du milieu de l'entrée, sans changer le décor ni les photos (vérifier que la photo de la fiche du téléphone reste cadrée : capture `?enquete=1&ouvrir=telephone` ou l'id réel).
- [ ] **3. Vérifier :** `npx vitest run` vert ; capture sans interface de la fiche téléphone et vue depuis la nouvelle ancre (`?enquete=1&cam=…`).
- [ ] **4. Commit :** `fix(enquete): plus d'écoute du message au double-clic, ancre du téléphone vraiment atteignable, budget gardé par un test`

---

### Tâche Z1 : textes visibles sans tiret cadratin

Après fusion de P1 à P3 dans `lot0-corrections`.

- [ ] Recenser les tirets cadratins des **textes visibles par le joueur** : `src/*.js`, `src/prologue/*.js`, `src/briefing/index.js`, `src/briefing/kit.js`, `index.html` (pas les commentaires, pas `src/briefing/scenes/*` ni les maquettes : les répliques seront figées au lot voix). Les remplacer par deux-points, virgule ou point médian selon le contexte (« ⚠ ALERTE : restez caché », « JOURNAL DE VIKTOR », « P.S. Je les ai vus courir… »).
- [ ] Test garde-fou `tests/texts.test.js` : aucune chaîne JS littérale (hors commentaires) ni texte HTML visible de ces fichiers ne contient U+2014. Rouge avant le remplacement.
- [ ] Journal de Viktor, M3 : la note de bas de page dépend du choix ; si les victimes sont libérées, la note actuelle ; sinon une note sobre, par exemple « P.S. Le conteneur rouge est resté fermé. Je l'entends encore. » (accord avec `epilogue.html`, variante `enfermes`).
- [ ] Commit : `fix(jeu): textes du jeu sans tiret cadratin, journal du port selon le choix`

### Tâche Z2 : REPRISE.md exact

- [ ] Mettre à jour `docs/superpowers/REPRISE.md` : état réel après le lot 0 (nombre de tests), corrections listées dans `synthese.md` §2 (kill-cam existante, `mafia_boss` dans le pool des cibles, `dispose` présent dans l'enquête, aucun `manualChunks`, porte fermée, Node 22.16 suffisant avec avertissement), **suppression de la consigne `Co-Authored-By`** (remplacée par : aucun trailer, aucune attribution Claude), `launch.json` inchangé et cache séparé des maquettes, décisions en attente et nouvel ordre des lots (voir `synthese.md` §4). Aucun tiret cadratin ajouté.
- [ ] Commit : `docs: REPRISE.md à jour après le lot 0`

---

## Vérifications visuelles (captures sans interface)

Le volet du navigateur intégré peut être masqué : `requestAnimationFrame` y tourne alors à 0 image/s. Toujours vérifier le rendu par Chrome sans interface :
```bash
P=$(mktemp -d); "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --hide-scrollbars --mute-audio --user-data-dir="$P" --window-size=1280,720 --virtual-time-budget=12000 --screenshot="C:/chemin/absolu/shots/x.png" "http://localhost:5173/?…"; rm -rf "$P"
```
Les fichiers vont dans `shots/` (ignoré par git). Pour une mission, une route de dev `?mission=n` (sous `import.meta.env.DEV`) peut être ajoutée en A4 si elle manque, sur le modèle de `?cine=`.

## Critères de fin du lot

- Chaque tâche : test vu rouge puis vert (ou explication écrite de la mutation qui le ferait rougir), relecture conformité et qualité approuvée.
- `npx vitest run` entièrement vert sur `lot0-corrections` après fusion ; `npx vite build` sans erreur.
- Relecture finale de toute la branche, puis fusion en avance rapide dans `main` et push.
