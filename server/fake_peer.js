// Simule le 2e joueur : rejoint une room, reste connecté ~8s,
// envoie quelques messages pos/aim pour vérifier le flux en jeu.
import WebSocket from 'ws'

const code = process.argv[2]
if (!code) { console.error('usage: node fake_peer.js CODE'); process.exit(1) }

const ws = new WebSocket('ws://localhost:8787')
ws.on('open', () => ws.send(JSON.stringify({ t: 'join', room: code })))
ws.on('message', (raw) => {
  const m = JSON.parse(raw)
  if (m.t === 'start') {
    console.log('fake peer: manche démarrée, rôle =', m.role)
    // envoie position (si pnj) ou visée (si sniper) pendant quelques secondes
    let n = 0
    const iv = setInterval(() => {
      if (m.role === 'pnj') ws.send(JSON.stringify({ t: 'pos', x: 3 + n * 0.1, y: 0, z: 10 }))
      else ws.send(JSON.stringify({ t: 'aim', yaw: n * 0.05, pitch: -0.1 }))
      if (++n > 30) { clearInterval(iv); ws.close(); }
    }, 100)
  }
  if (m.t === 'error') { console.error('erreur:', m.message); process.exit(1) }
})
ws.on('close', () => { console.log('fake peer: déconnecté'); process.exit(0) })
