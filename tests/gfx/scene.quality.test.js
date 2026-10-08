import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { applyRenderQuality } from '../../src/scene.js'
import { presetFor } from '../../src/gfx/quality.js'

// Application d'un préréglage au renderer (spec du lot 1 §4.3, tâche L4) : densité de pixels (multipliée par l'échelle
// de la résolution dynamique), taille de la carte d'ombre du soleil, type d'ombre. Un changement s'applique tout de
// suite : la carte d'ombre est libérée puis remise à null, three la recrée à la bonne taille au rendu suivant. Rien
// n'est refait quand rien ne change (setPixelRatio redimensionne le canevas).
// Le renderer est simulé (pas de WebGL sous jsdom) ; le soleil est une vraie DirectionalLight, sa carte d'ombre une
// vraie WebGLRenderTarget avec sa texture de profondeur, comme celle que crée WebGLShadowMap.

function fakeRenderer(pixelRatio, type = THREE.PCFShadowMap) {
  return {
    pr: pixelRatio, calls: [],
    getPixelRatio() { return this.pr },
    setPixelRatio(v) { this.calls.push(v); this.pr = v },
    shadowMap: { enabled: true, type },
  }
}
// Soleil au réglage d'avant le lot 1 (carte d'ombre 2048² déjà allouée par un rendu). disposed : libérations de la carte.
function sunWithMap(size = 2048) {
  const sun = new THREE.DirectionalLight()
  sun.castShadow = true
  sun.shadow.mapSize.set(size, size)
  allocate(sun)
  return sun
}
function allocate(sun) {
  const map = new THREE.WebGLRenderTarget(sun.shadow.mapSize.x, sun.shadow.mapSize.y)
  map.depthTexture = new THREE.DepthTexture(sun.shadow.mapSize.x, sun.shadow.mapSize.y)
  map.disposed = 0
  map.addEventListener('dispose', () => map.disposed++)
  sun.shadow.map = map
  return map
}

describe('applyRenderQuality', () => {
  it('Bas sur un écran de densité 2 : densité 0,75, ombre 1024², carte d\'ombre recréée', () => {
    const r = fakeRenderer(2), sun = sunWithMap(2048)
    const old = sun.shadow.map
    applyRenderQuality(presetFor('bas', 2), 1, { renderer: r, sun })
    expect(r.calls).toEqual([0.75])
    expect([sun.shadow.mapSize.x, sun.shadow.mapSize.y]).toEqual([1024, 1024])
    expect(old.disposed).toBe(1)
    expect(sun.shadow.map).toBe(null)
    expect(r.shadowMap.type).toBe(THREE.PCFShadowMap)
  })

  it('même préréglage appliqué deux fois : ni redimensionnement ni carte d\'ombre refaite', () => {
    const r = fakeRenderer(2), sun = sunWithMap(2048)
    applyRenderQuality(presetFor('bas', 2), 1, { renderer: r, sun })
    const remade = allocate(sun)   // three la recrée au rendu suivant
    applyRenderQuality(presetFor('bas', 2), 1, { renderer: r, sun })
    expect(r.calls).toEqual([0.75])
    expect(remade.disposed).toBe(0)
    expect(sun.shadow.map).toBe(remade)
  })

  it('l\'échelle de la résolution dynamique multiplie la densité, sans toucher à l\'ombre', () => {
    const r = fakeRenderer(2), sun = sunWithMap(2048)
    const map = sun.shadow.map
    applyRenderQuality(presetFor('auto', 2), 0.8, { renderer: r, sun })
    expect(r.calls).toEqual([1])            // 1,25 × 0,8
    applyRenderQuality(presetFor('auto', 2), 0.75, { renderer: r, sun })
    expect(r.calls.at(-1)).toBeCloseTo(0.9375, 10)
    expect(map.disposed).toBe(0)
    expect(sun.shadow.map).toBe(map)
  })

  it('Haut : PCFShadowMap, jamais PCFSoftShadowMap (déprécié en r185, remplacé au rendu avec un avertissement)', () => {
    // Renderer réglé comme le faisait initScene avant le lot 1 : PCFSoftShadowMap, que three r185 remplaçait au
    // premier rendu par PCFShadowMap en avertissant dans la console.
    const r = fakeRenderer(1, THREE.PCFSoftShadowMap), sun = sunWithMap(2048)
    applyRenderQuality(presetFor('haut', 1), 1, { renderer: r, sun })
    expect(r.shadowMap.type).toBe(THREE.PCFShadowMap)
    expect([sun.shadow.mapSize.x, sun.shadow.mapSize.y]).toEqual([2048, 2048])
  })

  it('de Bas à Haut : ombre 2048², carte d\'ombre recréée, densité 2', () => {
    const r = fakeRenderer(2), sun = sunWithMap(2048)
    applyRenderQuality(presetFor('bas', 2), 1, { renderer: r, sun })
    const small = allocate(sun)
    applyRenderQuality(presetFor('haut', 2), 1, { renderer: r, sun })
    expect([sun.shadow.mapSize.x, sun.shadow.mapSize.y]).toEqual([2048, 2048])
    expect(small.disposed).toBe(1)
    expect(sun.shadow.map).toBe(null)
    expect(r.calls).toEqual([0.75, 2])
  })

  it('carte d\'ombre pas encore allouée (aucun rendu) : seule la taille change', () => {
    const r = fakeRenderer(1), sun = new THREE.DirectionalLight()
    sun.shadow.mapSize.set(2048, 2048)
    applyRenderQuality(presetFor('bas', 1), 1, { renderer: r, sun })
    expect([sun.shadow.mapSize.x, sun.shadow.map]).toEqual([1024, null])
  })
})
