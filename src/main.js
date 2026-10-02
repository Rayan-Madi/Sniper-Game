import * as THREE from 'three'
import { initScene, scene, camera, renderer } from './scene.js'
import { showScope, hideScope, isVisible, setZoom, getZoom, setStress, setSteady, updateTremble, getTrembleOffset, drawScope } from './scope.js'
import { NPC, STATES } from './npc.js'
import { getStats, state as upgradeState, UPGRADES, saveProgress, loadProgress, resetProgress, markBriefingSeen, resetCampaignFlags } from './upgrades.js'
import { getLevel } from './levels.js'
import { MAP_BUILDERS, updateMapAmbient, makeJeep } from './maps.js'
import { startIntroCinematic, updateCinematic, isCinematicActive } from './cinematic3d.js'
import { playShot, playSilencedShot, playKill, playAlert, playGameOver, playLevelClear, playCivilKill, updateStressAudio, setHoldingBreath, startMissionAmbience, stopMissionAmbience, audioContext, masterNode } from './audio.js'
import { spawnTracer, spawnImpact, spawnDust, updateEffects, clearEffects } from './effects.js'
import { settings, loadSettings, saveSettings, applySettings, sensMultiplier, invertY, resetPvpKeys } from './settings.js'
import { preloadCharacters } from './characters.js'
import { initMultiplayerMenu } from './pvp.js'
import { playCinematic } from './briefing/index.js'

// ─── État ──────────────────────────────────────────────────────────
let npcs = [], targets = [], guards = [], civilians = []
let stress = 0
let score = 0
let gamePhase = 'menu'
let alertActive = false
let alertTimer = 0
let currentLevelData = null
let currentMapInfo = null
let clock = new THREE.Clock()

// Caméra
let yaw = 0, pitch = 0
const SENSITIVITY = 0.0018

// Tir
let bulletInFlight = false
let bulletDelay = 0
let pendingShotRay = null   // rayon capturé À L'INSTANT du tir (pas à l'impact)

// Statistiques de mission (rapport de fin de niveau + rang)
let statShots = 0, statHits = 0, statStart = 0, statAlerts = 0

// Kill-cam (ralenti sur la dernière cible)
let timeScale = 1
let killcamActive = false

// Choix moral (cadenas du conteneur, niveau du port)
let moralLockMesh = null, moralLockBox = null, moralLockLight = null

// Bonus de tir
let lastTargetKillAt = -99999   // double élimination
let bulletHoles = []            // impacts de balle persistants au sol

// Apnée (retenir son souffle)
let breathMeter = 1        // 1 = plein, 0 = vide
let holdBreathKey = false  // touche Shift enfoncée
let isHolding = false      // apnée effectivement active

// Convoi (véhicule mobile)
let convoyCar = null       // { mesh, x, dir, speed }
let convoyTarget = null    // la cible assise dans le véhicule

const MAX_LEVEL = 6        // dernier niveau (la fête)

// ─── DOM ───────────────────────────────────────────────────────────
const menuEl       = document.getElementById('menu')
const hudEl        = document.getElementById('game-hud')
const upgradeEl    = document.getElementById('upgrade-screen')
const gameOverEl   = document.getElementById('game-over')
const levelClearEl = document.getElementById('level-clear')
const alertBanner  = document.getElementById('alert-banner')
const stressFill   = document.getElementById('stress-fill')
const hudTargets   = document.getElementById('hud-targets')
const hudScore     = document.getElementById('hud-score')
const hudLevel     = document.getElementById('hud-level')
const killFeed     = document.getElementById('kill-feed')
const instruction  = document.getElementById('instruction')

// ─── Init ──────────────────────────────────────────────────────────
initScene()
loadSettings()
loadProgress()        // reprend l'histoire là où le joueur s'était arrêté
preloadCharacters()   // charge les .glb configurés (no-op si aucun) — voir characters.js
MAP_BUILDERS[0]()     // décor vivant derrière le menu principal (caméra qui dérive)
initMultiplayerMenu() // mode 1v1 Sniper vs Contre-tueur (voir pvp.js)

// Libellé du bouton selon la progression sauvegardée
function refreshMenuButtons() {
  const lvl = upgradeState.currentLevel
  document.getElementById('btn-start').textContent =
    lvl > 1 ? `REPRENDRE — MISSION ${Math.min(lvl, MAX_LEVEL)}` : 'COMMENCER'
  const rs = document.getElementById('btn-reset-save')
  if (rs) rs.style.display = lvl > 1 ? 'block' : 'none'
}
refreshMenuButtons()
const resetBtn = document.getElementById('btn-reset-save')
if (resetBtn) resetBtn.onclick = () => { resetProgress(); refreshMenuButtons() }

let introShown = false
document.getElementById('btn-start').onclick     = () => {
  // Au tout premier départ (niveau 1) : intro Viktor, puis le niveau
  if (!introShown && upgradeState.currentLevel === 1) {
    introShown = true
    menuEl.style.display = 'none'
    hudEl.style.display = 'none'
    gamePhase = 'cinematic'
    clock.getDelta()
    startIntroCinematic(() => launchLevel(upgradeState.currentLevel))
  } else {
    launchLevel(upgradeState.currentLevel)
  }
}
document.getElementById('btn-retry').onclick     = () => launchLevel(upgradeState.currentLevel)
document.getElementById('btn-rebrief').onclick   = () => launchLevel(upgradeState.currentLevel, { forceBriefing: true })
document.getElementById('btn-menu').onclick      = () => showMenu()
document.getElementById('btn-upgrades').onclick  = () => showJournal(() => showUpgradeScreen())

// ─── Journal de Viktor : une page de carnet entre les missions ─────
const JOURNAL = {
  1: ["Markov est tombé au milieu de son marché.", "Une ligne de rayée. La première.", "Je croyais que ça me soulagerait. Pas encore."],
  2: ["Les frères Sanctechair ont fermé boutique.", "J'ai vu ce qu'il y avait sur leur table.", "Certaines images ne partent jamais. La leur non plus."],
  3: ["Le port est silencieux ce soir.", "Des conteneurs qui ne partiront jamais.", "La marchandise, c'était des gens. C'ÉTAIT."],
  4: ["Trois uniformes vendus au plus offrant.", "L'armée fera le ménage dans ses rangs.", "Moi, je fais le ménage tout court."],
  5: ["Le colonel n'a pas passé la frontière.", "Les registres sont entre de bonnes mains maintenant.", "Des centaines de noms. Des centaines de raisons."],
}

