import { describe, it, expect } from 'vitest'
import { fuiteParSorties, issuesDe, issueLaPlusProche, arrive, messageDeFuite, creerFuite, MESSAGES_DE_FUITE } from '../../src/campaign/escape.js'
import { FUITE } from '../../src/shot/tuning.js'
import { MISSIONS } from '../../src/campaign/missions/index.js'
import { moduleModifie } from './moduleModifie.js'

// La fuite des cibles (spec du lot 3, §2 f, approche B, et décision 4 ; plan du lot 3a, tâche A8). Une mission qui
// déclare des sorties ou des abris (des ancres nommées de sa carte) échoue quand une cible en fuite en atteint un, à
// FUITE.rayonArriveeM près ; en option (perteDeVueS), quand une cible en fuite reste hors de la vue du tireur plus de
// perteDeVueS secondes. Sans sortie ni abri, le cône d'aujourd'hui décide : une cible en fuite hors du cône de 80° de la
// caméra, à plus de 12 m d'elle.
//
// Témoins (par mutation de src/campaign/escape.js, chacune vue rouge, deux rejouées plus bas) : le cône appliqué aussi à
// une mission à sorties ; l'arrivée comptée au-delà du rayon ; une cible qui marche comptée comme en fuite ; le temps
// caché qui ne repart pas de zéro quand la cible revient en vue.

const pnj = (x, z, o = {}) => ({ alive: true, isTarget: true, onVehicle: false, state: 'flee', mesh: { position: { x, y: 0, z } }, ...o })
const LIEUX = { sorties: { ruelle: { x: -10, z: -22 }, porte: { x: 12, z: -30 } }, abris: { igloo: { x: 30, z: 0 } } }
const mission = o => ({ numero: 2, sorties: [], abris: [], perteDeVueS: null, ...o })
const jamais = () => false, toujours = () => true

// Deux cas joués sur le module, et sur ses copies fautives (témoins rejoués, plus bas).
function casSortieSansCone({ creerFuite }) {
  const f = creerFuite(mission({ sorties: ['ruelle'] }), LIEUX)
  const c = pnj(-5, -20)
  expect(f.verifier([c], 1 / 60, { horsDuCone: toujours, enVue: toujours }), 'hors du cône, loin de la ruelle').toBe(null)
  c.mesh.position.x = -10.3; c.mesh.position.z = -22.2
  expect(f.verifier([c], 1 / 60, { horsDuCone: jamais, enVue: toujours }))
    .toEqual({ cible: c, cause: 'sortie', issue: { nom: 'ruelle', sorte: 'sortie', x: -10, z: -22 }, message: MESSAGES_DE_FUITE.sortie })
}
function casQuiMarche({ creerFuite }) {
  const f = creerFuite(mission({ sorties: ['ruelle'] }), LIEUX)
  expect(f.verifier([pnj(-10, -22, { state: 'walk' })], 1 / 60, { horsDuCone: jamais, enVue: toujours })).toBe(null)
}

describe('fuiteParSorties : une mission à sorties ou abris', () => {
  it('les six missions d\'aujourd\'hui n\'en ont pas : le cône décide', () => {
    for (const m of MISSIONS) expect(fuiteParSorties(m), `M${m.numero}`).toBe(false)
  })
  it('une sortie ou un abri suffit', () => {
    expect(fuiteParSorties(mission({ sorties: ['ruelle'] }))).toBe(true)
    expect(fuiteParSorties(mission({ abris: ['igloo'] }))).toBe(true)
  })
})

describe('les issues : sorties et abris de la mission, pris dans ses lieux', () => {
  const m = mission({ sorties: ['ruelle', 'porte'], abris: ['igloo'] })

  it('issuesDe : chacune, son nom, sa sorte et sa place, dans l\'ordre des champs', () => {
    expect(issuesDe(m, LIEUX)).toEqual([
      { nom: 'ruelle', sorte: 'sortie', x: -10, z: -22 },
      { nom: 'porte', sorte: 'sortie', x: 12, z: -30 },
      { nom: 'igloo', sorte: 'abri', x: 30, z: 0 },
    ])
  })

  it('issueLaPlusProche : la plus proche, avec sa distance ; null sans issue', () => {
    expect(issueLaPlusProche([-2, -19.5], issuesDe(m, LIEUX))).toEqual({ nom: 'ruelle', sorte: 'sortie', x: -10, z: -22, distance: Math.hypot(8, 2.5) })
    expect(issueLaPlusProche([25, 0], issuesDe(m, LIEUX)).nom).toBe('igloo')
    expect(issueLaPlusProche([0, 0], [])).toBe(null)
  })

  it(`arrive : à ${FUITE.rayonArriveeM} m de l'issue ou moins`, () => {
    const i = { x: -10, z: -22 }
    expect(arrive([-10 + FUITE.rayonArriveeM, -22], i)).toBe(true)
    expect(arrive([-10 + FUITE.rayonArriveeM + 0.01, -22], i)).toBe(false)
  })

  it('le message de l\'échec : celui de la mission pour cette issue (fuiteMessages), sinon celui de sa sorte', () => {
    const [ruelle, , igloo] = issuesDe(m, LIEUX)
    expect(messageDeFuite(m, ruelle)).toBe(MESSAGES_DE_FUITE.sortie)
    expect(messageDeFuite(m, igloo)).toBe(MESSAGES_DE_FUITE.abri)
    expect(messageDeFuite({ ...m, fuiteMessages: { ruelle: 'Luc a filé par la ruelle.' } }, ruelle)).toBe('Luc a filé par la ruelle.')
    for (const t of Object.values(MESSAGES_DE_FUITE)) expect(t.length).toBeGreaterThan(0)
  })
})

