import { describe, it, expect } from 'vitest'
import { MAIN_SRC as SRC, analyse, callsIn } from '../gfx/mainSource.js'

// Câblage des données de mission dans main.js (spec du lot 3, §2 a, approche B ; plan du lot 3a, tâche A2). main.js ne
// s'importe pas sous jsdom : cette garde lit son source.
// - mountLevel prend sa mission dans src/campaign/missions/ (missionFor), construit sa carte, puis y prend les lieux
//   que la mission cite (resoudreAncres sur les ancres de la carte) ;
// - plus rien ne lit les champs épars que rendaient les cartes avant la tâche (cameraPos, cameraTarget, spawnBounds,
//   hiddenTarget, moralLock, convoy, sideExit, party, indoors), sauf le nid du PvP (arena.nest.cameraPos, sa carte à
//   lui), ni src/levels.js (getLevel, currentLevelData) : ses données sont passées dans les missions.
//
// Témoin : sur le source d'avant la tâche (commit 71edf6a), la garde relève 21 défauts : les deux imports manquants,
// mountLevel sans mission ni ancres, l'import de src/levels.js, getLevel, currentLevelData et quatorze lectures des
// champs épars des cartes (vue rouge). Plus bas, chaque défaut est reproduit sur le source d'aujourd'hui et doit faire
// rougir la garde.

const MISSIONS = './campaign/missions/index.js'
const CHAMPS_DES_CARTES = ['cameraPos', 'cameraTarget', 'spawnBounds', 'hiddenTarget', 'moralLock', 'convoy', 'sideExit', 'party', 'indoors']

// Nœuds de l'arbre qui vérifient garder.
function noeuds(racine, garder) {
  const out = []
  const walk = n => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    if (typeof n.type === 'string' && garder(n)) out.push(n)
    for (const k in n) if (k !== 'parent') walk(n[k])
  }
  walk(racine)
  return out
}

function defauts(source) {
  const a = analyse(source)
  const texte = n => a.source.slice(n.start, n.end)
  const out = []
  for (const nom of ['missionFor', 'resoudreAncres']) {
    if (a.imports.get(nom)?.from !== MISSIONS) out.push(`${nom} n'est pas importé de ${MISSIONS}`)
  }
  const appels = callsIn(a, 'mountLevel') || []
  const carte = appels.findIndex(c => c.callee.startsWith('MAP_BUILDERS['))
  const mission = appels.find(c => c.callee === 'missionFor')
  const ancres = appels.findIndex(c => c.callee === 'resoudreAncres')
  if (!mission) out.push('mountLevel ne prend pas sa mission (missionFor)')
  else if (!/^missionFor\(n\)$/.test(source.slice(mission.start, mission.end))) out.push('mountLevel prend une autre mission que la sienne')
  if (ancres < 0) out.push('mountLevel ne prend pas ses lieux dans les ancres de sa carte (resoudreAncres)')
  else {
    if (carte < 0 || ancres < carte) out.push('mountLevel résout les ancres avant de construire la carte')
    const arg = source.slice(appels[ancres].start, appels[ancres].end)
    if (!/^resoudreAncres\(\s*\w+\s*,\s*\w+\.ancres\s*\)$/.test(arg)) out.push(`mountLevel résout autre chose que les ancres de sa carte : ${arg}`)
  }
  // Les champs épars des cartes d'avant la tâche, lus n'importe où dans main.js (le nid du PvP mis à part).
  const lectures = noeuds(a.program, n => n.type === 'MemberExpression' && !n.computed && CHAMPS_DES_CARTES.includes(n.property.name) &&
    texte(n.object) !== 'arena.nest')
  for (const n of lectures) out.push(`lit ${texte(n)}`)
  const decomposes = noeuds(a.program, n => n.type === 'Property' && n.key && CHAMPS_DES_CARTES.includes(n.key.name) &&
    n.value && n.value.type === 'Identifier' && n.shorthand)
  for (const n of decomposes) out.push(`décompose ${n.key.name}`)
  if ([...a.imports.values()].some(i => /(^|\/)levels(\.js)?$/.test(i.from))) out.push('importe src/levels.js')
  for (const nom of ['getLevel', 'currentLevelData']) {
    if (noeuds(a.program, n => n.type === 'Identifier' && n.name === nom).length) out.push(`utilise ${nom}`)
  }
  return out
}

