# Lot 2 : le tir (sensations, précision, décor)

> Conçu le 9 octobre 2026, pendant l'exécution du lot 1. Carte blanche de Rayan : spec rédigée d'un bloc. Objectif fixé par Rayan : « un truc quasi parfait ».
> Sources : `.superpowers/sdd/2026-10-07-reprise/audit/rapport-gameplay.md` (§1.4 à §1.6, §4, §5, §7), décisions de Rayan dans `docs/superpowers/REPRISE.md`.

## 1. Pourquoi, et ce que ce lot ne fait pas

Le tir est le cœur du jeu, et c'est aujourd'hui sa partie la moins soignée :
- on tire **à travers les murs**, les conteneurs, les voitures et les jeeps ;
- la zone touchée est une boîte de 0,8 × 2 × 0,8 m, environ 60 % plus large que la silhouette, qui ne suit ni la pose ni l'animation ; la tête est « tout ce qui dépasse 1,45 m » ;
- aucun recul, pas de culasse, une confirmation de touche en **bip d'arcade** (880 puis 660 Hz), un traceur d'un pixel qui n'apparaît qu'à l'impact, la pluie de M3 muette ;
- la lunette s'ouvre et zoome d'un coup ;
- depuis le lot 0, le zoom est réel : le tremblement, exprimé en pixels, devient 4 à 12 fois plus petit en angle. La difficulté réglée « sans zoom » ne vaut plus rien, et le stress est plein après 2,1 s de visée ;
- un garde touché sans silencieux **survit**.

**Hors du lot :** distances réelles, chute de balle, vent, temps de vol variable, postes conformes, identification sans marqueur, casting imposé, fin différée de M3 (lot 3) ; caméra qui suit la balle et tampon (lot 4) ; post-traitement (option de qualité, plus tard). Tout ce qui est construit ici doit pourtant **tenir à 430 m** : unités angulaires, sons dépendant de la distance, occlusion à toute distance.

## 2. Approches envisagées

**Zones touchées**

| | Approche | Pour | Contre |
|---|---|---|---|
| A | **Capsules calées sur les os** (tête : sphère sur l'os `Head` ; torse : capsule `Hips`→`Neck` ; bras et jambes : capsules entre os), recalculées au moment de la résolution | Suit la pose réelle, précis, coût négligeable (une vingtaine de tests par tir et par PNJ candidat) | Noms d'os à relire dans chaque GLB (tous Mixamo, préfixe variable `mixamorigN:`) ; repli procédural à traiter à part |
| B | Boîte resserrée par pose | Simple | Toujours fausse en marche, assis ou à la mort |
| C | Lancer de rayon sur le maillage animé | Exact | Exige le skinning sur le processeur : cher, inutile pour un tir |

**Choix : A.** Le repli procédural (modèles absents) reçoit des capsules dérivées de ses groupes connus (`makePerson`).

**Occlusion par le décor**

| | Approche | Pour | Contre |
|---|---|---|---|
| A | **Rayon contre les maillages de la carte marqués « solides »** (`THREE.Raycaster` sur une liste tenue par `maps.js`), puis comparaison avec la distance du PNJ touché | Exact, une seule requête par tir, marche à toute distance | Il faut marquer ce qui arrête une balle et exclure le reste (pluie, lumières, effets, marqueurs) |
| B | Réutiliser les `obstacles` de `maps.js` | Existe déjà | Ce sont des boîtes en XZ sans hauteur, pensées pour la marche des PNJ : un muret arrêterait une balle tirée au-dessus |

**Choix : A.**

**Tremblement**

| | Approche | Pour | Contre |
|---|---|---|---|
| A | **Tremblement angulaire** (milliradians), converti en pixels selon le champ de vision courant | Même difficulté à ×4 et à ×12, à toute résolution d'écran ; prêt pour 430 m | Il faut régler des cibles chiffrées (ci-dessous) |
| B | Garder les pixels et multiplier par le zoom | Petit changement | Dépend de la résolution de l'écran, reste empirique |

**Choix : A.**

## 3. Conception

### 3.1 Modules

Nouveau dossier `src/shot/`, modules **purs** (sans DOM ; `three` autorisé pour les maths) :

| Module | Rôle |
|---|---|
| `tuning.js` | Toutes les constantes de ressenti et d'équilibrage, commentées, en un seul endroit (§3.8) |
| `hitzones.js` | `zonesFromSkeleton(model)` et `zonesFromProcedural(group)` → liste de `{ part: 'tete'|'torse'|'membre', a: Vector3, b: Vector3, r }` en coordonnées monde ; `rayVsZones(ray, zones)` → `{ part, point, distance }` le plus proche ou `null` (rayon contre sphère et capsule) |
| `occlusion.js` | `resolveImpact({ ray, npcHits, decorHit })` → ce que la balle touche en premier : `{ kind: 'npc', npc, part, point }`, `{ kind: 'decor', point, normal, surface }`, ou `{ kind: 'rien', point }` (point au loin) |
| `recoil.js` | Ressort amorti : `createRecoil(t)` → `{ kick(), update(dt) → { pitch, yaw } }` (décalage de visée en radians) |
| `bolt.js` | Culasse : `createBolt(t)` → `{ fire(now), ready(now), progress(now) }` |
| `scopeAnim.js` | Ouverture et fermeture animées, zoom lissé : `createScopeAnim(t)` → `{ open(), close(), setZoom(z), update(dt) → { openness 0..1, zoom } }` |
| `soundPlan.js` | Calendrier sonore d'un tir : `planShotSounds({ distance, surface, part, mapAcoustics })` → `[{ son, at }]` (départ, claquement d'impact retardé de `distance / 343` s, écho) |

