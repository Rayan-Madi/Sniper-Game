// Les voix bipées du Bivouac, le bar de M5 (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.2, §3.4 « Son des
// voix » et §8 ; plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B7). Web Audio, sans minuteur ni Math.random :
// une voix ne bipe qu'à update(dt), au temps de jeu (en pause, on ne l'appelle pas : plus une syllabe), et ses syllabes
// sont tirées par le générateur à graine de src/shot/acoustics.js. La recette des syllabes est celle de la voix des
// cinématiques (voice, src/briefing/sound.js:51-63), qui reste telle quelle ; timbres et valeurs : VOIX de
// src/bar/reglages.js.
//
// creerVoix(audio, { ...timbre, graine, sortie, reverberation }) : la voix d'une personne, avec sa propre chaîne
//   syllabes → passe-bande et passe-bas du timbre → entrée (niveau × gain) → coupure (passe-bas) → panoramique → sortie
//   (la destination du jeu, audio.dest, par défaut) et la réverbération de la salle si on la donne (src/bar/son.js).
//   parler(dureeS) : elle parle ce temps de jeu (une réplique : son estimation, src/briefing/kit.js:10) ; taire() ;
//   update(dt, { gain, coupure, pan }) : le temps avance et les syllabes dues partent, au gain, à la coupure et au
//   panoramique de l'écoute (reglageBips) ; sous VOIX.seuilGain, elle ne bipe pas mais sa réplique avance ; dispose() ;
//   parle.
// creerChoeur(audio, { timbres, sortie, reverberation, max, graine }) : les voix des personnes, créées au premier mot ;
//   update(dt, { sources, sousTitre }) n'en laisse biper que max (ECOUTE.voixBipeesMax, 3) à la fois : la sous-titrée,
//   puis les plus fortes (§3.4).
// reglageBips(oreille, regard, source, boites) : ce que l'écoute laisse entendre des bips d'une source.
//
// Sans contexte audio (tests, son indisponible), tout est muet et rien ne lève. Contexte suspendu (avant le geste du
// joueur) : aucune syllabe, qui partiraient toutes d'un coup à la reprise. Les outils du bas du fichier (contexte, bruit
// à graine, nœuds des sons finis, réglage en douceur) servent aussi à src/bar/son.js.
import { VOIX, ECOUTE } from './reglages.js'
import { audibilite, transmission } from './ecoute.js'
import { generateur } from '../shot/acoustics.js'

// Les instants se comparent à un milliardième près, comme dans la jauge et la soirée.
const EPS = 1e-9
// un pas de temps invalide (NaN, absent, négatif, infini) compte pour zéro, comme dans la jauge
const secondes = d => (Number.isFinite(d) && d > 0 ? d : 0)
const borne = (v, a, b) => Math.min(b, Math.max(a, v))
// un tirage entre deux bornes
const entre = (hasard, [a, b]) => a + hasard() * (b - a)

