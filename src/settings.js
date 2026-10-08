// Paramètres du jeu — persistés dans localStorage
import { setMasterVolume } from './audio.js'
import { PRESETS } from './gfx/quality.js'

// Touches PvP par défaut — codes PHYSIQUES (indépendants du layout clavier,
// donc valables aussi bien en AZERTY qu'en QWERTY).
const DEFAULT_PVP_KEYS = {
  forward: 'KeyW', left: 'KeyA', back: 'KeyS', right: 'KeyD',
  ability1: 'Digit1', ability2: 'Digit2', ability3: 'Digit3',
  emote: 'KeyE',
}

const DEFAULTS = {
  volume: 70,        // 0-100
  sensitivity: 100,  // 20-300 (100 = ×1.0)
  invertY: false,
  // Affichage (spec du lot 1 §4.3 et §4.5)
  graphics: 'auto',        // 'auto' | 'bas' | 'moyen' | 'haut' (gfx/quality.js)
  showStats: false,        // panneau de performances (gfx/stats.js), comme ?stats=1
  reducedMotion: 'auto',   // effets atténués : 'auto' (suit le système) | 'oui' | 'non'
}

// Valeurs admises des champs d'affichage. Une sauvegarde d'avant le lot 1 ne les a pas ; une valeur inconnue ou d'un
// autre type (sauvegarde abîmée, version future) reprend la valeur par défaut, sans toucher aux autres réglages.
const VALID = {
  graphics: v => PRESETS.includes(v),
  showStats: v => typeof v === 'boolean',
  reducedMotion: v => ['auto', 'oui', 'non'].includes(v),
}

export const settings = { ...DEFAULTS, pvpKeys: { ...DEFAULT_PVP_KEYS } }

export function resetPvpKeys() {
  settings.pvpKeys = { ...DEFAULT_PVP_KEYS }
  saveSettings()
}

const KEY = 'sniper-settings'

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      // Fusion superficielle des touches PvP : garantit que les nouvelles
      // actions ajoutées plus tard restent bindées même sur une sauvegarde ancienne.
      const savedPvpKeys = saved.pvpKeys
      Object.assign(settings, saved)
      settings.pvpKeys = { ...DEFAULT_PVP_KEYS, ...savedPvpKeys }
      for (const [k, ok] of Object.entries(VALID)) if (!ok(settings[k])) settings[k] = DEFAULTS[k]
    }
  } catch (e) { /* ignore */ }
  applySettings()
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch (e) { /* ignore */ }
}

export function applySettings() {
  setMasterVolume(settings.volume / 100)
}

// Multiplicateur de sensibilité (100 → 1.0)
export function sensMultiplier() {
  return settings.sensitivity / 100
}

export function invertY() {
  return settings.invertY ? -1 : 1
}
