// L'appartement des Kane, le soir du 14 mars (spec docs/superpowers/specs/2026-10-04-enquete-design.md §3-4).
// Géométrie procédurale FUSIONNÉE PAR MATÉRIAU (un appel de dessin par matériau), objets d'indice séparés et visables,
// lumière : nuit bleue par les fenêtres + la lampe renversée (seule ombre) + la veilleuse de la chambre.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
// prologue v2 (N4) : RoundedBoxGeometry dérive de BoxGeometry, déjà dans le bundle principal ; elle reste dans le
// morceau de l'enquête
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const H = 2.6          // hauteur sous plafond
const T = 0.12         // épaisseur des murs, centrés sur leur ligne
const DEG = Math.PI / 180

// ───────────────────────────── outils ─────────────────────────────

// Texture dessinée en canvas ; sans contexte 2D (jamais en jeu), la texture reste blanche et unie.
function canvasTexture(w, h, draw, { repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d'); if (g) draw(g, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]) }
  return t
}

// Générateur pseudo-aléatoire de la maquette (même graine que la ville des cinématiques : 7)
function makeRnd(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 } }

// Géométrie non indexée (faite de triangles à plat) rendue indexée : la fusion veut des géométries toutes indexées.
function indexed(g) { if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); return g }

// Rassemble des géométries par matériau, puis fusionne : un maillage par matériau.
function createBatcher() {
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
        if (!merged) throw new Error(`appartement : fusion impossible (${mat.name || mat.type})`)
        const mesh = new THREE.Mesh(merged, mat)
        mesh.castShadow = !!mat.userData.cast; mesh.receiveShadow = mat.userData.receive !== false
        parent.add(mesh); meshes.push(mesh)
      }
      buckets.clear()
      return meshes
    },
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

// Géométrie d'axe Y posée de a à b (cylindres, capsules, cônes).
function between(geo, a, b) {
  const d = new THREE.Vector3().subVectors(b, a)
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()))
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return geo
}
const rod = (a, b, r, seg = 8) => between(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), a, b)
const UP = new THREE.Vector3(0, 1, 0)   // jamais modifié

// Constructeurs maison plutôt qu'ExtrudeGeometry et LatheGeometry : three est d'un seul bloc dans le bundle principal,
// et toute classe qu'on n'y utilisait pas l'y ferait grossir ; ceux-ci restent dans le morceau de l'enquête.
// Géométrie faite de triangles à plat (sommets [x, y, z] trois par trois) : une normale par face, uv nulles.
function fromTriangles(v) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(v.length / 3 * 2), 2))
  g.computeVertexNormals()
  return indexed(g)
}
// Le polygone simple pts ([x, y]) tiré le long de z, de 0 à len : côtés à arêtes vives, bouts triangulés.
function extrude(pts, len) {
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
function lathe(profile, seg) {
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
function prism(profile, au, av, p0, p1) {
  const ax = new THREE.Vector3().crossVectors(au, av), d = new THREE.Vector3().subVectors(p1, p0)
  return extrude(profile, d.length()).applyMatrix4(new THREE.Matrix4().makeBasis(au, av, ax).setPosition(ax.dot(d) >= 0 ? p0 : p1))   // repère direct
}
// Profils des moulures (mètres). Plinthe : u saillie hors du mur, v hauteur ; épaisse au pied, amincie en tête.
const P_PLINTHE = [[0, 0], [0.016, 0], [0.016, 0.07], [0.013, 0.08], [0.009, 0.09], [0.004, 0.1], [0, 0.1]]
// Corniche en gorge : u saillie hors du mur, v sous le plafond (négatif). Elle déborde de plus en plus en montant :
// dans un angle rentrant, l'union des deux longueurs qui se croisent dessine l'onglet, sans coupe.
const P_CORNICHE = [[0, 0], [0, -0.11], [0.008, -0.11], [0.008, -0.1], [0.018, -0.094], [0.034, -0.082], [0.05, -0.064],
  [0.062, -0.044], [0.07, -0.028], [0.074, -0.02], [0.086, -0.02], [0.086, -0.01], [0.095, -0.01], [0.095, 0]]
// Chambranle : u depuis le bord de l'ouverture vers l'extérieur, v saillie. Plus épais vers l'extérieur : au coin, l'union
// du montant et de la traverse dessine l'onglet.
const P_CHAMBRANLE = [[0, 0], [0, 0.01], [0.012, 0.012], [0.016, 0.015], [0.03, 0.016], [0.034, 0.019], [0.052, 0.02],
  [0.056, 0.024], [0.068, 0.025], [0.072, 0.022], [0.072, 0]]
const W_CHAMBRANLE = 0.072
// Appui de fenêtre : u vers la pièce depuis la face du mur (négatif : sous la menuiserie), v hauteur ; nez arrondi.
const P_APPUI = [[-0.24, 0], [0.03, 0], [0.038, 0.004], [0.042, 0.012], [0.042, 0.022], [0.038, 0.03], [0.03, 0.034], [-0.24, 0.034]]

// Panneau à plate-bande, w × h, centré : posé sur la face d'un battant (z = 0), son pourtour monte en biseau (largeur b)
// jusqu'au champ du panneau, t plus haut ; le dessous, dans le battant, n'a pas de face.
function raisedPanel(w, h, b = 0.02, t = 0.01) {
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
function roundedRect(w, h, r, k = 2) {
  const pts = []
  for (const [cx, cy, a0] of [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]])
    for (let i = 0; i <= k; i++) { const a = a0 + i / k * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]) }
  return pts
}

// ── le mobilier (prologue v2, N4) : arêtes adoucies, coussins, couette ──
// Boîte w × h × d aux arêtes arrondies (rayon r), normales lissées ; seg 1 : deux facettes par quart de rond (108
// triangles), seg 2 : quatre (300 triangles). Elle n'est pas indexée : B.add l'indexe ; une fusion faite à part passe
// par indexed().
const rounded = (w, h, d, r, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, r)
// Effile une géométrie centrée vers le bas : à son pied, x et z sont multipliés par k (normales gardées : la pente est faible).
function taper(g, k) {
  const p = g.attributes.position
  g.computeBoundingBox()
  const { min, max } = g.boundingBox
  for (let i = 0; i < p.count; i++) { const s = k + (1 - k) * (p.getY(i) - min.y) / (max.y - min.y); p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s) }
  return g
}
// Déforme une géométrie indexée point par point (fn : (x, y, z) → [x, y, z]), puis relisse ses normales.
function warp(g, fn) {
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) { const [x, y, z] = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, x, y, z) }
  g.computeVertexNormals()
  return g
}
// Coussin w × h × d (superquadrique tirée d'une sphère) : e1 règle le bombé de la tranche (1 : rond, vers 0 : carré),
// e2 l'arrondi des coins en plan. Le dessus (+y) bombe : plus haut au milieu qu'au bord. Les restes d'arrondi (sin π
// vaut 1,2e-16, que la puissance 0,2 grossit en 6,6e-4) sont ramenés à zéro : sans cela, les deux colonnes de sommets
// de la couture de la sphère s'écartaient de 0,3 mm, une fente au travers du coussin.
function cushion(w, h, d, e1 = 0.5, e2 = 0.2, ws = 16, hs = 10) {
  const sp = (t, e) => Math.abs(t) < 1e-9 ? 0 : Math.sign(t) * Math.pow(Math.abs(t), e)
  return warp(new THREE.SphereGeometry(1, ws, hs), (x, y, z) => {
    const c = Math.hypot(x, z), th = Math.atan2(z, x)
    return [w / 2 * sp(c, e1) * sp(Math.cos(th), e2), h / 2 * sp(y, e1), d / 2 * sp(c, e1) * sp(Math.sin(th), e2)]
  })
}
// Couette posée sur un matelas (dessus en y0, demi-largeur half, centré en x = cx), de z0 à z1 : dessus bombé à plis doux,
// qui tourne sur les bords du matelas et tombe le long du lit jusqu'en yLow. Une seule nappe (matériau double face).
function duvet(cx, z0, z1, half, y0, yLow, seed) {
  const rnd = makeRnd(seed), rr = 0.045, puff = 0.04
  const topAt = u => y0 + 0.012 + puff * (1 - Math.pow(Math.min(1, Math.abs(u) / (half + 0.03)), 2.5))
  const yEdge = topAt(half), fall = yEdge - rr - yLow
  // coupe d'un côté (abscisse ≥ 0) : le dessus en 7 pas (y calculé avec les plis), le tour du bord en 3, la chute en 2
  const side = []
  for (let k = 0; k <= 7; k++) side.push([half * k / 7, null])
  for (let k = 1; k <= 3; k++) { const a = k / 3 * Math.PI / 2; side.push([half + rr * Math.sin(a), yEdge - rr + rr * Math.cos(a)]) }
  for (let k = 1; k <= 2; k++) side.push([half + rr + 0.006 * k, yEdge - rr - fall * k / 2])
  const cols = [...side.slice(1).reverse().map(([x, y]) => [-x, y]), ...side]
  const NU = cols.length - 1, NV = 18, ph = [rnd() * 6, rnd() * 6, rnd() * 6]
  // plan (x, y) → monde (x, z croissant avec la rangée) : la face avant regarde vers le haut
  const g = new THREE.PlaneGeometry(1, 1, NU, NV), p = g.attributes.position
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const z = z0 + (z1 - z0) * j / NV
    let [x, y] = cols[i]
    const fold = 0.003 * Math.sin(x * 9 + z * 6 + ph[0]) + 0.002 * Math.sin(-x * 5 + z * 13 + ph[1])
    if (y === null) y = topAt(x) + fold
    else { y += fold * 0.5; if (Math.abs(x) > half + rr) x += Math.sign(x) * 0.004 * Math.sin(z * 17 + ph[2]) }
    p.setXYZ(j * (NU + 1) + i, cx + x, y, z)
  }
  g.computeVertexNormals()
  return g
}
// Image w × h, face +z, aux UV recadrées sur le rectangle [x, y, largeur, hauteur] (pixels) de la planche des images.
const PIC_W = 1024, PIC_H = 512
function pictureGeo(w, h, [x, y, rw, rh]) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * rw) / PIC_W, 1 - (y + rh) / PIC_H + uv.getY(i) * rh / PIC_H)
  return g
}

// UV planaires (x, z) en mètres / tuile : le parquet et le carrelage gardent la même échelle d'une pièce à l'autre.
function worldUV(geo, tu, tv = tu) {
  const p = geo.attributes.position, uv = geo.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tu, p.getZ(i) / tv)
  return geo
}
// UV verticales du monde (v = y / H) : le dégradé de lumière du néon reste continu d'un morceau de mur à l'autre.
function heightUV(geo) {
  const p = geo.attributes.position, uv = geo.attributes.uv
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 4, p.getY(i) / H)
  return geo
}
// Le palier, périmètre intérieur déroulé (en mètres) : mur x = 5 (du fond vers la porte), mur de la porte (z = 7),
// mur x = 7 (de la porte vers le fond), mur du fond (z = 8,5). Les murs du palier ont u = s / P, v = y / H.
const PAL = (() => {
  const x0 = 5 + T / 2, x1 = 7 - T / 2, z0 = 7 + T / 2, z1 = 8.5 - T / 2, W = x1 - x0, D = z1 - z0
  return { x0, x1, z0, z1, W, D, P: 2 * (W + D) }
})()
// abscisse s → point du mur et normale vers l'intérieur du palier
function palierAt(s) {
  const { x0, x1, z0, z1, W, D } = PAL
  if (s < D) return { x: x0, z: z1 - s, nx: 1, nz: 0 }
  if (s < D + W) return { x: x0 + (s - D), z: z0, nx: 0, nz: 1 }
  if (s < 2 * D + W) return { x: x1, z: z0 + (s - D - W), nx: -1, nz: 0 }
  return { x: x1 - (s - 2 * D - W), z: z1, nx: 0, nz: -1 }
}
function palierUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv, { x0, x1, z0, z1, W, D, P } = PAL
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    const s = Math.abs(n.getX(i)) > 0.5 ? (x < 6 ? z1 - z : D + W + (z - z0)) : (z < 7.75 ? D + (x - x0) : 2 * D + W + (x1 - x))
    uv.setXY(i, s / P, p.getY(i) / H)
  }
  return geo
}
// UV d'une porte vue de face : u = 0 au gond → 1 côté poignée (flip : gond du côté des x croissants), v = y / 2,05
function doorUV(geo, x0, w, flip = false) {
  const p = geo.attributes.position, uv = geo.attributes.uv
  for (let i = 0; i < p.count; i++) { const t = (p.getX(i) - x0) / w; uv.setXY(i, flip ? 1 - t : t, p.getY(i) / 2.05) }
  return geo
}
// Couleur par sommet (matériaux en vertexColors : livres, jouets, lueurs)
function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return geo
}
// Plan couché au sol (normale +y), centré en (x, y, z), tourné de ry, UV éventuellement recadrées [u0, u1] × [v0, v1].
function flat(w, d, x, y, z, ry = 0, crop = null) {
  const g = new THREE.PlaneGeometry(w, d)
  if (crop) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, crop[0] + uv.getX(i) * (crop[1] - crop[0]), crop[2] + uv.getY(i) * (crop[3] - crop[2])) }
  g.rotateX(-Math.PI / 2); g.rotateY(ry); g.translate(x, y, z)
  return g
}
// Chemin SVG dessiné en canvas (Path2D n'existe pas sous jsdom : on saute)
const path = (g, d, fill = true) => { if (typeof Path2D === 'undefined') return; const p = new Path2D(d); if (fill) g.fill(p); else g.stroke(p) }

// ───────────────────────────── textures ─────────────────────────────

function drawParquet(g, w, h) {
  const rnd = makeRnd(31), lanes = 4, lw = w / lanes
  g.fillStyle = '#5b412c'; g.fillRect(0, 0, w, h)
  for (let i = 0; i < lanes; i++) {
    let y = rnd() * h
    const end = y + h
    while (y < end) {
      const len = 90 + rnd() * 160, l = 30 + rnd() * 16, s = 24 + rnd() * 12
      for (const off of [0, -h]) {
        const yy = y + off
        g.fillStyle = `hsl(${24 + rnd() * 8}, ${s}%, ${l}%)`
        g.fillRect(i * lw + 1, yy + 1, lw - 2, Math.min(len, end - y) - 2)
        g.globalAlpha = 0.14
        for (let k = 0; k < 7; k++) {
          g.strokeStyle = rnd() < 0.5 ? '#2a1a10' : '#c79a6a'; g.lineWidth = 0.6 + rnd() * 1.2
          const gx = i * lw + 4 + rnd() * (lw - 8)
          g.beginPath(); g.moveTo(gx, yy); g.bezierCurveTo(gx + 3, yy + len * 0.3, gx - 3, yy + len * 0.7, gx + rnd() * 2, yy + len); g.stroke()
        }
        g.globalAlpha = 1
      }
      y += len
    }
  }
  g.fillStyle = 'rgba(20,12,6,.55)'
  for (let i = 0; i <= lanes; i++) g.fillRect(i * lw - 1, 0, 2, h)
}

function drawTiles(g, w, h) {
  const rnd = makeRnd(5), n = 2, s = w / n
  g.fillStyle = '#1e2024'; g.fillRect(0, 0, w, h)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const l = 52 + rnd() * 10
    g.fillStyle = `rgb(${l},${l + 2},${l + 6})`; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4)
    g.globalAlpha = 0.08; g.fillStyle = '#fff'
    for (let k = 0; k < 40; k++) g.fillRect(i * s + rnd() * s, j * s + rnd() * s, 1.5, 1.5)
    g.globalAlpha = 1
  }
}

