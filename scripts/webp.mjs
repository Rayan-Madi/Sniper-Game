// Convertit en WebP les portraits PNG à transparence des cinématiques (public/briefing/img, 360 × 450, écrits par
// scripts/compress-briefing-img.ps1 depuis les sources des maquettes), par Chrome sans interface et sans dépendance
// neuve : une page temporaire dessine chaque PNG dans un canevas et l'encode avec canvas.toDataURL('image/webp', q)
// (synchrone : fini avant que --dump-dom sérialise la page) ; le base64 est lu dans la sortie de --dump-dom.
// Qualité : 0,82 au départ, baissée de 0,02 tant que les six dépassent 350 000 octets (objectif repris du lot 4,
// kill-cams-design.md §5). Une seconde page décode chaque WebP et compare son canal alpha à celui du PNG : un pixel
// du fond détouré doit garder un alpha de 0, sinon rien n'est écrit. Les PNG convertis sont ensuite supprimés ; les
// maquettes gardent leurs img/<nom>.png et scripts/port-maquette.mjs sert le .webp au jeu.
// Usage (racine du dépôt ; un seul Chrome sans interface à la fois sur la machine) : node scripts/webp.mjs [--q=0.82] [--essai]
// puis node scripts/port-maquette.mjs (scènes régénérées : seuls les chemins des portraits changent).
//   --q=<n>   qualité imposée, sans descente
//   --essai   encode et vérifie sans rien écrire ni supprimer
// Variable : CHROME (chemin de Chrome). Profil jetable, aucun port de débogage (--dump-dom), tout supprimé après.
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PLAFOND = 350000
const DEPART = 0.82, PAS = 0.02, PLANCHER = 0.5
const TAILLE = { largeur: 360, hauteur: 450 }

// Taille d'un PNG lue dans son en-tête IHDR : { largeur, hauteur }.
export function taillePng(octets) {
  const b = Buffer.from(octets)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (b.length < 24 || !b.subarray(0, 8).equals(signature) || b.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error('pas un fichier PNG (signature ou IHDR absent)')
  }
  return { largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) }
}

// Taille et canal alpha d'un WebP lus dans ses chunks RIFF : { largeur, hauteur, alpha }. Une image avec perte n'a
// de transparence que dans un chunk ALPH (annoncé par le drapeau L du VP8X) ; une image sans perte (VP8L) la porte
// dans son en-tête.
export function infoWebp(octets) {
  const b = Buffer.from(octets)
  if (b.length < 12 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error('pas un fichier WebP (en-tête RIFF/WEBP absent)')
  }
  const blocs = new Map()
  for (let p = 12; p + 8 <= b.length;) {
    const id = b.toString('latin1', p, p + 4), taille = b.readUInt32LE(p + 4)
    if (!blocs.has(id)) blocs.set(id, b.subarray(p + 8, p + 8 + taille))
    p += 8 + taille + (taille & 1)
  }
  const x = blocs.get('VP8X'), l = blocs.get('VP8L'), v = blocs.get('VP8 ')
  const enteteL = l && l.length >= 5 && l[0] === 0x2f ? l.readUInt32LE(1) : null
  const alphaL = enteteL !== null && ((enteteL >>> 28) & 1) === 1
  if (x && x.length >= 10) {
    return { largeur: x.readUIntLE(4, 3) + 1, hauteur: x.readUIntLE(7, 3) + 1, alpha: (x[0] & 0x10) !== 0 && (blocs.has('ALPH') || alphaL) }
  }
  if (enteteL !== null) return { largeur: (enteteL & 0x3fff) + 1, hauteur: ((enteteL >>> 14) & 0x3fff) + 1, alpha: alphaL }
  if (v && v.length >= 10 && v[3] === 0x9d && v[4] === 0x01 && v[5] === 0x2a) {
    return { largeur: v.readUInt16LE(6) & 0x3fff, hauteur: v.readUInt16LE(8) & 0x3fff, alpha: false }
  }
  throw new Error('WebP sans image lisible (ni VP8X, ni VP8L, ni VP8)')
}

