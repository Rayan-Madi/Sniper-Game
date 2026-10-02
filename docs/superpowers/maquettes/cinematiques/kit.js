/* Kit commun des briefings « dossier du fixeur » — maquettes.
   Moteur : une suite de TEMPS (beats). Chaque temps peut faire parler quelqu'un (voix du
   navigateur, ou « bip » synthétique) et déclencher des effets visuels à des instants relatifs.
   Le temps dure aussi longtemps que la réplique : l'image avance au rythme de la voix.
   ?freeze=MS  → sans voix ni glitch, durées estimées, tout se fige à MS (captures automatiques). */
(() => {
  const K = window.K = {}
  const params = new URLSearchParams(location.search)
  const FREEZE = params.has('freeze') ? Math.max(0, +params.get('freeze')) : null
  K.errors = []
  const fail = msg => { K.errors.push(String(msg)); document.title = 'ERR: ' + msg; console.error('[kit]', msg) }
  window.addEventListener('error', e => fail(e.message))
  window.addEventListener('unhandledrejection', e => fail(e.reason))

  const $ = id => document.getElementById(id)
  const el = x => (typeof x === 'string' ? $(x) : x)
  K.$ = $
  let timers = []
  const at = (ms, fn) => { const h = setTimeout(() => { try { fn() } catch (e) { fail(e && e.stack || e) } }, ms); timers.push(h); return h }
  const wait = ms => new Promise(r => at(ms, r))
  K.at = at
  K.on = (x, c = 'on') => { const e = el(x); if (e) e.classList.add(c); else fail('élément introuvable : ' + x) }
  K.off = (x, c = 'on') => { const e = el(x); if (e) e.classList.remove(c) }
  K.type = (x, text, dur, tick = false) => {
    const e = el(x); if (!e) return fail('élément introuvable : ' + x)
    e.textContent = ''
    const step = dur / Math.max(1, text.length)
    ;[...text].forEach((ch, i) => at(step * i, () => { e.textContent += ch; if (tick && ch !== ' ') S.tick() }))
  }
  const estimate = text => 350 + text.length * 62          // durée parlée estimée (≈ 15 caractères/s)

  // ── injection : habillage « signal », filtre de glitch, barre de contrôle ──
  const st = $('st'), scene = $('scene')
  if (!st || !scene) { fail('la page doit contenir #st et #scene'); return }
  st.classList.add('k-preload')
  requestAnimationFrame(() => requestAnimationFrame(() => st.classList.remove('k-preload')))
  st.insertAdjacentHTML('afterbegin', '<div class="crt" id="k-crt"></div>')
  st.insertAdjacentHTML('beforeend', '<div class="flick"></div><div class="blackframe" id="k-bf"></div><div class="track"></div><div class="scan"></div><div class="vig"></div><div class="grain"></div>' +
    '<div class="lost" id="k-lost">▌▌ SIGNAL PERDU<small>RECONNEXION…</small></div><div class="black" id="k-black"></div>')
  document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute"><filter id="k-glf" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
    <feTurbulence id="k-glt" type="fractalNoise" baseFrequency="0.00001 0.09" numOctaves="1" seed="3" result="noise"/>
    <feDisplacementMap id="k-gld" in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="B" result="disp"/>
    <feColorMatrix in="disp" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
    <feOffset id="k-glo1" in="r" dx="0" dy="0" result="r2"/>
    <feColorMatrix in="disp" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb"/>
    <feOffset id="k-glo2" in="gb" dx="0" dy="0" result="gb2"/>
    <feBlend in="r2" in2="gb2" mode="screen"/></filter></svg>`)
  st.insertAdjacentHTML('afterend', `<div class="kctrl"><button id="k-replay">↺ Rejouer</button><button id="k-snd" class="hot">🔊 Activer le son</button>
    <label>Voix d'Anton <select id="k-voice"></select></label><label><input type="checkbox" id="k-gl" checked> glitchs</label><span class="lbl" id="k-lbl"></span></div>`)
  const radio = $('radio')
  if (radio && !radio.children.length) radio.innerHTML = '<span class="dot">●</span><span>CANAL SÉCURISÉ · ANTON, FIXEUR</span><span class="eq"><i></i><i></i><i></i><i></i><i></i></span>'
  const wave = $('wave')
  if (wave) for (let i = 0; i < 56; i++) wave.appendChild(document.createElement('i'))

  // ── son procédural (même principe que src/audio.js : aucun fichier) ──
  let soundOn = false
  const S = K.snd = (() => {
    let c = null, master = null, musicG = null, musicIv = 0, voiceIv = 0, voiceG = null, crackle = null, noiseBuf = null
    const ok = () => soundOn && !!c && c.state === 'running'
    function init() {
      if (c) return c.resume()
      c = new (window.AudioContext || window.webkitAudioContext)()
      const comp = c.createDynamicsCompressor(); comp.connect(c.destination)
      master = c.createGain(); master.gain.value = 0.75; master.connect(comp)
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      return c.resume()
    }
    function tone(f, type, dur, g0, delay = 0, f1 = null) {
      if (!ok()) return
      const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain()
      o.type = type; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(g0, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02)
    }
    function noise(dur, g0, freq, type = 'bandpass', delay = 0, q = 1, f1 = null) {
      if (!ok()) return
      const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
      s.buffer = noiseBuf; s.loop = true
      f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(g0, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.02)
    }
    // Lit de voix : grésillement de ligne ; babble=true ajoute des syllabes synthétiques (si pas de voix du navigateur)
    function voice(kind, babble = true) {
      stopVoice(); if (!ok()) return
      voiceG = c.createGain(); voiceG.gain.value = kind === 'radio' ? 0.5 : kind === 'inner' ? 0.4 : 0.45; voiceG.connect(master)
      if (kind === 'inner') { if (babble) babbleLoop(kind); return }     // voix intérieure : ni ligne ni radio
      crackle = c.createBufferSource(); crackle.buffer = noiseBuf; crackle.loop = true
      const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = kind === 'radio' ? 2400 : 1800
      const cg = c.createGain(); cg.gain.value = kind === 'radio' ? 0.03 : 0.022
      crackle.connect(cf); cf.connect(cg); cg.connect(voiceG); crackle.start()
      if (kind === 'radio') noise(0.09, 0.25, 3000, 'highpass')
      if (babble) babbleLoop(kind)
    }
    function babbleLoop(kind) {
      let pauseUntil = 0
      voiceIv = setInterval(() => {
        const now = performance.now(); if (now < pauseUntil) return
        if (Math.random() < 0.12) { pauseUntil = now + 250 + Math.random() * 400; return }
        if (Math.random() > 0.8 || !voiceG) return
        const t = c.currentTime, o = c.createOscillator(), g = c.createGain(), band = c.createBiquadFilter(), lp = c.createBiquadFilter()
        band.type = 'bandpass'; band.frequency.value = kind === 'radio' ? 1150 : kind === 'inner' ? 700 : 950; band.Q.value = kind === 'radio' ? 1.4 : 0.8
        lp.type = 'lowpass'; lp.frequency.value = kind === 'radio' ? 2200 : kind === 'inner' ? 1600 : 2600
        const f = kind === 'radio' ? 82 + Math.random() * 45 : kind === 'inner' ? 72 + Math.random() * 35 : 100 + Math.random() * 75
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f * (1 + Math.random() * 0.25), t); o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.11)
        const dur = 0.05 + Math.random() * 0.11
        g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.4, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
        o.connect(band); band.connect(lp); lp.connect(g); g.connect(voiceG); o.start(t); o.stop(t + dur + 0.02)
      }, 125)
    }
    function stopVoice(radioClick) {
      if (voiceIv) { clearInterval(voiceIv); voiceIv = 0 }
      if (crackle) { try { crackle.stop() } catch (e) {} crackle = null }
      if (voiceG) { voiceG.disconnect(); voiceG = null }
      if (radioClick) noise(0.07, 0.18, 2600, 'highpass')
    }
    // Musiques : tense / somber (celles du jeu), dread (dissonante, grave), pulse (tense + tic d'horloge)
    const PROG = {
      tense:  [[220, 261.63, 329.63], [196, 233.08, 293.66], [174.61, 220, 261.63], [164.81, 207.65, 246.94]],
      somber: [[146.83, 174.61, 220], [130.81, 164.81, 196], [123.47, 146.83, 185], [110, 138.59, 164.81]],
      dread:  [[110, 116.54, 164.81], [103.83, 110, 155.56], [98, 103.83, 146.83], [92.5, 98, 138.59]],
    }
    let pulseIv = 0
    function music(mode) {
      if (musicIv) { clearInterval(musicIv); musicIv = 0 }
      if (pulseIv) { clearInterval(pulseIv); pulseIv = 0 }
      if (musicG) { const g = musicG; try { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4) } catch (e) {} setTimeout(() => g.disconnect(), 2000); musicG = null }
      if (!mode || !ok()) return
      musicG = c.createGain(); musicG.gain.value = 0.0001; musicG.connect(master); musicG.gain.linearRampToValueAtTime(0.5, c.currentTime + 2)
      const chords = PROG[mode] || PROG.tense
      let bar = 0
      const pad = (f, dur, gn, type) => { if (!musicG) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; o.connect(g); g.connect(musicG); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gn, t + 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.05) }
      const playBar = () => { const ch = chords[bar % 4]; ch.forEach(f => pad(f, 3.9, 0.05, 'sine')); pad(ch[0] / 2, 3.9, 0.1, 'triangle'); pad(ch[0] / 4, 3.9, 0.12, 'sine'); bar++ }
      playBar(); musicIv = setInterval(playBar, 3400)
      if (mode === 'pulse') pulseIv = setInterval(() => tone(1900, 'square', 0.02, 0.03), 500)
    }
    return {
      init, voice, stopVoice, music, tone, noise,
      crt: () => { tone(60, 'sine', 0.35, 0.5, 0, 38); tone(7800, 'sine', 0.5, 0.025) },
      tick: () => noise(0.012, 0.05, 3500, 'highpass'),
      shutter: () => { noise(0.035, 0.45, 2500, 'highpass'); noise(0.03, 0.3, 1800, 'bandpass', 0.07); tone(2400, 'sine', 0.35, 0.03, 0.02, 4200) },
      beep: (f = 1400, d = 0) => tone(f, 'square', 0.06, 0.06, d),
      marker: () => noise(0.42, 0.1, 900, 'bandpass', 0, 2, 2600),
      stamp: () => { tone(120, 'sine', 0.35, 0.9, 0, 42); noise(0.09, 0.5, 380, 'lowpass') },
      slap: () => { noise(0.05, 0.38, 1500, 'bandpass'); noise(0.035, 0.3, 2600, 'highpass', 0.05) },
      paper: () => noise(0.22, 0.12, 2200, 'bandpass', 0, 0.8, 3800),
      sweep: () => noise(1.3, 0.06, 400, 'bandpass', 0, 1.5, 2400),
      ping: () => { tone(880, 'sine', 0.5, 0.18); tone(1320, 'sine', 0.35, 0.06, 0.02) },
      sonar: () => { tone(1100, 'sine', 0.9, 0.12, 0, 900); tone(1100, 'sine', 0.6, 0.04, 0.25, 950) },
      count: () => tone(2000, 'square', 0.025, 0.025),
      clock: () => { tone(2600, 'square', 0.015, 0.05); noise(0.02, 0.06, 4000, 'highpass') },
      heart: () => { tone(58, 'sine', 0.16, 0.8, 0, 40); tone(52, 'sine', 0.2, 0.6, 0.22, 36) },
      thud: () => { tone(80, 'sine', 0.3, 0.8, 0, 45); noise(0.12, 0.35, 300, 'lowpass') },
      rumble: (ms = 2000) => noise(ms / 1000, 0.18, 90, 'lowpass', 0, 0.7, 140),
      alarm: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, 'square', 0.18, 0.05, i * 0.2) },
      glitch: (ms, p) => { noise(ms / 1000, 0.1 + 0.22 * p, 700 + Math.random() * 3200, 'bandpass', 0, 0.7); if (p > 0.6) for (let i = 0; i < 3; i++) tone(200 + Math.random() * 1800, 'square', 0.03, 0.04 * p, i * 0.05) },
      lost: () => { noise(0.45, 0.35, 2000, 'bandpass', 0, 0.4); tone(1000, 'sine', 0.4, 0.08, 0.05) },
      boom: () => { tone(55, 'sine', 2.2, 0.85, 0, 38); noise(1.6, 0.28, 180, 'lowpass'); tone(880, 'triangle', 1.6, 0.05, 0.15); tone(1318.5, 'triangle', 1.4, 0.03, 0.2) },
    }
  })()
  K.music = mode => S.music(mode)

  // ── glitch : déchirure horizontale + séparation RVB + rafale de parasites ──
  const gT = $('k-glt'), gD = $('k-gld'), gO1 = $('k-glo1'), gO2 = $('k-glo2'), bf = $('k-bf')
  let glitchUntil = 0, glitchPow = 0, glitchIv = 0
  K.glitch = (ms, pow) => {
    if (FREEZE !== null || !$('k-gl').checked) return
    S.glitch(ms, pow)
    glitchUntil = Math.max(glitchUntil, performance.now() + ms); glitchPow = Math.max(glitchPow, pow)
    if (glitchIv) return
    scene.style.filter = 'url(#k-glf)'; st.classList.add('gl')
    glitchIv = setInterval(() => {
      if (performance.now() > glitchUntil) {
        clearInterval(glitchIv); glitchIv = 0; glitchPow = 0
        scene.style.filter = ''; scene.style.transform = ''; st.classList.remove('gl'); bf.classList.remove('on'); gD.setAttribute('scale', 0); return
      }
      const p = glitchPow
      gT.setAttribute('seed', Math.floor(Math.random() * 999))
      gT.setAttribute('baseFrequency', `0.00001 ${(0.03 + Math.random() * 0.12).toFixed(3)}`)
      gD.setAttribute('scale', (Math.random() * 70 * p).toFixed(1))
      const dx = (2 + Math.random() * 9) * p
      gO1.setAttribute('dx', dx.toFixed(1)); gO2.setAttribute('dx', (-dx).toFixed(1))
      scene.style.transform = Math.random() < .35 * p ? `translate(${((Math.random() - .5) * 2 * p).toFixed(2)}cqw, ${((Math.random() - .5) * 3 * p).toFixed(2)}cqw) skewX(${((Math.random() - .5) * 4 * p).toFixed(1)}deg)` : ''
      bf.classList.toggle('on', p > .7 && Math.random() < .12)
    }, 45)
  }
  if (FREEZE === null) (function idle() { setTimeout(() => { K.glitch(70 + Math.random() * 110, .22 + Math.random() * .3); idle() }, 1100 + Math.random() * 2600) })()

  // ── petits outils de mise en scène ──
  K.shake = () => { st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake') }
  K.crt = () => { K.on('k-crt'); S.crt() }
  K.lost = (ms = 400) => { S.lost(); K.glitch(ms + 250, 1); K.on('k-lost'); at(ms, () => K.off('k-lost')) }
  K.title = () => { K.on('title'); S.boom(); K.glitch(200, .7) }
  K.black = () => K.on('k-black')
  K.counter = (x, from, to, dur, suffix = '', tickEvery = 0) => {
    const e = el(x), s = performance.now(); let last = null
    const f = () => {
      if (K.frozen) return
      const k = Math.min(1, (performance.now() - s) / dur), v = Math.round(from + (to - from) * k)
      e.textContent = v + suffix
      if (tickEvery && Math.floor(v / tickEvery) !== last) { last = Math.floor(v / tickEvery); S.count() }
      if (k < 1) requestAnimationFrame(f)
    }
    if (FREEZE !== null) { e.textContent = to + suffix; return }
    f()
  }
  let waveOn = false
  K.wave = on => {
    waveOn = on
    const bars = wave ? [...wave.children] : []
    const tick = () => {
      if (!waveOn || K.frozen) { bars.forEach(b => b.style.height = '6%'); return }
      bars.forEach((b, i) => { const env = Math.sin((i / bars.length) * Math.PI); b.style.height = (8 + Math.random() * 88 * env) + '%' })
      setTimeout(tick, 90)
    }
    tick()
  }

  // ── voix : synthèse vocale du navigateur (voix françaises installées), sinon « bip » synthétique ──
  const SS = window.speechSynthesis || null
  const vsel = $('k-voice')
  let frVoices = []
  const pref = (() => { try { return localStorage.getItem('k.voice2') } catch (e) { return null } })()
  function loadVoices() {
    if (!SS) return
    frVoices = SS.getVoices().filter(v => /^fr/i.test(v.lang))
    const cur = vsel.value || pref
    vsel.innerHTML = '<option value="">bip synthétique</option>' + frVoices.map(v => `<option value="${v.name}">${v.name.replace(/Microsoft |Google | - French.*| \(.*\)/g, '')}</option>`).join('')
    const male = frVoices.find(v => /Henri/i.test(v.name)) || frVoices.find(v => /Paul|Claude|Thomas|Mathieu|R[ée]my|Antoine|G[ée]rard|Jean/i.test(v.name)) || frVoices[0]
    // Par défaut : « bip synthétique » (les voix du système sonnent trop « Siri ») ; une voix choisie reste mémorisée
    vsel.value = (cur && frVoices.some(v => v.name === cur)) ? cur : ''
  }
  if (SS) { loadVoices(); SS.onvoiceschanged = loadVoices } else vsel.innerHTML = '<option value="">bip synthétique</option>'
  vsel.onchange = () => { try { localStorage.setItem('k.voice2', vsel.value) } catch (e) {} }
  K.speak = (text, who) => {
    const est = estimate(text)
    const kind = who === 'PHONE' ? 'phone' : who === 'VIKTOR' ? 'inner' : 'radio'
    if (!soundOn || FREEZE !== null) return wait(est)
    const chosen = frVoices.find(v => v.name === vsel.value)
    if (!SS || !chosen) { S.voice(kind, true); return wait(est).then(() => S.stopVoice(kind === 'radio')) }
    S.voice(kind, false)
    return new Promise(res => {
      let done = false
      const end = () => { if (done) return; done = true; S.stopVoice(kind === 'radio'); res() }
      const u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, ''))
      u.lang = 'fr-FR'
      if (kind === 'phone') {
        // Le méchant au téléphone : toujours une voix d'homme. Une autre voix masculine si elle existe,
        // sinon la voix d'Anton tirée vers le grave — jamais une voix féminine choisie par défaut.
        const MALE = /Henri|Paul|Claude|Thomas|Mathieu|R[ée]my|Antoine|G[ée]rard|Jean|Fabrice|Guillaume|Alain/i
        const other = frVoices.find(v => v !== chosen && MALE.test(v.name))
        u.voice = other || chosen
        u.pitch = other ? 0.75 : 0.55; u.rate = 0.93
      } else if (kind === 'inner') {
        const MALE = /Henri|Paul|Claude|Thomas|Mathieu|R[ée]my|Antoine|G[ée]rard|Jean|Fabrice|Guillaume|Alain/i
        u.voice = MALE.test(chosen.name) ? chosen : (frVoices.find(v => MALE.test(v.name)) || chosen); u.pitch = 0.8; u.rate = 0.94
      } else { u.voice = chosen; u.pitch = 0.92; u.rate = 1.02 }
      u.onend = end; u.onerror = end
      SS.cancel(); SS.speak(u)
      at(est * 2.5 + 2500, end)                     // filet de sécurité si le moteur vocal se tait
    })
  }

  // ── séquenceur de temps ──
  let runId = 0, t0 = 0, label = '', cfg = null
  K.frozen = false
  function reset() {
    timers.forEach(clearTimeout); timers = []
    if (SS) SS.cancel()
    S.stopVoice(); S.music(null); K.wave(false)
    K.frozen = false; st.classList.remove('k-frozen')
    const cls = ['on', 'off', 'out', 'lock', 'dev', 'side', 'talk', 'shake', 'gl', ...((cfg && cfg.stateClasses) || [])]
    ;[st, ...st.querySelectorAll('*')].forEach(e => { if (e.classList) cls.forEach(c => e.classList.remove(c)) })
    st.querySelectorAll('[data-reset]').forEach(e => { e.textContent = e.dataset.reset === 'keep' ? e.textContent : '' })
    ;['sub', 'trans'].forEach(id => { if ($(id)) $(id).textContent = '' })
    void $('k-crt').offsetWidth
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
    if (who === 'ANTON' && radio) { radio.classList.add('on', 'talk') }
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
    t0 = performance.now(); label = ''
    if (FREEZE !== null) at(FREEZE, () => { K.frozen = true; st.classList.add('k-frozen'); timers.forEach(clearTimeout); timers = []; if (SS) SS.cancel(); S.stopVoice(); runId++ })
    if (soundOn && cfg.music) S.music(cfg.music)
    for (const b of cfg.beats) {
      if (id !== runId) return
      const bs = performance.now()
      if (b.label) label = b.label
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
    if (cfg.loop !== false && FREEZE === null) { await wait(cfg.loopDelay ?? 1800); if (id === runId) start() }
  }
  K.run = c => { cfg = c; start() }
  $('k-replay').onclick = () => start()
  $('k-snd').onclick = async () => {
    const b = $('k-snd')
    if (!soundOn) { await S.init(); soundOn = true; b.textContent = '🔇 Couper le son'; b.classList.remove('hot'); start() }
    else { soundOn = false; b.textContent = '🔊 Activer le son'; b.classList.add('hot'); if (SS) SS.cancel(); S.stopVoice(); S.music(null) }
  }
  ;(function lbl() { const e = $('k-lbl'); if (e) e.textContent = `${label || '…'} · ${((performance.now() - t0) / 1000).toFixed(1)} s`; requestAnimationFrame(lbl) })()
})()
