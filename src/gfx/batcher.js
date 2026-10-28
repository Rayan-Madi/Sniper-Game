// Outils communs du décor procédural (sortis de src/prologue/apartment.js, tâche B0 du plan m5-bar : l'enquête et le
// bar s'en servent) : textures dessinées en canvas, hasard à graine, fusion des géométries par matériau (un maillage,
// donc un appel de dessin, par matériau).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Texture dessinée en canvas ; sans contexte 2D (jamais en jeu), la texture reste blanche et unie.
export function canvasTexture(w, h, draw, { repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d'); if (g) draw(g, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]) }
  return t
}

// Chemin SVG dessiné en canvas (Path2D n'existe pas sous jsdom : on saute)
export const path = (g, d, fill = true) => { if (typeof Path2D === 'undefined') return; const p = new Path2D(d); if (fill) g.fill(p); else g.stroke(p) }

// Générateur pseudo-aléatoire à graine, celui des maquettes des cinématiques (prologue-a.html, prologue-b.html) : la ville
// des fenêtres de l'appartement y est tirée avec leur graine, 7
export function makeRnd(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 } }

// Géométrie non indexée (faite de triangles à plat) rendue indexée : la fusion veut des géométries toutes indexées.
export function indexed(g) { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); return g }

// Rassemble des géométries par matériau, puis fusionne : un maillage par matériau.
export function createBatcher() {
  const buckets = new Map()   // matériau → géométries déjà transformées
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3()
  return {
    // geo : géométrie (indexée ou non) ; place : { x, y, z, rx, ry, rz, order, sx, sy, sz } (order : ordre des rotations,
    // 'XYZ' par défaut ; 'YXZ' incline un meuble dans son propre repère avant de le tourner)
    add(mat, geo, place = {}) {
      const g = indexed(geo.clone())
      m4.compose(p.set(place.x || 0, place.y || 0, place.z || 0), q.setFromEuler(e.set(place.rx || 0, place.ry || 0, place.rz || 0, place.order || 'XYZ')),
        s.set(place.sx ?? 1, place.sy ?? 1, place.sz ?? 1))
      g.applyMatrix4(m4)
      if (!buckets.has(mat)) buckets.set(mat, [])
      buckets.get(mat).push(g)
      geo.dispose()
    },
    box(mat, cx, cy, cz, w, h, d, place = {}) { this.add(mat, new THREE.BoxGeometry(w, h, d), { x: cx, y: cy, z: cz, ...place }) },
    // un maillage par matériau ; castShadow / receiveShadow selon les options du matériau (mat.userData)
    finish(parent) {
      const meshes = []
      for (const [mat, list] of buckets) {
        const merged = mergeGeometries(list, false); list.forEach(g => g.dispose())
        if (!merged) throw new Error(`décor : fusion impossible (${mat.name || mat.type})`)
        const mesh = new THREE.Mesh(merged, mat)
        mesh.castShadow = !!mat.userData.cast; mesh.receiveShadow = mat.userData.receive !== false
        parent.add(mesh); meshes.push(mesh)
      }
      buckets.clear()
      return meshes
    },
  }
}
