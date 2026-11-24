// Lecture des scènes de cinématique pour les gardes statiques de la spec cinématiques v2 (§3.1, G4 à G6) : la feuille
// de chaque scène et des deux kits en règles et @keyframes, le script de la scène (corps de start) en arbre syntaxique,
// le HTML de #st en textes. Les scènes sont lues telles que le jeu les charge (src/briefing/scenes/*.js, générées depuis
// les maquettes par scripts/port-maquette.mjs) ; tests/scripts/port-maquette.test.js garde qu'elles suivent les maquettes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSync } from 'vite'
import { SCENES } from '../../scripts/port-maquette.mjs'

export { SCENES }
export const RACINE = join(__dirname, '../..')
export const TIRET_CADRATIN = String.fromCharCode(0x2014)

// Les deux feuilles du kit, lues comme une source de plus (classe de scène : st).
export const KITS = [
  ['kit du jeu', join(RACINE, 'src/briefing/kit.css')],
  ['kit des maquettes', join(RACINE, 'docs/superpowers/maquettes/cinematiques/kit.css')],
].map(([nom, chemin]) => ({ nom, chemin, classe: 'st', css: readFileSync(chemin, 'utf8') }))

// ── JS ──

// Parcours d'un arbre syntaxique (ESTree, celui de parseSync de Vite) : visite(noeud) pour chaque nœud.
export function parcourir(noeud, visite) {
  if (Array.isArray(noeud)) return noeud.forEach(n => parcourir(n, visite))
  if (!noeud || typeof noeud !== 'object') return
  if (typeof noeud.type === 'string') visite(noeud)
  for (const k in noeud) if (k !== 'parent') parcourir(noeud[k], visite)
}

const valeurLitterale = init => {
  if (init && init.type === 'Literal' && typeof init.value === 'string') return init.value
  throw new Error('export attendu en chaîne littérale')
}

// Exports d'un module de scène : ses constantes en chaînes littérales (stClass, css, html) et le corps de sa fonction
// start(K, ctx), en arbre syntaxique.
export function lireModule(source, nom = 'scene.js') {
  const { program, errors } = parseSync(nom, source)
  if (errors.length) throw new Error(`${nom} : analyse impossible (${errors[0].message})`)
  const module = {}
  for (const n of program.body) {
    const d = n.type === 'ExportNamedDeclaration' ? n.declaration : null
    if (d && d.type === 'VariableDeclaration') for (const v of d.declarations) module[v.id.name] = valeurLitterale(v.init)
    if (d && d.type === 'FunctionDeclaration' && d.id.name === 'start') module.corps = d.body
  }
  return module
}

// Une scène telle que le jeu la charge : classe de #st, CSS, HTML de #st, source du module et corps de start(K, ctx)
// (le script de la maquette, précédé des trois lignes du convertisseur qui redirigent location, setTimeout et
// requestAnimationFrame).
export function lireScene(id) {
  const chemin = join(RACINE, 'src/briefing/scenes', id + '.js')
  const source = readFileSync(chemin, 'utf8')
  const scene = { id, chemin, source, ...lireModule(source, id + '.js') }
  if (!scene.corps || scene.css === undefined || scene.html === undefined || !scene.stClass) {
    throw new Error(`${id} : module de scène incomplet (stClass, css, html, start)`)
  }
  scene.classe = scene.stClass.split(/\s+/).find(c => c && c !== 'st')
  return scene
}

// Les deux scripts du kit, en arbre syntaxique (programme entier).
export const SCRIPTS_DU_KIT = [
  ['kit du jeu', join(RACINE, 'src/briefing/kit.js')],
  ['kit des maquettes', join(RACINE, 'docs/superpowers/maquettes/cinematiques/kit.js')],
].map(([nom, chemin]) => {
  const source = readFileSync(chemin, 'utf8')
  const { program, errors } = parseSync('kit.js', source)
  if (errors.length) throw new Error(`${chemin} : analyse impossible (${errors[0].message})`)
  return { nom, chemin, source, programme: program }
})

