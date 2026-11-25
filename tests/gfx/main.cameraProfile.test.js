import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsIn, callsInNode } from './mainSource.js'

// Câblage du profil de caméra dans main.js (spec du lot 3, §2 b ; plan du lot 3a, tâche A3). main.js ne s'importe pas
// sous jsdom : cette garde lit son source. Les pièces ont leurs tests de comportement : applyCameraProfile et
// resetCameraProfile dans cameraProfile.test.js ; le menu (démarrage, showMenu, QUITTER du PvP) et le départ d'une
// manche PvP, qui reviennent d'eux-mêmes au profil hors mission, dans cameraProfile.horsMission.test.js ; la fin de
// l'enquête (stopInvestigation, src/prologue/stop.js : l'arrêt, puis le profil hors mission), sur la vraie enquête, dans
// tests/prologue/stop.test.js.
// - mountLevel applique le profil de SA mission (m.profil) après avoir construit sa carte : la carte règle ses lumières
//   (setLighting, qui remet le soleil à sa place par défaut) et ne pose plus de brume, le profil vient ensuite ;
// - toute fin de l'enquête passe par stopInvestigation, importé de src/prologue/stop.js, sur la caméra, la scène et le
//   soleil du jeu : achevée (run.next), abandonnée (abortInvestigation), ou finie pendant son démarrage (la poignée que
//   rend startInvestigation arrive quand la course est déjà finie) ; plus rien d'autre n'arrête l'enquête, ni sa poignée
//   (run.handle.stop…), ni ce que rend startInvestigation ;
// - la sonde de lisibilité (?sonde=1), sur la carte d'une mission, part du profil de cette mission (sa brume, dont la
//   sonde garde la couleur) avant de poser le sien.
//
// Témoins : sur le source d'avant la tâche (commit 69ab74a), la garde relève dix défauts ; sur celui de la tâche
// (c8c16cd : stopInvestigation propre à main.js, appelé sans la caméra, la scène ni le soleil, et une enquête finie
// pendant son démarrage arrêtée par h.stop(), sans remise à zéro), six (vues rouges, relecture de A3). Plus bas, chaque
// défaut est reproduit sur le source d'aujourd'hui et doit faire rougir la garde.

const PROFIL = './gfx/cameraProfile.js'
const FIN = './prologue/stop.js'
const IMPORTS = [['applyCameraProfile', PROFIL], ['stopInvestigation', FIN]]
const DE_LA_MISSION = /^applyCameraProfile\(\s*camera\s*,\s*scene\s*,\s*sun\s*,\s*(m|currentMission)\.profil\s*\)$/
const DE_SA_CARTE = /^applyCameraProfile\(\s*camera\s*,\s*scene\s*,\s*sun\s*,\s*missionFor\(\s*n\s*\)\.profil\s*\)$/
const ARRET = /^stopInvestigation\(\s*run\s*,\s*camera\s*,\s*scene\s*,\s*sun\s*\)$/
const FONCTION = /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/
const START = /(^|\.)startInvestigation$/

const est = (a, node, texte) => !!node && a.source.slice(node.start, node.end) === texte

// Nœuds de l'arbre qui passent le test, en profondeur, dans l'ordre du source.
function tous(root, test) {
  const out = []
  const walk = node => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach(walk)
    if (test(node)) out.push(node)
    for (const k in node) if (k !== 'parent') walk(node[k])
  }
  walk(root)
  return out
}
const trouver = (root, test) => tous(root, test)[0] || null

// Le bloc de la route ?sonde=1 (if (q.has('sonde')) { … }), à toute profondeur.
const routeSonde = a => trouver(a.program, n => n.type === 'IfStatement' && est(a, n.test, "q.has('sonde')"))

// La fonction posée en run.next dans investigate : la fin d'une enquête achevée.
function finAchevee(a) {
  const fn = a.fns.get('investigate')
  return fn && trouver(fn.body, n => n.type === 'AssignmentExpression' && est(a, n.left, 'run.next') && FONCTION.test(n.right.type))?.right
}

// Le démarrage de l'enquête dans investigate : l'appel de startInvestigation et la fonction la plus intérieure qui le
// contient ; si la course est déjà finie quand la poignée arrive, c'est là, après l'appel, qu'elle s'arrête.
function demarrage(a) {
  const fn = a.fns.get('investigate')
  if (!fn) return null
  const appel = callsInNode(a, fn.body).find(c => START.test(c.callee))
  if (!appel) return null
  const dans = tous(fn.body, n => FONCTION.test(n.type) && n.start <= appel.start && appel.end <= n.end)
    .sort((x, y) => (x.end - x.start) - (y.end - y.start))[0]
  return dans ? { appel, fn: dans } : null
}

