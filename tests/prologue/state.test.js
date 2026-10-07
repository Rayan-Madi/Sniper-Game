import { describe, it, expect } from 'vitest'
import { CLUES, PHONE } from '../../src/prologue/clues.js'
import { createInvestigationState } from '../../src/prologue/state.js'

describe('données de l\'enquête', () => {
  it('six indices numérotés de 1 à 6, ids uniques, une phrase de Viktor et une piste chacun', () => {
    expect(CLUES.map(c => c.n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(new Set(CLUES.map(c => c.id)).size).toBe(6)
    for (const c of CLUES) { expect(c.viktor.length).toBeGreaterThan(5); expect(c.piste.length).toBeGreaterThan(3); expect(c.lieu).toMatch(/^[A-ZÀ-Ü' ]+$/) }
    expect(CLUES.find(c => c.id === 'mot').citation).toBe('Tu aurais dû dire oui.')
    expect(CLUES.find(c => c.id === 'corps').acouphene).toBe(true)
  })

  it('le téléphone s\'ouvre à 4 indices, montre deux appels manqués et deux phrases', () => {
    expect(PHONE.id).toBe('telephone')
    expect(PHONE.seuil).toBe(4)
    expect(PHONE.appels.map(a => `${a.de} · ${a.heure}`)).toEqual(['06 39 98 41 07 · 18:52', 'MAISON · 19:04'])
    expect(PHONE.viktor).toEqual(['Ce jour-là, j\'avais oublié mon téléphone.', 'Elle m\'a appelé. Il était là, en silencieux.'])
    expect(PHONE.verrouille).toBe('Pas encore… Je dois comprendre ce qui s\'est passé.')
  })
})

describe('machine à états', () => {
  it('examiner un indice ouvre sa fiche et ne le compte qu\'une fois', () => {
    const s = createInvestigationState()
    const r = s.examine('serrure')
    expect(r).toMatchObject({ type: 'clue', first: true, count: 1, total: 6 })
    expect(r.clue.id).toBe('serrure')
    expect(s.mode).toBe('examining')
    s.close()
    expect(s.mode).toBe('exploring')
    expect(s.examine('serrure')).toMatchObject({ type: 'clue', first: false, count: 1 })
    expect(s.count).toBe(1)
  })

  it('le téléphone reste verrouillé avant 4 indices, sans ouvrir de fiche', () => {
    const s = createInvestigationState()
    for (const id of ['serrure', 'lutte', 'corps']) { s.examine(id); s.close() }
    expect(s.examine('telephone')).toEqual({ type: 'phone-locked', line: PHONE.verrouille })
    expect(s.mode).toBe('exploring')
    expect(s.phoneUnlocked).toBe(false)
  })

  it('à 4 indices, le téléphone ouvre sa fiche', () => {
    const s = createInvestigationState()
    for (const id of ['serrure', 'lutte', 'corps', 'doudou']) { s.examine(id); s.close() }
    expect(s.phoneUnlocked).toBe(true)
    expect(s.examine('telephone')).toEqual({ type: 'phone', phone: PHONE })
    expect(s.mode).toBe('examining')
    expect(s.current).toBe('telephone')
  })

  it('on n\'examine rien pendant une fiche, une pause ou après la fin ; un id inconnu ne fait rien', () => {
    const s = createInvestigationState()
    expect(s.examine('inconnu')).toBeNull()
    s.examine('serrure')
    expect(s.examine('lutte')).toBeNull()
    s.close(); s.pause()
    expect(s.examine('lutte')).toBeNull()
    s.resume(); s.finish('skipped')
    expect(s.examine('lutte')).toBeNull()
  })

  it('pause et reprise reviennent au mode d\'avant (fiche ouverte comprise)', () => {
    const s = createInvestigationState()
    s.examine('photo'); s.pause()
    expect(s.mode).toBe('paused')
    s.resume()
    expect(s.mode).toBe('examining')
  })

  it('finish ne se fait qu\'une fois et garde la première raison', () => {
    const s = createInvestigationState()
    expect(s.finish('listened')).toBe(true)
    expect(s.finish('skipped')).toBe(false)
    expect(s.mode).toBe('done')
    expect(s.result).toBe('listened')
  })

  it('une piste arrive après 40 s d\'exploration sans découverte, vers l\'indice non vu le plus proche', () => {
    const anchors = { serrure: { x: 6, z: 7 }, lutte: { x: 7, z: 6 }, corps: { x: 10.6, z: 4.8 }, photo: { x: 11, z: 6.3 }, mot: { x: 9.6, z: 3 }, doudou: { x: 2.1, z: 3.3 }, telephone: { x: 4.8, z: 6.2 } }
    const s = createInvestigationState({ anchors })
    s.examine('serrure'); s.close()
    expect(s.tick(39, { x: 6, z: 6.5 })).toBeNull()
    expect(s.tick(1.5, { x: 6, z: 6.5 })).toBe(CLUES.find(c => c.id === 'lutte').piste)
    expect(s.tick(39, { x: 2, z: 4 })).toBeNull()             // le compteur repart de zéro après une piste
    expect(s.tick(2, { x: 2, z: 4 })).toBe(CLUES.find(c => c.id === 'doudou').piste)
  })

  it('sans ancres ni position, la piste suit l\'ordre des indices', () => {
    const s = createInvestigationState()
    s.examine('serrure'); s.close()
    expect(s.hint()).toBe(CLUES[1].piste)
  })

  it('la piste désigne le téléphone dès qu\'il est déverrouillé', () => {
    const s = createInvestigationState()
    for (const id of ['serrure', 'lutte', 'corps', 'mot']) { s.examine(id); s.close() }
    expect(s.hint({ x: 2, z: 3 })).toBe(PHONE.piste)
  })

  it('trouver un indice remet à zéro l\'attente de la piste ; pas de piste pendant une fiche ou une pause', () => {
    const s = createInvestigationState()
    s.tick(30)
    s.examine('lutte'); s.close()
    expect(s.tick(30)).toBeNull()
    s.examine('photo')
    expect(s.tick(100)).toBeNull()
    s.close(); s.pause()
    expect(s.tick(100)).toBeNull()
  })

  // la spec : « après 40 s d'exploration sans NOUVELLE découverte »
  it('une pause ne compte pas dans les 40 s', () => {
    const s = createInvestigationState()
    expect(s.tick(30)).toBeNull()
    s.pause()
    expect(s.tick(100)).toBeNull()
    s.resume()
    expect(s.tick(9)).toBeNull()                               // 39 s d'exploration
    expect(s.tick(1.5)).toBe(CLUES[0].piste)                    // 40,5 s
  })

  it('relire un indice déjà vu (fiche ouverte puis fermée) ne repousse pas la piste', () => {
    const s = createInvestigationState()
    s.examine('serrure'); s.close()                             // vraie découverte : l'attente repart de zéro
    expect(s.tick(30)).toBeNull()
    expect(s.examine('serrure')).toMatchObject({ first: false })
    s.close()
    expect(s.tick(10.5)).toBe(CLUES[1].piste)                   // 40,5 s depuis la découverte
  })

  it('le téléphone verrouillé ne repousse pas la piste', () => {
    const s = createInvestigationState()
    expect(s.tick(30)).toBeNull()
    expect(s.examine('telephone')).toMatchObject({ type: 'phone-locked' })
    expect(s.tick(10.5)).toBe(CLUES[0].piste)
  })

  it('found pré-valide des indices (route de développement)', () => {
    const s = createInvestigationState({ found: ['serrure', 'lutte', 'corps', 'photo', 'inconnu'] })
    expect(s.count).toBe(4)
    expect(s.phoneUnlocked).toBe(true)
  })
})
