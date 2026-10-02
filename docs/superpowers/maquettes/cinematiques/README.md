# Maquettes des cinématiques (validées par Rayan)

Source de vérité des cinématiques en motion design « dossier du fixeur » : prologue, briefings des
missions 1 à 6, épilogue. Le jeu ne les charge pas directement : `scripts/port-maquette.mjs` les
convertit en modules de scène (`src/briefing/scenes/`). Toute retouche d'une cinématique se fait ici,
puis on régénère les scènes.

Voir une maquette :

```bash
npx vite docs/superpowers/maquettes/cinematiques --port 5193
```

puis ouvrir `http://localhost:5193/briefing-m3.html` (ou `prologue.html`, `epilogue.html`).
Paramètres utiles : `?freeze=12000` fige la scène à 12 s ; `?port=libres` choisit la variante de
l'épilogue. « Activer le son » sous l'image : bips synthétiques et musique (son 100 % procédural).

Spec : `docs/superpowers/specs/2026-10-02-cinematiques-design.md`.
