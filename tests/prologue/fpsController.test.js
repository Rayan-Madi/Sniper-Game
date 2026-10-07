import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { forwardOf, rightOf, moveCircle, createFpsController } from '../../src/prologue/fpsController.js'
import { settings } from '../../src/settings.js'

const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-6)
let lockEl = null
beforeEach(() => {
  lockEl = null
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl })
  settings.pvpKeys = { forward: 'KeyW', left: 'KeyA', back: 'KeyS', right: 'KeyD', ability1: 'Digit1', ability2: 'Digit2', ability3: 'Digit3', emote: 'KeyE' }
  settings.sensitivity = 100; settings.invertY = false
})
afterEach(() => { delete document.pointerLockElement })
const key = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code }))
const mouse = (dx, dy) => { const e = new Event('mousemove'); Object.assign(e, { movementX: dx, movementY: dy }); document.dispatchEvent(e) }
const lock = v => { lockEl = v ? document.body : null; document.dispatchEvent(new Event('pointerlockchange')) }

describe('vecteurs au sol', () => {
  it('lacet 0 : avant = −z, droite = +x (D va bien à droite)', () => {
    close(forwardOf(0).x, 0); close(forwardOf(0).z, -1)
    close(rightOf(0).x, 1); close(rightOf(0).z, 0)
  })
  it('lacet π/2 (tourné à gauche) : avant = −x, droite = −z', () => {
    close(forwardOf(Math.PI / 2).x, -1); close(forwardOf(Math.PI / 2).z, 0)
    close(rightOf(Math.PI / 2).x, 0); close(rightOf(Math.PI / 2).z, -1)
  })
})

describe('collisions cercle contre boîtes', () => {
  const wall = { minX: 1, maxX: 1.2, minZ: -5, maxZ: 5 }
  it('se déplace librement sans obstacle', () => { expect(moveCircle({ x: 0, z: 0 }, 0.3, -0.2, 0.25, [])).toEqual({ x: 0.3, z: -0.2 }) })
  it('ne traverse pas un mur', () => { expect(moveCircle({ x: 0, z: 0 }, 2, 0, 0.25, [wall]).x).toBeLessThanOrEqual(1 - 0.25) })
  it('glisse le long du mur quand on le prend en biais', () => {
    const p = moveCircle({ x: 0.7, z: 0 }, 0.3, -0.5, 0.25, [wall])
    expect(p.x).toBeLessThanOrEqual(0.75); close(p.z, -0.5)
  })
  it('pousser longtemps contre une boîte ne la traverse pas (arrondi : (3,4 − 0,28) + 0,28 > 3,4)', () => {
    const box = { minX: -5, maxX: 5, minZ: 3.4, maxZ: 4.6 }
    let p = { x: 0, z: 2 }
    for (let i = 0; i < 300; i++) p = moveCircle(p, 0, 0.01, 0.28, [box])
    expect(p.z).toBeLessThanOrEqual(3.4 - 0.28 + 1e-9)
  })
})

