// Vérifications de la campagne dans Chrome sans interface, pilotées par le protocole DevTools (CDP).
// Rejoue des séquences que les tests ne peuvent pas atteindre (main.js ne s'importe pas sous jsdom) et lit l'état
// par les accroches de dev __mission() et __aimAt(). Prérequis : npm run dev.
// Usage : node scripts/verif-mission.mjs [scénario…]   (sans argument : tous ; CAPTURES=1 : images dans shots/)
// Variables : CHROME (chemin de Chrome), BASE_URL (défaut http://localhost:5173/), TAILLE (défaut 1280,720),
// SWIFTSHADER=1 (rendu logiciel au lieu de la carte graphique), RALENTI=n (processeur de la page ralenti n fois,
// Emulation.setCPUThrottlingRate : une machine lente ou chargée, où le temps du jeu, au pas plafonné à 50 ms,
// retarde sur l'horloge murale). Chaque scénario part d'un profil jetable.
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
    if (+process.env.RALENTI > 1) await c.send('Emulation.setCPUThrottlingRate', { rate: +process.env.RALENTI })
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

// Sauvegarde en mission n, prologue et briefings déjà vus.
const saveAt = n => ({ levels: {}, points: 0, totalScore: 0, currentLevel: n, freedVictims: false,
  briefingSeen: [true, true, true, true, true, true], prologueSeen: true, campaignDone: false })

