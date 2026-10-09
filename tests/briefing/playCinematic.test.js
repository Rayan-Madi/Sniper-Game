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
const GRACE = 500   // SKIP_GRACE_MS : aucun passage par le joueur avant ce délai
// L'état du module (cinématique en cours) survit à un test : on purge celle qu'un test précédent a laissée jouer.
beforeEach(async () => {
  vi.useFakeTimers(FAKE); document.body.innerHTML = '<div id="briefing-root" hidden></div>'
  if (isCinematicPlaying()) (await playCinematic('test', {})).cancel()
  document.head.innerHTML = ''   // la purge a pu injecter le style du kit : chaque test repart comme une première cinématique
})
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

  it.each(['Escape', 'Enter', 'NumpadEnter', 'Space'])('passe avec %s : fondu de 400 ms, puis onDone une seule fois', async code => {
    const onDone = vi.fn()
    await playCinematic('test', { onDone })
    await vi.advanceTimersByTimeAsync(GRACE)   // délai de grâce écoulé
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
    await vi.advanceTimersByTimeAsync(GRACE)
    document.getElementById('briefing-root').click()
    await vi.advanceTimersByTimeAsync(400); await flush()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  // Délai de grâce : le second clic d'un double-clic sur le bouton de lancement ne doit pas passer la scène.
  describe('délai de grâce de 500 ms', () => {
    const longScene = { ...fakeScene, start(K) { K.run({ beats: [{ min: 5000 }] }) } }
    registerScene('longue', async () => longScene)

    it('un clic à +100 ms est ignoré, un clic à +600 ms fait passer', async () => {
      const onDone = vi.fn()
      await playCinematic('longue', { onDone })
      const root = document.getElementById('briefing-root')
      await vi.advanceTimersByTimeAsync(100)
      root.click()
      expect(root.classList.contains('k-leaving')).toBe(false)
      await vi.advanceTimersByTimeAsync(500); await flush()   // +600 ms, fondu non lancé
      expect(onDone).not.toHaveBeenCalled()
      expect(isCinematicPlaying()).toBe(true)
      root.click()
      expect(root.classList.contains('k-leaving')).toBe(true)
      await vi.advanceTimersByTimeAsync(400); await flush()
      expect(onDone).toHaveBeenCalledTimes(1)
    })

    it('pendant la grâce, la touche de passage est avalée (le jeu ne la voit pas) sans faire passer', async () => {
      const other = vi.fn()
      document.addEventListener('keydown', other)
      await playCinematic('longue', {})
      await vi.advanceTimersByTimeAsync(100)
      const key = new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true })
      document.body.dispatchEvent(key)
      expect(key.defaultPrevented).toBe(true)
      expect(other).not.toHaveBeenCalled()
      expect(document.getElementById('briefing-root').classList.contains('k-leaving')).toBe(false)
      document.removeEventListener('keydown', other)
    })

    it('handle.stop() reste immédiat, grâce ou pas', async () => {
      const onDone = vi.fn()
      const handle = await playCinematic('longue', { onDone })
      handle.stop()
      expect(document.getElementById('briefing-root').classList.contains('k-leaving')).toBe(true)
      await vi.advanceTimersByTimeAsync(400); await flush()
      expect(onDone).toHaveBeenCalledTimes(1)
    })
  })

  it('une touche maintenue (repeat) est avalée mais ne fait pas passer', async () => {
    const other = vi.fn()
    document.addEventListener('keydown', other)
    const onDone = vi.fn()
    await playCinematic('test', { onDone })
    await vi.advanceTimersByTimeAsync(GRACE)
    const root = document.getElementById('briefing-root')
    const key = new KeyboardEvent('keydown', { code: 'Enter', repeat: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(true)
    expect(other).not.toHaveBeenCalled()
    expect(root.classList.contains('k-leaving')).toBe(false)
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }))
    expect(root.classList.contains('k-leaving')).toBe(true)
    document.removeEventListener('keydown', other)
  })

  it('la touche qui fait passer ne parvient pas aux autres écouteurs du jeu', async () => {
    const other = vi.fn()
    document.addEventListener('keydown', other)
    await playCinematic('test', {})
    await vi.advanceTimersByTimeAsync(GRACE)
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

  // Effets atténués (spec du lot 1 §4.5, tâche L6) : l'option reducedMotion arrive au kit, sans toucher aux scènes.
  describe('effets atténués', () => {
    const shakeAndIdle = async opts => {
      const handle = await playCinematic('longue', opts)
      const st = document.querySelector('#briefing-root #st')
      handle.kit.shake()
      const shaken = st.classList.contains('shake')
      const glitch = vi.spyOn(handle.kit.snd, 'glitch')
      await vi.advanceTimersByTimeAsync(4000); await flush()   // un glitch d'ambiance toutes les 1,1 à 3,7 s
      return { shaken, idle: glitch.mock.calls.length }
    }

    it('reducedMotion: true : ni secousse ni glitch d\'ambiance', async () => {
      expect(await shakeAndIdle({ reducedMotion: true })).toEqual({ shaken: false, idle: 0 })
    })

    it('sans l\'option : la scène est secouée et les glitchs d\'ambiance tournent (garde-fou)', async () => {
      const r = await shakeAndIdle({})
      expect(r.shaken).toBe(true)
      expect(r.idle).toBeGreaterThan(0)
    })
  })

  // Mission montée pendant son briefing (spec du lot 1 §4.6, tâche L7) : main.js passe ready, promesse tenue une fois
  // la mission montée. L'écran noir s'affiche tout de suite ; la scène ne démarre qu'ensuite, pour que le montage, qui
  // bloque le fil principal, ne fige pas son animation.
  describe('option ready', () => {
    it('écran noir tout de suite, scène démarrée seulement une fois ready tenue', async () => {
      let go
      const ready = new Promise(r => { go = r })
      const pending = playCinematic('test', { ready })
      const root = document.getElementById('briefing-root')
      expect(root.hidden).toBe(false)
      await flush()
      expect(root.querySelector('#scene')).toBeNull()
      expect(isCinematicPlaying()).toBe(false)
      go()
      await pending
      expect(root.querySelector('#scene')).not.toBeNull()
      expect(isCinematicPlaying()).toBe(true)
    })

    it('ready rejetée : la scène démarre quand même', async () => {
      const onDone = vi.fn()
      const handle = await playCinematic('test', { onDone, ready: Promise.reject(new Error('montage')) })
      expect(handle.kit).not.toBeNull()
      expect(isCinematicPlaying()).toBe(true)
      expect(onDone).not.toHaveBeenCalled()
    })

    it('une cinématique demandée pendant l\'attente de ready la remplace sans bruit', async () => {
      let go
      const first = vi.fn()
      const pending = playCinematic('test', { onDone: first, ready: new Promise(r => { go = r }) })
      await flush()
      const second = await playCinematic('longue', {})
      go()
      const stale = await pending
      expect(stale.kit).toBeNull()
      expect(second.kit).not.toBeNull()
      expect(isCinematicPlaying()).toBe(true)
      expect(first).not.toHaveBeenCalled()
    })
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

  // Conteneur noir dès le chargement : l'image 3D figée ne doit pas se voir pendant que la scène se charge.
  describe('pendant le chargement de la scène', () => {
    const rootEl = () => document.getElementById('briefing-root')

    it('affiche le conteneur noir tout de suite, avant que le module soit chargé', async () => {
      let load
      registerScene('differee', () => new Promise(r => { load = () => r(fakeScene) }))
      const p = playCinematic('differee', {})
      expect(rootEl().hidden).toBe(false)
      expect(rootEl().innerHTML).toBe('')
      load(); await p
      expect(rootEl().hidden).toBe(false)
      expect(rootEl().querySelector('#scene')).not.toBeNull()
    })

    it('le style du kit est déjà injecté pendant le chargement (conteneur plein écran et noir, même à la première cinématique)', async () => {
      expect(document.getElementById('k-kit-css')).toBeNull()   // rien d'injecté avant : première cinématique de la session
      let load
      registerScene('differeeStyle', () => new Promise(r => { load = () => r(fakeScene) }))
      const p = playCinematic('differeeStyle', {})
      expect(rootEl().hidden).toBe(false)
      expect(document.getElementById('k-kit-css')).not.toBeNull()
      load(); await p
      expect(document.querySelectorAll('#k-kit-css')).toHaveLength(1)   // idempotent
    })

    it('un chargement qui échoue recache le conteneur, puis relance l\'erreur', async () => {
      let fail
      registerScene('echec', () => new Promise((_, reject) => { fail = () => reject(new Error('réseau')) }))
      const p = playCinematic('echec', {})
      expect(rootEl().hidden).toBe(false)
      fail()
      await expect(p).rejects.toThrow('réseau')
      expect(rootEl().hidden).toBe(true)
    })

    it('un chargement dépassé par une demande plus récente qui échoue ne touche pas au conteneur', async () => {
      let fail
      registerScene('echecLent', () => new Promise((_, reject) => { fail = () => reject(new Error('réseau')) }))
      const lent = playCinematic('echecLent', {})
      await playCinematic('test', {})   // la demande suivante se charge et se monte avant l'échec de la première
      fail()
      await expect(lent).rejects.toThrow('réseau')
      expect(rootEl().hidden).toBe(false)
      expect(isCinematicPlaying()).toBe(true)
    })

    it('R1 échoue pendant que R2 charge encore : le conteneur reste visible, puis R2 se monte', async () => {
      let failR1, loadR2
      registerScene('r1', () => new Promise((_, reject) => { failR1 = () => reject(new Error('réseau')) }))
      registerScene('r2', () => new Promise(r => { loadR2 = () => r(fakeScene) }))
      const onDone = vi.fn()
      const p1 = playCinematic('r1', {})
      const p2 = playCinematic('r2', { onDone })
      failR1()
      await expect(p1).rejects.toThrow('réseau')
      expect(rootEl().hidden).toBe(false)   // R2 attend toujours : pas de flash du jeu entre les deux
      loadR2(); await p2
      expect(rootEl().hidden).toBe(false)
      expect(rootEl().querySelector('#scene')).not.toBeNull()
      expect(isCinematicPlaying()).toBe(true)
      await vi.advanceTimersByTimeAsync(1000); await flush()
      expect(onDone).toHaveBeenCalledTimes(1)
    })

    it('un chargement qui échoue pendant qu\'une cinématique est en cours ne cache pas son conteneur', async () => {
      let fail
      registerScene('echecEnCours', () => new Promise((_, reject) => { fail = () => reject(new Error('réseau')) }))
      await playCinematic('test', {})
      const p = playCinematic('echecEnCours', {})
      fail()
      await expect(p).rejects.toThrow('réseau')
      expect(rootEl().hidden).toBe(false)
      expect(rootEl().querySelector('#scene')).not.toBeNull()
      expect(isCinematicPlaying()).toBe(true)
    })
  })

  // Le maître du kit doit être débranché du maître du jeu dans tous les cas de sortie (spec §9).
  describe('avec un contexte audio injecté', () => {
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() })
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: param(), frequency: param(), Q: param() })
    function fakeAudio() {
      const ctx = {
        state: 'running', currentTime: 0, sampleRate: 100,
        createGain: vi.fn(node), createOscillator: vi.fn(node), createBufferSource: vi.fn(node), createBiquadFilter: vi.fn(node),
        createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(200) })),
      }
      return { ctx, dest: node() }
    }
    const masterOf = audio => audio.ctx.createGain.mock.results[0].value   // premier nœud créé par le kit

    it('fin normale : le maître du kit est débranché', async () => {
      const audio = fakeAudio()
      await playCinematic('test', { audio })
      const master = masterOf(audio)
      expect(master.connect).toHaveBeenCalledWith(audio.dest)
      await vi.advanceTimersByTimeAsync(1000); await flush()
      await vi.advanceTimersByTimeAsync(300)   // fondu du son avant le débranchement
      expect(master.disconnect).toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('passage par le joueur : le maître du kit est débranché', async () => {
      const audio = fakeAudio()
      await playCinematic('test', { audio })
      await vi.advanceTimersByTimeAsync(GRACE)
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }))
      await vi.advanceTimersByTimeAsync(400); await flush()
      await vi.advanceTimersByTimeAsync(300)
      expect(masterOf(audio).disconnect).toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('annulation par une seconde cinématique : le maître de la première est débranché', async () => {
      const first = fakeAudio(), second = fakeAudio()
      await playCinematic('test', { audio: first })
      await playCinematic('test', { audio: second })
      await vi.advanceTimersByTimeAsync(300)
      expect(masterOf(first).disconnect).toHaveBeenCalled()
      expect(masterOf(second).disconnect).not.toHaveBeenCalled()   // la seconde joue encore
      await vi.advanceTimersByTimeAsync(2000); await flush()
      expect(masterOf(second).disconnect).toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