function defauts(source) {
  const a = analyse(source)
  const texte = c => source.slice(c.start, c.end)
  const out = []
  for (const [nom, de] of IMPORTS) {
    if (a.imports.get(nom)?.from !== de) out.push(`${nom} n'est pas importé de ${de}`)
  }

  // Montage : le profil de sa mission, après sa carte.
  const montage = callsIn(a, 'mountLevel') || []
  const carte = montage.findIndex(c => c.callee.startsWith('MAP_BUILDERS['))
  const profil = montage.findIndex(c => c.callee === 'applyCameraProfile')
  if (profil < 0) out.push('mountLevel n\'applique pas le profil de sa mission (applyCameraProfile)')
  else {
    if (!DE_LA_MISSION.test(texte(montage[profil]))) out.push(`mountLevel applique autre chose que le profil de sa mission : ${texte(montage[profil])}`)
    if (carte < 0 || profil < carte) out.push('mountLevel applique le profil avant de construire sa carte')
  }

  // Fin de l'enquête : chacune passe par stopInvestigation, sur la caméra, la scène et le soleil du jeu.
  const arretee = (appels, quoi) => {
    if (!appels.some(c => c.callee === 'stopInvestigation')) out.push(`${quoi} n'est pas arrêtée par stopInvestigation`)
  }
  const next = finAchevee(a)
  arretee(next ? callsInNode(a, next.body) : [], 'l\'enquête achevée (run.next)')
  arretee(callsIn(a, 'abortInvestigation') || [], 'l\'enquête abandonnée (abortInvestigation)')
  const d = demarrage(a)
  arretee(d ? callsInNode(a, d.fn.body).filter(c => c.start >= d.appel.end) : [], 'l\'enquête finie pendant son démarrage')
  const appels = callsInNode(a, a.program)
  for (const c of appels) {
    if (c.callee === 'stopInvestigation' && !ARRET.test(texte(c))) {
      out.push(`stopInvestigation arrête l'enquête sur autre chose que la caméra, la scène et le soleil du jeu : ${texte(c)}`)
    }
  }
  // Ailleurs, plus rien n'arrête une enquête : ni sa poignée (run.handle.stop, enquete.handle.stop…), ni ce que rend
  // startInvestigation (const h = m.startInvestigation(…), puis h.stop()).
  const rendu = n => !!n && n.type === 'CallExpression' && START.test(texte(n.callee))
  const poignees = new Set([
    ...tous(a.program, n => n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && rendu(n.init)).map(n => n.id.name),
    ...tous(a.program, n => n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && rendu(n.right)).map(n => n.left.name),
  ])
  const fonctionDe = pos => [...a.fns].find(([, fn]) => fn.start <= pos && pos < fn.end)?.[0] || 'main.js'
  for (const c of appels) {
    const objet = /^(.+)\.stop$/.exec(c.callee)?.[1]
    if (objet && (/\.handle$/.test(objet) || poignees.has(objet))) {
      out.push(`${fonctionDe(c.start)} arrête l'enquête sans remettre le profil (${c.callee})`)
    }
  }

  // Sonde de lisibilité : sur la carte d'une mission, le profil de cette mission.
  const sonde = routeSonde(a)
  if (!sonde) out.push('route ?sonde=1 introuvable')
  else {
    const dansSonde = callsInNode(a, sonde.consequent)
    const carteSonde = dansSonde.findIndex(c => c.callee.startsWith('MAP_BUILDERS['))
    const profilSonde = dansSonde.findIndex(c => c.callee === 'applyCameraProfile' && DE_SA_CARTE.test(texte(c)))
    if (profilSonde < 0) out.push('la sonde ne part pas du profil de la mission de sa carte (applyCameraProfile(…, missionFor(n).profil))')
    else if (carteSonde < 0 || profilSonde < carteSonde) out.push('la sonde applique le profil de la mission avant de construire sa carte')
  }
  return out
}

describe('main.js : le profil de caméra appliqué au montage, remis à zéro à chaque fin de l\'enquête', () => {
  it('mountLevel, la fin de l\'enquête et la sonde de lisibilité', () => {
    expect(defauts(SRC)).toEqual([])
  })
})

