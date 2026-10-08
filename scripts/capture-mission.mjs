// Captures déterministes du jeu (menu, vue de départ d'une mission) dans Chrome sans interface, pour comparer deux
// versions du code image par image : Math.random est remplacé par un générateur à graine, requestAnimationFrame et
// performance.now sont pilotés à la main (N images de 1/60 s), les minuteurs du jeu suivent cette horloge et les
// fondus CSS sont figés. Rendu logiciel (SwiftShader) par défaut : même code, mêmes octets PNG. Sur la carte
// graphique (GPU=1), deux sessions peuvent différer d'un niveau de couleur sur quelques pixels (shaders compilés par
// le pilote).
// Prérequis : npm run dev. Usage : node scripts/capture-mission.mjs <dossier> [menu] [1…6] [retour1…retour6]
//   ex. node scripts/capture-mission.mjs avant-lot1 menu 1 3 5 6   → shots/avant-lot1/m1.png, …
//   retour<n> : mission n, trois tirs manqués (impacts au sol, poussière, traceurs encore en vie), puis retour au menu
//   (pause, MENU ; MENU de l'écran d'échec si une cible a fui) → shots/<dossier>/retour-m<n>.png. Le décor de la
//   scène (__decor() : fond, objets hors carte) est affiché avant et après le retour.
// Variables : CHROME (chemin de Chrome), BASE_URL (défaut http://localhost:5173/), IMAGES (défaut 20),
// GPU=1 (carte graphique au lieu du rendu logiciel), PARAMS (ajoutés à l'URL, ex. stats=1), QUALITE (préréglage
// graphique enregistré dans le profil jetable : auto, bas, moyen, haut ; sans elle, celui d'un premier lancement, Auto).
// Le port DevTools est choisi par Chrome (--remote-debugging-port=0, relu dans DevToolsActivePort) : jamais un port
// fixe, qui pourrait désigner le navigateur d'une autre session. Profil jetable, supprimé à la fin.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const [dir, ...what] = process.argv.slice(2)
if (!dir || !what.length) { console.error('Usage : node scripts/capture-mission.mjs <dossier> [menu] [1…6]'); process.exit(1) }
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const URL_JEU = BASE + (process.env.PARAMS ? '?' + process.env.PARAMS : '')
const IMAGES = +process.env.IMAGES || 20
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Injecté avant tout script de la page : hasard à graine, horloge et images pilotées.
const DETERMINISME = `(() => {
  let s = 0x2f6b1d3
  Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  let now = 0
  performance.now = () => now
  let q = []
  window.requestAnimationFrame = cb => { q.push(cb); return q.length }
  window.cancelAnimationFrame = () => {}
  // Minuteurs du jeu (1 s et plus : aide de 5 s, indice du cadenas, fil des événements…) sur l'horloge pilotée : sous
  // SwiftShader une capture dure plusieurs secondes réelles, ils tomberaient ou non selon la vitesse du rendu. Les
  // délais courts (chargement des modules et des modèles) restent réels.
  const realSetTimeout = window.setTimeout.bind(window), realClearTimeout = window.clearTimeout.bind(window)
  let timers = [], nextId = 1e9
  window.setTimeout = (cb, d = 0, ...args) => {
    if (typeof cb !== 'function' || !(d >= 1000)) return realSetTimeout(cb, d, ...args)
    const id = nextId++
    timers.push({ id, at: now + d, cb, args })
    return id
  }
  window.clearTimeout = id => { if (id >= 1e9) timers = timers.filter(t => t.id !== id); else realClearTimeout(id) }
  const fireTimers = () => {
    for (;;) {
      const due = timers.filter(t => t.at <= now).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) return
      timers = timers.filter(t => t !== due)
      due.cb(...due.args)
    }
  }
  window.__step = (n = 1, dt = 1000 / 60) => {
    for (let i = 0; i < n; i++) { now += dt; fireTimers(); const cbs = q; q = []; for (const cb of cbs) cb(now) }
  }
  // Fondus CSS (aide des commandes) en temps réel : figés à leur état final, sinon la capture tombe au milieu
  document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style')
    s.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'
    document.head.appendChild(s)
  })
})()`

const saveAt = n => ({ levels: {}, points: 0, totalScore: 0, currentLevel: n, freedVictims: false,
  briefingSeen: [true, true, true, true, true, true], prologueSeen: true, campaignDone: false })

function connect(url) {
  const ws = new WebSocket(url)
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    if (m.method) { for (const l of listeners) l(m); return }
    if (!m.id || !pending.has(m.id)) return
    const { ok, ko } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? ko(new Error(m.error.message)) : ok(m.result)
  }
  return {
    ws, listeners,
    ready: new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko }),
    send: (method, params = {}) => new Promise((ok, ko) => {
      const i = ++id
      pending.set(i, { ok, ko })
      ws.send(JSON.stringify({ id: i, method, params }))
    }),
  }
}

async function js(c, expression) {
  const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

async function until(c, expression, timeout = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) { if (await js(c, expression)) return; await sleep(50) }
  throw new Error('délai dépassé : ' + expression)
}

