// ─── Client réseau pour le mode PvP ──────────────────────────────────
// Petit wrapper WebSocket : connexion, création/rejoint de room, envoi
// et abonnement aux messages par type. Le serveur ne fait que relayer —
// toute la logique de jeu vit dans pvp.js.

// URL du relais WebSocket. Résolution automatique (dans l'ordre) :
//   1. ?relay=wss://mon-relais.example  dans l'URL de la page
//   2. window.__RELAY_URL  (défini avant le chargement du bundle)
//   3. par défaut : MÊME hôte que la page, port 8787
// Grâce au (3), jouer à deux marche sans rien changer : le 2ᵉ joueur ouvre
// la page via l'IP LAN de l'hôte (ex. http://192.168.1.20:5173) et le relais
// est automatiquement ws://192.168.1.20:8787. Pour jouer par internet, héberge
// le relais (Render/Railway) et passe son URL via ?relay=... (voir README).
export const RELAY_URL = (() => {
  try {
    const q = new URLSearchParams(location.search).get('relay')
    if (q) return q
    if (typeof window !== 'undefined' && window.__RELAY_URL) return window.__RELAY_URL
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = location.hostname || 'localhost'
    return `${proto}//${host}:8787`
  } catch (e) {
    return 'ws://localhost:8787'
  }
})()

let ws = null
const listeners = new Map()   // type -> [handlers]

function emit(type, msg) {
  const hs = listeners.get(type)
  if (hs) for (const h of hs) h(msg)
}

export function on(type, handler) {
  if (!listeners.has(type)) listeners.set(type, [])
  listeners.get(type).push(handler)
}

export function off(type, handler) {
  const hs = listeners.get(type)
  if (!hs) return
  const i = hs.indexOf(handler)
  if (i !== -1) hs.splice(i, 1)
}

export function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
}

export function isConnected() { return !!ws && ws.readyState === WebSocket.OPEN }

export function connect(onOpen, onError) {
  if (ws) { try { ws.close() } catch (e) {} }
  const sock = ws = new WebSocket(RELAY_URL)
  let opened = false
  sock.onopen = () => { opened = true; onOpen && onOpen() }
  sock.onerror = (e) => onError && onError(e)
  // Seule la socket courante est entendue : une socket remplacée par connect()
  // ou abandonnée par disconnect() (qui remet ws à null) peut encore livrer un
  // message ou signaler sa fermeture après coup. Ni l'un ni l'autre ne doit
  // réécrire l'écran ou couper la nouvelle manche.
  sock.onmessage = (ev) => {
    if (ws !== sock) return
    let msg
    try { msg = JSON.parse(ev.data) } catch (e) { return }
    emit(msg.t, msg)
  }
  // Seule une liaison établie peut être perdue : un relais injoignable passe
  // par onError (message « Connexion impossible »), pas par 'disconnected'.
  sock.onclose = () => { if (ws === sock && opened) emit('disconnected', {}) }
}

export function disconnect() {
  if (ws) { try { ws.close() } catch (e) {} }
  ws = null
  // NB : on ne vide PAS les listeners — ils sont enregistrés une seule
  // fois au chargement (initMultiplayerMenu) et doivent survivre aux
  // reconnexions successives (créer → annuler → rejoindre, etc.).
}

export function createRoom() { send({ t: 'create' }) }
export function joinRoom(code) { send({ t: 'join', room: code }) }
