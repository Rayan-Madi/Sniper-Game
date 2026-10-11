import { ACOUSTIQUES } from './tuning.js'

// Écho de chaque carte (spec du lot 2, §3.5). Module pur (ni DOM ni Web Audio) : il rend la réponse impulsionnelle
// d'une acoustique, que src/audio.js charge dans la ConvolverNode de la mission au montage de sa carte. Quelques
// réflexions franches, puis une traîne de bruit qui décroît de façon exponentielle, adoucie selon la clarté, et pour le
// port un retour très court qui se répète (sonorité métallique). Réglages : ACOUSTIQUES (src/shot/tuning.js).

// Générateur à graine (mulberry32), rendu dans [0, 1[ : la même carte sonne pareil à chaque montage, et le hasard du
// jeu (Math.random, à graine dans les captures) n'est pas déplacé.
function generateur(graine) {
  let s = graine >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Graine propre à une acoustique, tirée de son nom (FNV-1a).
function graineDe(nom) {
  let h = 0x811c9dc5
  for (const ch of String(nom)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return h >>> 0
}

const LN_1000 = Math.log(1000)   // 60 dB, en amplitude

// Réponse impulsionnelle de l'acoustique (rue, place, port, base, colline, interieur) à la fréquence d'échantillonnage
// du contexte audio : { length, canaux: [gauche, droite] } (Float32Array de length échantillons, deux bruits
// différents : un écho large), ou null pour une acoustique inconnue (menu, PvP : pas d'écho).
export function impulseResponse(acoustique, sampleRate, graine = graineDe(acoustique)) {
  if (!Object.hasOwn(ACOUSTIQUES, acoustique)) return null
  const p = ACOUSTIQUES[acoustique]
  const length = Math.round(p.dureeS * sampleRate)
  const debut = Math.round(p.predelaiS * sampleRate)
  const decroit = Math.exp(-LN_1000 / (p.tr60S * sampleRate))   // amplitude gardée d'un échantillon au suivant
  const lissage = 1 - p.clarte
  const hasard = generateur(graine)
  const canaux = [0, 1].map(() => {
    const d = new Float32Array(length)
    // traîne : bruit blanc qui perd 60 dB en tr60S, passé dans un passe-bas à un pôle (plus sourd que clair)
    let env = p.diffus, y = 0
    for (let i = debut; i < length; i++) {
      const x = (hasard() * 2 - 1) * env
      y = x + (y - x) * lissage
      d[i] = y
      env *= decroit
    }
    // sonorité métallique : chaque échantillon revient periodeS plus tard, atténué de gain (filtre en peigne)
    if (p.resonance) {
      const k = Math.round(p.resonance.periodeS * sampleRate)
      for (let i = debut + k; i < length; i++) d[i] += p.resonance.gain * d[i - k]
    }
    // réflexions franches : une par tranche de etendueS, à une place tirée dans la tranche, au niveau de la décroissance
    for (let r = 0; r < p.reflexions; r++) {
      const i = debut + Math.round(((r + hasard()) / p.reflexions) * p.etendueS * sampleRate)
      if (i < length) d[i] += (hasard() < 0.5 ? -1 : 1) * Math.pow(decroit, i - debut)
    }
    return d
  })
  return { length, canaux }
}
