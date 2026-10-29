// Lecture du source de main.js pour les gardes de câblage (main.dispose.test.js, main.quality.test.js) : main.js ne
// s'importe pas sous jsdom (canevas WebGL, DOM du jeu), ces gardes vérifient ses points d'appel en lisant le source.
// Quelques tests exécutent aussi des fonctions de main.js telles quelles, lues dans le source (executer).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSync } from 'vite'

// Source lu en fins de ligne LF, comme le dépôt le stocke : sous Windows, Git (core.autocrlf) extrait main.js en CRLF,
// et une garde qui cherche « \n » à un endroit précis ne le trouverait plus (relecture de L7, mainSource.test.js).
export function readSource(path) {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

export const MAIN_SRC = readSource(resolve(__dirname, '../../src/main.js'))

// Fonctions déclarées au niveau du module, imports (nom local → module source), corps du programme.
export function analyse(source) {
  const { program, errors } = parseSync('main.js', source)
  if (errors.length) throw new Error(`main.js : analyse impossible (${errors[0].message})`)
  const fns = new Map(), imports = new Map()
  for (const n of program.body) {
    if (n.type === 'FunctionDeclaration') fns.set(n.id.name, n)
    if (n.type === 'ImportDeclaration') for (const s of n.specifiers) imports.set(s.local.name, { from: n.source.value, node: s })
  }
  return { source, program, fns, imports }
}

// Appels faits dans un nœud (fonctions imbriquées comprises), dans l'ordre du source, avec le texte de l'appelé :
// 'removeMoralLock', 'MAP_BUILDERS[0]', 'npc.dispose'.
export function callsInNode(a, root) {
  const out = []
  const walk = node => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== 'object') return
    if (node.type === 'CallExpression') {
      out.push({ callee: a.source.slice(node.callee.start, node.callee.end), start: node.start, end: node.end })
    }
    for (const k in node) if (k !== 'parent') walk(node[k])
  }
  walk(root)
  return out.sort((x, y) => x.start - y.start)
}

// Appels faits dans le corps d'une fonction de main.js ; null si main.js n'a pas de fonction de ce nom.
export function callsIn(a, name) {
  const fn = a.fns.get(name)
  return fn ? callsInNode(a, fn.body) : null
}

// Fonctions de main.js exécutées telles quelles, hors du jeu : leur source, lu dans `source` (main.js par défaut), est
// évalué dans une portée faite des variables de `portee` (l'état du module et ce qu'il importe : doublures ou vrais
// modules), qu'elles lisent et écrivent comme celles du module dans le jeu. Un nom qui manque à la portée est cherché
// parmi les globales de jsdom (innerWidth…), sinon il lève une ReferenceError quand une fonction l'atteint ; mieux vaut
// donc tout passer par la portée. → { fns (les fonctions, par nom), etat() (les variables de la portée, à l'instant),
// poser(valeurs) (en change entre deux appels, comme le jeu : la souris qui bouge le regard) }.
export function executer(noms, portee, source = MAIN_SRC) {
  const a = analyse(source)
  const vars = Object.keys(portee)
  const doublons = noms.filter(n => vars.includes(n))
  if (doublons.length) throw new Error(`à la fois fonction exécutée et variable de la portée : ${doublons.join(', ')}`)
  const textes = noms.map(nom => {
    const fn = a.fns.get(nom)
    if (!fn) throw new Error(`main.js : aucune fonction ${nom}`)
    return source.slice(fn.start, fn.end)
  })
  const poser = vars.map(v => `if (Object.hasOwn(o, '${v}')) ${v} = o.${v}`).join('\n')
  const corps = `'use strict'\nlet { ${vars.join(', ')} } = portee\n${textes.join('\n')}\n` +
    `return { fns: { ${noms.join(', ')} }, etat: () => ({ ${vars.join(', ')} }), poser: o => {\n${poser}\n} }`
  return new Function('portee', corps)(portee)
}

// Appels faits au chargement du module : instructions de premier niveau qui sont un appel direct (« initScene() »),
// dans l'ordre du source.
export function topLevelCalls(a) {
  return a.program.body
    .filter(n => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression')
    .map(n => ({ callee: a.source.slice(n.expression.callee.start, n.expression.callee.end), start: n.start, end: n.end }))
}
