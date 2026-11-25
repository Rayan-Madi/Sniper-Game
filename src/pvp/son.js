import * as THREE from 'three'
import { camera } from '../scene.js'
import { audioContext, masterNode } from '../audio.js'

// ─── Mode PvP : sons ─────────────────────────────────────────────────
// Bips des capacités et des tirs, sonnerie placée dans l'espace, ambiance de fête.

// ─── Petits sons synthétiques ───────────────────────────────────────
// Sur le contexte audio commun (audio.js) et branchés sur son maître : un seul AudioContext pour tout le jeu, et le
// volume des Paramètres s'applique au PvP. Le PvP avait son propre contexte, branché sur sa propre sortie : il
// ignorait le volume et n'était jamais fermé.
function ctx() {
  const c = audioContext()
  if (c.state === 'suspended') c.resume()
  return c
}
function beep(freq, dur, type = 'sine', gain = 0.3, delay = 0) {
  const c = ctx(), o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.value = freq
  o.connect(g); g.connect(masterNode())
  g.gain.setValueAtTime(0.0001, c.currentTime + delay)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur)
  o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.02)
}
function playRingtone() { for (let i = 0; i < 4; i++) { beep(1200, 0.18, 'square', 0.25, i * 0.4); beep(950, 0.18, 'square', 0.2, i * 0.4 + 0.2) } }
function playAlarmSound() { for (let i = 0; i < 6; i++) beep(i % 2 === 0 ? 900 : 600, 0.22, 'sawtooth', 0.28, i * 0.25) }
function playGunshot() { beep(90, 0.18, 'sawtooth', 0.5); beep(240, 0.05, 'square', 0.3) }
function playHitmarker() { beep(1500, 0.08, 'square', 0.3); beep(2000, 0.06, 'square', 0.2, 0.05) }

// Position d'un son dans l'espace, par rapport à la caméra : renvoie un
// panoramique gauche/droite [-1,1] et un gain atténué par la distance. Sert
// à faire "sonner" le téléphone DEPUIS la position du contre-tueur.
function spatialFrom(worldPos) {
  const rel = worldPos.clone().sub(camera.position)
  const dist = rel.length()
  const right = new THREE.Vector3(); camera.getWorldDirection(right)
  right.crossVectors(right, camera.up).normalize()   // vecteur "droite" caméra
  const pan = Math.max(-1, Math.min(1, rel.clone().normalize().dot(right)))
  const gain = Math.max(0.12, Math.min(1, 8 / (dist + 4)))
  return { pan, gain }
}
// Sonnerie de téléphone positionnée à worldPos (panoramique + volume distance).
function positionalRingtone(worldPos) {
  const { pan, gain } = spatialFrom(worldPos)
  const c = ctx()
  const panner = c.createStereoPanner ? c.createStereoPanner() : null
  const bus = c.createGain(); bus.gain.value = gain
  if (panner) { panner.pan.value = pan; bus.connect(panner); panner.connect(masterNode()) }
  else bus.connect(masterNode())
  const ring = (freq, dur, delay) => {
    const o = c.createOscillator(), g = c.createGain()
    o.type = 'square'; o.frequency.value = freq; o.connect(g); g.connect(bus)
    g.gain.setValueAtTime(0.0001, c.currentTime + delay)
    g.gain.linearRampToValueAtTime(0.28, c.currentTime + delay + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur)
    o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.02)
  }
  for (let i = 0; i < 4; i++) { ring(1200, 0.18, i * 0.4); ring(950, 0.18, i * 0.4 + 0.2) }
}

// ─── Ambiance de fête (musique + brouhaha en boucle) ─────────────────
let ambienceTimer = null, ambienceNodes = null, ambienceStep = 0
function startPvpAmbience() {
  stopPvpAmbience()
  const c = ctx()
  const master = c.createGain(); master.gain.value = 0.5; master.connect(masterNode())
  // Brouhaha de foule : bruit filtré passe-bas, continu et discret
  const bufferSize = 2 * c.sampleRate
  const noiseBuf = c.createBuffer(1, bufferSize, c.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5
  const noise = c.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true
  const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 500
  const ng = c.createGain(); ng.gain.value = 0.06
  noise.connect(nf); nf.connect(ng); ng.connect(master); noise.start()
  ambienceNodes = { master, noise }
  // Musique : kick 4/4 + basse qui tourne (rythme de fête)
  const bass = [55, 55, 82.4, 65.4]
  ambienceStep = 0
  ambienceTimer = setInterval(() => {
    const t = c.currentTime
    // kick
    const ko = c.createOscillator(), kg = c.createGain()
    ko.frequency.setValueAtTime(140, t); ko.frequency.exponentialRampToValueAtTime(48, t + 0.12)
    kg.gain.setValueAtTime(0.5, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    ko.connect(kg); kg.connect(master); ko.start(t); ko.stop(t + 0.2)
    // basse (une note sur deux pas)
    if (ambienceStep % 2 === 0) {
      const bo = c.createOscillator(), bg = c.createGain()
      bo.type = 'sawtooth'; bo.frequency.value = bass[(ambienceStep / 2) % bass.length]
      bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.12, t + 0.03)
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      bo.connect(bg); bg.connect(master); bo.start(t); bo.stop(t + 0.4)
    }
    // charley (hi-hat) sur le contretemps
    if (ambienceStep % 2 === 1) {
      const ho = c.createOscillator(), hg = c.createGain(), hf = c.createBiquadFilter()
      hf.type = 'highpass'; hf.frequency.value = 7000; ho.type = 'square'; ho.frequency.value = 8000
      hg.gain.setValueAtTime(0.08, t); hg.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
      ho.connect(hf); hf.connect(hg); hg.connect(master); ho.start(t); ho.stop(t + 0.06)
    }
    ambienceStep++
  }, 300)
}
function stopPvpAmbience() {
  if (ambienceTimer) { clearInterval(ambienceTimer); ambienceTimer = null }
  if (ambienceNodes) {
    try { ambienceNodes.noise.stop() } catch (e) {}
    try { ambienceNodes.master.disconnect() } catch (e) {}
    ambienceNodes = null
  }
}

export { playAlarmSound, playGunshot, playHitmarker, positionalRingtone, startPvpAmbience, stopPvpAmbience }
