// ─── Relais WebSocket pour le mode PvP (1v1) ────────────────────────
// Aucune logique de jeu ici : on ne fait QUE transmettre les messages
// entre les deux joueurs d'une même "room". Toute la logique (visée,
// tir, collisions, chrono) est calculée côté client (modèle "confiance
// au client" — largement suffisant pour un prototype 1v1 non compétitif).
import { WebSocketServer } from 'ws'

const PORT = process.env.PORT || 8787
const wss = new WebSocketServer({ port: PORT })

const rooms = new Map()   // code -> { sockets: [ws, ws] }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // sans caractères ambigus

function makeCode() {
  let code
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
  } while (rooms.has(code))
  return code
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
}

function otherSocket(room, ws) {
  return room.sockets.find(s => s !== ws)
}

function startRound(room) {
  const [a, b] = room.sockets
  const serverTime = Date.now()
  send(a, { t: 'start', role: room.sniperIdx === 0 ? 'sniper' : 'pnj', serverTime })
  send(b, { t: 'start', role: room.sniperIdx === 1 ? 'sniper' : 'pnj', serverTime })
}

wss.on('connection', (ws) => {
  ws.room = null

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch (e) { return }

    if (msg.t === 'create') {
      const code = makeCode()
      rooms.set(code, { sockets: [ws] })
      ws.room = code
      send(ws, { t: 'created', room: code })
      return
    }

    if (msg.t === 'join') {
      const room = rooms.get((msg.room || '').toUpperCase())
      if (!room) { send(ws, { t: 'error', message: 'Code introuvable.' }); return }
      if (room.sockets.length >= 2) { send(ws, { t: 'error', message: 'Partie déjà pleine.' }); return }
      room.sockets.push(ws)
      ws.room = (msg.room || '').toUpperCase()
      send(ws, { t: 'joined', room: ws.room })

      // La room est complète : rôles aléatoires + instant de départ commun.
      room.sniperIdx = Math.random() < 0.5 ? 0 : 1
      startRound(room)
      return
    }

    // Revanche : quand LES DEUX joueurs ont cliqué, on relance en échangeant les rôles.
    if (msg.t === 'rematch') {
      const room = rooms.get(ws.room)
      if (!room) return
      room.rematchVotes = room.rematchVotes || new Set()
      room.rematchVotes.add(ws)
      if (room.rematchVotes.size >= 2) {
        room.rematchVotes.clear()
        room.sniperIdx = 1 - room.sniperIdx   // échange des rôles à chaque manche
        startRound(room)
      }
      return
    }

    // Tout le reste : relais pur vers l'autre joueur de la room.
    if (ws.room) {
      const room = rooms.get(ws.room)
      if (room) {
        const peer = otherSocket(room, ws)
        if (peer) send(peer, msg)
      }
    }
  })

  ws.on('close', () => {
    if (!ws.room) return
    const room = rooms.get(ws.room)
    if (!room) return
    const peer = otherSocket(room, ws)
    if (peer) send(peer, { t: 'peer_left' })
    rooms.delete(ws.room)
  })
})

console.log(`[pvp-relay] en écoute sur le port ${PORT}`)
