import { getStats } from './upgrades.js'
import { stepTremble, trembleParams, mradToPixels, scopeFov } from './aim.js'
import { createScopeAnim } from './shot/scopeAnim.js'
import { LUNETTE, LUEUR } from './shot/tuning.js'
import { shotFlashAlpha } from './comfort.js'

const canvas = document.getElementById('scope-canvas')
const ctx = canvas.getContext('2d')

// Ouverture, fermeture et zoom lissé (spec du lot 2, §3.2 ; src/shot/scopeAnim.js), avancés par updateScope à chaque
// image de la mission.
const anim = createScopeAnim(LUNETTE)
let shown = false     // canevas affiché : lunette ouverte, en train de s'ouvrir ou de se refermer
// Taille du canevas en pixels CSS et densité de pixels (resizeScope) : le dessin se fait en pixels CSS, mis à l'échelle
// par le contexte.
let size = { w: 0, h: 0, pr: 0 }
// Écart de la visée au centre, en milliradians (phase : oscillation de respiration). Réglé en angle : le même à tous les
// zooms ; converti en pixels pour le réticule et le rayon du tir (getTrembleOffset).
let tremble = { x: 0, y: 0, vx: 0, vy: 0, phase: 0 }
let stress = 0
let steady = 1        // 1 = normal, <1 = apnée (visée stabilisée)
// Lueur du coup de feu (shotGlow) : opacité de départ et temps écoulé depuis le coup (s).
let glow = { a: 0, t: 0 }
// Course de la culasse (setBoltProgress, src/shot/bolt.js) : 0 au coup, 1 quand on peut tirer.
let boltProgress = 1

const smoothstep = o => o * o * (3 - 2 * o)

function setShown(v) {
  if (shown === v) return
  shown = v
  canvas.style.display = v ? 'block' : 'none'
}

// Clic droit enfoncé : la lunette s'ouvre en LUNETTE.ouvertureMs (depuis où elle en est, si elle se refermait).
export function showScope() { anim.open(); setShown(true) }
// Clic droit relâché : la visée s'arrête tout de suite, l'image se referme en LUNETTE.fermetureMs.
export function closeScope() { anim.close() }
// Fermeture d'un coup (pause, échec, réussite, fin de mission) : plus rien de la lunette à l'image suivante.
export function hideScope() { anim.shut(); setShown(false) }
// Lunette tenue (ouverte ou en train de s'ouvrir) : visée à la souris, molette, stress, apnée et tremblement.
export function isVisible() { return anim.opening }
// Ouverte à 100 % : le seul état où le clic gauche tire.
export function isScopeReady() { return anim.opening && anim.openness >= 1 }
export function getScopeOpenness() { return anim.openness }

// Un pas de dt secondes (la boucle de main.js, avant de régler la caméra) : ouverture, zoom lissé et lueur du coup de
// feu. Refermée, la lunette quitte l'écran.
export function updateScope(dt) {
  anim.update(dt)
  if (dt > 0) glow.t += dt
  if (!anim.opening && anim.openness === 0) setShown(false)
}

// Coup de feu (spec du lot 2, §3.3) : une lueur chaude brève sur les bords de la lunette, à 0,12 d'opacité, ou à 0,06
// en effets atténués (reduced : effectsReduced() du lot 1), pleine 40 ms puis éteinte en 0,1 s comme le voile blanc
// qui couvrait tout l'écran avant le lot 2 (LUEUR, src/shot/tuning.js).
export function shotGlow(reduced) { glow = { a: shotFlashAlpha(reduced), t: 0 } }
const glowAlpha = () => {
  if (glow.t <= LUEUR.tenueS) return glow.a
  return glow.a * Math.max(0, 1 - (glow.t - LUEUR.tenueS) / LUEUR.fonduS)
}

// Course de la culasse, de 0 (le coup) à 1 (on peut tirer) : la jauge sous le réticule (main.js, à chaque image).
export function setBoltProgress(p) { boltProgress = p }

// Champ de vision de la caméra (main.js, syncFov) : 60° fermée, 60 / zoom affiché ouverte, et entre les deux pendant
// l'ouverture et la fermeture.
export function getScopeFov() { return scopeFov(anim.zoom, anim.openness) }

