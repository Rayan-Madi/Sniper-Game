# Prologue v2 : le message de sa femme, l'appel d'Anton, un appartement moins cubique

> Conçu le 11 octobre 2026 après la deuxième recette de Rayan. Ses mots : « le message laissé, c'est ma femme qui dit qu'il y a des gens à la porte, puis Anton nous appelle en disant qu'il peut nous aider car là les bornes ont été dépassées, sans nous en dire plus ; le bruit de la pluie est très fort, le battement cardiaque aussi ; la maison est très cubique ». Décision de Rayan sur le tableau des cibles : **Anton envoie le dossier** (option recommandée). Carte blanche pour le reste.
> Touche : la cinématique `prologue-b` (maquette puis scène régénérée), la fiche du téléphone de l'enquête, le son de l'enquête, l'appartement. Ne touche pas au lot 2 en cours (tir, `main.js`, `src/shot/`).

## 1. L'histoire, nouvelle version

- **18:52** : un appel manqué d'un numéro inconnu, `06 39 98 41 07` (Anton a tenté de joindre Viktor), **sans message**.
- **19:04** : un appel manqué de **MAISON**, avec **un message** : sa femme.
- **21:47** : Viktor rentre (prologue A, enquête).
- Il écoute le message de sa femme.
- **22:41** : **Anton appelle** (appel entrant, depuis le numéro de 18:52). Il dit qu'il peut aider et que les bornes ont été dépassées, **sans en dire plus**, et raccroche sur un rendez-vous (« Demain, tu sauras qui. »).
- Juste après, **un message d'Anton arrive** depuis le même numéro, avec une pièce jointe, **le dossier** : les cibles. Viktor les épingle au mur : c'est le **tableau de chasse**, gardé pour l'épilogue (« le mur du prologue, toutes les fiches barrées sauf ? »).

Ce qui ne change pas : la règle « Anton n'est jamais vu », le numéro jetable de l'épilogue (« Ce numéro n'existera plus demain »), les voix en bips (pas de voix enregistrée), « aucun corps montré » pour la femme et la fille.

## 2. Cinématique `prologue-b` (maquette `docs/superpowers/maquettes/cinematiques/prologue-b.html`)

On garde le décor, le téléphone à l'écran, le tableau et le carton-titre ; on réécrit les temps du début et du milieu. Répliques (sous-titres tapés et voix bipées, filtre messagerie pour la femme, filtre radio pour Anton comme aujourd'hui) :

| Temps | Qui | Réplique ou action |
|---|---|---|
| le message | MESSAGERIE · MAISON · 19:04 | « Viktor, c'est moi… Il y a des gens à la porte. » |
| | | « Ils frappent. Ils ne s'en vont pas. » |
| | | « Rappelle-moi. Vite. » puis fin du message (bip) |
| le silence | | Le téléphone retombe dans la main, quelques secondes sans rien (respiration, pluie) |
| l'appel | APPEL ENTRANT · 06 39 98 41 07 | Le téléphone vibre, l'écran montre le numéro de 18:52 (« NUMÉRO INCONNU »), Viktor décroche |
| | ANTON (pas encore nommé : « INCONNU ») | « Viktor. Je sais ce qu'ils ont fait ce soir. » |
| | | « Je peux t'aider. » |
| | | « Ils ont dépassé les bornes. » |
| | VIKTOR | « Qui êtes-vous ? » |
| | INCONNU | « Demain, tu sauras qui. » puis il raccroche (bips de fin d'appel) |
| le dossier | MESSAGE · 06 39 98 41 07 | Vibration, une bulle de message avec une pièce jointe « DOSSIER » ; les fiches apparaissent une à une (Markov ; les frères Sanctechair ; Vosko, le passeur ; trois officiers ; un colonel sans visage ; « ? ») et se rangent au mur, comme le tableau actuel |
| | (message tapé) | « Je te donne les noms. Toi, tu as le fusil. » |
| | (message tapé) | « Appelle-moi Anton. » ; le contact s'enregistre « ANTON » sur l'écran (comme aujourd'hui) |
| la vengeance | VIKTOR | « Ils voulaient mon silence. Ils auront ma vengeance. » |
| carton-titre | | inchangé |

Retirés : le rappel par Viktor, « Tu as eu mon message. Trop tard, je sais. », « Tu ne me connais pas… », « Appelle-moi Anton. Je vends des infos… », « On t'a offert du travail… » (le prologue A montre déjà l'offre et le refus). Le journal des appels montre désormais « 06 39 98 41 07 · 22:41 · ENTRANT » puis « ANTON » une fois le contact enregistré. L'indicateur radio (« CANAL INCONNU · NUMÉRO JETABLE ») n'est allumé que pendant l'appel : il s'éteint au raccrochage, le dossier et les messages arrivent sans canal ouvert ; « ANTON » ne s'affiche que sur le téléphone (contact et journal). Décidé à la relecture de N1.

La scène `src/briefing/scenes/prologue-b.js` est **régénérée** par `node scripts/port-maquette.mjs` (jamais éditée à la main). Les durées des temps suivent la longueur des répliques comme ailleurs dans le kit. Captures de la maquette et du jeu aux temps clés.

## 3. Enquête : la fiche du téléphone

`src/prologue/clues.js`, `PHONE.appels` :
- `{ de: '06 39 98 41 07', heure: '18:52', note: 'MANQUÉ' }`
- `{ de: 'MAISON', heure: '19:04', note: 'MANQUÉ · 1 MESSAGE' }`

Les lignes de Viktor (« Ce jour-là, j'avais oublié mon téléphone. », « Elle m'a appelé. Il était là, en silencieux. ») et l'action « ÉCOUTER LE MESSAGE » restent. La notification « 1 NOUVEAU MESSAGE » reste juste. Toute mention restante d'un message d'Anton à 18:52 dans le code, les tests, les specs et `REPRISE.md` est corrigée (l'histoire de `REPRISE.md` et la note de la spec cinématiques sur les numéros).

