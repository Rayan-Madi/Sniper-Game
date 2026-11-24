import * as THREE from 'three'
import { scene, camera, renderer } from '../scene.js'
import { buildPvpArena, clearPvpMap, getPvpColliders } from './pvpMap.js'
import { buildMenuDecor } from '../maps/index.js'
import { spawnCharacter, charactersReady, charactersProgress, charactersSettled } from '../characters.js'
import { NPC, STATES, npcShadowMode } from '../npc.js'
import { playPvpIntro, isPvpIntroActive, stopPvpIntro } from './pvpIntro.js'
import * as net from '../net.js'
import { sensMultiplier, invertY, settings } from '../settings.js'
import { setCampaignPaused } from '../main.js'
import { disposeObject } from '../gfx/dispose.js'
import { npcCastsShadow } from '../gfx/quality.js'
import { startWhenReady, waitForCharacters, createLoadingScreen } from '../campaign/loading.js'
import { el, menuEl, mpResult, mpHud, roleBanner, timerEl, partsEl, abilitiesEl, crosshairEl, killfeedEl, scoreEl, resultTitle, resultDetail, rematchBtn, etat } from './etat.js'
import { startPvpAmbience, stopPvpAmbience } from './son.js'
import { hideAllMpScreens } from './salon.js'
import { SNIPER_FOV, SCOPE_FOV, setupSniper, sniperFrame, sniperShoot, triggerAbility, updateClinger } from './sniper.js'
import { keys, triggerEmote, setupPnj, pnjFrame, removePartVisual, pnjShoot } from './contreTueur.js'

// ─── Mode PvP : Sniper vs Contre-tueur ───────────────────────────────
// Réseau : relais WebSocket pur (voir net.js + server/index.js). Chaque
// client calcule sa propre visée/collision et l'annonce à l'autre —
// modèle "confiance au client", très bien pour un 1v1 non compétitif.
//
// Modules (src/pvp/) : index.js, ce fichier, tient la manche (départ, décor, boucle, entrées, fin) ; salon.js le menu
// et les messages du relais ; sniper.js et contreTueur.js les deux rôles ; son.js les sons ; etat.js le DOM et l'état
// qu'ils partagent ; pvpMap.js l'arène, pvpIntro.js l'intro de rôle, pvpMath.js le repère au sol. Les modules de la
// manche s'importent entre eux en rond (un rôle finit la manche, la manche lance les rôles) : aucun n'appelle l'autre
// pendant son chargement, seulement depuis ses fonctions.

export { initMultiplayerMenu } from './salon.js'

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

// ─── Démarrage d'une manche ──────────────────────────────────────────
// Départ reçu du relais (aussi après une revanche votée à deux). Les modèles encore en chargement (partie lancée juste
// après l'ouverture du jeu) : la manche attend derrière l'écran PRÉPARATION DU DOSSIER, 20 s au plus, sinon la foule
// et l'avatar seraient procéduraux, et l'avatar du contre-tueur invisible. Modèles prêts : départ dans le même message,
// comme avant. L'intro de rôle et le chrono sont locaux : l'attente d'un joueur ne retire rien au temps de l'autre.
function onMatchStart(msg) {
  etat.myRole = msg.role
  hideAllMpScreens()
  rematchBtn.disabled = false; rematchBtn.textContent = 'MANCHE SUIVANTE'
  // Masque l'aide du mode histoire (le PvP a son propre HUD/killfeed)
  const instr = el('instruction'); if (instr) instr.style.display = 'none'

  setCampaignPaused(true)
  cancelPendingStart()   // un départ précédent encore en attente : seul celui-ci compte
  const token = ++etat.startToken
  const isCurrent = () => token === etat.startToken
  startWhenReady({
    settled: charactersSettled,
    wait: () => {
      const screen = createLoadingScreen(el('loading-screen'))
      etat.pendingStart = { screen, parts: [] }
      return waitForCharacters({ ready: charactersReady, progress: charactersProgress, show: screen.show, hide: screen.hide, isCurrent })
    },
    start: () => {
      const parts = etat.pendingStart ? etat.pendingStart.parts : []
      etat.pendingStart = null
      beginRound(msg, parts)
    },
    isCurrent,
  })
}

// Annule un départ en attente des modèles (l'écran disparaît, la manche ne montera pas, les pièces rangées avec lui
// sont oubliées). Vrai s'il y en avait un.
function cancelPendingStart() {
  if (!etat.pendingStart) return false
  etat.pendingStart.screen.hide()
  etat.pendingStart = null
  etat.startToken++
  return true
}

