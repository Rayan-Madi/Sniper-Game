import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Fumée du livrable Electron (spec du lot 5 §3.2, §7 et §8 critère 12 ; plan, tâche E1) :
// - electron/main.js exécuté avec un faux module 'electron' (comme tests/electron.test.js). Avec --fumee : fenêtre
//   cachée, sans son, profil jetable, requêtes http, https, ws et wss bloquées et comptées, scénario joué dans la page
//   (ici un faux jeu monté dans le DOM de jsdom, que executeJavaScript évalue), une ligne « [fumee] {json} » puis un
//   code de sortie. Sans --fumee, rien de tout cela ;
// - src/characters.js publie la fin du chargement des modèles sur <html> (data-modeles), seule trace lisible dans un
//   build, qui n'a pas les accroches de développement (__mission) ;
// - scripts/fumee.mjs : lecture du résultat dans la sortie d'Electron, verdict, commande lancée.

const ROOT = resolve(__dirname, '..')
const ELECTRON_DIR = join(ROOT, 'electron')
const nodeRequire = createRequire(import.meta.url)

// ─── Faux module 'electron' ───────────────────────────────────────────
// Ce que la fumée utilise en plus du harnais de tests/electron.test.js : session.webRequest, executeJavaScript,
// reload, événements de webContents, app.setPath et app.exit, process.on et process.stdout. app.whenReady rend une
// vraie promesse, comme Electron : la fenêtre se crée après l'exécution de tout le fichier.
function lancerMain({ argv = ['electron', '.'], page = null, sortieDifferee = false } = {}) {
  const vu = { fenetres: [], gardes: [], chemins: {}, codes: [], lignes: [], vidages: [], muet: null, ralenti: null, gestionnaires: {} }
  class WebContents extends EventEmitter {
    constructor() {
      super()
      this.session = { webRequest: { onBeforeRequest: (...args) => { vu.gardes.push(args[args.length - 1]) } } }
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
      setPath: (nom, chemin) => { vu.chemins[nom] = chemin },
    },
  }
  const processus = {
    argv, env: {}, platform: 'win32', versions: { electron: '42.5.0' },
    on: (evenement, f) => { vu.gestionnaires[evenement] = f },
    stdout: { write: (texte, vide) => { vu.lignes.push(texte); if (!vide) return; if (sortieDifferee) vu.vidages.push(vide); else vide() } },
  }
  const fakeRequire = name => (name === 'electron' ? electron : nodeRequire(name))
  const src = readFileSync(join(ELECTRON_DIR, 'main.js'), 'utf8')
  new Function('require', 'process', '__dirname', src)(fakeRequire, processus, ELECTRON_DIR)
  return vu
}

