import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve, join, relative, posix } from 'node:path'
import { analyse, callsIn, topLevelCalls, readSource } from './gfx/mainSource.js'

// Le menu a son décor à lui (spec du lot 3, §2 a, et §2 3b, choix « Menu », approche B ; plan du lot 3a, tâche A1) :
// la rue de M1 d'avant le lot 3, figée dans src/maps/menu.js (buildMenuDecor), se monte derrière le menu au démarrage
// et au retour d'une mission (main.js : appel de premier niveau, showMenu), et au retour du PvP (QUITTER, quitToMenu de
// src/pvp/index.js). La carte de M1 (MAP_BUILDERS[0], src/maps/m1-rue.js) ne sert plus qu'à M1 : le sous-lot 3b peut la réécrire
// sans toucher au menu, qui garde ses références du memtest du lot 1 et les immeubles autour desquels tourne sa caméra.
// À l'écran, rien ne distingue encore les deux décors (même rue, captures identiques à l'octet) : cette garde lit donc
// le source du jeu (src/), comme celles de tests/gfx/main.*.test.js. Elle voit les chemins écrits en clair : les trois
// points d'appel, MAP_BUILDERS[0] appelé ou gardé de côté, un import de m1-rue.js ailleurs que dans src/maps/index.js,
// et dans index.js la carte de M1 qui sortirait de MAP_BUILDERS. Un détour (indice calculé, .at(0), MAP_BUILDERS sous
// un autre nom) lui échappe : le comportement lui-même est le test du sous-lot 3b « le menu garde ses compteurs du
// memtest du lot 1 à l'unité près » (spec, Tests 3b).
//
// Témoin : au commit b31f2d2, le menu emprunte la carte de M1 (MAP_BUILDERS[0]() au démarrage, dans showMenu et dans
// quitToMenu) : la garde y est rouge (vue avant le découpage de src/maps.js). Les autres chemins (alias, imports,
// index.js) ont chacun leur témoin plus bas, vu rouge sur la garde d'avant la relecture de A1.

const ROOT = resolve(__dirname, '..')
const MAIN = 'src/main.js', PVP = 'src/pvp/index.js'
const INDEX = 'src/maps/index.js', MENU = 'src/maps/menu.js'

// Le code du jeu (src/), avec son chemin depuis la racine.
function sourcesDuJeu() {
  const out = new Map()
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.js')) out.set(relative(ROOT, p).replace(/\\/g, '/'), readSource(p))
    }
  }
  walk(join(ROOT, 'src'))
  return out
}
const SOURCES = sourcesDuJeu()

const appelle = (a, fn, callee) => (callsIn(a, fn) || []).some(c => c.callee === callee)
// nom importé de src/maps/index.js, par un chemin relatif écrit depuis le fichier depuis (./maps/index.js dans main.js,
// ../maps/index.js dans src/pvp/index.js).
const importe = (a, depuis, nom) => {
  const spec = a.imports.get(nom)?.from
  return typeof spec === 'string' && spec.startsWith('.') && posix.join(posix.dirname(depuis), spec) === INDEX
}

// Nœuds de l'arbre qui vérifient garder, sans descendre dans ceux que saute sauter.
function noeuds(racine, garder, sauter = () => false) {
  const out = []
  const walk = n => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object' || sauter(n)) return
    if (typeof n.type === 'string' && garder(n)) out.push(n)
    for (const k in n) if (k !== 'parent') walk(n[k])
  }
  walk(racine)
  return out
}

// MAP_BUILDERS[0], appelé ou non (const rue = MAP_BUILDERS[0]).
const estCarteDeM1 = n => n.type === 'MemberExpression' && n.computed && n.object.type === 'Identifier' &&
  n.object.name === 'MAP_BUILDERS' && n.property.type === 'Literal' && n.property.value === 0

// Un import relatif (les seuls du jeu) qui mène à src/maps/m1-rue.js, avec ou sans extension.
const versM1 = (depuis, spec) => spec.startsWith('.') &&
  posix.join(posix.dirname(depuis), spec).replace(/\.js$/, '') === 'src/maps/m1-rue'