// Fin de manche venue de l'adversaire : touché, bavure (winnerRole), départ ou relais perdu (null). Elle vaut aussi
// quand la manche n'est pas encore active ici, alors que l'autre joue déjà : départ en attente des modèles (annulé,
// rien n'est monté) ou intro de rôle (arrêtée). Les deux joueurs voient ainsi la même fin ; sans cela, l'un voyait
// VICTOIRE et l'autre démarrait ensuite une manche seul, jusqu'au chrono. Sans manche en cours ni à venir, rien.
function endRoundFromPeer(winnerRole, reason) {
  if (cancelPendingStart()) etat.roundActive = true   // pour laisser endRound afficher l'écran de fin
  if (isPvpIntroActive()) { stopPvpIntro(); etat.roundActive = true /* pour laisser endRound nettoyer normalement */ }
  if (etat.roundActive) endRound(winnerRole, reason)
}

// Manche montée et lancée (modèles prêts) : décor du seed partagé, rôle, intro, puis la boucle. parts : pièces prises
// par l'adversaire pendant l'attente des modèles, retirées et comptées une fois l'arène montée.
function beginRound(msg, parts = []) {
  etat.partsCollected = 0; etat.oppPartsCount = 0
  etat.pistolMesh = null
  etat.emoteUntil = 0; etat.pnjAiming = false
  etat.clingerNpc = null; etat.clingerUntil = 0; etat.crowdPanicUntil = 0
  etat.phoneShakeUntil = 0; etat.alarmUntil = 0; etat.speedMultiplier = 1
  for (const k in etat.abilityCooldowns) etat.abilityCooldowns[k] = 0
  etat.lastPnjNet = null; etat.lastPnjYaw = Math.PI; etat.lastPnjAnim = 'idle'
  setScoped(false)

  // Seed partagé (même serverTime chez les deux) → décor + foule IDENTIQUES.
  matchSeed = (msg.serverTime >>> 0) || 1
  buildRoundScene(matchSeed, etat.myRole)
  for (const idx of parts) removePartVisual(idx)

  roleBanner.textContent = etat.myRole === 'sniper' ? 'RÔLE : SNIPER' : 'RÔLE : CONTRE-TUEUR'
  partsEl.style.display = etat.myRole === 'pnj' ? 'block' : 'none'
  abilitiesEl.style.display = etat.myRole === 'sniper' ? 'flex' : 'none'
  crosshairEl.style.display = 'none'

  if (etat.myRole === 'sniper') setupSniper()
  else setupPnj()

  // Cinématique d'intro (par rôle) avant de rendre la main au joueur — fait
  // voler la caméra dans l'arène déjà construite pour expliquer objectif,
  // commandes et condition de victoire.
  playPvpIntro(etat.myRole, etat.arena, introTick, () => {
    // Chrono calculé LOCALEMENT une fois l'intro de CE client terminée —
    // pas de perte de temps de jeu si un joueur regarde l'intro plus
    // longtemps que l'autre (cohérent avec le modèle "confiance au client").
    etat.matchEndAt = Date.now() + 10 * 60 * 1000
    etat.roundStartAt = performance.now()   // référence pour le déblocage des capacités
    camera.fov = etat.myRole === 'sniper' ? SNIPER_FOV : 60
    camera.updateProjectionMatrix()
    mpHud.style.display = 'block'
    etat.roundActive = true
    startPvpAmbience()                  // musique + brouhaha de fête
    etat.clock.getDelta()
    if (etat.rafHandle) cancelAnimationFrame(etat.rafHandle)
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
  etat.arena = withSeed(seed, () => buildPvpArena())
  withSeed(seed ^ SEED_CROWD, () => spawnCrowd())

  // Les pièces d'arme sont INVISIBLES pour le sniper : il ne doit pas savoir où
  // elles sont ni camper les spots. (Fait au build, avant la boucle → pas de
  // recompilation de shaders en cours de partie.)
  if (role === 'sniper') for (const p of etat.arena.partSpots) p.mesh.visible = false

  // Le laser rouge du sniper est créé pour LES DEUX joueurs : c'est la
  // mécanique centrale, le contre-tueur repère le nid grâce au trait.
  createLaser()

  // Même seed des deux côtés → le contre-tueur a la même allure chez lui et chez le sniper.
  const av = withSeed(seed ^ SEED_AVATAR, makeCivilianAvatar)
  if (role === 'sniper') etat.oppAvatar = av
  else etat.avatar = av
  return etat.arena
}

// Retire le décor de la manche et libère ses ressources GPU (fin de manche, QUITTER, nouveau décor, route ?memtest=1) :
// foule (NPC.dispose), avatars et pistolet (enfant de l'avatar du contre-tueur), laser, arène. Rien des modèles GLB,
// marqués partagés au chargement (characters.js). Idempotente : sans décor monté, ne fait rien.
export function releaseRoundScene() {
  clearCrowd()
  etat.clingerNpc = null
  releaseAvatar(etat.avatar); etat.avatar = null
  releaseAvatar(etat.oppAvatar); etat.oppAvatar = null
  etat.pistolMesh = null
  if (etat.laserCore) { disposeObject(etat.laserCore); disposeObject(etat.laserGlow); etat.laserCore = null; etat.laserGlow = null }
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
  for (const n of etat.crowd) n.update(dt)
  if (etat.myRole === 'pnj' && etat.avatar && etat.avatar.mixer) etat.avatar.mixer.update(dt)
  if (etat.myRole === 'sniper' && etat.oppAvatar && etat.oppAvatar.mixer) etat.oppAvatar.mixer.update(dt)
}

const CROWD_SIZE = 54

function spawnCrowd() {
  etat.crowd = []
  const dance = etat.arena.danceFloor
  const b = etat.arena.moveBounds
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
    etat.crowd.push(npc)
  }
}

function clearCrowd() {
  for (const n of etat.crowd) n.dispose()
  etat.crowd = []
}

// ─── Laser rouge (partagé : rendu chez les deux joueurs) ─────────────
function createLaser() {
  const coreGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6)
  etat.laserCore = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }))
  etat.laserGlow = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.4 }))
  etat.laserGlow.scale.x = etat.laserGlow.scale.z = 2.8
  // Rendu par-dessus le décor pour rester bien lisible dans la pénombre
  etat.laserCore.renderOrder = 999; etat.laserGlow.renderOrder = 998
  scene.add(etat.laserCore); scene.add(etat.laserGlow)
}

