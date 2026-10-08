# Lot 1 : socle technique (mesure, mémoire, réglages graphiques, chargement, confort)

> Conçu le 7 octobre 2026 après l'audit de reprise et le lot 0. Rayan a donné carte blanche sur le process : cette spec est rédigée d'un bloc, sans validation section par section.
> Sources : `.superpowers/sdd/2026-10-07-reprise/audit/rapport-legerete.md` (inventaire des fuites, chiffres, plan mesurable) et `contre-verification.md` §3.1 et §3.3.

## 1. Pourquoi ce lot passe avant le gameplay

- Le jeu ne libère aucune ressource GPU hors de l'enquête : chaque lancement de mission, chaque tir et chaque manche PvP ajoute des géométries, des matériaux et des textures d'os qui ne repartent jamais. Toute mesure de fluidité faite avant ce lot serait faussée.
- Le gameplay décidé ensuite (tirs à 155, 430 et environ 138 m en M3 à M5, caméra qui suit la balle) ajoute de la charge : plan lointain, foules plus visibles, ralentis. Il faut d'abord savoir ce que coûte chaque image et pouvoir baisser la qualité.
- Le rendu est aujourd'hui figé au maximum (densité de pixels jusqu'à 2, ombres douces 2048², ombre de chaque personnage, aucun personnage écarté hors champ) et rien ne réagit à `prefers-reduced-motion`, alors que chaque tir fait un flash plein écran et que les cinématiques multiplient les glitchs.
- Machine de Rayan (lue par WebGL le 7 octobre) : RTX 3080, 16 cœurs, 32 Go, écran 1080p à densité 1. Elle ne dit rien d'un PC de milieu de gamme : les objectifs de ce lot sont donc des **budgets chiffrés** mesurés par le renderer, pas une impression de fluidité chez Rayan.

## 2. Périmètre

**Dans le lot :**
1. Mesure : panneau de performances pour tout le jeu, route de test mémoire scriptée, script de mesure dans Chrome sans interface, relevé de référence avant correction.
2. Mémoire : libération de tout ce que le jeu crée (cartes, PNJ, effets, impacts, cadenas, jeeps, arène et foule PvP), décor du menu reconstruit au retour, audio débranché, PvP sur le contexte audio commun.
3. Réglages graphiques : Auto, Bas, Moyen, Haut ; personnages écartés hors champ sans clignotement ; résolution dynamique en Auto.
4. Chargement : écran de chargement des modèles avant une mission ou une manche, perte du contexte WebGL rattrapée.
5. Confort : effets atténués (automatique selon le système, ou forcé), plein écran.
6. Précompilation des shaders d'une mission pendant son briefing.

**Hors du lot (lots suivants) :** compression des GLB, partage des animations, niveaux de détail, chargement à la demande du bundle (lot poids) ; `camera.far` et plan lointain (lot distances) ; remappage des touches de campagne.

## 3. Approches envisagées pour la mémoire

| | Approche | Pour | Contre |
|---|---|---|---|
| A | **Portées de propriété** : chaque sous-système enregistre ce qu'il crée dans une portée (`scope.track(obj)`) et la libère d'un coup | Très explicite | Il faut toucher chaque `new THREE.*` du jeu (plus de 1 000 créations dans les cartes) ; un oubli fuit en silence |
| B | **Libération par parcours avec marquage du partagé** : à la sortie, on parcourt l'objet retiré et on libère géométries, matériaux, textures et squelettes, sauf ce qui porte la marque « partagé » | Peu d'endroits à toucher (les points de retrait existent déjà) ; le piège principal (libérer une texture d'un GLB, d'où des modèles noirs) est traité à la source, au chargement | Une ressource partagée non marquée serait libérée : il faut un test qui le garde |
| C | **Caches** de géométries et de matériaux par clé, jamais libérés | Borné par construction, moins d'objets | Clés partout dans les cartes ; ne règle ni les squelettes ni les matériaux clonés |

