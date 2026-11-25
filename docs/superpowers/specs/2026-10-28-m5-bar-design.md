# M5 en deux temps : le Bivouac, puis le convoi (conception)

> Rangé dans le dépôt le 28 octobre 2026. Les autres documents de conception cités par leur seul nom (`feuille-de-route.md`, `kill-cams-design.md`, `poids-design.md`, etc.) sont dans `C:/Users/shark/Sniper-Game-reprise/.superpowers/sdd/2026-10-28-conceptions/` (hors dépôt), comme le journal `.superpowers/sdd/2026-10-07-reprise/progress.md`.

> Conçue le 28 octobre 2026 par l'architecte du chantier « M5 en deux temps », à partir de trois rapports en lecture seule (lecteur 1 : réutilisation de l'enquête et coûts mesurés ; lecteur 2 : récit et dialogues ; lecteur 3 : systèmes et niveau) et d'une relecture du code de l'instantané stable `C:\Users\shark\Sniper-Game-jeu` (branche `main`, commit 3cd328d).
> Les citations `fichier:ligne` partent de cette racine. La spec du lot 3 (`docs/superpowers/specs/2026-10-11-lot3-distances-missions-design.md` dans `Sniper-Game-reprise`) est citée « spec3:ligne », REPRISE.md « REPRISE:ligne », le journal `.superpowers/sdd/2026-10-07-reprise/progress.md` « progress:ligne ».
> **Légende.** **[V]** vérifié par l'architecte dans le code ou les documents pendant cette passe. **[M]** mesuré par un lecteur (Node en lecture seule, en-têtes GLB, jsdom), non refait ici. **[D]** déduit ou proposé.
> Plan d'exécution : `m5-bar-plan.md`, dans ce dossier.

## 0. Contexte et demande

### 0.1 La demande (décisions de Rayan, 28 octobre 2026) [V, progress:98-101]
- M5 se joue en deux temps : **le bar** (infiltration à la première personne chez les hommes de l'escorte du colonel Kessler, pour apprendre le trajet, le véhicule, la place du colonel et l'heure), puis **le convoi** au fusil (sous-lot 3d du lot 3), qui dépend de ce que Viktor a appris.
- Anton n'a pas l'info et refuse de l'envoyer là-dedans : **Viktor y va seul**. La règle « Anton ne dit jamais tu entres » reste vraie, et le tir reste de loin et en hauteur (REPRISE:142).
- Une info manquée sans être repéré rend le convoi **plus dur, jamais un échec**. Démasqué au bar : **échec du bar**.
- Gameplay : première personne, s'approcher des tables pour écouter (sous-titres tapés, voix en bips), ne pas fixer les gens trop longtemps, dialogues à choix avec le barman ou un officier, jauge de soupçon.
- Contexte du jour : « fais le dur » (Rayan garde M4 à 430 m, progress:106). On part de réglages exigeants et on n'assouplit qu'en jouant.

### 0.2 Contraintes de tout le jeu [V]
- Rien de payant, voix en bips, sous-titres tapés (REPRISE:15, 75). PC de milieu de gamme : budgets du lot 1, p95 signalée au-delà de 22 ms (`src/gfx/stats.js:28`).
- « Dossier du fixeur » : Anton jamais vu, aucun corps montré pour la femme et la fille (REPRISE:69), Viktor tire de loin et en hauteur.
- Aucun tiret cadratin dans le texte du jeu : garde automatique sur toutes les chaînes de `src/**/*.js` hors scènes générées (`tests/texts.test.js:5-9, 91-110`). Les scènes de cinématique se régénèrent par `scripts/port-maquette.mjs`, jamais à la main (REPRISE:26).
- Touches en `e.code` (clavier AZERTY de Rayan).

