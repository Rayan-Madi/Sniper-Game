// Machine à états de l'enquête, sans rendu ni DOM : ce qui est trouvé, ce qui est ouvert, la piste à murmurer.
// Modes : 'exploring' (on se déplace), 'examining' (fiche ouverte), 'paused', 'done'.
import { CLUES, PHONE } from './clues.js'

export function createInvestigationState({ clues = CLUES, phone = PHONE, anchors = {}, hintDelay = 40, found = [] } = {}) {
  const known = new Set(clues.map(c => c.id))
  const s = { mode: 'exploring', found: new Set(found.filter(id => known.has(id))), current: null, result: null, idle: 0, before: null }

  const api = {
    get mode() { return s.mode },
    get count() { return s.found.size },
    get total() { return clues.length },
    get phoneUnlocked() { return s.found.size >= phone.seuil },
    get current() { return s.current },
    get result() { return s.result },
    has: id => s.found.has(id),

    // examiner l'objet visé : ce que l'interface doit montrer, ou null si rien ne se passe
    examine(id) {
      if (s.mode !== 'exploring') return null
      if (id === phone.id) {
        if (!api.phoneUnlocked) return { type: 'phone-locked', line: phone.verrouille }
        s.mode = 'examining'; s.current = phone.id
        return { type: 'phone', phone }
      }
      const clue = clues.find(c => c.id === id)
      if (!clue) return null
      const first = !s.found.has(id)
      s.found.add(id)
      if (first) s.idle = 0     // seule une vraie découverte repousse la piste (pas une relecture, ni le téléphone verrouillé)
      s.mode = 'examining'; s.current = id
      return { type: 'clue', clue, first, count: s.found.size, total: clues.length }
    },
    close() { if (s.mode === 'examining') { s.mode = 'exploring'; s.current = null } },
    pause() { if (s.mode === 'exploring' || s.mode === 'examining') { s.before = s.mode; s.mode = 'paused' } },
    resume() { if (s.mode === 'paused') { s.mode = s.before; s.before = null } },
    finish(reason) { if (s.mode === 'done') return false; s.mode = 'done'; s.result = reason; return true },

    // à chaque image : une piste après hintDelay secondes d'exploration (fiches et pauses non comptées) sans nouvelle
    // découverte, sinon null
    tick(dt, pos = null) {
      if (s.mode !== 'exploring') return null
      s.idle += dt
      if (s.idle < hintDelay) return null
      s.idle = 0
      return api.hint(pos)
    },
    // le téléphone dès qu'il est déverrouillé, sinon l'indice non vu le plus proche (ou le premier dans l'ordre)
    hint(pos = null) {
      if (api.phoneUnlocked) return phone.piste
      const rest = clues.filter(c => !s.found.has(c.id))
      if (!rest.length) return phone.piste
      if (!pos) return rest[0].piste
      const d = c => { const a = anchors[c.id]; return a ? Math.hypot(a.x - pos.x, a.z - pos.z) : Infinity }
      return rest.reduce((best, c) => (d(c) < d(best) ? c : best)).piste
    },
  }
  return api
}
