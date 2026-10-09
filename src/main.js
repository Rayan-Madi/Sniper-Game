import * as THREE from 'three'
import { initScene, scene, camera, renderer, ambient, sun, fill, applyRenderQuality } from './scene.js'
import { showScope, hideScope, isVisible, setZoom, getZoom, setStress, setSteady, updateTremble, getTrembleOffset, drawScope } from './scope.js'
import { NPC, STATES, setNpcShadows } from './npc.js'
import { getStats, state as upgradeState, UPGRADES, saveProgress, loadProgress, resetProgress, markBriefingSeen, markPrologueSeen, resetCampaignFlags } from './upgrades.js'
import { getLevel } from './levels.js'
import { MAP_BUILDERS, updateMapAmbient, makeJeep, isMapObject } from './maps.js'
import { playShot, playSilencedShot, playKill, playAlert, playGameOver, playLevelClear, playCivilKill, updateStressAudio, setHoldingBreath, startMissionAmbience, stopMissionAmbience, audioContext, masterNode } from './audio.js'
import { spawnTracer, spawnImpact, spawnDust, updateEffects, clearEffects, spawnBulletHole, clearBulletHoles } from './effects.js'
import { settings, loadSettings, saveSettings, applySettings, sensMultiplier, invertY, resetPvpKeys, effectsReduced } from './settings.js'
import { preloadCharacters, charactersReady, charactersProgress, charactersSettled, modelResources } from './characters.js'
import { initMultiplayerMenu, buildRoundScene, releaseRoundScene } from './pvp.js'
import { playCinematic } from './briefing/index.js'
import { fovFor, aimAngles } from './aim.js'
import { MAX_LEVEL, recordClear, jumpToLevel } from './campaign/progress.js'
import { canPause, canShoot, canClear, canFail, canRebrief } from './campaign/phase.js'
import { rankFor, precisionOf, isHit } from './campaign/rank.js'
import { levelShortcut } from './campaign/shortcuts.js'
import { stepConvoy, releaseConvoy } from './campaign/convoy.js'
import { buildMoralLock, releaseMoralLock } from './campaign/lock.js'
import { missImpact } from './campaign/impact.js'
import { journalNote, JOURNAL_PAPER } from './campaign/journal.js'
import { createStatsPanel, statsRequested } from './gfx/stats.js'
import { PRESETS, presetFor, createResolutionController } from './gfx/quality.js'
import { startWhenReady, waitForCharacters, createLoadingScreen, watchContextLoss, makeModal } from './campaign/loading.js'
import { prepareDuringBriefing, afterPaint } from './campaign/prepare.js'
import { shotFlash, bindFullscreenButton } from './comfort.js'

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

// Hauteur du sol de la carte en cours (dalle du port, tarmac, route du convoi) : pieds des PNJ, tirs manqués
const mapGround = () => (currentMapInfo && currentMapInfo.groundY) || 0

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

// Civil abattu : l'échec tombe 600 ms plus tard. D'ici là, ni pause, ni tir, ni briefing revu.
let failPending = false

// Préréglage graphique en vigueur (applyQuality) ; résolution dynamique d'Auto (contrôleur et échelle de la densité de
// pixels), qui ne pilote l'échelle qu'en mission : 1 partout ailleurs.
let quality = null
let resolution = null
let resolutionScale = 1

// Ce que les gardes de phase (campaign/phase.js) doivent savoir de la mission en cours
const missionPhase = () => ({ phase: gamePhase, killcam: killcamActive, failPending })

// Jeton de mission : incrémenté à chaque lancement, il neutralise les minuteurs de fin d'une mission abandonnée
let missionToken = 0
// Contexte WebGL perdu (onRenderLost) : la page attend d'être rechargée derrière l'écran « Le rendu a été interrompu ».
// Échap n'y reprend pas la partie, et aucune mission ne démarre dessous (attente des modèles, fin d'un briefing).
let renderLost = false

// Choix moral (cadenas du conteneur, niveau du port)
let moralLockMesh = null, moralLockBox = null, moralLockLight = null

// Bonus de tir
let lastTargetKillAt = -99999   // double élimination

// Apnée (retenir son souffle)
let breathMeter = 1        // 1 = plein, 0 = vide
let holdBreathKey = false  // touche Shift enfoncée
let isHolding = false      // apnée effectivement active

// Convoi (véhicule mobile)
let convoyCar = null       // { baseX, z, groundY, dir, speed, vehicles }, détaillé en tête de campaign/convoy.js
let convoyTarget = null    // la cible assise dans le véhicule

// Dernière mission réussie dans cette session (journal de Viktor, écran des améliorations). La sauvegarde, elle,
// pointe déjà sur la mission suivante dès la réussite.
let lastCleared = 0

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
const loadingScreen = createLoadingScreen(document.getElementById('loading-screen'))   // PRÉPARATION DU DOSSIER

// ─── Init ──────────────────────────────────────────────────────────
initScene()
loadSettings()
applyQuality()       // préréglage graphique avant la première image (densité de pixels, ombres)
loadProgress()        // reprend l'histoire là où le joueur s'était arrêté
const charactersLoading = preloadCharacters()   // charge les .glb configurés (rien si aucun), voir characters.js
MAP_BUILDERS[0]()     // décor vivant derrière le menu principal (caméra qui dérive)
initMultiplayerMenu() // mode 1v1 Sniper vs Contre-tueur (voir pvp.js)

// Panneau de performances : ?stats=1 (voir syncStatsPanel)
const STATS_URL = statsRequested(location.search)
const statsPanel = createStatsPanel({ renderer })

// Libellé du bouton selon la progression sauvegardée
function refreshMenuButtons() {
  const lvl = upgradeState.currentLevel
  const done = upgradeState.campaignDone   // M6 réussie, épilogue pas encore vu jusqu'au bout
  document.getElementById('btn-start').textContent =
    done ? 'VOIR LA FIN' : lvl > 1 ? `REPRENDRE : MISSION ${Math.min(lvl, MAX_LEVEL)}` : 'COMMENCER'
  const rs = document.getElementById('btn-reset-save')
  if (rs) rs.style.display = (done || lvl > 1) ? 'block' : 'none'
}
refreshMenuButtons()
const resetBtn = document.getElementById('btn-reset-save')
if (resetBtn) resetBtn.onclick = () => { resetProgress(); refreshMenuButtons() }

// Prologue, une fois par campagne : A (l'offre, le 14 mars) → l'enquête dans l'appartement → B (le message, le
// rappel, le tableau de chasse) → mission 1, avec son briefing s'il n'a pas été vu. Chaque pièce se passe à part.
function playPrologue() {
  menuEl.style.display = 'none'
  hudEl.style.display = 'none'
  instruction.style.opacity = '0' // l'aide des missions (CLIC DROIT : Viser…) ne s'affiche pas sur l'appartement
  gamePhase = 'briefing'          // cinématique en motion design : pas de rendu WebGL
  clock.getDelta()
  cinematic('prologue-a', {
    audio: cinematicAudio(),      // appelé dans le clic : l'AudioContext reprend sur ce geste
    onDone: () => investigate(() => cinematic('prologue-b', {
      audio: cinematicAudio(),
      onDone: () => { markPrologueSeen(); saveProgress(); launchLevel(upgradeState.currentLevel) },
    })),
  })
}