// Zoom choisi à la molette (HUD, pas de la molette) ; le zoom affiché le rejoint en LUNETTE.zoomMs.
// instant : posé d'un coup (montage d'une mission).
export function setZoom(z, { instant = false } = {}) { anim.setZoom(z, { instant }) }
export function getZoom() { return anim.target }
// Zoom affiché, lissé : celui du champ de vision et de la sensibilité de la souris.
export function getEffectiveZoom() { return anim.zoom }
export function setStress(s) { stress = s }
export function setSteady(s) { steady = s }

// Taille du canevas (pixels CSS) et densité de pixels, celle du rendu mais jamais sous 1 : au préréglage Bas (rendu à
// 0,75), un canevas agrandi par le CSS rendrait le réticule flou. Au démarrage, au changement de préréglage ou de
// densité d'écran et au redimensionnement de la fenêtre seulement (main.js). Écrire canvas.width réalloue le canevas :
// rien n'est refait quand rien ne change.
export function resizeScope(w, h, pixelRatio = 1) {
  const pr = Math.max(1, pixelRatio)
  if (size.w === w && size.h === h && size.pr === pr) return
  size = { w, h, pr }
  canvas.width = Math.round(w * pr)
  canvas.height = Math.round(h * pr)
}
resizeScope(innerWidth, innerHeight, 1)

// Tremblement toujours présent (respiration), amplifié par le stress : cibles en milliradians de src/shot/tuning.js,
// physique dans src/aim.js (même écart quel que soit le nombre d'images par seconde).
export function updateTremble(dt) {
  if (!(dt > 0)) return
  const p = trembleParams(stress, { scale: getStats().trembleScale, steady }, dt)
  stepTremble(tremble, p, dt, Math.random)
}

// Décalage du réticule à l'écran (pixels CSS, y vers le bas) : l'angle du tremblement vu dans le champ que la caméra
// affiche (getScopeFov, celui que syncFov lui donne), pas dans celui du zoom choisi : pendant le lissage du zoom, le
// réticule et le rayon du tir suivent l'image. main.js en tire le rayon du tir (shoot) : la balle part là où le
// réticule est dessiné.
export function getTrembleOffset() {
  const fov = getScopeFov()
  return { x: mradToPixels(tremble.x, fov, innerHeight), y: mradToPixels(tremble.y, fov, innerHeight) }
}

// Écart de la visée en milliradians (accroche de dev __aim()).
export function getTrembleMrad() {
  return { x: tremble.x, y: tremble.y }
}