function showJournal(onDone) {
  const lvl = upgradeState.currentLevel
  const lines = JOURNAL[((lvl - 1) % 6) + 1] || []
  levelClearEl.style.display = 'none'

  const ov = document.createElement('div')
  ov.style.cssText = `position:fixed;inset:0;z-index:170;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.9);font-family:'Courier New',monospace;`
  const freedNote = (lvl === 3 && upgradeState.freedVictims)
    ? `<div style="color:#7ab87a;margin-top:14px;">P.S. — Je les ai vus courir hors du conteneur. Libres.</div>` : ''
  ov.innerHTML = `
    <div style="background:linear-gradient(160deg,#d8cfb8,#c9bfa4);color:#2a241c;max-width:480px;width:86%;
      padding:34px 38px;border-radius:3px;box-shadow:0 24px 80px rgba(0,0,0,0.8), inset 0 0 60px rgba(120,100,60,0.25);
      transform:rotate(-1.2deg);position:relative;">
      <div style="position:absolute;left:30px;top:0;bottom:0;width:1px;background:rgba(160,60,60,0.35);"></div>
      <div style="font-size:12px;letter-spacing:0.25em;color:#7a6a4a;margin-bottom:14px;">— JOURNAL DE VIKTOR —</div>
      <div style="font-size:15px;line-height:2.1;">
        ${lines.map(l => `<div>${l}</div>`).join('')}
        ${freedNote}
      </div>
      <div style="margin-top:22px;font-size:11px;color:#8a7a5a;">Mission ${lvl} — terminée. <span style="text-decoration:line-through;">cible</span></div>
      <button id="journal-next" style="margin-top:18px;background:transparent;border:1px solid #6a5a3a;color:#4a3d28;
        padding:9px 26px;font-family:inherit;font-size:13px;letter-spacing:0.12em;cursor:pointer;">CONTINUER →</button>
    </div>`
  document.body.appendChild(ov)
  ov.querySelector('#journal-next').onclick = () => { ov.remove(); onDone() }
}
document.getElementById('btn-next-level').onclick = () => {
  upgradeState.currentLevel++
  saveProgress()
  launchLevel(upgradeState.currentLevel)
}
document.getElementById('btn-see-ending').onclick = () => {
  levelClearEl.style.display = 'none'
  hudEl.style.display = 'none'
  clearEntities()
  gamePhase = 'briefing'
  clock.getDelta()
  cinematic('epilogue', {
    audio: cinematicAudio(),
    params: { port: upgradeState.freedVictims ? 'libres' : 'enfermes' },
    onDone: () => {
      // Nouvelle campagne : retour à la mission 1, choix du port et briefings vus remis à zéro
      upgradeState.currentLevel = 1
      resetCampaignFlags()
      saveProgress()
      showMenu()
    },
  })
}

// ── Menu pause ──
const pauseEl    = document.getElementById('pause-menu')
const settingsEl = document.getElementById('settings-screen')
let settingsReturnTo = 'menu'   // d'où on a ouvert les paramètres

document.getElementById('btn-resume').onclick  = () => resumeGame()
document.getElementById('btn-restart').onclick = () => {
  pauseEl.style.display = 'none'
  launchLevel(upgradeState.currentLevel)
}
document.getElementById('btn-rebrief-pause').onclick = () => {
  pauseEl.style.display = 'none'
  launchLevel(upgradeState.currentLevel, { forceBriefing: true })
}
document.getElementById('btn-pause-menu').onclick = () => { pauseEl.style.display = 'none'; showMenu() }

// ── Paramètres ──
document.getElementById('btn-settings-menu').onclick  = () => openSettings('menu')
document.getElementById('btn-settings-pause').onclick = () => openSettings('pause')
document.getElementById('btn-settings-back').onclick  = () => closeSettings()

const volSlider = document.getElementById('set-volume')
const sensSlider = document.getElementById('set-sens')
const invertChk = document.getElementById('set-inverty')

function syncSettingsUI() {
  volSlider.value = settings.volume
  sensSlider.value = settings.sensitivity
  invertChk.checked = settings.invertY
  document.getElementById('set-volume-val').textContent = settings.volume + '%'
  document.getElementById('set-sens-val').textContent = (settings.sensitivity / 100).toFixed(2)
  syncKeybindUI()
}
volSlider.oninput = () => {
  settings.volume = +volSlider.value
  document.getElementById('set-volume-val').textContent = settings.volume + '%'
  applySettings(); saveSettings()
}
sensSlider.oninput = () => {
  settings.sensitivity = +sensSlider.value
  document.getElementById('set-sens-val').textContent = (settings.sensitivity / 100).toFixed(2)
  saveSettings()
}
invertChk.onchange = () => { settings.invertY = invertChk.checked; saveSettings() }

