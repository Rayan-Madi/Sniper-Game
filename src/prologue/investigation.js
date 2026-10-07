// Enquête du prologue : le chef d'orchestre. Monte l'appartement dans une scène à lui (rendue par le renderer et la
// caméra du jeu), le déplacement, la visée, le son et l'interface « dossier du fixeur » ; démonte tout à la fin.
// startInvestigation(...) → { scene, update(dt), stop(), debug } ; onDone({ result }) une seule fois, jamais pendant
// l'appel (spec docs/superpowers/specs/2026-10-04-enquete-design.md, tâche 6 du plan 3).
import * as THREE from 'three'
import css from './enquete.css?raw'
import { CLUES, PHONE } from './clues.js'
import { createInvestigationState } from './state.js'
import { createFpsController } from './fpsController.js'
import { buildApartment } from './apartment.js'
import { createInteract } from './interact.js'
import { createAmbience } from './ambience.js'
import { estimate } from '../briefing/kit.js'
import { settings } from '../settings.js'

const END_MS = 700          // noir de fin, puis démontage et onDone
const GLITCH_MS = 250
const SUB_HOLD_MS = 2200    // un sous-titre reste lisible ce temps-là après sa réplique
const PHOTO_W = 640         // largeur de l'instantané (4:3)
const PHOTO_CROP = 0.74     // part du cadre 4:3 central gardée : l'objet visé, un peu rapproché
const pad = n => String(n).padStart(2, '0')
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Développe l'instantané comme une photo au flash : la nuit rendue est trop sombre pour une photo lisible, on étire
// donc ses niveaux (du 2ᵉ au 99,6ᵉ centile de la luminance), puis un éclat au centre et un vignetage aux bords.
function develop(g, w, h) {
  const img = g.getImageData(0, 0, w, h), d = img.data, hist = new Uint32Array(256), n = d.length / 4
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++
  let lo = 0, hi = 255, acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break } }
  acc = 0
  for (let v = 255; v > 0; v--) { acc += hist[v]; if (acc > n * 0.004) { hi = v; break } }
  const span = Math.max(40, hi - lo), lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / span)), 0.9)
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]] }
  g.putImageData(img, 0, 0)
  const r = Math.hypot(w, h) / 2
  const flash = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r * 0.6)
  flash.addColorStop(0, 'rgba(255,248,232,.1)'); flash.addColorStop(1, 'rgba(255,248,232,0)')
  g.globalCompositeOperation = 'screen'; g.fillStyle = flash; g.fillRect(0, 0, w, h)
  const vig = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r)
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.6)')
  g.globalCompositeOperation = 'source-over'; g.fillStyle = vig; g.fillRect(0, 0, w, h)
}

// libellé d'une touche sans la carte du clavier : KeyW → W, Digit1 → 1, ArrowUp → ↑
const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }
const keyLabel = code => ARROWS[code] || (code === 'Space' ? 'ESPACE' : String(code || '?').replace(/^(Key|Digit|Numpad)/, '').toUpperCase())

const HTML = `
  <div class="enq-fx"><div class="enq-scan"></div><div class="enq-vig"></div><div class="enq-grain"></div></div>
  <div class="enq-count" id="enq-count">INDICES <b>0</b> / 6</div>
  <div class="enq-time" id="enq-time"><i>●</i> 14/03 · 21:47</div>
  <div class="enq-cross"></div>
  <div class="enq-prompt" id="enq-prompt"><b>E</b> — EXAMINER</div>
  <div class="enq-sub" id="enq-sub"><span class="spk">VIKTOR</span><span class="tx"></span></div>
  <div class="enq-fiche" id="enq-fiche">
    <div class="enq-tab"></div>
    <div class="enq-photo"><img alt=""><span class="mk"></span><span class="lieu"></span><span class="stamp">14 03 · 21:47</span></div>
    <div class="enq-body">
      <h3></h3>
      <div class="enq-quote" hidden></div>
      <div class="enq-calls" hidden></div>
      <div class="enq-line"><span class="spk">VIKTOR</span><span class="tx"></span></div>
      <div class="enq-line" hidden><span class="spk">VIKTOR</span><span class="tx"></span></div>
      <div class="enq-act"></div>
    </div>
  </div>
  <div class="enq-black" id="enq-black"></div>
  <div class="enq-card" id="enq-card">
    <div class="d">14 MARS · 21:47</div>
    <div class="l"></div>
    <div class="k"></div>
    <div class="go">CLIQUER POUR COMMENCER</div>
  </div>
  <div class="enq-pause" id="enq-pause" hidden>
    <h2>PAUSE</h2>
    <button type="button" id="enq-resume">REPRENDRE</button>
    <button type="button" id="enq-skip">PASSER L'ENQUÊTE</button>
  </div>`

