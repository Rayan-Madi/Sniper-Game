import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { progressOf, waitForCharacters, startWhenReady, createLoadingScreen, watchContextLoss } from '../../src/campaign/loading.js'

// Chargement des modèles avant une mission ou une manche, et contexte WebGL perdu (spec du lot 1 §4.4).
// Horloge factice (vi.useFakeTimers) : l'écran ne s'affiche qu'au-delà de 150 ms d'attente et l'attente s'arrête à 20 s.

// Promesse réglable de l'extérieur, comme le chargement des modèles.
function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// Attente observée : ce que l'écran a reçu, et si la promesse de waitForCharacters est tenue (et avec quoi).
function watch(ready, extra = {}) {
  const shown = [], hides = []
  let p = 0
  const out = { shown, hides, settled: false, result: null, setProgress: v => { p = v } }
  waitForCharacters({ ready: () => ready, progress: () => p, show: v => shown.push(v), hide: () => hides.push(Date.now()), ...extra })
    .then(r => { out.settled = true; out.result = r }, e => { out.settled = true; out.error = e })
  return out
}

describe('progressOf : avancement du chargement des modèles', () => {
  it('par octets reçus quand chaque fichier annonce sa taille', () => {
    expect(progressOf([{ loaded: 30, total: 100, done: false }, { loaded: 0, total: 300, done: false }])).toBeCloseTo(30 / 400, 9)
    expect(progressOf([{ loaded: 100, total: 100, done: true }, { loaded: 150, total: 300, done: false }])).toBeCloseTo(250 / 400, 9)
  })

  it('par fichiers quand une taille manque (réponse sans Content-Length)', () => {
    // deux fichiers sur quatre finis, un à moitié dont la taille est connue, un sans taille : (1 + 1 + 0,5 + 0) / 4
    const files = [
      { loaded: 10, total: 10, done: true }, { loaded: 0, total: 0, done: true },
      { loaded: 50, total: 100, done: false }, { loaded: 70, total: 0, done: false },
    ]
    expect(progressOf(files)).toBeCloseTo(2.5 / 4, 9)
  })

  it('1 seulement quand tout est fini (ou en échec) ; tous les octets reçus, modèle encore à décoder : 0,99', () => {
    expect(progressOf([{ loaded: 100, total: 100, done: false }, { loaded: 5, total: 5, done: true }])).toBe(0.99)
    expect(progressOf([{ loaded: 0, total: 0, done: true }, { loaded: 5, total: 5, done: true }])).toBe(1)
    expect(progressOf([])).toBe(1)
  })
})

