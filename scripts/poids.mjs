// Poids des cinématiques au téléchargement (spec des cinématiques, docs/superpowers/specs/2026-10-02-cinematiques-design.md
// §8 : « moins de 1,5 Mo au total ») : images de public/briefing/img plus morceaux des scènes dans dist/assets et, avec
// --avec-enquete, morceau de l'enquête. Décision D1 des cinématiques v2 (recommandation appliquée tant que Rayan n'a pas
// tranché autrement) : l'enquête compte ; la vérification de fin est donc `--check --avec-enquete`.
// Prérequis : npx vite build. Usage (racine du dépôt) : node scripts/poids.mjs [--check] [--avec-enquete]
//   --check         code de sortie 1 au-delà du seuil de 1 500 000 octets
//   --avec-enquete  compte aussi le morceau de l'enquête (src/prologue/investigation.js, chargé à la demande)
// Sortie : le rapport en JSON (total, seuil, marge, ok, parGroupe, avecEnquete, fichiers) ; une ligne de résumé sur la
// sortie d'erreur. Options et seuil gelés : la tâche E0 du lot 5 étendra ce script (build en mémoire, JS de démarrage,
// scripts/budgets.js) en les gardant, avec sommePoids et son test (tests/scripts/poids.test.js).
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SCENES } from './port-maquette.mjs'

export const SEUIL = 1500000
// Module de l'enquête, chargé à la demande par src/main.js : import('./prologue/investigation.js').
export const ENQUETE = 'investigation'

// Partie pure : fichiers [{ nom, octets, groupe }] → { total, seuil, marge, ok, parGroupe }. Le seuil est permis.
export function sommePoids(fichiers, { seuil = SEUIL } = {}) {
  const parGroupe = {}
  let total = 0
  for (const { octets, groupe = 'autre' } of fichiers) {
    total += octets
    parGroupe[groupe] = (parGroupe[groupe] || 0) + octets
  }
  return { total, seuil, marge: seuil - total, ok: total <= seuil, parGroupe }
}

const echapper = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Fichiers de dist/assets d'un module chargé à la demande : Vite les nomme [nom]-[empreinte de 8 caractères].js (plus
// un .css du même nom s'il importait une feuille de style). Exactement un .js, sinon une erreur qui nomme le module :
// une somme fausse ne doit jamais passer en silence (morceau absent, ou deux modules du même nom).
function fichiersDuModule(noms, module) {
  const motif = new RegExp(`^${echapper(module)}-[A-Za-z0-9_-]{8}\\.(?:js|css)$`)
  const trouves = noms.filter(n => motif.test(n)).sort()
  const js = trouves.filter(n => n.endsWith('.js'))
  if (js.length === 0) throw new Error(`morceau de « ${module} » introuvable dans dist/assets (build périmé ou absent ?)`)
  if (js.length > 1) throw new Error(`morceau de « ${module} » en double dans dist/assets : ${js.join(', ')}`)
  return [...js, ...trouves.filter(n => n.endsWith('.css'))]
}

// Partie pure : noms des fichiers de dist/assets → [{ nom, groupe }] des scènes (ids de SCENES), puis de l'enquête.
export function choisirMorceaux(noms, { ids = Object.keys(SCENES), avecEnquete = false } = {}) {
  const choisis = ids.flatMap(id => fichiersDuModule(noms, id).map(nom => ({ nom, groupe: 'scenes' })))
  if (avecEnquete) choisis.push(...fichiersDuModule(noms, ENQUETE).map(nom => ({ nom, groupe: 'enquete' })))
  return choisis
}

// Fichiers mesurés dans le dépôt `racine` : [{ nom, octets, groupe }].
export function fichiersCinematiques(racine, { avecEnquete = false } = {}) {
  const img = join(racine, 'public', 'briefing', 'img')
  const assets = join(racine, 'dist', 'assets')
  if (!existsSync(assets)) throw new Error('dist/assets introuvable : lancer d\'abord npx vite build')
  const images = readdirSync(img, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name).sort()
    .map(nom => ({ nom: `public/briefing/img/${nom}`, octets: statSync(join(img, nom)).size, groupe: 'images' }))
  const morceaux = choisirMorceaux(readdirSync(assets), { avecEnquete })
    .map(({ nom, groupe }) => ({ nom: `dist/assets/${nom}`, octets: statSync(join(assets, nom)).size, groupe }))
  return [...images, ...morceaux]
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const inconnues = args.filter(a => a !== '--check' && a !== '--avec-enquete')
  if (inconnues.length) {
    console.error(`option inconnue : ${inconnues.join(' ')}\nUsage : node scripts/poids.mjs [--check] [--avec-enquete]`)
    process.exit(2)
  }
  const avecEnquete = args.includes('--avec-enquete')
  let rapport
  try {
    const fichiers = fichiersCinematiques(join(dirname(fileURLToPath(import.meta.url)), '..'), { avecEnquete })
    rapport = { ...sommePoids(fichiers), avecEnquete, fichiers }
  } catch (e) {
    console.error(`poids : ${e.message}`)
    process.exit(1)
  }
  console.log(JSON.stringify(rapport, null, 2))
  const o = n => n.toLocaleString('fr-FR') + ' o'
  console.error(`cinématiques ${avecEnquete ? 'avec' : 'sans'} l'enquête : ${o(rapport.total)} pour un seuil de ${o(rapport.seuil)}`
    + ` (${rapport.ok ? 'marge ' + o(rapport.marge) : 'dépassé de ' + o(-rapport.marge)})`)
  if (args.includes('--check') && !rapport.ok) process.exit(1)
}
