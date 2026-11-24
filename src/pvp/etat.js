import * as THREE from 'three'

// ─── Mode PvP : ce que ses modules partagent ─────────────────────────
// Les éléments du DOM et l'état de la session et de la manche, tels qu'ils étaient en tête de l'ancien src/pvp.js.
// L'état est un objet, etat, parce qu'un module ne peut pas affecter une variable importée d'un autre : index.js
// (départ, boucle, entrées, fin de manche), salon.js (messages du relais), sniper.js et contreTueur.js lisent et
// écrivent ses champs. Aucun import d'un autre module du PvP ici : etat.js se charge avant eux tous.

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

export const etat = {
  // ── État de session ─────────────────────────────────────────────────
  myRole: null,           // 'sniper' | 'pnj'
  matchEndAt: 0,
  roundStartAt: 0,        // instant où la manche devient active (déblocage capacités)
  roundActive: false,
  rafHandle: null,
  clock: new THREE.Clock(),
  myPoints: 0, oppPoints: 0,
  arena: null,
  crowd: [],
  clingerNpc: null, clingerUntil: 0,
  phoneShakeUntil: 0, alarmUntil: 0,
  crowdPanicUntil: 0,     // la foule fuit (alarme du sniper)
  speedMultiplier: 1,

  // Départ de manche en attente des modèles (spec du lot 1 §4.4) : son écran PRÉPARATION DU DOSSIER, les pièces d'arme
  // ramassées entre-temps par l'adversaire (rejouées par beginRound), et un jeton incrémenté à chaque départ reçu ou
  // annulé (adversaire parti ou touché, relais perdu, QUITTER) : seul le dernier départ monte sa manche.
  pendingStart: null,   // { screen, parts } pendant l'attente
  startToken: 0,

  // Sniper
  sniperYaw: 0, sniperPitch: 0,
  laserCore: null, laserGlow: null,
  abilityCooldowns: { phone: 0, cling: 0, alarm: 0 },
  sniperScoped: false,

  // PNJ
  avatar: null,            // { model, mixer, actions, group }
  pnjPos: new THREE.Vector3(),
  pnjYaw: 0, pnjPitch: 0,
  partsCollected: 0,
  oppPartsCount: 0,   // pièces prises par l'adversaire (compteur côté sniper, sans localisation)
  pistolMesh: null,
  lastPosSent: 0,
  emoteUntil: 0,   // le contre-tueur émote (danse/salue) pour se fondre dans la foule
  pnjAiming: false, // le contre-tueur vise au pistolet (clic droit, une fois armé)

  // Sniper : dernière position/orientation/anim du PNJ (reçues par réseau) +
  // avatar de l'adversaire rendu chez le sniper (sinon il n'a personne à viser).
  lastPnjNet: null,   // THREE.Vector3 | null
  lastPnjYaw: Math.PI,
  lastPnjAnim: 'idle',
  oppAvatar: null,
}

export {
  el, menuEl, mpMenu, mpCreate, mpJoin, mpResult, mpHud, codeDisplay, createStatus, joinInput, joinError, roleBanner, timerEl,
  partsEl, abilitiesEl, crosshairEl, killfeedEl, scoreEl, resultTitle, resultDetail, rematchBtn,
}
