import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync, utimesSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, relative } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Fumée du livrable Electron (spec du lot 5 §3.2, §7 et §8 critère 12 ; plan, tâche E1) :
// - electron/main.js exécuté avec un faux module 'electron' (comme tests/electron.test.js). Avec --fumee : une ligne
//   « [fumee] debut », fenêtre cachée, sans son, profil jetable (dossier existant et vide), requêtes http, https, ws et
//   wss bloquées et comptées, scénario joué dans la page (ici un faux jeu monté dans le DOM de jsdom, que
//   executeJavaScript évalue), une ligne « [fumee] {json} » puis un code de sortie. Sans --fumee, rien de tout cela ;
// - src/characters.js publie la fin du chargement des modèles sur <html> (data-modeles), seule trace lisible dans un
//   build, qui n'a pas les accroches de développement (__mission) ;
// - scripts/fumee.mjs : lecture du résultat dans la sortie d'Electron, verdict, commande lancée, arrêt de l'arbre
//   d'Electron (taskkill /F /T) ; refus avant tout lancement (arguments, build périmé par un fichier ou par un dossier),
//   le script lancé pour de vrai dans un bac à sable sans Electron ni exécutable ; avec --exe (exécutable introuvable,
//   paquet sans mode --fumee ou périmé, paquet à jour lancé) et pendant la fumée (« [fumee] debut » attendu, résultat lu
//   à la fermeture des flux, délai de garde, interruption, profil), main() du script avec un lancement factice (aucun
//   processus : le faux exécutable n'est qu'un fichier texte).

const ROOT = resolve(__dirname, '..')
const ELECTRON_DIR = join(ROOT, 'electron')
const nodeRequire = createRequire(import.meta.url)

// ─── Faux module 'electron' ───────────────────────────────────────────
// Ce que la fumée utilise en plus du harnais de tests/electron.test.js : session.webRequest, executeJavaScript,
// reload, événements de webContents, app.setPath et app.exit, process.on et process.stdout. app.whenReady rend une
// vraie promesse, comme Electron : la fenêtre se crée après l'exécution de tout le fichier. app.setPath suit le contrat
// d'Electron 42 (electron.d.ts, setPath) : une erreur pour un chemin sans lettre de lecteur ni UNC (« Path must be
// absolute » : FilePath::IsAbsolute de Chromium sous Windows) ou pour un dossier qui n'existe pas.
// webRequest.onBeforeRequest garde son filtre éventuel, que requete() applique. modules : modules de Node remplacés pour
// electron/main.js (os.tmpdir, par exemple). vu.requis : les modules requis, dans l'ordre. absent : un module dont le
// require lève au chargement (« Cannot find module », comme un module absent du paquet) ; l'exception va alors, comme
// dans Electron 42.5.0 (lib/browser/init.ts, lu dans node_modules/electron/dist/electron.exe), au gestionnaire
// « uncaughtException » de l'application, et sans lui à celui d'Electron, qui ouvre sa boîte de dialogue (vu.boite).
function lancerMain({ argv = ['electron', '.'], page = null, sortieDifferee = false, modules = {}, absent = null } = {}) {
  const vu = { fenetres: [], gardes: [], chemins: {}, codes: [], lignes: [], vidages: [], muet: null, ralenti: null, gestionnaires: {}, requis: [], boite: null }
  class WebContents extends EventEmitter {
    constructor() {
      super()
      const onBeforeRequest = (...args) => { vu.gardes.push({ filtre: args.length > 1 ? args[0] : null, ecouteur: args[args.length - 1] }) }
      this.session = { webRequest: { onBeforeRequest } }
    }
    setBackgroundThrottling(v) { vu.ralenti = v }
    setAudioMuted(v) { vu.muet = v }
    openDevTools() {}
    executeJavaScript(code) { return page ? page.executer(code) : new Promise(() => {}) }
    reload() { if (page) page.recharger(this) }
  }
  class BrowserWindow extends EventEmitter {
    constructor(opts) { super(); this.opts = opts; this.visible = opts.show !== false; this.webContents = new WebContents(); vu.fenetres.push(this) }
    show() { this.visible = true; this.emit('show') }
    hide() { this.visible = false; this.emit('hide') }
    isVisible() { return this.visible }
    setMenuBarVisibility() {}
    loadURL(url) { this.url = url; if (page) page.charger(this.webContents); return new Promise(() => {}) }
    loadFile(file) { this.file = file; if (page) page.charger(this.webContents); return new Promise(() => {}) }
  }
  const electron = {
    BrowserWindow,
    app: {
      whenReady: () => Promise.resolve(),
      on() {},
      quit() {},
      exit: code => { vu.codes.push(code) },
      setPath: (nom, chemin) => {
        if (!/^([A-Za-z]:[\\/]|[\\/]{2})/.test(chemin)) throw new Error('Path must be absolute')
        if (!existsSync(chemin)) throw new Error(`dossier inexistant : ${chemin}`)
        vu.chemins[nom] = chemin
      },
    },
  }
  const processus = {
    argv, env: {}, platform: 'win32', versions: { electron: '42.5.0' },
    on: (evenement, f) => { vu.gestionnaires[evenement] = f },
    stdout: { write: (texte, vide) => { vu.lignes.push(texte); if (!vide) return; if (sortieDifferee) vu.vidages.push(vide); else vide() } },
  }
  const fakeRequire = name => {
    vu.requis.push(name)
    if (name === absent) throw Object.assign(new Error(`Cannot find module '${name}'`), { code: 'MODULE_NOT_FOUND' })
    return name === 'electron' ? electron : modules[name] || nodeRequire(name)
  }
  const src = readFileSync(join(ELECTRON_DIR, 'main.js'), 'utf8')
  try {
    new Function('require', 'process', '__dirname', src)(fakeRequire, processus, ELECTRON_DIR)
  } catch (e) {
    if (absent === null) throw e
    if (vu.gestionnaires.uncaughtException) vu.gestionnaires.uncaughtException(e)
    else vu.boite = `A JavaScript error occurred in the main process\nUncaught Exception:\n${e.stack}`
  }
  return vu
}

