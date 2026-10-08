import * as THREE from 'three'
import { scene, camera, renderer } from './scene.js'
import { buildPvpArena, clearPvpMap, getPvpColliders } from './pvpMap.js'
import { MAP_BUILDERS } from './maps.js'
import { spawnCharacter } from './characters.js'
import { NPC, STATES, npcShadowMode } from './npc.js'
import { playPvpIntro, isPvpIntroActive, stopPvpIntro } from './pvpIntro.js'
import * as net from './net.js'
import { groundForward, groundRight } from './pvpMath.js'
import { sensMultiplier, invertY, settings } from './settings.js'
import { setCampaignPaused } from './main.js'
import { audioContext, masterNode } from './audio.js'
import { disposeObject } from './gfx/dispose.js'
import { npcCastsShadow } from './gfx/quality.js'

// ─── Mode PvP : Sniper vs Contre-tueur ───────────────────────────────
// Réseau : relais WebSocket pur (voir net.js + server/index.js). Chaque
// client calcule sa propre visée/collision et l'annonce à l'autre —
// modèle "confiance au client", très bien pour un 1v1 non compétitif.

// ── DOM ───────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id)
const menuEl = () => el('menu')
const mpMenu = el('mp-menu'), mpCreate = el('mp-create'), mpJoin = el('mp-join'), mpResult = el('mp-result')
const mpHud = el('mp-hud')
const codeDisplay = el('mp-code-display'), createStatus = el('mp-create-status')
const joinInput = el('mp-join-input'), joinError = el('mp-join-error')
const roleBanner = el('mp-role-banner'), timerEl = el('mp-timer')
const partsEl = el('mp-parts'), abilitiesEl = el('mp-abilities'), crosshairEl = el('mp-crosshair')
const killfeedEl = el('mp-killfeed'), scoreEl = el('mp-score')
const resultTitle = el('mp-result-title'), resultDetail = el('mp-result-detail')
const rematchBtn = el('btn-mp-rematch')

// ── État de session ─────────────────────────────────────────────────
let myRole = null           // 'sniper' | 'pnj'
let matchEndAt = 0
let roundStartAt = 0        // instant où la manche devient active (déblocage capacités)
let roundActive = false
let rafHandle = null
let clock = new THREE.Clock()
let myPoints = 0, oppPoints = 0
let arena = null
let crowd = []
let clingerNpc = null, clingerUntil = 0
let phoneShakeUntil = 0, alarmUntil = 0
let crowdPanicUntil = 0     // la foule fuit (alarme du sniper)
let speedMultiplier = 1

// Sniper
let sniperYaw = 0, sniperPitch = 0
let laserCore = null, laserGlow = null
const abilityCooldowns = { phone: 0, cling: 0, alarm: 0 }
const ABILITY_CD = 45000
// Déblocage progressif : téléphone dès le départ, PNJ collant à 1 min, alarme à 2 min.
const ABILITY_UNLOCK = { phone: 0, cling: 60000, alarm: 120000 }
const SNIPER_FOV = 74     // vue d'ensemble (hanche)
const SCOPE_FOV = 20      // œil dans la lunette (clic droit maintenu)
let sniperScoped = false

// PNJ
let avatar = null            // { model, mixer, actions, group }
let pnjPos = new THREE.Vector3()
let pnjYaw = 0, pnjPitch = 0
let partsCollected = 0
let oppPartsCount = 0   // pièces prises par l'adversaire (compteur côté sniper, sans localisation)
let pistolMesh = null
let lastPosSent = 0
let emoteUntil = 0   // le contre-tueur émote (danse/salue) pour se fondre dans la foule
let pnjAiming = false // le contre-tueur vise au pistolet (clic droit, une fois armé)

// Sniper : dernière position/orientation/anim du PNJ (reçues par réseau) +
// avatar de l'adversaire rendu chez le sniper (sinon il n'a personne à viser).
let lastPnjNet = null   // THREE.Vector3 | null
let lastPnjYaw = Math.PI
let lastPnjAnim = 'idle'
let oppAvatar = null

// Seed partagé (serverTime) : garantit que LES DEUX joueurs génèrent la MÊME
// scène (décor, foule, modèle de l'avatar) — sans ça chaque client tire son
// aléatoire dans son coin et voit une fête différente de l'autre.
let matchSeed = 1
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
// Exécute fn avec Math.random remplacé par un générateur déterministe (seed),
// puis restaure Math.random. Les deux clients → séquences identiques.
function withSeed(seed, fn) {
  const orig = Math.random
  Math.random = mulberry32(seed >>> 0)
  try { return fn() } finally { Math.random = orig }
}
const SEED_CROWD = 0x1b873593, SEED_AVATAR = 0x85ebca6b

// ─── Petits sons synthétiques ───────────────────────────────────────
// Sur le contexte audio commun (audio.js) et branchés sur son maître : un seul AudioContext pour tout le jeu, et le
// volume des Paramètres s'applique au PvP. Le PvP avait son propre contexte, branché sur sa propre sortie : il
// ignorait le volume et n'était jamais fermé.
function ctx() {
  const c = audioContext()
  if (c.state === 'suspended') c.resume()
  return c
}
function beep(freq, dur, type = 'sine', gain = 0.3, delay = 0) {
  const c = ctx(), o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.value = freq
  o.connect(g); g.connect(masterNode())
  g.gain.setValueAtTime(0.0001, c.currentTime + delay)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur)
  o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.02)
}
function playRingtone() { for (let i = 0; i < 4; i++) { beep(1200, 0.18, 'square', 0.25, i * 0.4); beep(950, 0.18, 'square', 0.2, i * 0.4 + 0.2) } }
function playAlarmSound() { for (let i = 0; i < 6; i++) beep(i % 2 === 0 ? 900 : 600, 0.22, 'sawtooth', 0.28, i * 0.25) }
function playGunshot() { beep(90, 0.18, 'sawtooth', 0.5); beep(240, 0.05, 'square', 0.3) }
function playHitmarker() { beep(1500, 0.08, 'square', 0.3); beep(2000, 0.06, 'square', 0.2, 0.05) }

