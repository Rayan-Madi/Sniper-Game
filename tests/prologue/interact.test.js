import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createInteract } from '../../src/prologue/interact.js'

function setup({ targetZ = -1.5, wallZ = null } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 50)   // à l'origine, regard vers −z
  const group = new THREE.Group(); group.userData.clueId = 'mot'; group.position.z = targetZ
  const mat = new THREE.MeshLambertMaterial(); mat.userData.baseEmissive = 0x050505; mat.emissive.setHex(0x050505)
  group.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat))
  scene.add(group)
  const occluders = []
  if (wallZ != null) { const w = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.1), new THREE.MeshLambertMaterial()); w.position.z = wallZ; scene.add(w); occluders.push(w) }
  scene.updateMatrixWorld(true)
  return { camera, group, mat, interact: createInteract({ camera, targets: [group], occluders }) }
}

describe('la visée', () => {
  it('repère la cible au centre de l\'écran, même par un enfant du groupe, et l\'illumine', () => {
    const { interact, mat } = setup()
    expect(interact.update()).toBe('mot')
    expect(interact.current).toBe('mot')
    expect(mat.emissive.getHex()).toBe(0x3a2410)
  })
  it('hors de portée, rien', () => { expect(setup({ targetZ: -3 }).interact.update()).toBeNull() })
  it('un mur devant la cible la cache', () => { expect(setup({ wallZ: -0.8 }).interact.update()).toBeNull() })
  it('détourner le regard éteint la surbrillance et restaure l\'émissif de base', () => {
    const { interact, camera, mat } = setup()
    interact.update()
    camera.rotation.y = Math.PI / 2; camera.updateMatrixWorld()
    expect(interact.update()).toBeNull()
    expect(mat.emissive.getHex()).toBe(0x050505)
  })
  it('clear() éteint tout', () => {
    const { interact, mat } = setup()
    interact.update(); interact.clear()
    expect(interact.current).toBeNull()
    expect(mat.emissive.getHex()).toBe(0x050505)
  })
})