**Choix : B**, complété par C là où c'est simple et rentable : les effets de tir partagent une géométrie par type, les trous d'impact une géométrie et un matériau (ils sont créés en rafale ; détail au §4.2). Les cartes restent en B dans ce lot (leur cache relève du lot poids).

## 4. Conception

### 4.1 Mesure

- **`src/gfx/stats.js`** : panneau discret en bas à gauche (même typographie que le HUD) : images par seconde (moyenne glissante sur 1 s), durée d'une image en ms (p50 et p95 sur 120 images), appels de dessin, triangles, géométries, textures, programmes, tas JS en Mo si disponible. Affiché par `?stats=1` (toutes phases, y compris l'enquête qui garde son compteur actuel) **ou** par le réglage « Afficher les performances ». Une fonction pure `frameStats(samples)` calcule moyenne, p50 et p95 (testée).
- **Route de développement `?memtest=1`** (sous `import.meta.env.DEV`) : enchaîne sans `requestAnimationFrame` (il ne tourne pas dans un panneau masqué) : menu, puis M1 à M6 montées par la même fonction que le jeu, avec quelques images rendues par appel direct à `renderer.render`, puis 10 montages de M6, 5 arènes PvP hors réseau, retour au menu. Après chaque étape, l'état de `renderer.info` (géométries, textures, programmes, appels, triangles) et le tas JS sont écrits en JSON dans un `<pre id="memtest">`.
- **`scripts/memtest.mjs`** : sur le modèle de `scripts/shots.mjs`, lance Chrome sans interface (SwiftShader, profil jetable, **aucun port de débogage fixe**), lit le JSON par `--dump-dom`, l'écrit dans `shots/memtest-<date>.json` et vérifie les seuils du §6. Code de sortie non nul si un seuil est dépassé.
- **Référence** : la première tâche relève les chiffres actuels (avant toute correction) et les inscrit dans `docs/superpowers/specs/annexes/2026-10-07-memtest-reference.json`. Le README des annexes dit comment relancer la mesure.

Pour monter une mission sans le DOM des menus, `main.js` expose (en dev seulement) `mountLevel(n)` et `unmountLevel()`, qui sont les fonctions que le jeu utilise lui-même (pas une copie) : `startLevel` appelle `mountLevel`, `clearEntities` et `showMenu` appellent `unmountLevel`.

### 4.2 Mémoire

