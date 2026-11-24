// Fumée du livrable Electron, hors ligne et sans fenêtre visible (spec du lot 5 §3.2 et §8 critère 12 ; plan, tâche
// E1) : lance le jeu construit en mode --fumee (electron/main.js joue le scénario dans la page), lit la ligne
// « [fumee] {json} » de sa sortie et rend le verdict.
// Usage : node scripts/fumee.mjs [--exe=release/win-unpacked/Sniper.exe], par le verrou Chrome sur la machine partagée
//   sans --exe : « electron . --fumee » avec l'Electron de node_modules, sur dist/ (prérequis : npx vite build)
//   --exe=…    : l'exécutable empaqueté (tâche E2, prérequis : npm run dist), lancé avec --fumee
// Refus avant tout lancement (code 2, aucun profil créé), dans cet ordre : argument autre qu'un seul --exe=<chemin non
// vide>, exécutable introuvable, paquet sans mode --fumee (la chaîne absente de son code : construit avant E1),
// dist/index.html absent, build périmé (un fichier ou un dossier dont il est fait plus récent que lui).
// Sortie : le build vérifié (date, commit, nombre de lignes de git status --porcelain), une fois ces refus passés, le
// JSON du scénario ({ echecs, requetesBloquees, modeles, images, sauvegarde, … }, lu à la fermeture des flux
// d'Electron), puis le verdict ; code 0 (vert), 1 (rouge), 2 (refus, ou aucun résultat : Electron arrêté avant
// d'écrire, sans « [fumee] debut » au bout de 30 s, tué au délai de garde, ou toujours là 10 s après et plus attendu),
// 130 (interrompu). Profil jetable vide, supprimé à la fin ou sur interruption ; Electron et ses processus fils arrêtés
// au délai de garde (de nouveau si l'arrêt à 30 s est resté sans effet) ou sur interruption.
// Aucune fenêtre, aucun port de débogage, aucun téléchargement (binaire Electron absent : le script le dit et s'arrête).
// Machine partagée : un seul Electron ou Chrome sans interface à la fois (verrou Chrome des chantiers parallèles).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MARQUE = '[fumee] '
const LIGNE_DEBUT = '[fumee] debut'           // écrite par electron/main.js dès son départ en mode --fumee
const DELAI_DEBUT_MS = 30 * 1000              // sans elle au-delà : Electron bloqué au lancement (ou paquet trop ancien)
const DELAI_GARDE_MS = 5 * 60 * 1000          // au-delà du délai du processus principal (3 min) : Electron bloqué
const DELAI_FLUX_MS = 2000                    // après la sortie d'Electron, attente de la fermeture de ses flux
const DELAI_ARRET_MS = 10 * 1000              // après l'arrêt au délai de garde : Electron toujours là, plus attendu
// Ctrl+C, Ctrl+Pause, console fermée ; SIGTERM n'arrive que sous POSIX (Windows ne le délivre jamais à node)
const SIGNAUX = ['SIGINT', 'SIGBREAK', 'SIGHUP', 'SIGTERM']
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

