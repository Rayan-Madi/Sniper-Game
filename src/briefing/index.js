// Point d'entrée des cinématiques : monte une scène dans #briefing-root (au-dessus du canvas),
// la joue avec le kit, la fait passer (Échap/Entrée/Espace/clic) et la démonte proprement.
import kitCss from './kit.css?raw'
import { createKit } from './kit.js'

const SCENES = {
  m1: () => import('./scenes/m1.js'),
  m2: () => import('./scenes/m2.js'),
  m3: () => import('./scenes/m3.js'),
  m4: () => import('./scenes/m4.js'),
  m5: () => import('./scenes/m5.js'),
  m6: () => import('./scenes/m6.js'),
  epilogue: () => import('./scenes/epilogue.js'),
  'prologue-a': () => import('./scenes/prologue-a.js'),
  'prologue-b': () => import('./scenes/prologue-b.js'),
}
const SKIP_KEYS = new Set(['Escape', 'Enter', 'NumpadEnter', 'Space'])
const FADE_MS = 400
const SKIP_GRACE_MS = 500   // délai de double-clic de Windows : le 2e clic du bouton de lancement ne doit pas passer la scène
let current = null
let generation = 0   // jeton de demande : seule la dernière cinématique demandée est montée

export function registerScene(id, loader) { SCENES[id] = loader }
export function isCinematicPlaying() { return !!current }

function ensureKitStyle() {
  if (document.getElementById('k-kit-css')) return
  const s = document.createElement('style'); s.id = 'k-kit-css'; s.textContent = kitCss
  document.head.appendChild(s)
}

// reducedMotion : effets atténués (spec du lot 1 §4.5), transmis au kit ; main.js le lit dans les réglages et le système.
// ready : promesse que la scène attend pour démarrer, l'écran noir déjà affiché (main.js : la mission montée pendant
// son briefing, spec du lot 1 §4.6, pour que le montage ne fige pas l'animation). Rejetée : la scène démarre quand même.
export async function playCinematic(id, { onDone = () => {}, params = null, freeze = null, audio = null, reducedMotion = false, ready = null, root = document.getElementById('briefing-root') } = {}) {
  const load = SCENES[id]
  if (!load) throw new Error('cinématique inconnue : ' + id)
  const ticket = ++generation
  // fond noir dès le chargement : l'image 3D figée du jeu ne doit pas se voir en attendant la scène
  // (le style du kit donne au conteneur son plein écran et son fond : il doit être là avant de l'afficher)
  ensureKitStyle()
  if (!current) root.hidden = false
  let mod
  try { mod = await load() } catch (error) {
    // seule la dernière demande, sans cinématique en cours, rend la main au jeu ; l'enveloppeur de main.js enchaîne
    if (ticket === generation && !current) root.hidden = true
    throw error
  }
  if (ready) await Promise.resolve(ready).catch(() => {})
  // une demande plus récente est arrivée pendant le chargement : la dernière gagne, celle-ci s'efface sans bruit
  if (ticket !== generation) return { kit: null, stop() {}, cancel() {} }

  // de l'annulation de la précédente jusqu'à `current = handle`, tout est synchrone
  if (current) current.cancel()

  let K = null, sceneStyle = null, ended = false, fadeTimer = 0, readyAt = 0
  // le démontage doit marcher même si le montage a échoué à mi-chemin
  const teardown = () => {
    document.removeEventListener('keydown', onKey, true)
    root.removeEventListener('click', onClick)
    clearTimeout(fadeTimer)
    if (K) K.destroy()
    if (sceneStyle) sceneStyle.remove()
    root.innerHTML = ''; root.hidden = true; root.classList.remove('k-leaving')
    if (current === handle) current = null
  }
  const finish = () => {
    if (ended) return
    ended = true
    try { teardown() } finally { onDone() }
  }
  const skip = () => {
    if (ended || root.classList.contains('k-leaving')) return
    K.destroy()
    root.classList.add('k-leaving')
    fadeTimer = setTimeout(finish, FADE_MS)
  }
  // passage par le joueur (touche, clic) : ignoré pendant le délai de grâce ; handle.stop reste immédiat
  const playerSkip = () => { if (performance.now() >= readyAt) skip() }
  const onKey = e => {
    if (!SKIP_KEYS.has(e.code)) return
    e.preventDefault(); e.stopImmediatePropagation()   // la touche n'atteint jamais le jeu, même ignorée
    if (e.repeat) return                               // touche maintenue : jamais un passage
    playerSkip()
  }
  const onClick = () => playerSkip()
  const handle = { kit: null, stop: skip, cancel: () => { if (!ended) { ended = true; teardown() } } }

  try {
    sceneStyle = document.createElement('style'); sceneStyle.textContent = mod.css
    document.head.appendChild(sceneStyle)
    root.classList.remove('k-leaving')
    root.innerHTML = `<div class="${mod.stClass}" id="st">${mod.html}</div><div class="k-skip">ÉCHAP · ENTRÉE · ESPACE : PASSER</div>`
    root.hidden = false
    K = handle.kit = createKit({ root, audio, freeze, reducedMotion })
    document.addEventListener('keydown', onKey, true)
    root.addEventListener('click', onClick)
    current = handle
    readyAt = performance.now() + SKIP_GRACE_MS
    const search = params ? '?' + new URLSearchParams(params).toString() : ''
    mod.start(K, { search })
    K.finished.then(finish)
  } catch (error) {
    // on ouvre la voie : démontage complet, onDone une fois, aucune exception pour l'appelant
    console.error('[briefing] cinématique « ' + id + ' » abandonnée :', error)
    try { finish() } catch (e) { console.error('[briefing] démontage après erreur :', e) }
    return { kit: K, error, stop() {}, cancel() {} }
  }
  return handle
}
