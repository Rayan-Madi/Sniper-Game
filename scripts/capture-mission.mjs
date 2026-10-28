// Captures déterministes du jeu (menu, vue de départ d'une mission) dans Chrome sans interface, pour comparer deux
// versions du code image par image : Math.random est remplacé par un générateur à graine, requestAnimationFrame et
// performance.now sont pilotés à la main (N images de 1/60 s), les minuteurs du jeu suivent cette horloge et les
// fondus CSS sont figés. Rendu logiciel (SwiftShader) par défaut : même code, mêmes octets PNG. Sur la carte
// graphique (GPU=1), deux sessions peuvent différer d'un niveau de couleur sur quelques pixels (shaders compilés par
// le pilote).
// Prérequis : npm run dev. Usage : node scripts/capture-mission.mjs <dossier> [menu] [1…6] [retour1…retour6]
//   [lunette1…lunette6] [mi-lunette1…mi-lunette6] [tir1…tir6]
//   ex. node scripts/capture-mission.mjs avant-lot1 menu 1 3 5 6   → shots/avant-lot1/m1.png, …
//   retour<n> : mission n, trois tirs manqués (marques et gerbes dans le décor, sillage encore en vie), puis retour au menu
//   (pause, MENU ; MENU de l'écran d'échec si une cible a fui) → shots/<dossier>/retour-m<n>.png. Le décor de la
//   scène (__decor() : fond, objets hors carte) est affiché avant et après le retour.
//   lunette<n> : mission n, vue de départ, puis clic droit et 15 images (250 ms) : lunette ouverte à 100 %
//   → shots/<dossier>/lunette-m<n>.png. mi-lunette<n> : 5 images seulement (83 ms sur les 180 de l'ouverture, spec du
//   lot 2 §3.2) : vignette à mi-course, champ de vision entre 60° et 15°, réticule pas encore apparu
//   → mi-lunette-m<n>.png. L'horloge pilotée fige l'animation à l'image près : pas besoin de route de dev.
//   tir<n> : lunette<n>, puis un tir sur la vue de départ et APRES images (défaut 12, 200 ms) : balle en vol, sillage
//   qui monte vers le point visé, vue relevée par le recul, jauge de la culasse sous le réticule (spec du lot 2 §3.3) ;
//   APRES=4 pour la lueur du coup de feu (éteinte en 140 ms) ; VISER=cible (ou garde, civil, cadenas : __aimAt) vise
//   ce PNJ avant le tir → shots/<dossier>/tir-m<n>.png.
//   sonde : sonde de lisibilité à longue distance (spec du lot 3, porte de décision 3.0 ; scripts/sonde.mjs). Pour
//   chaque poste (155 m en M3, 138 m en M5, 430 m en M4, 250 m pour son repli), chaque zoom (×8, ×12, ×20 et le zoom
//   maximum de base de la mission) et chaque qualité (Moyen, Bas) : la route ?sonde=1 en 1920 × 1080, une capture JPEG
//   du carré de la lunette (JPEG=qualité, défaut 85) et les mesures de la page (silhouette, tête, buste de chaque
//   personnage, en pixels rendus) → shots/<dossier>/sonde-<poste>-x<zoom>-<qualité>.jpg et sonde.json, avec le
//   critère par défaut de la spec §4 appliqué (tableaux en Markdown dans la sortie). sonde-<poste> (ex. sonde-430m) :
//   ce poste seulement. sonde-libre : une capture de la route avec les paramètres de PARAMS (poste=…&regard=…&zoom=…,
//   voir main.js), QUALITE et MISSION (la mission en cours, défaut 1) → sonde-libre.jpg. ANNEXE_SONDE=<nom> : le JSON
//   et les captures vont aussi dans docs/superpowers/specs/annexes/<nom>.json et <nom>/.
// Variables : CHROME (chemin de Chrome), BASE_URL (défaut http://localhost:5173/), IMAGES (défaut 20),
// GPU=1 (carte graphique au lieu du rendu logiciel), PARAMS (ajoutés à l'URL, ex. stats=1), QUALITE (préréglage
// graphique enregistré dans le profil jetable : auto, bas, moyen, haut ; sans elle, celui d'un premier lancement, Auto).
// Le port DevTools est choisi par Chrome (--remote-debugging-port=0, relu dans DevToolsActivePort) : jamais un port
// fixe, qui pourrait désigner le navigateur d'une autre session. Profil jetable, supprimé à la fin.
// Rendu interrompu (scripts/garde-rendu.mjs) : l'état du rendu est lu dans la page juste avant et juste après chaque
// capture. Contexte WebGL perdu, écran « LE RENDU A ÉTÉ INTERROMPU » affiché ou page rechargée : l'image est refusée
// (rien n'est écrit) et la capture refaite dans un Chrome neuf, après 5 s, trois essais en tout ; refusée à chaque
// essai, elle compte comme un échec, et une passe de la sonde incomplète laisse l'annexe (ANNEXE_SONDE) telle quelle.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { POSTES_SONDE, SEUILS, jobsSonde, urlSonde, verdictPoste, decisionM4, distanceLimite, carreLunette, tableauMesures,
  tableauVerdicts, ecartAuCalcul, annexeSonde } from './sonde.mjs'
