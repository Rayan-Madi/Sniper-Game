// Son de l'enquête : pluie continue, cœur qui accélère à l'approche du salon, grincement de la porte, pas feutrés,
// acouphène, voix intérieure de Viktor. Tout passe par la destination du jeu (son volume général s'applique).
import { createSound } from '../briefing/sound.js'
import { estimate } from '../briefing/kit.js'

export function createAmbience(audio) {
  const timers = new Set(), intervals = new Set()
  let dead = false, started = false, proximity = 0, voiceEnd = 0
  const at = (ms, fn) => { const h = setTimeout(() => { timers.delete(h); if (!dead) fn() }, ms); timers.add(h); return h }
  const every = (ms, fn) => { const h = setInterval(() => { if (!dead) fn() }, ms); intervals.add(h); return h }
  const stopEvery = h => { clearInterval(h); intervals.delete(h) }
  const S = createSound(audio, { every, stopEvery })
  const c = audio && audio.ctx ? audio.ctx : null
  const live = () => !dead && !!c && c.state === 'running'

  // pluie : bruit en boucle filtré, tenu tant que l'enquête dure ; 6 s de bruit (une boucle de 2 s s'entendait se répéter)
  const RAIN_S = 6
  let rain = null
  function startRain() {
    if (!live() || rain) return
    const buf = c.createBuffer(1, c.sampleRate * RAIN_S, c.sampleRate)
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true
    const band = c.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 1400; band.Q.value = 0.5
    const high = c.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 380
    const g = c.createGain(); g.gain.value = 0.0001
    src.connect(band); band.connect(high); high.connect(g); g.connect(audio.dest)
    try { g.gain.linearRampToValueAtTime(0.06, c.currentTime + 2) } catch (e) { /* contexte fermé */ }
    src.start()
    rain = { src, g }
  }

  // cœur : un battement, puis le suivant d'autant plus tôt qu'on est près (1,15 s → 0,65 s)
  const heartLoop = () => { if (dead) return; S.heart(); at(1150 - 500 * proximity, heartLoop) }

  const api = {
    start() {
      if (dead || started) return
      started = true
      startRain()
      S.noise(1.6, 0.07, 520, 'bandpass', 0, 9, 240); S.tone(95, 'sawtooth', 1.3, 0.03, 0, 70)   // la porte grince
      at(900, heartLoop)
    },
    setProximity(p) { proximity = Math.max(0, Math.min(1, p || 0)) },
    step() { S.noise(0.07, 0.1, 420, 'lowpass'); S.tone(68, 'sine', 0.09, 0.12) },
    tinnitus() { S.tone(6900, 'sine', 4.6, 0.035); S.tone(7350, 'sine', 4, 0.018, 0.3) },
    glitch(ms = 200, p = 0.7) { S.glitch(ms, p) },
    speak(text) {   // une nouvelle réplique fait d'abord taire la précédente (et annule sa fin prévue, qui couperait la nouvelle)
      const ms = estimate(text)
      if (!dead) { api.hush(); S.voice('inner', true); voiceEnd = at(ms, () => { voiceEnd = 0; S.stopVoice() }) }
      return ms
    },
    // coupe la voix en cours et annule son arrêt programmé (fiche refermée avant la fin de la réplique)
    hush() {
      if (voiceEnd) { clearTimeout(voiceEnd); timers.delete(voiceEnd); voiceEnd = 0 }
      if (!dead) S.stopVoice()
    },
    stop() {
      if (dead) return
      S.destroy(); dead = true
      timers.forEach(clearTimeout); timers.clear(); intervals.forEach(clearInterval); intervals.clear()
      if (rain) {
        const { src, g } = rain; rain = null
        // la montée de 2 s peut être encore programmée : l'annuler d'abord, sinon elle reprend le dessus sur le fondu, mais en
        // gardant le niveau déjà atteint (cancelScheduledValues seul ramènerait le gain à 0,0001 : coupure sèche au lieu d'un fondu)
        try {
          const t = c.currentTime
          if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(t)
          else { const v = g.gain.value; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(v, t) }   // Firefox n'a pas cancelAndHoldAtTime
          g.gain.setTargetAtTime(0.0001, t, 0.08)
        } catch (e) { /* contexte fermé */ }
        setTimeout(() => { try { src.stop() } catch (e) { /* déjà arrêtée */ } try { g.disconnect() } catch (e) { /* déjà débranché */ } }, 300)
      }
    },
  }
  return api
}
