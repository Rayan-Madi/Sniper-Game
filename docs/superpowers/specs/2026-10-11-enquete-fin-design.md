# Enquête du prologue : une fin qui vient d'elle-même

> Conçu le 11 octobre 2026 après la recette à la souris de Rayan (« t'es vraiment fort »). Sa demande : « après avoir trouvé tous les indices, il faudrait que l'enquête se termine, genre Viktor qui dit une phrase type "je crois en avoir assez vu", puis l'appel d'Anton se lance ? Ou alors un téléphone qui sonne au bout d'un moment ? ». Carte blanche sur le process : spec rédigée d'un bloc.
> Complète `docs/superpowers/specs/2026-10-04-enquete-design.md` (spec d'origine de l'enquête) sans la remplacer.

## 1. Le problème

Aujourd'hui (`src/prologue/state.js`, `investigation.js`, `clues.js`) :
- le téléphone se déverrouille au 4e indice (`PHONE.seuil = 4`) ;
- une fois les 6 indices trouvés, **rien ne se passe** : le joueur doit penser à revenir au téléphone de l'entrée, l'examiner, puis ÉCOUTER LE MESSAGE ;
- une fois la fiche du téléphone ouverte, la seule sortie est ÉCOUTER : un joueur qui l'ouvre à 4 ou 5 indices ne peut plus chercher les autres (question ouverte de REPRISE.md).

## 2. Approches

| | Approche | Pour | Contre |
|---|---|---|---|
| A | **Fin sèche** : 6e indice, réplique, fondu, cinématique B | Très simple | Saute la fiche du téléphone (« 2 appels manqués », l'appel de **la maison à 19:04**, « Elle m'a appelé ») : le moment le plus fort de l'enquête disparaît pour qui ne l'a pas encore ouverte |
| B | **Fin guidée** : 6e indice, réplique, le téléphone vibre sur la console, le regard s'y pose, sa fiche s'ouvre, le joueur fait lui-même le dernier geste (écouter) | Réunit les deux idées de Rayan ; garde la fiche du téléphone et le geste d'écouter ; cohérent avec l'histoire | Une petite séquence à orchestrer (3 à 4 s) |
| C | **Sonnerie au bout d'un temps** fixe, quel que soit l'avancement | Simple | Coupe un joueur lent au milieu de ses découvertes ; ne récompense pas l'exploration complète |

**Choix : B**, avec la vibration de C gardée comme **coup de pouce** (pas comme fin forcée) pour un joueur bloqué. Et la question ouverte est réglée au passage : avant les 6 indices, on peut **reposer** le téléphone.

Cohérence avec l'histoire : le téléphone de Viktor est resté en **silencieux** sur la console (fiche du téléphone : « Il était là, en silencieux. »). Il ne sonne donc pas : il **vibre** et son écran s'allume, comme pour le rappel de messagerie qu'envoient les opérateurs (« 1 NOUVEAU MESSAGE »). Anton n'appelle pas : c'est Viktor qui le rappellera à 22:41 dans la cinématique B.

## 3. Conception

### 3.1 La fin, quand le 6e indice est trouvé

À la fermeture de la fiche du 6e indice (tous trouvés), une séquence de fin, **qui avance avec le temps de jeu** (mise à jour de chaque image, suspendue pendant la pause, jamais avec des minuteurs réels) :

| t (s) | Ce qui se passe |
|---|---|
| 0 | Le contrôleur est figé (plus de déplacement), la piste et les murmures s'arrêtent |
| 0,8 | Voix intérieure : **« J'en ai assez vu. »** (`PHONE.fin`, même rendu que les autres répliques : sous-titre tapé et voix bipée) |
| fin de la réplique + 0,6 | Le téléphone **vibre** sur la console (deux salves de bourdonnement grave, 0,42 s d'écart, répétées deux fois sur 2,5 s) et son écran **s'allume** (lueur émissive qui pulse, notification « 1 NOUVEAU MESSAGE » visible sur l'écran 3D si la géométrie le permet, sinon lueur seule) ; sous-titre : **« Le téléphone… »** |
| + 1,2 | Le regard **pivote en douceur** vers le téléphone (1,2 s, interpolation lissée du lacet et du tangage vers l'ancre du téléphone) |
| fin du pivot | La **fiche du téléphone s'ouvre** d'elle-même : 2 appels manqués, les lignes de Viktor, et une seule action : **maintenir E (ou le clic) : ÉCOUTER LE MESSAGE** |

Effets atténués (réglage du lot 1, `reducedMotionActive`) : pas de pivot, la fiche s'ouvre directement après la vibration.

Si le joueur avait déjà ouvert la fiche du téléphone avant (et l'avait reposée), la séquence est la même : la fiche se rouvre.

### 3.2 Écouter : un geste maintenu

Sur la fiche du téléphone, **écouter** demande de **maintenir E ou le clic gauche 1 s** : un anneau se remplit autour de la touche affichée, relâcher avant la fin annule sans rien faire. Le geste donne du poids au moment, et rend impossible l'écoute accidentelle (un double-clic ne peut plus lancer la cinématique ; la garde de 600 ms du lot 0 devient inutile et peut être retirée si les tests du double-clic restent verts).

### 3.3 Reposer le téléphone (avant les 6 indices)

Quand la fiche du téléphone est ouverte **avant** que les 6 indices soient trouvés, une seconde action s'affiche : **R (ou clic droit) : REPOSER**. Elle ferme la fiche comme les autres (on reprend l'exploration). La touche affichée suit la disposition du clavier comme les autres invites (lecture par `navigator.keyboard.getLayoutMap` déjà en place) et se lit par `e.code === 'KeyR'`. Après les 6 indices (séquence de fin), REPOSER n'est plus proposé.

### 3.4 Le coup de pouce

Quand le téléphone est déverrouillé (4 indices ou plus) et que la piste du téléphone tombe (40 s sans découverte, système de pistes existant), le téléphone **vibre une fois** (une salve, lueur brève) en même temps que la piste « Mon téléphone… dans l'entrée. ». Rien n'est forcé.

### 3.5 Données

`src/prologue/clues.js`, dans `PHONE` :
- `fin: 'J\'en ai assez vu.'`
- `vibre: 'Le téléphone…'`
- `notif: '1 NOUVEAU MESSAGE'`
- `reposer: 'REPOSER'`

Les répliques restent modifiables à un seul endroit (Rayan avait proposé « je crois en avoir assez vu » ; la forme courte suit le ton des autres répliques de Viktor).

### 3.6 Où ça vit

- `state.js` : `allFound`, `phoneCanPutDown` (vrai si la fiche du téléphone est ouverte et que tous les indices ne sont pas trouvés), et un sous-état de fin (`ending` : étapes et temps écoulé) piloté par `tick`, testable sans DOM.
- `investigation.js` : orchestration de la séquence (réplique, vibration, pivot, ouverture de fiche), maintien pour écouter, REPOSER, coup de pouce.
- `ambience.js` : `buzz()` (bourdonnement de vibration sur bois, procédural, sur le contexte audio commun ; muet en mode gel comme le reste).
- `apartment.js` : accès à l'écran du téléphone pour la lueur (le matériau a déjà `userData.baseEmissive`) ; la lueur revient à sa valeur de base après la vibration.
- `enquete.css` : anneau de maintien, deuxième action de la fiche.

Précisions arrêtées à la tâche E1 (`state.js`) :
- le mode `ending` couvre la séquence ; ses étapes : `silence` (0,8 s), `line` (la réplique, le temps de sa voix, `estimate` des cinématiques), `breath` (0,6 s), `buzz` (1,2 s, toute la vibration de 2,5 s en effets atténués), `turn` (1,2 s, absente en effets atténués), puis `phone` (mode `examining` sur le téléphone). Avec la vraie réplique, la fiche s'ouvre à 5,2 s (5,3 s en effets atténués) ;
- `state.ending` donne l'étape, le temps écoulé, l'avancement de l'étape (le pivot s'en sert) et la liste des étapes entrées, dans l'ordre : aucune n'est sautée, même par une image très longue ;
- effets atténués : la fiche s'ouvre quand le téléphone a fini de vibrer (2,5 s après le début de la vibration, `ENDING.vibration`), à la lettre du §3.1 « directement après la vibration » : on retire le mouvement, pas le son ; le réglage est lu au début de la séquence (`reducedMotion` accepte une fonction) ;
- la vibration n'est pas coupée par l'ouverture de la fiche : en effets normaux, la fiche s'ouvre à 2,4 s de vibration et la dernière salve finit (0,1 s) fiche ouverte ; seul `stop()` coupe une vibration en cours ;
- une durée de réplique invalide (NaN, absente, négative) compte pour zéro : la séquence ne reste jamais bloquée sur la réplique ; une étape sans durée a un avancement de 1 ;
- les 6 indices trouvés, la fiche du téléphone ne se ferme plus, même par `close()` : on en sort en écoutant, ou par PASSER L'ENQUÊTE depuis la pause ;
- route `?indices=6` : la séquence part à la fermeture de la première fiche d'indice relue.

Précisions arrêtées à la tâche E2 (`investigation.js`, `ambience.js`, `apartment.js`, `enquete.css`) :
- la vibration : une salve dure 0,28 s (`BUZZ.salve`), deux salves à 0,42 s d'écart, deux fois, la dernière finie à 2,5 s : départs à 0 ; 0,7 ; 1,52 et 2,22 s. Les salves partent au temps de jeu (suspendues par la pause comme le reste) ; `buzz()` joue une salve (moteur en dents de scie à 152 Hz et console en carré à 76 Hz, passe-bas à 480 Hz, directement sur la destination du jeu) et débranche ses nœuds à la fin de la salve, ou à `stop()` une fois la salve finie ;
- la lueur : l'écran reste allumé toute la vibration (`setPhoneLight(0.55)`, intensité 23, au-dessus du clignotement de repos qui monte à 14), plus vif à chaque salve (jusqu'à 40), puis s'éteint en 0,6 s ; il reprend ensuite son clignotement de repos, éteint (pas au milieu d'un clignotement). Seule l'intensité change, jamais la couleur émissive, que gère la surbrillance de la visée ;
- « 1 NOUVEAU MESSAGE » sur l'écran 3D : la géométrie ne le permet pas (écran de 6,6 × 14,2 cm, une trentaine de pixels de large à 1,5 m, moins encore sur la photo de la fiche) : lueur seule, comme le prévoit le §3.1. `PHONE.notif` reste dans les données pour un plan rapproché futur ;
- la photo de la fiche ouverte d'elle-même est prise depuis `apartment.phoneView` (debout dans l'entrée, à 1 m de la console) et non depuis le joueur, qui peut être dans la chambre de la petite : sous « LE TÉLÉPHONE », la photo d'un mur n'aurait pas de sens. La caméra est remise en place avant que l'image ne s'affiche. Ouverte par le joueur, la fiche garde la photo de ce qu'il regarde ;
- le regard pivote vers le centre du volume de visée du téléphone, par le plus court chemin, en interpolation lissée (départ et arrivée doux) ; d'une autre pièce, il se tourne vers le bruit, à travers le mur ;
- « Le téléphone… » est dit comme une piste (sous-titre et voix intérieure) ;
- écouter : 1 s de temps de jeu, E ou clic gauche ; seul un appui neuf compte (pas la répétition d'une touche tenue depuis la séquence) ; relâcher, la pause ou la fenêtre quittée annulent et vident l'anneau. L'invite est « MAINTENIR E : ÉCOUTER LE MESSAGE », l'anneau autour du E ; la garde de 600 ms du lot 0 est retirée (l'invite est là dès l'ouverture), le test du double-clic reste vert ;
- REPOSER : la touche physique R (`e.code === 'KeyR'`), son libellé lu dans la carte du clavier, ou le clic droit ; affiché seulement tant que la fiche peut se fermer, en action secondaire, plus discrète, qui ne bat pas ;
- le coup de pouce : une salve et sa lueur quand la piste qui tombe est celle du téléphone et qu'il est déverrouillé.

## 4. Tests

Témoin rouge pour chaque comportement (leçon des tests qui mentent) :
- **état** : 6e indice fermé → séquence de fin démarrée ; ses étapes avancent avec `tick` et **pas pendant la pause** (une pause de 10 s au milieu ne fait rien avancer) ; à la fin, mode `examining` sur le téléphone ; REPOSER possible avant les 6 indices, impossible après ;
- **orchestration** (jsdom, comme `tests/prologue/investigation.test.js`) : réplique « J'en ai assez vu. » dite une fois ; vibration appelée (deux salves) ; fiche du téléphone ouverte d'elle-même ; contrôleur figé pendant la séquence ; effets atténués : pas de pivot ;
- **maintien** : appui de 0,5 s puis relâché : rien ; maintenu 1 s : `finish('listened')` ; double-clic : rien ; clic gauche maintenu aussi ;
- **REPOSER** : `KeyR` (et clic droit) ferme la fiche avant les 6 indices, ignoré après ;
- **coup de pouce** : piste du téléphone → une vibration ; avant le déverrouillage, aucune ;
- **son** : `buzz()` au faux `AudioContext` (nœuds créés, débranchés après la salve) ;
- **non-régression** : les 33 tests de l'enquête et le budget (`stats()`) restent verts.

Vérification réelle : Chrome sans interface sur `?enquete=1&indices=5`, examiner le dernier indice, fermer la fiche, capturer la séquence (réplique, lueur, fiche ouverte).

## 5. Critères de fin

- Après le 6e indice, la fiche du téléphone s'ouvre d'elle-même en moins de 6 s, sans action du joueur, et la cinématique B ne part qu'après un maintien d'1 s.
- Avant le 6e indice, le téléphone se repose.
- Rien n'avance pendant la pause ; rien ne reste (minuteurs, nœuds audio, lueur) après `stop()`.
- `npx vitest run` vert, `npx vite build` sans erreur, budget de l'enquête inchangé.
