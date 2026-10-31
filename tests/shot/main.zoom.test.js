import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { MAIN_SRC, analyse, callsIn, executer } from '../gfx/mainSource.js'
import { bornesDuZoom, zoomApresCran } from '../../src/aim.js'
import { getStats, state as amelioration } from '../../src/upgrades.js'
import { MISSIONS } from '../../src/campaign/missions/index.js'

// Zoom de la lunette réglé par mission dans main.js (spec du lot 3, §2 c, précisions de la tâche A5, et décision 2 ;
// plan du lot 3a, tâche A5) :
// - au montage (mountLevel), la lunette part du zoom de départ de sa mission (zoom.depart), posé d'un coup ;
// - la molette (zoomALaMolette, l'écouteur « wheel » du document) va du minimum de la mission à son maximum, que
//   l'amélioration Lunette relève : × (1 + 0,15 × niveau), getStats().maxZoomScale ; un cran vaut 0,5, sur la grille de
//   ce pas (bornesDuZoom et zoomApresCran, src/aim.js).
// zoomALaMolette et l'appel de setZoom de mountLevel sont exécutés tels quels (executer, tests/gfx/mainSource.js :
// main.js ne s'importe pas sous jsdom), sur la vraie lunette du jeu (src/scope.js), avec le vrai getStats
// (src/upgrades.js) et les vraies bornesDuZoom et zoomApresCran.
//
// Deux missions : M1, au zoom des six missions d'aujourd'hui (×4 au départ, de ×3 à ×6), et une mission de longue
// distance, M4 telle que le sous-lot 3c la fera (spec §3 : de ×8 à ×20, départ à ×8).
//
// Témoins : le zoom d'avant la tâche (commit 4b6e4e8), ×4 au départ dans toute mission (setZoom(4, …) dans
// mountLevel), puis la molette de ×3 à 6 + 2 × niveau de Lunette quelle que soit la mission (son écouteur et le getStats
// d'alors, exécutés tels quels plus bas). Vus rouges sur ce zoom d'avant (son écouteur nommé zoomALaMolette, sans rien
// changer à son corps) : le départ (×4 au lieu de ×8), les bornes de M1 aux niveaux de la Lunette (×8 au niveau 1 au
// lieu de ×6,9), celles de la mission de longue distance (de ×3 à ×6 au lieu de ×8 à ×20), les bornes de la mission en
// cours et le dernier cran sous ×6,9 (×7 au niveau 1). Restent verts, comme voulu (non-régression), les crans de M1 sans
// la Lunette et la molette sans effet lunette baissée. Les témoins plus bas reproduisent ces écarts sur le source
// d'aujourd'hui. Témoins par mutation du main.js d'aujourd'hui (vus rouges) : le départ fixe à ×4, le départ lissé depuis
// la mission d'avant (setZoom sans instant : [8, 12]), la molette sans la garde de la lunette baissée, puis sans celle
// de la phase.

const M1 = MISSIONS[0]
const LOIN = { ...MISSIONS[3], zoom: { depart: 8, min: 8, max: 20 } }   // M4 au sous-lot 3c (spec §3)

let S   // la lunette du jeu
beforeAll(async () => {
  document.body.innerHTML = '<canvas id="scope-canvas" style="display:none"></canvas>'
  S = await import('../../src/scope.js')
})
afterEach(() => { amelioration.levels.zoom = 0 })

// L'écouteur de la molette d'avant la tâche (main.js, 4b6e4e8 : une fonction fléchée passée à
// document.addEventListener('wheel', …)), son corps tel quel sous le nom d'aujourd'hui, et le getStats d'alors
// (src/upgrades.js : maxZoom: 6 + l.zoom * 2, sans maxZoomScale).
const MOLETTE_D_AVANT = `function zoomALaMolette(e) {
  if (!isVisible() || gamePhase !== 'playing') return
  const stats = getStats()
  const cur = getZoom()
  const next = Math.max(3, Math.min(stats.maxZoom, cur + (e.deltaY > 0 ? -0.5 : 0.5)))
  setZoom(next)   // le champ de vision suit dans loop() (syncFov)
}`
const getStatsDAvant = () => ({ maxZoom: 6 + amelioration.levels.zoom * 2 })
const MONTAGE_D_AVANT = 'setZoom(4, { instant: true })'

// Le source d'aujourd'hui, la molette remplacée par celle d'avant la tâche.
function avecMoletteDAvant() {
  const fn = analyse(MAIN_SRC).fns.get('zoomALaMolette')
  expect(fn, 'zoomALaMolette introuvable : témoin impossible').toBeDefined()
  return MAIN_SRC.slice(0, fn.start) + MOLETTE_D_AVANT + MAIN_SRC.slice(fn.end)
}

// L'appel de setZoom fait par mountLevel (un seul).
function appelDuMontage(source) {
  const a = analyse(source)
  const appels = (callsIn(a, 'mountLevel') || []).filter(c => c.callee === 'setZoom')
  expect(appels, 'mountLevel pose le zoom de la lunette, une fois').toHaveLength(1)
  return source.slice(appels[0].start, appels[0].end)
}