const ligneDe = (texte, position) => texte.slice(0, position).split('\n').length

// Chaînes littérales d'un nœud ('…', "…" et morceaux fixes des `…`), avec leur ligne dans source ; les commentaires,
// absents de l'arbre, n'y sont pas.
export function chainesDe(noeud, source) {
  const trouvees = []
  parcourir(noeud, n => {
    if (n.type === 'Literal' && typeof n.value === 'string') trouvees.push({ ligne: ligneDe(source, n.start), texte: n.value })
    if (n.type === 'TemplateElement') trouvees.push({ ligne: ligneDe(source, n.start), texte: n.value.cooked ?? n.value.raw })
  })
  return trouvees
}

// Éléments SMIL (animations SVG que le kit ne sait ni geler ni rejouer).
export const SMIL = ['animate', 'animateTransform', 'animateMotion', 'set']
const estSmil = nom => typeof nom === 'string' && SMIL.some(s => s.toLowerCase() === nom.toLowerCase())

// Appels et lectures qui comptent pour le rendu (G5) dans un nœud, par ligne : Math.random, setInterval (appelé ou lu
// sur un objet), element.animate (Web Animations), élément SMIL créé par createElement ou createElementNS.
export function appelsDe(noeud, source) {
  const res = { mathRandom: [], setInterval: [], animate: [], smil: [] }
  const nomDe = p => p && (p.type === 'Identifier' ? p.name : p.type === 'Literal' ? p.value : null)
  parcourir(noeud, n => {
    const ligne = () => ligneDe(source, n.start)
    if (n.type === 'MemberExpression' && nomDe(n.property) === 'random' && n.object.type === 'Identifier' && n.object.name === 'Math') res.mathRandom.push(ligne())
    if (n.type === 'Identifier' && n.name === 'setInterval') res.setInterval.push(ligne())
    if (n.type === 'MemberExpression' && nomDe(n.property) === 'setInterval') res.setInterval.push(ligne())
    const methode = n.type === 'CallExpression' && n.callee.type === 'MemberExpression' ? nomDe(n.callee.property) : null
    if (methode === 'animate') res.animate.push(ligne())
    if ((methode === 'createElement' || methode === 'createElementNS') && n.arguments.some(a => a.type === 'Literal' && estSmil(a.value))) res.smil.push(ligne())
  })
  // un même setInterval lu sur un objet (window.setInterval) compte une fois
  res.setInterval = [...new Set(res.setInterval)]
  return res
}

// Courbes de K.anim, celles du bloc commun anim des deux kit.js (spec §3.3).
export const COURBES_K_ANIM = ['douce', 'sortie', 'lineaire']

