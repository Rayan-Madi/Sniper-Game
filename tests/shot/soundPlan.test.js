import { describe, it, expect } from 'vitest'

// Ce qu'on entend quand la balle arrive (spec du lot 2, §3.5 ; plan, tâche T6) : le son de ce qu'elle touche, chair
// (un PNJ, quelle que soit la zone), métal, pierre, bois ou sol, entendu distance / 343 s après son arrivée (le son
// revient du point d'impact jusqu'au tireur) ; un impact lointain part aussi vers l'écho de la carte. C'est lui qui
// confirme la touche : plus de bip d'arcade. Une balle partie au loin ne fait rien entendre.
//
// Témoin : avant la tâche T6 (commit ea35614), à l'arrivée de la balle, une touche sonnait le bip d'arcade tout de suite
// (playKill : 880 puis 660 Hz), et le décor ne sonnait pas. Sans src/shot/soundPlan.js, les tests tournent sur cette
// règle (planAvant) et échouent sur elle (vus rouges).

const PLAN_JS = '../../src/shot/soundPlan.js'   // chemin dans une variable : Vite refuserait le fichier si le module manque
const mod = await import(/* @vite-ignore */ PLAN_JS).catch(() => null)
const { SON } = await import('../../src/shot/tuning.js')
const planAvant = ({ part }) => (part ? [{ son: 'bip', at: 0 }] : [])
const planShotSounds = mod?.planShotSounds ?? planAvant

const MATIERES = ['metal', 'pierre', 'bois', 'sol']
const ZONES = ['tete', 'torse', 'membre']

describe("l'impact, retardé par la distance", () => {
  for (const distance of [12, 34.3, 120, 430]) {
    it(`à ${distance} m : entendu ${(distance / 343).toFixed(3)} s après l'arrivée de la balle`, () => {
      for (const surface of MATIERES) {
        const plan = planShotSounds({ distance, surface })
        expect(plan.length, surface).toBe(1)
        expect(plan[0].at).toBeCloseTo(distance / SON.vitesse, 9)
      }
      for (const part of ZONES) {
        const plan = planShotSounds({ distance, part })
        expect(plan.length, part).toBe(1)
        expect(plan[0].at).toBeCloseTo(distance / SON.vitesse, 9)
      }
    })
  }
})

describe('le son de ce que la balle touche', () => {
  it('le décor : le son de sa matière (claquement du métal, éclat de la pierre, bois, souffle du sol)', () => {
    for (const surface of MATIERES) expect(planShotSounds({ distance: 30, surface }).map(s => s.son)).toEqual([`impact-${surface}`])
  })

  it("un PNJ : la chair (son mat), quelle que soit la zone, même s'il est sur un décor", () => {
    for (const part of ZONES) {
      expect(planShotSounds({ distance: 30, part }).map(s => s.son)).toEqual(['impact-chair'])
      expect(planShotSounds({ distance: 30, part, surface: 'metal' }).map(s => s.son)).toEqual(['impact-chair'])
    }
  })

  it('pas de bip : rien que le son de l\'impact, pour une cible touchée à la tête comme pour un mur', () => {
    const plans = [...ZONES.map(part => planShotSounds({ distance: 30, part })), ...MATIERES.map(surface => planShotSounds({ distance: 30, surface }))]
    for (const p of plans) {
      expect(p.length).toBeGreaterThan(0)
      for (const s of p) expect(s.son).toMatch(/^impact-(chair|metal|pierre|bois|sol)$/)
    }
  })

  it('une balle partie au loin (rien sur le rayon, point à 1 km) : rien à entendre', () => {
    expect(planShotSounds({ distance: 1000 })).toEqual([])
    expect(planShotSounds({ distance: 1000, surface: null, part: null })).toEqual([])
  })
})

describe("l'écho", () => {
  it(`un impact lointain (au-delà de ${SON.echoImpactM} m) part aussi vers l'écho de la carte`, () => {
    for (const distance of [SON.echoImpactM, 30, 430]) {
      expect(planShotSounds({ distance, surface: 'pierre' })[0]?.echo, `${distance} m`).toBe(true)
      expect(planShotSounds({ distance, part: 'torse' })[0]?.echo, `${distance} m`).toBe(true)
    }
  })

  it("un impact tout proche (le rebord du poste) : le coup sec seul, sans écho", () => {
    expect(planShotSounds({ distance: SON.echoImpactM - 0.5, surface: 'pierre' })[0]?.echo).toBe(false)
    expect(planShotSounds({ distance: 2, surface: 'metal' })[0]?.echo).toBe(false)
  })
})
