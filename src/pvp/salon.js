import * as THREE from 'three'
import { isPvpIntroActive } from './pvpIntro.js'
import * as net from '../net.js'
import { el, menuEl, mpMenu, mpCreate, mpJoin, mpResult, codeDisplay, createStatus, joinInput, joinError, rematchBtn, etat } from './etat.js'
import { onMatchStart, endRoundFromPeer, quitToMenu } from './index.js'
import { triggerAbility } from './sniper.js'
import { removePartVisual, applyIncomingAbility } from './contreTueur.js'

// ─── Mode PvP : salon ────────────────────────────────────────────────
// Écrans du menu multijoueur (créer, rejoindre, résultat), boutons, et abonnements aux messages du relais.

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
  // Départ de l'adversaire sur l'écran de fin : le relais a fermé la partie, la manche suivante ne viendra plus.
  net.on('peer_left', () => {
    if (etat.roundActive || isPvpIntroActive() || etat.pendingStart) return endRoundFromPeer(null, 'peer_left')
    if (mpResult.style.display === 'flex') { rematchBtn.disabled = true; rematchBtn.textContent = 'ADVERSAIRE PARTI.' }
  })
  // Relais perdu hors manche : l'attente en cours (partie créée, partie rejointe, manche suivante) ne peut plus
  // aboutir. Un message la remplace ; ANNULER et QUITTER restent utilisables.
  net.on('disconnected', () => {
    if (etat.roundActive || isPvpIntroActive() || etat.pendingStart) return endRoundFromPeer(null, 'disconnected')
    if (mpCreate.style.display === 'flex') { codeDisplay.textContent = '----'; createStatus.textContent = 'Relais perdu.' }
    if (mpJoin.style.display === 'flex') joinError.textContent = 'Relais perdu.'
    if (mpResult.style.display === 'flex') { rematchBtn.disabled = true; rematchBtn.textContent = 'RELAIS PERDU.' }
  })
  // Capacité du sniper reçue pendant l'attente des modèles : ignorée. Ses effets durent quelques secondes, sur une
  // manche qui n'est pas encore montée ici (beginRound les remettrait à zéro) ; ni son sous l'écran, ni message.
  net.on('ability', (msg) => { if (!etat.pendingStart) applyIncomingAbility(msg.kind) })
  // Pièce prise pendant l'attente : rangée avec le départ, retirée et comptée par beginRound une fois l'arène montée
  // (avant, il n'y a pas d'arène, ou celle de la manche précédente, et beginRound remet le compte à zéro).
  net.on('part_pickup', (msg) => {
    if (etat.pendingStart) etat.pendingStart.parts.push(msg.idx)
    else if (etat.arena) removePartVisual(msg.idx)
  })
  net.on('aim', (msg) => { etat.sniperYaw = msg.yaw; etat.sniperPitch = msg.pitch })
  net.on('pos', (msg) => {
    if (!etat.lastPnjNet) etat.lastPnjNet = new THREE.Vector3()
    etat.lastPnjNet.set(msg.x, msg.y, msg.z)
    if (msg.yaw !== undefined) etat.lastPnjYaw = msg.yaw
    etat.lastPnjAnim = msg.anim || 'idle'
  })
  net.on('hit_pnj', () => endRoundFromPeer('sniper', 'hit'))
  net.on('hit_sniper', () => endRoundFromPeer('pnj', 'hit'))
  net.on('hit_civilian', () => endRoundFromPeer('pnj', 'civilian'))

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

export { hideAllMpScreens }