## 4. Son de l'enquête

La pluie et le cœur sont trop forts (Rayan). Pluie : gain divisé par 2 environ (−6 dB) ; cœur : gain multiplié par 0,6 environ (−4,5 dB). Valeurs regroupées en constantes nommées en tête de `src/prologue/ambience.js` (`RAIN_GAIN`, `HEART_GAIN`), commentées, pour un réglage d'une ligne. Les fondus et les débranchements existants ne changent pas. Tests : niveaux visés au faux `AudioContext`.

## 5. Un appartement moins cubique

Aujourd'hui l'appartement est fait de boîtes à arêtes vives. Objectif : qu'il se lise comme un vrai intérieur, sans changer les pièces, les passages, les collisions utiles ni les ancres des indices.

**Architecture intérieure** :
- plinthes au pied des murs, corniche ou moulure au plafond ;
- chambranles autour des portes (cadre en relief), portes à panneaux ;
- fenêtres avec embrasure, appui, croisillons et rideaux (plis légers) ; reflets de la pluie conservés ;
- radiateurs sous les fenêtres, interrupteurs et prises, plafonnier ou suspension.

**Mobilier** :
- arêtes arrondies ou chanfreinées (`RoundedBoxGeometry` de three ou chanfrein maison) sur les meubles ;
- canapé à coussins et accoudoirs arrondis, fauteuil, table basse à plateau épais, étagère avec livres de hauteurs et couleurs variées, lit de la petite avec couette et oreiller, console de l'entrée avec tiroir, tapis aux bords souples ;
- petits objets qui racontent la famille (cadres, plantes, manteau à la patère), sans corps et sans rien qui contredise les indices.

**Contraintes** :
- **budget relevé** et gardé par le test : au plus **80 maillages** et **45 000 triangles** par `stats()` (au lieu de 47 et 16 600), toujours fusionnés par matériau ; textures en canvas comme aujourd'hui, aucune image ajoutée ;
- collisions : les passages restent franchissables avec l'emprise du joueur (tests existants) ; les ancres des 6 indices et du téléphone restent atteignables ; le pivot de fin et la visée restent justes (occulteurs à jour) ;
- photos des fiches : toujours cadrées sur l'indice (tests existants), capturées avant et après ;
- `dispose()` libère tout (test existant, étendu aux nouveaux objets) ;
- performance : l'enquête doit rester légère sur un PC moyen (mesure `?enquete=1&stats=1` avant et après, appels de dessin au plus +10).

**Décidé à N3 (architecture intérieure)** : les portes intérieures, leurs chambranles et leurs bâtis sont peints comme les plinthes et les corniches (un matériau « boiserie » de plus, soit un appel de dessin, compté parmi les occulteurs : portes et cadres arrêtent toujours la visée et le regard vers le téléphone) ; en bois sombre, leurs moulures et leurs panneaux ne se lisaient pas dans la nuit. La porte palière garde son bois sombre et son bâti d'origine ; côté entrée, elle reçoit un chambranle, sauf côté gâche, qui reste l'indice « serrure ». Les portes de la cuisine et des parents sont logées dans une vraie ouverture (bâti, seuil). Le palier ne change pas (cimaise, plinthes sombres, pas de corniche). Dans la chambre, la tête du lit est contre l'allège : le radiateur est un petit radiateur de cinq éléments sous la fenêtre, à gauche du lit. Les luminaires sont éteints : aucune lumière de plus. Moulures, appuis, panneaux et rosace sont bâtis par de petits constructeurs propres à l'enquête plutôt que par `ExtrudeGeometry` et `LatheGeometry` : three est d'un seul bloc dans le bundle principal, qu'elles auraient grossi de 7 kB. À la relecture de N3 : une porte fermée remplit son bâti (aucun jour sur la pièce non dessinée derrière) ; plinthes seulement sur les faces qui bordent une pièce dessinée ; la rosace du salon est en relief (bouton, deux tores), pour se lire d'en dessous.

## 6. Critères de fin

- La cinématique B raconte l'histoire du §1 (captures aux temps clés), le journal des appels et la fiche du téléphone sont cohérents, plus aucune trace d'un message d'Anton à 18:52.
- Pluie et cœur baissés (tests), toujours audibles.
- Appartement visiblement moins cubique (captures de chaque pièce avant et après, regardées), budget relevé tenu, collisions et ancres vérifiées, photos des fiches cadrées.
- `npx vitest run` vert, `npx vite build` sans erreur, port-maquette fidèle.