// Page d'encodage : chaque PNG (base64) dessiné dans un canevas à sa taille, encodé en WebP à la qualité q ; sans
// qualité imposée, q descend de PAS tant que le total dépasse le plafond. Résultat dans <pre id="webp"> (JSON).
function pageEncodage(sources, { q, plafond }) {
  return `<!doctype html><meta charset="utf-8"><title>webp</title><body>
${sources.map(s => `<img data-nom="${s.nom}" src="data:image/png;base64,${s.png.toString('base64')}">`).join('\n')}
<script>
addEventListener('load', () => {
  const imgs = [...document.images]
  const encoder = q => imgs.map(img => {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    const url = c.toDataURL('image/webp', q)
    return { nom: img.dataset.nom, type: url.slice(5, url.indexOf(';')), webp: url.slice(url.indexOf(',') + 1) }
  })
  const octets = sortie => sortie.reduce((s, x) => s + atob(x.webp).length, 0)
  let q = ${q ?? DEPART}, sortie = encoder(q)
  while (${q === undefined} && octets(sortie) > ${plafond} && q - ${PAS} >= ${PLANCHER} - 1e-9) {
    q = Math.round((q - ${PAS}) * 100) / 100
    sortie = encoder(q)
  }
  const pre = document.createElement('pre')
  pre.id = 'webp'
  pre.textContent = JSON.stringify({ q, images: sortie })
  document.body.replaceChildren(pre)
})
</script>`
}

// Page de vérification : chaque WebP décodé à côté de son PNG ; pixels comparés (alpha partout, couleur sur les
// pixels opaques des deux). Le premier pixel transparent du PNG (alpha 0, lu ligne à ligne) est le témoin du fond.
function pageVerification(paires) {
  return `<!doctype html><meta charset="utf-8"><title>webp</title><body>
${paires.map(p => `<img data-nom="${p.nom}" data-role="png" src="data:image/png;base64,${p.png.toString('base64')}">`
    + `<img data-nom="${p.nom}" data-role="webp" src="data:image/webp;base64,${p.webp.toString('base64')}">`).join('\n')}
<script>
addEventListener('load', () => {
  const pixels = img => {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    return g.getImageData(0, 0, c.width, c.height).data
  }
  const resultats = [...document.querySelectorAll('img[data-role=png]')].map(png => {
    const webp = document.querySelector('img[data-role=webp][data-nom="' + png.dataset.nom + '"]')
    const memeTaille = webp.naturalWidth === png.naturalWidth && webp.naturalHeight === png.naturalHeight
    const a = pixels(png), b = memeTaille ? pixels(webp) : null
    const r = { nom: png.dataset.nom, largeur: webp.naturalWidth, hauteur: webp.naturalHeight, transparents: 0, fondPerdu: 0,
      alphaDifferents: 0, ecartAlphaMax: 0, pixelFond: null, alphaFond: null, ecartMoyen: null }
    if (!b) return r
    let fond = -1, somme = 0, opaques = 0
    for (let i = 0; i < a.length; i += 4) {
      const ecart = Math.abs(a[i + 3] - b[i + 3])
      if (ecart) { r.alphaDifferents++; r.ecartAlphaMax = Math.max(r.ecartAlphaMax, ecart) }
      if (a[i + 3] === 0) { r.transparents++; if (fond < 0) fond = i / 4; if (b[i + 3] !== 0) r.fondPerdu++ }
      if (a[i + 3] === 255 && b[i + 3] === 255) {
        opaques++
        somme += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      }
    }
    if (fond >= 0) { r.pixelFond = [fond % png.naturalWidth, Math.floor(fond / png.naturalWidth)]; r.alphaFond = b[fond * 4 + 3] }
    if (opaques) r.ecartMoyen = Math.round(somme / opaques / 3 * 100) / 100
    return r
  })
  const pre = document.createElement('pre')
  pre.id = 'webp'
  pre.textContent = JSON.stringify(resultats)
  document.body.replaceChildren(pre)
})
</script>`
}

const attendre = ms => new Promise(r => setTimeout(r, ms))
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// Chrome sans interface sur une page écrite dans un dossier jetable (profil compris), --dump-dom ; rend le JSON de
// <pre id="webp">. Chrome et ses processus sont arrêtés au bout de 2 minutes ; le dossier est supprimé dans tous les cas,
// y compris quand Chrome ne se lance pas (la promesse échoue alors avec l'erreur du lancement, qui nomme le chemin).
// Options (pour les tests) : chrome, chemin de Chrome ; temporaire, dossier où créer le dossier jetable.
export async function chromeDump(html, { chrome = CHROME, temporaire = tmpdir() } = {}) {
  const dossier = mkdtempSync(join(temporaire, 'webp-'))
  try {
    const page = join(dossier, 'page.html')
    writeFileSync(page, html)
    const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run',
      `--user-data-dir=${join(dossier, 'profil')}`, '--virtual-time-budget=10000', '--dump-dom', pathToFileURL(page).href],
    { stdio: ['ignore', 'pipe', 'ignore'] })
    let sortie = ''
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', d => { sortie += d })
    const garde = setTimeout(() => spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' }), 120000)
    // Chrome qui ne se lance pas (chemin faux : ENOENT) : « error » sans « exit » ; l'erreur sort par le finally.
    const code = await new Promise((resolve, reject) => { proc.once('exit', resolve); proc.once('error', reject) })
      .finally(() => clearTimeout(garde))
    const m = sortie.match(/<pre id="webp">([\s\S]*?)<\/pre>/)
    if (!m) throw new Error(`Chrome n'a rien rendu (code ${code}) : ${sortie.slice(0, 200)}`)
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
  } finally {
    for (let i = 0; i < 20; i++) {
      try { rmSync(dossier, { recursive: true, force: true }); break } catch { await attendre(300) }
    }
  }
}

