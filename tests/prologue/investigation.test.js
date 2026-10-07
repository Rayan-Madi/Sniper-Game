import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { startInvestigation } from '../../src/prologue/investigation.js'
import { CLUES, PHONE } from '../../src/prologue/clues.js'
import { settings } from '../../src/settings.js'

const FAKE = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }
let lockEl = null
beforeEach(() => {
  vi.useFakeTimers(FAKE); lockEl = null
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl })
  document.exitPointerLock = vi.fn(() => { lockEl = null })
})
afterEach(() => { vi.useRealTimers(); delete document.pointerLockElement; document.body.innerHTML = ''; document.head.innerHTML = '' })

const fakeRenderer = () => {
  const canvas = document.createElement('canvas'); canvas.requestPointerLock = vi.fn(() => { lockEl = canvas; document.dispatchEvent(new Event('pointerlockchange')) })
  return { domElement: canvas, render: vi.fn(), compile: vi.fn(), shadowMap: { autoUpdate: true, needsUpdate: false }, info: { render: { calls: 0, triangles: 0 } } }
}
const keyE = () => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))
const $ = sel => document.querySelector(sel)
// pose la caméra sur un point accessible proche d'un indice (mêmes points que tests/prologue/apartment.test.js), en
// visant le centre de son objet (lacet = atan2(−dx, −dz), convention du contrôleur)
const REACH = { mot: { x: 9.5, z: 4.2 }, telephone: { x: 5.4, z: 6.3 } }
const lookAt = (apt, id, y = 1.65) => {
  const target = new THREE.Box3().setFromObject(apt.targets.find(t => t.userData.clueId === id)).getCenter(new THREE.Vector3())
  const from = REACH[id]
  const dx = target.x - from.x, dz = target.z - from.z, dy = target.y - y
  return { x: from.x, y, z: from.z, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

describe('l\'enquête', () => {
  it('démarre avec la carte, le noir, le compteur ; règle la caméra et les ombres, puis restaure tout à l\'arrêt', async () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200)
    const h = startInvestigation({ renderer, camera, onDone: vi.fn() })
    expect($('#enq-card')).not.toBeNull(); expect($('#enq-black')).not.toBeNull()
    expect($('#enq-count').textContent).toMatch(/INDICES\s*0\s*\/\s*6/)
    expect(camera.fov).toBe(72); expect(renderer.shadowMap.autoUpdate).toBe(false)
    h.stop(); h.stop()
    expect(camera.fov).toBe(60); expect(camera.near).toBe(0.1); expect(camera.far).toBe(200)
    expect(renderer.shadowMap.autoUpdate).toBe(true)
    expect($('#enq-root')).toBeNull(); expect($('#enq-css')).toBeNull()
    await vi.advanceTimersByTimeAsync(500)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('un clic sur la carte demande le verrouillage du pointeur, puis la carte disparaît', () => {
    const renderer = fakeRenderer()
    const h = startInvestigation({ renderer, camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    $('#enq-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(renderer.domElement.requestPointerLock).toHaveBeenCalled()
    expect($('#enq-card').hidden).toBe(true)
    h.stop()
  })

  it('viser un indice affiche l\'invite ; E ouvre sa fiche et compte l\'indice ; E la referme', () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera()
    const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
    const cam = lookAt(probe.debug.apartment, 'mot'); probe.stop()
    const h = startInvestigation({ renderer, camera, onDone: vi.fn(), options: { cam } })
    h.update(0.016)
    expect($('#enq-prompt').classList.contains('on')).toBe(true)
    keyE()
    expect($('#enq-fiche').classList.contains('on')).toBe(true)
    expect($('#enq-fiche').textContent).toMatch(/INDICE 05 \/ 06/)
    expect($('#enq-fiche').textContent).toContain('Tu aurais dû dire oui.')
    expect($('#enq-count').textContent).toMatch(/1\s*\/\s*6/)
    keyE()
    expect($('#enq-fiche').classList.contains('on')).toBe(false)
    h.stop()
  })

  it('le téléphone reste verrouillé avant 4 indices, puis s\'ouvre et mène à la fin « listened »', async () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera()
    const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
    const cam = lookAt(probe.debug.apartment, 'telephone'); probe.stop()
    const locked = startInvestigation({ renderer, camera, onDone: vi.fn(), options: { cam } })
    locked.update(0.016); keyE()
    expect($('#enq-fiche').classList.contains('on')).toBe(false)
    await vi.advanceTimersByTimeAsync(4000)            // le sous-titre se tape
    expect($('#enq-sub').textContent).toContain('Pas encore')
    locked.stop()
    const onDone = vi.fn()
    const h = startInvestigation({ renderer, camera, onDone, options: { cam, indices: 4 } })
    h.update(0.016); keyE()
    expect($('#enq-fiche').textContent).toContain('06 39 98 41 07')
    expect($('#enq-fiche').textContent).toContain('MAISON')
    expect($('#enq-fiche').textContent).toContain('ÉCOUTER LE MESSAGE')
    keyE()
    expect(onDone).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(800)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith({ result: 'listened' })
    expect($('#enq-root')).toBeNull()
  })

  it('perdre le pointeur ouvre la pause ; « PASSER L\'ENQUÊTE » termine en « skipped »', async () => {
    const renderer = fakeRenderer(), onDone = vi.fn()
    const h = startInvestigation({ renderer, camera: new THREE.PerspectiveCamera(), onDone })
    $('#enq-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'))
    expect($('#enq-pause').hidden).toBe(false)
    $('#enq-skip').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(800)
    expect(onDone).toHaveBeenCalledWith({ result: 'skipped' })
    h.stop()
  })

  it('une erreur au démarrage démonte tout et appelle onDone une fois, après le retour', async () => {
    const onDone = vi.fn()
    const h = startInvestigation({ renderer: fakeRenderer(), camera: null, onDone })
    expect(onDone).not.toHaveBeenCalled()
    await Promise.resolve(); await Promise.resolve()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0][0].result).toBe('error')
    expect($('#enq-root')).toBeNull()
    expect(() => { h.update(0.016); h.stop() }).not.toThrow()
  })
})

