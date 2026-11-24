# Cinématiques v2 : plus riches, même montage (plan d'exécution)

> Rangé dans le dépôt le 28 octobre 2026. Les autres documents de conception cités par leur seul nom (`feuille-de-route.md`, `kill-cams-design.md`, `poids-design.md`, etc.) sont dans `C:/Users/shark/Sniper-Game-reprise/.superpowers/sdd/2026-10-28-conceptions/` (hors dépôt), comme le journal `.superpowers/sdd/2026-10-07-reprise/progress.md`.

> **Pour les agents :** exécuter tâche par tâche, en TDD (superpowers:test-driven-development), chaque tâche relue (conformité, puis qualité) avant la suivante. Cases `- [ ]` pour le suivi.

**Spec :** `docs/superpowers/specs/2026-10-28-cinematiques-v2-design.md` (elle fait foi : la lire en entier avant toute tâche ; §4 = décisions de Rayan, à relire au début de chaque tâche : une décision tranchée autrement change la tâche). Numéros de ligne de l'instantané `main` 3cd328d : revérifier chaque ligne avant de toucher un fichier. Les tâches faites ont décalé ceux des fichiers qu'elles ont touchés (C2 : `kit.js`, `kit.css`, `MQ/kit.js`, `MQ/kit.css`, `src/briefing/index.js`, `tests/briefing/scenes.test.js` ; C4 : les deux `kit.css` et les maquettes PA, PB, EP, M2, M3, M4, M6, par leurs règles jumelles atténuées, et les deux `kit.js`, par l'onde de l'écoute en effets atténués ; C5 : les deux `kit.css` et les maquettes PA, PB, M3 et EP, par la pluie, les bandes et les rayons passés en `transform` ou sur un conteneur) : y chercher par sélecteur, par nom de test ou par bloc commun (`anim`, `matières`, `atténué`, `gel`).

**But :** chaque cinématique gagne une audace et une couche de détails (lumière, matière, cartes, documents), avec la même durée au ms, les mêmes répliques et les mêmes repères ; rien de payant, aucune image neuve, effets atténués complets, coût mesuré.

**Architecture :** on édite les maquettes `docs/superpowers/maquettes/cinematiques/*.html`, puis `node scripts/port-maquette.mjs` régénère `src/briefing/scenes/*.js`. Le moteur ne change que par des outils communs ajoutés à l'identique dans `src/briefing/kit.js`/`kit.css` et `docs/superpowers/maquettes/cinematiques/kit.js`/`kit.css` (blocs `// ── commun : … ──`). Gardes en tests sous jsdom ; rendu mesuré dans Chrome. **Aucune modification de `src/main.js`** (lot 3 en cours dessus).

## Contraintes globales