describe('waitForCharacters : écran de chargement des modèles', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('modèles déjà prêts : aucun écran, on part tout de suite', async () => {
    const w = watch(Promise.resolve())
    await vi.advanceTimersByTimeAsync(0)
    expect(w.settled).toBe(true)
    expect(w.result).toMatchObject({ shown: false, timedOut: false, failed: false, cancelled: false })
    expect(w.shown).toEqual([])
    expect(w.hides).toEqual([])
  })

  it('chargement de moins de 150 ms : aucun écran', async () => {
    const d = deferred()
    const w = watch(d.promise)
    await vi.advanceTimersByTimeAsync(120)
    d.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(w.settled).toBe(true)
    expect(w.shown).toEqual([])
    expect(w.hides).toEqual([])
    await vi.advanceTimersByTimeAsync(1000)   // aucun minuteur oublié qui afficherait l'écran après coup
    expect(w.shown).toEqual([])
  })

  it('chargement long : l\'écran apparaît à 150 ms, suit l\'avancement, puis disparaît à la fin', async () => {
    const d = deferred()
    const w = watch(d.promise)
    w.setProgress(0.2)
    await vi.advanceTimersByTimeAsync(149)
    expect(w.shown).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(w.shown).toEqual([0.2])
    w.setProgress(0.63)
    await vi.advanceTimersByTimeAsync(400)
    expect(w.shown.at(-1)).toBe(0.63)
    expect(w.settled).toBe(false)
    expect(w.hides).toEqual([])
    d.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(w.settled).toBe(true)
    expect(w.result).toMatchObject({ shown: true, timedOut: false, failed: false })
    expect(w.hides.length).toBe(1)
    const n = w.shown.length
    await vi.advanceTimersByTimeAsync(1000)   // plus rien après la fin
    expect(w.shown.length).toBe(n)
    expect(w.hides.length).toBe(1)
  })

  it('l\'avancement affiché ne recule jamais (passage du décompte par fichiers au décompte par octets)', async () => {
    const d = deferred()
    const w = watch(d.promise)
    w.setProgress(0.5)
    await vi.advanceTimersByTimeAsync(200)
    w.setProgress(0.3)
    await vi.advanceTimersByTimeAsync(300)
    expect(Math.min(...w.shown)).toBe(0.5)
    w.setProgress(0.7)
    await vi.advanceTimersByTimeAsync(200)
    expect(w.shown.at(-1)).toBe(0.7)
    d.resolve()
  })

  it('échec du chargement : on part quand même (repli procédural), l\'écran disparaît', async () => {
    const d = deferred()
    const w = watch(d.promise)
    await vi.advanceTimersByTimeAsync(1000)
    d.reject(new Error('404'))
    await vi.advanceTimersByTimeAsync(0)
    expect(w.error).toBeUndefined()
    expect(w.settled).toBe(true)
    expect(w.result).toMatchObject({ shown: true, failed: true, timedOut: false })
    expect(w.hides.length).toBe(1)
  })

  it('l\'écran ne reste jamais plus de 20 s : on part avec ce qui est chargé', async () => {
    const w = watch(new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(19999)
    expect(w.settled).toBe(false)
    expect(w.hides).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(w.settled).toBe(true)
    expect(w.result).toMatchObject({ shown: true, timedOut: true })
    expect(w.hides.length).toBe(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(w.hides.length).toBe(1)
  })

  it('lancement abandonné pendant l\'attente (isCurrent faux) : l\'écran disparaît, l\'attente se termine', async () => {
    let current = true
    const w = watch(new Promise(() => {}), { isCurrent: () => current })
    await vi.advanceTimersByTimeAsync(500)
    expect(w.shown.length).toBeGreaterThan(0)
    current = false
    await vi.advanceTimersByTimeAsync(100)
    expect(w.settled).toBe(true)
    expect(w.result).toMatchObject({ cancelled: true })
    expect(w.hides.length).toBe(1)
    const n = w.shown.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(w.shown.length).toBe(n)
  })
})

describe('startWhenReady : départ d\'une mission ou d\'une manche', () => {
  it('modèles prêts : départ dans le même appel, sans attente', () => {
    const start = vi.fn(), wait = vi.fn(() => Promise.resolve())
    startWhenReady({ settled: () => true, wait, start })
    expect(start).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })

  it('modèles en cours de chargement : départ seulement à la fin de l\'attente', async () => {
    const d = deferred()
    const start = vi.fn()
    const done = startWhenReady({ settled: () => false, wait: () => d.promise, start })
    await Promise.resolve()
    expect(start).not.toHaveBeenCalled()
    d.resolve({ shown: true })
    await done
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('lancement abandonné pendant l\'attente : aucun départ', async () => {
    const d = deferred()
    let current = true
    const start = vi.fn()
    const done = startWhenReady({ settled: () => false, wait: () => d.promise, start, isCurrent: () => current })
    current = false
    d.resolve({ shown: true })
    await done
    expect(start).not.toHaveBeenCalled()
  })
})

describe('écran PRÉPARATION DU DOSSIER (index.html, #loading-screen)', () => {
  let el
  beforeEach(() => {
    vi.useFakeTimers()
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
    document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
    el = document.getElementById('loading-screen')
  })
  afterEach(() => { vi.useRealTimers() })

  const label = () => el.querySelector('.ld-label').textContent.replace(/\s+/g, ' ')

  it('masqué au chargement de la page', () => {
    expect(el).not.toBeNull()
    expect(el.hidden).toBe(true)
  })

  it('affiche le pourcentage (arrondi par défaut, jamais 100 % avant la fin) et la barre', () => {
    const screen = createLoadingScreen(el)
    screen.show(0.634)
    expect(el.hidden).toBe(false)
    expect(label()).toBe('PRÉPARATION DU DOSSIER · 63 %')
    expect(el.querySelector('.ld-fill').style.width).toBe('63%')
    expect(el.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('63')
    screen.show(0.999)
    expect(label()).toBe('PRÉPARATION DU DOSSIER · 99 %')
  })

  it('s\'efface (fondu) puis se masque ; réaffiché pendant le fondu, il reste', () => {
    const screen = createLoadingScreen(el)
    screen.show(0.1)
    screen.hide()
    expect(el.classList.contains('on')).toBe(false)   // l'opacité retombe (transition CSS)...
    expect(el.hidden).toBe(false)                      // ...l'élément reste affiché le temps du fondu
    vi.advanceTimersByTime(1000)
    expect(el.hidden).toBe(true)

    screen.show(0.2)
    screen.hide()
    screen.show(0.3)
    vi.advanceTimersByTime(1000)
    expect(el.hidden).toBe(false)
    expect(el.classList.contains('on')).toBe(true)
  })

  it('deux écrans sur le même élément (main.js et pvp.js) : réaffiché par l\'un pendant le fondu de l\'autre, il reste', () => {
    const campagne = createLoadingScreen(el), pvp = createLoadingScreen(el)
    campagne.show(0.5)
    campagne.hide()
    pvp.show(0.1)
    vi.advanceTimersByTime(1000)
    expect(el.hidden).toBe(false)
    expect(el.classList.contains('on')).toBe(true)
  })

  it('aucun tiret cadratin dans les textes de l\'écran et de celui du contexte perdu', () => {
    for (const id of ['loading-screen', 'context-lost']) expect(document.getElementById(id).textContent).not.toContain('\u2014')
  })
})

describe('contexte WebGL perdu', () => {
  it('perte : l\'événement est annulé (le navigateur pourra rendre le contexte) et onLost est appelé', () => {
    const canvas = document.createElement('canvas')
    const onLost = vi.fn(), onRestored = vi.fn()
    watchContextLoss(canvas, { onLost, onRestored })
    const ev = new Event('webglcontextlost', { cancelable: true })
    canvas.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(onLost).toHaveBeenCalledTimes(1)
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('contexte rendu : onRestored (le jeu recharge la page)', () => {
    const canvas = document.createElement('canvas')
    const onLost = vi.fn(), onRestored = vi.fn()
    watchContextLoss(canvas, { onLost, onRestored })
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(onRestored).toHaveBeenCalledTimes(1)
  })

  it('la fonction rendue retire les écouteurs', () => {
    const canvas = document.createElement('canvas')
    const onLost = vi.fn(), onRestored = vi.fn()
    const off = watchContextLoss(canvas, { onLost, onRestored })
    off()
    const ev = new Event('webglcontextlost', { cancelable: true })
    canvas.dispatchEvent(ev)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(ev.defaultPrevented).toBe(false)
    expect(onLost).not.toHaveBeenCalled()
    expect(onRestored).not.toHaveBeenCalled()
  })
})