`src/aim.js` (lot 0) gagne la conversion angulaire : `mradToPixels(mrad, fovDeg, screenHeight)` et l'inverse.

### 3.2 Lunette

- **Ouverture** en 180 ms (fermeture 120 ms) : la vignette se resserre, le champ de vision glisse de 60° vers `60 / zoom`, le réticule apparaît au dernier tiers. Le clic gauche n'est accepté que lunette ouverte à 100 %.
- **Zoom lissé** : la molette fixe une cible, le zoom effectif la rejoint en 120 ms (exponentielle) ; la sensibilité suit le zoom effectif.
- **Canvas** de la lunette dimensionné au redimensionnement seulement (plus à chaque image) et à la densité de pixels du renderer : réticule net, moins de travail par image.
- **Plongée** : bornes du tangage portées de [-1,1 ; 0,5] à [-1,35 ; 0,5] rad (la bande de 3 m inatteignable de M2 disparaît).

Précisions de la tâche T2 : l'ouverture avance en proportion du temps (180 ms pour aller de 0 à 1, 120 ms pour revenir, en repartant d'où elle en est si l'on rouvre pendant la fermeture) ; la vignette et le champ de vision suivent cette ouverture adoucie aux deux bouts (smoothstep), le grossissement en échelle logarithmique (`scopeFov` dans `src/aim.js`). La visée (souris, molette, stress, apnée, tremblement) s'arrête dès le relâchement du clic droit, seule l'image se referme ; une fin de mission, une pause ou un échec ferment la lunette d'un coup, comme avant. Le « zoom effectif » est le zoom lissé de la molette : il règle la sensibilité de la souris et le champ de la caméra, et le réticule comme le rayon du tir convertissent le tremblement avec ce champ affiché ; le HUD et l'indicateur de la lunette montrent le zoom choisi. La densité du canevas est celle du préréglage graphique (la densité du renderer hors résolution dynamique d'Auto), jamais sous 1 : le réticule reste net quand Auto baisse la résolution comme au préréglage Bas (rendu à 0,75, canevas à 1 comme avant le lot 2), et le canevas n'est pas réalloué à chaque changement d'échelle. Une densité d'écran qui change (zoom du navigateur, fenêtre passée sur un écran d'une autre densité, même sans `resize`) réapplique le préréglage, au rendu comme au canevas (relecture de T2). Pas de route de dev pour figer l'animation : `scripts/capture-mission.mjs` pilote l'horloge image par image (`mi-lunette<n>`, `lunette<n>`).

