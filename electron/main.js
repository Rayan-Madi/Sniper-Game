const { app, BrowserWindow } = require('electron')
const path = require('path')

// « npm run electron:dev » lance « electron . --dev » : un argument plutôt
// qu'une variable d'environnement, que cmd.exe (Windows) ne sait pas poser
// en tête de commande.
const isDev = process.argv.includes('--dev')
// « electron . --fumee » (scripts/fumee.mjs) : vérification du livrable hors
// ligne, dans une fenêtre cachée (section « Fumée du livrable », en fin de fichier).
const fumee = process.argv.includes('--fumee')
// Fumée : sa ligne de départ et ses gestionnaires d'exception posés dès ici
// (debuterFumee), avant tout autre require. Un module qui lève à son require
// (absent du paquet) rend alors la fumée rouge au lieu d'ouvrir la boîte de
// dialogue d'Electron : tout require ajouté à ce fichier vient après (testé).
let fumeeResultat = null, fumeeFinie = false, fumeeGarde = null, fumeeDebut = 0
if (fumee) debuterFumee()

function createWindow() {
  if (fumee && fumeeFinie) return   // fumée finie avant la fenêtre (profil jetable manquant ou refusé) : aucune fenêtre
  // Pas de propriété icon : Electron garde son icône par défaut tant que le
  // jeu n'en a pas. Pas de fullscreen: false non plus : c'est déjà la valeur
  // par défaut, et passé explicitement il interdit le plein écran sous macOS
  // (bouton Plein écran des Paramètres compris).
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    title: 'Sniper',
    backgroundColor: '#000000',
    show: !fumee,   // fumée : jamais de fenêtre visible, le bureau reste intact
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setMenuBarVisibility(false)
  if (fumee) lancerFumee(win)   // garde réseau, journal et scénario, posés avant le premier chargement

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ─── Fumée du livrable (spec du lot 5 §3.2, tâche E1) ──────────────────────────────────────────────────────────────
// « electron . --fumee » (scripts/fumee.mjs), plus tard « Sniper.exe --fumee » (le jeu empaqueté) : le jeu construit
// se lance hors ligne dans une fenêtre CACHÉE, sans son, sur le profil jetable que lui passe scripts/fumee.mjs
// (--profil=<dossier vide>, obligatoire : jamais la sauvegarde du joueur), toute requête http, https, ws ou wss bloquée
// et comptée. Il écrit « [fumee] debut » dès son départ (le script y reconnaît un exécutable qui connaît ce mode), joue
// le scénario dans la page par executeJavaScript (aucun port de débogage), écrit une ligne « [fumee] {json} » sur sa
// sortie, puis quitte : code 0 si rien n'a échoué ni été bloqué, 1 sinon. Au délai de garde, la fumée se ferme seule,
// rouge.
const fs = require('fs')
const CLE_SAUVEGARDE = 'sniper-save'           // src/upgrades.js, saveProgress
const REPRENDRE_M3 = 'REPRENDRE : MISSION 3'   // src/main.js, refreshMenuButtons
// M3 en cours, son briefing pas encore vu : REPRENDRE joue la cinématique m3, puis la mission
const SAUVEGARDE_M3 = {
  levels: {}, points: 0, totalScore: 0, currentLevel: 3, freedVictims: false,
  briefingSeen: [true, true, false, false, false, false], prologueSeen: true, campaignDone: false,
}
const RESEAU = /^(https?|wss?):/i
const DELAI_FUMEE_MS = 180000   // toute la fumée
const DELAI_ETAPE_MS = 60000    // chaque attente du scénario (chargement des modèles compris)
// État de la fumée (fumeeResultat, fumeeFinie, fumeeGarde, fumeeDebut) : déclaré en tête de fichier, avant debuterFumee

// Dès le départ, en tête de fichier, avant tout autre require : « [fumee] debut », puis les exceptions du processus
// principal rattrapées, celles du chargement de ce fichier comprises (un module absent du paquet), sans quoi Electron
// ouvrirait sa boîte de dialogue sur le bureau. Ni elle ni finirFumee, qu'appellent ses gestionnaires, ne lisent une
// constante ou une variable déclarée après la tête du fichier : inaccessible si son chargement s'est arrêté avant.
function debuterFumee() {
  process.stdout.write('[fumee] debut\n')
  fumeeDebut = Date.now()
  fumeeResultat = {
    electron: process.versions.electron, origine: null, echecs: [], requetesBloquees: [],
    modeles: null, images: [], mission: null, sauvegarde: null, dureeMs: 0,
  }
  process.on('uncaughtException', e => finirFumee(`exception du processus principal : ${e && e.message}`))
  process.on('unhandledRejection', e => finirFumee(`promesse rejetée dans le processus principal : ${e && e.message}`))
}

// Avant que l'application soit prête : délai de garde, puis le profil jetable. Celui-ci est créé (vide) et supprimé par
// scripts/fumee.mjs, jamais ici : sans --profil, avec un dossier absent ou non vide (un profil déjà servi, celui du
// joueur par exemple), ou avec un chemin que refuse Electron (relatif), la fumée finit rouge tout de suite, sans dossier
// créé ni fenêtre (createWindow), donc sans jamais lancer le jeu sur le profil du joueur.
function preparerFumee() {
  fumeeGarde = setTimeout(() => finirFumee(`délai de garde dépassé (${DELAI_FUMEE_MS / 1000} s)`), DELAI_FUMEE_MS)
  const arg = process.argv.find(a => a.startsWith('--profil='))
  const profil = arg ? arg.slice('--profil='.length) : ''
  if (!profil) return finirFumee('profil jetable manquant : --fumee demande --profil=<dossier> (scripts/fumee.mjs)')
  let contenu
  try { contenu = fs.readdirSync(profil) } catch (e) { return finirFumee(`profil jetable introuvable : ${profil} (${e && e.code})`) }
  if (contenu.length) return finirFumee(`profil jetable non vide : ${profil}`)
  try {
    app.setPath('userData', profil)
    app.setPath('sessionData', profil)
  } catch (e) {
    finirFumee(`profil jetable refusé par Electron : ${profil} (${e && e.message})`)
  }
}

// La fenêtre créée, avant son premier chargement : jamais montrée (recachée aussitôt si un code la montre, par exemple
// un ready-to-show), page jamais ralentie (cachée, elle passerait en arrière-plan), son coupé, réseau bloqué, journal
// des échecs (chargements, erreurs de console, « [characters] échec »), puis le scénario une fois la page chargée.
function lancerFumee(win) {
  const wc = win.webContents
  const r = fumeeResultat
  win.on('show', () => { win.hide(); r.echecs.push('fenêtre montrée pendant la fumée (recachée aussitôt)') })
  // Même effet que backgroundThrottling: false dans webPreferences (spec §3.2), posé ici pour laisser intact le bloc
  // webPreferences de createWindow, que la tâche R5 du lot 6 modifie (préchargement, bac à sable)
  wc.setBackgroundThrottling(false)
  wc.setAudioMuted(true)
  wc.session.webRequest.onBeforeRequest((details, callback) => {
    if (!RESEAU.test(details.url)) return callback({})
    r.requetesBloquees.push(details.url)
    callback({ cancel: true })
  })
  wc.on('did-fail-load', (e, code, description, url) => r.echecs.push(`chargement en échec : ${url} (${description}, ${code})`))
  wc.on('console-message', details => {
    if (details.level === 'error' || /\[characters\] échec/.test(details.message)) r.echecs.push(`console : ${details.message}`)
  })
  wc.on('render-process-gone', (e, details) => finirFumee(`page arrêtée : ${details && details.reason}`))
  chargement(wc).then(() => scenarioFumee(wc, r)).then(() => finirFumee(), e => finirFumee(e && e.message))
}

// Prochain chargement de la page : tenu à did-finish-load, rejeté si le cadre principal échoue.
function chargement(wc) {
  return new Promise((ok, ko) => {
    const fini = () => { wc.removeListener('did-fail-load', rate); ok() }
    const rate = (e, code, description, url, principal) => {
      if (principal === false) return
      wc.removeListener('did-finish-load', fini)
      wc.removeListener('did-fail-load', rate)
      ko(new Error(`page non chargée : ${url} (${description}, ${code})`))
    }
    wc.once('did-finish-load', fini)
    wc.on('did-fail-load', rate)
  })
}

// Le scénario. Chaque fonction passée à page() est évaluée telle quelle dans la page (executeJavaScript), sans accès
// aux variables d'ici, ses arguments passés en JSON ; attendre() la relance jusqu'à ce qu'elle rende une valeur,
// DELAI_ETAPE_MS au plus. Un écart est noté dans r.echecs et le scénario continue tant qu'il le peut, sauf un profil
// déjà utilisé : arrêt avant la moindre écriture.
async function scenarioFumee(wc, r) {
  const page = (fn, ...args) => wc.executeJavaScript(`(${fn})(...${JSON.stringify(args)})`, true)
  const attendre = async (etape, fn, ...args) => {
    const limite = Date.now() + DELAI_ETAPE_MS
    for (;;) {
      const v = await page(fn, ...args)
      if (v !== null && v !== undefined && v !== false) return v
      if (Date.now() > limite) throw new Error(`${etape} : rien au bout de ${DELAI_ETAPE_MS / 1000} s`)
      await new Promise(f => setTimeout(f, 250))
    }
  }
  const recharger = () => { const fini = chargement(wc); wc.reload(); return fini }
  const menu = () => {
    const m = document.getElementById('menu'), b = document.getElementById('btn-start')
    return m && b && m.style.display !== 'none' ? b.textContent : null
  }
  const modeles = () => {
    const d = document.documentElement.dataset
    return d.modeles === undefined ? null : { charges: Number(d.modeles), echecs: d.modelesEchecs ? d.modelesEchecs.split(' ') : [] }
  }
  const reprendre = () => { document.getElementById('btn-start').click(); return true }
  const enJeu = () => {
    const h = document.getElementById('game-hud')
    return h && h.style.display === 'block' ? document.getElementById('hud-level').textContent : null
  }

  // 1. Premier lancement : profil vierge (le menu propose COMMENCER), modèles chargés avant de recharger. Sinon, le
  //    profil a déjà servi : scénario arrêté ici, sa sauvegarde laissée intacte
  r.origine = await page(() => location.origin)
  const vierge = await attendre('menu au premier lancement', menu)
  if (vierge !== 'COMMENCER') throw new Error(`profil déjà utilisé : le menu propose « ${vierge} » au premier lancement (scénario arrêté, rien écrit)`)
  await attendre('modèles au premier lancement', modeles)

  // 2. Sauvegarde posée (M3 en cours, briefing pas vu), page rechargée : le menu la lit
  await page((cle, s) => { localStorage.setItem(cle, JSON.stringify(s)); return true }, CLE_SAUVEGARDE, SAUVEGARDE_M3)
  await recharger()
  const libelle = await attendre('menu', menu)
  if (libelle !== REPRENDRE_M3) r.echecs.push(`sauvegarde posée non lue : le menu propose « ${libelle} »`)

  // 3. Modèles chargés sans repli procédural (avant le chargement à la demande du lot 5 : les sept)
  r.modeles = await attendre('modèles', modeles)
  if (r.modeles.echecs.length) r.echecs.push(`modèles en échec, PNJ procéduraux : ${r.modeles.echecs.join(' ')}`)
  if (!(r.modeles.charges > 0)) r.echecs.push('aucun modèle chargé')

  // 4. REPRENDRE : la cinématique m3 et ses images
  await page(reprendre)
  r.images = await attendre('images de la cinématique m3', () => {
    const imgs = [...document.querySelectorAll('#briefing-root img')]
    return imgs.length && imgs.every(i => i.complete) ? imgs.map(i => ({ src: i.getAttribute('src'), largeur: i.naturalWidth })) : null
  })
  for (const i of r.images) if (!(i.largeur > 0)) r.echecs.push(`image non chargée : ${i.src}`)

  // 5. Cinématique passée (Échap, relancé tant que son délai de grâce l'ignore) : la mission démarre et le jeu note le
  //    briefing vu dans sa sauvegarde
  await attendre('cinématique passée', () => {
    const root = document.getElementById('briefing-root')
    if (!root.hidden && !root.classList.contains('k-leaving')) document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))
    return root.hidden || root.classList.contains('k-leaving')
  })
  r.mission = await attendre('mission', enJeu)
  const ecrite = JSON.parse(await page(cle => localStorage.getItem(cle), CLE_SAUVEGARDE) || 'null')
  const briefingVu = !!(ecrite && ecrite.briefingSeen && ecrite.briefingSeen[2])
  if (!briefingVu) r.echecs.push('sauvegarde : le jeu n\'a pas noté le briefing de M3 vu')

  // 6. Page rechargée : la sauvegarde est relue (REPRENDRE : MISSION 3, puis la mission sans rejouer le briefing)
  await recharger()
  const relu = await attendre('menu après rechargement', menu)
  await attendre('modèles après rechargement', modeles)
  await page(reprendre)
  const reprise = await attendre('reprise', () => {
    if (!document.getElementById('briefing-root').hidden) return 'briefing'
    const h = document.getElementById('game-hud')
    return h && h.style.display === 'block' ? 'mission' : null
  })
  r.sauvegarde = { libelle: relu, briefingVu, relue: relu === REPRENDRE_M3 && reprise === 'mission' }
  if (relu !== REPRENDRE_M3) r.echecs.push(`sauvegarde non relue : le menu propose « ${relu} » après le rechargement`)
  if (reprise !== 'mission') r.echecs.push('sauvegarde non relue : REPRENDRE rejoue le briefing de M3 déjà vu')
}

// Fin de la fumée, une seule fois : la ligne de résultat, puis la sortie une fois la ligne écrite (2 s au plus tard).
function finirFumee(echec) {
  if (fumeeFinie) return
  fumeeFinie = true
  clearTimeout(fumeeGarde)
  const r = fumeeResultat
  if (echec) r.echecs.push(echec)
  r.dureeMs = Date.now() - fumeeDebut
  const code = r.echecs.length === 0 && r.requetesBloquees.length === 0 ? 0 : 1
  let parti = false
  const quitter = () => { if (!parti) { parti = true; app.exit(code) } }
  process.stdout.write(`[fumee] ${JSON.stringify(r)}\n`, quitter)
  setTimeout(quitter, 2000)
}

if (fumee) preparerFumee()