export function startInvestigation({ renderer, camera, audio = null, root = document.body, onDone = () => {}, options = {} } = {}) {
  const opts = options || {}
  const cam = opts.cam || null
  // minuteurs suivis : tous annulés au démontage
  const timers = new Set()
  const at = (ms, fn) => { const h = setTimeout(() => { timers.delete(h); fn() }, ms); timers.add(h); return h }
  const cancel = h => { if (h) { clearTimeout(h); timers.delete(h) } }

  let apartment = null, scene = null, state = null, controller = null, interact = null, amb = null
  let saved = null, savedAuto = null, style = null, ui = null, $ = () => null
  let ready = false, started = false, ending = false, stopped = false, reported = false
  let glitchTimer = 0, subTimer = 0, lineTimer = 0
  const listening = []   // [cible, type, fonction] à retirer au démontage

  const report = payload => {
    if (reported) return
    reported = true
    try { onDone(payload) } catch (e) { console.error('[enquête]', e) }
  }
  const listen = (target, type, fn) => { target.addEventListener(type, fn); listening.push([target, type, fn]) }
  const locked = () => !!document.pointerLockElement

  // ── frappe : une réplique par élément, la nouvelle annule d'abord celle en cours (E pressé deux fois) ──
  const typing = new Map()
  function untype(el) { cancel(typing.get(el)); typing.delete(el) }
  function type(el, text, dur) {
    untype(el)
    el.textContent = ''
    const chars = [...text], step = dur / Math.max(1, chars.length)
    let i = 0
    const next = () => {
      el.textContent += chars[i++]
      if (i < chars.length) typing.set(el, at(step, next)); else typing.delete(el)
    }
    typing.set(el, at(0, next))
  }
  // une réplique de Viktor : frappe en 0,8 × sa durée estimée, et sa voix intérieure
  function speakInto(el, text) { type(el, text, 0.8 * estimate(text)); amb.speak(text) }

  // sous-titre en bas d'écran (verrou du téléphone, pistes)
  function say(text) {
    const sub = $('#enq-sub')
    speakInto(sub.querySelector('.tx'), text)
    sub.classList.add('on')
    cancel(subTimer)
    subTimer = at(estimate(text) + SUB_HOLD_MS, () => { subTimer = 0; sub.classList.remove('on') })
  }
  function hush() {
    const sub = $('#enq-sub')
    untype(sub.querySelector('.tx')); cancel(subTimer); subTimer = 0
    sub.classList.remove('on')
  }

  function glitch() {
    ui.classList.add('gl'); amb.glitch()
    cancel(glitchTimer)
    glitchTimer = at(GLITCH_MS, () => { glitchTimer = 0; ui.classList.remove('gl') })
  }

  function setCount(n, flash) {
    const el = $('#enq-count')
    el.innerHTML = `INDICES <b>${n}</b> / ${state.total}`
    if (flash) { el.classList.remove('up'); void el.offsetWidth; el.classList.add('up') }
  }

  function aim(on) {
    $('.enq-cross').classList.toggle('on', on)
    $('#enq-prompt').classList.toggle('on', on)
  }

  // Instantané de ce que regarde Viktor : rendu de l'image, recadré en 4:3 au centre (l'objet visé) dans une petite
  // toile 2D, développé, encodé en JPEG. Sans image (pas de WebGL, toile refusée), la photo reste noire.
  function snapshot() {
    try {
      renderer.render(scene, camera)
      const src = renderer.domElement, w = src.width, h = src.height
      const c = document.createElement('canvas'); c.width = PHOTO_W; c.height = PHOTO_W * 3 / 4
      const g = w && h ? c.getContext('2d') : null
      if (!g) return src.toDataURL('image/jpeg', 0.85)
      const cw = Math.min(w, h * 4 / 3) * PHOTO_CROP, ch = cw * 3 / 4
      g.drawImage(src, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, c.width, c.height)
      try { develop(g, c.width, c.height) } catch (e) { /* photo brute */ }
      return c.toDataURL('image/jpeg', 0.85)
    } catch (e) { return null }
  }

  // ── la fiche ──
  function openFiche({ tab, mark, lieu, titre, quote = null, calls = null, lines, act, go = false }) {
    const fiche = $('#enq-fiche')
    interact.clear(); aim(false)           // la photo montre l'objet sans sa surbrillance
    hush()
    controller.setFrozen(true)
    const img = fiche.querySelector('img'), src = snapshot()
    if (src) img.src = src; else img.removeAttribute('src')
    fiche.querySelector('.enq-tab').textContent = tab
    const mk = fiche.querySelector('.mk'); mk.textContent = mark || ''; mk.hidden = !mark
    fiche.querySelector('.lieu').textContent = lieu
    fiche.querySelector('h3').textContent = titre
    const q = fiche.querySelector('.enq-quote'); q.hidden = !quote; q.textContent = quote ? `« ${quote} »` : ''
    const list = fiche.querySelector('.enq-calls'); list.hidden = !calls
    list.innerHTML = calls ? calls.map(a => `<div><b>${esc(a.de)} · ${esc(a.heure)}</b><small>${esc(a.note)}</small></div>`).join('') : ''
    const actEl = fiche.querySelector('.enq-act'); actEl.innerHTML = `<b>E</b> — ${esc(act)}`; actEl.classList.toggle('go', !!go)
    // phrases de Viktor : la première tout de suite, la suivante après la fin estimée de la précédente + 400 ms
    const rows = [...fiche.querySelectorAll('.enq-line')]
    rows.forEach(r => { untype(r.querySelector('.tx')); r.querySelector('.tx').textContent = ''; r.hidden = true })
    cancel(lineTimer); lineTimer = 0
    let delay = 0
    lines.slice(0, rows.length).forEach((text, i) => {
      const row = rows[i], go = () => { row.hidden = false; speakInto(row.querySelector('.tx'), text) }
      if (!delay) go(); else lineTimer = at(delay, () => { lineTimer = 0; go() })
      delay += estimate(text) + 400
    })
    fiche.classList.add('on')
    glitch()
  }
  function closeFiche() {
    const fiche = $('#enq-fiche')
    cancel(lineTimer); lineTimer = 0
    fiche.querySelectorAll('.enq-line .tx').forEach(untype)
    fiche.classList.remove('on')
    state.close()
    controller.setFrozen(false)
  }

  function examine(id) {
    const r = state.examine(id)
    if (!r) return
    if (r.type === 'phone-locked') { say(r.line); return }
    if (r.type === 'phone') {
      const p = r.phone, n = p.appels.length
      openFiche({ tab: p.titre, lieu: p.lieu, titre: `${n} APPEL${n > 1 ? 'S' : ''} MANQUÉ${n > 1 ? 'S' : ''}`, calls: p.appels, lines: p.viktor, act: p.action, go: true })
      return
    }
    const c = r.clue
    openFiche({ tab: `INDICE ${pad(c.n)} / ${pad(r.total)}`, mark: String(c.n), lieu: c.lieu, titre: c.titre, quote: c.citation || null, lines: [c.viktor], act: 'FERMER' })
    if (c.acouphene) amb.tinnitus()
    setCount(r.count, r.first)
  }

  // E ou clic gauche : examiner ce qu'on vise, fermer la fiche, ou écouter le message
  function act() {
    if (!started || ending || stopped) return
    if (state.mode === 'exploring') { if (interact.current) examine(interact.current) }
    else if (state.mode === 'examining') { if (state.current === PHONE.id) finish('listened'); else closeFiche() }
  }

  // ── départ, pause, fin ──
  function startSound() {
    // la pluie ne démarre que si le contexte tourne : s'il dort encore, on le relance et on démarre après
    const ctx = audio && audio.ctx
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      const go = () => { if (!stopped) amb.start() }
      try { ctx.resume().then(go, go) } catch (e) { go() }
    } else amb.start()
  }
  function begin() {
    started = true
    startSound()
    apartment.openDoor()
    const black = $('#enq-black'); void black.offsetWidth; black.classList.add('off')
    if (opts.ouvrir) examine(opts.ouvrir)
  }
  function requestLock() {
    if (stopped || ending) return
    if (locked()) onLockChange(); else controller.lock(renderer.domElement)
  }
  function onLockChange() {
    if (stopped || ending || !locked()) return     // la perte du verrou passe par onUnlock du contrôleur
    $('#enq-card').hidden = true; $('#enq-pause').hidden = true
    state.resume()
    controller.setFrozen(state.mode !== 'exploring')   // la pause a figé le contrôleur ; une fiche ouverte reste figée
    if (!started) begin()
  }
  function pause() {
    if (!started || ending || stopped || cam) return
    state.pause()
    controller.setFrozen(true)
    aim(false)
    $('#enq-pause').hidden = false
  }
  function finish(result) {
    if (ending || stopped) return
    ending = true
    if (state) state.finish(result)
    const black = $('#enq-black')
    if (black) { black.classList.add('end'); black.classList.remove('off') }
    if ($('#enq-card')) $('#enq-card').hidden = true
    if ($('#enq-pause')) $('#enq-pause').hidden = true
    if (controller) controller.setFrozen(true)
    at(END_MS, () => { stop(); report({ result }) })
  }

  // ── écouteurs ──
  const guard = fn => e => { try { fn(e) } catch (error) { fail(error) } }
  const onKey = guard(e => { if (e.code === 'KeyE' && !e.repeat) act() })
  const onMouse = guard(e => { if (e.button === 0 && locked()) act() })
  const onLock = guard(onLockChange)
  // fenêtre quittée (Alt-Tab) : les touches tenues ne recevront pas leur keyup → on les relâche
  const onBlur = () => { if (controller && !controller.frozen) { controller.setFrozen(true); controller.setFrozen(false) } }

  // une erreur en cours de route ne bloque pas la partie : on termine en « error »
  function fail(error) {
    console.error('[enquête]', error)
    if (stopped) return
    if (!ending) { ending = true; if (state) state.finish('error') }
    stop()
    report({ result: 'error', error })
  }

  // ── démontage : idempotent, ne lève jamais ──
  function stop() {
    if (stopped) return
    stopped = true
    const safe = fn => { try { fn() } catch (e) { console.error('[enquête] démontage :', e) } }
    for (const [t, type, fn] of listening) safe(() => t.removeEventListener(type, fn))
    listening.length = 0
    timers.forEach(clearTimeout); timers.clear(); typing.clear()
    if (controller) safe(() => controller.dispose())
    if (interact) safe(() => interact.clear())
    if (amb) safe(() => amb.stop())
    if (apartment) safe(() => apartment.dispose())
    if (scene) safe(() => scene.clear())
    if (saved) safe(() => {
      camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far
      camera.position.copy(saved.position)
      camera.rotation.order = saved.order
      camera.quaternion.copy(saved.quaternion)
      camera.updateProjectionMatrix()
    })
    if (savedAuto !== null) safe(() => { renderer.shadowMap.autoUpdate = savedAuto })
    safe(() => { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock() })
    if (ui) safe(() => ui.remove())
    if (style) safe(() => style.remove())
  }

  // ── montage ──
  try {
    apartment = buildApartment()
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x05070c)
    scene.fog = new THREE.Fog(0x05070c, 6, 22)
    scene.add(apartment.group)

    // caméra et ombres du jeu : sauvegardées avant toute retouche (le contrôleur change l'ordre de rotation)
    saved = { fov: camera.fov, near: camera.near, far: camera.far, position: camera.position.clone(), quaternion: camera.quaternion.clone(), order: camera.rotation.order }
    camera.fov = 72; camera.near = 0.05; camera.far = 40
    camera.updateProjectionMatrix()
    savedAuto = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false     // l'ombre de la lampe est calculée une fois, puis figée
    renderer.shadowMap.needsUpdate = true

    state = createInvestigationState({ anchors: apartment.anchors, found: CLUES.slice(0, opts.indices || 0).map(c => c.id) })
    amb = createAmbience(audio)
    controller = createFpsController({ camera, colliders: apartment.colliders, start: apartment.start,
      onStep: () => amb.step(), onUnlock: () => pause() })
    interact = createInteract({ camera, targets: apartment.targets, occluders: apartment.occluders })
    if (cam) controller.setPose(cam)
    controller.update(0)
    scene.updateMatrixWorld()
    try { renderer.compile(scene, camera) } catch (e) { /* précompilation facultative */ }

    // interface (sans z-index : l'ordre du DOM fait l'empilement — le noir couvre la fiche, la carte et la pause le noir)
    style = document.createElement('style'); style.id = 'enq-css'; style.textContent = css
    document.head.appendChild(style)
    ui = document.createElement('div'); ui.id = 'enq-root'; ui.className = 'enq'
    ui.innerHTML = HTML
    if (opts.stats) ui.insertAdjacentHTML('beforeend', '<div class="enq-stats" id="enq-stats"></div>')
    root.appendChild(ui)
    $ = sel => ui.querySelector(sel)
    setCount(state.count, false)
    showKeys()

    $('#enq-card').addEventListener('click', guard(requestLock))
    $('#enq-resume').addEventListener('click', guard(requestLock))
    $('#enq-skip').addEventListener('click', guard(() => finish('skipped')))
    controller.enable()
    listen(document, 'keydown', onKey)
    listen(document, 'mousedown', onMouse)
    listen(document, 'pointerlockchange', onLock)
    listen(window, 'blur', onBlur)
    ready = true

    // caméra figée (captures, réglages) : pas de verrouillage ni de carte, l'enquête commence tout de suite
    if (cam) { $('#enq-card').hidden = true; begin() }
  } catch (error) {
    console.error('[enquête] démarrage impossible :', error)
    stop()
    queueMicrotask(() => report({ result: 'error', error }))
  }

  // ligne des commandes de la carte : libellés réels du clavier quand le navigateur les donne (AZERTY compris)
  function showKeys() {
    const k = settings.pvpKeys, codes = [k.forward, k.left, k.back, k.right]
    const render = labels => {
      const el = $('.enq-card .k'); if (!el) return
      const kb = s => `<kbd>${esc(s)}</kbd>`
      el.innerHTML = `<span>${labels.map(kb).join('')} SE DÉPLACER</span><i></i><span>SOURIS — REGARDER</span><i></i>` +
        `<span>${kb('E')} EXAMINER</span><i></i><span>${kb('ÉCHAP')} PAUSE</span>`
    }
    render(codes.map(keyLabel))
    try {
      const kbd = navigator.keyboard
      if (kbd && typeof kbd.getLayoutMap === 'function') {
        kbd.getLayoutMap().then(map => { if (!stopped) render(codes.map(c => (map.get(c) || keyLabel(c)).toUpperCase())) }, () => {})
      }
    } catch (e) { /* libellés dérivés des codes */ }
  }

  const statsEl = ready ? $('#enq-stats') : null
  return {
    scene,
    debug: { state, apartment, interact, controller },
    stop,
    update(dt) {
      if (stopped || !ready) return
      dt = Math.min(Math.max(dt || 0, 0), 0.1)
      apartment.update(dt)
      if (cam) { controller.setPose(cam); controller.update(0) }
      else controller.update(started && !ending && state.mode === 'exploring' && locked() ? dt : 0)
      scene.updateMatrixWorld()   // la visée lit les matrixWorld des cibles (sans rendu préalable, elles valent l'identité)
      const exploring = started && !ending && state.mode === 'exploring'
      if (exploring) aim(!!interact.update())
      else aim(false)
      if (started && !ending) {
        const c = apartment.anchors.corps, p = controller.position
        if (c) amb.setProximity(1 - (Math.hypot(p.x - c.x, p.z - c.z) - 1.5) / 6)
        const hint = state.tick(dt, p)
        if (hint) say(hint)
      }
      if (statsEl) statsEl.textContent = `appels ${renderer.info.render.calls} · triangles ${renderer.info.render.triangles}`
    },
  }
}
