// Fumée du livrable Electron, hors ligne et sans fenêtre visible (spec du lot 5 §3.2 et §8 critère 12 ; plan, tâche
// E1) : lance le jeu construit en mode --fumee (electron/main.js joue le scénario dans la page), lit la ligne
// « [fumee] {json} » de sa sortie et rend le verdict.
// Prérequis : npx vite build (dist/). Usage : node scripts/fumee.mjs [--exe=release/win-unpacked/Sniper.exe]
//   sans --exe : « electron . --fumee » avec l'Electron de node_modules, sur dist/
//   --exe=…    : l'exécutable empaqueté (tâche E2), lancé avec --fumee
// Sortie : le JSON du scénario ({ echecs, requetesBloquees, modeles, images, sauvegarde, … }), puis le verdict ; code 0
// (vert), 1 (rouge) ou 2 (aucun résultat : Electron arrêté avant d'écrire, ou tué au délai de garde). Profil jetable,
// supprimé à la fin ; Electron et ses processus fils arrêtés au délai de garde. Aucune fenêtre, aucun port de débogage.
// Machine partagée : un seul Electron ou Chrome sans interface à la fois (verrou Chrome des chantiers, REPRISE.md).
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MARQUE = '[fumee] '
const DELAI_GARDE_MS = 5 * 60 * 1000   // au-delà du délai du processus principal (3 min) : Electron bloqué

// Résultat écrit par electron/main.js : la dernière ligne « [fumee] {json} » de la sortie, au milieu des messages de
// Chromium. Aucune ligne, ou une ligne tronquée (processus tué pendant l'écriture) : null.
export function lireResultat(sortie) {
  const lignes = String(sortie).split(/\r?\n/).filter(l => l.startsWith(MARQUE))
  if (!lignes.length) return null
  try { return JSON.parse(lignes[lignes.length - 1].slice(MARQUE.length)) } catch { return null }
}

// Verdict (critère 12 de la spec : aucun échec de chargement, aucune requête réseau, modèles sans repli, images,
// sauvegarde relue), relu dans le JSON en plus du code de sortie d'Electron : il faut les deux pour un vert. Sans
// résultat : code 2, jamais de succès par défaut.
export function verdict({ code, resultat }) {
  if (!resultat) return { ok: false, code: 2, raisons: [`aucun résultat (Electron sorti avec le code ${code})`] }
  const r = resultat
  const liste = v => (Array.isArray(v) ? v : null)
  const raisons = []
  if (code !== 0) raisons.push(`Electron sorti avec le code ${code}`)
  if (!liste(r.echecs) || r.echecs.length) raisons.push(`échecs : ${liste(r.echecs) ? r.echecs.join(' ; ') : 'liste absente'}`)
  if (!liste(r.requetesBloquees) || r.requetesBloquees.length) raisons.push(`requêtes réseau : ${liste(r.requetesBloquees) ? r.requetesBloquees.join(' ') : 'liste absente'}`)
  if (!r.modeles || !(r.modeles.charges > 0) || !liste(r.modeles.echecs) || r.modeles.echecs.length) raisons.push('modèles absents ou en échec')
  if (!liste(r.images) || !r.images.length || r.images.some(i => !(i.largeur > 0))) raisons.push('images de la cinématique absentes ou non chargées')
  if (!r.sauvegarde || r.sauvegarde.relue !== true) raisons.push('sauvegarde non relue')
  return raisons.length ? { ok: false, code: 1, raisons } : { ok: true, code: 0, raisons: [] }
}

// Commande lancée : l'Electron de node_modules sur le dossier du jeu, ou l'exécutable empaqueté ; toujours en --fumee,
// avec le profil jetable que ce script crée puis supprime.
export function commandeFumee({ racine, exe = null, profil, electron }) {
  return exe
    ? { commande: resolve(racine, exe), args: ['--fumee', `--profil=${profil}`] }
    : { commande: electron, args: [racine, '--fumee', `--profil=${profil}`] }
}

const pause = ms => new Promise(r => setTimeout(r, ms))

async function main(argv) {
  const racine = join(dirname(fileURLToPath(import.meta.url)), '..')
  const exeArg = argv.find(a => a.startsWith('--exe='))
  const exe = exeArg ? exeArg.slice('--exe='.length) : null
  if (!exe && !existsSync(join(racine, 'dist', 'index.html'))) {
    console.error('dist/index.html introuvable : lancer « npx vite build » avant la fumée')
    return 2
  }
  const profil = mkdtempSync(join(tmpdir(), 'sniper-fumee-'))
  const { commande, args } = commandeFumee({ racine, exe, profil, electron: createRequire(import.meta.url)('electron') })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE   // sinon electron.exe se comporte comme node
  console.log(`fumée : ${exe ? exe : 'electron .'} --fumee (fenêtre cachée, réseau bloqué, profil jetable)`)
  const t0 = Date.now()
  const proc = spawn(commande, args, { cwd: racine, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let sortie = '', erreurs = ''
  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  proc.stdout.on('data', d => { sortie += d })
  proc.stderr.on('data', d => { erreurs += d })
  // Délai de garde : Electron et tous ses processus fils arrêtés
  let tue = false
  const garde = setTimeout(() => { tue = true; spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' }) }, DELAI_GARDE_MS)
  const code = await new Promise(r => { proc.once('exit', c => r(c)); proc.once('error', e => { erreurs += String(e); r(null) }) })
  clearTimeout(garde)
  for (let i = 0; i < 20; i++) {
    try { rmSync(profil, { recursive: true, force: true }); break } catch { await pause(300) }
  }
  const resultat = lireResultat(sortie)
  const v = verdict({ code, resultat })
  if (resultat) console.log(JSON.stringify(resultat, null, 2))
  else console.error(`sortie d'Electron (fin) :\n${(sortie + erreurs).split(/\r?\n/).slice(-30).join('\n')}`)
  const duree = Math.round((Date.now() - t0) / 1000)
  console.log(v.ok ? `FUMÉE VERTE (${duree} s)` : `FUMÉE ROUGE (${duree} s${tue ? ', Electron tué au délai de garde' : ''}) : ${v.raisons.join(' ; ')}`)
  return v.code
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), err => { console.error(err); process.exit(2) })
}
