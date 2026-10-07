// Vérifications de la campagne dans Chrome sans interface, pilotées par le protocole DevTools (CDP).
// Rejoue des séquences que les tests ne peuvent pas atteindre (main.js ne s'importe pas sous jsdom) et lit l'état
// par les accroches de dev __mission() et __aimAt(). Prérequis : npm run dev.
// Usage : node scripts/verif-mission.mjs [scénario…]   (sans argument : tous ; CAPTURES=1 : images dans shots/)
// Variables : CHROME (chemin de Chrome), BASE_URL (défaut http://localhost:5173/), TAILLE (défaut 1280,720),
// SWIFTSHADER=1 (rendu logiciel au lieu de la carte graphique). Chaque scénario part d'un profil jetable.
// Le port DevTools est choisi par Chrome (--remote-debugging-port=0, relu dans DevToolsActivePort) : jamais un port
// fixe, qui pourrait désigner le navigateur d'une autre session.
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Chrome sans interface et connexion DevTools ──
async function openChrome(save) {
  const profile = mkdtempSync(join(tmpdir(), 'verif-mission-'))
  // Carte graphique par défaut : sous SwiftShader le jeu tourne à 1 image/s et les minuteurs (600 ms, 5 s) passent
  // avant que la balle n'arrive. SWIFTSHADER=1 si la carte n'est pas disponible (scénarios minutés alors faussés).
  const gl = process.env.SWIFTSHADER ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : ['--use-angle=d3d11', '--enable-gpu']
  const proc = spawn(CHROME, ['--headless=new', ...gl, '--hide-scrollbars',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${profile}`,
    `--window-size=${process.env.TAILLE || '1280,720'}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' })
  let c = null
  const close = async () => {
    if (c) { try { await Promise.race([c.send('Browser.close'), sleep(2000)]) } catch { /* déjà fermé */ } c.ws.close() }
    await new Promise(r => { if (proc.exitCode !== null) r(); else { proc.once('exit', r); setTimeout(r, 3000) } })
    if (proc.exitCode === null) spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
    for (let i = 0; i < 10; i++) {
      try { rmSync(profile, { recursive: true, force: true }); break } catch { await sleep(300) }
    }
  }
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
    c.close = close
    // La sauvegarde est posée puis le jeu rechargé : loadProgress la lit au démarrage du module.
    await c.send('Page.navigate', { url: BASE })
    await until(c, `document.readyState === 'complete' && typeof window.__mission === 'function'`)
    await js(c, `localStorage.setItem('sniper-save', ${JSON.stringify(JSON.stringify(save))}); window.__ancienne = true`)
    await c.send('Page.navigate', { url: BASE })
    await until(c, `!window.__ancienne && document.readyState === 'complete' && typeof window.__mission === 'function'`)
    return c
  } catch (e) { await close(); throw e }
}

function connect(url) {
  const ws = new WebSocket(url)
  let id = 0
  const pending = new Map()
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    if (!m.id || !pending.has(m.id)) return
    const { ok, ko } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? ko(new Error(m.error.message)) : ok(m.result)
  }
  return {
    ws,
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

async function until(c, expression, timeout = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await js(c, expression)) return
    await sleep(25)
  }
  const state = await js(c, `({ mission: window.__mission && __mission().phase,
    écrans: [...document.querySelectorAll('body > div[id]')].filter(e => getComputedStyle(e).display !== 'none' && !e.hidden).map(e => e.id) })`)
  throw new Error(`délai dépassé : ${expression} ; état : ${JSON.stringify(state)}`)
}

async function capture(c, name) {
  if (!process.env.CAPTURES) return
  mkdirSync('shots', { recursive: true })
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  const out = resolve('shots', `verif-${name}.png`)
  writeFileSync(out, Buffer.from(data, 'base64'))
  console.log('    capture :', out)
}

// ── Gestes du joueur (événements que main.js écoute) ──
const key = (c, type, k, code) =>
  js(c, `document.dispatchEvent(new KeyboardEvent(${JSON.stringify(type)}, { key: ${JSON.stringify(k)}, code: ${JSON.stringify(code)}, bubbles: true }))`)
