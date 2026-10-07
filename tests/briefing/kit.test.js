import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createKit, estimate } from '../../src/briefing/kit.js'

function mountScene(inner = '') {
  document.body.innerHTML = `<div id="root"><div class="st" id="st"><div class="scene" id="scene">${inner}
    <div class="radio" id="radio"></div><div class="sub" id="sub"></div><div class="title" id="title"></div></div></div></div>`
  return document.getElementById('root')
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
beforeEach(() => vi.useFakeTimers(FAKE))
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

describe('kit des cinématiques', () => {
  it('estime une réplique à 350 ms + 62 ms par caractère', () => {
    expect(estimate('abc')).toBe(536)
  })

  it('injecte l\'habillage et remplit la radio par défaut', () => {
    const root = mountScene()
    createKit({ root })
    for (const id of ['k-crt', 'k-bf', 'k-lost', 'k-black', 'k-glf', 'k-replay', 'k-lbl']) {
      expect(root.querySelector('#' + id)).not.toBeNull()
    }
    expect(root.querySelector('#radio').textContent).toContain('ANTON')
  })

  it('refuse une scène sans #st ni #scene', () => {
    document.body.innerHTML = '<div id="root"></div>'
    expect(() => createKit({ root: document.getElementById('root') })).toThrow(/#st/)
  })

  it('un temps parlé dure sa réplique estimée + 350 ms, puis la séquence se termine', async () => {
    const K = createKit({ root: mountScene() })
    let done = false
    K.run({ beats: [{ say: 'abc' }] }).then(() => { done = true })
    await vi.advanceTimersByTimeAsync(536 + 350 - 1); await flush()
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1); await flush()
    expect(done).toBe(true)
  })

  it('déclenche les effets à leur instant, relatif au début du temps', async () => {
    const K = createKit({ root: mountScene() })
    const seen = []
    K.run({ beats: [{ min: 1000 }, { min: 1000, cues: [[200, () => seen.push('b')]] }] })
    await vi.advanceTimersByTimeAsync(1199); await flush()
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(1); await flush()
    expect(seen).toEqual(['b'])
  })

  it('affiche Anton en sous-titre et allume la radio pendant qu\'il parle', async () => {
    const root = mountScene()
    const K = createKit({ root })
    K.run({ beats: [{ say: 'Salut' }] })
    await vi.advanceTimersByTimeAsync(10); await flush()
    expect(root.querySelector('#sub .spk').textContent).toBe('ANTON')
    expect(root.querySelector('#radio').classList.contains('talk')).toBe(true)
    await vi.advanceTimersByTimeAsync(estimate('Salut')); await flush()
    expect(root.querySelector('#radio').classList.contains('talk')).toBe(false)
    expect(root.querySelector('#sub .tx').textContent).toBe('Salut')
  })

  it('tape une écoute téléphonique dans #trans quand la scène en a un', async () => {
    const root = mountScene('<div id="trans"></div><div id="wave"></div>')
    const K = createKit({ root })
    K.run({ beats: [{ who: 'PHONE', say: 'Allo' }] })
    await vi.advanceTimersByTimeAsync(estimate('Allo')); await flush()
    expect(root.querySelector('#trans').textContent).toBe('Allo')
    expect(root.querySelector('#sub').textContent).toBe('')
  })

  it('étiquette la voix intérieure de Viktor sans allumer la radio', async () => {
    const root = mountScene()
    const K = createKit({ root })
    K.run({ beats: [{ who: 'VIKTOR', say: 'Non.' }] })
    await vi.advanceTimersByTimeAsync(10); await flush()
    expect(root.querySelector('#sub .spk').classList.contains('inner')).toBe(true)
    expect(root.querySelector('#radio').classList.contains('talk')).toBe(false)
  })

  it('remet la scène à zéro au lancement : classes d\'état et champs data-reset', () => {
    const root = mountScene('<div id="a" class="on side"></div><div id="b" data-reset>vieux</div>')
    const K = createKit({ root })
    K.run({ beats: [] })
    expect(root.querySelector('#a').className).toBe('')
    expect(root.querySelector('#b').textContent).toBe('')
  })

  it('destroy() annule tous les minuteurs ; la séquence ne se termine jamais', async () => {
    const K = createKit({ root: mountScene() })
    let done = false
    K.run({ beats: [{ say: 'Une réplique assez longue' }] }).then(() => { done = true })
    await vi.advanceTimersByTimeAsync(100)
    K.destroy()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10000); await flush()
    expect(done).toBe(false)
  })

  it('en mode gel, tout s\'arrête à l\'instant demandé et la scène est marquée figée', async () => {
    const root = mountScene()
    const K = createKit({ root, freeze: 500 })
    K.run({ beats: [{ say: 'Une réplique qui dure un moment' }] })
    await vi.advanceTimersByTimeAsync(500); await flush()
    expect(K.frozen).toBe(true)
    expect(root.querySelector('#st').classList.contains('k-frozen')).toBe(true)
    const typed = root.querySelector('#sub .tx').textContent
    await vi.advanceTimersByTimeAsync(5000); await flush()
    expect(root.querySelector('#sub .tx').textContent).toBe(typed)
    expect(vi.getTimerCount()).toBe(0)
  })

  // Une capture gelée ne doit pas mentir : un compteur en cours au gel affiche sa valeur à cet instant,
  // pas sa valeur finale (« 12 / 24 » alors que 9 silhouettes seulement étaient allumées en M5).
  describe('compteur démarré à t = 0', () => {
    const lancer = (freeze, to = 12) => {
      const root = mountScene('<b id="n">0</b>')
      const K = createKit({ root, freeze })
      K.run({ beats: [{ min: 3000, cues: [[0, K => K.counter('n', 0, to, 1000)]] }] })
      return root.querySelector('#n')
    }

    it('de 0 à 12 sur 1 000 ms, gelé à 500 ms : il affiche 6, et rien ne bouge ensuite', async () => {
      const n = lancer(500)
      await vi.advanceTimersByTimeAsync(500); await flush()
      expect(n.textContent).toBe('6')
      await vi.advanceTimersByTimeAsync(2000); await flush()
      expect(n.textContent).toBe('6')
    })

    it('de 0 à 12 sur 1 000 ms, gelé à 1 500 ms : il affiche sa valeur finale', async () => {
      const n = lancer(1500)
      await vi.advanceTimersByTimeAsync(1500); await flush()
      expect(n.textContent).toBe('12')
    })

    it('gelé entre deux images, il affiche la valeur de l\'instant du gel, pas celle de la dernière image', async () => {
      const n = lancer(505, 1000)   // de 0 à 1 000 sur 1 000 ms ; dernière image à 496 ms
      await vi.advanceTimersByTimeAsync(505); await flush()
      expect(n.textContent).toBe('505')
    })

    it('sans gel, il avance pendant sa durée puis s\'arrête sur sa valeur finale', async () => {
      const n = lancer(null)
      await vi.advanceTimersByTimeAsync(500); await flush()
      expect(Math.abs(+n.textContent - 6)).toBeLessThanOrEqual(1)
      await vi.advanceTimersByTimeAsync(600); await flush()
      expect(n.textContent).toBe('12')
    })
  })

  // Une capture gelée est muette : un compteur avec tickEvery ne tique pas en mode gel.
  describe('tics sonores d\'un compteur de 0 à 12 par paliers de 3', () => {
    const tics = async freeze => {
      const K = createKit({ root: mountScene('<b id="n">0</b>'), freeze })
      const count = vi.spyOn(K.snd, 'count')
      K.run({ beats: [{ min: 3000, cues: [[0, K => K.counter('n', 0, 12, 1000, '', 3)]] }] })
      await vi.advanceTimersByTimeAsync(1500); await flush()
      return count.mock.calls.length
    }

    it('sans gel, un tic par palier franchi : 0, 3, 6, 9 et 12 (témoin de l\'espion)', async () => {
      expect(await tics(null)).toBe(5)
    })

    it('en mode gel, aucun tic pendant toute sa course, même terminée avant l\'instant du gel', async () => {
      expect(await tics(2000)).toBe(0)
    })
  })

  it('reste muet et sans erreur quand aucun contexte audio n\'est fourni', () => {
    const K = createKit({ root: mountScene() })
    expect(() => { K.snd.boom(); K.snd.stamp(); K.music('tense'); K.music(null) }).not.toThrow()
  })

  it('une erreur du séquenceur est consignée dans K.errors et la séquence se termine quand même', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const K = createKit({ root: mountScene() })
      let done = false
      K.run({ beats: [], reset: () => { throw new Error('scène cassée') } }).then(() => { done = true })
      await flush()
      expect(K.errors).toHaveLength(1)
      expect(K.errors[0]).toContain('scène cassée')
      expect(done).toBe(true)
    } finally { spy.mockRestore() }
  })

  describe('avec un contexte audio injecté', () => {
    // Faux AudioContext minimal : assez pour que sound.js construise ses graphes, sans rien produire.
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() })
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: param(), frequency: param(), Q: param() })
    function fakeAudio(state) {
      const ctx = {
        state, currentTime: 0, sampleRate: 100,
        createGain: vi.fn(node), createOscillator: vi.fn(node), createBufferSource: vi.fn(node), createBiquadFilter: vi.fn(node),
        createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(200) })),
      }
      return { ctx, dest: node() }
    }

    it('branche le nœud maître du kit sur la destination fournie', () => {
      const audio = fakeAudio('running')
      createKit({ root: mountScene(), audio })
      const master = audio.ctx.createGain.mock.results[0].value
      expect(master.connect).toHaveBeenCalledWith(audio.dest)
    })

    it('reste silencieux tant que le contexte n\'est pas démarré (état suspended)', () => {
      const audio = fakeAudio('suspended')
      const K = createKit({ root: mountScene(), audio })
      K.snd.boom(); K.snd.stamp(); K.music('tense')
      expect(audio.ctx.createOscillator).not.toHaveBeenCalled()
      expect(audio.ctx.createBufferSource).not.toHaveBeenCalled()
      expect(audio.ctx.createBiquadFilter).not.toHaveBeenCalled()
      expect(audio.ctx.createGain).toHaveBeenCalledTimes(1)   // le seul nœud : le maître
    })

    it('destroy() coupe le son en fondu, puis débranche le maître ~300 ms plus tard sans laisser de minuteur', async () => {
      const audio = fakeAudio('running')
      const K = createKit({ root: mountScene(), audio })
      K.music('tense')
      expect(audio.ctx.createOscillator).toHaveBeenCalled()
      K.destroy()
      const master = audio.ctx.createGain.mock.results[0].value
      expect(master.gain.setTargetAtTime).toHaveBeenCalledWith(0.0001, 0, 0.06)   // fondu, pas de coupure nette
      expect(master.disconnect).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(300)
      expect(master.disconnect).toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })

    // garde-fou (le drapeau `dead` existait déjà) : le fondu de 300 ms ne laisse pas repartir de son
    it('après destroy(), plus aucun nœud sonore n\'est créé, pendant ni après le fondu', async () => {
      const audio = fakeAudio('running')
      const K = createKit({ root: mountScene(), audio })
      K.destroy()
      const noeuds = () => audio.ctx.createOscillator.mock.calls.length + audio.ctx.createBufferSource.mock.calls.length + audio.ctx.createBiquadFilter.mock.calls.length
      K.snd.boom(); K.music('tense')
      expect(noeuds()).toBe(0)
      await vi.advanceTimersByTimeAsync(300)
      K.snd.boom(); K.music('tense')
      expect(noeuds()).toBe(0)
      expect(audio.ctx.createGain).toHaveBeenCalledTimes(1)   // le seul nœud : le maître
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