// Appels de K.anim qui ne nomment pas leur courbe (spec §3.3 : « chaque dessin de K.anim nomme sa courbe ») : le kit
// prend 'douce' quand l'option manque, et un REC ou un compte à rebours qui l'oublierait mentirait sans bruit. Chaque
// appel passe donc { courbe: '<nom>' } en objet écrit dans l'appel, le nom en chaîne littérale parmi COURBES_K_ANIM ;
// K.anim ne se lit pas hors d'un appel (alias, déstructuration), où cette lecture ne le suivrait plus. Relevé :
// [{ ligne, raison }], dans l'ordre des lignes.
export function kAnimSansCourbe(noeud, source) {
  const res = [], appeles = new Set()
  const nomDe = m => (m.computed ? (m.property.type === 'Literal' ? m.property.value : null) : m.property.name)
  const estKAnim = n => n && n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'K' && nomDe(n) === 'anim'
  const cleDe = p => (p.computed ? (p.key.type === 'Literal' ? p.key.value : null) : p.key.type === 'Identifier' ? p.key.name : p.key.value)
  parcourir(noeud, n => {
    const ligne = ligneDe(source, n.start)
    if (n.type === 'CallExpression' && estKAnim(n.callee)) {
      appeles.add(n.callee)
      const options = n.arguments[2]
      const courbe = options && options.type === 'ObjectExpression' ? options.properties.find(p => p.type === 'Property' && cleDe(p) === 'courbe') : null
      if (options && options.type !== 'ObjectExpression') res.push({ ligne, raison: 'options hors littéral' })
      else if (!courbe) res.push({ ligne, raison: 'sans { courbe }' })
      else if (courbe.value.type !== 'Literal' || typeof courbe.value.value !== 'string') res.push({ ligne, raison: 'courbe non littérale' })
      else if (!COURBES_K_ANIM.includes(courbe.value.value)) res.push({ ligne, raison: `courbe « ${courbe.value.value} » inconnue` })
    }
    if (estKAnim(n) && !appeles.has(n)) res.push({ ligne, raison: 'K.anim lu hors d\'un appel' })
    if (n.type === 'VariableDeclarator' && n.id.type === 'ObjectPattern' && n.init && n.init.type === 'Identifier' && n.init.name === 'K' &&
      n.id.properties.some(p => p.type === 'Property' && cleDe(p) === 'anim')) res.push({ ligne, raison: 'K.anim lu hors d\'un appel' })
  })
  return res.sort((a, b) => a.ligne - b.ligne)
}

// ── HTML ──

// Textes que le HTML de #st peut afficher : nœuds texte hors <script>/<style>, et valeurs de tous les attributs (une
// scène tape à l'écran des textes rangés en data-*, et titres et légendes se lisent).
export function textesDuHtml(html) {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html')
  const textes = []
  const marcheur = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
    if (!n.parentElement.closest('script, style, template')) textes.push(n.data)
  }
  for (const el of doc.body.querySelectorAll('*')) for (const a of el.attributes) textes.push(a.value)
  return textes.map(t => t.trim()).filter(Boolean)
}

// Éléments SMIL du HTML de #st.
export function smilDuHtml(html) {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html')
  return [...doc.body.querySelectorAll('*')].map(el => el.localName).filter(estSmil)
}

// ── CSS ──

// Fin d'une chaîne CSS ouverte en i (guillemet simple ou double, échappements compris) : position du guillemet fermant.
function finDeChaine(texte, i) {
  const q = texte[i]
  let j = i + 1
  while (j < texte.length && texte[j] !== q) j += texte[j] === '\\' ? 2 : 1
  return j
}

// Commentaires remplacés par des espaces (lignes et positions gardées), chaînes intactes.
export function blanchirCommentaires(css) {
  let out = '', i = 0
  while (i < css.length) {
    const c = css[i]
    if (c === '"' || c === "'") {
      const j = finDeChaine(css, i)
      out += css.slice(i, j + 1); i = j + 1
    } else if (c === '/' && css[i + 1] === '*') {
      const fin = css.indexOf('*/', i + 2), j = fin === -1 ? css.length : fin + 2
      out += css.slice(i, j).replace(/[^\n]/g, ' '); i = j
    } else { out += c; i++ }
  }
  return out
}

// Morceaux de texte séparés par sep au niveau 0 (hors chaînes, parenthèses et crochets).
export function decouper(texte, sep) {
  const morceaux = []
  let prof = 0, debut = 0
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (c === '"' || c === "'") { i = finDeChaine(texte, i); continue }
    if (c === '(' || c === '[') prof++
    else if (c === ')' || c === ']') prof--
    else if (c === sep && prof === 0) { morceaux.push(texte.slice(debut, i)); debut = i + 1 }
  }
  morceaux.push(texte.slice(debut))
  return morceaux
}