// Une capture = un Chrome neuf (profil jetable) : la page part toujours du même état.
async function shoot(target) {
  const profile = mkdtempSync(join(tmpdir(), 'capture-mission-'))
  const gl = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
  const proc = spawn(CHROME, ['--headless=new', ...gl, '--hide-scrollbars', '--mute-audio', `--user-data-dir=${profile}`,
    '--window-size=1280,720', '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' })
  let c = null
  try {
    const portFile = join(profile, 'DevToolsActivePort')
    let port = ''
    for (let i = 0; i < 150 && !port; i++) {
      await sleep(100)
      if (existsSync(portFile)) port = readFileSync(portFile, 'utf8').split('\n')[0].trim()
    }
    if (!port) throw new Error('Chrome sans interface : DevToolsActivePort introuvable')
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    c = connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
    await c.ready
    // Sauvegarde posée sur une première page, avant le script de déterminisme
    await c.send('Page.navigate', { url: URL_JEU })
    await until(c, `document.readyState === 'complete'`)
    const retour = /^retour(\d)$/.exec(target)
    const n = target === 'menu' ? 1 : retour ? +retour[1] : +target
    await js(c, `localStorage.setItem('sniper-save', ${JSON.stringify(JSON.stringify(saveAt(n)))})`)
    if (process.env.QUALITE) await js(c, `localStorage.setItem('sniper-settings', ${JSON.stringify(JSON.stringify({ graphics: process.env.QUALITE }))})`)
    await c.send('Page.enable')
    await c.send('Runtime.enable')
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: DETERMINISME })
    // Modèles chargés : seuls comptent les messages de la page rechargée. La première page (celle de la sauvegarde)
    // charge encore ses modèles quand on la quitte : un de ses messages pouvait compter pour la seconde, le clic partait
    // avant la fin du chargement, et le hasard à graine tirait autre chose (décor et PNJ différents d'une capture à
    // l'autre, au même code).
    let charges = 0, page = null
    c.listeners.push(m => {
      if (m.method === 'Runtime.executionContextCreated' && m.params.context.auxData?.isDefault) {
        page = m.params.context.id; charges = 0
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.executionContextId === page &&
        String(m.params.args?.[0]?.value || '').startsWith('[characters] chargé')) charges++
    })
    await c.send('Page.navigate', { url: URL_JEU })
    await until(c, `document.readyState === 'complete' && typeof window.__step === 'function'`)
    const t0 = Date.now()
    while (charges < 7 && Date.now() - t0 < 60000) await sleep(100)
    if (charges < 7) throw new Error(`modèles chargés : ${charges} sur 7`)
    if (target !== 'menu') {
      await js(c, `document.getElementById('btn-start').click()`)
      await until(c, `__mission().phase === 'playing'`)
    }
    if (retour) await missThenMenu(c)
    await js(c, `__step(${IMAGES})`)
    await js(c, `__step(1)`)
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
    const out = resolve('shots', dir, target === 'menu' ? 'menu.png' : retour ? `retour-m${n}.png` : `m${n}.png`)
    mkdirSync(resolve('shots', dir), { recursive: true })
    const buf = Buffer.from(data, 'base64')
    writeFileSync(out, buf)
    console.log(out, createHash('sha256').update(buf).digest('hex').slice(0, 16))
    if (retour) console.log('  décor au menu :', JSON.stringify(await js(c, '__decor()')))
  } finally {
    if (c) { try { await Promise.race([c.send('Browser.close'), sleep(2000)]) } catch { /* déjà fermé */ } c.ws.close() }
    await new Promise(r => { if (proc.exitCode !== null) r(); else { proc.once('exit', r); setTimeout(r, 3000) } })
    if (proc.exitCode === null) spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
    for (let i = 0; i < 10; i++) {
      try { rmSync(profile, { recursive: true, force: true }); break } catch { await sleep(300) }
    }
  }
}

// Lunette ouverte, visée relevée au-dessus des PNJ : la balle passe haut et finit au sol très loin derrière eux (une
// soixantaine de mètres au port), aucun ne fuit et la mission continue. Trois tirs manqués un peu décalés, puis
// retour au menu pendant que poussière et traceur sont encore en vie.
const mouse = (type, init) => `document.dispatchEvent(new MouseEvent('${type}', ${JSON.stringify(init)}))`
const playing = c => js(c, `__mission().phase === 'playing'`)
async function missThenMenu(c) {
  await js(c, mouse('mousedown', { button: 2 }))
  await js(c, mouse('mousemove', { movementX: 0, movementY: -160 }))
  for (let i = 0; i < 3 && await playing(c); i++) {
    if (i) await js(c, mouse('mousemove', { movementX: 40, movementY: 0 }))
    await js(c, mouse('mousedown', { button: 0 }))
    for (let k = 0; k < 120 && await js(c, '__mission().balle') && await playing(c); k++) await js(c, '__step(1)')
  }
  await js(c, '__step(2)')
  console.log('  décor avant le retour :', JSON.stringify(await js(c, '__decor()')))
  console.log('  mission :', JSON.stringify(await js(c, `(({ phase, tirs, touches, alertes }) => ({ phase, tirs, touches, alertes,
    echec: phase === 'dead' ? document.getElementById('game-over-reason').textContent : null }))(__mission())`)))
  if (await js(c, `__mission().phase === 'playing'`)) {
    await js(c, `document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }))`)
    await js(c, `document.getElementById('btn-pause-menu').click()`)
  } else {
    await js(c, `document.getElementById('btn-menu').click()`)
  }
  await js(c, mouse('mouseup', { button: 2 }))
}

let failed = 0
for (const t of what) {
  try { await shoot(t) } catch (e) { failed++; console.error(`${t} : ${e.message}`) }
}
process.exit(failed ? 1 : 0)