// ── Remappage des touches PvP ──
// Code physique (e.code) → étiquette lisible. 'Key*'/'Digit*' sont les seuls
// codes utilisés par défaut, mais on reste tolérant à un remap plus exotique.
function codeToLabel(code) {
  if (!code) return '—'
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

const keybindEls = document.querySelectorAll('.keybind-key')
let listeningFor = null

function syncKeybindUI() {
  for (const el of keybindEls) el.textContent = codeToLabel(settings.pvpKeys[el.dataset.action])
}

for (const el of keybindEls) {
  el.addEventListener('click', () => {
    if (listeningFor) listeningFor.classList.remove('listening')
    listeningFor = el
    el.classList.add('listening')
    el.textContent = '...'
  })
}

// Capture la touche suivante quand une case est en écoute — Échap annule.
// stopImmediatePropagation empêche les AUTRES raccourcis clavier (ex: 1-6 pour
// sauter à un niveau, ou les capacités PvP) de se déclencher pendant la
// capture — ce listener est enregistré avant eux, donc il passe en premier.
document.addEventListener('keydown', (e) => {
  if (!listeningFor) return
  e.preventDefault()
  e.stopImmediatePropagation()
  const action = listeningFor.dataset.action
  if (e.code !== 'Escape') {
    settings.pvpKeys[action] = e.code
    saveSettings()
  }
  listeningFor.classList.remove('listening')
  listeningFor = null
  syncKeybindUI()
})

document.getElementById('btn-pvpkeys-reset').onclick = () => { resetPvpKeys(); syncKeybindUI() }

function openSettings(from) {
  settingsReturnTo = from
  syncSettingsUI()
  settingsEl.style.display = 'flex'
}
function closeSettings() {
  settingsEl.style.display = 'none'
  // revient à l'écran d'origine (déjà affiché en dessous)
}

// ─── Flow ──────────────────────────────────────────────────────────
// playCinematic ne doit jamais bloquer la partie : si la scène ne se charge pas, on enchaîne quand même.
function cinematic(id, opts) {
  playCinematic(id, opts).catch(err => { console.error('[cinématique]', err); opts.onDone() })
}

function cinematicAudio() {
  const ctx = audioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return { ctx, dest: masterNode() }
}

// Briefing de la mission au premier essai seulement (ou sur demande), puis le niveau.
function launchLevel(n, { forceBriefing = false } = {}) {
  menuEl.style.display = 'none'
  upgradeEl.style.display = 'none'
  gameOverEl.style.display = 'none'
  levelClearEl.style.display = 'none'
  pauseEl.style.display = 'none'
  settingsEl.style.display = 'none'
  hudEl.style.display = 'none'
  hideScope()
  releaseMouse()

  // Nettoie la scène AVANT le briefing (sinon résidus du niveau précédent)
  clearEntities()

  const idx = (n - 1) % 6
  if (!forceBriefing && upgradeState.briefingSeen[idx]) { startLevel(n); return }
  gamePhase = 'briefing'
  clock.getDelta()
  cinematic('m' + (idx + 1), {
    audio: cinematicAudio(),
    onDone: () => { markBriefingSeen(idx); saveProgress(); clock.getDelta(); startLevel(n) },
  })
}

function clearConvoy() {
  if (convoyCar) {
    for (const v of convoyCar.vehicles) scene.remove(v.mesh)
    convoyCar = null; convoyTarget = null
  }
}

// Retire toutes les entités de jeu de la scène (PNJ, véhicules, effets)
function clearEntities() {
  for (const npc of npcs) scene.remove(npc.mesh)
  clearConvoy()
  npcs = []; targets = []; guards = []; civilians = []
  for (const h of bulletHoles) scene.remove(h)
  bulletHoles = []
  clearEffects()
}

function startLevel(n) {
  clearEntities()
  breathMeter = 1; isHolding = false; holdBreathKey = false
  statShots = 0; statHits = 0; statStart = performance.now(); statAlerts = 0
  timeScale = 1; killcamActive = false; lastTargetKillAt = -99999
  if (moralLockMesh) { scene.remove(moralLockMesh); moralLockMesh = null; moralLockBox = null; moralLockLight = null }

  currentLevelData = getLevel(n)
  if (((n - 1) % 6) + 1 === 3) upgradeState.freedVictims = false   // chaque essai du port repart d'un choix vierge

  // Choisir la map selon le niveau (cyclique si > 5)
  const mapIdx = (n - 1) % MAP_BUILDERS.length
  currentMapInfo = MAP_BUILDERS[mapIdx]()

  // Cadenas du choix moral (port) : un tir dessus libère les victimes du conteneur
  if (currentMapInfo.moralLock) {
    const [lx, ly, lz] = currentMapInfo.moralLock.pos
    moralLockMesh = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xd9b02c, metalness: 0.75, roughness: 0.25 }))
    moralLockMesh.add(body)
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 14, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.85, roughness: 0.2 }))
    shackle.position.y = 0.27; moralLockMesh.add(shackle)
    // halo doré pulsant — attire l'œil du sniper
    moralLockLight = new THREE.PointLight(0xffcc44, 1.6, 7)
    moralLockLight.position.set(0, 0.2, 0.7)
    moralLockMesh.add(moralLockLight)
    moralLockMesh.position.set(lx, ly, lz)
    scene.add(moralLockMesh)
    moralLockBox = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(lx, ly + 0.1, lz), new THREE.Vector3(0.9, 1.0, 0.7))
    // indice au bout de quelques secondes
    setTimeout(() => {
      if (gamePhase === 'playing' && moralLockMesh) {
        addKillFeed('👂 Des coups sourds... le conteneur rouge, à gauche.')
      }
    }, 5000)
  }

  // Positionner la caméra depuis le point sniper de la map
  const [cx, cy, cz] = currentMapInfo.cameraPos
  camera.position.set(cx, cy, cz)

  // Calculer yaw/pitch initial depuis cameraTarget si défini
  if (currentMapInfo.cameraTarget) {
    const [tx, ty, tz] = currentMapInfo.cameraTarget
    const dir = new THREE.Vector3(tx - cx, ty - cy, tz - cz).normalize()
    yaw   = Math.atan2(dir.x, -dir.z)
    pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)))
  } else {
    yaw = 0; pitch = 0
  }

  camera.fov = 60
  camera.updateProjectionMatrix()
  setZoom(4)

  stress = 0; alertActive = false; alertTimer = 0; bulletInFlight = false
  document.getElementById('game-over-reason').textContent = 'Vous avez été repéré'
  score = upgradeState.totalScore

  hudEl.style.display = 'block'
  hudLevel.textContent = `${currentLevelData.name}  ·  ${Math.min(n, MAX_LEVEL)}/${MAX_LEVEL}`
  alertBanner.style.display = 'none'
  startMissionAmbience()   // nappe sonore de tension pendant la mission

  const b = currentMapInfo.spawnBounds
  const sideFlee = !!currentMapInfo.sideExit

  // Spawner cibles
  const hidden = currentMapInfo.hiddenTarget  // cible à identifier par indices (niveau final)
  for (let i = 0; i < currentLevelData.targets; i++) {
    const useHidden = hidden && i === 0
    const npc = new NPC({
      isTarget: true,
      color: 0xcc4422,
      x: useHidden ? hidden.spawn[0] : b.minX + Math.random() * (b.maxX - b.minX),
      z: useHidden ? hidden.spawn[1] : b.minZ + Math.random() * (b.maxZ - b.minZ),
      levelData: currentLevelData,
      bounds: b,
      fleeSideways: sideFlee,
      hideMarker: !!useHidden,
      lockState: useHidden ? STATES.PHONE : null,
      onPhone: !!useHidden,
      // Le commanditaire est indiscernable : même pool de modèles que la FOULE.
      // Seul son comportement (assis, au téléphone, ne danse jamais) le trahit.
      modelType: useHidden ? 'civilian' : null,
      female: !useHidden && Math.random() < 0.4,
    })
    // Assis sur le canapé (la pose "Talk" est assise) → il se démarque des danseurs
    if (useHidden && hidden.seatY !== undefined) npc.mesh.position.y = hidden.seatY
    npcs.push(npc); targets.push(npc)
  }

  // Dossier d'indices (cible cachée)
  const dossier = document.getElementById('target-dossier')
  if (hidden && dossier) {
    document.getElementById('dossier-text').textContent = hidden.clue
    dossier.style.display = 'block'
  } else if (dossier) {
    dossier.style.display = 'none'
  }

  // Spawner gardes
  for (let i = 0; i < currentLevelData.guards; i++) {
    const npc = new NPC({
      isGuard: true,
      color: 0x334433,
      x: b.minX + Math.random() * (b.maxX - b.minX),
      z: b.minZ + Math.random() * (b.maxZ - b.minZ),
      levelData: currentLevelData,
      bounds: b,
      fleeSideways: sideFlee,
    })
    npcs.push(npc); guards.push(npc)
  }

  // Spawner civils innocents — tirer dessus = game over
  const civilColors = [0x7a6aaa, 0xaa7a3a, 0x3a7aaa, 0xaaaaaa, 0x6a9a6a, 0xaa5a8a, 0x5aaa8a, 0xccaa44]
  const numCivils = currentLevelData.civilians ?? (3 + Math.floor(Math.random() * 3))
  for (let i = 0; i < numCivils; i++) {
    const npc = new NPC({
      isTarget: false,
      isGuard: false,
      isCivilian: true,
      color: civilColors[i % civilColors.length],
      x: b.minX + Math.random() * (b.maxX - b.minX),
      z: b.minZ + Math.random() * (b.maxZ - b.minZ),
      levelData: currentLevelData,
      bounds: b,
      fleeSideways: sideFlee,
      partyMode: !!currentMapInfo.party,   // à la fête, la foule danse
      female: Math.random() < 0.5,   // mixité des civils
    })
    npcs.push(npc); civilians.push(npc)
  }

  // ── Convoi : 3 jeeps (escorte avant, cible+chauffeur, escorte arrière) ──
  convoyCar = null; convoyTarget = null
  if (currentMapInfo.convoy && targets.length > 0) {
    convoyTarget = targets[0]
    convoyTarget.onVehicle = true

    // Position des sièges (local jeep : avant = +X)
    // Hauteurs calées sur le clip "Sit" (bassin ~0,5 m au-dessus de l'origine)
    // → les fesses tombent PILE sur le châssis/banquette, plus d'assis dans le vide
    const DRIVER = { dx: 0.6, dy: 0.62, dz: 0.55 }   // chauffeur, avant droite
    const PASS   = { dx: 0.6, dy: 0.62, dz: -0.55 }  // passager, avant gauche
    const BACK   = { dx: -1.4, dy: 0.82, dz: 0 }     // banquette arrière (cible)

    const g = guards   // 4 gardes spawnés
    g.forEach(gd => { gd.onVehicle = true })

    const vehicles = []

    // Jeep d'escorte AVANT (offset +16) : 1 chauffeur
    const lead = makeJeep(0x2a3a4a)
    scene.add(lead)
    vehicles.push({ mesh: lead, offsetX: 16, riders: [
      { npc: g[0], ...DRIVER },
    ]})

    // Jeep CIBLE (offset 0) : chauffeur + colonel à l'arrière
    const mid = makeJeep(0x3a4a2a)
    scene.add(mid)
    vehicles.push({ mesh: mid, offsetX: 0, riders: [
      { npc: g[1], ...DRIVER },
      { npc: convoyTarget, ...BACK },
    ]})

    // Jeep d'escorte ARRIÈRE (offset -16) : chauffeur + passager
    const rear = makeJeep(0x4a3a2a)
    scene.add(rear)
    vehicles.push({ mesh: rear, offsetX: -16, riders: [
      { npc: g[2], ...DRIVER },
      { npc: g[3], ...PASS },
    ]})

    convoyCar = { baseX: -55, dir: 1, speed: 8.5, vehicles }
  }

  updateHUD()
  gamePhase = 'playing'
  clock.getDelta()

  instruction.style.opacity = '1'
  setTimeout(() => { instruction.style.opacity = '0' }, 5000)
}

