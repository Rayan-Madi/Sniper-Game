// Outils de géométrie du décor procédural (sortis de src/prologue/apartment.js, tâche B0 du plan m5-bar : l'enquête et
// le bar s'en servent) : profils tirés et tournés, prismes de moulure et leurs profils, panneaux à plate-bande, boîtes
// adoucies, coussins, UV planaires, couleur par sommet, plans posés au sol.
import * as THREE from 'three'
// prologue v2 (N4) : RoundedBoxGeometry dérive de BoxGeometry, déjà dans le bundle principal ; elle reste dans le
// morceau qui importe ce module (l'enquête)
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { indexed } from '../gfx/batcher.js'

export const V = (x, y, z) => new THREE.Vector3(x, y, z)
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

// Géométrie d'axe Y posée de a à b (cylindres, capsules, cônes).
export function between(geo, a, b) {
  const d = new THREE.Vector3().subVectors(b, a)
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()))
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return geo
}
export const rod = (a, b, r, seg = 8) => between(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), a, b)
export const UP = new THREE.Vector3(0, 1, 0)   // jamais modifié

// Constructeurs maison plutôt qu'ExtrudeGeometry et LatheGeometry : three est d'un seul bloc dans le bundle principal,
// et toute classe qu'on n'y utilisait pas l'y ferait grossir ; ceux-ci restent dans le morceau qui les importe (l'enquête).
// Géométrie faite de triangles à plat (sommets [x, y, z] trois par trois) : une normale par face, uv nulles.
export function fromTriangles(v) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(v.length / 3 * 2), 2))
  g.computeVertexNormals()
  return indexed(g)
}
// Le polygone simple pts ([x, y]) tiré le long de z, de 0 à len : côtés à arêtes vives, bouts triangulés.
export function extrude(pts, len) {
  const c = pts.map(([x, y]) => new THREE.Vector2(x, y)), v = [], tri = (a, b, d) => v.push(...a, ...b, ...d)
  if (THREE.ShapeUtils.isClockWise(c)) c.reverse()
  for (let i = 0; i < c.length; i++) {
    const p = c[i], q = c[(i + 1) % c.length]
    tri([p.x, p.y, 0], [q.x, q.y, 0], [q.x, q.y, len]); tri([p.x, p.y, 0], [q.x, q.y, len], [p.x, p.y, len])
  }
  for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(c, [])) {
    const A = c[a], ccw = (c[b].x - A.x) * (c[d].y - A.y) - (c[b].y - A.y) * (c[d].x - A.x) > 0
    const [P, Q] = ccw ? [c[b], c[d]] : [c[d], c[b]]           // dans le sens direct, vu de +z
    tri([A.x, A.y, len], [P.x, P.y, len], [Q.x, Q.y, len]); tri([A.x, A.y, 0], [Q.x, Q.y, 0], [P.x, P.y, 0])
  }
  return fromTriangles(v)
}
// Révolution d'un profil [r, y] autour de l'axe y, en seg côtés ; un profil qui s'éloigne de l'axe regarde vers le bas.
export function lathe(profile, seg) {
  const v = [], at = (r, y, a) => [r * Math.cos(a), y, r * Math.sin(a)]
  for (let s = 0; s < seg; s++) {
    const a0 = s / seg * Math.PI * 2, a1 = (s + 1) / seg * Math.PI * 2
    for (let i = 0; i + 1 < profile.length; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1], A = at(r0, y0, a0), C = at(r1, y1, a1)
      v.push(...A, ...at(r1, y1, a0), ...C)
      if (r0 > 0) v.push(...A, ...C, ...at(r0, y0, a1))
    }
  }
  return fromTriangles(v)
}

// Prisme : un profil [u, v] (plan de coupe, en mètres) tiré en ligne droite de p0 à p1, son point (0, 0) sur cette
// ligne ; u suit le vecteur unitaire au, v le vecteur unitaire av (perpendiculaires). Moulures, appuis.
export function prism(profile, au, av, p0, p1) {
  const ax = new THREE.Vector3().crossVectors(au, av), d = new THREE.Vector3().subVectors(p1, p0)
  return extrude(profile, d.length()).applyMatrix4(new THREE.Matrix4().makeBasis(au, av, ax).setPosition(ax.dot(d) >= 0 ? p0 : p1))   // repère direct
}
// Profils des moulures (mètres). Plinthe : u saillie hors du mur, v hauteur ; épaisse au pied, amincie en tête.
export const P_PLINTHE = [[0, 0], [0.016, 0], [0.016, 0.07], [0.013, 0.08], [0.009, 0.09], [0.004, 0.1], [0, 0.1]]
// Corniche en gorge : u saillie hors du mur, v sous le plafond (négatif). Elle déborde de plus en plus en montant :
// dans un angle rentrant, l'union des deux longueurs qui se croisent dessine l'onglet, sans coupe.
export const P_CORNICHE = [[0, 0], [0, -0.11], [0.008, -0.11], [0.008, -0.1], [0.018, -0.094], [0.034, -0.082], [0.05, -0.064],
  [0.062, -0.044], [0.07, -0.028], [0.074, -0.02], [0.086, -0.02], [0.086, -0.01], [0.095, -0.01], [0.095, 0]]
