// Aides des tests de libération (spec du lot 1 §5).
//
// createFakeRenderer : faux renderer comptable (niveau 2). Il compte comme le vrai (three r185) : une géométrie est
// comptée la première fois qu'un objet visible la dessine (WebGLGeometries.get, +1 par géométrie neuve) et décomptée à
// son événement 'dispose' ; une texture (celles des matériaux, et la texture d'os qu'un SkinnedMesh crée à son premier
// rendu, WebGLRenderer et Skeleton.computeBoneTexture) de même. Une ressource libérée puis redessinée est recomptée,
// comme le vrai renderer la renverrait au GPU. Pas de frustum : tout objet visible compte.
//
// trackDisposals : témoin d'événements 'dispose' (niveau 1). Il relève dans un arbre les géométries, les matériaux,
// leurs textures, les textures d'os et les cartes d'ombre, s'abonne à leur 'dispose' et dit ce qui fuit (possédé non
// libéré), ce qui a été libéré à tort (marqué partagé, userData.shared) et ce qui a été libéré deux fois.

const drawn = o => o.isMesh || o.isLine || o.isPoints || o.isSprite
const materialsOf = o => (o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [])

export function texturesOf(material) {
  const out = []
  for (const k in material) {
    const v = material[k]
    if (v && v.isTexture) out.push(v)
  }
  if (material.uniforms) for (const u of Object.values(material.uniforms)) if (u && u.value && u.value.isTexture) out.push(u.value)
  return out
}

export function createFakeRenderer() {
  const counters = { geometries: 0, textures: 0 }
  const seen = { geometries: new Set(), textures: new Set() }
  const watch = (kind, res) => {
    if (seen[kind].has(res)) return
    seen[kind].add(res)
    counters[kind]++
    const onDispose = () => {
      res.removeEventListener('dispose', onDispose)
      seen[kind].delete(res)
      counters[kind]--
    }
    res.addEventListener('dispose', onDispose)
  }
  return {
    render(scene) {
      scene.traverseVisible(o => {
        if (!drawn(o)) return
        if (o.geometry) watch('geometries', o.geometry)
        for (const m of materialsOf(o)) for (const t of texturesOf(m)) watch('textures', t)
        if (o.isSkinnedMesh && o.skeleton) {
          if (o.skeleton.boneTexture === null) o.skeleton.computeBoneTexture()
          watch('textures', o.skeleton.boneTexture)
        }
      })
    },
    info: () => ({ ...counters }),
  }
}

// Géométries distinctes dessinées par la scène : ce que le renderer doit compter quand rien ne fuit.
export function drawnGeometries(scene) {
  const set = new Set()
  scene.traverseVisible(o => { if (drawn(o) && o.geometry) set.add(o.geometry) })
  return set.size
}

export function trackDisposals(root) {
  const items = new Map()   // ressource → { kind, label, shared, count }
  const add = (res, kind) => {
    if (!res || items.has(res)) return
    const name = res.isTexture || typeof res.type !== 'string' ? res.constructor.name : res.type
    const item = { kind, label: `${kind} ${name}#${res.id ?? '?'}`,
      shared: !!(res.userData && res.userData.shared), count: 0 }
    items.set(res, item)
    res.addEventListener('dispose', () => { item.count++ })
  }
  root.traverse(o => {
    if (o.geometry) add(o.geometry, 'géométrie')
    for (const m of materialsOf(o)) {
      add(m, 'matériau')
      for (const t of texturesOf(m)) add(t, 'texture')
    }
    if (o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) add(o.skeleton.boneTexture, 'texture d\'os')
    if (o.isLight && o.shadow && o.shadow.map) add(o.shadow.map, 'carte d\'ombre')
  })
  const all = [...items.values()]
  return {
    owned: () => all.filter(i => !i.shared).length,
    shared: () => all.filter(i => i.shared).length,
    freed: () => all.filter(i => i.count > 0).length,
    leaks: () => all.filter(i => !i.shared && i.count === 0).map(i => i.label),
    sharedFreed: () => all.filter(i => i.shared && i.count > 0).map(i => i.label),
    freedTwice: () => all.filter(i => i.count > 1).map(i => i.label),
  }
}
