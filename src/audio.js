// Sons synthétiques via Web Audio API — pas de fichiers externes
import { SON, PLUIE } from './shot/tuning.js'
import { impulseResponse } from './shot/acoustics.js'
import { createRain } from './prologue/ambience.js'

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

// vers : les nœuds où le son part (le maître seul par défaut ; le maître et l'écho de la carte, sorties()).
function tone(freq, type, duration, gainStart, gainEnd, delay = 0, vers = null) {
  const c   = getCtx()
  const osc = c.createOscillator()
  const g   = c.createGain()
  osc.connect(g)
  for (const d of vers || [out()]) g.connect(d)
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + delay)
  g.gain.setValueAtTime(gainStart, c.currentTime + delay)
  g.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.001), c.currentTime + delay + duration)
  osc.start(c.currentTime + delay)
  osc.stop(c.currentTime + delay + duration + 0.01)
}

function noise(duration, gainStart, delay = 0, filterFreq = 800, filterType = 'bandpass', vers = null) {
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
  src.connect(filt); filt.connect(g)
  for (const d of vers || [out()]) g.connect(d)
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

// ─── Écho de la carte (spec du lot 2, §3.5) ───────────────────────────
// Une ConvolverNode par mission, montée avec sa carte (mountEcho, main.js) et chargée de la réponse impulsionnelle de
// son acoustique (src/shot/acoustics.js) : le départ du coup et les impacts lointains y sont envoyés à SON.echoDb, sa
// sortie va au maître. Démontée avec la mission (unmountEcho) : nœuds débranchés, réponse lâchée.
let echo = null   // { acoustique, envoi, conv }

export function mountEcho(acoustique) {
  unmountEcho()
  const c = getCtx()
  const ir = impulseResponse(acoustique, c.sampleRate)
  if (!ir) return   // menu, PvP : pas d'écho
  const buf = c.createBuffer(ir.canaux.length, ir.length, c.sampleRate)
  ir.canaux.forEach((d, i) => buf.getChannelData(i).set(d))
  const conv = c.createConvolver()
  conv.buffer = buf
  const envoi = c.createGain()
  envoi.gain.value = 10 ** (SON.echoDb / 20)
  envoi.connect(conv); conv.connect(master)
  echo = { acoustique, envoi, conv }
}

export function unmountEcho() {
  if (!echo) return
  const { envoi, conv } = echo
  echo = null
  envoi.disconnect(); conv.disconnect()
  try { conv.buffer = null } catch (e) { /* navigateur qui refuse : la réponse part avec le nœud */ }
}

// Où part un son du tir : le maître, et l'écho de la carte s'il y en a un et que le son y va.
const sorties = versEcho => (versEcho && echo ? [out(), echo.envoi] : [out()])

// ─── Sons du jeu ───────────────────────────────────────────────────────
// Le départ du coup part aussi vers l'écho de la carte, détonation comme crack ; au silencieux de même.
export function playShot() {
  const vers = sorties(true)
  // Détonation grave + crack haute fréquence
  noise(0.08, 1.2, 0, 800, 'bandpass', vers)
  tone(80,  'sawtooth', 0.15, 0.6, 0.001, 0, vers)
  tone(220, 'square',   0.04, 0.3, 0.001, 0, vers)
  // « Crack » supersonique (spec du lot 2, §3.5) : la balle franchit le mur du son, un claquement sec et aigu de 20 ms
  noise(0.02, 0.5, 0, 3500, 'highpass', vers)
  // Queue de réverbération simulée
  noise(0.3, 0.15, 0.08, 800, 'bandpass', vers)
}

// Sons de l'arrivée de la balle (spec du lot 2, §3.5), au niveau d'un impact entendu de loin : bien sous le tir. Le
// calendrier (src/shot/soundPlan.js) dit lequel, quand (delay, s) et s'il part vers l'écho (vers) ; k est le niveau
// réglé pour la matière (SON.impactDb, src/shot/tuning.js), appliqué à chaque composante de la recette.
const IMPACTS = {
  // chair : un coup mat et sourd, sans note
  'impact-chair': (delay, vers, k) => {
    noise(0.025, 0.3 * k, delay, 1100, 'bandpass', vers)        // la claque de l'impact
    noise(0.11, 0.45 * k, delay, 380, 'lowpass', vers)          // le corps, sourd
    tone(95, 'sine', 0.12, 0.35 * k, 0.001, delay, vers)
  },
  // métal : claquement sec, puis la tôle qui sonne (trois notes inharmoniques qui s'éteignent)
  'impact-metal': (delay, vers, k) => {
    noise(0.012, 0.45 * k, delay, 4200, 'highpass', vers)
    tone(1870, 'sine', 0.35, 0.12 * k, 0.001, delay, vers)
    tone(2710, 'sine', 0.25, 0.08 * k, 0.001, delay, vers)
    tone(4130, 'sine', 0.16, 0.05 * k, 0.001, delay, vers)
  },
  // pierre : éclat sec, puis les débris qui s'effritent
  'impact-pierre': (delay, vers, k) => {
    noise(0.04, 0.45 * k, delay, 2600, 'bandpass', vers)
    noise(0.14, 0.16 * k, delay + 0.012, 900, 'bandpass', vers)
  },
  // bois : un « toc » creux
  'impact-bois': (delay, vers, k) => {
    noise(0.05, 0.38 * k, delay, 1100, 'bandpass', vers)
    tone(260, 'triangle', 0.09, 0.25 * k, 0.001, delay, vers)
  },
  // sol : un souffle de terre et de poussière
  'impact-sol': (delay, vers, k) => {
    noise(0.18, 0.3 * k, delay, 700, 'lowpass', vers)
    noise(0.05, 0.1 * k, delay, 1800, 'bandpass', vers)
  },
}

// Joue le calendrier de l'arrivée d'une balle (planShotSounds, src/shot/soundPlan.js) : [{ son, at, echo }], at en
// secondes à partir de maintenant, au niveau réglé pour sa matière. Un son inconnu est ignoré.
export function playShotSounds(plan) {
  for (const { son, at, echo: versEcho } of plan) {
    const jouer = IMPACTS[son]
    if (jouer) jouer(Math.max(0, at), sorties(versEcho), 10 ** ((SON.impactDb?.[son.slice('impact-'.length)] ?? 0) / 20))
  }
}

// Culasse (spec du lot 2, §3.3) : la boucle de main.js joue l'ouverture puis la fermeture aux instants de
// src/shot/bolt.js. Bruits métalliques brefs, bien sous le niveau du tir.
export function playBoltOpen() {
  noise(0.025, 0.22, 0, 3200)                 // levier relevé : clic sec
  noise(0.09, 0.08, 0.05, 1800)               // culasse tirée : frottement du métal
  tone(1250, 'square', 0.02, 0.06, 0.001, 0.13)   // butée arrière
}

export function playBoltClose() {
  noise(0.08, 0.08, 0, 1600)                  // culasse poussée
  noise(0.03, 0.25, 0.09, 3600)               // verrouillage : claquement
  tone(900, 'square', 0.03, 0.08, 0.001, 0.09)
}

export function playSilencedShot() {
  // Son mat, court
  const vers = sorties(true)
  noise(0.04, 0.35, 0, 800, 'bandpass', vers)
  tone(120, 'sine', 0.06, 0.2, 0.001, 0, vers)
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
// Pluie de la mission du port (spec du lot 2, §3.5) : celle de l'enquête (createRain), démarrée et coupée avec la
// nappe, en fondu aux deux bouts ; niveau et montée réglés dans src/shot/tuning.js (PLUIE).
let rain = null

// rain : la carte a sa pluie (le port, maps.js) ; REVOIR LE BRIEFING la coupe avec la nappe, le retour la relance.
export function startMissionAmbience({ rain: pluie = false } = {}) {
  if (pluie && !rain) {
    const r = createRain({ ctx: getCtx(), dest: out() })
    if (r.start({ niveau: PLUIE.niveau, monteeS: PLUIE.monteeS })) rain = r   // contexte suspendu : pas de pluie, le départ suivant la relancera
  }
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

// Fondu de sortie (s), puis le gain est débranché du maître : sans cela, chaque mission laissait un nœud branché.
const AMB_FADE = 1.2
export function stopMissionAmbience() {
  if (rain) { rain.stop({ fonduS: AMB_FADE }); rain = null }
  if (ambTimer) { clearInterval(ambTimer); ambTimer = null }
  if (ambGain) {
    const c = getCtx(), g = ambGain
    ambGain = null   // une relance crée sa propre nappe ; un second arrêt ne touche plus à celle-ci
    const end = c.currentTime + AMB_FADE
    g.gain.setValueAtTime(g.gain.value, c.currentTime)
    g.gain.linearRampToValueAtTime(0.0001, end)
    disconnectAt(c, g, end)
  }
}

// Débranche node quand l'horloge audio a passé end (fin d'un fondu). Le minuteur peut tomber avant l'horloge audio, en
// retard sur l'horloge de la page : on attend alors encore. Contexte arrêté (suspendu, fermé) : rien ne joue, on
// débranche tout de suite.
function disconnectAt(c, node, end) {
  setTimeout(() => {
    if (c.state === 'running' && c.currentTime < end) return disconnectAt(c, node, end)
    node.disconnect()
  }, Math.max(0, end - c.currentTime) * 1000 + 50)
}

// Contexte et nœud maître partagés : les cinématiques s'y branchent pour suivre le volume du jeu.
export function audioContext() { return getCtx() }
export function masterNode() { return out() }

// État du son de la mission, pour les vérifications (__son() en développement, scripts/verif-mission.mjs) : l'écho
// monté (son acoustique, ou null), la pluie, la nappe, l'état du contexte (sans le créer).
export function audioState() {
  return { contexte: ctx ? ctx.state : null, echo: echo ? echo.acoustique : null, pluie: !!rain, nappe: !!ambTimer }
}