function showMenu() {
  for (const npc of npcs) scene.remove(npc.mesh)
  clearConvoy()
  npcs = []; targets = []; guards = []; civilians = []
  hideScope()
  releaseMouse()
  hudEl.style.display = 'none'
  menuEl.style.display = 'flex'
  gameOverEl.style.display = 'none'
  levelClearEl.style.display = 'none'
  pauseEl.style.display = 'none'
  settingsEl.style.display = 'none'
  stopMissionAmbience()
  refreshMenuButtons()
  gamePhase = 'menu'
}

function pauseGame() {
  if (gamePhase !== 'playing') return
  gamePhase = 'paused'
  hideScope()
  releaseMouse()
  pauseEl.style.display = 'flex'
}

function resumeGame() {
  if (gamePhase !== 'paused') return
  pauseEl.style.display = 'none'
  settingsEl.style.display = 'none'
  gamePhase = 'playing'
  clock.getDelta()   // évite un grand dt après la pause
}

function showUpgradeScreen() {
  levelClearEl.style.display = 'none'
  upgradeEl.style.display = 'flex'
  renderUpgradeUI()
}

// ─── Alerte & Game over ────────────────────────────────────────────
function triggerAlert(reason) {
  if (alertActive) return
  alertActive = true
  statAlerts++
  alertTimer = 6
  alertBanner.style.display = 'block'
  playAlert()
  addKillFeed(reason || '⚠ ALERTE — Restez caché', true)

  // Gardes réagissent
  for (const g of guards) {
    if (g.alive) g.alertReact(camera.position)
  }
}

