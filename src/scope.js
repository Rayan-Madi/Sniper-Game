import { getStats } from './upgrades.js'
import { stepTremble, trembleParams, mradToPixels, fovFor } from './aim.js'

const canvas = document.getElementById('scope-canvas')
const ctx = canvas.getContext('2d')

let visible = false
let zoom = 4
// Écart de la visée au centre, en milliradians (phase : oscillation de respiration). Réglé en angle : le même à tous les
// zooms ; converti en pixels pour le réticule et le rayon du tir (getTrembleOffset).
let tremble = { x: 0, y: 0, vx: 0, vy: 0, phase: 0 }
let stress = 0
let steady = 1        // 1 = normal, <1 = apnée (visée stabilisée)

export function showScope() { visible = true; canvas.style.display = 'block' }
export function hideScope() { visible = false; canvas.style.display = 'none' }
export function isVisible() { return visible }

export function setZoom(z) { zoom = z }
export function getZoom() { return zoom }
export function setStress(s) { stress = s }
export function setSteady(s) { steady = s }

// Tremblement toujours présent (respiration), amplifié par le stress : cibles en milliradians de src/shot/tuning.js,
// physique dans src/aim.js (même écart quel que soit le nombre d'images par seconde).
export function updateTremble(dt) {
  if (!(dt > 0)) return
  const p = trembleParams(stress, { scale: getStats().trembleScale, steady }, dt)
  stepTremble(tremble, p, dt, Math.random)
}

// Décalage du réticule à l'écran (pixels CSS, y vers le bas) : l'angle du tremblement vu dans le champ de la lunette.
// main.js en tire le rayon du tir (shoot) : la balle part là où le réticule est dessiné.
export function getTrembleOffset() {
  const fov = fovFor(zoom, true)
  return { x: mradToPixels(tremble.x, fov, innerHeight), y: mradToPixels(tremble.y, fov, innerHeight) }
}

// Écart de la visée en milliradians (accroche de dev __aim()).
export function getTrembleMrad() {
  return { x: tremble.x, y: tremble.y }
}

export function drawScope() {
  if (!visible) return

  const W = canvas.width = innerWidth
  const H = canvas.height = innerHeight
  const cx = W / 2
  const cy = H / 2
  const R = Math.min(W, H) * 0.38

  ctx.clearRect(0, 0, W, H)

  // Vignette noire autour du scope
  const outerR = R * 1.02
  ctx.beginPath()
  ctx.rect(0, 0, W, H)
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2, true)
  ctx.fillStyle = '#000'
  ctx.fill()

  // Bord du scope avec dégradé
  const grad = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.85)')
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()

  // Aberration chromatique légère (stress)
  if (stress > 0.3) {
    ctx.save()
    ctx.globalAlpha = stress * 0.06
    ctx.fillStyle = '#ff0000'
    ctx.beginPath()
    ctx.arc(cx + 2, cy, R * 0.98, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0000ff'
    ctx.beginPath()
    ctx.arc(cx - 2, cy, R * 0.98, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // ─── RÉTICULE — suit le tremblement (c'est là que part la balle) ─────
  // Le centre du réticule = centre écran + offset de tremblement
  const offset = getTrembleOffset()
  const rx = cx + offset.x
  const ry = cy + offset.y

  ctx.save()
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

  // Indicateur de zoom
  ctx.fillStyle = 'rgba(200,240,200,0.55)'
  ctx.font = '11px Courier New'
  ctx.textAlign = 'left'
  ctx.fillText(`${zoom.toFixed(1)}×`, cx - R + 16, cy + R - 20)

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

  // Poussière/rayures sur la lentille
  ctx.save()
  ctx.globalAlpha = 0.04
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(cx - 40, cy - 80); ctx.lineTo(cx - 30, cy + 20); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(cx + 60, cy - 60); ctx.lineTo(cx + 70, cy + 40); ctx.stroke()
  ctx.restore()
}
