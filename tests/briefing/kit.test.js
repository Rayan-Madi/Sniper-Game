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

  // « Rejouer » (bouton k-replay, ou K.run rappelé) remet la scène à zéro : ce qui tournait du passage précédent
  // s'arrête, sinon un compteur ou une frappe continuent d'écrire dans la scène remise à zéro.
  describe('rejouer', () => {
    it('un compteur lancé avant « rejouer » s\'arrête : il ne réécrit plus la scène remise à zéro', async () => {
      const root = mountScene('<b id="n" data-reset>0</b>')
      const n = root.querySelector('#n')
      const K = createKit({ root })
      K.run({ beats: [{ min: 3000, cues: [[1000, K => K.counter('n', 0, 12, 1000)]] }] })
      await vi.advanceTimersByTimeAsync(1500); await flush()
      expect(Math.abs(+n.textContent - 6)).toBeLessThanOrEqual(1)   // à mi-course
      root.querySelector('#k-replay').click()                       // la même séquence repart de zéro
      expect(n.textContent).toBe('')
      await vi.advanceTimersByTimeAsync(800); await flush()          // le nouveau compteur ne part qu'à 1 000 ms
      expect(n.textContent).toBe('')
      await vi.advanceTimersByTimeAsync(700); await flush()          // 1 500 ms après « rejouer » : il est à mi-course
      expect(Math.abs(+n.textContent - 6)).toBeLessThanOrEqual(1)
    })

    it('une écoute en cours de frappe avant « rejouer » s\'arrête : ses lettres ne s\'ajoutent plus', async () => {
      const root = mountScene('<div id="trans"></div><div id="wave"></div>')
      const K = createKit({ root })
      K.run({ beats: [{ who: 'PHONE', say: 'Une écoute assez longue pour être coupée en route' }] })
      await vi.advanceTimersByTimeAsync(300); await flush()
      expect(root.querySelector('#trans').textContent.length).toBeGreaterThan(0)
      K.run({ beats: [{ min: 5000 }] })                              // rejouer une séquence muette
      await vi.advanceTimersByTimeAsync(5000); await flush()
      expect(root.querySelector('#trans').textContent).toBe('')
    })

    // Garde-fous : « rejouer » arrête le passage précédent, pas l'habillage du kit, dont les minuteurs vivent dans
    // le même registre (préchargement, parasites au repos, glitch en cours).
    it('le préchargement se lève quelques images après le lancement (transitions de nouveau actives)', async () => {
      const root = mountScene()
      const K = createKit({ root })
      K.run({ beats: [{ min: 5000 }] })
      await vi.advanceTimersByTimeAsync(100); await flush()
      expect(root.querySelector('#st').classList.contains('k-preload')).toBe(false)
      root.querySelector('#k-replay').click()
      await vi.advanceTimersByTimeAsync(100); await flush()
      expect(root.querySelector('#st').classList.contains('k-preload')).toBe(false)
    })

    it('les parasites au repos continuent après le lancement et après « rejouer »', async () => {
      const K = createKit({ root: mountScene() })
      const glitch = vi.spyOn(K.snd, 'glitch')
      K.run({ beats: [{ min: 20000 }] })
      await vi.advanceTimersByTimeAsync(4000); await flush()         // un parasite toutes les 1,1 à 3,7 s
      expect(glitch).toHaveBeenCalled()
      glitch.mockClear()
      K.run({ beats: [{ min: 20000 }] })
      await vi.advanceTimersByTimeAsync(4000); await flush()
      expect(glitch).toHaveBeenCalled()
    })

    it('un glitch en cours au moment de « rejouer » ne reste pas figé, et les suivants s\'animent encore', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.99)                // parasites au repos tardifs : 3,7 s
      try {
        const root = mountScene()
        const scene = root.querySelector('#scene')
        const K = createKit({ root })
        K.run({ beats: [{ min: 20000 }] })
        K.glitch(2000, 1)
        await vi.advanceTimersByTimeAsync(100); await flush()
        expect(scene.style.filter).toContain('k-glf')
        K.run({ beats: [{ min: 20000 }] })                            // rejouer en plein glitch
        await vi.advanceTimersByTimeAsync(2500); await flush()
        expect(scene.style.filter).toBe('')
        K.glitch(100, 1)                                              // un glitch du nouveau passage
        expect(scene.style.filter).toContain('k-glf')
        await vi.advanceTimersByTimeAsync(200); await flush()
        expect(scene.style.filter).toBe('')
      } finally { Math.random.mockRestore() }
    })
  })

  // Effets atténués (spec du lot 1 §4.5, tâche L6) : createKit({ reducedMotion: true }), transmis par playCinematic.
  // Aucune secousse, glitchs demandés par la scène à un tiers de leur puissance (donc jamais d'image noire, réservée
  // aux glitchs de plus de 0,7), aucun glitch d'ambiance ; le son des glitchs demandés et les fondus sont gardés.
  describe('effets atténués', () => {
    const st = root => root.querySelector('#st')

    it('K.shake ne secoue pas la scène (sans l\'option, elle est secouée : garde-fou)', () => {
      const calm = mountScene()
      createKit({ root: calm, reducedMotion: true }).shake()
      expect(st(calm).classList.contains('shake')).toBe(false)
      const normal = mountScene()
      createKit({ root: normal }).shake()
      expect(st(normal).classList.contains('shake')).toBe(true)
    })

    it('aucun glitch d\'ambiance, au lancement ni après « rejouer » (appels comptés sur 20 s)', async () => {
      const root = mountScene()
      const K = createKit({ root, reducedMotion: true })
      const glitch = vi.spyOn(K.snd, 'glitch')
      const visuel = vi.spyOn(root.querySelector('#k-gld'), 'setAttribute')
      K.run({ beats: [{ min: 30000 }] })
      await vi.advanceTimersByTimeAsync(10000); await flush()
      root.querySelector('#k-replay').click()
      await vi.advanceTimersByTimeAsync(10000); await flush()
      expect(glitch).not.toHaveBeenCalled()
      expect(visuel.mock.calls.filter(([k, v]) => k === 'scale' && +v > 0)).toHaveLength(0)
      expect(root.querySelector('#scene').style.filter).toBe('')
    })

    // Puissance lue sur l'effet lui-même : déplacement du filtre = hasard × 70 × puissance.
    const scaleAfterGlitch = async (reducedMotion, pow) => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)
      try {
        const root = mountScene()
        const K = createKit({ root, reducedMotion })
        K.glitch(1000, pow)
        await vi.advanceTimersByTimeAsync(45); await flush()
        return +root.querySelector('#k-gld').getAttribute('scale')
      } finally { Math.random.mockRestore() }
    }

    it('un glitch de la scène joue à un tiers de sa puissance (0,9 devient 0,3)', async () => {
      expect(await scaleAfterGlitch(false, 0.9)).toBeCloseTo(0.5 * 70 * 0.9, 1)
      expect(await scaleAfterGlitch(true, 0.9)).toBeCloseTo(0.5 * 70 * 0.3, 1)
    })

    it('jamais d\'image noire, même sur un glitch de pleine puissance (K.lost, K.title)', async () => {
      const blackFrames = async reducedMotion => {
        vi.spyOn(Math, 'random').mockReturnValue(0)   // le hasard le plus défavorable : image noire à chaque pas
        try {
          const root = mountScene()
          const K = createKit({ root, reducedMotion })
          const bf = root.querySelector('#k-bf')
          let on = 0
          new MutationObserver(() => { if (bf.classList.contains('on')) on++ }).observe(bf, { attributes: true })
          K.lost(400)
          await vi.advanceTimersByTimeAsync(700); await flush()
          return on
        } finally { Math.random.mockRestore() }
      }
      expect(await blackFrames(false)).toBeGreaterThan(0)   // garde-fou : sans l'option, le signal perdu a ses images noires
      expect(await blackFrames(true)).toBe(0)
    })

    it('le son d\'un glitch demandé garde sa puissance : seul l\'effet visuel est atténué', () => {
      const K = createKit({ root: mountScene(), reducedMotion: true })
      const glitch = vi.spyOn(K.snd, 'glitch')
      K.glitch(300, 0.9)
      expect(glitch).toHaveBeenCalledWith(300, 0.9)
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

    // Une musique coupée (fin de séquence, changement d'ambiance) s'éteint en fondu, puis son gain est débranché
    // 2 s plus tard. « Rejouer » et le gel vident le registre des minuteurs du kit : ce débranchement ne doit pas
    // y vivre, sinon chaque coupure suivie de près d'un « rejouer » laisse un gain branché au maître.
    const fondues = audio => audio.ctx.createGain.mock.results.map(r => r.value)
      .filter(g => g.gain.setTargetAtTime.mock.calls.some(([v, , tau]) => v === 0.0001 && tau === 0.4))

    it('une musique coupée moins de 2 s avant « rejouer » est quand même débranchée après son fondu', async () => {
      const audio = fakeAudio('running')
      const root = mountScene()
      createKit({ root, audio }).run({ music: 'tense', beats: [{ min: 1000 }] })
      await vi.advanceTimersByTimeAsync(1000); await flush()          // fin de séquence : la musique part en fondu
      const coupees = fondues(audio)
      expect(coupees).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(500); await flush()
      expect(coupees[0].disconnect).not.toHaveBeenCalled()            // fondu en cours
      root.querySelector('#k-replay').click()                         // rejouer 500 ms après la coupure
      await vi.advanceTimersByTimeAsync(1600); await flush()          // 2,1 s après la coupure
      expect(coupees[0].disconnect).toHaveBeenCalled()
    })

    it('une musique coupée peu avant l\'instant du gel est quand même débranchée après son fondu', async () => {
      const audio = fakeAudio('running')
      createKit({ root: mountScene(), audio, freeze: 1500 }).run({ music: 'tense', beats: [{ min: 1000 }] })
      await vi.advanceTimersByTimeAsync(1000); await flush()          // coupure à 1 000 ms, gel à 1 500 ms
      const coupees = fondues(audio)
      expect(coupees).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(600); await flush()
      expect(coupees[0].disconnect).not.toHaveBeenCalled()            // gelé, fondu en cours
      await vi.advanceTimersByTimeAsync(1500); await flush()          // 2,1 s après la coupure
      expect(coupees[0].disconnect).toHaveBeenCalled()
    })

    it('destroy() débranche aussi la musique en fondu, avec le maître, sans laisser de minuteur', async () => {
      const audio = fakeAudio('running')
      const K = createKit({ root: mountScene(), audio })
      K.music('tense')
      K.destroy()
      const coupees = fondues(audio)
      expect(coupees).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(300)
      expect(coupees[0].disconnect).toHaveBeenCalled()
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