// Les murs du palier, déroulés (1 unité = 1 m) : enduit beige sale, auréoles et coulures sous le plafond, soubassement
// vert bouteille jusqu'à 1 m (éraflures, traces de semelles, éclats de peinture), cimaise, coins encrassés.
function drawPalier(g, w, h) {
  const rnd = makeRnd(61), { P, W, D } = PAL, Y = y => H - y   // y du monde → y du canvas (le haut de la texture est au plafond)
  g.save(); g.scale(w / P, h / H)
  const blot = (x, y, rx, ry, rgb, a) => {   // tache douce
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`)
    g.save(); g.translate(x, Y(y)); g.scale(rx, ry); g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); g.restore()
  }
  const wobble = (x, y, rx, ry, n = 16) => {   // contour irrégulier
    g.beginPath()
    const ks = Array.from({ length: n }, () => 0.8 + rnd() * 0.35), pt = i => { const t = i / n * Math.PI * 2, k = ks[i % n]; return [x + Math.cos(t) * rx * k, Y(y) + Math.sin(t) * ry * k] }
    const mid = i => { const a = pt(i), b = pt(i + 1); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }
    g.moveTo(...mid(0))
    for (let i = 1; i <= n; i++) g.quadraticCurveTo(...pt(i), ...mid(i))   // contour lissé (milieux des côtés)
    g.closePath()
  }
  // enduit
  g.fillStyle = '#6e6250'; g.fillRect(0, 0, P, H)
  for (let i = 0; i < 220; i++) blot(rnd() * P, 1 + rnd() * 1.7, 0.1 + rnd() * 0.4, 0.08 + rnd() * 0.3, rnd() < 0.6 ? '58,48,34' : '150,138,112', 0.05 + rnd() * 0.09)
  g.globalAlpha = 0.18
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? '#3a3226' : '#a89a80'; g.fillRect(rnd() * P, rnd() * (H - 1), 0.004 + rnd() * 0.004, 0.006) }
  g.globalAlpha = 1
  // jaunissement sous le plafond, auréoles d'anciens dégâts des eaux et leurs coulures
  { const gr = g.createLinearGradient(0, 0, 0, 0.6); gr.addColorStop(0, 'rgba(52,38,20,.3)'); gr.addColorStop(1, 'rgba(52,38,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, P, 0.6) }
  for (const [sx, rx, ry] of [[0.3, 0.34, 0.24], [1.62, 0.16, 0.1], [3.02, 0.22, 0.14], [4.3, 0.5, 0.3], [5.95, 0.3, 0.36]]) {
    const sy = H - ry * 0.55
    wobble(sx, sy, rx, ry); g.fillStyle = 'rgba(104,78,44,.22)'; g.fill()
    g.lineWidth = 0.008; g.strokeStyle = 'rgba(74,52,26,.3)'; g.stroke()
    wobble(sx + rx * 0.1, sy + ry * 0.15, rx * 0.6, ry * 0.55); g.lineWidth = 0.005; g.strokeStyle = 'rgba(74,52,26,.18)'; g.stroke()
    const drips = 2 + Math.floor(rnd() * 4)
    for (let k = 0; k < drips; k++) {
      const x = sx + (rnd() - 0.5) * rx * 1.4, y0 = sy - ry * (0.3 + rnd() * 0.5), len = 0.25 + rnd() * 1.1, lw = 0.006 + rnd() * 0.016
      const gr = g.createLinearGradient(0, Y(y0), 0, Y(y0 - len)); gr.addColorStop(0, 'rgba(78,56,28,.42)'); gr.addColorStop(0.7, 'rgba(78,56,28,.2)'); gr.addColorStop(1, 'rgba(78,56,28,0)')
      g.strokeStyle = gr; g.lineWidth = lw; g.lineCap = 'round'
      g.beginPath(); g.moveTo(x, Y(y0)); g.bezierCurveTo(x + (rnd() - 0.5) * 0.02, Y(y0 - len * 0.4), x + (rnd() - 0.5) * 0.03, Y(y0 - len * 0.7), x + (rnd() - 0.5) * 0.02, Y(y0 - len)); g.stroke()
    }
  }
  // une fissure qui descend du plafond (mur du fond)
  g.strokeStyle = 'rgba(30,24,16,.6)'; g.lineWidth = 0.004
  { let x = 5.25, y = H; g.beginPath(); g.moveTo(x, Y(y)); while (y > 1.55) { x += (rnd() - 0.5) * 0.07; y -= 0.04 + rnd() * 0.08; g.lineTo(x, Y(y)) } g.stroke() }
  // mains et épaules : traces grasses autour de la porte, de la minuterie et de la sonnette
  for (const [sx, sy, rx, ry] of [[D + 0.19, 1.2, 0.1, 0.11], [D + 0.36, 1.35, 0.07, 0.3], [D + 1.52, 1.3, 0.08, 0.3], [D + 1.62, 1.5, 0.14, 0.26], [D + 1.68, 1.42, 0.07, 0.12]]) blot(sx, sy, rx, ry, '40,32,22', 0.32)
  // soubassement vert bouteille (peinture à l'huile)
  g.fillStyle = '#3e4c41'; g.fillRect(0, Y(1), P, 1)
  for (let i = 0; i < 70; i++) blot(rnd() * P, rnd(), 0.2 + rnd() * 0.6, 0.03 + rnd() * 0.06, rnd() < 0.5 ? '120,140,120' : '10,14,10', 0.05 + rnd() * 0.05)
  g.lineCap = 'round'
  for (let i = 0; i < 70; i++) {   // éraflures claires
    const x = rnd() * P, y = 0.15 + rnd() * 0.8, l = 0.04 + rnd() * 0.35, a = (rnd() - 0.5) * 0.5
    g.strokeStyle = `rgba(150,146,124,${0.15 + rnd() * 0.3})`; g.lineWidth = 0.002 + rnd() * 0.004
    g.beginPath(); g.moveTo(x, Y(y)); g.lineTo(x + Math.cos(a) * l, Y(y + Math.sin(a) * l)); g.stroke()
  }
  for (let i = 0; i < 46; i++) {   // traces de semelles et de chariots
    g.save(); g.translate(rnd() * P, Y(0.04 + rnd() * 0.28)); g.rotate((rnd() - 0.5) * 0.6)
    g.fillStyle = `rgba(6,6,4,${0.25 + rnd() * 0.35})`; g.beginPath(); g.ellipse(0, 0, 0.02 + rnd() * 0.08, 0.004 + rnd() * 0.012, 0, 0, Math.PI * 2); g.fill(); g.restore()
  }
  for (let i = 0; i < 34; i++) {   // éclats de peinture, surtout sous la cimaise
    const x = rnd() * P, y = rnd() < 0.6 ? 0.88 + rnd() * 0.1 : 0.1 + rnd() * 0.8
    wobble(x, y, 0.006 + rnd() * 0.025, 0.004 + rnd() * 0.014, 7); g.fillStyle = 'rgba(132,120,98,.85)'; g.fill()
  }
  { const gr = g.createLinearGradient(0, Y(0.16), 0, Y(0)); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)'); g.fillStyle = gr; g.fillRect(0, Y(0.16), P, 0.16) }
  // cimaise : ombre portée dessous, bois, filet clair
  { const gr = g.createLinearGradient(0, Y(1), 0, Y(0.95)); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, Y(1), P, 0.05) }
  g.fillStyle = '#4a3a28'; g.fillRect(0, Y(1.04), P, 0.04)
  g.fillStyle = 'rgba(20,14,8,.7)'; g.fillRect(0, Y(1.021), P, 0.004)
  g.fillStyle = '#a8946e'; g.fillRect(0, Y(1.04), P, 0.005)
  // coins encrassés (là où le néon n'arrive pas, et où le chiffon non plus)
  for (const s of [0, D, D + W, 2 * D + W, P]) {
    const gr = g.createLinearGradient(s - 0.16, 0, s + 0.16, 0)
    gr.addColorStop(0, 'rgba(18,14,8,0)'); gr.addColorStop(0.5, 'rgba(18,14,8,.5)'); gr.addColorStop(1, 'rgba(18,14,8,0)')
    g.fillStyle = gr; g.fillRect(s - 0.16, 0, 0.32, H)
  }
  { const gr = g.createLinearGradient(0, 0, 0, 0.07); gr.addColorStop(0, 'rgba(10,8,4,.6)'); gr.addColorStop(1, 'rgba(10,8,4,0)'); g.fillStyle = gr; g.fillRect(0, 0, P, 0.07) }
  g.restore()
}

// La lumière du néon sur les murs du palier, calculée au mur (cosinus / d², tube échantillonné), multipliée par l'enduit :
// la carte émissive des murs du palier (plus clair sous le tube, coins et bas des murs dans l'ombre).
function drawPalierLit(g, w, h, wallCanvas) {
  g.drawImage(wallCanvas, 0, 0, w, h)
  const FW = 326, FH = 130, c = document.createElement('canvas'); c.width = FW; c.height = FH
  const f = c.getContext('2d'); if (!f) return
  const img = f.getImageData(0, 0, FW, FH), d = img.data, N = 8
  for (let i = 0; i < d.length / 4; i++) {
    const q = palierAt(((i % FW) + 0.5) / FW * PAL.P), y = H * (1 - (Math.floor(i / FW) + 0.5) / FH)
    let E = 0
    for (let k = 0; k < N; k++) {
      const dx = 5.58 + (k + 0.5) / N * 0.84 - q.x, dy = 2.55 - y, dz = 7.75 - q.z, r2 = dx * dx + dy * dy + dz * dz
      const cos = q.nx * dx + q.nz * dz
      if (cos > 0) E += cos / (r2 * Math.sqrt(r2))
    }
    const v = Math.round(255 * Math.pow(1 - Math.exp(-(E / N + 0.03)), 1 / 2.2))   // éclairement linéaire, encodé sRGB (la texture est décodée)
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255
  }
  f.putImageData(img, 0, 0)
  g.globalCompositeOperation = 'multiply'; g.drawImage(c, 0, 0, w, h); g.globalCompositeOperation = 'source-over'
}

// Les portes palières, vues de face (u = 0 au gond, 1 côté poignée ; v = y / 2,05) : la teinte sang de bœuf vient du
// matériau ; ici la lumière des moulures, le fil du bois sous la laque, l'usure autour de la poignée et en bas.
const DOOR_PANELS = [[0.156, 0.844, 0.2, 0.9], [0.156, 0.844, 1.05, 1.95]]   // u0, u1, y0, y1 (m)
function drawDoor(g, w, h) {
  const rnd = makeRnd(71), X = u => u * w, Yy = y => (1 - y / 2.05) * h
  g.fillStyle = '#d6cec8'; g.fillRect(0, 0, w, h)
  g.globalAlpha = 0.04
  for (let i = 0; i < 160; i++) { g.fillStyle = rnd() < 0.5 ? '#2a1a14' : '#ffffff'; g.fillRect(rnd() * w, 0, 0.6 + rnd() * 2, h) }
  g.globalAlpha = 1
  for (const [u0, u1, y0, y1] of DOOR_PANELS) {
    const x0 = X(u0), x1 = X(u1), t = Yy(y1), b = Yy(y0), e = 8
    g.fillStyle = 'rgba(20,10,6,.7)'; g.fillRect(x0 - 3, t - 3, x1 - x0 + 6, b - t + 6)                       // gorge autour du panneau
    g.fillStyle = '#e2dad4'; g.fillRect(x0, t, x1 - x0, b - t)
    const bevel = (pts, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath(); g.fill() }
    bevel([[x0, t], [x1, t], [x1 - e, t + e], [x0 + e, t + e]], 'rgba(255,255,255,.5)')                       // biseau du haut : la lumière tombe du néon
    bevel([[x0, t], [x0 + e, t + e], [x0 + e, b - e], [x0, b]], 'rgba(255,255,255,.18)')
    bevel([[x1, t], [x1, b], [x1 - e, b - e], [x1 - e, t + e]], 'rgba(30,14,8,.3)')
    bevel([[x0, b], [x0 + e, b - e], [x1 - e, b - e], [x1, b]], 'rgba(30,14,8,.55)')
  }
  const blot = (x, y, rx, ry, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, 1); gr.addColorStop(0, `rgba(30,16,10,${a})`); gr.addColorStop(1, 'rgba(30,16,10,0)'); g.save(); g.translate(x, y); g.scale(rx, ry); g.translate(-x, -y); g.fillStyle = gr; g.fillRect(x - 1, y - 1, 2, 2); g.restore() }
  blot(X(0.86), Yy(1.02), 34, 70, 0.45)                                                                         // les mains autour de la poignée
  blot(X(0.5), Yy(0.08), 120, 30, 0.4)                                                                          // les pieds en bas
  g.lineCap = 'round'
  for (let i = 0; i < 26; i++) {                                                                                // éraflures dans la laque
    const x = rnd() * w, y = Yy(0.03 + rnd() * (rnd() < 0.6 ? 0.35 : 1.6)), l = 4 + rnd() * 22, a = (rnd() - 0.5) * 0.8
    g.strokeStyle = `rgba(255,240,225,${0.2 + rnd() * 0.3})`; g.lineWidth = 0.6 + rnd()
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke()
  }
  g.fillStyle = 'rgba(20,10,6,.6)'; g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h); g.fillRect(0, 0, w, 2)  // arêtes
}
// La même, éclairée par le néon : multipliée par le dégradé vertical des faces « palier » (celui de T_neonGrad, en y / H)
function drawDoorLit(g, w, h, doorCanvas) {
  g.drawImage(doorCanvas, 0, 0, w, h)
  const top = Math.round(42 + (2.05 / H - 0.45) / 0.55 * (255 - 42)), gr = g.createLinearGradient(0, 0, 0, h)
  gr.addColorStop(0, `rgb(${top},${top},${top})`); gr.addColorStop(1 - 0.45 * H / 2.05, '#2a2a2a'); gr.addColorStop(1, '#000')
  g.globalCompositeOperation = 'multiply'; g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'
}

function drawRug(g, w, h) {
  const rnd = makeRnd(9)
  g.fillStyle = '#3c1c18'; g.fillRect(0, 0, w, h)
  const band = (m, c) => { g.strokeStyle = c; g.lineWidth = 10; g.strokeRect(m, m, w - 2 * m, h - 2 * m) }
  band(10, '#1f1a2a'); band(28, '#6a3a24'); band(44, '#2a1416')
  g.save(); g.beginPath(); g.rect(54, 54, w - 108, h - 108); g.clip()
  g.strokeStyle = 'rgba(150,90,50,.16)'; g.lineWidth = 3
  for (let x = -h; x < w + h; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke() }
  g.fillStyle = '#22141c'; g.beginPath(); g.moveTo(w / 2, h / 2 - 90); g.lineTo(w / 2 + 130, h / 2); g.lineTo(w / 2, h / 2 + 90); g.lineTo(w / 2 - 130, h / 2); g.closePath(); g.fill()
  g.fillStyle = '#7a4428'; g.beginPath(); g.moveTo(w / 2, h / 2 - 46); g.lineTo(w / 2 + 66, h / 2); g.lineTo(w / 2, h / 2 + 46); g.lineTo(w / 2 - 66, h / 2); g.closePath(); g.fill()
  g.restore()
  g.globalAlpha = 0.1
  for (let i = 0; i < 1400; i++) { g.fillStyle = rnd() < 0.5 ? '#000' : '#d9a070'; g.fillRect(rnd() * w, rnd() * h, 2, 2) }
  g.globalAlpha = 1
}

// La ville de nuit des cinématiques (fonction city() de docs/superpowers/maquettes/cinematiques/prologue-b.html), graine 7.
function drawCity(g, w, h) {
  const rnd = makeRnd(7)
  g.save(); g.scale(w / 1000, h / 600)
  const sky = g.createLinearGradient(0, 0, 0, 600)
  sky.addColorStop(0, '#04060c'); sky.addColorStop(0.55, '#0f1626'); sky.addColorStop(0.85, '#2a2230'); sky.addColorStop(1, '#3a2a26')
  g.fillStyle = sky; g.fillRect(0, 0, 1000, 600)
  g.fillStyle = '#141b2b'                                            // lointain
  for (let x = -20; x < 1020;) { const bw = 40 + rnd() * 70, top = 250 + rnd() * 120; g.fillRect(x, top, bw + 1, 600 - top); x += bw }
  for (let x = -30; x < 1030;) {                                     // proche, avec fenêtres allumées
    const bw = 70 + rnd() * 110, top = 150 + rnd() * 170
    g.fillStyle = '#0a0e18'; g.fillRect(x, top, bw + 1, 600 - top)
    for (let wy = top + 16; wy < 590; wy += 24) for (let wx = x + 10; wx < x + bw - 12; wx += 17) {
      const r = rnd(); if (r > 0.27) continue
      g.fillStyle = r < 0.2 ? '#f2b36b' : r < 0.24 ? '#cfe0ff' : '#ff7a5a'
      g.globalAlpha = 0.45 + rnd() * 0.5; g.fillRect(wx, wy, 7, 10); g.globalAlpha = 1
    }
    if (rnd() < 0.3) { g.fillStyle = '#ff3030'; g.beginPath(); g.arc(x + bw / 2, top - 6, 3, 0, Math.PI * 2); g.fill() }
    x += bw + 6
  }
  g.globalAlpha = 0.35; g.fillStyle = '#3a2418'; g.fillRect(0, 470, 1000, 130); g.globalAlpha = 1
  g.restore()
}

// Lueurs (fondu additif) : à gauche un halo rond, à droite la lumière d'une fenêtre à quatre carreaux.
function drawGlows(g, w, h) {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h)
  const r = g.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2)
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r; g.fillRect(0, 0, h, h)
  g.save(); g.translate(h, 0)
  g.filter = 'blur(14px)'
  const m = 20, gap = 9, cw = (h - 2 * m - 2 * gap) / 3, ch = (h - 2 * m - gap) / 2
  const fade = g.createLinearGradient(0, m, 0, h - m); fade.addColorStop(0, 'rgba(255,255,255,1)'); fade.addColorStop(1, 'rgba(255,255,255,.25)')
  g.fillStyle = fade
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.fillRect(m + i * (cw + gap), m + j * (ch + gap), cw, ch)
  g.restore()
}

// Le drap : coton crème, plis, et le sang qui l'imbibe aux poitrines (cotes : 1 px = drap / taille)
function drawSheet(g, w, h, stains) {
  const rnd = makeRnd(17)
  g.fillStyle = '#ece6da'; g.fillRect(0, 0, w, h)
  g.globalAlpha = 0.07
  for (let i = 0; i < 2600; i++) { g.fillStyle = rnd() < 0.5 ? '#8a8070' : '#ffffff'; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1) }
  g.globalAlpha = 1
  for (const s of stains) {
    for (let k = 0; k < s.n; k++) {
      const x = s.x + (rnd() - 0.5) * s.r * 1.1, y = s.y + (rnd() - 0.5) * s.r * 0.9, r = s.r * (0.35 + rnd() * 0.5)
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, 'rgba(110,14,16,.55)'); gr.addColorStop(0.45, 'rgba(128,26,24,.38)'); gr.addColorStop(0.8, 'rgba(150,70,58,.12)'); gr.addColorStop(1, 'rgba(150,70,58,0)')
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.7 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2); g.fill()
    }
  }
}

// Le sang au sol : à gauche la flaque (vue de dessus), à droite la traînée vers l'arche.
function drawBlood(g, w, h, pools) {
  const rnd = makeRnd(23)
  g.clearRect(0, 0, w, h)
  const blob = (x, y, r, a = 0.92) => {
    g.fillStyle = `rgba(132,10,14,${a})`
    g.beginPath()
    const n = 14
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2, rr = r * (0.78 + rnd() * 0.36)
      const px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr
      if (i === 0) g.moveTo(px, py); else g.quadraticCurveTo(x + Math.cos(t - 0.2) * rr * 1.08, y + Math.sin(t - 0.2) * rr * 1.08, px, py)
    }
    g.closePath(); g.fill()
  }
  for (const p of pools) { blob(p.x, p.y, p.r); for (let k = 0; k < p.n; k++) blob(p.x + (rnd() - 0.5) * p.r * 1.6, p.y + (rnd() - 0.5) * p.r * 1.6, p.r * (0.2 + rnd() * 0.45)) }
  // bord plus sombre, centre plus lisse
  g.globalCompositeOperation = 'source-atop'
  for (const p of pools) {
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.4)
    gr.addColorStop(0, 'rgba(150,18,18,.25)'); gr.addColorStop(0.75, 'rgba(80,4,6,.25)'); gr.addColorStop(1, 'rgba(40,0,2,.6)')
    g.fillStyle = gr; g.fillRect(p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4)
  }
  g.globalCompositeOperation = 'source-over'
  // traînée (moitié droite) : frottis en bandes qui s'effilochent, de la flaque (droite) vers l'arche (gauche)
  const x0 = w / 2
  for (let k = 0; k < 11; k++) {
    const y = h * 0.5 + (rnd() - 0.5) * h * 0.42
    g.strokeStyle = `rgba(120,8,12,${0.22 + rnd() * 0.4})`; g.lineWidth = 30 + rnd() * 70; g.lineCap = 'round'
    g.beginPath(); g.moveTo(w - 10, y); g.bezierCurveTo(w - w * 0.18, y + (rnd() - 0.5) * 30, x0 + w * 0.2, y + (rnd() - 0.5) * 40, x0 + 20 + rnd() * w * 0.2, y + (rnd() - 0.5) * 50); g.stroke()
  }
  for (let k = 0; k < 22; k++) blob(x0 + 30 + rnd() * (w / 2 - 60), h * 0.5 + (rnd() - 0.5) * h * 0.6, 4 + rnd() * 14, 0.85)
}

// La photo de famille au coucher de soleil (symbole pro-fam des maquettes), verre fêlé en étoile.
function drawPhoto(g, w, h) {
  g.fillStyle = '#e9e0cc'; g.fillRect(0, 0, w, h)
  const m = Math.round(w * 0.07), iw = w - 2 * m, ih = h - 2 * m
  g.save(); g.translate(m, m); g.beginPath(); g.rect(0, 0, iw, ih); g.clip(); g.scale(iw / 300, ih / 210)
  const sky = g.createLinearGradient(0, 0, 0, 210)
  sky.addColorStop(0, '#f8dba8'); sky.addColorStop(0.42, '#f2ae66'); sky.addColorStop(0.66, '#dd7c48'); sky.addColorStop(1, '#7a3a22')
  g.fillStyle = sky; g.fillRect(0, 0, 300, 210)
  g.globalAlpha = 0.92; g.fillStyle = '#fff0c4'; g.beginPath(); g.arc(226, 146, 25, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 0.25; g.fillStyle = '#ffe0a0'; g.beginPath(); g.arc(226, 146, 40, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1
  const sea = g.createLinearGradient(0, 150, 0, 210); sea.addColorStop(0, '#8a4a2e'); sea.addColorStop(1, '#3a1d14')
  g.fillStyle = sea; g.fillRect(0, 150, 300, 60)
  g.strokeStyle = '#ffd79a'; g.lineWidth = 1.6; g.lineCap = 'round'; g.globalAlpha = 0.75
  for (const [a, b, y] of [[200, 252, 156], [208, 244, 161], [214, 238, 166], [196, 226, 172]]) { g.beginPath(); g.moveTo(a, y); g.lineTo(b, y); g.stroke() }
  g.globalAlpha = 1
  g.fillStyle = '#2c1610'; g.beginPath(); g.moveTo(0, 166); g.quadraticCurveTo(150, 160, 300, 168); g.lineTo(300, 210); g.lineTo(0, 210); g.closePath(); g.fill()
  g.fillStyle = '#20110c'; g.strokeStyle = 'rgba(255,201,138,.55)'; g.lineWidth = 0.7
  for (const d of [
    'M120 58 C118 49 131 48 137 56 C135 61 132 63 129 62 C123 64 118 74 113 87 C110 93 104 93 101 90 C107 84 111 72 115 63 Z',
    'M125 75 H131 V81 H125 Z', 'M118 80 C122 77 134 77 139 80 L143 96 L140 112 C146 127 151 141 155 153 L107 153 C111 140 115 126 118 112 L115 96 Z',
    'M121 153 L123 169 L127 169 L126 153 Z M133 153 L136 169 L140 169 L138 153 Z', 'M137 84 C143 96 147 108 151 120 L147 122 C142 110 137 98 133 88 Z',
    'M119 84 C115 96 113 108 113 118 L117 118 C118 108 120 96 122 88 Z',
    'M172 82 C181 80 185 88 182 97 C179 92 176 89 172 89 Z', 'M165 95 H169 V100 H165 Z', 'M159 101 C162 99 172 99 175 101 L180 134 L154 134 Z',
    'M159 134 L160 169 L164 169 L164 134 Z M170 134 L170 169 L174 169 L175 134 Z', 'M161 103 C157 110 154 116 152 123 L148 122 C150 114 153 107 157 101 Z',
    'M173 103 C179 98 183 92 185 83 L189 84 C187 94 182 102 176 108 Z',
  ]) { path(g, d); path(g, d, false) }
  for (const [x, y, r] of [[128, 66, 10.5], [167, 88, 8], [187.5, 82, 2.6], [150, 122, 2.7]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke() }
  g.restore()
  // le verre fêlé : impact en (222 ; 58) du repère 300 × 210, sur toute la photo
  g.save(); g.scale(w / 300, h / 210)
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.1; g.lineCap = 'round'
  for (const d of ['M222 58 L300 26', 'M222 58 L300 92', 'M222 58 L292 210', 'M222 58 L240 0', 'M222 58 L166 0', 'M222 58 L196 120 L188 210', 'M222 58 L150 70', 'M222 58 L120 150 L60 210']) {
    const pts = d.slice(1).split(/ L/).map(s => s.trim().split(' ').map(Number))
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.stroke()
  }
  g.lineWidth = 0.9; g.beginPath()
  for (const [x, y] of [[210, 50], [216, 45], [229, 47], [234, 56], [231, 67], [219, 71], [210, 64], [210, 50]]) g.lineTo(x, y)
  g.stroke()
  g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(222, 58); g.lineTo(229, 47); g.lineTo(234, 56); g.closePath(); g.fill()
  g.restore()
  const sh = g.createLinearGradient(0, 0, w, h); sh.addColorStop(0.3, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.12)'); sh.addColorStop(0.62, 'rgba(255,255,255,0)')
  g.fillStyle = sh; g.fillRect(0, 0, w, h)
}

// Le mot des tueurs, écrit à la main
function drawNote(g, w, h) {
  const rnd = makeRnd(3)
  g.fillStyle = '#e6e0d0'; g.fillRect(0, 0, w, h)
  g.globalAlpha = 0.06; for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; g.fillRect(rnd() * w, rnd() * h, 1, 1) }
  g.globalAlpha = 0.18; g.fillStyle = '#8a8070'; g.fillRect(0, h * 0.5, w, 2); g.globalAlpha = 1   // pliure
  g.save(); g.translate(w / 2, h / 2 - 6); g.rotate(-0.07)
  g.fillStyle = '#16120e'; g.font = 'italic 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText('Tu aurais dû dire oui.', 0, 0)
  g.restore()
}

// Une goutte de pluie : un trait vertical qui s'efface vers le haut
function drawDrop(g, w, h) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)')
  g.fillStyle = gr; g.fillRect(w / 2 - 1, 0, 2, h)
}

// La planche des images aux murs (PIC_W × PIC_H) : deux vues de vacances (la mer au soir, un lac de montagne), le dessin
// de la petite, une gravure de voilier. Aucun personnage. Rectangles [x, y, largeur, hauteur] en pixels.
const PIC = { mer: [0, 0, 340, 255], lac: [342, 0, 340, 255], dessin: [684, 0, 340, 255], voilier: [0, 257, 192, 255] }
function drawPictures(g) {
  const rnd = makeRnd(83)
  const inRect = ([x, y, w, h], draw) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); draw(w, h); g.restore() }
  const lin = (y0, y1, stops) => { const gr = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([t, c]) => gr.addColorStop(t, c)); return gr }
  const wash = (w, h, n, rgb, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rgb},${a * rnd()})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 6 + rnd() * 26, 0, Math.PI * 2); g.fill() } }
  g.fillStyle = '#808080'; g.fillRect(0, 0, PIC_W, PIC_H)
  // la mer au soir, à l'aquarelle : ciel pêche, soleil bas, reflets, un cap sombre
  inRect(PIC.mer, (w, h) => {
    g.fillStyle = lin(0, h * 0.6, [[0, '#56688a'], [0.55, '#c49c88'], [1, '#ecc79c']]); g.fillRect(0, 0, w, h * 0.6)
    g.fillStyle = 'rgba(255,238,204,.9)'; g.beginPath(); g.arc(w * 0.66, h * 0.52, h * 0.07, 0, Math.PI * 2); g.fill()
    g.fillStyle = lin(h * 0.58, h, [[0, '#5a6e80'], [1, '#26323f']]); g.fillRect(0, h * 0.58, w, h * 0.42)
    g.lineCap = 'round'
    for (let i = 0; i < 46; i++) {
      const y = h * (0.6 + rnd() * 0.36), x = w * 0.66 + (rnd() - 0.5) * w * (0.1 + (y / h - 0.6) * 0.9)
      g.strokeStyle = `rgba(255,214,170,${0.15 + rnd() * 0.35})`; g.lineWidth = 1 + rnd() * 2
      g.beginPath(); g.moveTo(x - 4 - rnd() * 14, y); g.lineTo(x + 4 + rnd() * 14, y); g.stroke()
    }
    g.fillStyle = '#2a2a34'; g.beginPath(); g.moveTo(0, h * 0.5); g.quadraticCurveTo(w * 0.16, h * 0.44, w * 0.34, h * 0.6); g.lineTo(0, h * 0.6); g.closePath(); g.fill()
    wash(w, h, 40, '255,240,220', 0.08)
  })
  // un lac de montagne : sommets enneigés, leur reflet, une rive de sapins
  inRect(PIC.lac, (w, h) => {
    g.fillStyle = lin(0, h * 0.55, [[0, '#8fa6c0'], [1, '#d8dde0']]); g.fillRect(0, 0, w, h * 0.55)
    const range = (pts, c, snow) => {
      g.fillStyle = c; g.beginPath(); g.moveTo(0, h * 0.55); for (const [x, y] of pts) g.lineTo(x * w, y * h); g.lineTo(w, h * 0.55); g.closePath(); g.fill()
      if (snow) { g.fillStyle = 'rgba(245,248,252,.85)'; for (const [x, y] of pts) if (y < 0.32) { g.beginPath(); g.moveTo(x * w, y * h); g.lineTo(x * w - 14, y * h + 16); g.lineTo(x * w + 14, y * h + 16); g.closePath(); g.fill() } }
    }
    range([[0, 0.4], [0.18, 0.2], [0.34, 0.36], [0.52, 0.16], [0.7, 0.34], [0.86, 0.24], [1, 0.38]], '#56647a', true)
    range([[0, 0.5], [0.25, 0.38], [0.5, 0.48], [0.75, 0.4], [1, 0.5]], '#3c4a5a', false)
    g.fillStyle = lin(h * 0.55, h, [[0, '#6e8298'], [1, '#334252']]); g.fillRect(0, h * 0.55, w, h * 0.45)
    g.save(); g.globalAlpha = 0.3; g.translate(0, h * 1.1); g.scale(1, -1); range([[0, 0.4], [0.18, 0.2], [0.34, 0.36], [0.52, 0.16], [0.7, 0.34], [0.86, 0.24], [1, 0.38]], '#56647a', false); g.restore()
    g.fillStyle = '#1e2a24'
    for (let x = -4; x < w; x += 9 + rnd() * 8) { const t = h * (0.5 + rnd() * 0.06), b = h * 0.6; g.beginPath(); g.moveTo(x, b); g.lineTo(x + 6, t); g.lineTo(x + 12, b); g.closePath(); g.fill() }
    wash(w, h, 30, '230,236,240', 0.07)
  })
  // le dessin de la petite, aux craies grasses sur papier blanc : la maison, le soleil, un arbre, des fleurs, un arc-en-ciel
  inRect(PIC.dessin, (w, h) => {
    g.fillStyle = '#f2eee2'; g.fillRect(0, 0, w, h)
    g.lineCap = 'round'; g.lineJoin = 'round'
    const crayon = (c, lw, pts, close = false) => {
      g.strokeStyle = c; g.lineWidth = lw
      for (let pass = 0; pass < 2; pass++) {
        g.beginPath(); pts.forEach(([x, y], i) => { const jx = (rnd() - 0.5) * 3, jy = (rnd() - 0.5) * 3; if (i) g.lineTo(x + jx, y + jy); else g.moveTo(x + jx, y + jy) })
        if (close) g.closePath(); g.stroke()
      }
    }
    const scribble = (c, x0, y0, x1, y1, n = 14) => { g.strokeStyle = c; g.lineWidth = 4; g.beginPath(); for (let i = 0; i <= n; i++) { const t = i / n; g.lineTo(x0 + (x1 - x0) * t + (i % 2 ? 6 : -6), y0 + (y1 - y0) * t) } g.stroke() }
    for (let x = 4; x < w; x += 7) crayon('#4a9a3a', 4, [[x, h - 6], [x + 3, h - 30 - rnd() * 12]])                  // l'herbe
    crayon('#c83a2a', 5, [[60, 112], [130, 62], [200, 112]], true); scribble('#d85a3a', 80, 100, 180, 100, 6)          // le toit
    crayon('#9a5a2a', 5, [[70, 112], [190, 112], [190, 214], [70, 214]], true)                                          // les murs
    crayon('#5a3a1a', 5, [[118, 214], [118, 166], [146, 166], [146, 214]])                                              // la porte
    crayon('#3a6ac8', 4, [[84, 128], [108, 128], [108, 152], [84, 152]], true); crayon('#3a6ac8', 3, [[96, 128], [96, 152]]); crayon('#3a6ac8', 3, [[84, 140], [108, 140]])
    crayon('#3a6ac8', 4, [[156, 128], [180, 128], [180, 152], [156, 152]], true)
    g.fillStyle = '#f0c020'; g.beginPath(); g.arc(34, 34, 18, 0, Math.PI * 2); g.fill()                                // le soleil
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; crayon('#e8a818', 3, [[34 + Math.cos(a) * 24, 34 + Math.sin(a) * 24], [34 + Math.cos(a) * 36, 34 + Math.sin(a) * 36]]) }
    crayon('#7a4a20', 7, [[262, 214], [264, 140]]); g.fillStyle = 'rgba(70,150,60,.9)'                                  // l'arbre
    for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(250 + rnd() * 30, 108 + rnd() * 34, 18 + rnd() * 8, 0, Math.PI * 2); g.fill() }
    for (const [c, r] of [['#d83a3a', 70], ['#f0a020', 62], ['#3a9ad8', 54]]) { g.strokeStyle = c; g.lineWidth = 6; g.beginPath(); g.arc(300, 80, r, Math.PI * 1.05, Math.PI * 1.55); g.stroke() }   // l'arc-en-ciel
    for (const [x, c] of [[216, '#e05a8a'], [236, '#8a5ad0'], [318, '#e05a8a']]) {                                       // des fleurs
      crayon('#3a8a3a', 3, [[x, 236], [x, 214]])
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.fillStyle = c; g.beginPath(); g.arc(x + Math.cos(a) * 6, 208 + Math.sin(a) * 6, 5, 0, Math.PI * 2); g.fill() }
      g.fillStyle = '#f0c020'; g.beginPath(); g.arc(x, 208, 3.5, 0, Math.PI * 2); g.fill()
    }
    g.fillStyle = '#d8344a'; g.beginPath(); g.moveTo(40, 150); g.bezierCurveTo(28, 136, 14, 156, 40, 176); g.bezierCurveTo(66, 156, 52, 136, 40, 150); g.fill()   // un cœur
  })
  // une gravure de voilier, papier jauni, trait sépia
  inRect(PIC.voilier, (w, h) => {
    g.fillStyle = '#d6c6a0'; g.fillRect(0, 0, w, h); wash(w, h, 30, '150,120,70', 0.08)
    g.strokeStyle = '#4a3420'; g.lineWidth = 1.4; g.strokeRect(10, 10, w - 20, h - 20)
    g.fillStyle = '#3a2816'; g.beginPath(); g.moveTo(44, 168); g.lineTo(150, 168); g.lineTo(136, 186); g.lineTo(56, 186); g.closePath(); g.fill()   // la coque
    g.strokeStyle = '#3a2816'; g.lineWidth = 2; g.beginPath(); g.moveTo(98, 168); g.lineTo(98, 48); g.stroke()                                     // le mât
    g.fillStyle = '#efe4c8'; g.lineWidth = 1.2
    for (const pts of [[[100, 52], [100, 160], [150, 160]], [[96, 60], [96, 160], [52, 160]]]) { g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.lineTo(...pts[2]); g.closePath(); g.fill(); g.stroke() }
    g.lineWidth = 1
    for (let i = 0; i < 9; i++) { const y = 194 + i * 6; g.beginPath(); for (let x = 16; x < w - 16; x += 12) { g.moveTo(x, y + (i % 2) * 2); g.quadraticCurveTo(x + 3, y - 3, x + 6, y) } g.stroke() }
    for (const [x, y] of [[40, 70], [56, 60], [150, 84]]) { g.beginPath(); g.moveTo(x - 6, y - 3); g.quadraticCurveTo(x - 3, y - 5, x, y); g.quadraticCurveTo(x + 3, y - 5, x + 6, y - 3); g.stroke() }   // des mouettes
  })
}

// ───────────────────────────── l'appartement ─────────────────────────────

export function buildApartment() {
  const group = new THREE.Group(); group.name = 'appartement'
  const colliders = [], targets = [], occluders = [], anchors = {}
  let phoneScreen = null
  const owned = { mats: [], texs: [] }
  const tex = (...a) => { const t = canvasTexture(...a); owned.texs.push(t); return t }
  const lambert = (color, opts = {}, ud = {}) => { const m = new THREE.MeshLambertMaterial({ color, ...opts }); Object.assign(m.userData, ud); owned.mats.push(m); return m }

  // ── matériaux statiques (un appel de dessin chacun) ──
  const T_parquet = tex(256, 256, drawParquet, { repeat: [1, 1] }); T_parquet.anisotropy = 8
  const T_tiles = tex(128, 128, drawTiles, { repeat: [1, 1] }); T_tiles.anisotropy = 8
  const T_rug = tex(512, 384, drawRug); T_rug.anisotropy = 4
  const T_city = tex(1024, 512, drawCity)
  const T_glow = tex(512, 256, drawGlows)
  // abat-jour : dehors, la lueur ne mord que le bord de la grande ouverture (haut de la carte = v = 1 = grand bout) ;
  // dedans, plus clair près de l'ampoule (bas de la carte = petit bout)
  const T_shade = tex(4, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.08, '#707070'); gr.addColorStop(0.3, '#000000'); gr.addColorStop(1, '#000000'); g.fillStyle = gr; g.fillRect(0, 0, w, h) })
  // dedans : la lumière vient du fond (l'ampoule) et s'éteint vers le bord ; une côte sombre par pli (18 plis sur u)
  const T_shadeIn = tex(144, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a2a2a'); gr.addColorStop(0.45, '#8a8a8a'); gr.addColorStop(1, '#ffffff')
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(0,0,0,.38)'; for (let k = 0; k < 18; k++) g.fillRect(k * 8 + 5, 0, 3, h)
  })
  const T_palier = tex(2048, 512, drawPalier); T_palier.anisotropy = 8
  const T_palierLit = tex(2048, 512, (g, w, h) => drawPalierLit(g, w, h, T_palier.image)); T_palierLit.anisotropy = 8
  const T_neonGrad = tex(4, 64, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#000'); gr.addColorStop(0.45, '#2a2a2a'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 0, w, h) })
  const T_pictures = tex(PIC_W, PIC_H, drawPictures); T_pictures.anisotropy = 4

  const M = {
    parquet: lambert(0xb08a68, { map: T_parquet }),
    carrelage: lambert(0x8a8e96, { map: T_tiles, emissive: 0x6a7a70, emissiveIntensity: 0.05 }),
    mur: lambert(0x8c877d),
    murPalier: lambert(0x9a9a9a, { map: T_palier, emissive: 0xc4d6cf, emissiveMap: T_palierLit, emissiveIntensity: 1.3 }),   // l'enduit, et le néon qui l'éclaire (carte calculée au mur)
    portePalier: lambert(0x6a3e32, { emissive: 0x6a7a66, emissiveMap: T_neonGrad, emissiveIntensity: 0.3 }),   // faces de la porte et du chambranle éclairées par le néon
    murEnfant: lambert(0x84788e),
    plafond: lambert(0x56585f),
    boisSombre: lambert(0x4e3828, {}, { cast: true }),
    boisClair: lambert(0x9a7a58),
    tissu: lambert(0x2f3440, {}, { cast: true }),
    rideau: lambert(0x2a2a38, { side: THREE.DoubleSide }, { cast: true }),
    tapis: lambert(0xffffff, { map: T_rug }),
    tissuRose: lambert(0x8a5a6a, { side: THREE.DoubleSide }),   // double face : la couette est une nappe qui tombe du lit
    velours: lambert(0x5a3428, {}, { cast: true }),             // le fauteuil, velours rouille
    tableaux: lambert(0xffffff, { map: T_pictures }),            // les images aux murs
    blanc: lambert(0xb8b4ac, {}, { cast: true }),
    boiserie: lambert(0xb8b4ac, {}, { cast: true }),   // portes intérieures, chambranles, bâtis : peints comme les plinthes, ils arrêtent la visée
    livres: lambert(0xffffff, { vertexColors: true }, { cast: true }),
    metal: lambert(0x6a6e76),
    miroir: new THREE.MeshPhongMaterial({ color: 0x10141a, specular: 0x8899aa, shininess: 90 }),
    // abat-jour : tissu bordeaux plissé dehors (jamais couleur chair : coupé au bord de l'image, l'ancien cône lisse et
    // orangé se lisait comme un doigt), lueur chaude dedans, vue par l'ouverture, et au bord seulement
    abatJour: lambert(0x4a1a24, { emissive: 0xff8a50, emissiveMap: T_shade, emissiveIntensity: 0.55, flatShading: true }, { receive: false }),
    abatJourDedans: new THREE.MeshBasicMaterial({ color: 0xffa040, map: T_shadeIn, side: THREE.BackSide, toneMapped: false }),   // ambre vif : une lumière, pas une peau
    neon: lambert(0x202428, { emissive: 0xdfeaff, emissiveIntensity: 1.2 }, { receive: false }),
    veilleuse: new THREE.MeshBasicMaterial({ vertexColors: true }),   // l'étoile de la veilleuse (rose) et l'ampoule de la lampe (blanc chaud)
    vitre: new THREE.MeshLambertMaterial({ color: 0x9fb8d8, transparent: true, opacity: 0.18, depthWrite: false }),
    ville: new THREE.MeshBasicMaterial({ map: T_city, fog: false }),
    lueurs: new THREE.MeshBasicMaterial({ map: T_glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    halo: new THREE.MeshBasicMaterial({ map: T_glow, color: 0xbfd4ff, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  }
  for (const k of ['miroir', 'veilleuse', 'abatJourDedans', 'vitre', 'ville', 'lueurs', 'halo']) owned.mats.push(M[k])
  for (const k of ['veilleuse', 'abatJourDedans', 'vitre', 'ville', 'lueurs', 'halo']) M[k].userData.receive = false
  for (const k in M) M[k].name = k

  const neonLit = [[M.murPalier, 1.3], [M.portePalier, 0.6], [M.carrelage, 0.14]]   // matériaux « éclairés » par le néon du palier (intensité émissive de base)
  const B = createBatcher()
  const glows = []   // lueurs additives (fausse lumière), fusionnées en un seul maillage
  const box = (m, cx, cy, cz, w, h, d, place) => B.box(m, cx, cy, cz, w, h, d, place)
  const solid = (minX, maxX, minZ, maxZ) => colliders.push({ minX, maxX, minZ, maxZ })
  // Bords souples d'un tapis posé à plat (de x0 à x1, de z0 à z1, à 4 mm du sol) : un ourlet roulé tout autour (un jonc
  // dans la couleur de sa bordure sombre), des franges de coton aux deux petits côtés (x0 et x1) : un brin tous les
  // 12 mm, effilé (un triangle de 4 mm à sa base), de 3 à 5 cm, un peu de travers. Plus clairsemées, elles se lisaient
  // comme les graduations d'une règle.
  function rugEdges(x0, x1, z0, z1, seed) {
    const e = 0.003, at = (x, z) => V(x, 0.003, z)
    const border = g => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.02, 0.5); return g }
    for (const [a, b] of [[at(x0 + e, z0 + e), at(x1 - e, z0 + e)], [at(x0 + e, z1 - e), at(x1 - e, z1 - e)],
      [at(x0 + e, z0 + e), at(x0 + e, z1 - e)], [at(x1 - e, z0 + e), at(x1 - e, z1 - e)]]) B.add(M.tapis, border(rod(a, b, 0.0045, 8)))
    const rnd = makeRnd(seed), n = Math.round((z1 - z0) / 0.012), y = 0.0015, hw = 0.002, v = []
    for (const [x, s] of [[x0, -1], [x1, 1]]) for (let k = 0; k < n; k++) {
      const z = z0 + (k + 0.5) * (z1 - z0) / n + (rnd() - 0.5) * 0.004, len = 0.03 + rnd() * 0.02, a = (rnd() - 0.5) * 0.3
      const [za, zb] = s > 0 ? [z - hw, z + hw] : [z + hw, z - hw]   // face vers le haut
      v.push(x, y, za, x, y, zb, x + s * len * Math.cos(a), y, z + len * Math.sin(a))
    }
    B.add(M.blanc, fromTriangles(v))
  }
  // Une image encadrée sur un mur : f, la face du mur { alongX, at, n (±1, vers la pièce) } ; centrée en (a, y) ; cadre
  // w × h de baguettes arrondies (largeur border, épaisseur depth), passe-partout, image pw × ph prise sur la planche (pic).
  function picture(f, a, y, w, h, pic, pw, ph, wood, border = 0.03, depth = 0.025) {
    const P = (u, d) => f.alongX ? V(a + u, y, f.at + f.n * d) : V(f.at + f.n * d, y, a + u)
    const ry = f.alongX ? (f.n > 0 ? 0 : Math.PI) : (f.n > 0 ? Math.PI / 2 : -Math.PI / 2)
    const put = (mat, geo, u, v, d) => { const c = P(u, d); B.add(mat, geo, { x: c.x, y: c.y + v, z: c.z, ry }) }
    const sw = w - 2 * border, sh = h - 2 * border
    for (const s of [-1, 1]) {
      put(wood, rounded(border, h, depth, 0.005), s * (w - border) / 2, 0, depth / 2)
      put(wood, rounded(sw + 0.004, border, depth, 0.005), 0, s * (h - border) / 2, depth / 2)
    }
    put(M.blanc, new THREE.BoxGeometry(sw + 0.004, sh + 0.004, 0.012), 0, 0, 0.006)
    put(M.tableaux, pictureGeo(pw, ph, pic), 0, 0, 0.0125)
  }

  // les pièces dessinées, d'axe de mur à axe de mur (la cuisine et la chambre des parents ne le sont pas)
  const rooms = [
    { x0: 5, x1: 7, z0: 7, z1: 8.5, sol: M.carrelage },     // palier
    { x0: 4.5, x1: 7.5, z0: 4.5, z1: 7, sol: M.parquet },   // entrée
    { x0: 7.5, x1: 12.5, z0: 1, z1: 7, sol: M.parquet },    // salon
    { x0: 0.5, x1: 4.5, z0: 4.5, z1: 5.8, sol: M.parquet }, // couloir
    { x0: 0.5, x1: 4.5, z0: 0.8, z1: 4.5, sol: M.parquet }, // chambre
  ]
  // Étendues [a, b] d'un morceau de mur (de a à b le long de x si alongX, sinon de z) dont la face, à la cote q, borde
  // une pièce dessinée : coupées aux axes des murs de la pièce (dans un angle, les deux plinthes se croisent dans
  // l'épaisseur du mur), et seulement s'il en reste un bout entre les faces de ces murs.
  function roomSpans(alongX, q, a, b) {
    const spans = []
    for (const r of rooms) {
      const [p0, p1, r0, r1] = alongX ? [r.z0, r.z1, r.x0, r.x1] : [r.x0, r.x1, r.z0, r.z1]
      if (q <= p0 || q >= p1 || Math.min(b, r1 - T / 2) - Math.max(a, r0 + T / 2) <= 1e-6) continue
      spans.push([Math.max(a, r0), Math.min(b, r1)])
    }
    return spans
  }

  // ── murs ──
  // Un segment horizontal (z constant) ou vertical (x constant) ; ouvertures { from, to, bottom = 0, top }.
  // matNeg / matPos : peinture du côté des petites / grandes coordonnées (deux demi-épaisseurs si elles diffèrent).
  function wall(x1, z1, x2, z2, openings = [], matNeg = M.mur, matPos = matNeg) {
    const alongX = z1 === z2, line = alongX ? z1 : x1
    const a0 = Math.min(alongX ? x1 : z1, alongX ? x2 : z2) - T / 2, a1 = Math.max(alongX ? x1 : z1, alongX ? x2 : z2) + T / 2
    const pieces = []
    let cur = a0
    for (const o of [...openings].sort((p, q) => p.from - q.from)) {
      if (o.from > cur) pieces.push({ a: cur, b: o.from, y0: 0, y1: H })
      if ((o.bottom || 0) > 0) pieces.push({ a: o.from, b: o.to, y0: 0, y1: o.bottom })
      if (o.top < H) pieces.push({ a: o.from, b: o.to, y0: o.top, y1: H })
      cur = o.to
    }
    if (cur < a1) pieces.push({ a: cur, b: a1, y0: 0, y1: H })
    const halves = matNeg === matPos ? [[matNeg, 0, T]] : [[matNeg, -T / 4, T / 2], [matPos, T / 4, T / 2]]
    for (const p of pieces) {
      const len = p.b - p.a, mid = (p.a + p.b) / 2, hh = p.y1 - p.y0, yc = (p.y0 + p.y1) / 2
      for (const [m, off, th] of halves) {
        const geo = new THREE.BoxGeometry(alongX ? len : th, hh, alongX ? th : len)
        geo.translate(alongX ? mid : line + off, yc, alongX ? line + off : mid)
        if (m === M.murPalier) palierUV(geo)
        B.add(m, geo)
      }
      if (p.y0 === 0) {   // seuls les morceaux qui partent du sol arrêtent le joueur (jamais un linteau)
        if (alongX) solid(p.a, p.b, line - T / 2, line + T / 2); else solid(line - T / 2, line + T / 2, p.a, p.b)
        // plinthes, seulement côté pièce dessinée (ni cuisine, ni parents, ni dehors) : droites et sombres sur le palier,
        // moulurées et blanches dans l'appartement
        for (const side of [-1, 1]) for (const [a, b] of roomSpans(alongX, line + side * (T / 2 + 0.01), p.a, p.b)) {
          if ((side < 0 ? matNeg : matPos) === M.murPalier) {
            const o = line + side * (T / 2 + 0.006), sl = b - a, sm = (a + b) / 2
            if (alongX) box(M.boisSombre, sm, 0.04, o, sl, 0.08, 0.012); else box(M.boisSombre, o, 0.04, sm, 0.012, 0.08, sl)
          } else {
            const f = line + side * T / 2, at = u => alongX ? V(u, 0, f) : V(f, 0, u)
            B.add(M.blanc, prism(P_PLINTHE, alongX ? V(0, 0, side) : V(side, 0, 0), UP, at(a), at(b)))
          }
        }
      }
    }
  }

  // les ouvertures : mur le long de x (alongX, z = line) ou de z (x = line), de from à to, jusqu'à top
  const O = {
    entree: { alongX: true, line: 7, from: 5.55, to: 6.45, top: 2.05 },
    cuisine: { alongX: true, line: 4.5, from: 5.6, to: 6.5, top: 2.05 },
    parents: { alongX: true, line: 5.8, from: 1.5, to: 2.4, top: 2.05 },
    chambre: { alongX: true, line: 4.5, from: 2.0, to: 2.9, top: 2.05 },
    arcSalon: { alongX: false, line: 7.5, from: 5.0, to: 6.6, top: 2.2 },
    arcCouloir: { alongX: false, line: 4.5, from: 4.6, to: 5.7, top: 2.2 },
    baie: { alongX: false, line: 12.5, from: 2, to: 6, bottom: 0.9, top: 2.3 },
    fenetre: { alongX: true, line: 0.8, from: 1.4, to: 3.2, bottom: 1.0, top: 2.2 },
  }
  // palier
  // les murs latéraux partent de l'épaisseur du mur z = 7 : leur bout (prolongé de T/2) y est noyé, et non à fleur de sa face côté entrée
  wall(5, 7 + T / 2, 5, 8.5, [], M.murPalier); wall(7, 7 + T / 2, 7, 8.5, [], M.murPalier); wall(5, 8.5, 7, 8.5, [], M.murPalier)
  // entrée
  wall(4.5, 7, 7.5, 7, [O.entree], M.mur, M.murPalier)
  wall(4.5, 4.5, 7.5, 4.5, [O.cuisine])
  wall(7.5, 1, 7.5, 7, [O.arcSalon])
  wall(4.5, 4.5, 4.5, 7, [O.arcCouloir])
  // salon
  wall(7.5, 1, 12.5, 1); wall(7.5, 7, 12.5, 7)
  wall(12.5, 1, 12.5, 7, [O.baie])
  // couloir
  wall(0.5, 4.5, 0.5, 5.8); wall(0.5, 5.8, 4.5, 5.8, [O.parents])
  wall(0.5, 4.5, 4.5, 4.5, [O.chambre], M.murEnfant, M.mur)
  // chambre de la petite
  wall(0.5, 0.8, 0.5, 4.5, [], M.murEnfant); wall(4.5, 0.8, 4.5, 4.5, [], M.murEnfant)
  wall(0.5, 0.8, 4.5, 0.8, [O.fenetre], M.murEnfant)

  // ── sols et plafonds ──
  for (const r of rooms) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2
    const sol = new THREE.BoxGeometry(w, 0.02, d); sol.translate(cx, -0.01, cz)
    B.add(r.sol, r.sol === M.parquet ? worldUV(sol, 0.6, 1.4) : worldUV(sol, 0.6))
    box(M.plafond, cx, H + 0.01, cz, w, 0.02, d)
  }

  // ── corniches : une gorge sous le plafond, le long des quatre murs de chaque pièce de l'appartement (pas du palier) ──
  for (const r of rooms.slice(1)) {
    const x0 = r.x0 + T / 2, x1 = r.x1 - T / 2, z0 = r.z0 + T / 2, z1 = r.z1 - T / 2
    for (const [n, a, b] of [[V(0, 0, 1), V(x0, H, z0), V(x1, H, z0)], [V(0, 0, -1), V(x0, H, z1), V(x1, H, z1)],
      [V(1, 0, 0), V(x0, H, z0), V(x0, H, z1)], [V(-1, 0, 0), V(x1, H, z0), V(x1, H, z1)]]) B.add(M.blanc, prism(P_CORNICHE, n, UP, a, b))
  }

  // ── chambranles et bâtis des portes et des arches, peints comme les portes intérieures (boiserie : ils arrêtent la
  // visée, comme les murs) ──
  // point de la face s (±1) d'une ouverture o, à l'abscisse a le long du mur et à la hauteur y
  const onFace = (o, s, a, y) => { const f = o.line + s * T / 2; return o.alongX ? V(a, y, f) : V(f, y, a) }
  // chambranle mouluré sur la face s : montants (côtés listés) et traverse, d'onglet ; head : étendue de la traverse
  function architrave(o, s, { sides = ['from', 'to'], head = null } = {}) {
    const n = o.alongX ? V(0, 0, s) : V(s, 0, 0), w = o.alongX ? V(1, 0, 0) : V(0, 0, 1), W = W_CHAMBRANLE
    if (sides.includes('from')) B.add(M.boiserie, prism(P_CHAMBRANLE, w.clone().negate(), n, onFace(o, s, o.from, 0), onFace(o, s, o.from, o.top + W)))
    if (sides.includes('to')) B.add(M.boiserie, prism(P_CHAMBRANLE, w, n, onFace(o, s, o.to, 0), onFace(o, s, o.to, o.top + W)))
    const [h0, h1] = head || [sides.includes('from') ? o.from - W : o.from, sides.includes('to') ? o.to + W : o.to]
    B.add(M.boiserie, prism(P_CHAMBRANLE, UP, n, onFace(o, s, h0, o.top), onFace(o, s, h1, o.top)))
  }
  // bâti : deux montants et une traverse de 2 cm qui habillent l'épaisseur du mur (5 mm de débord de chaque côté)
  function lining(o, th = 0.02) {
    const d = T + 0.01, bx = (a0, a1, y0, y1) => o.alongX
      ? box(M.boiserie, (a0 + a1) / 2, (y0 + y1) / 2, o.line, a1 - a0, y1 - y0, d) : box(M.boiserie, o.line, (y0 + y1) / 2, (a0 + a1) / 2, d, y1 - y0, a1 - a0)
    bx(o.from, o.from + th, 0, o.top); bx(o.to - th, o.to, 0, o.top); bx(o.from, o.to, o.top - th, o.top)
  }
  // la porte d'entrée garde son bâti d'origine (côté palier, éclairé par le néon) ; le montant côté gâche appartient à
  // l'indice « serrure »
  {
    const fw = 0.06, fd = T + 0.03, o = O.entree
    box(M.boisSombre, o.from - fw / 2, o.top / 2, o.line, fw, o.top, fd)
    box(M.boisSombre, (o.from + o.to) / 2, o.top + fw / 2, o.line, o.to - o.from + 2 * fw, fw, fd)
    // côté palier, le chambranle reçoit la lumière du néon (fine peau émissive, UV verticales du monde)
    for (const [cx, cy, w, h] of [[5.52, 1.025, 0.06, 2.05], [6.0, 2.08, 1.02, 0.06]]) { const g = new THREE.BoxGeometry(w, h, 0.004); g.translate(cx, cy, 7 + fd / 2 + 0.002); B.add(M.portePalier, heightUV(g)) }
    architrave(o, -1, { sides: ['from'], head: [o.from - W_CHAMBRANLE, o.to + W_CHAMBRANLE] })   // côté entrée : la traverse, intacte, court au-dessus de la gâche
  }
  for (const o of [O.chambre, O.cuisine, O.parents, O.arcSalon, O.arcCouloir]) lining(o)
  architrave(O.chambre, 1); architrave(O.chambre, -1)
  architrave(O.cuisine, 1); architrave(O.parents, -1)   // l'autre face donne sur une pièce fermée
  architrave(O.arcSalon, 1); architrave(O.arcSalon, -1)
  // l'arche du couloir touche presque les murs du couloir : côté entrée, un seul montant et la traverse jusqu'à l'angle ;
  // côté couloir, la traverse seule, d'un mur à l'autre
  architrave(O.arcCouloir, 1, { sides: ['to'], head: [4.5 + T / 2, O.arcCouloir.to + W_CHAMBRANLE] })
  architrave(O.arcCouloir, -1, { sides: [], head: [4.5 + T / 2, 5.8 - T / 2] })

  // ── portes intérieures : battants logés dans leur bâti, à deux panneaux à plate-bande, béquille sur rosace ──
  const DOOR_Y = [0.16, 0.86, 1.0, 1.9]   // panneau du bas, panneau du haut (y0, y1)
  // panneaux sur la face d'un battant (le long de x) en z, tournée vers s
  function doorPanels(cx, z, s) {
    for (const [y0, y1] of [[DOOR_Y[0], DOOR_Y[1]], [DOOR_Y[2], DOOR_Y[3]]]) {
      const g = raisedPanel(0.6, y1 - y0); if (s < 0) g.rotateY(Math.PI)
      B.add(M.boiserie, g, { x: cx, y: (y0 + y1) / 2, z })
    }
  }
  // béquille : rosace, tige, et le levier tourné vers le gond (dir : ±1 le long de x)
  function handle(x, z, s, dir) {
    B.add(M.metal, new THREE.CylinderGeometry(0.024, 0.024, 0.008, 16).rotateX(Math.PI / 2), { x, y: 1.0, z: z + s * 0.004 })
    B.add(M.metal, new THREE.CylinderGeometry(0.007, 0.007, 0.04, 8).rotateX(Math.PI / 2), { x, y: 1.0, z: z + s * 0.024 })
    box(M.metal, x + dir * 0.05, 1.0, z + s * 0.044, 0.11, 0.016, 0.018)
  }
  // portes fermées : 1 cm en retrait de la face vue s, un seuil dessous (la pièce derrière n'est pas dessinée). Le battant
  // entre de 1 mm dans son bâti (2 cm), sur les côtés et en tête : aucun jour sur le vide de la pièce derrière.
  function closedDoor(o, s, handleAt, dir) {
    const zc = o.line + s * (T / 2 - 0.03), cx = (o.from + o.to) / 2, lap = 0.001, y0 = 0.01, y1 = o.top - 0.02 + lap
    box(M.boiserie, cx, (y0 + y1) / 2, zc, o.to - o.from - 2 * (0.02 - lap), y1 - y0, 0.04)
    box(M.boisSombre, cx, 0.005, o.line, o.to - o.from, 0.01, T)
    doorPanels(cx, zc + s * 0.02, s); handle(handleAt, zc + s * 0.02, s, dir)
  }
  closedDoor(O.cuisine, 1, 6.4, -1); solid(5.6, 6.5, 4.44, 4.6)
  closedDoor(O.parents, -1, 1.6, 1); solid(1.5, 2.4, 5.7, 5.86)
  // porte de la chambre, grande ouverte, rabattue contre son chambranle (gond en x = 2,9, côté chambre)
  { const zc = 4.5 - T / 2 - 0.025 - 0.02
    box(M.boiserie, 3.35, 1.019, zc, 0.86, 2.018, 0.04); solid(2.9, 3.82, 4.37, 4.44)
    doorPanels(3.35, zc - 0.02, -1); handle(3.71, zc - 0.02, -1, -1) }

  // ── la porte d'entrée : battant à part (il bouge), pivot au gond (5,6 ; 6,97) ──
  const pivot = new THREE.Object3D(); pivot.position.set(5.6, 0, 6.97); pivot.rotation.y = 30 * DEG; group.add(pivot)
  const leafGeo = mergeGeometries([   // côté entrée, des panneaux à plate-bande comme les portes intérieures
    new THREE.BoxGeometry(0.9, 2.05, 0.041).translate(0.45, 1.025, -0.0005),
    raisedPanel(0.62, 0.7).rotateY(Math.PI).translate(0.45, 0.55, -0.021), raisedPanel(0.62, 0.9).rotateY(Math.PI).translate(0.45, 1.5, -0.021),
  ])
  const leaf = new THREE.Mesh(leafGeo, M.boisSombre); leaf.castShadow = true; leaf.receiveShadow = true; pivot.add(leaf)
  // face palier du battant (panneaux moulurés compris), éclairée par le néon
  const skinGeo = mergeGeometries([
    new THREE.BoxGeometry(0.9, 2.05, 0.004).translate(0.45, 1.025, 0.0215),
    new THREE.BoxGeometry(0.62, 0.7, 0.01).translate(0.45, 0.55, 0.027), new THREE.BoxGeometry(0.62, 0.9, 0.01).translate(0.45, 1.5, 0.027),
  ].map(g => doorUV(g, 0, 0.9)))
  const T_door = tex(256, 512, drawDoor); T_door.anisotropy = 4
  const T_doorLit = tex(256, 512, (g, w, h) => drawDoorLit(g, w, h, T_door.image)); T_doorLit.anisotropy = 4
  const skinMat = M.portePalier.clone(); skinMat.name = 'battant'; skinMat.map = T_door; skinMat.emissiveMap = T_doorLit; owned.mats.push(skinMat)
  const skin = new THREE.Mesh(skinGeo, skinMat); skin.receiveShadow = true; pivot.add(skin)
  const skinLit = [skinMat, 0.6]; neonLit.push(skinLit)   // une fois la porte ouverte, cette face ne voit plus le néon
  occluders.push(skin)
  const hwGeo = mergeGeometries([
    new THREE.BoxGeometry(0.13, 0.02, 0.025).translate(0.76, 1.02, 0.045), new THREE.BoxGeometry(0.13, 0.02, 0.025).translate(0.76, 1.02, -0.045),
    new THREE.BoxGeometry(0.05, 0.22, 0.008).translate(0.82, 1.0, 0.027), new THREE.BoxGeometry(0.05, 0.22, 0.008).translate(0.82, 1.0, -0.027),
    new THREE.CylinderGeometry(0.008, 0.008, 0.01, 8).rotateX(Math.PI / 2).translate(0.45, 1.55, 0.028),   // judas
    // le numéro, « 17 », en chiffres de laiton au-dessus du judas
    ...[[0.008, 0.075, 0.43, 1.72, 0], [0.008, 0.02, 0.4225, 1.7515, -0.9], [0.042, 0.008, 0.468, 1.7535, 0], [0.008, 0.074, 0.4715, 1.7175, -0.36]]
      .map(([w, h, x, y, rz]) => new THREE.BoxGeometry(w, h, 0.003).rotateZ(rz).translate(x, y, 0.0335)),
  ])
  const brass = lambert(0xb08a4a, { emissive: 0x3a2a10, emissiveIntensity: 1 }); brass.name = 'laiton'
  const hardware = new THREE.Mesh(hwGeo, brass); pivot.add(hardware)
  occluders.push(leaf)
  const door = { from: 30 * DEG, to: 100 * DEG, t: 0, opening: false }
  {   // collision : le battant à 100°, d'emblée
    const c = Math.cos(door.to), s = Math.sin(door.to), pts = []
    for (const lx of [0, 0.9]) for (const lz of [-0.0225, 0.0225]) pts.push([5.6 + lx * c + lz * s, 6.97 - lx * s + lz * c])
    solid(Math.min(...pts.map(p => p[0])), Math.max(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[1])))
  }

  // ── palier : paillasson, néon, minuterie, sonnette, porte du voisin ──
  B.add(M.tapis, rounded(0.8, 0.012, 0.5, 0.005), { x: 6.0, y: 0.006, z: 7.4 })   // paillassons : le tapis rouge sombre du couloir des cinématiques
  // boîtes peintes comme les murs du palier, ou comme les portes (éclairées par le néon)
  const palBox = (cx, cy, cz, w, h, d) => B.add(M.murPalier, palierUV(new THREE.BoxGeometry(w, h, d).translate(cx, cy, cz)))
  const doorBox = (cx, cy, cz, w, h, d) => B.add(M.portePalier, heightUV(new THREE.BoxGeometry(w, h, d).translate(cx, cy, cz)))
  // lueur verticale (radiale, face +z) posée devant un mur
  const vglow = (w, h, x, y, z, hex) => { const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5); return tint(g.translate(x, y, z), hex) }
  {   // bouton de minuterie à gauche de la porte (sa diode orange dans le noir) et sa goulotte jusqu'au plafonnier
    const z = PAL.z0
    palBox(5.25, 1.2, z + 0.006, 0.08, 0.08, 0.012)
    B.add(brass, new THREE.CylinderGeometry(0.024, 0.026, 0.008, 20).rotateX(Math.PI / 2), { x: 5.25, y: 1.2, z: z + 0.016 })
    B.add(M.veilleuse, tint(new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 12).rotateX(Math.PI / 2), 0xff8a24), { x: 5.25, y: 1.2, z: z + 0.0205 })
    glows.push(vglow(0.13, 0.13, 5.25, 1.2, z + 0.023, 0x7a3a10))
    palBox(5.25, 1.92, z + 0.007, 0.022, 1.36, 0.014)   // goulotte repeinte avec le mur
    box(M.blanc, 5.25, 2.592, 7.4, 0.022, 0.014, 0.68); box(M.blanc, 5.38, 2.592, 7.75, 0.28, 0.014, 0.022)
    // sonnette et plaque à droite, côté gâche
    palBox(6.74, 1.43, z + 0.005, 0.05, 0.075, 0.01)
    B.add(brass, new THREE.CylinderGeometry(0.009, 0.009, 0.006, 12).rotateX(Math.PI / 2), { x: 6.74, y: 1.44, z: z + 0.012 })
    box(brass, 6.74, 1.33, z + 0.003, 0.09, 0.028, 0.006)
  }
  {   // en face (mur z = 8,5), la porte du voisin : chambranle, battant à panneaux, laiton ; un filet de lumière dessous
    const z = PAL.z1
    for (const [cx, cy, w, h] of [[5.54, 1.0, 0.06, 2.0], [6.46, 1.0, 0.06, 2.0], [6.0, 2.03, 0.98, 0.06]]) doorBox(cx, cy, z, w, h, 0.03)   // chambranle
    const voisin = skinMat.clone(); voisin.name = 'porteVoisin'; owned.mats.push(voisin); neonLit.push([voisin, 0.6])   // la même porte, que rien n'ouvre
    const leafV = (cx, cy, cz, w, h, d) => B.add(voisin, doorUV(new THREE.BoxGeometry(w, h, d).translate(cx, cy, cz), 5.57, 0.86, true))
    leafV(6.0, 1.006, z - 0.02, 0.86, 1.988, 0.04)
    for (const [y0, y1] of DOOR_PANELS.map(p => [p[2], p[3]])) leafV(6.0, (y0 + y1) / 2, z - 0.045, 0.59, y1 - y0, 0.01)
    box(brass, 5.7, 1.0, z - 0.055, 0.12, 0.018, 0.022); box(brass, 5.66, 0.98, z - 0.043, 0.045, 0.2, 0.006)
    B.add(brass, new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10).rotateX(Math.PI / 2), { x: 6.0, y: 1.55, z: z - 0.052 })
    box(brass, 6.0, 1.42, z - 0.052, 0.1, 0.03, 0.004)
    B.add(M.tapis, rounded(0.7, 0.012, 0.42, 0.005), { x: 6.0, y: 0.006, z: 8.15, ry: Math.PI + 0.04 })
    B.add(M.veilleuse, tint(new THREE.BoxGeometry(0.84, 0.011, 0.038), 0xffb870), { x: 6.0, y: 0.0055, z: z - 0.02 })
    glows.push(tint(flat(1.3, 0.55, 6.0, 0.0135, z - 0.275, 0, [0, 0.5, 0.5, 1]), 0x3a2410))   // au-dessus des paillassons
  }
  box(M.metal, 6.0, 2.585, 7.75, 0.95, 0.03, 0.12)
  const neonGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.88, 10).rotateZ(Math.PI / 2).translate(6.0, 2.55, 7.75)
  const neon = new THREE.Mesh(neonGeo, M.neon); group.add(neon)
  const haloGeo = mergeGeometries([   // halo au plafond (vu de dessous : matériau double face) et flaque de lumière au sol
    flat(2.4, 1.7, 6.0, H - 0.004, 7.75, 0, [0, 0.5, 0, 1]),
    flat(1.6, 1.4, 6.0, 0.0135, 7.65, 0, [0, 0.5, 0, 1]),   // au-dessus du paillasson
  ])
  const halo = new THREE.Mesh(haloGeo, M.halo); halo.renderOrder = 2; group.add(halo)

  // ── entrée : console à tiroir, vide-poche, miroir ──
  // plateau aux arêtes adoucies (dessus à 84 cm : le téléphone y est posé), pieds effilés, caisson ; la façade (x = 4,965)
  // est faite de traverses, de montants et du tiroir, séparés par un jour de 3 mm qui laisse voir le caisson, 3 cm derrière
  B.add(M.boisSombre, rounded(0.42, 0.035, 0.9, 0.012, 2), { x: 4.78, y: 0.8225, z: 6.35 })
  for (const [lx, lz] of [[4.6, 5.93], [4.96, 5.93], [4.6, 6.77], [4.96, 6.77]]) B.add(M.boisSombre, taper(rounded(0.034, 0.805, 0.034, 0.006), 0.7), { x: lx, y: 0.4025, z: lz })
  {
    const xf = 4.965, z0 = 5.947, z1 = 6.753, fbox = (y0, y1, a0, a1) => box(M.boisSombre, xf - 0.01, (y0 + y1) / 2, (a0 + a1) / 2, 0.02, y1 - y0, a1 - a0)
    box(M.boisSombre, (4.6 + xf - 0.03) / 2, 0.735, 6.35, xf - 0.03 - 4.6, 0.14, z1 - z0)   // caisson
    fbox(0.785, 0.805, z0, z1); fbox(0.665, 0.685, z0, z1); fbox(0.685, 0.785, z0, 6.02); fbox(0.685, 0.785, 6.68, z1)
    fbox(0.688, 0.782, 6.023, 6.677)                                                          // le tiroir
    B.add(brass, rod(V(xf, 0.735, 6.35), V(xf + 0.012, 0.735, 6.35), 0.005, 8))              // son bouton de laiton
    B.add(brass, new THREE.SphereGeometry(0.013, 12, 8), { x: xf + 0.02, y: 0.735, z: 6.35 })
  }
  solid(4.57, 4.99, 5.9, 6.8)
  B.add(M.metal, new THREE.CylinderGeometry(0.085, 0.06, 0.025, 16), { x: 4.8, y: 0.853, z: 6.58 })
  box(M.metal, 4.82, 0.87, 6.56, 0.06, 0.004, 0.012, { ry: 0.6 }); box(M.metal, 4.78, 0.87, 6.6, 0.05, 0.004, 0.01, { ry: -0.3 })
  B.add(M.boisSombre, rounded(0.03, 0.82, 0.62, 0.012), { x: 4.575, y: 1.55, z: 6.35 })
  const mirror = new THREE.BoxGeometry(0.006, 0.72, 0.52); mirror.translate(4.594, 1.55, 6.35); B.add(M.miroir, mirror)
  {   // la patère, sur le mur de la cuisine : le ciré jaune de la petite pendu par sa capuche, son écharpe, ses bottes dessous
    const zf = 4.5 + T / 2, YELLOW = 0xb08a2c, RED = 0x7a2830
    B.add(M.boisSombre, rounded(0.66, 0.08, 0.022, 0.008), { x: 5.05, y: 1.64, z: zf + 0.011 })
    for (const x of [4.85, 5.05, 5.25]) {
      B.add(brass, rod(V(x, 1.625, zf + 0.02), V(x, 1.625, zf + 0.07), 0.005, 6)); B.add(brass, rod(V(x, 1.625, zf + 0.07), V(x, 1.655, zf + 0.082), 0.005, 6))
    }
    // le ciré : un corps évasé vers le bas (pendu, il garde le pli des épaules), deux manches, la capuche sur le crochet
    B.add(M.livres, tint(warp(cushion(0.34, 0.07, 0.5, 0.45, 0.3), (x, y, z) => [x * (0.98 + 0.4 * z), y, z]), YELLOW), { x: 4.85, y: 1.36, z: zf + 0.046, rx: Math.PI / 2 })
    for (const s of [-1, 1]) B.add(M.livres, tint(between(new THREE.CapsuleGeometry(0.03, 0.3, 3, 8), V(4.85 + s * 0.14, 1.55, zf + 0.05), V(4.85 + s * 0.18, 1.2, zf + 0.056)), YELLOW))
    B.add(M.livres, tint(cushion(0.19, 0.09, 0.2, 0.6, 0.5), YELLOW), { x: 4.85, y: 1.6, z: zf + 0.058, rx: Math.PI / 2 + 0.35 })
    // l'écharpe : les deux pans, et le tour du crochet
    B.add(M.livres, tint(rounded(0.13, 0.62, 0.014, 0.006), RED), { x: 5.22, y: 1.33, z: zf + 0.03, rz: 0.04 })
    B.add(M.livres, tint(rounded(0.12, 0.56, 0.014, 0.006), RED), { x: 5.3, y: 1.36, z: zf + 0.022, rz: -0.03 })
    B.add(M.livres, tint(cushion(0.17, 0.05, 0.1, 0.7, 0.4), RED), { x: 5.25, y: 1.63, z: zf + 0.05 })
    // les bottes de pluie, sous le ciré
    for (const [x, z, ry] of [[4.8, zf + 0.13, 0.1], [4.93, zf + 0.115, -0.15]]) {
      B.add(M.livres, tint(rounded(0.075, 0.17, 0.085, 0.025), YELLOW), { x, y: 0.135, z, ry })
      B.add(M.livres, tint(rounded(0.08, 0.06, 0.15, 0.025), YELLOW), { x: x + Math.sin(ry) * 0.035, y: 0.03, z: z + Math.cos(ry) * 0.035, ry })
    }
  }

  // ── salon ──
  // le tapis : à plat, un ourlet roulé tout autour, des franges aux deux petits côtés
  B.add(M.tapis, flat(3.2, 2.4, 9.6, 0.004, 3.4))
  rugEdges(8.0, 11.2, 2.2, 4.6, 61)
  // canapé contre z = 1 (collision x 8,15–10,65, z 1,2–2,2) : socle, dossier et accoudoirs roulés aux arêtes arrondies,
  // deux coussins d'assise et deux coussins de dossier bombés, pieds tournés
  B.add(M.tissu, rounded(2.0, 0.24, 0.92, 0.03), { x: 9.4, y: 0.18, z: 1.7 })
  B.add(M.tissu, rounded(2.36, 0.68, 0.2, 0.05), { x: 9.4, y: 0.4, z: 1.2 })
  for (const x of [8.31, 10.49]) B.add(M.tissu, rounded(0.18, 0.56, 0.96, 0.07, 2), { x, y: 0.34, z: 1.66 })
  for (const x of [8.905, 9.895]) {
    B.add(M.tissu, cushion(0.98, 0.15, 0.8), { x, y: 0.365, z: 1.72 })
    B.add(M.tissu, cushion(0.98, 0.2, 0.5), { x, y: 0.67, z: 1.42, rx: Math.PI / 2 - 0.15 })   // dossier, un peu renversé
  }
  for (const [x, z] of [[8.27, 1.18], [10.53, 1.18], [8.27, 2.1], [10.53, 2.1]]) B.add(M.boisSombre, new THREE.CylinderGeometry(0.022, 0.015, 0.06, 8), { x, y: 0.03, z })
  B.add(M.tissu, cushion(0.5, 0.12, 0.42), { x: 8.7, y: 0.058, z: 2.55, ry: 0.5, rz: 0.05 })   // coussin tombé, entre le canapé et la table (hors de leurs emprises)
  solid(8.15, 10.65, 1.2, 2.2)
  // table basse (9,5 ; 0,2 ; 3,1) 1,1 × 0,4 × 0,6 : plateau épais aux arêtes adoucies (dessus à 40 cm : le mot y est posé),
  // ceinture, pieds fuselés, tablette
  B.add(M.boisSombre, rounded(1.1, 0.06, 0.6, 0.015, 2), { x: 9.5, y: 0.37, z: 3.1 })
  for (const [lx, lz] of [[9.0, 2.85], [10.0, 2.85], [9.0, 3.35], [10.0, 3.35]]) B.add(M.boisSombre, new THREE.CylinderGeometry(0.026, 0.017, 0.34, 10), { x: lx, y: 0.17, z: lz })
  box(M.boisSombre, 9.5, 0.315, 2.85, 0.95, 0.05, 0.02); box(M.boisSombre, 9.5, 0.315, 3.35, 0.95, 0.05, 0.02)
  box(M.boisSombre, 9.0, 0.315, 3.1, 0.02, 0.05, 0.45); box(M.boisSombre, 10.0, 0.315, 3.1, 0.02, 0.05, 0.45)
  B.add(M.boisSombre, rounded(1.0, 0.025, 0.5, 0.008), { x: 9.5, y: 0.1, z: 3.1 })
  solid(8.95, 10.05, 2.8, 3.4)
  // étagère contre z = 7 : (11,2 ; 0,95 ; 6,82) 1,4 × 1,9 × 0,3, montants, planches et couronnement aux arêtes adoucies
  for (const x of [10.52, 11.88]) B.add(M.boisSombre, rounded(0.03, 1.9, 0.3, 0.008), { x, y: 0.95, z: 6.82 })
  box(M.boisSombre, 11.2, 0.95, 6.96, 1.4, 1.9, 0.015)
  for (const sy of [0.03, 0.5, 0.95, 1.4]) B.add(M.boisSombre, rounded(1.34, 0.03, 0.29, 0.006), { x: 11.2, y: sy, z: 6.82 })
  B.add(M.boisSombre, rounded(1.42, 0.04, 0.32, 0.012), { x: 11.2, y: 1.92, z: 6.815 })
  solid(10.5, 11.9, 6.67, 6.97)
  {
    // livres de toutes les couleurs (teintes de base, chaque livre un peu plus clair ou plus sombre), debout ; sur la
    // troisième planche, une pile de livres couchés ; un vase sur le couronnement
    const rnd = makeRnd(13), cols = [0x6a2a24, 0x2a3a52, 0x3a4a2e, 0x7a6248, 0x4a2a3a, 0x8a7a5a, 0x2e2e34, 0x5a3a22, 0xb4a484, 0x2a5656, 0x9a6230, 0x46506a]
    const color = () => new THREE.Color(cols[Math.floor(rnd() * cols.length)]).offsetHSL(0, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.07).getHex()
    for (const [sy, skip, end] of [[0.045, 0, 11.82], [0.515, 0.45, 11.82], [0.965, 0, 11.48], [1.415, 0.7, 11.82]]) {
      let x = 10.56
      while (x < end) {
        const bw = 0.025 + rnd() * 0.03, bh = 0.2 + rnd() * 0.16, bd = 0.17 + rnd() * 0.07
        if (skip && x > 10.56 + skip && x < 10.56 + skip + 0.32) { x += bw; continue }   // trous : ce qui est tombé
        const lean = rnd() < 0.08 ? 0.25 : 0
        B.add(M.livres, tint(new THREE.BoxGeometry(bw, bh, bd), color()), { x: x + bw / 2, y: sy + bh / 2, z: 6.95 - bd / 2 - 0.01, rz: lean })
        x += bw + 0.003
      }
    }
    let y = 0.965
    for (const [w, t, d] of [[0.26, 0.04, 0.19], [0.24, 0.035, 0.18], [0.25, 0.045, 0.17], [0.22, 0.03, 0.16]]) {
      B.add(M.livres, tint(new THREE.BoxGeometry(w, t, d), color()), { x: 11.64 + (rnd() - 0.5) * 0.02, y: y + t / 2, z: 6.94 - d / 2, ry: (rnd() - 0.5) * 0.12 })
      y += t
    }
    B.add(M.livres, tint(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 12), 0x3a5a5c), { x: 10.75, y: 2.02, z: 6.82 })
    B.add(M.livres, tint(new THREE.SphereGeometry(0.06, 12, 8), 0x3a5a5c), { x: 10.75, y: 1.99, z: 6.82, sy: 0.8 })
    // livres tombés au sol
    for (const [bx, bz, ry] of [[10.75, 6.25, 0.4], [11.55, 6.05, -0.9], [10.95, 5.95, 1.6]]) B.add(M.livres, tint(new THREE.BoxGeometry(0.16, 0.035, 0.24), color()), { x: bx, y: 0.018, z: bz, ry })
  }
  // fauteuil de velours, dans l'angle de la fenêtre, tourné vers la table basse : socle, coussin, accoudoirs roulés,
  // dossier un peu renversé et son coussin, pieds tournés ; parties placées dans le repère du fauteuil
  {
    const cx = 11.45, cz = 1.85, RY = -0.95, c = Math.cos(RY), s = Math.sin(RY)
    const at = (lx, y, lz, rx = 0) => ({ x: cx + lx * c + lz * s, y, z: cz - lx * s + lz * c, rx, ry: RY, order: 'YXZ' })
    B.add(M.velours, rounded(0.76, 0.24, 0.74, 0.03), at(0, 0.2, 0))
    B.add(M.velours, cushion(0.54, 0.14, 0.6), at(0, 0.38, 0.05))
    for (const lx of [-0.325, 0.325]) B.add(M.velours, rounded(0.11, 0.34, 0.74, 0.05, 2), at(lx, 0.43, 0))
    B.add(M.velours, rounded(0.76, 0.66, 0.14, 0.05), at(0, 0.59, -0.3, -0.12))
    B.add(M.velours, cushion(0.52, 0.14, 0.44), at(0, 0.66, -0.17, Math.PI / 2 - 0.12))
    for (const lx of [-0.3, 0.3]) for (const lz of [-0.3, 0.3]) B.add(M.boisSombre, new THREE.CylinderGeometry(0.02, 0.014, 0.08, 8), at(lx, 0.04, lz))
    solid(10.9, 12.0, 1.3, 2.4)
  }
  // une sansevière dans son pot de terre cuite, contre le mur, entre le canapé et le fauteuil : on la voit de tout le
  // salon (dans l'angle de la fenêtre, derrière le fauteuil, seules deux pointes de feuilles en dépassaient) ; ses
  // feuilles penchent vers la pièce, à peine vers le mur
  {
    const px = 10.85, pz = 1.32, rnd = makeRnd(59), POT = 0x8a4a30
    B.add(M.livres, tint(new THREE.CylinderGeometry(0.13, 0.1, 0.26, 16), POT), { x: px, y: 0.13, z: pz })
    B.add(M.livres, tint(new THREE.TorusGeometry(0.128, 0.014, 6, 16), POT), { x: px, y: 0.255, z: pz, rx: Math.PI / 2 })
    B.add(M.livres, tint(new THREE.CircleGeometry(0.12, 16), 0x2a1e16), { x: px, y: 0.235, z: pz, rx: -Math.PI / 2 })
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + rnd() * 0.5, dx = Math.cos(a), dz = -Math.sin(a), r0 = 0.02 + rnd() * 0.06
      const len = 0.42 + rnd() * 0.36, lean = (0.08 + rnd() * 0.16) * (dz < 0 ? 0.25 : 1)   // à peine vers le mur (−z)
      const leaf = new THREE.CapsuleGeometry(0.028, len, 2, 6).scale(1, 1, 0.22).translate(0, len / 2 + 0.028, 0)
      warp(leaf, (x, y, z) => { const t = Math.min(1, y / (len + 0.056)); return [x * (1 - 0.75 * t), y, z] })
      leaf.rotateY(rnd() * Math.PI).rotateZ(-lean).rotateY(a).translate(px + dx * r0, 0.22, pz + dz * r0)
      B.add(M.livres, tint(leaf, new THREE.Color(0x2c4a2a).offsetHSL(0, 0, (rnd() - 0.5) * 0.06).getHex()))
    }
    solid(px - 0.14, px + 0.14, pz - 0.14, pz + 0.14)
  }
  // deux vues de vacances au-dessus du canapé
  picture({ alongX: true, at: 1 + T / 2, n: 1 }, 8.9, 1.52, 0.52, 0.4, PIC.mer, 0.36, 0.27, M.boisSombre)
  picture({ alongX: true, at: 1 + T / 2, n: 1 }, 9.9, 1.52, 0.52, 0.4, PIC.lac, 0.36, 0.27, M.boisSombre)
  // ── radiateur en fonte : éléments à tranche arrondie, deux collecteurs, le tuyau qui sort du sol et son robinet ──
  // f : face du mur { alongX, at, n (vers la pièce) } ; de a0 à a1 le long du mur, de y0 à y1 ; pitch : pas visé d'un
  // élément au suivant ; valve : côté du robinet (-1 : a0, 1 : a1)
  function radiator(f, a0, a1, y0, y1, pitch, valve) {
    const P = (a, y, u) => f.alongX ? V(a, y, f.at + f.n * u) : V(f.at + f.n * u, y, a)
    const nIn = f.alongX ? V(0, 0, f.n) : V(f.n, 0, 0), along = new THREE.Vector3().crossVectors(nIn, UP)
    const D = 0.075, uc = 0.035 + D / 2, count = Math.max(2, Math.round((a1 - a0) / pitch)), p = (a1 - a0) / count, thk = p * 0.7
    const shape = roundedRect(D, y1 - y0, 0.03)
    for (let k = 0; k < count; k++) {
      const g = extrude(shape, thk).translate(0, 0, -thk / 2)
      B.add(M.blanc, g.applyMatrix4(new THREE.Matrix4().makeBasis(nIn, UP, along).setPosition(P(a0 + (k + 0.5) * p, (y0 + y1) / 2, uc))))
    }
    for (const y of [y0 + 0.05, y1 - 0.05]) B.add(M.blanc, rod(P(a0 + 0.01, y, uc), P(a1 - 0.01, y, uc), 0.016))
    const va = valve < 0 ? a0 - 0.035 : a1 + 0.035, end = valve < 0 ? a0 + 0.01 : a1 - 0.01, yt = y1 - 0.05
    B.add(M.blanc, rod(P(va, 0, uc), P(va, yt, uc), 0.011)); B.add(M.blanc, rod(P(va, yt, uc), P(end, yt, uc), 0.011))
    B.add(M.metal, rod(P(va, yt, uc), P(va, yt + 0.07, uc), 0.017, 10)); B.add(M.metal, rod(P(va, yt + 0.07, uc), P(va, yt + 0.095, uc), 0.024, 10))
  }

  // ── fenêtres : embrasure (tableaux peints), appui à nez arrondi, dormant, vantaux à petits bois, espagnolettes ──
  // o : l'ouverture ; n : côté de la pièce (+1 : coordonnées croissantes) ; bays : travées de deux vantaux ; handleY :
  // bas de la poignée. La menuiserie est posée au fond de l'embrasure, de 16 à 22 cm derrière la face du mur (les
  // tableaux prolongent l'épaisseur du mur jusqu'à 24 cm) ; la pluie, la ville et la lumière de la nuit sont derrière.
  function windowSet(o, n, bays, handleY) {
    const at = o.line + n * T / 2
    const P = (a, y, d) => o.alongX ? V(a, y, at - n * d) : V(at - n * d, y, a)   // d : profondeur derrière la face
    const lbox = (mat, a0, a1, y0, y1, d0, d1) => {
      const c = P((a0 + a1) / 2, (y0 + y1) / 2, (d0 + d1) / 2)
      if (o.alongX) box(mat, c.x, c.y, c.z, a1 - a0, y1 - y0, d1 - d0); else box(mat, c.x, c.y, c.z, d1 - d0, y1 - y0, a1 - a0)
    }
    const nIn = o.alongX ? V(0, 0, n) : V(n, 0, 0), th = 0.02, DL = 0.24, F = [0.16, 0.22], L = [0.155, 0.205]
    // tableaux, appui et bandeau sous son nez
    lbox(M.blanc, o.from, o.from + th, o.bottom, o.top, -0.005, DL); lbox(M.blanc, o.to - th, o.to, o.bottom, o.top, -0.005, DL)
    lbox(M.blanc, o.from, o.to, o.top - th, o.top, -0.005, DL)
    B.add(M.blanc, prism(P_APPUI, nIn, UP, P(o.from - 0.05, o.bottom, 0), P(o.to + 0.05, o.bottom, 0)))
    lbox(M.blanc, o.from - 0.03, o.to + 0.03, o.bottom - 0.05, o.bottom, -0.012, 0)
    // dormant, puis le vitrage dans son épaisseur
    const A0 = o.from + th, A1 = o.to - th, Y0 = o.bottom + 0.034, Y1 = o.top - th, fw = 0.05
    lbox(M.blanc, A0, A0 + fw, Y0, Y1, ...F); lbox(M.blanc, A1 - fw, A1, Y0, Y1, ...F)
    lbox(M.blanc, A0 + fw, A1 - fw, Y0, Y0 + fw, ...F); lbox(M.blanc, A0 + fw, A1 - fw, Y1 - fw, Y1, ...F)
    const a0 = A0 + fw, a1 = A1 - fw, y0 = Y0 + fw, y1 = Y1 - fw
    {
      const g = new THREE.PlaneGeometry(a1 - a0, y1 - y0)
      if (!o.alongX) g.rotateY(n < 0 ? -Math.PI / 2 : Math.PI / 2); else if (n < 0) g.rotateY(Math.PI)
      const c = P((a0 + a1) / 2, (y0 + y1) / 2, 0.19); g.translate(c.x, c.y, c.z); B.add(M.vitre, g)
    }
    // travées : un meneau entre deux ; deux vantaux chacune (montants, traverses, deux petits bois), battement, espagnolette
    const mw = 0.06, bw = (a1 - a0 - (bays - 1) * mw) / bays, st = 0.045
    for (let k = 0; k < bays; k++) {
      const b0 = a0 + k * (bw + mw), b1 = b0 + bw, mid = (b0 + b1) / 2
      if (k) lbox(M.blanc, b0 - mw, b0, y0, y1, ...F)
      for (const [l0, l1] of [[b0, mid], [mid, b1]]) {
        lbox(M.blanc, l0, l0 + st, y0, y1, ...L); lbox(M.blanc, l1 - st, l1, y0, y1, ...L)
        lbox(M.blanc, l0 + st, l1 - st, y0, y0 + 0.06, ...L); lbox(M.blanc, l0 + st, l1 - st, y1 - 0.05, y1, ...L)
        const g0 = y0 + 0.06, g1 = y1 - 0.05
        for (const f of [1 / 3, 2 / 3]) { const y = g0 + (g1 - g0) * f; lbox(M.blanc, l0 + st, l1 - st, y - 0.011, y + 0.011, 0.165, 0.2) }
      }
      lbox(M.blanc, mid - 0.014, mid + 0.014, y0 + 0.02, y1 - 0.02, 0.145, L[0])
      B.add(brass, rod(P(mid, y0 + 0.06, 0.138), P(mid, y1 - 0.06, 0.138), 0.006, 6))
      lbox(brass, mid - 0.01, mid + 0.01, handleY, handleY + 0.13, 0.125, 0.137)
    }
  }

  // ── rideaux : un plan plissé, plis serrés sous la tringle qui s'ouvrent vers le bas, ourlet ; tringle à anneaux ──
  function curtain(mat, cx, cz, w, y0, y1, alongZ, facing, seed) {
    const h = y1 - y0, rnd = makeRnd(seed), g = new THREE.PlaneGeometry(w, h, 40, 8), p = g.attributes.position
    const ph = rnd() * 6, folds = Math.max(4, Math.round(w / 0.11))
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / w + 0.5, v = p.getY(i) / h + 0.5   // de 0 à 1 : de gauche à droite, de bas en haut
      const k = u * folds * Math.PI * 2 + ph, amp = 0.022 + 0.014 * (1 - v)
      p.setZ(i, amp * Math.sin(k) + 0.006 * Math.sin(k * 2.3 + ph) + (v < 0.03 ? 0.006 : 0))
    }
    g.computeVertexNormals()
    if (alongZ) g.rotateY(facing < 0 ? -Math.PI / 2 : Math.PI / 2); else if (facing < 0) g.rotateY(Math.PI)
    g.translate(cx, (y0 + y1) / 2, cz)
    B.add(mat, g)
  }
  // barre de p0 à p1, embouts en boule, supports scellés au mur (paires [mur, barre]), anneaux aux points donnés
  function curtainRod(p0, p1, supports, rings) {
    B.add(M.metal, rod(p0, p1, 0.011))
    for (const q of [p0, p1]) B.add(M.metal, new THREE.SphereGeometry(0.022, 8, 6), { x: q.x, y: q.y, z: q.z })
    for (const [w, r] of supports) B.add(M.metal, rod(w, r, 0.006, 6))
    const alongX = Math.abs(p1.x - p0.x) > Math.abs(p1.z - p0.z)
    for (const q of rings) B.add(M.metal, new THREE.TorusGeometry(0.019, 0.0035, 3, 8), { x: q.x, y: q.y, z: q.z, ry: alongX ? Math.PI / 2 : 0 })
  }
  const ringsOver = (c, w, at) => { const m = Math.round(w / 0.1), r = []; for (let k = 0; k <= m; k++) r.push(at(c - w / 2 + k * w / m)); return r }

  // le salon : radiateur, baie à trois travées, rideaux sombres jusqu'au sol
  radiator({ alongX: false, at: 12.5 - T / 2, n: -1 }, 3.25, 4.75, 0.12, 0.72, 0.075, -1)
  solid(12.28, 12.44, 3.2, 4.8)
  windowSet(O.baie, -1, 3, 1.3)
  curtain(M.rideau, 12.34, 1.7, 0.7, 0.02, 2.45, true, -1, 41); curtain(M.rideau, 12.34, 6.3, 0.7, 0.02, 2.45, true, -1, 43)
  {
    const at = z => V(12.34, 2.47, z), wallAt = z => V(12.44, 2.47, z)
    curtainRod(at(1.22), at(6.78), [1.32, 4.0, 6.68].map(z => [wallAt(z), at(z)]), [...ringsOver(1.7, 0.7, at), ...ringsOver(6.3, 0.7, at)])
  }
  // chaise renversée près de l'arche, hors du passage (8,0 ; 6,65), sans collision ; siège et dossier aux arêtes adoucies
  {
    const c = new THREE.Group(), parts = []
    const leg = (x, z) => parts.push(new THREE.BoxGeometry(0.035, 0.45, 0.035).translate(x, 0.225, z))
    leg(-0.19, -0.19); leg(0.19, -0.19); leg(-0.19, 0.19); leg(0.19, 0.19)
    parts.push(indexed(rounded(0.44, 0.035, 0.44, 0.01)).translate(0, 0.46, 0))   // RoundedBoxGeometry n'est pas indexée
    parts.push(new THREE.BoxGeometry(0.035, 0.45, 0.035).translate(-0.19, 0.7, -0.19), new THREE.BoxGeometry(0.035, 0.45, 0.035).translate(0.19, 0.7, -0.19))
    parts.push(indexed(rounded(0.42, 0.14, 0.025, 0.008)).translate(0, 0.86, -0.2))
    const chair = mergeGeometries(parts); parts.forEach(p => p.dispose())
    c.rotation.set(-Math.PI / 2, -Math.PI / 2 + 0.35, 0, 'YXZ'); c.position.set(7.85, 0.22, 6.6); c.updateMatrix()
    chair.applyMatrix4(c.matrix); B.add(M.boisSombre, chair)
  }

  // ── la lampe sur pied renversée ──
  const lampBase = V(8.1, 0.16, 2.6), lampHead = V(8.3, 0.17, 3.95), lampDir = new THREE.Vector3().subVectors(lampHead, lampBase).normalize()
  B.add(M.metal, rod(lampBase, lampHead, 0.012))
  B.add(M.metal, between(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 24), lampBase.clone().addScaledVector(lampDir, -0.0125), lampBase.clone().addScaledVector(lampDir, 0.0125)))
  const aim = V(10.9, 0.32, 4.15)
  const shadeDir = new THREE.Vector3().subVectors(aim, lampHead).setY(0.02).normalize()
  const joint = lampHead.clone().add(V(0, 0.04, 0))
  const shadeEnd = joint.clone().addScaledVector(shadeDir, 0.28)
  // l'abat-jour plissé (18 plis), sa face intérieure, et son armature : un jonc à chaque ouverture, quatre rayons vers la douille
  const pleated = () => {
    const g = new THREE.CylinderGeometry(0.21, 0.08, 0.28, 36, 1, true), p = g.attributes.position
    for (let i = 0; i < p.count; i++) { const s = (i % 37) % 2 ? 0.94 : 1.03; p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s) }
    g.computeVertexNormals()
    return g
  }
  B.add(M.abatJour, between(pleated(), joint, shadeEnd))
  B.add(M.abatJourDedans, between(pleated().scale(0.985, 1, 0.985), joint, shadeEnd))
  for (const [at, r] of [[joint, 0.08], [shadeEnd, 0.21]]) {
    const ring = new THREE.TorusGeometry(r * 1.035, 0.0045, 5, 36)
    ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), shadeDir)); ring.translate(at.x, at.y, at.z)
    B.add(M.metal, ring)
  }
  { const u = new THREE.Vector3().crossVectors(shadeDir, V(0, 1, 0)).normalize(), w = new THREE.Vector3().crossVectors(u, shadeDir)
    const hub = joint.clone().addScaledVector(shadeDir, 0.035)
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; B.add(M.metal, rod(joint.clone().addScaledVector(u, Math.cos(a) * 0.078).addScaledVector(w, Math.sin(a) * 0.078), hub, 0.003, 5)) } }
  B.add(M.veilleuse, tint(new THREE.SphereGeometry(0.045, 12, 8), 0xfff0d6), { x: joint.x + shadeDir.x * 0.1, y: joint.y + shadeDir.y * 0.1, z: joint.z + shadeDir.z * 0.1 })
  const spot = new THREE.SpotLight(0xffa860, 24, 9, 0.8, 0.45, 2)
  spot.position.copy(joint).addScaledVector(shadeDir, 0.12)
  spot.target.position.copy(aim)
  spot.castShadow = true
  spot.shadow.mapSize.set(1024, 1024)
  spot.shadow.bias = -0.0006
  spot.shadow.normalBias = 0.02
  spot.shadow.camera.near = 0.05
  group.add(spot, spot.target)
  // lueur chaude au sol autour de l'abat-jour
  glows.push(tint(flat(1.3, 1.3, shadeEnd.x, 0.006, shadeEnd.z, 0, [0, 0.5, 0, 1]), 0x5a2e10))

  // ── fenêtres : la ville et la lumière de la nuit au sol ──
  { const g = new THREE.PlaneGeometry(64, 36); g.rotateY(-Math.PI / 2); g.translate(34, -1.5, 4); B.add(M.ville, g) }
  { const g = new THREE.PlaneGeometry(56, 32); g.translate(2.3, -1.5, -16); B.add(M.ville, g) }
  // la lumière de la nuit tombée des fenêtres au sol (fausse lumière, additive) : salon devant la baie, chambre au pied du lit
  glows.push(tint(flat(4.2, 2.1, 10.85, 0.005, 4.0, -Math.PI / 2, [0.5, 1, 0, 1]), 0x0e182c))
  glows.push(tint(flat(1.5, 1.1, 2.25, 0.008, 3.25, 0, [0.5, 0.5 + 2 / 6, 0, 1]), 0x0c1220))
  B.add(M.lueurs, mergeGeometries(glows)); glows.forEach(g => g.dispose())

  // ── couloir : tapis de passage (ourlet, franges), une gravure encadrée ──
  B.add(M.tapis, flat(3.0, 0.7, 2.7, 0.004, 5.15, 0, [0.1, 0.9, 0.2, 0.8]))
  rugEdges(1.2, 4.2, 4.8, 5.5, 67)
  picture({ alongX: true, at: 5.8 - T / 2, n: -1 }, 3.3, 1.55, 0.46, 0.6, PIC.voilier, 0.27, 0.36, M.boisSombre)

  // ── chambre de la petite ──
  // lit (2,3 ; 0,2 ; 1,75) 0,95 × 0,4 × 1,8 : tête et pied aux arêtes arrondies, longerons, matelas, oreiller bombé, couette
  // moelleuse qui tombe sur les côtés, son revers sous l'oreiller
  B.add(M.boisClair, rounded(0.95, 0.76, 0.05, 0.02), { x: 2.3, y: 0.4, z: 0.93 })
  B.add(M.boisClair, rounded(0.95, 0.52, 0.05, 0.02), { x: 2.3, y: 0.28, z: 2.68 })
  for (const x of [1.845, 2.755]) B.add(M.boisClair, rounded(0.04, 0.16, 1.7, 0.012), { x, y: 0.2, z: 1.805 })
  B.add(M.blanc, rounded(0.88, 0.14, 1.7, 0.035), { x: 2.3, y: 0.31, z: 1.805 })
  B.add(M.blanc, cushion(0.56, 0.13, 0.32, 0.75, 0.3), { x: 2.3, y: 0.435, z: 1.13, rx: -0.12 })   // oreiller
  B.add(M.tissuRose, duvet(2.3, 1.4, 2.64, 0.44, 0.38, 0.25, 71))
  B.add(M.tissuRose, cushion(0.98, 0.07, 0.2, 0.6, 0.15), { x: 2.3, y: 0.43, z: 1.42 })           // revers de la couette
  solid(1.82, 2.78, 0.86, 2.71)
  // table de chevet : un tiroir et son bouton
  B.add(M.boisClair, rounded(0.38, 0.5, 0.34, 0.015, 2), { x: 3.05, y: 0.25, z: 1.1 }); solid(2.86, 3.24, 0.93, 1.27)
  B.add(M.boisClair, rounded(0.32, 0.13, 0.012, 0.004), { x: 3.05, y: 0.37, z: 1.276 })
  B.add(brass, new THREE.SphereGeometry(0.011, 10, 6), { x: 3.05, y: 0.37, z: 1.29 })
  // coffre à jouets, couvercle entrouvert
  B.add(M.boisClair, rounded(0.7, 0.39, 0.42, 0.02), { x: 1.0, y: 0.195, z: 3.9 })
  B.add(M.boisClair, rounded(0.72, 0.03, 0.44, 0.012), { x: 1.0, y: 0.41, z: 3.9, rx: -0.03 }); solid(0.62, 1.38, 3.66, 4.14)
  // tapis rond, son bord roulé
  B.add(M.tissuRose, new THREE.CircleGeometry(0.8, 32), { x: 2.4, y: 0.004, z: 2.9, rx: -Math.PI / 2 })
  B.add(M.tissuRose, new THREE.TorusGeometry(0.8, 0.005, 4, 48), { x: 2.4, y: 0.003, z: 2.9, rx: Math.PI / 2 })
  {   // cubes de bois aux arêtes adoucies
    const rnd = makeRnd(19), cols = [0xd04848, 0x3a78c0, 0xe0b030, 0x48a060]
    for (let i = 0; i < 6; i++) B.add(M.livres, tint(rounded(0.06, 0.06, 0.06, 0.008), cols[i % 4]), { x: 1.35 + rnd() * 0.5, y: 0.03, z: 3.4 + rnd() * 0.35, ry: rnd() * 2 })
    B.add(M.livres, tint(rounded(0.06, 0.06, 0.06, 0.008), 0xe0b030), { x: 1.0, y: 0.456, z: 3.85, ry: 0.4 })
  }
  // son dessin, encadré au mur
  picture({ alongX: false, at: 4.5 - T / 2, n: -1 }, 2.2, 1.3, 0.44, 0.35, PIC.dessin, 0.36, 0.27, M.boisClair, 0.02, 0.018)
  // fenêtre de la chambre, à deux vantaux ; rideaux roses sur leur tringle ; un petit radiateur sous la fenêtre, à gauche
  // du lit (la tête du lit est contre l'allège)
  windowSet(O.fenetre, 1, 1, 1.45)
  curtain(M.tissuRose, 1.1, 0.96, 0.55, 0.9, 2.4, false, 1, 47); curtain(M.tissuRose, 3.5, 0.96, 0.55, 0.9, 2.4, false, 1, 53)
  {
    const at = x => V(x, 2.42, 0.96), wallAt = x => V(x, 2.42, 0.8 + T / 2)
    curtainRod(at(0.72), at(3.88), [0.82, 2.3, 3.78].map(x => [wallAt(x), at(x)]), [...ringsOver(1.1, 0.55, at), ...ringsOver(3.5, 0.55, at)])
  }
  radiator({ alongX: true, at: 0.8 + T / 2, n: 1 }, 1.46, 1.76, 0.15, 0.6, 0.055, -1)
  solid(1.38, 1.8, 0.86, 0.98)
  // veilleuse en étoile sur la table de chevet
  {
    const star = new THREE.Shape(), R = 0.065, r = 0.028
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; if (i) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) }
    const sg = new THREE.ShapeGeometry(star); sg.translate(3.05, 0.58, 1.1)
    const sb = new THREE.ShapeGeometry(star); sb.rotateY(Math.PI); sb.translate(3.05, 0.58, 1.098)
    B.add(M.veilleuse, tint(sg, 0xffc4d6)); B.add(M.veilleuse, tint(sb, 0xffc4d6))
    box(M.blanc, 3.05, 0.51, 1.1, 0.07, 0.02, 0.05)
  }
  const nightlight = new THREE.PointLight(0xffc4d4, 0.9, 4.5, 2); nightlight.position.set(3.05, 0.62, 1.25); group.add(nightlight)

  // ── lumières d'ambiance (sans ombre) ──
  // nuit bleue : un ciel froid qui tombe des fenêtres, un sol presque noir (les volumes se lisent sans source visible)
  const ambient = new THREE.HemisphereLight(0x46587e, 0x2c2c38, 7.5); group.add(ambient)
  const moon = new THREE.DirectionalLight(0x6f86b8, 0.3); moon.position.set(20, 14, 4); moon.target.position.set(8, 0, 4); group.add(moon, moon.target)

  // ── pluie : un seul THREE.Points, deux volumes (devant la ville du salon et devant celle de la chambre) ──
  const DROPS = 700, rain = new Float32Array(DROPS * 3), speed = new Float32Array(DROPS)
  {
    const rnd = makeRnd(11)
    for (let i = 0; i < DROPS; i++) {
      const salon = i < DROPS * 0.68
      rain[i * 3] = salon ? 12.7 + rnd() * 2.8 : 1 + rnd() * 2.6
      rain[i * 3 + 1] = rnd() * 4.5
      rain[i * 3 + 2] = salon ? 1.5 + rnd() * 5 : -2.5 + rnd() * 3.1
      speed[i] = 6 + rnd() * 2
    }
  }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rain, 3))
  const T_drop = tex(32, 32, drawDrop)
  const rainMat = new THREE.PointsMaterial({ color: 0xaabbdd, size: 0.2, map: T_drop, transparent: true, opacity: 0.6, depthWrite: false, fog: false })
  owned.mats.push(rainMat)
  const rainPts = new THREE.Points(rainGeo, rainMat); rainPts.frustumCulled = false; group.add(rainPts)

  // ── les objets d'indice : un groupe chacun, matériaux clonés à lui seul ──
  function target(id, ax, az) {
    const t = new THREE.Group(); t.name = id; t.userData.clueId = id
    group.add(t); targets.push(t); anchors[id] = { x: ax, z: az }
    const TB = createBatcher()
    // matériau cloné, à cet indice seul ; pas d'ombre portée (seul le drap en projette une : budget de la passe d'ombre)
    const mat = (base, extra = {}) => { const m = base.clone(); Object.assign(m, extra); m.userData.cast = false; owned.mats.push(m); return m }
    return { t, TB, mat, done() { TB.finish(t) } }
  }
  // volume de visée invisible, plus généreux que l'objet (petits objets) ; matériau à lui, avec émissif
  function proxy(tg, cx, cy, cz, w, h, d) {
    const m = new THREE.MeshLambertMaterial(); owned.mats.push(m)
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); p.position.set(cx, cy, cz); p.visible = false; tg.t.add(p)
  }

  // 1. la serrure : montant côté gâche arraché, gâche pendante, éclats, copeaux devant la porte
  {
    const tg = target('serrure', 6.45, 7.0), rnd = makeRnd(29)
    const jamb = tg.mat(M.boisSombre), raw = tg.mat(M.boisClair, { color: new THREE.Color(0xc9a476), emissive: new THREE.Color(0x24180c) }), steel = tg.mat(M.metal, { color: new THREE.Color(0x9a9ea6) })
    raw.userData.baseEmissive = 0x24180c
    const lit = tg.mat(M.portePalier); lit.userData.baseEmissive = 0x6a7a66; neonLit.push([lit, 0.6])   // face palier du montant
    const fw = 0.06, fd = T + 0.03
    // montant arraché au pied-de-biche sur 60 cm (serrure trois points : deux gâches), bois mis à nu et éclats
    tg.TB.box(jamb, 6.45 + fw / 2, 0.45, 7, fw, 0.9, fd); tg.TB.box(jamb, 6.45 + fw / 2, 1.785, 7, fw, 0.53, fd)
    for (const [cy, h] of [[0.45, 0.9], [1.785, 0.53]]) { const g = new THREE.BoxGeometry(fw, h, 0.004); g.translate(6.45 + fw / 2, cy, 7 + fd / 2 + 0.002); tg.TB.add(lit, heightUV(g)) }
    tg.TB.box(jamb, 6.495, 1.21, 7 - fd / 2 + 0.02, 0.03, 0.62, 0.04)                                          // ce qui reste du montant côté entrée
    tg.TB.box(raw, 6.48, 1.21, 7.01, 0.03, 0.62, fd * 0.7)                                                      // bois mis à nu
    for (let i = 0; i < 22; i++) {                                                                             // éclats arrachés
      const y = 0.9 + rnd() * 0.62, toLanding = i % 3 === 0
      tg.TB.box(raw, toLanding ? 6.465 + rnd() * 0.04 : 6.448 + rnd() * 0.012, y, toLanding ? 7.075 + rnd() * 0.012 : 7 + (rnd() - 0.5) * 0.12,
        toLanding ? 0.014 : 0.006, 0.03 + rnd() * 0.08, toLanding ? 0.006 : 0.014, { rz: (rnd() - 0.5) * 0.7, ry: (rnd() - 0.5) * 0.5, rx: (rnd() - 0.5) * 0.4 })
    }
    tg.TB.box(steel, 6.442, 1.02, 7.03, 0.004, 0.18, 0.026, { rz: 0.4, rx: 0.25 })                             // gâche pendante
    tg.TB.box(steel, 6.446, 1.43, 7.0, 0.004, 0.16, 0.026, { rz: -0.22 })                                      // seconde gâche, de travers
    tg.TB.box(steel, 6.45, 1.13, 7.035, 0.006, 0.012, 0.012); tg.TB.box(steel, 6.452, 0.92, 6.99, 0.006, 0.012, 0.012); tg.TB.box(steel, 6.45, 1.5, 7.0, 0.006, 0.012, 0.012)   // vis arrachées
    for (let i = 0; i < 9; i++) {                                                                              // copeaux au sol
      const inside = i < 4
      tg.TB.box(raw, 6.1 + rnd() * 0.45, 0.004, inside ? 6.75 + rnd() * 0.2 : 7.12 + rnd() * 0.3, 0.015 + rnd() * 0.03, 0.006, 0.05 + rnd() * 0.07, { ry: rnd() * 3 })
    }
    proxy(tg, 6.46, 1.2, 7.0, 0.16, 0.8, 0.26)
    tg.done()
  }

  // 2. la lutte dans l'entrée : porte-manteau couché, veste au sol, vase en éclats
  {
    const tg = target('lutte', 6.85, 5.75), rnd = makeRnd(37)
    const wood = tg.mat(M.boisSombre, { color: new THREE.Color(0x6a4a32) }), coat = tg.mat(M.tissu, { color: new THREE.Color(0x4a5238) }), china = tg.mat(M.blanc, { color: new THREE.Color(0xc8d4e0) })
    // comme la lampe : le socle reste perpendiculaire au pied, posé sur la tranche (son centre à hauteur de son rayon)
    const base = V(7.22, 0.172, 6.72), tip = V(6.32, 0.03, 5.18), dir = new THREE.Vector3().subVectors(tip, base).normalize()
    tg.TB.add(wood, rod(base, tip, 0.016))
    tg.TB.add(wood, between(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20), base.clone().addScaledVector(dir, -0.012), base.clone().addScaledVector(dir, 0.018)))
    const side = V(-dir.z, 0, dir.x)
    for (const k of [-1, 1]) for (const up of [0, 1]) {   // patères
      const at = tip.clone().addScaledVector(dir, -0.08 - up * 0.05)
      tg.TB.add(wood, rod(at, at.clone().addScaledVector(side, k * 0.14).add(V(0, up ? 0.06 : 0.02, 0)).addScaledVector(dir, -0.04), 0.008, 6))
    }
    // veste froissée
    tg.TB.box(coat, 6.68, 0.025, 5.45, 0.5, 0.045, 0.62, { ry: 0.5 })
    tg.TB.box(coat, 6.45, 0.03, 5.7, 0.42, 0.04, 0.3, { ry: 1.3, rz: 0.1 })
    tg.TB.box(coat, 6.92, 0.02, 5.22, 0.13, 0.035, 0.5, { ry: -0.4 })
    tg.TB.box(coat, 6.62, 0.05, 5.42, 0.28, 0.03, 0.2, { ry: 0.6, rx: 0.15 })
    // vase brisé
    tg.TB.add(china, new THREE.CylinderGeometry(0.07, 0.055, 0.08, 14), { x: 7.18, y: 0.035, z: 6.05, rz: 1.35, ry: 0.4 })
    for (let i = 0; i < 7; i++) tg.TB.box(china, 6.95 + rnd() * 0.45, 0.006, 5.75 + rnd() * 0.6, 0.03 + rnd() * 0.05, 0.008, 0.02 + rnd() * 0.04, { ry: rnd() * 3, rx: (rnd() - 0.5) * 0.4 })
    proxy(tg, 6.8, 0.07, 5.95, 1.0, 0.14, 1.6)   // tout le désordre au sol se vise (le pied du porte-manteau ne fait que 3 cm)
    tg.done()
  }

  // 3. elles : deux formes sous un drap (champ de hauteur drapé), sang qui l'imbibe, flaque et traînée vers l'arche
  {
    const tg = target('corps', 10.6, 4.8)
    // on ne marche pas sur elles : passages libres vers la table (0,7 m), l'étagère (1,17 m) et le radiateur (0,68 m)
    solid(9.7, 11.6, 4.1, 5.5)
    // silhouettes (capsules en plan : a → b, rayon, hauteur) — l'adulte la tête vers la fenêtre, la petite contre elle
    const parts = [
      [11.36, 4.6, 11.36, 4.6, 0.11, 0.19], [11.08, 4.6, 10.64, 4.6, 0.21, 0.22],
      [11.05, 4.37, 10.52, 4.38, 0.055, 0.12], [11.05, 4.83, 10.52, 4.82, 0.055, 0.12],
      [10.56, 4.52, 9.99, 4.53, 0.08, 0.14], [10.56, 4.68, 9.99, 4.69, 0.08, 0.14],
      [9.94, 4.52, 9.94, 4.52, 0.055, 0.2], [9.94, 4.7, 9.94, 4.7, 0.055, 0.2],
    ]
    {   // la petite, couchée en biais, la tête contre l'épaule de sa mère : les deux formes s'écartent vers les pieds
      const hx = 11.06, hz = 5.14, ux = -0.958, uz = 0.286, vx = 0.286, vz = 0.958, at = (a, b = 0) => [hx + ux * a + vx * b, hz + uz * a + vz * b]
      const seg = (a0, b0, a1, b1, r, h) => parts.push([...at(a0, b0), ...at(a1, b1), r, h])
      seg(0, 0, 0, 0, 0.085, 0.16); seg(0.15, 0, 0.45, 0, 0.13, 0.17)
      for (const side of [-0.065, 0.065]) { seg(0.5, side, 0.86, side, 0.05, 0.11); seg(0.9, side, 0.9, side, 0.045, 0.16) }
    }
    const X0 = 9.78, Z0 = 4.19, W = 1.82, D = 1.38, NX = 62, NZ = 48
    const hAt = (x, z) => {
      let h = 0
      for (const [ax, az, bx, bz, r, hh] of parts) {
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz
        const t = l2 ? clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1) : 0
        const d = Math.hypot(x - ax - t * vx, z - az - t * vz) / r
        if (d < 1) h = Math.max(h, 1.3 * hh * Math.pow(1 - d * d, 0.42))
      }
      return h
    }
    const n = (NX + 1) * (NZ + 1), hf = new Float32Array(n), dx = W / NX, dz = D / NZ
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) hf[j * (NX + 1) + i] = hAt(X0 + i * dx, Z0 + j * dz)
    // le tissu tombe en pente douce depuis les formes et fait pont entre elles (transformée de distance chanfreinée)
    const slope = 1.25, dd = Math.hypot(dx, dz)
    const relax = (i, j, ni, nj, cost) => { if (ni < 0 || nj < 0 || ni > NX || nj > NZ) return; const a = j * (NX + 1) + i, b = nj * (NX + 1) + ni; if (hf[b] - cost > hf[a]) hf[a] = hf[b] - cost }
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) { relax(i, j, i - 1, j, slope * dx); relax(i, j, i, j - 1, slope * dz); relax(i, j, i - 1, j - 1, slope * dd); relax(i, j, i + 1, j - 1, slope * dd) }
      for (let j = NZ; j >= 0; j--) for (let i = NX; i >= 0; i--) { relax(i, j, i + 1, j, slope * dx); relax(i, j, i, j + 1, slope * dz); relax(i, j, i + 1, j + 1, slope * dd); relax(i, j, i - 1, j + 1, slope * dd) }
    }
    for (let k = 0; k < 2; k++) {   // adoucir
      const c = hf.slice()
      for (let j = 1; j < NZ; j++) for (let i = 1; i < NX; i++) { let s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += c[(j + b) * (NX + 1) + i + a]; hf[j * (NX + 1) + i] = s / 9 }
    }
    const sheet = new THREE.PlaneGeometry(W, D, NX, NZ)
    sheet.rotateX(-Math.PI / 2)   // (x, y) → (x, 0, −y) : la rangée j = 0 est en z = Z0
    const p = sheet.attributes.position, rnd = makeRnd(43)
    const waves = Array.from({ length: 5 }, () => ({ a: rnd() * Math.PI, f: 9 + rnd() * 16, ph: rnd() * 6, amp: 0.003 + rnd() * 0.004 }))
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const k = j * (NX + 1) + i
      let x = X0 + i * dx, z = Z0 + j * dz
      let y = hf[k]
      const m = smooth(0.0, 0.05, y) * (0.6 + 1.4 * smooth(0.06, 0.2, y))   // plis plus marqués là où le tissu est tendu
      for (const w of waves) y += m * w.amp * Math.sin((Math.cos(w.a) * x + Math.sin(w.a) * z) * w.f + w.ph)
      y += (1 - smooth(0.0, 0.05, hf[k])) * 0.007 * Math.max(0, Math.sin(x * 7.3 + z * 4.1 + 1.7) * Math.sin(x * 2.9 - z * 8.3))   // plis du tissu posé au sol
      // coins arrondis : le drap n'est pas un rectangle tiré au cordeau
      const cu = Math.abs(2 * i / NX - 1), cv = Math.abs(2 * j / NZ - 1), corner = Math.pow(cu * cv, 4)
      x += (X0 + W / 2 - x) * corner * 0.07; z += (Z0 + D / 2 - z) * corner * 0.1
      // bord du drap : ondulé (et non dentelé), un ourlet à peine relevé
      const edge = i === 0 || j === 0 || i === NX || j === NZ, along = (i === 0 || i === NX) ? z * 1.0 + i : x * 1.0 + j
      const wob = edge ? 0.035 * Math.sin(along * 9 + 1.3) + 0.018 * Math.sin(along * 23 + 0.4) + 0.01 : 0
      p.setXYZ(k, x + (i === 0 ? -wob : i === NX ? wob : 0), Math.max(0.006, y) + (edge ? 0.006 : 0), z + (j === 0 ? -wob : j === NZ ? wob : 0))
    }
    sheet.computeVertexNormals()
    const SW = 512, SH = Math.round(512 * D / W)
    const px = x => (x - X0) / W * SW, pz = z => (z - Z0) / D * SH
    const T_sheet = tex(SW, SH, (g, w, h) => drawSheet(g, w, h, [
      { x: px(11.02), y: pz(4.6), r: 58, n: 7 }, { x: px(10.83), y: pz(5.21), r: 34, n: 5 }, { x: px(10.7), y: pz(4.28), r: 26, n: 4 },
    ]))
    const drap = tg.mat(M.blanc, { color: new THREE.Color(0xb9b1a4), map: T_sheet })
    drap.userData.cast = true
    tg.TB.add(drap, sheet)
    // flaque (moitié gauche de la texture) sous le drap, qui en déborde ; traînée (moitié droite) vers l'arche
    const BX0 = 9.3, BZ0 = 3.55, BW = 2.6, BD = 2.4, bx = x => (x - BX0) / BW * 512, bz = z => (z - BZ0) / BD * 512, br = r => r / BW * 512
    const T_blood = tex(1024, 512, (g, w, h) => drawBlood(g, w, h, [
      { x: bx(10.9), y: bz(4.75), r: br(0.5), n: 8 }, { x: bx(10.25), y: bz(3.98), r: br(0.38), n: 7 },
      { x: bx(11.72), y: bz(4.55), r: br(0.2), n: 4 }, { x: bx(10.7), y: bz(5.62), r: br(0.24), n: 5 }, { x: bx(9.85), y: bz(4.95), r: br(0.16), n: 3 },
    ]))
    // Phong : un reflet humide maîtrisé (en Standard, la lune y faisait soit un voile rose, soit un point blanc éblouissant)
    const blood = new THREE.MeshPhongMaterial({ map: T_blood, transparent: true, specular: 0x4a2a24, shininess: 70, depthWrite: false })
    owned.mats.push(blood)
    const trailFrom = V(9.78, 0, 4.72), trailTo = V(8.62, 0, 5.32)
    const tl = trailFrom.distanceTo(trailTo), tAng = Math.atan2(-(trailTo.z - trailFrom.z), trailTo.x - trailFrom.x)
    const bg = mergeGeometries([
      flat(BW, BD, BX0 + BW / 2, 0.0035, BZ0 + BD / 2, 0, [0, 0.5, 0, 1]),
      flat(tl, 0.6, (trailFrom.x + trailTo.x) / 2, 0.0032, (trailFrom.z + trailTo.z) / 2, tAng + Math.PI, [0.5, 1, 0, 1]).translate(0, 0.0005, 0),
    ])
    const bm = new THREE.Mesh(bg, blood); bm.receiveShadow = true; bm.renderOrder = 1; tg.t.add(bm)
    // volume de visée (et cadre de la photo) sur les taches et la flaque : sans lui, la boîte de ce qui se voit compte
    // tout le quad du sang (2,6 × 2,4 m, jusque sous les pieds de Viktor) et la photo cadrait la fenêtre plutôt qu'elles
    proxy(tg, 10.8, 0.15, 4.8, 1.0, 0.3, 1.0)
    tg.done()
  }

  // 4. la photo : cadre tombé devant l'étagère, verre fêlé, éclats autour
  {
    const tg = target('photo', 11.0, 6.3), rnd = makeRnd(53)
    const wood = tg.mat(M.boisSombre)
    const T_photo = tex(512, 360, drawPhoto)
    const pic = tg.mat(M.blanc, { color: new THREE.Color(0xffffff), map: T_photo })
    const glass = new THREE.MeshStandardMaterial({ color: 0xdfe8f4, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0.2 }); owned.mats.push(glass)
    const ry = -11 * DEG, c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [11.0 + lx * c + lz * s, 6.3 - lx * s + lz * c]
    for (const [lx, lz, w, d] of [[0, -0.105, 0.32, 0.03], [0, 0.105, 0.32, 0.03], [-0.145, 0, 0.03, 0.24], [0.145, 0, 0.03, 0.24]]) {
      const [x, z] = at(lx, lz); tg.TB.box(wood, x, 0.012, z, w, 0.024, d, { ry })
    }
    tg.TB.add(pic, flat(0.27, 0.19, 11.0, 0.016, 6.3, ry))
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, r = 0.2 + rnd() * 0.22
      const g = new THREE.CircleGeometry(0.02 + rnd() * 0.03, 3); g.rotateX(-Math.PI / 2); g.rotateY(rnd() * 6); g.translate(11.0 + Math.cos(a) * r, 0.003, 6.3 + Math.sin(a) * r * 0.7)
      tg.TB.add(glass, g)
    }
    proxy(tg, 11.0, 0.05, 6.3, 0.48, 0.1, 0.4)
    tg.done()
  }

  // 5. le mot sur la table basse
  {
    const tg = target('mot', 9.6, 3.05)
    const T_note = tex(384, 274, drawNote)
    const paper = tg.mat(M.blanc, { color: new THREE.Color(0xffffff), map: T_note })
    tg.TB.add(paper, flat(0.21, 0.15, 9.6, 0.405, 3.05, 0.12))
    proxy(tg, 9.6, 0.43, 3.05, 0.3, 0.06, 0.24)
    tg.done()
  }

  // 6. le doudou : lapin couché sur le flanc au pied du lit (2,1 ; 0,07 ; 3,3)
  {
    const tg = target('doudou', 2.1, 3.3)
    // couché sur le flanc, axe long selon x local : corps, tête, museau, deux longues oreilles (dedans rose), pattes, queue, yeux, nœud
    const plush = tg.mat(M.livres)
    const BODY = 0xd8c6b2, PINK = 0xe0a0ac, DARK = 0x1a1414, BOW = 0xa8303c
    const S = (r, w, hh) => new THREE.SphereGeometry(r, w, hh)
    const ear = (a, b) => tint(between(new THREE.CapsuleGeometry(0.024, a.distanceTo(b), 4, 10).scale(1, 1, 0.45), a, b), BODY)
    const parts = [
      tint(S(1, 16, 12).scale(0.1, 0.058, 0.072).translate(0, 0.058, 0), BODY),
      tint(S(0.064, 16, 12).translate(0.13, 0.062, 0.005), BODY),
      tint(S(0.03, 10, 8).translate(0.185, 0.056, 0.025), BODY),
      ear(V(0.16, 0.05, -0.035), V(0.34, 0.025, -0.08)), ear(V(0.16, 0.1, -0.01), V(0.33, 0.115, 0.06)),
      tint(between(new THREE.CapsuleGeometry(0.012, 0.13, 3, 8).scale(1, 1, 0.4), V(0.2, 0.026, -0.068), V(0.31, 0.031, -0.086)), PINK),
      tint(between(new THREE.CapsuleGeometry(0.012, 0.12, 3, 8).scale(1, 1, 0.4), V(0.2, 0.124, 0.024), V(0.3, 0.131, 0.06)), PINK),
      tint(between(new THREE.CapsuleGeometry(0.022, 0.06, 3, 8), V(0.06, 0.05, 0.06), V(0.11, 0.03, 0.12)), BODY),
      tint(between(new THREE.CapsuleGeometry(0.026, 0.07, 3, 8), V(-0.05, 0.045, 0.05), V(-0.02, 0.03, 0.13)), BODY),
      tint(between(new THREE.CapsuleGeometry(0.026, 0.07, 3, 8), V(-0.06, 0.02, -0.04), V(-0.03, 0.018, -0.12)), BODY),
      tint(S(0.026, 10, 8).translate(-0.105, 0.06, 0), BODY),
      tint(S(0.008, 8, 6).translate(0.165, 0.09, 0.045), DARK), tint(S(0.007, 8, 6).translate(0.205, 0.062, 0.05), DARK),
      tint(S(0.018, 10, 8).scale(1.3, 1, 0.7).translate(0.085, 0.095, 0.04), BOW), tint(S(0.018, 10, 8).scale(1.3, 1, 0.7).translate(0.085, 0.07, 0.07), BOW),
    ]
    const g = mergeGeometries(parts); parts.forEach(q => q.dispose())
    tg.TB.add(plush, g, { x: 2.08, y: 0, z: 3.32, ry: 0.75 })
    proxy(tg, 2.12, 0.08, 3.3, 0.38, 0.16, 0.36)
    tg.done()
  }

  // le téléphone sur la console (4,78 ; 0,855 ; 6,2)
  {
    const tg = target('telephone', 4.78, 6.2)
    const body = tg.mat(M.metal, { color: new THREE.Color(0x24262c) })
    const screen = tg.mat(M.metal, { color: new THREE.Color(0x05070a), emissive: new THREE.Color(0x0b1220), emissiveIntensity: 3 })
    screen.userData.baseEmissive = 0x0b1220
    phoneScreen = screen
    tg.TB.box(body, 4.78, 0.845, 6.2, 0.075, 0.01, 0.155, { ry: 0.08 })
    tg.TB.add(screen, flat(0.066, 0.142, 4.78, 0.8505, 6.2, 0.08))
    proxy(tg, 4.78, 0.88, 6.2, 0.16, 0.08, 0.24)
    tg.done()
  }

  // ── interrupteurs (près des portes, côté poignée, à 1,1 m) et prises (à 28 cm) : plaques sur la face d'un mur ──
  function plate(f, a, y, outlet = false) {
    const at = u => f.alongX ? [a, y, f.at + f.n * u] : [f.at + f.n * u, y, a]
    const bx = (mat, w, h, u0, u1, da = 0) => { const [x, yy, z] = at((u0 + u1) / 2); if (f.alongX) box(mat, x + da, yy, z, w, h, u1 - u0); else box(mat, x, yy, z + da, u1 - u0, h, w) }
    bx(M.blanc, 0.08, 0.08, 0, 0.009)
    if (!outlet) { bx(M.blanc, 0.026, 0.04, 0.009, 0.014); return }
    const [x, yy, z] = at(0.0095)   // le puits de la prise et ses deux trous
    B.add(M.metal, new THREE.CylinderGeometry(0.021, 0.021, 0.001, 16), { x, y: yy, z, rx: f.alongX ? Math.PI / 2 : 0, rz: f.alongX ? 0 : Math.PI / 2 })
    for (const d of [-0.0095, 0.0095]) bx(M.miroir, 0.006, 0.006, 0.0098, 0.0102, d)
  }
  plate({ alongX: true, at: 7 - T / 2, n: -1 }, 6.66, 1.1)            // entrée, à côté de la porte palière
  plate({ alongX: false, at: 7.5 + T / 2, n: 1 }, 4.72, 1.1)          // salon, à côté de l'arche
  plate({ alongX: true, at: 5.8 - T / 2, n: -1 }, 1.26, 1.1)          // couloir, à côté de la porte des parents
  plate({ alongX: true, at: 4.5 - T / 2, n: -1 }, 1.78, 1.1)          // chambre, à côté de sa porte
  plate({ alongX: true, at: 4.5 + T / 2, n: 1 }, 7.1, 0.28, true)     // entrée
  plate({ alongX: true, at: 1 + T / 2, n: 1 }, 7.85, 0.28, true)      // salon, au bout du canapé
  plate({ alongX: true, at: 5.8 - T / 2, n: -1 }, 3.95, 0.28, true)   // couloir
  plate({ alongX: true, at: 0.8 + T / 2, n: 1 }, 3.42, 0.28, true)    // chambre, près de la veilleuse

  // ── luminaires, éteints (aucune lumière de plus) : suspension à globe opalin sous une rosace (salon), plafonniers
  // (entrée, couloir), lanterne de papier rose (chambre) ──
  {
    // rosace en relief (d'en dessous, un disque presque plat se lisait comme une tache unie) : bouton central, gorge,
    // anneau en tore, champ, grand tore, ressaut ; leurs flancs prennent la lumière du ciel et de la lune, pas leurs fonds
    const rose = lathe([[0, -0.05], [0.026, -0.05], [0.036, -0.044], [0.04, -0.03], [0.052, -0.024],
      [0.066, -0.03], [0.078, -0.034], [0.09, -0.03], [0.1, -0.022], [0.135, -0.02],
      [0.152, -0.03], [0.17, -0.038], [0.188, -0.034], [0.2, -0.022], [0.21, -0.012], [0.232, -0.008], [0.245, 0]], 24)
    B.add(M.blanc, rose, { x: 10.0, y: H, z: 4.0 })
    B.add(M.metal, new THREE.CylinderGeometry(0.035, 0.045, 0.03, 12), { x: 10.0, y: H - 0.063, z: 4.0 })   // cache-piton, sous le bouton
    B.add(M.metal, rod(V(10.0, H - 0.076, 4.0), V(10.0, 2.11, 4.0), 0.004, 6))                             // fil
    B.add(M.metal, new THREE.CylinderGeometry(0.03, 0.04, 0.04, 12), { x: 10.0, y: 2.1, z: 4.0 })           // douille
    B.add(M.blanc, new THREE.SphereGeometry(0.14, 18, 12), { x: 10.0, y: 1.97, z: 4.0 })                    // globe
    for (const [x, z, r] of [[6.0, 5.75, 0.17], [2.5, 5.15, 0.13]]) {
      B.add(M.metal, new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.012, 20), { x, y: H - 0.006, z })
      B.add(M.blanc, new THREE.SphereGeometry(r, 18, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { x, y: H - 0.012, z, sy: 0.45 })
    }
    B.add(M.metal, rod(V(2.5, H, 2.65), V(2.5, 2.37, 2.65), 0.004, 6))
    B.add(M.blanc, new THREE.SphereGeometry(0.13, 18, 12), { x: 2.5, y: 2.25, z: 2.65 })
    for (const dy of [-0.06, 0, 0.06]) B.add(M.metal, new THREE.TorusGeometry(Math.sqrt(0.13 ** 2 - dy * dy) + 0.002, 0.002, 3, 28), { x: 2.5, y: 2.25 + dy, z: 2.65, rx: Math.PI / 2 })
  }

  // ── fusion du décor : un maillage par matériau ──
  const meshes = B.finish(group)
  for (const m of meshes) if ([M.mur, M.murPalier, M.murEnfant, M.boisSombre, M.boiserie].includes(m.material)) occluders.push(m)

  // ── animation : porte, pluie, néon qui grésille ──
  const neonState = { t: 0, next: 1.2, burst: 0, level: 1 }
  // écran du téléphone : au repos, il s'allume ~1 s toutes les 5,5 s (le rappel de la messagerie) ; phoneLight (0 à 1)
  // le tient allumé à la place, quand il vibre (spec docs/superpowers/specs/2026-10-11-enquete-fin-design.md §3.6)
  let phoneT = 0, phoneLight = null
  const PHONE_DARK = 1.1   // la phase de repos qui suit un clignotement : l'écran éteint, à sa valeur de base
  const lightPhone = () => { if (phoneScreen && phoneLight !== null) phoneScreen.emissiveIntensity = 3 + 37 * phoneLight }
  function setNeon(level) {
    M.neon.emissiveIntensity = 1.2 * level
    M.halo.color.setRGB(0.24 * level, 0.3 * level, 0.42 * level)
    for (const [m, k] of neonLit) m.emissiveIntensity = k * level
  }
  setNeon(1)

  let disposed = false
  return {
    group, colliders, targets, occluders, anchors,
    start: { x: 6.0, z: 7.85, yaw: 0, pitch: -0.05 },
    // d'où l'on photographie le téléphone quand sa fiche s'ouvre d'elle-même : debout dans l'entrée, à 1 m de la console
    phoneView: { x: 5.6, y: 1.65, z: 5.6 },
    lights: { spot, ambient, moon, nightlight },
    openDoor() { door.opening = true },
    // allume l'écran du téléphone (0 : valeur de base, 1 : au plus vif), tenu malgré update ; null le rend à son
    // clignotement de repos, repris éteint (pas au milieu d'un clignotement)
    setPhoneLight(level) {
      if (level === null || level === undefined) {
        if (phoneLight !== null) { phoneLight = null; phoneT = PHONE_DARK; if (phoneScreen) phoneScreen.emissiveIntensity = 3 }
        return
      }
      phoneLight = Math.max(0, Math.min(1, +level || 0))
      lightPhone()
    },
    update(dt) {
      if (disposed) return
      dt = Math.min(Math.max(dt || 0, 0), 0.1)
      if (door.opening && door.t < 1) {
        door.t = Math.min(1, door.t + dt / 1.6)
        const e = 1 - Math.pow(1 - door.t, 3)
        pivot.rotation.y = door.from + (door.to - door.from) * e
        skinLit[1] = 0.6 * (1 - e)
      }
      for (let i = 0; i < DROPS; i++) { const k = i * 3 + 1; rain[k] -= speed[i] * dt; if (rain[k] < 0) rain[k] += 4.5 }
      rainGeo.attributes.position.needsUpdate = true
      const n = neonState
      n.t += dt
      if (n.burst > 0) {
        n.burst -= dt
        if (Math.random() < 0.35) n.level = Math.random() < 0.55 ? 0.08 + Math.random() * 0.3 : 1
        if (n.burst <= 0) n.level = 1
      } else if (n.t > n.next) { n.burst = 0.12 + Math.random() * 0.5; n.next = n.t + 1.5 + Math.random() * 4.5 }
      setNeon(n.level)
      if (phoneLight !== null) lightPhone()
      else {
        phoneT = (phoneT + dt) % 5.5   // écran qui s'allume ~1 s toutes les 5,5 s
        if (phoneScreen) phoneScreen.emissiveIntensity = 3 + 11 * (phoneT < PHONE_DARK ? Math.sin(phoneT / PHONE_DARK * Math.PI) : 0)
      }
    },
    stats() {
      let drawables = 0, triangles = 0
      group.traverseVisible(o => {
        if (!(o.isMesh || o.isPoints || o.isLine)) return
        drawables++
        if (o.isPoints) return
        const g = o.geometry
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3
      })
      return { drawables, triangles: Math.round(triangles) }
    },
    dispose() {
      if (disposed) return
      disposed = true
      const geos = new Set(), mats = new Set(owned.mats), texs = new Set(owned.texs)
      group.traverse(o => {
        if (o.geometry) geos.add(o.geometry)
        for (const m of [].concat(o.material || [])) mats.add(m)
      })
      for (const m of mats) for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v) }
      spot.shadow.dispose()
      geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); texs.forEach(t => t.dispose())
      group.clear()
    },
  }
}