function defauts(sources) {
  const out = []
  const main = analyse(sources.get(MAIN)), pvp = analyse(sources.get(PVP))
  if (!importe(main, MAIN, 'buildMenuDecor')) out.push(`main.js : buildMenuDecor n'est pas importé de ${INDEX}`)
  if (!topLevelCalls(main).some(c => c.callee === 'buildMenuDecor')) {
    out.push("main.js : le décor du menu n'est pas monté au démarrage")
  }
  if (!appelle(main, 'showMenu', 'buildMenuDecor')) out.push("main.js : showMenu n'appelle pas buildMenuDecor()")
  if (!importe(pvp, PVP, 'buildMenuDecor')) out.push(`pvp/index.js : buildMenuDecor n'est pas importé de ${INDEX}`)
  if (!appelle(pvp, 'quitToMenu', 'buildMenuDecor')) out.push("pvp/index.js : quitToMenu n'appelle pas buildMenuDecor()")
  // La carte de M1 ne sert qu'à M1.
  // - Une carte de mission ne se monte que par son numéro de mission (mountLevel, sonde de lisibilité) : un indice
  //   écrit en dur, appelé ou gardé de côté, c'est le menu qui emprunte la carte de M1.
  // - Seul src/maps/index.js importe m1-rue.js (import, ré-export, import dynamique) : ni main.js, ni le PvP, ni un
  //   menu.js qui lui déléguerait son décor.
  for (const [path, text] of sources) {
    if (!text.includes('MAP_BUILDERS') && !text.includes('m1-rue')) continue
    const a = analyse(text)
    if (noeuds(a.program, estCarteDeM1).length) out.push(`${path} : le menu emprunte la carte de M1 (MAP_BUILDERS[0])`)
    for (const n of noeuds(a.program, n => typeof n.source?.value === 'string' && versM1(path, n.source.value))) {
      const spec = n.source.value
      if (path !== INDEX) out.push(`${path} : importe la carte de M1 (${spec}) hors de ${INDEX}`)
      else if (n.type !== 'ImportDeclaration') out.push(`${INDEX} : la carte de M1 (${spec}) sert hors de MAP_BUILDERS`)
    }
  }
  // - Dans src/maps/index.js, la carte de M1 n'entre que dans MAP_BUILDERS : ni décor du menu, ni ré-export (export *
  //   ci-dessus, export nommé et le reste ci-dessous, au nom de la carte).
  const index = analyse(sources.get(INDEX))
  const tableau = noeuds(index.program, n => n.type === 'VariableDeclarator' && n.id.name === 'MAP_BUILDERS')[0]
  for (const [nom, { from }] of index.imports) {
    if (!versM1(INDEX, from)) continue
    const estLaCarte = n => n.type === 'Identifier' && n.name === nom
    const hors = noeuds(index.program, estLaCarte, n => n.type === 'ImportDeclaration')
      .filter(n => !tableau || n.start < tableau.start || n.end > tableau.end)
    if (hors.length) out.push(`${INDEX} : la carte de M1 (${nom}) sert hors de MAP_BUILDERS`)
  }
  return out
}

describe('le menu a son décor à lui', () => {
  it('main.js et pvp/index.js montent le décor du menu (src/maps/menu.js), la carte de M1 ne sert qu\'à M1', () => {
    expect(defauts(SOURCES)).toEqual([])
  })
})