// Le montage d'une mission, pour la lunette : l'appel de setZoom de mountLevel, exécuté tel quel, sa mission en m (comme
// dans mountLevel, const m = currentMission = missionFor(n)).
function monter(mission, source = MAIN_SRC) {
  new Function('setZoom', 'm', 'currentMission', `'use strict'\n${appelDuMontage(source)}`)(S.setZoom, mission, mission)
}

// n crans de molette, lunette tenue pendant la mission (n > 0 : on grossit, la molette poussée, deltaY négatif ;
// n < 0 : on élargit). → le zoom choisi après chaque cran.
function molette(mission, n, { source = MAIN_SRC, stats = getStats, visible = true, phase = 'playing' } = {}) {
  const { fns } = executer(['zoomALaMolette'], {
    isVisible: () => visible, gamePhase: phase, currentMission: mission, getStats: stats,
    getZoom: S.getZoom, setZoom: S.setZoom, bornesDuZoom, zoomApresCran,
  }, source)
  const vus = []
  for (let i = 0; i < Math.abs(n); i++) {
    fns.zoomALaMolette({ deltaY: n > 0 ? -100 : 100 })
    vus.push(S.getZoom())
  }
  return vus
}

// Le plus grand et le plus petit zoom que la molette atteint dans la mission, depuis son départ, au niveau de Lunette
// donné.
function course(mission, niveau, options = {}) {
  amelioration.levels.zoom = niveau
  monter(mission, options.montage)
  const max = molette(mission, 60, options).at(-1)
  const min = molette(mission, -60, options).at(-1)
  return { min, max }
}

describe('au montage, la lunette part du zoom de départ de sa mission, posé d\'un coup', () => {
  it('la mission de longue distance : ×8 ; M1 : ×4 ; sans lissage depuis le zoom de la mission d\'avant', () => {
    S.setZoom(12, { instant: true })   // la mission d'avant, quittée à ×12
    monter(LOIN)
    expect([S.getZoom(), S.getEffectiveZoom()]).toEqual([8, 8])
    monter(M1)
    expect([S.getZoom(), S.getEffectiveZoom()]).toEqual([4, 4])
  })
})

describe('la molette va du minimum de la mission à son maximum, relevé par la Lunette (décision 2)', () => {
  it('M1 (×6 de base) : ×6 sans la Lunette, puis ×6,9, ×7,8 et ×8,7 du niveau 1 au niveau 3 ; ×3 au moins', () => {
    const vus = [0, 1, 2, 3].map(n => course(M1, n))
    const attendus = [6, 6.9, 7.8, 8.7]
    vus.forEach((c, n) => {
      expect(c.max, `Lunette au niveau ${n}`).toBeCloseTo(attendus[n], 9)
      expect(c.min, `Lunette au niveau ${n}`).toBe(3)
    })
  })

  it('la mission de longue distance : de ×8 à ×20 sans la Lunette, ×29 au niveau 3', () => {
    const sans = course(LOIN, 0), lunette = course(LOIN, 3)
    expect(sans).toEqual({ min: 8, max: 20 })
    expect(lunette.min).toBe(8)
    expect(lunette.max).toBeCloseTo(29, 9)
  })

  it('les bornes sont celles de la mission en cours : la même molette, une autre mission, d\'autres bornes', () => {
    expect(course(M1, 1).max).toBeCloseTo(6.9, 9)
    expect(course(LOIN, 1).max).toBeCloseTo(23, 9)
    expect(course(M1, 1).max).toBeCloseTo(6.9, 9)
  })
})

describe('un cran vaut 0,5, sur la grille de ce pas', () => {
  it('M1 sans la Lunette : les crans d\'avant la tâche, de ×4 à ×6 puis jusqu\'à ×3', () => {
    monter(M1)
    expect(molette(M1, 6)).toEqual([4.5, 5, 5.5, 6, 6, 6])
    expect(molette(M1, -8)).toEqual([5.5, 5, 4.5, 4, 3.5, 3, 3, 3])
  })

  it('M1, Lunette au niveau 1 : ×6,9 au dernier cran, et le cran suivant vers le large revient sur la grille (×6,5)', () => {
    amelioration.levels.zoom = 1
    monter(M1)
    expect(molette(M1, 6).at(-1)).toBeCloseTo(6.9, 9)
    expect(molette(M1, -2)).toEqual([6.5, 6])
  })
})

describe('lunette baissée, ou hors de la mission en cours : la molette ne change rien', () => {
  it('lunette baissée, en pause, à l\'échec : le zoom reste où il est', () => {
    monter(M1)
    expect(molette(M1, 3, { visible: false })).toEqual([4, 4, 4])
    for (const phase of ['paused', 'dead', 'cleared', 'menu']) expect(molette(M1, 3, { phase }), phase).toEqual([4, 4, 4])
  })
})

// Appels (nœuds CallExpression) faits dans tout le programme, fonctions imbriquées comprises, dans l'ordre du source.
function appels(a) {
  const out = []
  const walk = n => {
    if (Array.isArray(n)) return n.forEach(walk)
    if (!n || typeof n !== 'object') return
    if (n.type === 'CallExpression') out.push(n)
    for (const k in n) if (k !== 'parent') walk(n[k])
  }
  walk(a.program)
  return out.sort((x, y) => x.start - y.start)
}