- Celles des lots 0 à 2 (plans `2026-10-07-lot0-corrections.md`, `2026-10-07-lot1-socle-technique.md`, `2026-10-09-lot2-le-tir.md`) : témoin rouge pour tout test de comportement (une fonction absente ne compte pas), `e.code` seulement, scènes `src/briefing/scenes/*.js` jamais éditées à la main, commits en français sans trailer ni attribution, auteur `Rayan Madi <madirayan75015@gmail.com>`, **aucun tiret cadratin** (maquettes, textes, specs, commits), effets atténués respectés, rien de payant, voix en bips.
- **Copie de travail** `C:\Users\shark\Sniper-Game-cine`, branche `cine-v2` (créée depuis `main` 3cd328d, `progress.md:107`). Serveurs propres à la copie : jeu `npx vite --port 5186 --strictPort`, maquettes `npx vite docs/superpowers/maquettes/cinematiques --port 5196 --strictPort` (vérifier d'abord que les ports sont libres ; jamais 5173, 5175, 5180, 5193). `BASE_URL=http://localhost:5186/` pour `scripts/shots.mjs`, `BASE_URL=http://localhost:5196/` avec `MAQUETTE=1`.
- **Machine partagée** : `npx vitest run --maxWorkers=2` ; un seul Chrome sans interface à la fois **sur toute la machine** (verrou `C:\Users\shark\Sniper-Game-reprise\.superpowers\sdd\chrome.verrou`, créé avant, retiré après, même en échec ; attendre s'il existe : `feuille-de-route.md` §2.1), jamais de port de débogage fixe (`--remote-debugging-port=0`, port relu dans `DevToolsActivePort`), `--user-data-dir` jetable ; aucune mesure de rendu pendant un memtest, une autre capture ou une partie de Rayan.
- **Captures v1 contre v2** (C6 et suivantes, C17) : les deux versions capturées dans la même séance, comme en C5 ; jamais une capture stockée d'une autre date prise pour référence (une mise à jour de Chrome décale toute l'image d'une fraction de pixel : spec §1, « Gel des captures », relecture de C5).
- Règles de fabrication de la spec §3.3 (transform et opacité seulement, aucun `setInterval`, aucun `element.animate`, aucune SMIL, `K.graine` pour tout tirage neuf, préfixes, `stateClasses`, aucune classe `fc`, aucune image ni son neuf).
- **Fichiers interdits** : `src/main.js`, `src/shot/**`, `src/campaign/**`, `src/maps*`, `package.json` et son verrou ; `MQ/briefing-m5.html` et `MQ/briefing-m5b.html` jusqu'à la fusion du chantier du bar (`m5-bar-design.md:621`). `docs/superpowers/REPRISE.md` touché une seule fois, en C17.
- Après toute retouche d'une maquette : `node scripts/port-maquette.mjs`, puis `tests/scripts/port-maquette.test.js` vert.
- **Faux « M » des scènes** : la copie est en `core.autocrlf=true`, le port écrit les scènes en LF et git les sort en CRLF. Une scène régénérée identique au commit peut donc rester marquée « M » dans `git status` alors que `git diff` est vide (vu à la relecture du socle sur `epilogue.js`, `m3.js` et `prologue-a.js`, après une sortie git). Ce n'est pas une scène périmée : si `git diff --quiet -- src/briefing/scenes/` rend 0, `git checkout --` de ces fichiers rend la copie propre. Une ligne `src/briefing/scenes/*.js text eol=lf` dans `.gitattributes` réglerait la cause : à décider en C17.

## Dépendances et copies de travail

| Groupe | Tâches | Où | Peut commencer |
|---|---|---|---|
| **G1, tout de suite** | C0 à C5 (socle), puis C6 à C15 (scènes, sauf M5) | `Sniper-Game-cine`, branche `cine-v2` | maintenant : aucune ne touche un fichier du lot 3 (le socle 3a, `2026-10-15-lot3a-socle.md`, ne touche ni maquettes, ni kit, ni `src/briefing/`) |
| G2, après la fusion du bar de M5 dans `main` | C16 (M5 : briefing I et briefing II) | `cine-v2` rebasée sur `main` | quand `m5-bar` est fusionnée ; c'est elle qui possède `briefing-m5.html` et `briefing-m5b.html` |
| G3, vérification contre le lot 3 | dans C17 : libellés « ZÉRO n m » contre le télémètre (tâche A4 du lot 3), poste de M1 (3b), portiques et coupe de M3, frise et cercles de M4 (3c) | `cine-v2` rebasée sur `main` | après la fusion de A4 pour les libellés ; après 3b et 3c pour les dessins. Si C17 arrive avant, ces points restent notés dans `REPRISE.md` et se vérifient à la fusion de 3b et 3c |
| G4 | relecture finale, fusion | `cine-v2` | après C17 |
| **Fusion intermédiaire (intégrateur)** | C0 à C5 | `cine-v2`, relue puis fusionnée en avance rapide dans `main` | dès C5 relue et `node scripts/poids.mjs --check --avec-enquete` vert (D1 = A, spec §3.9 critère 5) : la kill-cam (K7, K8) et le bar (B14, B15) écrivent ensuite leurs maquettes sous G4 à G6 et avec `K.anim`, `K.graine`, `.k-encre` ; E0 du lot 5 étend `poids.mjs`. `REPRISE.md` n'est pas touché à cette fusion (seulement en C17) |

- **Ordre dans G1** : C0, C1 et C2 d'abord (C0 indépendante ; C1 avant toute retouche de maquette) ; C3 avant C5 (mesure v1 avant hygiène) ; C4 avant les scènes. Puis C6 à C15 dans l'ordre de la décision D5 (reco : prologue A, prologue B, épilogue, M1, M4, M3, M2, M6 : d'abord la campagne de bout en bout que Rayan revoit en premier).
- **Pistes parallèles possibles** une fois C0 à C5 faits (sous-agents distincts, maquettes disjointes, une seule régénération à la fois : le port réécrit les 9 scènes) : piste 1, prologues et épilogue ; piste 2, M1 à M3 ; piste 3, M4 et M6. Les captures et mesures restent en série (un seul Chrome).
- **Fusion intermédiaire, état au 24 novembre 2026** (relecture du socle) : `main` a reçu la fumée E1 du lot 5 (6caa4c8) depuis 3cd328d ; l'avance rapide demande donc d'abord un rebase de `cine-v2` sur `main`, ou `main` fusionnée dans `cine-v2` (feuille-de-route §3). Seul conflit (`git merge-tree --write-tree main cine-v2`) : `docs/superpowers/specs/annexes/README.md`, où les deux branches ajoutent une section à la fin. On garde les deux : « Lot 5 : fumée du livrable Electron (tâche E1) » d'abord (ordre de `main`), puis « Cinématiques v2 : coût de rendu », sous-section « Hygiène de rendu, tâche C5 » comprise. Ensuite, par le verrou des tests : suite complète, `npx vite build`, `node scripts/poids.mjs --check --avec-enquete`. Le lot 3 (`lot3-socle`, « Lot 3 : sonde de lisibilité ») ajoute lui aussi une section à la fin de ce README : même résolution le moment venu.
- **Le lot 3 n'attend rien de ce chantier.** Le lot 4 (kill-cams) peut reprendre les outils communs (`K.anim`, encre, papier) après la fusion.
- **WebP** : un seul propriétaire, **C0** (intégrateur : la tâche K9 du lot 4 est retirée, le lot 5 ne convertit aucune image). `scripts/poids.mjs` : **C0 le crée**, la tâche E0 du lot 5 l'étendra sans changer ses options.

---

### Tâche C0 : poids, WebP des portraits (selon D1)

**Fichiers :** créer `scripts/webp.mjs`, `scripts/poids.mjs`, `tests/scripts/poids.test.js` ; modifier `scripts/port-maquette.mjs` (choix de l'extension), `tests/scripts/port-maquette.test.js` ; remplacer les six `public/briefing/img/portrait-*.png` de 360 × 450 par des `.webp`.
- [ ] `port-maquette.mjs:52` : l'extension servie est `webp` si `public/briefing/img/<nom>.webp` existe, sinon `jpg`, sinon `png` ; les maquettes gardent leurs `img/<nom>.png` (serveur des maquettes). Test (témoin rouge : aujourd'hui `png` pour un nom qui a un `.webp`).
- [ ] `scripts/webp.mjs` : conversion par Chrome sans interface (page temporaire qui dessine le PNG dans un canevas, `toBlob('image/webp', q)`, base64 lu par `--dump-dom`), aucune dépendance neuve. Transparence gardée (vérifiée : un pixel du fond détouré a un alpha de 0). Qualité `q` réglée pour **≤ 350 ko les six** (objectif du lot 4, `kill-cams-design.md` §5), en partant de 0,82.
- [ ] `scripts/poids.mjs [--check] [--avec-enquete]` après `npx vite build` : somme de `public/briefing/img`, des chunks des scènes (et de l'enquête selon D1) dans `dist/assets` ; seuil 1 500 000 octets ; partie pure testée (sommes et seuil sur une liste de fichiers factice ; témoin : un seuil franchi d'un octet rend un échec). **Options et seuil gelés** : la tâche E0 du lot 5 étendra ce script (build en mémoire, JS de démarrage, `scripts/budgets.js`) sans les changer ; la partie pure s'exporte (`export function sommePoids(fichiers, { seuil })`) pour qu'E0 la reprenne.
- [ ] Coordination A7 (lot 3) : avant le commit, regarder si `main` contient déjà la fiche HUD d'A7. Si oui, mettre à jour sa fonction unique de portrait vers `.webp` ; sinon, noter dans `progress.md` qu'A7 devra le faire au rebase (son test d'existence du fichier rougira). **État à la relecture du socle (24 novembre 2026)** : `main` (6caa4c8) n'a pas la fiche d'A7, en cours dans `lot3-socle`, où `src/campaign/portraits.js` déclare encore `'png'` pour six portraits. Au rebase d'A7 sur `main` après la fusion du socle, `FORMATS` de ce fichier passe à `'webp'` pour `gangster-man-01`, `freres-a`, `freres-b`, `mafia-woman-02`, `mafia-henchman` et `mafia-woman-01` ; `passeur-cam` et `seconde-cam` restent en `'jpg'` ; rien d'autre ne change (témoin : « chaque portrait existe dans public/ » de `tests/campaign/fiche.test.js`, rouge au rebase). La note de `progress.md`, hors de cette copie, revient à l'intégrateur.
- [ ] Tests : `scenes.test.js`, `ids.test.js`, `port-maquette.test.js` verts ; scènes régénérées (seuls les chemins d'images changent).
- [ ] Vérification réelle : `npx vite build`, puis `node scripts/poids.mjs --check` (chiffre noté avant et après la conversion) ; captures du jeu `?cine=m2&freeze=5200`, `?cine=m4&freeze=13500` et `?cine=m3&freeze=6500` avant et après, regardées : portraits identiques à l'œil, bords détourés propres.
- [ ] Commit : `perf(cinematiques): portraits en WebP, poids des cinématiques mesuré par un script`

### Tâche C1 : gardes du montage (durées, répliques, chronologie)

**Fichiers :** créer `tests/briefing/montage.test.js`, `tests/briefing/references/repliques-v1.json`, `tests/briefing/references/chronologie-v1.json`.
- [ ] Lecture de `cfg.beats` : la scène est montée comme dans `playCinematic` (style, `#st`, vrai `createKit`), `K.run` intercepté avant `mod.start(K, { search })`. Durée calculée par la formule du séquenceur (`kit.js:198-207`) ; G1 compare au tableau de la spec §1 (**9 cas : m5 exclu** jusqu'à C16, comme l'exception `m5` de G6, parce que le bar réécrit sa maquette ; variantes de l'épilogue comprises) au ms ; puis lecture réelle sous faux minuteurs (ceux de `scenes.test.js:6`) : `onDone` à cette durée ± 16 ms.
- [ ] G2 : `[who, say]` par scène et variante contre `repliques-v1.json`.
- [ ] G3 : lecture complète, `MutationObserver` sur l'attribut `class` des éléments à `id` ; événements `[t, id, ±classe]`, habillage du kit ignoré (ids `k-*`, classes `gl`, `shake`) ; la v2 contient chaque événement de la v1 au même `t`. Les deux références s'écrivent depuis la v1 par `ECRIRE_REFERENCES=1 npx vitest run tests/briefing/montage.test.js` (une seule fois, ici ; ensuite, toute réécriture demande une décision écrite dans la spec).
- [ ] Témoins rouges, vus puis annulés (sans commit) : un `min` modifié dans `MQ/briefing-m1.html` (G1 rouge), une réplique retouchée d'un caractère (G2), un repère de `MQ/briefing-m4.html` décalé de 100 ms (G3).
- [ ] Durée de la suite notée (G3 joue les 10 cas : rester sous 30 s ; sinon pas de 50 ms au lieu de chaque mutation).
- [ ] Commit : `test(cinematiques): durées, répliques et repères de la v1 gardés avant tout enrichissement`

### Tâche C2 : outils communs (atténué des maquettes, `K.anim`, `K.graine`, matières, sonde)

**Fichiers :** modifier `src/briefing/kit.js`, `src/briefing/kit.css`, `src/briefing/index.js`, `docs/superpowers/maquettes/cinematiques/kit.js`, `docs/superpowers/maquettes/cinematiques/kit.css` ; créer `tests/briefing/kit-commun.test.js` ; étendre `tests/briefing/kit.test.js`, `tests/briefing/scenes.test.js`.
- [ ] `?attenue=1` dans les maquettes : `k-reduced` sur `#st`, glitch au tiers, aucun glitch d'ambiance, aucune secousse (recopie de `kit.js:67, 91, 108, 113`) ; règles `kit.css:26-27, 41-42` recopiées dans `MQ/kit.css`.
- [ ] Jeu : `playCinematic` force `reducedMotion` quand `params.attenue === '1'` (`src/briefing/index.js:35, 95`). Test (témoin : aujourd'hui `#st` n'a pas `k-reduced` avec ce paramètre).
- [ ] `K.anim(dessin, duree, { attenue })` et `K.graine(n)` dans un bloc `// ── commun : anim ──` identique dans les deux kits (spec §3.2). Tests : au gel à mi-course `dessin` reçoit 0,5 ± 0,02 (témoin : un tracé en `transition` est entier au gel, `kit.css:149`) ; plus aucun appel après `destroy` ni après « rejouer » ; 0 minuteur à la fin ; en atténué, `dessin(1)` d'emblée (`'fin'`) ou fondu (`'fondu'`) ; `K.graine(7)` rend la suite de `MQ/prologue-a.html:220-221` (témoin : autre graine).
- [ ] Matières dans un bloc `/* ── commun : matières ── */` des deux `kit.css` : `--k-encre`, `--k-papier`, `.k-encre`, `.k-papier` (spec §3.2, point 4) ; aucune règle existante modifiée.
- [ ] G7 (`kit-commun.test.js`) : blocs communs identiques au caractère entre les deux kits (témoin : une copie retouchée seule).
- [ ] Sonde d'images des maquettes : `#k-lbl` affiche la p95 des 120 dernières images (`MQ/kit.js:332`).
- [ ] Essai `.k-vrai` (spec §3.2, point 6) : `kit.css:149` exclut `.k-vrai`, qui est mis en pause au gel. Vérification réelle obligatoire avant de le garder : page de contrôle dans les maquettes (barre qui va de 0 à 100 % en `@keyframes` linéaire de 2 000 ms), `MAQUETTE=1 node scripts/shots.mjs` à 1 000 ms : la barre doit être à 50 % ± 2 %. Sinon, retirer l'essai et le noter dans la spec (tout mouvement long passe alors par `K.anim`). La page de contrôle n'est pas une scène (absente de `SCENES`).
- [ ] Tests existants verts (`kit.test.js`, `scenes.test.js`, `montage.test.js` : les scènes ne changent pas).
- [ ] Vérification réelle : une maquette ouverte avec `?attenue=1` et `?freeze=` (capture), sonde lue dans l'étiquette.
- [ ] Commit : `feat(cinematiques): effets atténués visibles dans les maquettes, dessins au temps exact, encre et papier communs aux deux kits`

### Tâche C3 : mesure du rendu, référence de la v1

**Fichiers :** créer `scripts/cine-perf.mjs`, `docs/superpowers/specs/annexes/2026-10-28-cine-v1.json` ; modifier `docs/superpowers/specs/annexes/README.md` (section « Cinématiques v2 »).
- [ ] `node scripts/cine-perf.mjs <id> [--ralenti=4] [--params=port=libres] [--annexe=<nom>.json]` : Chrome sans interface en temps réel, rendu GPU si disponible (comme `memtest --temps-reel --gpu`), 1280 × 720, `?cine=<id>` sur le serveur de la copie ; ralenti processeur par `Emulation.setCPUThrottlingRate` (même connexion que `RALENTI` de `scripts/verif-mission.mjs`) ; sonde injectée : durées d'image par `requestAnimationFrame` (p50, p95, max) et `document.getAnimations()` en cours, relevé toutes les 250 ms (maximum) ; arrêt à la fin de la cinématique.
- [ ] Partie pure testée (`p95` sur une liste, maximum des animations) ; témoin : une liste où la p95 diffère de la moyenne.
- [ ] Vérification réelle : les 10 cas de la v1, avec et sans `--ralenti=4` ; deux passes pour estimer le bruit ; tableau dans le README des annexes (scène, p50, p95, max, animations au plus).
- [ ] Commit : `feat(mesure): coût de rendu des cinématiques mesuré, référence de la v1`

### Tâche C4 : atténués complets, rendu et textes gardés

**Fichiers :** créer `tests/briefing/attenue.test.js`, `tests/briefing/rendu.test.js`, `tests/briefing/textes-scenes.test.js` ; modifier `src/briefing/kit.css`, `MQ/kit.css`, `MQ/prologue-a.html`, `MQ/prologue-b.html`, `MQ/epilogue.html`, `MQ/briefing-m1.html`, `MQ/briefing-m2.html`, `MQ/briefing-m3.html`, `MQ/briefing-m4.html`, `MQ/briefing-m6.html` ; scènes régénérées.
- [ ] G4 (spec §3.1) : analyse statique du CSS (`css` exporté par chaque scène, plus `kit.css`) ; règle jumelle `.k-reduced` exigée pour chaque animation `infinite`, liste blanche nommée et justifiée. Témoin rouge : `epi-buzz` (`EP:121`), puis la liste du §1 de la spec.
- [ ] Règles jumelles : `epi-buzz` et l'appel de l'épilogue (`EP:121, 143`), avatar « ? » (`PB:98`), épaule `.hh` et `.rig` (`PA:13, 56`, `PB:14, 47`, `EP:16, 108`), pluie à sa pose de repos (`PA:35, 38`, `PB:26, 29`, `M3:30, 32`), clignotements allumés fixes (`M2:143`, `M3:36, 48`, `M4:133`, `EP:23`, et `.rec`, `.photo .cam b`, `.radio .dot` du kit), `.pulse` du kit en anneau fixe, M6 entier (`M6:32-36, 65-67, 74, 80, 135, 156, 164`), flashs des pièces à conviction plafonnés à 0,3 (`MQ/kit.css` et `kit.css`, `.evp`). Dans les deux `kit.css`, chercher ces règles par sélecteur : C2 en a décalé les lignes (en-tête allongé, blocs communs `matières`, `atténué` et `gel` regroupés vers la fin). Une garde dynamique par famille, vue rouge sans la règle, sur le modèle de « prologue B, effets atténués » (`scenes.test.js`, décalé lui aussi par C2).
- [ ] G5 (spec §3.1) : `@keyframes` neufs limités à `transform`, `opacity`, `stroke-dashoffset` ; liste figée de la v1 ; aucun `setInterval` ; `Math.random` par maquette ≤ v1. Témoin : un `@keyframes` neuf sur `top`.
- [ ] G6 (spec §3.1) : aucun U+2014 visible dans les scènes, exception nommée `m5`. Corrections (selon D2) : `M1:29`, `M1:51` en « · », `M4:173` en « · DÉFENSE · », `EP:647` en « N/D » ; si D2 = B, la réplique de `M6:345` en deux lignes (`white-space: pre-line` sur `#trans` de M6), `post` de 250 à 374 ms, `repliques-v1.json` mis à jour pour cette seule ligne par décision écrite dans la spec ; G1 reste vert au ms.
- [ ] Vérification réelle : captures du jeu avec `attenue=1` (prologue B pendant l'appel, épilogue pendant la sonnerie, M6 à la fête, M3 sous la pluie) et sans, regardées ; G1 à G3 verts.
- [ ] Commit : `fix(cinematiques): toutes les animations suivent les effets atténués, plus de tiret cadratin à l'écran, rendu et textes gardés par des tests`

### Tâche C5 : hygiène de rendu (même image, moins de repeints)

**Fichiers :** `src/briefing/kit.css`, `MQ/kit.css` (`.track`), `MQ/prologue-a.html`, `MQ/prologue-b.html`, `MQ/briefing-m3.html` (pluie, `m3-roll`, `m3-sb`), `MQ/epilogue.html` (respiration des rayons, `EP:271`) ; scènes régénérées ; liste figée de G5 raccourcie d'autant.
- [ ] Pluie : même motif sur un calque surdimensionné, déplacé d'une tuile en `transform` au lieu de `background-position` ; `.track` en `translateY` au lieu de `top` (`.st .track` et `@keyframes k-track` des deux `kit.css`, à chercher par sélecteur : C2 en a décalé les lignes) ; `m3-roll` et `m3-sb` de même ; respiration des rayons sur l'opacité d'un conteneur, plus sur le `g` filtré.
- [ ] Tests : G5 voit ces `@keyframes` sortir de la liste figée (témoin : la liste de la v1 les contient) ; G1 à G4 verts.
- [ ] Vérification réelle : captures gelées v1 contre v2 aux mêmes instants (prologue A 6 000, prologue B 4 000, M3 2 000 et 23 000, épilogue 40 000) : identiques à l'octet, ou écart regardé et décrit (constat de C0 : sur la v1, deux captures de m2 ou de m3 au même instant diffèrent déjà, spec §1, « Gel des captures » ; mesurer ce bruit avant de lire un écart v1 contre v2) ; `cine-perf` des quatre scènes, avant contre après, à `--ralenti=4`, ajouté à l'annexe.
- [ ] Commit : `perf(cinematiques): pluie, balayage et rayons animés sans repeindre l'image`

### Tâche C6 : prologue A

**Fichiers :** `MQ/prologue-a.html` ; scène régénérée ; `tests/briefing/scenes.test.js` (ou `tests/briefing/prologue-a.test.js`).
- [ ] Spec §3.4 « Prologue A » : ★ la photo sous le pouce (classe `veille`, déclarée dans `stateClasses`) ; horodatage de caméscope (`K.anim` pour le roulement) ; rigoles, lumière de l'écran sur le gant, reflet dans la vitre, feu d'avion ; porte entrebâillée d'A4 ; extinction de tube et rémanence en A5. Tirages par `K.graine` avec des graines neuves (la ville garde la sienne).
- [ ] Tests rouges puis verts : l'écran porte `veille` 1,4 s après APPEL TERMINÉ et avant la fin d'A3 (témoin : jamais aujourd'hui) ; horodatage gelé à 15 000 ms : « 14 03 » (témoin : absent) ; une garde atténuée dynamique pour les rigoles et le tube ; G1 à G7 verts.
- [ ] Vérification réelle : `MAQUETTE=1 node scripts/shots.mjs prologue-a 2000 6000 11500 17000 20300` puis la même chose sur le jeu, et avec `PARAMS=attenue=1` ; v1 contre v2 côte à côte, regardées ; `cine-perf prologue-a --ralenti=4` dans les plafonds (spec §3.6) ; captures envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): prologue A, la photo sous le pouce, la bande du souvenir, la pluie qui coule`

### Tâche C7 : prologue B, le téléphone (B1 à B13)

**Fichiers :** `MQ/prologue-b.html` ; scène régénérée ; tests du prologue B.
- [ ] Spec §3.4 « Prologue B », B1 à B13 : onde écrite et piste par `K.anim` ; ★ silence habité (photo en veille à 22:40, buée sur les respirations) ; lumière qui vibre en B5 ; trace de la voix ; vignette rouge ; canal refermé (classe `cut` au moment où `on` est retirée) ; accolade à l'encre ; raccord écran vers mur dans `#scene`.
- [ ] Tests rouges puis verts : piste gelée à 5 000 ms avec exactement 13 barres allumées (témoin : `transition` de `PB:165`, entière au gel) ; hauteurs des barres 15 à 17 au-dessus de toutes les autres (témoin : tirage au hasard) ; buée visible au gel à 11 500 ms (témoin : absente) ; `scenes.test.js:157-172` toujours verts (8 / 8, ANTON, radio éteinte) ; gardes atténuées (lumière qui vibre gardée et lente, oscilloscope plat).
- [ ] Vérification réelle : captures maquette et jeu à 4 000, 12 500, 16 000, 25 000, 34 500, 37 500, normal et `attenue=1`, regardées ; `cine-perf prologue-b --ralenti=4` ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): prologue B, l'onde qui raconte le message, le silence habité, l'écran qui devient la lampe`

### Tâche C8 : prologue B, le mur (B14 à B20)

**Fichiers :** `MQ/prologue-b.html` ; scène régénérée ; tests du prologue B.
- [ ] Spec §3.4, B14 à B20 : poussière dans la lampe et faisceau ; ombre collée au liège ; papier vrai et encre ; fils qui se tendent (`K.anim`) et mur qui encaisse ; deux lumières ; trois points ; ★ tournée du réticule en `@keyframes` de `transform` (même départ, même arrivée, 2,6 s) ; titre (réticule qui se contracte, SNIPER révélé). Selon D4 = B : le coin du dessin de la petite sous le plan.
- [ ] Tests rouges puis verts : réticule gelé à mi-tournée sur le 3e dossier (témoin : diagonale `left`/`top` de `PB:252-255`) ; fils tendus à la fin de B16 et mous au gel juste après leur départ (témoin : tracé droit d'emblée) ; aucun élément neuf ne porte `fc` (compteur toujours « 8 / 8 ») ; G1 à G7.
- [ ] Vérification réelle : captures à 42 000, 47 500, 52 500, 60 500, 64 000, normal et `attenue=1` ; `cine-perf` ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): prologue B, la lampe vit, les fils se tendent, le réticule fait la tournée des dossiers`

### Tâche C9 : épilogue

**Fichiers :** `MQ/epilogue.html` ; scène régénérée ; tests de l'épilogue.
- [ ] Spec §3.4 « Épilogue » : ★ le signal se tait (`calm1` à `calm3` sur `#st`, déclarées dans `stateClasses`) ; le mur a vécu, fils détendus en courbes ; encre fraîche ; punaises en bokeh ; Ken Burns ; variante libres (ciel qui se réchauffe) et enfermés (chariot d'impression, brume) ; compte à rebours à chiffres qui roulent (`K.anim`) ; « ANTON » qui se dissout ; verre qui attrape le soleil, ombres du matin.
- [ ] Tests rouges puis verts : `#st` porte `calm3` à la fin des deux variantes (témoin : jamais) ; opacité calculée de `.grain` sous `.calm3` < celle de la v1 (témoin : identique) ; « NUMÉRO MASQUÉ » jamais et premier écran d'appel inchangé (`scenes.test.js:46-62`) ; croix sur chaque `.epi .fc` comme avant ; G1 à G7.
- [ ] Vérification réelle : captures maquette et jeu à 2 500, 8 000, 13 000, 19 500, 24 000, 29 000, 34 200, 40 000, 45 500, avec `PARAMS=port=libres` puis `port=enfermes`, et une passe `attenue=1` ; `cine-perf epilogue` dans les deux variantes ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): épilogue, le signal se tait jusqu'à la fin la plus nette, un mur qui a vécu`

### Tâche C10 : M1

**Fichiers :** `MQ/briefing-m1.html` (ajouter `stateClasses`) ; scène régénérée ; `tests/briefing/m1.test.js`.
- [ ] Spec §3.4 « M1 » : ★ T7 à T9 calés sur la réplique (ligne de visée, crochets sur le costume, téléphone, itinéraire, passants, cartouche, trappe, note d'honoraires et OFFERT) ; incrustation REC (`K.anim`), cascade, mots soulignés, triangulation, télex ; matières, arrêt sur image, caviardage tracé, réglette, reflet glacé, fils rouges ; plan habillé ; poste au muret côté rue et tracé droit (selon D6) ; titre. Étiquettes selon D3.
- [ ] Tests rouges puis verts : au moins un repère neuf dans chacun des temps 7, 8 et 9 (témoin : 0, `M1:121-123`) ; incrustation gelée à 38 700 ms sur « 22:47:00 » (témoin : absente) ; le plan baisse à 60 % en T8 sauf la punaise, la visée et le poste ; G1 à G7 (G3 : aucun repère existant décalé).
- [ ] Vérification réelle : captures à 2 500, 7 500, 12 000, 17 500, 22 500, 27 000, 32 000, 36 500, 40 000, normal et `attenue=1` ; `cine-perf m1` ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): M1, le plan parle pendant la consigne, l'écoute et le dossier prennent matière`

### Tâche C11 : M2

**Fichiers :** `MQ/briefing-m2.html` (ajouter `stateClasses`) ; scène régénérée ; `tests/briefing/m2.test.js`.
- [ ] Spec §3.4 « M2 » : ★ un seul visage (surimpression de l'autre frère à 30 % pendant 600 ms) et échantillons de polo ; acier, carrelage ; fibres, néon, laser de caisse ; lumière de la vitrine et néon BOUCHERIE ; balle fantôme ; paire qui glisse et revient ; anneau de 2 s ; auréole du verre ; fermeture.
- [ ] Tests rouges puis verts : surimpression présente au gel à 7 700 ms et absente à 8 500 ms (témoin : absente) ; en atténué, aucune surimpression et anneau plein ; la paire revenue à sa place avant le temps 7 (positions au gel à 25 400 ms égales à celles de la v1) ; G1 à G7.
- [ ] Vérification réelle : captures à 1 000, 4 000, 8 000, 13 000, 19 000, 24 000, 28 000, 31 500, 35 000, normal et `attenue=1` ; `cine-perf m2` ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): M2, un seul visage pour deux frères, la vitrine éclaire la place`

### Tâche C12 : M3, le panorama (T1 à T5)

**Fichiers :** `MQ/briefing-m3.html` ; scène régénérée ; `tests/briefing/m3.test.js`.
- [ ] Spec §3.4 « M3 », T1 à T5 : parallaxe en trois plans (plan du milieu aux facteurs actuels) ; troisième pluie ; gouttes sur l'objectif ; Kalina ; projecteur au sodium fixe ; quai mouillé ; ronds de pluie (graine `M3:607`) ; trois portiques (selon D6) ; caméras A et B (gouttes, macroblocs, parasites, points de flux, cadran, traits tracés, « 0 ERREUR » entouré).
- [ ] Tests rouges puis verts : FRET et 2 CIBLES gardent leur position au gel à 4 000 ms (égale à la v1 à 0,1 cqw près) ; trois portiques au panorama (témoin : quatre, `M3:624`) ; en atténué, un seul facteur de poussée pour les trois plans ; G1 à G7.
- [ ] Vérification réelle : captures à 500, 2 000, 4 000, 7 000, 12 000, 17 500, normal et `attenue=1` ; `cine-perf m3` (scène la plus chargée : surveiller le plafond de 40 animations) ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): M3, le port en trois plans sous trois pluies, la Kalina à quai`

### Tâche C13 : M3, le duo, le conteneur, la grue (T6 à T10)

**Fichiers :** `MQ/briefing-m3.html` ; scène régénérée ; `tests/briefing/m3.test.js`.
- [ ] Spec §3.4, T6 à T10 : onde du coup de feu (0,45 s) et téléphone de Mira ; ★ caméra thermique aux 14 taches ; listing réel et barré ondulé ; coupe à l'échelle à 15° avec arc et « ZÉRO 155 m » ; navette sur le plan ; cadenas, 14 traits, pluie qui redouble ; reflet du titre, feux des grues.
- [ ] Tests rouges puis verts : 14 taches allumées au gel à 29 400 ms, aucune à 28 100 ms (témoin : absentes) ; front de l'onde chez Mira 450 ± 20 ms après TIR 1 ; pente de la visée de la coupe 15 ± 1° (témoin : 38°, `M3:582`) ; G1 à G7.
- [ ] Vérification réelle : captures à 23 500, 26 500, 29 500, 34 000, 38 500, 43 000, normal et `attenue=1` ; `cine-perf m3` ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): M3, quatorze taches de chaleur dans le conteneur, l'onde du premier tir, la coupe à l'échelle`

### Tâche C14 : M4 (430 m)

**Fichiers :** `MQ/briefing-m4.html` ; scène régénérée ; `tests/briefing/m4.test.js`.
- [ ] Spec §3.4 « M4 » : ★ frise des 6 s et fuites vers les abris ; nuancier d'identification ; carte de tir (cercles tracés par `K.anim` au passage du compteur), « ZÉRO 430 m », coupe à 5° ; itinéraires, parallaxe du travelling, horloge ; CAM 2 vivante, post-it, encre, billets, douille ; désaveu qui éteint la lampe. Toutes les valeurs à 430 m (décision de Rayan, `progress.md:106`).
- [ ] Tests rouges puis verts : frise (spec §3.8) ; cercle de 430 m tracé au gel à 26 000 ms et pas à 24 800 ms (le compteur franchit 430 à 4 000 ms du temps, qui commence à 21 900 ms) ; nuancier : trois pastilles aux couleurs bleu nuit, noir, blanc au gel à 16 000 ms (témoin : absentes) ; G1 à G7.
- [ ] Vérification réelle : captures à 3 000, 10 500, 15 500, 20 500, 25 000, 29 500, 33 500, 37 500, normal et `attenue=1` ; `cine-perf m4` ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): M4, trois tirs en six secondes dessinés pour de vrai, les officiers reconnaissables à leur tenue`

### Tâche C15 : M6

**Fichiers :** `MQ/briefing-m6.html` ; scène régénérée ; `tests/briefing/m6.test.js`.
- [ ] Spec §3.4 « M6 » : ★ trou noir vivant ; deux voix (si D2 = B, fait en C4) et durée d'appel ; onglets barrés et fils ; recherche faciale ; télex NÉANT ; dorure, liste des invités ; salle vivante ; réticule qui cherche sans verrouiller ; pictogramme de téléphone ; porte ENTRÉE ; chaîne du traçage.
- [ ] Tests rouges puis verts : le réticule ne porte jamais `lock` et visite 7 non-danseurs distincts (graine fixe ; témoin : absent) ; « NUMÉRO MASQUÉ » toujours dans l'écoute (`scenes.test.js:38-43`) ; 24 lignes noircies au gel à la fin du compteur ; grains figés en atténué ; G1 à G7.
- [ ] Vérification réelle : captures à 3 000, 7 000, 13 500, 17 500, 22 500, 27 500, 32 000, 36 500, 40 000, 43 500, normal et `attenue=1` ; `cine-perf m6` ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): M6, le trou noir avale la lumière, le réticule cherche sans trouver`

### Tâche C16 : M5, briefing I et briefing II (après la fusion du bar)

**Fichiers :** `MQ/briefing-m5.html`, `MQ/briefing-m5b.html` (tels que le bar les a livrés) ; scènes régénérées ; `tests/briefing/m5.test.js` ; références G1 et G2 de `m5` et `m5b` (écrites depuis la version fusionnée du bar, pas depuis la v1 : le bar a changé le texte).
- [ ] Rebaser `cine-v2` sur `main` ; relire `m5-bar-design.md` §4 et ce que le bar a réellement livré ; écrire les références G1 à G3 de `m5` et `m5b` (toutes variantes de `params`) **avant** toute retouche.
- [ ] Spec §3.4 « M5 » : cascade du scanner, code-barres sous les vendus (sans toucher `.sold` ni `#soldn`), ★ fragment de photo brûlée avec la casquette, poussière derrière la voiture 3, feux stop, traçante, fuites de lumière. Retirer l'exception `m5` de G6, et vider l'attente de m5 de G4 (`EN_ATTENTE`, `tests/briefing/attenue.test.js`) : chaque animation répétée de m5 a sa jumelle (dont `m5-sm`, environ 4 Hz, au-delà de 3 flashs par seconde), que le bar l'ait posée en B14 ou non.
- [ ] Tests rouges puis verts : `scenes.test.js:200-227` (12 silhouettes, `#soldn`) toujours vert ; fragment de photo présent au gel au tampon (témoin : absent) ; braises figées en atténué ; G1 à G7 sur `m5` et `m5b`.
- [ ] Vérification réelle : captures des deux scènes aux instants clés, `m5b` avec au moins deux jeux de renseignements (tout appris, rien appris), normal et `attenue=1` ; `cine-perf` ; envoyées à Rayan.
- [ ] Commit : `feat(cinematiques): M5, la casquette dans une photo brûlée, le convoi qui freine et la poussière du couchant`

### Tâche C17 : vérification finale

**Fichiers :** `docs/superpowers/REPRISE.md`, `docs/superpowers/specs/annexes/README.md`, l'annexe `2026-10-28-cine-v2.json` ; la spec du chantier rangée dans `docs/superpowers/specs/2026-10-28-cinematiques-v2-design.md` et ce plan dans `docs/superpowers/plans/`.
- [ ] `npx vitest run --maxWorkers=2` vert ; `npx vite build` ; `node scripts/poids.mjs --check --avec-enquete` vert (D1 = A, spec §3.9 critère 5 ; `--check` seul si D1 = B).
- [ ] `cine-perf` des 10 cas à `--ralenti=4`, deux passes : chaque scène sous les plafonds de la spec §3.6 (p95 ≤ 22 ms et ≤ 1,15 × la v1, ≤ 40 animations) ; tableau v1 contre v2 dans le README des annexes.
- [ ] Captures de déterminisme : deux captures du même instant de chaque scène identiques à l'octet (constat de C0 : sur la v1, m2 et m3 ne l'étaient pas, spec §1, « Gel des captures »). Pour m3, étendre d'abord le gel aux pseudo-éléments, où tourne sa pluie (`.st.k-frozen *::before, .st.k-frozen *::after`, même déclaration, dans le bloc commun `gel` des deux `kit.css` : constat et piste de C5) ; m2 reste à diagnostiquer.
- [ ] Vérifications contre le lot 3 (groupe G3 des dépendances), selon ce qui est fusionné : « ZÉRO n m » égal au texte du télémètre ; poste de M1 contre la carte de 3b ; portiques et coupe de M3, frise et cercles de M4 contre 3c. Ce qui n'est pas encore fusionné est noté dans `REPRISE.md` (« à revérifier à la fusion de 3b et 3c »).
- [ ] Planche de toutes les captures v1 contre v2 envoyée à Rayan (SendUserFile), avec les points qu'il doit juger.
- [ ] `REPRISE.md` : cinématiques v2 décrites (outils communs, gardes, mesure, nombre de tests attendu) ; le reste connu des tirets cadratins mis à jour.
- [ ] Commit : `docs: cinématiques v2 vérifiées, mesures et captures`
- [ ] Relecture finale de la branche (superpowers:requesting-code-review), puis fusion en avance rapide dans `main` après rebase, push.

## Critères de fin

Ceux de la spec §3.9, chaque tâche vue rouge puis verte et relue, captures regardées et envoyées à Rayan, relecture finale de la branche, fusion dans `main`, push.