document.getElementById('btn-start').onclick = () => {
  if (upgradeState.campaignDone) playEnding()   // campagne finie : la fin, jamais un rejeu de M6 qui recréditerait
  else if (upgradeState.currentLevel === 1 && !upgradeState.prologueSeen) playPrologue()
  else launchLevel(upgradeState.currentLevel)
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
  const lvl = lastCleared
  const lines = JOURNAL[((lvl - 1) % 6) + 1] || []
  levelClearEl.style.display = 'none'

  const ov = document.createElement('div')
  ov.style.cssText = `position:fixed;inset:0;z-index:170;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,0.9);font-family:'Courier New',monospace;`
  const note = journalNote(lvl, { freedVictims: upgradeState.freedVictims })
  const noteHtml = note ? `<div style="color:${note.color};margin-top:14px;">${note.text}</div>` : ''
  ov.innerHTML = `
    <div style="background:linear-gradient(160deg,${JOURNAL_PAPER.join(',')});color:#2a241c;max-width:480px;width:86%;
      padding:34px 38px;border-radius:3px;box-shadow:0 24px 80px rgba(0,0,0,0.8), inset 0 0 60px rgba(120,100,60,0.25);
      transform:rotate(-1.2deg);position:relative;">
      <div style="position:absolute;left:30px;top:0;bottom:0;width:1px;background:rgba(160,60,60,0.35);"></div>
      <div style="font-size:12px;letter-spacing:0.25em;color:#7a6a4a;margin-bottom:14px;">JOURNAL DE VIKTOR</div>
      <div style="font-size:15px;line-height:2.1;">
        ${lines.map(l => `<div>${l}</div>`).join('')}
        ${noteHtml}
      </div>
      <div style="margin-top:22px;font-size:11px;color:#8a7a5a;">Mission ${lvl} : terminée. <span style="text-decoration:line-through;">cible</span></div>
      <button id="journal-next" style="margin-top:18px;background:transparent;border:1px solid #6a5a3a;color:#4a3d28;
        padding:9px 26px;font-family:inherit;font-size:13px;letter-spacing:0.12em;cursor:pointer;">CONTINUER →</button>
    </div>`
  document.body.appendChild(ov)
  ov.querySelector('#journal-next').onclick = () => { ov.remove(); onDone() }
}
// La mission suivante est déjà enregistrée par triggerLevelClear (recordClear) : il ne reste qu'à la lancer.
document.getElementById('btn-next-level').onclick = () => launchLevel(upgradeState.currentLevel)

// Épilogue, puis nouvelle campagne. Depuis l'écran de réussite de M6, ou depuis le menu si le jeu a été quitté
// avant la fin de l'épilogue (campaignDone est sauvegardé dès la réussite).
function playEnding() {
  menuEl.style.display = 'none'
  levelClearEl.style.display = 'none'
  hudEl.style.display = 'none'
  clearEntities()
  gamePhase = 'briefing'
  clock.getDelta()
  cinematic('epilogue', {
    audio: cinematicAudio(),
    params: { port: upgradeState.freedVictims ? 'libres' : 'enfermes' },
    onDone: () => {
      // Nouvelle campagne : retour à la mission 1, choix du port, briefings vus, prologue et fin remis à zéro
      upgradeState.currentLevel = 1
      resetCampaignFlags()
      saveProgress()
      showMenu()
    },
  })
}
document.getElementById('btn-see-ending').onclick = () => playEnding()

// ── Menu pause ──
const pauseEl    = document.getElementById('pause-menu')
const settingsEl = document.getElementById('settings-screen')
let settingsReturnTo = 'menu'   // d'où on a ouvert les paramètres

document.getElementById('btn-resume').onclick  = () => resumeGame()
document.getElementById('btn-restart').onclick = () => {
  pauseEl.style.display = 'none'
  launchLevel(upgradeState.currentLevel)
}
document.getElementById('btn-rebrief-pause').onclick = () => rebriefFromPause()
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
  syncDisplayUI()
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

// ── Affichage (spec du lot 1 §4.3 et §4.5) ──
// Qualité (appliquée tout de suite, setGraphics), panneau de performances, effets atténués (enregistrés ; le flash du
// tir et chaque cinématique relisent effectsReduced() à leur lancement), plein écran (libellé à jour sur
// fullscreenchange, sortie par Échap comprise).
const choiceGroups = document.querySelectorAll('#settings-display [data-setting]')
const showStatsChk = document.getElementById('set-showstats')
function syncDisplayUI() {
  for (const g of choiceGroups) {
    for (const b of g.querySelectorAll('[data-value]')) b.setAttribute('aria-pressed', String(settings[g.dataset.setting] === b.dataset.value))
  }
  showStatsChk.checked = settings.showStats
}
for (const g of choiceGroups) {
  g.addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]')
    if (!b) return
    if (g.dataset.setting === 'graphics') setGraphics(b.dataset.value)
    else { settings[g.dataset.setting] = b.dataset.value; saveSettings() }
    syncDisplayUI()
  })
}
showStatsChk.onchange = () => { settings.showStats = showStatsChk.checked; saveSettings() }
bindFullscreenButton(document.getElementById('set-fullscreen'))