// Câblage (lecture du source) : zoomALaMolette est bien l'écouteur de la molette, et setZoom n'est appelé que par
// mountLevel (le départ) et par elle.
function defautsDuCablage(source) {
  const a = analyse(source)
  const texte = n => source.slice(n.start, n.end)
  const out = []
  const ecouteurs = appels(a).filter(n => texte(n.callee) === 'document.addEventListener' &&
    n.arguments[0] && n.arguments[0].value === 'wheel')
  if (ecouteurs.length !== 1) out.push(`${ecouteurs.length} écouteurs de la molette`)
  for (const n of ecouteurs) {
    if (texte(n.arguments[1]) !== 'zoomALaMolette') out.push(`l'écouteur de la molette n'est pas zoomALaMolette : ${texte(n.arguments[1]).split('\n')[0]}`)
  }
  for (const c of appels(a).filter(n => texte(n.callee) === 'setZoom')) {
    const dans = [...a.fns.entries()].find(([, fn]) => fn.start <= c.start && c.end <= fn.end)
    if (!dans || !['mountLevel', 'zoomALaMolette'].includes(dans[0])) out.push(`setZoom appelé hors de mountLevel et de la molette : ${texte(c)}`)
  }
  return out
}

describe('câblage : la molette du jeu est zoomALaMolette, le zoom n\'est posé qu\'au montage et par elle', () => {
  it('aucun défaut', () => {
    expect(defautsDuCablage(MAIN_SRC)).toEqual([])
  })
})

describe('témoins : le zoom d\'avant la tâche (4b6e4e8)', () => {
  it('montage : ×4 dans toute mission (setZoom(4, …)), là où la mission de longue distance part de ×8', () => {
    const avant = MAIN_SRC.replace(appelDuMontage(MAIN_SRC), MONTAGE_D_AVANT)
    expect(avant).not.toBe(MAIN_SRC)
    monter(LOIN, avant)
    expect(S.getZoom()).toBe(4)
  })

  it('molette : le maximum fixe 6 + 2 × niveau, ×3 au moins, quelle que soit la mission', () => {
    const avant = { source: avecMoletteDAvant(), stats: getStatsDAvant, montage: MAIN_SRC.replace(appelDuMontage(MAIN_SRC), MONTAGE_D_AVANT) }
    expect([0, 1, 2, 3].map(n => course(M1, n, avant).max), 'M1').toEqual([6, 8, 10, 12])
    expect(course(LOIN, 0, avant), 'mission de longue distance, sans la Lunette').toEqual({ min: 3, max: 6 })
    expect(course(LOIN, 3, avant), 'mission de longue distance, Lunette au niveau 3').toEqual({ min: 3, max: 12 })
  })

  it('molette d\'avant, sous un maximum hors de la grille (×6,9) : le cran vers le large tombe hors de la grille (×6,4)', () => {
    amelioration.levels.zoom = 1
    const { max } = bornesDuZoom(M1.zoom, getStats().maxZoomScale)   // le maximum d'aujourd'hui, ×6,9
    monter(M1)
    expect(molette(M1, 6, { source: avecMoletteDAvant(), stats: () => ({ maxZoom: max }) }).at(-1)).toBeCloseTo(6.9, 9)
    expect(molette(M1, -1, { source: avecMoletteDAvant(), stats: () => ({ maxZoom: max }) })[0]).toBeCloseTo(6.4, 9)
  })

  it('câblage d\'avant (une fonction fléchée en écouteur, son setZoom hors de toute fonction nommée) : relevé', () => {
    const fn = analyse(MAIN_SRC).fns.get('zoomALaMolette')
    const corps = MOLETTE_D_AVANT.slice(MOLETTE_D_AVANT.indexOf('{') + 1, MOLETTE_D_AVANT.lastIndexOf('}'))
    const avant = (MAIN_SRC.slice(0, fn.start) + MAIN_SRC.slice(fn.end))
      .replace("document.addEventListener('wheel', zoomALaMolette, { passive: true })",
        `document.addEventListener('wheel', e => {${corps}}, { passive: true })`)
    expect(avant).toContain("document.addEventListener('wheel', e => {")
    expect(defautsDuCablage(avant)).toEqual([
      'l\'écouteur de la molette n\'est pas zoomALaMolette : e => {',
      'setZoom appelé hors de mountLevel et de la molette : setZoom(next)',
    ])
  })

  it('un second zoom posé ailleurs (à la reprise après la pause, par exemple) : relevé', () => {
    const fn = analyse(MAIN_SRC).fns.get('resumeGame')
    expect(fn, 'resumeGame introuvable : témoin impossible').toBeDefined()
    const debut = fn.body.start + 1
    const avant = MAIN_SRC.slice(0, debut) + '\n  setZoom(4)' + MAIN_SRC.slice(debut)
    expect(defautsDuCablage(avant)).toEqual(['setZoom appelé hors de mountLevel et de la molette : setZoom(4)'])
  })
})