const escape = c => key(c, 'keydown', 'Escape', 'Escape')
const mouse = (c, type, button) => js(c, `document.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, { button: ${button}, bubbles: true }))`)
const click = (c, id) => js(c, `document.getElementById(${JSON.stringify(id)}).click()`)
const mission = c => js(c, '__mission()')
const helpOpacity = c => js(c, `document.getElementById('instruction').style.opacity`)
const shown = (c, id) => js(c, `document.getElementById(${JSON.stringify(id)}).style.display === 'flex'`)

// Mission n, briefing déjà vu : COMMENCER mène droit au jeu.
async function play(n) {
  const save = { levels: {}, points: 0, totalScore: 0, currentLevel: n, freedVictims: false,
    briefingSeen: [true, true, true, true, true, true], prologueSeen: true, campaignDone: false }
  const c = await openChrome(save)
  try {
    await sleep(1500)   // modèles des personnages
    await click(c, 'btn-start')
    await until(c, `__mission().phase === 'playing'`)
    c.t0 = Date.now()
    await frames(c, 10)
    console.log(`    mission ${n} : ${(10000 / (Date.now() - c.t0)).toFixed(1)} i/s`)
  } catch (e) { await c.close(); throw e }
  return c
}

// Images du jeu : sous SwiftShader la boucle tourne lentement, et dt est plafonné (le temps du jeu retarde).
const frames = (c, n) => js(c, `new Promise(r => { let k = ${n}; const f = () => (--k > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f) })`)

// Lunette ouverte, souffle retenu, visée sur `what` (voir __aimAt), puis un tir dont on attend l'impact.
// Faux si la visée n'a rien trouvé.
async function aimAndShoot(c, what, n = 0) {
  await mouse(c, 'mousedown', 2)
  await key(c, 'keydown', 'Shift', 'ShiftLeft')
  await frames(c, 10)   // le tremblement se calme
  if (!await js(c, `__aimAt(${JSON.stringify(what)}, ${n})`)) return false
  await frames(c, 2)    // la caméra prend la visée (appliquée par la boucle)
  const tirs = (await mission(c)).tirs
  await mouse(c, 'mousedown', 0)
  await until(c, `__mission().tirs === ${tirs + 1}`, 3000)
  await until(c, `!__mission().balle`)
  return true
}

// Un civil abattu, en essayant les civils un par un (un garde ou une cible peut être sur la ligne de tir).
async function shootCivilian(c) {
  for (let n = 0; n < 8; n++) {
    if (!await aimAndShoot(c, 'civil', n)) break
    if (await js(c, `[...document.querySelectorAll('.kill-entry')].some(e => e.textContent.includes('CIVIL ABATTU'))`)) return
    if ((await mission(c)).phase !== 'playing') break
  }
  throw new Error('aucun civil touché : scénario non concluant')
}

// ── Scénarios ──
const check = (ok, what, seen) => { if (!ok) throw new Error(`${what} (vu : ${JSON.stringify(seen)})`); console.log('    ok :', what) }