describe('témoins de la garde', () => {
  const muter = next => { expect(next).not.toBe(SRC); return next }
  const appel = (fn, callee) => {
    const c = (callsIn(analyse(SRC), fn) || []).find(x => x.callee === callee)
    expect(c, `${fn} n'appelle déjà plus ${callee}() : témoin impossible`).toBeDefined()
    return c
  }
  const remplace = (c, par) => muter(SRC.slice(0, c.start) + par + SRC.slice(c.end))
  // Un texte du source, présent une seule fois, remplacé.
  const remplaceTexte = (src, de, par) => {
    expect(src.split(de).length - 1, `« ${de} » : témoin impossible`).toBe(1)
    return src.split(de).join(par)
  }

  it('mountLevel sans le profil de sa mission : rouge', () => {
    expect(defauts(remplace(appel('mountLevel', 'applyCameraProfile'), 'void 0')))
      .toEqual(['mountLevel n\'applique pas le profil de sa mission (applyCameraProfile)'])
  })

  it('mountLevel qui applique le profil de M1 quelle que soit la mission : rouge', () => {
    const d = defauts(remplace(appel('mountLevel', 'applyCameraProfile'), 'applyCameraProfile(camera, scene, sun, missionFor(1).profil)'))
    expect(d).toEqual(['mountLevel applique autre chose que le profil de sa mission : applyCameraProfile(camera, scene, sun, missionFor(1).profil)'])
  })

  it('mountLevel qui applique le profil avant de construire sa carte (setLighting remettrait le soleil par défaut) : rouge', () => {
    const c = appel('mountLevel', 'applyCameraProfile')
    const carte = (callsIn(analyse(SRC), 'mountLevel') || []).find(x => x.callee.startsWith('MAP_BUILDERS['))
    expect(carte, 'mountLevel ne construit déjà plus sa carte : témoin impossible').toBeDefined()
    const sans = SRC.slice(0, c.start) + 'void 0' + SRC.slice(c.end)
    // Le même appel, remis en tête de mountLevel.
    const fn = analyse(sans).fns.get('mountLevel')
    const next = muter(sans.slice(0, fn.body.start + 1) + '\n  ' + SRC.slice(c.start, c.end) + sans.slice(fn.body.start + 1))
    expect(defauts(next)).toEqual(['mountLevel applique le profil avant de construire sa carte'])
  })

  it('une enquête achevée (run.next) qui ne passe pas par stopInvestigation : rouge', () => {
    const a = analyse(SRC)
    const next = finAchevee(a)
    const c = next && callsInNode(a, next.body).find(x => x.callee === 'stopInvestigation')
    expect(c, 'run.next n\'appelle déjà plus stopInvestigation : témoin impossible').toBeDefined()
    expect(defauts(remplace(c, 'void 0'))).toEqual(['l\'enquête achevée (run.next) n\'est pas arrêtée par stopInvestigation'])
  })

  it('abortInvestigation qui arrête l\'enquête elle-même, sans stopInvestigation : rouge', () => {
    const d = defauts(remplace(appel('abortInvestigation', 'stopInvestigation'), 'run.handle && run.handle.stop()'))
    expect(d).toEqual([
      'l\'enquête abandonnée (abortInvestigation) n\'est pas arrêtée par stopInvestigation',
      'abortInvestigation arrête l\'enquête sans remettre le profil (run.handle.stop)',
    ])
  })

  it('une enquête finie pendant son démarrage arrêtée par sa poignée, comme avant la relecture (h.stop()) : rouge', () => {
    let next = remplaceTexte(SRC, 'run.handle = m.startInvestigation(', 'const h = m.startInvestigation(')
    next = muter(remplaceTexte(next, 'if (run.ended) { stopInvestigation(run, camera, scene, sun); return }',
      'if (run.ended) { try { h.stop() } catch (e) { /* déjà démontée */ } return }\n      run.handle = h'))
    expect(defauts(next)).toEqual([
      'l\'enquête finie pendant son démarrage n\'est pas arrêtée par stopInvestigation',
      'investigate arrête l\'enquête sans remettre le profil (h.stop)',
    ])
  })

  it('stopInvestigation sans la caméra, la scène et le soleil du jeu : rouge', () => {
    expect(defauts(remplace(appel('abortInvestigation', 'stopInvestigation'), 'stopInvestigation(run)')))
      .toEqual(['stopInvestigation arrête l\'enquête sur autre chose que la caméra, la scène et le soleil du jeu : stopInvestigation(run)'])
  })

  it('la sonde sans le profil de la mission de sa carte : rouge', () => {
    const a = analyse(SRC)
    const c = callsInNode(a, routeSonde(a).consequent).find(x => x.callee === 'applyCameraProfile')
    expect(c, 'la sonde n\'applique déjà plus de profil : témoin impossible').toBeDefined()
    expect(defauts(remplace(c, 'void 0')))
      .toEqual(['la sonde ne part pas du profil de la mission de sa carte (applyCameraProfile(…, missionFor(n).profil))'])
  })

  for (const [nom, de] of IMPORTS) {
    it(`${nom} remplacé par une copie locale : rouge`, () => {
      const s = analyse(SRC).imports.get(nom)?.node
      expect(s, `${nom} n'est déjà plus importé : témoin impossible`).toBeDefined()
      const next = muter(SRC.slice(0, s.start) + `${nom} as ${nom}Importe` + SRC.slice(s.end) + `\nfunction ${nom}() {}\n`)
      expect(defauts(next)).toEqual([`${nom} n'est pas importé de ${de}`])
    })
  }
})
