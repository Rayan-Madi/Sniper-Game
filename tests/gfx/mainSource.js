// Lecture du source de main.js pour les gardes de câblage (main.dispose.test.js, main.quality.test.js) : main.js ne
// s'importe pas sous jsdom (canevas WebGL, DOM du jeu), ces gardes vérifient ses points d'appel en lisant le source.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSync } from 'vite'

export const MAIN_SRC = readFileSync(resolve(__dirname, '../../src/main.js'), 'utf8')

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

// Appels faits au chargement du module : instructions de premier niveau qui sont un appel direct (« initScene() »),
// dans l'ordre du source.
export function topLevelCalls(a) {
  return a.program.body
    .filter(n => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression')
    .map(n => ({ callee: a.source.slice(n.expression.callee.start, n.expression.callee.end), start: n.start, end: n.end }))
}