import { captureGardee, avecNouveauxEssais } from './garde-rendu.mjs'

const [dir, ...what] = process.argv.slice(2)
if (!dir || !what.length) { console.error('Usage : node scripts/capture-mission.mjs <dossier> [menu] [1…6] [sonde]'); process.exit(1) }
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = process.env.BASE_URL || 'http://localhost:5173/'
const URL_JEU = BASE + (process.env.PARAMS ? '?' + process.env.PARAMS : '')
const IMAGES = +process.env.IMAGES || 20
const JPEG = +process.env.JPEG || 85
// Écran de la sonde : la spec du lot 3 calcule la lisibilité en 1080p. Fixé par l'émulation de DevTools : sans
// interface, --window-size=1920,1080 ne laisse à la page que 1904 × 985.
const ECRAN_SONDE = { width: 1920, height: 1080 }
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

// Une capture = un Chrome neuf (profil jetable) : la page part toujours du même état. target : le nom d'une cible
// (menu, 3, lunette3…), ou une capture de la sonde (un job de scripts/sonde.mjs, ou { libre: true }) : celle-ci rend
// son relevé.
async function shoot(target) {
  const sonde = typeof target === 'object' ? target : null
  const profile = mkdtempSync(join(tmpdir(), 'capture-mission-'))
  const gl = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
  const proc = spawn(CHROME, ['--headless=new', ...gl, '--hide-scrollbars', '--mute-audio', `--user-data-dir=${profile}`,
    sonde ? `--window-size=${ECRAN_SONDE.width},${ECRAN_SONDE.height}` : '--window-size=1280,720', '--remote-debugging-port=0',
    'about:blank'], { stdio: 'ignore' })
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
    if (sonde) await c.send('Emulation.setDeviceMetricsOverride', { ...ECRAN_SONDE, deviceScaleFactor: 1, mobile: false })
    // Sauvegarde posée sur une première page, avant le script de déterminisme
    await c.send('Page.navigate', { url: sonde ? BASE : URL_JEU })
    await until(c, `document.readyState === 'complete'`)
    const cible = sonde ? '' : target
    const retour = /^retour(\d)$/.exec(cible)
    const lunette = /^(mi-)?lunette(\d)$/.exec(cible)
    const tir = /^tir(\d)$/.exec(cible)
    const n = sonde ? sonde.mission || +process.env.MISSION || 1
      : target === 'menu' ? 1 : retour ? +retour[1] : lunette ? +lunette[2] : tir ? +tir[1] : +target
    const qualite = sonde && !sonde.libre ? sonde.qualite : process.env.QUALITE
    await js(c, `localStorage.setItem('sniper-save', ${JSON.stringify(JSON.stringify(saveAt(n)))})`)
    if (qualite) await js(c, `localStorage.setItem('sniper-settings', ${JSON.stringify(JSON.stringify({ graphics: qualite }))})`)
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
    const url = sonde ? BASE + '?' + (sonde.libre ? 'sonde=1&' + (process.env.PARAMS || '') : urlSonde(sonde)) : URL_JEU
    await c.send('Page.navigate', { url })
    await until(c, `document.readyState === 'complete' && typeof window.__step === 'function'`)
    const t0 = Date.now()
    while (charges < 7 && Date.now() - t0 < 60000) await sleep(100)
    if (charges < 7) throw new Error(`modèles chargés : ${charges} sur 7`)
    if (sonde) return await captureSonde(c, sonde, url)
    if (target !== 'menu') {
      await js(c, `document.getElementById('btn-start').click()`)
      await until(c, `__mission().phase === 'playing'`)
    }
    if (retour) await missThenMenu(c)
    await js(c, `__step(${IMAGES})`)
    if (lunette) {
      await js(c, mouse('mousedown', { button: 2 }))
      await js(c, `__step(${lunette[1] ? 5 : 15})`)
      console.log('  visée :', JSON.stringify(await js(c,
        `(({ fov, ouverture, pret }) => ({ fov: +fov.toFixed(2), ouverture: ouverture === undefined ? null : +ouverture.toFixed(3), pret }))(__aim())`)))
    } else if (tir) {
      await js(c, mouse('mousedown', { button: 2 }))
      if (process.env.VISER && !await js(c, `__aimAt(${JSON.stringify(process.env.VISER)})`)) throw new Error(`rien à viser : ${process.env.VISER}`)
      await js(c, `__step(15)`)
      await js(c, mouse('mousedown', { button: 0 }))
      await js(c, `__step(${+process.env.APRES || 12})`)
      console.log('  après le tir :', JSON.stringify(await js(c,
        `(({ culasse, reculDeg, pret }) => ({ culasse, reculDeg, pret, balle: __mission().balle, tirs: __mission().tirs }))(__aim())`)))
    } else {
      await js(c, `__step(1)`)
    }
    const buf = await captureGardee(c, { format: 'png' })
    const nom = target === 'menu' ? 'menu' : retour ? `retour-m${n}` : lunette ? `${lunette[1] || ''}lunette-m${n}` : tir ? `tir-m${n}` : `m${n}`
    const out = resolve('shots', dir, `${nom}.png`)
    mkdirSync(resolve('shots', dir), { recursive: true })
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

// Capture de la sonde : la route ?sonde=1 a monté sa scène (carte, profil, personnages), l'a mesurée et l'a rendue.
// Capture du carré de la lunette, en JPEG, puis le relevé : les mesures de la page, chaque personnage nommé comme
// dans scripts/sonde.mjs (Vosko, Mira…).
async function captureSonde(c, sonde, url) {
  await until(c, `window.__sonde && (__sonde().pret || !!__sonde().erreur)`, 60000)
  const etat = await js(c, '__sonde()')
  if (!etat.pret) throw new Error(`sonde : ${etat.erreur}`)
  const [w, h] = etat.ecran.fenetre
  if (w !== ECRAN_SONDE.width || h !== ECRAN_SONDE.height) throw new Error(`sonde : écran de ${w} × ${h}, ${ECRAN_SONDE.width} × ${ECRAN_SONDE.height} attendu`)
  const buf = await captureGardee(c, { format: 'jpeg', quality: JPEG, clip: { ...carreLunette(w, h), scale: 1 } })
  const fichier = sonde.libre ? 'sonde-libre.jpg' : sonde.fichier
  const out = resolve('shots', dir, fichier)
  mkdirSync(resolve('shots', dir), { recursive: true })
  writeFileSync(out, buf)
  const empreinte = createHash('sha256').update(buf).digest('hex').slice(0, 16)
  console.log(out, empreinte, `${Math.round(buf.length / 1024)} ko`)
  const personnages = etat.personnages.map((p, i) => ({ nom: (sonde.noms && sonde.noms[i]) || p.modele, ...p }))
  for (const p of personnages) {
    console.log(`  ${p.nom} (${p.modele}) à ${p.distanceM} m : silhouette ${p.silhouette && p.silhouette.hauteur} px` +
      ` (calcul ${p.attendu.silhouette}), tête ${p.tete && p.tete.hauteur} px, buste ${p.torse && p.torse.largeur} px de large`)
  }
  return { nom: sonde.nom || 'libre', zoom: etat.zoom, qualite: sonde.qualite || (etat.config && etat.config.qualite) || process.env.QUALITE || null,
    fichier, octets: buf.length, empreinte, url, ecran: etat.ecran, personnages }
}

function gitState() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()
    return dirty ? head + ' (modifié)' : head
  } catch { return null }
}