// Une requête vue par Electron : la garde la reçoit si elle n'a pas de filtre, ou si son filtre la retient ; sinon la
// requête passe sans elle ('non vue'). Rend la réponse donnée au rappel, ou null si la garde ne répond jamais (Electron
// exige une réponse : la requête resterait suspendue). Motifs réduits à ceux de Chromium, jamais plus larges : <all_urls>,
// ou schéma://hôte/chemin avec des * (le schéma * ne vaut que http et https). excludeUrls et types ne sont pas simulés :
// une erreur, à vérifier dans Electron.
function requete(vu, url) {
  const { filtre, ecouteur } = vu.gardes[0]
  if (filtre && !retenue(filtre, url)) return 'non vue'
  let reponse = null
  ecouteur({ url }, r => { reponse = r })
  return reponse
}
function retenue(filtre, url) {
  if (filtre.excludeUrls?.length || filtre.types?.length) throw new Error(`filtre de la garde non simulé : ${JSON.stringify(filtre)}`)
  const u = new URL(url)
  const schema = u.protocol.slice(0, -1)
  const glob = g => new RegExp('^' + g.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
  return filtre.urls.some(motif => {
    if (motif === '<all_urls>') return true
    const m = /^(\*|[a-z][a-z0-9+.-]*):\/\/([^/]*)(\/.*)$/.exec(motif)
    if (!m) throw new Error(`motif d'URL non simulé : ${motif}`)
    const schemaRetenu = m[1] === '*' ? schema === 'http' || schema === 'https' : schema === m[1]
    return schemaRetenu && glob(m[2]).test(u.host) && glob(m[3]).test(u.pathname + u.search)
  })
}

// Résultat écrit par le processus principal : la ligne « [fumee] {json} » (lecture locale, indépendante du script).
function sortie(vu) {
  const ligne = vu.lignes.join('').split('\n').find(l => l.startsWith('[fumee] {'))
  return ligne ? JSON.parse(ligne.slice('[fumee] '.length)) : null
}
// Attentes larges (machine partagée, chargée) : le scénario du faux jeu tient en quelques millisecondes
const fenetre = vu => vi.waitFor(() => { expect(vu.fenetres.length).toBe(1) }, { timeout: 5000 })
const finie = vu => vi.waitFor(() => { expect(vu.codes.length).toBe(1) }, { timeout: 5000 })

// ─── Faux jeu ─────────────────────────────────────────────────────────
// Ce que la fumée lit et fait du vrai jeu, réduit au DOM : menu et son bouton principal selon la sauvegarde
// (src/main.js, refreshMenuButtons ; src/upgrades.js, clé sniper-save), fin du chargement des modèles (data-modeles),
// REPRENDRE qui joue la cinématique m3 et ses quatre <img> si son briefing n'est pas vu, Échap qui la passe, puis la
// mission (HUD) et le briefing noté vu dans la sauvegarde. Chaque option casse une chose que la fumée doit voir.
// echapsIgnores : comme le vrai jeu (src/briefing/index.js), les premiers Échap tombent dans le délai de grâce et sont
// ignorés ; le suivant pose la classe k-leaving (fondu de sortie) et la racine n'est masquée qu'au tour suivant.
// porte : promesse qui retient le premier chargement (événements émis par le test avant que le scénario ne parte).
// Un seul faux jeu à la fois : celui du test précédent est arrêté (ses écouteurs de document retirés).
const CLE = 'sniper-save'
const IMAGES_M3 = ['portrait-passeur-cam-lo.png', 'portrait-passeur-cam.jpg', 'portrait-seconde-cam-lo.png', 'portrait-seconde-cam.jpg']
  .map(f => 'briefing/img/' + f)
const MISSION_3 = 'LE PORT  ·  3/6'
let jeuActif = null
function fauxJeu({ modelesEchecs = [], imageCassee = null, stockagePerdu = false, briefingOublie = false, profilUtilise = false, echapsIgnores = 0, porte = null } = {}) {
  const jeu = { lus: [], clics: 0, echaps: 0 }
  let ctrl = null
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE)) } catch { return null } }
  function demarrer() {
    if (ctrl) ctrl.abort()
    ctrl = new AbortController()
    const s = lire()
    jeu.lus.push(s)
    document.body.innerHTML = '<div id="menu"><button id="btn-start"></button></div><div id="briefing-root" hidden></div>' +
      '<div id="game-hud" style="display:none;"><div id="hud-level"></div></div>'
    document.getElementById('btn-start').textContent = s && s.currentLevel > 1 ? `REPRENDRE : MISSION ${s.currentLevel}` : 'COMMENCER'
    const html = document.documentElement
    html.dataset.modeles = String(7 - modelesEchecs.length)
    html.dataset.modelesEchecs = modelesEchecs.join(' ')
    const root = document.getElementById('briefing-root')
    const mission = () => {
      document.getElementById('menu').style.display = 'none'
      document.getElementById('game-hud').style.display = 'block'
      document.getElementById('hud-level').textContent = MISSION_3
    }
    document.getElementById('btn-start').addEventListener('click', () => {
      jeu.clics++
      const save = lire() || { currentLevel: 1, briefingSeen: [false, false, false, false, false, false] }
      if (save.briefingSeen[2]) return mission()
      document.getElementById('menu').style.display = 'none'
      root.hidden = false
      root.innerHTML = IMAGES_M3.map(src => `<img src="${src}" alt="">`).join('')
      for (const img of root.querySelectorAll('img')) {
        Object.defineProperty(img, 'complete', { value: true })
        Object.defineProperty(img, 'naturalWidth', { value: img.getAttribute('src').endsWith(imageCassee) ? 0 : 360 })
      }
      document.addEventListener('keydown', e => {
        if (e.code !== 'Escape' || root.hidden || root.classList.contains('k-leaving')) return
        jeu.echaps++
        if (jeu.echaps <= echapsIgnores) return
        const passer = () => {
          root.innerHTML = ''
          root.hidden = true
          root.classList.remove('k-leaving')
          if (!briefingOublie) { save.briefingSeen[2] = true; localStorage.setItem(CLE, JSON.stringify(save)) }
          mission()
        }
        if (!echapsIgnores) return passer()
        root.classList.add('k-leaving')
        setTimeout(passer, 0)
      }, { capture: true, signal: ctrl.signal })
    }, { signal: ctrl.signal })
  }
  const charge = wc => Promise.resolve(porte).then(() => setTimeout(() => wc.emit('did-finish-load'), 0))
  if (profilUtilise) localStorage.setItem(CLE, JSON.stringify({ currentLevel: 2, briefingSeen: [true, false, false, false, false, false] }))
  jeuActif = Object.assign(jeu, {
    charger(wc) { demarrer(); charge(wc) },
    recharger(wc) { if (stockagePerdu) localStorage.clear(); demarrer(); charge(wc) },
    executer: code => Promise.resolve().then(() => (0, eval)(code)),
    arreter() { if (ctrl) ctrl.abort() },
  })
  return jeuActif
}
const porteFermee = () => { let ouvrir; const porte = new Promise(r => { ouvrir = r }); return { porte, ouvrir } }

beforeEach(() => {
  if (jeuActif) jeuActif.arreter()
  jeuActif = null
  localStorage.clear()
  document.body.innerHTML = ''
  delete document.documentElement.dataset.modeles
  delete document.documentElement.dataset.modelesEchecs
})

// Profil jetable des tests : un vrai dossier vide, comme celui que crée scripts/fumee.mjs (electron/main.js le lit avant
// de le confier à Electron, dont le faux exige qu'il existe)
const PROFIL = mkdtempSync(join(tmpdir(), 'fumee-test-profil-'))
const FUMEE = ['electron', '.', '--fumee', `--profil=${PROFIL}`]
afterAll(() => { rmSync(PROFIL, { recursive: true, force: true }) })

describe('electron/main.js --fumee : fenêtre cachée, profil jetable, réseau bloqué', () => {
  it('--fumee : la fenêtre est cachée (show: false), sans son, et la page tourne comme au premier plan', async () => {
    const vu = lancerMain({ argv: FUMEE })
    await fenetre(vu)
    expect(vu.fenetres[0].opts.show).toBe(false)
    expect(vu.muet).toBe(true)
    expect(vu.ralenti).toBe(false)
  })

  it('--fumee : une fenêtre montrée malgré tout (un ready-to-show ajouté plus tard) est recachée aussitôt, et la fumée sort rouge', async () => {
    const { porte, ouvrir } = porteFermee()
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ porte }) })
    await fenetre(vu)
    const [win] = vu.fenetres
    win.show()
    expect(win.isVisible()).toBe(false)
    ouvrir()
    await finie(vu)
    expect(sortie(vu).echecs.join('\n')).toMatch(/fenêtre montrée/)
    expect(vu.codes).toEqual([1])
  })

  it('--fumee : « [fumee] debut » est la première ligne écrite, avant tout contrôle (scripts/fumee.mjs y reconnaît un exécutable qui connaît le mode)', async () => {
    const vu = lancerMain({ argv: ['electron', '.', '--fumee'] })   // même sans profil : la ligne part d'abord
    await finie(vu)
    expect(vu.lignes[0]).toBe('[fumee] debut\n')
    expect(vu.lignes).toHaveLength(2)   // puis le résultat
    expect(sortie(vu).echecs.join('\n')).toMatch(/--profil/)
  })

  it('--fumee : profil jetable passé par --profil (données de session comprises), jamais la sauvegarde du joueur', async () => {
    const vu = lancerMain({ argv: FUMEE })
    await fenetre(vu)
    expect(vu.chemins).toEqual({ userData: PROFIL, sessionData: PROFIL })
  })

  // Le profil jetable est créé et supprimé par scripts/fumee.mjs : electron/main.js n'en crée jamais (un « electron .
  // --fumee » lancé à la main y laissait un dossier sniper-fumee-* jamais supprimé), et sans profil il ne lance pas le
  // jeu (il tournerait sur le profil du joueur, sa sauvegarde comprise).
  it('--fumee sans --profil : la fumée ne part pas (rouge), sans fenêtre, sans dossier créé, sans chemin changé', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'fumee-sans-profil-'))   // dossier temporaire vu par electron/main.js
    try {
      const vu = lancerMain({ argv: ['electron', '.', '--fumee'], modules: { os: { ...nodeRequire('os'), tmpdir: () => tmp } } })
      await new Promise(r => setTimeout(r, 20))   // whenReady passé : la fenêtre serait déjà créée
      expect(readdirSync(tmp)).toEqual([])
      expect(vu.chemins).toEqual({})
      expect(vu.fenetres).toEqual([])
      await finie(vu)
      expect(vu.codes).toEqual([1])
      expect(sortie(vu).echecs.join('\n')).toMatch(/--profil/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  // Un profil déjà servi (celui du joueur, %APPDATA%\Sniper, passé à la main) n'est jamais confié à Electron : la fumée
  // y écrirait sa sauvegarde de M3 par-dessus la sienne. scripts/fumee.mjs crée toujours un dossier vide.
  it('--fumee avec un profil non vide : refusé avant Electron (rouge), sans fenêtre, sans chemin changé, rien touché', async () => {
    const plein = mkdtempSync(join(tmpdir(), 'fumee-test-plein-'))
    writeFileSync(join(plein, 'Local State'), '{}')
    try {
      const vu = lancerMain({ argv: ['electron', '.', '--fumee', `--profil=${plein}`] })
      await new Promise(r => setTimeout(r, 20))
      expect(vu.chemins).toEqual({})
      expect(vu.fenetres).toEqual([])
      await finie(vu)
      expect(vu.codes).toEqual([1])
      expect(sortie(vu).echecs).toEqual([`profil jetable non vide : ${plein}`])
      expect(readdirSync(plein)).toEqual(['Local State'])
    } finally {
      rmSync(plein, { recursive: true, force: true })
    }
  })

  it('--fumee avec un profil introuvable : rouge, sans fenêtre, aucun dossier créé', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'fumee-test-absent-'))
    const absent = join(parent, 'profil')
    try {
      const vu = lancerMain({ argv: ['electron', '.', '--fumee', `--profil=${absent}`] })
      await new Promise(r => setTimeout(r, 20))
      expect(vu.fenetres).toEqual([])
      await finie(vu)
      expect(vu.codes).toEqual([1])
      expect(sortie(vu).echecs).toEqual([`profil jetable introuvable : ${absent} (ENOENT)`])
      expect(existsSync(absent)).toBe(false)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('--fumee avec un --profil refusé par Electron (chemin relatif, ou sans lettre de lecteur) : rouge, sans fenêtre, et l\'erreur ne remonte pas (jamais la boîte de dialogue d\'Electron)', async () => {
    const vide = mkdtempSync(join(tmpdir(), 'fumee-test-relatif-'))
    try {
      // dossiers existants et vides que seul Electron refuse : relatif au dossier courant, ou à la racine du lecteur
      for (const chemin of [relative(process.cwd(), vide), vide.slice(2)]) {
        let vu = null
        expect(() => { vu = lancerMain({ argv: ['electron', '.', '--fumee', `--profil=${chemin}`] }) }, chemin).not.toThrow()
        await new Promise(r => setTimeout(r, 20))
        expect(vu.fenetres, chemin).toEqual([])
        expect(vu.chemins, chemin).toEqual({})
        await finie(vu)
        expect(vu.codes, chemin).toEqual([1])
        expect(sortie(vu).echecs, chemin).toEqual([`profil jetable refusé par Electron : ${chemin} (Path must be absolute)`])
      }
    } finally {
      rmSync(vide, { recursive: true, force: true })
    }
  })

  it('--fumee : toute requête http, https, ws ou wss passe par la garde (aucun filtre ne la restreint) et y est bloquée', async () => {
    const vu = lancerMain({ argv: FUMEE })
    await fenetre(vu)
    expect(vu.gardes.length).toBe(1)
    for (const url of ['http://exemple.invalid/', 'https://exemple.invalid/a.glb', 'ws://127.0.0.1:8787', 'wss://exemple.invalid/'])
      expect(requete(vu, url), url).toEqual({ cancel: true })
  })

  it('--fumee : les fichiers du jeu (file, data, blob) passent la garde, qui leur répond {} (sans réponse, Electron laisserait la requête suspendue)', async () => {
    const vu = lancerMain({ argv: FUMEE })
    await fenetre(vu)
    for (const url of ['file:///C:/jeu/dist/index.html', 'data:image/png;base64,AAAA', 'blob:file:///1'])
      expect(requete(vu, url), url).toEqual({})
  })

  it('--fumee : une requête bloquée est comptée dans le résultat, qui sort rouge', async () => {
    const { porte, ouvrir } = porteFermee()
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ porte }) })
    await fenetre(vu)
    expect(requete(vu, 'http://exemple.invalid/')).toEqual({ cancel: true })
    ouvrir()
    await finie(vu)
    expect(sortie(vu).requetesBloquees).toEqual(['http://exemple.invalid/'])
    expect(vu.codes).toEqual([1])
  })

  // La fumée vérifie le jeu tel qu'il tourne : même isolation de la page dans les deux modes. webSecurity: false est le
  // contournement courant de fetch sous file:// (spec §3.2 et §10.1) : il ne passerait jamais en douce.
  it('webPreferences identiques avec et sans --fumee, jamais webSecurity: false', async () => {
    const jeu = lancerMain()
    const fum = lancerMain({ argv: FUMEE })
    await fenetre(jeu)
    await fenetre(fum)
    const prefs = jeu.fenetres[0].opts.webPreferences
    expect(fum.fenetres[0].opts.webPreferences).toEqual(prefs)
    expect(prefs).toMatchObject({ contextIsolation: true, nodeIntegration: false })
    expect(prefs.webSecurity).not.toBe(false)
  })

  it('sans --fumee : fenêtre visible, aucune garde réseau, ni profil changé, ni son coupé, aucune sortie', async () => {
    const vu = lancerMain()
    await fenetre(vu)
    expect(vu.fenetres[0].opts.show).not.toBe(false)
    expect(vu.gardes).toEqual([])
    expect(vu.chemins).toEqual({})
    expect(vu.muet).toBeNull()
    expect(vu.ralenti).toBeNull()
    expect(vu.gestionnaires).toEqual({})
    await new Promise(r => setTimeout(r, 20))
    expect(vu.lignes).toEqual([])
    expect(vu.codes).toEqual([])
  })
})

