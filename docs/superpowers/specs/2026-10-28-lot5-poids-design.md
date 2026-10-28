# Lot 5 : légèreté et poids (conception)

> Rangé dans le dépôt le 28 octobre 2026. Les autres documents de conception cités par leur seul nom (`feuille-de-route.md`, `kill-cams-design.md`, `poids-design.md`, etc.) sont dans `C:/Users/shark/Sniper-Game-reprise/.superpowers/sdd/2026-10-28-conceptions/` (hors dépôt), comme le journal `.superpowers/sdd/2026-10-07-reprise/progress.md`.

> Conçu le 28 octobre 2026 par l'architecte, à partir de deux rapports de lecteurs en lecture seule (modèles GLB ; code et livrable), revérifiés dans l'instantané `C:\Users\shark\Sniper-Game-jeu` (`main`, commit `3cd328d`). Les numéros de ligne valent pour cet instantané : **les revérifier** après chaque fusion du lot 3, qui déplace `src/maps.js`, `src/main.js`, `src/npc.js` et `src/characters.js`.
> Légende : **[V]** vérifié dans le code ou les fichiers ; **[L1]**, **[L2]** chiffre mesuré par le lecteur 1 ou 2 (émulation ou build en mémoire), repris tel quel ; **[D]** déduit, calculé ou proposé.
> Contexte de décision : Rayan garde **M4 à 430 m** (« fais le dur », décision 11 de la spec du lot 3, `docs/superpowers/specs/2026-10-11-lot3-distances-missions-design.md:266`) ; le repli à 250 m que proposait la sonde est écarté. Toute mesure de lisibilité de ce lot se fait donc à 430 m, à ×20, en Bas : 63 px pour Verne dans le tampon (sonde S0, même fichier l.268-269).
> Chantiers voisins conçus le même jour, dans ce dossier : cinématiques v2 (`cinematiques-v2-*.md`, sa tâche C0 crée elle aussi `scripts/poids.mjs`), kill-cams (`kill-cams-*.md`, lot 4), bar de M5 (`m5-bar-*.md`, ses tâches s'appellent B0 à B19), multijoueur (`multijoueur-*.md`, lot 6, tâches R et P). Hors de ce dossier, les tâches de ce lot se citent avec le préfixe L5 (L5-G1, L5-J2…) ; les tâches du bundle s'appellent J1 à J4 pour ne pas se confondre avec celles du bar.

## 0. Contexte et demande

### 0.1 La demande (REPRISE.md:100)

GLB compressés avec gltf-transform (gratuit), animations partagées (environ 6,3 Mo en double), niveaux de détail des foules (0,8 M triangles en Bas à la vue de départ de M6, reporté du lot 1), chargement à la demande (24,9 Mo de modèles partent avant tout clic), bundle principal sous 700 kB (816 kB aujourd'hui), build Electron hors ligne. Le lot 3 change les cartes (longue distance en M3, M4, M5) et le bar de M5 ajoute un intérieur vu à 2 m.

### 0.2 Contraintes de tout le jeu

- Rien de payant : gltf-transform, meshoptimizer et electron-builder sont sous licence MIT ; aucun service, aucun certificat de signature, aucune voix (les bips restent).
- PC de milieu de gamme, budgets du lot 1 (spec du lot 1 §6, `scripts/memtest.mjs:59`).
- Style « dossier du fixeur » : ce lot ne touche ni texte ni mise en scène ; il ne doit ni montrer, ni trahir (la cible ne se distingue jamais par son niveau de détail, comme pour l'ombre, `src/gfx/quality.js:28-32` [V]).

### 0.3 Ce que le code impose [V]

| Constat | Où |
|---|---|
| Les 7 GLB partent au chargement de la page, avant tout clic | `src/main.js:134` (`preloadCharacters()`), `src/characters.js:96-124` |
| Un seul `GLTFLoader`, sans décodeur meshopt ; un fichier compressé échouerait **en silence** (PNJ procéduraux) | `src/characters.js:58`, `:113-115` ; erreur levée `node_modules/three/examples/jsm/loaders/GLTFLoader.js:1614-1621`, réglage `:376` |
| Décodeur fourni par three, WASM intégré, 29 256 o | `node_modules/three/examples/jsm/libs/meshopt_decoder.module.js` |
| GLTFLoader et SkeletonUtils importés statiquement (donc dans le démarrage) | `src/characters.js:2-3` ; `src/main.js:11` |
| PvP, kit des cinématiques, panneau de performances importés statiquement | `src/main.js:12`, `:13`, `:29` |
| Le kit entre aussi par l'audio : `audio.js` importe `createRain` de l'ambiance de l'enquête, qui importe `briefing/sound.js` et `briefing/kit.js` | `src/audio.js:4`, `src/prologue/ambience.js:3-4` |
| `THREE.LOD` divise la distance par `camera.zoom`, alors que la lunette change `fov` | `node_modules/three/src/objects/LOD.js:259`, `src/main.js:1329-1332` |
| `scene.onBeforeRender` est appelé **avant** la projection des objets et avant la passe d'ombre : un changement de géométrie fait là vaut pour l'image | `node_modules/three/src/renderers/WebGLRenderer.js:1650`, `:1681`, `:1708` |
| Le téléphone va sur le premier os dont le nom contient « hand » et un « r » : le « r » de « mixamorig » choisit LeftHand | `src/npc.js:338` |
| `_playClip` retombe sur le premier clip (Idle) ; `die` retombe sur une chute procédurale sans clip Death | `src/npc.js:352-358`, `:611-623` ; `src/characters.js:224` |
| Ressources partagées jamais libérées | `src/gfx/dispose.js:83-90` |
| Ressources des modèles publiées pour le memtest, jamais écrites en dur | `src/characters.js:68-70` |
| Tirages du PvP à graine, pools rangés dans l'ordre de `MODELS` | `src/characters.js:101-105`, `src/pvp.js:100-104`, `:525` |
| Foule PvP de 54 | `src/pvp.js:456` |
| `three` en dépendance de production ; seuls `dist/**` et `electron/**` empaquetés | `package.json:32-33`, `:20-23` |
| Electron charge `dist/index.html` en `file://`, `contextIsolation`, sans préchargement | `electron/main.js:20-23`, `:32` |
| Les outils attendent les 7 modèles avant le clic | `scripts/capture-mission.mjs:164-166`, route memtest `src/main.js:1652` |
| Tests qui lisent les vrais GLB : exactement 7 fichiers, chargeur sans décodeur, clips Idle et Talk pris dans le modèle | `tests/shot/glb-bones.test.js:35`, `:47`, `:63`, `:76` ; `tests/assets.test.js:29-33` |
| Maillages des modèles : 5 modèles ont un maillage `ChNN_Eyelashes` ; `mafia_henchman` a un seul maillage (`Ch15`, 2 primitives), `mafia_boss` deux (`vanguard_visor`, `vanguard_Mesh`) ; une seule scène glTF par fichier | en-têtes des 7 GLB (lecture Node) |

### 0.4 Mesures de départ

| Poste | Aujourd'hui | Source |
|---|---|---|
| Modèles | 24 862 676 o : géométrie 14,30 Mo, animations 7,54 Mo, JSON 1,75 Mo, textures WebP 512² 1,23 Mo | [L1], [L2] concordants |
| Animations en double | 18 clips sur 20 ont leurs rotations identiques au bit près dans les 7 fichiers ; seule la piste des hanches change (rapport des hauteurs de hanches) ; Idle et Walk sont propres à chaque modèle | [L1], [L2] |
| JS de démarrage | `index` 816 532 o (gzip 223,2 kB), dont three ≈ 602,7 kB et GLTFLoader + SkeletonUtils + BufferGeometryUtils ≈ 49,0 kB | [L2] |
| M6, vue de départ | Bas 290 appels, 1 330 361 triangles ; Moyen 294, 1 422 955 | `docs/superpowers/specs/annexes/README.md` [V] |
| Arène PvP | 445 appels, 2 748 345 triangles | idem [V] |
| Electron | jamais lancé sur ce PC (binaire absent de `node_modules/electron`), jamais empaqueté | [L2] |

### 0.5 Écarts entre les lecteurs, et ce que je retiens [D]

| Sujet | Lecteur 1 | Lecteur 2 | Retenu |
|---|---|---|---|
| Où ranger le fichier de clips | `public/models/clips_mixamo.glb` | `public/models/animations/` (ne casse pas `glb-bones.test.js:35`) | **`public/models/animations/clips_mixamo.glb`** |
| Seuil des niveaux | 0,5 px partout | 1 px en Bas, 0,5 en Moyen, 0,25 en Haut | **par préréglage** (Bas 1, Moyen 0,5, Haut 0,25), en pixels du tampon |
| Hystérésis | 20 % | ±10 % | **20 %** (passe au niveau grossier sous 0,8 × seuil, revient au fin au-dessus du seuil) |
| Quand passer à la compression avec perte | après le lot 4 | non tranché | **juste après la fusion de 3a**, avant les captures de 3b, pour que Rayan ne juge les captures qu'une fois (§2.4) |
| Chargement à la demande : avant le premier clic | 0 GLB | 0 GLB après 5 s au menu | **décision 1 pour Rayan** ; recommandation : l'ensemble de la mission proposée, au repos du menu (§3.5) |
| Modèles de M5 | (casting du lot 3 : 1,1 Mo) | `mafia_boss` seul | **`mafia_boss`, plus `gangster_man_02` et `mafia_woman_03` du bar** (casting du bar, `m5-bar-design.md:150`) : environ 2,4 Mo compressés |
| Plafond d'un ensemble de mission | 2,6 à 3,4 Mo | ≤ 4 Mo | **≤ 4,0 Mo** : M1 (cible, garde, deux civils, clips) est estimé à 3,4 Mo sans niveaux [D, tailles de l'étape B du L1], 3,5 Mo avec ; 3,5 serait un plafond sans marge |
| Fonction `meshopt()` de gltf-transform | « `meshopt()` au niveau high » | étapes explicites | **extension posée à la main** après nos propres `reorder` et `quantize` (§3.3) : la fonction `meshopt()` relance `reorder` et `quantize` [D, comportement des versions 3 et 4, à relire dans `@gltf-transform/functions` au début de G1] et casserait les niveaux qui partagent leurs sommets |

## 1. Découpage du lot

Six chantiers, de risque très inégal :

| Chantier | Gain pour le joueur | Risque | Dépend du lot 3 |
|---|---|---|---|
| **Livrable Electron** (fumée, paquet) | le jeu marche une fois installé | **élevé et inconnu** : jamais lancé | non (mais coordonné avec le lot 6, qui touche `electron/` et `package.json`) |
| **Mesure du poids** (`scripts/poids.mjs`) | aucun (outil) | faible | non |
| **Modèles** (pipeline sans perte, puis avec perte) | 24,9 vers ≈ 5,5 Mo à lire ; 7,5 vers 1,5 Mo de clips en mémoire | moyen (maillages animés quantifiés) | intégration après la fusion de 3a pour l'étape avec perte |
| **Chargement à la demande** | plus rien avant le premier clic ; ≤ 4,0 Mo par mission | moyen (hasard des captures, PvP) | casting de 3a (A2, A6) |
| **Niveaux de détail** | M6 Bas de 1,33 à ≈ 0,2 M triangles ; arène de 2,75 à ≈ 0,5 M | moyen (popping, fuite d'identité) | 3a (profil de caméra dans `scene.js`) ; vérification à 430 m après 3c ; contrat avec le lot 4 |
| **Bundle** | 10 à 20 ms d'analyse [L2] ; surtout une hygiène contre la croissance | faible par morceau, mais budget serré (5,7 kB de marge) | `main.js` après 3a ; cartes après 3d ; PvP avec le lot 6 |

**Le livrable Electron passe en premier** : si `fetch` ou les modules ES échouent sous `file://`, toutes les autres mesures (faites sur le serveur de dev) seraient trompeuses.

## 2. Approches envisagées

### 2.1 Compression des modèles

| | Approche | Pour | Contre |
|---|---|---|---|
| A | `gltf-transform optimize` en ligne de commande | une commande | ferait `join` (casse la teinte par maillage du lot 3, Ch01_Shirt de Marc, spec lot 3 l.93), `simplify` du LOD0, réencodage des WebP, `resample` des clips ; pas de partage entre fichiers [L1] |
| **B (reco)** | **Script sur l'API gltf-transform** (`scripts/modeles.mjs`) en étapes explicites : partage des clips, `prune` réglé, puis `reorder`, `quantize`, niveaux, `meshopt` ; décodeur meshopt de three chargé à la demande | contrôle total ; partage entre fichiers ; niveaux qui réutilisent les sommets ; décodeur sans fichier à servir (Electron hors ligne) | un script à maintenir (≈ 300 lignes [D]) |
| C | Draco (+ KTX2 pour les textures) | ratio de géométrie | ne compresse pas les animations ; fichiers wasm à servir (`setDecoderPath`) ; décodage plus lent ; KTX2 inutile pour 39 Mio de textures [L1] |
| D | gltfpack | aussi bon que B sur un fichier | pas de partage entre fichiers ; rééchantillonne les clips à 30 Hz par défaut [L1] |

### 2.2 Partage des animations

| | Approche | Pour | Contre |
|---|---|---|---|
| **A (reco)** | **Rotations partagées, hanches propres** : `clips_mixamo.glb` porte les rotations des 18 clips communs ; chaque modèle garde Idle, Walk et ses 18 pistes de hanches | **identique au bit près** (captures à l'octet) | composition au chargement |
| B | Hanches partagées, mises à l'échelle au chargement | un peu plus simple | 0,20 mm d'écart : captures non identiques [L1] |
| C | Tout partager sans correction | le plus simple | pieds qui flottent ou s'enfoncent : 94 mm pour `mafia_boss` (gardes de M4, escorte de M5, bar), 61 mm pour le garde [L1] |

### 2.3 Niveaux de détail

| | Approche | Pour | Contre |
|---|---|---|---|
| A | `THREE.LOD` | fourni | choisit par `distance / camera.zoom` (`LOD.js:259`) : faux sous la lunette, qui change `fov` ; un objet par niveau, donc trois squelettes ou des contorsions |
| **B (reco)** | **Une géométrie par niveau, mêmes attributs de sommets, seuls les index changent** ; chaque instance garde son `SkinnedMesh` et change `mesh.geometry` dans `scene.onBeforeRender`, selon l'**erreur projetée en pixels du tampon** | un seul squelette ; aucune texture d'os en plus ; même nombre d'appels ; marche pour toute caméra (jeu, PvP, memtest, kill-cam) | un module de choix et un crochet par scène |
| C | Imposteurs (sprites) pour la foule lointaine | très léger | animation perdue, style dégradé, inutile à ces distances |

### 2.4 Où placer l'étape avec perte

| | Moment | Pour | Contre |
|---|---|---|---|
| A | Après le lot 4 [L1] | une seule passe de captures à la fin | Rayan juge les captures de 3b, 3c, 3d et du lot 4, puis tout encore une fois |
| **B (reco)** | **Juste après la fusion de 3a**, avant les captures de 3b | les captures que Rayan juge en 3b, 3c, 3d, au bar et au lot 4 sont déjà les définitives | demande une preuve sans l'œil de Rayan : fidélité géométrique et comparateur à tolérance (§7) |

### 2.5 Bundle

| | Approche | Pour | Contre |
|---|---|---|---|
| A | Un seuil chiffré seul (700 000 o) | simple | les lots 3, 4 et 6 mangent la marge de 5,7 kB [L2] sans prévenir |
| **B (reco)** | **Règle de structure + seuil** : liste de modules interdits au démarrage (tout ce qui est propre à une mission, au PvP, aux cinématiques, à l'enquête, au bar, aux modèles) gardée par test, plus ≤ 700 000 o | le budget tient par construction ; une régression nomme son module | une liste à tenir à jour |
| C | Alias `three` vers `three/src` (−31,1 kB réels [L2]) | gain net | non documenté par three, risque d'ordre d'évaluation entre morceaux : **réserve**, activée seulement si B ne suffit pas, après un parcours complet |

## 3. Conception détaillée

### 3.1 Mesure du poids (`scripts/poids.mjs`)

- `build()` de Vite en mémoire (`configFile` du projet, `build.write: false`), environ 0,3 s [L2]. Aucun fichier écrit.
- `checkPoids(rapport, budgets)` **pur** (testé sous vitest) :
  - **démarrage** = l'entrée plus la fermeture de ses imports statiques (déjoue un morceau « Ray » importé statiquement) ;
  - **modules interdits** au démarrage, par motif sur les `moduleIds` des morceaux de démarrage : `src/pvp*`, `src/pvp/`, `src/briefing/`, `src/prologue/`, `src/bar/`, `src/maps/m[1-6]`, `src/campaign/missions/m[1-6]`, `three/examples/jsm/loaders/GLTFLoader`, `SkeletonUtils`, `BufferGeometryUtils`, `meshopt_decoder`, `?raw` ; la liste vit dans `budgets.js` et se durcit par tâche (§10) ;
  - **taille de chaque morceau** à la demande ;
  - **fichiers livrés** : `public/models/**` ; le budget des cinématiques (images de `public/briefing/img` plus morceaux des scènes, ≤ 1 500 000 o, `docs/superpowers/specs/2026-10-02-cinematiques-design.md:151`, enquête comptée ou non selon la décision D1 des cinématiques v2) ; aucun fichier audio (les bips restent) ;
  - sortie JSON, code 1 si dépassement (`--check`), `--annexe=<nom>.json`.
- Annexe « avant le lot 5 » écrite en premier (816 532 o, 24 862 676 o).
- **Un seul script, deux chantiers** : la tâche C0 des cinématiques v2 crée aussi `scripts/poids.mjs` et `tests/scripts/poids.test.js` (`cinematiques-v2-plan.md`, C0), sur `dist/` après `npx vite build`. Règle : **le premier fusionné dans `main` crée le script, l'autre l'étend** sans changer les options déjà publiées (`--check`, `--avec-enquete`). **Arbitrage de l'intégrateur** (`feuille-de-route.md` §4, n° 3) : les cinématiques v2 démarrent tout de suite et ce lot attend une copie libre, donc **C0 crée** le script (partie pure exportée `sommePoids`) et **E0 l'étend** (build en mémoire, `demarrage`, `checkPoids`, `scripts/budgets.js`), en gardant les options, le seuil de 1,5 Mo et le test de C0. La conversion des portraits en WebP n'est **pas** de ce lot : C0 en est le seul propriétaire (la tâche K9 du lot 4 est retirée).

### 3.2 Livrable Electron

**Fumée sans fenêtre visible** (le bureau de Rayan reste intact) :
- `electron/main.js` gagne un mode `--fumee` : `BrowserWindow({ show: false })` (une fenêtre montrée malgré tout est recachée et la fumée sort rouge), le bloc `webPreferences` du jeu inchangé (identique dans les deux modes, jamais `webSecurity: false` : testé) ; page jamais ralentie par `webContents.setBackgroundThrottling(false)`, posé avant le premier chargement (même effet que `backgroundThrottling: false` dans `webPreferences`, bloc laissé à la tâche R5 du lot 6) ; son coupé ; `session.webRequest.onBeforeRequest`, sans filtre, qui **bloque et compte** toute requête `http`, `https`, `ws`, `wss` (une préconnexion, WebRTC ou un partage `file://hôte` échappent au compte : README des annexes) ; journal des échecs de chargement (`did-fail-load`, erreurs de console, `[characters] échec`) ; exceptions du processus principal rattrapées (jamais la boîte de dialogue d'Electron) ; délais de garde de 60 s par étape et de 3 min en tout ; une ligne `[fumee] debut` écrite dès le départ, puis `[fumee] {json}`.
- `scripts/fumee.mjs` refuse d'abord, en 2 et sans rien lancer : un argument autre que `--exe=<chemin non vide>`, un build absent ou **périmé** (un fichier de `src/`, `public/`, `index.html` ou `vite.config.js` plus récent que `dist/index.html`, ou que `resources/app.asar` avec `--exe`, `electron/` compris), un paquet sans mode `--fumee` (la chaîne absente de `app.asar` : paquet d'avant E1). Il imprime la date du build vérifié, le commit et les lignes de `git status --porcelain`, crée un profil jetable vide, lance `electron . --fumee --profil=<profil>` avec le binaire Electron de `node_modules` (lu sans `require('electron')`, qui le téléchargerait), ou le jeu empaqueté par `--exe=release/win-unpacked/Sniper.exe` (E2). Il l'arrête avec ses processus fils (`taskkill /T`, code 2) sans `[fumee] debut` au bout de 30 s ou au délai de garde de 5 min, le nettoie sur Ctrl+C (arbre arrêté, profil supprimé, code 130), lit le résultat, puis supprime le profil. `--profil=<chemin absolu>` est **obligatoire** et désigne un dossier existant et vide : sinon, ou refusé par Electron, la fumée sort en 1 sans fenêtre ni dossier créé, jamais sur le profil du joueur.
- Le scénario vit dans `electron/main.js`, qui pilote la page par `webContents.executeJavaScript` depuis le processus principal (pas de port de débogage) : premier lancement sur le profil vierge (le menu propose COMMENCER ; sinon arrêt, rouge, avant toute écriture), sauvegarde posée (M3 en cours, briefing de M3 pas vu) et page rechargée, menu (REPRENDRE : MISSION 3) et modèles de la mission (ou tous avant D2), aucun PNJ procédural (en build, attributs `data-modeles` et `data-modeles-echecs` posés sur `<html>` par `preloadCharacters`), REPRENDRE, qui joue la cinématique m3 par le chemin du joueur (la route `?cine=m3&freeze=…` n'existe qu'en développement, dans le bloc `import.meta.env.DEV` de `src/main.js`), ses `<img>` vérifiées (`complete`, `naturalWidth > 0`), Échap jusqu'à la mission (HUD), rechargement, sauvegarde relue (REPRENDRE va droit à la mission) ; sortie sur un code (0 vert, 1 rouge ; le script rend 2 sans résultat) et un JSON `{ electron, origine, echecs, requetesBloquees, modeles, images, mission, sauvegarde, dureeMs }`.
- **Risque levé le 28 octobre 2026 (E1)** : `fetch` sur `file://` (three charge par `fetch`) et les modules ES sous `file://` (script d'entrée en module, morceaux chargés par `import()`) marchent dans Electron 42.5.0 : fumée verte sur `dist/`, sans protocole propre. Repli gardé si une version d'Electron ou l'asar (E2) cassait `file://` : **protocole propre** documenté par Electron, gratuit : `protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])`, `protocol.handle('app', …)` qui sert `dist/` (chemins normalisés, rien hors de `dist/`), `loadURL('app://jeu/index.html')` ; il changerait l'origine des sauvegardes (point suivant).
- **Origine des sauvegardes** : `localStorage` dépend de l'origine. **Origine retenue : `file://`** (fumée E1 verte sous `file://` le 28 octobre 2026, protocole `app://` non nécessaire ; décision T3 de `feuille-de-route.md` §5). Aucune version n'a été publiée, donc changer d'origine maintenant ne perdrait rien ; **après la première version publiée, ne plus jamais la changer** (écrit dans REPRISE.md à Z1). Le lot 6 vérifie l'expéditeur des IPC (`file://`, multijoueur-design §3.5) : c'est l'origine retenue ici (coordination, §9) ; sous `file://`, l'origine seule ne désigne pas le jeu, d'où la recommandation du README des annexes (l'URL exacte chargée par le processus principal).

**Paquet** :
- `three` passe en `devDependencies` (Vite l'embarque dans `dist/`) ; seule dépendance de production permise : `ws` (lot 6, relais embarqué).
- `build.asarUnpack` vide ; `app.asar` sans `node_modules` hors `ws`.
- Si la création de liens symboliques est refusée (Windows sans mode développeur), `win.signAndEditExecutable: false` [L2]. Aucune signature (payante) : l'avertissement SmartScreen est attendu (décision 5).
- Construire l'installeur télécharge une fois NSIS et winCodeSign (gratuits) ; installer le binaire Electron (`node node_modules/electron/install.js`) télécharge environ 100 Mo depuis GitHub (gratuit) [D].

### 3.3 Pipeline des modèles (`scripts/modeles.mjs`)

**Dossiers** : les 7 GLB actuels passent de `public/models/` à `modeles/sources/` (déplacement git, mêmes blobs, aucun poids d'historique) ; la sortie va dans `public/models/` (7 GLB) et `public/models/animations/clips_mixamo.glb` ; un manifeste `public/models/modeles.json` donne, par fichier, l'empreinte sha256 de la source et de la sortie, les options, les versions des outils, les triangles par niveau et les erreurs relatives des niveaux. `public/models/README.txt` renvoie au script (ajout d'un modèle).

**Outils** (devDependencies, MIT) : `@gltf-transform/core`, `@gltf-transform/extensions`, `@gltf-transform/functions`, `meshoptimizer`. Versions figées dans `package.json` (pas de `^`) pour que la sortie soit reproductible.

**Étape A, sans perte** (`node scripts/modeles.mjs --etape=a`) :
1. Lecture des 7 sources ; contrôle d'identité : pour chacun des 18 clips communs, chaque piste de rotation (nom d'os sans préfixe `mixamorigN:`, temps, valeurs) est **identique au bit près** à celle de `gangster_man_01` ; sinon arrêt avec le nom du modèle, du clip et de l'os (un futur modèle en costume doit passer ce contrôle ou être reciblé).
2. Écriture de `clips_mixamo.glb` : un squelette de 65 os nommés `mixamorig:<Os>` (sans maillage, **posés dans une scène**, sinon `prune` les retire avec les canaux qui les visent) et les 18 clips communs, rotations seulement, dans l'ordre d'origine. Côté jeu, GLTFLoader nomme les pistes d'après les nœuds en retirant les deux-points (`GLTFLoader.js:3703-3705` [L1]) : `mixamorigHips.quaternion`, renommé au chargement vers le préfixe du modèle (§3.5).
3. Dans chaque modèle : les 18 clips communs ne gardent que la piste de translation des hanches (même nom de clip, même place dans la liste) ; Idle et Walk restent entiers.
4. `prune` avec `keepLeaves: true` (HeadTop_End doit survivre, sinon la zone de la tête tombe sur le repli de `src/shot/hitzones.js:78-81` [L1]) ; pas de `dedup` (0 doublon dans un fichier [L1]), pas de `weld`, pas de `join`, pas de `reorder`, pas de `resample`, textures intouchées.
5. `EXT_meshopt_compression` en mode sans filtre (codec d'octets sans perte) sur attributs, index et animations.
6. Résultat attendu : ≈ 10,8 Mo (−56 %) [L1] ; **captures identiques à l'octet**.

**Étape B, perte contrôlée** (`--etape=b`, défaut une fois validée) :
1. `reorder` (cache de sommets, puis ordre de lecture) sur le LOD0.
2. `quantize` : positions 14 bits, normales octaédriques **8 bits** (ou 12, décision 2), tangentes 8 bits, UV 12 bits, poids 8 bits, indices d'os en u8, rotations des clips en quaternions 16 bits, translations des hanches en exponentiel 12 bits [L1].
3. Niveaux (§3.4), **après** `reorder`, `quantize` et le dernier `prune`.
4. Extension `EXT_meshopt_compression` posée directement (`doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: FILTER })`), **sans appeler la fonction `meshopt()`**, qui relancerait `reorder` et `quantize` sur des primitives qui partagent désormais leurs sommets [D, à relire dans les sources de `@gltf-transform/functions` au début de G1 ; si la fonction ne le fait pas, le résultat est le même].
5. Résultat attendu : ≈ 5,25 Mo sans niveaux, ≈ 5,5 Mo avec [L1].

**Ce qui ne bouge jamais** : les noms d'os (préfixes gardés : `npc.js:338` choisirait sinon une autre main, sans test rouge), les noms de maillages (teinte par maillage du lot 3), le nombre et l'ordre des primitives (appels de dessin), les textures, les noms et l'ordre des clips (Idle en tête).

### 3.4 Niveaux de détail

**Génération** (dans le pipeline, après `reorder` et `quantize`) :
- `MeshoptSimplifier.simplify` sur les index de chaque primitive, sans `LockBorder` (vêtements ouverts) [L1] : LOD1 à 50 % des triangles, LOD2 à 15 %. Les coutures d'UV sont tenues par le simplificateur, qui reconnaît les sommets de même position. Si une articulation se déforme mal en LOD1 (simplification faite en pose de liaison, sans les poids), passer à `simplifyWithAttributes` avec les poids de peau comme attributs [D] ; le critère reste l'erreur projetée sous le pixel.
- **Plancher** : une primitive de moins de 1 000 triangles n'est pas simplifiée (la chemise de 992 triangles de `mafia_woman_02` donnerait 55 mm d'erreur [L1]) ; `mafia_boss` n'est pas réductible (soupe de triangles à arêtes vives [L1]) : ses LOD1 et LOD2 sont son LOD0.
- **Cils** (`ChNN_Eyelashes`, 5 modèles [V]) : index vides en LOD1 et LOD2 (three ne dessine rien pour un compte nul : un appel de moins par PNJ).
- **Erreur relative** de chaque niveau (`erreur / hauteur du modèle`, maximum sur ses primitives, mesurée en pose de liaison) écrite dans `asset.extras.niveaux = [0, e1, e2]` du GLB et dans le manifeste.
- **Transport** : maillages **détachés** nommés `<maillage>#n1` et `<maillage>#n2` (aucun nœud ne les porte), dont les primitives réutilisent les **mêmes accesseurs** d'attributs et ne portent qu'un accesseur d'index neuf. Le simplificateur ne crée aucun sommet : poids et indices d'os restent valides [L1]. Repli si gltf-transform élague ces maillages ou si leur lecture coûte trop : seconde scène glTF `niveaux` (GLTFLoader charge toutes les scènes).

**Au chargement** (`src/gfx/niveaux.js`, partie three) :
- pour chaque primitive du LOD0, `parser.getDependency('mesh', i)` sur `#n1` et `#n2`, puis deux `BufferGeometry` qui **partagent** les attributs du LOD0 (mêmes objets) et prennent l'index du niveau ; rangées dans une `Map` du module, **jamais dans `userData`** (recopié en JSON à chaque clonage, `three/src/core/Object3D.js:1628` [L1]) ;
- marquées partagées (`markShared`) et ajoutées à `modelResources()` (sinon le critère « partie complète » du memtest échoue [L1]).

**Choix du niveau** (`src/gfx/niveaux.js`, partie pure) :
```js
// hauteurPx = hauteur du personnage projetée en pixels du tampon de dessin (densité et résolution dynamique comprises)
// erreurs = [0, e1, e2] (relatives) ; seuilPx selon le préréglage ; precedent = niveau de l'image d'avant
export function niveauPour(hauteurPx, erreurs, seuilPx, precedent = 0)   // → 0, 1 ou 2
export const SEUIL_PX = { bas: 1, moyen: 0.5, auto: 0.5, haut: 0.25 }
export const HYSTERESIS = 0.8
```
- Règle : le niveau le plus grossier `k` tel que `erreurs[k] × hauteurPx ≤ seuilPx` ; pour passer à un niveau plus grossier que `precedent`, il faut `≤ HYSTERESIS × seuilPx` (pas de clignotement).
- `hauteurPx = fit / (2 · d · tan(fov/2)) × hauteurTampon`, `d` la distance de la caméra au centre de la sphère d'instance (`src/characters.js:154-164`).
- **Aucune exception de rôle** : cible, garde, civil, commanditaire et avatar PvP suivent la même règle (sinon la cible se trahit par son détail).
- **Crochet** : `poserCrochetNiveaux(scene, renderer, { personnages, preReglage })` règle `scene.onBeforeRender` (appelé avant la projection et la passe d'ombre, `WebGLRenderer.js:1650` [V]) ; la caméra qui rend décide (jeu, lunette, PvP, memtest, kill-cam du lot 4). Coût : 27 à 55 personnages, quelques opérations chacun, ≤ 0,05 ms [D].
- **Contrat avec le lot 4** : `forcerNiveau(personnage, 0 | null)` ; la kill-cam force le LOD0 sur `dernierTirMortel.cibleId` pendant le ralenti (spec du lot 3 §2 c), puis rend la main. Sa caméra s'arrête à 1,2 m de la cible (`kill-cams-design.md:65`) : la règle choisirait déjà le LOD0, le forçage évite seulement un saut de niveau pendant l'approche rapide. Sa passe du monde (`rendre`, tâche K5 du lot 4) passe par `renderer.render(monde, camKill)` : le crochet voit `camKill` et choisit pour elle ; la passe du gréement (scène à part, sans personnage) ne coûte rien de plus.
- **Le bar de M5** (personnages à 2 m) est toujours en LOD0 par la règle même ; il pose le crochet sur sa scène s'il veut le bénéfice, sans obligation.
- **Ce qui ne change pas** : les zones de tir lisent les os (`src/shot/hitzones.js:71`), le PvP ses boîtes ; les sphères d'instance sont sur le maillage, pas sur la géométrie ; le mode `pilote` de `NPC` (lot 6) n'est pas concerné.

**Effet attendu [D, d'après L1]**, en centimètres par pixel de 1080 lignes : M6 sans lunette 4,06 ; M6 ×4 0,93 ; M4 ×20 à 430 m 2,09 ; kill-cam ≈ 0,2. Avec des erreurs LOD1 de 1,3 à 2,5 mm et LOD2 de 4,5 à 8,7 mm :

| Vue | Bas (tampon 810 lignes, 1 px) | Moyen (1080, 0,5 px) |
|---|---|---|
| M6, vue de départ | LOD2 : ≈ 0,20 M triangles | LOD2 |
| M6 ×4 | LOD2 | LOD1 : ≈ 0,68 M |
| M4 ×20 à 430 m | LOD2 (≤ 0,31 px d'erreur) | LOD2 |
| Bar, kill-cam | LOD0 | LOD0 |

### 3.5 Chargement à la demande

**API** (`src/characters.js`) :
```js
export function chargerModeles(urls)      // Promise ; dédoublonne les fichiers en vol ou chargés ; ne rejette jamais
export function modelesPrets(urls)        // booléen, sans attente
export function avancementModeles(urls)   // 0..1 (progressOf, campaign/loading.js:12)
export const TOUS_LES_MODELES             // les 7 URL, dans l'ordre de MODELS (memtest, captures de référence)
```
- `charactersReady`, `charactersSettled`, `charactersProgress` deviennent des fonctions d'un ensemble (adaptateurs pour `waitForCharacters` et `startWhenReady`, `src/campaign/loading.js:27`, `:56`, inchangés).
- **Ordre des pools** : chaque pool `cache[type]` est **toujours rangé dans l'ordre de `MODELS`**, quel que soit l'ordre d'arrivée.
- **Tirage dans le pool déclaré, jamais dans le chargé** : `spawnCharacter` reçoit la liste de candidats de la mission (ou du PvP) et tire parmi eux ; un candidat déclaré mais non chargé est une erreur en mode strict (lot 3, A6). Sinon un joueur qui a fait M3 avant le PvP tirerait une autre foule que l'autre machine, et les captures dépendraient de l'histoire de la session.
- **Ensembles** : `modelesDeLaMission(mission)` pur, lu dans les données du lot 3 (`src/campaign/missions/mN.js` : casting des cibles, gardes, civils et leurs exclusions ; plus le casting du bar pour M5 quand il existe : 5 `mafia_boss`, 2 `gangster_man_02`, 1 `mafia_woman_03`, `m5-bar-design.md:150`) ; `modelesDuPvp()` = le pool civil (foule et avatar, `src/pvp.js:473`, `:525`). Jamais de liste écrite à la main ailleurs. Estimations à l'étape B [D, tailles par fichier du L1, clips communs compris] : M1 ≈ 3,4 Mo, M4 ≈ 3,2, M6 ≈ 3,3, M5 avec le bar ≈ 2,4, PvP ≈ 2,6.
- **Moments** :
  - décision 1 (reco b) : **au repos du menu** (première image du menu, puis `requestIdleCallback` avec 1 s d'échéance), l'ensemble de la mission que propose le bouton principal (COMMENCER : M1 ; REPRENDRE : MISSION n ; VOIR LA FIN : rien). Une fois les données de mission chargées à la demande (J4), ce repos importe d'abord `src/campaign/missions/mN.js` (quelques kilo-octets), puis les modèles qu'il déclare ;
  - au clic d'une mission : son ensemble s'il n'est pas déjà là, derrière l'écran PRÉPARATION DU DOSSIER du lot 1 (20 s au plus, repli procédural au-delà) ;
  - au clic MULTIJOUEUR : le pool PvP, pendant la création de la partie ;
  - **jamais pendant la phase de jeu** (à-coups sous la lunette) ;
  - aucun déchargement : ≈ 5,5 Mo au total une fois compressés, gardés pour la session comme au lot 1.
- **Cas rare du lot 1** (mission montée en pleine cinématique) : avec la reco b il reste rare (REPRENDRE dans la première seconde) ; il garde son traitement actuel.
- **Décodeur et chargeur** (`src/gfx/gltf.js`) : `chargeurGltf()` renvoie une promesse d'un `GLTFLoader` équipé de `MeshoptDecoder` (attente de `ready`) ; GLTFLoader, SkeletonUtils et le décodeur y sont importés **à la demande** (`import()`), hors du démarrage. Le même chargeur sert le jeu et les tests (`tests/shot/glb-bones.test.js` ne crée plus le sien) : un test ne peut plus passer pendant que le jeu échoue.
- Un import à la demande qui échoue (morceau absent sous Electron) : la mission part avec le repli procédural, sans blocage, et l'échec est écrit dans la console (`[characters] échec`) et compté par la fumée.
- **Décodage hors du fil principal si besoin** : le décodeur de three décode chaque vue de tampon sur le fil principal (`meshopt_decoder.module.js:182-191` [V]) ; il sait aussi le faire dans des workers créés d'un Blob (`useWorkers(n)`, `:167-169` [V]), sans fichier à servir. Recommandation : sans workers par défaut (meshopt décode plusieurs centaines de Mo par seconde [D]) ; `useWorkers(1)` seulement si le scénario `demarrage` mesure une tâche longue de plus de 50 ms au menu sous `RALENTI=4`.

**Composition des clips** (`src/gfx/clips.js`, pur sur des objets three) :
- préfixe d'un modèle = nom de son os Hips moins « Hips » (`mixamorig7`, `mixamorig`, etc.) ;
- pistes partagées recréées par `new t.constructor(nom renommé, t.times, t.values)` : **mêmes tableaux**, pas de copie ;
- clips fusionnés dans l'ordre d'origine, pistes dans l'ordre d'origine, **Idle en tête** (`firstAction`, `src/characters.js:224`) ; aucun `Math.random` ;
- fichier de clips absent ou en échec : les clips réduits aux hanches sont **écartés** (jamais de corps en pose de repos qui glisse) ; `_playClip` retombe sur Idle, `die` sur la chute procédurale.

### 3.6 Bundle

| Ordre | Déplacement | Gain [L2] | Fichiers |
|---|---|---|---|
| 1 | `createRain` sortie dans `src/sons/pluie.js`, réimportée par `audio.js` et `prologue/ambience.js` | rend possible les 31,4 kB du kit | `src/audio.js:4`, `src/prologue/ambience.js` |
| 2 | `kit.css` et `enquete.css` en `?inline` | −3,5 kB | `src/briefing/index.js:3`, `src/prologue/investigation.js:7` |
| 3 | Polyfill de préchargement coupé (`build.modulePreload: { polyfill: false }`), `chunkSizeWarningLimit: 700` | −0,9 kB | `vite.config.js` |
| 4 | GLTFLoader, SkeletonUtils, décodeur à la demande (`src/gfx/gltf.js`) | −45,5 kB | `src/characters.js:2-3` |
| 5 | Kit et scènes à la demande, `.catch` de `cinematic()` gardé | −31,4 kB avec 1 | `src/main.js:13`, `:372` |
| 6 | Panneau de performances seulement sur `?stats=1` ou réglage actif | −1,5 kB | `src/main.js:29`, `:140` |
| 7 | PvP au clic MULTIJOUEUR ; `initMultiplayerMenu` (`src/pvp.js:218`) devient un petit module de menu statique | −29,4 kB | `src/main.js:12`, `:136` |
| 8 | Carte et données de chaque mission chargées avec elle (`prepareLevel` pendant le briefing attend l'import) ; module de la kill-cam (`src/killcam/`, lot 4) chargé au montage de la première mission | −13,6 kB et toute croissance des lots 3 et 4 | `src/maps/m1-rue.js` à `m6-fete.js` (noms de la tâche A1 du lot 3, copie `lot3-socle`), `src/campaign/missions/`, `src/killcam/` |
| Réserve 1 | Alias `three` vers `three/src` | −31,1 kB | `vite.config.js` |
| Réserve 2 | Minifieur terser (MIT) au lieu de celui de Vite | à mesurer | `vite.config.js` |

Les 1 à 8 donnent 694 261 o sur `3cd328d` [L2] : 5,7 kB de marge seulement. Les chantiers voisins annoncent déjà plus que cette marge : la kill-cam « +12 kB au plus » sur le bundle principal (`kill-cams-design.md:293`), le bar « +6 kB au plus » de câblage (`m5-bar-design.md:561`), et le lot 3 (balistique, alarme, fuite, fenêtres, radio, fiche) une part non chiffrée [D]. D'où trois règles :
- **règle de structure** (§2.5 B) : ce qui ne sert qu'à une mission, au PvP, aux cinématiques, à l'enquête, au bar ou à la kill-cam vit dans un morceau à la demande ; le lot 4 et le bar n'ajoutent au démarrage que leur câblage ;
- les « +12 kB » et « +6 kB » des lots voisins se comptent **après** le lot 5, dans le même plafond de 700 000 o : leur relecture lance `poids.mjs --check` ;
- les réserves ne s'activent que si la mesure finale dépasse 700 000 o, la réserve 1 seulement après un parcours complet (fumée Electron, `verif-mission`, captures).

**Le bar de M5** est un morceau à la demande (spec du bar §8 : ≤ 120 kB, `m5-bar-design.md:561`) et entre dans les modules interdits au démarrage.

## 4. Données et textes

- **Aucun texte neuf pour le joueur** : l'écran PRÉPARATION DU DOSSIER du lot 1 sert tel quel ; la fumée et le pipeline n'écrivent que des codes et des journaux de développeur (`tests/texts.test.js` inchangé).
- `public/models/modeles.json` (manifeste, §3.3) ; `scripts/budgets.js` (budgets du §5 et liste des modules interdits).
- REPRISE.md : section du lot 5, origine des sauvegardes figée, commande du pipeline.

## 5. Budgets

| Poste | Plafond | Garde |
|---|---|---|
| JS de démarrage (entrée et imports statiques, minifié) | ≤ 700 000 o | `poids.mjs --check`, test |
| Morceaux à la demande | scène de cinématique ≤ 100 kB ; enquête ≤ 110 kB ; bar ≤ 120 kB ; autre ≤ 140 kB | idem |
| `public/models/**` | ≤ 6,5 Mo (≤ 11,5 Mo après l'étape A seule) ; chaque modèle ≤ 1,1 Mo ; clips communs ≤ 0,7 Mo | test du manifeste et des fichiers |
| Ensemble d'une mission | ≤ 4,0 Mo | test de `modelesDeLaMission` sur les tailles du manifeste |
| Triangles, M6 vue de départ | Bas ≤ 0,8 M ; Moyen ≤ 1,0 M | `memtest --check` |
| Triangles, M6 lunette ×4 | Moyen ≤ 1,0 M | `memtest --check` (étape neuve) |
| Triangles, arène PvP | ≤ 1,2 M | `memtest --check` |
| Appels | jamais au-dessus de l'annexe d'avant le lot (les cils en retirent) | `memtest --comparer` |
| Mémoire des modèles | géométries ≤ 9 Mo niveaux compris ; clips ≤ 1,5 Mo de tas | champ `octetsModeles` du memtest |
| Décodage | ≤ 50 ms de tâche longue par modèle au menu (PC moyen, CPU ×4) | scénario `demarrage` |
| Choix des niveaux | ≤ 0,05 ms par image pour 55 personnages | mesure sous Node |
| `app.asar` | ≤ 12 Mo, sans `node_modules` hors `ws` | test et taille |

## 6. Effets atténués

Rien de neuf à atténuer : pas de fondu entre niveaux (le seuil sous le pixel les rend invisibles), pas d'animation de chargement nouvelle ; l'écran PRÉPARATION DU DOSSIER garde son fondu du lot 1. Les réglages d'Effets atténués ne changent ni le niveau choisi ni le moment des chargements (un joueur en effets atténués ne doit pas voir un autre jeu).

## 7. Tests (chacun vu rouge avant le code)

| Test | Témoin rouge |
|---|---|
| `checkPoids` : démarrage ≤ 700 000 o, imports statiques compris | 816 532 o ; un faux rapport où l'entrée importe statiquement un morceau de 103 kB |
| Aucun module interdit au démarrage (liste durcie à chaque tâche) | `briefing/kit.css?raw`, `src/pvp.js`, `GLTFLoader` aujourd'hui |
| Kit hors du démarrage | kit chargé à la demande sans sortir `createRain` : `kit.js` reste dans `index` |
| Pipeline : chaque clip composé est égal au bit près au clip de la source (empreinte par modèle, clip, os, chemin, temps, valeurs) | hanches de `gangster_man_01` prises pour tous : 0 sur 18 identiques pour six modèles [L1] |
| Chaque piste composée se lie à un os du modèle (`PropertyBinding.findNode`) | pistes `mixamorig7…` posées sur `mafia_boss` |
| Hanches et pieds sur Idle, Talk, Sit, Crouch, Death à 0,01 mm près (étape A) ; à 1 mm près (étape B) | sans correction des hanches : 94 mm |
| Idle en tête des clips de chaque modèle | fusion qui ajoute les clips communs à la fin |
| Fichier de clips absent : Idle joué, jamais un clip réduit aux hanches | composition sans écart |
| Contrôle d'identité du pipeline : arrêt nommé si un clip commun diffère | un modèle source dont une piste est altérée d'un ulp passe |
| `glb-bones.test.js` charge par `chargeurGltf()` (décodeur, clips composés) et ses os requis restent | chargeur sans décodeur : erreur de `GLTFLoader.js:1621` |
| HeadTop_End présent dans les 7 sorties | `prune` sans `keepLeaves` |
| Fidélité de l'étape B contre les sources : positions à 0,2 mm, normales à 2° (8 bits) ou 0,5° (12 bits), même nombre de primitives, mêmes noms de maillages et d'os | positions sur 10 bits : 1,9 mm |
| Fichiers : total, taille par GLB, une seule copie des 18 clips, extensions `EXT_meshopt_compression` et `KHR_mesh_quantization`, manifeste conforme aux empreintes | 24,86 Mo, 7 copies |
| `niveauPour` : M4 à 430 m ×20 et M6 ×12 gardent un niveau dont l'erreur reste sous le seuil ; la lunette (fov) compte | règle `distance / camera.zoom` de `LOD.js:259` : LOD2 à ×20 |
| Hystérésis : une hauteur qui oscille de ±5 % autour du seuil ne change pas de niveau à chaque image | hystérésis à 1,0 |
| Même niveau pour cible, garde, civil, commanditaire, avatar à même taille projetée | exception de rôle |
| `forcerNiveau(p, 0)` tient quelle que soit la taille ; `null` rend la main | crochet qui ignore le forçage |
| Géométries de niveau partagées : 0 libérée après 10 montages de M6 au faux renderer ; comptées dans `modelResources()` | niveau non marqué partagé ; niveau absent de `modelResources` |
| Aucune géométrie de niveau dans `userData` d'une instance | `Map` remplacée par `userData.niveaux` |
| Zones de tir identiques en LOD0 et LOD2 (mêmes os, même pose) | aucun (non-régression, vert attendu des deux côtés : à dire dans le rapport) |
| `chargerModeles(ensemble)` ne demande que ses fichiers (faux chargeur, comme `tests/characters.progress.test.js`) | les 7 demandés |
| Pools rangés dans l'ordre de `MODELS` quel que soit l'ordre d'arrivée | pool rangé à l'arrivée |
| 50 montages à graine par mission : tout modèle tiré appartient à `modelesDeLaMission(n)` ; ensemble ≤ 4,0 Mo | tirage dans `cache` après un chargement complet |
| PvP, deux sessions simulées dont l'une a joué M3 : mêmes modèles tirés à même graine | tirage dans le pool chargé |
| `main.js` n'appelle plus `preloadCharacters()` au chargement du module (lecture du source, `tests/gfx/mainSource.js`) | `src/main.js:134` |
| Morceau GLTFLoader introuvable : la mission part (repli), sans blocage ni exception | `import()` sans `catch` |
| `--fumee` : fenêtre cachée ; requête `http` bloquée et comptée (faux module `electron`, comme `tests/electron.test.js`) | garde coupée : la requête passe |
| `package.json` : aucune dépendance de production hors `ws` ; `build.files` sans `node_modules` | `three` en `dependencies` |
| memtest Bas : M6 ≤ 0,8 M, PvP ≤ 1,2 M ; Moyen : M6 ×4 ≤ 1,0 M | 1,33 M, 2,75 M, ≈ 1,4 M |
| Scénario `demarrage` de `verif-mission.mjs` : aucun GLB dans la première seconde du menu, puis seulement l'ensemble proposé | 7 GLB avant tout clic |

Tests existants à adapter : `tests/characters.test.js`, `tests/characters.progress.test.js:50` (`pending.size === urls.length` devient par ensemble), `tests/assets.test.js:29-33` (le fichier de clips est cité par `characters.js` ; les sources ne sont plus dans `public/`), `tests/shot/glb-bones.test.js:35`, `:47`, `:63`, `:76`, `tests/main.comfort.test.js:64-67` (appel direct à `playCinematic`), `tests/campaign/main.loading.test.js`, `tests/gfx/mainSource.js:15-25`, `tests/gfx/memtest.test.js`.

**Preuves qui ne sont pas des tests de comportement** (pas de témoin rouge exigé, à dire dans le rapport) : captures identiques à l'octet après l'étape A et après le passage à `src/gfx/gltf.js` ; memtest identique hors `tasMo`.

**Comparateur à tolérance** (`scripts/comparer-captures.mjs`, PNG décodé par `zlib` de Node, gratuit) pour l'étape B et les niveaux : écart moyen par pixel ≤ 1,0 sur 255 et 99,5 % des pixels à ≤ 8 [D, à caler sur la première passe] ; toute capture hors tolérance est montrée à Rayan.

## 8. Critères de fin chiffrés

| # | Critère | Aujourd'hui | Fin de lot |
|---|---|---|---|
| 1 | JS de démarrage | 816 532 o | ≤ 700 000 o, aucun module interdit |
| 2 | `npx vite build` | avertissement > 500 kB | aucun avertissement (`chunkSizeWarningLimit: 700`) |
| 3 | `public/models` | 24 862 676 o, 7 copies des clips | ≤ 6,5 Mo, une copie, chaque GLB ≤ 1,1 Mo |
| 4 | Avant le premier clic | 7 GLB, 24,9 Mo | aucun GLB dans la première seconde ; ensuite seul l'ensemble proposé (≤ 4,0 Mo) |
| 5 | M6, vue de départ | Bas 1 330 361 ; Moyen 1 422 955 | Bas ≤ 800 000 ; Moyen ≤ 1 000 000 |
| 6 | M6 lunette ×4, Moyen | ≈ 1,4 M [D] | ≤ 1 000 000 |
| 7 | Arène PvP | 2 748 345 | ≤ 1 200 000 |
| 8 | Appels | M6 294 et 290 ; PvP 445 | ≤ annexe d'avant le lot |
| 9 | Mémoire des modèles | 14,30 Mo de géométrie, 7,54 Mo de clips | ≤ 9 Mo ; ≤ 1,5 Mo |
| 10 | Lisibilité à 430 m, ×20, Bas | 63 px pour Verne (sonde S0) | même mesure à ±1 px, niveaux actifs |
| 11 | REPRENDRE vers mission jouable (briefing vu) | non mesuré | ≤ 1,5 s (RTX 3080) ; ≤ 4 s avec CPU ×4 |
| 12 | Fumée Electron sur `dist` puis `win-unpacked` | jamais lancée | 0 échec de chargement, 0 requête réseau (`http`, `https`, `ws`, `wss` : §3.2), modèles de la mission sans repli, images, sauvegarde relue |
| 13 | Paquet | jamais construit, three copié | `app.asar` ≤ 12 Mo, sans `node_modules` hors `ws` ; installeur construit |
| 14 | Tests | 1 333 verts (lot 2) | tous verts, nouveaux compris, chacun vu rouge |
| 15 | Captures | annexes des lots 1 à 3 | étape A identique à l'octet ; étape B et niveaux dans la tolérance, hors tolérance validé par Rayan |

## 9. Dépendances et coordination

| Avec | Point | Règle |
|---|---|---|
| Lot 3, 3a | A1 (`src/maps/`, commitée sur `lot3-socle` le 28 octobre, `2e5a203` : `src/maps/m1-rue.js` à `m6-fete.js`, `menu.js`, `prims.js`, `index.js`), A2 (données de mission), A3 (`scene.js`), A6 (`spawnCharacter` strict) | G1, G2, J1, E0 à E2 peuvent commencer avant ; G3, D1, D2, N2, J2 attendent la fusion de 3a |
| Lot 3, 3c | M4 à 430 m, décor long | la mesure du critère 10 et l'étape memtest `M4-x20` attendent 3c |
| Lot 3, 3d et bar | cartes de M5, morceau du bar (tâches B10 « patrons » et B16 « câblage » de `m5-bar-plan.md`) | J4 attend 3d et le câblage du bar ; le casting du bar entre dans l'ensemble de M5 dès qu'il existe ; sa capture à 2 m sert la décision 2 |
| Lot 4 | kill-cam | contrat `forcerNiveau` ; le lot 4 le teste de son côté. **Son budget d'image** (« au plus +8 appels et +10 k triangles par rapport à la vue de départ », `kill-cams-design.md:288`) devient intenable après N2, qui fait tomber la vue de départ de M6 de 1,33 M à environ 0,2 M en Bas alors que la poursuite voit la cible en LOD0 : à reformuler en absolu (seuils de M6 du lot 1, ≤ 1,4 M en Bas) si le lot 4 se mesure après N2. Le module `src/killcam/` est chargé au montage d'une mission, hors du démarrage (§3.6 ligne 8) |
| Cinématiques v2 | `scripts/poids.mjs` (leur C0), portraits WebP | un seul script (§3.1) ; WebP hors de ce lot |
| Lot 6 | `package.json` (`ws`), `electron/main.js` (préchargement, bac à sable, navigation refusée, relais : tâche R5), expéditeur `file://`, `src/pvp/` | E1 est fusionnée seule avant R5 (décision O2, plan, tâche E1) : R5 se rebase sur elle et garde le mode `--fumee` (première ligne de `createWindow`, profil jetable obligatoire, `setBackgroundThrottling(false)` posé à l'exécution hors du bloc `webPreferences` que R5 modifie, bloc identique dans les deux modes) ; E2 se rebase sur R2 et R5 ; le mode `--fumee` recharge par `webContents.reload()`, que le refus de navigation de R5 laisse passer ; sa garde réseau bloque et compte aussi `ws://127.0.0.1` (une fumée où la page se connecte au relais demandera une exception étroite, comptée à part) et il sort par `app.exit`, sans `before-quit` (une étape qui ouvre le relais le ferme elle-même) ; l'origine reste `file://` (E1), celle que le lot 6 vérifie ; J3 se fait après la phase 1 du lot 6, ou dans le lot 6 (§3.6 ligne 7) ; le mode `pilote` de `NPC` (P5) garde son niveau choisi par le crochet comme tout personnage |

## 10. Risques

1. **Le livrable est peut-être déjà cassé** (`fetch` et modules sous `file://`, asar). Parade : fumée E1 avant tout, protocole `app://` prêt. Levé pour `dist/` le 28 octobre 2026 : fumée E1 verte sous `file://` (Electron 42.5.0), sans `app://` ; l'asar se vérifie par la fumée sur `win-unpacked` (E2).
2. **Quantification d'un maillage animé** : gltf-transform reporte la transformation dans les matrices inverses de liaison [L1, à prouver]. Parade : tests de pose et de fidélité, `tests/gfx/characters.bounds.test.js`, `glb-bones.test.js`.
3. **Transport des niveaux** : maillages détachés élagués ou relus en double. Parade : test du manifeste (triangles par niveau), repli par seconde scène.
4. **Hasard des captures** : le moment du chargement ne doit pas changer les tirages ; le tirage dans le pool déclaré l'en protège. Nouvelles références après D2, comparées à l'œil.
5. **Désynchronisation du PvP** si un tirage lit le pool chargé. Parade : test à deux sessions.
6. **Budget du bundle** : 5,7 kB de marge. Parade : règle de structure, réserves mesurées.
7. **Popping** des niveaux à la limite d'un seuil. Parade : erreur sous le pixel, hystérésis, LOD0 forcé à la kill-cam.
8. **Normales sur 8 bits en gros plan** (bar à 2 m, kill-cam). Parade : décision 2, capture du bar.
9. **Téléchargements** : binaire Electron, NSIS, winCodeSign, paquets npm : tous gratuits, une fois.
10. **Deux auteurs pour `scripts/poids.mjs`** (E0 et C0 des cinématiques v2, tous deux « tout de suite »). Parade : le premier fusionné crée, l'autre étend (§3.1) ; la relecture de la seconde branche vérifie que les options publiées n'ont pas changé.
11. **Budgets des lots voisins exprimés par rapport à la vue de départ** (kill-cam) ou au bundle d'avant (bar, kill-cam) : ils changent de sens une fois le lot 5 passé. Parade : §9, budgets reformulés en absolu dans le même plafond.
12. **`meshopt()` de gltf-transform** qui réordonnerait des primitives aux sommets partagés. Parade : extension posée à la main (§3.3), test « aucun sommet neuf » de N1.

## 11. Décisions à faire trancher par Rayan

1. **Quand charger les modèles de la mission**
   - a. Seulement au clic : aucun octet avant, mais l'écran PRÉPARATION DU DOSSIER apparaît plus souvent (1 à 3 s sur un PC moyen [D]).
   - **b. (reco)** Au repos du menu, l'ensemble de la mission que propose le bouton principal : rien ne retarde la première image du menu, le clic part tout de suite.
   - c. Tout au repos du menu (comme aujourd'hui, mais après la première image) : 5,5 Mo lus pour rien la plupart du temps.
2. **Compression avec perte des modèles**
   - a. Sans perte seulement : ≈ 10,8 Mo, captures identiques.
   - **b. (reco)** Avec perte, normales sur 8 bits : ≈ 5,25 Mo, si la capture du bar à 2 m et le test de fidélité passent.
   - c. Avec perte, normales sur 12 bits : ≈ 5,5 Mo [D], le choix sûr pour les gros plans.
3. **Les 9 clips jamais joués** (Taunt, Point, Aim, React, Punch, Kick, Jump, InjuredWalk, Death2 : ≈ 0,2 Mo compressés). **Réservés d'office** (intégrateur) : `Point`, joué par l'escorte du bar quand un regard dure (`m5-bar-design.md` §3.2), et `Death2`, joué par la kill-cam sur une cible touchée de dos (`kill-cams-design.md` §3.6). La décision ne porte que sur les 7 autres.
   - **a. (reco)** Les garder jusqu'à la fin du lot 4, puis décider.
   - b. Les retirer maintenant (une ligne du pipeline, les sources les gardent).
4. **Fusionner les maillages d'un modèle par matériau** (M6 d'environ 154 à 54 appels pour les personnages [L1])
   - **a. (reco)** Non : les appels sont sous les budgets du lot 3, et la teinte par maillage (Marc, le commanditaire) en a besoin.
   - b. Oui, sauf pour les modèles teintés par maillage.
5. **Livrable Windows, sans signature (payante)**
   - a. Installeur NSIS seul (SmartScreen avertit au premier lancement).
   - b. Dossier portable zippé seul.
   - **c. (reco)** Les deux : l'installeur pour jouer, le dossier pour tester et prêter.
6. **Modèle libre en costume** (décision 6 du lot 3, sosies du bar)
   - **a. (reco)** Pas dans ce lot : la porte est ouverte (le pipeline contrôle l'identité des clips d'un modèle ajouté), à décider sur les captures de M6 (3b) et du bar.
   - b. Dans ce lot, un modèle Mixamo gratuit en costume pour le commanditaire (compte Adobe à créer par Rayan lui-même).