const SCENARIOS = {
  // Retour au menu dans les 5 s : l'aide CLIC DROIT ne reste pas sous le menu.
  async 'aide-menu'() {
    const c = await play(1)
    try {
      check(await helpOpacity(c) === '1', 'aide affichée au début de la mission', await helpOpacity(c))
      await sleep(1000)
      await escape(c)
      await until(c, `__mission().phase === 'paused'`)
      await click(c, 'btn-pause-menu')
      await until(c, `__mission().phase === 'menu'`)
      await sleep(600)   // fondu de l'aide (0,5 s)
      await capture(c, 'aide-menu')
      check(await helpOpacity(c) === '0', 'aide masquée sous le menu', await helpOpacity(c))
      await sleep(Math.max(0, c.t0 + 6000 - Date.now()))
      check(await helpOpacity(c) === '0', 'aide toujours masquée après le minuteur de 5 s', await helpOpacity(c))
    } finally { await c.close() }
  },

  // RECOMMENCER au bout d'une seconde : l'ancien minuteur n'éteint pas l'aide de la nouvelle mission.
  async 'aide-relance'() {
    const c = await play(1)
    try {
      await sleep(1000)
      await escape(c)
      await until(c, `__mission().phase === 'paused'`)
      await click(c, 'btn-restart')
      await until(c, `__mission().phase === 'playing'`)
      const t1 = Date.now()
      await sleep(Math.max(0, c.t0 + 5600 - Date.now()))
      check(await helpOpacity(c) === '1', 'aide de la nouvelle mission encore affichée à 5,6 s de la première', await helpOpacity(c))
      await sleep(Math.max(0, t1 + 5600 - Date.now()))
      check(await helpOpacity(c) === '0', 'aide masquée 5 s après la relance', await helpOpacity(c))
    } finally { await c.close() }
  },

  // Civil abattu puis REVOIR LE BRIEFING de l'écran d'échec dans les 5 s : l'aide est masquée (la cinématique la
  // couvre de toute façon, c'est l'état qui est vérifié : elle ne doit réapparaître qu'avec la mission).
  async 'aide-briefing'() {
    const c = await play(1)
    try {
      await shootCivilian(c)
      await until(c, `__mission().phase === 'dead'`)
      check(Date.now() - c.t0 < 5000, 'échec tombé avant le minuteur de l\'aide', Date.now() - c.t0)
      await click(c, 'btn-rebrief')
      await until(c, `__mission().phase === 'briefing'`)
      await sleep(Math.max(600, c.t0 + 6000 - Date.now()))
      await capture(c, 'aide-briefing')
      check(await helpOpacity(c) === '0', 'aide masquée pendant le briefing relancé', await helpOpacity(c))
    } finally { await c.close() }
  },

  // Port : le cadenas libère les victimes et compte comme une touche (le rang FANTÔME reste possible).
  async cadenas() {
    const c = await play(3)
    try {
      const before = await mission(c)
      check(await aimAndShoot(c, 'cadenas'), 'cadenas présent au port', null)
      const after = await mission(c)
      check(after.pnj.length > before.pnj.length && after.cibles === before.cibles,
        'le tir a touché le cadenas (victimes libérées, aucune cible touchée)', { avant: before.pnj.length, après: after.pnj.length, cibles: after.cibles })
      check(after.tirs === 1 && after.touches === 1, 'un tir, une touche', { tirs: after.tirs, touches: after.touches })
    } finally { await c.close() }
  },

  // Civil abattu puis Échap dans les 600 ms : pas de pause, l'échec arrive seul.
  async 'civil-echap'() {
    const c = await play(1)
    try {
      await shootCivilian(c)
      await escape(c)
      await sleep(100)
      const m = await mission(c)
      check(m.phase === 'playing' && !await shown(c, 'pause-menu'), 'Échap refusé tant que l\'échec est en attente', m.phase)
      await until(c, `__mission().phase === 'dead'`, 2000)
      check(await shown(c, 'game-over') && !await shown(c, 'pause-menu'), 'écran d\'échec seul, sans pause par-dessus',
        { echec: await shown(c, 'game-over'), pause: await shown(c, 'pause-menu') })
      await capture(c, 'civil-echap')
    } finally { await c.close() }
  },
}

const wanted = process.argv.slice(2)
const names = wanted.length ? wanted : Object.keys(SCENARIOS)
let failed = 0
for (const name of names) {
  if (!SCENARIOS[name]) { console.error(`Scénario inconnu : ${name} (scénarios : ${Object.keys(SCENARIOS).join(', ')})`); process.exit(2) }
  console.log(`▶ ${name}`)
  try { await SCENARIOS[name](); console.log(`  VERT ${name}`) }
  catch (e) { failed++; console.log(`  ROUGE ${name} : ${e.message}`) }
}
console.log(failed ? `${failed} scénario(s) rouge(s) sur ${names.length}` : `${names.length} scénario(s) vert(s)`)
process.exit(failed ? 1 : 0)
