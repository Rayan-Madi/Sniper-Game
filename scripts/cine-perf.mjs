// Coût de rendu d'une cinématique dans le jeu (spec cinématiques v2 §3.6, tâche C3) : Chrome sans interface en temps
// réel, rendu sur la carte graphique, page de 1280 × 720, route de développement ?cine=<id>, processeur de la page
// ralenti au besoin. Une sonde injectée avant les scripts de la page relève, du montage de la scène (#st) à son
// démontage, la durée de chaque image (écart entre deux rappels de requestAnimationFrame) et, toutes les 250 ms, les
// animations en cours (document.getAnimations(), état « running »). Résultat : p50, p95 et max des durées d'image,
// maximum des animations en cours, dans shots/ (relevés bruts compris) et, sur demande, ajouté à une annexe.
// Prérequis : le serveur de développement du jeu (npm run dev). Mode d'emploi et mesures de référence :
// docs/superpowers/specs/annexes/README.md, « Cinématiques v2 ».
// Usage : node scripts/cine-perf.mjs <id> [--ralenti=4] [--params=port=libres] [--annexe=<nom>.json]
//   <id>           scène de scripts/port-maquette.mjs (m1 à m6, epilogue, prologue-a, prologue-b)
//   --ralenti=n    processeur de la page ralenti n fois (Emulation.setCPUThrottlingRate, comme RALENTI de
//                  scripts/verif-mission.mjs) : 4, l'approximation d'un PC de milieu de gamme (spec §3.6)
//   --params=…     paramètres de la scène, ajoutés à l'adresse (port=libres, port=enfermes, attenue=1) ; ni cine ni
//                  freeze (une scène figée ne mesure rien)
//   --annexe=nom   ajoute la mesure (sans ses relevés bruts) à docs/superpowers/specs/annexes/<nom>, créée au besoin ;
//                  les mesures déjà présentes sont gardées, chacune numérotée (passe) par cas et par ralenti
// Variables : CHROME (chemin de Chrome), BASE_URL (défaut http://localhost:5173/), SWIFTSHADER=1 (rendu logiciel au lieu
// de la carte graphique).
// Code de sortie : 0 ; 1 si la mesure a échoué (scène jamais montée ou jamais finie, aucune image, erreur dans la
// console de la page : rien n'est alors ajouté à l'annexe) ; 2 pour une option fausse.
// Conditions de mesure, toujours les mêmes :
// - modèles des personnages (.glb) bloqués (Network.setBlockedURLs) : sur la route ?cine=, le jeu les charge au
//   démarrage, en même temps que la scène, alors qu'en partie un briefing se joue modèles chargés ; leur lecture
//   chargerait les premières secondes de la mesure. Le jeu s'en passe (échec annoncé dans la console, avertissement) ;
// - page de 1280 × 720 posée par Emulation.setDeviceMetricsOverride (--window-size seul donne 1264 × 625 sans
//   interface : la fenêtre compte son cadre) ;
// - sans écran, Chrome cadence les images sur la synchro de l'écran de la machine : sur celle de Rayan (180 Hz), les
//   durées d'image sont des multiples de 5,56 ms (p50 de 5,6 ms au repos), pas de 16,7 ms comme à 60 Hz ;
// - étalon : une boucle de calcul fixe, chronométrée par la sonde avant les scripts de la page, environ quatre fois plus
//   longue sous --ralenti=4 (le ralenti s'applique bien à la page). Indicatif : Chrome ralentit en suspendant le fil
//   principal par tranches, et une boucle de 11 ms peut tomber presque entière dans une tranche active.
// Profil jetable ; port DevTools choisi par Chrome (--remote-debugging-port=0, relu dans DevToolsActivePort), jamais un
// port fixe ; Chrome fermé et son profil supprimé dans tous les cas, interruption comprise.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir, cpus } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SCENES } from './port-maquette.mjs'

// Une image au-delà est lente : seuil du panneau de performances du jeu (src/gfx/stats.js), plafond de la p95 des
// cinématiques (spec §3.6).
export const BUDGET_MS = 22
const arrondi = v => Math.round(v * 10) / 10

