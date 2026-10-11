# Enquête : une fin qui vient d'elle-même (plan d'exécution)

> **Pour les agents :** exécuter tâche par tâche, en TDD (superpowers:test-driven-development), chaque tâche relue avant la suivante.

**But :** après le 6e indice, Viktor dit « J'en ai assez vu. », le téléphone vibre et s'allume, le regard s'y pose et sa fiche s'ouvre ; écouter se fait en maintenant E ou le clic 1 s ; avant le 6e indice, le téléphone se repose ; coup de pouce par une vibration quand la piste du téléphone tombe.

**Spec :** `docs/superpowers/specs/2026-10-11-enquete-fin-design.md` (fait foi). Spec d'origine : `docs/superpowers/specs/2026-10-04-enquete-design.md`.

## Contraintes globales

Toutes celles des lots 0 et 1 (`docs/superpowers/plans/2026-10-07-lot0-corrections.md`, `2026-10-07-lot1-socle-technique.md`) : témoin rouge, `e.code`, commits en français sans trailer ni attribution, auteur `Rayan Madi <madirayan75015@gmail.com>`, aucun tiret cadratin neuf, Chrome sans interface sans port de débogage fixe, serveur 5173 réutilisé, effets atténués respectés (`src/comfort.js`), libérations du lot 1 (rien ne reste après `stop()`).

### Tâche E1 : état et données

**Fichiers :** `src/prologue/state.js`, `src/prologue/clues.js`, `tests/prologue/state.test.js`.
- [x] `PHONE.fin`, `PHONE.vibre`, `PHONE.notif`, `PHONE.reposer` (§3.5 de la spec).
- [x] `allFound`, `phoneCanPutDown`, sous-état de fin piloté par `tick` (étapes du §3.1, temps de jeu seulement, rien pendant la pause), passage en `examining` sur le téléphone à la fin ; REPOSER refusé après les 6 indices. Témoins rouges.
- [x] Commit : `feat(enquete): l'enquête sait qu'elle est finie quand les six indices sont trouvés`
- [x] Relecture de E1 : en effets atténués, la fiche s'ouvre à la fin de la vibration (2,5 s, lettre du §3.1) ; une durée de réplique invalide ne bloque plus la séquence ; le fondu de fin d'`investigation.js` s'appelle `fadingOut` (plus de confusion avec le mode `ending`). Témoins rouges.

### Tâche E2 : la séquence, le maintien, REPOSER, le coup de pouce

**Fichiers :** `src/prologue/investigation.js`, `src/prologue/ambience.js`, `src/prologue/apartment.js`, `src/prologue/enquete.css`, tests `tests/prologue/investigation.test.js`, `tests/prologue/ambience.test.js`.
- [x] Séquence de fin (§3.1) : réplique, vibration (`buzz()`) et lueur de l'écran, pivot lissé du regard (sauf effets atténués), fiche du téléphone ouverte d'elle-même ; contrôleur figé pendant la séquence ; tout libéré à `stop()`.
- [x] Points laissés par la relecture de E1 (avec E1 seul, une fois la séquence finie, l'état est sur le téléphone sans fiche à l'écran et E ou un clic lance `finish('listened')` : rien ne part dans `main` avant E2) : `closeFiche()` ne dégèle plus le contrôleur quand l'état passe en `ending` ; la séquence est pilotée par `state.ending.steps` (chaque étape entrée déclenchée une fois) ; quand la fiche du téléphone s'ouvre d'elle-même, `phoneOpenedAt` et la garde repartent de zéro, ou le maintien les remplace ; la vibration n'est pas coupée par l'ouverture de la fiche (§3.6).
- [x] Maintien 1 s pour écouter (E ou clic gauche), anneau qui se remplit, relâcher annule (§3.2) ; garde de 600 ms retirée si redondante (tests du double-clic toujours verts).
- [x] REPOSER (`KeyR` ou clic droit) avant les 6 indices (§3.3), libellé selon la disposition du clavier.
- [x] Coup de pouce (§3.4).
- [x] Vérification réelle : Chrome sans interface sur `?enquete=1&indices=5`, dernier indice examiné puis fiche fermée, captures de la séquence (réplique, lueur, fiche ouverte) regardées. Chrome sans interface refuse le verrouillage du pointeur : il est simulé dans la page pour le parcours au regard libre (pivot vu, puis fiche ouverte, maintien, cinématique B) ; caméra figée devant la console pour la lueur ; effets atténués : pas de pivot ; REPOSER à 4 indices.
- [x] `docs/superpowers/REPRISE.md` : la question ouverte du téléphone est réglée (REPOSER), la fin de l'enquête décrite en une ligne dans « Où on en est », nombre de tests attendu.
- [x] Commit : `feat(enquete): après le sixième indice, le téléphone vibre et la fiche s'ouvre, écouter se fait en maintenant, le téléphone se repose`
- [x] Relecture de E2 : les touches affichées (E de l'invite, de la carte, de FERMER et de MAINTENIR ; R de REPOSER) suivent la disposition du clavier, mises à jour si elle arrive fiche ouverte ; en effets atténués, ni secousse ni grain à pleine hausse à l'ouverture d'une fiche. Témoins rouges. Notés pour plus tard (spec, précisions de la relecture de E2, et REPRISE.md) : la frappe et la voix d'une réplique en pause, le pivot qui finit sur un mur d'une autre pièce (à juger en jeu).

## Critères de fin

Ceux du §5 de la spec, chaque tâche vue rouge puis verte et relue, relecture finale de la branche, fusion en avance rapide dans `main`, push.