// Témoins : remettre la carte de M1 derrière le menu à un seul des trois endroits, ou remplacer l'import de pvp/index.js par
// une copie locale, rougit la garde. Une mutation qui ne changerait rien au source est refusée (le témoin ne prouverait
// rien).
describe('témoins de la garde', () => {
  const avec = (path, next) => {
    expect(next).not.toBe(SOURCES.get(path))
    return new Map(SOURCES).set(path, next)
  }
  const carteDeM1 = (path, appel) => {
    const src = SOURCES.get(path)
    return avec(path, src.slice(0, appel.start) + 'MAP_BUILDERS[0]()' + src.slice(appel.end))
  }
  const appelDans = (path, fn) => {
    return (callsIn(analyse(SOURCES.get(path)), fn) || []).find(c => c.callee === 'buildMenuDecor')
  }

  it('démarrage sur la carte de M1 : rouge', () => {
    const c = topLevelCalls(analyse(SOURCES.get(MAIN))).find(x => x.callee === 'buildMenuDecor')
    expect(c, "le décor du menu n'est déjà plus monté au démarrage : témoin impossible").toBeDefined()
    const d = defauts(carteDeM1(MAIN, c))
    expect(d).toContain("main.js : le décor du menu n'est pas monté au démarrage")
    expect(d).toContain(`${MAIN} : le menu emprunte la carte de M1 (MAP_BUILDERS[0])`)
  })

  it('retour d\'une mission (showMenu) sur la carte de M1 : rouge', () => {
    const c = appelDans(MAIN, 'showMenu')
    expect(c, "showMenu n'appelle déjà plus buildMenuDecor() : témoin impossible").toBeDefined()
    const d = defauts(carteDeM1(MAIN, c))
    expect(d).toContain("main.js : showMenu n'appelle pas buildMenuDecor()")
    expect(d).toContain(`${MAIN} : le menu emprunte la carte de M1 (MAP_BUILDERS[0])`)
  })

  it('retour du PvP (quitToMenu) sur la carte de M1 : rouge', () => {
    const c = appelDans(PVP, 'quitToMenu')
    expect(c, "quitToMenu n'appelle déjà plus buildMenuDecor() : témoin impossible").toBeDefined()
    const d = defauts(carteDeM1(PVP, c))
    expect(d).toContain("pvp/index.js : quitToMenu n'appelle pas buildMenuDecor()")
    expect(d).toContain(`${PVP} : le menu emprunte la carte de M1 (MAP_BUILDERS[0])`)
  })

  it('pvp/index.js avec une copie locale de buildMenuDecor : rouge', () => {
    const s = analyse(SOURCES.get(PVP)).imports.get('buildMenuDecor')?.node
    expect(s, "pvp/index.js n'importe déjà plus buildMenuDecor : témoin impossible").toBeDefined()
    const src = SOURCES.get(PVP)
    const next = src.slice(0, s.start) + 'buildMenuDecor as buildMenuDecorImporte' + src.slice(s.end) +
      '\nfunction buildMenuDecor() {}\n'
    expect(defauts(avec(PVP, next))).toContain(`pvp/index.js : buildMenuDecor n'est pas importé de ${INDEX}`)
  })

  // La carte de M1 remontée derrière le menu par un autre chemin que l'appel MAP_BUILDERS[0]() (relecture de A1).
  // Les trois points d'appel gardent leur buildMenuDecor() : seule la règle visée voit la mutation, d'où toEqual.
  // puisLaRue monte la rue de M1 juste après le décor du menu, qu'elle remplace aussitôt (chaque carte commence par
  // vider la scène).
  const puisLaRue = (path, fn, ajout) => {
    const c = appelDans(path, fn)
    expect(c, `${fn} n'appelle déjà plus buildMenuDecor() : témoin impossible`).toBeDefined()
    const src = SOURCES.get(path)
    return src.slice(0, c.end) + '; ' + ajout + src.slice(c.end)
  }

  it('alias de la carte de M1 (const rue = MAP_BUILDERS[0]) dans quitToMenu : rouge', () => {
    const d = defauts(avec(PVP, puisLaRue(PVP, 'quitToMenu', 'const rue = MAP_BUILDERS[0]; rue()')))
    expect(d).toEqual([`${PVP} : le menu emprunte la carte de M1 (MAP_BUILDERS[0])`])
  })

  it.each([
    ['import sans extension dans pvp/index.js', PVP, '../maps/m1-rue',
      () => "import { buildMapStreet } from '../maps/m1-rue'\n" + puisLaRue(PVP, 'quitToMenu', 'buildMapStreet()')],
    ['import dynamique dans showMenu', MAIN, './maps/m1-rue.js',
      () => puisLaRue(MAIN, 'showMenu', "import('./maps/m1-rue.js').then(m => m.buildMapStreet())")],
    ['menu.js qui ré-exporte la carte de M1', MENU, './m1-rue.js',
      () => "export { buildMapStreet as buildMenuDecor } from './m1-rue.js'\n"],
  ])('carte de M1 importée hors de src/maps/index.js (%s) : rouge', (_, path, spec, muter) => {
    expect(defauts(avec(path, muter()))).toEqual([`${path} : importe la carte de M1 (${spec}) hors de ${INDEX}`])
  })

  it('index.js qui fait de la carte de M1 le décor du menu : rouge', () => {
    const next = SOURCES.get(INDEX).replace('verifiable(decorDuMenu)', 'verifiable(buildMapStreet)')
    expect(defauts(avec(INDEX, next))).toEqual([`${INDEX} : la carte de M1 (buildMapStreet) sert hors de MAP_BUILDERS`])
  })

  // export * ne nomme pas la carte : seule sa source la trahit (un ré-export nommé tombe aussi sous la règle du nom).
  it('index.js qui ré-exporte tout m1-rue.js (export *) : rouge', () => {
    const next = SOURCES.get(INDEX) + "export * from './m1-rue.js'\n"
    expect(defauts(avec(INDEX, next))).toEqual([`${INDEX} : la carte de M1 (./m1-rue.js) sert hors de MAP_BUILDERS`])
  })
})