// Blocs de premier niveau d'un texte CSS : [{ prelude, contenu, position }].
function blocs(texte, decalage = 0) {
  const res = []
  let i = 0, debut = 0
  while (i < texte.length) {
    const c = texte[i]
    if (c === '"' || c === "'") { i = finDeChaine(texte, i) + 1; continue }
    if (c === ';') { debut = i + 1; i++; continue }   // instruction @… hors bloc : sans effet sur les gardes
    if (c === '}') throw new Error(`accolade fermante en trop (position ${decalage + i})`)
    if (c === '{') {
      let prof = 1, j = i + 1
      for (; j < texte.length && prof; j++) {
        const d = texte[j]
        if (d === '"' || d === "'") j = finDeChaine(texte, j)
        else if (d === '{') prof++
        else if (d === '}') prof--
      }
      if (prof) throw new Error(`bloc jamais fermé (position ${decalage + i})`)
      const prelude = texte.slice(debut, i)
      const blanc = prelude.length - prelude.trimStart().length
      res.push({ prelude: prelude.trim(), contenu: texte.slice(i + 1, j - 1), position: decalage + debut + blanc, positionContenu: decalage + i + 1 })
      i = j; debut = j
      continue
    }
    i++
  }
  return res
}

// Déclarations d'un bloc : [[propriété, valeur, importante]] dans l'ordre.
export function declarations(contenu) {
  if (/[{}]/.test(contenu.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ''))) throw new Error('règle imbriquée : non prise en charge par les gardes')
  return decouper(contenu, ';').map(d => d.trim()).filter(Boolean).map(d => {
    const deux = d.indexOf(':')
    if (deux < 0) throw new Error(`déclaration sans « : » : ${d}`)
    let valeur = d.slice(deux + 1).trim()
    const importante = /!\s*important$/i.test(valeur)
    if (importante) valeur = valeur.replace(/!\s*important$/i, '').trim()
    return [d.slice(0, deux).trim().toLowerCase(), valeur, importante]
  })
}

// Sélecteur aux blancs normalisés (combinateurs entourés d'une espace).
export function normaliserSelecteur(sel) {
  const { composes, combinateurs } = decomposer(sel)
  return composes.map((c, i) => (i ? (combinateurs[i - 1] === ' ' ? ' ' : ` ${combinateurs[i - 1]} `) : '') + c).join('')
}

// Feuille lue en règles de style et @keyframes, chacune avec sa ligne :
//   regles : [{ selecteurs: ['.pro .hh', …], declarations: [[prop, valeur, importante]], ligne }]
//   keyframes : [{ nom, etapes: [{ cles, declarations }], ligne }]
// Toute autre règle @… (média, conteneur…) est refusée : la garde ne saurait pas dire quand elle s'applique.
export function lireCss(css) {
  const propre = blanchirCommentaires(css)
  const regles = [], keyframes = []
  for (const b of blocs(propre)) {
    const ligne = ligneDe(propre, b.position)
    const kf = b.prelude.match(/^@(?:-webkit-)?keyframes\s+(.+)$/i)
    if (kf) {
      const etapes = blocs(b.contenu, b.positionContenu).map(e => ({ cles: e.prelude, declarations: declarations(e.contenu) }))
      keyframes.push({ nom: kf[1].trim(), etapes, ligne })
    } else if (b.prelude.startsWith('@')) {
      throw new Error(`ligne ${ligne} : règle « ${b.prelude} » non prise en charge par les gardes`)
    } else {
      const selecteurs = decouper(b.prelude, ',').map(s => normaliserSelecteur(s.trim())).filter(Boolean)
      regles.push({ selecteurs, declarations: declarations(b.contenu), ligne })
    }
  }
  return { regles, keyframes }
}

// ── animations ──

