// Déplacement à la première personne de l'enquête : touches de settings.pvpKeys (codes physiques, relues à chaque
// événement) et flèches, souris en verrouillage du pointeur, collisions d'un cercle contre des boîtes au sol.
// Caméra en ordre 'YXZ' : lacet 0 = regard vers −z, lacet positif = à gauche, tangage négatif = vers le bas.
import { settings, sensMultiplier, invertY } from '../settings.js'

const LOOK = 0.0022            // radians par pixel de souris à sensibilité 100
const PITCH_MAX = 1.4
const STEP_EVERY = 0.75        // mètres entre deux bruits de pas

export const forwardOf = yaw => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) })
export const rightOf = yaw => ({ x: Math.cos(yaw), z: -Math.sin(yaw) })

// Avance un cercle de rayon r de (dx, dz), axe par axe, en glissant le long des boîtes. Le test se fait sur tout le
// trajet de l'axe (pas seulement l'arrivée) : un grand pas ne traverse pas un mur fin. Une boîte dans laquelle on se
// trouve déjà ne retient pas (on peut toujours en sortir). La tolérance E est indispensable : après un arrêt contre
// une boîte (x = minX − r), (minX − r) + r peut dépasser minX d'un arrondi, et sans elle la boîte compterait comme
// « déjà dedans » à l'image suivante : on traverserait le mur en continuant de pousser.
export function moveCircle(pos, dx, dz, r, boxes) {
  const E = 1e-6
  let x = pos.x + dx
  if (dx) for (const b of boxes) {
    if (pos.z + r <= b.minZ + E || pos.z - r >= b.maxZ - E) continue
    if (dx > 0 && pos.x + r <= b.minX + E && x + r > b.minX) x = b.minX - r
    else if (dx < 0 && pos.x - r >= b.maxX - E && x - r < b.maxX) x = b.maxX + r
  }
  let z = pos.z + dz
  if (dz) for (const b of boxes) {
    if (x + r <= b.minX + E || x - r >= b.maxX - E) continue
    if (dz > 0 && pos.z + r <= b.minZ + E && z + r > b.minZ) z = b.minZ - r
    else if (dz < 0 && pos.z - r >= b.maxZ - E && z - r < b.maxZ) z = b.maxZ + r
  }
  return { x, z }
}

export function createFpsController({ camera, colliders = [], start = { x: 0, z: 0, yaw: 0 }, eye = 1.65, speed = 1.6, radius = 0.28,
  onStep = () => {}, onUnlock = () => {}, target = document } = {}) {
  const pos = { x: start.x, z: start.z }
  let yaw = start.yaw || 0, pitch = start.pitch || 0, y = eye, frozen = false, enabled = false, walked = 0, sinceStep = 0
  const held = new Set()
  camera.rotation.order = 'YXZ'

  const actionOf = code => {
    const k = settings.pvpKeys
    if (code === k.forward || code === 'ArrowUp') return 'f'
    if (code === k.back || code === 'ArrowDown') return 'b'
    if (code === k.left || code === 'ArrowLeft') return 'l'
    if (code === k.right || code === 'ArrowRight') return 'r'
    return null
  }
  const locked = () => !!document.pointerLockElement
  const onDown = e => { const a = actionOf(e.code); if (a && !frozen) held.add(a) }
  const onUp = e => { const a = actionOf(e.code); if (a) held.delete(a) }
  const onMove = e => {
    if (frozen || !locked()) return
    const s = LOOK * sensMultiplier()
    yaw -= (e.movementX || 0) * s
    pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch - (e.movementY || 0) * s * invertY()))
  }
  const onLock = () => { if (!locked()) { held.clear(); onUnlock() } }

  const api = {
    get position() { return pos },
    get yaw() { return yaw },
    get pitch() { return pitch },
    get frozen() { return frozen },
    enable() {
      if (enabled) return
      enabled = true
      target.addEventListener('keydown', onDown); target.addEventListener('keyup', onUp)
      target.addEventListener('mousemove', onMove); target.addEventListener('pointerlockchange', onLock)
    },
    disable() {
      if (!enabled) return
      enabled = false; held.clear()
      target.removeEventListener('keydown', onDown); target.removeEventListener('keyup', onUp)
      target.removeEventListener('mousemove', onMove); target.removeEventListener('pointerlockchange', onLock)
    },
    // Chrome renvoie une promesse, rejetée si on reverrouille trop vite après Échap : on l'avale (pas d'erreur en console)
    lock(el) { if (el && typeof el.requestPointerLock === 'function') { try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}) } catch (e) { /* refusé */ } } },
    setFrozen(v) { frozen = !!v; if (frozen) held.clear() },
    setPose(p) { pos.x = p.x; pos.z = p.z; if (p.y != null) y = p.y; if (p.yaw != null) yaw = p.yaw; if (p.pitch != null) pitch = p.pitch },
    update(dt) {
      let mx = 0, mz = 0
      if (!frozen && held.size) {
        const f = forwardOf(yaw), r = rightOf(yaw)
        const fw = (held.has('f') ? 1 : 0) - (held.has('b') ? 1 : 0), st = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0)
        mx = f.x * fw + r.x * st; mz = f.z * fw + r.z * st
        const len = Math.hypot(mx, mz)
        if (len > 0) { mx = mx / len * speed * dt; mz = mz / len * speed * dt }
      }
      if (mx || mz) {
        const n = moveCircle(pos, mx, mz, radius, colliders)
        const d = Math.hypot(n.x - pos.x, n.z - pos.z)
        pos.x = n.x; pos.z = n.z; walked += d; sinceStep += d
        while (sinceStep >= STEP_EVERY) { sinceStep -= STEP_EVERY; onStep() }
      }
      const bob = held.size && !frozen ? Math.sin(walked * Math.PI * 2 / 1.5) * 0.025 : 0
      camera.position.set(pos.x, y + bob, pos.z)
      camera.rotation.set(pitch, yaw, 0, 'YXZ')
    },
    dispose() { api.disable() },
  }
  return api
}
