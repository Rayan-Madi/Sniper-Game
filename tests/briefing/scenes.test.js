import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playCinematic } from '../../src/briefing/index.js'

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => { vi.useFakeTimers(FAKE); document.body.innerHTML = '<div id="briefing-root" hidden></div>' })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = '' })

// L'épilogue a deux variantes selon le choix du port (spec §9) : on joue les deux.
describe.each([
  ['m1', 'libres'], ['m2', 'libres'], ['m3', 'libres'], ['m4', 'libres'], ['m5', 'libres'], ['m6', 'libres'],
  ['epilogue', 'libres'], ['epilogue', 'enfermes'],
])('scène %s (port : %s)', (id, port) => {
  it('se joue jusqu\'au bout sans erreur et se démonte proprement', async () => {
    const onDone = vi.fn()
    const handle = await playCinematic(id, { onDone, params: { port } })
    await vi.advanceTimersByTimeAsync(120000); await flush()
    expect(handle.kit.errors).toEqual([])
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