// Ce dont le build est fait, fichiers et dossiers : src/ et public/ entiers, index.html, vite.config.js, package.json
// et package-lock.json (versions des dépendances, three compris) ; avec --exe, electron/ aussi (le processus principal
// est dans le paquet). Un dossier compte par sa propre date, qui change quand une entrée y est ajoutée, retirée ou
// renommée : une suppression, un déplacement ou une copie qui garde sa date n'y laissent aucun fichier plus récent.
// Chemins relatifs à la racine, en « / » (« / » final pour un dossier), et dates de modification (ms).
export function fichiersDuBuild(racine, { exe = null } = {}) {
  const entrees = ['src', 'public', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json', ...(exe ? ['electron'] : [])]
  return entrees.flatMap(entree => {
    const chemin = join(racine, entree)
    if (!existsSync(chemin)) return []
    const tous = statSync(chemin).isDirectory() ? [chemin, ...readdirSync(chemin, { recursive: true }).map(f => join(chemin, f))] : [chemin]
    return tous.map(f => ({ f, s: statSync(f) })).filter(({ s }) => s.isFile() || s.isDirectory())
      .map(({ f, s }) => ({ chemin: relative(racine, f).split(sep).join('/') + (s.isDirectory() ? '/' : ''), date: s.mtimeMs }))
  })
}

// Pur : les entrées (fichiers et dossiers) plus récentes que la référence du build, du plus récent au plus ancien.
export function plusRecents(dateReference, fichiers) {
  return fichiers.filter(f => f.date > dateReference).sort((a, b) => b.date - a.date)
}

// Ce que la fumée vérifie, imprimé une fois les refus passés : la date du build (dist/index.html, ou le paquet avec
// --exe), le commit et le nombre de lignes de git status --porcelain (0 : copie propre). git(racine, args) rend sa
// sortie, ou null.
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

// Interruption dans la console une fois Electron lancé : Ctrl+C (SIGINT), Ctrl+Pause (SIGBREAK), console fermée
// (SIGHUP : Windows laisse quelques secondes avant d'arrêter node) ; SIGTERM sous POSIX seulement (sous Windows, un
// arrêt demandé par un autre processus tue node sans passer par ici). L'arbre d'Electron arrêté d'abord (Chromium tient
// les fichiers du profil tant qu'il tourne), puis le profil supprimé, sortie 130. Tout est synchrone : rien ne
// s'intercale avant la sortie. Rend la fonction qui retire ces gestionnaires (fin normale).
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

// Electron et tous ses processus fils (Chromium en lance plusieurs) : taskkill /F (forcé) /T (l'arbre), sans fenêtre de
// console. lancerSync : spawnSync, remplacé par les tests. Un statut non nul, ou taskkill introuvable, est dit sur la
// sortie d'erreur.
export function tuerArbre(pid, lancerSync = spawnSync) {
  const r = lancerSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore', windowsHide: true })
  if (r && r.status !== 0) console.error(`taskkill /F /T /PID ${pid} : ${r.error ? r.error.message : `statut ${r.status}`} (l'arbre d'Electron n'est peut-être pas arrêté)`)
  return r
}
const estFichier = chemin => { try { return statSync(chemin).isFile() } catch { return false } }

// Outils du système, remplacés par les tests (aucun processus lancé). tuer, sauf s'il est remplacé : tuerArbre avec
// lancerSync (main), que les tests remplacent seul pour voir ce branchement sans lancer taskkill.
const OUTILS = {
  lancer: (commande, args, options) => spawn(commande, args, options),
  lancerSync: spawnSync,
  git: (racine, args) => {
    const r = spawnSync('git', args, { cwd: racine, encoding: 'utf8', windowsHide: true })
    return r.status === 0 ? r.stdout : null
  },
  supprimer: chemin => rmSync(chemin, { recursive: true, force: true }),
  attendre: ms => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) },
}