// Résultat écrit par le processus principal : la ligne « [fumee] {json} » (lecture locale, indépendante du script).
function sortie(vu) {
  const ligne = vu.lignes.join('').split('\n').find(l => l.startsWith('[fumee] '))
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
// porte : promesse qui retient le premier chargement (événements émis par le test avant que le scénario ne parte).
// Un seul faux jeu à la fois : celui du test précédent est arrêté (ses écouteurs de document retirés).
const CLE = 'sniper-save'
const IMAGES_M3 = ['portrait-passeur-cam-lo.png', 'portrait-passeur-cam.jpg', 'portrait-seconde-cam-lo.png', 'portrait-seconde-cam.jpg']
  .map(f => 'briefing/img/' + f)
const MISSION_3 = 'LE PORT  ·  3/6'
let jeuActif = null
function fauxJeu({ modelesEchecs = [], imageCassee = null, stockagePerdu = false, briefingOublie = false, profilUtilise = false, porte = null } = {}) {
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
        if (e.code !== 'Escape' || root.hidden) return
        jeu.echaps++
        root.innerHTML = ''
        root.hidden = true
        if (!briefingOublie) { save.briefingSeen[2] = true; localStorage.setItem(CLE, JSON.stringify(save)) }
        mission()
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

const FUMEE = ['electron', '.', '--fumee', '--profil=C:/temp/sniper-fumee-test']

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

  it('--fumee : profil jetable passé par --profil (données de session comprises), jamais la sauvegarde du joueur', async () => {
    const vu = lancerMain({ argv: FUMEE })
    await fenetre(vu)
    expect(vu.chemins).toEqual({ userData: 'C:/temp/sniper-fumee-test', sessionData: 'C:/temp/sniper-fumee-test' })
  })

  it('--fumee : toute requête http, https, ws ou wss est bloquée ; les fichiers du jeu passent', async () => {
    const vu = lancerMain({ argv: FUMEE })
    await fenetre(vu)
    expect(vu.gardes.length).toBe(1)
    const reponse = url => { let r = null; vu.gardes[0]({ url }, x => { r = x }); return r }
    for (const url of ['http://exemple.invalid/', 'https://exemple.invalid/a.glb', 'ws://127.0.0.1:8787', 'wss://exemple.invalid/'])
      expect(reponse(url), url).toEqual({ cancel: true })
    for (const url of ['file:///C:/jeu/dist/index.html', 'data:image/png;base64,AAAA', 'blob:file:///1'])
      expect(reponse(url)?.cancel, url).toBeFalsy()
  })

  it('--fumee : une requête bloquée est comptée dans le résultat, qui sort rouge', async () => {
    const { porte, ouvrir } = porteFermee()
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ porte }) })
    await fenetre(vu)
    vu.gardes[0]({ url: 'http://exemple.invalid/' }, () => {})
    ouvrir()
    await finie(vu)
    expect(sortie(vu).requetesBloquees).toEqual(['http://exemple.invalid/'])
    expect(vu.codes).toEqual([1])
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
    const jeu = fauxJeu()
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
    // REPRENDRE deux fois (cinématique, puis mission directe après le rechargement), la cinématique passée une fois
    expect(jeu.clics).toBe(2)
    expect(jeu.echaps).toBe(1)
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

  it('un profil déjà utilisé (une sauvegarde avant la fumée) rend la fumée rouge', async () => {
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu({ profilUtilise: true }) })
    await finie(vu)
    expect(sortie(vu).echecs.join('\n')).toMatch(/profil/)
    expect(vu.codes).toEqual([1])
  })

  it('erreur de console, « [characters] échec » et chargement en échec sont comptés et rendent la fumée rouge', async () => {
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
    const echecs = sortie(vu).echecs.join('\n')
    expect(echecs).toMatch(/boum/)
    expect(echecs).toMatch(/\[characters\] échec \.\/models\/mafia_boss\.glb/)
    expect(echecs).toMatch(/ERR_FILE_NOT_FOUND/)
    expect(echecs).not.toMatch(/simple avertissement|chargé/)
    expect(vu.codes).toEqual([1])
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

  it('une exception du processus principal termine la fumée en rouge (jamais la boîte de dialogue d\'Electron)', async () => {
    const vu = lancerMain({ argv: FUMEE })
    await fenetre(vu)
    expect(typeof vu.gestionnaires.uncaughtException).toBe('function')
    vu.gestionnaires.uncaughtException(new Error('boum du processus principal'))
    expect(vu.codes).toEqual([1])
    expect(sortie(vu).echecs.join('\n')).toMatch(/boum du processus principal/)
  })

  it('le résultat tient sur une ligne « [fumee] {json} », et le processus ne quitte qu\'une fois la ligne écrite', async () => {
    const vu = lancerMain({ argv: FUMEE, page: fauxJeu(), sortieDifferee: true })
    await vi.waitFor(() => { expect(vu.lignes.length).toBe(1) })
    expect(vu.lignes[0]).toMatch(/^\[fumee\] \{.*\}\n$/)
    expect(vu.codes).toEqual([])          // sortie pas encore écrite : on ne quitte pas
    vu.vidages[0]()
    expect(vu.codes).toEqual([0])
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
describe('scripts/fumee.mjs : lecture du résultat, verdict, commande', () => {
  let S
  // Chemin calculé à l'exécution : un script absent ne fait rougir que ce bloc, pas tout le fichier
  beforeAll(async () => { S = await import(/* @vite-ignore */ pathToFileURL(join(ROOT, 'scripts', 'fumee.mjs')).href) })
  const VERT = {
    echecs: [], requetesBloquees: [], modeles: { charges: 7, echecs: [] },
    images: IMAGES_M3.map(src => ({ src, largeur: 360 })), mission: MISSION_3,
    sauvegarde: { libelle: 'REPRENDRE : MISSION 3', briefingVu: true, relue: true },
  }

  it('lit la ligne « [fumee] » au milieu des messages de Chromium (fins de ligne Windows comprises)', () => {
    const bruit = '[1028/101010.123:ERROR:gpu_init.cc(523)] Passthrough is not supported\r\n' +
      `[fumee] ${JSON.stringify(VERT)}\r\n` + 'DevTools listening on rien\r\n'
    expect(S.lireResultat(bruit)).toEqual(VERT)
  })

  it('sans ligne de résultat, ou ligne tronquée (processus tué pendant l\'écriture) : aucun résultat', () => {
    expect(S.lireResultat('')).toBeNull()
    expect(S.lireResultat('[1028/101010:ERROR:x] rien\n')).toBeNull()
    expect(S.lireResultat('[fumee] {"echecs":[],"requetes')).toBeNull()
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
    expect(S.commandeFumee({ racine, profil: 'P', electron: 'E.exe' }))
      .toEqual({ commande: 'E.exe', args: [racine, '--fumee', '--profil=P'] })
    expect(S.commandeFumee({ racine, profil: 'P', electron: 'E.exe', exe: 'release/win-unpacked/Sniper.exe' }))
      .toEqual({ commande: join(racine, 'release', 'win-unpacked', 'Sniper.exe'), args: ['--fumee', '--profil=P'] })
  })

  it('la ligne écrite par electron/main.js se lit par le script, qui rend le même verdict que le code de sortie', async () => {
    const vert = lancerMain({ argv: FUMEE, page: fauxJeu() })
    await finie(vert)
    expect(S.lireResultat(vert.lignes.join(''))).toEqual(sortie(vert))
    expect(S.verdict({ code: vert.codes[0], resultat: S.lireResultat(vert.lignes.join('')) })).toMatchObject({ ok: true, code: 0 })
    const rouge = lancerMain({ argv: FUMEE, page: fauxJeu({ imageCassee: 'portrait-passeur-cam.jpg' }) })
    await finie(rouge)
    expect(S.verdict({ code: rouge.codes[0], resultat: S.lireResultat(rouge.lignes.join('')) })).toMatchObject({ ok: false, code: 1 })
  })
})