// Position d'un son dans l'espace, par rapport à la caméra : renvoie un
// panoramique gauche/droite [-1,1] et un gain atténué par la distance. Sert
// à faire "sonner" le téléphone DEPUIS la position du contre-tueur.
function spatialFrom(worldPos) {
  const rel = worldPos.clone().sub(camera.position)
  const dist = rel.length()
  const right = new THREE.Vector3(); camera.getWorldDirection(right)
  right.crossVectors(right, camera.up).normalize()   // vecteur "droite" caméra
  const pan = Math.max(-1, Math.min(1, rel.clone().normalize().dot(right)))
  const gain = Math.max(0.12, Math.min(1, 8 / (dist + 4)))
  return { pan, gain }
}
// Sonnerie de téléphone positionnée à worldPos (panoramique + volume distance).
function positionalRingtone(worldPos) {
  const { pan, gain } = spatialFrom(worldPos)
  const c = ctx()
  const panner = c.createStereoPanner ? c.createStereoPanner() : null
  const bus = c.createGain(); bus.gain.value = gain
  if (panner) { panner.pan.value = pan; bus.connect(panner); panner.connect(masterNode()) }
  else bus.connect(masterNode())
  const ring = (freq, dur, delay) => {
    const o = c.createOscillator(), g = c.createGain()
    o.type = 'square'; o.frequency.value = freq; o.connect(g); g.connect(bus)
    g.gain.setValueAtTime(0.0001, c.currentTime + delay)
    g.gain.linearRampToValueAtTime(0.28, c.currentTime + delay + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur)
    o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.02)
  }
  for (let i = 0; i < 4; i++) { ring(1200, 0.18, i * 0.4); ring(950, 0.18, i * 0.4 + 0.2) }
}

// ─── Ambiance de fête (musique + brouhaha en boucle) ─────────────────
let ambienceTimer = null, ambienceNodes = null, ambienceStep = 0
function startPvpAmbience() {
  stopPvpAmbience()
  const c = ctx()
  const master = c.createGain(); master.gain.value = 0.5; master.connect(masterNode())
  // Brouhaha de foule : bruit filtré passe-bas, continu et discret
  const bufferSize = 2 * c.sampleRate
  const noiseBuf = c.createBuffer(1, bufferSize, c.sampleRate)
  const data = noiseBuf.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5
  const noise = c.createBufferSource(); noise.buffer = noiseBuf; noise.loop = true
  const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 500
  const ng = c.createGain(); ng.gain.value = 0.06
  noise.connect(nf); nf.connect(ng); ng.connect(master); noise.start()
  ambienceNodes = { master, noise }
  // Musique : kick 4/4 + basse qui tourne (rythme de fête)
  const bass = [55, 55, 82.4, 65.4]
  ambienceStep = 0
  ambienceTimer = setInterval(() => {
    const t = c.currentTime
    // kick
    const ko = c.createOscillator(), kg = c.createGain()
    ko.frequency.setValueAtTime(140, t); ko.frequency.exponentialRampToValueAtTime(48, t + 0.12)
    kg.gain.setValueAtTime(0.5, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    ko.connect(kg); kg.connect(master); ko.start(t); ko.stop(t + 0.2)
    // basse (une note sur deux pas)
    if (ambienceStep % 2 === 0) {
      const bo = c.createOscillator(), bg = c.createGain()
      bo.type = 'sawtooth'; bo.frequency.value = bass[(ambienceStep / 2) % bass.length]
      bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.12, t + 0.03)
      bg.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      bo.connect(bg); bg.connect(master); bo.start(t); bo.stop(t + 0.4)
    }
    // charley (hi-hat) sur le contretemps
    if (ambienceStep % 2 === 1) {
      const ho = c.createOscillator(), hg = c.createGain(), hf = c.createBiquadFilter()
      hf.type = 'highpass'; hf.frequency.value = 7000; ho.type = 'square'; ho.frequency.value = 8000
      hg.gain.setValueAtTime(0.08, t); hg.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
      ho.connect(hf); hf.connect(hg); hg.connect(master); ho.start(t); ho.stop(t + 0.06)
    }
    ambienceStep++
  }, 300)
}
function stopPvpAmbience() {
  if (ambienceTimer) { clearInterval(ambienceTimer); ambienceTimer = null }
  if (ambienceNodes) {
    try { ambienceNodes.noise.stop() } catch (e) {}
    try { ambienceNodes.master.disconnect() } catch (e) {}
    ambienceNodes = null
  }
}

// ─── Navigation entre écrans ─────────────────────────────────────────
function hideAllMpScreens() {
  for (const s of [mpMenu, mpCreate, mpJoin, mpResult]) s.style.display = 'none'
}