export function creerVoix(audio, options = {}) {
  const o = { ...VOIX.defaut, ...options }
  if (!(o.f0Min > 0 && o.f0Max >= o.f0Min && o.debit > 0)) throw new Error(`voix du bar : timbre invalide (${o.f0Min} à ${o.f0Max} Hz, débit ${o.debit})`)
  const c = contexteDe(audio)
  const sortie = o.sortie || (audio && audio.dest) || null
  const hasard = generateur(o.graine ?? 1)
  const pas = VOIX.pasS / o.debit
  let t = 0, fin = 0, prochain = 0, silenceJusque = -Infinity, gain = 0, mort = false

  // la chaîne de la personne, créée d'emblée ; les syllabes s'y branchent
  let chaine = null, ephemeres = null, regler = null
  if (c && sortie) {
    const bande = c.createBiquadFilter(); bande.type = 'bandpass'; bande.frequency.value = o.bande.hz; bande.Q.value = o.bande.q
    const timbre = c.createBiquadFilter(); timbre.type = 'lowpass'; timbre.frequency.value = o.passeBas
    const entree = c.createGain(); entree.gain.value = 0
    const coupure = c.createBiquadFilter(); coupure.type = 'lowpass'; coupure.frequency.value = VOIX.coupureOuverteHz
    const pan = panoramique(c)
    bande.connect(timbre); timbre.connect(entree); entree.connect(coupure)
    const bout = pan ? (coupure.connect(pan), pan) : coupure
    bout.connect(sortie)
    if (o.reverberation) bout.connect(o.reverberation)
    chaine = { bande, entree, coupure, pan, noeuds: [bande, timbre, entree, coupure, pan].filter(Boolean) }
    ephemeres = creerEphemeres(c)
    regler = creerReglage(c, VOIX.lissageS)
  }

  // une syllabe, maintenant : une dent de scie qui glisse vers le bas, une enveloppe courte (sound.js:53-60)
  function syllabe(f, depart, duree, crete) {
    const t0 = c.currentTime, osc = c.createOscillator(), env = c.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(depart, t0); osc.frequency.exponentialRampToValueAtTime(f * o.chute, t0 + o.chuteS)
    env.gain.setValueAtTime(0.001, t0); env.gain.linearRampToValueAtTime(crete, t0 + o.attaqueS)
    env.gain.exponentialRampToValueAtTime(0.001, t0 + duree)
    osc.connect(env); env.connect(chaine.bande)
    osc.start(t0); osc.stop(t0 + duree + 0.02)
    ephemeres.ajouter([osc, env], t0 + duree + 0.05)
  }

  // Le pas dû à l'instant p (temps de la voix), traité à l'image qui finit en t1. Les tirages ne dépendent que de la
  // graine et des pas : qu'on l'entende ou non, la voix dit la même chose au même moment.
  function unPas(p, t1) {
    if (p < silenceJusque - EPS) return
    if (hasard() < o.pauses) { silenceJusque = p + entre(hasard, o.pauseS); return }
    if (hasard() < o.saut) return
    const f = entre(hasard, [o.f0Min, o.f0Max]), depart = f * (1 + hasard() * o.glissement)
    const duree = entre(hasard, o.syllabeS), crete = entre(hasard, o.crete)
    // un pas trop ancien (un grand pas de temps) ne sonne pas : jamais de rafale de syllabes au rattrapage
    if (!chaine || t1 - p > VOIX.retardMaxS + EPS || gain < VOIX.seuilGain || !enMarche(c)) return
    syllabe(f, depart, duree, crete)
  }

  return {
    parler(dureeS) {
      if (mort) return
      fin = t + (dureeS > 0 ? dureeS : 0)   // Infinity : sans fin (le brouhaha)
      prochain = t
      silenceJusque = -Infinity
    },
    taire() { fin = t },
    get parle() { return !mort && fin > t + EPS },
    update(dt, reglage = {}) {
      if (mort) return
      const pasDeTemps = secondes(dt)
      const { gain: g = 1, coupure = VOIX.coupureOuverteHz, pan = 0 } = reglage
      gain = Number.isFinite(g) && g > 0 ? g : 0
      if (chaine) {
        regler(chaine.entree.gain, o.niveau * gain)
        regler(chaine.coupure.frequency, Number.isFinite(coupure) ? borne(coupure, 20, VOIX.coupureOuverteHz) : VOIX.coupureOuverteHz)
        if (chaine.pan) regler(chaine.pan.pan, Number.isFinite(pan) ? borne(pan, -1, 1) : 0)
        ephemeres.nettoyer()
      }
      const t1 = t + pasDeTemps
      while (prochain <= t1 + EPS && prochain < fin - EPS) { unPas(prochain, t1); prochain += pas }
      t = t1
    },
    dispose() {
      if (mort) return
      mort = true
      fin = t
      if (!chaine) return
      ephemeres.vider()
      debrancher(chaine.noeuds)
      regler.oublier()
    },
  }
}

// Le chœur : une voix par personne (VOIX.timbres), créée à son premier mot, graine tirée de son nom. À chaque image,
// sources donne, pour qui parle, ce que l'écoute en laisse (reglageBips) ; seules max voix bipent : la sous-titrée si elle
// s'entend, puis les plus fortes ; les autres avancent leur réplique sans biper. actives : celles qui ont bipé.
export function creerChoeur(audio, { timbres = VOIX.timbres, sortie, reverberation, max = ECOUTE.voixBipeesMax, graine = 1 } = {}) {
  const muet = !contexteDe(audio)
  const voix = new Map()
  let actives = [], mort = false
  const verifier = qui => {
    if (!Object.hasOwn(timbres, qui)) throw new Error(`voix du bar : personne sans timbre « ${qui} »`)
  }
  const obtenir = qui => {
    let v = voix.get(qui)
    if (!v) {
      v = creerVoix(audio, { ...timbres[qui], graine: graineDe(qui, graine), sortie, reverberation })
      voix.set(qui, v)
    }
    return v
  }
  return {
    parler(qui, dureeS) { verifier(qui); if (!mort) obtenir(qui).parler(dureeS) },
    taire(qui) { const v = voix.get(qui); if (v) v.taire() },
    parle: qui => !!(voix.get(qui) && voix.get(qui).parle),
    update(dt, { sources = {}, sousTitre = null } = {}) {
      if (mort) return
      const gainDe = qui => { const s = sources[qui]; return s && Number.isFinite(s.gain) ? s.gain : 0 }
      const candidats = [...voix].filter(([qui, v]) => v.parle && gainDe(qui) >= VOIX.seuilGain).map(([qui]) => qui)
      candidats.sort((a, b) => (b === sousTitre) - (a === sousTitre) || gainDe(b) - gainDe(a) || (a < b ? -1 : 1))
      const retenus = candidats.slice(0, max)
      for (const [qui, v] of voix) v.update(dt, retenus.includes(qui) ? sources[qui] : { ...sources[qui], gain: 0 })
      actives = muet ? [] : retenus
    },
    get actives() { return [...actives] },
    dispose() {
      mort = true
      for (const v of voix.values()) v.dispose()
      voix.clear()
      actives = []
    },
  }
}