describe('contrôleur', () => {
  const make = (extra = {}) => {
    const camera = new THREE.PerspectiveCamera()
    const c = createFpsController({ camera, colliders: [], start: { x: 0, z: 0, yaw: 0 }, ...extra })
    c.enable()
    return { c, camera }
  }

  it('place la caméra à hauteur des yeux, en ordre YXZ', () => {
    const { camera, c } = make()
    c.update(0.016)
    close(camera.position.y, 1.65)
    expect(camera.rotation.order).toBe('YXZ')
    c.dispose()
  })

  it('avance avec la touche de settings.pvpKeys, relue à chaque appui (remappage)', () => {
    const { c } = make()
    settings.pvpKeys.forward = 'KeyZ'          // remappage après création : doit être pris en compte
    key('keydown', 'KeyZ'); c.update(1)
    expect(c.position.z).toBeCloseTo(-1.6, 5)
    key('keyup', 'KeyZ'); c.update(1)
    expect(c.position.z).toBeCloseTo(-1.6, 5)
    c.dispose()
  })

  it('les flèches marchent aussi ; la droite va vers +x', () => {
    const { c } = make()
    key('keydown', 'ArrowRight'); c.update(0.5)
    expect(c.position.x).toBeCloseTo(0.8, 5)
    c.dispose()
  })

  it('la diagonale n\'est pas plus rapide', () => {
    const { c } = make()
    key('keydown', 'KeyW'); key('keydown', 'KeyD'); c.update(1)
    expect(Math.hypot(c.position.x, c.position.z)).toBeCloseTo(1.6, 5)
    c.dispose()
  })

  it('figé (fiche ouverte), on ne bouge plus et les touches tenues sont relâchées', () => {
    const { c } = make()
    key('keydown', 'KeyW'); c.setFrozen(true); c.update(1)
    expect(c.position.z).toBe(0)
    c.setFrozen(false); c.update(1)
    expect(c.position.z).toBe(0)
    c.dispose()
  })

  it('la souris ne tourne la vue que pointeur verrouillé ; sensibilité et inversion appliquées', () => {
    const { c } = make()
    mouse(100, 0)
    expect(c.yaw).toBe(0)
    lock(true); mouse(100, 50)
    close(c.yaw, -100 * 0.0022); close(c.pitch, -50 * 0.0022)
    settings.sensitivity = 200; settings.invertY = true; mouse(0, 10)
    close(c.pitch, -50 * 0.0022 + 10 * 0.0022 * 2)
    c.dispose()
  })

  it('le tangage est borné', () => {
    const { c } = make(); lock(true); mouse(0, 100000)
    expect(c.pitch).toBeGreaterThanOrEqual(-1.4)
    c.dispose()
  })

  it('perdre le verrou appelle onUnlock et relâche les touches', () => {
    const onUnlock = vi.fn()
    const { c } = make({ onUnlock })
    lock(true); key('keydown', 'KeyW'); lock(false)
    expect(onUnlock).toHaveBeenCalledTimes(1)
    c.update(1)
    expect(c.position.z).toBe(0)
    c.dispose()
  })

  it('appelle onStep tous les 0,75 m de marche', () => {
    const onStep = vi.fn()
    const { c } = make({ onStep })
    key('keydown', 'KeyW'); for (let i = 0; i < 100; i++) c.update(0.016)   // 1,6 m/s × 1,6 s ≈ 2,56 m
    expect(onStep).toHaveBeenCalledTimes(3)
    c.dispose()
  })

  it("le balancement de la tête retombe en douceur au relâchement (plus de saut de 2,5 cm), et existe toujours en marchant", () => {
    const { c, camera } = make()
    key('keydown', 'KeyW')
    let top = 0
    for (let i = 0; i < 15; i++) { c.update(0.016); top = Math.max(top, camera.position.y - 1.65) }   // ≈ 0,38 m : crête du pas
    const y0 = camera.position.y
    expect(y0 - 1.65).toBeGreaterThan(0.015)
    key('keyup', 'KeyW'); c.update(0.016)
    expect(Math.abs(camera.position.y - y0)).toBeLessThan(0.006)
    for (let i = 0; i < 60; i++) c.update(0.016)
    expect(Math.abs(camera.position.y - 1.65)).toBeLessThan(0.001)                               // revenue à hauteur des yeux
    key('keydown', 'KeyW'); top = 0
    for (let i = 0; i < 120; i++) { c.update(0.016); top = Math.max(top, camera.position.y - 1.65) }
    expect(top).toBeGreaterThan(0.02)
    c.dispose()
  })

  it("onStep est appelé caméra déjà posée", () => {
    const seen = []
    const { c, camera } = make({ onStep: () => seen.push({ cam: camera.position.z, pos: c.position.z }) })
    key('keydown', 'KeyW'); for (let i = 0; i < 60; i++) c.update(0.016)
    expect(seen.length).toBeGreaterThan(0)
    for (const s of seen) expect(s.cam).toBeCloseTo(s.pos, 9)
    c.dispose()
  })

  it("une exception dans onStep n'empêche pas la pose de la caméra", () => {
    const { c, camera } = make({ onStep: () => { throw new Error('son indisponible') } })
    key('keydown', 'KeyW')
    expect(() => c.update(1)).toThrow('son indisponible')
    expect(c.position.z).toBeCloseTo(-1.6, 5)
    expect(camera.position.z).toBeCloseTo(-1.6, 5)
    c.dispose()
  })

  it('après dispose, plus aucun écouteur ne réagit', () => {
    const onUnlock = vi.fn()
    const { c } = make({ onUnlock })
    c.dispose()
    key('keydown', 'KeyW'); c.update(1); lock(true); lock(false)
    expect(c.position.z).toBe(0)
    expect(onUnlock).not.toHaveBeenCalled()
  })

  it('les collisions s\'appliquent au déplacement', () => {
    const camera = new THREE.PerspectiveCamera()
    const c = createFpsController({ camera, colliders: [{ minX: -5, maxX: 5, minZ: -1.2, maxZ: -1 }], start: { x: 0, z: 0, yaw: 0 } })
    c.enable(); key('keydown', 'KeyW'); c.update(2)
    expect(c.position.z).toBeGreaterThanOrEqual(-1 + 0.28 - 1e-3)
    c.dispose()
  })

  it('lock() demande le verrouillage du pointeur sur l\'élément fourni (s\'il le permet)', () => {
    const { c } = make()
    const el = document.createElement('canvas'); el.requestPointerLock = vi.fn()
    c.lock(el)
    expect(el.requestPointerLock).toHaveBeenCalled()
    expect(() => c.lock(document.createElement('div'))).not.toThrow()
    c.dispose()
  })
})