// Rapport de la sonde : verdict de chaque poste (critère par défaut de la spec §4), décision pour M4, distance où le
// critère tiendrait encore, mesure contre calcul ; tableaux en Markdown pour l'annexe. → shots/<dossier>/sonde.json, et
// docs/superpowers/specs/annexes/<annexe>.json avec ses captures si annexe est donnée (annexeSonde, scripts/sonde.mjs).
function rapportSonde(releves, annexe) {
  const postes = POSTES_SONDE.filter(p => releves.some(r => r.nom === p.nom))
  const verdicts = postes.map(p => verdictPoste(p, releves)).filter(Boolean)
  const v430 = verdicts.find(v => v.nom === '430m')
  const rapport = {
    date: new Date().toISOString(), commit: gitState(), base: BASE, rendu: process.env.GPU ? 'carte graphique' : 'SwiftShader',
    ecran: ECRAN_SONDE, jpeg: JPEG, seuils: SEUILS, releves, verdicts,
    decisionM4: decisionM4(v430),
    distancesLimites: Object.fromEntries(verdicts.map(v => [v.nom, Math.round(distanceLimite(v))])),
    ecartAuCalcul: ecartAuCalcul(releves),
  }
  const fichier = resolve('shots', dir, 'sonde.json')
  writeFileSync(fichier, JSON.stringify(rapport, null, 1) + '\n')
  for (const p of postes) console.log(`\n${p.nom} (M${p.mission}) : ${p.noms.join(', ')}\n` + tableauMesures(p, releves))
  if (verdicts.length) console.log('\nCritère par défaut (spec §4) :\n' + tableauVerdicts(verdicts))
  if (rapport.decisionM4) console.log(rapport.decisionM4.texte)
  for (const v of verdicts) console.log(`${v.nom} : le critère tiendrait jusqu'à ${rapport.distancesLimites[v.nom]} m (×${v.zoom}, en Bas)`)
  if (rapport.ecartAuCalcul) console.log(`silhouettes mesurées : de ${rapport.ecartAuCalcul.min.toFixed(3)} à ${rapport.ecartAuCalcul.max.toFixed(3)} fois le calcul`)
  console.log(`relevé : ${fichier}`)
  if (annexe) {
    const annexes = resolve('docs', 'superpowers', 'specs', 'annexes')
    const dossier = join(annexes, annexe)
    mkdirSync(dossier, { recursive: true })
    for (const r of releves) copyFileSync(resolve('shots', dir, r.fichier), join(dossier, r.fichier))
    copyFileSync(fichier, join(annexes, annexe + '.json'))
    console.log(`annexe : ${join(annexes, annexe + '.json')} et ${dossier}`)
  }
}

