// Serveur des maquettes (npx vite docs/superpowers/maquettes/cinematiques --port 5193).
// Cache à part : sans lui, ce serveur partage node_modules/.vite avec celui du jeu, ré-optimise
// les dépendances à son démarrage (config différente) et efface three du cache du jeu, qui répond
// alors 504 « Outdated Optimize Dep » tant qu'on ne le relance pas.
export default {
  cacheDir: '../../../../node_modules/.vite-maquettes',
}
