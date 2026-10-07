// Mesure mémoire du jeu dans Chrome sans interface (spec du lot 1 §4.1 et §6) : ouvre la route de développement
// ?memtest=1, attend la fin de la partie scriptée, lit le JSON du <pre id="memtest"> dans la sortie de --dump-dom,
// l'écrit dans shots/memtest-<horodatage>.json et, sur demande, l'inscrit dans les annexes ou applique les seuils.
// Prérequis : npm run dev (port 5173, réutilisé tel quel).
// Usage : node scripts/memtest.mjs [--reference] [--annexe=<nom>.json] [--check] [--images=3] [--qualite=bas]
//   --reference   copie le résultat dans docs/superpowers/specs/annexes/2026-10-07-memtest-reference.json
//   --annexe=nom  copie le résultat dans docs/superpowers/specs/annexes/<nom>
//   --check       applique les seuils du §6 ; code de sortie 1 si l'un d'eux est dépassé
// Variables : CHROME (chemin de Chrome), BASE_URL (défaut http://localhost:5173/), BUDGET_MS (temps virtuel,
// défaut 1 200 000).
// Rendu SwiftShader : les durées n'y valent rien, seuls les compteurs (géométries, textures, programmes, appels,
// triangles) servent de critère. Profil jetable, aucun port de débogage (--dump-dom seulement).
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const REFERENCE = '2026-10-07-memtest-reference.json'

const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&')

// Sortie de --dump-dom → { title, qualite, etapes }. Sans <pre id="memtest"> : aucune étape.
export function parseDump(html) {
  const title = unescape((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim()
  const pre = html.match(/<pre id="memtest"([^>]*)>([\s\S]*?)<\/pre>/)
  if (!pre) return { title, qualite: '', etapes: [] }
  const qualite = unescape((pre[1].match(/data-qualite="([^"]*)"/) || [])[1] || '')
  const text = unescape(pre[2]).trim()
  return { title, qualite, etapes: text ? JSON.parse(text) : [] }
}

// Seuils du §6 de la spec (Chrome réel). Chaque critère : { critere, ok, detail }. Une étape absente ou en erreur fait
// échouer les critères qui en dépendent : jamais de succès par défaut.
const KEYS = ['geometries', 'textures', 'programmes']
export function checkMemtest(entries, { qualite } = {}) {
  const get = name => entries.find(e => e.etape === name && !e.erreur)
  const same = (a, b) => KEYS.every(k => a[k] === b[k])
  const show = e => e ? `${e.etape} : ${KEYS.map(k => `${k} ${e[k]}`).join(', ')}` : 'absente'
  const out = []

  const erreur = entries.find(e => e.erreur)
  out.push({ critere: 'mesure complète', ok: !erreur, detail: erreur ? `${erreur.etape} : ${erreur.erreur}` : `${entries.length} étapes` })

  const menu = get('menu'), retour = get('menu-campagne')
  out.push({
    critere: 'partie complète',
    ok: !!(menu && retour && retour.geometries * 100 <= menu.geometries * 102 && retour.textures <= menu.textures + 2),
    detail: `géométries ≤ menu + 2 %, textures ≤ menu + 2 ; ${show(menu)} ; ${show(retour)}`,
  })

  const m6 = entries.filter(e => /^M\d+-\d+$/.test(e.etape))
  const m6ref = get(m6[1]?.etape)
  const m6rest = m6.slice(1).map(e => get(e.etape))
  out.push({
    critere: '10 montages de M6',
    ok: m6.length >= 10 && !!m6ref && m6rest.every(e => e && same(e, m6ref)),
    detail: `Δ = 0 du 2e au dernier ; ${show(m6ref)} ; ${show(m6rest.at(-1))}`,
  })

  const pvp = entries.filter(e => /^pvp-\d+$/.test(e.etape))
  const pvp1 = get('pvp-1')
  out.push({
    critere: 'PvP',
    ok: pvp.length >= 5 && !!pvp1 && pvp.every(e => get(e.etape) && same(get(e.etape), pvp1)),
    detail: `Δ = 0 après la 1re arène ; ${show(pvp1)} ; ${show(pvp.at(-1))}`,
  })

  const q = qualite || 'moyen'
  const limit = q === 'bas' ? 0.8e6 : q === 'haut' ? Infinity : 1.5e6
  const tri = get('M6')
  out.push({
    critere: 'triangles de M6',
    ok: !!tri && tri.triangles <= limit,
    detail: `${tri ? tri.triangles : 'absente'} ≤ ${limit === Infinity ? 'sans seuil en Haut' : limit} (qualité ${q})`,
  })
  return out
}

// ─── Ligne de commande ────────────────────────────────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Chrome sans interface, profil jetable, rendu logiciel, --dump-dom : la page est sérialisée quand le budget de temps
// virtuel est épuisé (les téléchargements le suspendent, la mesure elle-même n'en consomme presque pas).
async function dumpMemtest(url) {
  const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const profile = mkdtempSync(join(tmpdir(), 'memtest-'))
  const args = ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--mute-audio',
    '--js-flags=--expose-gc', '--enable-precise-memory-info', `--user-data-dir=${profile}`, '--window-size=1280,720',
    `--virtual-time-budget=${+process.env.BUDGET_MS || 1200000}`, '--dump-dom', url]
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'ignore'] })
  let out = ''
  proc.stdout.setEncoding('utf8')
  proc.stdout.on('data', d => { out += d })
  const t0 = Date.now()
  // Garde-fou en temps réel : Chrome et ses processus fils sont arrêtés au bout de 20 minutes.
  const guard = setTimeout(() => spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' }), 20 * 60 * 1000)
  const code = await new Promise(r => proc.once('exit', r))
  clearTimeout(guard)
  for (let i = 0; i < 20; i++) {
    try { rmSync(profile, { recursive: true, force: true }); break } catch { await sleep(300) }
  }
  return { html: out, code, secondes: Math.round((Date.now() - t0) / 1000) }
}