export function initMultiplayerMenu() {
  // ── Handlers réseau : enregistrés UNE SEULE FOIS (ils survivent aux
  // reconnexions — voir net.js disconnect qui ne vide plus les listeners)
  net.on('created', (msg) => {
    codeDisplay.textContent = msg.room
    createStatus.textContent = "En attente d'un adversaire…"
  })
  net.on('joined', () => { joinError.textContent = 'Connecté. En attente du démarrage…' })
  net.on('error', (msg) => { joinError.textContent = msg.message || 'Erreur.' })
  net.on('start', onMatchStart)   // le serveur renvoie aussi 'start' après une revanche votée à 2
  // L'adversaire est parti, ou c'est notre liaison au relais qui a lâché :
  // dans les deux cas la manche ne peut plus continuer. Un seul écran de fin
  // (endRound ne fait rien si la manche est déjà close).
  const onPeerLost = (reason) => {
    if (isPvpIntroActive()) { stopPvpIntro(); roundActive = true /* pour laisser endRound nettoyer normalement */ }
    if (roundActive) endRound(null, reason)
  }
  // Départ de l'adversaire sur l'écran de fin : le relais a fermé la partie, la manche suivante ne viendra plus.
  net.on('peer_left', () => {
    if (roundActive || isPvpIntroActive()) return onPeerLost('peer_left')
    if (mpResult.style.display === 'flex') { rematchBtn.disabled = true; rematchBtn.textContent = 'ADVERSAIRE PARTI.' }
  })
  // Relais perdu hors manche : l'attente en cours (partie créée, partie rejointe, manche suivante) ne peut plus
  // aboutir. Un message la remplace ; ANNULER et QUITTER restent utilisables.
  net.on('disconnected', () => {
    if (roundActive || isPvpIntroActive()) return onPeerLost('disconnected')
    if (mpCreate.style.display === 'flex') { codeDisplay.textContent = '----'; createStatus.textContent = 'Relais perdu.' }
    if (mpJoin.style.display === 'flex') joinError.textContent = 'Relais perdu.'
    if (mpResult.style.display === 'flex') { rematchBtn.disabled = true; rematchBtn.textContent = 'RELAIS PERDU.' }
  })
  net.on('ability', (msg) => applyIncomingAbility(msg.kind))
  net.on('part_pickup', (msg) => removePartVisual(msg.idx))
  net.on('aim', (msg) => { sniperYaw = msg.yaw; sniperPitch = msg.pitch })
  net.on('pos', (msg) => {
    if (!lastPnjNet) lastPnjNet = new THREE.Vector3()
    lastPnjNet.set(msg.x, msg.y, msg.z)
    if (msg.yaw !== undefined) lastPnjYaw = msg.yaw
    lastPnjAnim = msg.anim || 'idle'
  })
  net.on('hit_pnj', () => { if (roundActive) endRound('sniper', 'hit') })
  net.on('hit_sniper', () => { if (roundActive) endRound('pnj', 'hit') })
  net.on('hit_civilian', () => { if (roundActive) endRound('pnj', 'civilian') })

  // ── Boutons ──
  el('btn-multiplayer').onclick = () => {
    menuEl().style.display = 'none'
    hideAllMpScreens()
    mpMenu.style.display = 'flex'
  }
  el('btn-mp-back').onclick = () => { hideAllMpScreens(); menuEl().style.display = 'flex' }

  el('btn-mp-create').onclick = () => {
    hideAllMpScreens(); mpCreate.style.display = 'flex'
    codeDisplay.textContent = '----'
    createStatus.textContent = 'Connexion au relais…'
    net.connect(() => {
      createStatus.textContent = 'Création de la partie…'
      net.createRoom()
    }, () => {
      createStatus.textContent = 'Connexion impossible. Lance le relais : npm run pvp-server'
    })
  }
  el('btn-mp-create-cancel').onclick = () => { net.disconnect(); hideAllMpScreens(); mpMenu.style.display = 'flex' }

  el('btn-mp-join-show').onclick = () => {
    hideAllMpScreens(); mpJoin.style.display = 'flex'
    joinInput.value = ''; joinError.textContent = ''
  }
  el('btn-mp-join-cancel').onclick = () => { net.disconnect(); hideAllMpScreens(); mpMenu.style.display = 'flex' }
  el('btn-mp-join-go').onclick = () => {
    const code = joinInput.value.trim().toUpperCase()
    if (code.length !== 4) { joinError.textContent = 'Code à 4 caractères.'; return }
    joinError.textContent = 'Connexion…'
    net.connect(() => { net.joinRoom(code) }, () => { joinError.textContent = 'Impossible de se connecter au relais.' })
  }

  rematchBtn.onclick = () => { net.send({ t: 'rematch' }); rematchBtn.disabled = true; rematchBtn.textContent = 'EN ATTENTE DE L\'ADVERSAIRE…' }
  el('btn-mp-quit').onclick = quitToMenu

  el('ab-phone').onclick = () => triggerAbility('phone')
  el('ab-cling').onclick = () => triggerAbility('cling')
  el('ab-alarm').onclick = () => triggerAbility('alarm')
}

// ─── Démarrage d'une manche ──────────────────────────────────────────
function onMatchStart(msg) {
  myRole = msg.role
  hideAllMpScreens()
  rematchBtn.disabled = false; rematchBtn.textContent = 'MANCHE SUIVANTE'
  // Masque l'aide du mode histoire (le PvP a son propre HUD/killfeed)
  const instr = el('instruction'); if (instr) instr.style.display = 'none'

  setCampaignPaused(true)
  partsCollected = 0; oppPartsCount = 0
  pistolMesh = null
  emoteUntil = 0; pnjAiming = false
  clingerNpc = null; clingerUntil = 0; crowdPanicUntil = 0
  phoneShakeUntil = 0; alarmUntil = 0; speedMultiplier = 1
  for (const k in abilityCooldowns) abilityCooldowns[k] = 0
  lastPnjNet = null; lastPnjYaw = Math.PI; lastPnjAnim = 'idle'
  setScoped(false)

  // Seed partagé (même serverTime chez les deux) → décor + foule IDENTIQUES.
  matchSeed = (msg.serverTime >>> 0) || 1
  buildRoundScene(matchSeed, myRole)

  roleBanner.textContent = myRole === 'sniper' ? 'RÔLE : SNIPER' : 'RÔLE : CONTRE-TUEUR'
  partsEl.style.display = myRole === 'pnj' ? 'block' : 'none'
  abilitiesEl.style.display = myRole === 'sniper' ? 'flex' : 'none'
  crosshairEl.style.display = 'none'

  if (myRole === 'sniper') setupSniper()
  else setupPnj()

  // Cinématique d'intro (par rôle) avant de rendre la main au joueur — fait
  // voler la caméra dans l'arène déjà construite pour expliquer objectif,
  // commandes et condition de victoire.
  playPvpIntro(myRole, arena, introTick, () => {
    // Chrono calculé LOCALEMENT une fois l'intro de CE client terminée —
    // pas de perte de temps de jeu si un joueur regarde l'intro plus
    // longtemps que l'autre (cohérent avec le modèle "confiance au client").
    matchEndAt = Date.now() + 10 * 60 * 1000
    roundStartAt = performance.now()   // référence pour le déblocage des capacités
    camera.fov = myRole === 'sniper' ? SNIPER_FOV : 60
    camera.updateProjectionMatrix()
    mpHud.style.display = 'block'
    roundActive = true
    startPvpAmbience()                  // musique + brouhaha de fête
    clock.getDelta()
    if (rafHandle) cancelAnimationFrame(rafHandle)
    loop()
  })
}

