// Paramètres du jeu — persistés dans localStorage
import { setMasterVolume } from './audio.js'

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
