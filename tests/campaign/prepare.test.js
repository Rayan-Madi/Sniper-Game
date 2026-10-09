import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prepareDuringBriefing, afterPaint } from '../../src/campaign/prepare.js'

// Préparation d'une mission pendant son briefing (spec du lot 1 §4.6) : la mission est montée et ses shaders compilés
// pendant la cinématique (prepare), puis son départ (startLevel) reprend ce montage au lieu d'en refaire un (take).
// Le montage attend les modèles : sans eux, les PNJ seraient procéduraux (critère « chargement » du §6).

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// Toutes les réactions de promesses en attente (la préparation tardive passe par ready().then).
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

describe('prepareDuringBriefing : la mission se monte pendant le briefing', () => {
  it('modèles prêts au lancement : montée dans l\'appel même, avant la cinématique, une seule fois', async () => {
    const prepare = vi.fn()
    const prep = prepareDuringBriefing({ settled: () => true, ready: () => Promise.resolve(), prepare })
    expect(prepare).toHaveBeenCalledTimes(1)
    await flush()
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(prep.take()).toBe(true)
  })

  it('le départ reprend le montage une seule fois : un second départ remonte la mission', () => {
    const prep = prepareDuringBriefing({ settled: () => true, ready: () => Promise.resolve(), prepare: () => {} })
    expect(prep.take()).toBe(true)
    expect(prep.take()).toBe(false)
  })

  it('modèles en cours de chargement : rien avant leur arrivée, montée dès qu\'ils arrivent, reprise au départ', async () => {
    const models = deferred()
    const prepare = vi.fn()
    const prep = prepareDuringBriefing({ settled: () => false, ready: () => models.promise, prepare })
    await flush()
    expect(prepare).not.toHaveBeenCalled()
    models.resolve()
    await flush()
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(prep.take()).toBe(true)
  })

  it('départ avant l\'arrivée des modèles (attente de 20 s écoulée) : pas de reprise, et rien de monté ensuite', async () => {
    const models = deferred()
    const prepare = vi.fn()
    const prep = prepareDuringBriefing({ settled: () => false, ready: () => models.promise, prepare })
    expect(prep.take()).toBe(false)   // le départ monte la mission lui-même, comme avant le lot
    models.resolve()
    await flush()
    expect(prepare).not.toHaveBeenCalled()   // jamais un second montage sous la mission en cours
  })

  it('lancement devenu caduc avant l\'arrivée des modèles (mission relancée, rendu interrompu) : rien de monté', async () => {
    const models = deferred()
    let current = true
    const prepare = vi.fn()
    const prep = prepareDuringBriefing({ settled: () => false, ready: () => models.promise, prepare, isCurrent: () => current })
    current = false
    models.resolve()
    await flush()
    expect(prepare).not.toHaveBeenCalled()
    expect(prep.take()).toBe(false)
  })

  it('lancement déjà caduc, modèles prêts : rien de monté', () => {
    const prepare = vi.fn()
    const prep = prepareDuringBriefing({ settled: () => true, ready: () => Promise.resolve(), prepare, isCurrent: () => false })
    expect(prepare).not.toHaveBeenCalled()
    expect(prep.take()).toBe(false)
  })

  it('montage en échec : l\'erreur est signalée sans remonter jusqu\'au lancement, et le départ remonte la mission', () => {
    const errors = []
    let prep
    expect(() => {
      prep = prepareDuringBriefing({ settled: () => true, ready: () => Promise.resolve(),
        prepare: () => { throw new Error('carte') }, onError: e => errors.push(e.message) })
    }).not.toThrow()
    expect(errors).toEqual(['carte'])
    expect(prep.take()).toBe(false)
  })

  // schedule (main.js : afterPaint) : le montage attend que l'écran noir de la cinématique soit affiché. Sans lui, le
  // clic sur le bouton de lancement restait figé le temps du montage (0,4 s pour M6 sur la machine de Rayan).
  it('montage confié à schedule : rien dans l\'appel, montée quand schedule rend la main', () => {
    let later = null
    const prepare = vi.fn()
    const prep = prepareDuringBriefing({ settled: () => true, ready: () => Promise.resolve(), prepare, schedule: fn => { later = fn } })
    expect(prepare).not.toHaveBeenCalled()
    expect(later).toBeTypeOf('function')
    later()
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(prep.take()).toBe(true)
  })

  it('départ avant que schedule rende la main (cinématique introuvable, fin immédiate) : rien de monté ensuite', () => {
    let later = null
    const prepare = vi.fn()
    const prep = prepareDuringBriefing({ settled: () => true, ready: () => Promise.resolve(), prepare, schedule: fn => { later = fn } })
    expect(prep.take()).toBe(false)
    later()
    expect(prepare).not.toHaveBeenCalled()
  })

  // begun : la cinématique ne démarre qu'une fois le montage tenté (playCinematic, option ready), pour que le montage
  // ne fige pas son animation. Elle n'attend jamais les modèles : chargement en cours, elle démarre, et la mission se
  // monte à leur arrivée.
  it('begun : tenue après le montage, pas avant', async () => {
    let later = null
    const order = []
    const prep = prepareDuringBriefing({ settled: () => true, ready: () => Promise.resolve(), prepare: () => order.push('montage'), schedule: fn => { later = fn } })
    prep.begun.then(() => order.push('cinématique'))
    await flush()
    expect(order).toEqual([])
    later()
    await flush()
    expect(order).toEqual(['montage', 'cinématique'])
  })

  it('begun : tenue sans attendre des modèles encore en chargement', async () => {
    const models = deferred()
    const prepare = vi.fn()
    const prep = prepareDuringBriefing({ settled: () => false, ready: () => models.promise, prepare })
    let begun = false
    prep.begun.then(() => { begun = true })
    await flush()
    expect(begun).toBe(true)
    expect(prepare).not.toHaveBeenCalled()
    models.resolve()
    await flush()
    expect(prepare).toHaveBeenCalledTimes(1)
  })

  it('begun : tenue aussi quand le montage échoue (la cinématique démarre quand même)', async () => {
    const prep = prepareDuringBriefing({ settled: () => true, ready: () => Promise.resolve(), prepare: () => { throw new Error('carte') } })
    let begun = false
    prep.begun.then(() => { begun = true })
    await flush()
    expect(begun).toBe(true)
  })

  it('chargement des modèles en échec : rien de monté, le départ s\'en charge', async () => {
    const models = deferred()
    const prepare = vi.fn()
    const prep = prepareDuringBriefing({ settled: () => false, ready: () => models.promise, prepare })
    models.reject(new Error('réseau'))
    await flush()
    expect(prepare).not.toHaveBeenCalled()
    expect(prep.take()).toBe(false)
  })
})

// afterPaint : l'écran noir que playCinematic vient d'afficher est peint avant le montage (requestAnimationFrame, puis
// une tâche). Onglet masqué, requestAnimationFrame suspendu : le montage part quand même au bout de 100 ms.
describe('afterPaint : après l\'image en cours', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('rien dans l\'appel ni dans le rappel d\'image : une tâche après lui, une seule fois', async () => {
    const frames = []
    const fn = vi.fn()
    afterPaint(fn, { raf: cb => frames.push(cb) })
    expect(fn).not.toHaveBeenCalled()
    frames[0]()
    expect(fn).not.toHaveBeenCalled()   // le rappel d'image précède la peinture
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('aucune image (onglet masqué) : au bout de 100 ms, une seule fois', async () => {
    const fn = vi.fn()
    afterPaint(fn, { raf: () => {} })
    await vi.advanceTimersByTimeAsync(99)
    expect(fn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
