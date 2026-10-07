// Son procédural des cinématiques — mêmes recettes que les maquettes (docs/superpowers/maquettes/cinematiques/kit.js).
// Branché sur le contexte et le nœud maître de src/audio.js : le volume du jeu s'applique.
// Sans contexte audio (tests, son indisponible), toutes les fonctions sont muettes.

const PROG = {
  tense:  [[220, 261.63, 329.63], [196, 233.08, 293.66], [174.61, 220, 261.63], [164.81, 207.65, 246.94]],
  somber: [[146.83, 174.61, 220], [130.81, 164.81, 196], [123.47, 146.83, 185], [110, 138.59, 164.81]],
  dread:  [[110, 116.54, 164.81], [103.83, 110, 155.56], [98, 103.83, 146.83], [92.5, 98, 138.59]],
}

export function createSound(audio, { every, stopEvery }) {
  const c = audio && audio.ctx ? audio.ctx : null
  let master = null, noiseBuf = null, dead = false
  if (c) {
    master = c.createGain(); master.gain.value = 0.75; master.connect(audio.dest)
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const ok = () => !dead && !!c && c.state === 'running'

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

  // ── voix : lit de ligne + syllabes synthétiques. radio = Anton, phone = écoute, inner = Viktor ──
  let voiceG = null, crackle = null, voiceIv = 0
  function voice(kind, babble = true) {
    stopVoice(); if (!ok()) return
    voiceG = c.createGain(); voiceG.gain.value = kind === 'radio' ? 0.5 : kind === 'inner' ? 0.4 : 0.45; voiceG.connect(master)
    if (kind !== 'inner') {
      crackle = c.createBufferSource(); crackle.buffer = noiseBuf; crackle.loop = true
      const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = kind === 'radio' ? 2400 : 1800
      const cg = c.createGain(); cg.gain.value = kind === 'radio' ? 0.03 : 0.022
      crackle.connect(cf); cf.connect(cg); cg.connect(voiceG); crackle.start()
      if (kind === 'radio') noise(0.09, 0.25, 3000, 'highpass')
    }
    if (!babble) return
    let pauseUntil = 0
    voiceIv = every(125, () => {
      const now = performance.now(); if (now < pauseUntil || !voiceG) return
      if (Math.random() < 0.12) { pauseUntil = now + 250 + Math.random() * 400; return }
      if (Math.random() > 0.8) return
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain(), band = c.createBiquadFilter(), lp = c.createBiquadFilter()
      band.type = 'bandpass'; band.frequency.value = kind === 'radio' ? 1150 : kind === 'inner' ? 700 : 950; band.Q.value = kind === 'radio' ? 1.4 : 0.8
      lp.type = 'lowpass'; lp.frequency.value = kind === 'radio' ? 2200 : kind === 'inner' ? 1600 : 2600
      const f = kind === 'radio' ? 82 + Math.random() * 45 : kind === 'inner' ? 72 + Math.random() * 35 : 100 + Math.random() * 75
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * (1 + Math.random() * 0.25), t); o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.11)
      const dur = 0.05 + Math.random() * 0.11
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.4, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
      o.connect(band); band.connect(lp); lp.connect(g); g.connect(voiceG); o.start(t); o.stop(t + dur + 0.02)
    })
  }
  function stopVoice(radioClick = false) {
    if (voiceIv) { stopEvery(voiceIv); voiceIv = 0 }
    if (crackle) { try { crackle.stop() } catch (e) { /* déjà arrêté */ } crackle = null }
    if (voiceG) { voiceG.disconnect(); voiceG = null }
    if (radioClick) noise(0.07, 0.18, 2600, 'highpass')
  }

  // ── musiques : tense / somber (celles du jeu), dread, pulse (tense + tic d'horloge) ──
  let musicG = null, musicIv = 0, pulseIv = 0
  // Musiques coupées en fondu, débranchées 2 s plus tard par un minuteur natif : celui du kit serait annulé par
  // « rejouer » ou par le gel, et le gain resterait branché au maître. destroy() les débranche avec le maître.
  const fades = new Map()   // gain → minuteur
  const unplug = g => { clearTimeout(fades.get(g)); fades.delete(g); try { g.disconnect() } catch (e) { /* déjà débranché */ } }
  function music(mode) {
    if (musicIv) { stopEvery(musicIv); musicIv = 0 }
    if (pulseIv) { stopEvery(pulseIv); pulseIv = 0 }
    if (musicG) { const g = musicG; try { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4) } catch (e) { /* contexte fermé */ } fades.set(g, setTimeout(() => unplug(g), 2000)); musicG = null }
    if (!mode || !ok()) return
    musicG = c.createGain(); musicG.gain.value = 0.0001; musicG.connect(master); musicG.gain.linearRampToValueAtTime(0.5, c.currentTime + 2)
    const chords = PROG[mode] || PROG.tense
    let bar = 0
    const pad = (f, dur, gn, type) => {
      if (!musicG) return
      const t = c.currentTime, o = c.createOscillator(), g = c.createGain()
      o.type = type; o.frequency.value = f; o.connect(g); g.connect(musicG)
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gn, t + 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur)
      o.start(t); o.stop(t + dur + 0.05)
    }
    const playBar = () => { const ch = chords[bar % 4]; ch.forEach(f => pad(f, 3.9, 0.05, 'sine')); pad(ch[0] / 2, 3.9, 0.1, 'triangle'); pad(ch[0] / 4, 3.9, 0.12, 'sine'); bar++ }
    playBar(); musicIv = every(3400, playBar)
    if (mode === 'pulse') pulseIv = every(500, () => tone(1900, 'square', 0.02, 0.03))
  }

  function destroy() {
    stopVoice(); music(null); dead = true
    if (!master) return
    // fondu court plutôt que coupure nette ; le débranchement passe par un minuteur natif, car ceux du kit sont détruits
    const m = master
    try { m.gain.setTargetAtTime(0.0001, c.currentTime, 0.06) } catch (e) { /* contexte fermé */ }
    setTimeout(() => { [...fades.keys()].forEach(unplug); try { m.disconnect() } catch (e) { /* déjà débranché */ } }, 300)
  }

  return {
    tone, noise, voice, stopVoice, music, destroy,
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
}