### 0.3 Ce que le code impose [V]
1. **Le briefing M5 actuel donne déjà tout ce que le bar doit apprendre.** `src/briefing/scenes/m5.js:13-19` : l'écoute radio « Prenez la vieille route. Personne ne nous attendra. », a2 « … Mais je sais où il sera assis. », a3 « Trois véhicules. Lui, dans le deuxième. Côté passager. », a4 le virage et les « Treize secondes », a6 la colline. Bloquant : la maquette `docs/superpowers/maquettes/cinematiques/briefing-m5.html` est à réécrire, puis la scène à régénérer (correspondance `m5: 'briefing-m5'` en `scripts/port-maquette.mjs:41`).
2. **L'enquête est le patron du bar.** `startInvestigation({ renderer, camera, audio, root, onDone, options })` rend `{ scene, update, stop, debug }`, `onDone` une seule fois (`src/prologue/investigation.js:137, 156-160`). Scène à part, caméra sauvée puis rendue, ombre calculée une fois puis figée (`investigation.js:538-544`). Carte de départ avec sortie de secours si le verrou du pointeur est refusé (`investigation.js:572-574`), pause sur la perte du verrou, REPRENDRE refusé par Chrome juste après Échap (`RETRY_MS`, `investigation.js:20, 439-443`).
3. **La frappe et les bips tournent en temps réel.** Frappe par `setTimeout` (`investigation.js:142, 165-177`), voix par un intervalle de 125 ms (`src/briefing/sound.js:51`), d'où le reste connu « en pause, la frappe continue » (REPRISE:108). Au bar, l'écoute est le jeu : tout doit avancer au temps de jeu.
4. **Une seule voix à la fois** : `voice()` coupe la précédente (`sound.js:39-40`), trois timbres fixes (radio, phone, inner) de 72 à 175 Hz (`sound.js:58`). Pas de voix de femme, pas deux tables à la fois.
5. **Contrôleur à la première personne** réutilisable : touches de `settings.pvpKeys` et flèches en `e.code` (`src/prologue/fpsController.js:44-51`), œil à 1,65 m, 1,6 m/s (`:37`). `setFrozen` coupe à la fois le pas et la souris (`:56, :82`) ; balancement de 2,5 cm qui ignore les effets atténués (`:9, :101-102`) ; `setPose` accepte `y` (`:83`).
6. **Visée** : rayon de 2,2 m depuis le centre de l'écran, identifiant lu dans `userData.clueId` (`src/prologue/interact.js:5-11`).
7. **`NPC` ne se réutilise pas** dans une scène dédiée (il s'ajoute à la scène du jeu, `src/npc.js:2, 232`). `spawnCharacter` tire modèle, taille et teinte dans `Math.random` et retombe en silence si `match` ne trouve rien (`src/characters.js:170-175, 181, 206-207`), et met `castShadow = true` (`:211`). Libération propre d'un PNJ : `stopAllAction`, `uncacheRoot`, `disposeObject` (`npc.js:596-604`).
8. **Câblage** : `investigate()` jette le résultat (`run.next` sans argument, `src/main.js:384-396`) ; la boucle ne connaît que la phase `'investigation'` (`main.js:1422-1429`) ; le panneau de performances y est masqué (`main.js:1401`) ; `BUSY` n'a pas de phase bar (`src/campaign/shortcuts.js:6`), et `canFail` refuse tout hors `playing` et `paused` (`src/campaign/phase.js:25-27`).
9. **La mission se monte pendant son briefing** (`main.js:448-461`, `prepareDuringBriefing`) et le montage est repris par `prep.take()` (`main.js:524`). Le convoi dépendra des renseignements : il ne peut plus se monter pendant le briefing I.
10. **Sauvegarde** : un champ absent prend sa valeur par défaut (`src/upgrades.js:47-61`) ; `briefingSeen` est un tableau de 6 booléens (`upgrades.js:11, 19`).
11. **Le convoi d'aujourd'hui** : Kessler sur la banquette arrière (`main.js:686, 705`), 4 gardes (`src/levels.js:46`), départ immédiat à 8,5 m/s depuis x = −55 (`main.js:717`), échec au-delà de x = 60 (`src/campaign/convoy.js:7`). Le sous-lot 3d le remplace (spec3:214-238).
12. **Journal et rapport** : `JOURNAL[5]` (`main.js:189`), note de bas de page pour M3 seulement (`src/campaign/journal.js:9-14`), FANTÔME = précision 100 % et aucune alerte (`src/campaign/rank.js:9-11`).
13. **Cinématiques paramétrées** : `playCinematic(id, { params })` passe une chaîne de requête à la scène (`src/briefing/index.js:100-101`), déjà utilisé pour l'épilogue (`main.js:233`).

### 0.4 Écarts constatés entre les lecteurs, et ce que je retiens [D]
| Sujet | Lecteur 2 | Lecteur 3 | Retenu |
|---|---|---|---|
| Lieu, heure | LE BIVOUAC, 18:10 à 18:50, départ 19:15, virage 19:42 | LE RELAIS, 22:30 à 23:40 | **Le Bivouac, 18:10 à 18:50** : la spec du lot 3 met le convoi au couchant de 19 h 42 (spec3:248) |
| Écoute | seuils 2,5 m et 4,5 m | intelligibilité continue, mots masqués selon leur fragilité | **continue** (lecteur 3), avec les crochets du lecteur 2 comme mots-clés |
| Soupçon | 34 et 67, montées fixes | plancher, hystérésis, témoins | **plancher et hystérésis** (lecteur 3), paliers à 30 et 60, réactions écrites du lecteur 2 |
| Plan | salle 12 × 8, zinc, tables A et B, couloir et téléphone | salle, arrière-salle, billard, bureau interdit | **salle du lecteur 2**, un couloir des toilettes ; pas de billard ni de bureau (moins de décor, même dureté) |
| Tabouret | +0,33 m mesuré sur les GLB [M] | +0,27 m sur un faux squelette | **+0,33 m** (mesuré) |
| Après le bar | téléphone « ANTON · Alors ? » puis briefing II | carte des renseignements | **les deux** : bilan « DOSSIER 05 » dans le bar, puis briefing II, pendant lequel le convoi se monte |
| TRAJET manqué | butte sur la ligne droite à 140 m, sans freinage | crête de repli à 200 m | **ligne droite à 140 m**, à trancher (§13) |
| HEURE manquée | arrivée 8 s avant la fenêtre, essoufflé | arrivée tirée entre 25 et 75 s | **déterministe** (lecteur 2) : jamais de pile ou face |

## 1. Approches envisagées

### 1.1 Où vit le bar
| | Approche | Pour | Contre |
|---|---|---|---|
| **A (reco)** | **Module autonome `src/bar/` chargé à la demande**, sur le patron de l'enquête : scène à lui, rendue par le renderer et la caméra du jeu, phase `'bar'` dans la boucle, tout libéré à la sortie | Aucune fuite d'état dans la scène du jeu (brouillard, soleil : risque 4 du lot 3, spec3:278) ; testable sous jsdom avec le faux renderer de l'enquête (`tests/prologue/investigation.test.js:14-26`) ; avance en parallèle du lot 3 dans la copie `Sniper-Game-bar` | Reprend une partie de l'interface de l'enquête (carte, pause, sous-titres) |
| B | Une carte de mission de plus dans `maps.js`, contrôleur dans la boucle de mission | HUD et pause du jeu réutilisés | Mêle tir et infiltration dans `main.js` (1 767 lignes) ; conflits certains avec le découpage de `maps.js` (lot 3, tâche A1) |
| C | Écran DOM sans 3D (choix de répliques sur une illustration) | Léger | Contraire à la décision « première personne » (progress:101) |

### 1.2 Comment on entend
| | Approche | Pour | Contre |
|---|---|---|---|
| A | Seuils de distance (tout, mots manquants, murmures) | Lisible | Marches brutales ; ignore murs et bruit |
| **B (reco)** | **Intelligibilité continue I** (distance rapportée à la voix, murs, orientation, bruit), chaque mot a une fragilité à graine ; **un renseignement n'est acquis que si ses mots-clés ont été affichés** | Ce que le joueur lit est exactement ce qu'il sait ; règle unique pour toutes les tables et le téléphone ; testable en pur | Chiffres à régler (un fichier, `src/bar/reglages.js`) |
| C | Mini-jeu de « réglage d'oreille » | Original | Hors du ton, pénible au troisième échange |

### 1.3 Jauge de soupçon
| | Approche | Pour | Contre |
|---|---|---|---|
| A | Compteur qui monte et descend | Simple | Le joueur « farme » la redescente ; aucune trace des fautes |
| **B (reco)** | **Jauge avec plancher** qui monte à chaque faute (plafonné à 55), **paliers à hystérésis**, montée seulement si **quelqu'un voit Viktor** | Les fautes laissent une trace ; se cacher a un sens ; pas de clignotement aux seuils | Plus de règles à tester (toutes pures) |
| C | Vies (trois remarques et démasqué) | Très lisible | Pas de nuance, pas de jauge comme demandé |

### 1.4 Le pont vers le convoi
| | Approche | Pour | Contre |
|---|---|---|---|
| A | Carte « DOSSIER 05 » seule, puis le convoi | Petit | Anton disparaît de M5 après le refus ; perd la voix du fixeur qui transforme l'info en plan |
| **B (reco)** | **Bilan « DOSSIER 05 » au bar** (court), puis **briefing II** paramétré par les renseignements (`params`, comme l'épilogue), **pendant lequel le convoi se monte** par le mécanisme existant | Récit complet ; réutilise `prepareDuringBriefing` ; aucun écran de chargement de plus | Une maquette de plus, avec variantes |
| C | Appel d'Anton jouable dans le bar | Immersif | Anton saurait où est Viktor (complice) ; une interface de téléphone de plus |

**Recommandation d'ensemble : 1.1 A, 1.2 B, 1.3 B, 1.4 B.**

## 2. Le déroulé de M5

```
Briefing I (cinématique « m5 », réécrite)        Anton n'a ni la route, ni la voiture, ni la place, ni l'heure ; il refuse
   │  pendant la cinématique : le bar se prépare (morceau chargé, décor monté, shaders compilés)
   ▼
LE BIVOUAC (phase 'bar', 18:10 → 18:50, 420 s)  écouter sans regarder
   │  sorti / passé / erreur                      démasqué → écran d'échec (RECOMMENCER rejoue le bar)
   ▼
Bilan « DOSSIER 05 » + téléphone « ANTON · Alors ? » (dans le module du bar, 4 à 6 s)
   │  état sauvegardé : m5.etape = 'convoi'
   ▼
Briefing II (cinématique « m5b », params = renseignements)   pendant ce temps : mountLevel(5) avec les effets
   ▼
LE CONVOI (phase 'playing', sous-lot 3d)          échec → RECOMMENCER (mêmes renseignements) ou RETOURNER AU BIVOUAC
```
- Réessai : `launchLevel` saute un briefing déjà vu (`main.js:440`). Pour M5, l'étape sauvegardée décide : `bar` rejoue le bar (briefing I si pas vu), `convoi` relance le convoi directement (briefing II seulement par REVOIR LE BRIEFING) [D].
- Le bar n'entre jamais dans la mission du jeu : aucune ressource de `scene` (scène du jeu) n'est touchée.

## 3. Conception détaillée du bar

### 3.1 Le lieu : LE BIVOUAC [D]
- Bar-restaurant en face de la caserne de la Brigade motorisée 14. Les soldats disent « chez Fernand ». Néon orange « LE BIVOUAC » au O mort (« LE BIV UAC »).
- Arrêté dans les années 90 : zinc, Formica, juke-box, baby-foot, cible de fléchettes, télé à tube en hauteur (le tiercé), téléphone mural à fil, ventilateur au plafond, photo « BRIGADE MOTORISÉE 14 » (24 hommes, pas de colonel), fanion, ardoise « PLAT DU JOUR », journal du jour sur le comptoir.
- Soleil bas à travers des stores à lames orange (l'accent de M5) ; brouillard de salle `Fog(0x1a120c, 7, 22)`.

**Plan** (repère de l'enquête : x vers l'est, −z vers le nord, origine au centre du sol ; plafond 3,0 m ; salle 12 × 9 m). Coordonnées de départ, réglées en tâche B2 par le test du tableau des places (§3.4).
```
 z=-7.5        +---- WC « OCCUPÉ » ----+
               |  couloir x -2,6..-1,4  |
 z=-4.5 +------+---+--------+-----------+-------------------------------+
        |ARRIÈRE-  |TÉL. (-3,0;-4,4)                  TABLE B (4,3;-3,0)  |
        |CUISINE   |                                  Mattei, Haas,      |
        |(interdit)|                                  belote, pénombre   |
        |  derrière| ZINC façade x=-3,8                                  |cible de
        |  le zinc | z -3..2,5          TABLE C libre (1,5;-0,8)          |fléchettes
        |(interdit)| tabourets x=-3,2   baby-foot (-0,6;0,9)  mange-debout|(6;-1,5)
        |          | z -2,-1,0,1,2                          (5,2;-0,6)   |
        |          |                    TABLE D Albert (3,6;1,6)  TÉLÉ    |
        |          |  juke-box (-0,5;4,1)  TABLE A (1,5;3,3)    (6;1,5;h2,3)
        |          |                      Dussart, Lenoir     mange-debout|
 z=4.5  +----------+---- vitrine et stores x -1..6 ----+ PORTE (3,5;4,5)+
                                                       | sas, clochette |
```
- **Zones** (données de `plan.js`) : **interdite** (derrière le zinc, arrière-cuisine) ; **privée** (2,5 m autour des tables A et B) ; **discrète** (couloir, toilettes : à l'écart, mais visible de la salle par son ouverture ; la zone ne dit pas qui voit Viktor, voir « Réglé en B2 » ci-dessous).
- **Places d'écoute prévues** : chaise ouest de la table d'Albert (1,9 m du centre de A) ; mange-debout est (2,6 m de B, prétexte des fléchettes) ; entrée du couloir en attendant les toilettes (1,0 m du combiné). Les autres places entendent sans les mots-clés : c'est voulu (« fais le dur »).
- **Sièges** : chaises de 0,45 m (le groupe du PNJ posé au sol, sans calage), tabourets de 0,75 m (+0,33 m, pieds sur le repose-pieds) [M, lecteur 1 §1.3]. Viktor assis : œil à 1,20 m sur chaise, 1,45 m sur tabouret (`setPose({ y })`).
- **Collisions** : boîtes 2D `{ minX, maxX, minZ, maxZ, son }` (`son` : `mur` 0,05, `cloison` 0,6, `porte` 0,9, `meuble` 1). Une seule source de vérité pour `moveCircle` (`fpsController.js:20`), la transmission du son et la ligne de vue.
- **Réglé en B2** [V, 28 octobre 2026] : `src/bar/plan.js` fait foi pour les coordonnées, tenues par le tableau des places (`tests/bar/ecoute.test.js`). Ce qui a bougé depuis le plan ci-dessus, et pourquoi :
  - la table D passe en (2,3 ; 1,4) : sa chaise ouest est à 1,91 m de A, la table A presque de côté (95°) pour Viktor tourné vers la télé (au départ, 2,25 m) ;
  - le juke-box passe en (−1,6 ; 4,1), à 4,2 m de cette chaise : en (−0,5 ; 4,1), son bruit la faisait tomber à 0,8495 en MÉFIANCE, sous le 0,85 du §10 ;
  - les cinq tabourets vont de z = −0,8 à 2,4 (pas de 0,8 m) : celui de z = −2 entendait Sorel au téléphone à 0,92, donc TRAJET et HEURE depuis le zinc, contre le parcours `bar-zinc` du §11 ; aucun siège libre hors des places prévues n'entend un mot-clé, même tourné vers la source (test) ;
  - le couloir des toilettes s'ouvre par un sas de 0,6 m dans la salle, à l'est du téléphone : sans lui, rien n'est « derrière la cloison » seule (le mur nord s'ajoute, T = 0,03) ; l'entrée du couloir est devant le sas, en (−2,4 ; −3,3), à 1 m du combiné tenu en (−3,0 ; −4,1) ;
  - Viktor accoudé au mange-debout est se tient en (5,0 ; −0,45), à 2,64 m de B, hors de sa zone privée ; la porte de l'arrière-cuisine est au mur ouest, derrière le zinc ; une réserve fermée occupe le sud du zinc : on ne passe derrière le zinc que par son bout nord ; les chaises vides ne sont pas des obstacles, les patrons attablés et les ouvriers en sont.
  - À observer en jouant (B11, B19) : entendre le colonel (1,07 m au plus) met Viktor à moins de 1,3 m de Sorel ; debout et vu (de Fernand), « trop près » monte la jauge. C'est le prix de PLACE par l'appel (« difficile »), qui reste possible par A2a et R1.
  - Pour B3 et B11 (relecture de B2) : la zone discrète (couloir, sas, WC) est un lieu, pas un abri. Le couloir s'ouvre au sud sur la salle : une ligne de vue libre mène à son sas de presque partout (Fernand, Lise et Sorel au zinc, la table A, Albert, les ouvriers), et dans le couloir lui-même de loin dans son axe (du centre de la table A, jusqu'à 1,6 m au-delà du mur nord ; de la place de Fernand, 0,75 m). Ne faire partir la zone qu'au-delà du sas n'en ferait donc pas un abri. Qui voit Viktor se décide toujours par `vueLibre` et le cône de chacun (`voitViktor`, B3), y compris pour la baisse « hors de la vue de tous » (5/s, §3.6), jamais par `dansZone('discrete')`.
  - Pour B9 et B10 (relecture de B2) : Dussart, en A-ouest (0,88 ; 3,3), fait face à la porte mais a le dos tourné vers la salle. « Dos au mur, face à la porte » (§3.2) n'est tenu par aucune chaise de A, la porte étant dans le mur de la vitrine, à 2 m à l'est de la table : en A-sud, dos à la vitrine, la porte est à 106° de sa face, au-delà des 70° de la tête (B10). Place provisoire, à reprendre avec B9 et B10 (A-sud contre la vitrine, ou une banquette ; sinon, déplacer la table A), puis relancer le tableau des places (`tests/bar/ecoute.test.js`) et les tests du plan (`tests/bar/plan.test.js`).
  - Fait en B9 : une banquette de skaï sous la vitrine, au sud de la table A (boîte `banquette-A` de `plan.js`, x de 0,75 à 2,25, z de 3,75 au mur ; un meuble : elle n'arrête ni la voix ni la vue, le tableau des places et les tests du plan restent verts sans retouche). Personne n'y est assis : la place de Dussart ne change pas (A-ouest), et le choix revient à B10, avec ses tests du regard. La banquette lui offre A-sud, dos au mur de la vitrine, la porte alors à 106° de sa face (hors de son cône de 70°, mais il voit toute la salle et la chaise ouest de D) ; s'il y passe, B10 ajoute le siège à `SIEGES` (type `chaise`, 0,45 m : la banquette est à cette hauteur) et retire celui d'A-ouest, et le décor suit (une chaise est dessinée sur chaque siège du plan, aucune ailleurs).
  - Fait en B10 [V, 24 novembre 2026] : Dussart passe en A-sud, sur la banquette (siège `A-sud` de `SIEGES`, `banquette: 'banquette-A'`, tourné vers sa table ; A-ouest retiré). « Le plus vif à remarquer un regard » voit ainsi la salle : la chaise ouest de D, la table B, le zinc (test du plan, témoin : A-ouest, la salle dans son dos à 92°) ; la porte, à 106° de sa face, sort de son cône. Lenoir lui fait face, en A-nord. Le décor ne dessine pas de chaise sur la banquette, qui est elle-même l'assise (test de la salle, témoin : une chaise posée dessus). Le tableau des places et les tests du plan restent verts sans retouche (les personnes sont des meubles : ni la voix ni la vue ne s'y arrêtent). Vu de la chaise ouest de D, Lenoir et Dussart sont presque alignés : mesuré sur leurs os Head (relecture de B10), leurs têtes sont à 5,5° l'une de l'autre, à peine plus que le θmax de 5,15° de Dussart (2,66 m) ; de Dussart, on ne voit que le haut de la tête, à gauche de celle de Lenoir (capture `shots/bar/b10/relecture/tableA-moyen.png`). Viser un peu au-dessus de la tête de Lenoir, de dos, c'est fixer Dussart, qui voit Viktor. À trancher par Rayan : décision 12 du §13 (ouverte).

**Réglé en B9** [V, 24 novembre 2026] : `src/bar/salle.js` (`creerSalle`, `OBJETS_VISABLES`), valeurs `DECOR` de `src/bar/reglages.js`, page `dev/bar.html` (hors build), tenus par `tests/bar/salle.test.js`. Ce que B10, B11 et B12 gardent :
- `creerSalle({ attenue })` rend `{ group, collisions, cibles, occultants, lumieres, brouillard, ventilateur, porteCuisine, setWcOccupe, update, stats, dispose }`. `collisions` est `BOITES` (le même tableau) ; `brouillard` est le `Fog(0x1a120c, 7, 22)` que B11 pose sur sa scène ; `attenue` se lit au montage (B11 passe `effectsReduced()`, comme pour le balancement de B8) ;
- ce qui est dessiné tombe sur les boîtes du plan (test par rayons : chaque mur, cloison et porte fermée à 5 cm près, chaque meuble dans sa boîte et pas au-delà de l'emprise de Viktor) ; un siège dessiné sur chaque siège du plan, à sa hauteur (chaise 0,45 m, tabouret 0,75 m), aucun ailleurs ; la porte de l'arrière-cuisine entrouverte de 0,55 rad vers la cuisine (`porteCuisine`, un pivot, la charnière au nord) ; derrière elle, un bout de cuisine en faïence sous un tube froid ;
- le sol est un parquet (les pas de B7 sont « sur le parquet », `SON.pas`) ; le couloir des toilettes aussi ;
- ce qu'on vise (`createInteract`, `cle: 'barId'`) : `cibles`, des capsules invisibles, une par siège libre (`barId` = identifiant du siège, `type: 'siege'`), une par objet de `OBJETS_VISABLES` (photo, journal, fenêtre, juke-box, cible, porte, WC ; `type: 'objet'`), et le mange-debout est (`mangeDeboutEst`, `type: 'place'`, avec son prétexte et la place de Viktor accoudé) ; chacune posée devant son mur, et visée depuis un point où Viktor tient debout hors de la zone interdite (test) ; `occultants`, des boîtes invisibles tirées des murs, cloisons et portes du plan (les mêmes que `vueLibre`). Aucun maillage animé dans un rayon ; aucune capsule pour les personnes (B10) ;
- le WC dit OCCUPÉ au montage : `setWcOccupe(seance.wcOccupe)` à chaque image (B11) le fait passer à LIBRE hors de 240 à 300 s, par le décalage de sa texture, sans rien allouer ;
- lumière : le soleil est un spot sans décroissance posé dehors à 40 m du milieu de la vitrine, 14° au-dessus de l'horizon et 40° à l'ouest du sud (ses rayons sont presque parallèles : un spot proche, aux rayons divergents, passait au-dessus des murs et allumait le haut des murs du fond) ; il entre par la vitrine et passe entre les lames des stores (baissés à l'ouest et à l'est, à mi-hauteur au milieu), file vers le nord-est en bande sur le parquet et finit en lames sur le lambris du mur est. Seule lumière qui projette, carte de 1024², cône de 0,13 rad ; murs, plafond, stores et meubles projettent, rien de transparent ni de lumineux ; qui rend la salle fige l'ombre après la première image (`dev/bar.js` le fait, B11 aussi, comme l'enquête). Une hémisphère chaude (en bas, ce que renvoie le parquet), quatre `PointLight` sans ombre (globes du zinc, télé, ampoule du couloir, juke-box), le reste en lueurs additives fusionnées (halos des globes au plafond, rétroéclairage des étagères, néon, applique de la table B, qui reste dans la pénombre) ; aucun personnage n'est éclairé à part. Les globes du zinc pendent à 2,08 m et le néon est à 2,72 m : debout dans la salle, on lit « LE BIV UAC » au-dessus d'eux : le O éteint garde 2 % de son éclat (`DECOR.neon.mort`), un tube froid qu'on devine ; à 4,5 %, il se lisait encore et l'enseigne disait « LE BIVOUAC » (relecture de B9, captures de la vue zinc à 4,5, 2 et 1 % soumises à Rayan) ;
- ce qui bouge n'avance que par `update(dt)`, jamais au rendu ni par `stats()` ou `setWcOccupe()` (test) : le O mort du néon tente de se rallumer par salves de 1 à 3 éclats, deux débuts d'éclat séparés de 0,34 s au moins (`DECOR.neon.entreS`) : jamais plus de 3 par seconde (§9), et la garde tient d'elle-même, pas seulement parce qu'une salve compte au plus 3 éclats (test) ; une salve toutes les 7 à 13 s ; la course du tiercé défile par décalage de texture (rien n'est renvoyé au GPU), l'éclat de la télé et de sa lumière change à chaque plan (2,5 à 6 s) ; en effets atténués, néon et télé fixes, la course du tiercé comprise (la lettre du §9 ; relecture de B9 : la faire défiler en atténué était une lecture du texte de Rayan, pas ce qu'il dit). Le ventilateur tourne aussi en atténué : il ne clignote pas, et le §9 ne le nomme pas ;
- hasard : tout le décor est tiré à graine (`generateur` de `src/shot/acoustics.js`, `DECOR.graine`). three tire les `uuid` de ses objets par `Math.random` : le test monte la salle sous deux graines de `Math.random` (`withSeed`) et demande la même géométrie et les mêmes clignotements ;
- classes de three : seulement celles que le jeu emploie déjà (three est d'un seul bloc dans le bundle principal) ; `RoundedBoxGeometry` vient avec `src/prologue/decor.js`, dans le morceau qui l'importe ;
- mesuré sous Node : 27 maillages et 28 873 triangles par `stats()` (budget 80 et 60 000), 2,07 Mpx de textures dessinées (budget 5), montage en 0,17 s environ ; `dispose()` libère tout ce que la salle possède, une seule fois, carte d'ombre comprise, et rien de partagé (aucun modèle GLB) ; dix montages dessinés puis libérés ramènent le faux renderer comptable à zéro (test). Dans Chrome sans interface (`dev/bar.html`, 1280 × 720), sur les cinq vues des captures (entrée, zinc, table A depuis la chaise ouest de D, table B depuis le mange-debout est, couloir et téléphone) : première image, passe d'ombre comprise, de 25 à 33 appels et de 36 509 à 44 789 triangles ; ensuite, de 15 à 23 appels et de 18 937 à 27 217 triangles, les mêmes en Moyen et en Bas (seule la densité de pixels change, la carte d'ombre reste à 1024²) : à la vue de départ (23 appels, 22 331 triangles), la salle laisse 107 appels et 377 669 triangles aux personnages (B10) sous le plafond du §8. Mémoire, en attendant les étapes du bar de `scripts/memtest.mjs` (B16) : `dev/bar.html?memtest=10` monte, dessine (ombre comprise) et libère dix fois la salle ; `renderer.info.memory` passe de 0 à 23 géométries et 11 textures pendant chaque montage, et revient à 0 et 0 après chacun, en Moyen et en Bas.

### 3.2 Les personnages [D, ancres V]
| Rôle affiché, puis nom | Qui | Place | Modèle | Bips (hauteur, débit) |
|---|---|---|---|---|
| LE PATRON, puis **Fernand** | 65 ans, ancien adjudant de la 14 ; son fils Julien fait partie des 12 « mutés » de l'hiver ; vouvoie | derrière le zinc, va au téléphone | `gangster_man_02`, teinte âgée | 85 à 110 Hz, lent |
| LE SERGENT, puis **Dussart** | chauffeur du colonel depuis vingt ans ; café noir (« je conduis ») ; dit « le vieux » ; le plus vif à remarquer un regard | table A, dos au mur, face à la porte | `mafia_boss` | 78 à 100 Hz, syllabes courtes |
| LE JEUNE, puis **Lenoir** | caporal de 22 ans, bavard, pose les questions ; assis derrière Kessler dans la jeep 2 | table A | `mafia_boss` teinte claire | 120 à 160 Hz, rapide |
| LE JOUEUR, puis **Mattei** | conduit la jeep 3, cynique, belote | table B | `mafia_boss` | 100 à 130 Hz, éclats |
| LE COLOSSE, puis **Haas** | le leurre : portera la casquette du colonel dans la jeep 3 ; muet avec les inconnus | table B | `mafia_boss` | 60 à 80 Hz, rare |
| LE LIEUTENANT, puis **Sorel** | chef de l'escorte ; entre à 18:30 ; froid, poli, vouvoie ; prend l'appel du colonel | porte, zinc, puis vers Viktor | `mafia_boss` teinte sombre | 95 à 120 Hz, régulier |
| LA SERVEUSE, puis **Lise** | 28 ans, tutoie ; apprend au joueur à ne pas fixer | points de passage zinc, tables | `mafia_woman_03`, tablier procédural | 190 à 260 Hz, rapide |
| LE VIEUX, puis **Albert** | 80 ans, joue « le 7 », ne voit rien : un abri | table D, face à la télé | `gangster_man_02` | 90 à 120 Hz |
| LE COLONEL | **Kessler**, au téléphone seulement : une voix, pas de visage | aucune | aucun | timbre `phone` plus grave |
| (bonus) 2 ouvriers | « Encore une semaine à la cimenterie. » « Et après ? » « Après, encore une. » | mange-debout de la porte | `gangster_man_02` | bruit de salle |

- **Casting à graine et vérifié** : le modèle demandé est contrôlé sur `cfg.url` (la retombée silencieuse de `characters.js:173-175` ferait mentir le test) ; tirages sous `withSeed` (`src/gfx/memtest.js:32`) tant que le casting strict du lot 3 (tâche A6) n'est pas fusionné, puis `spawnCharacter(type, { model, strict: true, teinte })`.
- **Animations** (les 7 GLB ont les mêmes 20 clips [M]) : `Sit` sur les chaises, `Talk` sur les banquettes et au zinc, `Look` puis `Point` puis `Threaten` quand un regard dure, `Wave` pour Albert devant la course. `Talk` bouge de moins de 5 cm [M] : une **couche procédurale après `mixer.update`** tourne la tête (os trouvé par suffixe `/Head$/`, `/Neck$/`, jamais `HeadTop_End`) vers l'interlocuteur ou vers Viktor (70° au plus) et fait hocher celui qui parle. Instant et vitesse des clips tirés à graine (pas de synchronisation visible).
- **Accessoires** : verres et cartes sur l'os `/RightHand$/` exactement (`_addPhoneProp` prend la main gauche sur quatre modèles [M, lecteur 1 §5.3] : ne pas le réutiliser).
- **Jamais de peau animée dans un rayon** : `SkinnedMesh.raycast` coûte 13 à 23 ms par lancer même sans toucher [M]. Les cibles de visée sont des **capsules invisibles** (feuilles du groupe du PNJ, comme `proxy` de l'enquête), et ni `Box3.setFromObject` ni `zonesFromSkeleton` à chaque image : les têtes se lisent sur l'os.
- **Aucune ombre de personnage** : l'ombre est figée après la première image ; une ombre de contact peinte sous chaque siège occupé, 2 petites qui suivent Lise et Sorel.
- **Poids** [calcul sur les comptes M] : 5 `mafia_boss` (56 880 triangles, 10 appels), 2 `gangster_man_02` (85 624, 10), 1 `mafia_woman_03` (54 871, 6) : **197 375 triangles, 26 appels, 8 personnages**. Avec les 2 ouvriers : 283 k triangles, 36 appels, 267 798 sommets animés.
- **Réglé en B10** [V, 24 novembre 2026] : `src/bar/patrons.js` (`creerPatron`, `creerCasting`, `trouverOs`, `OS`, `categorieDe`), valeurs `PATRONS` de `src/bar/reglages.js`, itinéraires (`PASSAGES`, `itineraire`) de `src/bar/plan.js`, page `dev/bar.html?patrons=1`, tenus par `tests/bar/patrons.test.js` (sous Node : les trois modèles du bar lus dans leur GLB, les quatre autres synthétiques) et `tests/bar/plan.test.js`. Ce que B11, B12 et B16 gardent :
  - le casting (`PATRONS.casting`, dix personnes) : Fernand (`gangster_man_02`, debout derrière le zinc, un verre), Dussart (A-sud, sur la banquette), Lenoir (A-nord), Mattei (B-sud) et Haas (B-nord), cartes en main, Sorel (`mafia_boss` tous cinq), Lise (`mafia_woman_03`, tablier, au zinc), Albert (D-nord) et les deux ouvriers (`gangster_man_02`, un verre chacun) : 282 999 triangles, 36 maillages animés et 267 798 sommets animés sur les en-têtes des GLB (test, témoin : dix `gangster_man_01`, 549 330 triangles). La teinte de chacun remplace la couleur de ses matériaux (copiés, à lui), comme dans `characters.js` : Lenoir garde la texture telle quelle (« claire »), Sorel la plus sombre ; à juger sur captures (§12, risque 1). Sorel est monté avec les autres mais absent (`setPresent(false)` : ni dessiné, ni visé) ; B11 le fait entrer à 210 s ;
  - le modèle est vérifié sur `cfg.url` (erreur sinon, test, témoin : la retombée silencieuse de `characters.js:173-175`, qui rendait un `gangster_man_01` sans un mot) ; les tirages de `spawnCharacter` sont sous `withSeed`, les nôtres (instant de départ des clips, vitesse de 0,92 à 1,08, phase du hochement) au générateur à graine ; une graine par rôle, tirée de `PATRONS.graine` : deux montages sous deux `Math.random` différents donnent le même casting (test). B16 passera au casting strict du lot 3 (A6) et retirera la vérification maison. **Relecture de B10** : main (a2e3fca) contient A6, dont `spawnCharacter` ne lit plus `match` (un modèle s'y impose par `model`, sinon il est tiré dans le pool) ; l'appel passe donc les deux, `{ match, model }`, chacun ignoré par l'autre version (test, témoin : `match` seul, avec un `spawnCharacter` qui l'ignore : « lenoir demande mafia_boss, characters.js rend gangster_man_01 »). Vérifié avec le `characters.js` de main glissé à la place de celui de la branche le temps des mesures : `tests/bar/patrons.test.js` vert (29 sur 29) et `dev/bar.html?patrons=1` comme ci-dessous. Main ne tire pas le modèle imposé : une même graine n'y donne pas les mêmes tailles (Albert y est à l'échelle 1,076 au lieu de 1,019, Lenoir à 1,025 au lieu de 0,982) ; les captures se refont après la fusion, et l'assise tient à toutes les tailles (point suivant) ;
  - **l'assise, écart à « sans calage » (§3.1, [M] du lecteur 1)** : mesuré sur les GLB (peau recalculée), le dessous du corps en `Sit` (bas des fesses et des cuisses, à 0,2 m du bassin) est à 0,41 m pour `mafia_boss` et `gangster_man_02`, 0,43 m pour `mafia_woman_03`, et à 0,40 m pour Lenoir, à sa taille tirée : posés au sol sans calage, les patrons passaient sous la planche de leur chaise (de 0,42 à 0,45 m) et le test du §10 (0,45 ± 0,03 m) tombait (témoin : le décalage du plan, 0, donne 0,397 et 0,399 m). Le groupe est donc posé pour que ce dessous s'enfonce de 0 à 2,5 cm dans l'assise (`PATRONS.assise.enfoncementM`), en partant du décalage du plan (chaise 0, tabouret +0,33 m) : de +0,2 à +2,6 cm sur les chaises du casting, −1,7 cm pour Dussart sur la banquette (`Talk` est plus haut, de 0,45 à 0,47 m), de 0,28 à 0,31 m au lieu de 0,33 en `Talk` sur un tabouret ; le bas des fesses tombe alors à 0,425 m sur une chaise, 0,448 m sur la banquette, 0,748 m sur un tabouret. Le dessous se mesure une fois par modèle et par clip pour la session, puis se rapporte à l'échelle de chaque clone. **Les pieds au sol, à toutes les tailles** (relecture de B10) : les pieds de `gangster_man_02` sont déjà à 2,2 cm du sol en `Sit` posé au sol, et le plus petit (échelle 0,959, au bas de `heightVar`), relevé de 4,1 cm jusqu'à l'assise, les avait à 6,2 cm (test, témoin ; Albert, à 4,3 cm sur la branche, tenait par chance du tirage). Les pieds se mesurent avec le dessous, dans la même passe ; sur une chaise ou la banquette, qui est trop petit pour son siège grandit au montage jusqu'à la plus petite taille qui tient les deux, enfoncé de 2,5 cm et les pieds à `PATRONS.assise.piedsMaxM` (4 cm) : `gangster_man_02` jamais sous l'échelle 1,019 sur une chaise (Albert y est, sur la branche), `mafia_woman_03` jamais sous 0,97 ; `mafia_boss` n'en a jamais besoin. Enfoncer davantage ne suffisait pas : pieds sous 5 cm, le bas des fesses du plus petit tombait à 0,413 m, hors des 0,45 ± 0,03 m du §10. Mesuré sur les trois modèles, la chaise C-nord, la banquette (A-sud) et un tabouret, aux deux bouts de `heightVar`, au milieu et sur vingt graines, avec le `characters.js` de la branche comme avec celui de main (mêmes bornes à 1 mm près) : bas des fesses de 0,424 à 0,451 m sur une chaise, de 0,424 à 0,450 m sur la banquette, de 0,747 à 0,750 m sur un tabouret ; pieds de −1,7 à 4,0 cm sur une chaise, de −2,2 à 3,6 cm sur la banquette (test sur six tirages par modèle et par siège, dont les deux bouts : bas des fesses à ± 3 cm de l'assise, pieds entre −3 et 5 cm). Seule la taille du montage compte : `asseoir` plus tard (Sorel au zinc, sur un tabouret) ne change pas la taille de qui est déjà debout ;
  - les clips : `Sit` sur une chaise, `Talk` sur la banquette et sur un tabouret, `Idle` debout, `Walk` en marche (à 0,88 de sa vitesse, pour 1,1 m/s) ; fondus en courbe douce (0,35 s ; 0,9 s pour se lever ou s'asseoir). Chaque clip est coupé en deux (bassin et jambes ; le reste), ses deux moitiés partent au même instant et une moitié qui repart se cale sur l'autre (test, témoin : le haut du `Walk` qui repart de 0 après un geste). Les gestes (`Look`, `Point`, `Threaten`, `Wave`, par `geste(nom)`, `null` pour revenir) ne prennent que le haut : dans ces GLB, `Look` fait marcher le corps (bassin à 0,6 m de sa place), `Point` est accroupi (bassin à 0,8 m), `Threaten` et `Wave` sont debout ; joués entiers, ils levaient un homme assis (test, témoin : le clip entier, bassin de Haas à 1,08 m) ;
  - la tête : après `mixer.update`, cou (40 %) et tête (60 %) se tournent vers ce que donne `regarder(point)` (un objet `{ x, y, z }` relu à chaque image : l'œil de Viktor, la tête d'un autre), à 70° au plus de la face du corps (test, témoin : sans borne, 170°) et 25° en tangage, par un ressort amorti critique (0,45 s) : elle part lentement, accélère et se pose, sans dépasser (test, témoin : vitesse constante) ; `regarder(null)` la rend au clip ; `parler(true)` la fait hocher (4°, 1,7 Hz ; test). Rien de tout cela ne touche la caméra : les effets atténués (§9) n'y changent rien ;
  - le regard (§3.5, « Réglé en B3 ») : `patron.personne` (et `casting.personnes`, dans l'ordre du casting, ce que prend `createRegards`) est `{ id, categorie, x, y, z, lacet }`, modifié sur place à chaque `update` : la tête sur l'os Head, le lacet du corps ou du siège, jamais celui de la tête tournée (la recommandation du §3.5, appliquée ; test, témoin : le lacet de la tête) ; catégories `escorte`, `fernand`, `albert`, `civil` (Lise, ouvriers). **Présence** (relecture de B10) : `personne.present` suit `setPresent` ; `createRegards` saute une personne dont `present` vaut `false` (elle ne voit pas Viktor, n'est pas fixée, sa fixation retombe) et la compte dès que le champ repasse à vrai, sans être recréé : B11 lui passe tout le casting au montage, Sorel absent compris (tests, témoin : `regard.js` sans présence, Sorel témoin et remarqué depuis la porte avant 18:30). Recréer les regards à l'entrée de Sorel aurait perdu la fixation, l'alerte et les répliques en cours des autres ; un objet sans `present` est là, comme avant ;
  - marcher : `marcher(itineraire(de, vers), { lacet })`, au pas, par `moveCircle` contre les boîtes du plan (emprise 0,25 m) ; `itineraire` prend le plus court chemin par les points de passage (`PASSAGES`), chaque tronçon libre de toute boîte grossie de l'emprise (tests, témoins : la ligne droite, qui frotte le baby-foot et la table A, et sans `moveCircle`, qui les traverse) ; les points derrière le zinc ne servent qu'à qui part de là ou y va (Fernand vers le téléphone, par le bout nord du zinc ; test, témoin : une salle barrée où Lise passerait derrière le zinc). Retenue 0,8 s sans avancer, la marche s'arrête (`bloque`). **Debout, un patron attablé** (relecture de B10) marche contre `patron.obstacles` : les boîtes du plan sans la sienne (le carré d'un patron attablé reste à sa place) ni la banquette qui le porte (Dussart) ; sans cela, revenu vers sa place, chacun butait à 0,5 m sur sa propre boîte (Dussart à 1 m, sur la banquette ; test, témoins). Le point de passage `banquette` (2,55 ; 3,85), au bout est de la banquette, sort Dussart de derrière la table A : sans lui, aucun itinéraire ne menait de sa place au zinc, à la chaise ouest de D ni au mange-debout est (test, témoin), alors qu'il doit venir s'accouder près de Viktor en SOUPÇON (§3.6). B11 : `marcher(itineraire(patron.position, vers))`, puis `asseoir` ; `itineraire` sort déjà des boîtes où l'on est. Debout, Dussart reste sur place, les jambes dans la banquette (adossée au mur, elle ne le laisse pas reculer) : à juger sur captures (B11, B19) ; les autres reculent derrière leur siège (point suivant) ;
  - `seLever({ demi })` (0,9 s ; à demi, Haas « se lève à demi », bassin entre les deux, sur place) et `asseoir(siege)` (Sorel au zinc) changent de clip et de hauteur ensemble ; `setPresent(oui)`. **Debout, hors de son siège** (revue de B10) : levé sur place, un patron gardait l'assise et le dossier de sa chaise au travers des jambes (Mattei à B-sud, sur la capture de la revue), comme l'auraient fait Haas, le démasqué ou Sorel levé de son tabouret. Passé la moitié du lever, il recule donc de `PATRONS.lever.reculM` (0,47 m) derrière sa chaise ou son tabouret, contre ses obstacles (`moveCircle` : jamais dans un mur). Mesuré sur les GLB en `Idle`, aux deux bouts de `heightVar`, ce qu'il faut pour sortir l'assise et le dossier du corps : 0,45 m pour `mafia_boss` (armure et bras devant lui), 0,40 m pour les deux autres, 0,38 m sur un tabouret ; les 0,3 m proposés par la revue laissaient le dossier dans le corps. Il se lève d'abord, puis recule : rien ne bouge au sol avant la moitié du lever, ni quand il se lève à demi (tests, témoins : debout sur place, de 68 à 2 638 sommets du corps dans le siège, sur les trois modèles, quatre chaises et un tabouret ; le recul sans `moveCircle`, le centre du corps à 3 cm du mur ; le recul sur la banquette, Dussart enfoncé de 0,33 m dans son dossier ; le corps qui glisse dès le départ). Pendant la seconde moitié du lever (0,45 s), le corps traverse encore le dossier en reculant : à juger sur captures (B11, B19). `asseoir` le ramène sur son siège en glissant, comme avant. Captures `shots/bar/b10/revue-corrigee/` (Mattei et Haas, Lenoir et Dussart, Albert, levés) ;
  - on vise une capsule invisible par personne (`casting.cibles`, `barId` = le rôle, `type: 'personne'`), de 1 m, centrée 0,4 m sous la tête qu'elle suit ; aucun maillage animé (test, témoin : les modèles) ; absente, la capsule sort du calque 0 et le rayon ne la voit plus ;
  - aucun personnage ne projette d'ombre (`castShadow = false` partout, test, témoin : `characters.js:211`) ; ils reçoivent celle du soleil, figée (les lames des stores sur qui traverse le faisceau). Une ombre de contact sous chacun : un disque noir à alpha par sommet (aucune texture), sous les cuisses de qui est assis (0,8 × 1 m), sous les pieds de qui est debout (0,6 m), toujours au sol, même sur un tabouret (test) ;
  - verres et cartes sous l'os `/RightHand$/` lui-même (test, témoin : l'heuristique de `_addPhoneProp`, qui prend la main gauche), posés droits sur la pose de départ ; le tablier de Lise sous l'os `/Hips$/` ;
  - `dispose()` comme `NPC.dispose` : `stopAllAction`, `uncacheRoot`, `disposeObject` : tout ce que la personne possède, rien du modèle partagé (test, témoin : sans `uncacheRoot`) ;
  - classes de three : `AnimationClip` (déjà dans le bundle par `GLTFLoader`), aucune `DataTexture` ; mais les matériaux des GLB sont physiques (`MeshStandardMaterial`) : le renderer garde pour la session sa table DFG (une texture de 16 × 16, `DFGLUTData.js`), comme en mission ;
  - mesuré (`dev/bar.html?patrons=1`, Chrome sans interface, carte graphique, 1280 × 720, machine chargée par les autres chantiers) : montage des dix en 201 à 297 ms au chargement de la page (mesure des dessous comprise, une fois par session), 107 à 155 ms ensuite (dix montages de `?memtest=10`, en Moyen et en Bas ; `spawnCharacter` en prend l'essentiel, deux `Box3.setFromObject` par clone) ; logique de 0,21 à 0,37 ms par image pour les dix (600 images). Vue de départ, salle et patrons, Sorel absent : 66 appels et 294 390 triangles (première image, ombre comprise : 76 et 311 402), les mêmes en Moyen et en Bas, sous les 130 et 400 000 du §8. Refait après la relecture (pieds, obstacles, présence), avec le `characters.js` de la branche puis celui de main : 65 appels et 293 898 triangles (première image : 75 et 310 910), en Moyen et en Bas, pour l'un comme pour l'autre ; montage des dix en 144 à 234 ms au chargement, 101 à 210 ms ensuite ; logique de 0,42 à 0,57 ms par image (machine plus chargée) ; mémoire (`?patrons=1&memtest=10`, Moyen et Bas) : 43 géométries et 56 textures pendant chaque montage, une géométrie de moins qu'à la première mesure (ci-dessous), puis 13 et 11 après chaque libération, Δ = 0 entre montages (`shots/bar/b10/relecture/mesures-*.json` ; la revue de B10 retrouve les mêmes chiffres) ; dans les vues des captures, jusqu'à 69 appels et 300 444 triangles (Lise qui traverse la salle). Mémoire à la première mesure (`?patrons=1&memtest=10`, Moyen et Bas, `shots/bar/b10/memtest/mesures.json`) : 44 géométries et 56 textures pendant chaque montage ; après chaque libération, 13 et 11, les mêmes d'un montage à l'autre (Δ = 0) : les 13 géométries et 10 textures des trois modèles, partagées, que le renderer garde une fois dessinées (comme au menu du jeu), et sa table DFG. Captures `shots/bar/b10/` (hors dépôt : tables A et B de face et de côté, zinc, Lise en marche, départ en Moyen et en Bas), à juger par Rayan.

### 3.3 Les quatre renseignements [D]
| Renseignement | Au carnet « CE QU'IL ME FAUT » | Viktor (voix intérieure) | Sources (socle) | Difficulté |
|---|---|---|---|---|
| **TRAJET** | `TRAJET · LA VIEILLE ROUTE` | « La vieille route. » | A1 (table A) ; l'appel (ce que répète Sorel) ; Sorel au dialogue D2 | moyenne |
| **VÉHICULE** | `VÉHICULE · LE 2e SUR 3` et `CASQUETTE AU 3e : LEURRE` | « La deuxième voiture. La casquette, c'est pour un autre. » | B1 (table B) ; relance R2 | difficile |
| **PLACE** | `PLACE · DEVANT, CÔTÉ PASSAGER` | « Devant. Côté passager. » | A2a ; la voix du colonel dans le combiné (à 1 m) ; relance R1 | difficile |
| **HEURE** | `HEURE · DÉPART 19:15` | « Sept heures et quart. » | A4 (Lise) ; l'appel ; Fernand allié (D1) ; le départ (R3) | facile |
- Trois drapeaux de récit en plus : `leurre` (B1 ou R2), `appel` (voix du colonel entendue), `allie` (Fernand). Ils changent le briefing II et le journal, jamais la difficulté.
- Test de données : **au moins deux sources par renseignement, dont une à épier**.
- Bonus (hors socle, mêmes règles) : A2b « La deuxième » (VÉHICULE sans le leurre), A3, B2, B3, C2 (ambiance), fléchettes, journal à lire, fenêtre.

### 3.4 Écoute (`src/bar/ecoute.js`, pur)
```
I = clamp( A(d / voix) × T × O(α) × (1 − N), 0, 1 )
A(x) = 1 si x ≤ 2,5 m ; 0 si x ≥ 5 m ; sinon u²(3 − 2u), u = (5 − x) / 2,5
voix : 1 normale ; 0,7 baissée (escorte dès MÉFIANCE) ; 1,25 rires ; 0,35 combiné du téléphone
T = produit des transmissions des boîtes coupées par le segment oreille → bouche (mur 0,05 ; cloison 0,6 ; porte 0,9)
O(α) = 1 si l'angle au regard ≤ 75° ; puis linéaire jusqu'à 0,9 à 180°   (se tourner un peu suffit, fixer est inutile)
N = 0,08 + 0,25 × max(0, 1 − distance au juke-box / 4)
```
- **Mots masqués** : chaque mot reçoit une fragilité tirée d'une graine propre à la réplique (stable d'une image à l'autre) : 0 à 0,7 pour les mots ordinaires, **0,8 pour les mots-clés**. Un mot s'affiche si I ≥ sa fragilité **au moment où il est frappé** ; ensuite il ne change plus. Des mots masqués voisins se fondent en un seul « … ». Sous I = 0,15 : « (murmures) », sans bips intelligibles.
- **Acquisition** : une réplique peut porter `{ renseignement, motsCles }` ; le renseignement est acquis à la fin de sa frappe si **tous** ses mots-clés ont été affichés. Alors : tampon « NOTÉ », son `paper()` (`sound.js`) et grattement de crayon, ligne au carnet. Une réplique qui porte un renseignement a au moins un mot-clé : sinon, `decouper` lève une erreur dès la première image de la réplique, comme pour un mot-clé absent de son texte (relecture de B2 ; les données de B5 ne peuvent pas perdre un renseignement en silence).
- **Portée utile** [calcul] : au calme et loin du juke-box, les mots-clés passent jusqu'à environ 3,0 m ; en MÉFIANCE (voix 0,7), jusqu'à environ 2,1 m ; la voix du colonel dans le combiné, jusqu'à environ 1,1 m.
- **Affichage** : un seul échange est sous-titré, le plus intelligible ; on n'en change que s'il est dépassé de 0,25. Nom de qui parle (rôle, puis nom une fois prononcé, comme « INCONNU » devenu « ANTON » au prologue), flèche ‹ ou › si la source est hors champ. Les autres échanges ne s'entendent qu'en bips. Pendant un dialogue de Viktor, aucun sous-titre d'une autre table.
- **Son des voix** : gain `A(d / (1,6 × voix)) × T` (on entend plus loin qu'on ne comprend), passe-bas `600 + 2400 × T` Hz, panoramique `sin(azimut)`. Au plus 3 voix bipées en même temps (la sous-titrée et les deux suivantes).
- **Réglé en B4** [V, 29 octobre 2026] : `src/ui/frappe.js` (`createFrappe`, `dureeFrappe`), tenu par `tests/ui/frappe.test.js`. Ce que B5, B11 et B12 gardent :
  - la frappe n'avance que par `update(dt)` (en pause, elle est figée) ; la k-ième lettre des n tombe à k × durée / n, la dernière à la durée, quand `fini` devient vrai ; durée par défaut 0,8 × `estimate` (§3.14) ;
  - un mot se décide à sa première lettre, par `masque(i, mot)` appelée une seule fois, et ne change plus ; les mots sont ceux de `decouper` (les morceaux entre deux blancs, une espace insécable comptant comme une espace), et la frappe les rejoint d'une espace simple, comme `masquer` ;
  - au bar, `masque` retient l'I du moment (`Is[i]`) et rend `!affichage(Is, f)[i]` ; le sous-titre d'écoute est `masquer(frappe.motsFrappes, Is, f)`, qui dit aussi « (murmures) » ; `frappe.texte` donne le même texte, sans les murmures (répliques de Viktor, dialogues) ; le renseignement s'apprend quand `fini` devient vrai, si `acquis(replique, affichage(Is, f))` (test d'assemblage avec `src/bar/ecoute.js`) ;
  - `masque` ne fait que lire (relecture de B4) : l'I de l'image, calculé avant `frappe.update` (il sert aussi à choisir l'échange sous-titré), et `f = fragilites(replique)`, calculées avant `frappe.dire` (elles lèvent sur une donnée fausse, voir l'acquisition ci-dessus). Si elle levait quand même, l'erreur remonterait d'`update` ou de `toutAfficher`, jamais avalée : le mot n'est ni décidé ni frappé, il se redécide au prochain appel et rien n'est perdu (test), mais l'erreur revient à chaque image tant que `masque` échoue. B11 l'attrape comme toute erreur d'image et termine une seule fois en `erreur` (§3.10), comme `fail` et `report` dans l'enquête (`investigation.js:156-160, 495-501`) ;
  - `toutAfficher()` (clic droit ou Espace) décide les mots restants à l'I de l'instant : **B11 ne le branche que sur les répliques sans masque** (Viktor, dialogues, objets), jamais sur une réplique écoutée (relecture de B4). Là, il ferait lire d'un coup des mots que la table n'a pas encore dits, et apprendre un renseignement avant la fin de sa réplique : il suffirait d'être à portée à l'instant de l'appui, pas pendant toute la réplique. Test de B11 : Espace ou clic droit pendant une réplique écoutée n'en frappent rien d'un coup, et son renseignement ne s'apprend qu'à la fin de sa frappe (témoin : `toutAfficher` branché sur toutes les répliques) ;
  - la ponctuation précédée d'un blanc est un mot (relecture de B4, à trancher en B5). Les textes du jeu mettent une espace simple devant « ? » et « ! » (« Qui êtes-vous ? », `src/briefing/scenes/prologue-b.js:178`), le §3.14 aussi : `decouper` et la frappe font alors de « ? » un mot à part, avec sa fragilité, qui peut se masquer seul (« Tu es sourd … ») ; de même pour un « … » seul (L'APPEL). Et une espace insécable devant la ponctuation ne survit pas : les mots se rejoignent d'une espace simple. B5 choisit : soit des textes sans insécable devant la ponctuation, le « ? » restant un mot qui peut se masquer seul ; soit `decouper` rattache un mot sans lettre ni chiffre au mot d'avant, et la frappe fait de même (le test « les mots sont ceux de decouper », `tests/ui/frappe.test.js`, tombe si l'un change sans l'autre). Un test de données de B5 verrouille le choix. B12 : le sous-titre d'écoute vient de `masquer`, jamais de `frappe.texte`, qui ne dit pas « (murmures) » (test de B12, témoin : `frappe.texte` affiché) ; sur les captures en 1280 × 720, aucune ponctuation ne passe seule à la ligne.
- **Réglé en B5** [V, 31 octobre 2026] : la ponctuation (second choix ci-dessus). `decouper` et la frappe prennent les mêmes mots, ceux de `motsDe` (`src/ui/frappe.js`) : un morceau sans lettre ni chiffre (« ? », « ! », « … », un guillemet) se rattache au mot d'avant, ou au suivant s'il ouvre la réplique (un texte sans lettre ni chiffre ne fait qu'un mot) ; les blancs qu'un mot englobe s'écrivent en une seule espace insécable. « Tu es sourd ? » donne « Tu », « es », « sourd ? » : le « ? » se frappe, s'affiche et se masque avec son mot, jamais seul, et ne passe pas seul à la ligne ; un mot-clé se reconnaît malgré la ponctuation rattachée. Les textes de `src/bar/textes.js` gardent l'espace simple du reste du jeu devant « ? » et « ! » (une insécable y serait lue comme un blanc, avec le même résultat). Tenu par `tests/bar/ecoute.test.js` et `tests/ui/frappe.test.js` (témoins : le `decouper` de B2, la frappe de B4, l'un changé sans l'autre), et par le test de données de `tests/bar/textes.test.js` : aucun mot d'une réplique écoutée sans lettre ni chiffre (témoin : le `decouper` de B2).

### 3.5 Le regard qui fixe (`src/bar/regard.js`, pur)
```
θmax(d) = atan(0,10 / d) + 3°                 6,8° à 1,5 m ; 5,9° à 2 m ; 4,9° à 3 m ; 4,1° à 5 m [calcul]
fixe(p) = angle(centre de l'écran, os Head de p) ≤ θmax(d)
          ET p voit Viktor (Viktor à 70° ou moins de sa face, 110° s'il est alerté ; ligne de vue 2D libre)
          ET p n'est pas l'interlocuteur du dialogue en cours
f_p ← fixe ? f_p + dt : max(0, f_p − 2·dt)
```
- **Tolérance** : escorte 1,2 s ; civils (Lise, ouvriers) 2 s ; Fernand 3 s ; Albert jamais. Assis avec un verre : × 1,3.
- La dépasser déclenche « remarqué » une fois par épisode (il faut que `f_p` revienne à 0). La personne est alors alertée 10 s (cône à 110°, tête qui suit Viktor, réplique courte), puis la montée continue s'applique tant que la fixation dure.
- **Répliques** (à la tolérance, à +1,5 s, à +3 s) :

| | 1 | 2 | 3 |
|---|---|---|---|
| Dussart | *(il soutient le regard)* | Un problème ? | Tu veux ma photo ? |
| Lenoir | Quoi ? | Il me regarde, lui. | Sergent. Il nous regarde. |
| Mattei | Tu joues ou tu regardes ? | Il y a un souci, l'ami ? | Haas. Le monsieur s'intéresse à nous. |
| Haas | *(il pose ses cartes)* | *(il se redresse)* | *(il se lève à demi)* |
| Sorel | Monsieur ? | On se connaît ? | Restez assis. *(lance D2)* |
| Lise | Autre chose ? | Je ne suis pas au menu. | |
| Fernand | Encore un ? | | |
- La première fois, Viktor pense : « Ne les fixe pas. » Lise le dit aussi (D3, L2).
- **Réglé en B3** [V, 28 octobre 2026] : `src/bar/regard.js` (`seuilFixation`, `voitViktor`, `createRegards`), tenu par `tests/bar/regard.test.js`. Ce que le tableau ci-dessus laissait ouvert, et que B11 et B12 gardent :
  - les répliques tombent quand `f_p` atteint la tolérance, puis la tolérance plus 1,5 s, puis plus 3 s, une fois chacune par épisode : regard détourné, `f_p` redescend et la suite attend que la fixation reprenne et dure ;
  - la remarque tombe à la fin de l'image où `f_p` atteint la tolérance, la montée « fixation » part de l'image suivante. Une image du bar fait, dans cet ordre : `regards.update`, la jauge (`update` avec `regards.sources` et `regards.temoins`), puis `evenement('remarque', categorie)` pour chaque remarque émise : l'exemple du §3.6 donne alors 30 et plancher 10 tout juste (test) ;
  - les témoins de la jauge (§3.6), baisse « hors de la vue de tous » comprise, sont `regards.temoins` : la catégorie de chaque personne qui voit Viktor (cône de 70°, ou 110° pendant ses 10 s d'alerte, et `vueLibre`). L'interlocuteur en est un, même s'il n'est jamais fixé ; Albert aussi, sans poids. Reste à B11 « Fernand voit toujours le zinc » : en zone interdite, il est témoin quoi que dise son cône ;
  - chaque personne donne à chaque image sa tête (os Head, en x, y, z) et le lacet de sa face ; `voitViktor` mesure le cône depuis ce lacet (au repos, celui du siège dans `plan.js`). L'angle au centre de l'écran et la distance d de θmax(d) se mesurent en trois dimensions, de l'œil de Viktor à l'os Head : son œil est à 1,65 m debout, à 1,20 ou 1,45 m assis, et les têtes sont à environ 1,25 m (assis) ou 1,65 m (debout) (relecture de B3, test) ;
  - `createRegards` garde les objets qu'on lui passe, pas le tableau : l'appelant modifie sur place x, y, z et lacet de chacun avant chaque image, sans jamais remplacer l'objet ; un objet neuf ne serait jamais lu, et sans erreur (relecture de B3, test). Une personne dont `present` vaut `false` (Sorel avant 18:30) ne voit pas Viktor et n'est pas fixée ; le champ se modifie sur place, comme la tête (relecture de B10, §3.2 « Réglé en B10 ») ;
  - reste à trancher en B10 et B11 (relecture de B3) : d'où part le cône d'une personne alertée. Recommandation : le lacet donné au regard est celui du corps ou du siège, jamais celui de la tête que la couche de B10 tourne vers Viktor ou vers un interlocuteur. La tête suit Viktor jusqu'à 70° du corps : mesuré depuis elle, le cône de 110° d'un alerté irait jusqu'à 180° de chaque côté du corps, et seuls les murs arrêteraient l'alerte. Le passage de 70° à 110° tient déjà compte de la tête qui suit Viktor. Appliqué en B10 : `patron.personne.lacet` est celui du corps ou du siège, quelle que soit la tête (§3.2, « Réglé en B10 »).

### 3.6 La jauge de soupçon (`src/bar/soupcon.js`, pur ; valeurs dans `src/bar/reglages.js`)
```
hausse = Σ sources actives × poids du témoin le plus sévère qui voit Viktor   (escorte 1,0 ; Fernand 0,8 ; civils 0,5 ; Albert 0)
S ← min(100, S + hausse·dt + événements)
si hausse = 0 : S ← max(plancher, S − baisse·dt)          jamais de montée et de baisse dans la même image
```
| Montées continues (si quelqu'un voit Viktor) | /s |
|---|---|
| Fixation au-delà de la tolérance | 10 × poids de la personne fixée |
| Debout à moins de 1,3 m d'un homme de l'escorte | 6 |
| Debout en zone privée sans couverture (ni verre ni prétexte) | 2,5 ; avec prétexte (fléchettes, attente des toilettes) 0,5 |
| Zone interdite (Fernand voit toujours le zinc) | 12 |

| Événement | Effet |
|---|---|
| Remarqué par l'escorte / un civil / Fernand | +12 plancher +10 / +6 plancher +3 / +4 plancher +2 |
| Surpris en zone interdite | +25, plancher +10 |
| 90 s cumulées à moins de 3 m d'une table de l'escorte | +10, plancher +5, puis le compteur repart |
| 60 s sans rien commander | +10 ; Lise : « Tu prends quelque chose ou tu attends le bus ? » |
| Silence (la minuterie d'une réponse expire) | +8 (Sorel : +10, et la question revient une fois) |
| Choix de dialogue | de −15 à +30 selon les données ; certains démasquent |
| Trois fléchettes dans le mille (bonus) | +15 ; Mattei : « Trois dans le mille. Tu as fait l'armée, toi ? » |

- **Baisses** : 3/s debout ; 5/s assis avec un verre, ou hors de la vue de tous ; assis sans verre, 3/s comme debout (la lecture la plus dure, retenue en B1 : décision 10 du §13). **Plancher plafonné à 55** : après beaucoup de fautes, on revient en MÉFIANCE, jamais en CALME (vrai seulement si SOUPÇON n'a jamais été atteint, puisqu'on n'en sort que sous 52 : décision 9 du §13).

| Palier | Monte à | Redescend sous | Conséquences |
|---|---|---|---|
| CALME | | | aucune |
| MÉFIANCE | 30 | 22 | l'escorte baisse la voix (× 0,7) ; un regard vers Viktor toutes les 8 à 12 s ; la première fois, Mattei : « C'est qui, lui ? » |
| SOUPÇON | 60 | 52 | échanges porteurs d'un renseignement **reportés** (nouvel essai toutes les 20 s, 2 fois, puis perdus) ; Sorel lance D2 s'il est là, sinon Dussart vient s'accouder près de Viktor (Lenoir : « Sergent… ») ; le cœur bat ; Viktor : « Je me fais remarquer. » |
| DÉMASQUÉ | 100 | | séquence d'échec (§3.10) |
- **Sortir du bar en SOUPÇON** (S ≥ 60) : Sorel le suit, « Hé. Vous. Attendez. » : démasqué.
- **Retour au joueur** : en haut au centre, une icône d'œil (ouvert si quelqu'un voit Viktor, mi-clos sinon) et une barre fine graduée à 30 et 60, plancher hachuré, libellé du palier ; couleurs de l'enquête (#d7dccf, #f0c040, #e04848) ; vignette rouge dès 60 ; arcs ambrés au bord de l'écran vers un homme de l'escorte hors champ qui vient de remarquer Viktor ; anneau de fixation autour du point de visée (dessin de `.enq-ring`, `src/prologue/enquete.css:112-115`) ; dans la scène, les têtes se tournent et la table se tait.
- **Exemple** [calcul] : fixer Sorel 3 s à 2 m : +12 à 1,2 s, puis 1,8 s × 10 = 18 ; S = 30 (MÉFIANCE), plancher 10. En détournant les yeux, S repasse sous 22 en 2,7 s debout, puis descend au plancher.

### 3.7 Couverture
- **Le verre** : servi par Fernand (D1) ou Lise (L1), tenu en vue à la première personne (verre et liquide, 2 appels) toute la soirée. Sans verre au bout de 60 s : événement du tableau ci-dessus.
- **Posé** : assis (chaise, tabouret) ou accoudé au mange-debout avec un verre : la montée « zone privée » est coupée et la baisse passe à 5/s. « Trop près » ne vaut que debout. Assis ou posé, la jauge ne compte ni « trop près » ni la zone privée, quoi que l'appelant lui passe (`SOUPCON.deboutSeulement`, relecture de B1).
- **S'asseoir** : E sur un siège libre (capsule invisible) ; la souris tourne la vue, les touches ne déplacent pas (`setMoveLocked`) ; E ou une touche de déplacement relève Viktor.
- **Prétextes** : la file des toilettes (le routier occupe le WC de 240 à 300 s, porte « OCCUPÉ ») ; les fléchettes (bonus) ; le juke-box (une pièce, 1 s de maintien).

### 3.8 Dialogues à choix (`src/bar/dialogue.js`, pur ; données dans `src/bar/textes.js`)
**Format**
```js
{ id: 'fernand', noeuds: { f1: {
    qui: 'fernand', dit: 'Qu\'est-ce que je vous sers ?', delaiS: 10,
    choix: [{ texte: 'Un demi.', reponse: 'Un demi.', si: null,
              effets: { soupcon: -5, verre: true }, suite: 'f2' }],
    silence: { effets: { soupcon: 8 }, suite: 'fin' } } } }
```
- **Déroulé** : la réplique est frappée ; 0,6 s après la fin de la frappe, 2 à 3 choix s'affichent et la minuterie part (**10 s** en conversation, **6 s** avec Sorel) ; le choix déclenche la réplique de Viktor, tapée avec les bips `inner` ; les effets s'appliquent une seule fois ; à l'échéance, l'issue `silence`.
- **Touches** (`e.code`, pointeur toujours verrouillé, sinon la pause s'ouvre) : `Digit1` à `Digit3` et `Numpad1` à `Numpad3` choisissent ; `ArrowUp`, `ArrowDown` ou la molette déplacent la surbrillance ; `KeyE`, `Enter`, `NumpadEnter` ou le clic gauche valident. Libellés **toujours « 1 » à « 3 »** (jamais `&`, `é`, `"` d'AZERTY : `keyLabel` et non `keyName`, `investigation.js:99-101, 291-295`).
- Pendant un dialogue : Viktor ne marche pas, la vue pivote vers l'interlocuteur (pas en effets atténués), les sous-titres des tables sont masqués.
- **Interface** : panneau bas de la largeur de la fiche de l'enquête ; onglet du rôle ; choix numérotés, surbrillance au filet ambré ; minuterie en trait qui raccourcit, ambré sur les 3 dernières secondes, `clock()` toutes les 0,5 s sur la dernière 1,5 s.
- **Réglé en B5** [V, 31 octobre 2026] : `src/bar/dialogue.js` (`createDialogue`, `verifierArbre`, `choixDepuisCode`, `libelleChoix`), tenu par `tests/bar/dialogue.test.js` ; les arbres sont dans `src/bar/textes.js`. Ce que devient le format du début de section, et ce que B6, B11 et B12 gardent :
  - un arbre : `{ id, interlocuteur, entree, minuterieS?, noeuds }`. La minuterie est celle de l'arbre (`DIALOGUE.minuterieS`, 10 s ; l'arbre de Sorel prend `DIALOGUE.minuterieSorelS`, 6 s), pas un `delaiS` par nœud : les valeurs restent dans `reglages.js` ;
  - un nœud est une réplique `{ qui, dit, didascalie?, didascalieApres? }` suivie de choix (`choix` et `silence`) ou de rien (`effets?`, `suite`), ou un aiguillage `{ aiguillage: [{ si?, suite }] }` : la première branche remplie, la dernière sans condition ; il ne dit rien et ne prend pas de temps. Un choix : `{ texte, reponse?, si?, effets?, suite }`, la réponse une chaîne ou `{ qui?, texte, didascalie? }`. Un silence : `{ reponse?, effets?, suite, revient? }` ; `revient` : la question revient une fois (Sorel). Chaque suite existe, chaque nœud est atteint, aucune boucle (`verifierArbre`, dès la création) ;
  - les conditions `si` : `couverture` (`'routier'` ou `null`), `renseignement` et `sans` (exactement `true` ou non), `soupconMin`, `soupconSous`, lues dans un `etat` vivant `{ couverture, renseignements, soupcon }` au moment où les choix s'affichent (ils ne changent plus ensuite) et où l'on passe un aiguillage ;
  - les effets sont **émis**, une seule fois par issue, jamais appliqués par le dialogue : `update` les rend en dernier, et la suite attend l'image suivante sans perdre de temps de jeu, si bien que B11 les applique avant qu'une condition ne les lise. `soupcon: n` donne `jauge.evenement('choix', n)` ; le silence est un événement de la jauge, `evenement: 'silence'` (+8) ou `'silenceSorel'` (+10), et non `soupcon: 8` ; `demasque` ; `verre: 'demi'` ou `'cafe'`, et non `true` (le verre tenu en vue, §3.7) ; `couverture` ; `apprend` (au carnet) ; `muet` ; `aide` ; `surveille` (« Je vous ai à l'œil », baisse divisée par deux) ; `ouvre` (la suite de D1) ;
  - le temps : une réplique dure son estimation (`kit.js:10`), frappée en 0,8 de ce temps ; la suivante commence 0,4 s plus tard (`DIALOGUE.enchainementS`) ; les choix s'affichent 0,6 s après la fin de la frappe de la question (`choixApresS`), et la minuterie part ; un `tic` à 1,5 s, 1 s et 0,5 s de l'échéance (`ticsS`) pour `clock()` ; un choix fait parler Viktor aussitôt, puis la réponse ; Espace frappe la réplique en cours d'un coup (une question montre alors ses choix 0,6 s plus tard) ;
  - les touches passent par `touche(e)`, lues par `e.code` ; une touche maintenue (`e.repeat`) ne compte qu'à son premier appui : un chiffre gardé enfoncé ne répond pas à la question suivante, E maintenu (pour sortir, pour le juke-box) ne valide pas des choix qui apparaissent sous lui (test, témoin : `e.repeat` ignoré). Montrer moins de 2 ou plus de 3 choix est une erreur des données (levée, que B11 attrape comme toute erreur d'image), jamais un silence.

### 3.9 La soirée (`src/bar/seance.js`, pur)
- **Horloge** : 18:10 à 18:50 en 420 s, **10,5 s par minute** ; affichée en coin « LE BIVOUAC · 18:36 » (patron de l'heure de l'enquête, `investigation.js:106`).
- **Modes** : carte, exploration, assis, dialogue, pause, sortie, fini.

| t (s) | Heure | Où | Quoi | Renseignement |
|---|---|---|---|---|
| 0 | 18:10 | porte | clochette, Fernand : « Bonsoir. » | |
| 21 | 18:12 | A | A3 « Ceux de l'hiver » (bonus) | |
| 42 | 18:14 | B | B3 « La base » (bonus) | |
| 63 | 18:16 | A | **A1 « La route »** | TRAJET |
| 95 | 18:19 | B | **B1 « La casquette »** | VÉHICULE, leurre |
| 126 | 18:22 | A | **A4 « Le café »** (Lise sert) | HEURE |
| 147 | 18:24 | A | **A2a « Devant »** | PLACE |
| 168 | 18:26 | B | B2 « La serviette » (bonus) | |
| 189 | 18:28 | zinc | C2 « Julien » (bonus) | |
| 210 | 18:30 | porte | **Sorel entre** : clochette, les tables se taisent 3 s ; « Un café, Fernand. » « Lieutenant. » | |
| 231 | 18:32 | A | A2b « La deuxième » (bonus) | VÉHICULE |
| 240-300 | | couloir | le routier occupe les toilettes (prétexte d'attente) | |
| 273 | 18:36 | zinc | **L'APPEL** | TRAJET, HEURE, PLACE |
| 315 | 18:40 | Viktor | **D2 : Sorel s'approche** (plus tôt si SOUPÇON) | TRAJET possible |
| 357 | 18:44 | A, B | **R1 et R2**, relances | PLACE, VÉHICULE |
| 389 | 18:47 | porte | **Départ (R3)** | HEURE |
| 420 | 18:50 | D | Albert : « Le 7 a gagné. » ; Viktor : « Il faut y aller. » ; sortie automatique 6 s plus tard | |
- **Report sous soupçon** (§3.6). **La fin attend** la fin d'un dialogue en cours.
- **Sortie volontaire** à tout moment par la porte : maintien de E 1 s (anneau de l'enquête), invite « SORTIR · RENSEIGNEMENTS 2 / 4 ».
- **Piste** : rien d'appris après 150 s : Viktor pense « Ils ne parleront pas devant le zinc. » (patron de `hintDelay`, `src/prologue/state.js:18`).
- **Réglé en B6** [V, 2 novembre 2026] : `src/bar/seance.js` (`createSeance`, `heureDe`), valeurs `SEANCE` de `src/bar/reglages.js`, tenu par `tests/bar/seance.test.js`. Ce que le tableau laissait ouvert, et que B11 et B12 gardent :
  - la soirée joue les échanges elle-même : une réplique à la fois, le temps de son estimation (`kit.js:10`), 0,4 s jusqu'à la suivante (`SEANCE.enchainementS`, celui des dialogues) ; elle émet chaque réplique avec son foyer (le sien, ou celui de l'échange : R3, « On y va. » au zinc) et l'instant où elle commence (`debutS`) ; B11 en fait la frappe, l'écoute et l'acquisition (§3.4) et choisit l'échange sous-titré. Plusieurs échanges se jouent en même temps (R1 et R2) ; un grand pas rattrape ce qui était dû, dans l'ordre du temps ;
  - personne ne tient deux conversations : un échange attend que chacun de ses gens ait fini celui où il parle (A4 reporté à 146 s, A2a attend Dussart), et la fin du dialogue de Viktor avec l'un d'eux (Lise qui lui parle ne sert pas la table A ; Fernand au dialogue, le téléphone sonne quand il a fini). `occupe(qui)` : B11 n'ouvre pas D1, L1 ni L2 avec quelqu'un qui parle dans un échange ;
  - personne ne parle une fois parti (relecture de B6) : le départ (R3) emmène toute l'escorte (Sorel, Dussart, Lenoir, Haas, Mattei : `ESCORTE`). Il attend que chacun d'eux ait fini l'échange où il parle, et, quand il commence, tout échange pas encore commencé où parle l'un d'eux est perdu (`perdu`), porteur d'un renseignement ou non : un bonus de l'escorte qu'un dialogue retenait l'est aussi. B11 ne déduit donc jamais de `perdu` qu'un renseignement a été manqué (un renseignement s'entend souvent à plusieurs sources) : seul le carnet (`connait`, `appris`, `src/bar/renseignements.js`) dit ce que Viktor sait (seconde relecture de B6). Sans cette règle, en SOUPÇON de 350 à 380 s, R1 et R2, reportés à 377 puis à 397 s, se jouaient pendant le départ, et R2 (VÉHICULE et le leurre) une fois la porte refermée, dit par des hommes partis ; de même pour un échange qu'un dialogue retenait au-delà de 389 s. Tenu par trois tests (témoins : le module de B6 avant relecture ; seul un report dû après le départ perdu ; le départ qui n'attend que ses propres gens) ;
  - le report se lit quand l'échange devrait commencer ; commencé, il va jusqu'au bout. **L'appel et le départ (R3) ne se reportent pas** (`JAMAIS_REPORTES`), écart à la lettre du §3.6, qui reporte tout échange porteur : le colonel appelle à son heure, le convoi part à la sienne ; sinon, en SOUPÇON, R3 serait retenté à 409 puis 429 s, après la fin, et l'escorte ne partirait jamais. Pour le départ, c'est forcé ; pour l'appel, c'est un choix de difficulté (en SOUPÇON, la source de TRAJET, HEURE et PLACE s'entend quand même), à faire valider par Rayan : décision 11 du §13, ouverte, l'option en place s'applique. Les échanges sans renseignement (bonus, entrée de Sorel) se jouent en SOUPÇON ;
  - l'entrée de Sorel : clochette, les tables se taisent 3 s (`silenceEntreeSorelS`) : aucune autre table ne commence d'échange ni de réplique avant la fin de ce silence ; puis « Un café, Fernand. ». L'appel : trois sonneries à 1,5 s d'intervalle (`sonnerie`), Fernand décroche 4,5 s après. Les ouvriers, sans heure dans `textes.js`, parlent à 10,5 s (`placesS`), une fois, quand Viktor vient d'entrer près d'eux ;
  - D2 à 315 s, ou dès SOUPÇON une fois Sorel entré ; jamais pendant que Sorel parle (l'appel), ni pendant un dialogue, ni une fois le départ commencé ; une seule fois, y compris lancé par le regard (« Restez assis. ») : la soirée le voit à `dialogue.interlocuteur === 'sorel'`, et le dialogue qu'elle ouvre, le reste de son image le voit en cours ;
  - la piste : une fois, à 150 s si aucun des quatre n'est appris, après un dialogue en cours ; jamais une fois quelque chose appris. La fin attend un dialogue en cours ; Viktor sort de lui-même 6 s après la fin de « Le 7 a gagné. » (B11 montre « Il faut y aller. » à la fin de l'échange), ou à la fin d'un dialogue ouvert entre-temps ;
  - `sortir(S)` lit S (« S ≥ 60 » du §3.6), à l'arrondi près de la jauge, et non le palier : avec le plancher de la décision 9 (ouverte), qui reste en SOUPÇON sous 60 sort sans être démasqué. À 60 ou plus : `reaction` « Hé. Vous. Attendez. », puis `demasque`, que B11 passe à la jauge (`evenement('demasque')`) ;
  - `sorelEntre` dit qui lance « Toi. Debout. » (Sorel une fois entré, Dussart avant) ; à trancher en B11 : démasqué après le départ de l'escorte (`escortePartie`, zone interdite sous les yeux de Fernand, ou la porte en SOUPÇON), personne de l'escorte n'est là pour le dire ni pour suivre Viktor (tranché en B11 : la porte en SOUPÇON n'y démasque plus, la jauge oui, sans « Toi. Debout. » ; §3.13, « Réglé en B11 »). `wcOccupe` de 240 à 300 s ; `tablesMuettes` pendant le silence de l'entrée de Sorel ;
  - les modes (carte, exploration, assis, dialogue, pause, sortie, fini) sont ceux de la coquille (B11) : la soirée ne connaît que `fini`. Restent à B11, hors de l'horloge : D1, F3, L1 et L2 (déclencheurs de position, de siège et de regard), les 60 s sans commande, les 90 s près des tables, les −2/s près d'Albert, ses murmures, la pensée d'entrée (`OBJETS.entree`) et l'option de développement `t` (partir à un instant : les échanges d'avant passés, Sorel entré après 210 s). Logique : 0,4 µs par image sous Node.

### 3.10 Échec, pause, erreur
- **Démasqué** (2,5 s au temps de jeu) : brouhaha à 0,1 en 0,8 s, les têtes se tournent, Sorel (ou Dussart avant 18:30) se lève : « Toi. Debout. », les deux tables se lèvent, noir, tampon « COUVERTURE GRILLÉE ». Puis `onDone({ resultat: 'demasque' })`, et `main.js` appelle `triggerGameOver('Démasqué : les hommes du colonel vous ont repéré')` (cause écrite en dur, `tests/code-mort.test.js:57-64`) ; `canFail` accepte la phase `'bar'`, `'investigation'` reste refusée (`tests/campaign/phase.test.js:159-165`).
- **Écran d'échec** existant (`index.html:607-609`) : RECOMMENCER rejoue le bar depuis la porte, tout à zéro ; REVOIR LE BRIEFING rejoue le briefing I puis le bar.
- **Pause** (perte du verrou) : REPRENDRE ; SORTIR DU BAR (même règle que la porte : en SOUPÇON, démasqué) ; MENU PRINCIPAL. Tout est figé : horloge, frappe, bips, minuterie, jauge.
- **Carte de départ** : « LE BIVOUAC · 18:10 » / « Ils partent ce soir. Ce qu'il me faut : la route, la voiture, sa place, l'heure. » / « Écouter sans regarder. » / touches relues selon la disposition / « CLIQUER POUR COMMENCER » ; sortie de secours **PARTIR SANS ENTRER** (verrou refusé) : convoi sans renseignement (`resultat: 'passe'`).
- **Erreur** (chargement, démarrage ou image) : `resultat: 'erreur'`, renseignements acquis jusque-là, on enchaîne sur le convoi. La partie ne se bloque jamais.
- **Contexte WebGL perdu** : `onRenderLost` libère le pointeur (`main.js:1540-1544`), le bar passe en pause comme l'enquête.

### 3.11 La sortie : bilan et pont
- **Bilan « DOSSIER 05 »** (fiche à la manière de `develop`, `investigation.js:39-97`) : 4 lignes ; apprise : la valeur et le tampon NOTÉ en #e04848 ; manquée : « INCONNU » en gris.
- **Téléphone** : salves de vibration de l'enquête, écran « ANTON » puis le message tapé « Alors ? ». Viktor : 4 infos « J'ai tout. » ; 2 ou 3 « Il faudra faire avec. » ; 0 ou 1 « Presque rien. »
- **Contrat de sortie** (une seule fois) :
```js
onDone({ resultat: 'sorti' | 'demasque' | 'passe' | 'abandon' | 'erreur',
         renseignements: { trajet, vehicule, place, heure, leurre, appel, allie },   // booléens
         couverture: { soupconMax, paliers: { mefiance, soupcon }, dureeS } })
```

### 3.12 Sons (`src/bar/son.js`, procéduraux, à graine, émis dans `update(dt)`)
| Son | Recette | Quand |
|---|---|---|
| Brouhaha | 3 générateurs de syllabes (recette de `voice`, `sound.js:51-63`), 90 à 220 Hz, passe-bas 900 Hz, panoramique ±0,6 ; lit de bruit passe-bas 400 Hz | continu, × présents / 8, × canard du soupçon (1 ; 0,7 dès 60 ; 0,35 dès 85) |
| Verres | 3 partiels sinus 2,6, 3,9, 5,3 kHz, déclin 0,25 à 0,4 s | toutes les 3 à 8 s |
| Juke-box | 4 accords en mineur (recette de `music`, `sound.js:78-96`), basse en triangle à 84 bpm, craquements ; passe-bas `450 + 3000 × T` | continu |
| Tiercé | voix bipée rapide et nasillarde (passe-bande 1,8 kHz) | par bouffées |
| Clochette, porte | 1,9 et 2,6 kHz, 0,6 s ; grincement de l'enquête (`ambience.js:92`) | entrées, départ |
| Téléphone | sonnerie à cloche, 3 fois | 273 s |
| Pas | `amb.step()` de l'enquête (`ambience.js:96`), sur parquet | `onStep` |
| Cœur | battement du kit, intervalle 1,1 s à 0,6 s, dès 60 | SOUPÇON |
| NOTÉ | `paper()` et grattement (bruit 3,5 kHz, 0,3 s) | renseignement acquis |
| Réverbération | une `ConvolverNode` à elle, chargée de `impulseResponse('interieur')` (`src/shot/acoustics.js:32`), envoi à −20 dB, libérée à l'arrêt ; jamais `mountEcho`, singleton du jeu (`src/audio.js:96`) | voix, verres |
- Aucun `Math.random` (générateur de `acoustics.js:10-18`), aucun `setInterval`. En pause : plus de syllabes, musique baissée de 10 dB.
- **Réglé en B7** [V, 24 novembre 2026] : `src/bar/voix.js` (`creerVoix`, `creerChoeur`, `reglageBips`) et `src/bar/son.js` (`creerSon`), valeurs `VOIX` et `SON` de `src/bar/reglages.js`, tenus par `tests/bar/voix.test.js` et `tests/bar/son.test.js` (faux `AudioContext` de `tests/bar/fauxAudio.js`). Ce que le tableau et le §3.4 (« Son des voix ») laissaient ouvert, et que B11 et B12 gardent :
  - une voix par personne, créée au premier mot par le chœur (`creerChoeur`), graine tirée de son nom : recette des syllabes de `voice` (`sound.js:51-63`, qui reste intact), au temps de jeu. Les timbres du §3.2 se lisent ainsi : « lent », débit 0,75 ; « rapide », 1,3 ; « syllabes courtes », 0,04 à 0,09 s ; « éclats », crête tirée de 0,3 à 1 ; « rare », un pas sur trois en silence ; « régulier », presque sans pause ni saut. Le colonel : 70 à 100 Hz, bande étroite à 1 kHz, et le lit de ligne du timbre `phone` (bruit passe-bande à 1 800 Hz, 0,022, `sound.js:44-45`) sous ses syllabes, ouvert tant qu'il parle et réglé par l'écoute comme elles (en pause, sans `update`, il reste tel quel) : son niveau se juge à l'écoute (B19), `VOIX.timbres.colonel.ligne` ; les ouvriers : le timbre du brouhaha ; Viktor : la voix intérieure des cinématiques ;
  - `reglageBips(oreille, regard, source, boites)` donne la chaîne de chaque voix (gain, coupure, panoramique du §3.4) ; le chœur ne laisse biper que trois voix, la sous-titrée puis les deux **plus fortes en gain** (ce qu'on entend, et non l'intelligibilité) ; une voix sous un gain de 0,001 ne bipe pas mais sa réplique avance ; le brouhaha et le tiercé ne comptent pas parmi les trois. B11 passe `son.reverberation` au chœur (`reverberation`) : les voix et les verres vont dans la réverbération, pas le brouhaha ;
  - **en pause, B11 continue d'appeler `son.update`**, avec le temps réel et `pause: true` : la musique continue à −10 dB (et le lit de bruit sourd du brouhaha, qui n'est pas une syllabe) ; brouhaha, tiercé, verres et cœur n'avancent plus. Les voix du chœur, elles, ne reçoivent plus d'`update` : plus une syllabe. **Ce temps réel est borné à 0,05 s par image**, comme le pas de la boucle (`Math.min(clock.getDelta(), 0.05)`, `main.js:1421`, sans le ralenti) : le juke-box, seul à avancer en pause, programme ses notes 0,1 s à l'avance et tient ainsi jusqu'à 0,15 s par image, mais un pas non borné en perdrait au-delà la part (dt − 0,15) / dt (une sur quatre à 5 images par seconde) ; hors pause, verres, cœur et syllabes ne tolèrent que 0,05 s de retard, ce que le pas de jeu borné tient ;
  - le canard du brouhaha se lit sur S (1 ; 0,7 dès 60 ; 0,35 dès 85), le cœur sur le palier (il bat tant qu'on est en SOUPÇON, encore à 55 si l'on n'est pas redescendu sous 52), de 1,1 s à 0,6 s d'intervalle de S = 60 à 100 ; au palier DÉMASQUÉ, le brouhaha tombe à 0,1 en 0,8 s (§3.10) : B12 n'a qu'à passer le palier ;
  - juke-box et télé reçoivent `{ T, pan, gain }` de B11 pour l'oreille de Viktor : coupure du juke-box 450 + 3 000 × T Hz, celle de la télé comme une voix (600 + 2 400 × T) ; la spec ne baisse pas le juke-box avec la distance : `gain` vaut 1 sauf si B11 en décide autrement en jouant ;
  - sons ponctuels : `clochette()` (avec le grincement de la porte), `sonnerie()` (une par appel : la soirée en émet trois), `note()`, `pas()`, au centre (la spec ne les place pas) ;
  - un pas de temps de plus de 0,05 s ne rattrape pas les syllabes, notes, verres ou battements qu'il a sautés (`__barAvance` ne fait pas de rafale) ; contexte suspendu, rien ne se programme ; les sons finis se débranchent à `update`, sur l'horloge audio (ni minuteur ni écouteur) ; `stop()` coupe net, sans fondu : si un claquement s'entend à la sortie, B11 baisse le son pendant le noir de fin ;
  - mesuré (Chrome sans interface, `dev/bar-son.html`, rendu hors ligne) : 0 nœud branché après chacun de dix arrêts, de 61 à 89 en jeu (lit de ligne du colonel compris) ; 0,1 ms par image en moyenne (sons, chœur et calculs d'écoute) ; crêtes vers −10 dBFS au volume du jeu ; le lit du colonel à −57 dBFS de niveau efficace de près, muet une fois sa réplique finie et après `dispose`. À juger en jouant (B19) : le niveau du cœur (celui de l'enquête : ses 58 Hz portent le niveau efficace de −35 à −28 dBFS en SOUPÇON), l'équilibre des voix, du brouhaha et du juke-box, et le lit de ligne du colonel.

### 3.13 Modules et API
| Fichier | Rôle | Pur |
|---|---|---|
| `src/bar/reglages.js` | toutes les valeurs de ressenti, commentées (à part de `src/shot/tuning.js`, que le lot 3 réécrit en parallèle ; renvoi d'une ligne ajouté à la fusion) | oui |
| `src/bar/plan.js` | boîtes, zones, sièges, places, foyers des tables, ancres | oui |
| `src/bar/ecoute.js`, `regard.js`, `soupcon.js` | §3.4 à §3.6 | oui |
| `src/bar/dialogue.js`, `seance.js`, `renseignements.js` | §3.8, §3.9, contrat avec le convoi (§5) | oui |
| `src/bar/textes.js` | répliques, échanges, dialogues, carte, bilan | oui |
| `src/ui/frappe.js` | frappe d'une réplique avancée par `update(dt)`, mots masqués | oui |
| `src/bar/voix.js` | voix bipées multiples, une chaîne par source, avancées par `update(dt)` | Web Audio |
| `src/bar/son.js` | salle (§3.12) | Web Audio |
| `src/bar/salle.js` | décor (three), `stats()`, `dispose()` | three |
| `src/bar/patrons.js` | personnages assis et animés, couche de tête, capsules, accessoires, libération | three |
| `src/bar/index.js`, `src/bar/bar.css` | chef d'orchestre et interface | DOM |
| `src/gfx/batcher.js`, `src/prologue/decor.js` | outils sortis d'`apartment.js:17-300` (déplacement pur) | three |
| `src/campaign/etapes.js` | étape de M5, transitions de sauvegarde | oui |
- Démarrage : `startBar({ renderer, camera, audio, root, onDone, options })` → `{ scene, update(dt), stop(), debug }`. Options de développement : `cam`, `t`, `soupcon`, `infos`, `stats`.
- **Retouches de l'existant** (chacune testée, sans changer l'enquête) : `fpsController` gagne `balancement` (coupé en effets atténués) et `setMoveLocked(v)` ; `interact` gagne `cle` (défaut `'clueId'`).
- **Réglé en B8** [V, 24 novembre 2026] : `src/prologue/fpsController.js` et `src/prologue/interact.js`, tenus par `tests/prologue/fpsController.test.js` et `tests/prologue/interact.test.js` (ceux de l'enquête inchangés). Ce que B11 garde :
  - `createFpsController({ …, balancement })` : `false` garde l'œil à sa hauteur, au bit près, en marchant ; `true` par défaut, le balancement de l'enquête. B11 passe `!effectsReduced()`, lu au montage (la pause du bar n'a pas de réglages) ;
  - `setMoveLocked(v)` (assis, §3.7) : la souris tourne la vue, les touches de déplacement ne s'enregistrent plus et celles qui étaient tenues sont relâchées (se relever ne fait pas repartir Viktor sans nouvel appui), aucun balancement sur place (test fait après un quart de foulée : à l'arrêt, le terme du balancement est nul quelle que soit son amplitude ; relecture de B8). Indépendant de `setFrozen` : un dialogue ouvert assis (L1 au premier siège pris) gèle tout, et Viktor est encore assis quand il se termine ; B11 rend les deux séparément ;
  - `onMoveKey(action)`, option ajoutée par B8 (le plan ne disait pas comment « une touche de déplacement relève Viktor ») : assis et non figé, le premier appui d'une touche de déplacement (celles de `settings.pvpKeys`, relues à chaque appui, ou une flèche) appelle `onMoveKey('f' | 'b' | 'l' | 'r')`, jamais sa répétition (`e.repeat`, la touche gardée enfoncée en s'asseyant). B11 y relève Viktor sans recopier la table des touches. L'appui qui relève ne fait pas marcher : il faut tenir la touche (sa répétition, une fois debout, s'enregistre) ou la presser de nouveau ;
  - `setSpeed(v)` : vitesse de marche dès l'image suivante, un nombre fini positif ou nul, sinon `RangeError` (B11 l'attrape comme toute erreur : `erreur`) ; la valeur vient de `reglages.js` ;
  - `createInteract({ …, cle })` : l'identifiant et la surbrillance lisent `userData[cle]` (`'barId'` au bar). Choix de B8 en plus : un `SkinnedMesh` parmi les cibles ou les obstacles lève une erreur à la création, la règle du §3.2 (« jamais de peau animée dans un rayon ») tenue là où le rayon part ; B10 garde son test des capsules ;
  - vérifié : le contrôleur et la visée de 1676f98 et les nouveaux, avec les options de l'enquête et les mêmes entrées, donnent les mêmes poses de caméra au bit près sur 20 000 images et les mêmes cibles sur 6 000 regards ; captures de `?enquete=1` à temps figé identiques à l'octet avant et après, mais seule la vue du salon (`cam=…`, scène dessinée après `setPose` et `update(0)`) dit quelque chose du contrôleur : celle du départ ne montre que la carte (« 14 MARS · 21:47 », DOM sur fond noir). Toute comparaison à l'octet de l'enquête à venir (B16, qui rend `runSequence` commun à l'enquête et au bar) prend sa vue de départ après `begin()`, à la pose de départ, jamais sur la carte (relecture de B8) ; l'enquête jouée dans Chrome (marche, balancement de 2,5 cm, regard, visée). Pour la vérification de B11 : sous Chrome sans interface, un clic envoyé par `Input.dispatchMouseEvent` ou un vrai `requestPointerLock` arrête `requestAnimationFrame` (mesuré : 0 image par seconde ensuite), et SwiftShader rend l'appartement ouvert à moins d'une image par seconde ; la passe jouée a donc pris la carte graphique (`--use-angle=d3d11 --enable-gpu`, comme `memtest --gpu`), un clic et des touches en événements DOM et un verrou du pointeur simulé ;
  - taille (relecture de B8) : le morceau de l'enquête passe de 104 875 octets (B0) à 105 306 (B8, soit 431 octets pour ses retouches ; aucune autre tâche n'a touché ce qu'il contient), haut de la bande de 93 à 107 kB de B0 (marge : 1 694 octets). Le bar n'entre dans le build qu'au câblage : `dev/bar.html` est hors build, et seul `main.js` (B16) l'importera. Dès lors, Vite peut sortir `fpsController.js` et `interact.js`, importés par l'enquête et par le bar, dans un morceau commun : B16 et l'intégrateur relèvent au rapport la taille du morceau de l'enquête et celle d'un éventuel morceau commun.
- **Réglé en B11** [V, 25 novembre 2026] : `src/bar/index.js` (`startBar`) et `src/bar/bar.css`, valeurs `COQUILLE` de `src/bar/reglages.js`, tenus par `tests/bar/index.test.js` (faux renderer, verrou et minuteurs simulés de l'enquête ; les patrons y sont le faux casting de `tests/bar/fauxCasting.js`, sans GLB, les vrais restant tenus par `tests/bar/patrons.test.js`) ; page `dev/bar.html?jouer=1` (`dev/bar-jouer.js`, hors build). Ce que B12, B16 et B19 gardent :
  - le contrat : `onDone` une seule fois, jamais pendant l'appel (une erreur au montage le rend au microtâche suivant), avec `{ resultat, renseignements, couverture }` du §3.11 ; `passe` (PARTIR SANS ENTRER, décision 8) rend les sept renseignements à faux et une couverture nulle, même avec l'option `infos` ; `erreur` (montage ou image) rend ce qui est appris, la couverture et `error`. `abandon` : MENU PRINCIPAL de la pause. Options de développement : `cam` (pose de départ, sans carte ni pause, comme l'enquête ; elle n'est pas refixée à chaque image), `t`, `soupcon`, `infos`, `stats`, et `verre` en plus (`'demi'` ou `'cafe'` : déjà servi, pour placer un parcours sans L1). `debug` : `etat()` (le `__bar()` du §7 : mode, horloge, S, plancher, palier, renseignements, I par foyer, `f_p` par personne, sous-titre, pensée, réaction, dialogue), `aller`, `asseoir`, `avancer(s, pas)` (pas fixes), `soupcon(v)`, `journal` (ce qui s'est passé, au temps de la soirée) ; `dev/bar-jouer.js` les pose sur `window` (`__bar`, `__barAller`, `__barAvance`, `__barSoupcon`, `__barJournal`, `__barAsseoir`) ;
  - aucun minuteur : en pause, la boucle appelle toujours `update`, et seuls le son (le temps réel borné à 0,05 s, §3.12), l'invite « CLIQUE ENCORE POUR REPRENDRE » (0,6 s réelles après REPRENDRE sans verrou, `COQUILLE.repriseS`) et le noir de fin (0,7 s réelles, `COQUILLE.noirFinS`) comptent ce temps ; horloge, frappe, bips, minuterie et jauge sont figés (test, témoin : la pensée frappée par `setTimeout`). Une image, dans l'ordre : le pas de Viktor, la soirée, le dialogue, l'écoute, les pensées et réactions, les déclencheurs, les gens de la salle, les têtes, puis les regards, la jauge et ses remarques (l'ordre de B3), la salle, les voix et le son, la visée et le maintien de E ;
  - **pendant un dialogue de Viktor, il n'écoute aucune table** : I = 0 pour toute réplique épiée, dont les mots se masquent et dont le renseignement ne s'apprend pas. Le §3.4 interdit le sous-titre d'une autre table pendant un dialogue ; apprendre sans rien lire romprait « ce que le joueur lit est exactement ce qu'il sait ». Les pensées de Viktor et ce qu'on lui dit (réactions, regards) ont chacune leur ligne, au-dessus du sous-titre d'écoute, qu'elles ne cachent jamais. C'est une décision de jeu, à valider par Rayan en jouant : décision 14 du §13 (ouverte, relecture de B11), l'option en place s'applique ;
  - tranché (B6, « à trancher en B11 ») : **l'escorte partie** (la porte refermée sur R3), passer la porte en SOUPÇON est une sortie comme une autre, personne ne suit Viktor (`seance.sortir`, test, témoin : Sorel le suit encore) ; démasqué par la jauge après le départ (la zone interdite sous les yeux de Fernand), le bar échoue toujours, mais personne ne dit « Toi. Debout. » (B12 garde le tampon) ;
  - **« Fernand voit toujours le zinc »** vaut pour toute la zone interdite, arrière-cuisine comprise : Fernand y est témoin quoi que dise son cône (test, témoin : l'arrière-cuisine, qu'aucun cône ne voit). « Surpris en zone interdite » (+25, plancher +10) tombe à chaque entrée vue ;
  - les −2/s de la table d'Albert (§3.14 : « si Viktor lui parle […] (−2/s tant qu'il est assis à sa table) ») valent une fois que Viktor a parlé à Albert (E sur lui, sa réplique), tant qu'il est assis sur la chaise ouest de D, la seule libre de sa table (relecture de B11 : les −2/s dès qu'il s'y asseyait faisaient de la meilleure place d'écoute un abri gratuit, 7/s avec un verre ; test, témoin : les −2/s sans lui avoir parlé), et « Je vous ai à l'œil » multiplie la baisse par 0,5 jusqu'à la fin : `update(dt, { baisseEnPlus, facteurBaisse })` de `src/bar/soupcon.js` (ajoutée, test, témoin : réglages ignorés), `COUVERTURE.albertBaisse` et `SOUPCON.surveilleBaisse` ;
  - les déclencheurs : D1 au premier passage au comptoir (zone `comptoir`), ouvert dès que Fernand ne parle plus dans un échange ; F3 (`fernand-photo`, ouvert par F2.1 et F2.2) sur la photo regardée ou 20 s cumulées au comptoir ; L1 au premier siège pris sans verre, ou après 45 s de jeu sans verre, et retiré de l'attente si un verre est servi entre-temps (relecture de B11 : les 45 s tombées pendant D1, Lise venait prendre une commande déjà servie par Fernand ; test, témoin) ; 60 s sans verre : `sansCommande` (+10) et la réplique de Lise, une fois ; L2 à la première remarque d'un homme de l'escorte ; les 90 s près des tables A et B tant que l'escorte est là. Un dialogue attend que son interlocuteur soit libre, présent et pas muet, et ceux qui attendent s'ouvrent dans l'ordre : L1 qui attend Lise occupée retient D1 au zinc jusqu'à ce qu'elle soit libre (constat de la relecture de B11, à juger en jouant, B19) ; D2 s'ouvre quand la soirée le dit (ou sur « Restez assis. ») ; E sur Fernand ou Lise rappelle D1, F3 ou L1 s'ils restent à jouer, sur Albert sa réplique, une fois. Albert murmure toutes les 20 à 35 s (tiré à graine), écouté comme un échange à son foyer ; le premier murmure aussi est tiré, jamais à l'entrée avec « Bonsoir. » et la pensée d'entrée (relecture de B11 ; test, témoin : le compteur à 0 au montage) ;
  - les gens de la salle quand la soirée le dit (chorégraphie : se lever, aller par `itineraire`, s'asseoir, sortir) : Sorel entre et va au zinc ; à l'appel, Fernand va au combiné, Sorel le prend à « Lieutenant. Pour vous. », Fernand retourne à son zinc, Sorel aussi à la fin ; Lise part servir la table A 7 s avant A4 et revient ; Sorel (D2), Lise (L1, L2) et Dussart (SOUPÇON sans Sorel, Lenoir : « Sergent… ») s'arrêtent à 1,4 m de Viktor (`COQUILLE.approcheM`, hors de « trop près »), Dussart regagne la banquette sous SOUPÇON ; au départ, l'escorte se lève et va à la porte, puis n'est plus là quand elle se referme. Les têtes : qui a remarqué Viktor (ses 10 s d'alerte), l'interlocuteur et, en MÉFIANCE, un homme de l'escorte toutes les 8 à 12 s (1,5 s) le suivent ; les autres gens d'un échange regardent qui parle ; qui parle hoche la tête. Personne ne bute sur personne (les boîtes des gens attablés ne comptent que pour Viktor) : à juger sur captures (B19) ;
  - les poses de Viktor : E sur un siège libre l'assoit (l'œil à la hauteur du siège, tourné vers sa table, `setMoveLocked`), E ou une touche de déplacement le relève sur place (test, témoin : `onMoveKey` non branché) ; E sur le mange-debout est l'accoude, debout, avec le prétexte des fléchettes ; la file des toilettes est un prétexte de 240 à 300 s à 0,8 m de sa place ; le juke-box (E maintenu 1 s) en est un 30 s tant que Viktor reste devant, sans effet aujourd'hui puisqu'il n'est dans aucune zone privée. Le verre servi est tenu en vue (deux maillages, le liquide de la couleur du demi ou du café) ;
  - Espace et le clic droit frappent d'un coup une pensée ou une réaction, jamais une réplique épiée : son renseignement ne s'apprend qu'à la fin de sa frappe (test, témoin : `toutAfficher` branché sur toutes les répliques) ; en dialogue, ils vont au dialogue (`touche`, `toutAfficher`), comme les chiffres, les flèches, la molette, E, Entrée et le clic gauche ;
  - démasqué : « Toi. Debout. » (Sorel entré, Dussart avant), puis directement le noir de fin ; la séquence de 2,5 s au temps de jeu (têtes, tables qui se lèvent, COUVERTURE GRILLÉE) est celle de B12, comme le bilan et le téléphone. En B11, `finir` suit aussitôt `dire`, et l'interface ne se redessine plus une fois la fin commencée : « Toi. Debout. » n'est que dans le journal, jamais à l'écran. B12 garde donc un test : la réplique de démasqué est visible pendant la séquence (relecture de B11). L'interface de B11 n'est que ce qui rend la soirée jouable (carte, pause, noir, lignes, panneau de dialogue, invite et son trait de maintien, carnet en texte, heure), chaque texte posé sur la 3D sur sa plaque noire à 0,7 ;
  - base design (audit du 24 novembre 2026) : les boutons de la carte et de la pause, PARTIR SANS ENTRER compris, ont 44 px de haut au moins et un texte à 4,5:1 au moins (BAR-1 ; test sur `bar.css`, témoin : les règles `.skip` et `.enq-pause button` de l'enquête, et mesure dans Chrome ci-dessous) ; `text-wrap: balance` sur le texte et la consigne de la carte, jamais sur une ligne tapée (BAR-7 ; test) ; les deux animations répétées de `bar.css` (CLIQUER POUR COMMENCER, l'invite de REPRENDRE) ont leur jumelle `.bar-reduced` (BAR-6, dont le test est à B12) ;
  - décision 12 du §13 (ouverte) : l'option en place (A) s'applique, comme le dit le §13 ; rien n'est caché derrière la tête d'une autre personne ;
  - mesuré (Chrome sans interface, carte graphique, 1280 × 720, `dev/bar.html?jouer=1&manuel=1`, machine chargée par les autres chantiers) : une partie jouée par un agent (verrou du pointeur simulé, clic et touches en événements DOM, pas fixes de `__barAvance`, déplacements par `__barAller`) : D1 (un demi, la couverture du routier), la chaise ouest de D (A1 : TRAJET à 74,8 s), le mange-debout est (B1 : le leurre puis VÉHICULE), la chaise ouest de D (A4 : HEURE ; A2a : PLACE), l'appel écouté à 2,1 m du combiné, D2 (S1.2, S2.1, S3.1, S4.1, « Bonne route. »), le départ, puis la sortie automatique à 427,2 s : « sorti », les quatre renseignements et le leurre, S jamais à 30 (au plus 25,3 : deux fois les 90 s près des tables ; partie jouée avant la relecture de B11, sans parler à Albert, quand la chaise ouest de D comptait encore les −2/s : à rejouer en B19), aucune erreur en console (journal `shots/bar/b11/journal-jouer-moyen-complet.json`). Une première partie, l'appel écouté dans la file des toilettes, à 1 m du combiné, a fini démasquée : Sorel au téléphone à moins de 1,3 m de Viktor, vu de la salle, la jauge de 10 à 100 pendant l'appel ; c'est le prix de PLACE par l'appel annoncé au §3.1 (« Réglé en B2 »), à juger en jouant (B19). Les quatre boutons (PARTIR SANS ENTRER, REPRENDRE, SORTIR DU BAR, MENU PRINCIPAL) font 44 px de haut (`getBoundingClientRect`). Mémoire (`?jouer=1&memtest=10`, Moyen et Bas) : 45 géométries et 56 textures pendant chaque partie (celles de B10 et les deux du verre tenu), 13 et 11 après chaque arrêt (les modèles partagés et la table DFG, comme en B10), Δ = 0 d'une partie à l'autre. Montage de la partie : 407 ms la première fois (les dessous des modèles mesurés une fois par session), puis de 171 à 231 ms, sous les 0,5 s du §8. À la relecture (`memtest=4` en Moyen, la suite complète tournant en même temps) : 524,6 ms la première fois, puis 272, 259 et 232 ms. Le premier montage frôle donc le budget, et le dépasse sur une machine chargée : B16 ou B19 le remesurent sur une machine au repos ; s'il reste près de 0,5 s, la mesure des dessous des modèles (`mesureAssise` de `src/bar/patrons.js`) se fait au préchargement (`preloadCharacters`), plus au premier montage. Vue de départ : 65 appels et 293 898 triangles en Moyen et en Bas, ceux de B10 (le verre tenu en ajoute deux) ; logique de la coquille, patrons compris : 0,43 à 0,46 ms par image (1 200 images de soirée à la chaise ouest de D). Captures `shots/bar/b11/` (hors dépôt).
- **Réglé en B12** [V, 25 novembre 2026] : l'interface du bar, dans `src/bar/index.js` et `src/bar/bar.css`, valeurs `INTERFACE` de `src/bar/reglages.js` ; deux sons ponctuels de plus dans `src/bar/son.js`, `tic()` (le `clock()` du kit, `SON.tic`) et `vibre()` (une salve du téléphone de l'enquête, `SON.vibration`) ; tenus par `tests/bar/index.test.js` et `tests/bar/son.test.js`. Ce que B16 et B19 gardent :
  - **la jauge**, en haut au centre : l'œil, un SVG au trait à deux états, de l'épaisseur de l'anneau (BAR-5), ouvert quand un témoin dont le poids compte voit Viktor (le `vu` de la jauge : Albert ne l'ouvre pas, Fernand en zone interdite oui) ; la barre graduée à 30 et 60 ; le plancher hachuré par-dessus le niveau ; le palier sur sa pastille, texte sombre sur clair, ambre ou rouge (4,8:1 au moins). En SOUPÇON, la barre et la vignette rouge battent au rythme du cœur (`--bat`, de 1,1 s à S = 60 jusqu'à 0,6 s à 100, `SON.coeur`) ; en effets atténués, rien ne bat, la vignette est fixe à 0,6 de son éclat ;
  - **l'anneau de fixation** autour du point de visée (dessin de `.enq-ring`) : la fixation la plus avancée de la salle rapportée à la tolérance de la personne (`--p`), du ton du texte, rouge au-delà, jamais ambre (BAR-3 : ce n'est pas une action) ; il se vide avec `f_p` quand on détourne les yeux ;
  - **les arcs** : 2,5 s de jeu après la remarque d'un homme de l'escorte, au bord gauche ou droit tant qu'il est hors du champ horizontal de la caméra. Ils sont ambrés, comme le dit le §3.6, bien que l'audit BAR-3 réserve l'ambre à ce que le joueur peut faire : la spec prime, l'ambre y est celui du code de la jauge (MÉFIANCE) ;
  - **qui parle** : le rôle, puis le nom dès qu'il s'est lu à l'écran (sous-titre d'écoute affiché, ligne de réaction, réplique de dialogue) ; un nom masqué n'est pas lu. « Je te ressers, Dussart ? » (A4) fait de LE SERGENT « DUSSART » ; Lise, Albert et le colonel ne sont jamais nommés. Une flèche ‹ ou › quand la source (le foyer de l'échange, la tête de qui réagit) sort du champ horizontal : assis à la chaise ouest de D, tourné vers sa table, la table A est hors champ, et la flèche le dit ;
  - **le panneau de dialogue** : les choix ne sont recréés que quand ils changent (fondu de 150 ms, sans glisser, sans cadre ni fond chacun), la surbrillance (un filet ambré) suit la touche sans transition, les libellés restent « 1 » à « 3 » quelle que soit la carte du clavier (`libelleChoix`) ; la minuterie, du ton du texte, passe au rouge sur ses 3 dernières secondes (BAR-3) ; `son.tic()` aux tics de `dialogue.js` (1,5, 1 et 0,5 s) ; la vue pivote vers l'interlocuteur (constante de temps 0,35 s), jamais en effets atténués (§9). Constat à juger en jouant (B19) : D2 s'ouvre quand la soirée le dit, Sorel encore au zinc ; « On ne se connaît pas. » se dit pendant qu'il traverse la salle, et la vue le suit (capture `dialogue-sorel`) ;
  - **le carnet** : le compte « n / 4 » et, 2,5 s de jeu sur la ligne apprise, le tampon NOTÉ (le texte sombre sur l'encre rouge pleine, lisible sur n'importe quelle salle), frappés en 250 ms (la frappe `k-frappe` de l'audit CIN-7, ramenée à 250 ms par BAR-4 ; fondu de 150 ms en effets atténués). Sa plaque passe à 0,82 : à 0,7, le gris des lignes à apprendre (#9aa094) tombait à 3,2:1 devant un mur blanc ;
  - **l'heure** : « LE BIVOUAC · 18:36 », en chiffres tabulaires, et un point rouge dessiné (pas un glyphe) qui s'éteint et se rallume toutes les 0,6 s de jeu (figé en pause), fixe en effets atténués ; **l'invite** : la touche en ambre, et autour d'elle l'anneau de maintien (sortir, une pièce), qui remplace le trait de B11 ; le verbe la précède, comme dans l'enquête : « MAINTENIR E : SORTIR · RENSEIGNEMENTS 1 / 4 » (relecture de B12 : la touche passait d'abord, « E MAINTENIR : … ») ; **en pause**, la classe `en-pause` de la racine arrête là où ils sont les battements CSS de la soirée (la vignette, la barre en SOUPÇON, l'anneau rouge, les arcs), comme le cœur sonore ; le panneau de pause garde les siens (relecture de B12) ;
  - **BAR-2** : tout texte posé sur la 3D a sa plaque noire, et le test mesure chaque couleur sur sa plaque posée sur du blanc (témoin : `.enq-time`, gris à 0,55 sans plaque) ; le tampon du démasqué est posé sur le noir de fin, la fiche du bilan est sa propre plaque (0,97). **BAR-6** : un test lit `bar.css` et exige une jumelle `.bar-reduced` qui arrête chaque animation infinie (témoin : `enq-pulse` recopiée sans jumelle) ; le téléphone ne vibre pas et l'écran ne tremble pas en effets atténués (le son reste). **BAR-7** : `text-wrap: balance` sur les lignes du bilan, l'aide et l'invite, jamais sur une ligne tapée ;
  - **démasqué** (§3.10) : « Toi. Debout. » coupe ce qui se disait (« Sergent… », sinon lu après le noir) et se lit tout de suite ; qui la dit se lève, toutes les têtes se tournent vers Viktor, la vue pivote vers lui (hors effets atténués), la salle se tait (le son, au palier DÉMASQUÉ, B7), les deux tables de l'escorte se lèvent à 0,4 s, le noir tombe à 1,3 s, COUVERTURE GRILLÉE est frappé à 1,8 s avec une secousse de 0,25 s (fondu simple en effets atténués), `onDone` à 2,5 s (test, témoin : un `setTimeout`, que la boucle ne fait pas avancer). Sorti par la porte en SOUPÇON, « Hé. Vous. Attendez. » tient lieu de réplique : personne ne dit « Toi. Debout. » à un homme debout sur le seuil (écart à la lettre du §3.10). La fin ne se met pas en pause (la pause refuse déjà de s'ouvrir une fois la fin commencée, B11) : ses durées comptent le pas de la boucle, borné à 0,1 s, ce qui est ici le temps de jeu ;
  - **le bilan** (§3.11), pour `sorti` et `passe` : le noir, puis à 0,7 s la fiche « DOSSIER 05 » et une ligne toutes les 0,3 s (apprise : la valeur et NOTÉ à l'encre rouge ; manquée : INCONNU en gris), à 2,1 s le téléphone ANTON et deux salves de vibration (0,28 s, puis 0,42 s de silence, celles de l'enquête ; `son.vibre()`), « Alors ? » tapé à 3,1 s, la réponse de Viktor (« J'ai tout. », « Il faudra faire avec. », « Presque rien. », de `bilan()` de `textes.js`) tapée et bipée à 3,9 s, `onDone` à 5,8 s. La salle reste derrière la porte : le son en mode pause (la musique 10 dB plus bas, plus une syllabe). **`onSortie(contrat)`**, nouveau et facultatif, est appelé une fois au début du bilan avec le contrat que rendra `onDone` : B16 y fait la sauvegarde que le §6 veut « avant le bilan ». Écart au §2, qui y mène aussi `erreur` : une coquille qui vient de lever ne joue plus rien, elle se démonte et rend son contrat aussitôt (B11), sans bilan ; `abandon` (MENU PRINCIPAL) n'en a pas non plus. Une image qui lève pendant une fin déjà décidée (la scène du démasqué, le bilan) ne change pas son sens : `onDone` rend, une fois et aussitôt, le résultat de cette fin (`demasque`, ou le contrat qu'`onSortie` a reçu) avec `error`, jamais `erreur`, qui mènerait au convoi une partie perdue (relecture de B12, deux tests, témoins : `erreur` dans les deux cas) ;
  - mesuré (Chrome sans interface, carte graphique, `dev/bar.html?jouer=1&manuel=1`, pas fixes de `__barAvance`) : captures en 1920 × 1080 et 1280 × 720, Moyen et Bas, de l'écoute masquée (debout à 3,4 m de la table A, « La nationale a des yeux. Sur la … »), de la MÉFIANCE, du SOUPÇON (Dussart qui vient, « Sergent… »), du dialogue avec Sorel, du démasqué (la scène, puis le tampon) et du bilan, aucune erreur en console (`shots/bar/b12/`, hors dépôt) ; aucun sous-titre n'y passe à la ligne, et la ponctuation reste rattachée à son mot (B5). Mémoire (`?jouer=1&memtest=10`, Moyen et Bas) : 45 géométries et 56 textures pendant chaque partie, 13 et 11 après chaque arrêt, Δ = 0 d'une partie à l'autre, ceux de B11 : l'interface ne crée rien dans le renderer, et ses sons (`tic`, `vibre`) se débranchent sur l'horloge audio (test). Montage : 501 ms la première fois en Moyen (machine chargée par les autres chantiers), puis de 165 à 337 ms.

### 3.14 Textes du socle (données de `src/bar/textes.js`) [D, écriture du lecteur 2 reprise]
Les mots **[entre crochets]** sont les mots-clés (fragilité 0,8). Un échange se joue au temps de jeu, une réplique à la fois (`350 + 62 × longueur` ms, `src/briefing/kit.js:10`, frappe en 0,8 × cette durée).

**A1 · La route** (table A, 63 s ; TRAJET ; « le col » est une fausse piste jamais notée)
> LENOIR : On passe par le col, non ? C'est plus court.
> DUSSART : Le col, c'est fini. Trop de monde.
> LENOIR : La nationale, alors.
> DUSSART : La nationale a des yeux. Sur la [vieille route], il n'y a personne.
> LENOIR : Avec l'épingle du calvaire ? On va se traîner.
> DUSSART : On se traîne treize secondes. Après, c'est tout droit jusqu'à la frontière.

**B1 · La casquette** (table B, 95 s ; VÉHICULE et leurre)
> HAAS : Il veut que je mette sa casquette. Sa vieille casquette d'officier.
> MATTEI : Belote.
> HAAS : Pourquoi moi, Mattei ?
> MATTEI : Tu as sa carrure. Celui qui vise la [casquette], c'est toi qu'il vise.
> HAAS : Et lui ?
> MATTEI : Lui, il est dans la [deuxième]. Rebelote.

**A4 · Le café** (table A, 126 s ; HEURE)
> LISE : Je te ressers, Dussart ?
> DUSSART : Non. On roule à [sept heures et quart].
> LISE : Vous rentrez quand ?
> DUSSART : On ne rentre pas.

**A2a · Devant** (table A, 147 s ; PLACE)
> LENOIR : Il monte derrière, le vieux ? Comme un général ?
> DUSSART : Jamais. Derrière, il a mal au cœur.
> DUSSART : Il monte [devant]. [À droite]. Il veut voir la route.

**Entrée de Sorel** (210 s) : clochette, les tables se taisent 3 s.
> SOREL : Un café, Fernand.
> FERNAND : Lieutenant.

**L'APPEL** (zinc, 273 s ; le téléphone sonne trois fois ; Sorel s'entend comme une voix normale, LE COLONEL en timbre `phone` à voix 0,35)
> FERNAND : Bivouac. … Oui, mon colonel. Il est là. *(il tend le combiné)* Lieutenant. Pour vous.
> SOREL : Sorel. … Oui, mon colonel.
> LE COLONEL : Prenez la [vieille route]. Personne ne nous attendra.
> SOREL : La [vieille route]. Compris.
> LE COLONEL : Départ à [sept heures et quart].
> SOREL : [Sept heures et quart], devant la caserne.
> LE COLONEL : Je monte [devant], comme toujours. Et que Haas mette la casquette.
> SOREL : Haas la mettra. Bien, mon colonel.
- TRAJET et HEURE s'apprennent sur les répliques de Sorel (portée normale) ou du colonel ; PLACE seulement sur celle du colonel (à 1 m du combiné). Entendre au moins une réplique du colonel en entier pose `appel`.

**R1 et R2 · Relances** (357 s)
> LENOIR : Devant, tu disais ?
> DUSSART : [Devant]. [À droite]. Tu es sourd ?

> HAAS : Je la mets quand, la casquette ?
> MATTEI : Dans la troisième. Pas avant. Lui sera dans la [deuxième].

**R3 · Départ** (389 s ; HEURE)
> SOREL : On y va. *(à la porte)* [Sept heures et quart] devant la caserne. Pas une minute de plus.
> MATTEI : Mets ça sur l'ardoise, Fernand.
> FERNAND : L'ardoise est pleine.
> SOREL : Le colonel réglera. *(la porte se referme)*
> FERNAND *(bas)* : Le colonel ne règle jamais rien.

**Fin** (420 s) : ALBERT : Le 7 a gagné. / VIKTOR : Il faut y aller.

**Albert, à tout moment** : « Allez, le 7. Allez… » ; « Regardez-moi cette carne. » ; si Viktor lui parle : « Le 7. Il ne gagne jamais. C'est pour ça que je le joue. » (−2/s tant qu'il est assis à sa table).

**Objets (E)** : la photo, « Vingt-quatre. Pas de colonel. » ; l'entrée, « Le fusil est resté sur la moto. Ici, je ne suis personne. » ; bonus : le journal (« TROIS OFFICIERS ABATTUS À LA BASE · LE TIREUR AURAIT TIRÉ À PLUS DE 400 MÈTRES », Viktor : « Ils parlent de moi. ») et la fenêtre (« Le château d'eau. J'étais là-haut. »).

**D1 · Fernand** (au premier passage au zinc)
| Étape | Fernand | Choix de Viktor | Réponse | Effet |
|---|---|---|---|---|
| F1 | Qu'est-ce que je vous sers ? | 1 « Un demi. » | Un demi. | −5, verre |
| | | 2 « Un café. » | Un café. | 0, verre |
| | | 3 « Ce qu'ils boivent, eux. » | Eux, ils boivent à l'œil. Vous, vous payez. | +10, verre |
| F2 | Vous n'êtes pas d'ici. | 1 « Je livre à la cimenterie. Je repars ce soir. » | Vous avez une tête à rouler la nuit. | 0, couverture ROUTIER |
| | | 2 « Je cherche du travail. » | Ici, il n'y a que l'armée. Et l'armée n'embauche plus. | 0 |
| | | 3 « Je cherche quelqu'un. » | Ici, on ne cherche personne. | +15, fin |
| F3 (photo regardée, ou 20 s au zinc) | Vingt-quatre. Chaque année, ils posent devant chez moi. | 1 « Il manque le colonel. » | Il ne pose jamais. Je l'ai connu quand il avait encore un visage. | 0, fin |
| | | 2 « Vous les connaissez tous ? » | Le deuxième en partant de la gauche. Julien. Mon fils. Muté l'hiver dernier, avec onze autres. Personne n'écrit. | 0, vers F4 |
| | | 3 « Belle brochette. » | Hm. | 0, fin |
| F4 | Vous aussi, vous avez perdu quelqu'un. Ça se voit. | 1 « Deux. » | *(un temps)* … Ils ont rendez-vous à sept heures et quart devant la caserne. Je n'ai rien dit. | −15, **HEURE**, **allié** |
| | | 2 « Non. » | Alors je me trompe. | 0, fin |
| | | 3 « Les mêmes que votre fils. » | *(il regarde la porte)* Finissez votre verre. Et partez. | +25, fin, Fernand ne parle plus |
- « Deux. » parle de la femme et de la fille de Viktor, sans les nommer ni les montrer : Viktor ment aux soldats et dit la vérité au père.

**D2 · Sorel s'approche** (315 s, ou dès SOUPÇON après 210 s ; minuterie 6 s ; silence : +10 et « Vous réfléchissez beaucoup. », la question revient une fois)
- Fernand allié : « Il est avec moi, lieutenant. » Sorel : « Bien. » Fin, −10.

| Étape | Sorel | Choix | Réponse | Effet |
|---|---|---|---|---|
| S1 | On ne se connaît pas. | 1 « Non. » | C'est ce que je disais. | 0 |
| | | 2 « Je suis de passage. » | Tout le monde est de passage, ici. | −5 |
| | | 3 « Viktor. » *(il tend la main)* | *(sans la prendre)* Je n'ai pas demandé votre nom. | +20 |
| S2 | Vous avez servi. Ça se voit à la façon dont vous vous tenez. | 1 « Comme tout le monde. » | Pas tout le monde. | 0 |
| | | 2 « Jamais. » | Vous mentez mal. | +20 |
| | | 3 « Tireur d'élite. Douze ans. » | *(un silence)* Debout. | **DÉMASQUÉ** |
| S3 | Vous allez où, ce soir ? | 1 (couverture ROUTIER) « Je repars. De l'autre côté de la frontière. » | Par où ? | vers S4 |
| | | 1 (sans couverture) « Nulle part. Je finis mon verre. » | Finissez-le vite. | +5, sortie |
| | | 2 « Ça dépend de vous. » | Qu'est-ce que ça veut dire ? | +30, sortie |
| S4 | Par où ? | 1 « La nationale. » | Bien. Pas la vieille route : ce soir, elle est à nous. | −10, **TRAJET** |
| | | 2 « La vieille route. C'est plus court. » | Plus court pour qui ? | +30 |
| | | 3 « Je ne sais pas encore. » | Prenez la nationale. | 0 |
| Sortie | | | sous 60 : « Bonne route. » ; à 60 ou plus : « Je vous ai à l'œil. » (la baisse est divisée par deux jusqu'à la fin) | |
- La réponse S4.1 donne TRAJET par la bouche de Sorel lui-même : c'est la seule source qui ne s'épie pas.

**D3 · Lise** (tutoriel)
- L1, au premier siège pris ou après 45 s sans rien commander : « Tu prends quoi ? » ; 1 « Un demi. » → « Ça marche. » (−5, verre) ; 2 « Un café. » → « Serré ? » (0, verre) ; 3 « Rien. J'attends quelqu'un. » → « Ici, on attend en consommant. » (+10).
- L2, la première fois que Viktor fixe un soldat au-delà de la tolérance : Lise, bas, en passant : « Arrête de les regarder comme ça. Ils n'aiment pas. » ; 1 « Merci. » → « De rien. » (−5) ; 2 « Je ne regardais personne. » → « Alors continue. » (0) ; 3 « Qui sont-ils ? » → « Des gens qu'on ne regarde pas. » (+5). Puis l'aide : « Ne fixe personne plus de deux secondes. »

**Bonus** (même format, après le socle)
- **A3 · Ceux de l'hiver** (21 s) : LENOIR « Tu as des nouvelles de ceux de l'hiver ? Julien, Brunet ? » / DUSSART « Mutés. » / LENOIR « Mutés où ? Personne n'écrit. » / DUSSART « Bois ta bière, Lenoir. » *(Fernand s'arrête d'essuyer son verre.)*
- **B3 · La base** (42 s) : MATTEI « Trois officiers, en plein midi. Personne n'a rien vu. » / HAAS « Un seul tireur ? » / MATTEI « Un seul. À plus de quatre cents mètres. » / HAAS « C'est pour ça que le vieux ne parle plus à la radio. » / VIKTOR « Ils parlent de moi. » (suppose M4 à 430 m, confirmé par Rayan le 28 octobre)
- **B2 · La serviette** (168 s) : HAAS « Et sa serviette ? Il ne la lâche jamais. » / MATTEI « Ses registres. Des noms. Il dort avec. » / HAAS « Quels noms ? » / MATTEI « Ceux qu'on ne revoit pas. Joue. »
- **C2 · Julien** (zinc, 189 s, à voix basse 0,7) : LISE « Tu n'as rien dit à Dussart, pour Julien. » / FERNAND « Il n'en sait pas plus que moi. » / LISE « Il conduit le colonel. » / FERNAND « Justement. »
- **A2b · La deuxième** (231 s ; VÉHICULE sans le leurre) : LENOIR « Et moi, je suis où, ce soir ? » / DUSSART « Dans la [deuxième], derrière lui. Tu regardes sa nuque et tu te tais. »
- **Ouvriers** (mange-debout de la porte) : « Encore une semaine à la cimenterie. » / « Et après ? » / « Après, encore une. »
- **Fléchettes** (prétexte, mange-debout est) : trois dans le mille, +15 et la réplique de Mattei (§3.6) ; le tireur d'élite doit manquer exprès.

**Réglé en B5** [V, 31 octobre 2026] : `src/bar/textes.js`, figé jusqu'au fond, tenu par `tests/bar/textes.test.js` et par les parcours de D1, D2 et D3 dans `tests/bar/dialogue.test.js`. Ce que le texte ci-dessus laissait ouvert :
- une didascalie au milieu d'une réplique la coupe en deux (L'APPEL : Fernand « … Il est là. », puis *(il tend le combiné)* « Lieutenant. Pour vous. » ; R3 : Sorel « On y va. », puis *(à la porte)* « Sept heures et quart devant la caserne… ») ; une réplique peut partir d'un autre foyer que son échange (R3 : « On y va. » et Fernand au zinc) ; C2 et le « (bas) » de Fernand sont à voix baissée (0,7) ;
- les sources du leurre : la [casquette] de Mattei en B1, et celle de Haas en R2 (« Je la mets quand, la casquette ? »), que le §3.3 compte sans en marquer le mot. La voix du colonel pose `appel` quand l'une de ses trois répliques s'affiche en entier (`drapeau`) ;
- la pensée de Viktor au véhicule (§3.3) se coupe en deux : « La deuxième voiture. » pour le véhicule, « La casquette, c'est pour un autre. » pour le leurre, puisque A2b apprend le véhicule sans la casquette. « Ils parlent de moi. » (B3) et « Il faut y aller. » (la fin) sont des pensées d'échange ; B11 ne montre la première que si Viktor a entendu B3 ;
- D1 se joue en deux arbres : « fernand » (F1, F2), puis « fernand-photo » (F3, F4), que F2.1 et F2.2 ouvrent (`ouvre`) et que B11 lance sur la photo regardée ou après 20 s au zinc ; F2.3 et les silences ferment D1. D3 aussi : « lise-commande » (L1) et « lise-regard » (L2, l'aide dans chaque issue, silence compris) ;
- un silence vaut +8 et finit le dialogue (comme l'exemple du §3.8) ; face à Sorel, +10, « Vous réfléchissez beaucoup. », la question une seconde fois, puis la suivante (S1 vers S2, S2 vers S3, S3 et S4 vers la sortie) ;
- « Ce qu'ils boivent, eux. » sert un demi ; S3.1 avec la couverture n'a pas de réponse à part, la question de S4 étant « Par où ? » ; la sortie de D2 se lit sur S au moment de la sortie, à 60 (`SOUPCON.paliers.soupcon.monte`) ;
- reste à B6 et B11 ce qui n'est pas du texte : les déclencheurs (D1 au premier passage au zinc, F3, L1, L2, D2), les 3 s de silence à l'entrée de Sorel, la sonnerie, les −2/s près d'Albert (une valeur à mettre dans `reglages.js`), et qui dit « Toi. Debout. » (Sorel, ou Dussart avant 18:30).

## 4. Briefings

### 4.1 Briefing I (maquette `briefing-m5.html` réécrite, scène régénérée)
- On garde : le scanner, le dossier (NOM, GRADE, CRIME « A VENDU SES HOMMES », PHOTO « AUCUNE DEPUIS 1998 »), la silhouette fantôme et sa casquette, la brigade de 24 dont 12 vendus.
- Le scanner tombe sur « AUCUN SIGNAL ». Source : « RADIO DE LA BRIGADE 14 · CANAL 3 · MUETTE ». Le champ PLACE se tape puis glitche en « INCONNUE ». Carte, fenêtre de tir, « ≈ 1,5 m DEVANT » et colline passent au briefing II. Les trois tirets cadratins visibles de la maquette (titre, source, tampon de 1998) disparaissent.
```
ANTON  : Silence. Depuis la base, ils ne parlent plus à la radio.
ANTON  : Le colonel Kessler. Il a vendu la moitié de sa brigade au réseau.
ANTON  : Pas une photo de lui depuis vingt ans.
ANTON  : Ce soir, il passe la frontière. Par où, à quelle heure, dans quelle voiture : ça, personne ne me le vend.
ANTON  : Ses hommes le savent. Mais ceux-là, on ne les approche pas.
VIKTOR : Où est-ce qu'ils boivent ?
ANTON  : Non. Je ne t'envoie pas là-dedans.
ANTON  : Toi, tu tires de loin. Là-bas, ils seraient à un mètre de toi.
ANTON  : Et si l'un d'eux te reconnaît, c'est jusqu'à moi qu'ils remontent.
VIKTOR : Une caserne n'a qu'un bar.
ANTON  : … Cette conversation n'a pas eu lieu.    (clic, voyant éteint, SIGNAL PERDU, carton « MISSION 05 / LE BIVOUAC »)
```
- Anton ne nomme jamais le bar. « Personne ne me le vend » garde intact le « pour la première fois… je n'ai rien » de M6 (`briefing-m6.html:349`) ; « jusqu'à moi qu'ils remontent » annonce « Ils sont remontés jusqu'à moi » (`:380`). Dernière image : la casquette de la silhouette.

### 4.2 Briefing II (maquette neuve `briefing-m5b.html`, scène `m5b`, params `trajet`, `vehicule`, `place`, `heure`, `leurre`, `appel`, `allie`)
```
(si appel) LE COLONEL [timbre phone, « TÉLÉPHONE DU BIVOUAC · 18:36 »] : Prenez la vieille route. Personne ne nous attendra.
ANTON : Tu es ressorti. Dis-moi ce que tu as.
```
| Info | Apprise (Viktor / Anton / image) | Manquée (Anton / image) |
|---|---|---|
| TRAJET | « La vieille route. » / « Alors l'épingle du calvaire. Ils y ralentissent. Treize secondes. » / route, virage, fenêtre de 13,5 s | « Sans la route, il n'y a qu'un endroit où ils passeront à coup sûr : la ligne droite avant la frontière. Ils y rouleront vite. » / dernier tronçon sous le second relief |
| VÉHICULE | « La deuxième. La casquette dans la troisième, c'est un leurre. » / « Il fait porter son visage à un autre. Malin. » / voiture 2 en avant, casquette tamponnée LEURRE · VÉHICULE 3 | « Trois voitures. Je ne sais pas laquelle. Méfie-toi de ce qu'on te montre. » / trois « ? » |
| PLACE | « Devant. Côté passager. » / « Il veut voir la route. Il la verra. » / siège surligné | « Devant, derrière… À toi de le trouver. » / siège « ? » |
| HEURE | « Départ sept heures et quart. » / « Au calvaire vers moins vingt. Le soleil dans ton dos. » | « Sans l'heure, il faudra les voir sortir de la caserne. Tu arriveras juste derrière eux. » |
```
(si allie) VIKTOR : Le patron m'a aidé. / ANTON : Un patron de bar qui parle. Ça ne se paie pas, ça.
ANTON : Ils roulent quand même vite. Vise devant la portière, pas dessus.     (« ≈ 1,5 m DEVANT », ou « ≈ 2 m » sur la ligne droite)
ANTON : Je t'ai trouvé une colline. Ta moto reste derrière.   (sans trajet : « Il y a une butte au-dessus de la ligne droite. C'est tout ce que j'ai. »)
ANTON : … Mauvais calcul, colonel. Quelqu'un attend toujours.   (carton « MISSION 05 / LE CONVOI »)
```

## 5. Le convoi selon les renseignements (contrat avec le sous-lot 3d)

### 5.1 Contrat pur `effetsSurLeConvoi(r)` (`src/bar/renseignements.js`)
```js
{ poste: 'virage' | 'ligneDroite',
  fenetre: { dureeS, barre: bool, freinage: bool },
  arrivee: { avantFenetreS, stressDepart },
  fiche: ['DOSSIER 05', 'COL. KESSLER · AUCUNE PHOTO', 'VÉHICULE 2 SUR 3' | 'VÉHICULE ?', 'CÔTÉ PASSAGER' | 'PLACE ?', ('CASQUETTE AU 3 : LEURRE')],
  radio: [{ evenement, qui: 'anton' | 'viktor', texte }],
  bonus: { points, lignes } }
```
- **Principe : jamais de pile ou face.** Un renseignement manquant coûte du temps, de la vitesse ou tend un piège visible ; jamais une devinette à 50 %.

| Manqué | Effet | Valeurs de départ [calcul, à régler en 3d] |
|---|---|---|
| **TRAJET** | poste sur la butte de la ligne droite, toujours à environ 140 m ; pas de freinage ni de feux stop ; pas de barre FENÊTRE DE TIR | 12,5 m/s, fenêtre d'environ 9 s (115 m de route), avance d'environ 2,2 m |
| **VÉHICULE** | aucun repère de voiture ; le signe du dossier, la casquette, est sur la tête de Haas dans la jeep 3 ; tirer dessus touche un garde : alerte, fenêtre restante divisée par environ 2,4 (spec3:231) | |
| **PLACE** | aucun repère de siège ; Lenoir est sur la banquette arrière de la jeep 2, juste derrière Kessler (là où l'ancien jeu mettait le colonel, `main.js:705`) | |
| **HEURE** | la mission commence quand la jeep 2 est à 8 s de la fenêtre, avec un stress de départ de 0,5 (au lieu d'environ 40 s de calme) | stress retombe de 0,5/s lunette fermée (`tuning.js:69`) : la seconde est prise sur la fenêtre |
- **Réglé en B6** [V, 2 novembre 2026] : `effetsSurLeConvoi(r)` et `createCarnet(connus)` dans `src/bar/renseignements.js`, valeurs `CONVOI` de `src/bar/reglages.js`, textes `FICHE` et `RADIO` à côté (le contrat avec le convoi, hors de `textes.js`), tenus par `tests/bar/renseignements.test.js` :
  - seul exactement `true` compte (une sauvegarde abîmée ne vaut pas un renseignement) ; un objet neuf à chaque appel, figé jusqu'au fond, sans aléa. Chaque renseignement ne change que ses champs, sur les 32 combinaisons : TRAJET le poste, la fenêtre et sa ligne de radio ; HEURE l'arrivée et les lignes du départ ; VÉHICULE et PLACE leur ligne de fiche et celle de la jeep 2 ; les quatre, le bonus ; le leurre, sa ligne de fiche ; appel et allie, rien ;
  - la radio, dans l'ordre : `depart` (Anton : « Sept heures et quart. Ils roulent. », ou « Tu es juste. Ils sont déjà là. »), `approche` (Anton, « Ils arrivent. Respire. », avec l'heure seulement), `fenetre` (Viktor, qui les voit freiner ou non), `jeep2` (Viktor, la moitié connue ; absente sans véhicule ni place), `leurreAbattu` et `alerte` (Viktor), `cibleAbattue` (Anton) ;
  - `bonus` ne dépend que de `r` : 50 points par renseignement et la ligne « RENSEIGNEMENTS n / 4 » ; le +100 d'un bar sans MÉFIANCE et « · COUVERTURE INTACTE » viennent de la couverture, hors du contrat : B17 les ajoute ;
  - `RENSEIGNEMENTS_COMPLETS` (les quatre et le leurre ; appel et allie, du récit, faux) donne le M5 de la spec du lot 3 avec la ligne du leurre : la constante sur laquelle 3d se construit ;
  - le carnet : `apprendre(noms)` rend les noms appris à cet appel (tampon NOTÉ une seule fois) ; un nom inconnu lève une erreur et l'appel n'apprend rien ; `appris` ne compte que les quatre ; `renseignements` rend les sept booléens du contrat de sortie, en copie.
- **Composition fixe**, quelles que soient les infos : jeep 1 l'éclaireur et Sorel ; jeep 2 Dussart au volant (côté opposé au poste), Kessler devant côté poste, tête nue, Lenoir derrière ; jeep 3 Mattei et Haas sous la casquette. 7 occupants en `mafia_boss` (environ 80 k triangles).
- **Radio du convoi** (fil `#kill-feed` et bips d'Anton ; Anton ne voit rien, ce qui se voit dans la lunette est dit par VIKTOR) : au départ « Sept heures et quart. Ils roulent. » puis « Ils arrivent. Respire. », ou sans l'heure « Tu es juste. Ils sont déjà là. » ; à la fenêtre « Ils freinent. Treize secondes. » ou « Ils ne freineront pas. Neuf secondes. » ; jeep 2 en vue : « Deuxième véhicule. Côté passager. » (ou la moitié connue, ou rien) ; leurre abattu, VIKTOR : « La casquette. Ce n'était pas lui. » ; après une alerte, VIKTOR : « Ils accélèrent. » ; cible abattue, ANTON : « C'est fait. La moto, maintenant. » **jusqu'au lot 4 seulement** : la kill-cam suspend la radio à la mort de la dernière cible (`radio.suspendre()`, contrat K0) et la seule parole d'Anton est alors celle de son dossier (`kill-cams-design.md` §4, décision 7, qui peut reprendre cette phrase) ; arbitrage de l'intégrateur, une seule voix à la dernière mort.

### 5.2 Ce que le chantier du bar applique, et ce qu'il demande au sous-lot 3d
- **Appliqué par le bar** (après la fusion du socle 3a) : la fiche (`#target-dossier` généralisé, tâche A7), les lignes de radio (tâche A8), l'arrivée et le stress de départ, le bonus et le rang, le journal.
- **Demandé à 3d** (à ajouter à son plan, avec ces tests) : composition fixe à 7 occupants (6 gardes au lieu de 4, `levels.js:46`) ; Kessler tête nue devant côté poste, casquette sur Haas ; poste et trajectoire de la ligne droite quand `poste === 'ligneDroite'` ; lecture de `fenetre` et `arrivee`. **Le signe d'identification de M5 change** : spec3:248 et la décision 5 (spec3:257) prévoient la casquette sur Kessler ; à réécrire dans la spec du lot 3 avec la décision 1 du §13.

### 5.3 Rapport, rang, journal
- Rapport : ligne « RENSEIGNEMENTS 3 / 4 · COUVERTURE INTACTE » ; bonus +50 points de score par renseignement, +100 si S n'a jamais atteint 30.
- Rang : avoir atteint SOUPÇON au bar compte comme une alerte (FANTÔME exige un bar propre) ; décision 6 du §13.
- `JOURNAL[5]` : « Je suis entré chez eux. Personne ne m'y avait envoyé. » / « Le colonel n'a pas passé la frontière. Sa serviette non plus. » / « Des centaines de noms. Des centaines de raisons. »
- `journalNote(5, …)`, une seule, dans cet ordre : Lenoir abattu (« P.S. Le petit qui posait des questions était assis derrière lui. ») ; Fernand allié (« P.S. Le patron du Bivouac m'a donné l'heure. Il ne m'a pas demandé mon nom. ») ; 4 infos et S jamais à 30 (« P.S. Ils ont parlé devant moi comme devant une chaise. »).

## 6. Sauvegarde
```js
state.m5 = { etape: 'bar' | 'convoi',
             renseignements: { trajet, vehicule, place, heure, leurre, appel, allie },   // booléens
             couverture: { soupconMax, paliers: { mefiance, soupcon }, dureeS } | null }
```
| Événement | Après | Sauvegardé |
|---|---|---|
| Ancienne sauvegarde sans `m5` | `bar`, tout faux | au prochain `saveProgress` |
| Bar sorti, passé, ou erreur | `convoi`, renseignements, couverture | **oui, avant le bilan** |
| Démasqué | inchangé (`bar`) | non |
| Convoi raté, RECOMMENCER | inchangé (`convoi`) | non |
| Convoi raté, RETOURNER AU BIVOUAC | `bar`, tout faux | oui |
| M5 réussie | `bar`, tout faux, **après** le rapport | oui (avec `recordClear`) |
| `jumpToLevel`, `resetProgress`, `resetCampaignFlags` | `bar`, tout faux | oui |
- Nettoyage au chargement : étape inconnue → `bar` ; un booléen n'est vrai que s'il vaut exactement `true` ; couverture invalide → `null`.

## 7. Intégration dans `main.js` (points d'insertion de l'instantané, à revoir après la fusion de 3a)

**Deux étapes de fusion (intégrateur, `feuille-de-route.md` §3)** :
- **Étape 1, module autonome**, fusionnable dès sa relecture (de préférence après 3a, pour un seul rebase) : `src/bar/**`, `src/ui/frappe.js`, `src/gfx/batcher.js`, `src/prologue/decor.js`, retouches de `fpsController` et `interact`, `src/campaign/etapes.js` et `state.m5` (B13), page `dev/bar.html` hors build. Rien n'est branché au jeu : `main` joue l'ancien M5. Le sous-lot 3d trouve ainsi `effetsSurLeConvoi` et `state.m5` dans `main`, et se construit sur la constante `RENSEIGNEMENTS_COMPLETS` (le M5 de spec3:248) tant que l'étape 2 n'est pas fusionnée.
- **Étape 2, branchement dans la campagne**, fusionnée juste après 3d : briefings I et II (B14, B15), points 1 à 9 ci-dessous (B16), fiche, radio, rang, journal (B17), vérification (B19). Avant 3d, le briefing II promettrait une ligne droite, un leurre et une place que le convoi ne joue pas.
1. **`launchLevel`** (`main.js:422-462`) : pour M5, `etape = etapeM5(upgradeState)`. Étape `bar` : briefing I s'il n'est pas vu, avec préparation du bar (`prepareDuringBriefing`, morceau chargé, décor monté, `renderer.compile`), puis `infiltrate()` ; sinon `infiltrate()` directement. Étape `convoi` : `enterLevel(5)` (briefing II seulement par REVOIR LE BRIEFING).
2. **`infiltrate()`** à côté d'`investigate()` (`main.js:383-419`), avec un lanceur commun `runSequence(kind, charger, suite, options)` qui transmet le résultat ; `abortSequences()` remplace `abortInvestigation()` dans `showMenu` et `launchLevel`. Attente des modèles comme une mission (`main.js:479-492`).
3. **Boucle** (`main.js:1422-1429`) : `'investigation' || 'bar'`. Le panneau de performances reste visible au bar (`main.js:1401` ne masque que l'enquête) ; la résolution dynamique d'Auto est nourrie aussi en phase `'bar'` (`main.js:1388`).
4. **`shortcuts.js:6`** : `'bar'` dans `BUSY` (sinon `Digit2` pour répondre lancerait M2 en dev, `main.js:1269-1273`). **`phase.js:25-27`** : `canFail` accepte `'bar'`.
5. **Après le bar** : sauvegarde, puis cinématique `m5b` avec `params` et `prepareDuringBriefing(prepareLevel(5))`, puis `enterLevel(5, prep)`.
6. **`mountLevel(5)`** lit `upgradeState.m5.renseignements` et `effetsSurLeConvoi` (via `src/campaign/missions/m5.js` du socle 3a).
7. **Écran d'échec** : `#btn-retry-bar` RETOURNER AU BIVOUAC, visible seulement après un échec du convoi de M5.
8. **Route de développement** `?bar=1&cam=x,y,z,lacet,tangage&t=s&soupcon=n&infos=trajet,heure&stats=1` (à côté de `main.js:1755`) ; accroches `__bar()` (S, plancher, palier, horloge, renseignements, I par foyer, `f_p` par personne), `__barAller(x,z,lacet,tangage)`, `__barAvance(s)` (pas fixes, déterministe), `__barSoupcon(v)`.
9. **Memtest** : étapes `bar-1`, `bar-2`, `bar-3`, `menu-bar` (`src/gfx/memtest.js:10-19`, critères `scripts/memtest.mjs:60-98`).

## 8. Budgets (PC de milieu de gamme, budgets du lot 1)
| Poste | Plafond | Garde |
|---|---|---|
| Décor seul, `stats()` | ≤ 80 maillages, ≤ 60 000 triangles ; fusion par matériau (`createBatcher`), pas d'`InstancedMesh` (non traité par `gfx/dispose.js`, spec3:16) | test sur le modèle de `tests/prologue/apartment.test.js:30-36` |
| Personnages | ≤ 10, ≤ 300 000 triangles, ≤ 40 maillages animés, ≤ 300 000 sommets animés ; aucun `gangster_man_01` | test du casting sur les comptes des en-têtes GLB |
| Vue de départ, Moyen et Bas | ≤ 130 appels, ≤ 400 000 triangles (hors première image) ; M5 d'aujourd'hui : 297 et 486 k | route `?bar=1&stats=1` |
| Ombres | une seule lumière qui projette (spot du soleil à travers les stores, carte 1024²), figée après la première image ; aucun personnage n'en projette | test |
| Lumières | hémisphère, ≤ 4 `PointLight` sans ombre, le spot ; le reste en lueurs additives fusionnées (`apartment.js:788, 1367-1376`) | test |
| Textures canvas | ≤ 5 Mpx (enquête 4,84 [M]) | test |
| Logique par image | aucun maillage animé dans un rayon ; écoute, regard, soupçon en 2D pur : ≤ 1 ms pour 10 personnes et 6 foyers | test structurel et mesure sous Node |
| Montage | ≤ 0,5 s sur l'écran noir (décor ≈ 0,2 s [M], apparitions de 13 à 18 ms [M]) | mesure |
| Fluidité | p95 ≤ 22 ms en Moyen ; au plus celle de M6 (`--temps-reel --gpu`) | memtest |
| Mémoire | Δ géométries et textures = 0 sur 10 montages ; rien de partagé libéré | memtest, `trackDisposals` (`tests/gfx/fakeRenderer.js`) |
| Code | morceau du bar ≤ 120 kB ; bundle principal + 6 kB au plus (câblage seulement ; le plafond commun de 700 000 o du lot 5 n'est bloquant qu'à sa tâche Z1, qui mesure tout ce qui est fusionné : `feuille-de-route.md` §3) | build, `scripts/poids.mjs` |
| Audio | ≤ 3 voix bipées à la fois ; aucun minuteur ni nœud branché après `stop` | test au faux `AudioContext` |

## 9. Effets atténués
- Pas de balancement de la tête (`fpsController` option `balancement`, aujourd'hui ignorée, `fpsController.js:101-102`).
- Pas de pivot automatique de la caméra (dialogue, interpellation, démasqué) : le panneau dit qui parle (comme `investigation.js:546-549`).
- Tampon NOTÉ et compteur sans agrandissement ; glitch au tiers (`.bar-reduced`, comme `enquete.css:13-16`).
- Jauge, anneau de fixation et arcs du bord ne pulsent pas : seule la couleur change. Vignette fixe et plus légère.
- Néon, télé et point de l'horloge fixes (et jamais plus de 3 clignotements par seconde hors effets atténués). Démasqué : fondu simple, sans secousse. Le son reste (lot 1 §4.5).

## 10. Tests (chacun vu rouge avant le code)
| Test | Témoin rouge |
|---|---|
| Une fixation que personne ne voit ne fait rien monter | jauge sans témoins |
| La baisse s'arrête au plancher ; plancher plafonné à 55 | sans plancher ; plancher non plafonné |
| De 62 à 55, on reste en SOUPÇON ; DÉMASQUÉ émis une seule fois | seuil sans hystérésis ; émis à chaque image |
| Transmission : cloison 0,6, deux murs multipliés, porte 0,9 seulement dans l'axe | tout ou rien |
| Tableau des places (§3.1) : chaise ouest de D (1,9 m de A) I ≥ 0,85 au calme et en MÉFIANCE ; chaise nord de C (4,7 m de A) I < 0,8 ; mange-debout est (2,6 m de B) I ≥ 0,85 au calme, < 0,8 en MÉFIANCE ; entrée du couloir (1,0 m du combiné) voix du colonel ≥ 0,8, à 2 m < 0,5 ; derrière la cloison du couloir, T = 0,6 | voix constante ; distance seule ; murs ignorés |
| Même masquage pour une même réplique et un même I | hasard à chaque image |
| Acquis seulement si les mots-clés ont été affichés au moment de leur frappe | acquis par simple proximité au début de la réplique |
| Seuil du regard 5,9° à 2 m et 4,1° à 5 m ; dos tourné ou mur : rien ; interlocuteur exclu | seuil fixe de 10° ; sans cône de la personne |
| `Digit1` (touche « & » en AZERTY) choisit 1 ; libellés « 1 » à « 3 » | lecture de `e.key` ; `keyName` donne « & » |
| Minuterie, frappe, bips, horloge, jauge figés en pause (5 s de pause ne changent rien) | frappe par `setTimeout` comme `investigation.js:165-177` |
| Au moins deux sources par renseignement, dont une à épier ; chaque `suite` existe, chaque nœud est atteignable | une source retirée ; un nœud orphelin |
| Échange reporté puis perdu sous SOUPÇON ; la fin attend le dialogue ; « 18:36 » à 273 s | sans report ; fin immédiate |
| `effetsSurLeConvoi` : les quatre connus donnent le M5 de spec3:248 ; chaque inconnu ne change que ses champs ; aucun aléa | effets constants ; `Math.random` |
| Assis : la souris tourne la vue, les touches ne déplacent pas | `setFrozen(true)` |
| Effets atténués : œil fixe en marchant | balancement de `fpsController.js:102` |
| Sur chaise, les modèles en `Sit` ont le bas des fesses à 0,45 ± 0,03 m, pieds au sol | `seatY` de 0,2 recopié de M6 (`main.js:635`) |
| Os de la tête trouvé pour les préfixes `mixamorigN` | recherche de « head » qui prend `HeadTop_End` |
| Aucun maillage animé parmi les cibles de visée, les boîtes et les rayons | cibles = modèles des PNJ |
| Aucun personnage ne projette d'ombre | `castShadow = true` de `characters.js:211` |
| Accessoire dans la main droite | heuristique de `_addPhoneProp` |
| Casting à graine, modèle vérifié, budgets du §8 | retombée silencieuse ; 10 `gangster_man_01` (549 k triangles) |
| `stop()` : rien de partagé libéré, rien de possédé oublié ; aucun minuteur, écouteur ni nœud audio restant | libération façon `apartment.dispose` sur un clone GLB ; `setInterval` de `sound.js:51` |
| Aucun `Math.random` dans `src/bar/` | `sound.js:17` |
| Sauvegarde : tableau du §6 ; ancienne sauvegarde sans `m5` | erreur sur `m5.etape` |
| En dev, au bar, `Digit2` répond et ne lance pas M2 ; `canFail('bar')` vrai, `'investigation'` toujours faux | phase absente de `BUSY` |
| `{ resultat, renseignements }` arrive jusqu'au montage du convoi | `run.next()` sans argument |
| Briefing I : aucune réplique d'Anton ne contient « deuxième », « passager », « vieille route », « sept heures », « virage » | `scenes/m5.js:13-17` |
| Textes du bar sans tiret cadratin | couvert d'office par `tests/texts.test.js` |

## 11. Critères de fin chiffrés
- `npx vitest run --maxWorkers=2` vert (1 333 aujourd'hui, plus les nouveaux) ; `npx vite build` sans erreur ; morceau du bar ≤ 120 kB, bundle principal + 6 kB au plus.
- `stats()` du décor ≤ 80 maillages et ≤ 60 000 triangles ; vue de départ ≤ 130 appels et ≤ 400 000 triangles en Moyen et en Bas ; p95 ≤ 22 ms en Moyen (RTX 3080, `--temps-reel --gpu`) ; montage ≤ 0,5 s ; logique ≤ 1 ms par image.
- `node scripts/memtest.mjs --check` vert en Moyen et en Bas avec les étapes du bar : Δ géométries et textures = 0.
- Parcours `scripts/verif-mission.mjs`, verts deux fois de suite :
  - `bar-parfait` : un parcours scripté obtient **les 4 renseignements avec S < 30 tout du long** (preuve que FANTÔME est possible) ;
  - `bar-zinc` : rester assis au zinc toute la soirée donne au plus 1 renseignement (HEURE) sans être démasqué (preuve que c'est dur) ;
  - `bar-regard` : fixer Sorel 2,5 s à 2 m : S ≥ 12 et une remarque ;
  - `bar-demasque` : S à 99 puis fixer : cause affichée ; RECOMMENCER rejoue le bar, renseignements à zéro ;
  - `bar-pause` : Échap pendant un dialogue, 5 s réelles : minuterie inchangée à 0,05 s près ;
  - `bar-convoi` : avancer à 420 s, sortir : briefing II joué avec les bons params, M5 en jeu, `m5.etape === 'convoi'` dans `localStorage`, et après rechargement REPRENDRE mène au convoi ;
  - `bar-passe` : verrou refusé, PARTIR SANS ENTRER : convoi, 0 renseignement.
- Captures déterministes (entrée, zinc, table A vue de la table D, table B vue du mange-debout, couloir et téléphone, démasqué, bilan) en Moyen et en Bas, jugées par Rayan.
- Aucun tiret cadratin neuf ; briefing I sans aucune des quatre infos ; REPRISE.md à jour.

## 12. Risques
1. **Sosies** : les 7 modèles sont tous des visages de cibles déjà abattues ou à venir (Kessler et l'escorte en `mafia_boss`, Mira peut-être en `mafia_woman_03`), et le bar les montre à 2 m. Parades : teintes, tablier, pénombre, casting jugé sur captures ; modèles libres au lot 5 (§13, décision 3).
2. **Lot 3 en parallèle** : `main.js`, `upgrades.js`, `tuning.js`, `convoy.js` sont touchés des deux côtés. Parades : tout ce qui est pur ou propre au bar d'abord, dans `Sniper-Game-bar` ; câblage court et seulement après la fusion de 3a (plan, dépendances) ; contrat `effetsSurLeConvoi` que 3d consomme.
3. **Maquette M5 à deux propriétaires** : le chantier « cinématiques v2 » (copie `Sniper-Game-cine`) part aussi de main. Une seule branche doit posséder `briefing-m5.html` et `briefing-m5b.html` : **`m5-bar`** ; cine-v2 n'y touche qu'après la fusion.
4. **Lisibilité en 1280 × 720** : sous-titres masqués, panneau de dialogue et carnet serrés (l'aide passe déjà sur deux lignes, REPRISE:110).
5. **Clips Mixamo raides** : `Talk` bouge de moins de 5 cm [M] ; la couche de tête procédurale porte la vie de la salle ; la marche de Lise peut glisser.
6. **Équilibrage** : présence, plancher, report, voix baissée s'enchaînent ; « fais le dur » : partir des valeurs du §3.6, n'assouplir qu'en jouant (`reglages.js`) ; les parcours `bar-parfait` et `bar-zinc` encadrent la difficulté.
7. **Charge audio** : jusqu'à 3 voix, le brouhaha et la musique ; syllabes courtes et nœuds libérés au `stop` ; à mesurer sur la mesure de durée d'image.
8. **Spec du lot 3** : la décision 11 est désormais définitive à 430 m (commit `85973ab` de `lot3-socle`, spec3:177, 266 ; note de l'intégrateur) : la réplique B3 « À plus de quatre cents mètres » et la une du journal tiennent. Le signe de M5 (casquette sur Kessler, spec3:248, décision 5) change avec le leurre : à reporter dans la spec du lot 3 selon la décision 1 du §13 (`feuille-de-route.md` §2.5). La décision 3 du lot 3 (maquette de M5 passée à « ≈ 1,5 m ») est absorbée par le briefing II (B15) : 3d ne touche aucune maquette.

## 13. Décisions à faire trancher par Rayan
Décisions 1 à 8 tranchées le 28 octobre 2026 : toutes les recommandations sont retenues (`decisions-rayan.md`, où elles portent les numéros H1, G1, H3, H2, G2, G3, G4 et G5 de `feuille-de-route.md` §5). Les décisions 9 et 10, nées de la relecture de B1, la décision 11, née de celle de B6, les décisions 12 et 13, nées de celle de B10, et la décision 14, née de celle de B11, restent ouvertes : l'option « en place » s'applique tant que Rayan n'a pas tranché.

1. **Le leurre**
   - A (reco, « fais le dur ») : Haas porte la casquette d'officier dans la jeep 3, Kessler est tête nue.
   - B : les deux portent une casquette.
   - C : pas de leurre, Kessler garde sa casquette (spec3:248 inchangée).
2. **TRAJET manqué**
   - A (reco) : butte sur la ligne droite, toujours à environ 140 m, convoi lancé à 12,5 m/s sans freinage, fenêtre d'environ 9 s sans barre (lisibilité gardée, spec3:267).
   - B : crête de repli à environ 200 m, fenêtre de 13,5 s (86 px à ×12 [calcul], plus loin mais plus lent).
   - C : même poste, sans barre de fenêtre (le plus simple, le moins juste).
3. **Lise et les sosies**
   - A (reco) : `mafia_woman_03` avec tablier, dans la pénombre, jugée sur captures.
   - B : pas de serveuse, Fernand fait le tutoriel du regard (−55 k triangles, moins de vie).
   - C : modèle libre au lot 5, Lise en silhouette d'ici là.
4. **Pont vers le convoi**
   - A (reco) : bilan au bar, puis briefing II paramétré (le convoi s'y monte).
   - B : carte « DOSSIER 05 » seule, sans Anton.
5. **Après un échec du convoi**
   - A (reco) : RECOMMENCER garde les renseignements ; RETOURNER AU BIVOUAC les remet à zéro.
   - B : RECOMMENCER seulement (le bar ne se rejoue qu'en recommençant la campagne).
6. **Le bar et le rang**
   - A (reco) : avoir atteint SOUPÇON compte comme une alerte (FANTÔME exige un bar propre) ; bonus de points par renseignement.
   - B : le bar ne touche pas au rang, seulement aux points.
7. **Minuterie des réponses**
   - A (reco) : 10 s en conversation, 6 s avec Sorel.
   - B : seulement avec Sorel.
8. **Verrou refusé (PARTIR SANS ENTRER)**
   - A (reco) : 0 renseignement.
   - B : les 2 faciles (HEURE et TRAJET).
9. **Plancher de la jauge et sortie en SOUPÇON** (ouverte, relecture de B1 : le §3.6 se contredit ; à trancher avant B11)
   - Constat : le plancher plafonné à 55 doit ramener en MÉFIANCE, mais on ne sort du SOUPÇON que sous 52. Qui a atteint SOUPÇON avec un plancher de 52 ou plus y reste toute la soirée (échanges porteurs reportés, puis perdus) ; qui ne l'a jamais atteint revient bien en MÉFIANCE, mais à 5 points du SOUPÇON.
   - A (en place, la lettre du §3.6, « fais le dur ») : plancher plafonné à 55.
   - B : plancher plafonné sous 52 (50 par exemple ; à 52 pile, on resterait en SOUPÇON) : on revient toujours en MÉFIANCE, comme le promet le §3.6. Changement : `SOUPCON.plancherMax` dans `src/bar/reglages.js`, et le test du plafond.
   - Dans les deux cas, lire « Sortir du bar en SOUPÇON (S ≥ 60) » sur S, comme l'écrit le §3.6, ou sur le palier. Avec A et une lecture sur le palier, qui reste en SOUPÇON ne peut plus sortir sans être démasqué.
10. **Assis sans verre** (ouverte, relecture de B1 : le §3.6 et le §3.7 se lisent de deux façons)
   - A (en place, la plus dure) : la baisse ne passe à 5/s que posé, un verre à la main (§3.6 : « 5/s assis avec un verre ») ; assis sans verre, 3/s comme debout.
   - B : assis suffit, avec ou sans verre (lecture possible du §3.7 : « assis (chaise, tabouret) ou accoudé au mange-debout avec un verre »). Changement : `SOUPCON.baisses.assis` à 5 dans `src/bar/reglages.js`, et le tableau du test des baisses.
11. **L'appel en SOUPÇON** (ouverte, relecture de B6 : écart à la lettre du §3.6, à faire valider)
   - Constat : le §3.6 reporte en SOUPÇON tout échange porteur d'un renseignement. La soirée (B6, §3.9) en excepte le départ (R3), par force : retenté à 409 puis 429 s, après la fin, l'escorte ne partirait jamais. Elle en excepte aussi l'appel, par choix : en SOUPÇON à 273 s, le joueur entend quand même la source qui porte trois renseignements (TRAJET, HEURE, PLACE).
   - A (en place, recommandée) : l'appel ne se reporte pas (`JAMAIS_REPORTES` de `src/bar/seance.js`) : le colonel appelle à son heure. Le SOUPÇON garde une part de son prix : la voix de l'escorte est baissée dès MÉFIANCE (Sorel compris, §3.6), et PLACE ne s'apprend que du combiné, à 1 m.
   - B (la lettre du §3.6, plus dur) : l'appel se reporte comme les autres échanges porteurs (retenté à 293 puis à 313 s, le colonel rappelant, puis perdu). Changement : retirer `APPEL` de `JAMAIS_REPORTES` dans `src/bar/seance.js`, et le test « un échange sans renseignement se joue sous SOUPÇON, comme l'appel et le départ » de `tests/bar/seance.test.js`.
12. **Dussart derrière Lenoir, vu de la place d'écoute de la table A** (ouverte, relecture de B10 : à juger sur captures)
   - Constat : de la chaise ouest de D, la tête de Dussart (« le plus vif à remarquer un regard ») est à 5,5° de celle de Lenoir, qui lui tourne le dos, à peine plus que son θmax de 5,15° : on ne voit de lui que le haut de la tête, et viser un peu au-dessus de la tête de Lenoir le fixe sans qu'on le voie (`shots/bar/b10/relecture/tableA-moyen.png`).
   - A (en place, « fais le dur ») : rien ne change ; au joueur de regarder ailleurs que la table A, comme le veut « écouter sans regarder ».
   - B : Dussart glisse sur la banquette, de x = 1,5 à x = 1,0 (le bout ouest de la table A) : sa tête passe à 7,1° de celle de Lenoir, au-delà de son θmax, et l'on voit son épaule et son genou à côté de Lenoir (`tableA-dussart-x1-moyen.png`), mais toujours peu de son visage. Changement : le siège `A-sud` de `src/bar/plan.js`, puis le tableau des places et les tests du plan, du regard et de la salle.
   - C (recommandée) : le regard (B11) tient pour cachée une tête masquée par celle d'une autre personne, plus proche, sur le segment de l'œil de Viktor à elle (une sphère de 0,12 m autour de chaque tête) : elle n'est pas fixée et ne voit pas Viktor, puisqu'il ne voit pas son visage. Changement : `src/bar/regard.js` (pur) et un test, sans rien déplacer.
13. **L'ouvrier contre la caméra, à la vue de départ** (ouverte, relecture de B10 : à juger sur captures)
   - Constat : à l'entrée, l'ouvrier 1 (ancre `ouvriers.0`, en (4,7 ; 2,85), à 1,6 m de l'œil et 47° à droite) est coupé par le bord droit de l'image, à l'épaule de Viktor (`shots/bar/b10/relecture/entree-moyen.png`).
   - A (en place) : il reste là, face à son mange-debout.
   - B : il recule de la porte, en (4,55 ; 2,6), toujours tourné vers le mange-debout : entier dans l'image, à 1,7 m et 38° à droite, dans le faisceau des stores (`entree-ouvrier-recule-moyen.png`). Changement : `ANCRES.ouvriers` de `src/bar/plan.js` (sa boîte suit), puis le tableau des places et les tests du plan.
14. **L'écoute pendant un dialogue** (ouverte, relecture de B11 : une décision de jeu prise en B11, à valider en jouant, B19)
   - Constat : pendant tout dialogue de Viktor, I = 0 pour toute réplique épiée : ses mots se masquent et son renseignement ne s'apprend pas (le §3.4 interdit le sous-titre d'une autre table pendant un dialogue, et ce que le joueur lit est exactement ce qu'il sait ; §3.13, « Réglé en B11 »). Un dialogue qui s'ouvre de lui-même (L2 sur une remarque, D1 au premier passage au zinc, L1 au bout de 45 s sans verre) pendant A1, B1, A4 ou A2a fait perdre cette source ; le renseignement reste à prendre à ses autres sources (l'appel, A2b, R1, R2, R3, §3.9).
   - A (en place, « fais le dur ») : rien ne change ; un dialogue coupe l'écoute, quel qu'il soit.
   - B : les dialogues que la coquille ouvre d'elle-même (D1, F3, L1, L2 ; pas D2, que la soirée ouvre à son heure) attendent la fin d'une réplique porteuse d'un renseignement que Viktor entend (I > 0). Changement : `ouvrirEnAttente` de `src/bar/index.js`, et un test.
