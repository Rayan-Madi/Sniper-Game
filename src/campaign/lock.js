// Cadenas du choix moral (M3, le port) : un tir dessus libère les victimes du conteneur rouge.
import * as THREE from 'three'
import { scene } from '../scene.js'
import { disposeObject } from '../gfx/dispose.js'

// Monte le cadenas à pos (moralLock.pos de la carte) : corps, anse, halo doré qui pulse (attire l'œil du sniper),
// et la boîte que le tir doit traverser. Renvoie { mesh, box, light }.
export function buildMoralLock([lx, ly, lz]) {
  const mesh = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xd9b02c, metalness: 0.75, roughness: 0.25 }))
  mesh.add(body)
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 14, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x9a9a9a, metalness: 0.85, roughness: 0.2 }))
  shackle.position.y = 0.27; mesh.add(shackle)
  const light = new THREE.PointLight(0xffcc44, 1.6, 7)
  light.position.set(0, 0.2, 0.7)
  mesh.add(light)
  mesh.position.set(lx, ly, lz)
  scene.add(mesh)
  const box = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(lx, ly + 0.1, lz), new THREE.Vector3(0.9, 1.0, 0.7))
  return { mesh, box, light }
}

// Retire le cadenas (tiré, mission relancée ou quittée) et libère ses ressources : 2 géométries, 2 matériaux, la
// lumière du halo.
export function releaseMoralLock(mesh) {
  disposeObject(mesh)
}
