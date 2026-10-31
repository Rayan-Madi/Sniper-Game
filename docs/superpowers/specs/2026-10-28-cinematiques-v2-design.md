# Cinématiques v2 : plus riches visuellement, même montage (conception)

> Rangé dans le dépôt le 28 octobre 2026. Les autres documents de conception cités par leur seul nom (`feuille-de-route.md`, `kill-cams-design.md`, `poids-design.md`, etc.) sont dans `C:/Users/shark/Sniper-Game-reprise/.superpowers/sdd/2026-10-28-conceptions/` (hors dépôt), comme le journal `.superpowers/sdd/2026-10-07-reprise/progress.md`.

> Conçu le 28 octobre 2026 par l'architecte du chantier « cinématiques v2 », à partir de quatre rapports de lecture en lecture seule (lecteur 1 : prologue A, prologue B, épilogue ; lecteur 2 : M1, M2, M3 ; lecteur 3 : M4, M5, M6 ; lecteur 4 : le kit et ses primitives) et d'une revérification des points qui décident dans l'instantané `C:\Users\shark\Sniper-Game-jeu` (branche `main`, commit `3cd328d`). Rien n'a été lancé : ni Chrome, ni vitest, ni serveur.
> Plan d'exécution : `cinematiques-v2-plan.md`, dans ce dossier.
> Légende : **[V]** vérifié dans le code par l'architecte (fichier:ligne) ; **[V-Ln]** vérifié par le lecteur n, non refait ici ; **[D]** déduit ou proposé. Chemins relatifs à la racine du dépôt. `MQ/` = `docs/superpowers/maquettes/cinematiques/`. `PA`, `PB`, `EP`, `M1` à `M6` = les maquettes `MQ/prologue-a.html`, `prologue-b.html`, `epilogue.html`, `briefing-m1.html` à `briefing-m6.html`. `kit.js` et `kit.css` sans préfixe = le kit du jeu (`src/briefing/`) ; `MQ/kit.js`, `MQ/kit.css` = celui des maquettes. Les numéros de ligne sont ceux de `main` 3cd328d ; les tâches faites depuis ont décalé ceux des fichiers qu'elles ont touchés (C2 : `kit.js`, `kit.css`, `MQ/kit.js`, `MQ/kit.css`, `src/briefing/index.js`, `tests/briefing/scenes.test.js` ; C4 : les deux `kit.css` et les maquettes PA, PB, EP, M2, M3, M4, M6, d'une à quinze lignes chacune, par leurs règles jumelles atténuées, et les deux `kit.js`, de sept lignes, par l'onde de l'écoute en effets atténués) : dans ces fichiers, chercher par sélecteur, par nom de test ou par bloc commun (`anim`, `matières`, `atténué`, `gel`), pas par numéro de ligne.

## 0. La demande

Rayan, le 28 octobre 2026 : « pour les cinématiques que tu as faites, si tu pouvais rajouter encore des éléments visuels : le montage est bon, mais je te connais, tu peux rajouter des trucs ». Mots-clés notés au journal (`.superpowers/sdd/2026-10-07-reprise/progress.md:102`) : parallaxe, cartes et itinéraires animés, documents, tampons, pluie, reflets, fuites de lumière, télex ; « lot à part, par les maquettes ».

**Ce qui ne bouge pas (les trois invariants)**, définis pour être testés :
1. **Même durée** : la durée de chaque cinématique, au milliseconde près, et le début de chaque temps.
2. **Même texte** : la liste (qui parle, réplique) de chaque scène et de chaque variante. Seule exception possible : le tiret cadratin d'une réplique de M6 (décision D2).
3. **Même montage** : tout repère existant (classe posée ou retirée sur un élément existant) arrive au même instant. On ajoute des repères et des couches ; on n'en retire ni n'en décale aucun.

**Cadre de Rayan** : rien de payant (aucun service, aucune image achetée, voix en bips, sous-titres tapés) ; jouable sur un PC de milieu de gamme ; style « dossier du fixeur » : Anton jamais vu (ni silhouette ni reflet humain), aucun corps montré pour la femme et la fille, Viktor tire toujours de loin et en hauteur, Anton ne dit jamais « tu entres ».

## 1. Constats qui décident

**Chaîne de production [V]**
- On édite la maquette, puis `node scripts/port-maquette.mjs` régénère `src/briefing/scenes/*.js` ; on ne retouche jamais une scène à la main (`docs/superpowers/REPRISE.md:26`).
- Le port reprend tous les `<style>`, le HTML de `#st` et les scripts en ligne (`scripts/port-maquette.mjs:15-18`) ; ce qui est hors de `#st` est perdu. Il redirige `setTimeout` et `requestAnimationFrame` vers `K.at` (`:31-32`), **pas `setInterval`**, que le test de lecture complète attrape (`tests/briefing/scenes.test.js:6, 28`).
- Le test « scène à jour avec sa maquette » rougit si l'on oublie de régénérer (`tests/scripts/port-maquette.test.js:75-81`).
- Une image n'est réécrite que si elle s'écrit `img/<nom>.png`, et l'extension servie n'est choisie qu'entre `.jpg` et `.png` (`port-maquette.mjs:17, 52`).

**Durée [V]**
- `estimate = 350 + 62 × longueur` (`kit.js:10`). Un temps parlé dure `pre + estimate + max(post ?? 350, min − pre − estimate)`, un temps muet `min` (`kit.js:198-207`). Les repères (`cues`) ne comptent pas : **ajouter un repère ne rallonge jamais un temps**.
- Durées de référence [V, refait en C1 le 28 octobre 2026 : formule du séquenceur sur `cfg.beats` et lecture réelle sous faux minuteurs, `tests/briefing/montage.test.js` ; temps, répliques et repères recomptés, tous identiques ; m5, hors des gardes G1 à G3 jusqu'à C16, lu une fois : 42 380 ms] :

| Scène | Durée (ms) | Temps | Répliques | Repères |
|---|---|---|---|---|
| m1 | 41 388 | 10 | 8 | 31 |
| m2 | 36 286 | 9 | 7 | 67 |
| m3 | 44 214 | 10 | 8 | 123 |
| m4 | 38 762 | 9 | 7 | 64 |
| m5 | 42 380 | 10 | 8 | 59 |
| m6 | 44 830 | 11 | 9 | 90 |
| épilogue libres / enfermés | 48 534 / 48 906 | 13 | 7 | 43 / 45 |
| prologue-a | 21 272 | 5 | 3 | 26 |
| prologue-b | 65 840 | 20 | 9 | 106 |

**Gel des captures [V]**
- Au gel, `.k-frozen` ramène à 0 la durée des transitions et des animations (`kit.css`, bloc commun `gel` depuis C2) : tout effet saute à son état final. Seuls les compteurs affichent leur valeur exacte (`kit.js:118-136, 194`). Un tracé à moitié dessiné apparaît donc entier sur une capture gelée.
- Constat de C0 (relecture, 28 octobre 2026, mesuré au pixel) : sur la v1, deux captures gelées du même code au même instant (`scripts/shots.mjs`, dans le jeu) ne sont pas toujours identiques à l'octet. m2 à 5 200 ms : 2 379 px différents, écart max 29 sur 255, presque tous sur le trait rouge central (13 px épars dans la bande des sous-titres) ; m3 à 6 500 ms : 111 275 px, écart max 49, sur toute l'image ; m4 à 13 500 ms : identiques. Le critère 6 du §3.9 ne tient donc pas encore en m2 et m3 : C5 et C17 mesurent ce bruit sur deux captures de la même version avant toute comparaison à l'octet.
- Constat de C2 (28 octobre 2026, page de contrôle `MQ/controle-outils.html` capturée avec les options de `scripts/shots.mjs`, barres de 0 à 100 % en 2 000 ms gelées à 1 000 ms) : en temps virtuel, Chrome sans interface ne calcule presque aucune image avant la capture (la sonde des maquettes y lit une p95 de 7 à 20 s) ; une animation CSS n'avance qu'aux images calculées, et mise en pause au gel elle reste à son début (0 % au lieu de 50 %). `K.anim`, mené par les minuteurs, tombe de 49,8 à 50,6 % sur cinq captures et cinq lectures par la page : l'instant du gel varie de quelques ms d'un lancement à l'autre. Pour le critère 6 du §3.9, tout ce qui bouge à l'instant du gel peut donc différer d'un pixel ou deux entre deux captures, `K.anim` compris.

**Effets atténués [V]**
- Le kit du jeu pose `k-reduced` sur `#st` avant que le script de la scène tourne (`kit.js:67`, puis `src/briefing/index.js:101`) ; glitchs au tiers (`kit.js:91`), aucun glitch d'ambiance (`:108`), aucune secousse (`:113`), SIGNAL PERDU figé (`.st.k-reduced .lost.on`, bloc commun `atténué` de `kit.css` depuis C2).
- Ce que les scènes animent elles-mêmes n'est couvert que dans le prologue B (`PB:144-145`). Animations infinies sans règle atténuée relevées : vibration du téléphone de l'épilogue (`EP:121`, c'est une secousse au sens du lot 1), saut de l'avatar « ? » (`PB:98`), caméra à l'épaule (`PA:13, 56`, `PB:14, 47`, `EP:16, 108`), pluie (`PA:35, 38`, `PB:26, 29`, `M3:30, 32`), clignotements (`M2:143`, `M3:36, 48`, `M4:133`, `EP:23`), les tremblés et la danse de M6 (`M6:32-36, 65-67, 74, 80, 135, 156, 164`), et dans le kit lui-même `.pulse`, `.rec`, `.photo .cam b` et `.radio .dot` (les deux `kit.css`, à chercher par sélecteur).
- Le kit des maquettes ne sait pas poser `k-reduced` (`MQ/kit.js:33-38`) : on ne peut pas juger une version atténuée avant le portage. Résolu en C2 : `?attenue=1` (§3.2, point 1).
- En jeu, l'option vient des réglages (`src/main.js:370-372`) ; la route de développement `?cine=` transmet les autres paramètres à la scène sans les lire (`main.js:1743-1752`).

**Coût [V]**
- Aucun rendu WebGL pendant une cinématique (`main.js:1432`) ; la boucle tourne quand même et nourrit le panneau de performances (`main.js:1413-1418`), qui signale une p95 au-delà de 22 ms (`src/gfx/stats.js:28`). Tout le coût d'une cinématique est donc DOM, CSS et SVG.
- Le CSS d'une scène est global : posé dans `<head>` (`index.js:90-91`), retiré au démontage (`index.js:63`). Préfixer règles et `@keyframes` (`pro-`, `epi-`, `m1-`…).
- Le glitch pose un filtre SVG sur tout `#scene` toutes les 45 ms (`kit.js:94-95`) : chaque calque ajouté renchérit chaque glitch.
- Mesuré en C3 (28 octobre 2026, `scripts/cine-perf.mjs`, 10 cas de la v1, deux passes à processeur normal et deux à ×4 ; annexe `docs/superpowers/specs/annexes/2026-10-28-cine-v1.json`, README des annexes, « Cinématiques v2 ») : sur la machine de Rayan (RTX 3080, écran à 180 Hz), les durées d'image sont des multiples de 5,56 ms ; à ×4, la p95 de la v1 va de 5,7 à 16,6 ms ; l'image la plus longue est presque toujours celle du montage de la scène (0,2 à 1,7 s après, jusqu'à 1 011 ms en m5) ; les animations en cours dépassent 40 dès la v1 en m6 (70), m1 (63), m3 (47) et dans l'épilogue (46), m5 est à 40. Conséquences pour les plafonds : §3.6, « Mesuré en C3 », et décision D8 (§4).

**Poids [V]**
- Budget : « Poids ajouté au téléchargement : moins de 1,5 Mo au total (images recompressées, chargées à la demande) » (`docs/superpowers/specs/2026-10-02-cinematiques-design.md:151`).
- Images : 998 210 octets dans `public/briefing/img`, dont 940 399 pour les six portraits PNG à transparence (`ls`).
- [V-L4] Chunks des 9 scènes : 360 515 octets ; chunk de l'enquête 104 876 ; kit dans le bundle principal ≈ 17 à 27 ko. Total ≈ 1,38 Mo sans l'enquête (marge ≈ 115 ko), ≈ 1,48 à 1,49 Mo avec (marge ≈ 10 à 20 ko). La REPRISE dit 1,45 Mo avec l'enquête (`REPRISE.md:99`), chiffre antérieur à la croissance de l'enquête (`REPRISE.md:54`).

**Tirets cadratins visibles [V]** (hors titres de page et commentaires, que le joueur ne voit pas)
- Étiquettes (le tiret est noté [T]) : `M1:29` « SOURCE : MARKOV, A. [T] DURÉE 00:04 » ; `M1:51` « PIÈCES À CONVICTION [T] 3 VICTIMES CONNUES » ; `M4:173` « [T] DÉFENSE [T] » ; `M5:144` et `M5:183` ; `EP:647` « EN ATTENTE · [T] ». Et une **réplique** : `M6:345` « « Ils sont tous morts ? [T] Oui. Il ne reste que vous. » ».
- La garde des textes exclut les scènes (`tests/texts.test.js:8-9, 94`).

**Chantiers voisins [V]**
- Le chantier « bar de M5 » réécrit `MQ/briefing-m5.html` (briefing I) et crée `briefing-m5b.html` (briefing II, en variantes) ; il en est le **seul propriétaire** jusqu'à sa fusion (`m5-bar-design.md:452-470, 621`). Il retire déjà les trois tirets de M5 et déplace « ≈ 1,5 m DEVANT », la carte et la colline au briefing II.
- Le lot 3 (socle 3a, `docs/superpowers/plans/2026-10-15-lot3a-socle.md`) ne touche ni aux maquettes, ni au kit, ni à `src/briefing/`. Il touche beaucoup `src/main.js` : **la v2 ne touche pas `main.js`**.
- M4 : Rayan a tranché « fais le dur », M4 garde 430 m (`progress.md:106`). La maquette compte déjà jusqu'à 430 (`M4:416`) : rien à reprendre. La décision 11 de la spec du lot 3 est déjà définitive à 430 m (commit `85973ab` de `lot3-socle`, spec du lot 3 l.177 et l.266 ; note de l'intégrateur) ; aucune tâche de la v2 n'en dépend.
- Copie de travail prévue : `C:\Users\shark\Sniper-Game-cine`, branche `cine-v2`, créée depuis `main` 3cd328d (`progress.md:107`).
- **Note de l'intégrateur (`feuille-de-route.md`)** : la tâche A7 du lot 3 (fiche HUD) affichera les portraits de `public/briefing/img` ; elle les cite par une seule fonction, et la branche fusionnée en second (A7 ou C0) adapte cette ligne. Le socle de la v2 (C0 à C5) est fusionné dans `main` dès sa relecture, avant les scènes : la kill-cam (lot 4, maquette `killcam.html`) et le bar (`briefing-m5.html`, `briefing-m5b.html`) écrivent alors leurs maquettes sous les gardes G4 à G6 et avec les outils communs.

## 2. Approches

| | Approche | Pour | Contre |
|---|---|---|---|
| A | **Tout dans les maquettes**, kit intact | Aucun risque pour le moteur ; chaque scène avance seule | Les captures gelées mentent sur chaque tracé ou mouvement long ; aucun moyen de juger l'atténué dans une maquette ; matières (encre, papier) recopiées neuf fois ; aucune garde du montage |
| **B (reco)** | **Socle mince, puis enrichissement par maquette.** D'abord les gardes du montage (durées, répliques, chronologie), de l'atténué, du rendu et des textes ; puis quelques outils communs ajoutés **à l'identique dans les deux kits** (blocs marqués, comparés par un test) : `?attenue=1`, `K.anim` (dessin fonction du temps, exact au gel), `K.graine`, matières encre et papier, sonde d'images ; ensuite une passe par scène | Garde les invariants par des tests écrits avant toute retouche ; captures justes pour ce qui est neuf ; aucun changement d'architecture ; tout passe par la chaîne qui marche | Deux copies des outils communs (tenues identiques par test) ; le gros de la richesse reste du CSS propre à chaque scène |
| C | **Refonte du kit** (lecteur 4) : un seul kit (les maquettes importent celui du jeu), horloge commune, animations Web Animations positionnables, 13 primitives dans un chunk `src/briefing/fx/` | Base idéale pour les kill-cams du lot 4 (surimpression, pause, ralenti) | Gros chantier de moteur avant le premier ajout visible ; convertit les maquettes en modules (voix du navigateur, boucle, barre de contrôle) ; jsdom n'a pas Web Animations (faux à écrire) ; sort du « même montage, on ajoute » |

**Recommandation : B.** La demande est visuelle et le montage est jugé bon : on garde le moteur, on le borde de tests, et on enrichit scène par scène. Les briques de C qui servent aussi le lot 4 (tampon, encre, horodatage, télex) sont écrites ici comme outils communs simples ; le lot 4 décidera s'il les promeut en primitives de surimpression.

## 3. Conception

### 3.1 Les gardes, écrites avant toute retouche (tâche C1, puis C4)

Toutes vertes sur la v1, chacune avec son témoin rouge.

**Portée (intégrateur)** : G1 à G3 couvrent les **neuf cas hors m5** tant que le bar n'est pas fusionné (le bar réécrit `briefing-m5.html`, ses références v1 seraient fausses dès sa fusion) ; les références de `m5` et `m5b` s'écrivent en C16 depuis la version du bar. Chaque scène de `SCENES` a son cas dans G1 à G3 ou sa raison, nommée, dans `HORS_GARDE` (`tests/briefing/montage.test.js`) : `m5` et `m5b` jusqu'à C16, `killcam` (pilotée par `data`, sans version v1 : G1 à G3 ne s'y appliquent pas, tâche K8 de `kill-cams-plan.md`) ; une scène ajoutée sans l'un ni l'autre rougit. G4 à G6 s'appliquent à **toute scène de `SCENES`**, donc aussi à `m5b` (bar, B15) et à `killcam` (lot 4, K8) dès qu'elles existent ; une scène sans version v1 a 0 `Math.random` permis (G5) et passe par `K.graine`.

| | Garde | Comment | Témoin rouge |
|---|---|---|---|
| G1 | **Durées** | Pour chaque scène et variante : la scène est montée avec un vrai kit dont `K.run` est intercepté pour lire `cfg.beats` ; durée calculée par la formule du séquenceur (`kit.js:198-207`) et comparée au tableau du §1 au ms ; puis lecture réelle sous faux minuteurs : `onDone` arrive à cette durée (± 16 ms, pas d'une image). Le début de chaque temps de la v1 (invariant 1 du §0) est gardé aussi : il existe encore au même instant (référence : champ `temps` de `references/chronologie-v1.json`) | Un `min` modifié dans une maquette ; deux `min` qui se compensent (durée totale inchangée, temps décalés) |
| G2 | **Répliques** | Même lecture de `cfg.beats` : liste `[who, say]` comparée à une référence `tests/briefing/references/repliques-v1.json` écrite depuis la v1 | Une réplique retouchée d'un caractère |
| G3 | **Chronologie** | Lecture complète sous faux minuteurs, `MutationObserver` sur les classes des éléments qui ont un `id` ; on garde `[t, id, +classe / −classe]`, en ignorant l'habillage du kit (ids `k-*`, classes `k-*` du préchargement, classes `gl`, `shake`, tirées au hasard par les glitchs d'ambiance, `kit.js:107`). Référence `references/chronologie-v1.json` écrite depuis la v1 ; la v2 doit **contenir** chaque événement de la v1 au même instant (elle peut en ajouter). Les références de G2 et G3 s'écrivent par `ECRIRE_REFERENCES=1`, qui ajoute les cas absents et ne réécrit jamais un cas déjà écrit : changer une entrée existante demande une décision écrite ici, puis une retouche à la main de cette seule entrée | Un repère existant décalé de 100 ms |
| G4 | **Atténués** | Analyse du CSS de chaque scène et de `kit.css` : toute règle qui pose une animation répétée (`infinite`, ou plus d'un tour depuis la relecture de C4) doit avoir sa **règle jumelle** (même sélecteur avec `.k-reduced` sur la classe de scène, ou `.st.k-reduced` pour le kit) qui met `animation: none` ou une autre animation, jouée une fois, sauf liste blanche nommée et justifiée (`k-grain`, réglé par le lot 1 ; `k-flick`, voile lent ; `m6-spin`, rotation de 22 s ; à compléter seulement par décision écrite) ; une règle `.k-reduced` qui pose une animation répétée passe par la même liste blanche, et aucune animation ne se pose hors des feuilles (attribut `style` du HTML, script de la scène ou du kit). Plus : un test dynamique par scène nouvelle, sur le modèle de « prologue B, effets atténués » (`scenes.test.js`) | `EP:121` (`epi-buzz` sans jumelle) |
| G5 | **Rendu** | Analyse des `@keyframes` de chaque scène : propriétés animées permises `transform`, `opacity`, `stroke-dashoffset`, plus une liste figée des `@keyframes` de la v1 qui animent autre chose (pluie, `.track`, `m3-roll`…), qui ne peut que raccourcir. Aucun `setInterval` dans une maquette ; nombre de `Math.random` d'une maquette ≤ celui de la v1 (le neuf passe par `K.graine`) | Un `@keyframes` neuf qui anime `top` |
| G6 | **Textes** | Texte visible de chaque scène sans U+2014 : texte de `html`, chaînes du script (dont les répliques), valeurs `content:` du CSS. Exception nommée `m5` jusqu'à la fusion du bar | Rouge aujourd'hui sur m1, m4, m6, épilogue (§1) |
| G7 | **Outils communs** | Les blocs marqués `// ── commun : … ──` de `kit.js` et `MQ/kit.js` (et de `kit.css` et `MQ/kit.css`) sont identiques au caractère près. Un bloc va de sa marque d'ouverture à sa marque de fin, comprises : `// ── commun : <nom> ──` à `// ── fin du commun : <nom> ──` en JS, `/* ── commun : <nom> ── */` à `/* ── fin du commun : <nom> ── */` en CSS ; mêmes blocs des deux côtés, aucun en double ni imbriqué. Depuis C2 : `anim` dans les `kit.js`, `matières`, `atténué` et `gel` dans les `kit.css` (`tests/briefing/kit-commun.test.js`) | Une copie retouchée seule |

**Fait en C4 (29 octobre 2026)** : `tests/briefing/attenue.test.js` (G4), `rendu.test.js` (G5), `textes-scenes.test.js` (G6), lecteurs communs dans `tests/briefing/analyse-scenes.js` ; les scènes y sont lues telles que le jeu les charge (`src/briefing/scenes/*.js`).
- **G4** : les deux `kit.css` et le CSS de chaque scène de `SCENES`, règle par règle ; la jumelle se reconnaît à son premier composé (classes dans n'importe quel ordre) et au reste du sélecteur, pour chaque sélecteur d'une liste. Liste blanche par règle (source, sélecteur, animation) : `.st .grain` (`k-grain`) et `.st .flick` (`k-flick`) des deux kits, `.m6 .void::after` (`m6-spin`). **Attente nommée de m5**, comme l'exception de G6 : ses animations infinies de la v1 (`.rxl` en `k-blink`, `m5-sm`, `m5-ants` de `#virc`, `#sight`, `#repli`), dans la maquette que le bar possède ; chaque entrée tombe quand sa jumelle existe (la garde le demande : B14 du bar, au plus tard C16, qui vide l'attente), et une animation répétée neuve de m5 a sa jumelle comme partout. Garde dynamique : chaque cas joué en entier sans puis avec l'option, chaque élément désigné relevé à sa première apparition, par famille (§3.7 : caméra à l'épaule, pluie, clignotements, ondes et anneaux, téléphone qui vibre, balayages du signal, radio, lumière du matin, M6) ; sans l'option il joue son animation (témoin), avec, plus jamais ; un pseudo-élément, que jsdom ne calcule pas, est vu par sa jumelle. Flashs plafonnés à 0,3 en atténué : pièces à conviction (kit, `.evp .flash`), écran fendu de M2 (`.flash2`), éclair des caméras de M3 (`.fx`) ; les développements de photo (`k-develop`, `m2-dev` : une rampe de luminosité d'une seconde sur une vignette, une fois) ne sont pas des voiles et restent tels quels. Sous Vitest, la feuille du kit importée en `?raw` est vide : la garde dynamique pose la vraie sous le même id.
- **Jumelles posées**, à la pose de repos des `@keyframes` sauf mention : kit, dans le bloc commun `atténué` (`.track`, `.rec`, `.photo .cam b`, `.radio .dot`, `.pulse` en anneau fixe à l'échelle 1,7 et 0,45 d'opacité, égaliseur de la radio figé à mi-hauteur tant qu'Anton parle) ; prologues (`.hh`, `.rig`, pluie, curseur du carton de A, saut de l'avatar « ? » et anneaux de l'appel de B) ; épilogue (`.hh`, `.rig`, voyant du repère, `epi-buzz` sans tremblement, anneaux fixes comme au prologue B, rayons à 0,75, poussière figée à 0,6 ; la lumière qui pulse du §3.4 reste à C9) ; M2 (`.blink`) ; M3 (pluie, `.blinkr`, voyant du plan, bande `.roll` hors cadre) ; M4 (`.blink`) ; M6 (ses 11 animations hors `m6-spin` : interception sans tremblé et trait de déchirure effacé, déchirures et parasites figés, voyants, danseurs immobiles, voile rouge fixe). Les jumelles que le §3.4 cite (`.blink` de M2, saut de l'avatar, `.blinkr`, `epi-buzz`, M6) sont donc faites.
- **Relecture de C4 (31 octobre 2026)** : G4 resserrée sur ce que la lecture règle par règle laissait passer : une jumelle qui remplace un clignotement par une autre animation répétée (`.m4.k-reduced .blink { animation: k-pulse 1.3s infinite }`) ; une animation posée par l'attribut `style` du HTML ou par le script (`style.animation…`, `setProperty('animation…')`, `cssText`, `innerHTML`, clé `animation` d'un objet), dans les scènes comme dans les deux `kit.js` (ces deux points vus verts sur une M4 retouchée pour l'essai, puis rouges) ; une animation de plus d'un tour (`k-blink .5s steps(2) 40`) ou écrite `-webkit-animation`, que la lecture ne voyait pas (témoins sur des feuilles d'essai). Désormais (décision écrite ici, complète la ligne G4 du tableau) : une animation de plus d'un tour demande sa jumelle comme une infinie ; en effets atténués, rien ne se répète hors liste blanche, qui nomme alors la règle `.k-reduced` elle-même (cas attendu : la lumière qui pulse de l'épilogue, C9) ; aucune animation hors des feuilles. **Onde de l'écoute** (`#wave` de M1 et M6, menée par `K.wave` des deux `kit.js` : une hauteur tirée par barre toutes les 90 ms, environ 11 Hz, que G4 ne voyait pas) : en effets atténués, une seule pose tant que la ligne parle, tirée une fois par `K.graine(1998)` sous la même enveloppe, à plat entre les lignes, la même dans les maquettes (`?attenue=1`) et dans le jeu ; gardée en jouant M1 et M6 (garde dynamique de G4 : une seule pose avec l'option, plus de cinq sans) et par `tests/briefing/kit-commun.test.js`.
- **G5** : liste figée de la v1 écrite dans le test, par source et avec les propriétés de chaque entrée (`k-track`, `k-crt`, `k-develop`, `k-eq` des kits ; pluies des prologues et de M3 ; `m2-dev` ; `m3-sb`, `m3-roll` ; six `@keyframes` de M6) ; une entrée qui n'anime plus une de ses propriétés rougit tant qu'on ne la raccourcit pas (C5). `Math.random` : 0 dans chaque maquette de la v1. En plus (§3.3) : aucun `element.animate`, aucun élément SMIL (`<animate>`, `<set>`…) dans le HTML ou créé par le script.
- **G6** : nœuds texte et attributs de `html` (dont les `data-*` que la scène tape à l'écran), chaînes du corps de `start` (commentaires exclus), valeurs `content:`. L'exception m5 est tenue au texte près (les deux textes de la v1, `M5:144` et `M5:183`) : un tiret neuf de m5 rougit, et l'exception tombe avec ces textes. Corrigés : `M1:29` et `M1:51` (« · »), `M4:173` (« · DÉFENSE · »), `EP:647` (« N/D »), l'infobulle du bouton de variante de l'épilogue (`EP:812`, « : ») et la réplique de M6 (décision D2, §4).

### 3.2 Les outils du socle (tâche C2)

1. **`?attenue=1`.**
   - Maquettes : `MQ/kit.js` pose `k-reduced` sur `#st` si le paramètre vaut 1, et recopie les trois comportements du jeu (glitch au tiers, aucun glitch d'ambiance, aucune secousse) ; `MQ/kit.css` reçoit les règles `kit.css:26-27, 41-42`. Fait en C2 : ces deux règles forment le bloc commun `atténué` des deux feuilles (déplacées telles quelles dans `kit.css` : leur spécificité l'emporte où qu'elles soient) ; l'étiquette sous la scène finit par « · atténué ».
   - Jeu : `playCinematic` (`src/briefing/index.js:35`) force `reducedMotion` quand `params.attenue === '1'` (la route `?cine=` transmet déjà ses paramètres, `main.js:1746`) : on capture une version atténuée sans toucher à `main.js`.
2. **`K.anim(dessin, duree, { attenue })`** dans les deux kits (bloc commun) : `dessin(k)` reçoit l'avancement de 0 à 1, appelé par le pas de 16 ms existant (`raf`, `kit.js:48`) ; au gel, `dessin` reçoit l'avancement exact à l'instant du gel, comme les compteurs, puis plus rien ; en atténué, `dessin(1)` d'emblée si `attenue: 'fin'`, ou un fondu de 300 ms si `attenue: 'fondu'` ; « rejouer » et `destroy` l'arrêtent (registre existant). Sert aux tracés (cercles de distance, itinéraires, fils), aux chiffres qui roulent, aux têtes de lecture. Précisé en C2 : le dessin reçoit `(k, o)`, `o` l'opacité, qui vaut 1 sauf en atténué avec `attenue: 'fondu'` (alors `k = 1` d'emblée et `o` passe de 0 à 1 en 300 ms, exacte au gel elle aussi ; au dessin de l'appliquer) ; sans `attenue`, le dessin joue pareil en atténué (un tracé informe, §3.7). Le kit des maquettes reçoit le même pas suivi (`raf`, arrêté par « rejouer » et au gel).
3. **`K.graine(n)`** : générateur Park-Miller, celui que `PA:220-221` utilise déjà ; tout tirage neuf d'une scène passe par lui, avec une graine propre à chaque élément (l'aléa partagé de `PB:496-497, 577` ne doit pas être déplacé).
4. **Matières** dans un bloc commun de `kit.css` : variables `--k-encre` (masque de bruit `feTurbulence` en data-URI, environ 0,5 ko) et `--k-papier` (fibres), classes `.k-encre` (impression inégale, double frappe décalée de 0,15 cqw) et `.k-papier`. Elles remplacent, pour les tampons neufs, la courbe redéclarée six fois (lecteur 4) ; les tampons existants gardent leur animation et ne reçoivent que le masque. Réglées en C2 sur la page de contrôle : variables posées sur `.st` (moins de 700 caractères chacune) ; encre presque toujours pleine, à taches fines et quelques manques (tuile de 10 cqw), qui laisse lisible un petit texte ; double frappe en ombre portée sans flou (`filter: drop-shadow`, 0,15 cqw de côté, 40 % de la couleur du texte) : pas sur un élément qui a déjà un filtre ; `.k-encre` ne touche ni `transform`, ni `opacity`, ni `animation`. Précisé à la relecture de C2 : aucune classe ne pose le masque seul (`.k-encre` pose aussi la double frappe) ; un tampon existant le reçoit donc dans sa propre règle de scène, avec les deux déclarations de masque de `.k-encre`, `mask-image: var(--k-encre)` et `mask-size: 10cqw 10cqw`, doublées en `-webkit-` (sans `mask-size`, la tuile garderait les 200 px de l'image au lieu de suivre la largeur de la scène). Si cela revient dans plusieurs scènes, une classe qui pose le masque seul rejoint le bloc commun `matières` des deux feuilles (G7). Fibres de `.k-papier` en image de fond : la couleur du papier se donne par `background-color` (le raccourci `background` les effacerait).
5. **Sonde d'images des maquettes** : l'étiquette `#k-lbl` (`MQ/kit.js:332`) affiche aussi la p95 des 120 dernières images. Précisé en C2 : au rang le plus proche, comme `frameStats` (`src/gfx/stats.js`), et pas au gel (`?freeze=`) : les captures se font en temps virtuel, presque sans image calculée, et y liraient une p95 de plusieurs secondes.
6. **Gel exact des animations CSS neuves (essai)** : `.st.k-frozen .k-vrai { animation-play-state: paused !important }` et la règle `.k-frozen` de `kit.css` qui exclut `.k-vrai`. Une animation neuve longue, marquée `k-vrai`, s'arrête à sa vraie position au lieu de sauter à la fin. [D] À valider dans Chrome sans interface (temps virtuel) par une capture de contrôle ; si ce n'est pas exact, on garde `K.anim` pour tout mouvement long et on retire l'essai. **Écarté en C2 (28 octobre 2026)** : sur la page de contrôle `MQ/controle-outils.html` (hors de `SCENES`), capturée avec les options de `scripts/shots.mjs` à 1 000 ms, la barre `k-vrai` est restée à 0 % (50 % attendu, et 0 % au lieu de 25 % pour une barre partie à 500 ms), la barre de la v1 à 100 % et la barre `K.anim` à 50 % (constat du §1, « Gel des captures »). `.k-vrai` n'existe donc pas : tout mouvement long dont une capture doit montrer la vraie position passe par `K.anim`. La page garde la démonstration (une règle de la page reproduit l'essai) et les matières côte à côte.

Rien d'autre ne change dans le moteur. Pas de palier Bas propre aux cinématiques tant que la mesure (§3.6) ne l'exige pas (risque 2).

### 3.3 Règles de fabrication (toutes les scènes)

- **Une audace par scène (★)**, le reste sous le seuil de l'attention. Chaque détail porte une information (une onde écrite d'après le message, des trous de punaises, une frise vraie).
- **Ce qui bouge** n'anime que `transform` et `opacity` (ou `stroke-dashoffset` sur un petit tracé), sur un élément à part : jamais un enfant d'un calque flouté (`.city`, `.bok`, `.rays`), jamais `top`, `left`, `width` ni `background-position`, jamais un `filter: blur` animé ni un `backdrop-filter` neuf. Un élément mobile sort des grands SVG (SVG superposé de même `viewBox`, ou calque HTML).
- **Pas de SMIL ni de `element.animate`** (ni gelés ni rejoués par le kit) ; aucun `setInterval`.
- **Captures qui ne mentent pas** : tout mouvement de plus de 300 ms passe par `K.anim` (l'essai `.k-vrai` est écarté, §3.2, point 6) ; le style de base est la pose de repos.
- **Noms** : règles et `@keyframes` préfixés par la classe de scène ; ids de scène neufs préfixés (`m1-`…) et disjoints de ceux du jeu (`tests/briefing/ids.test.js`) ; toute classe d'état neuve déclarée dans `stateClasses` (`PA:288`, `PB:624`, `EP:798`, `M3:685`, `M4:377`, `M6:342` ; M1 et M2 n'en ont pas encore). Aucun ajout ne porte la classe `fc` (compteurs de fiches de `PB` et croix de `EP:684`, gardés par `scenes.test.js:163`).
- **Quatre lumières nommées** : ville ambre `#f2b36b` (`PA:9`), lampe `rgba(255,190,120)` (`PB:210`), aube `rgba(255,214,150)` (`EP:473`), écran froid `#9db8ff` à 0,12 à 0,2 (neuve). Le rouge reste `#e04848`.
- **Aucune image raster neuve**, aucun son neuf : les 18 sons de `src/briefing/sound.js:107-129` suffisent.
- **Textes ajoutés** : des étiquettes, jamais des répliques ; au moins 0,9 cqw ; contraste ≥ 4,5:1 pour ce qui sert à jouer ; polices déjà en place ; aucun tiret cadratin. Liste au §3.5, à valider (décision D3).
- **Style** : rien qui montre Anton (sa pièce, oui ; sa forme, jamais) ; aucun corps de la femme ni de la fille ; aucun corps ajouté pour les cibles ; chaque coupe dessine le poste plus haut que la cible.

### 3.4 Enrichissements, scène par scène

Format : instant (début du temps en s, ou ms depuis le début du temps) · ajout · version atténuée. ★ = l'audace de la scène. « L3x » = à vérifier contre le sous-lot du lot 3 une fois fusionné (aucun blocage).

**Prologue A (21,3 s)** [V-L1 pour les ancres]
- ★ A3 (9,1 s) : **la photo sous le pouce**. 1,4 s après APPEL TERMINÉ, l'écran passe en veille sur la photo de famille (`<use href="#pro-fam">`, symbole `PA:124-151`), assombrie, avec 23:12 en grand ; le téléphone redescend sur cette image pendant « Je ne tue plus pour de l'argent. ». Neutre en atténué.
- A1 à A5 : **horodatage de caméscope** orange « 21 02 26 23:12 » en bas à droite ; il roule vers « 14 03 » au glitch d'A4 (bascule directe en atténué) et s'éteint en dernier.
- A2 : **rigoles** (6 à 8 gouttes et leur traînée, `translateY`, graine propre ; traînées figées en atténué), **lumière de l'écran sur le gant** (copie des doigts `PA:271-276` en dégradé radial, `screen`) et **reflet du téléphone dans la vitre** (0,08 à 0,15), un feu d'avion sur un calque à part (fixe en atténué).
- A4 : **trait de porte entrebâillée** derrière le carton (barre chaude de 2 px à 1,2 cqw en 4 s, `scaleX`, son coin de lumière au sol ; fondu sans ouverture en atténué). Aucune pièce, aucun corps. Vignette froide sur le présent.
- A5 : **extinction de tube** (volets en `scaleY`, trait en `scaleX`, 350 ms ; volets seuls en atténué) et rémanence de la date 600 ms.

**Prologue B (65,8 s)**
- ★ B4 (10,5 s) : **le silence habité**. Écran en veille sur la même photo, à 22:40, à moitié hors cadre ; à chaque respiration (repères 900 et 2 500 ms déjà posés, `PB:647`), une buée s'étale sur la vitre puis s'évapore en 1,5 s ; la photo de l'appui (`PB:38-40`) devient nette. Fondus, neutres en atténué.
- B1 à B3 : **l'onde raconte le message** : les 34 hauteurs (`PB:578`) sont écrites au lieu d'être tirées (réplique 1 sur les barres 0 à 12, silence 13-14, réplique 2 sur 15 à 25 avec trois pics nets en 15-17, les coups à la porte, silence 26-27, réplique 3 sur 28 à 33) ; la piste s'allume barre par barre par `K.anim` (exacte au gel), tête de lecture et compteur 0:00 à 0:09. La main se crispe sur « Rappelle-moi. Vite. ».
- B5 : la vibration fait trembler **la lumière** (gant et reflet gonflent de 20 % à chaque `buzz`, `PB:650-651`) : c'est le seul signe de vibration qui reste en atténué, 2 pulsations par seconde au plus. « CHIFFRÉ » se brouille 300 ms puis se pose (sans brouillage en atténué).
- B6 à B10 : **trace de la voix** (ligne d'oscilloscope de 1 px tant que `.radio.talk` est posée, plate en atténué) ; à « les bornes », une vignette rouge se resserre des bords ; l'avatar « ? » grossit lentement et rougeoie (son saut `PB:98` reçoit sa jumelle atténuée).
- B11 : le canal se referme en une ligne (classe `cut` posée au moment où `on` est retirée : `scenes.test.js:171` reste vert).
- B12 : accolade à l'encre reliant les deux lignes du même numéro (tracée par `K.anim`), REFUSÉ à l'encre vraie.
- B13 : **raccord écran vers mur** : de 2,5 à 3 s, une chemise ambre grandit depuis la bulle DOSSIER et devient la lumière de la lampe (calque dans `#scene`, `.scr` coupant ce qui dépasse, `PB:68`) ; la coupure reste à 2,7 s ; fondu enchaîné en atténué.
- B14 à B16 : la lampe vit (12 à 16 grains de poussière, faisceau fixe en `screen` ; poussière figée en atténué), l'ombre de la fiche se colle au liège quand on l'épingle, papier vrai ; **les fils se tendent** (courbe molle puis nette, par `K.anim` sur le tracé) et le mur encaisse l'arrivée du « ? ».
- B17-B18 : deux lumières (lueur froide du téléphone contre l'ambre de la lampe), trois points « en train d'écrire » (fixes en atténué), tampons qui bavent. L'avatar reste « ? ».
- B19 : **tournée du réticule** : même départ, même arrivée, même durée (2,6 s), en passant par les six dossiers dans l'ordre des missions, en `transform` au lieu de `left`/`top` (`PB:252-255`) ; diagonale actuelle en atténué.
- B20 : le réticule se contracte pendant que le trait du titre s'étire ; SNIPER se révèle lettre par lettre (fondu en atténué).

**Épilogue (48,5 s libres, 48,9 s enfermés)**
- ★ E4 à E13 : **le signal se tait**. Chaque palier de `calm()` (`EP:677`, appelé en `EP:755, 766, 777, 782, 786`) pose `calm1` à `calm3` sur `#st` ; le style de la scène baisse alors `.scan`, `.grain`, `.track` du kit et coupe `.flick`, en fondus de 3 s : FIN devient l'image la plus nette du jeu. Test : `#st` porte `calm3` à la fin (rouge aujourd'hui).
- E1-E2 : **le mur a vécu** (trous de punaises, auréole de café, coins arrachés, fiches jaunies, fils détendus en courbes à la place des `line` de `EP:449-451`) ; de près, le « ? » montre la traque (anciens trous, « ? » gommés, cercle repassé). La caméra d'épaule passe à mi-amplitude puis s'arrête au matin.
- E3 : encre fraîche de la dernière croix, qui sèche en 1,5 s ; ombre de la main collée au liège.
- E4-E5 : les punaises éclosent en bokeh quand le mur se floute ; batterie en ambre ; trace de la voix comme en B6. **Correctif** : jumelle atténuée de `epi-buzz` (`EP:121`) et lumière qui pulse à la place.
- E6 : Ken Burns sur la photo du policier (cadre `overflow: hidden`, `EP:194` ; fixe en atténué), pli du journal, flèche et soulignement rouges sans mot.
- E7 libres : le ciel de la photo se réchauffe en 3 s. E7 enfermés : chariot d'impression qui accompagne la ligne clé, brume sur la mer ; correctif du tiret de `EP:647` (« N/D »).
- E8-E9 : compte à rebours à chiffres qui roulent (`K.anim` ; sauts simples en atténué), cadre d'expiration qui s'érode.
- E10 : « ANTON » se dissout lettre par lettre (`scenes.test.js:61-62` ne regarde que des états passés) ; rien n'est ajouté au panoramique filé.
- E11-E12 : le verre du cadre attrape le soleil une fois, longues ombres du matin, carreaux de lumière qui dérivent de 0,8 cqw (sur le `svg.lit` entier, pas sur le `g` filtré) ; respiration des rayons (`EP:271`) déplacée sur l'opacité d'un conteneur.

**M1, Markov (41,4 s)** : le creux à remplir est T7 à T9 (25,3 à 38,6 s), sans aucun repère aujourd'hui (`M1:121-123`) [V].
- ★ T7 à T9 : **le plan se met à parler**, calé sur la réplique. T7 : ligne de visée en pointillés et « 31 m » encadré (0 ms), les crochets quittent le visage pour le costume avec une pastille de tissu bleu nuit (vers 1 100 ms), pictogramme de téléphone près de la punaise (vers 2 300 ms), itinéraire de livraison en tirets rouges vers la camionnette (vers 3 300 ms, L3b). T8 : 8 à 12 passants gris (posés en T6) prennent un anneau gris, la punaise reste seule en rouge (0 ms) ; une cartouche en laiton près de TON POSTE avec `slap` (vers 1 150 ms) ; flèche en tirets du poste vers la trappe du toit (vers 2 100 ms : on sort, on n'entre jamais) ; le plan baisse à 60 % sauf punaise, visée et poste. T9 : une note d'honoraires glisse en travers des pièces (vers 100 ms), tampon OFFERT (vers 1 550 ms, la chute de « Ça m'a coûté cher »), l'onde de la punaise s'arrête (vers 1 950 ms).
- T1-T2 : incrustation « ● REC » qui avance d'une seconde par seconde (`K.anim`, exacte au gel), cascade spectrale sous l'onde, mots-clés soulignés au feutre une fois tapés, triangulation dans la marge droite, ruban de télex dans la marge gauche (« COPIE À A. », Anton signe « A. », `M3:561`).
- T3 à T5 : carton texturé, arrêt sur image de vidéosurveillance dont les secondes avancent jusqu'au verrouillage, halo de développement, caviardage au feutre tracé, encre commune sur CIBLE, réglette médico-légale et reflet glacé sur les photos (qui restent telles quelles, `REPRISE.md:69` ; aucun corps ajouté), trois fils rouges vers le portrait sur « c'est lui » ; flash plafonné à 0,3 en atténué.
- T6 : papier de plan (plis, rose des vents, « ÉCHELLE 10 m »), halos de lampadaires, lampe du point d'appel qui s'allume en vacillant, chenillard sur le tracé, ruban de mesure pendant le compteur. **Poste** : le carré passe au muret côté rue et le tracé devient droit, au même repère (spec du lot 3 §3 : toit, muret côté rue ; L3b à vérifier).
- T10 : bokeh de guirlande derrière le titre ; l'incrustation affiche 22:47:00, l'heure de la mission (spec du lot 3 §3).

**M2, les frères (36,3 s)**
- ★ T3 (5,5 s) : **un seul visage**. Vers 2 000 ms, chaque photo porte 600 ms la photo de l'autre frère à 30 % : même modèle, seul le polo diffère ; échantillon de tissu au bout de POLO BLANC et POLO BEIGE. Le joueur apprend son seul signe sans marqueur (`REPRISE.md:71`). Sans surimpression en atténué.
- T1 : fil de l'acier qui descend la fente, carrelage de boucherie à 4 %, fente qui respire (fixe en atténué).
- T2 et T4 : carton à fibres et étiquette de suspension, impulsion qui court sur le fil, néon froid allumé en deux à-coups (0,3 au plus), laser de caisse sur chaque code-barres avec `beep`, papier thermique, givre statique.
- T5 : **lumière de la vitrine** (trapèze ambré depuis l'auvent, `M2:262`, et sur la coupe), BOUCHERIE en néon, balle fantôme qui parcourt une fois les lignes de visée.
- T6 à T8 : la paire glisse puis revient (Marc garde son écart, routine « suiveur » du lot 3), anneau de 2 s qui se vide autour de « < 2 s » (`.blink` de `M2:143` reçoit sa jumelle), auréole de verre mouillé sur « verre », tout baisse à 70 % sauf vitrine, paire et poste.
- T9 : dernier éclat d'acier à la fermeture, estampilles 02-A et 02-B en filigrane.

**M3, le port (44,2 s)** : déjà le plus dense ; atmosphère d'abord, deux ajouts d'information seulement.
- ★ T7 (25,9 s) : **caméra thermique « CAM 4 · THERMIQUE »** dans la zone libre (78 à 97 cqw, 27 à 45 cqw) : le conteneur en contour, puis 14 taches rondes, jamais des silhouettes, qui s'allument de 2 300 à 3 450 ms avec la frappe ; sans pulsation en atténué.
- T6 : **onde du coup de feu** : au TIR 1, un front part de la grue et atteint Mira 450 ms plus tard (155 / 343 = 0,45 s, spec du lot 3 §2 « 3c »), cote « 0,45 s » ; téléphone allumé dans la main de Mira à l'alerte ; `.blinkr` reçoit sa jumelle.
- T1-T2 : **parallaxe en trois plans** (ville ; quai, grues et conteneurs ; eau), même `viewBox`, facteurs ×1,03 / ×1,08 / ×1,10 en poussée, le plan du milieu gardant les facteurs actuels pour que FRET et 2 CIBLES restent calés (un seul facteur en atténué) ; troisième couche de pluie et les trois en `transform` ; gouttes sur l'objectif ; la Kalina dans le panorama (proue sombre, hublots) ; projecteur au sodium fixe ; quai mouillé ; ronds de pluie (graine `M3:607`). **Trois portiques au lieu de quatre** (`M3:624` contre `M3:480-487` et la spec du lot 3 §3).
- T3 à T5 : gouttes réfractées, macroblocs qui se dissolvent avec la barre, files de points sur les flèches de flux, cadran de 21 h à minuit, traits du registre tracés à la main, « 0 ERREUR » entouré.
- T8 : **coupe à l'échelle** : 41 m sur 155 m font 15° (14,9°, spec du lot 3 §3) au lieu des 38° dessinés (`M3:582`), cote « 15° » ; arc de la balle et « ZÉRO 155 m » (libellé de la décision 1 du lot 3) ; navette de Vosko et Mira sur le plan, revenue avant T9.
- T9-T10 : cadenas dessiné qui brille une fois, les 14 traits du registre à 10 % sur le conteneur, la pluie redouble ; reflet du titre dans l'eau, feux des grues 300 ms dans le noir.
- Ne pas faire défiler les horodatages des caméras (23:52 et 23:54 contre « DIRECT · 23:41:07 », `M3:310, 329, 349`).

**M4, la base (38,8 s, 430 m gardés)**
- ★ « trois tirs » (26,0 s) : **la frise des 6 s**, sous « 3 TIRS EN 6 S » : tirs à 0, 1,5 et 3 s, chacun avec ses 0,54 s de vol, onde du son à 1,25 s, igloo à 6 s (spec du lot 3 §2 « 3c ») ; les tirs se posent avec les pastilles 1, 2, 3 (1 800, 2 100, 2 400 ms) et le son et l'igloo à 2 750 ms (`M4:422-423`). Elle dit la vérité : seul le premier tir arrive avant le son. Avec les **fuites vers les abris** : flèches pointillées de V, H et R vers la porte d'igloo la plus proche, portes cerclées de rouge.
- « les officiers » (11,1 s) : **nuancier d'identification** : sur chaque étiquette, une petite silhouette en couleur et une pastille aux verrouillages (1 010, 2 110, 4 660 ms) : Verne bleu nuit, chignon, planchette ; Halder casque noir, plus une pastille sable barrée (les gardes sont casqués aussi) ; Rossi chemise blanche. Aujourd'hui les portraits passent au gris puis au kaki (`.st .photo img` de `kit.css`, `M4:100-102`) et ces couleurs ne se lisent plus [V]. Signature « V. » tracée sur les bordereaux.
- « ton poste » (21,9 s) : **carte de tir** : cercles de 100 à 400 m autour du château d'eau, plus le cercle de 430 m en jaune, chacun tracé quand le compteur le franchit (le compteur part à 3 000 ms et dure 1 000 ms, `M4:416`) ; « ZÉRO 430 m » sous le compteur ; coupe à l'échelle où la ligne de tir descend à 5° (4,9°, spec du lot 3 §3).
- « la base » (16,5 s) : parallaxe du travelling (un mur plus large glisse moins vite que le liège), itinéraires des trois officiers vers le portail puis vers V, H, R, horloge du rendez-vous jusqu'à midi, fuite de lumière chaude au « Plein soleil ».
- Autres : CAM 2 vivante (compteur REC, cadre de mise au point : le lieu d'Anton, jamais Anton), « ×2 » du post-it entouré, éclaboussures au tampon, liasse de billets, douille de 5,56 sous scellé ; « désaveu » : la lampe du liège baisse, le REC s'arrête. Correctif : le tampon « [T] DÉFENSE [T] » (`M4:173`, [T] = tiret cadratin) devient « · DÉFENSE · ».

**M6, la fête (44,8 s)**
- ★ global : **le trou noir vivant** : 16 à 24 grains d'or et de rouge spiralent vers le disque (`M6:15-25`), avalés avec `void.big` au carton (1 300 ms, `M6:390`) ; rotation et échelle seulement ; figés en atténué.
- **Atténués de M6** : jumelles pour les 12 animations infinies (déchirures, sautes, trait balayeur, danse, cœur).
- écoute (0,9 s) : deux voix (décision D2) : étiquettes VOIX 1 et VOIX 2, onde d'une autre couleur dès « Oui » ; durée d'appel qui court dans l'en-tête (elle annonce, sans un mot, la fenêtre liée à l'appel, décision 8 du lot 3).
- dossier, sources : onglets 01 à 05 barrés derrière le 06 avec des fils vers « ? » ; recherche faciale qui échoue ; télex qui imprime « NÉANT » à chaque source barrée.
- invitation : la dorure accroche la lumière une fois ; une liste de 24 invités sort de sous le carton et se noircit avec le compteur.
- la fête (23,8 s) : salle vivante (piste qui pulse, ondes des enceintes, moins de 2 Hz) ; **réticule qui cherche** : 7 sauts de non-danseur en non-danseur (graine fixe), un « ? » à chaque fois, puis il s'efface sans verrouiller ; pictogramme de téléphone à lueur d'écran (le signe de jeu, spec du lot 3 §3) ; porte ENTRÉE cerclée de rouge.
- traçage : la barre devient une chaîne de nœuds qui rougissent avec le compteur.

**M5 : après la fusion du bar seulement.** Le chantier du bar possède `briefing-m5.html` et `briefing-m5b.html`. La v2 y passera ensuite (tâche C16) avec ce qui reste vrai quel que soit le découpage : cascade spectrale du scanner, code-barres sous les 12 vendus (sans toucher `.sold` ni `#soldn`, gardés par `scenes.test.js:200-227`), **fragment de photo brûlée de 1998** montrant la casquette (pas le visage) avec des braises au tampon, poussière dorée derrière la voiture 3, feux stop au freinage, traçante de 0,17 s, fuites de lumière orange sur les coupes. Demandes au chantier du bar (à porter dans son plan, la v2 ne les fait pas) : soleil de la carte du mauvais côté (`M5:85`, lueur en haut à droite alors que le soleil est derrière le tireur à gauche, spec du lot 3 §3) ; « 138 m » sur la ligne de visée ; clignotement `m5-sm` de `M5:43` à environ 4 Hz, au-delà de 3 par seconde, à doter d'une jumelle atténuée. **Fait par l'intégrateur** : ces trois demandes sont portées dans les tâches B14 et B15 de `m5-bar-plan.md`.

### 3.5 Données et textes neufs (étiquettes, aucune réplique ; à valider, décision D3)

| Scène | Étiquettes neuves |
|---|---|
| Prologue A | « 21 02 26 23:12 », « 14 03 26 21:47 » (chiffres déjà dits) |
| Prologue B | aucune (option écartée : la chronologie 18:52 · 19:04 · 21:47 · 22:41) |
| Épilogue | « N/D » (remplace le tiret de `EP:647`) |
| M1 | « ● REC 22:46:19 » à « 22:47:00 », « 21:47:02 · DÉCROCHÉ », « 21:47:06 · RACCROCHÉ », « COPIE À A. », « ÉCOUTE · MARKOV · ████ € », « OFFERT », « ÉCHELLE 10 m », « 31 m » ; correctifs « · » en `M1:29` et `M1:51` |
| M2 | « ZÉRO 42 m » (optionnel) |
| M3 | « CAM 4 · THERMIQUE », « 0,45 s », « 15° », « ZÉRO 155 m » |
| M4 | « ZÉRO 430 m », « 100 m » à « 400 m » sur les cercles, « 0 s », « 1,5 s », « 3 s », « 6 s » sur la frise ; correctif « · DÉFENSE · » |
| M6 | « VOIX 1 », « VOIX 2 », « NÉANT » |

Le libellé « ZÉRO n m » reprend celui du télémètre du lot 3 (décision 1 de sa spec) ; à comparer au texte réel du HUD une fois la tâche A4 fusionnée.

### 3.6 Budgets

**Poids**
- 0 image neuve ; 0 son neuf.
- Source des maquettes : au plus +15 ko non minifiés par scène en moyenne, +130 ko pour les neuf (estimations des lecteurs : prologues et épilogue ≈ 30 ko, M1 à M3 ≈ 60 ko, M4 et M6 ≈ 20 ko, M5 ≈ 10 ko).
- Total du budget de la spec des cinématiques (§8) : images + chunks des scènes ≤ 1 500 000 octets après `vite build`, mesuré par `scripts/poids.mjs --check` (tâche C0), avec `--avec-enquete` quand l'enquête compte. La question de compter l'enquête est la décision D1 ; avec la conversion WebP des six portraits (≈ 0,8 Mo libérés [D-L4]), la v2 tient le budget même enquête comprise.
- **Propriétaire unique (intégrateur)** : C0 est la seule tâche, tous chantiers confondus, qui convertit les portraits en WebP (la tâche K9 du lot 4 est retirée) ; objectif repris du lot 4 : ≤ 350 ko pour les six. C0 **crée** `scripts/poids.mjs` et `tests/scripts/poids.test.js` ; la tâche E0 du lot 5 les étendra (build en mémoire, JS de démarrage, `scripts/budgets.js`) sans changer les options publiées ici (`--check`, `--avec-enquete`) ni le seuil de 1 500 000 octets.

**Rendu** (mesuré par `scripts/cine-perf.mjs`, tâche C3 ; référence de la v1 : `docs/superpowers/specs/annexes/2026-10-28-cine-v1.json`, README des annexes, « Cinématiques v2 »)

| Plafond, par scène | Valeur |
|---|---|
| Animations en cours simultanées (`document.getAnimations()` en Chrome, relevé toutes les 250 ms) | ≤ 40 |
| Flou animé (`filter: blur` ou `backdrop-filter` dont la valeur change) | 0 neuf |
| Calques plein cadre en `mix-blend-mode` par plan | ≤ 1 neuf |
| Canevas | aucun |
| p95 de la durée d'image en Chrome réel, 1280 × 720, processeur ralenti ×4 | ≤ 22 ms (`BUDGET_MS`), et ≤ 1,15 × la p95 de la v1 de la même scène |

Le processeur ralenti ×4 est l'approximation d'un PC de milieu de gamme déjà employée par le dépôt (`RALENTI=4`, `scripts/verif-mission.mjs`) ; la carte graphique ne se simule pas (risque 2).

**Mesuré en C3** (28 octobre 2026 ; v1, 10 cas, deux passes à processeur normal et deux à ×4, machine de Rayan partagée avec trois autres chantiers ; tableaux et détail : README des annexes, « Cinématiques v2 ») :
- **Mesure** : `node scripts/cine-perf.mjs <id> --ralenti=4` (conditions dans son en-tête : modèles des personnages bloqués, page de 1280 × 720 posée par émulation). « Animations en cours » : celles de `getAnimations()` dans l'état `running`, animations et transitions CSS ; une transition compte dès sa création, son délai compris (des fondus échelonnés par `transition-delay` comptent tous ensemble).
- **p95** : de 5,7 à 16,6 ms à ×4 dans la v1, le plafond de 22 ms tient partout. Sans écran, Chrome cale ses images sur celui de la machine (180 Hz chez Rayan) : la p95 ne bouge que par pas de 5,56 ms, et elle a sauté d'un pas entre deux passes du même code dans 3 cas sur 10 à ×4 (m3, m4, prologue A). « ≤ 1,15 × la v1 » (1,15 × 11,1 = 12,8 ms, sous le pas suivant) échouerait donc sur le seul bruit. [D] Lecture proposée, à confirmer par Rayan (décision D8, §4) : comparer à la plus grande p95 des passes de la v1, et ne retenir un dépassement que s'il se répète sur deux passes de la v2 ; images lentes et images par seconde (annexe) disent le sens d'un écart.
- **Animations** : la v1 dépasse déjà 40 en m6 (70), m1 (63), m3 (47) et dans l'épilogue (46) ; m5 est à 40. Causes : en m1 et m6, l'onde du kit pendant l'écoute du téléphone (55 à 56 transitions `height`, une mise en page à chaque image ; sans elles, m1 ne dépasse pas 19) ; en m6, hors de l'écoute, les fondus échelonnés des 24 invités au début de la fête, avec les danseurs et la radio (jusqu'à 60 : sans l'onde, m6 reste au-delà de 40) ; en m3, des pointes brèves, quand les caméras se réduisent en vignette (transitions de mise en page) et quand le plan se dessine ; dans l'épilogue, les 26 grains de poussière. Instants, sélecteurs et relevés : README des annexes, « Cinématiques v2 » (diagnostic du 29 octobre). [D] Lecture proposée, à confirmer par Rayan (décision D8, §4) : plafond de 40 pour les scènes dont la v1 le tient ; pour m1, m3, m6 et l'épilogue, pas plus que le maximum de la v1 (63, 47, 70, 46). Piste pour C5 (même image, moins de repeints) : l'onde du kit en `transform: scaleY` (composition au lieu de mise en page), ou sans transition (56 animations en cours de moins en m1 et m6 : m1 repasserait sous 40, pas m6).

### 3.7 Effets atténués (règles)

- Mouvement continu (dérive, pluie, épaule, danse, passants, ondes `.pulse`, onde de l'écoute `K.wave`) : arrêté dans sa pose de repos.
- Clignotement : allumé fixe. Flash : 0,3 au plus. Aucun effet au-delà de 3 flashs par seconde (spec du lot 1 §4.5).
- Mouvement ponctuel (glissement, zoom, tournée du réticule) : fondu de 300 ms vers l'état final, ou coupe.
- Gardés : fondus, frappes, tracés (le tracé informe), sons.
- Une règle `.<scène>.k-reduced …` par effet, jamais `@media (prefers-reduced-motion)` (le réglage « Non » serait ignoré, `main.js:372`).
- Les scènes lisent l'option par `K.$('st').classList.contains('k-reduced')` quand un script doit choisir (modèle : `K.anim(…, { attenue })`).

### 3.8 Tests (chacun vu rouge avant le code)

| Test | Témoin rouge |
|---|---|
| G1 à G3 (§3.1), écrits sur la v1 | `min` modifié ; réplique retouchée ; repère décalé de 100 ms |
| G4 atténués statiques | `epi-buzz` (`EP:121`) aujourd'hui |
| G4 resserrée (relecture de C4) : plus d'un tour compté comme infini, rien de répété en effets atténués, aucune animation hors des feuilles ; onde de l'écoute figée en atténué | M4 retouchée pour l'essai (jumelle en `k-pulse` infinie, attribut `style` et script qui posent `k-blink`) : verte avant, rouge après ; feuilles d'essai (40 tours, `-webkit-animation`) ; l'onde qui s'agite en atténué (14 poses en M1) |
| G5 rendu statique | `@keyframes` neuf sur `top` ; `setInterval` dans une maquette |
| G6 textes des scènes | m1, m4, m6, épilogue aujourd'hui |
| G7 blocs communs identiques | une copie retouchée seule |
| `?attenue=1` en jeu : `#st` porte `k-reduced` | aujourd'hui non |
| `?attenue=1` dans les maquettes : `k-reduced`, glitchs au tiers, ni glitch d'ambiance ni secousse, carton et grain comme le jeu ; étiquette « atténué » et p95 des 120 dernières images, pas au gel (`tests/briefing/kit-commun.test.js`) | aujourd'hui non |
| `K.anim` : au gel à mi-course, `dessin` reçoit 0,5 ± 0,02 ; après `destroy`, plus aucun appel ; 0 minuteur à la fin (`scenes.test.js:28`) | sans `K.anim` : un tracé en `transition` est entier au gel (`.k-frozen`, bloc commun `gel`) |
| `K.graine(7)` rend la même suite qu'en `PA:220-221` | une graine différente |
| Épilogue : `#st` porte `calm3` à la fin des deux variantes | rouge aujourd'hui |
| Une garde dynamique par effet atténué neuf, sur le modèle de « prologue B, effets atténués » (`scenes.test.js` ; `getComputedStyle(el).animation` contient le nom sans l'option, ne le contient plus avec) | la règle jumelle retirée |
| Prologue B : la piste du message, gelée à 5 000 ms, a exactement `⌊(5000 − 1700) / 250⌋` barres allumées | piste en `transition` (`PB:165`), entière au gel |
| M3 : la coupe dessine 15° ± 1° (pente du tracé de visée à l'échelle uniforme) | 38° aujourd'hui (`M3:582`) |
| M4 : frise, tirs à 0, 1,5, 3 s, son à 1,25 s, igloo à 6 s, positions proportionnelles à ± 1 % | élément absent ne compte pas : le témoin est une frise aux pastilles espacées de 300 ms (`M4:422`) |
| Port : `.webp` reconnu par `generateScene` (tâche C0) | `port-maquette.mjs:52` rend `png` |
| Tests existants intacts : `scenes.test.js` (dont 8 / 8 fiches, ANTON, radio éteinte, NUMÉRO MASQUÉ), `ids.test.js`, `port-maquette.test.js` | non-régression |

Les vérifications réelles (captures, mesure de rendu, poids) sont au plan, tâche par tâche.

### 3.9 Critères de fin chiffrés

1. G1 : les 10 durées du §1 au ms près ; G2 et G3 verts (au plus une réplique changée, celle de M6, si D2 = B).
2. G4 : 0 animation répétée sans jumelle et rien de répété en effets atténués, hors liste blanche, aucune animation hors des feuilles ; G6 : 0 tiret cadratin visible dans les 9 scènes (M5 compris après le bar).
3. Chaque scène a son ★ et au moins 5 ajouts du §3.4 ; aucune image neuve.
4. Rendu, par scène : ≤ 40 animations simultanées ; p95 ≤ 22 ms et ≤ 1,15 × la v1 à processeur ralenti ×4 (lus selon la décision D8, §4, détaillée au §3.6, « Mesuré en C3 » : la v1 dépasse déjà 40 dans quatre scènes, et la p95 saute d'un pas d'une passe à l'autre) ; mesures avant et après dans l'annexe `docs/superpowers/specs/annexes/` (README, « Cinématiques v2 »).
5. Poids : `node scripts/poids.mjs --check --avec-enquete` vert (≤ 1 500 000 octets enquête comprise) tant que D1 = A, recommandation appliquée ; `--check` seul ne compte que les images et les scènes : il ne vaut que si Rayan tranche D1 = B.
6. Captures gelées, maquette et jeu, aux instants du plan, en normal et en atténué, regardées par l'agent et envoyées à Rayan ; deux captures du même instant identiques à l'octet (pas encore le cas de m2 et m3 sur la v1 : §1, « Gel des captures »).
7. `npx vitest run --maxWorkers=2` vert ; `npx vite build` sans erreur ; aucun tiret cadratin neuf (maquettes, specs, commits).

### 3.10 Risques

1. **Le montage dérive sans qu'on le voie.** Parade : G1 à G3 écrits avant toute retouche, sur la v1.
2. **Coût sur un vrai milieu de gamme** : la v1 n'est mesurée que sur la machine de Rayan (C3, §3.6, « Mesuré en C3 ») ; la carte graphique d'un milieu de gamme n'est pas simulée. Parades : règles du §3.3, plafonds du §3.6, mesure v1 contre v2 ; si une scène dépasse, on retire des couches (décision écrite) ; en dernier recours, un palier Bas (`k-bas` posé selon `settings.graphics`), hors de ce chantier.
3. **Poids** : sans WebP, la marge est de l'ordre de 10 à 20 ko si l'enquête compte. Parade : C0 en premier (D1).
4. **Deux kits** : un outil commun corrigé d'un seul côté. Parade : G7.
5. **Captures fausses** pour le neuf si `.k-vrai` ne marche pas en temps virtuel. Parade : `K.anim` pour tout mouvement long, vérifié par une capture de contrôle en C2. Constaté en C2 : `.k-vrai` ne marche pas en temps virtuel, l'essai est écarté et `K.anim` tombe juste (§1, « Gel des captures »).
6. **Conflits** : M5 (bar), `REPRISE.md` (tous), `kit.css` du jeu (le lot 4 voudra la surimpression). Parades : M5 en dernier ; `REPRISE.md` touché une seule fois, à la fin ; outils communs en blocs marqués, faciles à fusionner.
7. **Trop, c'est trop** : une scène surchargée lit moins bien que la v1. Parade : une audace par scène ; Rayan juge les captures avant/après de chaque scène ; tout ajout se retire seul.
8. **Machine partagée** (plusieurs chantiers) : `vitest --maxWorkers=2`, un seul Chrome à la fois, captures et mesures de rendu jamais pendant un memtest ni pendant que Rayan joue.

## 4. Décisions à faire trancher par Rayan

**Tranchées le 28 octobre 2026** : Rayan a retenu toutes les recommandations (`decisions-rayan.md`, hors dépôt) : D1 = A (T1), D2 = B (H7), D3 = A (H8), D4 = A (H9), D5 = A et D6 = A (bloc), D7 = A (H10). D8, ouverte depuis C3, reste à trancher : sa recommandation A s'applique en attendant.

1. **D1, le poids.**
   - A (reco) : convertir d'abord les six portraits PNG en WebP à transparence (≈ 0,8 Mo gagnés, outil gratuit : Chrome sans interface, aucune dépendance neuve), la v2 tient alors le budget même en comptant l'enquête. Un seul chantier le fait : C0 (arbitrage de l'intégrateur ; ni le lot 4 ni le lot 5 ne convertissent d'image).
   - B : ne compter que les cinématiques (sans l'enquête) dans le 1,5 Mo ; marge ≈ 115 ko, juste suffisante.
   - C : relever le budget à 2 Mo.
2. **D2, les tirets cadratins visibles.**
   - A : corriger les seules étiquettes (`M1:29`, `M1:51`, `M4:173`, `EP:647`) et garder la réplique de M6 telle quelle.
   - B (reco) : A, plus la réplique de M6 en deux voix sur deux lignes, sans tiret (« « Ils sont tous morts ? » puis « Oui. Il ne reste que vous. » », mêmes mots), `post` passé de 250 à 374 ms : la durée reste identique au ms (G1).
   - C : ne rien toucher (les tirets restent un reste connu, `REPRISE.md:110`).
   - **Retenue : B** (H7). Fait en C4 : la réplique s'écrit `« Ils sont tous morts ?`, un saut de ligne, puis `Oui. Il ne reste que vous. »` (le saut de ligne remplace « espace, tiret, espace » : deux caractères de moins, 124 ms d'estimation rendus à `post`, 374 ms), affichée sur deux lignes par `white-space: pre-line` sur `#trans` de M6 (gardé depuis la relecture de C4 par `tests/briefing/textes-scenes.test.js`) ; G1 reste vert au ms. **Décision écrite pour G2** : l'entrée `m6` de `tests/briefing/references/repliques-v1.json` est retouchée à la main pour cette seule réplique. Les étiquettes VOIX 1 et VOIX 2 et l'onde d'une autre couleur dès « Oui » (§3.4, M6, « écoute ») restent à faire avec les autres ajouts de M6 (C15).
3. **D3, les étiquettes neuves du §3.5.**
   - A (reco) : toutes, comme du visuel (aucune réplique ne change).
   - B : seulement les chiffres et unités (heures, distances, angles), pas les mots (OFFERT, NÉANT, VOIX 1/2, CAM 4 · THERMIQUE).
   - C : aucune étiquette neuve.
4. **D4, les échos de la famille.**
   - A (reco) : la photo de famille en fond d'écran du téléphone en A3 et B4 (le cadre final de l'épilogue reste la seule photo debout) ; pas de dessin de la petite sous le plan du tableau ; pas d'écho « MAISON · 19:04 » en M6.
   - B : A, plus le coin d'un dessin de la petite (sans personnage) sous le plan du tableau en B14.
   - C : aucun écho (ni photo sur l'écran).
5. **D5, l'ampleur.**
   - A (reco) : tout le §3.4, scène par scène (18 tâches au plan).
   - B : les gardes, les outils et les seules audaces (★) : environ 11 tâches.
   - C : prologues et épilogue d'abord, briefings ensuite dans un second chantier.
6. **D6, les corrections de dessin qui suivent le lot 3** (poste de M1 au muret côté rue, trois portiques et coupe à 15° en M3).
   - A (reco) : les faire maintenant, d'après la spec du lot 3 §3, et les revérifier contre les cartes quand 3b et 3c sont fusionnés.
   - B : attendre la fusion de 3b et 3c.
7. **D7, la pièce d'Anton.**
   - A (reco) : on montre son matériel et sa lumière (CAM 2 de M4, lampe du liège qui baisse au désaveu), jamais de reflet sur la vitre de l'écran.
   - B : en plus, un reflet de lampe de bureau à 3 ou 4 % sur la vitre de l'écran des briefings, sans aucune forme humaine.
8. **D8, la lecture des plafonds de rendu** (ouverte par la mesure de la v1, C3 ; §3.6, « Mesuré en C3 »). Lus à la lettre, les plafonds du §3.6 échouent sur la v1 elle-même : m1, m3, m6 et l'épilogue dépassent 40 animations en cours, et la p95 saute d'une synchro de l'écran (5,56 ms) d'une passe à l'autre du même code, au-delà de 1,15 fois la v1.
   - A (reco) : animations, au plus 40 pour les scènes dont la v1 tient ce plafond, au plus le maximum de la v1 pour m1, m3, m6 et l'épilogue (63, 47, 70, 46) ; p95, au plus 22 ms et au plus 1,15 fois la plus grande p95 des passes de la v1, un dépassement n'étant retenu que s'il se répète sur deux passes de la v2.
   - B : animations au plus 40 partout : la v2 ramène d'abord m1, m3, m6 et l'épilogue sous 40 (onde du kit, fondus des invités de M6, vignettes des caméras de M3, poussière de l'épilogue), travail que le plan ne prévoit pas ; p95 lue comme en A (à la lettre, le bruit seul la ferait échouer).
