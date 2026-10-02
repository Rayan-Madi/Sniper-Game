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
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = '' })

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
})
