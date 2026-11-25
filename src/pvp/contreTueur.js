import * as THREE from 'three'
import { camera } from '../scene.js'
import * as net from '../net.js'
import { groundForward, groundRight } from './pvpMath.js'
import { el, partsEl, crosshairEl, etat } from './etat.js'
import { playGunshot, playHitmarker } from './son.js'
import { sniperAimDir, laserOrigin, updateLaser, showKillfeed, endRound, applyAbilityLocal } from './index.js'

// ─── Mode PvP : rôle contre-tueur ────────────────────────────────────
// Le déplacement dans la foule, les pièces d'arme, le pistolet, et la réception des capacités du sniper (leurs effets,
// appliqués chez les deux joueurs, sont dans index.js).

// ─── Rôle CONTRE-TUEUR (PNJ) ─────────────────────────────────────────
const keys = { w: false, a: false, s: false, d: false }
const EMOTE_DUR = 2400
const PNJ_SPEED = 2.2   // vitesse du contre-tueur (proche d'un PNJ qui marche)

// Se fond dans la foule le temps d'une danse/salut — purement cosmétique,
// mais ça donne au contre-tueur l'air d'un vrai PNJ (comme demandé), au lieu
// d'un joueur qui marche en ligne droite au milieu de gens qui dansent.
function triggerEmote() {
  if (etat.myRole !== 'pnj' || !etat.roundActive) return
  const now = performance.now()
  if (now < etat.emoteUntil) return
  etat.emoteUntil = now + EMOTE_DUR
}

function setupPnj() {
  etat.pnjPos.set(...etat.arena.pnjSpawn)
  etat.pnjYaw = Math.PI; etat.pnjPitch = 0
  camera.fov = 60
  camera.updateProjectionMatrix()

  // Avatar créé par buildRoundScene, avec le même seed que celui rendu chez le sniper.
  etat.avatar.group.position.copy(etat.pnjPos)

  el('canvas').requestPointerLock()
}

function pnjForward() { return groundForward(etat.pnjYaw) }
function pnjRight() { return groundRight(etat.pnjYaw) }
// Direction de visée du pistolet (yaw + pitch) : la balle part par là.
function pnjAimDir() {
  const cp = Math.cos(etat.pnjPitch)
  return new THREE.Vector3(Math.sin(etat.pnjYaw) * cp, Math.sin(etat.pnjPitch), Math.cos(etat.pnjYaw) * cp)
}

let lastPosSentAt = 0
function pnjFrame(dt) {
  const now = performance.now()
  const emoting = now < etat.emoteUntil
  etat.speedMultiplier = (now < etat.clingerUntil) ? 0.5 : 1
  // Allure calme de PNJ (≈2,2 u/s) — pas la course qui trahissait le joueur.
  const spd = PNJ_SPEED * etat.speedMultiplier * dt
  const fwd = pnjForward(), right = pnjRight()
  const move = new THREE.Vector3()
  // En pleine émote (danse/salut pour se fondre dans la foule), le
  // déplacement est figé — comme un vrai PNJ qui danse sur place.
  if (!emoting) {
    if (keys.w) move.add(fwd)
    if (keys.s) move.sub(fwd)
    if (keys.d) move.add(right)
    if (keys.a) move.sub(right)
  }
  const moving = move.lengthSq() > 0.0001
  if (moving) {
    move.normalize().multiplyScalar(spd)
    etat.pnjPos.x = THREE.MathUtils.clamp(etat.pnjPos.x + move.x, etat.arena.moveBounds.minX, etat.arena.moveBounds.maxX)
    etat.pnjPos.z = THREE.MathUtils.clamp(etat.pnjPos.z + move.z, etat.arena.moveBounds.minZ, etat.arena.moveBounds.maxZ)
  }
  etat.avatar.group.position.copy(etat.pnjPos)
  etat.avatar.group.rotation.y = etat.pnjYaw
  if (etat.avatar.mixer) {
    etat.avatar.mixer.update(dt)
    const acts = etat.avatar.actions
    const want = emoting ? (acts['Dance'] || acts['Wave'] || acts['Idle']) : (moving ? acts['Walk'] : acts['Idle'])
    if (want && etat.avatar._clip !== want) {
      if (etat.avatar._clip) etat.avatar._clip.fadeOut(0.2)
      want.reset().fadeIn(0.2).play()
      etat.avatar._clip = want
    }
  }

  // Caméra : visée au pistolet (première personne) OU 3ᵉ personne
  const aiming = etat.pnjAiming && etat.partsCollected >= 3
  const wantFov = aiming ? 45 : 60
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov = wantFov; camera.updateProjectionMatrix() }

  let camPos, lookAt
  if (aiming) {
    // Première personne alignée sur la visée → le réticule (centre écran)
    // pointe EXACTEMENT là où part la balle. Indispensable pour bien viser le nid.
    const head = etat.pnjPos.clone().add(new THREE.Vector3(0, 1.55, 0))
    const aimDir = pnjAimDir()
    camPos = head
    lookAt = head.clone().add(aimDir.multiplyScalar(20))
  } else {
    // 3ᵉ personne, orbite derrière le personnage
    const camDist = 4.2, camHeight = 2.0 + etat.pnjPitch * 2
    camPos = etat.pnjPos.clone().sub(fwd.clone().multiplyScalar(camDist)).add(new THREE.Vector3(0, camHeight, 0))
    lookAt = etat.pnjPos.clone().add(new THREE.Vector3(0, 1.5, 0))
  }
  // secousse : téléphone / alarme
  if (now < etat.phoneShakeUntil || now < etat.alarmUntil) {
    const s = now < etat.alarmUntil ? 0.14 : 0.05
    camPos = camPos.clone()
    camPos.x += (Math.random() - 0.5) * s
    camPos.y += (Math.random() - 0.5) * s
  }
  camera.position.copy(camPos)
  camera.lookAt(lookAt)
  // Réticule visible uniquement en visée
  crosshairEl.style.display = aiming ? 'block' : 'none'

  // Flash rouge pendant l'alarme
  let flash = el('mp-alarm-flash')
  if (now < etat.alarmUntil) {
    if (!flash) {
      flash = document.createElement('div'); flash.id = 'mp-alarm-flash'
      flash.style.cssText = 'position:fixed;inset:0;background:rgba(255,30,20,0.18);pointer-events:none;z-index:65;'
      document.body.appendChild(flash)
    }
    flash.style.opacity = (0.5 + Math.sin(now / 60) * 0.5).toFixed(2)
  } else if (flash) flash.remove()

  // Pièces d'arme : ramassage par proximité — distance HORIZONTALE (XZ)
  // seulement. Les pièces sont posées sur du mobilier (y≈1,5) et le joueur est
  // au sol (y=0) : mesurer en 3D rendrait la plupart impossibles à ramasser.
  for (const p of etat.arena.partSpots) {
    if (p.taken) continue
    const dx = p.mesh.position.x - etat.pnjPos.x, dz = p.mesh.position.z - etat.pnjPos.z
    if (Math.hypot(dx, dz) < 2.0) {
      takePart(p)
      etat.partsCollected++
      partsEl.textContent = `Pièces d'arme : ${etat.partsCollected} / 3`
      net.send({ t: 'part_pickup', idx: etat.arena.partSpots.indexOf(p) })
      showKillfeed(`Pièce récupérée : ${p.label} (${etat.partsCollected}/3)`)
      if (etat.partsCollected >= 3) armPnj()
    }
  }

  // Le trait rouge du sniper, reconstruit depuis sa visée reçue en réseau —
  // c'est comme ça que le contre-tueur repère le nid et évite la ligne de mire.
  updateLaser(laserOrigin(), sniperAimDir())

  if (now - lastPosSentAt > 65) {
    lastPosSentAt = now
    // On transmet aussi l'orientation et l'anim → le sniper voit un avatar
    // qui marche/danse et regarde dans la bonne direction, pas un mannequin figé.
    const anim = emoting ? 'emote' : moving ? 'walk' : 'idle'
    net.send({ t: 'pos', x: etat.pnjPos.x, y: etat.pnjPos.y, z: etat.pnjPos.z, yaw: etat.pnjYaw, anim })
  }
}