function gitState(repo) {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repo, encoding: 'utf8' }).trim()
    return dirty ? head + ' (modifié)' : head
  } catch { return null }
}

async function main(argv) {
  const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
  const opt = name => { const a = argv.find(x => x === '--' + name || x.startsWith(`--${name}=`)); return a === undefined ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true }
  const images = +opt('images') || 3
  const qualite = typeof opt('qualite') === 'string' ? opt('qualite') : ''
  const base = process.env.BASE_URL || 'http://localhost:5173/'
  const url = `${base}?memtest=1&images=${images}${qualite ? '&qualite=' + encodeURIComponent(qualite) : ''}`

  console.log(`memtest : ${url} (Chrome sans interface, SwiftShader)`)
  const { html, code, secondes } = await dumpMemtest(url)
  const dump = parseDump(html)
  const result = {
    date: new Date().toISOString(), commit: gitState(repo), url, rendu: 'SwiftShader (Chrome sans interface)',
    images, qualite: dump.qualite || qualite || null, duree_s: secondes, etat: dump.title, etapes: dump.etapes,
  }
  mkdirSync(join(repo, 'shots'), { recursive: true })
  const stamp = result.date.replace(/[:.]/g, '-').slice(0, 19)
  const file = resolve(repo, 'shots', `memtest-${stamp}.json`)
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n')

  console.log('étape'.padEnd(15), 'géom.'.padStart(7), 'text.'.padStart(7), 'prog.'.padStart(6), 'appels'.padStart(7), 'triangles'.padStart(10), 'tas Mo'.padStart(7))
  for (const e of dump.etapes) {
    if (e.erreur) { console.log(e.etape.padEnd(15), 'ERREUR :', e.erreur); continue }
    console.log(e.etape.padEnd(15), String(e.geometries).padStart(7), String(e.textures).padStart(7), String(e.programmes).padStart(6),
      String(e.appels).padStart(7), String(e.triangles).padStart(10), String(e.tasMo).padStart(7))
  }
  console.log(`résultat : ${file} (${secondes} s, Chrome sorti en ${code})`)
  if (dump.title !== 'memtest:fini') {
    console.error(`mesure inachevée : titre « ${dump.title || 'absent'} », ${dump.etapes.length} étape(s). Le serveur de dev tourne-t-il ? Sinon augmenter BUDGET_MS.`)
    return 1
  }

  const annexe = opt('reference') ? REFERENCE : typeof opt('annexe') === 'string' ? opt('annexe') : null
  if (annexe) {
    const dest = join(repo, 'docs', 'superpowers', 'specs', 'annexes', annexe)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(file, dest)
    console.log(`annexe : ${dest}`)
  }

  if (opt('check')) {
    const crit = checkMemtest(dump.etapes, { qualite: result.qualite })
    for (const c of crit) console.log(`${c.ok ? 'TENU  ' : 'ÉCHEC '} ${c.critere} : ${c.detail}`)
    const ko = crit.filter(c => !c.ok).length
    console.log(ko ? `${ko} seuil(s) dépassé(s) sur ${crit.length}` : `${crit.length} seuils tenus`)
    return ko ? 1 : 0
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), err => { console.error(err); process.exit(2) })
}
