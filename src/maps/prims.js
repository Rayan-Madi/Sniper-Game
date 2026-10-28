// Primitives des cartes et carte affichée (spec du lot 3, §2 a ; plan du lot 3a, tâche A1 : découpage de l'ancien
// src/maps.js). Chaque carte (un fichier par carte, plus menu.js pour le décor du menu) se construit avec ces
// primitives : elles posent leurs objets dans la scène du jeu et les inscrivent dans la carte affichée (objets,
// obstacles des PNJ, maillages solides, animation d'ambiance), tenue ici et vidée par clear(), que chaque carte
// appelle d'abord. Le reste du jeu passe par index.js.
import * as THREE from 'three'
import { scene } from '../scene.js'
import { disposeObject } from '../gfx/dispose.js'

let mapObjects = []
let obstacles = []   // AABB XZ des objets solides : les PNJ ne les traversent pas
let ambientFn = null // animation d'ambiance de la map (pluie, etc.)
let solids = null    // maillages qui arrêtent la balle, relevés à la demande (solidMeshes), oubliés quand la carte change

// Retire la carte courante et libère ses ressources GPU (géométries, matériaux, carte d'ombre des lumières ; la
// géométrie de la pluie du port est dans mapObjects comme le reste). Sans cela, chaque lancement de mission laissait
// au renderer toute la carte précédente (de 58 à 461 géométries).
export function clear() {
  for (const o of mapObjects) disposeObject(o)
  mapObjects = []
  obstacles = []
  ambientFn = null
  solids = null
}

// ─── Ce qui arrête une balle (spec du lot 2, §3.4) ──────────────────
// Un maillage solide porte userData.solid = true et sa matière, userData.surface : 'pierre' (défaut des box et
// cylinder), 'metal' (conteneurs, véhicules, grue, tonneaux, poteaux), 'bois' (bancs, tables, meubles, troncs,
// portes), 'sol' (défaut des plane : sols, dalles, chaussées). La matière règle la gerbe et la marque de l'impact
// (effects.js), et plus tard son son. Le tir les cherche sur son rayon (src/shot/occlusion.js).
// Jamais solides : la pluie, les lumières, ce qui brille de lui-même (MeshBasicMaterial : lampes, phares, néons,
// fenêtres éclairées, peinture au sol, soleil couchant), les vitres, le verre, le tissu et le feuillage : la balle les
// traverse.

// Rend solides les maillages de obj (lui compris), avec leur matière ; jamais ce qui brille de lui-même.
export function solide(obj, surface = 'pierre') {
  obj.traverse(o => {
    if (o.isMesh && !o.material.isMeshBasicMaterial) { o.userData.solid = true; o.userData.surface = surface }
  })
  solids = null
  return obj
}

// La balle traverse obj (vitre, verre, tissu) : ses maillages ne sont plus solides.
export function traversable(obj) {
  obj.traverse(o => { if (o.isMesh) { delete o.userData.solid; delete o.userData.surface } })
  solids = null
  return obj
}

// Maillages solides de la carte affichée (ni les jeeps du convoi, ni le cadenas du port : ils sont à la mission).
// Vide après clearMap().
export function solidMeshes() {
  if (!solids) {
    solids = []
    for (const o of mapObjects) o.traverse(m => { if (m.isMesh && m.userData.solid) solids.push(m) })
  }
  return solids
}

// Vérification à l'œil (route de développement ?solides=1 de main.js) : chaque maillage solide prend la couleur de sa
// matière, la carte affichée tout de suite, puis chaque carte construite et chaque jeep.
export const SOLID_TINTS = { pierre: 0xdcdcdc, metal: 0x2f8fff, bois: 0xe08a2a, sol: 0x3cc860 }
let tintSolids = false
function tint(m) {
  const c = SOLID_TINTS[m.userData.surface]
  m.material.color.setHex(c)
  if (m.material.emissive) m.material.emissive.setHex(c).multiplyScalar(0.3)   // lisible aussi sur les cartes de nuit
}
export function setSolidTint(on) {
  tintSolids = !!on
  if (tintSolids) for (const m of solidMeshes()) tint(m)
}

