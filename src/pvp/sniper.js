import * as THREE from 'three'
import { camera } from '../scene.js'
import * as net from '../net.js'
import { el, etat } from './etat.js'
import { playAlarmSound, playGunshot, playHitmarker, positionalRingtone } from './son.js'
import { sniperAimDir, laserOrigin, updateLaser, showKillfeed, endRound } from './index.js'

// ─── Mode PvP : rôle sniper ──────────────────────────────────────────
// Le nid, la visée, le tir, et les capacités de sabotage, appliquées chez les deux joueurs.

const ABILITY_CD = 45000
// Déblocage progressif : téléphone dès le départ, PNJ collant à 1 min, alarme à 2 min.
const ABILITY_UNLOCK = { phone: 0, cling: 60000, alarm: 120000 }
const SNIPER_FOV = 74     // vue d'ensemble (hanche)
const SCOPE_FOV = 20      // œil dans la lunette (clic droit maintenu)

// ─── Rôle SNIPER ─────────────────────────────────────────────────────
function setupSniper() {
  const [x, y, z] = etat.arena.nest.cameraPos
  camera.position.set(x, y, z)
  // Regard par défaut fourni par la carte : avec le nid placé côté Z positif
  // et la salle côté Z négatif, la direction par défaut (0,0,-1) tombe pile
  // sur la pièce — plus besoin de deviner un yaw/pitch de secours.
  etat.sniperYaw = 0; etat.sniperPitch = etat.arena.nest.defaultPitch ?? -0.2
  // FOV large : le sniper doit avoir une vue d'ensemble de toute la salle.
  camera.fov = SNIPER_FOV
  camera.updateProjectionMatrix()

  // Avatar de l'adversaire (le contre-tueur, créé par buildRoundScene) rendu chez le sniper à sa
  // position réseau — sinon le sniper n'a personne à repérer parmi la foule.
  etat.oppAvatar.group.position.set(...etat.arena.pnjSpawn)
  etat.oppAvatar.group.rotation.y = Math.PI
  // Pose idle dès le départ (évite la T-pose pendant l'intro)
  if (etat.oppAvatar.actions && etat.oppAvatar.actions['Idle']) {
    etat.oppAvatar.actions['Idle'].play(); etat.oppAvatar._clip = etat.oppAvatar.actions['Idle']
  }

  el('canvas').requestPointerLock()
}

let lastAimSent = 0
function sniperFrame(dt) {
  camera.position.set(...etat.arena.nest.cameraPos)
  const dir = sniperAimDir()
  camera.lookAt(camera.position.clone().add(dir))
  // FOV selon l'état de visée (lunette au clic droit)
  const wantFov = etat.sniperScoped ? SCOPE_FOV : SNIPER_FOV
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov = wantFov; camera.updateProjectionMatrix() }
  // Laser depuis le canon (décalé) pour que le sniper le voie converger vers sa visée
  updateLaser(laserOrigin(), dir)

  // Avatar de l'adversaire : suit sa position/orientation/anim réseau
  if (etat.oppAvatar) {
    if (etat.lastPnjNet) etat.oppAvatar.group.position.lerp(etat.lastPnjNet, 0.35)
    etat.oppAvatar.group.rotation.y += (etat.lastPnjYaw - etat.oppAvatar.group.rotation.y) * 0.35
    if (etat.oppAvatar.mixer) {
      etat.oppAvatar.mixer.update(dt)
      const acts = etat.oppAvatar.actions
      const want = etat.lastPnjAnim === 'emote' ? (acts['Dance'] || acts['Wave'] || acts['Idle'])
        : etat.lastPnjAnim === 'walk' ? acts['Walk'] : acts['Idle']
      if (want && etat.oppAvatar._clip !== want) {
        if (etat.oppAvatar._clip) etat.oppAvatar._clip.fadeOut(0.2)
        want.reset().fadeIn(0.2).play()
        etat.oppAvatar._clip = want
      }
    }
  }

  const now = performance.now()
  if (now - lastAimSent > 55) { lastAimSent = now; net.send({ t: 'aim', yaw: etat.sniperYaw, pitch: etat.sniperPitch }) }

  for (const k in etat.abilityCooldowns) {
    const btn = el('ab-' + k)
    const bar = btn.querySelector('.cd-bar')
    const lock = btn.querySelector('.ab-lock')
    const unlockLeft = ABILITY_UNLOCK[k] - (now - etat.roundStartAt)
    if (unlockLeft > 0) {
      // Pas encore débloquée : verrou + compte à rebours
      btn.disabled = true
      bar.style.width = '0%'
      if (lock) lock.textContent = fmtClock(unlockLeft)
    } else {
      if (lock) lock.textContent = ''
      const cdLeft = Math.max(0, etat.abilityCooldowns[k] - now)
      bar.style.width = cdLeft > 0 ? (100 - (cdLeft / ABILITY_CD) * 100) + '%' : '100%'
      btn.disabled = cdLeft > 0
    }
  }
}

