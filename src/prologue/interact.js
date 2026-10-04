// Visée de l'enquête : un rayon part du centre de l'écran ; on retient le premier objet touché s'il appartient à
// une cible (userData.clueId) à portée. Les murs (occluders) arrêtent le rayon. La cible visée s'illumine.
import * as THREE from 'three'

export function createInteract({ camera, targets, occluders = [], range = 2.2, glow = 0x3a2410 }) {
  const ray = new THREE.Raycaster()
  const center = new THREE.Vector2(0, 0)
  const all = [...targets, ...occluders]
  let current = null

  const idOf = obj => { for (let o = obj; o; o = o.parent) if (o.userData && o.userData.clueId) return o.userData.clueId; return null }
  const setGlow = (id, on) => {
    const t = targets.find(x => x.userData.clueId === id)
    if (!t) return
    t.traverse(o => {
      for (const m of [].concat(o.material || [])) if (m.emissive) m.emissive.setHex(on ? glow : (m.userData.baseEmissive || 0))
    })
  }

  return {
    get current() { return current },
    update() {
      camera.updateMatrixWorld()
      ray.setFromCamera(center, camera)
      ray.near = 0; ray.far = range
      const hit = ray.intersectObjects(all, true)[0]
      const id = hit ? idOf(hit.object) : null
      if (id !== current) { if (current) setGlow(current, false); if (id) setGlow(id, true); current = id }
      return current
    },
    clear() { if (current) setGlow(current, false); current = null },
  }
}