// Décor d'une manche, tiré du seed partagé (le même chez les deux joueurs) : arène, foule, laser, et avatar du
// contre-tueur (le sien chez lui, celui de l'adversaire chez le sniper). onMatchStart l'appelle ; la route ?memtest=1
// de main.js aussi, pour monter des arènes hors réseau. Sans écran, caméra ni pointeur : setupSniper et setupPnj.
// Un décor encore monté (départ de manche reçu sans fin de manche) est d'abord retiré et libéré : jamais remplacé
// en place, ce qui laisserait foule, avatars et laser dans la scène, hors de portée de toute libération.
export function buildRoundScene(seed, role) {
  releaseRoundScene()
  arena = withSeed(seed, () => buildPvpArena())
  withSeed(seed ^ SEED_CROWD, () => spawnCrowd())

  // Les pièces d'arme sont INVISIBLES pour le sniper : il ne doit pas savoir où
  // elles sont ni camper les spots. (Fait au build, avant la boucle → pas de
  // recompilation de shaders en cours de partie.)
  if (role === 'sniper') for (const p of arena.partSpots) p.mesh.visible = false

  // Le laser rouge du sniper est créé pour LES DEUX joueurs : c'est la
  // mécanique centrale, le contre-tueur repère le nid grâce au trait.
  createLaser()

  // Même seed des deux côtés → le contre-tueur a la même allure chez lui et chez le sniper.
  const av = withSeed(seed ^ SEED_AVATAR, makeCivilianAvatar)
  if (role === 'sniper') oppAvatar = av
  else avatar = av
  return arena
}

// Retire le décor de la manche et libère ses ressources GPU (fin de manche, QUITTER, nouveau décor, route ?memtest=1) :
// foule (NPC.dispose), avatars et pistolet (enfant de l'avatar du contre-tueur), laser, arène. Rien des modèles GLB,
// marqués partagés au chargement (characters.js). Idempotente : sans décor monté, ne fait rien.
export function releaseRoundScene() {
  clearCrowd()
  clingerNpc = null
  releaseAvatar(avatar); avatar = null
  releaseAvatar(oppAvatar); oppAvatar = null
  pistolMesh = null
  if (laserCore) { disposeObject(laserCore); disposeObject(laserGlow); laserCore = null; laserGlow = null }
  clearPvpMap()
}

// Avatar (makeCivilianAvatar) : animation arrêtée, mixer qui oublie le clone, groupe libéré avec ce qu'il porte.
function releaseAvatar(av) {
  if (!av) return
  if (av.mixer) { av.mixer.stopAllAction(); av.mixer.uncacheRoot(av.model) }
  disposeObject(av.group)
}

// Pendant l'intro, la boucle de jeu normale ne tourne pas encore — on garde
// la foule vivante (danse) et l'avatar du contre-tueur animé au ralenti.
function introTick(dt) {
  for (const n of crowd) n.update(dt)
  if (myRole === 'pnj' && avatar && avatar.mixer) avatar.mixer.update(dt)
  if (myRole === 'sniper' && oppAvatar && oppAvatar.mixer) oppAvatar.mixer.update(dt)
}

const CROWD_SIZE = 54

function spawnCrowd() {
  crowd = []
  const dance = arena.danceFloor
  const b = arena.moveBounds
  for (let i = 0; i < CROWD_SIZE; i++) {
    let x, z
    // ~55% de la foule dense sur la piste, le reste réparti PARTOUT dans la
    // salle — jusque dans les coins (les bornes couvrent toute la pièce).
    if (dance && Math.random() < 0.55) {
      x = dance.center.x + (Math.random() * 2 - 1) * dance.radiusX
      z = dance.center.z + (Math.random() * 2 - 1) * dance.radiusZ
    } else {
      x = b.minX + Math.random() * (b.maxX - b.minX)
      z = b.minZ + Math.random() * (b.maxZ - b.minZ)
    }
    const npc = new NPC({ isCivilian: true, color: 0x888899, x, z, bounds: b, partyMode: true, female: Math.random() < 0.5 })
    npc.speed = 1.8   // marche un peu plus vive → comparable au contre-tueur (blend)
    crowd.push(npc)
  }
}

function clearCrowd() {
  for (const n of crowd) n.dispose()
  crowd = []
}

// ─── Laser rouge (partagé : rendu chez les deux joueurs) ─────────────
function createLaser() {
  const coreGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6)
  laserCore = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }))
  laserGlow = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.4 }))
  laserGlow.scale.x = laserGlow.scale.z = 2.8
  // Rendu par-dessus le décor pour rester bien lisible dans la pénombre
  laserCore.renderOrder = 999; laserGlow.renderOrder = 998
  scene.add(laserCore); scene.add(laserGlow)
}

function sniperAimDir() {
  const euler = new THREE.Euler(sniperPitch, sniperYaw, 0, 'YXZ')
  return new THREE.Vector3(0, 0, -1).applyEuler(euler)
}

function laserOrigin() {
  // Le laser part du "canon" (décalé sous l'œil) et non de la caméra : sinon,
  // pour le sniper, le trait est coaxial à son regard et se réduit à un point.
  return new THREE.Vector3(...(arena.nest.muzzlePos || arena.nest.cameraPos))
}

function updateLaser(origin, dir) {
  if (!laserCore) return
  // Raycast uniquement contre le décor statique de l'arène (pas la foule
  // skinnée : les SkinnedMesh sont très coûteux à raycaster chaque frame)
  const raycaster = new THREE.Raycaster(origin, dir, 0.1, 60)
  const hits = raycaster.intersectObjects(getPvpColliders(), true)
  const end = hits.length ? hits[0].point : origin.clone().add(dir.clone().multiplyScalar(60))
  const mid = origin.clone().add(end).multiplyScalar(0.5)
  const dist = origin.distanceTo(end)
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  for (const m of [laserCore, laserGlow]) {
    m.position.copy(mid); m.quaternion.copy(quat); m.scale.y = dist
  }
}