**`src/gfx/dispose.js`** (pur, sans DOM) :
```js
export function markShared(root)            // pose userData.shared = true sur toutes les géométries, matériaux et textures de root
export function disposeObject(root, opts)   // retire root de son parent, puis libère ce qui n'est pas partagé ; renvoie { geometries, materials, textures, skeletons } libérés
export function isShared(resource)
```
Règles de `disposeObject` :
- parcourt tout l'arbre ; libère chaque géométrie, chaque matériau et chaque texture référencée par un matériau (`map`, `normalMap`, `emissiveMap`, etc., par parcours des propriétés `isTexture`), sauf si `isShared` ;
- pour chaque `SkinnedMesh`, `skeleton.dispose()` (texture d'os) : le squelette d'un clone n'est jamais partagé ;
- lumières qui portent une ombre : `light.shadow.dispose()` ;
- idempotent : une ressource n'est libérée qu'une fois (ensemble des déjà vus), deux appels de suite ne font rien de plus ;
- ne touche jamais au DOM, aux mixers ni à l'audio.

**Points de retrait branchés :**
| Quoi | Où aujourd'hui | Correction |
|---|---|---|
| Décor des cartes et pluie | `maps.js` `clear()` | `disposeObject` sur chaque objet de `mapObjects` ; la pluie (`ambientFn`) libère sa géométrie |
| PNJ | `main.js` `clearEntities`, `showMenu` ; `npc.js:555` (corps retiré à 8 s) | nouvelle méthode `NPC.dispose()` : `mixer.stopAllAction()`, `mixer.uncacheRoot(model)`, puis `disposeObject(this.mesh)` (les matériaux **clonés** pour la teinte ne sont pas marqués partagés, donc libérés ; les géométries et textures du GLB sont marquées au chargement, donc gardées) ; le minuteur de 8 s devient une durée gérée dans `update` |
| Modèles GLB | `characters.js` chargement | `markShared(gltf.scene)` au chargement ; la teinte blanche `0xffffff` ne clone plus le matériau |
| Effets de tir | `effects.js` | une géométrie de particule et une de flash, partagées (marquées) ; un seul matériau par impact (pas un par particule), à lui, libéré en fin de vie ; traceur et flash libèrent ce qu'ils possèdent. Pas de matériau partagé par couleur (écart de L2) : l'opacité de chaque impact baisse à son propre rythme, il lui faut son matériau, et `Material.clone` recopierait la marque `userData.shared` |
| Trous d'impact | `main.js` tir manqué | géométrie et matériau uniques partagés ; le trou le plus ancien est retiré sans rien libérer |
| Cadenas | `main.js` `startLevel`, tir | `disposeObject` au retrait |
| Jeeps | `main.js` `clearConvoy` | `disposeObject` sur chaque jeep |
| Arène et foule PvP | `pvpMap.js`, `pvp.js` `endRound`, `quitToMenu` | `clearPvpMap` libère, la foule passe par `NPC.dispose`, avatars, laser et pistolet par `disposeObject` |
| Décor du menu | `showMenu` garde la dernière carte | `showMenu` libère la carte courante et reconstruit la rue (`MAP_BUILDERS[0]`) |
| Nappe de mission | `audio.js` `stopMissionAmbience` | le gain est débranché à la fin de son fondu |
| Audio du PvP | `pvp.js:97` crée un 2ᵉ `AudioContext` branché sur `destination` | utilise `audioContext()` et `masterNode()` de `audio.js` : un seul contexte, et le volume du jeu s'applique au PvP |

### 4.3 Réglages graphiques

Nouveaux champs de `settings` (avec migration : une sauvegarde ancienne prend les valeurs par défaut) :
```js
graphics: 'auto',        // 'auto' | 'bas' | 'moyen' | 'haut'
showStats: false,
reducedMotion: 'auto',   // 'auto' (suit le système) | 'oui' | 'non'
```
**`src/gfx/quality.js`** (pur) : `presetFor(name, devicePixelRatio)` renvoie les paramètres effectifs :

| | Bas | Moyen | Haut |
|---|---|---|---|
| Densité de pixels | 0,75 × min(dpr, 1) | min(dpr, 1,25) | min(dpr, 2) |
| Ombres | 1024², `PCFShadowMap` | 2048², `PCFShadowMap` | 2048², `PCFSoftShadowMap` |
| Ombre des personnages | non | cibles et gardes | tous |
| Personnages écartés hors champ | oui | oui | oui |

`Auto` = Moyen avec **résolution dynamique** : `createResolutionController({ min: 0.7, max: 1 })` (pur) reçoit la durée de chaque image et ajuste l'échelle par pas de 0,05 : baisse si la p95 sur 2 s dépasse 22 ms, remonte si elle passe sous 14 ms pendant 4 s, jamais plus d'un changement par seconde (pas d'oscillation). Testé avec des séquences de durées synthétiques.

L'anticrénelage reste actif (il ne se change qu'en recréant le renderer). Un changement de préréglage s'applique immédiatement (densité, taille et type d'ombre : la carte d'ombre est recréée par `sun.shadow.map.dispose()` puis `null`).

Écarts de L4 : three r185 a déprécié `PCFSoftShadowMap`, qu'il remplace au premier rendu par `PCFShadowMap` avec un avertissement dans la console. Le jeu rendait donc déjà en `PCFShadowMap`, et tous les préréglages l'utilisent : Haut rend exactement comme avant le lot (captures identiques à l'octet). « Cibles et gardes » s'entend des personnages qui se montrent comme tels : le commanditaire de M6 (modèle de la foule, sans marqueur) et l'avatar du contre-tueur en PvP suivent la règle des civils, sinon leur ombre les distinguerait de la foule en Moyen.

**Personnages écartés hors champ.** `characters.js` force aujourd'hui `frustumCulled = false` (les maillages animés sortent de leur sphère englobante et clignotaient). Correction : chaque instance reçoit une sphère englobante généreuse calculée une fois (centre à mi-hauteur, rayon égal à 1,25 fois la hauteur d'ajustement), posée sur le `SkinnedMesh` cloné, puis `frustumCulled = true`. Test : la sphère contient la boîte de la pose de repos et celle de l'image la plus étendue du clip de marche (échantillonné), avec une marge. Écart de L3 : le rayon prévu, 0,75 fois la hauteur, couvre la marche mais pas les autres clips joués ; mesuré sommet par sommet sur les sept modèles, Dance (la foule de M6 et du PvP) en sortait de 43 cm, Death (le corps reste 8 s) de 78 cm, Look de quelques millimètres. À 1,25, tous les clips joués tiennent avec au moins 11 cm de marge, et le test échantillonne aussi une mort qui recule et finit couchée.

**Interface** : l'écran Paramètres gagne une section « Affichage » : Qualité (Auto, Bas, Moyen, Haut), Afficher les performances, Effets atténués (Auto, Oui, Non), Plein écran. Mêmes composants que les réglages existants, libellés sans tiret cadratin.

### 4.4 Chargement

- `preloadCharacters()` expose `charactersReady()` (promesse) et `charactersProgress()` (0 à 1, par octets reçus si disponibles, sinon par fichiers).
- `launchLevel` et le départ d'une manche PvP attendent `charactersReady()` : si le chargement n'est pas fini, un écran « dossier du fixeur » s'affiche (« PRÉPARATION DU DOSSIER · 63 % », barre fine, même style que les cartes de l'enquête) puis s'efface. Un modèle en échec ne bloque pas : on part avec ce qui est chargé (le repli procédural existant), et l'écran ne reste jamais plus de 20 s.
- Contexte WebGL perdu (`webglcontextlost`) : `preventDefault()`, pause de la partie, écran « Le rendu a été interrompu » avec un bouton RECHARGER (la sauvegarde est déjà faite à chaque réussite). `webglcontextrestored` recharge la page.

