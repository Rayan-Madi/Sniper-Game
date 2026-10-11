// Machine à états de l'enquête, sans rendu ni DOM : ce qui est trouvé, ce qui est ouvert, la piste à murmurer, la fin.
// Modes : 'exploring' (on se déplace), 'examining' (fiche ouverte), 'ending' (séquence de fin), 'paused', 'done'.
import { CLUES, PHONE } from './clues.js'
import { estimate } from '../briefing/kit.js'

// Séquence de fin (spec docs/superpowers/specs/2026-10-11-enquete-fin-design.md §3.1), en secondes de temps de jeu.
// Elle part à la fermeture d'une fiche d'indice quand les 6 sont trouvés : silence, réplique (« J'en ai assez vu. », le
// temps de sa voix), souffle, vibration du téléphone, regard qui pivote vers lui, puis la fiche du téléphone ('phone' :
// mode 'examining' sur le téléphone). La vibration dure 2,5 s : le regard part après 1,2 s de vibration ; en effets
// atténués, pas de regard, l'étape 'buzz' dure toute la vibration et la fiche s'ouvre quand le téléphone se tait.
export const ENDING = { silence: 0.8, breath: 0.6, buzz: 1.2, turn: 1.2, vibration: 2.5 }
// une durée invalide (NaN, absente, négative) compte pour zéro : la séquence ne reste pas bloquée et les étapes
// suivantes gardent leur durée
const seconds = d => (Number.isFinite(d) && d > 0 ? d : 0)

// speechTime : durée d'une réplique dite (secondes) ; reducedMotion : booléen ou fonction, lu au début de la séquence
export function createInvestigationState({ clues = CLUES, phone = PHONE, anchors = {}, hintDelay = 40, found = [],
  speechTime = text => estimate(text) / 1000, reducedMotion = false } = {}) {
  const known = new Set(clues.map(c => c.id))
  const s = { mode: 'exploring', found: new Set(found.filter(id => known.has(id))), current: null, result: null, idle: 0, before: null, end: null }

  // la séquence de fin : ses étapes datées, le temps écoulé, les étapes entrées (dans l'ordre, aucune sautée)
  function startEnding() {
    const reduced = typeof reducedMotion === 'function' ? !!reducedMotion() : !!reducedMotion
    const durations = [['silence', ENDING.silence], ['line', speechTime(phone.fin)], ['breath', ENDING.breath],
      ['buzz', reduced ? ENDING.vibration : ENDING.buzz]]
    if (!reduced) durations.push(['turn', ENDING.turn])
    let from = 0
    const plan = durations.map(([step, d]) => { const p = { step, from, to: from + seconds(d) }; from = p.to; return p })
    s.end = { plan, t: 0, i: 0, steps: [plan[0].step] }
    s.mode = 'ending'; s.current = null
  }
  function advanceEnding(dt) {
    const e = s.end
    e.t += dt
    while (e.i < e.plan.length && e.t >= e.plan[e.i].to) {
      e.i++
      e.steps.push(e.i < e.plan.length ? e.plan[e.i].step : 'phone')
    }
    if (e.i >= e.plan.length) { s.mode = 'examining'; s.current = phone.id }
  }

  const api = {
    get mode() { return s.mode },
    get count() { return s.found.size },
    get total() { return clues.length },
    get allFound() { return s.found.size >= clues.length },
    get phoneUnlocked() { return s.found.size >= phone.seuil },
    // REPOSER : la fiche du téléphone est ouverte et il reste des indices à trouver
    get phoneCanPutDown() { return s.mode === 'examining' && s.current === phone.id && !api.allFound },
    get current() { return s.current },
    get result() { return s.result },
    // null avant la fin ; sinon l'étape, le temps écoulé depuis le début de la séquence, l'avancement de l'étape (0 à 1)
    // et les étapes entrées jusqu'ici
    get ending() {
      const e = s.end
      if (!e) return null
      const p = e.plan[e.i]
      const progress = p && p.to > p.from ? Math.min(1, (e.t - p.from) / (p.to - p.from)) : 1
      return { step: p ? p.step : 'phone', t: e.t, progress, steps: [...e.steps] }
    },
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
    // fermer la fiche : celle du téléphone seulement s'il peut se reposer ; celle d'un indice, les 6 trouvés, lance la fin
    close() {
      if (s.mode !== 'examining') return
      if (s.current === phone.id) { api.putDown(); return }
      if (api.allFound && !s.end) { startEnding(); return }
      s.mode = 'exploring'; s.current = null
    },
    // REPOSER le téléphone (avant les 6 indices) : vrai si la fiche s'est fermée
    putDown() {
      if (!api.phoneCanPutDown) return false
      s.mode = 'exploring'; s.current = null
      return true
    },
    pause() { if (s.mode === 'exploring' || s.mode === 'examining' || s.mode === 'ending') { s.before = s.mode; s.mode = 'paused' } },
    resume() { if (s.mode === 'paused') { s.mode = s.before; s.before = null } },
    finish(reason) { if (s.mode === 'done') return false; s.mode = 'done'; s.result = reason; return true },

    // à chaque image : fait avancer la séquence de fin, ou donne une piste après hintDelay secondes d'exploration
    // (fiches, pauses et fin non comptées) sans nouvelle découverte ; sinon null
    tick(dt, pos = null) {
      if (s.mode === 'ending') { advanceEnding(dt); return null }
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