### 3.3 Le coup de feu

- **Recul** : à chaque tir, le regard monte de 2,5° (± 0,6° de dérive latérale tirée au hasard) et revient en 0,45 s par un ressort amorti ; le réticule saute avec la vue. Le joueur garde la main : ses mouvements de souris s'ajoutent.
- **Culasse** : 1,2 s pendant lesquelles on ne peut pas tirer, avec son synthétisé (ouverture à 0,35 s, fermeture à 0,9 s) et une petite jauge discrète sous le réticule. La Vélocité réduit la culasse (1,2 s à 0,9 s au niveau 4) en plus du délai de vol actuel.
- **Flash** : l'éclair blanc plein écran (0,22) devient une lueur chaude brève sur les bords de la lunette (0,12, déjà réduit par les effets atténués du lot 1).
- **Projectile visible** : une traînée fine (sillage) parcourt le rayon pendant le temps de vol, visible dans la lunette, puis s'efface ; le trait d'impact actuel est supprimé.

Précisions de la tâche T3 : le recul déplace le regard d'un coup (2,5° vers le haut, dérive tirée uniformément dans ±0,6°), puis un ressort à amortissement critique le ramène sans rebond, à 5 % du recul au bout de 0,45 s ; le rayon du tir est pris avant le coup, la balle part donc là où l'on visait. La culasse compte le temps de la mission (arrêté en pause, ralenti pendant la kill-cam) ; sa durée par niveau de Vélocité est `getStats().boltS` (1,2 ; 1,125 ; 1,05 ; 0,975 ; 0,9 s) et ses deux sons gardent leur place dans la course (0,35 / 1,2 et 0,9 / 1,2 de la durée), une culasse plus courte les rapproche donc d'autant ; sa jauge est un trait de 44 px sous le point central du réticule, visible tant qu'on ne peut pas tirer. La lueur est un anneau chaud (255, 170, 90) qui culmine sur le bord de la lentille, dessiné par la lunette : 0,12, 0,06 en effets atténués, pleine 40 ms puis éteinte en 0,1 s comme l'ancien voile ; le voile blanc plein écran disparaît. Le sillage est une ligne d'un pixel (queue transparente, tête d'un blanc chaud) qui part du canon, 0,4 m sous la lunette et 0,15 m à droite dans le repère de la caméra (pour monter dans l'image sans se cacher derrière le trait vertical du réticule), et va jusqu'à ce que la balle rencontre sur son rayon au moment du coup ; sa tête suit le temps de vol, sa queue la suit à 35 % du trajet, puis il s'efface en 0,25 s. Le crack supersonique (bruit aigu de 20 ms) s'ajoute au tir sans silencieux ; le tir au silencieux garde son son. Réglages dans `tuning.js` (`RECUL`, `CULASSE`, `LUEUR`, `SILLAGE`) ; opacités de la lueur dans `SHOT_FLASH` (`src/comfort.js`, avec les effets atténués).

### 3.4 Ce que la balle touche

