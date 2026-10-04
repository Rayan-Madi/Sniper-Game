# L'enquête jouable du prologue — design

> Complète la spec des cinématiques (`2026-10-02-cinematiques-design.md`, §5 et §6.7, étape 4 du §10).
> Validé par Rayan le 4 octobre 2026 (« parfait je suis en acceptation total »). Ton visuel « noir ciné »,
> guidage « discret » (choix de Rayan).

## 1. Place dans le jeu

COMMENCER (niveau 1, prologue non vu) → cinématique **prologue-a** (l'offre, le refus, carton « 14 MARS · 21:47 /
LE SILENCE ») → **l'enquête** → cinématique **prologue-b** (inchangée : elle s'ouvre sur la messagerie dans la main de
Viktor, puis le rappel) → mission 1. `prologueSeen` reste posé à la fin de B : un rechargement pendant l'enquête
rejoue A puis l'enquête.

## 2. Le parcours

- **Départ** : sur le palier, face à la porte entrouverte, serrure arrachée. Écran noir, puis carte « 14 MARS ·
  21:47 » avec les commandes ; un **clic** prend le contrôle (verrouillage du pointeur).
- **Commandes** : avancer / reculer / gauche / droite = les touches de `settings.pvpKeys` (codes physiques, relus à
  chaque appui ; les flèches marchent aussi) ; souris = regarder, avec `sensMultiplier()` et `invertY()` ;
  **E** ou **clic gauche** = examiner / fermer une fiche. Marche lente (≈ 1,6 m/s), yeux à 1,65 m.
- **Examiner** : viser un objet à moins de 2,2 m (rien à travers les murs) l'illumine et affiche
  « E — EXAMINER ». La **fiche d'indice** s'ouvre en style dossier du fixeur : photo de ce que regarde Viktor
  (instantané du rendu, traité en photo de scène de crime), « INDICE 0n / 06 · LIEU », le titre, une citation s'il y
  en a, et la phrase de Viktor tapée avec sa voix intérieure (bips). Déplacement figé tant qu'elle est ouverte.
- **Les 6 indices** :

| # | id | Lieu | Objet | Phrase de Viktor |
|---|---|---|---|---|
| 1 | serrure | le palier | porte entrouverte, gâche arrachée, éclats de bois | « Ils n'ont pas sonné. Ils ont fait sauter la serrure. » |
| 2 | lutte | l'entrée | porte-manteau renversé, vase brisé, veste au sol | « Elle s'est défendue. » |
| 3 | corps | le salon | deux formes sous un drap, sang au sol (+ acouphène) | « Elles étaient là. Ma femme. Ma fille. » |
| 4 | photo | le salon | cadre tombé, verre fêlé (photo de famille au coucher de soleil) | « Elles n'avaient rien fait. C'est moi qui avais dit non. » |
| 5 | mot | le salon | papier sur la table basse : « Tu aurais dû dire oui. » | « Ils voulaient que je sache. » |
| 6 | doudou | la chambre de la petite | doudou lapin au pied du lit | « Elle ne dormait jamais sans lui. » |