// ─── Partie pure ──────────────────────────────────────────────────────────────────────────────────────────────────
// Durées d'image (ms) → { images, p50, p95, max, maxA, lentes }. p50 et p95 au rang le plus proche, comme frameStats
// (src/gfx/stats.js) : la valeur observée au rang ⌈p × n⌉ de la liste triée, jamais interpolée. maxA : fin de l'image
// la plus longue (la première à égalité), comptée depuis le montage de la scène. lentes : images au-delà de BUDGET_MS.
export function statsImages(durees) {
  const n = durees.length
  if (!n) return { images: 0, p50: 0, p95: 0, max: 0, maxA: null, lentes: 0 }
  const triees = [...durees].sort((a, b) => a - b)
  const rang = p => triees[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))]
  let max = -Infinity, maxA = 0, t = 0, lentes = 0
  for (const d of durees) {
    t += d
    if (d > max) { max = d; maxA = t }
    if (d > BUDGET_MS) lentes++
  }
  return { images: n, p50: rang(0.5), p95: rang(0.95), max, maxA, lentes }
}

// Relevés de la sonde [{ t, enCours, total }] → maximum des animations en cours et l'instant du premier maximum (ms
// depuis le montage), maximum de toutes les animations rendues par getAnimations (finies et en pause comprises).
export function statsAnimations(releves) {
  let animationsMax = 0, animationsMaxA = null, animationsTotalMax = 0
  for (const r of releves) {
    if (animationsMaxA === null || r.enCours > animationsMax) { animationsMax = r.enCours; animationsMaxA = r.t }
    animationsTotalMax = Math.max(animationsTotalMax, r.total)
  }
  return { animationsMax, animationsMaxA, animationsTotalMax, releves: releves.length }
}

// Relevé brut de la sonde (window.__cinePerf) → la mesure, arrondie au dixième de ms (au ms pour les instants).
// ips : images par seconde en moyenne sur la scène.
export function synthese({ debut, fin, images, releves }) {
  const s = statsImages(images), duree = fin - debut
  return {
    dureeMs: Math.round(duree), images: s.images, ips: arrondi(duree > 0 ? s.images / (duree / 1000) : 0),
    p50: arrondi(s.p50), p95: arrondi(s.p95), max: arrondi(s.max), maxA: s.maxA === null ? null : Math.round(s.maxA),
    lentes: s.lentes, ...statsAnimations(releves),
  }
}

// Annexe { mesures: [...] } (ou null, pas encore écrite) → nouvelle annexe, la mesure ajoutée à la fin. passe : rang
// de la mesure parmi celles du même cas au même ralenti (1 pour la première). L'annexe reçue n'est pas modifiée.
export function ajouterMesure(annexe, mesure) {
  const mesures = annexe && Array.isArray(annexe.mesures) ? annexe.mesures : []
  const passe = mesures.filter(m => m.cas === mesure.cas && m.ralenti === mesure.ralenti).length + 1
  return { ...annexe, mesures: [...mesures, { ...mesure, passe }] }
}

// Nom d'un cas : la scène, suivie de ses paramètres (comme cleDe de tests/briefing/montage.test.js).
export const cleDuCas = (id, params = {}) => id + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')
export const urlCine = (base, id, params = {}) => base + '?' + new URLSearchParams({ cine: id, ...params })

const USAGE = 'Usage : node scripts/cine-perf.mjs <id> [--ralenti=4] [--params=port=libres] [--annexe=<nom>.json]'

// Ligne de commande → { id, ralenti, params, annexe }. Tout ce qui fausserait la mesure en silence est refusé, nommé :
// option inconnue (une faute de frappe sur --ralenti mesurerait sans ralenti), scène inconnue, ralenti sous 1,
// paramètre cine ou freeze, annexe hors du dossier des annexes.
export function lireOptions(argv) {
  const options = argv.filter(a => a.startsWith('--')), positions = argv.filter(a => !a.startsWith('--'))
  const inconnues = options.filter(a => !/^--(ralenti|params|annexe)=/.test(a))
  if (inconnues.length) throw new Error(`option inconnue ou sans valeur : ${inconnues.join(' ')}`)
  if (!positions.length) throw new Error('scène manquante')
  if (positions.length > 1) throw new Error(`une seule scène par mesure : ${positions.slice(1).join(' ')} en trop`)
  const [id] = positions
  if (!Object.hasOwn(SCENES, id)) throw new Error(`scène inconnue : ${id} (scènes : ${Object.keys(SCENES).join(', ')})`)
  const opt = nom => { const a = options.findLast(x => x.startsWith(`--${nom}=`)); return a === undefined ? null : a.slice(nom.length + 3) }
  const r = opt('ralenti'), ralenti = r === null ? 1 : Number(r)
  if (r !== null && (!r.trim() || !Number.isFinite(ralenti) || ralenti < 1)) {
    throw new Error(`--ralenti=${r} : le ralenti est un nombre, 1 ou plus (4 pour un PC de milieu de gamme)`)
  }
  const params = Object.fromEntries(new URLSearchParams(opt('params') || ''))
  for (const k of ['cine', 'freeze']) {
    if (Object.hasOwn(params, k)) throw new Error(`--params : « ${k} » fausserait la mesure (${k === 'freeze' ? 'scène figée' : 'la scène vient de <id>'})`)
  }
  const annexe = opt('annexe')
  if (annexe !== null && !/^[\w.-]+\.json$/.test(annexe)) throw new Error(`--annexe=${annexe} : un nom de fichier .json, posé dans docs/superpowers/specs/annexes`)
  return { id, ralenti, params, annexe }
}