// mm:ss (déblocage/cooldown des capacités)
function fmtClock(ms) {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

function sniperShoot() {
  if (!etat.roundActive || etat.myRole !== 'sniper') return
  playGunshot()
  const origin = camera.position.clone()
  const dir = sniperAimDir()
  const ray = new THREE.Raycaster(origin, dir, 0.1, 90)

  // Distance au contre-tueur (la cible)
  const target = etat.lastPnjNet || new THREE.Vector3(...etat.arena.pnjSpawn)
  const targetBox = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(target.x, target.y + 0.95, target.z), new THREE.Vector3(0.85, 1.95, 0.85))
  const tp = new THREE.Vector3()
  const tHit = ray.ray.intersectBox(targetBox, tp)
  const tDist = tHit ? origin.distanceTo(tp) : Infinity

  // Distance au civil le plus proche sur la trajectoire
  let cDist = Infinity
  const cp = new THREE.Vector3()
  for (const n of etat.crowd) {
    if (!n.alive) continue
    const b = n.getBounds()
    const cbox = new THREE.Box3().setFromCenterAndSize(b.center, b.size)
    if (ray.ray.intersectBox(cbox, cp)) { const d = origin.distanceTo(cp); if (d < cDist) cDist = d }
  }

  if (tHit && tDist <= cDist) {
    // Le contre-tueur est touché en premier → le sniper gagne
    playHitmarker()
    net.send({ t: 'hit_pnj' })
    endRound('sniper', 'hit')
  } else if (cDist < Infinity) {
    // Un innocent est sur la ligne, touché avant la cible → BAVURE, le sniper perd
    net.send({ t: 'hit_civilian' })
    endRound('pnj', 'civilian')
  } else {
    showKillfeed('Tir manqué')
  }
}

function triggerAbility(kind) {
  if (etat.myRole !== 'sniper' || !etat.roundActive) return
  const now = performance.now()
  const lockLeft = ABILITY_UNLOCK[kind] - (now - etat.roundStartAt)
  if (lockLeft > 0) { showKillfeed(`Capacité débloquée dans ${Math.ceil(lockLeft / 1000)}s`); return }
  if (etat.abilityCooldowns[kind] > now) return
  etat.abilityCooldowns[kind] = now + ABILITY_CD
  net.send({ t: 'ability', kind })
  applyAbilityLocal(kind)   // le sniper voit AUSSI l'effet appliqué à l'adversaire
}

// Position visée par une capacité : chez le contre-tueur = lui-même ; chez le
// sniper = l'avatar de l'adversaire (donc l'effet est bien AU BON ENDROIT chez
// les deux). Les deux clients appliquent l'effet localement → parfaite parité.
function abilityTarget() {
  if (etat.myRole === 'pnj') return etat.pnjPos
  if (etat.oppAvatar) return etat.oppAvatar.group.position
  return etat.lastPnjNet || new THREE.Vector3(...etat.arena.pnjSpawn)
}

function applyAbilityLocal(kind) {
  const now = performance.now()
  const tgt = abilityTarget()
  if (kind === 'phone') {
    positionalRingtone(tgt)   // sonne DEPUIS la position du contre-tueur
    if (etat.myRole === 'pnj') { etat.phoneShakeUntil = now + 3000; showKillfeed('📞 Votre téléphone sonne…') }
    else showKillfeed('📞 Téléphone du contre-tueur déclenché')
  } else if (kind === 'alarm') {
    playAlarmSound()
    scatterCrowd(tgt)         // TOUTE la foule panique et court
    if (etat.myRole === 'pnj') { etat.alarmUntil = now + 2500; showKillfeed('🚨 Une alarme retentit : la foule panique !') }
    else showKillfeed('🚨 Alarme déclenchée : la foule se disperse')
  } else if (kind === 'cling') {
    etat.clingerUntil = now + 4000
    let closest = null, cd = Infinity
    for (const n of etat.crowd) { const d = n.mesh.position.distanceTo(tgt); if (d < cd) { cd = d; closest = n } }
    etat.clingerNpc = closest
    showKillfeed(etat.myRole === 'pnj' ? '🫂 Un PNJ vous colle et vous ralentit…' : '🫂 Un PNJ colle le contre-tueur')
  }
}

// Fait fuir toute la foule loin de sourcePos (panique d'alarme). La sortie de
// panique est gérée dans loop() (retour à un comportement normal après ~3,5 s).
function scatterCrowd(sourcePos) {
  etat.crowdPanicUntil = performance.now() + 3500
  for (const n of etat.crowd) { if (n.alive) n.flee(sourcePos) }
}

// Le PNJ collant suit sa cible (le contre-tueur, chez les DEUX joueurs).
function updateClinger() {
  const now = performance.now()
  if (etat.clingerNpc && now < etat.clingerUntil) {
    const tgt = abilityTarget()
    etat.clingerNpc.mesh.position.set(tgt.x + 0.7, 0, tgt.z + 0.4)
    etat.clingerNpc.mesh.lookAt(tgt.x, 0, tgt.z)
  } else if (etat.clingerNpc && now >= etat.clingerUntil) {
    etat.clingerNpc = null
  }
}

export { SNIPER_FOV, SCOPE_FOV, setupSniper, sniperFrame, sniperShoot, triggerAbility, applyAbilityLocal, updateClinger }