// Ce que l'écoute laisse entendre des bips d'une source (§3.4, « Son des voix ») : gain A(d / (porteeBips × voix)) × T
// (on entend plus loin qu'on ne comprend), coupure passeBas.baseHz + passeBas.plageHz × T (les murs assourdissent),
// panoramique sin(azimut) (à droite, 1 ; à gauche, −1 ; devant ou dans le dos, 0). oreille : { x, z } ; regard : direction
// au sol, de n'importe quelle longueur ; source : { x, z, voix } (voix de ECOUTE.voix, normale si absente) ; boites :
// celles du plan (src/bar/plan.js). Mêmes conventions que intelligibilite (src/bar/ecoute.js).
export function reglageBips(oreille, regard, source, boites) {
  const { porteeBips, passeBas } = ECOUTE
  const voix = source.voix ?? ECOUTE.voix.normale
  const dx = source.x - oreille.x, dz = source.z - oreille.z
  const d = Math.hypot(dx, dz), r = Math.hypot(regard.x, regard.z)
  const T = transmission(oreille, source, boites)
  const gain = voix > 0 ? audibilite(d / (porteeBips * voix)) * T : 0
  // la droite du regard (x, z) est (−z, x) : le panoramique est la part de la direction de la source sur elle
  const pan = d > 0 && r > 0 ? (dx * -regard.z + dz * regard.x) / (d * r) : 0
  return { gain, coupure: passeBas.baseHz + passeBas.plageHz * T, pan: pan || 0 }
}

// ─── Outils communs aux voix et à la salle (src/bar/son.js) ─────────

// Le contexte d'un audio du jeu ({ ctx, dest }), ou null : muet.
export function contexteDe(audio) {
  const c = audio && audio.ctx
  return c && c.state !== 'closed' ? c : null
}
// Un contexte qui joue : un son programmé dans un contexte suspendu partirait, avec tous les autres, à la reprise.
export const enMarche = c => !!c && c.state === 'running'

// Un panoramique stéréo, ou null si le navigateur n'en a pas (le son reste au centre).
export const panoramique = c => (c.createStereoPanner ? c.createStereoPanner() : null)

// Une graine tirée d'un nom et d'une graine de base (FNV-1a, comme graineDe de src/shot/acoustics.js).
export function graineDe(nom, graine = 0) {
  let h = (0x811c9dc5 ^ graine) >>> 0
  for (const ch of String(nom)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return h >>> 0
}

// Un tampon de bruit blanc de dureeS secondes, tiré à graine : aucun Math.random (sound.js:17).
export function bruitBlanc(c, dureeS, graine) {
  const n = Math.max(1, Math.round(dureeS * c.sampleRate))
  const tampon = c.createBuffer(1, n, c.sampleRate)
  const d = tampon.getChannelData(0), hasard = generateur(graine)
  for (let i = 0; i < n; i++) d[i] = hasard() * 2 - 1
  return tampon
}

export function arreter(noeuds) {
  for (const n of noeuds) if (n.stop) try { n.stop() } catch (e) { /* jamais partie, ou déjà arrêtée */ }
}
export function debrancher(noeuds) {
  for (const n of noeuds) try { n.disconnect() } catch (e) { /* déjà débranché */ }
}

// Les nœuds des sons finis (syllabes, notes, sons ponctuels) : un groupe est débranché par nettoyer() une fois son heure
// de fin passée sur l'horloge audio (appelé à chaque update), et tout ce qui reste par vider(), sources arrêtées d'abord.
// Aucun minuteur ni écouteur : sans update, un son fini reste branché, muet, jusqu'à la suivante ou jusqu'à l'arrêt.
export function creerEphemeres(c) {
  let groupes = []
  return {
    ajouter(noeuds, finA) { groupes.push({ noeuds, finA }) },
    nettoyer() {
      if (!groupes.length) return
      const maintenant = c.currentTime
      groupes = groupes.filter(g => { if (g.finA > maintenant) return true; debrancher(g.noeuds); return false })
    },
    vider() {
      const tous = groupes
      groupes = []
      for (const g of tous) { arreter(g.noeuds); debrancher(g.noeuds) }
    },
  }
}

// Règle un paramètre en douceur (approche de constante de temps tau), seulement quand la valeur demandée change : rien
// ne s'empile d'une image à l'autre. La première valeur est posée d'emblée.
export function creerReglage(c, tauParDefaut) {
  const derniers = new Map()
  const regler = (param, v, tau = tauParDefaut) => {
    const avant = derniers.get(param)
    if (avant !== undefined && Math.abs(avant - v) <= 1e-4 * Math.max(1, Math.abs(v))) return
    derniers.set(param, v)
    if (avant === undefined) param.value = v
    else param.setTargetAtTime(v, c.currentTime, tau)
  }
  regler.oublier = () => derniers.clear()
  return regler
}
