// ─── Chargement des modèles avant une mission ou une manche, contexte WebGL perdu (spec du lot 1 §4.4) ──────────────
// Les modèles GLB (characters.js) se chargent au démarrage, sans attente : une mission lancée avant la fin du
// chargement aurait des PNJ procéduraux (spawnCharacter renvoie null), jamais libérés comme les autres et visibles
// comme tels. main.js (launchLevel) et pvp.js (départ de manche) passent donc par startWhenReady : départ immédiat
// si les modèles sont prêts (le cas ordinaire, rien ne change), sinon l'écran PRÉPARATION DU DOSSIER, puis départ.
// Sans DOM à l'import : l'écran est un élément d'index.html passé à createLoadingScreen.

// Avancement de 0 à 1. files : un { loaded, total, done } par fichier (total à 0 quand la réponse ne donne pas sa
// taille ; done quand le modèle est chargé et décodé, ou en échec). Par octets reçus quand toutes les tailles sont
// connues, sinon par fichiers (un fichier sans taille compte pour 0 jusqu'à la fin). 1 seulement quand tout est fini :
// les octets d'un modèle sont tous reçus avant son décodage, l'écran ne dit pas 100 % pendant qu'il attend encore.
export function progressOf(files) {
  if (files.every(f => f.done)) return 1
  const p = files.every(f => f.total > 0)
    ? files.reduce((s, f) => s + (f.done ? f.total : Math.min(f.loaded, f.total)), 0) / files.reduce((s, f) => s + f.total, 0)
    : files.reduce((s, f) => s + (f.done ? 1 : f.total > 0 ? Math.min(f.loaded / f.total, 1) : 0), 0) / files.length
  return Math.min(p, 0.99)
}

// Attend les modèles. ready() : promesse du chargement (characters.js) ; progress() : avancement de 0 à 1 ;
// show(p) : affiche l'écran ou met à jour son avancement ; hide() : l'efface. L'écran n'apparaît que si l'attente
// dépasse delayMs (un chargement presque fini ne fait pas clignoter d'écran), son avancement ne recule jamais (le
// décompte passe des fichiers aux octets quand les tailles arrivent), et l'attente s'arrête à timeoutMs : un modèle
// lent ou en échec ne bloque jamais la partie, on part avec ce qui est chargé (repli procédural pour le reste).
// isCurrent() faux : le lancement a été abandonné (mission relancée, manche annulée), l'écran disparaît.
// Ne rejette jamais : { shown, timedOut, failed, cancelled }.
export function waitForCharacters({ ready, progress, show, hide, isCurrent = () => true, timeoutMs = 20000, delayMs = 150, pollMs = 100 }) {
  return new Promise(resolveWait => {
    const t0 = Date.now()
    let shown = false, ended = false, shownP = 0, timer = null
    const end = (outcome) => {
      if (ended) return
      ended = true
      clearTimeout(timer)
      if (shown) hide()
      resolveWait({ shown, timedOut: false, failed: false, cancelled: false, ...outcome })
    }
    const tick = () => {
      if (ended) return
      if (!isCurrent()) return end({ cancelled: true })
      if (Date.now() - t0 >= timeoutMs) return end({ timedOut: true })
      shownP = Math.max(shownP, progress())
      shown = true
      show(shownP)
      timer = setTimeout(tick, Math.min(pollMs, timeoutMs - (Date.now() - t0)))
    }
    timer = setTimeout(tick, Math.min(delayMs, timeoutMs))
    Promise.resolve().then(ready).then(() => end({}), () => end({ failed: true }))
  })
}

// Départ d'une mission ou d'une manche (start) une fois les modèles prêts. settled() vrai : départ dans le même
// appel, sans attente ni écran, exactement comme avant ce lot. Sinon wait() (waitForCharacters), puis départ si le
// lancement est toujours d'actualité (isCurrent : jeton de mission de main.js, manche de pvp.js). Renvoie la promesse
// de l'attente, ou null sans attente.
export function startWhenReady({ settled, wait, start, isCurrent = () => true }) {
  if (settled()) { start(); return null }
  return wait().then(() => { if (isCurrent()) start() })
}

// Écran « PRÉPARATION DU DOSSIER · 63 % » (#loading-screen d'index.html, style des cartes de l'enquête) : libellé,
// barre fine, fondu à l'apparition et à l'effacement (fadeMs, celui du CSS). main.js et pvp.js ont chacun le leur sur
// le même élément : le minuteur de fin de fondu est rangé avec l'élément, un écran réaffiché par l'un annule le
// masquage lancé par l'autre.
const hideTimers = new WeakMap()
export function createLoadingScreen(el, { fadeMs = 350 } = {}) {
  const label = el.querySelector('.ld-label')
  const fill = el.querySelector('.ld-fill')
  const bar = el.querySelector('[role="progressbar"]')
  const cancelHide = () => { clearTimeout(hideTimers.get(el)); hideTimers.delete(el) }
  return {
    show(p) {
      const pct = Math.max(0, Math.min(100, Math.floor(p * 100)))
      label.textContent = `PRÉPARATION DU DOSSIER · ${pct}\u00a0%`
      fill.style.width = pct + '%'
      bar.setAttribute('aria-valuenow', String(pct))
      cancelHide()
      if (el.hidden) {
        el.hidden = false
        void el.offsetWidth   // l'élément vient d'être affiché : le fondu part de l'opacité 0
      }
      el.classList.add('on')
    },
    hide() {
      el.classList.remove('on')
      cancelHide()
      hideTimers.set(el, setTimeout(() => { hideTimers.delete(el); el.hidden = true }, fadeMs))
    },
  }
}

// Contexte WebGL perdu (pilote graphique réinitialisé, mise en veille, carte graphique saturée) : l'événement est
// annulé, sinon le navigateur ne rendrait jamais le contexte, et onLost met la partie en pause derrière l'écran « Le
// rendu a été interrompu ». Contexte rendu : onRestored (le jeu recharge la page ; la sauvegarde est faite à chaque
// réussite). Renvoie la fonction qui retire les écouteurs.
export function watchContextLoss(canvas, { onLost, onRestored }) {
  const lost = e => { e.preventDefault(); onLost(e) }
  const restored = e => onRestored(e)
  canvas.addEventListener('webglcontextlost', lost)
  canvas.addEventListener('webglcontextrestored', restored)
  return () => {
    canvas.removeEventListener('webglcontextlost', lost)
    canvas.removeEventListener('webglcontextrestored', restored)
  }
}
