// Page du son du Bivouac (développement, hors build ; plan docs/superpowers/plans/2026-10-28-m5-bar.md, tâche B7) :
// trente secondes de salle jouées par src/bar/son.js et les voix de src/bar/voix.js, avec un pilote minimal qui tient
// la place de la coquille du bar (tâche B11) : Viktor écoute la table A depuis la chaise ouest de la table D, va au
// mange-debout est (table B), une pause, puis va jusqu'à l'entrée du couloir pendant que le téléphone sonne trois fois ;
// Fernand décroche, la voix du colonel passe dans le combiné. Le soupçon monte jusqu'au SOUPÇON (cœur, canard).
//   (sans paramètre)  boutons : ÉCOUTER (temps réel, au clic) ; RENDU EN WAV (hors ligne, téléchargé)
//   ?rendu=1          rendu hors ligne des 30 s, lu par un script (window.__barSon, titre « bar-son:fini »)
//   ?mesure=1         dix montages et arrêts : nœuds encore branchés après l'arrêt, coût d'une image (window.__barSon)
// Le rendu hors ligne passe par un OfflineAudioContext suspendu à chaque image : la page le présente comme « running »,
// sans quoi le son, qui ne programme rien dans un contexte suspendu, resterait muet.
import { creerSon } from '../src/bar/son.js'
import { creerChoeur, reglageBips } from '../src/bar/voix.js'
import { intelligibilite, transmission } from '../src/bar/ecoute.js'
import { BOITES, FOYERS, PLACES, ANCRES } from '../src/bar/plan.js'
import { ECHANGES } from '../src/bar/textes.js'
import { ECOUTE } from '../src/bar/reglages.js'
import { estimate } from '../src/briefing/kit.js'

const DUREE = 30
const q = new URLSearchParams(location.search)
const sortieEtat = document.getElementById('etat')
const ecrire = t => { sortieEtat.textContent = t }

// ─── Le scénario : qui parle, où est Viktor, ce que vaut S ───
const echange = id => ECHANGES.find(e => e.id === id)
function repliques(id, debut, combien = Infinity) {
  const e = echange(id), sortie = []
  let t = debut
  for (const r of e.repliques.slice(0, combien)) {
    const dureeS = estimate(r.texte) / 1000
    sortie.push({ t, dureeS, qui: r.qui, foyer: FOYERS[r.foyer ?? e.foyer], voix: ECOUTE.voix[r.voix ?? 'normale'] })
    t += dureeS + 0.4
  }
  return sortie
}
const LIGNES = [...repliques('A1', 1), ...repliques('B1', 3), ...repliques('appel', 25, 1),
  ...repliques('appel', 28.2).filter(l => l.qui === 'colonel').slice(0, 1).map(l => ({ ...l, t: 28.2 }))]
const SONNERIES = [21, 22.5, 24]
const CHAISE = PLACES.chaiseOuestD, MANGE = PLACES.mangeDeboutEst, COULOIR = PLACES.entreeCouloir
const TRAJETS = [   // [début, fin, de, vers]
  [11, 14, CHAISE, MANGE],
  [19, 25, MANGE, COULOIR],
]
const PAUSE = [16, 17.5]
const lisse = u => u * u * (3 - 2 * u)
function viktor(t) {
  for (const [a, b, de, vers] of TRAJETS) {
    if (t >= a && t < b) {
      const u = (t - a) / (b - a)
      return { x: de.x + (vers.x - de.x) * u, z: de.z + (vers.z - de.z) * u, lacet: Math.atan2(-(vers.x - de.x), -(vers.z - de.z)), marche: true }
    }
  }
  const ici = t < 11 ? CHAISE : t < 19 ? MANGE : COULOIR
  return { x: ici.x, z: ici.z, lacet: ici.lacet, marche: false }
}
function soupcon(t) {
  if (t < 8) return 0
  if (t < 12) return 35 * lisse((t - 8) / 4)
  if (t < 17.5) return 35
  if (t < 19) return 35 + 40 * lisse((t - 17.5) / 1.5)
  return 75
}
const palierDe = S => (S >= 60 ? 'soupcon' : S >= 30 ? 'mefiance' : 'calme')

