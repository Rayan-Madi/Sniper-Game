// ─── Réglages graphiques (spec du lot 1 §4.3) ────────────────────────────────────────────────────────────────────
// Pur, sans DOM ni three : la table des préréglages, l'ombre des personnages selon leur rôle et le contrôleur de
// résolution dynamique du préréglage Auto. scene.js applique le préréglage au renderer (applyRenderQuality), npc.js
// l'ombre des personnages, main.js enchaîne le tout (applyQuality).
import { frameStats } from './stats.js'

export const PRESETS = ['auto', 'bas', 'moyen', 'haut']

// Paramètres effectifs d'un préréglage pour une densité d'écran (window.devicePixelRatio).
//   pixelRatio : densité de pixels du rendu ; shadowSize : côté de la carte d'ombre du soleil ;
//   shadowType : 'pcf' | 'pcfsoft' (scene.js : three r185 ne connaît plus que PCF, voir applyRenderQuality) ;
//   npcShadows : 'aucun' | 'cibles-gardes' | 'tous' (npcCastsShadow) ; dynamic : résolution dynamique (Auto).
// Auto = Moyen avec résolution dynamique. Un nom inconnu (sauvegarde abîmée, ancienne version) vaut Auto ; une densité
// absente ou invalide vaut 1.
export function presetFor(name, dpr) {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  switch (PRESETS.includes(name) ? name : 'auto') {
    case 'bas': return { pixelRatio: 0.75 * Math.min(d, 1), shadowSize: 1024, shadowType: 'pcf', npcShadows: 'aucun', dynamic: false }
    case 'haut': return { pixelRatio: Math.min(d, 2), shadowSize: 2048, shadowType: 'pcfsoft', npcShadows: 'tous', dynamic: false }
    case 'moyen': return { pixelRatio: Math.min(d, 1.25), shadowSize: 2048, shadowType: 'pcf', npcShadows: 'cibles-gardes', dynamic: false }
    default: return { ...presetFor('moyen', d), dynamic: true }
  }
}

// Le personnage projette-t-il une ombre ? role : 'cible' | 'garde' | 'civil'. Un personnage qui doit se fondre dans la
// foule (le commanditaire de M6, l'avatar du contre-tueur en PvP) a le rôle 'civil' : une ombre qu'aucun danseur n'a
// le trahirait (npc.js, pvp.js).
export function npcCastsShadow(mode, role) {
  if (mode === 'tous') return true
  if (mode === 'cibles-gardes') return role === 'cible' || role === 'garde'
  return false
}

// ─── Résolution dynamique ─────────────────────────────────────────────────────────────────────────────────────────
// push(durée de l'image en ms, instant en ms) → échelle de la densité de pixels, entre min et max (départ à max).
// - Baisse d'un pas quand la p95 des images des 2 dernières secondes dépasse highMs.
// - Remonte d'un pas quand cette p95 reste sous lowMs pendant holdMs.
// - Jamais plus d'un changement par minIntervalMs. Après un changement, la mesure repart de zéro : les images d'avant
//   ont été rendues à une autre résolution, et il faut 2 s d'images à la nouvelle avant de juger à nouveau. Entre les
//   deux seuils, rien ne bouge : c'est l'écart entre 14 et 22 ms (un pas de 0,05 change le nombre de pixels d'environ
//   10 %) qui empêche l'aller-retour.
// - Une « image » de plus de breakMs n'en est pas une (onglet masqué, pause du navigateur), ni un appel qui suit le
//   précédent de plus de breakMs (main.js ne nourrit le contrôleur qu'en jeu, pas en pause) : la mesure repart de zéro.
export function createResolutionController({ min = 0.7, max = 1, step = 0.05, highMs = 22, lowMs = 14,
  windowMs = 2000, holdMs = 4000, minIntervalMs = 1000, breakMs = 1000 } = {}) {
  let scale = max
  let samples = []        // { t, ms } des images rendues à l'échelle courante, sur windowMs au plus
  let since = null        // début de la mesure à l'échelle courante
  let lowSince = null     // depuis quand la p95 est sous lowMs
  let lastChange = -Infinity
  let lastPush = null
  const round = v => Math.round(v * 1000) / 1000
  const restart = t => { samples = []; since = t; lowSince = null }
  const change = (next, t) => { scale = round(Math.min(max, Math.max(min, next))); lastChange = t; restart(t) }

  return {
    get scale() { return scale },
    push(frameMs, nowMs) {
      if (!(frameMs >= 0) || !Number.isFinite(nowMs)) return scale
      if (since === null) since = nowMs - frameMs
      const gap = lastPush === null ? 0 : nowMs - lastPush
      lastPush = nowMs
      if (frameMs > breakMs || gap > breakMs) { restart(nowMs); return scale }
      samples.push({ t: nowMs, ms: frameMs })
      while (samples.length && samples[0].t <= nowMs - windowMs) samples.shift()
      if (nowMs - since < windowMs) return scale   // pas encore 2 s d'images à cette échelle
      const { p95 } = frameStats(samples.map(s => s.ms))
      const canChange = nowMs - lastChange >= minIntervalMs
      if (p95 > highMs) {
        lowSince = null
        if (scale > min && canChange) change(scale - step, nowMs)
      } else if (p95 < lowMs) {
        if (lowSince === null) lowSince = nowMs
        if (nowMs - lowSince >= holdMs && scale < max && canChange) change(scale + step, nowMs)
      } else {
        lowSince = null
      }
      return scale
    },
  }
}
