import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'

// Processus principal d'Electron exécuté avec un faux module 'electron' :
// on regarde quelle fenêtre il ouvre et ce qu'il y charge, sans rien afficher.

const ROOT = resolve(__dirname, '..')
const ELECTRON_DIR = join(ROOT, 'electron')
const MAIN_SRC = readFileSync(join(ELECTRON_DIR, 'main.js'), 'utf8')
const nodeRequire = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

function runMain({ argv = ['electron', '.'], env = {} } = {}) {
  const seen = { windows: [] }
  class BrowserWindow {
    constructor(opts) { this.opts = opts; this.webContents = { openDevTools() { seen.devtools = true } }; seen.windows.push(this) }
    setMenuBarVisibility() {}
    loadURL(url) { this.url = url }
    loadFile(file) { this.file = file }
  }
  const electron = {
    BrowserWindow,
    app: { whenReady: () => ({ then: (f) => f() }), on() {}, quit() {} },
  }
  const fakeRequire = (name) => (name === 'electron' ? electron : nodeRequire(name))
  const fakeProcess = { argv, env, platform: 'win32' }
  new Function('require', 'process', '__dirname', MAIN_SRC)(fakeRequire, fakeProcess, ELECTRON_DIR)
  return seen
}

describe('Electron', () => {
  it('sans option, la fenêtre charge le build (dist/index.html)', () => {
    const [win] = runMain().windows
    expect(win.url).toBeUndefined()
    expect(resolve(win.file)).toBe(join(ROOT, 'dist', 'index.html'))
  })

  it('avec --dev, la fenêtre charge le serveur Vite (lancement sans variable d\'environnement, compatible Windows)', () => {
    const seen = runMain({ argv: ['electron', '.', '--dev'] })
    expect(seen.windows[0].url).toBe('http://localhost:5173')
    expect(seen.devtools).toBe(true)
  })

  it('le script electron:dev passe --dev et ne pose aucune variable à la mode POSIX (cmd.exe ne la comprend pas)', () => {
    const script = pkg.scripts['electron:dev']
    expect(script).not.toMatch(/^\s*\w+=/)
    expect(script.split(/\s+/)).toContain('--dev')
  })

  // Le bouton Plein écran des Paramètres (spec du lot 1 §4.5) appelle requestFullscreen, « qui marche aussi sous
  // Electron ». Sous macOS, fullscreen: false passé explicitement rend la fenêtre non fullscreenable (bouton du système
  // masqué ou grisé, d'après la documentation d'Electron) ; fullscreenable vaut true par défaut, fullscreen false.
  it('aucune option ne retire à la fenêtre le droit de passer en plein écran (ni fullscreen: false explicite, ni fullscreenable: false)', () => {
    const [win] = runMain().windows
    expect(win.opts.fullscreen).not.toBe(false)
    expect(win.opts.fullscreenable).not.toBe(false)
  })

  it('aucune icône référencée ne manque (fenêtre et installeur)', () => {
    const [win] = runMain().windows
    const icons = [
      win.opts.icon,
      pkg.build?.win?.icon && join(ROOT, pkg.build.win.icon),
      pkg.build?.nsis?.installerIcon && join(ROOT, pkg.build.nsis.installerIcon),
    ].filter(Boolean)
    expect(icons.filter(p => !existsSync(p))).toEqual([])
  })
})