// Joue le scénario sur un audio ({ ctx, dest }) de t0 à t1 : rend { etape(dt), fin(), journal }.
function scenario(audio, t0 = 0) {
  const son = creerSon(audio)
  const choeur = creerChoeur(audio, { reverberation: son.reverberation })
  let t = t0, prochainPas = 0
  const faits = new Set(), journal = [], derniere = new Map()   // qui → sa dernière réplique commencée
  const une = (cle, quand, faire) => { if (!faits.has(cle) && t >= quand) { faits.add(cle); faire(); journal.push(`${quand.toFixed(1)} s ${cle}`) } }
  return {
    son, choeur, journal,
    etape(dt) {
      t += dt
      const v = viktor(t), S = soupcon(t), pause = t >= PAUSE[0] && t < PAUSE[1]
      const oreille = { x: v.x, z: v.z }, regard = { x: -Math.sin(v.lacet), z: -Math.cos(v.lacet) }
      une('clochette', 0.5, () => son.clochette())
      une('note', 9, () => son.note())
      SONNERIES.forEach((s, i) => une(`sonnerie ${i + 1}`, s, () => son.sonnerie()))
      if (!pause) {
        LIGNES.forEach((l, i) => une(`${l.qui} (${i})`, l.t, () => { choeur.parler(l.qui, l.dureeS); derniere.set(l.qui, l) }))
        if (v.marche && t >= prochainPas) { son.pas(); prochainPas = t + 0.55 }
        // les sources qui parlent : ce qu'on entend de chacune, et la plus intelligible, sous-titrée
        const sources = {}
        let sousTitre = null, meilleur = -1
        for (const [qui, l] of derniere) {
          if (!choeur.parle(qui)) continue
          const src = { x: l.foyer.x, z: l.foyer.z, voix: l.voix }
          sources[qui] = reglageBips(oreille, regard, src, BOITES)
          const I = intelligibilite(oreille, regard, src, BOITES, ANCRES.jukebox)
          if (I > meilleur) { meilleur = I; sousTitre = qui }
        }
        choeur.update(dt, { sources, sousTitre })
      }
      const ecoute = ancre => ({ T: transmission(oreille, ancre, BOITES), pan: reglageBips(oreille, regard, ancre, BOITES).pan })
      son.update(dt, { pause, presents: 8, soupcon: S, palier: palierDe(S), jukebox: ecoute(ANCRES.jukebox), tele: ecoute(ANCRES.tele) })
      return { t, S, pause, actives: choeur.actives, ...son.etat() }
    },
    fin() { son.stop(); choeur.dispose() },
  }
}

// ─── Rendu hors ligne ───
// Un OfflineAudioContext que le son voit « running » (le rendu est suspendu à chaque image, le temps d'un update).
const enMarche = hl => new Proxy(hl, {
  get(o, k) { if (k === 'state') return 'running'; const v = Reflect.get(o, k, o); return typeof v === 'function' ? v.bind(o) : v },
})
async function rendre({ duree = DUREE, t0 = 0, avantFin = null } = {}) {
  const sampleRate = 44100, hl = new OfflineAudioContext(2, Math.round(duree * sampleRate), sampleRate)
  const maitre = hl.createGain(); maitre.gain.value = 0.7; maitre.connect(hl.destination)   // le volume du jeu (src/audio.js)
  const s = scenario({ ctx: enMarche(hl), dest: maitre }, t0)
  const pas = (128 * 6) / sampleRate, couts = []
  let fini = 0
  const etape = () => { const a = performance.now(); s.etape(pas); couts.push(performance.now() - a) }
  for (let i = 1; i * pas < duree - pas; i++) {
    hl.suspend(i * pas).then(() => {
      etape()
      if ((i + 1) * pas >= duree - pas) { if (avantFin) avantFin(s); s.fin(); fini = 1 }
      hl.resume()
    })
  }
  etape()
  const rendu = await hl.startRendering()
  if (!fini) s.fin()
  return { rendu, couts, journal: s.journal, maitre }
}

// WAV 16 bits, entrelacé
function wav(rendu) {
  const n = rendu.length, nc = rendu.numberOfChannels, sr = rendu.sampleRate
  const tampon = new ArrayBuffer(44 + n * nc * 2), v = new DataView(tampon)
  const ascii = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  ascii(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true)
  v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); ascii(36, 'data'); v.setUint32(40, n * nc * 2, true)
  const canaux = Array.from({ length: nc }, (_, c) => rendu.getChannelData(c))
  let o = 44
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const x = Math.max(-1, Math.min(1, canaux[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2 }
  return new Uint8Array(tampon)
}
// crête et niveau efficace (dBFS) de chaque seconde
function niveaux(rendu) {
  const sr = rendu.sampleRate, canaux = Array.from({ length: rendu.numberOfChannels }, (_, c) => rendu.getChannelData(c)), sortie = []
  for (let s = 0; s * sr < rendu.length; s++) {
    let crete = 0, somme = 0, n = 0
    for (let i = s * sr; i < Math.min(rendu.length, (s + 1) * sr); i++) for (const d of canaux) { crete = Math.max(crete, Math.abs(d[i])); somme += d[i] * d[i]; n++ }
    sortie.push({ s, crete: +(20 * Math.log10(crete || 1e-9)).toFixed(1), efficace: +(10 * Math.log10(somme / n || 1e-18)).toFixed(1) })
  }
  return sortie
}
const p95 = xs => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length * 0.95)] }
const base64 = (octets, debut, taille) => {
  const bout = octets.subarray(debut, debut + taille)
  let s = ''
  for (let i = 0; i < bout.length; i += 0x8000) s += String.fromCharCode.apply(null, bout.subarray(i, i + 0x8000))
  return btoa(s)
}

