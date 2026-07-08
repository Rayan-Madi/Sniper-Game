// Sons synthétiques via Web Audio API — pas de fichiers externes
let ctx = null
let master = null
let masterVolume = 0.7

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    master = ctx.createGain()
    master.gain.value = masterVolume
    master.connect(ctx.destination)
  }
  return ctx
}

// Nœud de sortie commun (tous les sons passent par le master)
function out() {
  getCtx()
  return master
}

export function setMasterVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v))
  if (master) master.gain.value = masterVolume
}

function tone(freq, type, duration, gainStart, gainEnd, delay = 0) {
  const c   = getCtx()
  const osc = c.createOscillator()
  const g   = c.createGain()
  osc.connect(g)
  g.connect(out())
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + delay)
  g.gain.setValueAtTime(gainStart, c.currentTime + delay)
  g.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.001), c.currentTime + delay + duration)
  osc.start(c.currentTime + delay)
  osc.stop(c.currentTime + delay + duration + 0.01)
}

function noise(duration, gainStart, delay = 0, filterFreq = 800, filterType = 'bandpass') {
  const c    = getCtx()
  const size = Math.max(1, Math.floor(c.sampleRate * duration))
  const buf  = c.createBuffer(1, size, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
  const src  = c.createBufferSource()
  const g    = c.createGain()
  const filt = c.createBiquadFilter()
  filt.type  = filterType
  filt.frequency.value = filterFreq
  src.buffer = buf
  src.connect(filt); filt.connect(g); g.connect(out())
  g.gain.setValueAtTime(gainStart, c.currentTime + delay)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration)
  src.start(c.currentTime + delay)
  src.stop(c.currentTime + delay + duration + 0.01)
  return { src, g, filt }
}