// Chaque carte, teintée après sa construction pendant la vérification des solides (?solides=1).
export const verifiable = build => () => {
  const info = build()
  if (tintSolids) for (const m of solidMeshes()) tint(m)
  return info
}

// Appelé chaque frame par le jeu : anime la météo/ambiance de la map courante
export function updateMapAmbient(dt) { if (ambientFn) ambientFn(dt) }

// Animation d'ambiance de la carte en construction (la pluie du port), jouée par updateMapAmbient, oubliée par clear().
export function setMapAmbient(fn) { ambientFn = fn }

// Vrai si o fait partie du décor de la carte affichée (vérification du menu, accroche de dev __decor de main.js).
export const isMapObject = o => mapObjects.includes(o)

// Obstacles solides de la map courante (collision PNJ)
export function getObstacles() { return obstacles }

// Obstacle déclaré à la main : un meuble trop bas pour que box() en fasse un (seuil de 1,1 m), que les PNJ ne doivent
// pas traverser pour autant. { minX, maxX, minZ, maxZ }, comme ceux de box().
export function addObstacle(o) { obstacles.push(o) }

export function add(obj) {
  scene.add(obj)
  mapObjects.push(obj)
  solids = null
  return obj
}

// Primitives : solides, en pierre (box, cylinder) ou en sol (plane) ; solide(…, matière) en change.
export function box(w, h, d, color, x, y, z, shadow = true) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  )
  m.position.set(x, y, z)
  if (shadow) { m.castShadow = true; m.receiveShadow = true }
  // Enregistre comme obstacle si c'est un volume au sol (bâtiment, caisse, voiture…)
  // (h assez haut + base sous 1,5 m → bloque la marche ; les plateformes hautes non)
  if (h >= 1.1 && (y - h / 2) < 1.5) {
    obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 })
  }
  return add(solide(m))
}

export function plane(w, d, color, y = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ color })
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = y
  m.receiveShadow = true
  return add(solide(m, 'sol'))
}

export function cylinder(rt, rb, h, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, 8),
    new THREE.MeshLambertMaterial({ color })
  )
  m.position.set(x, y, z)
  m.castShadow = true
  return add(solide(m))
}

// Arbre : tronc en bois ; la balle traverse le feuillage.
export function tree(x, z) {
  solide(cylinder(0.2, 0.3, 2, 0x5a3a1a, x, 1, z), 'bois')
  const f = new THREE.Mesh(
    new THREE.SphereGeometry(1.6 + Math.random() * 0.6, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x2d5a1a })
  )
  f.position.set(x, 3.5, z)
  f.castShadow = true
  add(f)
}

