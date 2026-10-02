// Captures figées des cinématiques jouées dans le jeu (Chrome sans interface), pour comparer aux maquettes.
// Prérequis : npm run dev. Usage : node scripts/shots.mjs m3 9000 23000 39000
// Variables : CHROME (chemin de Chrome), BASE_URL (défaut http://localhost:5173/), PARAMS (ex. port=libres).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const [id, ...instants] = process.argv.slice(2)
if (!id || !instants.length) { console.error('Usage : node scripts/shots.mjs <id> <ms> [<ms>…]'); process.exit(1) }
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
// MAQUETTE=1 : capture la maquette d'origine (npx vite docs/superpowers/maquettes/cinematiques --port 5193) au lieu du jeu
const MAQ = !!process.env.MAQUETTE
const BASE = process.env.BASE_URL || (MAQ ? 'http://localhost:5193/' : 'http://localhost:5173/')
const page = MAQ ? (id === 'epilogue' ? 'epilogue.html' : `briefing-${id}.html`) : ''
mkdirSync('shots', { recursive: true })
for (const ms of instants) {
  // Chemin absolu pour --screenshot= : sous Windows, Chrome résout un chemin relatif depuis son propre dossier.
  const out = resolve('shots', `${MAQ ? 'maquette-' : ''}${id}-${ms}${process.env.PARAMS ? '-' + process.env.PARAMS.replace(/[^a-z0-9]+/gi, '_') : ''}.png`)
  const profile = mkdtempSync(join(tmpdir(), 'shots-'))
  const url = MAQ
    ? `${BASE}${page}?freeze=${ms}${process.env.PARAMS ? '&' + process.env.PARAMS : ''}`
    : `${BASE}?cine=${encodeURIComponent(id)}&freeze=${ms}${process.env.PARAMS ? '&' + process.env.PARAMS : ''}`
  execFileSync(CHROME, ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--mute-audio',
    `--user-data-dir=${profile}`, '--window-size=1280,720', `--virtual-time-budget=${+ms + 8000}`, `--screenshot=${out}`, url], { stdio: 'ignore' })
  rmSync(profile, { recursive: true, force: true })
  console.log(out)
}
