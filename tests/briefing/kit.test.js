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

  it('reste muet et sans erreur quand aucun contexte audio n\'est fourni', () => {
    const K = createKit({ root: mountScene() })
    expect(() => { K.snd.boom(); K.snd.stamp(); K.music('tense'); K.music(null) }).not.toThrow()
  })
})