// ── finitions relevées aux relectures des modules (tâches 4 et 5) et au plan ──
const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() })
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), gain: param(), frequency: param(), Q: param(), loop: false, buffer: null })
function fakeAudio(state = 'running') {
  const ctx = { state, currentTime: 0, sampleRate: 100,
    createGain: vi.fn(node), createOscillator: vi.fn(node), createBufferSource: vi.fn(node), createBiquadFilter: vi.fn(node),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(200) })) }
  return { ctx, dest: node() }
}
// la pluie : la seule source qui boucle, a démarré, et n'a pas d'arrêt programmé (voir tests/prologue/ambience.test.js)
const rainOf = audio => audio.ctx.createBufferSource.mock.results.map(r => r.value).filter(s => s.loop && s.start.mock.calls.length && !s.stop.mock.calls.length)
const clickOn = sel => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }))
const press = code => document.dispatchEvent(new KeyboardEvent('keydown', { code }))
const START = { x: 6, y: 1.65, z: 7.85, yaw: 0, pitch: -0.05 }

describe('l\'enquête — finitions', () => {
  it('la photo de la fiche est prise sans la surbrillance de l\'objet visé', () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera()
    const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
    const cam = lookAt(probe.debug.apartment, 'mot'); probe.stop()
    const h = startInvestigation({ renderer, camera, onDone: vi.fn(), options: { cam } })
    const target = h.debug.apartment.targets.find(t => t.userData.clueId === 'mot')
    const glowing = () => {
      let on = false
      target.traverse(o => { for (const m of [].concat(o.material || [])) if (m.emissive && m.emissive.getHex() !== (m.userData.baseEmissive || 0)) on = true })
      return on
    }
    h.update(0.016)
    expect(glowing()).toBe(true)
    const atRender = []
    renderer.render.mockImplementation(() => atRender.push(glowing()))
    keyE()
    expect(atRender.length).toBeGreaterThan(0)
    expect(atRender).not.toContain(true)
    h.stop()
  })

  it('les touches tenues sont relâchées quand la fenêtre perd le focus', () => {
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    clickOn('#enq-card')
    const p = h.debug.controller.position, z0 = p.z
    press(settings.pvpKeys.forward); h.update(0.1)
    expect(p.z).toBeLessThan(z0)                       // il avance (vers −z)
    window.dispatchEvent(new Event('blur'))
    const z1 = p.z
    h.update(0.1)
    expect(p.z).toBe(z1)
    h.stop()
  })

  it('REPRENDRE reverrouille et rend le déplacement', () => {
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    clickOn('#enq-card')
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'))
    expect(h.debug.state.mode).toBe('paused')
    clickOn('#enq-resume')
    expect($('#enq-pause').hidden).toBe(true)
    expect(h.debug.state.mode).toBe('exploring')
    const p = h.debug.controller.position, z0 = p.z
    press(settings.pvpKeys.forward); h.update(0.1)
    expect(p.z).toBeLessThan(z0)
    h.stop()
  })

  it('la pluie démarre au premier verrouillage, pas avant', () => {
    const audio = fakeAudio()
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), audio, onDone: vi.fn() })
    expect(rainOf(audio)).toHaveLength(0)
    clickOn('#enq-card')
    expect(rainOf(audio)).toHaveLength(1)
    h.stop()
  })

  it('un contexte audio encore suspendu est relancé au verrouillage, puis la pluie démarre', async () => {
    const audio = fakeAudio('suspended')
    audio.ctx.resume = vi.fn(() => { audio.ctx.state = 'running'; return Promise.resolve() })
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), audio, onDone: vi.fn() })
    clickOn('#enq-card')
    expect(audio.ctx.resume).toHaveBeenCalled()
    await Promise.resolve(); await Promise.resolve()
    expect(rainOf(audio)).toHaveLength(1)
    h.stop()
  })

  it('la fiche du téléphone compte les appels manqués des données (option ouvrir)', () => {
    const open = () => startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn(), options: { cam: START, indices: 4, ouvrir: 'telephone' } })
    let h = open()
    expect($('#enq-fiche').classList.contains('on')).toBe(true)
    expect($('#enq-fiche h3').textContent).toBe('2 APPELS MANQUÉS')
    h.stop()
    PHONE.appels.push({ de: 'ANTON', heure: '20:30', note: 'MANQUÉ' })
    try {
      h = open()
      expect($('#enq-fiche h3').textContent).toBe('3 APPELS MANQUÉS')
      expect($('#enq-fiche').textContent).toContain('ANTON · 20:30')
      h.stop()
    } finally { PHONE.appels.pop() }
  })

  it('E pressé deux fois de suite ne mêle pas les lettres de deux répliques', async () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera()
    const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
    const cam = lookAt(probe.debug.apartment, 'telephone'); probe.stop()
    const h = startInvestigation({ renderer, camera, onDone: vi.fn(), options: { cam } })
    h.update(0.016); keyE()
    await vi.advanceTimersByTimeAsync(600)
    keyE()
    await vi.advanceTimersByTimeAsync(4000)
    expect($('#enq-sub .tx').textContent).toBe(PHONE.verrouille)
    h.stop()
  })

  it('aucune piste avant le départ ; après 40 s d\'exploration sans découverte, une piste en sous-titre', async () => {
    let h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    for (let i = 0; i < 420; i++) h.update(0.1)
    expect($('#enq-sub').classList.contains('on')).toBe(false)
    h.stop()
    h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn(), options: { cam: START } })
    for (let i = 0; i < 420; i++) h.update(0.1)
    await vi.advanceTimersByTimeAsync(2500)
    expect($('#enq-sub').classList.contains('on')).toBe(true)
    expect(CLUES.some(c => $('#enq-sub').textContent.includes(c.piste))).toBe(true)
    h.stop()
  })

  it('empilement : la fiche sous le noir, la carte et la pause au-dessus', () => {
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    const order = [...$('#enq-root').children].map(e => e.id)
    expect(order.indexOf('enq-fiche')).toBeLessThan(order.indexOf('enq-black'))
    expect(order.indexOf('enq-black')).toBeLessThan(order.indexOf('enq-card'))
    expect(order.indexOf('enq-black')).toBeLessThan(order.indexOf('enq-pause'))
    h.stop()
  })
})