### 4.5 Confort

- **Effets atténués** : `reducedMotionActive()` (pur sur `settings.reducedMotion` et `matchMedia('(prefers-reduced-motion: reduce)')`). Actif : flash du tir à 0,06 d'opacité au lieu de 0,22, aucune secousse (`K.shake` sans effet), glitchs des cinématiques à un tiers d'intensité et sans glitchs d'ambiance, fondus gardés. Le kit reçoit l'option par `playCinematic(id, { reducedMotion })`, sans édition des scènes générées.
- **Plein écran** : bouton dans les Paramètres (`requestFullscreen` sur `document.documentElement`, `exitFullscreen` sinon), qui marche aussi sous Electron ; libellé à jour selon `fullscreenchange`.

### 4.6 Précompilation

Quand un briefing se joue avant une mission, la carte de la mission est montée **pendant** le briefing (le rendu WebGL est déjà arrêté pendant les cinématiques), puis `renderer.compile(scene, camera)` est appelé. `startLevel` réutilise la carte montée au lieu d'en construire une autre. Sans briefing (réessai), le comportement reste celui d'aujourd'hui. Mesure : durée de la première image de la mission dans `?memtest`, avant et après.

## 5. Tests

- **Niveau 1, jsdom** : `tests/gfx/dispose.test.js` avec une aide qui s'abonne aux événements `dispose` (c'est par eux que le renderer décompte). Pour chaque carte (`vi.mock` de `scene.js` avec une vraie `THREE.Scene`), pour un PNJ (GLTFLoader simulé qui renvoie un petit `SkinnedMesh` avec os et clip), pour les effets, le cadenas, les jeeps et l'arène PvP : **100 % des ressources possédées libérées et 0 ressource marquée partagée libérée**. Témoin rouge : sur le code actuel, `clear()` ne libère rien.
- **Niveau 2, faux renderer comptable** : `tests/gfx/fakeRenderer.js` compte les géométries vues et les textures d'os comme le vrai (`WebGLGeometries.get`, création de texture d'os) et les décompte au `dispose`. Scénario : rue, les 6 cartes, rue ; 10 montages de M6 ; 5 arènes PvP. Les compteurs reviennent exactement à la référence.
- **Pur** : `frameStats`, `presetFor`, `createResolutionController`, `reducedMotionActive`, migration des réglages.
- **Niveau 3, Chrome réel** : `node scripts/memtest.mjs` avec les seuils du §6, lancé en fin de lot et consigné.