export async function main(argv, outils = {}) {
  const o = { racine: RACINE, temp: tmpdir(), processus: process, tuer: pid => tuerArbre(pid, o.lancerSync), ...OUTILS, ...outils }
  const args = lireArguments(argv)
  if (args.erreur) { console.error(args.erreur); return 2 }
  const exe = args.exe && resolve(o.racine, args.exe)
  // L'exécutable d'abord : un chemin mal tapé (ou un dossier) n'est pas un paquet à reconstruire
  if (exe && !estFichier(exe)) { console.error(`exécutable introuvable : ${exe}`); return 2 }
  const build = exe ? codeEmpaquete(exe) : { reference: join(o.racine, 'dist', 'index.html') }
  if (build.erreur) { console.error(build.erreur); return 2 }
  if (!existsSync(build.reference)) {
    console.error('dist/index.html introuvable : lancer « npx vite build » avant la fumée')
    return 2
  }
  const perimes = plusRecents(statSync(build.reference).mtimeMs, fichiersDuBuild(o.racine, { exe }))
  if (perimes.length) {
    const vus = perimes.slice(0, 5)
    const liste = vus.map(f => f.chemin).join(', ') + (perimes.length > 5 ? `, … (${perimes.length} en tout)` : '')
    const dossier = vus.some(f => f.chemin.endsWith('/')) ? ' ; dossier plus récent : une entrée y a été ajoutée, retirée ou renommée' : ''
    console.error(`build périmé : relancer ${exe ? 'npm run dist' : 'npx vite build'} (plus récents que lui : ${liste})${dossier}`)
    return 2
  }
  console.log(identiteBuild(o, build.reference))   // tous les refus passés : c'est ce build-là que la fumée vérifie
  // Profil jetable vide, supprimé à la fin, lancement impossible compris, ou sur interruption (pas si node est tué de
  // force : taskkill ou process.kill sur node, outil qui coupe la commande)
  const profil = mkdtempSync(join(o.temp, 'sniper-fumee-'))
  const t0 = Date.now()
  let code = null, sortie = '', erreurs = '', tue = null, sorti = false, abandon = false, retirer = () => {}
  try {
    const { commande, args: argsElectron } = commandeFumee({ racine: o.racine, exe, profil, electron: () => binaireElectron(o.racine) })
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE   // sinon electron.exe se comporte comme node
    console.log(`fumée : ${exe ? args.exe : 'electron .'} --fumee (fenêtre cachée, réseau bloqué, profil jetable)`)
    const proc = o.lancer(commande, argsElectron, { cwd: o.racine, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    // Electron et tous ses processus fils arrêtés (sur interruption, sans « [fumee] debut » au bout de 30 s, ou au délai
    // de garde), jamais après sa sortie : son PID a pu être repris par un autre processus
    const tuer = pid => { if (!sorti) o.tuer(pid) }
    retirer = surveillerInterruptions({ processus: o.processus, pid: proc.pid, profil, tuer, supprimer: o.supprimer, attendre: o.attendre })
    // tue : la première raison. Le délai de garde arrête l'arbre même si le délai de 30 s l'a déjà fait (un taskkill sans
    // effet n'est pas le dernier) ; Electron toujours là DELAI_ARRET_MS après n'est plus attendu : le script finit (code
    // 2) et rend le verrou Chrome au lieu d'attendre sans fin
    const arreter = raison => { tue = tue || raison; tuer(proc.pid) }
    let finAttente = () => {}, apresArret = null
    const debut = setTimeout(() => arreter('debut'), DELAI_DEBUT_MS)
    const garde = setTimeout(() => {
      arreter('garde')
      apresArret = setTimeout(() => {
        abandon = true
        console.error(`Electron toujours là ${DELAI_ARRET_MS / 1000} s après son arrêt au délai de garde : plus attendu ; vérifier tasklist et l'arrêter à la main (taskkill /F /T /PID ${proc.pid})`)
        finAttente(null)
      }, DELAI_ARRET_MS)
    }, DELAI_GARDE_MS)
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', d => { sortie += d; if (sortie.includes(LIGNE_DEBUT)) clearTimeout(debut) })
    proc.stderr.on('data', d => { erreurs += d })
    // Code de sortie lu à « exit », résultat à « close » : à « exit », les flux d'Electron peuvent encore retenir la
    // ligne de résultat. DELAI_FLUX_MS au plus, un processus fils de Chromium pouvant garder le tube ouvert.
    code = await new Promise(r => {
      finAttente = r
      let codeSortie = null, borne = null
      proc.once('exit', c => {
        sorti = true
        clearTimeout(debut)
        clearTimeout(garde)
        clearTimeout(apresArret)
        codeSortie = c
        borne = setTimeout(() => r(c), DELAI_FLUX_MS)
      })
      proc.once('close', () => { clearTimeout(borne); r(codeSortie) })
      proc.once('error', e => { erreurs += String(e); r(null) })
    })
    clearTimeout(debut)
    clearTimeout(garde)
    clearTimeout(apresArret)
  } catch (e) {
    console.error(`fumée impossible : ${e.message}`)
    return 2
  } finally {
    if (!supprimerProfil(profil, o)) console.error(profilRestant(profil))
    retirer()
  }
  const duree = Math.round((Date.now() - t0) / 1000)
  if (abandon) {
    const sansDebut = tue === 'debut' ? ` (aucune ligne « ${LIGNE_DEBUT} » au bout de ${DELAI_DEBUT_MS / 1000} s)` : ''
    console.log(`FUMÉE ROUGE (${duree} s) : Electron toujours là après son arrêt au délai de garde${sansDebut}`)
    return 2
  }
  if (tue === 'debut') {
    // Le main.js du dépôt écrit cette ligne dès son départ (tests/electron.fumee.test.js) ; un paquet peut être plus ancien
    const cause = exe ? `${args.exe} n'a pas démarré la fumée (bloqué au lancement, ou paquet trop ancien : relancer npm run dist)`
      : 'Electron n\'a pas démarré la fumée (bloqué au lancement ?)'
    console.error(`aucune ligne « ${LIGNE_DEBUT} » au bout de ${DELAI_DEBUT_MS / 1000} s : ${cause} ; arrêté avec ses processus fils`)
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