// ─── Mesure : nœuds encore branchés après l'arrêt, sur dix montages ───
async function mesurer() {
  const branches = new Map()   // nœud → ses destinations, tenu à jour par connect et disconnect
  const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect
  AudioNode.prototype.connect = function (d, ...r) { let s = branches.get(this); if (!s) branches.set(this, s = new Set()); s.add(d); return connect.call(this, d, ...r) }
  AudioNode.prototype.disconnect = function (...a) { const s = branches.get(this); if (s) { if (a.length) s.delete(a[0]); else s.clear() } return disconnect.apply(this, a) }
  const cycles = []
  try {
    for (let i = 0; i < 10; i++) {
      branches.clear()
      let pendant = 0
      const { couts, maitre } = await rendre({ duree: 3, t0: i * 3, avantFin: () => { pendant = [...branches.values()].filter(s => s.size).length } })
      const apres = [...branches].filter(([n, s]) => n !== maitre && s.size).length
      cycles.push({ cycle: i + 1, de: i * 3, branchesEnJeu: pendant, brancheesApresArret: apres, imageMoyUs: Math.round(1000 * couts.reduce((a, b) => a + b, 0) / couts.length), imageP95Us: Math.round(1000 * p95(couts)) })
    }
  } finally {
    AudioNode.prototype.connect = connect; AudioNode.prototype.disconnect = disconnect
  }
  return { cycles, totalApresArret: cycles.reduce((a, c) => a + c.brancheesApresArret, 0) }
}

async function principal() {
  try {
    if (q.get('rendu') === '1') {
      const { rendu, couts, journal } = await rendre()
      const octets = wav(rendu)
      window.__barSon = { octets: octets.length, niveaux: niveaux(rendu), journal, imageMoyUs: Math.round(1000 * couts.reduce((a, b) => a + b, 0) / couts.length), imageP95Us: Math.round(1000 * p95(couts)), images: couts.length }
      window.__barSonWav = (debut, taille) => base64(octets, debut, taille)
      ecrire(JSON.stringify({ ...window.__barSon, niveaux: undefined }, null, 1))
      document.title = 'bar-son:fini'
    } else if (q.get('mesure') === '1') {
      window.__barSon = await mesurer()
      ecrire(JSON.stringify(window.__barSon, null, 1))
      document.title = 'bar-son:fini'
    }
  } catch (e) {
    window.__barSon = { erreur: String(e && e.stack || e) }
    ecrire(window.__barSon.erreur)
    document.title = 'bar-son:erreur'
  }
}
principal()

// ─── Écoute en temps réel (au clic : le navigateur ne lance le son que sur un geste) ───
let enCours = null
document.getElementById('ecouter').onclick = () => {
  if (enCours) return
  const ctx = new AudioContext()
  const maitre = ctx.createGain(); maitre.gain.value = 0.7; maitre.connect(ctx.destination)
  const s = scenario({ ctx, dest: maitre })
  let avant = performance.now(), t = 0
  enCours = s
  const image = maintenant => {
    const dt = Math.min(0.1, (maintenant - avant) / 1000); avant = maintenant
    t += dt
    const e = s.etape(dt)
    ecrire(`t ${e.t.toFixed(1)} s · S ${e.S.toFixed(0)}${e.pause ? ' · PAUSE' : ''}\nvoix qui bipent : ${e.actives.join(', ') || 'aucune'}\nbrouhaha ${e.brouhaha.toFixed(3)} · juke-box ${e.jukebox.coupure.toFixed(0)} Hz, ${e.jukebox.gain.toFixed(3)} · cœur ${e.coeur ? e.coeur.toFixed(2) + ' s' : 'non'}\n\n${s.journal.slice(-8).join('\n')}`)
    if (t < DUREE) requestAnimationFrame(image)
    else { s.fin(); maitre.disconnect(); ctx.close(); enCours = null }
  }
  requestAnimationFrame(image)
}
document.getElementById('wav').onclick = async () => {
  ecrire('rendu en cours…')
  const { rendu } = await rendre()
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(new Blob([wav(rendu)], { type: 'audio/wav' }))
  lien.download = 'bivouac-30s.wav'
  lien.click()
  ecrire('rendu fini : bivouac-30s.wav')
}
