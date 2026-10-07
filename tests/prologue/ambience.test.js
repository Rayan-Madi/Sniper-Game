import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAmbience } from '../../src/prologue/ambience.js'
import { estimate } from '../../src/briefing/kit.js'

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => vi.useFakeTimers(FAKE))
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() })
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: param(), frequency: param(), Q: param(), loop: false, buffer: null })
// hold : les gains offrent cancelAndHoldAtTime (Chrome) ; sans lui, comme Firefox, le fondu retombe sur cancelScheduledValues
function fakeAudio(state = 'running', { hold = false } = {}) {
  const ctx = { state, currentTime: 0, sampleRate: 100,
    createGain: vi.fn(() => { const n = node(); if (hold) n.gain.cancelAndHoldAtTime = vi.fn(); return n }), createOscillator: vi.fn(node), createBufferSource: vi.fn(node), createBiquadFilter: vi.fn(node),
    createBuffer: vi.fn((ch, length) => ({ length, getChannelData: () => new Float32Array(length) })) }
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

  it("la pluie boucle sur un bruit de 6 s (2 s se répétaient à l'oreille)", () => {
    const audio = fakeAudio()
    const a = createAmbience(audio); a.start()
    const [rain] = audio.ctx.createBufferSource.mock.results.map(r => r.value)
      .filter(s => s.loop && s.start.mock.calls.length && !s.stop.mock.calls.length)
    expect(rain.buffer.length).toBeGreaterThanOrEqual(6 * audio.ctx.sampleRate)
    a.stop()
  })

  // le gain de la pluie : source → passe-bande → passe-haut → gain
  const rainGain = audio => {
    const [rain] = audio.ctx.createBufferSource.mock.results.map(r => r.value)
      .filter(s => s.loop && s.start.mock.calls.length && !s.stop.mock.calls.length)
    return rain.connect.mock.calls[0][0].connect.mock.calls[0][0].connect.mock.calls[0][0].gain
  }

  it("à l'arrêt, sans cancelAndHoldAtTime, le fondu de la pluie annule la montée puis repart du niveau atteint (pas de coupure sèche)", () => {
    const audio = fakeAudio()
    const a = createAmbience(audio); a.start()
    const g = rainGain(audio)
    audio.ctx.currentTime = 0.7; g.value = 0.03                      // en pleine montée de 2 s : la valeur lue est celle atteinte
    a.stop()
    expect(g.cancelScheduledValues).toHaveBeenCalledWith(0.7)
    expect(g.setValueAtTime).toHaveBeenCalledWith(0.03, 0.7)         // sans cela, cancelScheduledValues ramènerait le gain à 0,0001
    expect(g.setTargetAtTime).toHaveBeenCalledWith(0.0001, 0.7, expect.any(Number))
    const order = f => f.mock.invocationCallOrder[0]
    expect(order(g.cancelScheduledValues)).toBeLessThan(order(g.setValueAtTime))
    expect(order(g.setValueAtTime)).toBeLessThan(order(g.setTargetAtTime))
  })

  it("à l'arrêt, avec cancelAndHoldAtTime, le fondu de la pluie fige la montée à l'instant présent puis s'éteint", () => {
    const audio = fakeAudio('running', { hold: true })
    const a = createAmbience(audio); a.start()
    const g = rainGain(audio)
    audio.ctx.currentTime = 0.7; g.value = 0.03
    a.stop()
    expect(g.cancelAndHoldAtTime).toHaveBeenCalledWith(0.7)
    expect(g.cancelScheduledValues).not.toHaveBeenCalled()           // il remettrait le gain à sa valeur intrinsèque
    expect(g.setTargetAtTime).toHaveBeenCalledWith(0.0001, 0.7, expect.any(Number))
    expect(g.cancelAndHoldAtTime.mock.invocationCallOrder[0]).toBeLessThan(g.setTargetAtTime.mock.invocationCallOrder[0])
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

  it('hush() coupe la voix en cours et annule son arrêt programmé ; sans voix ou après l\'arrêt, sans effet', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const audio = fakeAudio(); const a = createAmbience(audio)
    a.speak('Elles étaient là. Ma femme. Ma fille.')
    await vi.advanceTimersByTimeAsync(400)
    const n = audio.ctx.createOscillator.mock.calls.length
    expect(n).toBeGreaterThan(0)
    a.hush()
    expect(vi.getTimerCount()).toBe(0)                               // ni babil, ni arrêt programmé
    await vi.advanceTimersByTimeAsync(5000)
    expect(audio.ctx.createOscillator.mock.calls.length).toBe(n)
    expect(() => { a.hush(); a.stop(); a.hush() }).not.toThrow()
    expect(() => createAmbience(null).hush()).not.toThrow()
  })

  it('une nouvelle réplique fait d\'abord taire la précédente : un seul babil, un seul arrêt programmé', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const audio = fakeAudio(); const a = createAmbience(audio)
    const hush = vi.spyOn(a, 'hush')
    a.speak('Ce jour-là, j\'avais oublié mon téléphone.')
    await vi.advanceTimersByTimeAsync(300)
    a.speak('Elle ne dormait jamais sans lui.')
    expect(hush).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(2)
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
