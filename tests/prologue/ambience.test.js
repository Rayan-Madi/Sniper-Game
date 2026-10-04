import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAmbience } from '../../src/prologue/ambience.js'
import { estimate } from '../../src/briefing/kit.js'

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => vi.useFakeTimers(FAKE))
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() })
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: param(), frequency: param(), Q: param(), loop: false, buffer: null })
function fakeAudio(state = 'running') {
  const ctx = { state, currentTime: 0, sampleRate: 100,
    createGain: vi.fn(node), createOscillator: vi.fn(node), createBufferSource: vi.fn(node), createBiquadFilter: vi.fn(node),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(200) })) }
  return { ctx, dest: node() }
}
// vrai si le signal de n arrive jusqu'à dest en suivant ses branchements
const reaches = (n, dest, seen = new Set()) => n === dest || (!seen.has(n) && (seen.add(n), n.connect.mock.calls.some(([d]) => reaches(d, dest, seen))))

describe('le son de l\'enquête', () => {
  it('sans contexte audio, tout est muet et ne laisse aucun minuteur', async () => {
    const a = createAmbience(null)
    a.start(); a.setProximity(0.5); a.step(); a.tinnitus(); a.glitch(200, 0.7)
    expect(a.speak('Elle s\'est défendue.')).toBe(estimate('Elle s\'est défendue.'))
    await vi.advanceTimersByTimeAsync(5000)
    a.stop(); await vi.advanceTimersByTimeAsync(500)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('la pluie est une boucle continue branchée sur la destination du jeu', () => {
    const audio = fakeAudio()
    const a = createAmbience(audio); a.start()
    // les bruits du kit (grincement de la porte) bouclent aussi, mais programment leur arrêt dès leur création ; la pluie, non
    const rain = audio.ctx.createBufferSource.mock.results.map(r => r.value)
      .filter(s => s.loop && s.start.mock.calls.length && !s.stop.mock.calls.length)
    expect(rain).toHaveLength(1)
    expect(reaches(rain[0], audio.dest)).toBe(true)
    expect(audio.dest.connect).not.toHaveBeenCalled()   // ce sont les nœuds qui se branchent sur dest, pas l'inverse
    a.stop()
  })

  it('le cœur bat plus vite près du salon', async () => {
    const count = async p => {
      const audio = fakeAudio(); const a = createAmbience(audio); a.start(); a.setProximity(p)
      const before = audio.ctx.createOscillator.mock.calls.length
      await vi.advanceTimersByTimeAsync(10000)
      const n = audio.ctx.createOscillator.mock.calls.length - before
      a.stop(); await vi.advanceTimersByTimeAsync(500)
      return n
    }
    expect(await count(1)).toBeGreaterThan(await count(0))
  })

  it('speak fait parler Viktor le temps estimé, puis se tait', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)                    // babil déterministe : une syllabe tous les 125 ms
    const audio = fakeAudio(); const a = createAmbience(audio)
    const before = audio.ctx.createOscillator.mock.calls.length
    const ms = a.speak('Ils voulaient que je sache.')
    expect(ms).toBe(estimate('Ils voulaient que je sache.'))
    await vi.advanceTimersByTimeAsync(ms + 50)
    const n = audio.ctx.createOscillator.mock.calls.length
    expect(n).toBeGreaterThan(before)                                  // Viktor a parlé pendant la réplique
    await vi.advanceTimersByTimeAsync(1000)
    expect(audio.ctx.createOscillator.mock.calls.length).toBe(n)     // plus de syllabes après la réplique
    a.stop()
  })

  it('stop() coupe tout : nœuds débranchés après le fondu, aucun minuteur restant, idempotent', async () => {
    const audio = fakeAudio(); const a = createAmbience(audio)
    a.start(); a.speak('Elle ne dormait jamais sans lui.')
    a.stop(); a.stop()
    await vi.advanceTimersByTimeAsync(400)
    const gains = audio.ctx.createGain.mock.results.map(r => r.value).filter(g => g.connect.mock.calls.some(([d]) => d === audio.dest))
    for (const g of gains) expect(g.disconnect).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    a.start(); a.step()                                              // après l'arrêt : sans effet, sans erreur
    expect(vi.getTimerCount()).toBe(0)
  })
})
