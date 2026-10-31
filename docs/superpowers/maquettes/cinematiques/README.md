# Maquettes des cinématiques (validées par Rayan)

Source de vérité des cinématiques en motion design « dossier du fixeur » : prologue, briefings des
missions 1 à 6, épilogue. Le jeu ne les charge pas directement : `scripts/port-maquette.mjs` les
convertit en modules de scène (`src/briefing/scenes/`). Toute retouche d'une cinématique se fait ici,
puis on régénère les scènes.

Voir une maquette :

```bash
npx vite docs/superpowers/maquettes/cinematiques --port 5193
```

puis ouvrir `http://localhost:5193/briefing-m3.html` (ou `prologue-a.html`, `prologue-b.html`, `epilogue.html`).

Le prologue du jeu est en deux pièces : `prologue-a.html` (l'offre, le refus, le soir du 14 mars) et
`prologue-b.html` (le message de sa femme, l'appel d'Anton, le dossier et le tableau de chasse). L'enquête jouable s'insérera entre les
deux. `prologue.html` est l'ancienne version longue validée, gardée comme référence : elle n'est pas convertie.

Paramètres utiles : `?freeze=12000` fige la scène à 12 s ; `?port=libres` choisit la variante de
l'épilogue ; `?attenue=1` joue la version en effets atténués, comme le réglage du jeu (l'étiquette sous l'image
le dit, et donne la p95 des durées d'image hors gel). « Activer le son » sous l'image : bips synthétiques et
musique (son 100 % procédural).

`controle-outils.html` n'est pas une scène (jamais convertie) : page de contrôle des outils communs des
cinématiques v2 (gel exact de `K.anim`, encre et papier), à ouvrir avec `?freeze=1000`.

Règles gardées par les tests sur les scènes régénérées (spec cinématiques v2, §3.1 et §3.3) : toute animation
répétée (`infinite`, ou plus d'un tour) a sa règle jumelle, même sélecteur avec `.k-reduced` sur la classe de scène
(`.pro.k-reduced .hh`), qui met `animation: none` ou une autre animation, jouée une fois ; en effets atténués, rien ne
se répète hors liste blanche, et aucune animation ne se pose hors des feuilles, ni par un attribut `style` ni par le
script (`tests/briefing/attenue.test.js`) ; un `@keyframes` n'anime que
`transform`, `opacity` ou `stroke-dashoffset`, et le script n'a ni `setInterval`, ni `element.animate`, ni SMIL, ni
`Math.random` : tout tirage passe par `K.graine` (`tests/briefing/rendu.test.js`) ; aucun tiret cadratin dans ce que
le joueur voit (`tests/briefing/textes-scenes.test.js`).

Spec : `docs/superpowers/specs/2026-10-02-cinematiques-design.md`.