## 6. Critères de fin

| Critère | Seuil |
|---|---|
| Niveau 1 | 100 % des ressources possédées libérées ; 0 ressource partagée libérée |
| Niveau 2 | Δ géométries = 0 et Δ textures = 0 après chaque cycle |
| Chrome réel, partie complète (menu, M1 à M6, menu) | géométries ≤ référence du menu + 2 % ; textures ≤ référence du menu + 2 |
| Chrome réel, 10 montages de M6 | Δ = 0 entre le 2ᵉ et le 10ᵉ (géométries, textures, programmes) |
| Chrome réel, PvP | Δ = 0 après la 1re arène |
| Triangles rendus en M6, vue de départ | Moyen ≤ 1,5 M ; Bas ≤ 0,8 M (ombres des personnages coupées) |
| Chargement | aucune mission ni manche ne démarre avec des PNJ procéduraux si les modèles sont encore en cours de chargement (test sur `launchLevel` extrait) |
| Confort | les trois réglages d'effets atténués changent bien l'opacité du flash et les appels de secousse (tests) |
| Général | `npx vitest run` vert ; `npx vite build` sans erreur ; aucune régression visuelle sur les captures de M1, M3, M5, M6 et d'une cinématique comparées avant et après |

Relecture de L3 : le critère « partie complète » ne peut pas tenir tel qu'écrit, le menu de départ n'ayant dessiné aucun personnage alors que les ressources des modèles GLB (partagées) restent au GPU après leur premier dessin. Reformulation proposée dans la tâche L8 du plan, à acter par le porteur de la spec ; le critère ci-dessus reste celui en vigueur d'ici là.

Relecture de L4 : le seuil Bas des triangles de M6 (0,8 M) ne peut pas tenir avec les leviers de ce lot. En Bas, plus aucun personnage ne projette d'ombre, et les 27 PNJ de M6, tous dans le champ à la vue de départ, font à eux seuls 1,33 M triangles ; la carte en fait moins de 3 000 (mesure du 9 octobre 2026, README des annexes). Seuls des niveaux de détail des foules (lot poids) feraient descendre ce chiffre. Le seuil Moyen (1,5 M) tient : 1,42 M. Reformulation proposée dans la tâche L8 du plan, à acter par le porteur de la spec.

## 7. Risques

- **Libérer une ressource partagée** (modèles noirs ou sans texture) : traité par le marquage au chargement et par le test « 0 partagé libéré ».
- **Personnages qui disparaissent en bord d'écran** avec le hors champ : sphère généreuse et test sur l'image la plus étendue du clip ; vérification par capture.
- **Montage pendant le briefing** : la mission ne doit jamais apparaître sous la cinématique (le rendu est arrêté en phase `briefing`) ; si le briefing est passé très vite, `startLevel` attend la fin du montage.
- **Résolution dynamique qui oscille** : hystérésis et un changement par seconde au plus, testés.
- **Mesure sous SwiftShader** : les durées d'image n'y valent rien ; seuls les compteurs (géométries, textures, programmes, triangles, appels) servent de critère.
