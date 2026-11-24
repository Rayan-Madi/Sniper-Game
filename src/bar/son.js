// Le son de la salle du Bivouac, le bar de M5 (spec docs/superpowers/specs/2026-10-28-m5-bar-design.md §3.12 et §8 ; plan
// docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B7). Web Audio, procédural, sans minuteur ni Math.random : tout
// avance par update(dt), et le hasard vient du générateur à graine de src/shot/acoustics.js. Valeurs : SON de
// src/bar/reglages.js. Les voix des personnes sont à part (src/bar/voix.js) : elles rejoignent la réverbération de la
// salle par son.reverberation.
//
// creerSon(audio, { sortie, graine }) rend :
// - update(dt, { pause, presents, soupcon, palier, jukebox, tele }) à chaque image, en pause comprise (avec le temps réel,
//   borné à 0,05 s comme le pas de la boucle, main.js:1421 : la musique continue, 10 dB plus bas, et rien d'autre
//   n'avance, ni syllabe, ni verre, ni battement ; un pas plus long ne rattrape pas ce qu'il a sauté, au-delà de
//   VOIX.retardMaxS de retard, ou de 0,15 s par image pour les notes du juke-box, programmées SON.jukebox.avanceS à
//   l'avance). presents : les personnes dans la salle (le brouhaha suit présents / 8) ; soupcon : S de la jauge ;
//   palier : le sien (PALIERS de src/bar/soupcon.js) ; jukebox et tele : { T, pan, gain } de chacun pour l'oreille de
//   Viktor (T : ce que laissent passer les boîtes du plan, transmission de src/bar/ecoute.js ; pan : sin(azimut),
//   reglageBips de src/bar/voix.js ; gain : 1 par défaut) ;
// - les sons ponctuels clochette() (et la porte), sonnerie() (une sonnerie du téléphone : la soirée en émet trois),
//   note() (NOTÉ : un renseignement appris), pas() (onStep du contrôleur) ;
// - reverberation : le nœud où envoyer les voix (null sans son, ou une fois arrêtée) ; etat() pour le débogage ;
// - stop() : tout débranché et arrêté, la réponse impulsionnelle lâchée, sans fondu ni minuteur ; rien de partagé
//   (la destination du jeu, le contexte) n'est touché.
//
// Ce qui sonne :
// - le brouhaha : trois générateurs de syllabes (des voix bipées sans fin, src/bar/voix.js) à gauche, devant et à droite,
//   sur un lit de bruit sourd ; × présents / 8, × le canard du soupçon (1 ; 0,7 dès 60 ; 0,35 dès 85), à 0,1 en 0,8 s une
//   fois démasqué (§3.10) ;
// - les verres, toutes les 3 à 8 s ; le juke-box (quatre accords, une basse à 84 bpm, des craquements), assourdi par les
//   murs (passe-bas 450 + 3 000 × T Hz) ; le tiercé à la télé, par bouffées ;
// - le cœur, dès SOUPÇON (le palier : il bat encore à 55 si l'on n'est pas redescendu sous 52), de 1,1 s à 0,6 s
//   d'intervalle de S = 60 à 100 ;
// - une réverbération à elle (une ConvolverNode chargée de la réponse « interieur »), jamais l'écho de la mission
//   (mountEcho, un singleton du jeu, src/audio.js).
// Sans contexte audio, tout est muet et rien ne lève ; contexte suspendu (avant le geste du joueur), aucun son programmé.
import { SON, VOIX, ECOUTE } from './reglages.js'
import { PALIERS } from './soupcon.js'
import { impulseResponse, generateur } from '../shot/acoustics.js'
import {
  creerVoix, contexteDe, enMarche, panoramique, bruitBlanc, creerEphemeres, creerReglage, arreter, debrancher,
  EPS, secondes, borne, entre, ARRET_S, DEBRANCHE_S,
} from './voix.js'

const dB = v => 10 ** (v / 20)
// le tampon de bruit blanc des sons ponctuels et du lit du brouhaha, en boucle (s), comme celui de sound.js:16
const BRUIT_S = 2
const RANG_SOUPCON = PALIERS.indexOf('soupcon')
const RANG_DEMASQUE = PALIERS.indexOf('demasque')

