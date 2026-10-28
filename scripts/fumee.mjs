// Fumée du livrable Electron, hors ligne et sans fenêtre visible (spec du lot 5 §3.2 et §8 critère 12 ; plan, tâche
// E1) : lance le jeu construit en mode --fumee (electron/main.js joue le scénario dans la page), lit la ligne
// « [fumee] {json} » de sa sortie et rend le verdict.
// Usage : node scripts/fumee.mjs [--exe=release/win-unpacked/Sniper.exe], par le verrou Chrome sur la machine partagée
//   sans --exe : « electron . --fumee » avec l'Electron de node_modules, sur dist/ (prérequis : npx vite build)
//   --exe=…    : l'exécutable empaqueté (tâche E2, prérequis : npm run dist), lancé avec --fumee
// Refus avant tout lancement (code 2, aucun profil créé) : argument autre que --exe=<chemin non vide>, dist/index.html
// absent, paquet sans mode --fumee (la chaîne absente de son code : construit avant E1), build périmé (un fichier dont
// il est fait plus récent que lui), exécutable introuvable.
// Sortie : le build vérifié (date, commit, état de la copie), le JSON du scénario ({ echecs, requetesBloquees, modeles,
// images, sauvegarde, … }), puis le verdict ; code 0 (vert), 1 (rouge), 2 (refus, ou aucun résultat : Electron arrêté
// avant d'écrire, sans « [fumee] debut » au bout de 30 s, ou tué au délai de garde), 130 (interrompu). Profil jetable
// vide, supprimé à la fin ou sur interruption ; Electron et ses processus fils arrêtés au délai de garde ou sur
// interruption. Aucune fenêtre, aucun port de débogage, aucun téléchargement (binaire Electron absent : le script le dit
// et s'arrête).
// Machine partagée : un seul Electron ou Chrome sans interface à la fois (verrou Chrome des chantiers parallèles).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MARQUE = '[fumee] '
const LIGNE_DEBUT = '[fumee] debut'           // écrite par electron/main.js dès son départ en mode --fumee
const DELAI_DEBUT_MS = 30 * 1000              // sans elle au-delà : l'exécutable ignore --fumee
const DELAI_GARDE_MS = 5 * 60 * 1000          // au-delà du délai du processus principal (3 min) : Electron bloqué
const SIGNAUX = ['SIGINT', 'SIGTERM', 'SIGBREAK']
const USAGE = 'usage : node scripts/fumee.mjs [--exe=<exécutable empaqueté, par exemple release/win-unpacked/Sniper.exe>]'
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

// Arguments : rien, ou un seul --exe=<chemin non vide>. Tout autre argument est refusé : un « --exe chemin » (espace)
// ignoré ferait vérifier dist/ à la place du jeu empaqueté.
export function lireArguments(argv) {
  let exe = null
  for (const a of argv) {
    const chemin = a.startsWith('--exe=') ? a.slice('--exe='.length) : ''
    if (!chemin || exe !== null) return { erreur: `argument refusé : « ${a} » (${USAGE})` }
    exe = chemin
  }
  return { exe }
}

