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

// ─── Ambiance de mission (nappe grave discrète pendant le gameplay) ────
let ambTimer = null, ambGain = null

export function startMissionAmbience() {
  if (ambTimer) return
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

// Contexte et nœud maître partagés : les cinématiques s'y branchent pour suivre le volume du jeu.
export function audioContext() { return getCtx() }
export function masterNode() { return out() }