// Crée un avatar civil (modèle .glb cloné). Appelé sous withSeed(...) par LES
// DEUX rôles avec le même seed → le contre-tueur a exactement la même allure
// chez lui et chez le sniper (indispensable pour qu'il se fonde dans la foule).
function makeCivilianAvatar() {
  const ch = spawnCharacter('civilian')
  const group = new THREE.Group()
  if (ch) group.add(ch.model)   // ← sans ça le groupe reste VIDE = avatar invisible
  // Ombre : règle des civils, comme la foule (préréglage graphique) ; seul à en avoir une, il serait trouvé sans chercher.
  const shadow = npcCastsShadow(npcShadowMode(), 'civil')
  group.traverse(o => { if (o.isMesh && o.castShadow) o.castShadow = shadow })
  const av = ch ? { ...ch, group } : { group, mixer: null, actions: {} }
  scene.add(group)
  return av
}

// ─── Rôle SNIPER ─────────────────────────────────────────────────────
function setupSniper() {
  const [x, y, z] = arena.nest.cameraPos
  camera.position.set(x, y, z)
  // Regard par défaut fourni par la carte : avec le nid placé côté Z positif
  // et la salle côté Z négatif, la direction par défaut (0,0,-1) tombe pile
  // sur la pièce — plus besoin de deviner un yaw/pitch de secours.
  sniperYaw = 0; sniperPitch = arena.nest.defaultPitch ?? -0.2
  // FOV large : le sniper doit avoir une vue d'ensemble de toute la salle.
  camera.fov = SNIPER_FOV
  camera.updateProjectionMatrix()

  // Avatar de l'adversaire (le contre-tueur, créé par buildRoundScene) rendu chez le sniper à sa
  // position réseau — sinon le sniper n'a personne à repérer parmi la foule.
  oppAvatar.group.position.set(...arena.pnjSpawn)
  oppAvatar.group.rotation.y = Math.PI
  // Pose idle dès le départ (évite la T-pose pendant l'intro)
  if (oppAvatar.actions && oppAvatar.actions['Idle']) {
    oppAvatar.actions['Idle'].play(); oppAvatar._clip = oppAvatar.actions['Idle']
  }

  el('canvas').requestPointerLock()
}