À la résolution (fin du temps de vol, comme aujourd'hui, sur le rayon capturé au clic) :
1. `rayVsZones` sur chaque PNJ vivant dont la boîte grossière est coupée par le rayon (préfiltre actuel gardé, élargi de 0,3 m) ;
2. un `Raycaster` sur les maillages solides de la carte (et les jeeps, le cadenas) ;
3. `resolveImpact` garde le plus proche.

Conséquences :
- **PNJ** : `tete`, `torse` ou `membre`. Une cible meurt quelle que soit la zone. Score : tête ×2 (inchangé), torse ×1, membre ×0,6. Un **garde** touché meurt aussi sans silencieux, mais l'alerte se déclenche (le bruit du tir). Un civil touché : échec, comme aujourd'hui.
- **Décor** : marque d'impact orientée par la normale, posée sur la surface (géométrie et matériau partagés, plafond de 24 marques comme les trous actuels), gerbe selon la surface : `metal` (étincelles et claquement métallique), `pierre` (éclats et poussière), `bois` (échardes), `sol` (poussière, trou au sol actuel). Les PNJ proches réagissent comme pour un tir manqué.
- **Rien** : la balle part au loin, comme le tir manqué actuel.

Marquage du décor : `maps.js` pose `userData.solid = true` sur ce que ses primitives (`box`, `plane`, `cylinder`, bâtiments) créent, avec `userData.surface` (`pierre` par défaut ; `metal` pour conteneurs, voitures, jeeps, grue, citernes ; `bois` pour caisses, tables, palettes ; `sol` pour les sols). Pluie, lumières, effets, marqueurs, fenêtres décoratives en verre : non solides. La liste des solides est tenue par `maps.js` (`solidMeshes()`), vidée par `clear()`.

Précisions de la tâche T4 : les zones sont recalculées à la résolution, sur la pose du moment (les matrices des os sont remises à jour, la boucle ne le faisant qu'au rendu), et le PNJ le plus proche sur le rayon l'emporte (`npcHit`, `src/shot/hitzones.js`). Tête : sphère au milieu des os `Head` (base du crâne) et `HeadTop_End` (sommet). Torse : capsule de `Hips` à `Spine2`, dont le bout arrondi monte jusqu'à l'os `Neck` : une capsule qui irait jusqu'à `Neck` le dépasserait d'un rayon, 15 cm, sur le menton et la bouche (chez mafia_boss, `Neck` n'est qu'à 3 cm de `Head`), et un tir de face au visage y compterait pour le torse. Cou : capsule `Neck` → `Head`, comptée torse. Membres : bras, avant-bras et mains (jusqu'à `HandMiddle1`), cuisses, tibias et pieds (jusqu'à `ToeBase`), 15 zones en tout. Les os sont reconnus par leur nom Mixamo nu (`boneKey` retire `mixamorig`, son numéro et ses deux-points, que GLTFLoader enlève déjà). Repli procédural : mêmes zones et mêmes rayons, posés sur les groupes articulés de `makePerson` (pivot de la tête, épaules, coudes, mains, hanches, genoux). Préfiltre : la boîte de `getBounds` élargie de 0,3 m de chaque côté (`ZONES.prefiltre`), qui garde les genoux d'une cible assise, sortis de la boîte d'origine. Points : base × coefficient, arrondi (un membre rapporte 72, 150 ou 240). Garde touché : il tombe toujours ; sans silencieux, « Garde éliminé » puis l'alerte (« Garde abattu », +0,45 de stress) ; au silencieux, les autres gardes réagissent sans alerte ; au silencieux amélioré, personne ne réagit (`guardHit`, `src/shot/score.js`). Accroche de dev : `__aimAt(quoi, n, avance, zone)` vise le milieu d'une zone du PNJ (`torse` par défaut, `tete`, `membre`).

### 3.5 Son

- **Départ** : tir actuel gardé, plus un « crack » supersonique bref ; avec silencieux, le son actuel.
- **Impact retardé** : `distance / 343` s après la résolution (0,06 à 0,13 s aujourd'hui ; 1,25 s à 430 m au lot 3) : chair (son mat), métal (claquement), pierre (éclat), sol (souffle).
- **Écho par carte** : une réponse impulsionnelle générée au montage de la carte (bruit à décroissance exponentielle, à graine) selon `mapAcoustics` : `rue` (réflexions serrées), `place`, `port` (long, métallique), `base` (champ ouvert, court), `colline` (très ouvert), `interieur` (M6, court et sourd). Une seule `ConvolverNode` par mission, branchée en envoi sur le départ du coup et sur les impacts lointains.
- **Fin du bip d'arcade** : la confirmation de touche devient le son d'impact lui-même ; la fiche du kill-feed reste.
- **Pluie de M3 audible** : réutilise la pluie de l'enquête (`src/prologue/ambience.js`), démarrée et coupée avec la mission (fondu), sur le contexte audio commun.
- **Sons d'échec** homogènes : un seul son d'échec, joué une fois, pour chaque cause (civil, fuite, convoi).

### 3.6 Tremblement et stress (réglage chiffré)

Tremblement exprimé en **milliradians** (écart quadratique moyen visé, apnée relâchée, Stabilité 0) :

| Situation | Cible | À 30 m | À 430 m |
|---|---|---|---|
| Calme (stress 0) | 0,35 mrad | 1 cm | 15 cm |
| Stress 0,5 | 1,6 mrad | 5 cm | 69 cm |
| Stress 1 | 4,5 mrad | 14 cm | 1,9 m |
| Apnée | × 0,15 | | |

Précisions de la tâche T1 : l'écart quadratique moyen est **radial** (racine de la moyenne de x² + y² de l'écart de visée, en régime établi), comme la mesure de l'audit ; entre les trois points (stress 0, 0,5 et 1), la loi est la parabole qui y passe ; le mouvement garde la forme d'avant le lot 2 (à-coups, dérive en huit, respiration), ramenée à la cible pour le pas de chaque image, si bien que l'écart vaut la cible à toute cadence (à 2 % près à 30, 60, 144 et 240 i/s, là où une normalisation unique laissait environ 8 % d'écart entre 60 et 144 i/s).

Stress : il monte de **0,07 par seconde** lunette ouverte (moitié en 7 s, plein en 14 s) au lieu de 0,48, redescend de 0,5 par seconde lunette fermée, +0,12 par tir comme aujourd'hui ; Sang-froid garde son effet relatif. Apnée inchangée (4 s, recharge 6 s). À 30 m ces valeurs gardent un vrai enjeu sur la tête (sphère de 13 cm, lue et mesurée à la tâche T4 : 10 cm de rayon, ci-dessous) ; à 430 m (lot 3) elles rendent l'apnée et le calme décisifs. Toutes ces valeurs vivent dans `tuning.js` : le lot 3 les reréglera à la main sur la longue distance.

Précisions de la tâche T4, lecture retenue de la « sphère de 13 cm » : ni un rayon de 13 cm (26 cm de diamètre, 4,5 cm de trop de chaque côté d'un visage de 17 cm), ni un diamètre de 13 cm (près des deux tiers du crâne hors zone). Mesurée sommet par sommet sur les sept modèles du jeu, debout et assis, la peau de la tête est à 10,7 cm en moyenne du milieu des os `Head` et `HeadTop_End` (de 8,8 à 12,3 cm selon le modèle, cheveux compris ; environ 17 cm de large, 20 de profondeur et 23 de haut) : la sphère a un rayon de **0,10 m**, 20 cm de diamètre (`ZONES.tete`). Mêmes mesures pour les autres zones, confirmées : torse 0,15 m (peau à 12,5 à 19 cm de l'axe selon le modèle), bras 0,06 (3,6 à 7,5 cm), jambes 0,08 (6 à 10 cm), et pour les zones ajoutées : cou 0,06, pieds 0,05 (`tests/shot/glb-bones.test.js`). À 30 m, une visée au centre de la tête la touche à coup sûr au calme et à stress 0,5 (écart de 1 puis 5 cm), environ 4 fois sur 10 à stress 1 (14 cm), contre 6 fois sur 10 avec un rayon de 13 cm.

### 3.7 Petites corrections de la même famille

- En M6, le commanditaire en fuite quitte la pose assise (clip de marche ou de course) au lieu de glisser assis.
- `spawnMuzzle`, `detectsShooter`, `guardFOV`, `movingTarget`, `getHeadPosition`, `hasModel` : supprimés s'ils restent inutilisés après ce lot (code mort).

### 3.8 `tuning.js`

Une seule source pour : durées de lunette, lissage du zoom, recul (angle, dérive, retour), culasse (durée par niveau de Vélocité), cibles de tremblement, vitesses du stress, coefficients de score par zone, rayon des sphères et capsules, vitesse du son, nombre maximal de marques. Chaque valeur a un commentaire d'une ligne qui dit ce qu'elle change en jeu.

## 4. Tests

- **Purs** : `rayVsZones` (rayon dans la tête, le torse, un bras ; rayon qui frôle à 25 cm du torse : raté, alors que l'ancienne boîte le comptait : témoin) ; `resolveImpact` (PNJ derrière un mur : décor ; PNJ devant : PNJ ; rien) ; ressort du recul (retour à moins de 5 % en 0,45 s, aucune oscillation visible) ; culasse (tir refusé avant 1,2 s, accepté après ; durée selon la Vélocité) ; animation de lunette (ouverte à 100 % en 180 ms, zoom à 95 % de la cible en 120 ms, indépendant de la cadence) ; `mradToPixels` ; tremblement angulaire (même écart quadratique en milliradians à ×4 et à ×12, à 60 et à 144 images par seconde, cibles du §3.6 tenues à ±15 %) ; `planShotSounds` (impact à `distance/343`, écho présent, pas de bip) ; réponse impulsionnelle (longueur et décroissance par acoustique, à graine).
- **Zones sur un vrai squelette** : un `SkinnedMesh` synthétique avec os nommés à la Mixamo (préfixe variable) : la sphère de tête suit l'os `Head` quand on anime le squelette ; test sur la liste des noms d'os de chaque GLB du dépôt (lus dans l'en-tête JSON) pour garantir que tous ont `Head`, `Spine`, `Hips`, bras et jambes.
- **Décor solide** : avec la scène simulée (`vi.mock` de `scene.js`), pour chaque carte, un rayon horizontal vers un conteneur, un mur, une voiture touche un maillage `solid` avec la bonne `surface` ; la pluie, les lumières et les marqueurs ne sont jamais `solid`.
- **Audio** : faux `AudioContext` horodaté : sons d'impact programmés au bon instant, une seule `ConvolverNode` par mission, libérée au démontage ; pluie de M3 démarrée puis coupée.
- **Parcours réels** (`scripts/verif-mission.mjs`, nouveaux scénarios) : tirer sur une cible cachée derrière un conteneur en M3 : aucune touche, étincelles ; tir à la tête au repos : tête ; culasse : deux clics rapprochés donnent un seul tir.

Chaque test vu rouge sur le comportement actuel (leçon des tests qui mentent).

## 5. Critères de fin

| Critère | Seuil |
|---|---|
| Occlusion | 0 touche à travers un maillage solide dans les tests et le parcours réel |
| Précision des zones | rayon à 25 cm du torse : raté ; tête détectée sur l'os, y compris assis (M6) et en plongée |
| Tremblement | cibles du §3.6 à ±15 %, identiques à ×4 et ×12, à 60 et 144 i/s |
| Ressenti | lunette 180 / 120 ms, zoom 120 ms, recul 2,5° revenu en 0,45 s, culasse 1,2 s, mesurés par les tests |
| Son | impact à `distance/343` s, écho par carte, plus de bip, pluie de M3 audible |
| Mémoire | memtest du lot 1 toujours vert (marques, sillages et écho libérés) |
| Performance | triangles et appels de dessin en M6 (Moyen) à ±3 % du lot 1 |
| Général | `npx vitest run` vert, `npx vite build` sans erreur, captures M1, M3, M5, M6 sans régression |

## 6. Risques

- **Difficulté** : capsules serrées + culasse + vrai zoom changent l'équilibre. Les valeurs sont regroupées dans `tuning.js`, et le parcours réel mesure la réussite d'un tir au repos à 30 m (doit rester quasi certaine) et sous stress (doit devenir incertaine).
- **Noms d'os** variables selon le GLB : test sur les 7 modèles du dépôt.
- **Marquage du décor** incomplet : un test par carte, et un mode de dev `?solides=1` qui teinte les maillages solides pour une vérification visuelle.
- **Écho** trop présent : envoi réglé bas par défaut (−18 dB), relevé par capture audio si possible, sinon réglé à l'oreille par Rayan au premier essai (une seule constante dans `tuning.js`).