// Respiration : noise filtré avec montée (inspire) puis descente (expire)
function breathPuff(duration, peakGain, filterFreq) {
  const c    = getCtx()
  const size = Math.max(1, Math.floor(c.sampleRate * duration))
  const buf  = c.createBuffer(1, size, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
  const src  = c.createBufferSource()
  const g    = c.createGain()
  const filt = c.createBiquadFilter()
  filt.type  = 'bandpass'
  filt.frequency.value = filterFreq
  filt.Q.value = 0.7
  src.buffer = buf
  src.connect(filt); filt.connect(g); g.connect(out())
  const t = c.currentTime
  g.gain.setValueAtTime(0.001, t)
  g.gain.linearRampToValueAtTime(peakGain, t + duration * 0.4)   // inspire
  g.gain.linearRampToValueAtTime(0.001, t + duration)            // expire
  src.start(t)
  src.stop(t + duration + 0.01)
}

// ─── Sons du jeu ───────────────────────────────────────────────────────
export function playShot() {
  // Détonation grave + crack haute fréquence
  noise(0.08, 1.2)
  tone(80,  'sawtooth', 0.15, 0.6, 0.001)
  tone(220, 'square',   0.04, 0.3, 0.001)
  // Queue de réverbération simulée
  noise(0.3, 0.15, 0.08)
}

export function playSilencedShot() {
  // Son mat, court
  noise(0.04, 0.35)
  tone(120, 'sine', 0.06, 0.2, 0.001)
}

export function playKill() {
  // Deux tons descendants — confirmation
  tone(880, 'sine', 0.07, 0.4, 0.001)
  tone(660, 'sine', 0.12, 0.3, 0.001, 0.07)
}

export function playAlert() {
  // Alarme pulsante
  for (let i = 0; i < 3; i++) {
    tone(880, 'square', 0.1, 0.3, 0.001, i * 0.22)
    tone(660, 'square', 0.1, 0.2, 0.001, i * 0.22 + 0.11)
  }
}

export function playGameOver() {
  // Descente dramatique
  tone(440, 'sine', 0.4, 0.5, 0.001)
  tone(330, 'sine', 0.5, 0.4, 0.001, 0.35)
  tone(220, 'sine', 0.7, 0.4, 0.001, 0.75)
}

export function playLevelClear() {
  // Montée triomphante
  const notes = [523, 659, 784, 1047]
  notes.forEach((f, i) => tone(f, 'sine', 0.18, 0.35, 0.001, i * 0.14))
}

export function playCivilKill() {
  // Son choquant — dissonance
  tone(200, 'sawtooth', 0.5, 0.6, 0.001)
  tone(201, 'sawtooth', 0.5, 0.6, 0.001)
}

// Un battement de cœur (lub-dub) — bien grave et présent
function heartbeat(intensity) {
  const g = 0.4 + intensity * 0.7
  tone(50, 'sine', 0.14, g, 0.001, 0)
  tone(42, 'sine', 0.16, g * 0.85, 0.001, 0.15)
}

// ─── Système respiration + cœur lié au stress ───────────────────────────
// Appelé chaque frame depuis le game loop : updateStressAudio(dt, stress, scoped)
let breathTimer = 0
let heartTimer  = 0
let holdingBreath = false

export function setHoldingBreath(v) { holdingBreath = v }

export function updateStressAudio(dt, stress, scoped) {
  if (!scoped) { breathTimer = 0; heartTimer = 0; return }

  // ── Respiration ── (toujours audible dès qu'on vise)
  if (holdingBreath) {
    // Apnée : on entend l'effort retenu une seule fois au début
    breathTimer = 0.6
  } else {
    breathTimer -= dt
    if (breathTimer <= 0) {
      // Intervalle plus court quand stressé (respiration rapide/haletante)
      const interval = 2.8 - stress * 1.9          // 2.8s calme → 0.9s paniqué
      breathTimer = interval
      const peak     = 0.18 + stress * 0.5         // bien plus fort qu'avant
      const dur      = 0.85 - stress * 0.4         // plus saccadé si stressé
      const freq     = 500 + stress * 900          // sifflement aigu sous stress
      breathPuff(dur, peak, freq)
      // Sous gros stress : double inspiration haletante
      if (stress > 0.7) breathPuff(dur * 0.5, peak * 0.7, freq * 1.2)
    }
  }

  // ── Battements de cœur (dès 25% de stress) ──
  if (stress > 0.25) {
    heartTimer -= dt
    if (heartTimer <= 0) {
      const bpmFactor = 1.5 - stress * 1.0         // intervalle entre battements
      heartTimer = Math.max(0.38, bpmFactor)
      heartbeat((stress - 0.25) / 0.75)
    }
  } else {
    heartTimer = 0
  }
}

// ─── Musique de cinématique (procédurale) ───────────────────────────────
let musicGain = null
let musicTimer = null

function ensureMusicGain() {
  getCtx()
  if (!musicGain) {
    musicGain = ctx.createGain()
    musicGain.gain.value = 0.0001
    musicGain.connect(master)
  }
  return musicGain
}

// Progressions d'accords (fréquences) selon l'ambiance
const PROGRESSIONS = {
  tense:   [[220, 261.63, 329.63], [196, 233.08, 293.66], [174.61, 220, 261.63], [164.81, 207.65, 246.94]],
  somber:  [[146.83, 174.61, 220], [130.81, 164.81, 196], [123.47, 146.83, 185], [110, 138.59, 164.81]],
  resolve: [[174.61, 220, 261.63], [196, 246.94, 293.66], [220, 277.18, 329.63], [261.63, 329.63, 392]],
}

function padNote(freq, dur, gain = 0.07, type = 'sine') {
  const c = getCtx()
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(g); g.connect(musicGain)
  const t = c.currentTime
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.9)
  g.gain.linearRampToValueAtTime(0.0001, t + dur)
  osc.start(t); osc.stop(t + dur + 0.05)
}

export function startCinematicMusic(type = 'tense') {
  ensureMusicGain()
  const c = getCtx()
  musicGain.gain.cancelScheduledValues(c.currentTime)
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), c.currentTime)
  musicGain.gain.linearRampToValueAtTime(0.6, c.currentTime + 1.6)   // fondu d'entrée

  const chords = PROGRESSIONS[type] || PROGRESSIONS.tense
  let bar = 0
  const BAR = 3.4
  const playBar = () => {
    const chord = chords[bar % chords.length]
    // Nappe (pad) : chaque note de l'accord, tenue
    chord.forEach(f => padNote(f, BAR + 0.5, 0.06, 'sine'))
    // Basse grave
    padNote(chord[0] / 2, BAR + 0.5, 0.10, 'triangle')
    // Petite mélodie aiguë une mesure sur deux
    if (bar % 2 === 0) padNote(chord[2] * 2, 1.2, 0.04, 'triangle')
    bar++
  }
  if (musicTimer) clearInterval(musicTimer)
  playBar()
  musicTimer = setInterval(playBar, BAR * 1000)
}

export function stopCinematicMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null }
  if (musicGain) {
    const c = getCtx()
    musicGain.gain.cancelScheduledValues(c.currentTime)
    musicGain.gain.setValueAtTime(musicGain.gain.value, c.currentTime)
    musicGain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.9)
  }
}