const MOTS_CLES = new Set(['infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'forwards', 'backwards', 'both',
  'running', 'paused', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end', 'initial', 'inherit', 'unset'])
const estNomDAnimation = jeton => !MOTS_CLES.has(jeton) && !/^[-+]?[\d.]/.test(jeton) && !/\(/.test(jeton)
// Nombre de tours d'un jeton : infinite, ou nombre sans unité (le seul du raccourci `animation`, les durées en ont une).
const toursDe = jeton => (jeton === 'infinite' ? Infinity : /^(?:\d+\.?\d*|\.\d+)$/.test(jeton) ? parseFloat(jeton) : null)
const uneAnimation = (nom, tours) => ({ nom, tours, infinie: tours === Infinity })

// Animations posées par une liste de déclarations (dans l'ordre : `animation`, puis `animation-name` et
// `animation-iteration-count` qui la retouchent ; aussi sous leur préfixe -webkit-, que Chrome lit) :
// [{ nom, tours, infinie }], tours valant Infinity pour infinite, 1 par défaut ; `none` n'en pose aucune.
export function animationsDe(decls) {
  let liste = null
  for (const [brute, valeur] of decls) {
    const prop = brute.replace(/^-webkit-/, '')
    if (prop === 'animation') {
      liste = decouper(valeur, ',').map(item => {
        const jetons = decouper(item.trim(), ' ').map(j => j.trim()).filter(Boolean)
        return uneAnimation(jetons.find(estNomDAnimation) || 'none', jetons.map(toursDe).find(n => n !== null) ?? 1)
      })
    } else if (prop === 'animation-name') {
      const noms = decouper(valeur, ',').map(n => n.trim())
      liste = noms.map((nom, i) => uneAnimation(nom, liste && liste[i] ? liste[i].tours : 1))
    } else if (prop === 'animation-iteration-count') {
      const comptes = decouper(valeur, ',').map(n => toursDe(n.trim()) ?? 1)
      liste = (liste || [uneAnimation('?', 1)]).map((a, i) => uneAnimation(a.nom, comptes[i % comptes.length]))
    }
  }
  return liste === null ? null : liste.filter(a => a.nom !== 'none')
}

// ── animations hors des feuilles (G4) ──

// G4 lit les feuilles règle par règle : une animation posée ailleurs lui échapperait. On relève donc, préfixe -webkit-
// compris, tout réglage d'animation dans l'attribut style du HTML ; et dans un script, toute propriété de style
// (style.animation, style.animationName, style['animation-name']…), clé d'objet ({ animation: … } passé à
// Object.assign), nom de propriété en chaîne (setProperty('animation', …)) ou déclaration dans une chaîne (cssText,
// setAttribute('style', …), innerHTML, feuille écrite par le script).
const PROPRIETE_ANIMATION = /^(?:-webkit-)?animation(?:-[a-z]+)*$/i
const MEMBRE_ANIMATION = /^(?:webkit|Webkit)?[aA]nimation(?:[A-Z][a-zA-Z]*)?$/
const DECLARATION_ANIMATION = /(?:^|[^\w-])(?:-webkit-)?animation(?:-[a-z]+)*\s*:/i

// Éléments du HTML de #st dont l'attribut style règle une animation.
export function animationsDuHtml(html) {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html')
  return [...doc.body.querySelectorAll('[style]')].filter(el => DECLARATION_ANIMATION.test(el.getAttribute('style')))
    .map(el => `attribut style de <${el.localName}${el.id ? ` id="${el.id}"` : ''}> : ${el.getAttribute('style')}`)
}

// Lignes d'un script (nœud et sa source) qui règlent une animation : « ligne n : <la ligne> », une fois par ligne.
export function animationsDuScript(noeud, source) {
  const lignes = new Set()
  const nomDe = p => p && (p.type === 'Identifier' ? p.name : p.type === 'Literal' && typeof p.value === 'string' ? p.value : null)
  const regleUneAnimation = nom => typeof nom === 'string' && (MEMBRE_ANIMATION.test(nom) || PROPRIETE_ANIMATION.test(nom))
  parcourir(noeud, n => {
    const cle = n.type === 'MemberExpression' ? n.property : n.type === 'Property' ? n.key : null
    if (cle && regleUneAnimation(nomDe(cle))) lignes.add(ligneDe(source, n.start))
  })
  for (const c of chainesDe(noeud, source)) {
    if (DECLARATION_ANIMATION.test(c.texte) || PROPRIETE_ANIMATION.test(c.texte.trim())) lignes.add(c.ligne)
  }
  const texte = source.split('\n')
  return [...lignes].sort((a, b) => a - b).map(l => `ligne ${l} : ${texte[l - 1].trim().slice(0, 120)}`)
}

// ── sélecteurs ──

// Composés d'un sélecteur et combinateurs qui les relient :
//   '.pro .mob.ring ~ .vib' → { composes: ['.pro', '.mob.ring', '.vib'], combinateurs: [' ', '~'] }
export function decomposer(sel) {
  const composes = [], combinateurs = []
  let courant = '', prof = 0, combinateur = null
  for (const c of sel.trim()) {
    if (prof === 0 && /[\s>+~]/.test(c)) {
      if (courant) { composes.push(courant); courant = ''; combinateur = ' ' }
      if (!/\s/.test(c)) combinateur = c
      continue
    }
    if (c === '(' || c === '[') prof++
    else if (c === ')' || c === ']') prof--
    if (!courant && composes.length) combinateurs.push(combinateur || ' ')
    courant += c
  }
  if (courant) composes.push(courant)
  return { composes, combinateurs }
}

// Sélecteurs simples d'un composé : '.pro.k-reduced' → ['.pro', '.k-reduced'] ; '.rain::before' → ['.rain', '::before'].
export function simples(compose) {
  const res = []
  let courant = '', prof = 0
  for (const c of compose) {
    if (prof === 0 && /[.#[:]/.test(c) && courant && !(c === ':' && courant === ':')) { res.push(courant); courant = '' }
    if (c === '(' || c === '[') prof++
    else if (c === ')' || c === ']') prof--
    courant += c
  }
  if (courant) res.push(courant)
  return res
}

// Pseudo-élément d'un sélecteur (::before, ::after…), que jsdom ne calcule pas.
export const pseudoElement = sel => (sel.match(/::[a-z-]+$/i) || [null])[0]

// Ce qui identifie une règle et sa jumelle atténuée : le premier composé sans .k-reduced (ses sélecteurs simples,
// dans n'importe quel ordre) et le reste du sélecteur. reduite : le premier composé porte .k-reduced.
export function cleDeJumelle(sel) {
  const { composes, combinateurs } = decomposer(sel)
  const premiers = simples(composes[0] || '')
  const reste = composes.slice(1).map((c, i) => (combinateurs[i] === ' ' ? ' ' : ` ${combinateurs[i]} `) + c).join('')
  return {
    cle: premiers.filter(s => s !== '.k-reduced').sort().join('') + reste,
    reduite: premiers.includes('.k-reduced'),
    premiers,
  }
}

// ── contenus du CSS (G6) ──

const CHAINE_CSS = String.raw`"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'`
// Valeurs des déclarations `content:` d'une feuille (texte que les ::before/::after affichent), échappements CSS
// (\2014, \002014) décodés ; le même relevé que tests/texts.test.js pour les feuilles du jeu.
export function contenusCss(css) {
  const propre = blanchirCommentaires(css)
  const decoder = s => s.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => {
    const c = parseInt(h, 16)
    return String.fromCodePoint(c > 0 && c <= 0x10ffff && (c < 0xd800 || c > 0xdfff) ? c : 0xfffd)
  })
  const decl = new RegExp(String.raw`(?<=[{;]\s*)content\s*:((?:${CHAINE_CSS}|[^;}"'])*)`, 'g')
  return [...propre.matchAll(decl)].map(m => ({ ligne: ligneDe(propre, m.index), texte: decoder(m[1].trim()) }))
}