// ── Remappage des touches PvP ──
// Code physique (e.code) → étiquette lisible. 'Key*'/'Digit*' sont les seuls
// codes utilisés par défaut, mais on reste tolérant à un remap plus exotique.
function codeToLabel(code) {
  if (!code) return 'AUCUNE'
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
// Toute cinématique passe par ici : elle suit les effets atténués du moment (réglage, ou système en Auto).
function cinematic(id, opts) {
  playCinematic(id, { ...opts, reducedMotion: effectsReduced() }).catch(err => { console.error('[cinématique]', err); opts.onDone() })
}

function cinematicAudio() {
  const ctx = audioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return { ctx, dest: masterNode() }
}

// ── Enquête du prologue (module chargé à la demande) ──
// Elle ne doit jamais bloquer la partie : erreur de chargement, de démarrage ou en cours d'image → on enchaîne.
let enquete = null   // { handle, next, ended }
function investigate(onNext, options = {}) {
  abortInvestigation()   // une enquête déjà en cours (ou en chargement) ne reste pas orpheline
  const run = { handle: null, ended: false, next: null }
  run.next = () => {
    if (run.ended) return
    run.ended = true
    if (enquete === run) enquete = null
    if (run.handle) { try { run.handle.stop() } catch (e) { console.error('[enquête]', e) } }
    releaseMouse()
    gamePhase = 'briefing'          // la suite est une cinématique : plus de rendu WebGL
    clock.getDelta()
    onNext()
  }
  enquete = run
  // le canvas garde la dernière image rendue (le décor du menu) : noir pendant le chargement du module, sinon elle
  // apparaît entre la fin de A (#briefing-root masqué) et le noir de l'enquête. setClearColor d'abord : clear() seul
  // reprendrait la couleur de fond du dernier rendu (le ciel du menu)
  try { renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.clear() } catch (e) { /* sans effet */ }
  import('./prologue/investigation.js')
    .then(m => {
      if (run.ended) return
      const h = m.startInvestigation({ renderer, camera, audio: cinematicAudio(), onDone: run.next, options: { stats: STATS_URL || settings.showStats, ...options } })
      if (run.ended) { try { h.stop() } catch (e) { /* déjà démontée */ } return }
      run.handle = h
      gamePhase = 'investigation'
      clock.getDelta()
    })
    .catch(err => { console.error('[enquête]', err); run.next() })
}
// Quitter sans enchaîner (retour au menu, mission lancée par un raccourci de test).
function abortInvestigation() {
  const run = enquete
  if (!run) return
  enquete = null; run.ended = true
  if (run.handle) { try { run.handle.stop() } catch (e) { console.error('[enquête]', e) } }
}

// Briefing de la mission au premier essai seulement (ou sur demande), puis le niveau.
function launchLevel(n, { forceBriefing = false } = {}) {
  abortInvestigation()
  missionToken++
  menuEl.style.display = 'none'
  upgradeEl.style.display = 'none'
  gameOverEl.style.display = 'none'
  levelClearEl.style.display = 'none'
  pauseEl.style.display = 'none'
  settingsEl.style.display = 'none'
  hudEl.style.display = 'none'
  instruction.style.opacity = '0'   // l'aide revient avec la mission (startLevel), jamais sous le briefing
  hideScope()
  releaseMouse()

  // Nettoie la scène AVANT le briefing (sinon résidus du niveau précédent)
  clearEntities()

  const idx = (n - 1) % 6
  if (!forceBriefing && upgradeState.briefingSeen[idx]) { enterLevel(n); return }
  stopMissionAmbience()   // jamais la nappe d'une mission sous un briefing
  gamePhase = 'briefing'
  clock.getDelta()
  // La mission se monte pendant la cinématique et ses shaders s'y compilent (spec du lot 1 §4.6, campaign/prepare.js) :
  // si les modèles sont chargés, sur son écran noir (afterPaint : le clic ne reste pas figé le temps du montage), avant
  // que son animation ne démarre (ready) ; sinon à leur arrivée. Rien n'est rendu en phase 'briefing' : la mission
  // n'apparaît jamais sous la cinématique.
  const token = missionToken
  const prep = prepareDuringBriefing({
    settled: charactersSettled,
    ready: charactersReady,
    prepare: () => prepareLevel(n),
    isCurrent: () => token === missionToken && !renderLost,
    onError: err => console.error('[préparation]', err),
    schedule: afterPaint,
  })
  cinematic('m' + (idx + 1), {
    audio: cinematicAudio(),
    ready: prep.begun,
    onDone: () => { markBriefingSeen(idx); saveProgress(); clock.getDelta(); enterLevel(n, prep) },
  })
}

// Montage de la mission n pendant son briefing, par la fonction du jeu (mountLevel), puis compilation de ses shaders
// avec l'éclairage de sa carte : la première image de la mission n'a plus à les compiler. Les ombres des lumières
// (variantes de profondeur) restent compilées par la première image. Appelée par launchLevel (prepareDuringBriefing)
// et par la route ?memtest=1 (étape premiere-image).
function prepareLevel(n) {
  mountLevel(n)
  renderer.compile(scene, camera)
}

// Départ de la mission n une fois les modèles chargés (spec du lot 1 §4.4) : tout de suite s'ils le sont, le cas
// ordinaire (rien ne change alors), sinon derrière l'écran PRÉPARATION DU DOSSIER, 20 s au plus, sans rendu WebGL ni
// nappe de mission. Sans cette attente, une mission lancée juste après l'ouverture du jeu (REPRENDRE, briefing déjà vu)
// partait avec des PNJ procéduraux. Une mission relancée ou quittée pendant l'attente ne démarre pas (jeton de mission),
// ni une mission dont le rendu a été interrompu entre-temps (pendant l'attente ou son briefing). prep : la préparation
// faite pendant le briefing (launchLevel), reprise par startLevel ; null sans briefing.
function enterLevel(n, prep = null) {
  const token = missionToken
  const isCurrent = () => token === missionToken && !renderLost
  startWhenReady({
    settled: charactersSettled,
    wait: () => {
      gamePhase = 'loading'
      stopMissionAmbience()
      return waitForCharacters({ ready: charactersReady, progress: charactersProgress, show: loadingScreen.show, hide: loadingScreen.hide, isCurrent })
    },
    start: () => startLevel(n, prep),
    isCurrent,
  })
}

function clearConvoy() {
  if (convoyCar) {
    releaseConvoy(convoyCar)
    convoyCar = null; convoyTarget = null
  }
}

// Retire toutes les entités de jeu de la scène (PNJ, véhicules, effets)
function clearEntities() {
  unmountLevel()
}

// Démontage de la scène d'une mission (PNJ, convoi, cadenas, impacts, effets) : relance, mission suivante, retour au
// menu, et la route ?memtest=1. PNJ, jeeps, cadenas et effets libèrent leurs ressources GPU ; les trous d'impact et
// les modèles GLB partagent les leurs (effects.js, characters.js). Un PNJ abattu déjà retiré au bout de 8 s ne
// libère rien de plus (NPC.dispose est idempotent).
function unmountLevel() {
  for (const npc of npcs) npc.dispose()
  clearConvoy()
  removeMoralLock()   // sinon le cadenas du port restait sous le menu, posé dans la rue
  npcs = []; targets = []; guards = []; civilians = []
  clearBulletHoles()
  clearEffects()
}

// prep : mission montée pendant son briefing (launchLevel), reprise telle quelle. Sinon (sans briefing, modèles arrivés
// trop tard, montage en échec), elle est démontée et montée ici, comme avant le lot 1.
function startLevel(n, prep = null) {
  const prepared = !!prep && prep.take()
  if (!prepared) clearEntities()
  breathMeter = 1; isHolding = false; holdBreathKey = false
  statShots = 0; statHits = 0; statStart = performance.now(); statAlerts = 0
  timeScale = 1; killcamActive = false; failPending = false; lastTargetKillAt = -99999
  const token = missionToken   // minuteurs de cette mission : sans effet si elle est relancée ou abandonnée
  if (((n - 1) % 6) + 1 === 3) upgradeState.freedVictims = false   // chaque essai du port repart d'un choix vierge

  if (!prepared) mountLevel(n)

  // Cadenas du port : indice au bout de quelques secondes
  if (moralLockMesh) {
    setTimeout(() => {
      if (token === missionToken && gamePhase === 'playing' && moralLockMesh) {
        addKillFeed('👂 Des coups sourds... le conteneur rouge, à gauche.')
      }
    }, 5000)
  }

  stress = 0; alertActive = false; alertTimer = 0; bulletInFlight = false
  document.getElementById('game-over-reason').textContent = 'Vous avez été repéré'
  score = upgradeState.totalScore

  hudEl.style.display = 'block'
  hudLevel.textContent = `${currentLevelData.name}  ·  ${Math.min(n, MAX_LEVEL)}/${MAX_LEVEL}`
  alertBanner.style.display = 'none'
  startMissionAmbience()   // nappe sonore de tension pendant la mission

  // Dossier d'indices (cible cachée)
  const hidden = currentMapInfo.hiddenTarget
  const dossier = document.getElementById('target-dossier')
  if (hidden && dossier) {
    document.getElementById('dossier-text').textContent = hidden.clue
    dossier.style.display = 'block'
  } else if (dossier) {
    dossier.style.display = 'none'
  }

  updateHUD()
  gamePhase = 'playing'
  clock.getDelta()

  // Aide des 5 premières secondes. Quitter ou relancer la mission la masque (showMenu, launchLevel) ; le jeton
  // empêche seulement l'ancien minuteur d'éteindre l'aide de la mission suivante.
  instruction.style.opacity = '1'
  setTimeout(() => { if (token === missionToken) instruction.style.opacity = '0' }, 5000)
}

// Montage de la scène d'une mission (carte, PNJ, cadenas, convoi, caméra de départ), sans écran, son ni minuteur :
// startLevel l'appelle, la route ?memtest=1 aussi. Le hasard est tiré dans le même ordre qu'avant l'extraction.
function mountLevel(n) {
  removeMoralLock()
  applyQuality()   // ombre des personnages pour les PNJ qui suivent, résolution dynamique repartie de 1

  currentLevelData = getLevel(n)

  // Choisir la map selon le niveau (cyclique si > 5)
  const mapIdx = (n - 1) % MAP_BUILDERS.length
  currentMapInfo = MAP_BUILDERS[mapIdx]()

  // Cadenas du choix moral (port) : un tir dessus libère les victimes du conteneur
  if (currentMapInfo.moralLock) {
    ({ mesh: moralLockMesh, box: moralLockBox, light: moralLockLight } = buildMoralLock(currentMapInfo.moralLock.pos))
  }

  // Positionner la caméra depuis le point sniper de la map
  const [cx, cy, cz] = currentMapInfo.cameraPos
  camera.position.set(cx, cy, cz)

  // Calculer yaw/pitch initial depuis cameraTarget si défini
  if (currentMapInfo.cameraTarget) {
    ({ yaw, pitch } = aimAngles(currentMapInfo.cameraPos, currentMapInfo.cameraTarget))
  } else {
    yaw = 0; pitch = 0
  }

  setZoom(4)   // le champ de vision suit dans loop() (syncFov)

  const b = currentMapInfo.spawnBounds
  const groundY = mapGround()   // les pieds des PNJ sur la dalle du port, le tarmac, la route du convoi
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
      groundY,
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

  // Spawner gardes
  for (let i = 0; i < currentLevelData.guards; i++) {
    const npc = new NPC({
      isGuard: true,
      color: 0x334433,
      x: b.minX + Math.random() * (b.maxX - b.minX),
      z: b.minZ + Math.random() * (b.maxZ - b.minZ),
      groundY,
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
      groundY,
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

    // Route le long de X à z = -4, chaussée à groundY : jeeps et occupants sont posés dessus (campaign/convoy.js)
    convoyCar = { baseX: -55, z: -4, groundY, dir: 1, speed: 8.5, vehicles }
  }
}

// Cadenas du port retiré et libéré (tiré, mission relancée ou quittée).
function removeMoralLock() {
  if (moralLockMesh) releaseMoralLock(moralLockMesh)
  moralLockMesh = null; moralLockBox = null; moralLockLight = null
}

function showMenu() {
  abortInvestigation()
  missionToken++   // la mission est abandonnée : ses minuteurs de fin (kill-cam, civil abattu) ne doivent plus tomber sur le menu
  unmountLevel()   // PNJ, convoi, cadenas, impacts et effets de la mission quittée
  MAP_BUILDERS[0]()   // la carte de la mission est libérée, la rue revient derrière le menu (comme au démarrage)
  applyQuality()      // hors mission, la résolution dynamique rend la densité pleine
  hideScope()
  releaseMouse()
  hudEl.style.display = 'none'
  instruction.style.opacity = '0'   // l'aide d'une mission quittée avant 5 s ne reste pas sous le menu
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
  if (!canPause(missionPhase())) return   // ralenti de la dernière cible, civil abattu : la fin de mission arrive
  gamePhase = 'paused'
  hideScope()
  releaseMouse()
  pauseEl.style.display = 'flex'
}

function resumeGame() {
  if (renderLost) return   // seul chemin de la reprise (Échap, REPRENDRE) : jamais sous « Le rendu a été interrompu »
  if (gamePhase !== 'paused') return
  pauseEl.style.display = 'none'
  settingsEl.style.display = 'none'
  gamePhase = 'playing'
  clock.getDelta()   // évite un grand dt après la pause
}

// Un écran de fin ne s'ouvre jamais sous la pause, ni sous les paramètres ouverts depuis elle.
function hidePause() {
  pauseEl.style.display = 'none'
  settingsEl.style.display = 'none'
}

// Écran de fin (échec, réussite) : seul à l'écran, sans la pause et sans l'aide des commandes, qui restait pâle
// dessous jusqu'à son minuteur de 5 s quand la mission finissait plus tôt.
function clearForEndScreen() {
  hidePause()
  instruction.style.opacity = '0'
}

// REVOIR LE BRIEFING depuis la pause : la cinématique se joue par-dessus la mission figée (la boucle ne met rien à
// jour en phase 'briefing'), puis on revient à la pause sans rien perdre : cibles, score, chrono du rapport.
// Sur l'écran d'échec, le même bouton (btn-rebrief) relance la mission avec son briefing.
function rebriefFromPause() {
  if (!canRebrief(missionPhase())) return
  const t0 = performance.now()
  const token = missionToken
  hidePause()
  stopMissionAmbience()
  gamePhase = 'briefing'
  clock.getDelta()
  cinematic('m' + (((upgradeState.currentLevel - 1) % 6) + 1), {
    audio: cinematicAudio(),   // appelé dans le clic : l'AudioContext reprend sur ce geste
    onDone: () => {
      if (token !== missionToken) return   // mission quittée entre-temps : rien à rétablir
      statStart += performance.now() - t0   // le temps passé dans le briefing ne compte pas dans le rapport
      gamePhase = 'paused'
      pauseEl.style.display = 'flex'
      startMissionAmbience()
      clock.getDelta()
    },
  })
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
  addKillFeed(reason || '⚠ ALERTE : restez caché', true)

  // Gardes réagissent
  for (const g of guards) {
    if (g.alive) g.alertReact(camera.position)
  }
}

function releaseMouse() {
  if (document.pointerLockElement) document.exitPointerLock()
}

function triggerGameOver(reason) {
  if (!canFail(missionPhase())) return   // une seule fin de mission : pas pendant la kill-cam, pas après la réussite
  gamePhase = 'dead'
  if (reason) document.getElementById('game-over-reason').textContent = reason
  stopMissionAmbience()
  hideScope()
  releaseMouse()
  clearForEndScreen()
  hudEl.style.display = 'none'
  playGameOver()
  gameOverEl.style.display = 'flex'
}

function triggerLevelClear() {
  // Défense en profondeur : canFail refuse déjà l'échec pendant la kill-cam. Mission déjà finie (échec, réussite),
  // quittée ou sous la pause : rien n'est crédité, la mission n'avance pas.
  if (!canClear(missionPhase())) return
  gamePhase = 'cleared'
  stopMissionAmbience()
  hideScope()
  releaseMouse()
  clearForEndScreen()
  playLevelClear()
  hudEl.style.display = 'none'
  // Réussite enregistrée en une fois : points, score ET mission suivante, avant la sauvegarde.
  // Quitter le jeu ici ne doit pas laisser rejouer (et recréditer) la mission qu'on vient de réussir.
  const n = upgradeState.currentLevel
  const reward = currentLevelData.pointsReward
  const { last } = recordClear(upgradeState, { level: n, reward, score })
  lastCleared = n
  saveProgress()
  // Rapport de mission : rang + temps, tirs, précision
  const elapsed = Math.max(1, Math.round((performance.now() - statStart) / 1000))
  const precision = precisionOf({ shots: statShots, hits: statHits })
  const { label: rank, color: rankCol } = rankFor({ shots: statShots, hits: statHits, alerts: statAlerts })
  document.getElementById('lc-score').innerHTML =
    `<div style="font-size:24px;letter-spacing:0.35em;color:${rankCol};margin-bottom:8px;text-shadow:0 0 18px ${rankCol}55;">${rank}</div>` +
    `Score : ${score} pts  ·  +${reward} point${reward > 1 ? 's' : ''} d'amélioration<br>` +
    `<span style="color:rgba(200,240,200,0.55);font-size:12px;">⏱ ${elapsed}s &nbsp;·&nbsp; ${statShots} tir${statShots > 1 ? 's' : ''} &nbsp;·&nbsp; précision ${precision}% &nbsp;·&nbsp; alertes ${statAlerts}</span>`

  // Dernier niveau : on propose de voir la fin au lieu d'enchaîner
  document.getElementById('lc-title').textContent = last ? 'RÉSEAU ANÉANTI' : 'MISSION ACCOMPLIE'
  document.getElementById('btn-upgrades').style.display    = last ? 'none' : 'block'
  document.getElementById('btn-see-ending').style.display  = last ? 'block' : 'none'

  levelClearEl.style.display = 'flex'
}

function triggerFleeGameOver() {
  if (!canFail(missionPhase())) return
  gamePhase = 'dead'
  stopMissionAmbience()
  hideScope()
  releaseMouse()
  clearForEndScreen()
  hudEl.style.display = 'none'
  document.getElementById('game-over-reason').textContent = 'Une cible a fui votre champ de vision'
  gameOverEl.style.display = 'flex'
}

// Le convoi a traversé toute la zone sans que le colonel soit abattu : il file
// vers la frontière. Une seule fenêtre de tir — mission ratée (pas de 2e passage).
function triggerConvoyEscaped() {
  if (!canFail(missionPhase())) return
  gamePhase = 'dead'
  stopMissionAmbience()
  hideScope()
  releaseMouse()
  clearForEndScreen()
  hudEl.style.display = 'none'
  document.getElementById('game-over-reason').textContent = 'Le convoi a filé : le colonel a rejoint la frontière'
  gameOverEl.style.display = 'flex'
}

// ─── Tir ───────────────────────────────────────────────────────────
function shoot() {
  if (!isVisible() || bulletInFlight || !canShoot(missionPhase())) return   // ni pendant le ralenti, ni après un civil abattu
  const stats = getStats()
  bulletInFlight = true
  bulletDelay = stats.bulletDelay
  statShots++
  shotFlash(effectsReduced())   // 0,22 d'opacité, 0,06 en effets atténués
  stats.silenced ? playSilencedShot() : playShot()
  stress = Math.min(1, stress + 0.12)

  // CAPTURER la visée MAINTENANT (le réticule visible au clic) —
  // pas à l'impact, sinon le tremblement a dérivé pendant le délai de vol
  const t = getTrembleOffset()
  const aimX =  (t.x / innerWidth)  * 2.0
  const aimY = -(t.y / innerHeight) * 2.0
  const ray = new THREE.Raycaster()
  syncFov()   // lunette ouverte et tir dans la même image : le rayon suit déjà le zoom
  ray.setFromCamera(new THREE.Vector2(aimX, aimY), camera)
  pendingShotRay = ray
}

function resolveBullet() {
  bulletInFlight = false

  // Utiliser le rayon CAPTURÉ AU MOMENT DU TIR (pas la visée actuelle)
  const raycaster = pendingShotRay
  pendingShotRay = null
  if (!raycaster) return

  const stats = getStats()

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

  // Ce que la balle touche : le PNJ le plus proche, sinon le cadenas du port, sinon rien
  const kind = closestNpc
    ? (closestNpc.isTarget ? 'target' : closestNpc.isCivilian ? 'civilian' : 'guard')
    : (moralLockBox && raycaster.ray.intersectsBox(moralLockBox)) ? 'lock' : 'miss'
  if (isHit(kind)) statHits++   // précision du rapport de fin : le cadenas compte, libérer n'interdit pas FANTÔME

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
  }

  // CHOIX MORAL : tir sur le cadenas du conteneur → les victimes s'échappent
  if (kind === 'lock') {
    spawnTracer(muzzlePos, moralLockMesh.position)
    spawnImpact(moralLockMesh.position.clone(), 0xc9a227, 10)
    const lockPos = moralLockMesh.position.clone()
    removeMoralLock()
    upgradeState.freedVictims = true
    score += 150
    addKillFeed('🔓 Conteneur ouvert : ils s\'échappent... (+150 pts)')
    // trois silhouettes s'enfuient du conteneur
    for (let i = 0; i < 3; i++) {
      const freed = new NPC({
        isCivilian: true, color: 0x8a7a5a,
        x: lockPos.x + 0.5 + i * 0.4, z: lockPos.z + 1 + i * 0.6, groundY: mapGround(),
        levelData: currentLevelData, bounds: currentMapInfo.spawnBounds,
      })
      freed.flee(lockPos)
      npcs.push(freed); civilians.push(freed)
    }
  }

  // Tir raté
  if (kind === 'miss') {
    // Point d'impact sur le sol de la carte (ou loin devant)
    const { point: shotPos, hole: holePos } = missImpact(raycaster.ray, mapGround())
    spawnTracer(muzzlePos, shotPos)
    spawnDust(shotPos)
    // trou d'impact persistant dans le sol (témoin de tes tirs ratés)
    if (holePos) spawnBulletHole(holePos)

    if (!stats.silenced) {
      stress = Math.min(1, stress + 0.15)
      fleeNearby(shotPos, 20)
      reactNearby(shotPos, 28)
      checkGuardAlert(shotPos, stats)
    }
    addKillFeed('Tir manqué : cibles en fuite')
  }

  updateHUD()
}

function killCivilian(npc) {
  npc.die()
  fleeNearby(npc.mesh.position, 25)
  playCivilKill()
  addKillFeed('⚠ CIVIL ABATTU : MISSION ÉCHOUÉE', true)
  failPending = true   // d'ici l'échec : ni pause, ni tir, ni briefing revu
  const token = missionToken
  setTimeout(() => {
    if (token !== missionToken) return   // mission relancée entre-temps
    triggerGameOver('Vous avez éliminé un civil innocent')   // le son d'échec une seule fois, dans triggerGameOver
  }, 600)
}

function killTarget(npc, headshot = false) {
  npc.die()
  playKill()
  // Cible en mouvement (véhicule) = tir difficile = plus de points, headshot = ×2
  let bonus = npc.onVehicle ? 400 : (npc.isStill() ? 250 : 120)
  if (headshot) bonus *= 2
  score += bonus
  stress = Math.max(0, stress - 0.1)
  addKillFeed(headshot ? `🎯 HEADSHOT : cible éliminée (+${bonus} pts)` : `✓ Cible éliminée (+${bonus} pts)`)

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
    triggerAlert('⚠ Garde touché : ALERTE DÉCLENCHÉE')
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
  // Pendant le ralenti, ni pause, ni tir, ni échec (gardes de phase) : la fin du minuteur trouve la mission en jeu.
  // Le ralenti et le calque s'arrêtent dans tous les cas, la réussite seulement pour la mission qui l'a lancé.
  const token = missionToken
  setTimeout(() => {
    timeScale = 1
    ov.remove()
    if (token === missionToken) triggerLevelClear()   // mission relancée entre-temps : pas d'écran de réussite
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
  setZoom(next)   // le champ de vision suit dans loop() (syncFov)
}, { passive: true })

document.getElementById('canvas').addEventListener('click', () => {
  if (gamePhase === 'playing') document.getElementById('canvas').requestPointerLock()
})

// Clavier du mode histoire : toujours les touches physiques (e.code), le clavier de Rayan est en AZERTY.
const isShift = code => code === 'ShiftLeft' || code === 'ShiftRight'

// Écrans où l'on tape (code de partie, touche à remapper) : le raccourci de mission s'y tait.
const TYPING_SCREENS = ['mp-menu', 'mp-create', 'mp-join', 'mp-result', 'settings-screen']
const overlayOpen = () => TYPING_SCREENS.some(id => {
  const el = document.getElementById(id)
  return !!el && getComputedStyle(el).display !== 'none'
})

// Apnée : maintenir Maj pour stabiliser la visée
document.addEventListener('keydown', e => {
  if (campaignPaused) return   // mode PvP actif : le mode histoire ne réagit pas
  if (renderLost) return       // écran « Le rendu a été interrompu » : ni reprise de la partie dessous, ni mission lancée
  if (isShift(e.code)) holdBreathKey = true

  // Échap : pause / reprise
  if (e.code === 'Escape' && !e.repeat) {
    if (gamePhase === 'playing') pauseGame()
    else if (gamePhase === 'paused') {
      // Si on est dans les paramètres, on les ferme d'abord
      if (settingsEl.style.display === 'flex') closeSettings()
      else resumeGame()
    }
  }

  // Raccourci de développement : 1 à 6 (rangée du haut ou pavé numérique) depuis le menu ou un écran de fin pour
  // sauter à une mission (campaign/shortcuts.js). Jamais en production, ni pendant une saisie : les codes PvP
  // contiennent des chiffres.
  if (e.target.closest && e.target.closest('input, textarea')) return
  const n = levelShortcut(e.code, { dev: import.meta.env.DEV, phase: gamePhase, overlayOpen })   // appelée au besoin
  if (n !== null) {
    jumpToLevel(upgradeState, n)   // la campagne reprend à cette mission : elle n'est plus finie
    launchLevel(upgradeState.currentLevel)
  }
})
document.addEventListener('keyup', e => {
  if (isShift(e.code)) holdBreathKey = false
})
// Alt-Tab avec Maj enfoncée : le keyup n'arrive jamais à la page, l'apnée resterait bloquée.
window.addEventListener('blur', () => { holdBreathKey = false })

// ─── Upgrade UI ────────────────────────────────────────────────────
function renderUpgradeUI() {
  document.getElementById('upgrade-points').textContent = `Points disponibles : ${upgradeState.points}`
  document.getElementById('level-info').textContent =
    `Mission ${lastCleared} terminée → Mission ${lastCleared + 1}`

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
      <div class="upg-cost">${maxed ? 'MAX' : canAfford ? `Coût : ${cost} pt` : `<span style="color:#ff8080">${cost} pt, insuffisant</span>`}</div>
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

// Champ de vision de la mission : 60 / zoom lunette ouverte, 60 lunette fermée.
function syncFov() {
  const f = fovFor(getZoom(), isVisible())
  if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix() }
}

// Caméra sniper (position fixe, rotation libre, zoom de la lunette) : chaque image de la mission, et la vue de départ
// de la route ?memtest=1.
function aimMissionCamera() {
  syncFov()
  const [baseX, baseY, baseZ] = currentMapInfo ? currentMapInfo.cameraPos : [0, 8, 30]
  const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ')
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler)
  camera.position.set(baseX, baseY, baseZ)
  camera.lookAt(baseX + dir.x, baseY + dir.y, baseZ + dir.z)
}

// Menu principal : la caméra tourne lentement autour du décor (tm en secondes).
function driftMenuCamera(tm) {
  camera.position.set(Math.sin(tm * 0.07) * 26, 11 + Math.sin(tm * 0.045) * 2, Math.cos(tm * 0.07) * 26)
  camera.lookAt(0, 4, 0)
  camera.fov = 55
  camera.updateProjectionMatrix()
}

// Préréglage graphique (spec du lot 1 §4.3, gfx/quality.js) : densité de pixels et ombre du soleil (scene.js), ombre
// des personnages selon leur rôle (npc.js : PNJ créés ensuite, et ceux déjà en scène), résolution dynamique d'Auto
// remise à 1. Au démarrage, au changement de réglage, à chaque montage de mission et au retour au menu.
function applyQuality() {
  quality = presetFor(settings.graphics, window.devicePixelRatio)
  resolution = quality.dynamic ? createResolutionController({ min: 0.7, max: 1 }) : null
  resolutionScale = 1
  applyRenderQuality(quality, resolutionScale)
  setNpcShadows(quality.npcShadows)
  for (const npc of npcs) npc.applyShadows(quality.npcShadows)
}

// Qualité choisie dans les Paramètres : enregistrée et appliquée tout de suite (en pause aussi).
function setGraphics(name) {
  settings.graphics = name
  saveSettings()
  applyQuality()
}

// Résolution dynamique (Auto) : nourrie de la durée de chaque image en mission seulement ; la densité de pixels n'est
// réappliquée que quand l'échelle change (au plus une fois par seconde, voir createResolutionController). La durée est
// l'écart entre les horodatages de deux images, tels que requestAnimationFrame les passe à loop : sur un écran à 60 Hz,
// elle ne descend jamais sous 16,7 ms, et le contrôleur compte une image à la cadence de l'écran comme rapide (sinon
// une échelle abaissée par un à-coup ne remonterait plus de la mission). applyQuality en recrée un, à l'échelle 1, à
// chaque montage de mission, au retour au menu et au changement de réglage.
function feedResolution(frameMs, t) {
  if (!resolution || gamePhase !== 'playing') return
  const s = resolution.push(frameMs, t)
  if (s !== resolutionScale) {
    resolutionScale = s
    applyRenderQuality(quality, resolutionScale)
  }
}

// Panneau de performances (?stats=1 ou réglage « Afficher les performances ») : toutes les phases, PvP compris (sa
// boucle rend, celle-ci mesure), sauf l'enquête, qui affiche son propre compteur au même endroit. Il relève la
// dernière image rendue.
let lastFrameAt = performance.now()
function syncStatsPanel(frameMs) {
  const wanted = (STATS_URL || settings.showStats) && gamePhase !== 'investigation'
  if (wanted && !statsPanel.visible) statsPanel.show()
  else if (!wanted && statsPanel.visible) statsPanel.hide()
  statsPanel.update(frameMs)
}

// rafAt : horodatage que requestAnimationFrame passe au rappel, le début de l'image (aligné sur la synchro de l'écran).
// Il mesure la durée de l'image pour le panneau et la résolution dynamique : performance.now(), lu dans le rappel,
// arriverait avec un retard variable sur la synchro (autres rappels, tâches), et cette gigue grossirait la p95 des
// écarts jusqu'à empêcher la remontée à la cadence de l'écran (relecture de L4, spec §8). Le premier appel, direct, n'a
// pas d'horodatage : performance.now(). La première image d'après peut commencer avant lui : durée nulle, pas négative.
function loop(rafAt) {
  requestAnimationFrame(loop)
  const frameAt = Number.isFinite(rafAt) ? rafAt : performance.now()
  const frameMs = Math.max(0, frameAt - lastFrameAt)
  lastFrameAt = frameAt
  syncStatsPanel(frameMs)
  feedResolution(frameMs, frameAt)
  if (campaignPaused) return
  // timeScale < 1 pendant la kill-cam (ralenti)
  const dt = Math.min(clock.getDelta(), 0.05) * timeScale
  if (gamePhase === 'investigation') {   // l'enquête du prologue : sa propre scène, la caméra du jeu
    const run = enquete
    if (run && run.handle) {
      try { run.handle.update(dt); renderer.render(run.handle.scene, camera) }
      catch (e) { console.error('[enquête]', e); run.next() }
    }
    return
  }
  // Cinématique en motion design, attente des modèles (écran PRÉPARATION DU DOSSIER) : pas de rendu WebGL, le canevas
  // garde sa dernière image
  if (gamePhase === 'briefing' || gamePhase === 'loading') return

  if (gamePhase === 'playing') {
    updateMapAmbient(dt)   // météo de la map (pluie du port…)
    // halo du cadenas moral qui pulse (attire l'œil)
    if (moralLockLight) moralLockLight.intensity = 1.5 + Math.sin(performance.now() / 170) * 0.9
    for (const npc of npcs) npc.update(dt)

    // ── Déplacement du convoi (plusieurs jeeps + occupants, abattus compris) ──
    // Convoi sorti par la droite : s'il reste un colonel VIVANT à bord, il a filé → mission ratée. Sinon (déjà
    // abattu) le convoi s'immobilise hors champ : pas de boucle infinie qui offrirait des essais gratuits.
    if (convoyCar && stepConvoy(convoyCar, dt, convoyTarget)) { triggerConvoyEscaped(); return }

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

    aimMissionCamera()

    updateHUD()
  } else {
    // Effets continuent même hors-jeu (pour la dernière éclaboussure)
    updateEffects(dt)
    // Menu principal : la caméra dérive lentement autour du décor (fond vivant)
    if (gamePhase === 'menu') {
      driftMenuCamera(performance.now() / 1000)
    } else {
      syncFov()   // pause, échec, réussite : lunette fermée, la vue revient à 60° sous l'écran affiché
    }
  }

  renderer.render(scene, camera)
  drawScope()
}

loop()

// ─── Contexte WebGL perdu (spec du lot 1 §4.4) ─────────────────────
// Pilote graphique réinitialisé, mise en veille, carte saturée : plus rien ne s'affiche. La partie se met en pause
// derrière l'écran « Le rendu a été interrompu » et le pointeur revient ; elle y reste (renderLost : ni Échap ni
// REPRENDRE ne la reprennent, une mission en attente des modèles ou en briefing ne démarre pas ; makeModal : le reste
// de la page est inerte, le menu pause dessous n'est plus atteignable au clavier). Contexte rendu par le navigateur, ou
// RECHARGER : la page se recharge (la sauvegarde est faite à chaque réussite). Pendant la kill-cam ou un échec en
// attente, la pause est refusée (canPause) : la fin de mission tombe sous l'écran, et la réussite est enregistrée.
const contextLostEl = document.getElementById('context-lost')
function onRenderLost() {
  renderLost = true
  if (gamePhase === 'playing') pauseGame()
  hideScope()
  releaseMouse()
  contextLostEl.hidden = false
  makeModal(contextLostEl)
  document.getElementById('btn-context-reload').focus()
}
watchContextLoss(renderer.domElement, { onLost: onRenderLost, onRestored: () => location.reload() })
document.getElementById('btn-context-reload').onclick = () => location.reload()

// Le menu principal s'affiche directement au chargement.
// Le prologue se joue après le clic sur COMMENCER, une fois par campagne (voir playPrologue).

// Développement : ?cine=m3&freeze=12000&port=libres joue (ou fige) une cinématique directement.
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search)
  // Mémoire GPU / JS de la partie (contrôle du nettoyage, spec §6.8) : __mem() dans la console. images : rendus de la
  // scène depuis le chargement (renderer.info), immobile pendant une cinématique, où rien ne doit être rendu.
  window.__mem = () => {
    let objets = 0; scene.traverse(() => objets++)
    const i = renderer.info
    return { geometries: i.memory.geometries, textures: i.memory.textures, programmes: i.programs ? i.programs.length : 0,
      appels: i.render.calls, triangles: i.render.triangles, objets, images: i.render.frame,
      tasJSMo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null }
  }
  // Décor de la scène (scripts/capture-mission.mjs, retour au menu) : couleur du fond (celle de la carte affichée,
  // 87a0b0 pour la rue) et type des objets qui ne sont ni la carte ni les trois lumières du jeu (impacts, effets,
  // cadenas, PNJ ou jeeps restés dans la scène).
  window.__decor = () => ({ fond: scene.background && scene.background.getHexString(),
    horsCarte: scene.children.filter(o => !isMapObject(o) && o !== ambient && o !== sun && o !== fill).map(o => o.type) })
  // Visée (relectures du zoom) : __aim() dans la console
  window.__aim = () => ({ fov: camera.fov, zoom: getZoom(), scoped: isVisible() })
  // Mission en cours (relectures des gardes de phase, vérifications sans interface) : __mission() dans la console
  window.__mission = () => ({ ...missionPhase(), cibles: targets.filter(t => t.alive).length,
    pnj: npcs.map(n => n.mesh.position.toArray().map(v => +v.toFixed(3))),
    chronoMs: Math.round(performance.now() - statStart), tirs: statShots, touches: statHits, alertes: statAlerts, score,
    balle: bulletInFlight, sol: mapGround(), souffle: holdBreathKey,
    jeeps: convoyCar ? convoyCar.vehicles.map(v => v.mesh.position.toArray().map(c => +c.toFixed(3))) : null })
  // Visée scriptée (scripts/verif-mission.mjs) : __aimAt('cadenas') vise le cadenas du port, __aimAt('civil', 2) le
  // troisième civil vivant ('cible', 'garde', 'civil'). Faux si rien ne correspond. Le tir reste celui du joueur.
  // avance (s) : vise devant une cible du convoi, qui roule pendant le vol de la balle (M5).
  window.__aimAt = (what, n = 0, avance = 0) => {
    const role = npc => npc.isTarget ? 'cible' : npc.isCivilian ? 'civil' : 'garde'
    const p = what === 'cadenas'
      ? moralLockBox && moralLockBox.getCenter(new THREE.Vector3())
      : npcs.filter(npc => npc.alive && role(npc) === what)[n]?.getBounds().center
    if (!p) return false
    if (avance && convoyCar && what !== 'cadenas') p.x += convoyCar.dir * convoyCar.speed * avance
    ;({ yaw, pitch } = aimAngles(camera.position.toArray(), p.toArray()))
    return true
  }
  // ?memtest=1&images=3 : mesure mémoire scriptée (spec du lot 1 §4.1), lue par scripts/memtest.mjs. Pas de
  // requestAnimationFrame : la boucle du jeu est suspendue, chaque étape monte sa scène par les fonctions du jeu
  // (showMenu, clearEntities puis mountLevel ou prepareLevel, buildRoundScene et releaseRoundScene, le bouton QUITTER
  // du PvP), rend quelques images par appel direct, puis relève renderer.info. Résultat en JSON dans <pre id="memtest">,
  // document.title passe à 'memtest:fini' (ou 'memtest:erreur').
  if (q.has('memtest')) {
    import('./gfx/memtest.js').then(async ({ memtestSteps, withSeed, seedOf, measure, runMemtest }) => {
      setCampaignPaused(true)   // seuls les rendus de la mesure comptent
      const pre = document.createElement('pre')
      pre.id = 'memtest'
      // &qualite=bas : préréglage de la mesure (triangles de M6 en Bas, en Moyen), pas enregistré. Le <pre> porte le
      // préréglage effectif ('auto' sans paramètre, dans un profil neuf) : scripts/memtest.mjs en tire ses seuils.
      if (PRESETS.includes(q.get('qualite'))) { settings.graphics = q.get('qualite'); applyQuality() }
      pre.dataset.qualite = settings.graphics
      pre.style.cssText = `position:fixed;top:0;right:0;z-index:2000;max-height:100vh;overflow:auto;margin:0;padding:8px;
        background:rgba(0,0,0,0.85);color:#c8f0c8;font:10px/1.3 'Courier New',monospace;`
      document.body.appendChild(pre)
      document.title = 'memtest:modeles'
      await charactersLoading   // sans les modèles, les PNJ seraient procéduraux et la mesure fausse
      const images = Math.max(1, +q.get('images') || 3)
      // Étape premiere-image (spec du lot 1 §4.6) : la mission montée comme pendant son briefing (prepareLevel, shaders
      // compilés), puis l'attente de leur compilation, que le briefing couvre ; &precompilation=0 : montée sans
      // compilation, comme avant la tâche L7. Durées en temps réel seulement (scripts/memtest.mjs --temps-reel) : sous
      // le temps virtuel de --dump-dom, performance.now ne bouge pas pendant une tâche. Les comptes de programmes, eux,
      // valent partout : programmes créés (compilés) pendant la préparation, la première image, les images suivantes,
      // repérés par leur numéro (WebGLProgram.id, croissant), ceux qu'une étape libère n'étant pas décomptés.
      const precompile = q.get('precompilation') !== '0'
      const programs = () => renderer.info.programs || []
      const lastProgram = () => programs().reduce((m, p) => Math.max(m, p.id), -1)
      const programsSince = id => programs().filter(p => p.id > id).length
      const ms = v => Math.round(v * 10) / 10
      const gl = renderer.getContext()
      const pixel = new Uint8Array(4)
      // Une image rendue jusqu'au bout : la lecture d'un pixel attend que tout ce qu'elle a demandé soit exécuté
      // (shaders encore en compilation, textures envoyées).
      const timedFrame = () => {
        const t0 = performance.now()
        renderer.render(scene, camera)
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        return performance.now() - t0
      }
      let round = false
      const mount = step => withSeed(seedOf(step), () => {
        if (step.type === 'premiere') {
          clearEntities()   // comme launchLevel
          const last = lastProgram()
          const t0 = performance.now()
          if (precompile) prepareLevel(step.n)
          else mountLevel(step.n)
          const preparationMs = ms(performance.now() - t0)
          aimMissionCamera()
          return { precompilation: precompile, preparationMs, programmesPreparation: programsSince(last) }
        } else if (step.type === 'mission') {
          clearEntities()   // comme launchLevel puis startLevel
          mountLevel(step.n)
          aimMissionCamera()
        } else if (step.type === 'pvp') {
          if (round) releaseRoundScene()   // fin de la manche précédente (endRound)
          const arena = buildRoundScene(seedOf(step), 'sniper')
          round = true
          // Vue du nid du sniper, comme setupSniper puis sniperFrame (regard par défaut de la carte)
          const [x, y, z] = arena.nest.cameraPos
          const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(arena.nest.defaultPitch ?? -0.2, 0, 0, 'YXZ'))
          camera.position.set(x, y, z)
          camera.lookAt(x + dir.x, y + dir.y, z + dir.z)
          camera.fov = 74
          camera.updateProjectionMatrix()
        } else {
          if (step.apresPvp && round) {
            releaseRoundScene()
            round = false
            document.getElementById('btn-mp-quit').click()   // quitToMenu : la rue revient derrière le menu
            setCampaignPaused(true)                          // quitToMenu relance la boucle du jeu
          }
          // Graine du menu tirée à nouveau : la rue de quitToMenu a déjà consommé le début de la suite, et showMenu en
          // reconstruirait une autre (fenêtres allumées, arbres), avec d'autres objets dans le champ que les étapes menu.
          withSeed(seedOf(step), () => { showMenu(); driftMenuCamera(0) })
        }
      })
      const act = async step => {
        const mounted = mount(step)
        if (step.type === 'premiere' && precompile) {
          const t0 = performance.now()
          await renderer.compileAsync(scene, camera)   // aucun nouveau programme : attend ceux de prepareLevel
          mounted.attenteShadersMs = ms(performance.now() - t0)
        }
        return mounted
      }
      const render = step => {
        if (step.type !== 'premiere') { for (let i = 0; i < images; i++) renderer.render(scene, camera); return }
        const avant = lastProgram()
        const premiereImageMs = ms(timedFrame())
        const programmesPremiereImage = programsSince(avant)
        const apres = lastProgram()
        const imageSuivanteMs = ms(timedFrame())
        for (let i = 2; i < images; i++) renderer.render(scene, camera)
        return { premiereImageMs, programmesPremiereImage, imageSuivanteMs, programmesImagesSuivantes: programsSince(apres) }
      }
      // Avec chaque relevé, les géométries et textures des modèles chargés (critère « partie complète » de
      // scripts/memtest.mjs : jamais un nombre écrit en dur).
      const snapshot = () => {
        if (typeof window.gc === 'function') window.gc()   // Chrome lancé avec --js-flags=--expose-gc
        return measure(renderer.info, performance.memory, modelResources())
      }
      const report = (entries, state) => { pre.textContent = JSON.stringify(entries, null, 1); document.title = 'memtest:' + state }
      await runMemtest({ steps: memtestSteps(), act, render, snapshot, report })
    }).catch(err => { console.error('[memtest]', err); document.title = 'memtest:erreur' })
  }
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
  // ?enquete=1&indices=4&cam=9.5,1.65,4.3,0.4,-0.6&ouvrir=mot&stats=1 : l'enquête directement (captures, réglages).
  // Son compteur suit STATS_URL, passé par investigate comme sur le chemin du prologue.
  if (q.has('enquete')) {
    menuEl.style.display = 'none'
    hudEl.style.display = 'none'
    instruction.style.opacity = '0'
    gamePhase = 'briefing'
    const cam = q.get('cam') ? q.get('cam').split(',').map(Number) : null
    investigate(() => showMenu(), {
      indices: +q.get('indices') || 0,
      cam: cam && cam.length === 5 ? { x: cam[0], y: cam[1], z: cam[2], yaw: cam[3], pitch: cam[4] } : null,
      ouvrir: q.get('ouvrir') || null,
    })
  }
}
