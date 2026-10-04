import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playCinematic } from '../../src/briefing/index.js'
import { SCENES } from '../../scripts/port-maquette.mjs'

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => { vi.useFakeTimers(FAKE); document.body.innerHTML = '<div id="briefing-root" hidden></div>' })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = '' })

// Chaque scène jouée jusqu'au bout ; l'épilogue dans ses deux variantes (choix du port, spec §9).
const CAS = [
  ['m1', {}], ['m2', {}], ['m3', {}], ['m4', {}], ['m5', {}], ['m6', {}],
  ['epilogue', { port: 'libres' }], ['epilogue', { port: 'enfermes' }],
  ['prologue-a', {}], ['prologue-b', {}],
]

it('joue toutes les scènes connues du convertisseur', () => {
  expect([...new Set(CAS.map(([id]) => id))].sort()).toEqual(Object.keys(SCENES).sort())
})

describe.each(CAS)('scène %s %o', (id, params) => {
  it('se joue jusqu\'au bout sans erreur et se démonte proprement', async () => {
    const onDone = vi.fn()
    const handle = await playCinematic(id, { onDone, params })
    await vi.advanceTimersByTimeAsync(120000); await flush()
    expect(handle.kit.errors).toEqual([])
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