function releaseMouse() {
  if (document.pointerLockElement) document.exitPointerLock()
}

function triggerGameOver() {
  if (gamePhase === 'dead') return
  gamePhase = 'dead'
  stopMissionAmbience()
  hideScope()
  releaseMouse()
  hudEl.style.display = 'none'
  playGameOver()
  gameOverEl.style.display = 'flex'
}

function triggerLevelClear() {
  gamePhase = 'cleared'
  stopMissionAmbience()
  hideScope()
  releaseMouse()
  playLevelClear()
  hudEl.style.display = 'none'
  upgradeState.totalScore = score
  const reward = currentLevelData.pointsReward
  upgradeState.points += reward
  saveProgress()
  // Rapport de mission : rang + temps, tirs, précision
  const elapsed = Math.max(1, Math.round((performance.now() - statStart) / 1000))
  const precision = statShots > 0 ? Math.round((statHits / statShots) * 100) : 100
  const [rank, rankCol] =
    (precision === 100 && statAlerts === 0) ? ['★ FANTÔME ★', '#9fe8ff'] :
    (precision >= 60 && statAlerts <= 1)    ? ['PROFESSIONNEL', '#4eff4e'] :
                                              ['BRUTAL', '#ff8844']
  document.getElementById('lc-score').innerHTML =
    `<div style="font-size:24px;letter-spacing:0.35em;color:${rankCol};margin-bottom:8px;text-shadow:0 0 18px ${rankCol}55;">${rank}</div>` +
    `Score : ${score} pts  —  +${reward} point${reward > 1 ? 's' : ''} d'amélioration<br>` +
    `<span style="color:rgba(200,240,200,0.55);font-size:12px;">⏱ ${elapsed}s &nbsp;·&nbsp; ${statShots} tir${statShots > 1 ? 's' : ''} &nbsp;·&nbsp; précision ${precision}% &nbsp;·&nbsp; alertes ${statAlerts}</span>`

  // Dernier niveau : on propose de voir la fin au lieu d'enchaîner
  const lastLevel = upgradeState.currentLevel >= MAX_LEVEL
  document.getElementById('lc-title').textContent = lastLevel ? 'RÉSEAU ANÉANTI' : 'MISSION ACCOMPLIE'
  document.getElementById('btn-upgrades').style.display    = lastLevel ? 'none' : 'block'
  document.getElementById('btn-see-ending').style.display  = lastLevel ? 'block' : 'none'

  levelClearEl.style.display = 'flex'
}

function triggerFleeGameOver() {
  if (gamePhase === 'dead') return
  gamePhase = 'dead'
  stopMissionAmbience()
  hideScope()
  releaseMouse()
  hudEl.style.display = 'none'
  document.getElementById('game-over-reason').textContent = 'Une cible a fui votre champ de vision'
  gameOverEl.style.display = 'flex'
}

// Le convoi a traversé toute la zone sans que le colonel soit abattu : il file
// vers la frontière. Une seule fenêtre de tir — mission ratée (pas de 2e passage).
function triggerConvoyEscaped() {
  if (gamePhase === 'dead') return
  gamePhase = 'dead'
  stopMissionAmbience()
  hideScope()
  releaseMouse()
  hudEl.style.display = 'none'
  document.getElementById('game-over-reason').textContent = 'Le convoi a filé — le colonel a rejoint la frontière'
  gameOverEl.style.display = 'flex'
}

// ─── Tir ───────────────────────────────────────────────────────────
function shoot() {
  if (!isVisible() || bulletInFlight || gamePhase !== 'playing') return
  const stats = getStats()
  bulletInFlight = true
  bulletDelay = stats.bulletDelay
  statShots++
  flashScreen()
  stats.silenced ? playSilencedShot() : playShot()
  stress = Math.min(1, stress + 0.12)

  // CAPTURER la visée MAINTENANT (le réticule visible au clic) —
  // pas à l'impact, sinon le tremblement a dérivé pendant le délai de vol
  const t = getTrembleOffset()
  const aimX =  (t.x / innerWidth)  * 2.0
  const aimY = -(t.y / innerHeight) * 2.0
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2(aimX, aimY), camera)
  pendingShotRay = ray
}

function flashScreen() {
  const f = document.createElement('div')
  f.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,0.22);pointer-events:none;z-index:999;transition:opacity 0.1s'
  document.body.appendChild(f)
  setTimeout(() => { f.style.opacity = '0'; setTimeout(() => f.remove(), 120) }, 40)
}

