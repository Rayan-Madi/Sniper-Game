// Moteur des cinématiques « dossier du fixeur », porté des maquettes (docs/superpowers/maquettes/cinematiques/kit.js).
// Une cinématique est une suite de TEMPS : chaque temps peut faire parler quelqu'un (bips synthétiques
// + sous-titre tapé) et déclencher des effets à des instants relatifs à son début. Un temps dure le temps
// de sa réplique. freeze = ms : sans glitch, tout se fige à cet instant (captures de contrôle).
import { createSound } from './sound.js'

export const estimate = text => 350 + text.length * 62

const STATE_CLASSES = ['on', 'off', 'out', 'lock', 'dev', 'side', 'talk', 'shake', 'gl']
const kindOf = who => (who === 'PHONE' ? 'phone' : who === 'VIKTOR' ? 'inner' : 'radio')

const OVERLAYS = '<div class="flick"></div><div class="blackframe" id="k-bf"></div><div class="track"></div><div class="scan"></div>' +
  '<div class="vig"></div><div class="grain"></div><div class="lost" id="k-lost">▌▌ SIGNAL PERDU<small>RECONNEXION…</small></div><div class="black" id="k-black"></div>'
const GLITCH_FILTER = `<svg width="0" height="0" style="position:absolute"><filter id="k-glf" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
  <feTurbulence id="k-glt" type="fractalNoise" baseFrequency="0.00001 0.09" numOctaves="1" seed="3" result="noise"/>
  <feDisplacementMap id="k-gld" in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="B" result="disp"/>
  <feColorMatrix in="disp" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
  <feOffset id="k-glo1" in="r" dx="0" dy="0" result="r2"/>
  <feColorMatrix in="disp" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb"/>
  <feOffset id="k-glo2" in="gb" dx="0" dy="0" result="gb2"/>
  <feBlend in="r2" in2="gb2" mode="screen"/></filter></svg>`
const RADIO_DEFAULT = '<span class="dot">●</span><span>CANAL SÉCURISÉ · ANTON, FIXEUR</span><span class="eq"><i></i><i></i><i></i><i></i><i></i></span>'