describe('electron/main.js --fumee : scénario joué dans la page (faux jeu)', () => {
  it('vert : sauvegarde de M3 posée, menu, modèles, images de la cinématique m3, mission, sauvegarde relue', async () => {
    const jeu = fauxJeu({ echapsIgnores: 1 })
    const vu = lancerMain({ argv: FUMEE, page: jeu })
    await finie(vu)
    const r = sortie(vu)
    expect(r.echecs).toEqual([])
    expect(r.requetesBloquees).toEqual([])
    expect(r.electron).toBe('42.5.0')
    expect(r.modeles).toEqual({ charges: 7, echecs: [] })
    expect(r.images.map(i => i.src)).toEqual(IMAGES_M3)
    expect(r.images.every(i => i.largeur > 0)).toBe(true)
    expect(r.mission).toBe(MISSION_3)
    expect(r.sauvegarde).toEqual({ libelle: 'REPRENDRE : MISSION 3', briefingVu: true, relue: true })
    expect(vu.codes).toEqual([0])
    // premier lancement sur un profil vierge, puis la sauvegarde posée : M3 en cours, briefing de M3 pas encore vu
    expect(jeu.lus[0]).toBeNull()
    expect(jeu.lus[1]).toMatchObject({ currentLevel: 3, briefingSeen: [true, true, false, false, false, false] })
    // REPRENDRE deux fois (cinématique, puis mission directe après le rechargement) ; Échap renvoyé tant que le jeu
    // l'ignore : le premier tombe dans le délai de grâce, le second passe la cinématique (fondu k-leaving)
    expect(jeu.clics).toBe(2)
    expect(jeu.echaps).toBe(2)
  })

  it('un modèle en échec (PNJ procédural) rend la fumée rouge et le nomme', async () => {
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ modelesEchecs: ['./models/mafia_woman_03.glb'] }) })
    await finie(vu)
    const r = sortie(vu)
    expect(r.modeles).toEqual({ charges: 6, echecs: ['./models/mafia_woman_03.glb'] })
    expect(r.echecs.join('\n')).toMatch(/mafia_woman_03\.glb/)
    expect(vu.codes).toEqual([1])
  })

  it('une image de la cinématique non chargée rend la fumée rouge et la nomme', async () => {
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ imageCassee: 'portrait-seconde-cam.jpg' }) })
    await finie(vu)
    const r = sortie(vu)
    expect(r.echecs.join('\n')).toMatch(/portrait-seconde-cam\.jpg/)
    expect(vu.codes).toEqual([1])
  })

  it('une sauvegarde perdue au rechargement (stockage de l\'origine non gardé) rend la fumée rouge', async () => {
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ stockagePerdu: true }) })
    await finie(vu)
    const r = sortie(vu)
    expect(r.sauvegarde.relue).toBe(false)
    const echecs = r.echecs.join('\n')
    expect(echecs).toMatch(/sauvegarde posée non lue : le menu propose « COMMENCER »/)
    expect(echecs).toMatch(/sauvegarde non relue : le menu propose « COMMENCER » après le rechargement/)
    expect(vu.codes).toEqual([1])
  })

  it('un briefing rejoué après le rechargement (briefing vu jamais enregistré) rend la fumée rouge', async () => {
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ briefingOublie: true }) })
    await finie(vu)
    const r = sortie(vu)
    expect(r.sauvegarde).toMatchObject({ briefingVu: false, relue: false })
    const echecs = r.echecs.join('\n')
    expect(echecs).toMatch(/pas noté le briefing de M3 vu/)
    expect(echecs).toMatch(/REPRENDRE rejoue le briefing de M3 déjà vu/)
    expect(vu.codes).toEqual([1])
  })

  it('un profil déjà utilisé (une sauvegarde avant la fumée) : rouge, scénario arrêté au premier menu, sauvegarde laissée intacte', async () => {
    const jeu = fauxJeu({ profilUtilise: true })
    const vu = lancerMain({ argv: FUMEE, page: jeu })
    await finie(vu)
    expect(JSON.parse(localStorage.getItem(CLE))).toEqual({ currentLevel: 2, briefingSeen: [true, false, false, false, false, false] })
    expect(jeu.lus).toHaveLength(1)   // aucun rechargement
    expect(jeu.clics).toBe(0)
    const r = sortie(vu)
    expect(r.echecs).toHaveLength(1)
    expect(r.echecs[0]).toMatch(/^profil déjà utilisé : le menu propose « REPRENDRE : MISSION 2 » au premier lancement/)
    expect(vu.codes).toEqual([1])
  })

  it('erreur de console, « [characters] échec » et chargement en échec d\'un sous-cadre sont comptés et rendent la fumée rouge ; le scénario va quand même au bout', async () => {
    const { porte, ouvrir } = porteFermee()
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ porte }) })
    await fenetre(vu)
    const wc = vu.fenetres[0].webContents
    wc.emit('console-message', { level: 'error', message: 'Uncaught TypeError: boum' })
    wc.emit('console-message', { level: 'warning', message: '[characters] échec ./models/mafia_boss.glb Error: 404' })
    wc.emit('console-message', { level: 'warning', message: 'THREE.WebGLRenderer: un simple avertissement' })
    wc.emit('console-message', { level: 'info', message: '[characters] chargé: target ./models/mafia_boss.glb' })
    wc.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'file:///C:/jeu/dist/briefing/x.html', false)
    ouvrir()
    await finie(vu)
    const r = sortie(vu)
    const echecs = r.echecs.join('\n')
    expect(echecs).toMatch(/boum/)
    expect(echecs).toMatch(/\[characters\] échec \.\/models\/mafia_boss\.glb/)
    expect(echecs).toMatch(/ERR_FILE_NOT_FOUND/)
    expect(echecs).not.toMatch(/simple avertissement|\[characters\] chargé/)
    expect(r.modeles).toEqual({ charges: 7, echecs: [] })
    expect(r.sauvegarde.relue).toBe(true)
    expect(vu.codes).toEqual([1])
  })

  it('le cadre principal qui ne se charge pas (dist/index.html absent) : rouge « page non chargée », sans scénario', async () => {
    const { porte, ouvrir } = porteFermee()
    const jeu = fauxJeu({ porte })
    const vu = lancerMain({ argv: FUMEE, page: jeu })
    await fenetre(vu)
    vu.fenetres[0].webContents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'file:///C:/jeu/dist/index.html', true)
    await finie(vu)
    const r = sortie(vu)
    expect(r.echecs).toContain('page non chargée : file:///C:/jeu/dist/index.html (ERR_FILE_NOT_FOUND, -6)')
    expect(r.modeles).toBeNull()
    expect(vu.codes).toEqual([1])
    ouvrir()   // le chargement du faux jeu arrive trop tard : rien ne repart
    await new Promise(f => setTimeout(f, 20))
    expect(jeu.clics).toBe(0)
    expect(vu.codes).toEqual([1])
  })

  it('la page arrêtée (render-process-gone) termine la fumée en rouge et le dit', async () => {
    const { porte } = porteFermee()
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ porte }) })
    await fenetre(vu)
    vu.fenetres[0].webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: -1 })
    expect(vu.codes).toEqual([1])
    expect(sortie(vu).echecs).toEqual(['page arrêtée : crashed'])
  })

  it('page muette : la fumée se ferme seule au délai de garde, rouge', async () => {
    vi.useFakeTimers()
    try {
      const vu = lancerMain({ argv: FUMEE })   // aucune page : rien ne se charge, executeJavaScript ne répond jamais
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      expect(vu.codes).toEqual([1])
      expect(sortie(vu).echecs.join('\n')).toMatch(/délai de garde/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('une étape qui n\'aboutit pas (menu jamais affiché) : rouge au bout de 60 s, l\'étape nommée, bien avant le délai de garde', async () => {
    vi.useFakeTimers()
    try {
      // page chargée, mais vide : le menu ne vient jamais
      const page = { charger: wc => setTimeout(() => wc.emit('did-finish-load'), 0), recharger() {}, executer: code => Promise.resolve().then(() => (0, eval)(code)) }
      const vu = lancerMain({ argv: FUMEE, page })
      await vi.advanceTimersByTimeAsync(59 * 1000)
      expect(vu.codes).toEqual([])
      await vi.advanceTimersByTimeAsync(2 * 1000)
      expect(vu.codes).toEqual([1])
      expect(sortie(vu).echecs).toEqual(['menu au premier lancement : rien au bout de 60 s'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('une exception du processus principal termine la fumée en rouge (jamais la boîte de dialogue d\'Electron)', async () => {
    const vu = lancerMain({ argv: FUMEE })
    await fenetre(vu)
    expect(typeof vu.gestionnaires.uncaughtException).toBe('function')
    vu.gestionnaires.uncaughtException(new Error('boum du processus principal'))
    expect(vu.codes).toEqual([1])
    expect(sortie(vu).echecs.join('\n')).toMatch(/boum du processus principal/)
  })

  it('une promesse rejetée dans le processus principal termine la fumée en rouge', async () => {
    const vu = lancerMain({ argv: FUMEE })
    await fenetre(vu)
    expect(typeof vu.gestionnaires.unhandledRejection).toBe('function')
    vu.gestionnaires.unhandledRejection(new Error('chargement rejeté'))
    expect(vu.codes).toEqual([1])
    expect(sortie(vu).echecs).toEqual(['promesse rejetée dans le processus principal : chargement rejeté'])
  })

  // Un module absent du paquet (tâche E2 : un fichier oublié dans l'asar) lève à son require, pendant le chargement de
  // electron/main.js. En mode --fumee, son exception doit déjà aller au gestionnaire de la fumée : sinon Electron ouvre sa
  // boîte de dialogue sur le bureau, jusqu'au taskkill du script 30 s plus tard. Chaque module requis est essayé, sauf
  // electron et path, requis avant la ligne de la fumée : un require ajouté ensuite (relais de la tâche R5) l'est d'office.
  it('--fumee : un module requis qui lève au chargement (absent du paquet) rend la fumée rouge, sans fenêtre, jamais la boîte de dialogue d\'Electron', async () => {
    const requis = lancerMain({ argv: ['electron', '.', '--fumee'] }).requis.filter(m => m !== 'electron' && m !== 'path')
    expect(requis.length).toBeGreaterThan(0)
    for (const absent of requis) {
      const vu = lancerMain({ argv: FUMEE, absent })
      expect(vu.boite, absent).toBeNull()
      await finie(vu)
      expect(vu.lignes[0], absent).toBe('[fumee] debut\n')
      expect(sortie(vu).echecs, absent).toEqual([`exception du processus principal : Cannot find module '${absent}'`])
      expect(vu.codes, absent).toEqual([1])
      await new Promise(r => setTimeout(r, 20))   // whenReady passé : la fenêtre serait déjà créée
      expect(vu.fenetres, absent).toEqual([])
    }
  })

  it('le résultat tient sur une ligne « [fumee] {json} », et le processus ne quitte qu\'une fois la ligne écrite', async () => {
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu(), sortieDifferee: true })
    await vi.waitFor(() => { expect(vu.lignes.length).toBe(2) })
    expect(vu.lignes[0]).toBe('[fumee] debut\n')
    expect(vu.lignes[1]).toMatch(/^\[fumee\] \{.*\}\n$/)
    expect(vu.codes).toEqual([])          // sortie pas encore écrite : on ne quitte pas
    vu.vidages[0]()
    expect(vu.codes).toEqual([0])
  })

  it('une ligne de résultat dont l\'écriture ne finit jamais : sortie quand même 2 s après, une seule fois', () => {
    vi.useFakeTimers()
    try {
      const vu = lancerMain({ argv: ['electron', '.', '--fumee'], sortieDifferee: true })   // sans profil : fin immédiate
      expect(sortie(vu).echecs.join('\n')).toMatch(/--profil/)
      vi.advanceTimersByTime(1999)
      expect(vu.codes).toEqual([])
      vi.advanceTimersByTime(1)
      expect(vu.codes).toEqual([1])
      vu.vidages[0]()   // l'écriture finit enfin : pas de seconde sortie
      expect(vu.codes).toEqual([1])
    } finally {
      vi.useRealTimers()
    }
  })
})

// ─── Page : fin du chargement des modèles publiée ─────────────────────
// Faux GLTFLoader piloté fichier par fichier (comme tests/characters.progress.test.js) : réussite ou échec.
const gltf = vi.hoisted(() => ({ pending: new Map() }))
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three')
  return {
    GLTFLoader: class {
      loadAsync(url) {
        return new Promise((resolve, reject) => {
          gltf.pending.set(url, {
            ok: () => { gltf.pending.delete(url); resolve({ scene: new THREE.Group(), animations: [] }) },
            fail: () => { gltf.pending.delete(url); reject(new Error('404 ' + url)) },
          })
        })
      }
    },
  }
})

describe('page : fin du chargement des modèles publiée sur <html> (data-modeles)', () => {
  let C, urls
  const flush = () => new Promise(r => setTimeout(r, 0))
  beforeEach(async () => {
    gltf.pending = new Map()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.resetModules()
    C = await import('../src/characters.js')
    urls = Object.values(C.MODELS).flatMap(cfg => cfg.variants ? cfg.variants.map(v => v.url) : [cfg.url])
  })

  it('posée à la fin du chargement seulement : nombre de modèles chargés et URL en échec', async () => {
    const html = document.documentElement
    C.preloadCharacters()
    for (let i = 0; i < urls.length - 1; i++) (i === 2 ? gltf.pending.get(urls[i]).fail() : gltf.pending.get(urls[i]).ok())
    await flush()
    expect(html.dataset.modeles).toBeUndefined()   // un fichier encore en route : rien n'est publié
    gltf.pending.get(urls[urls.length - 1]).ok()
    await flush()
    expect(html.dataset.modeles).toBe(String(urls.length - 1))
    expect(html.dataset.modelesEchecs).toBe(urls[2])
  })

  it('tout chargé : chaque modèle compté, aucune URL en échec', async () => {
    C.preloadCharacters()
    for (const u of urls) gltf.pending.get(u).ok()
    await flush()
    expect(document.documentElement.dataset.modeles).toBe(String(urls.length))
    expect(document.documentElement.dataset.modelesEchecs).toBe('')
  })
})

// ─── scripts/fumee.mjs ────────────────────────────────────────────────
// Chemin calculé à l'exécution : un script absent ne fait rougir que ces blocs, pas tout le fichier
const chargerScript = () => import(/* @vite-ignore */ pathToFileURL(join(ROOT, 'scripts', 'fumee.mjs')).href)
const VERT = {
  echecs: [], requetesBloquees: [], modeles: { charges: 7, echecs: [] },
  images: IMAGES_M3.map(src => ({ src, largeur: 360 })), mission: MISSION_3,
  sauvegarde: { libelle: 'REPRENDRE : MISSION 3', briefingVu: true, relue: true },
}

// Bac à sable : un dossier temporaire tenu pour la racine du dépôt, avec une copie de scripts/fumee.mjs et ce que le
// test y pose (build, paquet factice, sources datées). Lancé pour de vrai (executer), le script n'y trouve jamais de
// binaire Electron ni d'exécutable : s'il allait jusqu'au lancement, il s'arrêterait sur leur absence (les faux de
// bacPret ne servent qu'au lancement factice de main()). temp/ lui sert de dossier temporaire (TEMP, TMP) : on y voit
// les profils jetables qu'il crée. poser() date le fichier et ses dossiers : un dossier compte pour le build périmé (sa
// date change quand une entrée y est ajoutée, retirée ou renommée).
function bacASable() {
  const racine = mkdtempSync(join(tmpdir(), 'fumee-test-bac-'))
  const temp = join(racine, 'temp')
  mkdirSync(join(racine, 'scripts'))
  mkdirSync(temp)
  copyFileSync(join(ROOT, 'scripts', 'fumee.mjs'), join(racine, 'scripts', 'fumee.mjs'))
  return {
    racine, temp,
    poser(chemin, contenu = '', date = null) {   // date en secondes, comme utimesSync
      const f = join(racine, chemin)
      mkdirSync(dirname(f), { recursive: true })
      writeFileSync(f, contenu)
      if (date !== null) for (let p = f; p.length > racine.length; p = dirname(p)) utimesSync(p, date, date)
      return f
    },
    dater(chemin, date) { utimesSync(join(racine, chemin.replace(/\/$/, '')), date, date) },   // un dossier peut finir par « / »
    executer: (...args) => spawnSync(process.execPath, [join(racine, 'scripts', 'fumee.mjs'), ...args], {
      cwd: racine, encoding: 'utf8', timeout: 60000, windowsHide: true, env: { ...process.env, TEMP: temp, TMP: temp },
    }),
    profils: () => readdirSync(temp),
    fermer: () => rmSync(racine, { recursive: true, force: true }),
  }
}
const maintenant = () => Math.floor(Date.now() / 1000)

describe('scripts/fumee.mjs : lecture du résultat, verdict, commande, arguments', () => {
  let S
  beforeAll(async () => { S = await chargerScript() })

  it('lit la ligne « [fumee] » au milieu des messages de Chromium (fins de ligne Windows comprises)', () => {
    const bruit = '[1028/101010.123:ERROR:gpu_init.cc(523)] Passthrough is not supported\r\n' +
      `[fumee] ${JSON.stringify(VERT)}\r\n` + 'DevTools listening on rien\r\n'
    expect(S.lireResultat(bruit)).toEqual(VERT)
    expect(S.lireResultat(`[fumee] debut\r\n${bruit}`)).toEqual(VERT)   // la ligne de départ n'est pas un résultat
  })

  it('sans ligne de résultat, ou ligne tronquée (processus tué pendant l\'écriture) : aucun résultat', () => {
    expect(S.lireResultat('')).toBeNull()
    expect(S.lireResultat('[1028/101010:ERROR:x] rien\n')).toBeNull()
    expect(S.lireResultat('[fumee] {"echecs":[],"requetes')).toBeNull()
    expect(S.lireResultat('[fumee] debut\n')).toBeNull()
  })

  it('vert seulement si Electron sort à 0 et que le résultat tient le critère 12 de la spec', () => {
    expect(S.verdict({ code: 0, resultat: VERT })).toMatchObject({ ok: true, code: 0 })
    const rouge = (code, resultat) => S.verdict({ code, resultat })
    expect(rouge(1, VERT)).toMatchObject({ ok: false, code: 1 })
    expect(rouge(0, { ...VERT, echecs: ['console : boum'] })).toMatchObject({ ok: false, code: 1 })
    expect(rouge(0, { ...VERT, requetesBloquees: ['http://exemple.invalid/'] })).toMatchObject({ ok: false, code: 1 })
    expect(rouge(0, { ...VERT, modeles: { charges: 6, echecs: ['./models/mafia_boss.glb'] } })).toMatchObject({ ok: false, code: 1 })
    expect(rouge(0, { ...VERT, modeles: { charges: 0, echecs: [] } })).toMatchObject({ ok: false, code: 1 })
    expect(rouge(0, { ...VERT, images: [] })).toMatchObject({ ok: false, code: 1 })
    expect(rouge(0, { ...VERT, images: [{ src: 'briefing/img/x.jpg', largeur: 0 }] })).toMatchObject({ ok: false, code: 1 })
    expect(rouge(0, { ...VERT, sauvegarde: { ...VERT.sauvegarde, relue: false } })).toMatchObject({ ok: false, code: 1 })
    expect(rouge(0, { ...VERT, sauvegarde: null })).toMatchObject({ ok: false, code: 1 })
  })

  it('sans résultat : rouge, code 2, même si Electron est sorti à 0 (jamais de succès par défaut)', () => {
    expect(S.verdict({ code: 0, resultat: null })).toMatchObject({ ok: false, code: 2 })
    expect(S.verdict({ code: null, resultat: null })).toMatchObject({ ok: false, code: 2 })
  })

  it('commande : « electron . --fumee » sur le build, ou l\'exécutable empaqueté (--exe), toujours avec le profil jetable', () => {
    const racine = resolve('C:/jeu')
    expect(S.commandeFumee({ racine, profil: 'P', electron: () => 'E.exe' }))
      .toEqual({ commande: 'E.exe', args: [racine, '--fumee', '--profil=P'] })
    // le jeu empaqueté se vérifie sans le binaire Electron de node_modules (copie installée avec --ignore-scripts)
    const absent = () => { throw new Error('Electron failed to install correctly') }
    expect(S.commandeFumee({ racine, profil: 'P', electron: absent, exe: 'release/win-unpacked/Sniper.exe' }))
      .toEqual({ commande: join(racine, 'release', 'win-unpacked', 'Sniper.exe'), args: ['--fumee', '--profil=P'] })
  })

  it('binaire Electron de node_modules : son chemin s\'il est installé, sinon une erreur qui dit quoi faire, sans require(\'electron\') (qui le téléchargerait)', () => {
    const racine = mkdtempSync(join(tmpdir(), 'fumee-binaire-'))
    try {
      expect(() => S.binaireElectron(racine)).toThrow(/install\.js/)
      const dossier = join(racine, 'node_modules', 'electron')
      mkdirSync(join(dossier, 'dist'), { recursive: true })
      writeFileSync(join(dossier, 'path.txt'), 'electron.exe')
      expect(() => S.binaireElectron(racine)).toThrow(/install\.js/)   // path.txt sans le binaire : absent
      writeFileSync(join(dossier, 'dist', 'electron.exe'), '')
      expect(S.binaireElectron(racine)).toBe(join(dossier, 'dist', 'electron.exe'))
    } finally {
      rmSync(racine, { recursive: true, force: true })
    }
  })

  // Deux tests, chacun sur un stockage vierge (beforeEach) : la moitié rouge n'hérite pas de la sauvegarde de la verte
  it('la ligne écrite par electron/main.js se lit par le script, qui rend le même verdict que le code de sortie : vert', async () => {
    const vert = lancerMain({ argv: FUMEE, page: fauxJeu() })
    await finie(vert)
    expect(vert.codes).toEqual([0])
    expect(S.lireResultat(vert.lignes.join(''))).toEqual(sortie(vert))
    expect(S.verdict({ code: vert.codes[0], resultat: S.lireResultat(vert.lignes.join('')) })).toMatchObject({ ok: true, code: 0 })
  })

  it('la ligne écrite par electron/main.js se lit par le script, qui rend le même verdict que le code de sortie : rouge (une image)', async () => {
    const rouge = lancerMain({ argv: FUMEE, page: fauxJeu({ imageCassee: 'portrait-passeur-cam.jpg' }) })
    await finie(rouge)
    expect(rouge.codes).toEqual([1])
    expect(sortie(rouge).echecs).toEqual(['image non chargée : briefing/img/portrait-passeur-cam.jpg'])
    expect(S.verdict({ code: rouge.codes[0], resultat: S.lireResultat(rouge.lignes.join('')) })).toMatchObject({ ok: false, code: 1 })
  })

  it('arguments : rien, ou un seul --exe=<chemin non vide> ; tout autre argument est refusé avec l\'usage', () => {
    expect(S.lireArguments([])).toEqual({ exe: null })
    expect(S.lireArguments(['--exe=release/win-unpacked/Sniper.exe'])).toEqual({ exe: 'release/win-unpacked/Sniper.exe' })
    const refus = [[['--exe', 'release/win-unpacked/Sniper.exe'], '--exe'], [['--exe='], '--exe='], [['--bidule'], '--bidule'],
      [['--exe=a.exe', '--exe=b.exe'], '--exe=b.exe']]
    for (const [argv, fautif] of refus) {
      const { erreur, exe } = S.lireArguments(argv)
      expect(exe, argv.join(' ')).toBeUndefined()
      expect(erreur, argv.join(' ')).toContain(`argument refusé : « ${fautif} »`)
      expect(erreur, argv.join(' ')).toContain('usage : node scripts/fumee.mjs [--exe=')
    }
  })

  it('build périmé, partie pure : les fichiers plus récents que la référence du build, du plus récent au plus ancien', () => {
    const fichiers = [{ chemin: 'src/a.js', date: 100 }, { chemin: 'src/b.js', date: 300 }, { chemin: 'index.html', date: 200 }]
    expect(S.plusRecents(150, fichiers)).toEqual([{ chemin: 'src/b.js', date: 300 }, { chemin: 'index.html', date: 200 }])
    expect(S.plusRecents(300, fichiers)).toEqual([])
  })

  it('ce dont le build est fait : src/ et public/ entiers, leurs dossiers compris (« / » final), index.html, vite.config.js, package.json et package-lock.json ; electron/ en plus avec --exe', () => {
    const bac = bacASable()
    try {
      for (const f of ['src/a.js', 'src/gfx/b.js', 'public/models/c.glb', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json',
        'electron/main.js', 'tests/d.test.js', 'docs/e.md'])
        bac.poser(f, 'x', 1000)
      const chemins = options => S.fichiersDuBuild(bac.racine, options).map(f => f.chemin).sort()
      const sources = ['src/', 'src/a.js', 'src/gfx/', 'src/gfx/b.js', 'public/', 'public/models/', 'public/models/c.glb', 'index.html',
        'vite.config.js', 'package.json', 'package-lock.json']
      expect(chemins()).toEqual([...sources].sort())
      expect(chemins({ exe: 'release/win-unpacked/Sniper.exe' })).toEqual(['electron/', 'electron/main.js', ...sources].sort())
      expect(S.fichiersDuBuild(bac.racine).every(f => f.date === 1000 * 1000)).toBe(true)
    } finally {
      bac.fermer()
    }
  })
})

// Le script lancé pour de vrai (node), dans un bac à sable sans Electron ni exécutable : ses refus tombent avant tout
// lancement, sans profil créé. Le script d'avant ces refus irait plus loin et s'arrêterait sur l'absence d'Electron.
describe('scripts/fumee.mjs lancé dans un bac à sable : refus avant tout lancement (code 2)', () => {
  it('argument mal formé (« --exe chemin » avec une espace, « --exe= » vide, argument inconnu) : l\'usage, jamais la fumée de dist/ à la place', () => {
    const bac = bacASable()
    try {
      bac.poser('dist/index.html', '<!doctype html>')
      for (const [args, fautif] of [[['--exe', 'release/win-unpacked/Sniper.exe'], '--exe'], [['--exe='], '--exe='], [['--bidule'], '--bidule']]) {
        const r = bac.executer(...args)
        expect(r.stderr, args.join(' ')).toContain(`argument refusé : « ${fautif} »`)
        expect(r.stderr, args.join(' ')).toContain('usage : node scripts/fumee.mjs [--exe=')
        expect(r.status, args.join(' ')).toBe(2)
        expect(bac.profils(), args.join(' ')).toEqual([])
      }
    } finally {
      bac.fermer()
    }
  })

  // package.json et package-lock.json d'abord : les versions des dépendances (three) font aussi le build
  it('build périmé (un fichier de src/, de public/, index.html, vite.config.js, package.json ou package-lock.json plus récent que dist/index.html) : refusé, rien lancé ni imprimé comme vérifié ; à jour, la fumée part', () => {
    const bac = bacASable()
    try {
      const t = maintenant()
      bac.poser('dist/index.html', '<!doctype html>', t - 3600)
      for (const f of ['package.json', 'package-lock.json', 'src/main.js', 'public/models/a.glb', 'index.html', 'vite.config.js']) {
        bac.poser(f, 'x', t)   // modifié après le build
        const r = bac.executer()
        expect(r.stderr, f).toContain('build périmé : relancer npx vite build')
        expect(r.stderr, f).toContain(f)
        expect(r.stdout, f).not.toContain('build vérifié')
        expect(r.status, f).toBe(2)
        expect(bac.profils(), f).toEqual([])
        bac.poser(f, 'x', t - 7200)   // remis avant le build
      }
      // build à jour : ce qu'il vérifie est imprimé, puis la fumée part et s'arrête sur le binaire Electron, absent ici
      const r = bac.executer()
      expect(r.stdout).toMatch(/build vérifié : dist\/index\.html du \d\d\/\d\d\/\d{4} \d\d:\d\d:\d\d ; commit inconnu/)
      expect(r.stderr).not.toContain('build périmé')
      expect(r.stderr).toContain('binaire Electron absent')
      expect(r.status).toBe(2)
      expect(bac.profils()).toEqual([])
    } finally {
      bac.fermer()
    }
  })

  // Aucun fichier plus récent que le build dans ces trois cas : seule la date du dossier change
  it('build périmé par un dossier : une entrée retirée de public/, déplacée dans src/ (elle garde sa date) ou copiée avec sa date dans public/ : refusé, le dossier nommé', () => {
    const bac = bacASable()
    try {
      const t = maintenant()
      const avant = t - 7200   // sources d'avant le build
      bac.poser('dist/index.html', '<!doctype html>', t - 3600)
      for (const f of ['public/briefing/img/portrait.jpg', 'public/models/a.glb', 'src/briefing/scenes/m3.js', 'src/gfx/b.js', 'modeles/sources/c.glb'])
        bac.poser(f, 'x', avant)   // modeles/ : hors du build
      const racine = chemin => join(bac.racine, chemin)
      const cas = [
        ['entrée retirée de public/', () => rmSync(racine('public/briefing/img/portrait.jpg')), ['public/briefing/img/']],
        ['entrée déplacée dans src/', () => renameSync(racine('src/briefing/scenes/m3.js'), racine('src/gfx/m3.js')), ['src/briefing/scenes/', 'src/gfx/']],
        ['entrée copiée avec sa date dans public/', () => copyFileSync(racine('modeles/sources/c.glb'), racine('public/models/c.glb')), ['public/models/']],
      ]
      for (const [quoi, faire, dossiers] of cas) {
        faire()
        const r = bac.executer()
        expect(r.stderr, quoi).toContain('build périmé : relancer npx vite build')
        for (const d of dossiers) expect(r.stderr, quoi).toContain(d)
        expect(r.stderr, quoi).toContain('une entrée y a été ajoutée, retirée ou renommée')
        expect(r.stdout, quoi).not.toContain('build vérifié')
        expect(r.status, quoi).toBe(2)
        expect(bac.profils(), quoi).toEqual([])
        for (const d of dossiers) bac.dater(d, avant)   // dossier remis à sa date d'avant le build
      }
      // fichiers déplacés et copiés plus anciens que le build, dossiers remis : à jour, la fumée part
      const r = bac.executer()
      expect(r.stdout).toContain('build vérifié : dist/index.html du ')
      expect(r.stderr).toContain('binaire Electron absent')
      expect(r.status).toBe(2)
      expect(bac.profils()).toEqual([])
    } finally {
      bac.fermer()
    }
  })
})

// main() du script avec ses outils remplacés : aucun processus lancé (Electron factice), taskkill et git factices,
// processus factice pour les signaux et la sortie, aucune attente entre deux essais de suppression. Le bac à sable a un
// build à jour et un binaire Electron factice qui n'est pas un exécutable ; avec --exe, un faux exécutable (un fichier
// texte) que seul ce lancement factice « lance ». Le faux Electron sort comme un processus fils de Node : « exit » (son
// code), puis « close » (ses flux fermés). Le vrai tuer (taskkill /F /T) est vérifié à part, spawnSync remplacé, puis
// branché par main() sans tuer remplacé, son seul lanceur synchrone remplacé.
describe('scripts/fumee.mjs avec un lancement factice : --exe, puis pendant la fumée', () => {
  let S
  beforeAll(async () => { S = await chargerScript() })
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  const SIGNAUX = ['SIGINT', 'SIGBREAK', 'SIGHUP', 'SIGTERM']
  const EXE = 'release/win-unpacked/Sniper.exe'
  const flux = () => Object.assign(new EventEmitter(), { setEncoding() {} })
  function bacPret() {
    const bac = bacASable()
    bac.poser('dist/index.html', '<!doctype html>')
    bac.poser('node_modules/electron/path.txt', 'electron-factice.txt')
    bac.poser('node_modules/electron/dist/electron-factice.txt', '')
    return bac
  }
  // Paquet factice : resources/app.asar (contenu donné) à côté du faux exécutable
  function paquet(bac, asar, date = null) {
    bac.poser(EXE, 'faux exécutable : un fichier texte, jamais lancé')
    bac.poser('release/win-unpacked/resources/app.asar', asar, date)
  }
  const AVEC_FUMEE = "const fumee = process.argv.includes('--fumee')"
  // outils : des outils remplacés en plus, ou une fonction qui les rend à partir de l'état du test (s) ; un outil mis à
  // undefined n'est pas passé à main() (celui du script sert : tuer, par exemple)
  function lancerScript(bac, outils = {}, argv = []) {
    const s = { lances: [], tues: [], sorties: [], journal: [] }
    s.proc = Object.assign(new EventEmitter(), { pid: 4242, stdout: flux(), stderr: flux() })
    s.processus = Object.assign(new EventEmitter(), { exit: code => { s.sorties.push(code) } })
    s.sortir = code => { s.proc.emit('exit', code, null); s.proc.emit('close', code, null) }
    vi.spyOn(console, 'log').mockImplementation(m => { s.journal.push(['log', String(m)]) })
    vi.spyOn(console, 'error').mockImplementation(m => { s.journal.push(['erreur', String(m)]) })
    const remplaces = {
      racine: bac.racine, temp: bac.temp, processus: s.processus,
      lancer: (commande, args) => { s.lances.push({ commande, args }); return s.proc },
      tuer: pid => { s.tues.push(pid); s.sortir(1) },
      git: (racine, args) => (args[0] === 'rev-parse' ? 'abc1234\n' : ' M src/main.js\n?? notes.txt\n'),
      attendre: () => {},
      ...(typeof outils === 'function' ? outils(s) : outils),
    }
    s.fin = S.main(argv, Object.fromEntries(Object.entries(remplaces).filter(([, v]) => v !== undefined)))
    s.profil = () => s.lances[0].args.find(a => a.startsWith('--profil=')).slice('--profil='.length)
    s.texte = genre => s.journal.filter(([g]) => !genre || g === genre).map(([, m]) => m).join('\n')
    s.vert = () => {
      s.proc.stdout.emit('data', '[fumee] debut\n')
      s.proc.stdout.emit('data', `[fumee] ${JSON.stringify(VERT)}\n`)
      s.sortir(0)
    }
    return s
  }
  // Refus attendu, rien ne doit partir : s.lances et les messages se lisent sans attendre (main() n'attend rien avant le
  // lancement). Un lancement fautif fait sortir le faux Electron au tour suivant : main() finit (profil supprimé, délais
  // désarmés) au lieu de tenir le test jusqu'au délai de vitest et de laisser le bac à sable dans %TEMP%.
  const refus = s => ({ lancer: (commande, args) => { s.lances.push({ commande, args }); setTimeout(() => s.sortir(1)); return s.proc } })

  it('fin normale : vert, rien tué, profil supprimé, gestionnaires de signaux posés pendant la fumée puis retirés', async () => {
    const bac = bacPret()
    try {
      const s = lancerScript(bac)
      expect(s.lances).toHaveLength(1)
      expect(s.lances[0].commande).toBe(join(bac.racine, 'node_modules', 'electron', 'dist', 'electron-factice.txt'))
      const profil = s.profil()
      expect(existsSync(profil)).toBe(true)
      expect(readdirSync(profil)).toEqual([])   // vide : electron/main.js refuse tout autre profil
      for (const signal of SIGNAUX) expect(s.processus.listenerCount(signal), signal).toBe(1)
      s.vert()
      expect(await s.fin).toBe(0)
      expect(s.tues).toEqual([])
      expect(s.sorties).toEqual([])
      expect(bac.profils()).toEqual([])
      for (const signal of SIGNAUX) expect(s.processus.listenerCount(signal), signal).toBe(0)
    } finally {
      bac.fermer()
    }
  })

  it('avant le verdict : le commit, le nombre de lignes de git status --porcelain et la date du build vérifié', async () => {
    const bac = bacPret()
    try {
      const s = lancerScript(bac)
      s.vert()
      await s.fin
      const lignes = s.journal.map(([, m]) => m)
      const identite = lignes.findIndex(m => m.startsWith('build vérifié : '))
      expect(lignes[identite]).toMatch(/^build vérifié : dist\/index\.html du \d\d\/\d\d\/\d{4} \d\d:\d\d:\d\d ; commit abc1234, 2 lignes dans git status --porcelain$/)
      expect(identite).toBeLessThan(lignes.findIndex(m => m.startsWith('FUMÉE VERTE')))
    } finally {
      bac.fermer()
    }
  })

  it('arrêt d\'Electron : taskkill /F /T sur son PID, l\'arbre entier (Chromium lance plusieurs processus), sans fenêtre de console', () => {
    const appels = []
    S.tuerArbre(4242, (commande, args, options) => { appels.push({ commande, args, options }) })
    expect(appels).toEqual([{ commande: 'taskkill', args: ['/F', '/T', '/PID', '4242'], options: { stdio: 'ignore', windowsHide: true } }])
  })

  it('taskkill en échec (statut non nul, ou taskkill introuvable) : dit sur la sortie d\'erreur avec le PID ; réussi, rien n\'est dit', () => {
    const erreurs = []
    vi.spyOn(console, 'error').mockImplementation(m => { erreurs.push(String(m)) })
    S.tuerArbre(4242, () => ({ status: 0 }))
    expect(erreurs).toEqual([])
    S.tuerArbre(4242, () => ({ status: 128 }))
    S.tuerArbre(4242, () => ({ status: null, error: new Error('spawnSync taskkill ENOENT') }))
    expect(erreurs).toEqual([
      'taskkill /F /T /PID 4242 : statut 128 (l\'arbre d\'Electron n\'est peut-être pas arrêté)',
      'taskkill /F /T /PID 4242 : spawnSync taskkill ENOENT (l\'arbre d\'Electron n\'est peut-être pas arrêté)',
    ])
  })

  it('--exe vers un exécutable introuvable (chemin mal tapé, ou le dossier du paquet) : « exécutable introuvable », jamais « relancer npm run dist » ; rien lancé', async () => {
    const bac = bacPret()
    try {
      paquet(bac, AVEC_FUMEE)
      for (const exe of ['release/win-unpaked/Sniper.exe', 'release/win-unpacked']) {
        const s = lancerScript(bac, refus, [`--exe=${exe}`])
        expect(s.lances, exe).toEqual([])
        expect(s.texte('erreur'), exe).toBe(`exécutable introuvable : ${join(bac.racine, exe)}`)
        expect(bac.profils(), exe).toEqual([])
        expect(await s.fin, exe).toBe(2)
        vi.restoreAllMocks()
      }
    } finally {
      bac.fermer()
    }
  })

  it('--exe vers un paquet sans mode --fumee (construit avant E1 : « --fumee » absent de resources/app.asar, ou de resources/app/electron/main.js sans asar) : refusé, rien lancé', async () => {
    const bac = bacPret()
    try {
      paquet(bac, "electron/main.js : const isDev = process.argv.includes('--dev')")
      bac.poser('release/sans-asar/Sniper.exe', 'faux exécutable : un fichier texte, jamais lancé')
      bac.poser('release/sans-asar/resources/app/electron/main.js', "const isDev = process.argv.includes('--dev')")
      for (const exe of [EXE, 'release/sans-asar/Sniper.exe']) {
        const s = lancerScript(bac, refus, [`--exe=${exe}`])
        expect(s.lances, exe).toEqual([])
        expect(s.texte('erreur'), exe).toContain('exécutable sans mode --fumee : relancer npm run dist')
        expect(bac.profils(), exe).toEqual([])
        expect(await s.fin, exe).toBe(2)
        vi.restoreAllMocks()
      }
    } finally {
      bac.fermer()
    }
  })

  it('--exe : paquet plus ancien qu\'un fichier de src/ ou d\'electron/ (le processus principal est dans le paquet) : build périmé, relancer npm run dist ; rien lancé ni imprimé comme vérifié', async () => {
    const bac = bacPret()
    try {
      const t = maintenant()
      paquet(bac, AVEC_FUMEE, t - 3600)
      for (const f of ['src/main.js', 'electron/main.js']) {
        bac.poser(f, 'x', t)
        const s = lancerScript(bac, refus, [`--exe=${EXE}`])
        expect(s.lances, f).toEqual([])
        expect(s.texte('erreur'), f).toContain('build périmé : relancer npm run dist')
        expect(s.texte('erreur'), f).toContain(f)
        expect(s.texte(), f).not.toContain('build vérifié')
        expect(bac.profils(), f).toEqual([])
        expect(await s.fin, f).toBe(2)
        bac.poser(f, 'x', t - 7200)
        vi.restoreAllMocks()
      }
    } finally {
      bac.fermer()
    }
  })

  it('--exe, paquet à jour : la date de resources/app.asar imprimée comme build vérifié, puis l\'exécutable lancé en --fumee avec le profil jetable', async () => {
    const bac = bacPret()
    try {
      paquet(bac, AVEC_FUMEE)
      const s = lancerScript(bac, {}, [`--exe=${EXE}`])
      expect(s.lances).toEqual([{ commande: join(bac.racine, EXE), args: ['--fumee', `--profil=${s.profil()}`] }])
      expect(s.texte('log')).toMatch(/^build vérifié : release\/win-unpacked\/resources\/app\.asar du \d\d\/\d\d\/\d{4} \d\d:\d\d:\d\d ; commit abc1234, 2 lignes dans git status --porcelain$/m)
      s.vert()
      expect(await s.fin).toBe(0)
      expect(bac.profils()).toEqual([])
    } finally {
      bac.fermer()
    }
  })

  // Le main.js du dépôt écrit « [fumee] debut » dès son départ (testé plus haut) : sans --exe, la ligne absente dit un
  // Electron bloqué au lancement ; avec --exe, aussi un paquet d'avant cette ligne (la chaîne --fumee y est déjà)
  it('sans « [fumee] debut » au bout de 30 s : arbre tué, code 2, profil supprimé, et la cause probable dite', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const bac = bacPret()
    try {
      paquet(bac, AVEC_FUMEE)
      const cas = [
        [[], 'Electron n\'a pas démarré la fumée (bloqué au lancement ?)'],
        [[`--exe=${EXE}`], `${EXE} n'a pas démarré la fumée (bloqué au lancement, ou paquet trop ancien : relancer npm run dist)`],
      ]
      for (const [argv, cause] of cas) {
        const s = lancerScript(bac, {}, argv)
        await vi.advanceTimersByTimeAsync(29999)
        expect(s.tues, cause).toEqual([])
        await vi.advanceTimersByTimeAsync(1)
        expect(s.tues, cause).toEqual([4242])
        expect(await s.fin, cause).toBe(2)
        expect(s.texte('erreur'), cause).toContain(`aucune ligne « [fumee] debut » au bout de 30 s : ${cause} ; arrêté avec ses processus fils`)
        expect(bac.profils(), cause).toEqual([])
        vi.restoreAllMocks()
      }
    } finally {
      bac.fermer()
    }
  })

  // Les autres tests remplacent tuer : ici, l'arrêt du script lui-même, tuerArbre, dont seul le lanceur synchrone est
  // remplacé (aucun taskkill lancé). Sans ce branchement, les délais et l'interruption ne tueraient plus rien pour de vrai.
  it('arrêt par défaut (tuer non remplacé) : sans « [fumee] debut » au bout de 30 s, taskkill /F /T sur le PID d\'Electron, par tuerArbre', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const bac = bacPret()
    try {
      const appels = []
      const s = lancerScript(bac, s => ({
        tuer: undefined,
        lancerSync: (commande, args, options) => { appels.push({ commande, args, options }); s.sortir(1); return { status: 0 } },
      }))
      await vi.advanceTimersByTimeAsync(30 * 1000)
      expect(appels).toEqual([{ commande: 'taskkill', args: ['/F', '/T', '/PID', '4242'], options: { stdio: 'ignore', windowsHide: true } }])
      expect(await s.fin).toBe(2)
      expect(s.texte('erreur')).toContain('aucune ligne « [fumee] debut » au bout de 30 s')
      expect(bac.profils()).toEqual([])
    } finally {
      bac.fermer()
    }
  })

  it('« [fumee] debut » reçue : plus de délai de 30 s ; Electron bloqué ensuite, arbre tué au délai de garde (5 min), code 2', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const bac = bacPret()
    try {
      const s = lancerScript(bac)
      s.proc.stdout.emit('data', '[fumee] de')
      s.proc.stdout.emit('data', 'but\n')   // ligne coupée en deux morceaux
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1)
      expect(s.tues).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      expect(s.tues).toEqual([4242])
      expect(await s.fin).toBe(2)
      expect(s.texte('log')).toMatch(/FUMÉE ROUGE .*Electron tué au délai de garde/)
      expect(bac.profils()).toEqual([])
    } finally {
      bac.fermer()
    }
  })

  // Un taskkill sans effet ne laisse pas le script attendre sans fin, verrou Chrome tenu jusqu'à sa péremption : l'arrêt
  // est relancé au délai de garde, puis Electron n'est plus attendu 10 s après, et le script dit de l'arrêter à la main
  it('arrêt sans effet (Electron toujours là après taskkill) : relancé au délai de garde, puis plus attendu 10 s après, code 2', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // la première raison de l'arrêt reste dite : sans « [fumee] debut », c'est elle
    const SANS_DEBUT = '(aucune ligne « [fumee] debut » au bout de 30 s)'
    const cas = [
      ['sans « [fumee] debut »', () => {}, [4242], [4242, 4242], true],
      ['« [fumee] debut » reçue', s => s.proc.stdout.emit('data', '[fumee] debut\n'), [], [4242], false],
    ]
    for (const [quoi, partir, a30s, aLaGarde, sansDebut] of cas) {
      const bac = bacPret()
      try {
        const s = lancerScript(bac, s => ({ tuer: pid => { s.tues.push(pid) } }))   // sans effet : le faux Electron ne sort pas
        let fin = null
        s.fin.then(c => { fin = c })
        partir(s)
        await vi.advanceTimersByTimeAsync(30 * 1000)
        expect(s.tues, quoi).toEqual(a30s)
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 30 * 1000)
        expect(s.tues, quoi).toEqual(aLaGarde)
        await vi.advanceTimersByTimeAsync(10 * 1000 - 1)
        expect(fin, quoi).toBeNull()
        await vi.advanceTimersByTimeAsync(1)
        expect(fin, quoi).toBe(2)
        expect(s.texte('erreur'), quoi).toContain('Electron toujours là 10 s après son arrêt au délai de garde : plus attendu')
        expect(s.texte('erreur'), quoi).toContain('taskkill /F /T /PID 4242')
        expect(s.texte('log'), quoi).toMatch(/FUMÉE ROUGE \(\d+ s\) : Electron toujours là après son arrêt au délai de garde/)
        expect(s.texte('log').includes(SANS_DEBUT), quoi).toBe(sansDebut)
        expect(bac.profils(), quoi).toEqual([])
      } finally {
        vi.restoreAllMocks()
        bac.fermer()
      }
    }
  })

  // Node ne promet pas que les flux d'un processus fils soient vidés à « exit » : la ligne de résultat peut arriver après
  it('ligne de résultat arrivée après la sortie d\'Electron (flux encore ouverts à « exit ») : lue à la fermeture des flux, vert', async () => {
    const bac = bacPret()
    try {
      const s = lancerScript(bac)
      s.proc.stdout.emit('data', '[fumee] debut\n')
      s.proc.emit('exit', 0, null)
      await new Promise(r => setTimeout(r, 20))   // le script a vu la sortie, la fin du tube arrive ensuite
      s.proc.stdout.emit('data', `[fumee] ${JSON.stringify(VERT)}\n`)
      s.proc.emit('close', 0, null)
      expect(await s.fin).toBe(0)
      expect(s.texte('log')).toMatch(/FUMÉE VERTE/)
      expect(bac.profils()).toEqual([])
    } finally {
      bac.fermer()
    }
  })

  it('flux jamais fermés après la sortie d\'Electron (un processus fils qui garderait le tube) : résultat lu 2 s après, pas plus tard', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const bac = bacPret()
    try {
      const s = lancerScript(bac)
      let fin = null
      s.fin.then(c => { fin = c })
      s.proc.stdout.emit('data', '[fumee] debut\n')
      s.proc.stdout.emit('data', `[fumee] ${JSON.stringify(VERT)}\n`)
      s.proc.emit('exit', 0, null)
      await vi.advanceTimersByTimeAsync(1999)
      expect(fin).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(fin).toBe(0)
      expect(bac.profils()).toEqual([])
    } finally {
      bac.fermer()
    }
  })

  it('Electron sorti seul sans « [fumee] debut », ses flux pas encore fermés au délai de 30 s : rien tué après sa sortie (son PID a pu être repris), aucun résultat', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const bac = bacPret()
    try {
      const s = lancerScript(bac)
      await vi.advanceTimersByTimeAsync(29000)
      s.proc.emit('exit', 1, null)   // flux fermés plus tard : 2 s au plus
      await vi.advanceTimersByTimeAsync(2000)
      expect(s.tues).toEqual([])
      expect(await s.fin).toBe(2)
      expect(s.texte('log')).toMatch(/FUMÉE ROUGE .* : aucun résultat \(Electron sorti avec le code 1\)/)
      expect(s.texte('erreur')).not.toContain('aucune ligne « [fumee] debut »')
    } finally {
      bac.fermer()
    }
  })

  it('interrompu une fois Electron lancé (Ctrl+C, Ctrl+Pause, console fermée : SIGINT, SIGBREAK, SIGHUP ; SIGTERM sous POSIX) : arbre tué d\'abord, profil supprimé ensuite, puis sortie 130', async () => {
    // Chromium tient les fichiers du profil tant que son arbre tourne : supprimer avant de tuer échouerait
    const occupe = () => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' })
    for (const signal of SIGNAUX) {
      const bac = bacPret()
      try {
        const s = lancerScript(bac, s => ({ supprimer: chemin => { if (!s.tues.length) throw occupe(); rmSync(chemin, { recursive: true, force: true }) } }))
        const profil = s.profil()
        s.processus.exit = code => { s.sorties.push({ code, profilEncoreLa: existsSync(profil), tues: [...s.tues] }) }
        s.processus.emit(signal)
        expect(s.sorties, signal).toEqual([{ code: 130, profilEncoreLa: false, tues: [4242] }])
        await s.fin   // le faux processus ne quitte pas : la fumée finit d'elle-même, sans rien relancer
        expect(s.tues, signal).toEqual([4242])
        expect(bac.profils(), signal).toEqual([])
      } finally {
        vi.restoreAllMocks()
        bac.fermer()
      }
    }
  })

  it('interrompu entre la sortie d\'Electron et la fermeture de ses flux : rien tué (son PID a pu être repris), profil supprimé, sortie 130', async () => {
    const bac = bacPret()
    try {
      const s = lancerScript(bac)
      const profil = s.profil()
      s.processus.exit = code => { s.sorties.push({ code, profilEncoreLa: existsSync(profil) }) }
      s.proc.emit('exit', 0, null)
      await new Promise(r => setTimeout(r, 20))   // le script attend les flux (2 s au plus)
      s.processus.emit('SIGINT')
      expect(s.sorties).toEqual([{ code: 130, profilEncoreLa: false }])
      expect(s.tues).toEqual([])
      s.proc.emit('close', 0, null)
      await s.fin
      expect(bac.profils()).toEqual([])
    } finally {
      bac.fermer()
    }
  })

  it('profil jetable impossible à supprimer (fichier encore tenu) : message avec son chemin sur la sortie d\'erreur, verdict du jeu inchangé', async () => {
    const bac = bacPret()
    try {
      let essais = 0
      const tenu = () => { essais++; throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }) }
      const s = lancerScript(bac, { supprimer: tenu })
      s.vert()
      expect(await s.fin).toBe(0)
      expect(essais).toBe(20)
      expect(s.texte('erreur')).toContain(`profil jetable non supprimé : ${s.profil()}`)
      expect(s.texte('log')).toMatch(/FUMÉE VERTE/)
    } finally {
      bac.fermer()   // le bac à sable emporte le profil resté
    }
  })
})
