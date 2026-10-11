import { describe, it, expect } from 'vitest'
import { CLUES, PHONE } from '../../src/prologue/clues.js'
import { createInvestigationState } from '../../src/prologue/state.js'
import { estimate } from '../../src/briefing/kit.js'

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

  // spec 2026-10-11 §3.5 : les répliques et libellés de la fin, à un seul endroit
  it('la fin de l\'enquête a sa réplique, son sous-titre de vibration, sa notification et son action REPOSER', () => {
    expect(PHONE.fin).toBe('J\'en ai assez vu.')
    expect(PHONE.vibre).toBe('Le téléphone…')
    expect(PHONE.notif).toBe('1 NOUVEAU MESSAGE')
    expect(PHONE.reposer).toBe('REPOSER')
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

// Fin de l'enquête (spec docs/superpowers/specs/2026-10-11-enquete-fin-design.md §3.1, §3.3, §4). La réplique dure ici
// 1,5 s (speechTime) pour lire les étapes à la main : silence [0 ; 0,8[, réplique [0,8 ; 2,3[, souffle [2,3 ; 2,9[,
// vibration [2,9 ; 4,1[, regard [4,1 ; 5,3[, puis la fiche du téléphone.
describe('fin de l\'enquête', () => {
  const IDS = CLUES.map(c => c.id)
  const voice = () => 1.5
  // trouve ces indices un à un (fiche ouverte puis fermée)
  const findAll = (s, ids) => { for (const id of ids) { s.examine(id); s.close() } }
  // une enquête à 5 indices, le 6e (le doudou) examiné : sa fiche est ouverte
  const atLastFiche = (o = {}) => {
    const s = createInvestigationState({ speechTime: voice, found: IDS.slice(0, 5), ...o })
    s.examine('doudou')
    return s
  }

  it('allFound ne vaut vrai qu\'au sixième indice trouvé', () => {
    const s = createInvestigationState()
    findAll(s, IDS.slice(0, 5))
    expect(s.allFound).toBe(false)                              // témoin : cinq ne suffisent pas
    s.examine('doudou')
    expect(s.allFound).toBe(true)
  })

  it('fermer la fiche du sixième indice lance la séquence de fin (pas celle du cinquième)', () => {
    const t = createInvestigationState({ speechTime: voice, found: IDS.slice(0, 4) })
    t.examine('mot'); t.close()
    expect(t.mode).toBe('exploring')                            // témoin : le 5e indice fermé, on explore toujours
    expect(t.ending).toBeNull()

    const s = atLastFiche()
    expect(s.ending).toBeNull()                                 // la fiche du 6e est ouverte : rien n'a encore commencé
    s.close()
    expect(s.mode).toBe('ending')
    expect(s.ending).toMatchObject({ step: 'silence', t: 0, steps: ['silence'] })
  })

  it('les étapes avancent avec tick : silence, réplique, souffle, vibration, regard, puis la fiche du téléphone', () => {
    const s = atLastFiche(); s.close()
    const step = dt => { s.tick(dt); return s.ending.step }
    expect(step(0.79)).toBe('silence')
    expect(step(0.02)).toBe('line')                             // 0,81 s : « J'en ai assez vu. »
    expect(step(1.5)).toBe('breath')                            // 2,31 s : fin de la réplique
    expect(step(0.6)).toBe('buzz')                              // 2,91 s : réplique + 0,6 s, le téléphone vibre
    expect(step(1.2)).toBe('turn')                              // 4,11 s : + 1,2 s, le regard pivote
    expect(s.mode).toBe('ending')
    s.tick(0.6)
    expect(s.ending.progress).toBeCloseTo(0.61 / 1.2, 5)        // le pivot est à moitié fait
    expect(step(0.6)).toBe('phone')                             // 5,31 s : fin du pivot
    expect(s.mode).toBe('examining')
    expect(s.current).toBe(PHONE.id)
    expect(s.ending.steps).toEqual(['silence', 'line', 'breath', 'buzz', 'turn', 'phone'])
  })

  it('la réplique dure sa voix, et la fiche du téléphone s\'ouvre en moins de 6 s', () => {
    const s = createInvestigationState({ found: IDS.slice(0, 5) })
    s.examine('doudou'); s.close()
    const line = estimate(PHONE.fin) / 1000
    s.tick(0.8)
    expect(s.ending.step).toBe('line')
    s.tick(line - 0.01)
    expect(s.ending.step).toBe('line')
    s.tick(0.02)
    expect(s.ending.step).toBe('breath')
    let t = 0.8 + line + 0.01
    while (s.mode === 'ending' && t < 10) { s.tick(0.05); t += 0.05 }
    expect(s.mode).toBe('examining')
    expect(t).toBeLessThan(6)
  })

  it('un seul tick qui couvre toute la séquence passe quand même par toutes les étapes, dans l\'ordre', () => {
    const s = atLastFiche(); s.close()
    s.tick(30)
    expect(s.ending.steps).toEqual(['silence', 'line', 'breath', 'buzz', 'turn', 'phone'])
    expect(s.mode).toBe('examining')
  })

  it('rien n\'avance pendant la pause : 10 s de pause au milieu ne font rien', () => {
    const t = atLastFiche(); t.close()
    t.tick(1)
    for (let i = 0; i < 100; i++) t.tick(0.1)
    expect(t.mode).toBe('examining')                            // témoin : sans pause, ces 10 s finissent la séquence

    const s = atLastFiche(); s.close()
    s.tick(1)
    s.pause()
    expect(s.mode).toBe('paused')
    for (let i = 0; i < 100; i++) s.tick(0.1)
    expect(s.ending).toMatchObject({ step: 'line', t: 1 })
    s.resume()
    expect(s.mode).toBe('ending')
    s.tick(1.29)
    expect(s.ending.step).toBe('line')                          // 2,29 s de séquence : la pause n'a rien compté
    s.tick(0.02)
    expect(s.ending.step).toBe('breath')
  })

  it('pendant la séquence, pas de piste ni de compte vers la suivante', () => {
    const t = createInvestigationState({ speechTime: voice, hintDelay: 0.5, found: IDS.slice(0, 5) })
    const out = []
    for (let i = 0; i < 60; i++) out.push(t.tick(0.1))
    expect(out.some(h => typeof h === 'string')).toBe(true)     // témoin : en exploration, la piste tombe toutes les 0,5 s

    const s = createInvestigationState({ speechTime: voice, hintDelay: 0.5, found: IDS.slice(0, 5) })
    s.examine('doudou'); s.close()
    const during = []
    while (s.mode === 'ending' && during.length < 200) during.push(s.tick(0.1))
    expect(during.length).toBeGreaterThan(40)
    expect(during.every(h => h === null)).toBe(true)
  })

  it('pendant la séquence, on n\'examine rien, et PASSER L\'ENQUÊTE reste possible', () => {
    const s = atLastFiche(); s.close()
    expect(s.examine('telephone')).toBeNull()
    expect(s.examine('serrure')).toBeNull()
    s.pause()
    expect(s.finish('skipped')).toBe(true)
    expect(s.mode).toBe('done')
  })

  it('effets atténués : pas de regard, la fiche s\'ouvre à la fin de la vibration (réglage lu au début de la séquence)', () => {
    const t = atLastFiche(); t.close()
    t.tick(4.11)
    expect(t.ending.step).toBe('turn')                          // témoin : effets normaux, le regard pivote à 4,11 s

    let reduced = false
    const s = atLastFiche({ reducedMotion: () => reduced })
    reduced = true                                              // changé après la création : c'est la valeur du moment qui compte
    s.close()
    s.tick(4.09)
    expect(s.ending.step).toBe('buzz')
    s.tick(0.02)
    expect(s.ending.step).toBe('phone')
    expect(s.mode).toBe('examining')
    expect(s.current).toBe(PHONE.id)
    expect(s.ending.steps).toEqual(['silence', 'line', 'breath', 'buzz', 'phone'])
  })

  it('avant le sixième indice, le téléphone se repose ; un indice ne se « repose » pas', () => {
    const s = createInvestigationState({ found: IDS.slice(0, 4) })
    expect(s.phoneCanPutDown).toBe(false)                       // rien d'ouvert
    s.examine('mot')
    expect(s.phoneCanPutDown).toBe(false)
    expect(s.putDown()).toBe(false)                             // une fiche d'indice reste ouverte
    expect(s.mode).toBe('examining')
    expect(s.current).toBe('mot')
    s.close()
    s.examine('telephone')
    expect(s.phoneCanPutDown).toBe(true)
    expect(s.putDown()).toBe(true)
    expect(s.mode).toBe('exploring')
    expect(s.current).toBeNull()
    expect(s.putDown()).toBe(false)
  })

  it('après les six indices, le téléphone ne se repose plus (ni REPOSER ni fermeture)', () => {
    const s = atLastFiche(); s.close()
    s.tick(30)
    expect(s.current).toBe(PHONE.id)
    expect(s.phoneCanPutDown).toBe(false)
    expect(s.putDown()).toBe(false)
    s.close()
    expect(s.mode).toBe('examining')
    expect(s.current).toBe(PHONE.id)
    expect(s.finish('listened')).toBe(true)                     // la seule sortie : écouter le message
  })

  it('le téléphone ouvert puis reposé avant la fin : la séquence est la même et rouvre sa fiche', () => {
    const s = createInvestigationState({ speechTime: voice, found: IDS.slice(0, 4) })
    s.examine('telephone'); s.putDown()
    findAll(s, ['mot', 'doudou'])
    expect(s.mode).toBe('ending')
    s.tick(30)
    expect(s.ending.steps).toEqual(['silence', 'line', 'breath', 'buzz', 'turn', 'phone'])
    expect(s.current).toBe(PHONE.id)
  })

  it('route de développement à six indices : la fiche d\'un indice relu, une fois fermée, lance la fin', () => {
    const s = createInvestigationState({ speechTime: voice, found: IDS })
    expect(s.allFound).toBe(true)
    expect(s.examine('serrure')).toMatchObject({ first: false })
    s.close()
    expect(s.mode).toBe('ending')
  })
})
