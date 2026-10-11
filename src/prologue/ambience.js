// Son de l'enquête : pluie continue, cœur qui accélère à l'approche du salon, grincement de la porte, pas feutrés,
// acouphène, voix intérieure de Viktor. Tout passe par la destination du jeu (son volume général s'applique).
import { createSound } from '../briefing/sound.js'
import { estimate } from '../briefing/kit.js'

// Niveaux de l'ambiance, à régler ici d'une ligne (spec docs/superpowers/specs/2026-10-11-prologue-v2-design.md §4 : la
// pluie et le cœur couvraient tout le reste).
// Pluie : gain atteint au bout de sa montée de 2 s ; 0,03 est la moitié des 0,06 d'avant la recette (−6 dB).
const RAIN_GAIN = 0.03
// Cœur : facteur appliqué au battement du kit des cinématiques (heart, src/briefing/sound.js), qui lui ne change pas ;
// 0,6 au lieu de 1 avant la recette (−4,4 dB).
const HEART_GAIN = 0.6

// Vibration du téléphone posé sur la console (spec docs/superpowers/specs/2026-10-11-enquete-fin-design.md §3.1) : une
// salve dure `salve` secondes ; à la fin, deux salves séparées de `gap`, deux fois (l'enquête les déclenche une à une,
// au temps de jeu).
export const BUZZ = { salve: 0.28, gap: 0.42 }
const unplug = nodes => nodes.forEach(n => { try { n.disconnect() } catch (e) { /* déjà débranché */ } })

export function createAmbience(audio) {
  const timers = new Set(), intervals = new Set()
  const buzzing = new Set()   // nœuds des salves en cours : débranchés à la fin de leur salve, ou à l'arrêt
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
    try { g.gain.linearRampToValueAtTime(RAIN_GAIN, c.currentTime + 2) } catch (e) { /* contexte fermé */ }
    src.start()
    rain = { src, g }
  }

  // cœur : le battement du kit (deux coups sourds, mêmes fréquences et durées) à HEART_GAIN de son niveau, puis le suivant
  // d'autant plus tôt qu'on est près (1,15 s → 0,65 s)
  const heartbeat = () => { S.tone(58, 'sine', 0.16, 0.8 * HEART_GAIN, 0, 40); S.tone(52, 'sine', 0.2, 0.6 * HEART_GAIN, 0.22, 36) }
  const heartLoop = () => { if (dead) return; heartbeat(); at(1150 - 500 * proximity, heartLoop) }

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
    // une salve de vibration : le moteur (bourdonnement grave, ~150 Hz) et la console de bois qui résonne dessous,
    // filtrés sourds ; ses nœuds sont débranchés dès la salve finie
    buzz() {
      if (!live()) return
      const t = c.currentTime, d = BUZZ.salve
      const motor = c.createOscillator(); motor.type = 'sawtooth'; motor.frequency.setValueAtTime(152, t)
      const wood = c.createOscillator(); wood.type = 'square'; wood.frequency.setValueAtTime(76, t)
      const low = c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 480; low.Q.value = 3
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.025)
      g.gain.setValueAtTime(0.2, t + d - 0.04); g.gain.linearRampToValueAtTime(0.0001, t + d)
      motor.connect(low); wood.connect(low); low.connect(g); g.connect(audio.dest)
      motor.start(t); wood.start(t); motor.stop(t + d + 0.02); wood.stop(t + d + 0.02)
      const nodes = [motor, wood, low, g]
      buzzing.add(nodes)
      at(d * 1000 + 40, () => { buzzing.delete(nodes); unplug(nodes) })
    },
    stop() {
      if (dead) return
      S.destroy(); dead = true
      timers.forEach(clearTimeout); timers.clear(); intervals.forEach(clearInterval); intervals.clear()
      // une salve en cours finit sur son enveloppe (0,28 s au plus, pas de coupure sèche), puis elle est débranchée : son
      // minuteur de fin vient d'être annulé, un minuteur natif prend le relais (comme pour la pluie)
      if (buzzing.size) {
        const left = [...buzzing]; buzzing.clear()
        setTimeout(() => left.forEach(unplug), BUZZ.salve * 1000 + 40)
      }
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