// ─── VOIX AU TÉLÉPHONE (procédurale) ────────────────────────────────────
// Marmonnement de voix filtré dans la bande téléphonique (300–3400 Hz) :
// syllabes brèves en dents de scie + rythme de parole + grésillement de ligne.
let phoneTimer = null, phoneGain = null, phoneCrackle = null

function phoneSyllable() {
  const c = getCtx()
  const osc = c.createOscillator()
  const g = c.createGain()
  const band = c.createBiquadFilter()
  band.type = 'bandpass'; band.frequency.value = 950; band.Q.value = 0.9
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 2600
  osc.type = 'sawtooth'
  const f = 100 + Math.random() * 75            // fondamentale voix d'homme
  osc.frequency.setValueAtTime(f * (1 + Math.random() * 0.25), c.currentTime)
  osc.frequency.exponentialRampToValueAtTime(f * 0.85, c.currentTime + 0.11)
  osc.connect(band); band.connect(lp); lp.connect(g); g.connect(phoneGain)
  const dur = 0.05 + Math.random() * 0.1
  g.gain.setValueAtTime(0.001, c.currentTime)
  g.gain.linearRampToValueAtTime(0.5 + Math.random() * 0.4, c.currentTime + 0.015)
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
  osc.start(); osc.stop(c.currentTime + dur + 0.02)
}

export function startPhoneVoice() {
  if (phoneTimer) return
  const c = getCtx()
  phoneGain = c.createGain()
  phoneGain.gain.value = 0.55
  phoneGain.connect(master)
  // grésillement de ligne discret en fond
  const size = c.sampleRate * 2
  const buf = c.createBuffer(1, size, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.4
  phoneCrackle = c.createBufferSource()
  phoneCrackle.buffer = buf; phoneCrackle.loop = true
  const cg = c.createGain(); cg.gain.value = 0.018
  const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 1800
  phoneCrackle.connect(cf); cf.connect(cg); cg.connect(phoneGain)
  phoneCrackle.start()
  // rythme de parole : syllabes en rafales, pauses de respiration/réponse
  let pauseUntil = 0
  phoneTimer = setInterval(() => {
    const now = performance.now()
    if (now < pauseUntil) return
    if (Math.random() < 0.16) { pauseUntil = now + 350 + Math.random() * 600; return }  // l'autre répond
    if (Math.random() < 0.78) phoneSyllable()
  }, 130)
}

export function stopPhoneVoice() {
  if (!phoneTimer) return
  clearInterval(phoneTimer); phoneTimer = null
  const c = getCtx()
  if (phoneGain) {
    phoneGain.gain.setValueAtTime(phoneGain.gain.value, c.currentTime)
    phoneGain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.3)
  }
  if (phoneCrackle) { try { phoneCrackle.stop(c.currentTime + 0.35) } catch (e) {} phoneCrackle = null }
}

// ─── Ambiance de mission (nappe grave discrète pendant le gameplay) ────
let ambTimer = null, ambGain = null

export function startMissionAmbience() {
  if (ambTimer) return
  ensureMusicGain()
  const c = getCtx()
  ambGain = c.createGain()
  ambGain.gain.value = 0.0001
  ambGain.connect(master)
  ambGain.gain.linearRampToValueAtTime(0.16, c.currentTime + 3)
  const roots = [98, 87.3, 110, 82.4]   // sol grave mouvant
  let bar = 0
  const playBar = () => {
    const f = roots[bar % roots.length]
    for (const [freq, gn] of [[f, 0.5], [f * 1.5, 0.18], [f * 2.02, 0.1]]) {
      const osc = c.createOscillator(); const g = c.createGain()
      osc.type = 'sine'; osc.frequency.value = freq
      osc.connect(g); g.connect(ambGain)
      g.gain.setValueAtTime(0.0001, c.currentTime)
      g.gain.linearRampToValueAtTime(gn, c.currentTime + 1.6)
      g.gain.linearRampToValueAtTime(0.0001, c.currentTime + 5.2)
      osc.start(); osc.stop(c.currentTime + 5.3)
    }
    bar++
  }
  playBar()
  ambTimer = setInterval(playBar, 4800)
}

export function stopMissionAmbience() {
  if (ambTimer) { clearInterval(ambTimer); ambTimer = null }
  if (ambGain) {
    const c = getCtx()
    ambGain.gain.setValueAtTime(ambGain.gain.value, c.currentTime)
    ambGain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1.2)
  }
}
