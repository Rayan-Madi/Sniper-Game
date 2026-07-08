import * as THREE from 'three'
import { scene } from './scene.js'
import { spawnCharacter, animateRig } from './characters.js'
import { getObstacles } from './maps.js'

// Collision XZ contre les obstacles de la map (rayon PNJ ~0.35)
function blocked(x, z, r = 0.35) {
  for (const o of getObstacles()) {
    if (x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r) return true
  }
  return false
}

export const STATES = {
  WALK: 'walk', IDLE: 'idle', SCRATCH: 'scratch',
  PHONE: 'phone', TALK: 'talk', REACT: 'react',
  ALERT: 'alert', FLEE: 'flee', DANCE: 'dance'
}

// État → clip d'animation (modèles .glb, jeu de 20 clips standardisés)
// IMPORTANT : le clip "Talk" est en réalité une pose ASSISE (hanches ~0.4m plus
// basses que debout, mesuré sur tous les modèles) — probablement prévu pour un
// dialogue de cinématique avec chaise/table, pas pour un PNJ debout au sol.
// Utilisé tel quel sur un PNJ debout, ça donne l'effet "assis dans le vide".
// "Wave" a des hanches quasi identiques à "Idle" (écart <0.01) → remplaçant sûr.
const STATE_CLIPS = {
  walk: 'Walk', flee: 'Run', idle: 'Idle', scratch: 'Look',
  phone: 'Wave', talk: 'Wave', react: 'Crouch', alert: 'Threaten', dance: 'Dance',
}

// Éclaircit une couleur hex (0..1)
function lighten(hex, amt) {
  const c = new THREE.Color(hex)
  c.r = Math.min(1, c.r + amt); c.g = Math.min(1, c.g + amt); c.b = Math.min(1, c.b + amt)
  return c.getHex()
}

