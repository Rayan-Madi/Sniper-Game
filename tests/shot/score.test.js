import { describe, it, expect } from 'vitest'
import * as score from '../../src/shot/score.js'
import { SCORE_ZONE } from '../../src/shot/tuning.js'

const { targetScore, guardHit } = score

// Conséquences d'une touche (spec du lot 2, §3.4), sorties de main.js (killTarget, hitGuard) :
// - cible : elle meurt quelle que soit la zone ; points de base (400 en véhicule, 250 immobile, 120 en mouvement)
//   multipliés par la zone : tête ×2 (inchangé), torse ×1, membre ×0,6 (SCORE_ZONE, src/shot/tuning.js) ;
// - garde : il meurt toujours ; sans silencieux, le bruit du tir déclenche l'alerte.
//
// Témoin : sur la logique d'avant le lot 2 (sortie telle quelle), un membre rapportait autant qu'un torse et un garde
// touché sans silencieux survivait (vus rouges).

describe('points d\'une cible abattue, selon la zone touchée', () => {
  const bases = { 'en véhicule': [{ onVehicle: true, still: true }, 400], immobile: [{ onVehicle: false, still: true }, 250],
    'en mouvement': [{ onVehicle: false, still: false }, 120] }

  for (const [quoi, [cible, base]] of Object.entries(bases)) {
    it(`${quoi} : tête ×2, torse ×1, membre ×0,6`, () => {
      expect(targetScore({ ...cible, part: 'tete' })).toBe(base * 2)
      expect(targetScore({ ...cible, part: 'torse' })).toBe(base)
      expect(targetScore({ ...cible, part: 'membre' })).toBe(Math.round(base * 0.6))
    })
  }

  it('les coefficients viennent de SCORE_ZONE', () => {
    expect(SCORE_ZONE).toEqual({ tete: 2, torse: 1, membre: 0.6 })
  })

  it('des points entiers', () => {
    expect(Number.isInteger(targetScore({ onVehicle: false, still: false, part: 'membre' }))).toBe(true)
  })
})

describe('garde touché', () => {
  it('sans silencieux : il tombe, et l\'alerte part', () => {
    const r = guardHit({ silenced: false, superSilenced: false })
    expect(r.meurt).toBe(true)
    expect(r.alerte).toBe(true)
    expect(r.feed).toMatch(/Garde éliminé/)
  })

  it('au silencieux : il tombe sans alerte, les autres gardes réagissent', () => {
    expect(guardHit({ silenced: true, superSilenced: false })).toMatchObject({ meurt: true, alerte: false, gardesReagissent: true })
  })

  it('au silencieux amélioré : il tombe sans alerte ni réaction', () => {
    expect(guardHit({ silenced: true, superSilenced: true })).toMatchObject({ meurt: true, alerte: false, gardesReagissent: false })
  })
})

// Tir manqué (relecture de T5) : la balle s'arrête dans le décor ou part au loin, et les PNJ proches du point d'impact
// fuient. Une balle partie au loin a son point à 1 km (OCCLUSION.loinM) : personne n'y fuit, et le fil affichait quand
// même « cibles en fuite » ; de même au silencieux, où personne ne fuit. Le fil ne parle plus de fuite que si des PNJ
// fuient vraiment. Témoin : la règle d'avant (missFeedAvant, le même texte quoi qu'il arrive) échoue (vue rouge).
const missFeedAvant = () => 'Tir manqué : cibles en fuite'
const missFeed = score.missFeed ?? missFeedAvant

describe('tir manqué : le fil du jeu', () => {
  it('personne ne fuit (balle partie au loin, tir au silencieux, personne autour) : « Tir manqué », sans fuite', () => {
    expect(missFeed(0)).toBe('Tir manqué')
  })

  it('des PNJ fuient : « Tir manqué : cibles en fuite »', () => {
    expect(missFeed(1)).toBe('Tir manqué : cibles en fuite')
    expect(missFeed(4)).toBe('Tir manqué : cibles en fuite')
  })
})