function sniperAimDir() {
  const euler = new THREE.Euler(etat.sniperPitch, etat.sniperYaw, 0, 'YXZ')
  return new THREE.Vector3(0, 0, -1).applyEuler(euler)
}

function laserOrigin() {
  // Le laser part du "canon" (décalé sous l'œil) et non de la caméra : sinon,
  // pour le sniper, le trait est coaxial à son regard et se réduit à un point.
  return new THREE.Vector3(...(etat.arena.nest.muzzlePos || etat.arena.nest.cameraPos))
}

function updateLaser(origin, dir) {
  if (!etat.laserCore) return
  // Raycast uniquement contre le décor statique de l'arène (pas la foule
  // skinnée : les SkinnedMesh sont très coûteux à raycaster chaque frame)
  const raycaster = new THREE.Raycaster(origin, dir, 0.1, 60)
  const hits = raycaster.intersectObjects(getPvpColliders(), true)
  const end = hits.length ? hits[0].point : origin.clone().add(dir.clone().multiplyScalar(60))
  const mid = origin.clone().add(end).multiplyScalar(0.5)
  const dist = origin.distanceTo(end)
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  for (const m of [etat.laserCore, etat.laserGlow]) {
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

// ─── Boucle commune ──────────────────────────────────────────────────
function showKillfeed(text) {
  killfeedEl.textContent = text
  killfeedEl.style.opacity = '1'
  clearTimeout(showKillfeed._t)
  showKillfeed._t = setTimeout(() => { killfeedEl.style.opacity = '0' }, 2400)
}

function loop() {
  etat.rafHandle = requestAnimationFrame(loop)
  const dt = Math.min(etat.clock.getDelta(), 0.05)

  if (etat.roundActive) {
    const now = performance.now()
    for (const n of etat.crowd) n.update(dt)
    // Fin de panique d'alarme : la foule reprend un comportement normal
    if (etat.crowdPanicUntil && now > etat.crowdPanicUntil) {
      for (const n of etat.crowd) if (n.alive && n.state === STATES.FLEE) { n.state = STATES.WALK; n.stateTimer = 0 }
      etat.crowdPanicUntil = 0
    }
    // Filet de sécurité : garde toute la foule DANS la salle (la fuite d'alarme
    // ignore les murs de l'arène PvP), sauf le PNJ collant piloté à la main.
    const b = etat.arena.moveBounds
    for (const n of etat.crowd) {
      if (n === etat.clingerNpc) continue
      n.mesh.position.x = THREE.MathUtils.clamp(n.mesh.position.x, b.minX, b.maxX)
      n.mesh.position.z = THREE.MathUtils.clamp(n.mesh.position.z, b.minZ, b.maxZ)
    }
    if (etat.myRole === 'sniper') sniperFrame(dt)
    else pnjFrame(dt)
    updateClinger()   // le PNJ collant suit sa cible (après les updates de foule)

    const remain = Math.max(0, etat.matchEndAt - Date.now())
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
  if (!etat.roundActive) return
  const bind = settings.pvpKeys
  // Sniper : capacités au clavier (le pointer lock cache le curseur,
  // donc impossible de cliquer les boutons pendant qu'on vise)
  if (etat.myRole === 'sniper') {
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
  if (!etat.roundActive || document.pointerLockElement !== el('canvas')) return
  let s = 0.0022 * sensMultiplier()
  if (etat.myRole === 'sniper') {
    // En visée lunette, la sensibilité suit le zoom → visée fine et stable.
    if (etat.sniperScoped) s *= SCOPE_FOV / SNIPER_FOV
    // La baie vitrée du nid est fixe : on clampe la visée à l'angle qu'elle
    // couvre pour ne jamais pouvoir se retourner vers le mur aveugle de son
    // propre immeuble (bornes fournies par la carte).
    const n = etat.arena.nest
    const yawRange = n.yawRange ?? 0.5
    etat.sniperYaw = Math.max(-yawRange, Math.min(yawRange, etat.sniperYaw - e.movementX * s))
    etat.sniperPitch -= e.movementY * s * invertY()
    etat.sniperPitch = Math.max(n.pitchMin ?? -0.6, Math.min(n.pitchMax ?? 0.2, etat.sniperPitch))
  } else if (etat.myRole === 'pnj') {
    // En visée pistolet, sensibilité réduite pour viser fin ; pitch large pour
    // pouvoir viser le nid en hauteur.
    if (etat.pnjAiming) s *= 0.5
    etat.pnjYaw -= e.movementX * s
    etat.pnjPitch -= e.movementY * s * invertY() * (etat.pnjAiming ? 0.8 : 0.5)
    etat.pnjPitch = Math.max(-0.5, Math.min(0.6, etat.pnjPitch))
  }
})

document.addEventListener('mousedown', (e) => {
  if (!etat.roundActive) return
  // Clic droit maintenu = viser (lunette du sniper / pistolet du contre-tueur armé)
  if (e.button === 2) {
    if (etat.myRole === 'sniper') setScoped(true)
    else if (etat.myRole === 'pnj' && etat.partsCollected >= 3) etat.pnjAiming = true
    return
  }
  if (e.button !== 0) return
  if (document.pointerLockElement !== el('canvas')) { el('canvas').requestPointerLock(); return }
  if (etat.myRole === 'sniper') sniperShoot()
  else pnjShoot()
})
document.addEventListener('mouseup', (e) => {
  if (e.button !== 2) return
  if (etat.myRole === 'sniper') setScoped(false)
  else if (etat.myRole === 'pnj') etat.pnjAiming = false
})
// Empêche le menu contextuel du clic droit pendant la partie
document.addEventListener('contextmenu', (e) => { if (etat.roundActive) e.preventDefault() })

function setScoped(on) {
  etat.sniperScoped = on
  const sc = el('mp-scope')
  if (sc) sc.style.display = on ? 'block' : 'none'
}

// ─── Fin de manche ───────────────────────────────────────────────────
function endRound(winnerRole, reason) {
  if (!etat.roundActive) return
  etat.roundActive = false
  setScoped(false); etat.pnjAiming = false
  stopPvpAmbience()
  if (etat.rafHandle) cancelAnimationFrame(etat.rafHandle)
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
      const iWon = winnerRole === etat.myRole
      const pts = winnerRole === 'sniper' ? 1 : 2
      if (iWon) etat.myPoints += pts; else etat.oppPoints += pts
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
  scoreEl.textContent = `Score : Vous ${etat.myPoints}  |  Adversaire ${etat.oppPoints}`

  releaseRoundScene()

  hideAllMpScreens()
  mpResult.style.display = 'flex'
}

function quitToMenu() {
  cancelPendingStart()
  net.disconnect()
  stopPvpAmbience()
  etat.myRole = null; etat.roundActive = false
  if (etat.rafHandle) cancelAnimationFrame(etat.rafHandle)
  hideAllMpScreens()
  releaseRoundScene()        // d'ordinaire déjà fait par endRound ; rien ne reste si une manche est encore montée
  const instr = el('instruction'); if (instr) instr.style.display = ''   // restaure l'aide du mode histoire
  buildMenuDecor()           // reconstruit le décor vivant derrière le menu (src/maps/menu.js)
  setCampaignPaused(false)   // la boucle du mode histoire reprend la main
  menuEl().style.display = 'flex'
}

// Pour les autres modules du PvP.
export { onMatchStart, endRoundFromPeer, sniperAimDir, laserOrigin, updateLaser, showKillfeed, endRound, quitToMenu }