// ─── Modèle humanoïde articulé (capsules + sphères, vraies articulations) ──
// Les handles userData (legL, legR, armL, armR, head) sont des GROUPES-pivots
// placés aux articulations → l'animation existante (rotation.x/.z) reste compatible.
function makePerson(color, isTarget, isGuard, opts = {}) {
  const group = new THREE.Group()
  const std = (c, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.05 })
  const bodyMat = std(color)
  const skinMat = std(isGuard ? 0x9a8a6a : 0xe8b880, 0.7)
  const hairMat = std(isGuard ? 0x223322 : 0x2a1d12, 0.9)
  const pantMat = std(isGuard ? 0x2a3a2a : 0x33384a)
  const shoeMat = std(0x161616, 0.5)

  // Teinte plus claire pour la veste (deux-tons), ceinture sombre
  const jacketMat = std(isGuard ? 0x223322 : lighten(color, 0.12))
  const beltMat   = std(0x1a1712, 0.6)

  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10)
  const limb = (geo, mat, py = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = py; m.castShadow = true; m.receiveShadow = true; return m }

  // TRONC — bassin, ceinture, torse effilé, col
  group.add(limb(cap(0.18, 0.1), pantMat, 0.9))         // bassin
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), beltMat)
  belt.position.y = 1.0; belt.castShadow = true; group.add(belt)
  group.add(limb(cap(0.21, 0.34), jacketMat, 1.22))     // torse (veste)
  const shoulders = limb(cap(0.11, 0.36), jacketMat, 1.44)
  shoulders.rotation.z = Math.PI / 2; group.add(shoulders)
  // col
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.1, 12), jacketMat)
  collar.position.y = 1.52; collar.castShadow = true; group.add(collar)

  // COU + TÊTE (pivot au cou)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.12, 8), skinMat)
  neck.position.y = 1.56; group.add(neck)
  const headPivot = new THREE.Group(); headPivot.position.y = 1.62; group.add(headPivot)
  // tête légèrement ovale
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 14), skinMat)
  head.scale.set(0.95, 1.08, 1); head.position.y = 0.14; head.castShadow = true; headPivot.add(head)
  // cheveux (calotte) + petite mèche
  const hairm = new THREE.Mesh(new THREE.SphereGeometry(0.182, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat)
  hairm.scale.set(0.95, 1.08, 1); hairm.position.y = 0.16; headPivot.add(hairm)
  // oreilles
  for (const sx of [-0.17, 0.17]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), skinMat)
    ear.position.set(sx, 0.13, 0); headPivot.add(ear)
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 6), skinMat)
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.12, 0.17); headPivot.add(nose)
  for (const sx of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), new THREE.MeshBasicMaterial({ color: 0x15110d }))
    eye.position.set(sx, 0.17, 0.15); headPivot.add(eye)
  }
  group.userData.head = headPivot

  // BRAS (épaule → coude → avant-bras → main)
  function makeArm(sx) {
    const sh = new THREE.Group(); sh.position.set(sx, 1.44, 0); group.add(sh)
    sh.add(limb(cap(0.062, 0.22), jacketMat, -0.17))
    const elbow = new THREE.Group(); elbow.position.y = -0.34; sh.add(elbow)
    elbow.add(limb(cap(0.052, 0.2), jacketMat, -0.15))
    // main : paume + pouce esquissé
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 8), skinMat)
    hand.scale.set(1, 1.15, 0.7); hand.position.y = -0.3; hand.castShadow = true; elbow.add(hand)
    return { sh, hand }
  }
  const aL = makeArm(-0.26), aR = makeArm(0.26)
  group.userData.armL = aL.sh; group.userData.armR = aR.sh
  group.userData.handL = aL.hand; group.userData.handR = aR.hand

  // JAMBES (hanche → genou → pied)
  function makeLeg(hx) {
    const hip = new THREE.Group(); hip.position.set(hx, 0.95, 0); group.add(hip)
    hip.add(limb(cap(0.08, 0.24), pantMat, -0.22))
    const knee = new THREE.Group(); knee.position.y = -0.46; hip.add(knee)
    knee.add(limb(cap(0.07, 0.22), pantMat, -0.2))
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.26), shoeMat)
    foot.position.set(0, -0.42, 0.07); foot.castShadow = true; knee.add(foot)
    return hip
  }
  group.userData.legL = makeLeg(-0.1)
  group.userData.legR = makeLeg(0.1)

  // Gardes : gilet, casque, fusil
  if (isGuard) {
    const vest = limb(cap(0.21, 0.3), std(0x1a2a1a), 1.2); group.add(vest)
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), std(0x2a3a2a))
    helmet.position.y = 0.2; headPivot.add(helmet)
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), std(0x141414, 0.4))
    rifle.position.set(0, -0.2, 0.2); aR.hand.add(rifle)   // fusil tenu en main
    group.userData.rifle = rifle
  }

  // Variante FEMME : épaules affinées, hanches marquées, cheveux longs + queue de cheval
  if (opts.female) {
    shoulders.scale.x = 0.82
    // hanches plus larges
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.06, 4, 10), pantMat)
    hips.position.y = 0.92; hips.castShadow = true; group.add(hips)
    // chevelure longue
    const longHair = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.22, 4, 10), hairMat)
    longHair.position.set(0, 0.02, -0.1); headPivot.add(longHair)
    // queue de cheval
    const pony = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.26, 4, 8), hairMat)
    pony.position.set(0, -0.05, -0.18); pony.rotation.x = 0.5; headPivot.add(pony)
    // lèvres (touche de couleur)
    const lips = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), new THREE.MeshStandardMaterial({ color: 0xaa3344 }))
    lips.position.set(0, 0.06, 0.165); headPivot.add(lips)
  }

  // Chapeau (indice visuel pour la cible à identifier)
  if (opts.hat) {
    const hm = std(opts.hat, 0.6)
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 14), hm)
    brim.position.y = 0.32; headPivot.add(brim)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.2, 14), hm)
    top.position.y = 0.43; headPivot.add(top)
  }

  // Marqueur cible (sauf si masqué — cible à débusquer)
  if (isTarget && !opts.hideMarker) addMarker(group)

  return group
}

// Marqueur cible (cône + anneau pulsant) — réutilisable (procédural ou .glb)
function addMarker(group) {
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }))
  marker.position.y = 2.35; marker.rotation.x = Math.PI
  group.add(marker); group.userData.marker = marker

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.6 }))
  ring.position.y = 2.2; ring.rotation.x = Math.PI / 2
  group.add(ring); group.userData.ring = ring
}