// Chambranle : u depuis le bord de l'ouverture vers l'extérieur, v saillie. Plus épais vers l'extérieur : au coin, l'union
// du montant et de la traverse dessine l'onglet.
export const P_CHAMBRANLE = [[0, 0], [0, 0.01], [0.012, 0.012], [0.016, 0.015], [0.03, 0.016], [0.034, 0.019], [0.052, 0.02],
  [0.056, 0.024], [0.068, 0.025], [0.072, 0.022], [0.072, 0]]
export const W_CHAMBRANLE = 0.072
// Appui de fenêtre : u vers la pièce depuis la face du mur (négatif : sous la menuiserie), v hauteur ; nez arrondi.
export const P_APPUI = [[-0.24, 0], [0.03, 0], [0.038, 0.004], [0.042, 0.012], [0.042, 0.022], [0.038, 0.03], [0.03, 0.034], [-0.24, 0.034]]

// Panneau à plate-bande, w × h, centré : posé sur la face d'un battant (z = 0), son pourtour monte en biseau (largeur b)
// jusqu'au champ du panneau, t plus haut ; le dessous, dans le battant, n'a pas de face.
export function raisedPanel(w, h, b = 0.02, t = 0.01) {
  const X = w / 2, Y = h / 2, x = X - b, y = Y - b, v = [], tri = (p, q, r) => v.push(...p, ...q, ...r)
  const lo = [[-X, -Y], [X, -Y], [X, Y], [-X, Y]], hi = [[-x, -y], [x, -y], [x, y], [-x, y]]
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, A = [...lo[i], 0], C = [...hi[j], t]
    tri(A, [...lo[j], 0], C); tri(A, C, [...hi[i], t])
  }
  tri([-x, -y, t], [x, -y, t], [x, y, t]); tri([-x, -y, t], [x, y, t], [-x, y, t])
  return fromTriangles(v)
}
// Rectangle w × h à coins arrondis (rayon r, k segments par coin), centré : la tranche d'un élément de radiateur.
export function roundedRect(w, h, r, k = 2) {
  const pts = []
  for (const [cx, cy, a0] of [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]])
    for (let i = 0; i <= k; i++) { const a = a0 + i / k * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]) }
  return pts
}

// ── le mobilier (prologue v2, N4) : arêtes adoucies, coussins ──
// Boîte w × h × d aux arêtes arrondies (rayon r), normales lissées ; seg 1 : deux facettes par quart de rond (108
// triangles), seg 2 : quatre (300 triangles). Elle n'est pas indexée : l'add d'un batcher (src/gfx/batcher.js)
// l'indexe ; une fusion faite à part passe par indexed().
export const rounded = (w, h, d, r, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, r)
// Effile une géométrie centrée vers le bas : à son pied, x et z sont multipliés par k (normales gardées : la pente est faible).
export function taper(g, k) {
  const p = g.attributes.position
  g.computeBoundingBox()
  const { min, max } = g.boundingBox
  for (let i = 0; i < p.count; i++) { const s = k + (1 - k) * (p.getY(i) - min.y) / (max.y - min.y); p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s) }
  return g
}
// Déforme une géométrie indexée point par point (fn : (x, y, z) → [x, y, z]), puis relisse ses normales.
export function warp(g, fn) {
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) { const [x, y, z] = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, x, y, z) }
  g.computeVertexNormals()
  return g
}
// Coussin w × h × d (superquadrique tirée d'une sphère) : e1 règle le bombé de la tranche (1 : rond, vers 0 : carré),
// e2 l'arrondi des coins en plan. Le dessus (+y) bombe : plus haut au milieu qu'au bord. Les restes d'arrondi (sin π
// vaut 1,2e-16, que la puissance 0,2 grossit en 6,6e-4) sont ramenés à zéro : sans cela, les deux colonnes de sommets
// de la couture de la sphère s'écartaient de 0,3 mm, une fente au travers du coussin.
export function cushion(w, h, d, e1 = 0.5, e2 = 0.2, ws = 16, hs = 10) {
  const sp = (t, e) => Math.abs(t) < 1e-9 ? 0 : Math.sign(t) * Math.pow(Math.abs(t), e)
  return warp(new THREE.SphereGeometry(1, ws, hs), (x, y, z) => {
    const c = Math.hypot(x, z), th = Math.atan2(z, x)
    return [w / 2 * sp(c, e1) * sp(Math.cos(th), e2), h / 2 * sp(y, e1), d / 2 * sp(c, e1) * sp(Math.sin(th), e2)]
  })
}

// UV planaires (x, z) en mètres / tuile : le parquet et le carrelage gardent la même échelle d'une pièce à l'autre.
export function worldUV(geo, tu, tv = tu) {
  const p = geo.attributes.position, uv = geo.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tu, p.getZ(i) / tv)
  return geo
}
// Couleur par sommet (matériaux en vertexColors : livres, jouets, lueurs)
export function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return geo
}
// Plan couché au sol (normale +y), centré en (x, y, z), tourné de ry, UV éventuellement recadrées [u0, u1] × [v0, v1].
export function flat(w, d, x, y, z, ry = 0, crop = null) {
  const g = new THREE.PlaneGeometry(w, d)
  if (crop) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, crop[0] + uv.getX(i) * (crop[1] - crop[0]), crop[2] + uv.getY(i) * (crop[3] - crop[2])) }
  g.rotateX(-Math.PI / 2); g.rotateY(ry); g.translate(x, y, z)
  return g
}