// ─── Sonde ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Injectée dans la page avant ses scripts (Page.addScriptToEvaluateOnNewDocument), écrite `(${sonde})(window)` : elle
// n'utilise rien de ce module. Les images comptent du premier rappel où la scène est montée (#st dans la page) jusqu'au
// rappel qui la trouve démontée ; ce rappel-là pose fin, tient la promesse window.__cinePerfFin et n'en demande plus.
// Les animations sont relevées au premier rappel de la scène, puis au premier rappel d'au moins 250 ms après le
// précédent relevé (pas de minuteur de plus dans la page).
export function sonde(win) {
  const doc = win.document
  const P = win.__cinePerf = {
    debut: null, fin: null, images: [], releves: [], etalonMs: null,
    ecran: `${win.innerWidth}×${win.innerHeight}×${win.devicePixelRatio}`, visibilite: doc.visibilityState,
  }
  // Étalon du ralenti : boucle de calcul fixe ; son résultat est gardé sur la fenêtre pour qu'aucun compilateur ne
  // la retire.
  const e0 = win.performance.now()
  let x = 0
  for (let i = 0; i < 3e6; i++) x = (x + i) % 1000003
  P.etalonMs = Math.round((win.performance.now() - e0) * 10) / 10
  win.__cinePerfEtalon = x
  let fini = null
  win.__cinePerfFin = new Promise(r => { fini = r })
  let derniere = 0, releve = -Infinity
  const image = ts => {
    const montee = !!doc.getElementById('st')
    if (P.debut === null) {
      if (!montee) { win.requestAnimationFrame(image); return }
      P.debut = derniere = ts
    } else if (!montee) {
      P.fin = ts
      fini()
      return
    } else {
      P.images.push(ts - derniere)
      derniere = ts
    }
    if (ts - releve >= 250) {
      releve = ts
      const animations = doc.getAnimations()
      let enCours = 0
      for (const a of animations) if (a.playState === 'running') enCours++
      P.releves.push({ t: Math.round(ts - P.debut), enCours, total: animations.length })
    }
    win.requestAnimationFrame(image)
  }
  win.requestAnimationFrame(image)
}

// ─── Chrome ───────────────────────────────────────────────────────────────────────────────────────────────────────
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const GPU = ['--use-angle=d3d11', '--enable-gpu']
const SWIFTSHADER = ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']
const MONTAGE_MS = 90000          // chargement de la page et de la scène (lent sous --ralenti=4, serveur froid)
const SCENE_MS = 5 * 60000        // plus longue scène : 65,8 s (prologue B)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const chromes = new Set()         // processus lancés, pas encore fermés : arrêtés aussi sur une interruption

// Promesse, ou une erreur portant message au bout de ms ; le minuteur est retiré dans les deux cas (laissé, il
// retiendrait le processus jusqu'à son terme).
export function avecDelai(promesse, ms, message) {
  let h
  return Promise.race([promesse, new Promise((_, ko) => { h = setTimeout(() => ko(new Error(message)), ms) })]).finally(() => clearTimeout(h))
}

// Connexion DevTools minimale (comme scripts/memtest.mjs) ; surEvenement reçoit les événements (sans id). Connexion
// fermée (Chrome tombé) : les demandes en cours échouent aussitôt au lieu d'attendre leur délai.
function connect(url, surEvenement = () => {}) {
  const ws = new WebSocket(url)
  let n = 0
  const attente = new Map()
  ws.onclose = () => {
    for (const { ko } of attente.values()) ko(new Error('connexion DevTools fermée (Chrome arrêté ?)'))
    attente.clear()
  }
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    if (!m.id) { surEvenement(m); return }
    if (!attente.has(m.id)) return
    const { ok, ko } = attente.get(m.id)
    attente.delete(m.id)
    m.error ? ko(new Error(`${m.error.message} (${m.error.code})`)) : ok(m.result)
  }
  return {
    ws,
    ready: new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko }),
    send: (method, params = {}) => new Promise((ok, ko) => {
      const i = ++n
      attente.set(i, { ok, ko })
      ws.send(JSON.stringify({ id: i, method, params }))
    }),
  }
}

