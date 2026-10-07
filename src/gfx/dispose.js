// ─── Libération des ressources GPU par parcours (spec du lot 1 §3, approche B, et §4.2) ─────────────────────────────
// Le renderer (three r185) ne décompte une géométrie, une texture ou un programme qu'à l'événement 'dispose' de la
// ressource : scene.remove seul laisse tampons, VAO et textures d'os vivants. disposeObject retire un objet de son
// parent puis libère tout ce que son arbre possède : géométries, matériaux, textures portées par les matériaux,
// textures d'os des squelettes, cartes d'ombre des lumières. Ce qui porte la marque « partagé » (userData.shared,
// posée par markShared : modèles GLB du cache, géométries et matériaux communs des effets) n'est jamais libéré.
// Pur : ni DOM, ni mixer, ni audio.
//
// Attention aux copies : Material.clone et Texture.clone recopient userData, et BufferGeometry.clone partage même
// l'objet userData de l'original. Une copie d'une ressource partagée porte donc la marque : elle ne serait jamais
// libérée. Retirer la marque d'un matériau cloné (delete clone.userData.shared) ; ne jamais modifier le userData
// d'une géométrie clonée, qui est celui de l'original.

const materialsOf = o => (o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [])

// Textures d'un matériau : toute propriété qui est une texture (map, normalMap, emissiveMap…), et les uniformes
// d'un ShaderMaterial.
function texturesOf(material) {
  const out = []
  for (const k in material) {
    const v = material[k]
    if (v && v.isTexture) out.push(v)
  }
  if (material.uniforms) {
    for (const u of Object.values(material.uniforms)) if (u && u.value && u.value.isTexture) out.push(u.value)
  }
  return out
}

function mark(res) {
  if (res && res.userData) res.userData.shared = true
}

// Marque partagées toutes les géométries, matériaux et textures d'un arbre, ou une ressource seule (géométrie,
// matériau avec ses textures, texture). Renvoie son argument.
export function markShared(root) {
  if (!root) return root
  if (root.isObject3D) {
    root.traverse(o => {
      mark(o.geometry)
      for (const m of materialsOf(o)) { mark(m); for (const t of texturesOf(m)) mark(t) }
    })
  } else if (root.isMaterial) {
    mark(root)
    for (const t of texturesOf(root)) mark(t)
  } else {
    mark(root)
  }
  return root
}

export function isShared(resource) {
  return !!(resource && resource.userData && resource.userData.shared)
}

// Ressources déjà libérées : une ressource commune à deux objets (lampadaire cloné, matériau réutilisé) ou un
// second appel sur le même arbre ne la libèrent pas deux fois. Une ressource libérée n'est jamais réutilisée par le
// jeu (chaque montage recrée la sienne) ; ce qui doit survivre est marqué partagé.
const released = new WeakSet()

// Retire root de son parent, puis libère ce qu'il possède. Renvoie le nombre de ressources libérées par cet appel.
export function disposeObject(root) {
  const freed = { geometries: 0, materials: 0, textures: 0, skeletons: 0 }
  if (!root) return freed
  root.removeFromParent()
  const release = (res, kind) => {
    if (!res || isShared(res) || released.has(res)) return false
    released.add(res)
    res.dispose()
    freed[kind]++
    return true
  }
  root.traverse(o => {
    release(o.geometry, 'geometries')
    for (const m of materialsOf(o)) {
      if (isShared(m)) continue   // ses textures sont celles du modèle partagé
      release(m, 'materials')
      for (const t of texturesOf(m)) release(t, 'textures')
    }
    // Chaque instance animée a son propre squelette (clone) : sa texture d'os ne sert qu'à elle.
    if (o.isSkinnedMesh && o.skeleton && !released.has(o.skeleton)) {
      released.add(o.skeleton)
      o.skeleton.dispose()
      freed.skeletons++
    }
    if (o.isLight && o.shadow && !released.has(o.shadow)) {
      released.add(o.shadow)
      o.shadow.dispose()   // carte d'ombre, si le renderer en a créé une
    }
  })
  return freed
}