async function convertir({ q, essai }) {
  const img = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'briefing', 'img')
  const sources = readdirSync(img).filter(f => f.endsWith('.png')).sort()
    .map(f => ({ nom: f.slice(0, -4), png: readFileSync(join(img, f)) }))
    .filter(s => { const t = taillePng(s.png); return t.largeur === TAILLE.largeur && t.hauteur === TAILLE.hauteur })
  if (!sources.length) { console.log('aucun portrait PNG de 360 × 450 à convertir dans public/briefing/img'); return }

  const encodage = await chromeDump(pageEncodage(sources, { q, plafond: PLAFOND }))
  const webps = encodage.images.map(e => {
    if (e.type !== 'image/webp') throw new Error(`${e.nom} : Chrome a rendu ${e.type} au lieu de image/webp`)
    const octets = Buffer.from(e.webp, 'base64'), info = infoWebp(octets)
    if (info.largeur !== TAILLE.largeur || info.hauteur !== TAILLE.hauteur || !info.alpha) {
      throw new Error(`${e.nom} : WebP de ${info.largeur} × ${info.hauteur}${info.alpha ? '' : ' sans canal alpha'}`)
    }
    return { nom: e.nom, webp: octets }
  })
  const total = webps.reduce((s, w) => s + w.webp.length, 0)

  const paires = sources.map(s => ({ ...s, webp: webps.find(w => w.nom === s.nom).webp }))
  const verification = await chromeDump(pageVerification(paires))
  const o = n => n.toLocaleString('fr-FR') + ' o'
  let fautes = 0
  for (const p of paires) {
    const v = verification.find(x => x.nom === p.nom)
    const juste = !!v && v.largeur === TAILLE.largeur && v.hauteur === TAILLE.hauteur && v.transparents > 0 && v.alphaFond === 0
      && v.fondPerdu === 0
    if (!juste) fautes++
    console.log(`${juste ? 'ok' : 'KO'} ${p.nom} : ${o(p.png.length)} → ${o(p.webp.length)} ; fond détouré ${v?.transparents} px,`
      + ` alpha du pixel (${v?.pixelFond}) : ${v?.alphaFond}, fond perdu ${v?.fondPerdu} px, alpha différent ${v?.alphaDifferents} px`
      + ` (écart max ${v?.ecartAlphaMax}), écart moyen des couleurs ${v?.ecartMoyen}`)
  }
  console.log(`qualité ${encodage.q} : ${o(sources.reduce((s, x) => s + x.png.length, 0))} en PNG, ${o(total)} en WebP`
    + ` (plafond ${o(PLAFOND)})`)
  if (fautes) throw new Error(`${fautes} portrait(s) sans transparence intacte : rien n'est écrit`)
  if (total > PLAFOND) throw new Error(`${o(total)} au-delà du plafond de ${o(PLAFOND)} à la qualité ${encodage.q} : rien n'est écrit`)
  if (essai) { console.log('essai : rien n\'est écrit'); return }
  for (const p of paires) {
    writeFileSync(join(img, p.nom + '.webp'), p.webp)
    rmSync(join(img, p.nom + '.png'))
  }
  console.log(`${paires.length} portraits écrits en .webp, PNG supprimés ; relancer node scripts/port-maquette.mjs`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const qArg = args.find(a => a.startsWith('--q='))
  const q = qArg ? Number(qArg.slice(4)) : undefined
  const inconnues = args.filter(a => a !== '--essai' && a !== qArg)
  if (inconnues.length || (q !== undefined && !(q > 0 && q <= 1))) {
    console.error('Usage : node scripts/webp.mjs [--q=0.82] [--essai]')
    process.exit(2)
  }
  convertir({ q, essai: args.includes('--essai') }).catch(e => { console.error(`webp : ${e.message}`); process.exit(1) })
}