- **Le téléphone** (sur le meuble de l'entrée, hors compteur) :
  - moins de 4 indices : pas de fiche, une phrase : « Pas encore… Je dois comprendre ce qui s'est passé. » ;
  - à partir de 4 : fiche « LE TÉLÉPHONE · 2 APPELS MANQUÉS » — `06 39 98 41 07 · 18:52 · 1 MESSAGE`,
    `MAISON · 19:04` — et deux phrases : « Ce jour-là, j'avais oublié mon téléphone. » puis « Elle m'a appelé. Il
    était là, en silencieux. » (sa femme appelait du fixe ; le portable, en silencieux, n'a pas sonné) ;
  - action « E — ÉCOUTER LE MESSAGE » : fondu au noir, fin de l'enquête, cinématique B.
- **Guidage discret** : compteur « INDICES n / 6 » ; après 40 s d'exploration sans nouvelle découverte, Viktor
  murmure une piste (sous-titre + voix) vers l'indice non vu le plus proche, ou vers le téléphone une fois 4 indices
  trouvés. Pas de flèche, pas de carte.
- **Passer** : Échap (le navigateur relâche alors la souris) ou toute perte du pointeur ouvre la pause de l'enquête :
  « REPRENDRE » (reverrouille) / « PASSER L'ENQUÊTE » (→ B). Le menu pause des missions n'est pas utilisé.
- **Durée visée** : 2 à 4 minutes, sans échec ni chrono.

## 3. L'appartement (≈ 12,5 × 8 m, un niveau)

Plan validé (repère : x vers la droite, z vers le joueur au départ, en mètres) : palier x 5–7, z 7–8,5 ; entrée
x 4,5–7,5, z 4,5–7 ; salon x 7,5–12,5, z 1–7 (grande fenêtre sur x = 12,5) ; couloir x 0,5–4,5, z 4,5–5,8 ; chambre
de la petite x 0,5–4, z 0,8–4,5 (fenêtre sur z = 0,8) ; cuisine (x 4,5–7,5, z 1–4,5) et chambre des parents
(x 0,5–4,5, z 5,8–8) **fermées** (portes closes, non modélisées dedans). Hauteur sous plafond 2,6 m.

## 4. Ambiance « noir ciné »

- Nuit bleue par les fenêtres ; **une seule lumière chaude** : la lampe sur pied renversée du salon, encore allumée,
  qui projette la **seule ombre** (figée après la première image) ; une veilleuse rose pâle dans la chambre de la
  petite ; plafonnier du palier qui grésille (émissif, sans lumière).
- Derrière les vitres : la **même ville sous la pluie** que dans les cinématiques (silhouette générée avec la graine 7
  de la maquette) et une pluie animée.
- Habillage par-dessus le rendu : grain fin, scanlines discrètes, vignette ; glitch bref à l'ouverture des fiches et
  sur l'indice des corps.
- Son (sur le volume du jeu) : pluie continue, cœur qui accélère à l'approche du salon, grincement de porte au départ,
  pas feutrés, acouphène sur la fiche des corps, voix intérieure de Viktor (bips + sous-titre).
- Jamais de corps visible : deux formes sous un drap, du sang au sol, le doudou.

## 5. Architecture

- `src/prologue/clues.js` : données (6 indices + téléphone). `state.js` : machine à états pure (exploration, fiche,
  pause, fin ; règle des 4 indices ; pistes). `fpsController.js` : déplacement, collisions cercle/boîtes, souris,
  verrouillage du pointeur. `apartment.js` : géométrie procédurale **fusionnée par matériau**, objets d'indice,
  lumières, ville, pluie, collisions, `dispose()`. `interact.js` : visée par rayon (occultée par les murs),
  surbrillance. `ambience.js` : son. `investigation.js` + `enquete.css` : chef d'orchestre, interface DOM, cycle de vie.
- Scène **dédiée** (`THREE.Scene` propre), rendue par le `renderer` et la `camera` partagés du jeu ; caméra et réglage
  des ombres du renderer sauvegardés puis restaurés ; **tout est libéré** à la sortie (géométries, matériaux,
  textures, carte d'ombre, sons, minuteurs, écouteurs, DOM).
- Chargée **à la demande** (`import()` depuis `main.js`) : rien dans le bundle principal. Phase `gamePhase =
  'investigation'` : la boucle met à jour et rend la scène de l'enquête dans un `try/catch` ; toute erreur termine
  l'enquête et enchaîne sur B (jamais de blocage). Touches 1-6 neutralisées, aide « CLIC DROIT — Viser » masquée,
  pointeur libéré avant B, shaders précompilés sous l'écran noir.
- Route de développement `?enquete=1` (`&indices=n`, `&cam=x,y,z,lacet,tangage` pour figer la caméra et capturer,
  `&stats=1` pour afficher appels de dessin et triangles), page de décor `dev/enquete-decor.html` (hors build).

## 6. Budgets

Pendant l'enquête : **< 60 appels de dessin** (passes d'ombre comprises) et **< 50 000 triangles** ; une seule lumière
à ombre (SpotLight, carte 1024, `shadowMap.autoUpdate = false` après la première image) ; nombre de lumières fixe.
Poids : chunk de l'enquête chargé à la demande ; aucune image ni modèle externe (textures dessinées en canvas).

## 7. Vérification

Tests unitaires (Vitest + jsdom, sans WebGL) : règle des 4 indices et pistes, collisions et vecteurs de déplacement
(D va bien à droite), visée et occultation, budget de l'appartement (maillages, triangles) et libération, son muet sans
contexte et sans minuteur après arrêt, cycle complet de l'interface avec un faux renderer. Puis captures sans
interface (`?enquete=1&cam=…`), parcours complet au navigateur, mesure `renderer.info`, revue finale.