function resolveBullet() {
  bulletInFlight = false

  // Utiliser le rayon CAPTURÉ AU MOMENT DU TIR (pas la visée actuelle)
  const raycaster = pendingShotRay
  pendingShotRay = null
  if (!raycaster) return

  const stats = getStats()
  let hit = false

  // Trouver le NPC le plus proche intersecté
  let closestNpc  = null
  let closestDist = Infinity
  let closestPt   = null

  for (const npc of npcs) {
    if (!npc.alive) continue
    const { center, size } = npc.getBounds()
    const aabb = new THREE.Box3().setFromCenterAndSize(center, size)
    const pt = new THREE.Vector3()
    const inter = raycaster.ray.intersectBox(aabb, pt)
    if (inter) {
      const dist = camera.position.distanceTo(pt)
      if (dist < closestDist) {
        closestDist = dist
        closestNpc  = npc
        closestPt   = pt.clone()
      }
    }
  }

  // Traceur de balle (part légèrement sous la ligne de visée pour être visible)
  const muzzlePos = camera.position.clone()
    .add(new THREE.Vector3(0, -0.5, 0))

  if (closestNpc) {
    spawnTracer(muzzlePos, closestPt)
    // Éclaboussure de sang au point d'impact
    spawnImpact(closestPt, closestNpc.isCivilian ? 0xcc0000 : 0xaa2222, 16)
    // HEADSHOT : impact dans la zone de la tête (haut de la hitbox)
    const isHeadshot = (closestPt.y - closestNpc.mesh.position.y) > 1.45
    if (closestNpc.isTarget) {
      killTarget(closestNpc, isHeadshot)
    } else if (closestNpc.isCivilian) {
      killCivilian(closestNpc)
    } else if (closestNpc.isGuard) {
      hitGuard(closestNpc, stats)
    }
    hit = true
  }

  // CHOIX MORAL : tir sur le cadenas du conteneur → les victimes s'échappent
  if (!hit && moralLockBox && raycaster.ray.intersectsBox(moralLockBox)) {
    hit = true
    spawnTracer(muzzlePos, moralLockMesh.position)
    spawnImpact(moralLockMesh.position.clone(), 0xc9a227, 10)
    scene.remove(moralLockMesh)
    const lockPos = moralLockMesh.position.clone()
    moralLockMesh = null; moralLockBox = null
    upgradeState.freedVictims = true
    score += 150
    addKillFeed('🔓 Conteneur ouvert — ils s\'échappent... (+150 pts)')
    // trois silhouettes s'enfuient du conteneur
    for (let i = 0; i < 3; i++) {
      const freed = new NPC({
        isCivilian: true, color: 0x8a7a5a,
        x: lockPos.x + 0.5 + i * 0.4, z: lockPos.z + 1 + i * 0.6,
        levelData: currentLevelData, bounds: currentMapInfo.spawnBounds,
      })
      freed.flee(lockPos)
      npcs.push(freed); civilians.push(freed)
    }
  }

  // Tir raté
  if (!hit) {
    // Point d'impact au sol (ou loin devant)
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const shotPos = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(ground, shotPos)) {
      raycaster.ray.at(40, shotPos)
    }
    spawnTracer(muzzlePos, shotPos)
    spawnDust(shotPos)
    // trou d'impact persistant dans le sol (témoin de tes tirs ratés)
    if (shotPos.y < 1) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8),
        new THREE.MeshBasicMaterial({ color: 0x17130f }))
      hole.rotation.x = -Math.PI / 2
      hole.position.set(shotPos.x, 0.035, shotPos.z)
      scene.add(hole); bulletHoles.push(hole)
      if (bulletHoles.length > 24) scene.remove(bulletHoles.shift())
    }

    if (!stats.silenced) {
      stress = Math.min(1, stress + 0.15)
      fleeNearby(shotPos, 20)
      reactNearby(shotPos, 28)
      checkGuardAlert(shotPos, stats)
    }
    addKillFeed('Tir manqué — cibles en fuite')
  }

  updateHUD()
}

function killCivilian(npc) {
  npc.die()
  fleeNearby(npc.mesh.position, 25)
  playCivilKill()
  addKillFeed('⚠ CIVIL ABATTU — MISSION ÉCHOUÉE', true)
  setTimeout(() => {
    document.getElementById('game-over-reason').textContent = 'Vous avez éliminé un civil innocent'
    playGameOver()
    triggerGameOver()
  }, 600)
}

function killTarget(npc, headshot = false) {
  npc.die()
  playKill()
  statHits++
  // Cible en mouvement (véhicule) = tir difficile = plus de points, headshot = ×2
  let bonus = npc.onVehicle ? 400 : (npc.isStill() ? 250 : 120)
  if (headshot) bonus *= 2
  score += bonus
  stress = Math.max(0, stress - 0.1)
  addKillFeed(headshot ? `🎯 HEADSHOT — Cible éliminée (+${bonus} pts)` : `✓ Cible éliminée (+${bonus} pts)`)

  // Double élimination : deux cibles en moins de 4 secondes
  const nowK = performance.now()
  if (nowK - lastTargetKillAt < 4000) {
    score += 100
    addKillFeed('⚡ DOUBLE ÉLIMINATION (+100 pts)')
  }
  lastTargetKillAt = nowK

  // Si c'était la cible du convoi, la jeep part en roue libre et s'arrête
  if (npc === convoyTarget && convoyCar) {
    convoyCar.speed *= 0.15
    convoyTarget = null
  }

  const shotPos = npc.mesh.position.clone()
  // Témoins fuient, gardes réagissent
  fleeNearby(shotPos, 18)
  reactNearby(shotPos, 30)

  for (const g of guards) {
    if (g.alive && g.mesh.position.distanceTo(shotPos) < 22) {
      g.alertReact(camera.position)
    }
  }

  if (!getStats().silenced) {
    checkGuardAlert(shotPos, getStats())
  }

  checkWin()
}

function hitGuard(npc, stats) {
  if (stats.superSilenced) {
    npc.die()
    addKillFeed('Garde éliminé [silencieux+]')
  } else if (stats.silenced) {
    npc.die()
    addKillFeed('Garde éliminé [silencieux]')
    // Autres gardes réagissent mais pas d'alerte immédiate
    for (const g of guards) {
      if (g.alive) g.react(npc.mesh.position)
    }
  } else {
    triggerAlert('⚠ Garde touché — ALERTE DÉCLENCHÉE')
    stress = Math.min(1, stress + 0.45)
  }
}

function checkGuardAlert(shotPos, stats) {
  if (stats.silenced) return
  for (const g of guards) {
    if (!g.alive) continue
    const dist = g.mesh.position.distanceTo(shotPos)
    if (dist < 25) {
      g.react(shotPos)
      if (dist < 12 && !alertActive) {
        triggerAlert('⚠ Garde alerté par le tir')
      }
    }
  }
}

function fleeNearby(pos, radius) {
  for (const npc of npcs) {
    if (!npc.alive) continue
    if (npc.mesh.position.distanceTo(pos) < radius) {
      npc.flee(pos)
    }
  }
}

function reactNearby(pos, radius) {
  for (const npc of npcs) {
    if (!npc.alive || npc.state === 'flee') continue
    if (npc.mesh.position.distanceTo(pos) < radius) {
      npc.react(pos)
    }
  }
}

function isInCameraFOV(worldPos) {
  const toTarget = new THREE.Vector3().subVectors(worldPos, camera.position).normalize()
  const forward  = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  const dot      = forward.dot(toTarget)
  // Toujours utiliser 80° (pas le FOV zoomé) — sinon game over injuste au moindre écart
  const halfFovRad = THREE.MathUtils.degToRad(80 / 2)
  return dot > Math.cos(halfFovRad)
}

