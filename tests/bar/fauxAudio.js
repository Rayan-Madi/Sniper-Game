import { vi } from 'vitest'

// Faux contexte audio des tests du son du Bivouac (tests/bar/voix.test.js, tests/bar/son.test.js). Il garde chaque nœud
// créé, ses branchements (connect et disconnect les tiennent à jour, comme un vrai graphe), ses départs et ses arrêts.
// Le temps audio n'avance que si le test le fait avancer (avancer(dt)), comme le temps de jeu.

// Un paramètre audio : sa valeur, et la cible de la dernière approche demandée (setTargetAtTime).
function param(value = 0) {
  const p = { value, cible: undefined }
  p.setValueAtTime = vi.fn(v => { if (p.premiere === undefined) p.premiere = v })
  p.linearRampToValueAtTime = vi.fn()
  p.exponentialRampToValueAtTime = vi.fn()
  p.setTargetAtTime = vi.fn(v => { p.cible = v })
  p.cancelScheduledValues = vi.fn()
  return p
}
// ce que vaut un paramètre une fois ses approches finies
export const valeur = p => (p.cible !== undefined ? p.cible : p.value)
// la fréquence de départ d'un oscillateur (posée par setValueAtTime, sinon sa valeur)
export const frequence = o => (o.frequency.premiere !== undefined ? o.frequency.premiere : o.frequency.value)

export function fauxAudio({ etat = 'running', sampleRate = 1000 } = {}) {
  const noeuds = []
  const noeud = (genre, champs = {}) => {
    const n = { genre, sorties: new Set(), ...champs }
    n.connect = vi.fn(d => { n.sorties.add(d); return d })
    n.disconnect = vi.fn(d => { if (d === undefined) n.sorties.clear(); else n.sorties.delete(d) })
    noeuds.push(n)
    return n
  }
  const source = (genre, champs) => {
    const n = noeud(genre, champs)
    n.start = vi.fn(); n.stop = vi.fn()
    return n
  }
  const ctx = {
    state: etat, currentTime: 0, sampleRate,
    createGain: vi.fn(() => noeud('gain', { gain: param(1) })),
    createOscillator: vi.fn(() => source('oscillateur', { type: 'sine', frequency: param(440), detune: param(0) })),
    createBufferSource: vi.fn(() => source('tampon', { buffer: null, loop: false, playbackRate: param(1) })),
    createBiquadFilter: vi.fn(() => noeud('filtre', { type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) })),
    createStereoPanner: vi.fn(() => noeud('panoramique', { pan: param(0) })),
    createConvolver: vi.fn(() => noeud('convolution', { buffer: null, normalize: true })),
    createBuffer: vi.fn((canaux, length, rate) => {
      const donnees = Array.from({ length: canaux }, () => new Float32Array(length))
      return { numberOfChannels: canaux, length, sampleRate: rate, getChannelData: i => donnees[i] }
    }),
    close: vi.fn(),
  }
  const dest = noeud('destination')
  return {
    audio: { ctx, dest }, ctx, dest, noeuds,
    avancer(dt) { ctx.currentTime += dt },
    // les oscillateurs créés depuis le rang `depuis` de ctx.createOscillator
    oscillateurs: (depuis = 0) => ctx.createOscillator.mock.results.slice(depuis).map(r => r.value),
  }
}

// vrai si le signal de n arrive jusqu'à cible en suivant ses branchements
export const atteint = (n, cible, vus = new Set()) =>
  n === cible || (!vus.has(n) && (vus.add(n), [...n.sorties].some(d => atteint(d, cible, vus))))
// vrai si le signal de n est arrivé jusqu'à cible à un moment ou un autre, en suivant tous ses branchements passés (un
// son fini est débranché : pour savoir où il a joué, on suit l'histoire de ses connect)
export const aAtteint = (n, cible, vus = new Set()) =>
  n === cible || (!vus.has(n) && (vus.add(n), (n.connect ? n.connect.mock.calls : []).some(([d]) => aAtteint(d, cible, vus))))
// le premier nœud jamais branché en aval de n qui satisfait `est`
export function premier(n, est, vus = new Set()) {
  if (vus.has(n)) return null
  vus.add(n)
  for (const [d] of n.connect ? n.connect.mock.calls : []) { if (est(d)) return d; const x = premier(d, est, vus); if (x) return x }
  return null
}
// les nœuds encore branchés (la destination partagée mise à part, qui ne se branche sur rien)
export const branches = f => f.noeuds.filter(n => n.sorties.size > 0)
// les sources parties et pas encore arrêtées à l'instant présent (un arrêt programmé plus tard ne compte pas)
export const enCours = f => f.noeuds.filter(n => n.start && n.start.mock.calls.length &&
  !n.stop.mock.calls.some(([t]) => t === undefined || t <= f.ctx.currentTime))