let lastAimSent = 0
function sniperFrame(dt) {
  camera.position.set(...arena.nest.cameraPos)
  const dir = sniperAimDir()
  camera.lookAt(camera.position.clone().add(dir))
  // FOV selon l'état de visée (lunette au clic droit)
  const wantFov = sniperScoped ? SCOPE_FOV : SNIPER_FOV
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov = wantFov; camera.updateProjectionMatrix() }
  // Laser depuis le canon (décalé) pour que le sniper le voie converger vers sa visée
  updateLaser(laserOrigin(), dir)

  // Avatar de l'adversaire : suit sa position/orientation/anim réseau
  if (oppAvatar) {
    if (lastPnjNet) oppAvatar.group.position.lerp(lastPnjNet, 0.35)
    oppAvatar.group.rotation.y += (lastPnjYaw - oppAvatar.group.rotation.y) * 0.35
    if (oppAvatar.mixer) {
      oppAvatar.mixer.update(dt)
      const acts = oppAvatar.actions
      const want = lastPnjAnim === 'emote' ? (acts['Dance'] || acts['Wave'] || acts['Idle'])
        : lastPnjAnim === 'walk' ? acts['Walk'] : acts['Idle']
      if (want && oppAvatar._clip !== want) {
        if (oppAvatar._clip) oppAvatar._clip.fadeOut(0.2)
        want.reset().fadeIn(0.2).play()
        oppAvatar._clip = want
      }
    }
  }

  const now = performance.now()
  if (now - lastAimSent > 55) { lastAimSent = now; net.send({ t: 'aim', yaw: sniperYaw, pitch: sniperPitch }) }

  for (const k in abilityCooldowns) {
    const btn = el('ab-' + k)
    const bar = btn.querySelector('.cd-bar')
    const lock = btn.querySelector('.ab-lock')
    const unlockLeft = ABILITY_UNLOCK[k] - (now - roundStartAt)
    if (unlockLeft > 0) {
      // Pas encore débloquée : verrou + compte à rebours
      btn.disabled = true
      bar.style.width = '0%'
      if (lock) lock.textContent = fmtClock(unlockLeft)
    } else {
      if (lock) lock.textContent = ''
      const cdLeft = Math.max(0, abilityCooldowns[k] - now)
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
  if (!roundActive || myRole !== 'sniper') return
  playGunshot()
  const origin = camera.position.clone()
  const dir = sniperAimDir()
  const ray = new THREE.Raycaster(origin, dir, 0.1, 90)

  // Distance au contre-tueur (la cible)
  const target = lastPnjNet || new THREE.Vector3(...arena.pnjSpawn)
  const targetBox = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(target.x, target.y + 0.95, target.z), new THREE.Vector3(0.85, 1.95, 0.85))
  const tp = new THREE.Vector3()
  const tHit = ray.ray.intersectBox(targetBox, tp)
  const tDist = tHit ? origin.distanceTo(tp) : Infinity

  // Distance au civil le plus proche sur la trajectoire
  let cDist = Infinity
  const cp = new THREE.Vector3()
  for (const n of crowd) {
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
  if (myRole !== 'sniper' || !roundActive) return
  const now = performance.now()
  const lockLeft = ABILITY_UNLOCK[kind] - (now - roundStartAt)
  if (lockLeft > 0) { showKillfeed(`Capacité débloquée dans ${Math.ceil(lockLeft / 1000)}s`); return }
  if (abilityCooldowns[kind] > now) return
  abilityCooldowns[kind] = now + ABILITY_CD
  net.send({ t: 'ability', kind })
  applyAbilityLocal(kind)   // le sniper voit AUSSI l'effet appliqué à l'adversaire
}

// Position visée par une capacité : chez le contre-tueur = lui-même ; chez le
// sniper = l'avatar de l'adversaire (donc l'effet est bien AU BON ENDROIT chez
// les deux). Les deux clients appliquent l'effet localement → parfaite parité.
function abilityTarget() {
  if (myRole === 'pnj') return pnjPos
  if (oppAvatar) return oppAvatar.group.position
  return lastPnjNet || new THREE.Vector3(...arena.pnjSpawn)
}

function applyAbilityLocal(kind) {
  const now = performance.now()
  const tgt = abilityTarget()
  if (kind === 'phone') {
    positionalRingtone(tgt)   // sonne DEPUIS la position du contre-tueur
    if (myRole === 'pnj') { phoneShakeUntil = now + 3000; showKillfeed('📞 Votre téléphone sonne…') }
    else showKillfeed('📞 Téléphone du contre-tueur déclenché')
  } else if (kind === 'alarm') {
    playAlarmSound()
    scatterCrowd(tgt)         // TOUTE la foule panique et court
    if (myRole === 'pnj') { alarmUntil = now + 2500; showKillfeed('🚨 Une alarme retentit : la foule panique !') }
    else showKillfeed('🚨 Alarme déclenchée : la foule se disperse')
  } else if (kind === 'cling') {
    clingerUntil = now + 4000
    let closest = null, cd = Infinity
    for (const n of crowd) { const d = n.mesh.position.distanceTo(tgt); if (d < cd) { cd = d; closest = n } }
    clingerNpc = closest
    showKillfeed(myRole === 'pnj' ? '🫂 Un PNJ vous colle et vous ralentit…' : '🫂 Un PNJ colle le contre-tueur')
  }
}

// Fait fuir toute la foule loin de sourcePos (panique d'alarme). La sortie de
// panique est gérée dans loop() (retour à un comportement normal après ~3,5 s).
function scatterCrowd(sourcePos) {
  crowdPanicUntil = performance.now() + 3500
  for (const n of crowd) { if (n.alive) n.flee(sourcePos) }
}

// Le PNJ collant suit sa cible (le contre-tueur, chez les DEUX joueurs).
function updateClinger() {
  const now = performance.now()
  if (clingerNpc && now < clingerUntil) {
    const tgt = abilityTarget()
    clingerNpc.mesh.position.set(tgt.x + 0.7, 0, tgt.z + 0.4)
    clingerNpc.mesh.lookAt(tgt.x, 0, tgt.z)
  } else if (clingerNpc && now >= clingerUntil) {
    clingerNpc = null
  }
}

// ─── Rôle CONTRE-TUEUR (PNJ) ─────────────────────────────────────────
const keys = { w: false, a: false, s: false, d: false }
const EMOTE_DUR = 2400
const PNJ_SPEED = 2.2   // vitesse du contre-tueur (proche d'un PNJ qui marche)

// Se fond dans la foule le temps d'une danse/salut — purement cosmétique,
// mais ça donne au contre-tueur l'air d'un vrai PNJ (comme demandé), au lieu
// d'un joueur qui marche en ligne droite au milieu de gens qui dansent.
function triggerEmote() {
  if (myRole !== 'pnj' || !roundActive) return
  const now = performance.now()
  if (now < emoteUntil) return
  emoteUntil = now + EMOTE_DUR
}

function setupPnj() {
  pnjPos.set(...arena.pnjSpawn)
  pnjYaw = Math.PI; pnjPitch = 0
  camera.fov = 60
  camera.updateProjectionMatrix()

  // Avatar créé par buildRoundScene, avec le même seed que celui rendu chez le sniper.
  avatar.group.position.copy(pnjPos)

  el('canvas').requestPointerLock()
}

function pnjForward() { return groundForward(pnjYaw) }
function pnjRight() { return groundRight(pnjYaw) }
// Direction de visée du pistolet (yaw + pitch) : la balle part par là.
function pnjAimDir() {
  const cp = Math.cos(pnjPitch)
  return new THREE.Vector3(Math.sin(pnjYaw) * cp, Math.sin(pnjPitch), Math.cos(pnjYaw) * cp)
}

let lastPosSentAt = 0
function pnjFrame(dt) {
  const now = performance.now()
  const emoting = now < emoteUntil
  speedMultiplier = (now < clingerUntil) ? 0.5 : 1
  // Allure calme de PNJ (≈2,2 u/s) — pas la course qui trahissait le joueur.
  const spd = PNJ_SPEED * speedMultiplier * dt
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
    pnjPos.x = THREE.MathUtils.clamp(pnjPos.x + move.x, arena.moveBounds.minX, arena.moveBounds.maxX)
    pnjPos.z = THREE.MathUtils.clamp(pnjPos.z + move.z, arena.moveBounds.minZ, arena.moveBounds.maxZ)
  }
  avatar.group.position.copy(pnjPos)
  avatar.group.rotation.y = pnjYaw
  if (avatar.mixer) {
    avatar.mixer.update(dt)
    const acts = avatar.actions
    const want = emoting ? (acts['Dance'] || acts['Wave'] || acts['Idle']) : (moving ? acts['Walk'] : acts['Idle'])
    if (want && avatar._clip !== want) {
      if (avatar._clip) avatar._clip.fadeOut(0.2)
      want.reset().fadeIn(0.2).play()
      avatar._clip = want
    }
  }

  // Caméra : visée au pistolet (première personne) OU 3ᵉ personne
  const aiming = pnjAiming && partsCollected >= 3
  const wantFov = aiming ? 45 : 60
  if (Math.abs(camera.fov - wantFov) > 0.01) { camera.fov = wantFov; camera.updateProjectionMatrix() }

  let camPos, lookAt
  if (aiming) {
    // Première personne alignée sur la visée → le réticule (centre écran)
    // pointe EXACTEMENT là où part la balle. Indispensable pour bien viser le nid.
    const head = pnjPos.clone().add(new THREE.Vector3(0, 1.55, 0))
    const aimDir = pnjAimDir()
    camPos = head
    lookAt = head.clone().add(aimDir.multiplyScalar(20))
  } else {
    // 3ᵉ personne, orbite derrière le personnage
    const camDist = 4.2, camHeight = 2.0 + pnjPitch * 2
    camPos = pnjPos.clone().sub(fwd.clone().multiplyScalar(camDist)).add(new THREE.Vector3(0, camHeight, 0))
    lookAt = pnjPos.clone().add(new THREE.Vector3(0, 1.5, 0))
  }
  // secousse : téléphone / alarme
  if (now < phoneShakeUntil || now < alarmUntil) {
    const s = now < alarmUntil ? 0.14 : 0.05
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
  if (now < alarmUntil) {
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
  for (const p of arena.partSpots) {
    if (p.taken) continue
    const dx = p.mesh.position.x - pnjPos.x, dz = p.mesh.position.z - pnjPos.z
    if (Math.hypot(dx, dz) < 2.0) {
      takePart(p)
      partsCollected++
      partsEl.textContent = `Pièces d'arme : ${partsCollected} / 3`
      net.send({ t: 'part_pickup', idx: arena.partSpots.indexOf(p) })
      showKillfeed(`Pièce récupérée : ${p.label} (${partsCollected}/3)`)
      if (partsCollected >= 3) armPnj()
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
    net.send({ t: 'pos', x: pnjPos.x, y: pnjPos.y, z: pnjPos.z, yaw: pnjYaw, anim })
  }
}

function armPnj() {
  showKillfeed('Pistolet assemblé : CLIC DROIT pour viser le nid, CLIC GAUCHE pour tirer !')
  pistolMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.3 }))
  pistolMesh.position.set(0.32, 1.1, 0.35)
  avatar.group.add(pistolMesh)
}