function checkFledTargets() {
  for (const t of targets) {
    if (!t.alive || t.state !== 'flee' || t.onVehicle) continue
    const pos = t.mesh.position
    // Cible évadée = hors FOV ET à plus de 12m (délai pour se retourner)
    if (!isInCameraFOV(pos) && pos.distanceTo(camera.position) > 12) {
      triggerFleeGameOver()
      return
    }
  }
}

function checkWin() {
  if (targets.filter(t => t.alive).length === 0 && !killcamActive) startKillcam()
}

// ─── Kill-cam : le temps ralentit sur la dernière cible ────────────
function startKillcam() {
  killcamActive = true
  timeScale = 0.18                       // ralenti dramatique
  const ov = document.createElement('div')
  ov.id = 'killcam-ov'
  ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:140;'
  ov.innerHTML = `
    <div style="position:absolute;top:0;left:0;right:0;height:12vh;background:#000;"></div>
    <div style="position:absolute;bottom:0;left:0;right:0;height:12vh;background:#000;"></div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(120,0,0,0.35) 100%);"></div>
    <div style="position:absolute;top:46%;left:0;right:0;text-align:center;
      font-family:'Courier New',monospace;font-size:30px;letter-spacing:0.45em;
      color:#ff5544;text-shadow:0 0 24px rgba(255,40,20,0.7);">CIBLE NEUTRALISÉE</div>`
  document.body.appendChild(ov)
  setTimeout(() => {
    timeScale = 1
    ov.remove()
    triggerLevelClear()
  }, 1500)
}

function addKillFeed(text, danger = false) {
  const el = document.createElement('div')
  el.className = 'kill-entry'
  el.textContent = text
  if (danger) { el.style.borderLeftColor = '#ff4444'; el.style.color = '#ff8888' }
  killFeed.appendChild(el)
  setTimeout(() => el.remove(), 2800)
}

// ─── HUD ───────────────────────────────────────────────────────────
function updateHUD() {
  hudTargets.textContent = targets.filter(t => t.alive).length
  hudScore.textContent = score
  document.getElementById('hud-zoom').textContent = `×${getZoom().toFixed(1)}`
}

// ─── Inputs ────────────────────────────────────────────────────────
document.addEventListener('contextmenu', e => e.preventDefault())

document.addEventListener('mousedown', e => {
  if (gamePhase !== 'playing') return
  if (e.button === 2) { showScope(); stress = Math.min(1, stress + 0.04) }
  if (e.button === 0 && isVisible()) shoot()
})

document.addEventListener('mouseup', e => {
  if (e.button === 2) {
    hideScope()
    stress = Math.max(0, stress - 0.06)
  }
})

document.addEventListener('mousemove', e => {
  if (!isVisible() || gamePhase !== 'playing') return
  const zoom = getZoom()
  const s = SENSITIVITY * sensMultiplier() / (zoom * 0.4)
  yaw   -= e.movementX * s
  pitch -= e.movementY * s * invertY()
  pitch  = Math.max(-1.1, Math.min(0.5, pitch))
  // Pas de limite sur yaw — rotation libre à 360°
})

document.addEventListener('wheel', e => {
  if (!isVisible() || gamePhase !== 'playing') return
  const stats = getStats()
  const cur = getZoom()
  const next = Math.max(3, Math.min(stats.maxZoom, cur + (e.deltaY > 0 ? -0.5 : 0.5)))
  setZoom(next)
  camera.fov = 60 / next
  camera.updateProjectionMatrix()
}, { passive: true })

document.getElementById('canvas').addEventListener('click', () => {
  if (gamePhase === 'playing') document.getElementById('canvas').requestPointerLock()
})

// Apnée : maintenir Shift pour stabiliser la visée
document.addEventListener('keydown', e => {
  if (campaignPaused) return   // mode PvP actif : le mode histoire ne réagit pas
  if (e.key === 'Shift') holdBreathKey = true

  // Échap : pause / reprise
  if (e.key === 'Escape') {
    if (gamePhase === 'playing') pauseGame()
    else if (gamePhase === 'paused') {
      // Si on est dans les paramètres, on les ferme d'abord
      if (settingsEl.style.display === 'flex') closeSettings()
      else resumeGame()
    }
  }

  // Raccourci de test : touches 1-6 depuis le menu/écrans pour sauter à un niveau
  if (gamePhase !== 'playing' && gamePhase !== 'paused' && gamePhase !== 'briefing' && gamePhase !== 'cinematic' && e.key >= '1' && e.key <= '6') {
    upgradeState.currentLevel = parseInt(e.key)
    launchLevel(upgradeState.currentLevel)
  }
})
document.addEventListener('keyup', e => {
  if (e.key === 'Shift') holdBreathKey = false
})

// ─── Upgrade UI ────────────────────────────────────────────────────
function renderUpgradeUI() {
  document.getElementById('upgrade-points').textContent = `Points disponibles : ${upgradeState.points}`
  document.getElementById('level-info').textContent =
    `Mission ${upgradeState.currentLevel} terminée → Mission ${upgradeState.currentLevel + 1}`

  const grid = document.getElementById('upgrade-grid')
  grid.innerHTML = ''

  for (const [key, upg] of Object.entries(UPGRADES)) {
    const lvl = upgradeState.levels[key]
    const maxed = lvl >= upg.max
    const cost = maxed ? 0 : upg.cost[lvl]
    const canAfford = upgradeState.points >= cost

    const card = document.createElement('div')
    card.className = 'upg-card' + (maxed ? ' maxed' : '')

    card.innerHTML = `
      <div class="upg-name">${upg.name}</div>
      <div class="upg-desc">${upg.desc}</div>
      <div class="upg-level">${Array.from({ length: upg.max }, (_, i) =>
        `<div class="upg-pip ${i < lvl ? 'filled' : ''}"></div>`
      ).join('')}</div>
      <div class="upg-cost">${maxed ? 'MAX' : canAfford ? `Coût : ${cost} pt` : `<span style="color:#ff8080">${cost} pt — insuffisant</span>`}</div>
    `

    if (!maxed && canAfford) {
      card.onclick = () => {
        upgradeState.points -= cost
        upgradeState.levels[key]++
        saveProgress()
        renderUpgradeUI()
      }
    }
    grid.appendChild(card)
  }
}

