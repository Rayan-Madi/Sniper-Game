// Visée de l'enquête : un rayon part du centre de l'écran ; on retient le premier objet touché s'il appartient à
// une cible (userData.clueId, ou la clé cle : 'barId' au bar) à portée. Les murs (occluders) arrêtent le rayon. La
// cible visée s'illumine. Un SkinnedMesh parmi les cibles ou les obstacles est refusé : un lancer sur une peau animée
// coûte 13 à 23 ms (spec M5 §3.2) ; au bar, on vise des capsules invisibles.
import * as THREE from 'three'

export function createInteract({ camera, targets, occluders = [], range = 2.2, glow = 0x3a2410, cle = 'clueId' }) {
  const ray = new THREE.Raycaster()
  const center = new THREE.Vector2(0, 0)
  const all = [...targets, ...occluders]
  for (const o of all) o.traverse(m => {
    if (m.isSkinnedMesh) throw new Error(`createInteract : SkinnedMesh « ${m.name} » parmi les cibles ou les obstacles (jamais de peau animée dans un rayon)`)
  })
  let current = null

  const idOf = obj => { for (let o = obj; o; o = o.parent) if (o.userData && o.userData[cle]) return o.userData[cle]; return null }
  const setGlow = (id, on) => {
    const t = targets.find(x => x.userData[cle] === id)
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