// Résultat écrit par electron/main.js : la dernière ligne « [fumee] {json} » de la sortie, au milieu des messages de
// Chromium (« [fumee] debut » n'en est pas un). Aucune ligne, ou une ligne tronquée (processus tué pendant
// l'écriture) : null.
export function lireResultat(sortie) {
  const lignes = String(sortie).split(/\r?\n/).filter(l => l.startsWith(MARQUE) && l !== LIGNE_DEBUT)
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

// Binaire Electron installé dans node_modules (path.txt, puis dist/), lu sans require('electron') : dans Electron 42, ce
// require télécharge le binaire s'il manque (environ 100 Mo). Absent : une erreur qui dit comment l'installer.
export function binaireElectron(racine) {
  const dossier = join(racine, 'node_modules', 'electron')
  const nom = existsSync(join(dossier, 'path.txt')) ? readFileSync(join(dossier, 'path.txt'), 'utf8').trim() : ''
  const chemin = nom ? join(dossier, 'dist', nom) : null
  if (!chemin || !existsSync(chemin)) {
    throw new Error('binaire Electron absent de node_modules : « node node_modules/electron/install.js » (environ 100 Mo, gratuit) avant la fumée')
  }
  return chemin
}

// Commande lancée : l'Electron de node_modules sur le dossier du jeu, ou l'exécutable empaqueté ; toujours en --fumee,
// avec le profil jetable que ce script crée puis supprime. electron() rend le chemin du binaire de node_modules : appelé
// seulement sans --exe (le jeu empaqueté se vérifie même dans une copie installée sans ce binaire).
export function commandeFumee({ racine, exe = null, profil, electron }) {
  return exe
    ? { commande: resolve(racine, exe), args: ['--fumee', `--profil=${profil}`] }
    : { commande: electron(), args: [racine, '--fumee', `--profil=${profil}`] }
}

// Avec --exe : le code du jeu empaqueté, à côté de l'exécutable (resources/app.asar, qui garde les .js en clair, ou
// resources/app/ sans asar). Sans la chaîne --fumee, c'est un paquet d'avant ce mode (release/ est ignoré par git, rien
// ne le lie au commit) : lancé, il ignorerait --fumee et --profil et ouvrirait le jeu normal, fenêtre visible, sur le
// profil du joueur. reference : ce qui date le paquet.
export function codeEmpaquete(exe) {
  const resources = join(dirname(exe), 'resources')
  const asar = join(resources, 'app.asar')
  const code = existsSync(asar) ? asar : join(resources, 'app', 'electron', 'main.js')
  if (!existsSync(code)) return { erreur: `exécutable sans mode --fumee : relancer npm run dist (introuvable : ${code})` }
  if (!readFileSync(code).includes('--fumee')) return { erreur: `exécutable sans mode --fumee : relancer npm run dist (« --fumee » absent de ${code})` }
  return { reference: code === asar ? asar : join(resources, 'app') }
}

// Fichiers dont le build est fait : src/, public/, index.html, vite.config.js ; avec --exe, electron/ aussi (le
// processus principal est dans le paquet). Chemins relatifs à la racine, en « / », et dates de modification (ms).
export function fichiersDuBuild(racine, { exe = null } = {}) {
  return ['src', 'public', 'index.html', 'vite.config.js', ...(exe ? ['electron'] : [])].flatMap(entree => {
    const chemin = join(racine, entree)
    if (!existsSync(chemin)) return []
    const tous = statSync(chemin).isDirectory() ? readdirSync(chemin, { recursive: true }).map(f => join(chemin, f)) : [chemin]
    return tous.map(f => ({ f, s: statSync(f) })).filter(({ s }) => s.isFile())
      .map(({ f, s }) => ({ chemin: relative(racine, f).split(sep).join('/'), date: s.mtimeMs }))
  })
}

// Pur : les fichiers plus récents que la référence du build (ils n'y sont pas), du plus récent au plus ancien.
export function plusRecents(dateReference, fichiers) {
  return fichiers.filter(f => f.date > dateReference).sort((a, b) => b.date - a.date)
}

// Ce que la fumée vérifie, imprimé avant le verdict : la date du build (dist/index.html, ou le paquet avec --exe), le
// commit et le nombre de lignes de git status --porcelain (0 : copie propre). git(racine, args) rend sa sortie, ou null.
export function identiteBuild({ racine, git }, reference) {
  const deux = n => String(n).padStart(2, '0')
  const d = new Date(statSync(reference).mtimeMs)
  const date = `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()} ${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}`
  const commit = git(racine, ['rev-parse', '--short', 'HEAD'])
  const etat = git(racine, ['status', '--porcelain'])
  const n = etat === null ? null : etat.split(/\r?\n/).filter(Boolean).length
  const copie = commit === null || n === null ? 'commit inconnu (pas de dépôt git lisible)' : `commit ${commit.trim()}, ${n} ligne${n > 1 ? 's' : ''} dans git status --porcelain`
  return `build vérifié : ${relative(racine, reference).split(sep).join('/')} du ${date} ; ${copie}`
}

// Profil jetable supprimé : 20 essais espacés de 300 ms, Chromium pouvant tenir un fichier un instant après sa sortie.
// Rend false si le dossier est resté.
export function supprimerProfil(profil, { supprimer, attendre }) {
  for (let i = 0; i < 20; i++) {
    try { supprimer(profil); break } catch { attendre(300) }
  }
  return !existsSync(profil)
}
const profilRestant = profil => `profil jetable non supprimé : ${profil} (à supprimer à la main ; le verdict du jeu n'en dépend pas)`

// Interruption (Ctrl+C, Ctrl+Pause, arrêt demandé) une fois Electron lancé : son arbre arrêté (taskkill /T), le profil
// supprimé, sortie 130. Tout est synchrone : rien ne s'intercale avant la sortie. Rend la fonction qui retire ces
// gestionnaires (fin normale).
export function surveillerInterruptions({ processus, pid, profil, tuer, supprimer, attendre }) {
  let pris = false
  const interrompre = () => {
    if (pris) return
    pris = true
    if (pid) tuer(pid)
    if (!supprimerProfil(profil, { supprimer, attendre })) console.error(profilRestant(profil))
    processus.exit(130)
  }
  for (const s of SIGNAUX) processus.on(s, interrompre)
  return () => { for (const s of SIGNAUX) processus.removeListener(s, interrompre) }
}

// Outils du système, remplacés par les tests (aucun processus lancé)
const OUTILS = {
  lancer: (commande, args, options) => spawn(commande, args, options),
  tuer: pid => spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true }),
  git: (racine, args) => {
    const r = spawnSync('git', args, { cwd: racine, encoding: 'utf8', windowsHide: true })
    return r.status === 0 ? r.stdout : null
  },
  supprimer: chemin => rmSync(chemin, { recursive: true, force: true }),
  attendre: ms => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) },
}