// ─── Game Loop ─────────────────────────────────────────────────────
// Mis à true par le mode PvP (pvp.js) le temps qu'il prend la main sur
// scene/camera/renderer — sinon la dérive caméra du menu et la boucle
// du mode histoire entreraient en conflit avec le rendu du PvP.
export let campaignPaused = false
export function setCampaignPaused(v) { campaignPaused = v; if (v) clock.getDelta() }

function loop() {
  requestAnimationFrame(loop)
  if (campaignPaused) return
  // timeScale < 1 pendant la kill-cam (ralenti)
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale
  if (gamePhase === 'briefing') return   // cinématique en motion design : pas de rendu WebGL

  if (gamePhase === 'cinematic') {
    updateCinematic(dt)
    renderer.render(scene, camera)
    drawScope()
    return
  }

  if (gamePhase === 'playing') {
    updateMapAmbient(dt)   // météo de la map (pluie du port…)
    // halo du cadenas moral qui pulse (attire l'œil)
    if (moralLockLight) moralLockLight.intensity = 1.5 + Math.sin(performance.now() / 170) * 0.9
    for (const npc of npcs) npc.update(dt)

    // ── Déplacement du convoi (plusieurs jeeps + occupants) ──
    if (convoyCar) {
      convoyCar.baseX += convoyCar.dir * convoyCar.speed * dt
      // Convoi sorti par la droite : s'il reste un colonel VIVANT à bord, il a
      // filé → mission ratée. Sinon (déjà abattu) le convoi s'immobilise
      // hors-champ — plus de boucle infinie qui offrait des essais gratuits.
      if (convoyCar.baseX > 60) {
        if (convoyTarget && convoyTarget.alive) { triggerConvoyEscaped(); return }
        convoyCar.baseX = 60
      }
      for (const v of convoyCar.vehicles) {
        const vx = convoyCar.baseX + v.offsetX
        v.mesh.position.set(vx, 0, -4)
        for (const r of v.riders) {
          if (!r.npc || !r.npc.alive) continue
          r.npc.mesh.position.set(vx + r.dx, r.dy, -4 + r.dz)
          r.npc.mesh.rotation.y = Math.PI / 2   // face au sens de la marche (+X)
        }
      }
    }

    // Vérifier si une cible a fui (sauf cible en véhicule)
    checkFledTargets()
    if (gamePhase !== 'playing') return

    // Résoudre tir
    if (bulletInFlight) {
      bulletDelay -= dt
      if (bulletDelay <= 0) resolveBullet()
    }

    // Stress
    const stats = getStats()
    if (isVisible()) {
      stress += 0.008 * stats.stressRate * dt * 60
    } else {
      stress -= 0.02 * dt * 60
    }
    stress = Math.max(0, Math.min(1, stress))
    setStress(stress)

    // ── Apnée (retenir son souffle) ──
    isHolding = holdBreathKey && isVisible() && breathMeter > 0.02
    if (isHolding) {
      breathMeter = Math.max(0, breathMeter - dt / 4.0)   // ~4s d'apnée max
      setSteady(0.12)                                      // visée quasi stable
      // Mais l'apnée fait monter le stress plus vite (manque d'air)
      stress = Math.min(1, stress + 0.10 * dt)
    } else {
      breathMeter = Math.min(1, breathMeter + dt / 6.0)   // récupération
      setSteady(1)
    }
    setHoldingBreath(isHolding)
    setStress(stress)

    // Audio respiration / cœur
    updateStressAudio(dt, stress, isVisible())

    // HUD barre d'apnée
    const breathFill = document.getElementById('breath-fill')
    if (breathFill) {
      breathFill.style.width = (breathMeter * 100) + '%'
      breathFill.style.background = breathMeter > 0.3 ? '#6ec8ff' : '#ff6644'
    }

    // Alerte (avertissement visuel — ne fait PLUS échouer la mission)
    // Tirer révèle forcément le sniper, donc être repéré ne tue pas.
    // La seule façon d'échouer : laisser une cible fuir, ou toucher un civil.
    if (alertActive) {
      alertTimer -= dt
      if (alertTimer <= 0) {
        alertActive = false
        alertBanner.style.display = 'none'
      }
    }

    // HUD stress
    const pct = stress * 100
    stressFill.style.width = pct + '%'
    stressFill.style.background = pct < 40 ? '#4eff4e' : pct < 70 ? '#ffd44e' : '#ff4444'

    // Tremblement scope
    if (isVisible()) updateTremble(dt)

    // Effets (traceurs, impacts, poussière)
    updateEffects(dt)

    // Caméra sniper (position fixe, rotation libre)
    const [baseX, baseY, baseZ] = currentMapInfo ? currentMapInfo.cameraPos : [0, 8, 30]
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ')
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler)
    camera.position.set(baseX, baseY, baseZ)
    camera.lookAt(baseX + dir.x, baseY + dir.y, baseZ + dir.z)

    updateHUD()
  } else {
    // Effets continuent même hors-jeu (pour la dernière éclaboussure)
    updateEffects(dt)
    // Menu principal : la caméra dérive lentement autour du décor (fond vivant)
    if (gamePhase === 'menu') {
      const tm = performance.now() / 1000
      camera.position.set(Math.sin(tm * 0.07) * 26, 11 + Math.sin(tm * 0.045) * 2, Math.cos(tm * 0.07) * 26)
      camera.lookAt(0, 4, 0)
      camera.fov = 55
      camera.updateProjectionMatrix()
    }
  }

  renderer.render(scene, camera)
  drawScope()
}

loop()

// Le menu principal s'affiche directement au chargement.
// La cinématique 3D d'intro se joue après le clic sur COMMENCER (voir btn-start).

// Développement : ?cine=m3&freeze=12000&port=libres joue (ou fige) une cinématique directement.
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search)
  if (q.has('cine')) {
    menuEl.style.display = 'none'
    gamePhase = 'briefing'
    const params = {}
    for (const [k, v] of q) if (k !== 'cine' && k !== 'freeze') params[k] = v
    cinematic(q.get('cine'), {
      freeze: q.has('freeze') ? +q.get('freeze') : null,
      params,
      onDone: () => showMenu(),
    })
  }
}