export function drawScope() {
  if (!shown) return

  const { w: W, h: H, pr } = size
  ctx.setTransform(pr, 0, 0, pr, 0, 0)
  const cx = W / 2
  const cy = H / 2
  const R = Math.min(W, H) * 0.38
  // Ouverture adoucie : la vignette part de hors de l'écran (rien de noir) et se resserre jusqu'au bord de la lunette ;
  // le réticule apparaît au dernier tiers (LUNETTE.reticuleA).
  const e = smoothstep(anim.openness)
  const horsEcran = Math.hypot(W, H) / 2 * 1.05
  const outerR = horsEcran + (R * 1.02 - horsEcran) * e
  const lens = outerR / 1.02
  const reticle = Math.max(0, Math.min(1, (anim.openness - LUNETTE.reticuleA) / (1 - LUNETTE.reticuleA)))

  ctx.clearRect(0, 0, W, H)

  // Vignette noire autour du scope
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2, true)
  ctx.fillStyle = '#000'
  ctx.fill()

  // Bord du scope avec dégradé
  const grad = ctx.createRadialGradient(cx, cy, lens * 0.8, cx, cy, lens)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.85)')
  ctx.beginPath()
  ctx.arc(cx, cy, lens, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // Aberration chromatique légère (stress)
  if (stress > 0.3) {
    ctx.save()
    ctx.globalAlpha = stress * 0.06 * e
    ctx.fillStyle = '#ff0000'
    ctx.beginPath()
    ctx.arc(cx + 2, cy, lens * 0.98, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0000ff'
    ctx.beginPath()
    ctx.arc(cx - 2, cy, lens * 0.98, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Lueur du coup de feu : un anneau chaud qui culmine sur le bord de la lentille et déborde sur la vignette
  const ga = glowAlpha() * e
  if (ga > 0) {
    const r0 = lens * 0.6, r1 = lens * 1.12
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1)
    g.addColorStop(0, 'rgba(255,170,90,0)')
    g.addColorStop((lens - r0) / (r1 - r0), `rgba(255,170,90,${ga})`)
    g.addColorStop(1, 'rgba(255,170,90,0)')
    ctx.beginPath()
    ctx.arc(cx, cy, r1, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()
  }

  // ─── RÉTICULE : suit le tremblement (c'est là que part la balle) ─────
  // Le centre du réticule = centre écran + offset de tremblement
  if (reticle > 0) {
    const offset = getTrembleOffset()
    const rx = cx + offset.x
    const ry = cy + offset.y

    ctx.save()
    ctx.globalAlpha = reticle
    // Couleur du réticule vire au rouge avec le stress (alerte visuelle)
    const reticleCol = stress > 0.6
      ? `rgba(255,${Math.floor(200 - stress * 150)},${Math.floor(200 - stress * 150)},0.9)`
      : 'rgba(200,240,200,0.85)'
    ctx.strokeStyle = reticleCol
    ctx.lineWidth = 0.9

    const gap = 18
    // Croix principale (centrée sur rx, ry)
    ctx.beginPath(); ctx.moveTo(rx - R + 10, ry); ctx.lineTo(rx - gap, ry); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rx + gap, ry); ctx.lineTo(rx + R - 10, ry); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rx, ry - R + 10); ctx.lineTo(rx, ry - gap); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(rx, ry + gap); ctx.lineTo(rx, ry + R - 10); ctx.stroke()

    // Mil-dots horizontal
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue
      const px = rx + i * (R / 5)
      ctx.beginPath()
      ctx.arc(px, ry, i % 2 === 0 ? 2.5 : 1.5, 0, Math.PI * 2)
      ctx.fillStyle = reticleCol
      ctx.fill()
    }
    // Mil-dots vertical
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue
      const py = ry + i * (R / 5)
      ctx.beginPath()
      ctx.arc(rx, py, i % 2 === 0 ? 2.5 : 1.5, 0, Math.PI * 2)
      ctx.fillStyle = reticleCol
      ctx.fill()
    }

    // Point central (impact exact)
    ctx.beginPath()
    ctx.arc(rx, ry, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = reticleCol
    ctx.fill()

    // Jauge de la culasse : un trait discret sous le point central, qui se remplit jusqu'à ce qu'on puisse tirer
    if (boltProgress < 1) {
      const gw = 44, gy = ry + 30
      ctx.fillStyle = reticleCol
      ctx.globalAlpha = reticle * 0.25
      ctx.fillRect(rx - gw / 2, gy, gw, 2)
      ctx.globalAlpha = reticle * 0.55
      ctx.fillRect(rx - gw / 2, gy, gw * Math.max(0, boltProgress), 2)
      ctx.globalAlpha = reticle
    }

    // Indicateur de zoom (le zoom choisi à la molette)
    ctx.fillStyle = 'rgba(200,240,200,0.55)'
    ctx.font = '11px Courier New'
    ctx.textAlign = 'left'
    ctx.fillText(`${anim.target.toFixed(1)}×`, cx - R + 16, cy + R - 20)

    // Graduations en bas du scope
    ctx.strokeStyle = 'rgba(200,240,200,0.35)'
    ctx.lineWidth = 0.5
    for (let i = -5; i <= 5; i++) {
      const px = cx + i * 22
      const len = i % 5 === 0 ? 10 : 5
      ctx.beginPath()
      ctx.moveTo(px, cy + R - 30)
      ctx.lineTo(px, cy + R - 30 + len)
      ctx.stroke()
    }

    ctx.restore()
  }

  // Poussière/rayures sur la lentille
  ctx.save()
  ctx.globalAlpha = 0.04 * e
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(cx - 40, cy - 80); ctx.lineTo(cx - 30, cy + 20); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + 60, cy - 60); ctx.lineTo(cx + 70, cy + 40); ctx.stroke()
  ctx.restore()
}