// Voiture détaillée : carrosserie profilée, capot/coffre, cabine vitrée,
// roues à jantes, phares/feux, calandre, pare-chocs. Enregistrée comme obstacle. En métal, sauf ses vitres.
export function car(x, z, color, rotY = 0) {
  const g = new THREE.Group()
  const mat = (c, r = 0.6, m = 0.25) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m })
  const bodyM = mat(color, 0.4, 0.4)
  const part = (w, h, d, m, px, py, pz) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    b.position.set(px, py, pz); b.castShadow = true; b.receiveShadow = true; g.add(b); return b
  }
  part(1.9, 0.5, 4.4, bodyM, 0, 0.55, 0)            // châssis
  part(1.82, 0.26, 1.15, bodyM, 0, 0.9, 1.55)       // capot
  part(1.82, 0.3, 0.95, bodyM, 0, 0.92, -1.68)      // coffre
  part(1.66, 0.52, 2.05, bodyM, 0, 1.12, -0.12)     // cabine
  const vitres = part(1.5, 0.42, 1.9, mat(0x101720, 0.12, 0.85), 0, 1.2, -0.12)   // vitres teintées
  // roues + jantes
  for (const [wx, wz] of [[0.88, 1.4], [-0.88, 1.4], [0.88, -1.45], [-0.88, -1.45]]) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), mat(0x121212, 0.92, 0))
    tire.rotation.z = Math.PI / 2; tire.position.set(wx, 0.34, wz); tire.castShadow = true; g.add(tire)
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.26, 10), mat(0xa8aeb6, 0.25, 0.9))
    rim.rotation.z = Math.PI / 2; rim.position.set(wx, 0.34, wz); g.add(rim)
  }
  // phares avant / feux arrière
  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff2cc }))
    hl.position.set(sx, 0.82, 2.21); g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xcc2222 }))
    tl.position.set(sx, 0.84, -2.17); g.add(tl)
  }
  part(1.8, 0.15, 0.1, mat(0x14171b, 0.5, 0.6), 0, 0.7, 2.2)     // calandre
  part(1.92, 0.18, 0.14, mat(0x22262b, 0.6, 0.4), 0, 0.4, 2.22)  // pare-chocs avant
  part(1.92, 0.18, 0.14, mat(0x22262b, 0.6, 0.4), 0, 0.4, -2.2)  // pare-chocs arrière
  g.position.set(x, 0, z); g.rotation.y = rotY
  solide(g, 'metal'); traversable(vitres)
  add(g)
  // obstacle (extents échangés si la voiture est tournée à ~90°)
  const swap = Math.abs(Math.sin(rotY)) > 0.5
  const hx = swap ? 2.4 : 1.2, hz = swap ? 1.2 : 2.4
  obstacles.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz })
  return g
}

// ─── Jeep militaire détaillée (convoi de la mission 5) ──
// Le groupe N'est PAS ajouté à la scène ni aux obstacles (véhicule mobile). Solide, en métal, sauf son pare-brise
// vitré : main.js l'ajoute aux solides de la mission (le décor de la carte n'en sait rien).
export function makeJeep(color = 0x3a4a2a) {
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color })
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
  const part = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z); m.castShadow = true; g.add(m); return m
  }
  part(5.2, 0.7, 2.4, bodyMat, 0, 0.75, 0)         // châssis
  part(1.6, 0.6, 2.2, bodyMat, 2.0, 1.05, 0)       // capot
  part(3.4, 0.5, 0.15, bodyMat, -0.3, 1.15, 1.15)  // flancs
  part(3.4, 0.5, 0.15, bodyMat, -0.3, 1.15, -1.15)
  part(0.1, 0.9, 2.0, darkMat, 1.1, 1.6, 0)        // cadre pare-brise
  part(0.15, 0.5, 2.2, darkMat, 2.85, 1.0, 0)      // calandre
  const headl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffcc }))
  headl.position.set(2.9, 1.0, 0.7); g.add(headl)
  const headr = headl.clone(); headr.position.set(2.9, 1.0, -0.7); g.add(headr)
  for (const [wx, wz] of [[1.6, 1.2], [1.6, -1.2], [-1.6, 1.2], [-1.6, -1.2]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 14), darkMat)
    wheel.rotation.x = Math.PI / 2
    wheel.position.set(wx, 0.55, wz); g.add(wheel)
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: 0x8f959c, roughness: 0.3, metalness: 0.85 }))
    rim.rotation.x = Math.PI / 2
    rim.position.set(wx, 0.55, wz); g.add(rim)
  }
  const seatMat = new THREE.MeshLambertMaterial({ color: 0x2a2018 })
  part(1.6, 0.5, 2.0, seatMat, -1.4, 1.2, 0)  // banquette arrière
  // Sièges avant (conducteur + passager) : sans eux, les occupants flottent au-dessus du châssis nu
  for (const sz of [0.55, -0.55]) {
    part(0.55, 0.15, 0.55, seatMat, 0.55, 1.15, sz)   // coussin
    part(0.5, 0.6, 0.12, seatMat, 0.32, 1.45, sz)     // dossier
  }
  const wsGlass = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 1.9),
    new THREE.MeshStandardMaterial({ color: 0x14202c, roughness: 0.12, metalness: 0.8, transparent: true, opacity: 0.85 }))
  wsGlass.position.set(1.12, 1.62, 0); wsGlass.rotation.z = -0.22; g.add(wsGlass)
  part(0.09, 0.85, 0.09, darkMat, -0.5, 1.85, 1.0)   // arceau
  part(0.09, 0.85, 0.09, darkMat, -0.5, 1.85, -1.0)
  part(0.09, 0.09, 2.1, darkMat, -0.5, 2.3, 0)
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.28, 14), darkMat)
  spare.rotation.z = Math.PI / 2
  spare.position.set(-2.75, 1.0, 0); g.add(spare)    // roue de secours
  part(0.08, 0.7, 1.9, darkMat, 3.05, 0.85, 0)       // pare-buffle
  part(0.4, 0.08, 1.9, darkMat, 2.9, 0.55, 0)
  solide(g, 'metal'); traversable(wsGlass)
  if (tintSolids) g.traverse(o => { if (o.userData.solid) tint(o) })
  return g
}