// Le sniper apprend qu'une pièce a été prise — mais PAS où (aucune position
// n'est révélée, la pièce lui était déjà invisible).
function removePartVisual(idx) {
  const p = arena.partSpots[idx]
  if (p && !p.taken) takePart(p)
  oppPartsCount = Math.min(3, oppPartsCount + 1)
  if (oppPartsCount >= 3) showKillfeed('⚠️ Le contre-tueur est ARMÉ : il peut riposter !')
  else showKillfeed(`⚠️ Le contre-tueur a récupéré une pièce d'arme (${oppPartsCount}/3)`)
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
  if (!roundActive || myRole !== 'pnj' || partsCollected < 3) return
  if (!pnjAiming) { showKillfeed('CLIC DROIT pour viser d\'abord'); return }
  playGunshot()
  // Tir depuis la tête, dans la direction VISÉE (yaw+pitch) — pas la direction
  // caméra (qui, en 3ᵉ personne, regarde le joueur et donnait un tir faussé).
  const origin = pnjPos.clone().add(new THREE.Vector3(0, 1.55, 0))
  const dir = pnjAimDir()
  const raycaster = new THREE.Raycaster(origin, dir, 0.1, 120)
  if (raycaster.ray.intersectsBox(arena.nest.windowBox)) {
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

// ─── Boucle commune ──────────────────────────────────────────────────
function showKillfeed(text) {
  killfeedEl.textContent = text
  killfeedEl.style.opacity = '1'
  clearTimeout(showKillfeed._t)
  showKillfeed._t = setTimeout(() => { killfeedEl.style.opacity = '0' }, 2400)
}

function loop() {
  rafHandle = requestAnimationFrame(loop)
  const dt = Math.min(clock.getDelta(), 0.05)

  if (roundActive) {
    const now = performance.now()
    for (const n of crowd) n.update(dt)
    // Fin de panique d'alarme : la foule reprend un comportement normal
    if (crowdPanicUntil && now > crowdPanicUntil) {
      for (const n of crowd) if (n.alive && n.state === STATES.FLEE) { n.state = STATES.WALK; n.stateTimer = 0 }
      crowdPanicUntil = 0
    }
    // Filet de sécurité : garde toute la foule DANS la salle (la fuite d'alarme
    // ignore les murs de l'arène PvP), sauf le PNJ collant piloté à la main.
    const b = arena.moveBounds
    for (const n of crowd) {
      if (n === clingerNpc) continue
      n.mesh.position.x = THREE.MathUtils.clamp(n.mesh.position.x, b.minX, b.maxX)
      n.mesh.position.z = THREE.MathUtils.clamp(n.mesh.position.z, b.minZ, b.maxZ)
    }
    if (myRole === 'sniper') sniperFrame(dt)
    else pnjFrame(dt)
    updateClinger()   // le PNJ collant suit sa cible (après les updates de foule)

    const remain = Math.max(0, matchEndAt - Date.now())
    const m = Math.floor(remain / 60000), s = Math.floor((remain % 60000) / 1000)
    timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`
    if (remain <= 0) endRound(null, 'timeout')
  }

  renderer.render(scene, camera)
}

// ─── Entrées clavier / souris ────────────────────────────────────────
// IMPORTANT : on lit toujours `e.code` (position PHYSIQUE de la touche),
// jamais `e.key` — sur un clavier AZERTY, la rangée de chiffres sans Shift
// produit '&','é','"'... pas '1'/'2'/'3', donc `e.key === '1'` ne se
// déclenche jamais. `e.code === 'Digit1'` marche quel que soit le layout,
// tout comme ZQSD fonctionne déjà grâce à `e.code === 'KeyW'` etc.
// Les bindings sont personnalisables (voir settings.js → pvpKeys).
document.addEventListener('keydown', (e) => {
  if (!roundActive) return
  const bind = settings.pvpKeys
  // Sniper : capacités au clavier (le pointer lock cache le curseur,
  // donc impossible de cliquer les boutons pendant qu'on vise)
  if (myRole === 'sniper') {
    if (e.code === bind.ability1) triggerAbility('phone')
    if (e.code === bind.ability2) triggerAbility('cling')
    if (e.code === bind.ability3) triggerAbility('alarm')
    return
  }
  // Contre-tueur : déplacement (ZQSD par défaut)
  if (e.code === bind.forward) keys.w = true
  if (e.code === bind.left) keys.a = true
  if (e.code === bind.back) keys.s = true
  if (e.code === bind.right) keys.d = true
  if (e.code === bind.emote) triggerEmote()
})
document.addEventListener('keyup', (e) => {
  const bind = settings.pvpKeys
  if (e.code === bind.forward) keys.w = false
  if (e.code === bind.left) keys.a = false
  if (e.code === bind.back) keys.s = false
  if (e.code === bind.right) keys.d = false
})

document.addEventListener('mousemove', (e) => {
  if (!roundActive || document.pointerLockElement !== el('canvas')) return
  let s = 0.0022 * sensMultiplier()
  if (myRole === 'sniper') {
    // En visée lunette, la sensibilité suit le zoom → visée fine et stable.
    if (sniperScoped) s *= SCOPE_FOV / SNIPER_FOV
    // La baie vitrée du nid est fixe : on clampe la visée à l'angle qu'elle
    // couvre pour ne jamais pouvoir se retourner vers le mur aveugle de son
    // propre immeuble (bornes fournies par la carte).
    const n = arena.nest
    const yawRange = n.yawRange ?? 0.5
    sniperYaw = Math.max(-yawRange, Math.min(yawRange, sniperYaw - e.movementX * s))
    sniperPitch -= e.movementY * s * invertY()
    sniperPitch = Math.max(n.pitchMin ?? -0.6, Math.min(n.pitchMax ?? 0.2, sniperPitch))
  } else if (myRole === 'pnj') {
    // En visée pistolet, sensibilité réduite pour viser fin ; pitch large pour
    // pouvoir viser le nid en hauteur.
    if (pnjAiming) s *= 0.5
    pnjYaw -= e.movementX * s
    pnjPitch -= e.movementY * s * invertY() * (pnjAiming ? 0.8 : 0.5)
    pnjPitch = Math.max(-0.5, Math.min(0.6, pnjPitch))
  }
})

document.addEventListener('mousedown', (e) => {
  if (!roundActive) return
  // Clic droit maintenu = viser (lunette du sniper / pistolet du contre-tueur armé)
  if (e.button === 2) {
    if (myRole === 'sniper') setScoped(true)
    else if (myRole === 'pnj' && partsCollected >= 3) pnjAiming = true
    return
  }
  if (e.button !== 0) return
  if (document.pointerLockElement !== el('canvas')) { el('canvas').requestPointerLock(); return }
  if (myRole === 'sniper') sniperShoot()
  else pnjShoot()
})
document.addEventListener('mouseup', (e) => {
  if (e.button !== 2) return
  if (myRole === 'sniper') setScoped(false)
  else if (myRole === 'pnj') pnjAiming = false
})
// Empêche le menu contextuel du clic droit pendant la partie
document.addEventListener('contextmenu', (e) => { if (roundActive) e.preventDefault() })

function setScoped(on) {
  sniperScoped = on
  const sc = el('mp-scope')
  if (sc) sc.style.display = on ? 'block' : 'none'
}

// ─── Fin de manche ───────────────────────────────────────────────────
function endRound(winnerRole, reason) {
  if (!roundActive) return
  roundActive = false
  setScoped(false); pnjAiming = false
  stopPvpAmbience()
  if (rafHandle) cancelAnimationFrame(rafHandle)
  if (document.pointerLockElement) document.exitPointerLock()
  mpHud.style.display = 'none'
  const flash = el('mp-alarm-flash'); if (flash) flash.remove()

  if (reason === 'peer_left') {
    resultTitle.textContent = "ADVERSAIRE PARTI"
    resultDetail.textContent = "L'adversaire a quitté la partie."
    rematchBtn.style.display = 'none'
  } else if (reason === 'disconnected') {
    resultTitle.textContent = 'CONNEXION PERDUE'
    resultDetail.textContent = 'La liaison avec le relais est coupée : manche interrompue.'
    rematchBtn.style.display = 'none'
  } else {
    rematchBtn.style.display = 'inline-block'
    if (winnerRole === null) {
      resultTitle.textContent = 'TEMPS ÉCOULÉ'
      resultDetail.textContent = 'Match nul : personne n\'a été éliminé à temps.'
    } else {
      const iWon = winnerRole === myRole
      const pts = winnerRole === 'sniper' ? 1 : 2
      if (iWon) myPoints += pts; else oppPoints += pts
      resultTitle.textContent = iWon ? 'VICTOIRE' : 'DÉFAITE'
      if (reason === 'civilian') {
        // Le sniper a abattu un innocent : bavure. Le contre-tueur l'emporte.
        resultDetail.textContent = iWon
          ? 'Le sniper a abattu un innocent : bavure ! (+2)'
          : 'Vous avez touché un civil. Bavure fatale. (+2 pour l\'adversaire)'
      } else {
        resultDetail.textContent = winnerRole === 'sniper'
          ? (iWon ? 'Le contre-tueur est tombé sous vos balles. (+1)' : 'Le sniper vous a repéré. (+1 pour lui)')
          : (iWon ? 'Le nid du sniper est neutralisé. (+2)' : 'Le contre-tueur a atteint votre nid. (+2 pour lui)')
      }
    }
  }
  scoreEl.textContent = `Score : Vous ${myPoints}  |  Adversaire ${oppPoints}`

  releaseRoundScene()

  hideAllMpScreens()
  mpResult.style.display = 'flex'
}

function quitToMenu() {
  net.disconnect()
  stopPvpAmbience()
  myRole = null; roundActive = false
  if (rafHandle) cancelAnimationFrame(rafHandle)
  hideAllMpScreens()
  releaseRoundScene()        // d'ordinaire déjà fait par endRound ; rien ne reste si une manche est encore montée
  const instr = el('instruction'); if (instr) instr.style.display = ''   // restaure l'aide du mode histoire
  MAP_BUILDERS[0]()          // reconstruit le décor vivant derrière le menu
  setCampaignPaused(false)   // la boucle du mode histoire reprend la main
  menuEl().style.display = 'flex'
}
