export const UPGRADES = {
  velocity:  { name: 'Vélocité',    desc: 'Balle plus rapide, moins de délai au tir', max: 4, cost: [1,2,2,3] },
  stability: { name: 'Stabilité',   desc: 'Le scope tremble moins sous le stress',    max: 4, cost: [1,2,2,3] },
  coldblood: { name: 'Sang-froid',  desc: 'Le stress monte plus lentement',           max: 3, cost: [1,2,3] },
  zoom:      { name: 'Lunette',     desc: 'Zoom maximum plus puissant',               max: 3, cost: [1,2,3] },
  silencer:  { name: 'Silencieux',  desc: 'Tir raté n\'alerte pas les gardes',        max: 2, cost: [2,3] },
}

export const state = {
  levels: { velocity: 0, stability: 0, coldblood: 0, zoom: 0, silencer: 0 },
  points: 0,
  totalScore: 0,
  currentLevel: 1,
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
      freed: !!window.__freedVictims,
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
    if (d.freed) window.__freedVictims = true
    return true
  } catch (e) { return false }
}

export function resetProgress() {
  try { localStorage.removeItem(SAVE_KEY) } catch (e) { /* ignore */ }
  state.levels = { velocity: 0, stability: 0, coldblood: 0, zoom: 0, silencer: 0 }
  state.points = 0
  state.totalScore = 0
  state.currentLevel = 1
  window.__freedVictims = false
}

export function getStats() {
  const l = state.levels
  return {
    bulletDelay:    0.45 - l.velocity * 0.08,   // secondes avant impact (réactif)
    trembleScale:   1.0 - l.stability * 0.20,
    stressRate:     1.0 - l.coldblood * 0.25,
    maxZoom:        6   + l.zoom      * 2,
    silenced:       l.silencer >= 1,
    superSilenced:  l.silencer >= 2,
  }
}