describe('creerFuite(...).verifier : la cible qui fait échouer la mission, ou null', () => {
  it('sans sortie ni abri : une cible en fuite hors du cône échoue (cause cone) ; dans le cône, rien', () => {
    const f = creerFuite(mission({}), { sorties: {}, abris: {} })
    const c = pnj(0, -40)
    expect(f.verifier([c], 1 / 60, { horsDuCone: jamais, enVue: toujours })).toBe(null)
    expect(f.verifier([c], 1 / 60, { horsDuCone: t => t === c, enVue: toujours })).toEqual({ cible: c, cause: 'cone' })
  })

  it('le cône ne juge que les cibles en fuite, vivantes, à pied (comme checkFledTargets d\'avant la tâche)', () => {
    const f = creerFuite(mission({}), { sorties: {}, abris: {} })
    const cibles = [pnj(0, 0, { state: 'walk' }), pnj(0, 0, { alive: false }), pnj(0, 0, { onVehicle: true })]
    expect(f.verifier(cibles, 1 / 60, { horsDuCone: toujours, enVue: toujours })).toBe(null)
  })

  it('une mission à sorties : le cône ne compte plus ; la sortie atteinte, si', () => {
    casSortieSansCone({ creerFuite })
  })

  it('un abri atteint : échec, au message des abris (décision 4)', () => {
    const f = creerFuite(mission({ abris: ['igloo'] }), LIEUX)
    const c = pnj(30, 0.2)
    expect(f.verifier([c], 1 / 60, { horsDuCone: jamais, enVue: toujours })).toMatchObject({ cible: c, cause: 'abri', message: MESSAGES_DE_FUITE.abri })
  })

  it('seule une cible en fuite échoue à l\'arrivée : une cible qui y marche, non', () => {
    casQuiMarche({ creerFuite })
  })

  it('perte de vue (perteDeVueS) : une cible en fuite cachée plus de N s échoue ; revenue en vue, le compte repart de zéro', () => {
    const f = creerFuite(mission({ sorties: ['ruelle'], perteDeVueS: 2 }), LIEUX)
    const c = pnj(0, 0)
    let vue = false
    const opts = { horsDuCone: jamais, enVue: () => vue }
    for (let i = 0; i < 100; i++) expect(f.verifier([c], 0.019, opts)).toBe(null)   // 1,9 s caché
    vue = true
    expect(f.verifier([c], 0.019, opts)).toBe(null)
    vue = false
    for (let i = 0; i < 100; i++) expect(f.verifier([c], 0.019, opts)).toBe(null)   // de nouveau 1,9 s
    for (let i = 0; i < 6; i++) f.verifier([c], 0.019, opts)
    expect(f.verifier([c], 0.019, opts)).toEqual({ cible: c, cause: 'perteDeVue' })
  })

  it('sans perteDeVueS : jamais d\'échec par la vue, même caché longtemps', () => {
    const f = creerFuite(mission({ sorties: ['ruelle'] }), LIEUX)
    const c = pnj(0, 0)
    for (let i = 0; i < 600; i++) expect(f.verifier([c], 0.05, { horsDuCone: toujours, enVue: jamais })).toBe(null)
  })
})

// Témoins rejoués : des copies fautives de src/campaign/escape.js, exécutées telles quelles (moduleModifie), font
// rougir les cas qu'elles visent ; la copie neutre s'y comporte comme le module.
describe('témoins rejoués', () => {
  const copie = remplacement => moduleModifie('src/campaign/escape.js', remplacement, { FUITE })
  const CONE = "if (!parSorties) {\n          if (horsDuCone(c)) return { cible: c, cause: 'cone' }\n          continue\n        }"
  it('le cône appliqué aussi à une mission à sorties : la cible hors du cône échoue', () => {
    expect(() => casSortieSansCone(copie([CONE, "if (horsDuCone(c)) return { cible: c, cause: 'cone' }\n        if (!parSorties) continue"]))).toThrow()
  })
  it('une cible qui marche comptée comme en fuite : elle échoue à la ruelle', () => {
    expect(() => casQuiMarche(copie(["if (!c.alive || c.onVehicle || c.state !== 'flee') continue", "if (!c.alive || c.onVehicle) continue"]))).toThrow()
  })
  it('témoin des témoins : la copie neutre passe les deux cas', () => {
    const neutre = copie([CONE, CONE])
    casSortieSansCone(neutre); casQuiMarche(neutre)
  })
})
