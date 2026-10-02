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
}
const SKIP_KEYS = new Set(['Escape', 'Enter', 'Space'])
const FADE_MS = 400
let current = null

export function registerScene(id, loader) { SCENES[id] = loader }
export function isCinematicPlaying() { return !!current }

function ensureKitStyle() {
  if (document.getElementById('k-kit-css')) return
  const s = document.createElement('style'); s.id = 'k-kit-css'; s.textContent = kitCss
  document.head.appendChild(s)
}

export async function playCinematic(id, { onDone = () => {}, params = null, freeze = null, audio = null, root = document.getElementById('briefing-root') } = {}) {
  const load = SCENES[id]
  if (!load) throw new Error('cinématique inconnue : ' + id)
  if (current) current.cancel()
  const mod = await load()

  ensureKitStyle()
  const sceneStyle = document.createElement('style'); sceneStyle.textContent = mod.css
  document.head.appendChild(sceneStyle)
  root.classList.remove('k-leaving')
  root.innerHTML = `<div class="${mod.stClass}" id="st">${mod.html}</div><div class="k-skip">ÉCHAP · ENTRÉE · ESPACE — PASSER</div>`
  root.hidden = false
  const K = createKit({ root, audio, freeze })

  let ended = false, fadeTimer = 0
  const teardown = () => {
    document.removeEventListener('keydown', onKey, true)
    root.removeEventListener('click', onClick)
    clearTimeout(fadeTimer)
    K.destroy(); sceneStyle.remove()
    root.innerHTML = ''; root.hidden = true; root.classList.remove('k-leaving')
    if (current === handle) current = null
  }
  const finish = () => { if (ended) return; ended = true; teardown(); onDone() }
  const skip = () => {
    if (ended || root.classList.contains('k-leaving')) return
    K.destroy()
    root.classList.add('k-leaving')
    fadeTimer = setTimeout(finish, FADE_MS)
  }
  const onKey = e => {
    if (!SKIP_KEYS.has(e.code)) return
    e.preventDefault(); e.stopImmediatePropagation()
    skip()
  }
  const onClick = () => skip()
  document.addEventListener('keydown', onKey, true)
  root.addEventListener('click', onClick)

  const handle = { kit: K, stop: skip, cancel: () => { if (!ended) { ended = true; teardown() } } }
  current = handle
  const search = params ? '?' + new URLSearchParams(params).toString() : ''
  mod.start(K, { search })
  K.finished.then(finish)
  return handle
}
