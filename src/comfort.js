// ─── Confort (spec du lot 1 §4.5) ────────────────────────────────────────────────────────────────────────────────
// Effets atténués et plein écran, sans dépendance au reste du jeu : main.js et settings.js les branchent, les tests les
// prennent tels quels (doc et win remplacés par des doublures).

// Effets atténués : le réglage « Oui » ou « Non » force, « Auto » suit prefers-reduced-motion du système.
export function reducedMotionActive(setting, mediaMatches) {
  if (setting === 'oui') return true
  if (setting === 'non') return false
  return !!mediaMatches
}

// Préférence du système, relue à chaque effet (un changement des réglages du système vaut dès le tir suivant).
// Sans matchMedia, ou s'il refuse : effets normaux.
export function systemReducedMotion(win = globalThis.window) {
  try {
    return !!(win && typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches)
  } catch (e) { return false }
}

// Flash du tir : voile blanc sur tout l'écran, effacé en 0,1 s. Opacité 0,22, ou 0,06 en effets atténués.
export const SHOT_FLASH = { normal: 0.22, reduced: 0.06 }
export function shotFlash(reduced, doc = document) {
  const f = doc.createElement('div')
  const a = reduced ? SHOT_FLASH.reduced : SHOT_FLASH.normal
  f.style.cssText = `position:fixed;inset:0;background:rgba(255,255,255,${a});pointer-events:none;z-index:999;transition:opacity 0.1s`
  doc.body.appendChild(f)
  setTimeout(() => { f.style.opacity = '0'; setTimeout(() => f.remove(), 120) }, 40)
  return f
}

// Plein écran : toute la page (document.documentElement), sous Electron comme dans un navigateur. Le libellé du bouton
// dit ce qu'il va faire.
export function fullscreenLabel(doc = document) {
  return doc.fullscreenElement ? 'QUITTER' : 'ACTIVER'
}

// Bascule. Un refus du navigateur (geste utilisateur manquant, cadre sans permission) ou une API absente ne lève rien :
// le libellé reste juste, puisqu'il suit l'état réel.
export async function toggleFullscreen(doc = document) {
  try {
    if (doc.fullscreenElement) { if (doc.exitFullscreen) await doc.exitFullscreen() }
    else if (doc.documentElement.requestFullscreen) await doc.documentElement.requestFullscreen()
  } catch (e) { /* refusé : on reste comme on était */ }
}

// Bouton des Paramètres : un clic bascule ; le libellé suit fullscreenchange, donc aussi une sortie par Échap ou par
// le système, sans clic.
export function bindFullscreenButton(button, doc = document) {
  const sync = () => { button.textContent = fullscreenLabel(doc) }
  button.addEventListener('click', () => { toggleFullscreen(doc) })
  doc.addEventListener('fullscreenchange', sync)
  sync()
  return sync
}
