# Lot 1 : socle technique (plan d'exécution)

> **Pour les agents :** exécuter tâche par tâche, en TDD (superpowers:test-driven-development), chaque tâche relue avant la suivante. Cases `- [ ]` pour le suivi.

**But :** mesurer ce que coûte chaque image, ne plus rien laisser fuir en mémoire GPU, proposer des réglages graphiques Auto, Bas, Moyen et Haut, attendre les modèles avant de jouer, et atténuer les effets sur demande.

**Spec :** `docs/superpowers/specs/2026-10-07-lot1-socle-technique-design.md` (elle fait foi : la lire en entier avant toute tâche). Inventaire des fuites et numéros de ligne : `.superpowers/sdd/2026-10-07-reprise/audit/rapport-legerete.md` (mesuré sur `28e5dcb`, avant le lot 0 : revérifier chaque ligne).

**Architecture :** modules purs dans `src/gfx/` (`dispose.js`, `quality.js`, `stats.js` pour sa partie calcul) testés sous jsdom ; `main.js` gagne `mountLevel(n)` et `unmountLevel()`, utilisées par le jeu et par la route `?memtest=1` ; un script `scripts/memtest.mjs` mesure les vrais compteurs du renderer dans Chrome sans interface.

**Pile :** Three.js 0.185 (r185), Vite 8, Vitest 5 (jsdom), Windows + Git Bash.

## Contraintes globales

- Toutes celles du lot 0 (`docs/superpowers/plans/2026-10-07-lot0-corrections.md`, section « Contraintes globales ») s'appliquent : témoin rouge, `e.code`, scènes générées jamais éditées à la main, commits en français sans trailer `Co-Authored-By` ni attribution, aucun tiret cadratin neuf.
- Chrome sans interface : profil jetable, **jamais de port de débogage fixe** (`--remote-debugging-port=0` si besoin du protocole, port lu dans `DevToolsActivePort`), fermer tous les processus lancés, supprimer les profils.
- Le port 5173 est servi par un Vite lancé depuis le dépôt : le réutiliser, ne pas le lancer ni l'arrêter.
- Une ressource marquée partagée (`userData.shared`) n'est **jamais** libérée.

---

### Tâche L1 : mesure et référence (avant toute correction)

**Fichiers :** créer `src/gfx/stats.js`, `tests/gfx/stats.test.js`, `scripts/memtest.mjs`, `docs/superpowers/specs/annexes/2026-10-07-memtest-reference.json`, `docs/superpowers/specs/annexes/README.md` ; modifier `src/main.js`, `index.html`.

