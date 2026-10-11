import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { startInvestigation, develop, photoFrame } from '../../src/prologue/investigation.js'
import { CLUES, PHONE } from '../../src/prologue/clues.js'
import { settings } from '../../src/settings.js'
import { buildApartment } from '../../src/prologue/apartment.js'
import { BUZZ } from '../../src/prologue/ambience.js'
import { ENDING } from '../../src/prologue/state.js'
import { readFileSync } from 'node:fs'

// la feuille de style telle qu'écrite (sous Vitest, un import ?raw de CSS revient vide)
const css = readFileSync('src/prologue/enquete.css', 'utf8')   // chemin depuis la racine (celle de Vitest)

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
const keyUp = code => document.dispatchEvent(new KeyboardEvent('keyup', { code }))
const $ = sel => document.querySelector(sel)
// pose la caméra sur un point accessible proche d'un indice (mêmes points que tests/prologue/apartment.test.js), en
// visant le centre de son objet (lacet = atan2(−dx, −dz), convention du contrôleur)
const REACH = { mot: { x: 9.4, z: 4.2 }, telephone: { x: 5.6, z: 5.6 } }
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
    expect(getComputedStyle($('#enq-fiche .enq-act')).visibility).toBe('visible')   // « E : FERMER » tout de suite
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
    await vi.advanceTimersByTimeAsync(700)             // la fiche lue, on écoute : E maintenu 1 s
    keyE()
    for (let i = 0; i < 10; i++) h.update(0.1)
    expect(onDone).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(800)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith({ result: 'listened' })
    expect($('#enq-root')).toBeNull()
  })

  // Écouter demande de maintenir 1 s (spec 2026-10-11 §3.2) : un double-clic sur le téléphone n'écoute plus jamais, sans
  // la garde de 600 ms du lot 0.
  it('un double-clic sur le téléphone ouvre la fiche sans écouter le message ; un clic maintenu 1 s écoute', async () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera()
    const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
    const cam = lookAt(probe.debug.apartment, 'telephone'); probe.stop()
    const onDone = vi.fn()
    const h = startInvestigation({ renderer, camera, onDone, options: { cam, indices: 4 } })
    lockEl = renderer.domElement                          // pointeur verrouillé : le clic gauche agit
    const down = () => document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    const up = () => document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))
    const frames = async (n, dt = 0.05) => { for (let i = 0; i < n; i++) { h.update(dt); await vi.advanceTimersByTimeAsync(dt * 1000) } }
    h.update(0.016)
    down(); await frames(2); up()                         // premier clic : la fiche s'ouvre
    expect($('#enq-fiche').classList.contains('on')).toBe(true)
    await frames(1)
    down(); await frames(2); up()                         // le second clic du double-clic
    await frames(8)
    down(); await frames(3); up()                         // et un troisième, pour faire bonne mesure
    await frames(30)
    expect(onDone).not.toHaveBeenCalled()
    expect(h.debug.state.mode).toBe('examining')          // aucun des clics n'a lancé l'écoute
    expect($('#enq-fiche').classList.contains('on')).toBe(true)
    down(); await frames(21)                              // maintenu un peu plus d'1 s : il écoute
    expect(h.debug.state.mode).toBe('done')
    await vi.advanceTimersByTimeAsync(800)
    expect(onDone).toHaveBeenCalledWith({ result: 'listened' })
  })

  // Plus de garde : l'invite est là dès l'ouverture, et un appui bref ne fait rien (il faut maintenir).
  it('fiche du téléphone : l\'invite « MAINTENIR E : ÉCOUTER LE MESSAGE » est là dès l\'ouverture ; un appui bref n\'écoute pas', async () => {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera()
    const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
    const cam = lookAt(probe.debug.apartment, 'telephone'); probe.stop()
    const h = startInvestigation({ renderer, camera, onDone: vi.fn(), options: { cam, indices: 4 } })
    h.update(0.016); keyE()
    const act = $('#enq-fiche .enq-act')
    expect(act.textContent).toMatch(/MAINTENIR\s*E\s*:\s*ÉCOUTER LE MESSAGE/)
    expect(getComputedStyle(act).visibility).toBe('visible')
    keyE(); keyUp('KeyE')
    for (let i = 0; i < 20; i++) h.update(0.1)
    expect(h.debug.state.mode).toBe('examining')
    h.stop()
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

  it('sur la carte de départ, « PASSER L\'ENQUÊTE » termine en « skipped » sans demander le verrou (navigateur qui le refuse)', async () => {
    const renderer = fakeRenderer(), onDone = vi.fn()
    renderer.domElement.requestPointerLock = vi.fn()               // le navigateur refuse : la carte reste
    startInvestigation({ renderer, camera: new THREE.PerspectiveCamera(), onDone })
    const skip = $('#enq-card #enq-card-skip')
    expect(skip).not.toBeNull()
    expect(skip.textContent).toBe('PASSER L\'ENQUÊTE')
    skip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(renderer.domElement.requestPointerLock).not.toHaveBeenCalled()   // le clic ne passe pas à la carte
    await vi.advanceTimersByTimeAsync(800)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith({ result: 'skipped' })
    expect($('#enq-root')).toBeNull()
  })

  it('REPRENDRE refusé par le navigateur (trop tôt après Échap) : « CLIQUE ENCORE POUR REPRENDRE » au bout de 600 ms', async () => {
    const renderer = fakeRenderer()
    const h = startInvestigation({ renderer, camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    $('#enq-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'))
    const retry = $('#enq-pause #enq-retry')
    expect(retry).not.toBeNull()
    expect(retry.hidden).toBe(true)
    const grant = renderer.domElement.requestPointerLock.getMockImplementation()
    renderer.domElement.requestPointerLock.mockImplementation(() => {})   // refusé
    $('#enq-resume').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(599)
    expect(retry.hidden).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(retry.hidden).toBe(false)
    expect(retry.textContent).toBe('CLIQUE ENCORE POUR REPRENDRE')
    renderer.domElement.requestPointerLock.mockImplementation(grant)     // accordé au second clic
    $('#enq-resume').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect($('#enq-pause').hidden).toBe(true)
    expect(retry.hidden).toBe(true)
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'))   // pause suivante : l'invite repart cachée
    expect($('#enq-pause').hidden).toBe(false)
    expect(retry.hidden).toBe(true)
    h.stop()
  })

  it('REPRENDRE accordé tout de suite : pas d\'invite à recliquer', async () => {
    const renderer = fakeRenderer()
    const h = startInvestigation({ renderer, camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    $('#enq-card').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'))
    $('#enq-resume').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(1000)
    expect($('#enq-retry').hidden).toBe(true)
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
const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() })
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

  it('fermer une fiche avant la fin de la réplique fait taire la voix intérieure', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)                     // babil déterministe : une syllabe tous les 125 ms
    try {
      const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera(), audio = fakeAudio()
      const probe = startInvestigation({ renderer, camera, onDone: vi.fn() })
      const cam = lookAt(probe.debug.apartment, 'mot'); probe.stop()
      const h = startInvestigation({ renderer, camera, audio, onDone: vi.fn(), options: { cam } })
      // syllabes de la voix : oscillateurs en dents de scie (le cœur et les pas sont des sinus)
      const syllables = () => audio.ctx.createOscillator.mock.results.filter(r => r.value.type === 'sawtooth').length
      h.update(0.016); keyE()                                           // « Ils voulaient que je sache. »
      await vi.advanceTimersByTimeAsync(300)
      const before = syllables()
      keyE()                                                            // refermée avant la fin estimée
      await vi.advanceTimersByTimeAsync(3000)
      expect(syllables()).toBe(before)
      h.stop()
    } finally { vi.restoreAllMocks() }
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

// ── finition : la photo des corps (floue et surexposée aux captures, cadrée sur la fenêtre plutôt que sur le drap) ──
describe('l\'enquête — la photo des corps', () => {
  // les vues d'où l'on examine le drap : par l'arche, et le contrôle de capture (&cam=9.4,1.65,5.8,-1.1,-0.5)
  const VUES = { controle: [9.4, 5.8, -1.1, -0.5], arche: [9.2, 4.8, -1.57, -0.6] }
  for (const [nom, [x, z, yaw, pitch]] of Object.entries(VUES)) {
    it(`cadrée sur le drap, ses taches et le sang qui déborde, pas sur la fenêtre (vue ${nom})`, () => {
      const W = 1258, H = 622
      const camera = new THREE.PerspectiveCamera(72, W / H, 0.05, 40)
      camera.position.set(x, 1.65, z); camera.rotation.set(pitch, yaw, 0, 'YXZ'); camera.updateMatrixWorld()
      const apt = buildApartment(); apt.group.updateMatrixWorld(true)
      const f = photoFrame(apt.targets.find(t => t.userData.clueId === 'corps'), camera, W, H)
      const seen = (px, py, pz) => {
        const v = new THREE.Vector3(px, py, pz).project(camera), sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H
        return sx > f.x && sx < f.x + f.w && sy > f.y && sy < f.y + f.h
      }
      for (const p of [[11.02, 0.25, 4.6], [10.83, 0.2, 5.21], [10.7, 0.2, 4.28]]) expect(seen(...p), `tache ${p}`).toBe(true)
      expect(seen(10.7, 0, 5.62), 'le sang au sol').toBe(true)
      expect(seen(12.4, 0.9, 4.5), 'le bas de la fenêtre').toBe(false)
      expect(f.h).toBeLessThan(0.74 * H - 1)          // plus serré que le cadre le plus large, comme les autres fiches
      apt.dispose()
    })
  }

  it('chaque image du développement reste lisible : ni flou, ni blanc brûlé (une image lente s\'y attarde)', () => {
    const kf = css.match(/@keyframes enq-dev\s*\{([\s\S]*?)\}\s*\}/)
    expect(kf).not.toBeNull()
    expect(kf[1]).not.toMatch(/blur\(\s*[1-9]/)
    for (const m of kf[1].matchAll(/brightness\(([\d.]+)\)/g)) expect(+m[1]).toBeLessThanOrEqual(1.5)
    // mêmes fonctions dans le même ordre aux deux bouts, sinon le navigateur ne les interpole pas : il garde la
    // première image jusqu'à mi-course
    const fns = s => [...s.matchAll(/([a-z-]+)\(/g)].map(m => m[1])
    const [from, to] = [...kf[1].matchAll(/filter:\s*([^;}]+)/g)].map(m => fns(m[1]))
    expect(from).toEqual(to)
  })
})

// ── finition : lisibilité de l'interface (règles de la feuille de style) ──
describe('l\'enquête — lisibilité', () => {
  const rule = sel => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : '' }
  const keyframes = name => { const m = css.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\}\\s*\\}`)); return m ? m[1] + '}' : '' }

  it('« E : ÉCOUTER LE MESSAGE » : le E bat entre 1 et 0,45, il ne disparaît jamais', () => {
    const anim = rule('.enq .enq-act.go b').match(/animation:\s*([\w-]+)/)
    expect(anim).not.toBeNull()
    const ops = [...keyframes(anim[1]).matchAll(/opacity:\s*([\d.]+)/g)].map(m => +m[1])
    expect(ops.length).toBeGreaterThan(0)
    expect(Math.min(...ops)).toBeCloseTo(0.45, 5)
  })

  it('l\'invite « E : EXAMINER » passe nettement sous le point de visée (≈ 6 vh), sans couvrir les petits objets', () => {
    const top = rule('.enq .enq-prompt').match(/top:\s*calc\(50% \+ ([\d.]+)vh\)/)
    expect(top).not.toBeNull()
    expect(+top[1]).toBeGreaterThanOrEqual(5.5)
  })

  it('« PASSER L\'ENQUÊTE » de la carte est inerte tant qu\'il est invisible : un clic pour commencer ne tombe pas dessus', () => {
    const r = rule('.enq .enq-card .skip')
    expect(r).toMatch(/pointer-events:\s*none/)                      // inerte au départ : le clic traverse jusqu'à la carte
    // animation: nom durée [fonction] délai [remplissage], séparées par des virgules
    const ms = t => parseFloat(t) * (t.endsWith('ms') ? 1 : 1000)
    const anims = Object.fromEntries(r.match(/animation:\s*([^;]+);/)[1].split(',').map(a => {
      const [name, dur, , delay] = a.trim().split(/\s+/)
      return [name, { end: ms(delay) + ms(dur), fill: /forwards/.test(a) }]
    }))
    expect(anims['enq-in']).toBeDefined()
    expect(anims['enq-live']).toBeDefined()
    expect(anims['enq-live'].fill).toBe(true)                         // reste cliquable une fois l'animation finie
    expect(anims['enq-live'].end).toBeGreaterThanOrEqual(anims['enq-in'].end)   // jamais cliquable avant d'être apparu
    expect(keyframes('enq-live')).toMatch(/pointer-events:\s*auto/)
    expect(keyframes('enq-live')).not.toMatch(/pointer-events:\s*none/)
  })

  it('les légendes de la photo (lieu, tampon) ne peuvent pas se chevaucher : même barre flex qui passe à la ligne, lieu tronqué si besoin', () => {
    const renderer = fakeRenderer()
    const h = startInvestigation({ renderer, camera: new THREE.PerspectiveCamera(), onDone: vi.fn() })
    const cap = $('.enq-photo .cap')
    expect(cap).not.toBeNull()
    expect([...cap.children].map(c => c.className)).toEqual(['lieu', 'stamp'])   // la même barre, pas deux positions absolues
    h.stop()
    const bar = rule('.enq .enq-photo .cap')
    expect(bar).toMatch(/display:\s*flex/)
    expect(bar).toMatch(/flex-wrap:\s*wrap/)                           // le tampon passe sur sa propre ligne quand il n'y a pas la place
    for (const sel of ['.enq .enq-photo .lieu', '.enq .enq-photo .stamp']) expect(rule(sel), sel).not.toMatch(/position:\s*absolute/)
    const lieu = rule('.enq .enq-photo .lieu')
    expect(lieu).toMatch(/text-overflow:\s*ellipsis/); expect(lieu).toMatch(/overflow:\s*hidden/); expect(lieu).toMatch(/white-space:\s*nowrap/)   // seul sur sa ligne, trop long : tronqué
    expect(lieu).toMatch(/max-width:\s*100%/)
    expect(rule('.enq .enq-photo .stamp')).toMatch(/margin-left:\s*auto/)   // reste à droite, y compris seul sur sa ligne
  })

  it('les légendes de la photo (lieu, tampon « 14 03 · 21:47 ») sur un fond sombre semi-transparent', () => {
    for (const sel of ['.enq .enq-photo .stamp', '.enq .enq-photo .lieu']) {
      const bg = rule(sel).match(/background:\s*rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/)
      expect(bg, sel).not.toBeNull()
      expect(+bg[1]).toBeGreaterThanOrEqual(0.4); expect(+bg[1]).toBeLessThan(0.9)
    }
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

// ── la fin qui vient d'elle-même (spec docs/superpowers/specs/2026-10-11-enquete-fin-design.md, tâche E2) ──
describe('l\'enquête : la fin, écouter, reposer, le coup de pouce', () => {
  afterEach(() => { settings.reducedMotion = 'auto'; delete navigator.keyboard })

  const FWD = () => settings.pvpKeys.forward
  // fait tourner l'enquête par images de dt secondes, les minuteurs (frappe, voix) avançant d'autant ; d.t : temps écoulé
  const driver = h => {
    const d = { t: 0, async frames(seconds, dt = 0.05, each = null) {
      const n = Math.round(seconds / dt)
      for (let i = 0; i < n; i++) { h.update(dt); d.t += dt; if (each) each(d.t); await vi.advanceTimersByTimeAsync(dt * 1000) }
    } }
    return d
  }
  // espionne une méthode du son de l'enquête, avec l'instant de chaque appel (sans son exposé : rien n'est noté)
  const spy = (h, d, name) => {
    const a = h.debug.ambience || {}, calls = [], orig = a[name]
    a[name] = (...args) => { calls.push({ args, t: d.t }); return typeof orig === 'function' ? orig.apply(a, args) : undefined }
    return calls
  }
  const phoneTarget = h => h.debug.apartment.targets.find(t => t.userData.clueId === PHONE.id)
  const screenOf = h => { let s = null; phoneTarget(h).traverse(o => { for (const m of [].concat(o.material || [])) if (m.userData.baseEmissive === 0x0b1220) s = m }); return s }
  const phoneCenter = h => new THREE.Box3().setFromObject(phoneTarget(h)).getCenter(new THREE.Vector3())
  const ficheOn = () => $('#enq-fiche').classList.contains('on')
  const IDLE_PEAK = 14   // clignotement de repos de l'écran : 3 + 11 au plus fort (apartment.js)
  // le doudou, sixième indice, ouvert au départ ; pointeur verrouillé, caméra libre (le regard peut pivoter)
  function lastClue({ audio = null, indices = 5 } = {}) {
    const renderer = fakeRenderer(), camera = new THREE.PerspectiveCamera(), onDone = vi.fn()
    const h = startInvestigation({ renderer, camera, audio, onDone, options: { indices, ouvrir: 'doudou' } })
    clickOn('#enq-card')
    return { h, renderer, camera, onDone, d: driver(h) }
  }
  const closeIt = () => { keyE(); keyUp('KeyE') }

  it('le sixième indice fermé, le contrôleur reste figé ; une fiche ordinaire refermée rend le déplacement', async () => {
    let { h } = lastClue({ indices: 4 })                       // témoin : le doudou en cinquième
    closeIt()
    let p = h.debug.controller.position, z0 = p.z
    press(FWD()); h.update(0.1); keyUp(FWD())
    expect(p.z).toBeLessThan(z0)
    h.stop()
    ;({ h } = lastClue())
    expect($('#enq-fiche').textContent).toMatch(/INDICE 06 \/ 06/)
    closeIt()
    expect(ficheOn()).toBe(false)
    expect(h.debug.state.mode).toBe('ending')
    p = h.debug.controller.position; z0 = p.z
    press(FWD())
    for (let i = 0; i < 20; i++) h.update(0.1)
    keyUp(FWD())
    expect(p.z).toBe(z0)
    expect(h.debug.controller.frozen).toBe(true)
    h.stop()
  })

  it('« J\'en ai assez vu. » dite une fois, « Le téléphone… », puis la fiche du téléphone s\'ouvre d\'elle-même en moins de 6 s', async () => {
    const { h, d } = lastClue()
    const said = spy(h, d, 'speak')
    closeIt()
    let opened = null
    const subs = new Set()
    await d.frames(8, 0.05, t => { subs.add($('#enq-sub .tx').textContent); if (opened === null && ficheOn()) opened = t })
    expect(said.filter(c => c.args[0] === PHONE.fin)).toHaveLength(1)
    expect([...subs]).toContain(PHONE.fin)                     // tapée en entier dans le sous-titre
    expect([...subs]).toContain(PHONE.vibre)
    expect(opened).not.toBeNull()
    expect(opened).toBeLessThan(6)
    expect(h.debug.state.mode).toBe('examining')
    expect(h.debug.state.current).toBe(PHONE.id)
    expect($('#enq-fiche h3').textContent).toBe('2 APPELS MANQUÉS')
    expect($('#enq-fiche').textContent).toContain('06 39 98 41 07')
    expect($('#enq-fiche .enq-act').textContent).toMatch(/MAINTENIR\s*E\s*:\s*ÉCOUTER LE MESSAGE/)
    expect($('#enq-fiche .enq-act').textContent).not.toContain(PHONE.reposer)
    h.stop()
  })

  it('le téléphone vibre deux salves à 0,42 s d\'écart, deux fois en 2,5 s ; son écran s\'allume, puis revient à sa valeur de base', async () => {
    const { h, d } = lastClue()
    const buzzed = spy(h, d, 'buzz'), screen = screenOf(h)
    closeIt()
    const glow = []
    await d.frames(9, 0.05, t => glow.push([t, screen.emissiveIntensity]))
    const at = buzzed.map(c => c.t)
    expect(at).toHaveLength(4)
    expect(at[1] - at[0]).toBeCloseTo(BUZZ.salve + 0.42, 1)
    expect(at[3] - at[2]).toBeCloseTo(BUZZ.salve + 0.42, 1)
    expect(at[3] + BUZZ.salve - at[0]).toBeCloseTo(ENDING.vibration, 1)
    // l'espion note l'instant d'avant l'image où la salve part, le relevé de la lueur celui d'après : t > at[0]
    const during = glow.filter(([t]) => t > at[0] && t < at[3] + BUZZ.salve).map(([, v]) => v)
    expect(Math.min(...during)).toBeGreaterThan(8)             // allumé toute la vibration
    expect(Math.max(...during)).toBeGreaterThan(IDLE_PEAK)     // plus vif qu'au repos, à chaque salve
    const after = glow.filter(([t]) => t > at[3] + BUZZ.salve + 0.7).map(([, v]) => v)
    expect(after.length).toBeGreaterThan(10)
    expect(after[0]).toBe(3)                                   // éteint : la valeur de base
    expect(Math.max(...after)).toBeLessThanOrEqual(IDLE_PEAK)
    h.stop()
  })

  it('la photo de la fiche montre le téléphone allumé, vu de l\'entrée ; la caméra revient ensuite au joueur, et la vibration continue fiche ouverte', async () => {
    const { h, d, renderer, camera } = lastClue()
    const screen = screenOf(h), center = phoneCenter(h)
    const shots = []
    renderer.render.mockImplementation(() => shots.push({ d: camera.position.distanceTo(center), glow: screen.emissiveIntensity }))
    closeIt()
    let next = null
    await d.frames(8, 0.05, () => { if (ficheOn() && next === null) next = 'now'; else if (next === 'now') next = screen.emissiveIntensity })
    const photo = shots[shots.length - 1]
    expect(photo.d).toBeLessThan(1.6)                          // pris devant le téléphone, pas depuis le palier (2 m et plus)
    expect(photo.glow).toBeGreaterThan(8)                      // l'écran allumé sur la photo
    expect(camera.position.x).toBeCloseTo(6, 3); expect(camera.position.z).toBeCloseTo(7.85, 3)
    expect(next).toBeGreaterThan(8)                            // l'image d'après l'ouverture : l'écran est encore allumé
    h.stop()
  })

  it('le regard pivote en douceur vers le téléphone, puis la fiche s\'ouvre', async () => {
    const { h, d } = lastClue()
    const c = h.debug.controller, center = phoneCenter(h)
    const yaw0 = c.yaw
    closeIt()
    const yaws = []
    await d.frames(7, 0.05, () => yaws.push(c.yaw))
    expect(ficheOn()).toBe(true)
    const dx = center.x - c.position.x, dz = center.z - c.position.z
    expect(c.yaw).toBeCloseTo(Math.atan2(-dx, -dz), 2)
    expect(c.pitch).toBeCloseTo(Math.atan2(center.y - 1.65, Math.hypot(dx, dz)), 2)
    expect(Math.abs(c.yaw - yaw0)).toBeGreaterThan(0.3)        // il a vraiment tourné (du palier vers la console)
    const steps = yaws.slice(1).map((y, i) => Math.abs(y - yaws[i]))
    expect(Math.max(...steps)).toBeLessThan(0.06)              // aucun saut d'une image à l'autre
    const moving = steps.filter(s => s > 1e-9)
    expect(moving.length).toBeGreaterThanOrEqual(20)           // 1,2 s d'images
    expect(moving.length).toBeLessThanOrEqual(26)
    expect(moving[0]).toBeLessThan(moving[Math.floor(moving.length / 2)] / 3)   // départ doux, pas un pivot à vitesse constante
    h.stop()
  })

  it('effets atténués : pas de pivot, la fiche s\'ouvre quand le téléphone a fini de vibrer', async () => {
    settings.reducedMotion = 'oui'
    const { h, d } = lastClue()
    const c = h.debug.controller, buzzed = spy(h, d, 'buzz')
    closeIt()
    const yaw0 = c.yaw, pitch0 = c.pitch
    let opened = null
    await d.frames(8, 0.05, t => { if (opened === null && ficheOn()) opened = t })
    expect(c.yaw).toBe(yaw0); expect(c.pitch).toBe(pitch0)
    expect(buzzed).toHaveLength(4)
    expect(opened).not.toBeNull()
    expect(opened).toBeGreaterThanOrEqual(buzzed[0].t + ENDING.vibration - 0.06)
    expect(opened).toBeLessThan(6)
    h.stop()
  })

  it('pause pendant la séquence : rien n\'avance (réplique, vibration, lueur, regard, fiche), puis tout reprend', async () => {
    const { h, d } = lastClue()
    const buzzed = spy(h, d, 'buzz'), said = spy(h, d, 'speak'), c = h.debug.controller, screen = screenOf(h)
    closeIt()
    while (buzzed.length < 1 && d.t < 10) await d.frames(0.05)
    expect(buzzed).toHaveLength(1)
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'))
    expect(h.debug.state.mode).toBe('paused')
    const n = said.length, yaw = c.yaw, glow = screen.emissiveIntensity
    await d.frames(10)
    expect(buzzed).toHaveLength(1); expect(said).toHaveLength(n)
    expect(c.yaw).toBe(yaw); expect(screen.emissiveIntensity).toBe(glow)
    expect(ficheOn()).toBe(false)
    clickOn('#enq-resume')
    expect(h.debug.controller.frozen).toBe(true)               // la séquence reprend, le joueur reste figé
    await d.frames(4)
    expect(buzzed).toHaveLength(4)
    expect(ficheOn()).toBe(true)
    h.stop()
  })

  it('stop() en pleine vibration : nœuds du son débranchés, aucun minuteur restant', async () => {
    const audio = fakeAudio()
    const { h, d } = lastClue({ audio })
    const buzzed = spy(h, d, 'buzz')
    closeIt()
    while (buzzed.length < 2 && d.t < 10) await d.frames(0.05)
    expect(buzzed).toHaveLength(2)
    const toDest = () => audio.ctx.createGain.mock.results.map(r => r.value).filter(g => g.connect.mock.calls.some(([x]) => x === audio.dest))
    expect(toDest().filter(g => !g.disconnect.mock.calls.length).length).toBeGreaterThan(2)   // pluie, son du kit, et la salve en cours
    h.stop()
    await vi.advanceTimersByTimeAsync(500)
    for (const g of toDest()) expect(g.disconnect).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('après les six indices, REPOSER n\'est pas proposé, ni R ni le clic droit ne ferment la fiche ; E tenu d\'avant n\'écoute pas, maintenu 1 s il écoute', async () => {
    const { h, d, onDone } = lastClue()
    closeIt()
    keyE()                                                     // E pressé pendant la séquence, et tenu
    while (!ficheOn() && d.t < 10) await d.frames(0.05)
    expect($('#enq-fiche .enq-act').textContent).not.toContain(PHONE.reposer)
    press('KeyR'); document.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))
    for (let i = 0; i < 30; i++) { document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', repeat: true })); await d.frames(0.1, 0.1) }
    expect(ficheOn()).toBe(true)
    expect(h.debug.state.mode).toBe('examining')
    expect(onDone).not.toHaveBeenCalled()
    keyUp('KeyE'); keyE()
    await d.frames(1.1, 0.1)
    expect(h.debug.state.mode).toBe('done')
    await vi.advanceTimersByTimeAsync(800)
    expect(onDone).toHaveBeenCalledWith({ result: 'listened' })
  })

  it('écouter : E maintenu 1 s ; relâché à 0,5 s, rien ne part et l\'anneau se vide', async () => {
    const onDone = vi.fn()
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone, options: { cam: START, indices: 4, ouvrir: 'telephone' } })
    const ring = $('#enq-fiche .enq-act .enq-ring')
    expect(ring).not.toBeNull()
    keyE()
    for (let i = 0; i < 5; i++) h.update(0.1)
    expect(+ring.style.getPropertyValue('--p')).toBeCloseTo(0.5, 2)
    keyUp('KeyE')
    expect(+ring.style.getPropertyValue('--p')).toBe(0)
    for (let i = 0; i < 20; i++) h.update(0.1)
    expect(h.debug.state.mode).toBe('examining')
    keyE()
    for (let i = 0; i < 9; i++) h.update(0.1)
    expect(h.debug.state.mode).toBe('examining')               // 0,9 s : pas encore
    h.update(0.1)
    expect(h.debug.state.mode).toBe('done')
    await vi.advanceTimersByTimeAsync(800)
    expect(onDone).toHaveBeenCalledWith({ result: 'listened' })
  })

  it('une pause pendant le maintien l\'annule : il faut maintenir de nouveau 1 s', async () => {
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn(), options: { indices: 4, ouvrir: 'telephone' } })
    clickOn('#enq-card')
    keyE()
    for (let i = 0; i < 5; i++) h.update(0.1)
    lockEl = null; document.dispatchEvent(new Event('pointerlockchange'))   // Échap, E relâché pendant la pause
    for (let i = 0; i < 20; i++) h.update(0.1)
    clickOn('#enq-resume')
    for (let i = 0; i < 6; i++) h.update(0.1)
    expect(h.debug.state.mode).toBe('examining')               // 0,5 + 0,6 s, mais pas d'un seul maintien
    keyUp('KeyE'); keyE()
    for (let i = 0; i < 10; i++) h.update(0.1)
    expect(h.debug.state.mode).toBe('done')                    // témoin : un vrai maintien d'1 s écoute
    h.stop()
  })

  it('avant le sixième indice, R repose le téléphone : la fiche se ferme et on reprend l\'exploration', () => {
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn(), options: { indices: 4, ouvrir: 'telephone' } })
    clickOn('#enq-card')
    expect(ficheOn()).toBe(true)
    expect($('#enq-fiche .enq-act').textContent).toMatch(/R\s*:\s*REPOSER/)
    press('KeyR')
    expect(ficheOn()).toBe(false)
    expect(h.debug.state.mode).toBe('exploring')
    const p = h.debug.controller.position, z0 = p.z
    press(FWD()); h.update(0.1)
    expect(p.z).toBeLessThan(z0)
    h.stop()
  })

  it('le clic droit repose aussi le téléphone (avant le sixième indice)', () => {
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn(), options: { indices: 4, ouvrir: 'telephone' } })
    clickOn('#enq-card')
    document.dispatchEvent(new MouseEvent('mousedown', { button: 2 }))
    expect(ficheOn()).toBe(false)
    expect(h.debug.state.mode).toBe('exploring')
    h.stop()
  })

  it('la touche de REPOSER suit la disposition du clavier (la touche physique R, son libellé lu au clavier)', async () => {
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: { getLayoutMap: () => Promise.resolve(new Map([['KeyR', 'p']])) } })
    const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn(), options: { indices: 4, ouvrir: 'telephone' } })
    await Promise.resolve(); await Promise.resolve()
    clickOn('#enq-card')
    expect($('#enq-fiche .enq-act').textContent).toMatch(/P\s*:\s*REPOSER/)
    press('KeyR')
    expect(ficheOn()).toBe(false)
    h.stop()
  })

  it('coup de pouce : quand la piste du téléphone tombe, il vibre une fois et son écran s\'allume brièvement ; avant 4 indices, rien', async () => {
    const run = async indices => {
      const h = startInvestigation({ renderer: fakeRenderer(), camera: new THREE.PerspectiveCamera(), onDone: vi.fn(), options: { cam: START, indices } })
      const d = driver(h), buzzed = spy(h, d, 'buzz'), screen = screenOf(h), glow = []
      await d.frames(39, 0.1)
      expect(buzzed).toHaveLength(0)                           // pas avant la piste
      await d.frames(3, 0.1, () => glow.push(screen.emissiveIntensity))
      const sub = $('#enq-sub .tx').textContent
      h.stop()
      return { buzzed, glow, sub }
    }
    const before = await run(3)                                // témoin : téléphone verrouillé, la piste mène à un indice
    expect(CLUES.some(c => before.sub === c.piste)).toBe(true)
    expect(before.buzzed).toHaveLength(0)
    const after = await run(4)
    expect(after.sub).toBe(PHONE.piste)
    expect(after.buzzed).toHaveLength(1)
    const peak = after.glow.findIndex(v => v > IDLE_PEAK)
    expect(peak).toBeGreaterThanOrEqual(0)
    expect(after.glow.slice(peak + 10).every(v => v === 3)).toBe(true)   // une seconde après : éteint
  })
})
