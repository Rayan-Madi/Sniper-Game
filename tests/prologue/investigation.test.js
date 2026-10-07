import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { startInvestigation, develop, photoFrame } from '../../src/prologue/investigation.js'
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

// ── la photo de la fiche : développée sans brûler les petits sujets clairs, cadrée sur l'indice (relecture de la tâche 6) ──
describe('l\'enquête — la photo de la fiche', () => {
  afterEach(() => vi.restoreAllMocks())

  // une nuit 640×480 (luminance 10 à 40) et, au milieu, un petit sujet clair de 30×30 px (0,3 % de l'image) en deux tons
  function night(subject = true) {
    const w = 640, h = 480, data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) { const v = 10 + (i % 31); data.set([v, v, v, 255], i * 4) }
    if (subject) for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) { const v = x < 15 ? 190 : 222; data.set([v, v, v, 255], ((200 + y) * w + 300 + x) * 4) }
    const g = { getImageData: () => ({ data }), putImageData() {}, createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }
    return { g, w, h, data, at: (x, y) => data[((200 + y) * w + 300 + x) * 4] }
  }

  it('un petit sujet clair garde ses tons : ni blanc plat, ni deux tons confondus', () => {
    const p = night()
    develop(p.g, p.w, p.h)
    const a = p.at(2, 5), b = p.at(25, 5)
    expect(b).toBeLessThan(250)
    expect(b - a).toBeGreaterThan(12)
  })

  it('une nuit sans sujet clair est quand même éclaircie', () => {
    const p = night(false)
    develop(p.g, p.w, p.h)
    expect(p.data[30 * 4]).toBeGreaterThan(150)        // luminance 40 (le haut de la nuit) → nettement claire
  })

  it('la photo est cadrée sur l\'indice, même loin du centre de l\'image', () => {
    const renderer = fakeRenderer(); renderer.domElement.width = 1600; renderer.domElement.height = 900
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200)
    const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
    const aim = lookAt(probe.debug.apartment, 'mot'); probe.stop()
    const cam = { ...aim, yaw: aim.yaw + 1.15 }       // le mot loin à droite, hors du cadre central
    const draws = [], getContext = HTMLCanvasElement.prototype.getContext
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (type) {
      const g = getContext.call(this, type)
      if (g && this.width === 640) g.drawImage = (...a) => draws.push(a)
      return g
    })
    const h = startInvestigation({ renderer, camera, onDone: vi.fn(), options: { cam, ouvrir: 'mot' } })
    expect(draws).toHaveLength(1)
    const [, sx, sy, sw, sh] = draws[0]
    camera.updateMatrixWorld()
    const c = new THREE.Box3().setFromObject(h.debug.apartment.targets.find(t => t.userData.clueId === 'mot')).getCenter(new THREE.Vector3()).project(camera)
    const px = (c.x + 1) / 2 * 1600, py = (1 - c.y) / 2 * 900
    expect(px).toBeGreaterThan(1244)                    // hors du 4:3 central à 74 % (356 → 1244)
    expect(px).toBeGreaterThan(sx); expect(px).toBeLessThan(sx + sw)
    expect(py).toBeGreaterThan(sy); expect(py).toBeLessThan(sy + sh)
    expect(sw / sh).toBeCloseTo(4 / 3, 5)
    expect(sh).toBeGreaterThanOrEqual(0.35 * 900 - 0.01); expect(sh).toBeLessThan(0.5 * 900)   // rapproché, pas un timbre-poste
    expect(sx).toBeGreaterThanOrEqual(0); expect(sx + sw).toBeLessThanOrEqual(1600)
    expect(sy).toBeGreaterThanOrEqual(0); expect(sy + sh).toBeLessThanOrEqual(900)
    h.stop()
  })

  it('un indice derrière l\'objectif, ou pas d\'indice : le 4:3 central à 74 %', () => {
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 40); camera.updateMatrixWorld()
    const behind = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2)); behind.position.set(0, 0, 3); behind.updateMatrixWorld()
    const central = { x: 356, y: 117, w: 888, h: 666 }
    for (const f of [photoFrame(behind, camera, 1600, 900), photoFrame(null, camera, 1600, 900)]) {
      for (const k of ['x', 'y', 'w', 'h']) expect(f[k]).toBeCloseTo(central[k], 5)
    }
  })

  it('un gros indice tout proche : le cadre ne dépasse pas le 4:3 à 74 % et reste dans l\'image', () => {
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 40); camera.updateMatrixWorld()
    const big = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.1)); big.position.set(-1.2, 0.4, -1.5); big.updateMatrixWorld()
    const f = photoFrame(big, camera, 1600, 900)
    expect(f.h).toBeCloseTo(666, 5); expect(f.w).toBeCloseTo(888, 5)
    expect(f.x).toBeCloseTo(0, 5); expect(f.y).toBeCloseTo(0, 5)       // poussé dans le coin haut gauche, vers l'objet
  })
})

describe('l\'enquête — le cadre suit le volume de visée', () => {
  it('le volume de visée invisible de l\'indice prime sur ce qui est semé autour', () => {
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 40); camera.updateMatrixWorld()
    const clue = new THREE.Group()
    const debris = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.05)); debris.position.set(-0.6, 0, -4); clue.add(debris)   // éclats, large
    const aimBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3)); aimBox.position.set(0.9, -0.2, -4); aimBox.visible = false; clue.add(aimBox)
    clue.updateMatrixWorld(true)
    const f = photoFrame(clue, camera, 1600, 900)
    const c = new THREE.Vector3(0.9, -0.2, -4).project(camera)
    expect(Math.abs(f.x + f.w / 2 - (c.x + 1) / 2 * 1600)).toBeLessThan(6)   // à la perspective près
    expect(Math.abs(f.y + f.h / 2 - (1 - c.y) / 2 * 900)).toBeLessThan(6)
    expect(f.h).toBeCloseTo(0.35 * 900, 5)                           // petit volume : le cadre le plus serré
  })
})
