import { describe, it, expect } from 'vitest'
import { rankFor, precisionOf, isHit } from '../../src/campaign/rank.js'

describe('précision du rapport de mission', () => {
  it('aucun tir : 100 %', () => {
    expect(precisionOf({ shots: 0, hits: 0 })).toBe(100)
  })

  it('arrondie au pour cent', () => {
    expect(precisionOf({ shots: 3, hits: 2 })).toBe(67)
    expect(precisionOf({ shots: 4, hits: 1 })).toBe(25)
  })
})

describe('rang du rapport de mission', () => {
  it('100 % et aucune alerte : FANTÔME', () => {
    expect(rankFor({ shots: 3, hits: 3, alerts: 0 })).toEqual({ label: '★ FANTÔME ★', color: '#9fe8ff' })
  })

  it('100 % mais une alerte : PROFESSIONNEL', () => {
    expect(rankFor({ shots: 2, hits: 2, alerts: 1 }).label).toBe('PROFESSIONNEL')
  })

  it('60 % et au plus une alerte : PROFESSIONNEL', () => {
    expect(rankFor({ shots: 5, hits: 3, alerts: 1 })).toEqual({ label: 'PROFESSIONNEL', color: '#4eff4e' })
  })

  it('sous 60 % : BRUTAL', () => {
    expect(rankFor({ shots: 7, hits: 4, alerts: 0 })).toEqual({ label: 'BRUTAL', color: '#ff8844' })   // 57 %
  })

  it('deux alertes : BRUTAL, même à 100 %', () => {
    expect(rankFor({ shots: 2, hits: 2, alerts: 2 }).label).toBe('BRUTAL')
  })
})

describe('ce qui compte comme touche', () => {
  it('une cible abattue compte', () => {
    expect(isHit('target')).toBe(true)
  })

  it('le cadenas du conteneur compte : libérer les victimes n\'interdit plus FANTÔME', () => {
    expect(isHit('lock')).toBe(true)
  })

  it('un tir manqué ne compte pas', () => {
    expect(isHit('miss')).toBe(false)
  })

  // Règle inchangée : un garde abattu n'est pas un contrat, il ne compte pas pour la précision.
  it('un garde ou un civil touché ne compte pas', () => {
    expect(isHit('guard')).toBe(false)
    expect(isHit('civilian')).toBe(false)
  })

  it('port : une cible et le cadenas, deux tirs, aucune alerte : FANTÔME', () => {
    const shots = ['target', 'lock']
    const hits = shots.filter(isHit).length
    expect(rankFor({ shots: shots.length, hits, alerts: 0 }).label).toBe('★ FANTÔME ★')
  })
})