function armPnj() {
  showKillfeed('Pistolet assemblé : CLIC DROIT pour viser le nid, CLIC GAUCHE pour tirer !')
  etat.pistolMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.3 }))
  etat.pistolMesh.position.set(0.32, 1.1, 0.35)
  etat.avatar.group.add(etat.pistolMesh)
}

// Le sniper apprend qu'une pièce a été prise — mais PAS où (aucune position
// n'est révélée, la pièce lui était déjà invisible).
function removePartVisual(idx) {
  const p = etat.arena.partSpots[idx]
  if (p && !p.taken) takePart(p)
  etat.oppPartsCount = Math.min(3, etat.oppPartsCount + 1)
  if (etat.oppPartsCount >= 3) showKillfeed('⚠️ Le contre-tueur est ARMÉ : il peut riposter !')
  else showKillfeed(`⚠️ Le contre-tueur a récupéré une pièce d'arme (${etat.oppPartsCount}/3)`)
}

// Ramasse un fragment SANS provoquer de freeze : on masque le mesh et on éteint
// la PointLight (intensité 0) mais on LAISSE le groupe dans la scène. Retirer la
// lumière changerait le nombre de lumières et forcerait three.js à recompiler
// tous les shaders → micro-gel visible (le sniper devinait alors le ramassage).
function takePart(p) {
  p.taken = true
  p.mesh.traverse(o => {
    if (o.isMesh) o.visible = false
    if (o.isLight) o.intensity = 0
  })
}

function pnjShoot() {
  if (!etat.roundActive || etat.myRole !== 'pnj' || etat.partsCollected < 3) return
  if (!etat.pnjAiming) { showKillfeed('CLIC DROIT pour viser d\'abord'); return }
  playGunshot()
  // Tir depuis la tête, dans la direction VISÉE (yaw+pitch) — pas la direction
  // caméra (qui, en 3ᵉ personne, regarde le joueur et donnait un tir faussé).
  const origin = etat.pnjPos.clone().add(new THREE.Vector3(0, 1.55, 0))
  const dir = pnjAimDir()
  const raycaster = new THREE.Raycaster(origin, dir, 0.1, 120)
  if (raycaster.ray.intersectsBox(etat.arena.nest.windowBox)) {
    playHitmarker()
    net.send({ t: 'hit_sniper' })
    endRound('pnj', 'hit')
  } else {
    showKillfeed('Tir manqué')
  }
}

// Le contre-tueur reçoit une capacité du sniper → même effet local (positionné
// sur lui-même via abilityTarget()).
function applyIncomingAbility(kind) {
  applyAbilityLocal(kind)
}

export { keys, triggerEmote, setupPnj, pnjFrame, removePartVisual, pnjShoot, applyIncomingAbility }
