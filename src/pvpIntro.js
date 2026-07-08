import { camera, renderer, scene } from './scene.js'

// ─── Cinématique d'intro du mode PvP ─────────────────────────────────
// Contrairement aux cinématiques du mode histoire (cinematic3d.js), qui
// construisent leur propre scène jetable, celle-ci fait voler la caméra
// dans l'ARÈNE PVP DÉJÀ CONSTRUITE (le vrai nid, la vraie salle, les vrais
// points de ramassage) : pas de scène temporaire, pas de clearMap().
// Reprend juste le langage visuel (bandes letterbox, vignette, texte en
// machine à écrire, "appuyer pour passer") des cinématiques du solo.

function smooth(a) { return a * a * (3 - 2 * a) }
function lerp3(a, b, k) {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}
function v3(v) { return Array.isArray(v) ? v : [v.x, v.y, v.z] }

let active = false
let raf = null
let overlay = null, textEl = null
let onTickCb = null, onDoneCb = null
let startTime = 0, t = 0, lastT = 0
let keyframes = [], textCues = [], total = 0

function buildConfig(role, arena) {
  const [nx, ny, nz] = arena.nest.cameraPos
  const pitch = arena.nest.defaultPitch ?? -0.22
  // Centre de la salle (fourni par la carte) — cible des regards de l'intro.
  const rc = arena.roomCenter || [0, 1.5, -24]
  // Point visé par le sniper au repos (yaw 0), pour finir l'intro pile
  // aligné sur ce que le joueur verra en prenant la main.
  const aimEnd = [nx, ny + Math.sin(pitch) * 30, nz - Math.cos(pitch) * 30]

  if (role === 'sniper') {
    return {
      title: 'RÔLE : SNIPER',
      total: 10,
      keyframes: [
        { time: 0,   pos: [nx + 16, ny + 8, nz + 14], look: rc },
        { time: 3.5, pos: [nx + 4,  ny + 3, nz + 6],  look: rc },
        { time: 7,   pos: [nx,      ny + 0.5, nz + 1], look: rc },
        { time: 10,  pos: [nx, ny, nz], look: aimEnd },
      ],
      textCues: [
        { from: 0.3, to: 3.3, text: "Vous êtes le SNIPER. Poste fixe — impossible de bouger de ce nid." },
        { from: 3.6, to: 6.8, text: "Visez à la souris. Votre laser rouge est visible des DEUX côtés : c'est votre talon d'Achille." },
        { from: 7.1, to: 9.8, text: "3 capacités de sabotage (touches configurables dans Paramètres). Repérez le contre-tueur et abattez-le avant lui." },
      ],
    }
  }

  // Contre-tueur — traveling au ras du sol, devant les 3 pièces d'arme
  const parts = arena.partSpots.map(p => v3(p.pos))
  const spawn = arena.pnjSpawn
  return {
    title: 'RÔLE : CONTRE-TUEUR',
    total: 11,
    keyframes: [
      { time: 0,   pos: [0, 9, spawn[2] + 8],                  look: rc },
      { time: 3,   pos: [parts[0][0], 2.4, parts[0][2] + 4],   look: [parts[0][0], 1, parts[0][2]] },
      { time: 6,   pos: [parts[1][0], 2.4, parts[1][2] + 4],   look: [parts[1][0], 1, parts[1][2]] },
      { time: 8.5, pos: [parts[2][0], 2.4, parts[2][2] + 5],   look: [parts[2][0], 1.2, parts[2][2]] },
      { time: 11,  pos: [spawn[0], 2.4, spawn[2] + 5],          look: [spawn[0], 1.6, spawn[2]] },
    ],
    textCues: [
      { from: 0.3, to: 2.8,  text: "Vous êtes le CONTRE-TUEUR. Fondez-vous dans la foule — déplacement en ZQSD." },
      { from: 3.1, to: 8.2,  text: "Ramassez les 3 pièces d'arme dispersées dans la pièce pour assembler votre pistolet." },
      { from: 8.5, to: 10.8, text: "Repérez le laser du sniper et évitez sa ligne de mire. Une touche d'émote vous fait danser/saluer pour vous fondre parmi les invités." },
    ],
  }
}

