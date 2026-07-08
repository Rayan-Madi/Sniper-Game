// Test de bout en bout du relais PvP : 2 clients, create/join/start,
// relais aim/pos, vote de revanche (rôles échangés), déconnexion.
import WebSocket from 'ws'

const URL = 'ws://localhost:8787'
const results = []
const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}`)

function connect() {
  return new Promise((res, rej) => {
    const ws = new WebSocket(URL)
    ws.msgs = []
    ws.waiters = []
    ws.on('message', (raw) => {
      const m = JSON.parse(raw)
      ws.msgs.push(m)
      for (let i = ws.waiters.length - 1; i >= 0; i--) {
        const w = ws.waiters[i]
        if (m.t === w.type) { ws.waiters.splice(i, 1); w.res(m) }
      }
    })
    ws.on('open', () => res(ws))
    ws.on('error', rej)
  })
}

function waitFor(ws, type, timeout = 3000) {
  const existing = ws.msgs.find(m => m.t === type)
  if (existing) return Promise.resolve(existing)
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error(`timeout en attendant "${type}"`)), timeout)
    ws.waiters.push({ type, res: (m) => { clearTimeout(to); res(m) } })
  })
}

const A = await connect()
const B = await connect()
ok('connexion des 2 clients', true)

A.send(JSON.stringify({ t: 'create' }))
const created = await waitFor(A, 'created')
ok('room créée avec code 4 chars', created.room && created.room.length === 4)

// Mauvais code → erreur
B.send(JSON.stringify({ t: 'join', room: 'ZZZZ' }))
const err = await waitFor(B, 'error')
ok('join avec mauvais code → erreur', !!err.message)

// Bon code → start pour les deux, rôles opposés
B.send(JSON.stringify({ t: 'join', room: created.room }))
const startA = await waitFor(A, 'start')
const startB = await waitFor(B, 'start')
ok('start reçu par les 2', !!startA && !!startB)
ok('rôles opposés', (startA.role === 'sniper') !== (startB.role === 'sniper'))
ok('serverTime synchronisé', startA.serverTime === startB.serverTime)

// Relais : A envoie aim, B doit le recevoir (et pas A)
A.send(JSON.stringify({ t: 'aim', yaw: 1.23, pitch: -0.1 }))
const aim = await waitFor(B, 'aim')
ok('relais aim A→B', aim.yaw === 1.23)

B.send(JSON.stringify({ t: 'pos', x: 5, y: 0, z: -3 }))
const pos = await waitFor(A, 'pos')
ok('relais pos B→A', pos.x === 5 && pos.z === -3)

// Revanche : un seul vote ne relance pas ; deux votes → nouveau start avec rôles ÉCHANGÉS
A.msgs.length = 0; B.msgs.length = 0
A.send(JSON.stringify({ t: 'rematch' }))
await new Promise(r => setTimeout(r, 300))
ok('1 seul vote de revanche → pas de start', !A.msgs.some(m => m.t === 'start'))
B.send(JSON.stringify({ t: 'rematch' }))
const restartA = await waitFor(A, 'start')
const restartB = await waitFor(B, 'start')
ok('2 votes → nouvelle manche', !!restartA && !!restartB)
ok('rôles échangés à la revanche', restartA.role !== startA.role && restartB.role !== startB.role)

// Déconnexion → peer_left
A.close()
const left = await waitFor(B, 'peer_left')
ok('déconnexion → peer_left', !!left)

B.close()
console.log(results.join('\n'))
const fails = results.filter(r => r.startsWith('FAIL')).length
console.log(fails === 0 ? '\n✅ TOUS LES TESTS PASSENT' : `\n❌ ${fails} ÉCHEC(S)`)
process.exit(fails === 0 ? 0 : 1)
