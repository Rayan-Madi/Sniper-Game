import { CULASSE, BALLE, LUNETTE } from './shot/tuning.js'
import { m5Neuf, nettoyerM5, remettreM5 } from './campaign/etapes.js'

export const UPGRADES = {
  velocity:  { name: 'Vélocité',    desc: 'Balle plus rapide, moins de délai au tir', max: 4, cost: [1,2,2,3] },
  stability: { name: 'Stabilité',   desc: 'Le scope tremble moins sous le stress',    max: 4, cost: [1,2,2,3] },
  coldblood: { name: 'Sang-froid',  desc: 'Le stress monte plus lentement',           max: 3, cost: [1,2,3] },
  zoom:      { name: 'Lunette',     desc: 'Zoom maximum plus puissant',               max: 3, cost: [1,2,3] },
  silencer:  { name: 'Silencieux',  desc: 'Tir raté n\'alerte pas les gardes',        max: 2, cost: [2,3] },
}

const NO_BRIEFING_SEEN = () => [false, false, false, false, false, false]

export const state = {
  levels: { velocity: 0, stability: 0, coldblood: 0, zoom: 0, silencer: 0 },
  points: 0,
  totalScore: 0,
  currentLevel: 1,
  freedVictims: false,              // choix moral du port (mission 3) : victimes libérées ?
  briefingSeen: NO_BRIEFING_SEEN(), // briefing de chaque mission déjà vu → pas rejoué au réessai
  prologueSeen: false,              // prologue (l'offre, l'appel d'Anton, le tableau) déjà vu dans cette campagne
  campaignDone: false,              // M6 réussie, épilogue pas encore vu jusqu'au bout : le menu propose la fin
  m5: m5Neuf(),                     // M5 en deux temps : l'étape (bar, convoi), ce que Viktor a appris au Bivouac (campaign/etapes.js)
}

export function markBriefingSeen(index) { state.briefingSeen[index] = true }
export function markPrologueSeen() { state.prologueSeen = true }
export function resetCampaignFlags() {
  state.freedVictims = false; state.briefingSeen = NO_BRIEFING_SEEN(); state.prologueSeen = false; state.campaignDone = false
  remettreM5(state)
}

// ─── Sauvegarde de progression (mode histoire) ─────────────────────
const SAVE_KEY = 'sniper-save'

export function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      levels: state.levels,
      points: state.points,
      totalScore: state.totalScore,
      currentLevel: state.currentLevel,
      freedVictims: state.freedVictims,
      briefingSeen: state.briefingSeen,
      prologueSeen: state.prologueSeen,
      campaignDone: state.campaignDone,
      m5: state.m5,
    }))
  } catch (e) { /* stockage indisponible */ }
}

export function loadProgress() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY))
    if (!d) return false
    Object.assign(state.levels, d.levels || {})
    state.points = d.points || 0
    state.totalScore = d.totalScore || 0
    state.currentLevel = d.currentLevel || 1
    state.freedVictims = !!(d.freedVictims ?? d.freed)
    state.briefingSeen = NO_BRIEFING_SEEN().map((_, i) => !!(d.briefingSeen && d.briefingSeen[i]))
    state.prologueSeen = !!d.prologueSeen
    state.campaignDone = !!d.campaignDone
    state.m5 = nettoyerM5(d.m5)       // absent (ancienne sauvegarde) ou abîmé : le bar, tout à zéro
    return true
  } catch (e) { return false }
}

export function resetProgress() {
  try { localStorage.removeItem(SAVE_KEY) } catch (e) { /* ignore */ }
  state.levels = { velocity: 0, stability: 0, coldblood: 0, zoom: 0, silencer: 0 }
  state.points = 0
  state.totalScore = 0
  state.currentLevel = 1
  resetCampaignFlags()
}

export function getStats() {
  const l = state.levels
  return {
    v0:             BALLE.vitesse + l.velocity * BALLE.vitesseParNiveau,   // vitesse de la balle (m/s) : 800, 950 au niveau 4
    boltS:          CULASSE.dureeS[Math.max(0, Math.min(CULASSE.dureeS.length - 1, l.velocity))],   // culasse (s)
    trembleScale:   1.0 - l.stability * 0.20,
    stressRate:     1.0 - l.coldblood * 0.25,
    maxZoomScale:   1   + l.zoom      * LUNETTE.zoomParNiveau,   // Lunette : × le zoom maximum de la mission (1,45 au niveau 3)
    silenced:       l.silencer >= 1,
    superSilenced:  l.silencer >= 2,
  }
}