export class NPC {
  constructor({ isTarget = false, isGuard = false, isCivilian = false, color, x, z, levelData, bounds, fleeSideways = false, hideMarker = false, hat = 0, lockState = null, female = false, modelType = null, partyMode = false, onPhone = false }) {
    this.isTarget   = isTarget
    this.isGuard    = isGuard
    this.isCivilian = isCivilian
    this.fleeSideways = fleeSideways
    this.lockState  = lockState   // bloque le PNJ dans un état (ex: téléphone)
    this.onPhone    = onPhone     // commanditaire : assis, en pleine négociation au téléphone
    this.alive      = true
    this.levelData  = levelData
    this.bounds     = bounds || { minX: -12, maxX: 12, minZ: -15, maxZ: 15 }

    // Modèle 3D importé (.glb) si configuré, sinon modèle procédural.
    // La cible "à identifier" (chapeau + marqueur masqué, niveau 6) reste
    // procédurale pour que les indices visuels (costume clair, chapeau) collent.
    // Modèle .glb. modelType permet de forcer un pool (ex : la cible cachée
    // du niveau final utilise le pool CIVIL pour se fondre dans la foule).
    this.partyMode = partyMode
    const type = modelType || (isTarget ? 'target' : isGuard ? 'guard' : 'civilian')
    this.character = spawnCharacter(type)
    if (this.character) {
      this.mesh = new THREE.Group()
      this.mesh.add(this.character.model)
      this.mixer = this.character.mixer
      this._clip = null
      this._playClip('idle')
      if (isTarget && !hideMarker) addMarker(this.mesh)   // marqueur au-dessus du modèle
      if (onPhone) this._addPhoneProp()
    } else {
      this.mesh = makePerson(color, isTarget, isGuard, { hideMarker, hat, female })
    }
    this.mesh.position.set(x, 0, z)
    scene.add(this.mesh)

    this.state        = lockState || STATES.WALK
    this.stateTimer   = 0
    this.walkDir      = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
    this.fleeDir      = new THREE.Vector3()
    this.animT        = Math.random() * Math.PI * 2
    this.ringPulse    = 0
    this.onVehicle    = false   // cible à bord d'un véhicule (position gérée par main.js)

    this.speed        = isGuard ? (levelData?.guardSpeed || 0.4) : (levelData?.targetSpeed || 0.5)
    this.stateInterval = this._pickInterval()
  }

  _pickInterval() {
    return this.isTarget && this.levelData?.unpredictable
      ? 1.2 + Math.random() * 2
      : 2.5 + Math.random() * 5
  }

  update(dt) {
    if (!this.alive) {
      // laisse l'animation de mort se jouer jusqu'au bout
      if (this.mixer && this.deathTimer > 0) { this.deathTimer -= dt; this.mixer.update(dt) }
      return
    }
    this.stateTimer += dt
    this.animT      += dt

    // Pulse du marqueur cible
    if (this.mesh.userData.ring) {
      this.ringPulse += dt * 2
      const s = 1 + Math.sin(this.ringPulse) * 0.3
      this.mesh.userData.ring.scale.setScalar(s)
      this.mesh.userData.ring.material.opacity = 0.4 + Math.sin(this.ringPulse) * 0.3
    }

    // À bord d'un véhicule : la position est gérée par main.js, on ne bouge pas seul
    if (this.onVehicle) {
      // Assis dans le véhicule (clip Sit) — jamais de T-pose
      if (this.mixer) { this.mixer.update(dt); this._playClip('Sit') }
      else if (this.mesh.userData.head) {
        this.mesh.userData.head.rotation.z = Math.sin(this.animT * 8) * 0.06
      }
      return
    }

    const reactDur  = 3
    const alertDur  = 4

    // FLEE : ne s'arrête JAMAIS seul — checkFledTargets() dans main.js gère la sortie du FOV
    if (this.state === STATES.REACT && this.stateTimer > reactDur) this._changeState()
    else if (this.state === STATES.ALERT && this.stateTimer > alertDur) this._changeState()
    else if (![STATES.FLEE, STATES.REACT, STATES.ALERT].includes(this.state) && this.stateTimer > this.stateInterval) {
      this._changeState()
    }

    // Modèle .glb : chaque état joue SON clip (Walk, Run, Talk, Dance, Crouch…)
    if (this.character) {
      const moving = this.state === STATES.WALK || this.state === STATES.FLEE
      if (this.character.firstAction) {
        this.mixer.update(dt)
        // Le commanditaire reste ASSIS en négociation (clip Talk = pose assise
        // qui gesticule) — jamais le 'coucou' du Wave, jamais la danse.
        this._playClip(this.onPhone ? 'Talk' : (STATE_CLIPS[this.state] || 'Idle'))
      } else if (this.character.rig) {
        this.mixer.update(dt)
        animateRig(this.character.rig, moving, this.animT, this.character.cfg.bendAxis || 'x')
      }
    } else {
      this._animate()
    }
    this._move(dt)
  }