// Mission n, briefing déjà vu : COMMENCER mène droit au jeu.
async function play(n) {
  const c = await openChrome(saveAt(n))
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

// Prêt à tirer : lunette ouverte à 100 % (180 ms, spec du lot 2 §3.2), culasse revenue (1,2 s après le coup précédent,
// §3.3) et aucune balle en vol. Le clic gauche ne tire qu'alors : __aim().pret.
const scopeOpen = c => until(c, '__aim().pret', 3000)

// La balle est arrivée, ou ne le fera jamais : hors de la phase de jeu (échec tombé pendant son vol, une cible ayant
// fui), elle reste figée en vol.
const BALLE_ARRIVEE = `!__mission().balle || __mission().phase !== 'playing'`

// Avance d'un tir sur un PNJ qui marche ou qui fuit : le délai de la balle (0,45 s sans Vélocité), plus l'image où la
// visée est prise (comme shootAhead).
const AVANCE = 0.45 + 1 / 60

// Lunette ouverte, souffle retenu, visée sur `what` (voir __aimAt), puis un tir dont on attend l'impact. Un PNJ qui
// marche ou qui fuit est visé là où il sera à l'arrivée de la balle (AVANCE) : depuis la culasse du lot 2 (1,2 s entre
// deux coups), le tir suivant tombe souvent sur une cible lancée dans sa fuite (environ 6 m/s au port), qu'un tir au
// centre manquait. Options : zone visée ('torse', 'tete', 'membre' : __aimAt), apnee (faux : souffle relâché, le
// tremblement entier), avance (0 : au centre du PNJ, sans le mener).
// Faux si la visée n'a rien trouvé ; null si la mission a pris fin avant que le tir soit prêt (une cible sortie du
// champ l'a fait échouer pendant la culasse).
async function aimAndShoot(c, what, n = 0, { zone = 'torse', apnee = true, avance = what === 'cadenas' ? 0 : AVANCE } = {}) {
  await mouse(c, 'mousedown', 2)
  await key(c, apnee ? 'keydown' : 'keyup', 'Shift', 'ShiftLeft')
  await frames(c, 10)   // le tremblement se calme
  await until(c, `__aim().pret || __mission().phase !== 'playing'`, 3000)
  if ((await mission(c)).phase !== 'playing') return null
  const tirs = (await mission(c)).tirs
  const ok = await js(c, `new Promise(r => {
    if (!__aimAt(${JSON.stringify(what)}, ${n}, ${avance}, ${JSON.stringify(zone)})) return r(false)
    requestAnimationFrame(() => { document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); r(true) })
  })`)
  if (!ok) return false
  await until(c, `__mission().tirs === ${tirs + 1}`, 3000)
  await until(c, BALLE_ARRIVEE)
  return true
}

// Tir sur une cible du convoi (M5), visée `avance` secondes devant elle. La visée est posée entre deux images, la
// boucle du jeu la prend à l'image suivante, et le tir part aussitôt après dans la même image : avance = délai de
// la balle + une image. Faux si la visée n'a rien trouvé.
async function shootAhead(c, what, avance) {
  await mouse(c, 'mousedown', 2)
  await key(c, 'keydown', 'Shift', 'ShiftLeft')
  await frames(c, 10)
  await scopeOpen(c)
  const tirs = (await mission(c)).tirs
  const ok = await js(c, `new Promise(r => {
    if (!__aimAt(${JSON.stringify(what)}, 0, ${avance})) return r(false)
    requestAnimationFrame(() => { document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); r(true) })
  })`)
  if (!ok) return false
  await until(c, `__mission().tirs === ${tirs + 1}`, 3000)
  await until(c, BALLE_ARRIVEE)
  return true
}

// RECOMMENCER la mission en cours (pause, puis RECOMMENCER LE NIVEAU ; RÉESSAYER depuis l'écran d'échec), une fois la
// balle arrivée et un échec en attente tombé : la même mission repart, stress à zéro, PNJ placés à neuf. Pas pendant
// la kill-cam ni après une réussite (la campagne est passée à la mission suivante).
async function restart(c) {
  await until(c, `__mission().phase !== 'playing' || (!__mission().balle && !__mission().failPending)`, 3000)
  const { phase } = await mission(c)
  if (phase === 'playing') {
    await escape(c)
    await until(c, `__mission().phase === 'paused'`)
    await click(c, 'btn-restart')
  } else if (phase === 'dead') {
    await click(c, 'btn-retry')
  } else throw new Error(`relance impossible depuis la phase ${phase}`)
  await until(c, `__mission().phase === 'playing' && __mission().tirs === 0`)
}

// Vitesse au sol (m/s) du PNJ d'indice i de __mission().pnj, mesurée sur `ms` millisecondes.
async function groundSpeed(c, i, ms = 200) {
  const a = (await mission(c)).pnj[i]
  const t0 = Date.now()
  await sleep(ms)
  const b = (await mission(c)).pnj[i]
  return Math.hypot(b[0] - a[0], b[2] - a[2]) / ((Date.now() - t0) / 1000)
}

// Un civil abattu (M1) : posé au milieu de la rue, à découvert et immobile (__placer), puis visé au torse. Depuis le
// lot 2, le décor arrête la balle : un civil visé là où il marchait pouvait être derrière un banc ou un étal, le tir
// manqué faisait fuir la cible, et l'échec « Une cible a fui » tombait parfois avant la touche suivante. Les civils
// sont essayés un par un (un garde ou une cible peut encore se trouver sur la ligne de tir).
async function shootCivilian(c) {
  for (let n = 0; n < 8; n++) {
    if (!await js(c, `__placer('civil', ${n}, 0, 2)`)) break
    await frames(c, 3)
    if (!await aimAndShoot(c, 'civil', n)) break
    if (await js(c, `[...document.querySelectorAll('.kill-entry')].some(e => e.textContent.includes('CIVIL ABATTU'))`)) return
    if ((await mission(c)).phase !== 'playing') break
  }
  throw new Error('aucun civil touché : scénario non concluant')
}

// ── Scénarios ──
const check = (ok, what, seen) => { if (!ok) throw new Error(`${what} (vu : ${JSON.stringify(seen)})`); console.log('    ok :', what) }
// La même, sans rien afficher : les essais répétés d'une mesure (difficulte).
const need = (ok, what, seen) => { if (!ok) throw new Error(`${what} (vu : ${JSON.stringify(seen)})`) }

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

  // Page chargée, avant toute mission : l'aide ne transparaît pas sous le menu (opacité 0 dans la feuille de style).
  async 'aide-chargement'() {
    const c = await openChrome(saveAt(1))
    try {
      await sleep(600)
      const op = await js(c, `getComputedStyle(document.getElementById('instruction')).opacity`)
      await capture(c, 'aide-chargement')
      check((await mission(c)).phase === 'menu' && op === '0', 'aide invisible sous le menu au chargement', op)
    } finally { await c.close() }
  },

  // Échec avant le minuteur de 5 s : l'aide s'éteint avec l'écran d'échec au lieu de rester pâle dessous.
  // triggerFleeGameOver et triggerConvoyEscaped passent par la même fonction que triggerGameOver (clearForEndScreen).
  async 'aide-echec'() {
    const c = await play(1)
    try {
      await shootCivilian(c)
      await until(c, `__mission().phase === 'dead'`)
      check(Date.now() - c.t0 < 5000, 'échec tombé avant le minuteur de l\'aide', Date.now() - c.t0)
      check(await helpOpacity(c) === '0', 'aide masquée sous l\'écran d\'échec', await helpOpacity(c))
      await sleep(600)   // fondu de l'aide (0,5 s)
      await capture(c, 'aide-echec')
    } finally { await c.close() }
  },

  // Réussite avant le minuteur de 5 s (M1 : une seule cible, ralenti de 1,5 s) : l'aide s'éteint avec l'écran de
  // réussite. La cible est posée au milieu de la rue, à découvert (sinon un civil se trouvait parfois sur la ligne de
  // tir : scénario non concluant).
  async 'aide-reussite'() {
    const c = await play(1)
    try {
      check(await js(c, `__placer('cible', 0, 0, 2)`), 'cible posée au milieu de la rue', null)
      await frames(c, 3)
      for (let i = 0; i < 3 && (await mission(c)).cibles > 0 && (await mission(c)).phase === 'playing'; i++) {
        await aimAndShoot(c, 'cible')
      }
      await until(c, `__mission().phase !== 'playing'`, 3000)
      const m = await mission(c)
      if (m.phase !== 'cleared') throw new Error(`cible manquée ou civil sur la ligne de tir : scénario non concluant (${m.phase})`)
      check(Date.now() - c.t0 < 5000, 'réussite tombée avant le minuteur de l\'aide', Date.now() - c.t0)
      check(await helpOpacity(c) === '0', 'aide masquée sous l\'écran de réussite', await helpOpacity(c))
      await sleep(600)
      await capture(c, 'aide-reussite')
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

  // Port (spec du lot 2, §4 et §5) : une cible posée derrière le conteneur rouge (__placer), visée au torse à travers
  // lui. La balle s'arrête sur le conteneur, en métal (étincelles et marque : CAPTURES=1), et ne touche personne. Avant
  // le lot 2 (aucune occlusion), elle touchait la cible au travers.
  async occlusion() {
    const c = await play(3)
    try {
      check(await js(c, `__placer('cible', 0, -16.5, -3)`), 'cible posée derrière le conteneur rouge', null)
      await frames(c, 3)
      const avant = await mission(c)
      check(await aimAndShoot(c, 'cible', 0), 'cible visée au torse, à travers le conteneur', null)
      await capture(c, 'occlusion-m3')
      const m = await mission(c)
      check(m.tirs === avant.tirs + 1, 'un tir est parti', { avant: avant.tirs, apres: m.tirs })
      check(m.touches === 0 && m.cibles === avant.cibles, 'aucune touche à travers le conteneur', { touches: m.touches, cibles: m.cibles })
      check(m.dernierImpact && m.dernierImpact.role === 'decor' && m.dernierImpact.surface === 'metal',
        'la balle s\'est arrêtée sur le conteneur (décor en métal)', m.dernierImpact)
    } finally { await c.close() }
  },

  // Tir à la tête au repos (spec du lot 2, §4 et §5) : la tête est détectée sur l'os, en plongée (M2, du toit, à une
  // trentaine de mètres) comme sur une cible assise (M6, le commanditaire sur son canapé). Lunette ouverte, souffle
  // retenu, visée au milieu du crâne (__aimAt, zone 'tete'), sur une cible immobile : en M2, elle est posée à découvert
  // sur la place, entre la fontaine et les bancs (__placer), car une cible qui marche peut changer de pas pendant le vol
  // de la balle et le tir mené passer à côté de la tête (vu une fois sur une vingtaine ; les tirs sur des cibles qui
  // marchent sont mesurés par le scénario difficulte). Avant le lot 2, la tête était « tout ce qui dépasse 1,45 m »
  // au-dessus des pieds, sur une boîte de 0,8 × 2 × 0,8 m : la tête d'une cible assise n'y était jamais. En M2, la
  // cible est visée debout, puis accroupie (__placer, état 'react' : la pose Crouch d'un PNJ qui se baisse après un
  // tir proche), le milieu de son crâne de 0,87 à 0,96 m au-dessus des pieds selon le modèle : debout, toute sa tête
  // dépasse 1,45 m (le bas de la zone, menton compris, de 1,51 à 1,54 m sur les sept modèles posés comme dans
  // tests/shot/glb-bones.test.js) et l'ancienne règle la voyait aussi ; accroupie, toute sa tête est sous 1,45 m, et
  // seule la tête calée sur l'os la trouve en plongée (relecture de T8).
  async tete() {
    for (const [n, pose] of [[2, 'debout'], [2, 'accroupie'], [6, 'assise']]) {
      const quoi = n === 2 ? `mission 2, cible ${pose}` : 'mission 6'
      // M6 : un danseur peut passer entre la fenêtre et le canapé ; la mission est rejouée (trois essais au plus)
      for (let essai = 1; ; essai++) {
        const c = await play(n)
        try {
          if (n === 2) {
            check(await js(c, `__placer('cible', 0, 5, -5, '${pose === 'accroupie' ? 'react' : 'idle'}')`), `${quoi} : posée sur la place, à découvert`, null)
            // Le fondu des clips (0,25 s) : le crâne (__aimAt, zone 'tete') descend jusqu'à se poser, moins d'un
            // centimètre entre deux relevés à 5 images d'écart (une trentaine d'images n'y suffisaient pas toujours)
            let tete = null, pieds = null, h = null
            for (let k = 0, prec = Infinity; k < 40; k++) {
              await frames(c, 5)
              tete = await js(c, `__aimAt('cible', 0, 0, 'tete')`)
              pieds = (await mission(c)).pnj.find(p => p[0] === 5 && p[2] === -5)
              h = Array.isArray(tete) && pieds ? +(tete[1] - pieds[1]).toFixed(2) : null
              if (h === null || Math.abs(h - prec) < 0.01) break
              prec = h
            }
            // Accroupie, la condition du témoin : toute la tête sous 1,45 m (le haut de la zone de tête est 0,10 m
            // au-dessus du milieu du crâne). Debout, le crâne seulement au-dessus de 1,5 m : la cible est bien debout.
            if (pose === 'accroupie') {
              check(h !== null && h < 1.2, `${quoi} : le milieu du crâne à ${h} m au-dessus des pieds, toute la tête sous 1,45 m`, { tete, pieds })
            } else check(h !== null && h > 1.5, `${quoi} : le milieu du crâne à ${h} m au-dessus des pieds`, { tete, pieds })
          }
          const avant = await mission(c)
          check(await aimAndShoot(c, 'cible', 0, { zone: 'tete' }), `${quoi} : visée à la tête`, null)
          const m = await mission(c)
          const i = m.dernierImpact
          if (n === 6 && i?.role === 'civilian' && essai < 3) { console.log(`    un civil sur la ligne de tir : essai ${essai + 1}`); continue }
          check(i?.role === 'target' && i.part === 'tete', `${quoi} : la balle touche la cible à la tête`, i)
          check(m.cibles === avant.cibles - 1, `${quoi} : la cible tombe`, { avant: avant.cibles, apres: m.cibles })
          const fil = await js(c, `[...document.querySelectorAll('.kill-entry')].map(e => e.textContent).join(' | ')`)
          check(fil.includes('HEADSHOT'), `${quoi} : le fil dit HEADSHOT`, fil)
          await capture(c, `tete-m${n}${n === 2 ? `-${pose}` : ''}`)
          break
        } finally { await c.close() }
      }
    }
  },

  // Culasse (spec du lot 2, §3.3) : deux clics rapprochés ne donnent qu'un tir. Le second clic part après l'arrivée de
  // la balle (0,45 s), pendant les 1,2 s de culasse : avant le lot 2, il tirait dès la résolution du premier (un clic
  // pendant le vol, déjà refusé avant, l'est toujours). Visée dans le ciel : la balle part au loin, personne ne réagit,
  // la mission continue. La culasse revenue, le clic suivant tire. Durées lues sur l'horloge de la mission
  // (__aim().horloge, celle de la culasse), pas sur l'horloge murale : sur une machine lente ou chargée, le pas du jeu
  // est plafonné à 50 ms et son temps retarde (à RALENTI=20, la culasse revenait 2,1 s après le coup à l'horloge
  // murale). Une veille relève l'horloge à la première image où le clic gauche tire de nouveau : la culasse dure
  // 1,2 s (sans Vélocité), à une image près (50 ms au plus).
  async culasse() {
    const c = await play(1)
    try {
      await mouse(c, 'mousedown', 2)
      await frames(c, 10)
      await scopeOpen(c)
      await js(c, `document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: -4000, bubbles: true }))`)
      await frames(c, 3)
      const t0 = (await mission(c)).tirs
      const depart = await js(c, `(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
        window.__culasseRevenue = new Promise(r => { const f = () => (__aim().pret ? r(__aim().horloge) : requestAnimationFrame(f)); requestAnimationFrame(f) })
        return __aim().horloge
      })()`)
      await until(c, `__mission().tirs === ${t0 + 1}`, 3000)
      await sleep(100)
      await mouse(c, 'mousedown', 0)   // balle en vol
      await until(c, `!__mission().balle`)
      // balle arrivée, culasse en cours
      const clic = await js(c, `(document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })), __aim().horloge)`)
      await frames(c, 5)
      const m = await mission(c)
      const a = await js(c, '__aim()')
      check(m.tirs === t0 + 1 && !a.pret && a.culasse < 1, 'trois clics en moins de 1,2 s : un seul tir, culasse en cours',
        { tirs: m.tirs - t0, culasse: a.culasse, clicApresS: clic - depart })
      check(m.dernierImpact?.role === 'rien' && m.phase === 'playing', 'balle partie dans le ciel, mission en cours', { impact: m.dernierImpact, phase: m.phase })
      const revenue = await Promise.race([js(c, '__culasseRevenue'), sleep(15000).then(() => null)])
      const duree = revenue === null ? null : +(revenue - depart).toFixed(4)
      check(duree !== null && duree >= 1.2 - 1e-6 && duree <= 1.25 + 1e-6,
        `culasse revenue ${duree} s après le coup, à l'horloge de la mission (1,2 s, à une image près)`, duree)
      await mouse(c, 'mousedown', 0)
      await until(c, `__mission().tirs === ${t0 + 2}`, 3000)
      console.log('    ok : culasse revenue, le clic suivant tire')
    } finally { await c.close() }
  },

  // Surveillance de la difficulté (spec du lot 2, §6 ; plan, tâche T8) : rapport sans seuil, le scénario ne rougit que
  // si la mesure elle-même échoue. En M2, à une trentaine de mètres en plongée, la mission relancée avant chaque essai,
  // souffle relâché (apnée en moins : le tremblement entier) :
  // - au repos (stress proche de 0), visée au crâne d'une cible qui marche, menée : la touche doit rester quasi certaine ;
  // - sous le stress (lunette tenue jusqu'au stress plein, 14 s), même visée : elle doit devenir incertaine (§3.6 : à
  //   stress 1, environ 45 % à la tête) ;
  // - une cible en fuite (une balle passée au-dessus d'elle l'a fait fuir, environ 4,8 m/s en M2), visée au torse après
  //   la culasse, sans la mener (avance 0), puis en la menant : ce que coûte la fuite à un joueur qui ne mène pas
  //   (relecture de T3).
  // ESSAIS=n : nombre d'essais par mesure (défaut 8).
  async difficulte() {
    const N = +process.env.ESSAIS || 8
    let c = await play(2)
    // La mission repart avant chaque essai ; si les deux cibles sont tombées (une balle perdue a pu toucher la seconde),
    // la campagne est passée à M3 : M2 est rouverte dans un Chrome neuf.
    const relancer = async () => {
      const m = await mission(c)
      if (m.killcam || m.phase === 'cleared') { await c.close(); c = await play(2) } else await restart(c)
    }
    const bilan = {}
    // i : __mission().dernierImpact du tir mesuré ; null : essai non concluant (la cible n'a pas fui, ou une cible en fuite,
    // souvent l'autre, est sortie du champ avant le tir : échec « Une cible a fui »)
    const note = (mesure, i) => {
      const b = bilan[mesure] ||= { essais: 0, tete: 0, torse: 0, membre: 0, manque: 0, autre: 0, nonConcluant: 0 }
      b.essais++
      if (!i) b.nonConcluant++
      else if (i.role === 'target' && b[i.part] !== undefined) b[i.part]++
      else if (i.role === 'decor' || i.role === 'rien') b.manque++
      else b.autre++   // garde ou civil sur la ligne de tir
    }
    try {
      for (let k = 0; k < N; k++) {
        if (k) await relancer()
        need(await aimAndShoot(c, 'cible', 0, { zone: 'tete', apnee: false }), 'au repos : cible visée', null)
        note('au repos, à la tête', (await mission(c)).dernierImpact)
      }
      for (let k = 0; k < N; k++) {
        await relancer()
        await mouse(c, 'mousedown', 2)
        await until(c, '__aim().stress >= 0.98', 20000)
        need(await aimAndShoot(c, 'cible', 0, { zone: 'tete', apnee: false }), 'sous le stress : cible visée', null)
        note('stress plein, à la tête', (await mission(c)).dernierImpact)
      }
      for (const [mesure, avance] of [['en fuite, au centre sans avance', 0], ['en fuite, menée', AVANCE]]) {
        for (let k = 0; k < N; k++) {
          await relancer()
          await mouse(c, 'mousedown', 2)
          await frames(c, 10)
          await scopeOpen(c)
          // Une balle qui passe environ 1,5 m au-dessus de la cible et tombe derrière elle : la cible fuit
          const ok = await js(c, `new Promise(r => {
            if (!__aimAt('cible', 0, ${AVANCE})) return r(false)
            document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: -45, bubbles: true }))
            requestAnimationFrame(() => { document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); r(true) })
          })`)
          need(ok, `${mesure} : cible visée`, null)
          await until(c, `__mission().tirs === 1 && (${BALLE_ARRIVEE})`, 3000)
          const fuite = await groundSpeed(c, 0)   // la première cible, en tête des PNJ
          if (fuite < 2.5 || (await mission(c)).phase !== 'playing') { note(mesure, null); continue }
          const tir = await aimAndShoot(c, 'cible', 0, { apnee: false, avance })
          if (tir === null) { note(mesure, null); continue }   // l'autre cible, en fuite, a quitté le champ : échec
          need(tir, `${mesure} : cible visée`, null)
          note(mesure, (await mission(c)).dernierImpact)
        }
      }
    } finally { await c.close() }
    for (const [mesure, b] of Object.entries(bilan)) {
      console.log(`    mesure : ${mesure} : ${b.essais} essai(s), tête ${b.tete}, torse ${b.torse}, membre ${b.membre}, ` +
        `manqué ${b.manque}, autre PNJ ${b.autre}${b.nonConcluant ? `, non concluant ${b.nonConcluant} (pas de fuite, ou une cible sortie du champ avant le tir)` : ''}`)
    }
  },

  // Son du tir (spec du lot 2, §3.5) : au port, l'écho de la carte est monté (acoustique du port) et la pluie tombe ; une
  // balle arrêtée par le conteneur rouge, à une trentaine de mètres, fait entendre le métal le temps que le son revienne
  // (distance / 343 s, environ 0,09 s), envoyé vers l'écho ; revenu au menu, l'écho est libéré et la pluie coupée. En
  // M1, l'écho de la rue, sans pluie, et une cible touchée sonne la chair, sans bip. Avant la tâche T6 : ni écho, ni
  // pluie, ni son d'impact (le bip d'arcade pour une cible touchée seulement).
  async son() {
    const sons = c => js(c, '__son()')
    const port = await play(3)
    try {
      const s = await sons(port)
      check(s.contexte === 'running' && s.echo === 'port' && s.pluie && s.nappe, 'au port : écho du port monté, pluie et nappe', s)
      check(await js(port, `__placer('cible', 0, -16.5, -3)`), 'cible posée derrière le conteneur rouge', null)
      await frames(port, 3)
      check(await aimAndShoot(port, 'cible', 0), 'tir dans le conteneur', null)
      const { dernierImpact: i } = await mission(port)
      const [son] = i?.sons || []
      check(i?.surface === 'metal' && i.sons.length === 1 && son.son === 'impact-metal' && son.echo === true && son.at > 0.06 && son.at < 0.13,
        'le métal, entendu distance / 343 s après l\'arrivée de la balle, vers l\'écho', i)
      await escape(port)
      await until(port, `__mission().phase === 'paused'`)
      await click(port, 'btn-pause-menu')
      await until(port, `__mission().phase === 'menu'`)
      const menu = await sons(port)
      check(menu.echo === null && !menu.pluie && !menu.nappe, 'au menu : écho libéré, pluie et nappe coupées', menu)
    } finally { await port.close() }

    const rue = await play(1)
    try {
      const s = await sons(rue)
      check(s.echo === 'rue' && !s.pluie, 'en M1 : écho de la rue, sans pluie', s)
      // au milieu de la rue, à découvert (une cible tirée au hasard peut se tenir derrière une poubelle ou une voiture)
      check(await js(rue, `__placer('cible', 0, 0, 2)`), 'cible posée au milieu de la rue', null)
      await frames(rue, 3)
      check(await aimAndShoot(rue, 'cible', 0), 'cible visée au torse', null)
      const { dernierImpact: i } = await mission(rue)
      check(i?.role === 'target' && i.sons.length === 1 && i.sons[0].son === 'impact-chair',
        'cible touchée : la chair confirme la touche, sans bip', i)
    } finally { await rue.close() }
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

  // Raccourci de développement lu sur e.code : la touche 3 d'un clavier AZERTY (e.key '"', e.code Digit3) lance la
  // mission 3 depuis le menu, mais rien sous les paramètres ni sous le menu multijoueur.
  async raccourci() {
    const c = await openChrome(saveAt(1))
    try {
      await sleep(1500)   // modèles des personnages
      const digit3 = () => key(c, 'keydown', '"', 'Digit3')
      await click(c, 'btn-settings-menu')
      await digit3()
      await sleep(300)
      check((await mission(c)).phase === 'menu', 'paramètres ouverts : la touche 3 ne lance rien', (await mission(c)).phase)
      await click(c, 'btn-settings-back')
      await click(c, 'btn-multiplayer')
      check(await shown(c, 'mp-menu'), 'menu multijoueur affiché', null)
      await digit3()
      await sleep(300)
      check((await mission(c)).phase === 'menu', 'menu multijoueur ouvert : la touche 3 ne lance rien', (await mission(c)).phase)
      await click(c, 'btn-mp-back')
      await digit3()
      await until(c, `__mission().phase === 'playing'`, 5000)
      const hud = await js(c, `document.getElementById('hud-level').textContent`)
      check(hud.includes('3/6'), 'menu principal : la touche 3 AZERTY lance la mission 3', hud)
    } finally { await c.close() }
  },

  // Apnée sur e.code (Maj gauche et droite), relâchée quand la fenêtre perd le focus : après un Alt-Tab, le keyup de
  // Maj n'arrive jamais et le souffle restait retenu.
  async apnee() {
    const c = await play(1)
    try {
      await mouse(c, 'mousedown', 2)
      await key(c, 'keydown', 'Shift', 'ShiftRight')
      check((await mission(c)).souffle === true, 'Maj droite retient le souffle', (await mission(c)).souffle)
      await key(c, 'keyup', 'Shift', 'ShiftRight')
      check((await mission(c)).souffle === false, 'Maj droite relâchée', (await mission(c)).souffle)
      await key(c, 'keydown', 'Shift', 'ShiftLeft')
      check((await mission(c)).souffle === true, 'Maj gauche retient le souffle', (await mission(c)).souffle)
      await js(c, `window.dispatchEvent(new Event('blur'))`)
      check((await mission(c)).souffle === false, 'fenêtre quittée (Alt-Tab) : le souffle est relâché', (await mission(c)).souffle)
    } finally { await c.close() }
  },

  // PNJ posés sur le sol de la carte : dalle du port (0,345 m), tarmac de la base (0,2 m). Capture dans la lunette.
  async sol() {
    for (const [n, sol, who] of [[3, 0.345, 'civil'], [4, 0.2, 'garde']]) {
      const c = await play(n)
      try {
        await mouse(c, 'mousedown', 2)
        await key(c, 'keydown', 'Shift', 'ShiftLeft')
        await frames(c, 10)
        await scopeOpen(c)
        check(await js(c, `__aimAt(${JSON.stringify(who)})`), `mission ${n} : un ${who} à viser`, null)
        await frames(c, 3)
        await capture(c, `sol-m${n}`)
        const m = await mission(c)
        check(m.sol === sol, `mission ${n} : sol de la carte à ${sol} m`, m.sol)
        const ys = m.pnj.map(p => p[1])
        check(ys.length > 0 && ys.every(y => Math.abs(y - sol) < 1e-3), `mission ${n} : tous les PNJ ont les pieds sur le sol`, ys)
      } finally { await c.close() }
    }
  },

  // Port réussi, puis AMÉLIORER : la page du journal de Viktor dit le choix moral dans les deux sens (victimes
  // libérées par le cadenas, ou conteneur resté fermé), sans tiret cadratin.
  async journal() {
    for (const libres of [true, false]) {
      const variante = libres ? 'libres' : 'enfermes'
      const c = await play(3)
      try {
        if (libres) check(await aimAndShoot(c, 'cadenas'), 'cadenas touché', null)
        for (let i = 0; i < 6 && (await mission(c)).cibles > 0 && (await mission(c)).phase === 'playing'; i++) {
          await aimAndShoot(c, 'cible', 0)
        }
        await until(c, `__mission().phase !== 'playing'`, 5000)   // après le ralenti de 1,5 s
        const m = await mission(c)
        if (m.phase !== 'cleared') throw new Error(`cible manquée ou civil sur la ligne de tir : scénario non concluant (${m.phase})`)
        await capture(c, `journal-${variante}-reussite`)
        await click(c, 'btn-upgrades')
        const page = await js(c, `document.getElementById('journal-next').parentElement.innerText`)
        await capture(c, `journal-${variante}`)
        const attendu = libres ? 'P.S. Je les ai vus courir hors du conteneur. Libres.' : 'P.S. Le conteneur rouge est resté fermé. Je l\'entends encore.'
        check(page.includes(attendu), `${variante} : la note du port`, page)
        check(!page.includes(libres ? 'resté fermé' : 'courir'), `${variante} : pas la note de l'autre choix`, page)
        check(!page.includes('\u2014'), `${variante} : aucun tiret cadratin sur la page`, page)
      } finally { await c.close() }
    }
  },

  // Briefing de M6 pas encore vu (spec du lot 1 §4.6) : la mission se monte et ses shaders se compilent pendant la
  // cinématique. Sous la cinématique, la foule est déjà là et rien n'est rendu (compte des rendus immobile) ; au départ,
  // la mission reprend cette foule au lieu d'en tirer une autre. Deux passes : modèles déjà chargés (montage sur l'écran
  // noir, avant que la scène de la cinématique ne démarre), puis réseau bridé à 2 Mo/s sans cache (la cinématique
  // démarre sans les attendre, la mission se monte à leur arrivée, jamais avant : PNJ procéduraux).
  async 'briefing-montage'() {
    for (const bride of [false, true]) {
      const c = await openChrome({ ...saveAt(6), briefingSeen: [true, true, true, true, true, false] })
      const passe = bride ? 'modèles en chargement' : 'modèles chargés'
      try {
        if (bride) {
          await c.send('Network.enable')
          await c.send('Network.setCacheDisabled', { cacheDisabled: true })
          await c.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: 2e6, uploadThroughput: 2e6 })
          await js(c, 'window.__ancienne = true')
          await c.send('Page.reload')
          await until(c, `!window.__ancienne && document.readyState === 'complete' && typeof window.__mission === 'function'`, 60000)
        } else {
          await sleep(1500)   // modèles des personnages
        }
        await click(c, 'btn-start')
        await until(c, `!!document.querySelector('#briefing-root #st')`, 30000)   // la scène de la cinématique a démarré
        const auDebut = (await mission(c)).pnj.length
        if (bride) check(auDebut === 0, `${passe} : la cinématique démarre sans attendre les modèles, rien n'est monté avant eux`, auDebut)
        else check(auDebut > 0, `${passe} : la mission est montée avant que la cinématique ne démarre`, auDebut)
        await until(c, `__mission().phase === 'briefing' && __mission().pnj.length > 0`, 90000)
        const pendant = await mission(c)
        const r1 = (await js(c, '__mem()')).images
        await sleep(2000)
        const r2 = (await js(c, '__mem()')).images
        check(r2 === r1 && (await mission(c)).phase === 'briefing', `${passe} : rien n'est rendu sous la cinématique`, { r1, r2 })
        await capture(c, `briefing-montage-${bride ? 'chargement' : 'pret'}-cinematique`)
        await escape(c)   // délai de grâce de 0,5 s passé
        await until(c, `__mission().phase === 'playing'`, 30000)
        const apres = await mission(c)
        const proche = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.5
        check(apres.pnj.length === pendant.pnj.length && apres.pnj.every((p, i) => proche(p, pendant.pnj[i])),
          `${passe} : la mission reprend la foule montée pendant le briefing`, { pendant: pendant.pnj.slice(0, 3), apres: apres.pnj.slice(0, 3) })
        await frames(c, 10)
        await capture(c, `briefing-montage-${bride ? 'chargement' : 'pret'}-mission`)
      } finally { await c.close() }
    }
  },

  // Convoi (M5) : jeeps et occupants sur la route (0,2 m). Le colonel abattu suit sa jeep, qui roule encore à 15 %
  // pendant le ralenti, au lieu de rester suspendu en l'air.
  async convoi() {
    const c = await play(5)
    try {
      // Le colonel est le premier PNJ (les cibles sont créées d'abord), sur la banquette arrière de la jeep du milieu.
      const seated = m => Math.abs(m.pnj[0][0] - (m.jeeps[1][0] - 1.4)) < 1e-3 && Math.abs(m.pnj[0][1] - (0.2 + 0.82)) < 1e-3
      let m = await mission(c)
      check(m.sol === 0.2, 'route à 0,2 m', m.sol)
      check(m.jeeps.every(j => Math.abs(j[1] - 0.2) < 1e-3), 'jeeps posées sur la route', m.jeeps)
      check(seated(m), 'colonel assis sur la banquette, au-dessus de la route', { colonel: m.pnj[0], jeep: m.jeeps[1] })
      await until(c, `__mission().jeeps[1][0] > -12`, 15000)   // la jeep du colonel arrive devant le poste
      for (let i = 0; i < 6 && (await mission(c)).cibles > 0; i++) await shootAhead(c, 'cible', AVANCE)
      m = await mission(c)
      check(m.cibles === 0, 'colonel abattu', { cibles: m.cibles, tirs: m.tirs })
      await frames(c, 30)   // ralenti de 1,5 s
      const k = await mission(c)
      await capture(c, 'convoi-ralenti')
      check(k.killcam, 'toujours dans le ralenti', k.phase)
      check(k.jeeps[1][0] > m.jeeps[1][0], 'la jeep roule encore', { avant: m.jeeps[1], après: k.jeeps[1] })
      check(seated(k), 'le corps du colonel suit sa jeep', { colonel: k.pnj[0], jeep: k.jeeps[1] })
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