// ─── Bâtiment stylé : façade avec grille de fenêtres, corniche, soubassement, porte ──
export function building(w, h, d, color, x, z) {
  box(w, h, d, color, x, h / 2, z)
  // corniche (débord de toit) + parapet
  box(w + 0.5, 0.35, d + 0.5, 0x2e2c30, x, h + 0.17, z)
  box(w + 0.2, 0.5, d + 0.2, shade(color, -0.12), x, h + 0.55, z)
  // soubassement (base en pierre plus sombre)
  box(w + 0.25, 1.1, d + 0.25, shade(color, -0.25), x, 0.55, z)
  // grille de fenêtres régulières sur la façade avant (+Z) et arrière (−Z)
  const cols = Math.max(2, Math.floor(w / 2.4))
  const rows = Math.max(2, Math.floor((h - 2.5) / 2.6))
  for (const side of [1, -1]) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = Math.random() < 0.45
        const win = new THREE.Mesh(
          new THREE.PlaneGeometry(1.0, 1.4),
          new THREE.MeshBasicMaterial({ color: lit ? 0xffdd88 : 0x24313e })
        )
        win.position.set(
          x - w / 2 + (c + 0.5) * (w / cols),
          2.6 + r * ((h - 3.4) / rows),
          z + side * (d / 2 + 0.02)
        )
        if (side === -1) win.rotation.y = Math.PI
        add(win)
        // linteau fin au-dessus des fenêtres allumées
        if (lit && Math.random() < 0.5) {
          const ledge = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.1),
            new THREE.MeshLambertMaterial({ color: shade(color, -0.2) }))
          ledge.position.set(win.position.x, win.position.y + 0.78, z + side * (d / 2 + 0.05))
          add(solide(ledge))
        }
      }
    }
    // porte d'entrée au rez-de-chaussée
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x1c1a20 }))
    door.position.set(x, 1.1, z + side * (d / 2 + 0.02))
    if (side === -1) door.rotation.y = Math.PI
    add(solide(door, 'bois'))
    // petite lampe au-dessus de la porte
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffeebb }))
    lamp.position.set(x, 2.45, z + side * (d / 2 + 0.08)); add(lamp)
  }
}

// Assombrit/éclaircit une couleur hex
function shade(hex, amt) {
  const c = new THREE.Color(hex)
  c.r = Math.min(1, Math.max(0, c.r + amt))
  c.g = Math.min(1, Math.max(0, c.g + amt))
  c.b = Math.min(1, Math.max(0, c.b + amt))
  return c.getHex()
}