export async function main(argv, outils = {}) {
  const o = { racine: RACINE, temp: tmpdir(), processus: process, ...OUTILS, ...outils }
  const args = lireArguments(argv)
  if (args.erreur) { console.error(args.erreur); return 2 }
  const exe = args.exe && resolve(o.racine, args.exe)
  const build = exe ? codeEmpaquete(exe) : { reference: join(o.racine, 'dist', 'index.html') }
  if (build.erreur) { console.error(build.erreur); return 2 }
  if (!existsSync(build.reference)) {
    console.error('dist/index.html introuvable : lancer « npx vite build » avant la fumée')
    return 2
  }
  console.log(identiteBuild(o, build.reference))
  const perimes = plusRecents(statSync(build.reference).mtimeMs, fichiersDuBuild(o.racine, { exe }))
  if (perimes.length) {
    const liste = perimes.slice(0, 5).map(f => f.chemin).join(', ') + (perimes.length > 5 ? `, … (${perimes.length} en tout)` : '')
    console.error(`build périmé : relancer ${exe ? 'npm run dist' : 'npx vite build'} (plus récents que lui : ${liste})`)
    return 2
  }
  if (exe && !existsSync(exe)) { console.error(`exécutable introuvable : ${exe}`); return 2 }
  // Profil jetable vide, supprimé à la fin, lancement impossible compris, ou sur interruption (pas si node est tué de
  // force : console fermée, taskkill sur node)
  const profil = mkdtempSync(join(o.temp, 'sniper-fumee-'))
  const t0 = Date.now()
  let code = null, sortie = '', erreurs = '', tue = null, retirer = () => {}
  try {
    const { commande, args: argsElectron } = commandeFumee({ racine: o.racine, exe, profil, electron: () => binaireElectron(o.racine) })
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE   // sinon electron.exe se comporte comme node
    console.log(`fumée : ${exe ? args.exe : 'electron .'} --fumee (fenêtre cachée, réseau bloqué, profil jetable)`)
    const proc = o.lancer(commande, argsElectron, { cwd: o.racine, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    retirer = surveillerInterruptions({ processus: o.processus, pid: proc.pid, profil, tuer: o.tuer, supprimer: o.supprimer, attendre: o.attendre })
    // Electron et tous ses processus fils arrêtés : sans « [fumee] debut » au bout de 30 s, ou au délai de garde
    const arreter = raison => { if (!tue) { tue = raison; o.tuer(proc.pid) } }
    const debut = setTimeout(() => arreter('debut'), DELAI_DEBUT_MS)
    const garde = setTimeout(() => arreter('garde'), DELAI_GARDE_MS)
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', d => { sortie += d; if (sortie.includes(LIGNE_DEBUT)) clearTimeout(debut) })
    proc.stderr.on('data', d => { erreurs += d })
    code = await new Promise(r => { proc.once('exit', c => r(c)); proc.once('error', e => { erreurs += String(e); r(null) }) })
    clearTimeout(debut)
    clearTimeout(garde)
  } catch (e) {
    console.error(`fumée impossible : ${e.message}`)
    return 2
  } finally {
    if (!supprimerProfil(profil, o)) console.error(profilRestant(profil))
    retirer()
  }
  const duree = Math.round((Date.now() - t0) / 1000)
  if (tue === 'debut') {
    console.error(`aucune ligne « ${LIGNE_DEBUT} » au bout de ${DELAI_DEBUT_MS / 1000} s : ${exe ? `${args.exe} ne connaît pas le mode --fumee (relancer npm run dist)` : 'electron/main.js ne connaît pas le mode --fumee'} ; arrêté avec ses processus fils`)
    console.log(`FUMÉE ROUGE (${duree} s) : aucun résultat`)
    return 2
  }
  const resultat = lireResultat(sortie)
  const v = verdict({ code, resultat })
  if (resultat) console.log(JSON.stringify(resultat, null, 2))
  else console.error(`sortie d'Electron (fin) :\n${(sortie + erreurs).split(/\r?\n/).slice(-30).join('\n')}`)
  console.log(v.ok ? `FUMÉE VERTE (${duree} s)` : `FUMÉE ROUGE (${duree} s${tue === 'garde' ? ', Electron tué au délai de garde' : ''}) : ${v.raisons.join(' ; ')}`)
  return v.code
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), err => { console.error(err); process.exit(2) })
}