describe('main.js : la mission décrite dans son fichier, les lieux pris dans les ancres de sa carte', () => {
  it('mountLevel prend sa mission et ses ancres ; plus aucun champ épars des cartes ni src/levels.js', () => {
    expect(defauts(SRC)).toEqual([])
  })
})

describe('témoins de la garde', () => {
  const corps = nom => {
    const a = analyse(SRC)
    const fn = a.fns.get(nom)
    expect(fn, `${nom} introuvable : témoin impossible`).toBeDefined()
    return { debut: fn.body.start + 1, fin: fn.body.end - 1 }
  }
  // Insère du code en tête de la fonction nom ; une mutation qui ne change rien est refusée.
  const enTete = (nom, code) => {
    const { debut } = corps(nom)
    const next = SRC.slice(0, debut) + '\n  ' + code + SRC.slice(debut)
    expect(next).not.toBe(SRC)
    return next
  }
  // Remplace l'appel de callee fait dans la fonction nom.
  const remplaceAppel = (nom, callee, par) => {
    const appel = (callsIn(analyse(SRC), nom) || []).find(c => c.callee === callee)
    expect(appel, `${nom} n'appelle pas ${callee} : témoin impossible`).toBeDefined()
    return SRC.slice(0, appel.start) + par + SRC.slice(appel.end)
  }

  it('la cible cachée relue dans la carte (currentMapInfo.hiddenTarget) : rouge', () => {
    expect(defauts(enTete('mountLevel', 'const hidden = currentMapInfo.hiddenTarget'))).toEqual(['lit currentMapInfo.hiddenTarget'])
  })

  it('le poste relu dans la carte, par décomposition (const { cameraPos } = …) : rouge', () => {
    expect(defauts(enTete('aimMissionCamera', 'const { cameraPos } = currentMapInfo'))).toEqual(['décompose cameraPos'])
  })

  it('src/levels.js de retour (getLevel) : rouge', () => {
    const next = "import { getLevel } from './levels.js'\n" + enTete('mountLevel', 'const niveau = getLevel(n)')
    expect(defauts(next)).toEqual(['importe src/levels.js', 'utilise getLevel'])
  })

  it('mountLevel sans missionFor : rouge', () => {
    expect(defauts(remplaceAppel('mountLevel', 'missionFor', 'MISSION_FIXE'))).toEqual(['mountLevel ne prend pas sa mission (missionFor)'])
  })

  it('mountLevel qui prend la mission 1 quel que soit n : rouge', () => {
    expect(defauts(remplaceAppel('mountLevel', 'missionFor', 'missionFor(1)'))).toEqual(['mountLevel prend une autre mission que la sienne'])
  })

  it('mountLevel sans resoudreAncres : rouge', () => {
    expect(defauts(remplaceAppel('mountLevel', 'resoudreAncres', '({})')))
      .toEqual(['mountLevel ne prend pas ses lieux dans les ancres de sa carte (resoudreAncres)'])
  })

  it('mountLevel qui prend ses lieux dans autre chose que les ancres de sa carte : rouge', () => {
    const d = defauts(remplaceAppel('mountLevel', 'resoudreAncres', 'resoudreAncres(currentMission, currentMapInfo)'))
    expect(d).toEqual(['mountLevel résout autre chose que les ancres de sa carte : resoudreAncres(currentMission, currentMapInfo)'])
  })

  it('le nid du PvP (arena.nest.cameraPos) n\'est pas une carte de mission : vert', () => {
    expect(SRC).toMatch(/arena\.nest\.cameraPos/)
    expect(defauts(SRC).some(d => d.includes('arena.nest'))).toBe(false)
  })
})