function buildOverlay(title) {
  overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;z-index:140;cursor:pointer;font-family:'Courier New',monospace;`

  const barTop = document.createElement('div')
  barTop.style.cssText = `position:absolute;top:0;left:0;right:0;height:0;background:#000;transition:height 0.7s ease;`
  const barBot = document.createElement('div')
  barBot.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:0;background:#000;transition:height 0.7s ease;`
  requestAnimationFrame(() => { barTop.style.height = '9vh'; barBot.style.height = '9vh' })

  const vignette = document.createElement('div')
  vignette.style.cssText = `position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%);`

  const titleEl = document.createElement('div')
  titleEl.textContent = title
  titleEl.style.cssText = `position:absolute;top:40%;left:0;right:0;text-align:center;
    font-size:28px;letter-spacing:0.35em;color:#e8f0e8;
    text-shadow:0 0 30px rgba(0,0,0,0.9), 0 0 12px rgba(78,255,78,0.25);
    opacity:0;transition:opacity 0.8s;z-index:3;pointer-events:none;`
  requestAnimationFrame(() => { titleEl.style.opacity = '1' })
  setTimeout(() => { if (titleEl) titleEl.style.opacity = '0' }, 2800)

  textEl = document.createElement('div')
  textEl.style.cssText = `position:absolute;bottom:12vh;left:0;right:0;text-align:center;
    color:#e8f0e8;font-size:19px;line-height:1.5;letter-spacing:0.03em;padding:0 9vw;
    text-shadow:0 2px 14px #000;opacity:0;transition:opacity 0.5s;`

  const skip = document.createElement('div')
  skip.textContent = 'CLIC / ENTRÉE POUR PASSER'
  skip.style.cssText = `position:absolute;bottom:10.2vh;right:30px;font-size:11px;
    color:rgba(255,255,255,0.35);letter-spacing:0.12em;z-index:2;`

  overlay.appendChild(vignette); overlay.appendChild(barTop); overlay.appendChild(barBot)
  overlay.appendChild(titleEl); overlay.appendChild(textEl); overlay.appendChild(skip)
  document.body.appendChild(overlay)
  overlay.addEventListener('click', finish)
  document.addEventListener('keydown', skipOnKey)
}

function skipOnKey(e) {
  if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') finish()
}

export function playPvpIntro(role, arena, onTick, onDone) {
  active = true; t = 0; lastT = 0
  onTickCb = onTick; onDoneCb = onDone
  startTime = performance.now()
  const config = buildConfig(role, arena)
  keyframes = config.keyframes; textCues = config.textCues; total = config.total
  buildOverlay(config.title)
  loop()
}

export function isPvpIntroActive() { return active }

// Arrêt d'urgence (ex: l'adversaire quitte pendant l'intro) — ne déclenche
// PAS le callback de fin, puisqu'on n'enchaîne pas sur la partie.
export function stopPvpIntro() {
  if (!active) return
  active = false
  if (raf) cancelAnimationFrame(raf)
  document.removeEventListener('keydown', skipOnKey)
  if (overlay && overlay.parentNode) document.body.removeChild(overlay)
  overlay = null; textEl = null; onTickCb = null; onDoneCb = null
}

function loop() {
  if (!active) return
  raf = requestAnimationFrame(loop)
  t = (performance.now() - startTime) / 1000
  const dt = Math.min(0.05, Math.max(0, t - lastT)); lastT = t
  if (onTickCb) onTickCb(dt)

  let k0 = keyframes[0], k1 = keyframes[keyframes.length - 1]
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].time && t <= keyframes[i + 1].time) { k0 = keyframes[i]; k1 = keyframes[i + 1]; break }
  }
  const span = Math.max(0.001, k1.time - k0.time)
  const k = smooth(Math.max(0, Math.min(1, (t - k0.time) / span)))
  const pos = lerp3(k0.pos, k1.pos, k)
  const look = lerp3(k0.look, k1.look, k)
  camera.position.set(pos[0], pos[1], pos[2])
  camera.lookAt(look[0], look[1], look[2])
  camera.fov = 55
  camera.updateProjectionMatrix()

  // Texte en machine à écrire, une réplique à la fois
  let shown = null
  for (const c of textCues) if (t >= c.from && t <= c.to) { shown = c; break }
  if (textEl) {
    if (shown) {
      const chars = Math.max(0, Math.floor((t - shown.from) / 0.022))
      const txt = shown.text.slice(0, chars)
      if (textEl.textContent !== txt) textEl.textContent = txt
      textEl.style.opacity = '1'
    } else {
      textEl.style.opacity = '0'
    }
  }

  renderer.render(scene, camera)

  if (t >= total) finish()
}

function finish() {
  if (!active) return
  active = false
  if (raf) cancelAnimationFrame(raf)
  document.removeEventListener('keydown', skipOnKey)
  if (overlay && overlay.parentNode) {
    const ov = overlay
    ov.style.transition = 'opacity 0.5s'; ov.style.opacity = '0'
    setTimeout(() => { if (ov.parentNode) document.body.removeChild(ov) }, 500)
  }
  overlay = null; textEl = null
  const cb = onDoneCb; onDoneCb = null; onTickCb = null
  if (cb) cb()
}