// Lunette ouverte, visée relevée au-dessus des PNJ : la balle passe haut et finit loin derrière eux, dans le décor du
// fond (au port, l'entrepôt et ses portes, à une cinquantaine de mètres ; spec du lot 2 §3.4), aucun ne fuit et la mission
// continue. Trois tirs manqués un peu décalés, puis retour au menu pendant que gerbes et sillage sont encore en vie.
// Le clic gauche ne tire que lunette ouverte à 100 % (180 ms, spec du lot 2 §3.2) et culasse revenue (1,2 s après le
// coup précédent, §3.3) : avant chaque tir, les images avancent jusqu'à __aim().pret.
const mouse = (type, init) => `document.dispatchEvent(new MouseEvent('${type}', ${JSON.stringify(init)}))`
const playing = c => js(c, `__mission().phase === 'playing'`)
async function missThenMenu(c) {
  await js(c, mouse('mousedown', { button: 2 }))
  await js(c, mouse('mousemove', { movementX: 0, movementY: -160 }))
  for (let i = 0; i < 3 && await playing(c); i++) {
    if (i) await js(c, mouse('mousemove', { movementX: 40, movementY: 0 }))
    for (let k = 0; k < 120 && !await js(c, '__aim().pret'); k++) await js(c, '__step(1)')
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
// sonde (tous les postes), sonde-<poste> (un poste), sonde-libre (PARAMS) : les captures de la sonde, une par Chrome
const cibles = []
for (const t of what) {
  const m = /^sonde(?:-(.+))?$/.exec(t)
  if (!m) cibles.push(t)
  else if (m[1] === 'libre') cibles.push({ libre: true })
  else {
    const jobs = jobsSonde().filter(j => !m[1] || j.nom === m[1])
    if (!jobs.length) { failed++; console.error(`${t} : aucun poste de ce nom (${POSTES_SONDE.map(p => p.nom).join(', ')})`) }
    cibles.push(...jobs)
  }
}
const releves = []
for (const t of cibles) {
  const nom = typeof t === 'object' ? (t.libre ? 'sonde-libre' : t.fichier) : t
  try { const r = await avecNouveauxEssais(() => shoot(t), { nom }); if (r) releves.push(r) } catch (e) { failed++; console.error(`${nom} : ${e.message}`) }
}
if (releves.length) rapportSonde(releves, annexeSonde(process.env.ANNEXE_SONDE, failed))
if (process.env.ANNEXE_SONDE && failed) console.error(`annexe ${process.env.ANNEXE_SONDE} laissée telle quelle : ${failed} capture(s) en échec, passe à relancer`)
process.exit(failed ? 1 : 0)
