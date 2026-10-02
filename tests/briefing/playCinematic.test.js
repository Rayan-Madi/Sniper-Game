import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playCinematic, registerScene, isCinematicPlaying } from '../../src/briefing/index.js'

const fakeScene = {
  stClass: 'st t1',
  css: '.t1 .x { color: red }',
  html: '<div class="scene" id="scene"><div class="sub" id="sub"></div></div>',
  start(K) { K.run({ beats: [{ min: 1000 }] }) },
}
registerScene('test', async () => fakeScene)
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => { vi.useFakeTimers(FAKE); document.body.innerHTML = '<div id="briefing-root" hidden></div>' })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; document.head.innerHTML = '' })

describe('playCinematic', () => {
  it('monte la scène, l\'affiche, puis la démonte et appelle onDone une fois à la fin', async () => {
    const onDone = vi.fn()
    await playCinematic('test', { onDone })
    const root = document.getElementById('briefing-root')
    expect(root.hidden).toBe(false)
    expect(root.querySelector('.st.t1 #scene')).not.toBeNull()
    expect(isCinematicPlaying()).toBe(true)
    await vi.advanceTimersByTimeAsync(1000); await flush()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(root.hidden).toBe(true)
    expect(root.innerHTML).toBe('')
    expect(isCinematicPlaying()).toBe(false)
    expect([...document.head.querySelectorAll('style')].some(s => s.textContent.includes('.t1 .x'))).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['Escape', 'Enter', 'Space'])('passe avec %s : fondu de 400 ms, puis onDone une seule fois', async code => {
    const onDone = vi.fn()
    await playCinematic('test', { onDone })
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }))
    expect(document.getElementById('briefing-root').classList.contains('k-leaving')).toBe(true)
    await vi.advanceTimersByTimeAsync(400); await flush()
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
    await vi.advanceTimersByTimeAsync(2000); await flush()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passe au clic', async () => {
    const onDone = vi.fn()
    await playCinematic('test', { onDone })
    document.getElementById('briefing-root').click()
    await vi.advanceTimersByTimeAsync(400); await flush()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('la touche qui fait passer ne parvient pas aux autres écouteurs du jeu', async () => {
    const other = vi.fn()
    document.addEventListener('keydown', other)
    await playCinematic('test', {})
    // la touche part du body, comme en jeu : l'écouteur en capture sur document passe avant les autres
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }))
    expect(other).not.toHaveBeenCalled()
    document.removeEventListener('keydown', other)
  })

  it('une nouvelle cinématique annule la précédente sans appeler son onDone', async () => {
    const first = vi.fn(), second = vi.fn()
    await playCinematic('test', { onDone: first })
    await playCinematic('test', { onDone: second })
    await vi.advanceTimersByTimeAsync(1000); await flush()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('transmet params à la scène sous forme de ctx.search', async () => {
    const seen = []
    registerScene('ctx', async () => ({ ...fakeScene, start(K, ctx) { seen.push(ctx.search); K.run({ beats: [] }) } }))
    await playCinematic('ctx', { params: { port: 'libres' } })
    expect(seen).toEqual(['?port=libres'])
  })

  it('refuse une cinématique inconnue', async () => {
    await expect(playCinematic('nope', {})).rejects.toThrow(/inconnue/)
  })

  // Tolérance aux pannes : une scène cassée ne doit jamais bloquer le jeu derrière un écran noir.
  it.each([
    ['dont start() lève une erreur', { ...fakeScene, css: '.t2 .x { color: blue }', start() { throw new Error('boum') } }],
    ['sans #st ni #scene (le kit ne peut pas se monter)', { ...fakeScene, css: '.t2 .x { color: blue }', html: '<div></div>' }],
  ])('scène %s : démontage complet, onDone une fois, aucune erreur propagée', async (_nom, scene) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerScene('cassee', async () => scene)
    const onDone = vi.fn()
    const handle = await playCinematic('cassee', { onDone })
    const root = document.getElementById('briefing-root')
    expect(handle.error).toBeInstanceOf(Error)
    expect(logged).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(root.hidden).toBe(true)
    expect(root.innerHTML).toBe('')
    expect(isCinematicPlaying()).toBe(false)
    expect([...document.head.querySelectorAll('style')].some(s => s.textContent.includes('.t2 .x'))).toBe(false)
    // plus aucun écouteur : la touche n'est ni retenue ni comptée
    const key = new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(key)
    root.click()
    expect(key.defaultPrevented).toBe(false)
    expect(handle.stop).not.toThrow()
    expect(handle.cancel).not.toThrow()
    await vi.advanceTimersByTimeAsync(5000); await flush()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('un démontage qui échoue n\'empêche pas onDone d\'être appelé', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    registerScene('fragile', async () => ({ ...fakeScene, start(K) { K.destroy = () => { throw new Error('destroy cassé') }; throw new Error('boum') } }))
    const onDone = vi.fn()
    const handle = await playCinematic('fragile', { onDone })
    expect(handle.error).toBeInstanceOf(Error)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  // La dernière demande gagne, même quand les chargements se terminent dans le désordre.
  it.each([
    ['la première se charge avant la seconde', true],
    ['la seconde se charge avant la première', false],
  ])('deux demandes sans attendre : seule la seconde est montée (%s)', async (_nom, firstLoadsFirst) => {
    const sceneA = { ...fakeScene, stClass: 'st ta', css: '.ta .x { color: red }', start(K) { K.run({ beats: [{ min: 3000 }] }) } }
    const sceneB = { ...fakeScene, stClass: 'st tb', css: '.tb .x { color: red }' }
    let loadA, loadB
    registerScene('lenteA', () => new Promise(r => { loadA = () => r(sceneA) }))
    registerScene('lenteB', () => new Promise(r => { loadB = () => r(sceneB) }))
    const first = vi.fn(), second = vi.fn()
    const pA = playCinematic('lenteA', { onDone: first })
    const pB = playCinematic('lenteB', { onDone: second })
    if (firstLoadsFirst) { loadA(); loadB() } else { loadB(); loadA() }
    const [hA, hB] = await Promise.all([pA, pB])
    await flush()
    const root = document.getElementById('briefing-root')
    expect(hA.kit).toBeNull()
    expect(hB.kit).not.toBeNull()
    expect(root.querySelector('.st.tb #scene')).not.toBeNull()
    expect(root.querySelector('.ta')).toBeNull()
    expect([...document.head.querySelectorAll('style')].some(s => s.textContent.includes('.ta .x'))).toBe(false)
    // la scène abandonnée n'a laissé aucun minuteur : tout s'arrête avec la seconde
    await vi.advanceTimersByTimeAsync(1000); await flush()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(root.hidden).toBe(true)
    expect(isCinematicPlaying()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