**Interfaces produites :**
```js
// src/gfx/stats.js
export function frameStats(samplesMs)   // { fps, p50, p95 } ; fps = 1000 / moyenne ; tableau vide : { fps: 0, p50: 0, p95: 0 }
export function createStatsPanel({ renderer, parent })   // { update(dtMs), show(), hide(), visible } ; ne fait rien de coûteux si masqué
// src/main.js
function mountLevel(n)    // ce que fait startLevel aujourd'hui pour la scène (carte, PNJ, cadenas, convoi, caméra), sans DOM de menu
function unmountLevel()   // ce que fait clearEntities aujourd'hui (et, après L2, la libération)
```
- [ ] Tests purs de `frameStats` (moyenne, p50, p95 sur des séquences connues, tableau vide), rouges avant écriture.
- [ ] Panneau : affiché par `?stats=1` dans toutes les phases (campagne, menu, PvP ; l'enquête garde son propre compteur, ne pas l'afficher en double) ; mise à jour au plus 4 fois par seconde.
- [ ] Extraire `mountLevel` / `unmountLevel` de `startLevel` / `clearEntities` sans changer le comportement (les 296+ tests restent verts ; capture d'une mission identique avant et après).
- [ ] Route `?memtest=1` (dev seulement) : étapes du §4.1 de la spec, JSON dans `<pre id="memtest">` (une entrée par étape : `{ etape, geometries, textures, programmes, appels, triangles, tasMo }`), `document.title = 'memtest:fini'` à la fin. Les arènes PvP sont montées hors réseau avec les fonctions de `pvpMap.js` et la foule de `pvp.js` (exporter ce qu'il faut, sans changer le jeu).
- [ ] `scripts/memtest.mjs` : Chrome sans interface sur `http://localhost:5173/?memtest=1`, `--dump-dom`, `--virtual-time-budget` suffisant, lecture du `<pre>`, écriture `shots/memtest-<horodatage>.json`, option `--reference` qui copie le résultat dans l'annexe, option `--check` qui applique les seuils du §6 de la spec et sort en code 1 si dépassement.
- [ ] Lancer `node scripts/memtest.mjs --reference` **sur le code actuel** et commiter l'annexe : c'est la référence d'avant correction. Le README des annexes explique la commande.
- [ ] Commit : `feat(mesure): panneau de performances, route memtest et référence mémoire d'avant correction`

### Tâche L2 : libération (cartes, effets, impacts, cadenas, jeeps, menu)

**Fichiers :** créer `src/gfx/dispose.js`, `tests/gfx/dispose.test.js`, `tests/gfx/fakeRenderer.js`, `tests/gfx/maps.dispose.test.js` ; modifier `src/maps.js`, `src/effects.js`, `src/main.js`.

**Interfaces produites :**
```js
// src/gfx/dispose.js
export function markShared(root)
export function isShared(resource)
export function disposeObject(root)   // { geometries, materials, textures, skeletons } libérés ; idempotent
```
- [ ] `dispose.test.js` : arbre synthétique (maillages, groupe, matériau avec `map` et `normalMap`, ressource marquée partagée, `SkinnedMesh` avec squelette et `computeBoneTexture()`, lumière avec ombre) ; chaque ressource possédée émet `dispose` une fois, aucune partagée n'en émet, deux appels de suite n'en émettent pas plus. Témoin : une version qui ne fait que `parent.remove(root)` est rouge.
- [ ] `fakeRenderer.js` : `render(scene)` compte les géométries vues (+1 par nouvel id, −1 au `dispose`) et les textures d'os créées ; `info()` renvoie les compteurs.
- [ ] `maps.dispose.test.js` (`vi.mock` de `scene.js`) : rue, puis les 6 cartes, puis la rue ; après chaque `clear`, le faux renderer revient à la référence de la rue (Δ = 0). Rouge sur le code actuel.
- [ ] `maps.js` `clear()` libère `mapObjects` et la pluie ; `effects.js` : géométrie de particule et matériaux par couleur partagés, un matériau d'opacité par impact libéré en fin de vie, géométrie du traceur libérée ; trous d'impact à géométrie et matériau uniques ; cadenas et jeeps libérés ; `showMenu` libère la carte et reconstruit la rue. Tests sur les effets avec le faux renderer (100 tirs touchés puis fin de vie : Δ = 0).
- [ ] Commit : `fix(memoire): les cartes, les effets de tir, le cadenas et les jeeps libèrent leurs ressources, la rue revient au menu`

### Tâche L3 : PNJ, modèles, PvP et audio

**Fichiers :** modifier `src/characters.js`, `src/npc.js`, `src/pvp.js`, `src/pvpMap.js`, `src/audio.js`, `src/main.js` ; tests `tests/gfx/npc.dispose.test.js`, `tests/gfx/pvp.dispose.test.js`, `tests/audio.test.js`.

- [ ] `characters.js` : `markShared(gltf.scene)` au chargement ; pas de clone de matériau pour la teinte `0xffffff` ; sphère englobante d'instance (§4.3 de la spec) et `frustumCulled = true` ; test de la sphère (pose de repos et image la plus étendue du clip de marche échantillonnée, marge comprise) avec un `SkinnedMesh` synthétique.
- [ ] `NPC.dispose()` : `mixer.stopAllAction()`, `mixer.uncacheRoot`, `disposeObject(this.mesh)` ; retrait du corps à 8 s géré par une durée dans `update` (plus de `setTimeout`), qui appelle `dispose`. Tests : 100 % des ressources possédées libérées (matériaux clonés, squelettes, marqueurs, téléphone), 0 ressource partagée (géométries et textures du GLB simulé) ; Δ = 0 au faux renderer après 10 montages de M6 simulés (foule de 27 PNJ).
- [ ] PvP : `clearPvpMap` libère l'arène, la foule passe par `NPC.dispose`, avatars, laser et pistolet par `disposeObject` en fin de manche et en quittant ; test au faux renderer sur 5 arènes.
- [ ] Audio : `stopMissionAmbience` débranche le gain à la fin du fondu (test avec un faux `AudioContext` horodaté) ; le PvP utilise `audioContext()` et `masterNode()` (plus de second contexte) : test qui vérifie qu'aucun `new AudioContext` n'est appelé par `pvp.js` (ou garde sur la source).
- [ ] Commit : `fix(memoire): PNJ, foule PvP et arène libérés sans toucher aux modèles partagés, un seul contexte audio`

### Tâche L4 : réglages graphiques

**Fichiers :** créer `src/gfx/quality.js`, `tests/gfx/quality.test.js`, `tests/settings.test.js` ; modifier `src/settings.js`, `src/scene.js`, `src/characters.js` ou `src/npc.js` (ombre des personnages), `src/main.js`, `index.html`.

**Interfaces produites :**
```js
// src/gfx/quality.js
export const PRESETS = ['auto', 'bas', 'moyen', 'haut']
export function presetFor(name, dpr)                 // { pixelRatio, shadowSize, shadowType: 'pcf' | 'pcfsoft', npcShadows: 'aucun' | 'cibles-gardes' | 'tous', dynamic: bool }
export function createResolutionController({ min, max, step, highMs, lowMs })   // { push(frameMs, nowMs) -> scale }
// src/settings.js : graphics, showStats, reducedMotion (+ migration)
```
- [ ] Tests purs : table du §4.3 de la spec pour dpr 1 et 2 ; contrôleur : baisse quand la p95 sur 2 s dépasse 22 ms, remonte sous 14 ms tenus 4 s, pas de 0,05, bornes 0,7 et 1, au plus un changement par seconde, aucune oscillation sur une séquence alternée ; migration d'une sauvegarde sans les nouveaux champs.
- [ ] Application : `applyQuality()` (densité de pixels, taille et type d'ombre avec recréation de la carte d'ombre, ombre des personnages selon leur rôle) appelée au démarrage, au changement de réglage et à chaque montage de mission ; Auto pilote l'échelle de résolution en mission seulement.
- [ ] Paramètres : section « Affichage » (Qualité, Afficher les performances, Effets atténués, Plein écran) dans le style existant ; le panneau de L1 suit `showStats`.
- [ ] Mesure : `node scripts/memtest.mjs` relève les triangles de M6 en Bas et en Moyen (le memtest accepte `&qualite=bas`) ; consigner.
- [ ] Commit : `feat(reglages): qualité Auto, Bas, Moyen et Haut, résolution dynamique, personnages écartés hors champ`

### Tâche L5 : chargement des modèles et contexte perdu

**Fichiers :** modifier `src/characters.js`, `src/main.js`, `src/pvp.js`, `index.html` ; créer `src/campaign/loading.js`, `tests/campaign/loading.test.js`.

- [ ] `charactersReady()` et `charactersProgress()` ; `waitForCharacters({ ready, progress, show, hide, timeoutMs })` (pur, dans `loading.js`) qui affiche l'écran seulement si l'attente dépasse 150 ms, le cache à la fin, et abandonne l'attente à 20 s. Tests avec horloge factice : modèles déjà prêts, aucun écran ; chargement long, écran puis disparition ; échec, on part quand même ; 20 s, on part. Témoin : le lancement actuel n'attend rien.
- [ ] `launchLevel` et le départ de manche PvP passent par `waitForCharacters`. Écran « PRÉPARATION DU DOSSIER · n % » dans le style des cartes de l'enquête.
- [ ] `webglcontextlost` / `webglcontextrestored` (§4.4 de la spec).
- [ ] Commit : `feat(chargement): les modèles sont attendus avant une mission ou une manche, contexte WebGL perdu rattrapé`

### Tâche L6 : effets atténués et plein écran

**Fichiers :** créer `src/comfort.js`, `tests/comfort.test.js` ; modifier `src/main.js` (flash), `src/briefing/index.js` et `src/briefing/kit.js` (option `reducedMotion`), `src/settings.js`, `index.html`.

- [ ] `reducedMotionActive(setting, mediaMatches)` pur (Auto suit le système, Oui et Non forcent) ; tests.
- [ ] Flash du tir à 0,06 quand actif ; `playCinematic(id, { reducedMotion })` : `K.shake` sans effet, `K.glitch` à un tiers d'intensité, pas de glitch d'ambiance ; tests sur le kit (appels comptés) et sur `playCinematic`.
- [ ] Plein écran : bouton des Paramètres, libellé à jour sur `fullscreenchange` ; test du libellé avec un faux `document.fullscreenElement`.
- [ ] Commit : `feat(confort): effets atténués selon le système ou le réglage, plein écran`

### Tâche L7 : précompilation pendant le briefing

**Fichiers :** modifier `src/main.js` ; test d'enchaînement extrait si possible (`src/campaign/prepare.js`).

- [ ] Quand un briefing se joue, `mountLevel` est appelée pendant la cinématique, puis `renderer.compile(scene, camera)` ; `startLevel` réutilise ce montage ; si la cinématique finit avant la fin du montage, on attend. Sans briefing, inchangé. La scène montée n'apparaît jamais sous la cinématique.
- [ ] Mesure : durée de la première image de mission dans le memtest (étape dédiée), avant et après ; consigner.
- [ ] Commit : `perf(jeu): la mission se monte et ses shaders se compilent pendant le briefing`

### Tâche L8 : mesure finale et captures

- [ ] `node scripts/memtest.mjs --check` : tous les seuils du §6 de la spec tenus ; résultat commité dans les annexes (`2026-10-07-memtest-apres-lot1.json`) avec un résumé chiffré avant / après dans le README des annexes.
- [ ] Captures sans interface de M1, M3, M5, M6 (Moyen) et d'une cinématique, comparées à celles d'avant le lot (même vue) : aucune régression visible (personnages présents, textures intactes, ombres présentes en Moyen).
- [ ] Commit : `docs(mesure): mémoire et triangles après le lot 1`

## Critères de fin du lot

Ceux du §6 de la spec, plus : chaque tâche vue rouge puis verte et relue, relecture finale de toute la branche, fusion en avance rapide dans `main`, push.