  // Téléphone porté à l'oreille. On l'accroche à l'os de la main droite si on
  // le trouve (il suit alors le geste), sinon on le fige près de l'oreille.
  _addPhoneProp() {
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x2a4a7a, emissiveIntensity: 0.5, roughness: 0.4 }))
    let handBone = null
    this.character.model.traverse(o => {
      const n = (o.name || '').toLowerCase()
      if (!handBone && o.isBone && n.includes('hand') && (n.includes('r') || n.includes('right'))) handBone = o
    })
    if (handBone) {
      phone.position.set(0.02, 0.04, 0.02)
      handBone.add(phone)
    } else {
      // Repli : près de l'oreille droite, à hauteur de tête assise
      phone.position.set(0.16, 1.2, 0.1); phone.rotation.x = 0.3
      this.mesh.add(phone)
    }
  }

  // Crossfade vers un clip nommé (mappé via cfg.anims). Sans correspondance, ne fait rien.
  _playClip(name) {
    if (!this.character) return
    // nom direct (Sit, Dance…), sinon mapping cfg.anims, sinon 1re animation
    const acts = this.character.actions
    const action = acts[name] || acts[this.character.cfg.anims?.[name]] || this.character.firstAction
    if (!action || this._clip === action) return
    if (this._clip) this._clip.fadeOut(0.25)
    action.reset().fadeIn(0.25).play()
    this._clip = action
  }

  _changeState() {
    this.stateTimer    = 0
    this.stateInterval = this._pickInterval()
    // Cible verrouillée sur un comportement (ex: toujours au téléphone)
    if (this.lockState) { this.state = this.lockState; return }
    const r = Math.random()
    if (this.partyMode && this.isCivilian) {
      // À la fête : on danse, on discute, on bouge peu
      if (r < 0.55)      this.state = STATES.DANCE
      else if (r < 0.72) this.state = STATES.TALK
      else if (r < 0.85) this.state = STATES.IDLE
      else               this.state = STATES.WALK
    } else if (this.isGuard) {
      this.state = r < 0.55 ? STATES.WALK : STATES.IDLE
    } else {
      if (r < 0.40)      this.state = STATES.WALK
      else if (r < 0.58) this.state = STATES.IDLE
      else if (r < 0.72) this.state = STATES.SCRATCH
      else if (r < 0.86) this.state = STATES.PHONE
      else               this.state = STATES.TALK
    }
    if (this.state === STATES.WALK) {
      this.walkDir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
    }
  }

  // Fuit dans la direction opposée au tir
  flee(shotPos) {
    if (this.onVehicle) return   // une cible en voiture ne fuit pas à pied
    this.state      = STATES.FLEE
    this.stateTimer = 0

    if (this.fleeSideways) {
      // Appartement : on court vers la sortie latérale la plus proche (±X)
      const dirX = this.mesh.position.x >= 0 ? 1 : -1
      this.fleeDir.set(dirX, 0, 0)
      return
    }

    this.fleeDir = new THREE.Vector3()
      .subVectors(this.mesh.position, shotPos)
      .setY(0)
      .normalize()
    // Si trop proche retourne sur lui-même → fuit dans direction aléatoire
    if (this.fleeDir.length() < 0.01) {
      this.fleeDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize()
    }
  }

  react(shotPos) {
    if (this.state === STATES.FLEE) return  // fuir > réagir
    this.state      = STATES.REACT
    this.stateTimer = 0
    const dir = new THREE.Vector3().subVectors(shotPos, this.mesh.position).setY(0)
    if (dir.length() > 0.01) {
      this.mesh.rotation.y = Math.atan2(dir.x, dir.z)
    }
  }

  alertReact(camPos) {
    this.state      = STATES.ALERT
    this.stateTimer = 0
    const dir = new THREE.Vector3().subVectors(camPos, this.mesh.position).setY(0)
    if (dir.length() > 0.01) {
      this.mesh.rotation.y = Math.atan2(dir.x, dir.z)
    }
  }

  _animate() {
    const { legL, legR, armL, armR, head, handL, handR } = this.mesh.userData
    const t = this.animT

    const reset = () => {
      legL.rotation.x = 0; legR.rotation.x = 0
      armL.rotation.x = 0; armR.rotation.x = 0
      armL.rotation.z = 0; armR.rotation.z = 0
      head.rotation.x = 0; head.rotation.y = 0; head.rotation.z = 0
    }

    if (this.state === STATES.WALK) {
      const s = Math.sin(t * 6) * 0.45
      legL.rotation.x =  s; legR.rotation.x = -s
      armL.rotation.x = -s * 0.5; armR.rotation.x = s * 0.5
      head.rotation.y = Math.sin(t * 2) * 0.05

    } else if (this.state === STATES.FLEE) {
      // Course paniquée — mouvement amplifié + tête regardant derrière
      const s = Math.sin(t * 9) * 0.7
      legL.rotation.x =  s; legR.rotation.x = -s
      armL.rotation.x = -s * 0.8; armR.rotation.x = s * 0.8
      head.rotation.x = -0.2
      head.rotation.y = Math.sin(t * 3) * 0.3 + 0.5  // regarde derrière

    } else if (this.state === STATES.REACT) {
      reset()
      // Se baisse, couvre la tête
      legL.rotation.x = -0.35; legR.rotation.x = -0.35
      armL.rotation.x = -1.6; armR.rotation.x = -1.6
      armL.rotation.z = 0.3;  armR.rotation.z = -0.3
      head.rotation.x = 0.3
      head.rotation.z = Math.sin(t * 8) * 0.08  // légère panique

    } else if (this.state === STATES.ALERT) {
      reset()
      head.rotation.y = Math.sin(t * 1.8) * 0.7
      armR.rotation.x = -0.9
      armR.rotation.z = -0.5

    } else if (this.state === STATES.SCRATCH) {
      reset()
      armR.rotation.x = -1.2 + Math.sin(t * 8) * 0.12
      armR.rotation.z = 0.4
      head.rotation.z = Math.sin(t * 3) * 0.06

    } else if (this.state === STATES.PHONE) {
      reset()
      armR.rotation.x = -1.1
      armR.rotation.z = 0.3
      head.rotation.x = -0.2
      head.rotation.y = Math.sin(t * 0.8) * 0.08

    } else if (this.state === STATES.TALK) {
      reset()
      armL.rotation.x = -0.3 + Math.sin(t * 3) * 0.2
      armL.rotation.z = -0.35
      head.rotation.y = Math.sin(t * 1.5) * 0.18

    } else if (this.state === STATES.DANCE) {
      reset()
      armL.rotation.x = -2.4 + Math.sin(t * 5) * 0.5
      armR.rotation.x = -2.4 + Math.sin(t * 5 + Math.PI) * 0.5
      head.rotation.z = Math.sin(t * 5) * 0.12

    } else {
      reset()
    }
  }

  _move(dt) {
    const pos = this.mesh.position

    if (this.state === STATES.FLEE) {
      // Vitesse de fuite très élevée — sort du champ de vision rapidement
      const spd = this.speed * 8.0 * dt
      // Contourne les bâtiments : si le chemin est bloqué, dévie à 90°
      const wasInside = blocked(pos.x, pos.z)
      if (!wasInside && blocked(pos.x + this.fleeDir.x * spd * 4, pos.z + this.fleeDir.z * spd * 4)) {
        const fx = this.fleeDir.x
        this.fleeDir.x = -this.fleeDir.z
        this.fleeDir.z = fx
      }
      pos.x += this.fleeDir.x * spd
      pos.z += this.fleeDir.z * spd
      this.mesh.rotation.y = Math.atan2(this.fleeDir.x, this.fleeDir.z)

      // Animation sprint — jambes et bras très rapides
      const t = this.animT * 14
      if (this.mesh.userData.legL) {
        this.mesh.userData.legL.rotation.x = Math.sin(t) * 1.0
        this.mesh.userData.legR.rotation.x = Math.sin(t + Math.PI) * 1.0
        this.mesh.userData.armL.rotation.x = Math.sin(t + Math.PI) * 0.9
        this.mesh.userData.armR.rotation.x = Math.sin(t) * 0.9
        // Tête regarde en arrière (vers celui qui tire)
        if (this.mesh.userData.head) {
          this.mesh.userData.head.rotation.y = Math.PI
        }
      }
      return
    }

    if (this.state !== STATES.WALK) return

    const spd = this.speed * dt
    const nx = pos.x + this.walkDir.x * spd
    const nz = pos.z + this.walkDir.z * spd

    if (nx < this.bounds.minX || nx > this.bounds.maxX) this.walkDir.x *= -1
    if (nz < this.bounds.minZ || nz > this.bounds.maxZ) this.walkDir.z *= -1

    // Collision bâtiments/obstacles : fait demi-tour sur l'axe bloqué
    // (si déjà à l'intérieur — spawn malchanceux — on laisse sortir)
    if (!blocked(pos.x, pos.z)) {
      if (blocked(pos.x + this.walkDir.x * spd * 3, pos.z)) this.walkDir.x *= -1
      if (blocked(pos.x, pos.z + this.walkDir.z * spd * 3)) this.walkDir.z *= -1
    }

    pos.x += this.walkDir.x * spd
    pos.z += this.walkDir.z * spd

    if (this.walkDir.length() > 0) {
      this.mesh.rotation.y = Math.atan2(this.walkDir.x, this.walkDir.z)
    }
  }

  getHeadPosition() {
    return this.mesh.position.clone().setY(this.mesh.position.y + 1.68)
  }

  getBounds() {
    const wp = new THREE.Vector3()
    this.mesh.getWorldPosition(wp)
    return {
      // Centre au milieu du corps (y+1 = torse)
      center: new THREE.Vector3(wp.x, wp.y + 1.0, wp.z),
      // Boîte généreuse : 0.8×2.0×0.8 — visible même vue de dessus
      size:   new THREE.Vector3(0.80, 2.0, 0.80),
    }
  }

  isStill() {
    return ![STATES.WALK, STATES.FLEE].includes(this.state)
  }

  detectsShooter(camPos) {
    if (!this.isGuard || !this.alive) return false
    const toShooter = new THREE.Vector3().subVectors(camPos, this.mesh.position)
    const dist = toShooter.length()
    if (dist > 55) return false
    toShooter.normalize()
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(this.mesh.rotation)
    const angle = Math.acos(Math.max(-1, Math.min(1, toShooter.dot(fwd)))) * (180 / Math.PI)
    return angle < (this.levelData?.guardFOV || 70) / 2
  }

  die() {
    this.alive = false
    // Modèle .glb : joue l'animation de mort (bien plus stylé qu'une bascule)
    const deathAct = this.character && this.character.actions['Death']
    if (deathAct) {
      if (this._clip) this._clip.fadeOut(0.12)
      deathAct.reset()
      deathAct.setLoop(THREE.LoopOnce)
      deathAct.clampWhenFinished = true
      deathAct.fadeIn(0.08).play()
      this._clip = deathAct
      this.deathTimer = 3.5   // temps laissé au clip pour se jouer (update le gère)
    } else {
      this.mesh.rotation.x = Math.PI / 2
      this.mesh.position.y = 0.2
    }
    if (this.mesh.userData.marker) this.mesh.userData.marker.visible = false
    if (this.mesh.userData.ring)   this.mesh.userData.ring.visible = false
    setTimeout(() => scene.remove(this.mesh), 8000)
  }
}
