import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { analyse, callsIn, callsInNode, topLevelCalls, readSource } from './gfx/mainSource.js'

// Le menu a son décor à lui (spec du lot 3, §2 a, et §2 3b, choix « Menu », approche B ; plan du lot 3a, tâche A1) :
// la rue de M1 d'avant le lot 3, figée dans src/maps/menu.js (buildMenuDecor), se monte derrière le menu au démarrage
// et au retour d'une mission (main.js : appel de premier niveau, showMenu), et au retour du PvP (QUITTER, quitToMenu de
// pvp.js). La carte de M1 (MAP_BUILDERS[0], src/maps/m1-rue.js) ne sert plus qu'à M1 : le sous-lot 3b peut la réécrire
// sans toucher au menu, qui garde ses références du memtest du lot 1 et les immeubles autour desquels tourne sa caméra.
// À l'écran, rien ne distingue encore les deux décors (même rue, captures identiques à l'octet) : cette garde lit donc
// le source de main.js et de pvp.js, comme celles de tests/gfx/main.*.test.js.
//
// Témoin : au commit b31f2d2, le menu emprunte la carte de M1 (MAP_BUILDERS[0]() au démarrage, dans showMenu et dans
// quitToMenu) : la garde y est rouge (vue avant le découpage de src/maps.js).

const ROOT = resolve(__dirname, '..')
const MAPS = './maps/index.js'
const MAIN = 'src/main.js', PVP = 'src/pvp.js'

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
const importe = (a, nom) => a.imports.get(nom)?.from === MAPS

function defauts(sources) {
  const out = []
  const main = analyse(sources.get(MAIN)), pvp = analyse(sources.get(PVP))
  if (!importe(main, 'buildMenuDecor')) out.push(`main.js : buildMenuDecor n'est pas importé de ${MAPS}`)
  if (!topLevelCalls(main).some(c => c.callee === 'buildMenuDecor')) {
    out.push("main.js : le décor du menu n'est pas monté au démarrage")
  }
  if (!appelle(main, 'showMenu', 'buildMenuDecor')) out.push("main.js : showMenu n'appelle pas buildMenuDecor()")
  if (!importe(pvp, 'buildMenuDecor')) out.push(`pvp.js : buildMenuDecor n'est pas importé de ${MAPS}`)
  if (!appelle(pvp, 'quitToMenu', 'buildMenuDecor')) out.push("pvp.js : quitToMenu n'appelle pas buildMenuDecor()")
  // Une carte de mission ne se monte que par son numéro de mission (mountLevel, sonde de lisibilité) : un indice écrit
  // en dur, c'est le menu qui emprunte la carte de M1.
  for (const [path, text] of sources) {
    if (!text.includes('MAP_BUILDERS')) continue
    const a = analyse(text)
    if (callsInNode(a, a.program).some(c => /^MAP_BUILDERS\s*\[\s*0\s*\]$/.test(c.callee))) {
      out.push(`${path} : le menu emprunte la carte de M1 (MAP_BUILDERS[0])`)
    }
  }
  return out
}

describe('le menu a son décor à lui', () => {
  it('main.js et pvp.js montent le décor du menu (src/maps/menu.js), jamais la carte de M1', () => {
    expect(defauts(SOURCES)).toEqual([])
  })
})

// Témoins : remettre la carte de M1 derrière le menu à un seul des trois endroits, ou remplacer l'import de pvp.js par
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
    expect(d).toContain("pvp.js : quitToMenu n'appelle pas buildMenuDecor()")
    expect(d).toContain(`${PVP} : le menu emprunte la carte de M1 (MAP_BUILDERS[0])`)
  })

  it('pvp.js avec une copie locale de buildMenuDecor : rouge', () => {
    const s = analyse(SOURCES.get(PVP)).imports.get('buildMenuDecor')?.node
    expect(s, "pvp.js n'importe déjà plus buildMenuDecor : témoin impossible").toBeDefined()
    const src = SOURCES.get(PVP)
    const next = src.slice(0, s.start) + 'buildMenuDecor as buildMenuDecorImporte' + src.slice(s.end) +
      '\nfunction buildMenuDecor() {}\n'
    expect(defauts(avec(PVP, next))).toContain(`pvp.js : buildMenuDecor n'est pas importé de ${MAPS}`)
  })
})