async function evaluer(c, expression) {
  const r = await c.send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

// Message lisible d'un événement de console ou d'une exception de la page.
const texteConsole = m => m.method === 'Runtime.exceptionThrown'
  ? `exception : ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`
  : `console.error : ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`

// Une mesure : Chrome lancé, page ?cine= ouverte sous la sonde, attente du démontage de la scène, relevés lus, Chrome
// fermé. → { brut (window.__cinePerf), erreurs (console.error et exceptions de la page), rendu, modelesBloques }.
async function mesurer({ url, ralenti, logiciel }) {
  const profil = mkdtempSync(join(tmpdir(), 'cine-perf-'))
  const proc = spawn(CHROME, ['--headless=new', ...(logiciel ? SWIFTSHADER : GPU), '--hide-scrollbars', '--mute-audio',
    `--user-data-dir=${profil}`, '--window-size=1280,720', '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' })
  proc.profil = profil
  chromes.add(proc)
  let lancement = null   // Chrome qui ne se lance pas (chemin faux : ENOENT) : « error » sans « exit »
  proc.once('error', e => { lancement = e })
  let navigateur = null, page = null
  const erreurs = []
  let modelesBloques = 0
  try {
    const fichierPort = join(profil, 'DevToolsActivePort')
    let port = ''
    for (let i = 0; i < 150 && !port && !lancement; i++) {
      await sleep(100)
      if (existsSync(fichierPort)) port = readFileSync(fichierPort, 'utf8').split('\n')[0].trim()
    }
    if (lancement) throw new Error(`Chrome ne se lance pas (${CHROME}, variable CHROME) : ${lancement.message}`)
    if (!port) throw new Error('Chrome sans interface : DevToolsActivePort introuvable')
    navigateur = connect((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl)
    await navigateur.ready
    const { gpu } = await navigateur.send('SystemInfo.getInfo')   // seulement sur la cible du navigateur
    const cible = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page')
    page = connect(cible.webSocketDebuggerUrl, m => {
      if ((m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') || m.method === 'Runtime.exceptionThrown') erreurs.push(texteConsole(m).slice(0, 300))
      if (m.method === 'Network.loadingFailed' && m.params.blockedReason === 'inspector') modelesBloques++
    })
    await page.ready
    for (const domaine of ['Runtime', 'Page', 'Network']) await page.send(`${domaine}.enable`)
    await page.send('Network.setBlockedURLs', { urls: ['*.glb', '*.glb?*'] })
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${sonde})(window)` })
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
    if (ralenti > 1) await page.send('Emulation.setCPUThrottlingRate', { rate: ralenti })
    await page.send('Page.navigate', { url })
    const t0 = Date.now()
    while (!(await evaluer(page, 'window.__cinePerf ? window.__cinePerf.debut !== null : false').catch(() => false))) {
      if (Date.now() - t0 > MONTAGE_MS) throw new Error(`scène jamais montée en ${MONTAGE_MS / 1000} s (${url}) : le serveur du jeu tourne-t-il ?`)
      await sleep(250)
    }
    // Scène montée : plus aucune évaluation avant sa fin (chacune serait une tâche de plus sur le fil mesuré).
    await avecDelai(page.send('Runtime.evaluate', { expression: 'window.__cinePerfFin', awaitPromise: true }), SCENE_MS,
      `scène toujours montée au bout de ${SCENE_MS / 60000} minutes`)
    const brut = JSON.parse(await evaluer(page, 'JSON.stringify(window.__cinePerf)'))
    const angle = await evaluer(page, `(() => { const g = document.createElement('canvas').getContext('webgl')
      const x = g && g.getExtension('WEBGL_debug_renderer_info'); return g ? g.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : g.RENDERER) : 'sans WebGL' })()`)
    const rendu = `${angle}, composition ${gpu.featureStatus?.gpu_compositing ?? 'inconnue'}`
    return { brut, erreurs, rendu, modelesBloques }
  } finally {
    const fermer = navigateur || page
    if (fermer) { try { await Promise.race([fermer.send('Browser.close'), sleep(2000)]) } catch { /* déjà fermé */ } }
    for (const c of [page, navigateur]) if (c) c.ws.close()
    if (!lancement) await new Promise(r => { if (proc.exitCode !== null) r(); else { proc.once('exit', r); setTimeout(r, 3000) } })
    await arreter(proc)
  }
}

// Chrome et ses processus fils arrêtés s'ils tournent encore, profil supprimé (Windows le garde verrouillé un temps).
async function arreter(proc) {
  chromes.delete(proc)
  if (proc.pid && proc.exitCode === null) { try { execFileSync('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' }) } catch { /* déjà parti */ } }
  for (let i = 0; i < 20; i++) {
    try { rmSync(proc.profil, { recursive: true, force: true }); return } catch { await sleep(300) }
  }
}

function gitState(repo) {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
    const modifie = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repo, encoding: 'utf8' }).trim()
    return modifie ? head + ' (modifié)' : head
  } catch { return null }
}

const nombre = (v, d = 0) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })

async function main(argv) {
  let o
  try { o = lireOptions(argv) } catch (e) { console.error(`cine-perf : ${e.message}\n${USAGE}`); return 2 }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, async () => { for (const p of [...chromes]) await arreter(p); process.exit(130) })
  }
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
  const base = process.env.BASE_URL || 'http://localhost:5173/'
  const url = urlCine(base, o.id, o.params), cas = cleDuCas(o.id, o.params)
  console.log(`cine-perf : ${cas}, processeur ${o.ralenti > 1 ? `ralenti ×${o.ralenti}` : 'à sa vitesse'} (${url})`)
  // Garde-fou de toute la mesure : une page qui ne répond plus (évaluation sans réponse) ne bloque jamais le script.
  const { brut, erreurs, rendu, modelesBloques } = await avecDelai(mesurer({ url, ralenti: o.ralenti, logiciel: !!process.env.SWIFTSHADER }),
    MONTAGE_MS + SCENE_MS + 60000, `mesure arrêtée au bout de ${(MONTAGE_MS + SCENE_MS + 60000) / 60000} minutes : Chrome ne répond plus`)
  const s = synthese(brut)
  const processeurs = cpus()
  let mesure = {
    cas, scene: o.id, params: o.params, ralenti: o.ralenti, passe: null,
    date: new Date().toISOString(), commit: gitState(repo), url, rendu,
    machine: `${processeurs[0]?.model.trim() ?? 'processeur inconnu'}, ${processeurs.length} fils`,
    ecran: brut.ecran, visibilite: brut.visibilite, etalonMs: brut.etalonMs, modelesBloques, ...s,
  }
  const echec = erreurs.length ? `${erreurs.length} erreur(s) dans la page : ${erreurs.join(' | ')}` : s.images ? null : 'aucune image relevée'
  if (o.annexe && !echec) {
    const fichier = join(repo, 'docs', 'superpowers', 'specs', 'annexes', o.annexe)
    const annexe = ajouterMesure(existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')) : null, mesure)
    mesure = annexe.mesures.at(-1)
    writeFileSync(fichier, JSON.stringify(annexe, null, 2) + '\n')
    console.log(`annexe : ${fichier} (passe ${mesure.passe})`)
  }
  mkdirSync(join(repo, 'shots'), { recursive: true })
  const brutFichier = join(repo, 'shots', `cine-perf-${cas.replace(/[^\w-]+/g, '_')}-x${o.ralenti}-${mesure.date.replace(/[:.]/g, '-').slice(0, 19)}.json`)
  writeFileSync(brutFichier, JSON.stringify({ ...mesure, erreurs, relevesBruts: brut.releves, durees: brut.images }, null, 1) + '\n')
  const sec = ms => nombre(ms / 1000, 1)
  console.log(`${cas}, ×${o.ralenti} : ${nombre(s.dureeMs)} ms, ${nombre(s.images)} images (${nombre(s.ips, 1)} i/s) ; ` +
    `p50 ${nombre(s.p50, 1)} · p95 ${nombre(s.p95, 1)} · max ${nombre(s.max, 1)} ms (à ${s.maxA === null ? '?' : sec(s.maxA)} s) ; ` +
    `${s.lentes} image(s) au-delà de ${BUDGET_MS} ms ; animations en cours au plus ${s.animationsMax}` +
    `${s.animationsMaxA === null ? '' : ` (à ${sec(s.animationsMaxA)} s)`}, ${s.animationsTotalMax} avec les finies`)
  console.log(`rendu : ${rendu} ; page ${brut.ecran}, ${brut.visibilite} ; étalon ${nombre(brut.etalonMs, 1)} ms ; ${modelesBloques} modèle(s) bloqué(s)`)
  console.log(`relevés : ${brutFichier}`)
  if (echec) { console.error(`mesure en échec : ${echec}`); return 1 }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), async err => {
    console.error(`cine-perf : ${err.message}`)
    for (const p of [...chromes]) await arreter(p)
    process.exit(1)
  })
}