// le rang d'un palier ; un palier inconnu est une erreur, jamais un calme silencieux
function rangDe(palier) {
  const r = PALIERS.indexOf(palier)
  if (r < 0) throw new Error(`son du bar : palier inconnu « ${palier} »`)
  return r
}

export function creerSon(audio, { sortie, graine = SON.graine } = {}) {
  const c = contexteDe(audio)
  const dest = sortie || (audio && audio.dest) || null
  const actif = !!(c && dest)
  const hasard = generateur(graine)                  // la salle : verres, bouffées de la télé
  const hasardBruits = generateur(graine ^ 0x5bd1e995)   // les départs dans le bruit des sons ponctuels
  const sousGraine = () => Math.floor(hasard() * 4294967296) >>> 0
  let mort = false, pause = false
  const etat = { pause: false, brouhaha: 0, jukebox: { coupure: 0, gain: 0 }, coeur: null }

  const persistants = [], boucles = [], voixSalle = []
  let ephemeres = null, regler = null, bruit = null
  let general = null, envoi = null, convolution = null, busBrouhaha = null, busJukebox = null, filtreJukebox = null,
    panJukebox = null, bavards = [], tierce = null
  const garde = n => { persistants.push(n); return n }

  if (actif) {
    ephemeres = creerEphemeres(c)
    regler = creerReglage(c, SON.lissageS)
    bruit = bruitBlanc(c, BRUIT_S, sousGraine())
    general = garde(c.createGain()); general.connect(dest)

    // la réverbération : la réponse « interieur » des acoustiques du jeu, dans une ConvolverNode à elle
    const ir = impulseResponse(SON.reverberation.acoustique, c.sampleRate)
    const tampon = c.createBuffer(ir.canaux.length, ir.length, c.sampleRate)
    ir.canaux.forEach((d, i) => tampon.getChannelData(i).set(d))
    convolution = garde(c.createConvolver()); convolution.buffer = tampon; convolution.connect(general)
    envoi = garde(c.createGain()); envoi.gain.value = dB(SON.reverberation.envoiDb); envoi.connect(convolution)

    // le brouhaha : son bus, un lit de bruit sourd en boucle, trois générateurs de syllabes sans fin
    const B = SON.brouhaha
    busBrouhaha = garde(c.createGain()); busBrouhaha.gain.value = 0; busBrouhaha.connect(general)
    const lit = garde(c.createBufferSource()); lit.buffer = bruit; lit.loop = true
    const litBas = garde(c.createBiquadFilter()); litBas.type = 'lowpass'; litBas.frequency.value = B.lit.passeBas
    const litGain = garde(c.createGain()); litGain.gain.value = B.lit.niveau
    lit.connect(litBas); litBas.connect(litGain); litGain.connect(busBrouhaha)
    lit.start(); boucles.push(lit)
    bavards = B.pans.map(pan => {
      const v = creerVoix(audio, { ...B.timbre, graine: sousGraine(), sortie: busBrouhaha })
      v.parler(Infinity); voixSalle.push(v)
      return { v, pan }
    })

    // le juke-box : bus → passe-bas (les murs) → panoramique → sortie ; les craquements du disque en boucle
    busJukebox = garde(c.createGain()); busJukebox.gain.value = 0
    filtreJukebox = garde(c.createBiquadFilter()); filtreJukebox.type = 'lowpass'
    panJukebox = panoramique(c)
    busJukebox.connect(filtreJukebox)
    if (panJukebox) { garde(panJukebox); filtreJukebox.connect(panJukebox); panJukebox.connect(general) } else filtreJukebox.connect(general)
    const disque = garde(c.createBufferSource()); disque.buffer = craquements(); disque.loop = true
    disque.connect(busJukebox); disque.start(); boucles.push(disque)

    // la télé : le tiercé, une voix rapide et nasillarde
    tierce = creerVoix(audio, { ...SON.tierce.timbre, graine: sousGraine(), sortie: general })
    voixSalle.push(tierce)
  }

  // Le disque : un souffle léger et des clics épars, tirés à graine, en boucle.
  function craquements() {
    const K = SON.jukebox.craquements, n = Math.max(1, Math.round(K.boucleS * c.sampleRate))
    const tampon = c.createBuffer(1, n, c.sampleRate), d = tampon.getChannelData(0), h = generateur(sousGraine())
    for (let i = 0; i < n; i++) d[i] = (h() * 2 - 1) * K.souffle
    for (let k = Math.round(K.parS * K.boucleS); k > 0; k--) {
      const i = Math.floor(h() * n), a = (h() < 0.5 ? -1 : 1) * K.niveau * (0.3 + 0.7 * h())
      d[i] += a
      if (i + 1 < n) d[i + 1] -= a / 2
    }
    return tampon
  }

  // ─── Recettes des sons ponctuels (tone et noise du kit des cinématiques, src/briefing/sound.js:21-35) ───
  const joue = () => actif && !mort && enMarche(c)

  // Un ton : f (glissé jusqu'à finHz), montée jusqu'à crête en attaqueS puis chute en dureeS (exponentielle, ou
  // linéaire comme les nappes de music), vers les nœuds donnés.
  function ton(f, type, dureeS, crete, t0, vers, { attaqueS = 0.008, finHz = null, lineaire = false } = {}) {
    const o = c.createOscillator(), g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(f, t0)
    if (finHz) o.frequency.exponentialRampToValueAtTime(finHz, t0 + dureeS)
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(crete, t0 + attaqueS)
    if (lineaire) g.gain.linearRampToValueAtTime(0.0001, t0 + dureeS)
    else g.gain.exponentialRampToValueAtTime(0.0001, t0 + dureeS)
    o.connect(g); for (const d of vers) g.connect(d)
    o.start(t0); o.stop(t0 + dureeS + ARRET_S)
    ephemeres.ajouter([o, g], t0 + dureeS + DEBRANCHE_S)
    return o
  }
  // Un bruit filtré (fréquence glissée jusqu'à finHz), même enveloppe qu'un ton ; il part d'un point tiré dans le tampon.
  function souffle(dureeS, crete, hz, type, t0, vers, { q = 1, finHz = null, attaqueS = 0.006 } = {}) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = bruit; s.loop = true
    f.type = type; f.frequency.setValueAtTime(hz, t0); f.Q.value = q
    if (finHz) f.frequency.exponentialRampToValueAtTime(finHz, t0 + dureeS)
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(crete, t0 + attaqueS)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dureeS)
    s.connect(f); f.connect(g); for (const d of vers) g.connect(d)
    s.start(t0, hasardBruits() * (BRUIT_S - 0.1)); s.stop(t0 + dureeS + ARRET_S)
    ephemeres.ajouter([s, f, g], t0 + dureeS + DEBRANCHE_S)
  }

  // ─── Le brouhaha ───
  function brouhaha(dt, { presents, soupcon, palier }) {
    const B = SON.brouhaha
    let facteur = 1, tau = B.lissageS
    if (rangDe(palier) >= RANG_DEMASQUE) { facteur = B.demasque.facteur; tau = B.demasque.dureeS / Math.log(1000) }
    else for (const k of B.canard) if (soupcon >= k.des - EPS) { facteur = k.facteur; break }
    const plein = Number.isFinite(presents) ? borne(presents / B.presentsPlein, 0, 1) : 1
    etat.brouhaha = B.niveau * plein * facteur
    regler(busBrouhaha.gain, etat.brouhaha, tau)
    if (!pause) for (const { v, pan } of bavards) v.update(dt, { gain: 1, pan })
  }

  // ─── Le juke-box : les notes se programment un peu à l'avance sur l'horloge audio, au temps de la musique ───
  const J = SON.jukebox, tempsS = 60 / J.bpm, mesureS = J.tempsParAccord * tempsS
  let tMusique = 0, prochainTemps = 0, musiqueLancee = false
  function jukebox(dt, { T = 1, pan = 0, gain = 1 } = {}) {
    const coupure = J.coupure.baseHz + J.coupure.plageHz * (Number.isFinite(T) ? borne(T, 0, 1) : 1)
    const niveau = J.niveau * (Number.isFinite(gain) && gain > 0 ? gain : 0) * (pause ? dB(J.pauseDb) : 1)
    etat.jukebox = { coupure, gain: niveau }
    regler(filtreJukebox.frequency, coupure)
    regler(busJukebox.gain, niveau)
    if (panJukebox) regler(panJukebox.pan, Number.isFinite(pan) ? borne(pan, -1, 1) : 0)
    // la musique part à la première image : son temps et l'horloge audio gardent ensuite le même écart
    if (musiqueLancee) tMusique += dt
    musiqueLancee = true
    while (prochainTemps * tempsS <= tMusique + J.avanceS + EPS) {
      const k = prochainTemps++, tk = k * tempsS
      if (tk < tMusique - VOIX.retardMaxS - EPS || !enMarche(c)) continue   // un grand pas : pas de rafale de notes
      unTemps(k, c.currentTime + Math.max(0, tk - tMusique))
    }
  }
  function unTemps(k, t0) {
    const rang = k % J.tempsParAccord, accord = J.accords[Math.floor(k / J.tempsParAccord) % J.accords.length]
    if (rang === 0) for (const f of accord.notes) ton(f, 'sine', mesureS + 0.4, J.nappe, t0, [busJukebox], { attaqueS: J.nappeAttaqueS, lineaire: true })
    ton(accord.basse * J.motif[rang], 'triangle', J.basseS, J.basse, t0, [busJukebox], { attaqueS: 0.01 })
  }

  // ─── La télé : le tiercé, par bouffées ───
  let teleEnBouffee = false, teleReste = 0
  function tele(dt, { T = 1, pan = 0, gain = 1 } = {}) {
    teleReste -= dt
    while (teleReste <= EPS) {
      teleEnBouffee = !teleEnBouffee
      teleReste += entre(hasard, teleEnBouffee ? SON.tierce.bouffeeS : SON.tierce.silenceS)
      if (teleEnBouffee) tierce.parler(teleReste)
      else tierce.taire()
    }
    const t = Number.isFinite(T) ? borne(T, 0, 1) : 1
    tierce.update(dt, { gain, coupure: ECOUTE.passeBas.baseHz + ECOUTE.passeBas.plageHz * t, pan })
  }

  // ─── Les verres ───
  let verreDans = actif ? entre(hasard, SON.verres.intervalleS) : Infinity
  function verres(dt) {
    verreDans -= dt
    while (verreDans <= EPS) {
      const V = SON.verres, retard = -verreDans
      const declin = entre(hasard, V.declinS), pan = (hasard() * 2 - 1) * V.panMax
      verreDans += entre(hasard, V.intervalleS)
      if (retard > VOIX.retardMaxS + EPS || !enMarche(c)) continue
      const t0 = c.currentTime, p = panoramique(c)
      if (p) { p.pan.value = pan; p.connect(general); p.connect(envoi); ephemeres.ajouter([p], t0 + declin + DEBRANCHE_S) }
      V.partielsHz.forEach((f, i) => ton(f, 'sine', declin, V.niveau * V.amplitudes[i], t0, p ? [p] : [general, envoi], { attaqueS: 0.002 }))
    }
  }

  // ─── Le cœur, dès SOUPÇON ───
  let coeurActif = false, coeurT = 0, coeurProchain = 0
  function coeur(dt, palier, soupcon) {
    if (rangDe(palier) < RANG_SOUPCON) { coeurActif = false; etat.coeur = null; return }
    const C = SON.coeur, [s0, s1] = C.soupcon, [lent, vite] = C.intervalleS
    const intervalle = lent + (vite - lent) * borne(((Number.isFinite(soupcon) ? soupcon : s0) - s0) / (s1 - s0), 0, 1)
    etat.coeur = intervalle
    if (!coeurActif) { coeurActif = true; coeurT = 0; coeurProchain = 0 }
    else coeurT += dt
    while (coeurProchain <= coeurT + EPS) {
      if (coeurT - coeurProchain <= VOIX.retardMaxS + EPS && enMarche(c)) battement()
      coeurProchain += intervalle
    }
  }
  function battement() {
    const t0 = c.currentTime
    for (const k of SON.coeur.coups) ton(k.hz, 'sine', k.dureeS, k.crete * SON.coeur.niveau, t0 + k.retardS, [general], { finHz: k.finHz })
  }

  return {
    get reverberation() { return actif && !mort ? envoi : null },
    update(dt, situation = {}) {
      const { pause: enPause = false, presents = SON.brouhaha.presentsPlein, soupcon = 0, palier = 'calme', jukebox: j, tele: tv } = situation
      rangDe(palier)
      if (mort) return
      pause = !!enPause
      etat.pause = pause
      if (!actif) return
      const pasDeTemps = secondes(dt)
      ephemeres.nettoyer()
      brouhaha(pasDeTemps, { presents, soupcon, palier })
      jukebox(pasDeTemps, j)
      if (pause) return
      tele(pasDeTemps, tv)
      verres(pasDeTemps)
      coeur(pasDeTemps, palier, soupcon)
    },
    // la clochette de la porte (deux partiels) et son grincement (la porte de l'enquête)
    clochette() {
      if (!joue()) return
      const K = SON.clochette, G = K.grincement, t0 = c.currentTime
      K.partielsHz.forEach((f, i) => ton(f, 'sine', K.dureeS, K.amplitudes[i], t0, [general], { attaqueS: 0.003 }))
      souffle(G.bruit.dureeS, G.bruit.niveau, G.bruit.hz, 'bandpass', t0, [general], { q: G.bruit.q, finHz: G.bruit.finHz })
      ton(G.ton.hz, 'sawtooth', G.ton.dureeS, G.ton.niveau, t0, [general], { finHz: G.ton.finHz })
    },
    // une sonnerie du téléphone : la cloche frappée frappesParS fois par seconde, qui sonne encore traineS après
    sonnerie() {
      if (!joue()) return
      const S = SON.sonnerie, t0 = c.currentTime, periode = 1 / S.frappesParS, fin = t0 + S.dureeS + S.traineS
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      for (let k = 0; k < Math.round(S.frappesParS * S.dureeS); k++) {
        g.gain.setValueAtTime(S.niveau, t0 + k * periode)
        g.gain.exponentialRampToValueAtTime(S.niveau * S.reste, t0 + (k + 1) * periode - 0.002)
      }
      g.gain.exponentialRampToValueAtTime(0.0001, fin)
      const oscs = S.partielsHz.map(f => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, t0)
        o.connect(g); o.start(t0); o.stop(fin + ARRET_S)
        return o
      })
      g.connect(general)
      ephemeres.ajouter([...oscs, g], fin + DEBRANCHE_S)
    },
    // NOTÉ : le papier, puis le crayon qui gratte en quelques traits
    note() {
      if (!joue()) return
      const { papier: P, crayon: K } = SON.note, t0 = c.currentTime
      souffle(P.dureeS, P.niveau, P.hz, 'bandpass', t0, [general], { q: P.q, finHz: P.finHz })
      const trait = K.dureeS / K.traits
      for (let k = 0; k < K.traits; k++) souffle(trait, K.niveau, K.hz, 'bandpass', t0 + K.retardS + k * trait, [general], { q: K.q })
    },
    // un pas sur le parquet
    pas() {
      if (!joue()) return
      const { bruit: B, ton: T, bois: W } = SON.pas, t0 = c.currentTime
      souffle(B.dureeS, B.niveau, B.hz, 'lowpass', t0, [general])
      ton(T.hz, 'sine', T.dureeS, T.niveau, t0, [general])
      souffle(W.dureeS, W.niveau, W.hz, 'bandpass', t0, [general], { q: W.q })
    },
    etat: () => ({ ...etat, jukebox: { ...etat.jukebox } }),
    stop() {
      if (mort) return
      mort = true
      if (!actif) return
      for (const v of voixSalle) v.dispose()
      ephemeres.vider()
      arreter(boucles)
      debrancher(persistants)
      try { convolution.buffer = null } catch (e) { /* navigateur qui refuse : la réponse part avec le nœud */ }
      regler.oublier()
    },
  }
}