export function createKit({ root, audio = null, freeze = null } = {}) {
  const K = { errors: [], frozen: false }
  const fail = msg => { K.errors.push(String(msg)); console.error('[briefing]', msg) }
  const $ = id => root.querySelector('#' + id)
  const el = x => (typeof x === 'string' ? $(x) : x)
  K.$ = $

  // ── minuteurs suivis : destroy() et le gel les annulent tous ──
  const timers = new Set(), intervals = new Set()
  let destroyed = false
  const at = (ms, fn) => {
    const h = setTimeout(() => { timers.delete(h); if (destroyed) return; try { fn() } catch (e) { fail(e && e.stack || e) } }, ms)
    timers.add(h); return h
  }
  const every = (ms, fn) => {
    const h = setInterval(() => { if (destroyed) return; try { fn() } catch (e) { fail(e && e.stack || e) } }, ms)
    intervals.add(h); return h
  }
  const stopEvery = h => { clearInterval(h); intervals.delete(h) }
  const clearAll = () => { timers.forEach(clearTimeout); timers.clear(); intervals.forEach(clearInterval); intervals.clear() }
  const wait = ms => new Promise(r => at(ms, r))
  const raf = cb => at(16, cb)   // ~60 i/s, minuteur suivi : annulé par destroy() et au gel
  K.at = at

  const S = K.snd = createSound(audio, { at, every, stopEvery })

  K.on = (x, c = 'on') => { const e = el(x); if (e) e.classList.add(c); else fail('élément introuvable : ' + x) }
  K.off = (x, c = 'on') => { const e = el(x); if (e) e.classList.remove(c) }
  K.type = (x, text, dur, tick = false) => {
    const e = el(x); if (!e) return fail('élément introuvable : ' + x)
    e.textContent = ''
    const step = dur / Math.max(1, text.length)
    ;[...text].forEach((ch, i) => at(step * i, () => { e.textContent += ch; if (tick && ch !== ' ') S.tick() }))
  }

  // ── habillage injecté ──
  const st = $('st'), scene = $('scene')
  if (!st || !scene) throw new Error('la scène doit contenir #st et #scene')
  // préchargement : transitions coupées le temps de poser l'état de départ, rétablies deux images plus tard
  const preload = () => { st.classList.add('k-preload'); raf(() => raf(() => st.classList.remove('k-preload'))) }
  preload()
  st.insertAdjacentHTML('afterbegin', '<div class="crt" id="k-crt"></div>')
  st.insertAdjacentHTML('beforeend', OVERLAYS)
  root.insertAdjacentHTML('beforeend', GLITCH_FILTER + '<div class="kctrl" hidden><button id="k-replay"></button><span id="k-lbl"></span></div>')
  const radio = $('radio')
  if (radio && !radio.children.length) radio.innerHTML = RADIO_DEFAULT
  const wave = $('wave')
  if (wave) for (let i = 0; i < 56; i++) wave.appendChild(document.createElement('i'))

  // ── glitch : déchirure horizontale + séparation RVB + rafale de parasites ──
  const gT = $('k-glt'), gD = $('k-gld'), gO1 = $('k-glo1'), gO2 = $('k-glo2'), bf = $('k-bf')
  let glitchUntil = 0, glitchPow = 0, glitchIv = 0
  // fin d'un glitch, ou glitch coupé par « rejouer » : filtre, déchirure et rafale retirés
  const calm = () => {
    if (glitchIv) { stopEvery(glitchIv); glitchIv = 0 }
    glitchUntil = 0; glitchPow = 0
    scene.style.filter = ''; scene.style.transform = ''; st.classList.remove('gl'); bf.classList.remove('on'); gD.setAttribute('scale', 0)
  }
  K.glitch = (ms, pow) => {
    if (freeze !== null || destroyed) return
    S.glitch(ms, pow)
    glitchUntil = Math.max(glitchUntil, performance.now() + ms); glitchPow = Math.max(glitchPow, pow)
    if (glitchIv) return
    scene.style.filter = 'url(#k-glf)'; st.classList.add('gl')
    glitchIv = every(45, () => {
      if (performance.now() > glitchUntil) { calm(); return }
      const p = glitchPow
      gT.setAttribute('seed', Math.floor(Math.random() * 999))
      gT.setAttribute('baseFrequency', `0.00001 ${(0.03 + Math.random() * 0.12).toFixed(3)}`)
      gD.setAttribute('scale', (Math.random() * 70 * p).toFixed(1))
      const dx = (2 + Math.random() * 9) * p
      gO1.setAttribute('dx', dx.toFixed(1)); gO2.setAttribute('dx', (-dx).toFixed(1))
      scene.style.transform = Math.random() < 0.35 * p ? `translate(${((Math.random() - 0.5) * 2 * p).toFixed(2)}cqw, ${((Math.random() - 0.5) * 3 * p).toFixed(2)}cqw) skewX(${((Math.random() - 0.5) * 4 * p).toFixed(1)}deg)` : ''
      bf.classList.toggle('on', p > 0.7 && Math.random() < 0.12)
    })
  }
  const idleGlitch = () => at(1100 + Math.random() * 2600, () => { K.glitch(70 + Math.random() * 110, 0.22 + Math.random() * 0.3); idleGlitch() })
  if (freeze === null) idleGlitch()

  // ── petits outils de mise en scène ──
  K.music = mode => S.music(mode)
  K.shake = () => { st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake') }
  K.crt = () => { K.on('k-crt'); S.crt() }
  K.lost = (ms = 400) => { S.lost(); K.glitch(ms + 250, 1); K.on('k-lost'); at(ms, () => K.off('k-lost')) }
  K.title = () => { K.on('title'); S.boom(); K.glitch(200, 0.7) }
  K.black = () => K.on('k-black')
  // Compteurs en cours : au gel, chacun affiche sa valeur à l'instant du gel (une capture gelée ne ment pas).
  const counters = new Set()
  K.counter = (x, from, to, dur, suffix = '', tickEvery = 0) => {
    const e = el(x); if (!e) return fail('élément introuvable : ' + x)
    const s = performance.now(); let last = null
    const show = () => {
      const k = Math.min(1, (performance.now() - s) / dur), v = Math.round(from + (to - from) * k)
      e.textContent = v + suffix
      return [k, v]
    }
    const f = () => {
      if (K.frozen || destroyed) return
      const [k, v] = show()
      if (tickEvery && freeze === null && Math.floor(v / tickEvery) !== last) { last = Math.floor(v / tickEvery); S.count() }
      if (k < 1) raf(f); else counters.delete(show)
    }
    counters.add(show)
    f()
  }
  let waveOn = false
  K.wave = on => {
    waveOn = on
    const bars = wave ? [...wave.children] : []
    const tick = () => {
      if (!waveOn || K.frozen) { bars.forEach(b => { b.style.height = '6%' }); return }
      bars.forEach((b, i) => { const env = Math.sin((i / bars.length) * Math.PI); b.style.height = (8 + Math.random() * 88 * env) + '%' })
      at(90, tick)
    }
    tick()
  }

  // ── voix : bips synthétiques ; le temps dure l'estimation de la réplique ──
  K.speak = (text, who) => {
    const est = estimate(text), kind = kindOf(who)
    if (freeze !== null) return wait(est)
    S.voice(kind, true)
    return wait(est).then(() => S.stopVoice(kind === 'radio'))
  }

  // ── séquenceur ──
  let runId = 0, cfg = null, resolveDone
  K.finished = new Promise(r => { resolveDone = r })
  function reset() {
    // Le passage précédent s'arrête net : frappes, repères, attentes, compteurs, ondes (minuteurs suivis). L'habillage
    // du kit, suivi dans le même registre, repart aussitôt : glitch soldé, préchargement, parasites au repos.
    clearAll(); calm(); preload()
    if (freeze === null) idleGlitch()
    K.frozen = false; st.classList.remove('k-frozen'); counters.clear()
    S.stopVoice(); S.music(null); K.wave(false)
    const cls = [...STATE_CLASSES, ...((cfg && cfg.stateClasses) || [])]
    ;[st, ...st.querySelectorAll('*')].forEach(e => { if (e.classList) cls.forEach(c => e.classList.remove(c)) })
    st.querySelectorAll('[data-reset]').forEach(e => { if (e.dataset.reset !== 'keep') e.textContent = '' })
    for (const id of ['sub', 'trans']) { const e = $(id); if (e) e.textContent = '' }
    if (cfg && cfg.reset) cfg.reset(K)
  }
  function showLine(b) {
    const who = b.who || 'ANTON'
    const typeDur = estimate(b.say) * 0.8
    if (who === 'PHONE' && $('trans') && b.into !== 'sub') { K.type('trans', b.say, typeDur); K.wave(true); return }
    const sub = $('sub'); if (!sub) return
    const name = who === 'PHONE' ? (b.name || 'ÉCOUTE') : who
    sub.innerHTML = `<span class="spk${who === 'PHONE' ? ' phone' : who === 'VIKTOR' ? ' inner' : ''}"></span><span class="tx"></span>`
    sub.querySelector('.spk').textContent = name
    if (who === 'ANTON' && radio) radio.classList.add('on', 'talk')
    K.type(sub.querySelector('.tx'), b.say, typeDur)
  }
  function endLine(b) {
    if (radio) radio.classList.remove('talk')
    if ((b.who || 'ANTON') === 'PHONE') K.wave(false)
    if (b.clear && $('sub')) $('sub').textContent = ''
  }
  async function start() {
    const id = ++runId
    reset()
    if (freeze !== null) at(freeze, () => { counters.forEach(show => show()); counters.clear(); K.frozen = true; st.classList.add('k-frozen'); clearAll(); S.stopVoice(); runId++ })
    if (cfg.music) S.music(cfg.music)
    for (const b of cfg.beats) {
      if (id !== runId) return
      const bs = performance.now()
      ;(b.cues || []).forEach(([ms, fn]) => at(ms, () => { if (id === runId) fn(K) }))
      if (b.say) {
        if (b.pre) { await wait(b.pre); if (id !== runId) return }
        showLine(b)
        await K.speak(b.say, b.who || 'ANTON'); if (id !== runId) return
        endLine(b)
      }
      const left = (b.min || 0) - (performance.now() - bs)
      await wait(Math.max(b.say ? (b.post ?? 350) : 0, left)); if (id !== runId) return
    }
    S.music(null)
    if (id === runId) resolveDone()
  }
  // Échec « ouvert » : une erreur du séquenceur est consignée dans K.errors et la séquence se termine,
  // pour que le jeu continue au lieu de rester bloqué sur un écran noir.
  const launch = () => start().catch(e => { fail(e && e.stack || e); resolveDone() })
  K.run = c => { cfg = c; launch(); return K.finished }
  $('k-replay').addEventListener('click', () => { if (cfg) launch() })

  K.destroy = () => {
    if (destroyed) return
    // S.destroy() coupe la musique, ce qui programme un minuteur : il faut annuler les minuteurs APRÈS.
    runId++; S.destroy(); clearAll(); destroyed = true
  }
  return K
}
