import * as THREE from 'three'
import { scene, setLighting } from './scene.js'
import { disposeObject } from './gfx/dispose.js'

let mapObjects = []
let obstacles = []   // AABB XZ des objets solides — les PNJ ne les traversent pas
let ambientFn = null // animation d'ambiance de la map (pluie, etc.)

// Retire la carte courante et libère ses ressources GPU (géométries, matériaux, carte d'ombre des lumières ; la
// géométrie de la pluie du port est dans mapObjects comme le reste). Sans cela, chaque lancement de mission laissait
// au renderer toute la carte précédente (de 58 à 461 géométries).
function clear() {
  for (const o of mapObjects) disposeObject(o)
  mapObjects = []
  obstacles = []
  ambientFn = null
}

// Appelé chaque frame par le jeu : anime la météo/ambiance de la map courante
export function updateMapAmbient(dt) { if (ambientFn) ambientFn(dt) }

// Vide la scène de la carte courante (utilisé par la carte PvP).
export function clearMap() { clear() }

// Vrai si o fait partie du décor de la carte affichée (vérification du menu, accroche de dev __decor de main.js).
export const isMapObject = o => mapObjects.includes(o)

// Obstacles solides de la map courante (collision PNJ)
export function getObstacles() { return obstacles }

function add(obj) {
  scene.add(obj)
  mapObjects.push(obj)
  return obj
}

function box(w, h, d, color, x, y, z, shadow = true) {
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
  return add(m)
}

function plane(w, d, color, y = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({ color })
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = y
  m.receiveShadow = true
  return add(m)
}

function cylinder(rt, rb, h, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, 8),
    new THREE.MeshLambertMaterial({ color })
  )
  m.position.set(x, y, z)
  m.castShadow = true
  return add(m)
}

function tree(x, z) {
  cylinder(0.2, 0.3, 2, 0x5a3a1a, x, 1, z)
  const f = new THREE.Mesh(
    new THREE.SphereGeometry(1.6 + Math.random() * 0.6, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x2d5a1a })
  )
  f.position.set(x, 3.5, z)
  f.castShadow = true
  add(f)
}

// Voiture détaillée : carrosserie profilée, capot/coffre, cabine vitrée,
// roues à jantes, phares/feux, calandre, pare-chocs. Enregistrée comme obstacle.
function car(x, z, color, rotY = 0) {
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
  part(1.5, 0.42, 1.9, mat(0x101720, 0.12, 0.85), 0, 1.2, -0.12)   // vitres teintées
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
  add(g)
  // obstacle (extents échangés si la voiture est tournée à ~90°)
  const swap = Math.abs(Math.sin(rotY)) > 0.5
  const hx = swap ? 2.4 : 1.2, hz = swap ? 1.2 : 2.4
  obstacles.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz })
  return g
}

// ─── Jeep militaire détaillée (convoi de la mission 5) ──
// Le groupe N'est PAS ajouté à la scène ni aux obstacles (véhicule mobile).
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
  // Sièges avant (conducteur + passager) — sans eux, les occupants flottent au-dessus du châssis nu
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
  return g
}

// ─── Bâtiment stylé : façade avec grille de fenêtres, corniche, soubassement, porte ──
function building(w, h, d, color, x, z) {
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
          add(ledge)
        }
      }
    }
    // porte d'entrée au rez-de-chaussée
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x1c1a20 }))
    door.position.set(x, 1.1, z + side * (d / 2 + 0.02))
    if (side === -1) door.rotation.y = Math.PI
    add(door)
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

// ─── MAP 1 : Rue / Marché (extérieur, toit en face) ─────────────────
export function buildMapStreet() {
  clear()
  setLighting({ ambientI: 0.65, sunI: 1.2, fillI: 0.4, sunColor: 0xfff0cc })
  scene.background = new THREE.Color(0x87a0b0)
  scene.fog = new THREE.Fog(0x87a0b0, 50, 140)

  plane(200, 200, 0x7a8a6a)
  plane(8, 80, 0x444444, 0.01)  // route

  // Bâtiments stylés (façades à fenêtres régulières, corniches, portes éclairées)
  building(10, 14, 10, 0x8a7a6a, -18, -10)
  building(8,  18, 8,  0x7a8a7a,  18, -8)
  building(12, 10, 8,  0x9a8a7a, -16,  10)
  building(10, 12, 10, 0x6a7a8a,  16,  12)
  building(14, 20, 12, 0x7a6a5a,  0, -25)
  building(8,  9,  8,  0x8a9a8a, -30, 5)
  building(8,  16, 8,  0x6a8a7a,  28, -2)

  for (let i = 0; i < 18; i++) {
    const x = (Math.random() - 0.5) * 60
    const z = (Math.random() - 0.5) * 50
    if (Math.abs(x) < 5) continue
    tree(x, z)
  }

  const cols = [0xcc2222, 0x2244cc, 0x888888, 0x224422, 0xccaa22]
  for (let i = 0; i < 5; i++) car(-6 + i * 0.3, -8 + i * 4, cols[i])

  // Kiosque marché avec auvent
  box(4, 0.1, 3, 0xcc8844, 6, 2.4, 5)
  box(0.1, 2.4, 0.1, 0x885522, 4, 1.2, 3.5)
  box(0.1, 2.4, 0.1, 0x885522, 8, 1.2, 3.5)
  box(0.1, 2.4, 0.1, 0x885522, 4, 1.2, 6.5)
  box(0.1, 2.4, 0.1, 0x885522, 8, 1.2, 6.5)

  // Lampadaires rue
  for (let lz = -10; lz <= 10; lz += 8) {
    cylinder(0.08, 0.1, 7, 0x666666, 12, 3.5, lz)
    const lp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffbb }))
    lp.position.set(12, 7.3, lz); add(lp)
    const pl = new THREE.PointLight(0xffdd88, 1.2, 15)
    pl.position.set(12, 7, lz); add(pl)
    cylinder(0.08, 0.1, 7, 0x666666, -12, 3.5, lz)
    const lp2 = lp.clone(); lp2.position.set(-12, 7.3, lz); add(lp2)
    const pl2 = new THREE.PointLight(0xffdd88, 1.2, 15)
    pl2.position.set(-12, 7, lz); add(pl2)
  }

  // Passages piétons au sol
  for (let i = -1; i <= 1; i++) {
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }))
    cross.rotation.x = -Math.PI / 2
    cross.position.set(i * 1.5, 0.02, 0); add(cross)
  }

  // Poubelles
  for (let i = 0; i < 3; i++) {
    cylinder(0.28, 0.32, 0.75, 0x445544, -4 + i * 6, 0.37, 14)
  }

  // groundY : hauteur du dessus du sol dans la zone d'apparition (pieds des PNJ, impacts des tirs manqués)
  return { spawnBounds: { minX: -10, maxX: 10, minZ: -12, maxZ: 12 }, groundY: 0, cameraPos: [0, 8, 30], indoors: false }
}

// ─── MAP 2 : Plaza de nuit — toit d'immeuble, vue plongeante ─────────
// Sniper sur le toit d'un immeuble en bordure de place
// Caméra à y=22, orientée vers le bas (pitch négatif) sur la place en contrebas
// SpawnBounds = zone AU SOL directement visible depuis le toit
export function buildMapWarehouse() {
  clear()
  setLighting({ ambientI: 0.85, sunI: 0.6, fillI: 0.4, sunColor: 0x9fb0dd, ambColor: 0x8fa0c8 })
  scene.background = new THREE.Color(0x0a0a18)
  scene.fog = new THREE.Fog(0x0a0a18, 40, 100)

  // Grande place dallée au sol
  plane(60, 60, 0x3a3a3a)

  // Dallage — lignes blanches
  for (let i = -4; i <= 4; i++) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x555555 }))
    h.rotation.x = -Math.PI / 2
    h.position.set(0, 0.02, i * 4)
    add(h)
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 60),
      new THREE.MeshBasicMaterial({ color: 0x555555 }))
    v.rotation.x = -Math.PI / 2
    v.position.set(i * 4, 0.02, 0)
    add(v)
  }

  // Fontaine centrale (décor, pas d'obstacle)
  cylinder(2.5, 0.5, 0.6, 0x666688, 0, 0.3, 0)   // vasque
  cylinder(0.18, 0.18, 1.4, 0x888899, 0, 0.7, 0)  // pilier

  // Bancs + lampadaires autour de la place
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const bx = Math.cos(angle) * 10
    const bz = Math.sin(angle) * 10
    box(1.8, 0.35, 0.5, 0x5a4a3a, bx, 0.17, bz)   // banc
    cylinder(0.08, 0.08, 5, 0x888888, bx + 2, 2.5, bz) // lampadaire
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffbb }))
    lamp.position.set(bx + 2, 5.15, bz)
    add(lamp)
    const pl = new THREE.PointLight(0xffffaa, 1.2, 14)
    pl.position.set(bx + 2, 5, bz)
    add(pl)
  }

  // Immeuble sniper côté nord (toit = position caméra)
  // Face avant à z = +24, toit à y=22
  box(24, 22, 8, 0x4a4a6a, 0, 11, 26)    // corps immeuble
  box(24, 0.6, 8, 0x3a3a5a, 0, 22.3, 26) // toit
  box(22, 1.2, 0.5, 0x5a5a7a, 0, 22.9, 22.1) // muret façade avant

  // Façade immeuble — fenêtres éclairées
  for (let fx = -9; fx <= 9; fx += 4) {
    for (let fy = 3; fy <= 19; fy += 4) {
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2.5),
        new THREE.MeshBasicMaterial({
          color: Math.random() > 0.3 ? 0xffffaa : 0x223344,
          transparent: true, opacity: 0.9
        })
      )
      win.position.set(fx, fy, 22.05)
      add(win)
    }
  }

  // Immeubles stylés autour de la place
  building(10, 14, 6, 0x3a4a3a, -22, 0)
  building(10, 18, 6, 0x4a3a3a, 22, 0)
  building(12, 10, 6, 0x3a3a4a, 0, -22)

  // Voitures garées en bordure (modèle détaillé)
  const carC = [0x883322, 0x225588, 0x222222, 0x447744]
  const carPos = [[-15, 18], [0, 18], [15, 18], [-15, -18], [0, -18]]
  for (let i = 0; i < carPos.length; i++) {
    const [cx, cz] = carPos[i]
    car(cx, cz, carC[i % carC.length], (i % 2) * (Math.PI / 2))
  }

  // Lumière ambiante bleue-nuit
  const ambNight = new THREE.AmbientLight(0x111133, 0.8)
  add(ambNight)

  return {
    // Zone de spawn = TOUTE LA PLACE AU SOL, bien visible depuis y=22
    spawnBounds: { minX: -14, maxX: 14, minZ: -14, maxZ: 14 },
    groundY:     0,                    // la place dallée
    cameraPos:   [0, 22.5, 22],        // sur le toit de l'immeuble nord
    cameraTarget: [0, 0, 0],           // regarde le centre de la place en bas
    indoors: false
  }
}

// ─── MAP 3 : Port de nuit — entrepôt côtier ──────────────────────────
// RÈGLE : caméra fixe à [0, 10, 28], regarde vers z=0 (droit devant)
// Spawn = rectangle z=[-12, 8], x=[-14, 14] — PLAT, VIDE, visible à 100%
export function buildMapDocks() {
  clear()
  setLighting({ ambientI: 0.9, sunI: 0.7, fillI: 0.45, sunColor: 0x9fb0dd, ambColor: 0x8fa0c4 })
  scene.background = new THREE.Color(0x0a1520)
  scene.fog = new THREE.Fog(0x0a1520, 35, 95)

  // ── SOL ──────────────────────────────────────────────────────────────
  plane(200, 200, 0x252520)
  // Dalle béton quai (zone de spawn uniquement — aucun obstacle dedans)
  box(34, 0.35, 26, 0x2e2e28, 0, 0.17, -2)

  // ── EAU (derrière, hors zone de spawn) ───────────────────────────────
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 50),
    new THREE.MeshLambertMaterial({ color: 0x061828, transparent: true, opacity: 0.9 })
  )
  water.rotation.x = -Math.PI / 2
  water.position.set(0, -0.2, -45)
  add(water)

  // ── DÉCOR DERRIÈRE (z < -12, hors spawn) ─────────────────────────────
  // Entrepôt de fond
  box(40, 11, 8, 0x1e1e1a, 0, 5.5, -24)
  // Grandes portes métalliques entrepôt
  box(7, 8, 0.3, 0x2a2a25, -9, 4, -20.1)
  box(7, 8, 0.3, 0x2a2a25,  9, 4, -20.1)
  box(2, 8, 0.3, 0x333330,  0, 4, -20.1)
  // Fenêtres entrepôt allumées
  for (let wx = -14; wx <= 14; wx += 7) {
    const ww = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.7 }))
    ww.position.set(wx, 8.5, -20.12); add(ww)
    const pl = new THREE.PointLight(0xffdd88, 0.8, 12)
    pl.position.set(wx, 8.5, -19); add(pl)
  }

  // Bateau amarré à gauche (décor, loin de la zone spawn)
  box(24, 4, 9, 0x1a2535, -28, 2, -18)
  box(22, 0.8, 7, 0x243040, -28, 4.5, -18)
  box(7, 5, 5, 0x1e3045, -28, 7, -14)
  cylinder(0.25, 0.3, 6, 0x222222, -26, 10, -14)
  // Lumières bateau
  const bLight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }))
  bLight.position.set(-28, 12, -14); add(bLight)

  // Grue (décor, à droite hors spawn)
  box(0.9, 22, 0.9, 0xdd8800, 28, 11, -10)
  box(18, 0.7, 0.7, 0xdd8800, 19, 22, -10)
  box(0.08, 10, 0.08, 0x888888, 22, 17, -10)
  // Lumière rouge grue
  const grl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2200 }))
  grl.position.set(28, 23, -10); add(grl)
  const grPl = new THREE.PointLight(0xff2200, 1.5, 8)
  grPl.position.set(28, 23, -10); add(grPl)

  // Conteneurs sur les côtés (hors zone de spawn x < -15 ou x > 15)
  const cCols = [0xcc3322, 0x2244cc, 0x228833, 0x886622, 0x553388]
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 2; row++) {
      box(2.4, 2.8, 5.5, cCols[(col + row * 3) % cCols.length],
        -20 + col * 0.2, row * 2.8 + 1.4, -6 + col * 0.5)
      box(2.4, 2.8, 5.5, cCols[(col + row * 2) % cCols.length],
         20 - col * 0.2, row * 2.8 + 1.4, -6 + col * 0.5)
    }
  }

  // ── LAMPADAIRES sur la dalle (bord, n'obstruent pas le spawn) ────────
  for (const lx of [-15, 0, 15]) {
    cylinder(0.08, 0.1, 7, 0x666666, lx, 3.5, 12)
    const lp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffffaa }))
    lp.position.set(lx, 7.2, 12); add(lp)
    const pl = new THREE.PointLight(0xffdd88, 1.8, 22)
    pl.position.set(lx, 7, 12); add(pl)
  }

  // ── POSTE SNIPER — toit conteneurs empilés côté droit de l'écran ─────
  // Caméra à [0, 10, 28] — donc derrière la caméra il y a le "mur" suivant
  box(14, 6, 5, 0x333330, 0, 3, 30)     // conteneurs empilés (derrière sniper)
  box(14, 0.3, 5, 0x2a2a25, 0, 6.15, 30) // toit / plateforme
  box(12, 0.8, 0.2, 0x444440, 0, 6.6, 27.6) // muret appui sniper

  // ── BOLLARDS jaunes bord du quai ─────────────────────────────────────
  for (let bx = -14; bx <= 14; bx += 7) {
    cylinder(0.16, 0.19, 1.0, 0xddcc00, bx, 0.5, 11.5)
  }

  // ── CONTENEUR VERROUILLÉ (choix moral) — bien visible, face au sniper ──
  box(2.6, 3, 6, 0x8a1f1f, -16.5, 1.5, 2)              // conteneur rouge sombre
  // chaînes en croix sur la porte avant
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.35 })
  const ch1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.06), chainMat)
  ch1.position.set(-16.5, 1.5, 5.06); ch1.rotation.z = 0.5; add(ch1)
  const ch2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.06), chainMat)
  ch2.position.set(-16.5, 1.5, 5.06); ch2.rotation.z = -0.5; add(ch2)

  // ── LUNE / AMBIANCE ──────────────────────────────────────────────────
  const moonLight = new THREE.PointLight(0x3355aa, 0.5, 300)
  moonLight.position.set(0, 60, 0); add(moonLight)

  // ── PLUIE (météo dynamique du port) ──────────────────────────────────
  const RAIN_N = 500
  const rainPos = new Float32Array(RAIN_N * 3)
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3]     = (Math.random() - 0.5) * 70
    rainPos[i * 3 + 1] = Math.random() * 22
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 60 - 2
  }
  const rainGeo = new THREE.BufferGeometry()
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
  const rain = new THREE.Points(rainGeo,
    new THREE.PointsMaterial({ color: 0x9db3cc, size: 0.09, transparent: true, opacity: 0.55 }))
  add(rain)
  // flaques luisantes au sol
  for (let i = 0; i < 7; i++) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.7 + Math.random() * 1.1, 14),
      new THREE.MeshStandardMaterial({ color: 0x101c28, roughness: 0.12, metalness: 0.6 }))
    puddle.rotation.x = -Math.PI / 2
    puddle.position.set((Math.random() - 0.5) * 26, 0.36, (Math.random() - 0.5) * 20 - 2)
    add(puddle)
  }
  ambientFn = (dt) => {
    const p = rainGeo.attributes.position.array
    for (let i = 1; i < RAIN_N * 3; i += 3) {
      p[i] -= dt * 24                 // chute rapide
      if (p[i] < 0) p[i] = 22        // recycle en haut
    }
    rainGeo.attributes.position.needsUpdate = true
  }

  return {
    // Zone de spawn : dalle plate, aucun obstacle, x=[-13,13] z=[-11,10]
    spawnBounds: { minX: -13, maxX: 13, minZ: -11, maxZ: 10 },
    groundY:      0.345,         // dessus de la dalle du quai (0,17 + 0,35 / 2)
    cameraPos:    [0, 10, 28],
    cameraTarget: [0, 1, -2],    // vise le quai en contrebas
    indoors: false,
    // CHOIX MORAL : tirer sur le cadenas du conteneur rouge libère les victimes
    moralLock: { pos: [-16.5, 1.35, 5.15] },
  }
}

// ─── MAP 4 : Base militaire — plein jour, vue depuis tour de garde ────
// Caméra à [0, 14, 26], regarde vers -Z. Cour centrale dégagée pour le spawn.
// Bâtiments et obstacles repoussés sur les CÔTÉS et le FOND (hors zone spawn).
export function buildMapMilitary() {
  clear()
  setLighting({ ambientI: 0.75, sunI: 1.4, fillI: 0.5, sunColor: 0xffffe0 })
  scene.background = new THREE.Color(0x9ab0c0)
  scene.fog = new THREE.Fog(0x9ab0c0, 70, 160)

  // Sol béton clair (cour de manœuvre)
  plane(200, 200, 0x8a8a7a)
  // Tarmac central (zone de spawn)
  box(40, 0.2, 36, 0x6a6a60, 0, 0.1, -4)

  // Marquages au sol (cercle hélipad au centre)
  const heli = new THREE.Mesh(
    new THREE.RingGeometry(4, 4.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  )
  heli.rotation.x = -Math.PI / 2
  heli.position.set(0, 0.22, -4); add(heli)
  // H au centre
  box(0.4, 0.05, 3, 0xffffff, -1, 0.23, -4)
  box(0.4, 0.05, 3, 0xffffff,  1, 0.23, -4)
  box(2.4, 0.05, 0.4, 0xffffff, 0, 0.23, -4)

  // ── CLÔTURE périmètre (loin, z=-30 et côtés) ─────────────────────────
  for (let i = -16; i <= 16; i += 2) {
    box(0.12, 3.5, 0.12, 0x999988, i * 2, 1.75, -32)
  }
  box(68, 0.1, 0.1, 0xaaaa99, 0, 3.4, -32)
  box(68, 0.1, 0.1, 0xaaaa99, 0, 2.4, -32)
  box(68, 0.1, 0.1, 0xaaaa99, 0, 1.4, -32)

  // ── BÂTIMENTS sur les CÔTÉS (hors zone de spawn x±18) ────────────────
  // Baraquement gauche
  box(8, 6, 24, 0x7a8a6a, -24, 3, -8)
  box(8, 1.5, 24, 0x5a6a4a, -24, 6.6, -8)  // toit
  // Baraquement droit
  box(8, 6, 24, 0x7a8a6a, 24, 3, -8)
  box(8, 1.5, 24, 0x5a6a4a, 24, 6.6, -8)
  // Fenêtres baraquements
  for (let wz = -16; wz <= 2; wz += 4) {
    for (const bx of [-24, 24]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.8),
        new THREE.MeshBasicMaterial({ color: 0x223344 }))
      w.position.set(bx > 0 ? bx - 4.1 : bx + 4.1, 3.5, wz)
      w.rotation.y = bx > 0 ? Math.PI / 2 : -Math.PI / 2
      add(w)
    }
  }

  // Hangar au fond (derrière la cour, z=-28)
  box(28, 10, 8, 0x6a7a5a, 0, 5, -28)
  box(28, 1, 8, 0x4a5a3a, 0, 10, -28)
  // Grande porte hangar
  box(12, 8, 0.3, 0x3a4a2a, 0, 4, -23.9)
  box(0.3, 8, 0.3, 0x556644, -6, 4, -23.9)
  box(0.3, 8, 0.3, 0x556644,  6, 4, -23.9)

  // ── TOUR DE GARDE (position sniper) ──────────────────────────────────
  // IMPORTANT : toute la structure est DERRIÈRE la caméra (z >= 24)
  // La caméra flotte au bord avant (z=21) → AUCUN obstacle vers la cour
  box(7, 0.4, 6, 0x6a6a5a, 0, 12.6, 26)       // plateforme (z 23→29)
  box(7, 2.5, 0.3, 0x5a5a4a, 0, 14, 29)       // mur arrière
  box(0.3, 2.5, 6, 0x5a5a4a, -3.5, 14, 26)    // mur gauche
  box(0.3, 2.5, 6, 0x5a5a4a,  3.5, 14, 26)    // mur droit
  for (const [px, pz] of [[-3.5, 23.2], [3.5, 23.2], [-3.5, 29], [3.5, 29]]) {
    box(0.35, 12.6, 0.35, 0x555544, px, 6.3, pz) // piliers (derrière caméra)
  }
  box(7.4, 0.5, 6.4, 0x4a4a3a, 0, 15.4, 26)   // toit (au-dessus, ne gêne pas)

  // ── VÉHICULES militaires (sur les bords, hors spawn) ─────────────────
  // Camions à gauche/droite du tarmac
  box(3, 2.4, 7, 0x4a5a3a, -15, 1.2, 6)
  box(3, 1.4, 3, 0x3a4a2a, -15, 2.8, 8)    // cabine
  box(3, 2.4, 7, 0x4a5a3a,  15, 1.2, 6)
  box(3, 1.4, 3, 0x3a4a2a,  15, 2.8, 8)
  // Jeep au fond
  box(2.4, 1.4, 4, 0x5a6a4a, -10, 0.7, -16)
  box(2.4, 1.4, 4, 0x5a6a4a,  10, 0.7, -16)

  // ── TONNEAUX / caisses sur les bords ─────────────────────────────────
  for (let i = 0; i < 5; i++) {
    cylinder(0.5, 0.5, 1.2, 0x4a6a3a, -19 + Math.random() * 2, 0.6, -2 + i * 3)
    cylinder(0.5, 0.5, 1.2, 0x6a5a2a,  19 - Math.random() * 2, 0.6, -2 + i * 3)
  }

  // ── TOUR RADAR (décor, au fond gauche) ───────────────────────────────
  cylinder(0.3, 0.4, 12, 0x888888, -26, 6, -26)
  const dish = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide }))
  dish.position.set(-26, 12, -26); dish.rotation.z = 0.5; add(dish)

  // ── DRAPEAU au centre-fond ───────────────────────────────────────────
  cylinder(0.1, 0.1, 8, 0xaaaaaa, -8, 4, 4)
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.5),
    new THREE.MeshBasicMaterial({ color: 0x335533, side: THREE.DoubleSide }))
  flag.position.set(-6.7, 7, 4); add(flag)

  return {
    // Cour centrale dégagée : x=[-15,15], z=[-18,6] — aucun obstacle
    spawnBounds: { minX: -15, maxX: 15, minZ: -18, maxZ: 6 },
    groundY:      0.2,             // dessus du tarmac (0,1 + 0,2 / 2)
    cameraPos:    [0, 14.5, 21],   // bord AVANT de la tour, rien devant
    cameraTarget: [0, 1, -6],      // plonge vers la cour
    indoors: false
  }
}

// ─── MAP 5 : Convoi — route traversante, cible en voiture ────────────
// La route va le long de l'axe X (la voiture traverse l'écran de gauche à droite)
// Caméra sur un promontoire à z=24 qui regarde la route en contrebas (z=-4)
// Le véhicule + la cible sont gérés dynamiquement dans main.js
export function buildMapConvoy() {
  clear()
  setLighting({ ambientI: 0.8, sunI: 1.5, fillI: 0.5, sunColor: 0xffe8c0, ambColor: 0xfff0e0 })
  scene.background = new THREE.Color(0xb0a088)
  scene.fog = new THREE.Fog(0xb0a088, 80, 180)

  // Désert
  plane(300, 300, 0xa89878)

  // ── ROUTE le long de X (est-ouest) ───────────────────────────────────
  box(90, 0.2, 9, 0x3a3a3a, 0, 0.1, -4)
  // Bandes centrales
  for (let x = -42; x <= 42; x += 7) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xddcc44 }))
    line.rotation.x = -Math.PI / 2
    line.position.set(x, 0.22, -4); add(line)
  }
  // Bas-côtés sableux
  box(90, 0.05, 2, 0x8a7a55, 0, 0.12, -8.5)
  box(90, 0.05, 2, 0x8a7a55, 0, 0.12, 0.5)

  // ── VRAIS ROCHERS (formes irrégulières, fini les cubes) ──────────────
  const rockCols = [0x8d7c5f, 0x9a8a68, 0x7d6f57]
  for (let i = 0; i < 16; i++) {
    const s = 0.8 + Math.random() * 2.6
    const side = Math.random() < 0.5 ? -1 : 1
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0),
      new THREE.MeshStandardMaterial({ color: rockCols[i % 3], roughness: 0.95, flatShading: true }))
    rock.position.set((Math.random() - 0.5) * 90, s * 0.4, -4 + side * (10 + Math.random() * 28))
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
    rock.scale.y = 0.55 + Math.random() * 0.5
    rock.castShadow = true; rock.receiveShadow = true
    add(rock)
  }

  // ── MESAS à l'horizon (silhouettes de canyon, profondeur western) ────
  for (const [mx, mz, mw, mh] of [[-70, -60, 26, 16], [55, -70, 34, 20], [0, -88, 42, 14], [82, -42, 20, 12]]) {
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(mw * 0.42, mw * 0.55, mh, 7),
      new THREE.MeshLambertMaterial({ color: 0x8a6f52 }))
    mesa.position.set(mx, mh / 2, mz); add(mesa)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(mw * 0.44, mw * 0.42, mh * 0.12, 7),
      new THREE.MeshLambertMaterial({ color: 0x9d8262 }))
    cap.position.set(mx, mh + mh * 0.06, mz); add(cap)
  }

  // ── GLISSIÈRES de sécurité le long de la route ───────────────────────
  for (const gz of [-8.7, 0.7]) {
    box(88, 0.22, 0.08, 0x9aa0a4, 0, 0.72, gz, false)
    for (let px = -42; px <= 42; px += 6) box(0.12, 0.72, 0.12, 0x6d7276, px, 0.36, gz, false)
  }

  // ── ÉPAVES / véhicules du convoi déjà arrêtés (décor, HORS de la chaussée) ──
  // La route (avec bas-côtés) couvre z=[-8.5, 0.5] — les jeeps roulent à z=-4.
  // Ces épaves sont posées bien au-delà, dans le sable, pour ne jamais être traversées.
  // Camion en panne à gauche
  box(5, 2.6, 3, 0x6a6a4a, -34, 1.3, -13)
  box(3, 2, 3, 0x5a5a3a, -36, 1, -13)
  cylinder(0.6, 0.6, 0.4, 0x222222, -34, 0.4, -11)   // roue
  // Blindé à droite
  box(6, 2.4, 3.4, 0x4a5a3a, 34, 1.2, 6)
  cylinder(1, 1.2, 0.7, 0x3a4a2a, 34, 2.6, 6)         // tourelle
  box(4, 0.3, 0.3, 0x2a3a1a, 37, 2.6, 6)              // canon

  // ── ARBRES MORTS désertiques (en arrière-plan) ───────────────────────
  for (let i = 0; i < 8; i++) {
    const x = (Math.random() - 0.5) * 90
    const z = -18 - Math.random() * 22
    cylinder(0.15, 0.25, 2.5 + Math.random() * 2, 0x6a5a45, x, 1.5, z)
  }

  // ── PROMONTOIRE SNIPER (rocher surélevé, derrière la caméra) ─────────
  box(8, 6, 6, 0x8a7a5a, 0, 3, 27)
  box(8, 0.4, 6, 0x9a8a6a, 0, 6.2, 27)   // plateau

  // ── PYLÔNES électriques le long de la route (profondeur) ─────────────
  for (const px of [-30, 0, 30]) {
    cylinder(0.2, 0.3, 10, 0x777777, px, 5, -22)
    box(4, 0.3, 0.3, 0x777777, px, 9, -22)
    box(4, 0.3, 0.3, 0x777777, px, 8, -22)
  }

  // ── COUCHER DE SOLEIL (carte postale du convoi) ──────────────────────
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(8, 28),
    new THREE.MeshBasicMaterial({ color: 0xff7733, fog: false }))
  sunDisc.position.set(-35, 7, -80); add(sunDisc)
  const sunHalo = new THREE.Mesh(new THREE.CircleGeometry(13, 28),
    new THREE.MeshBasicMaterial({ color: 0xff9955, transparent: true, opacity: 0.28, fog: false }))
  sunHalo.position.set(-35, 7, -80.5); add(sunHalo)
  const sunGlow = new THREE.PointLight(0xff8844, 1.2, 250)
  sunGlow.position.set(-35, 12, -60); add(sunGlow)

  return {
    // Pas de spawn à pied au centre ; les gardes apparaissent sur les bords
    spawnBounds: { minX: -30, maxX: 30, minZ: -7, maxZ: -1 },
    groundY:      0.2,             // dessus de la route (0,1 + 0,2 / 2) : PNJ, jeeps et occupants
    cameraPos:    [0, 7, 24],
    cameraTarget: [0, 1, -4],     // vise la route
    indoors: false,
    convoy: true,                  // active le véhicule mobile dans main.js
  }
}

// ─── MAP 6 : Fête d'appartement — vue depuis couloir / fenêtre opposée ─
// Grande salle pleine de monde — civils nombreux, cible à identifier
// Sniper dans l'immeuble d'en face, vise à travers les baies vitrées
export function buildMapParty() {
  clear()
  // Assez de lumière pour distinguer les PNJ, tout en gardant l'ambiance nuit
  setLighting({ ambientI: 0.85, sunI: 0.55, fillI: 0.4, sunColor: 0x8fa0cc, ambColor: 0x93a2c6 })
  scene.background = new THREE.Color(0x0a0a14)
  scene.fog = new THREE.Fog(0x0a0a14, 60, 130)

  // Sol rue entre les deux immeubles (légèrement sous 0 pour éviter le z-fight
  // avec le parquet de la salle, qui est calé pile au niveau des pieds y=0)
  plane(80, 80, 0x1a1a1a, -0.05)

  // ── SALLE DE FÊTE — pièce OUVERTE côté caméra (sinon on ne voit rien) ──
  // Sol parquet : SURFACE à y=0 (les PNJ ont les pieds à 0). Auparavant la
  // surface était à 0,3 → tout le monde (et les meubles) semblait enfoncé.
  box(30, 0.2, 9, 0x4a3520, 0, -0.1, -20.5)
  // Plafond
  box(30, 0.3, 9, 0x15101e, 0, 8, -20.5)
  // Mur du fond
  box(30, 8, 0.3, 0x231a2e, 0, 4, -25)
  // Murs latéraux
  box(0.3, 8, 9, 0x231a2e, -15, 4, -20.5)
  box(0.3, 8, 9, 0x231a2e,  15, 4, -20.5)
  // Façade au-dessus de l'ouverture (haut de l'immeuble, n'occulte pas la salle)
  box(34, 10, 0.5, 0x12121c, 0, 13, -16)
  for (let fx = -14; fx <= 14; fx += 4) {
    for (let fy = 10; fy <= 20; fy += 4) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.4),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0xffdd88 : 0x223344 }))
      w.position.set(fx, fy, -15.7); add(w)
    }
  }
  // Montants verticaux de la baie (fins, n'occultent presque pas)
  for (const px of [-15, -5, 5, 15]) {
    box(0.3, 8, 0.3, 0x0a0a12, px, 4, -16)
  }
  // Rambarde basse de la baie vitrée
  box(30, 0.6, 0.2, 0x2a2a3a, 0, 1, -16)

  // ── MOBILIER intérieur (décor de fête) ───────────────────────────────
  // Table DJ (fond)
  box(5, 1.1, 1.2, 0x1a1a1a, 0, 0.55, -24)
  box(4.6, 0.15, 0.9, 0x222222, 0, 1.18, -24)  // plateau
  // Enceintes DJ
  box(1.0, 1.8, 0.8, 0x111111, -3.2, 0.9, -24)
  box(1.0, 1.8, 0.8, 0x111111,  3.2, 0.9, -24)
  // Leds enceintes
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8),
      new THREE.MeshBasicMaterial({ color: [0xff2200, 0x00ff88, 0x2244ff][i] }))
    led.position.set(-3.2 + i * 3.2, 1.2, -24.62); add(led)
  }

  // Canapés
  box(4, 0.55, 1.2, 0x3a1a2a, -8, 0.27, -22)
  box(4, 0.8, 0.5, 0x3a1a2a, -8, 0.6, -22.6)   // dossier
  box(4, 0.55, 1.2, 0x1a2a3a,  8, 0.27, -22)
  box(4, 0.8, 0.5, 0x1a2a3a,  8, 0.6, -22.6)

  // Tables basses
  box(1.8, 0.35, 0.9, 0x2a2a2a, -8, 0.17, -20.5)
  box(1.8, 0.35, 0.9, 0x2a2a2a,  8, 0.17, -20.5)

  // Meubles BAS (canapés + dossiers, tables) : trop bas pour être détectés
  // automatiquement par box() (seuil h ≥ 1,1) → on les déclare explicitement
  // comme obstacles pour que les PNJ ne les traversent plus.
  for (const [ox, oz, ow, od] of [
    [-8, -22.1, 4, 1.8], [8, -22.1, 4, 1.8],       // canapés (assise + dossier)
    [-8, -20.5, 1.8, 0.9], [8, -20.5, 1.8, 0.9],   // tables basses
  ]) {
    obstacles.push({ minX: ox - ow / 2, maxX: ox + ow / 2, minZ: oz - od / 2, maxZ: oz + od / 2 })
  }

  // Bar côté gauche
  box(5, 1.2, 1.2, 0x2a1a10, -10, 0.6, -19)
  box(5.2, 0.1, 1.3, 0x3a2810, -10, 1.26, -19) // comptoir
  // Bouteilles sur le bar
  for (let i = 0; i < 4; i++) {
    cylinder(0.12, 0.12, 0.55, [0x228800, 0xaa4400, 0x8800aa, 0x884400][i],
      -12 + i * 0.6, 1.55, -18.45)
  }

  // Boule à facettes (disco ball)
  const discoBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 12),
    new THREE.MeshLambertMaterial({ color: 0xdddddd, wireframe: false })
  )
  discoBall.position.set(0, 6.5, -20); add(discoBall)
  // Fil de suspension
  box(0.04, 1.2, 0.04, 0x888888, 0, 7.1, -20)

  // ── ÉCLAIRAGE PRINCIPAL de la salle (pour voir les PNJ) ───────────────
  // Plusieurs point lights blanc-chaud répartis dans l'appartement
  for (let lx = -10; lx <= 10; lx += 5) {
    const room = new THREE.PointLight(0xfff0dd, 1.6, 22)
    room.position.set(lx, 5, -20); add(room)
  }

  // ── LUMIÈRES DE FÊTE colorées (ambiance par-dessus) ───────────────────
  const partyColors = [0xff0066, 0x00ffcc, 0xff6600, 0x9900ff, 0x00aaff]
  for (let i = 0; i < 5; i++) {
    const pl = new THREE.PointLight(partyColors[i], 1.8, 12)
    pl.position.set(-10 + i * 5, 6, -20); add(pl)
    // Projecteurs au plafond
    const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.35, 8),
      new THREE.MeshBasicMaterial({ color: partyColors[i] }))
    spot.position.set(-10 + i * 5, 7.0, -20); add(spot)
  }

  // Lumière au sol — piste de danse
  const danceFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 5),
    new THREE.MeshBasicMaterial({ color: 0x220033, transparent: true, opacity: 0.6 })
  )
  danceFloor.rotation.x = -Math.PI / 2
  danceFloor.position.set(0, 0.03, -20); add(danceFloor)   // au ras du parquet (y≈0)
  // Carreaux de piste
  for (let dx = -4; dx <= 4; dx += 2) {
    for (let dz = -2; dz <= 2; dz += 2) {
      if ((dx + dz) % 4 === 0) {
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8),
          new THREE.MeshBasicMaterial({ color: 0x440055, transparent: true, opacity: 0.5 }))
        tile.rotation.x = -Math.PI / 2
        tile.position.set(dx, 0.04, -20 + dz); add(tile)
      }
    }
  }

  // ── IMMEUBLE SNIPER (devant, z positif) ───────────────────────────────
  box(22, 16, 7, 0x111118, 0, 8, 8)    // corps immeuble sniper
  box(22, 0.3, 7, 0x1a1a22, 0, 16.3, 8) // toit
  // Fenêtre ouverte (position sniper)
  box(4, 3, 0.2, 0x0a0a12, 0, 9, 4.9)  // rebord fenêtre
  // Muret appui
  box(4, 0.6, 0.4, 0x2a2a3a, 0, 7.8, 4.8)

  // Néon rouge "EXIT" sur l'immeuble d'en face
  const neonRed = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.15),
    new THREE.MeshBasicMaterial({ color: 0xff2200 }))
  neonRed.position.set(-12, 5, -16.2); add(neonRed)
  const neonPl = new THREE.PointLight(0xff2200, 1.0, 5)
  neonPl.position.set(-12, 5, -16); add(neonPl)

  // Néon bleu côté droit
  const neonBlue = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 0.15),
    new THREE.MeshBasicMaterial({ color: 0x0088ff }))
  neonBlue.position.set(11, 4.5, -16.2); add(neonBlue)
  const neonBluePl = new THREE.PointLight(0x0088ff, 1.0, 5)
  neonBluePl.position.set(11, 4.5, -16); add(neonBluePl)

  // Rue entre les deux immeubles (déchets, poubelles)
  for (let i = -3; i <= 3; i++) {
    cylinder(0.35, 0.4, 0.9, 0x333322, i * 4, 0.45, -5)  // poubelle
    cylinder(0.38, 0.38, 0.05, 0x222211, i * 4, 0.92, -5) // couvercle
  }

  // Quelques passants dans la rue (zone spawn)
  // Lampadaires rue
  for (let lx = -10; lx <= 10; lx += 10) {
    cylinder(0.08, 0.1, 6, 0x666666, lx, 3, -5)
    const lp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffaa }))
    lp.position.set(lx, 6.2, -5); add(lp)
    const streetPl = new THREE.PointLight(0xffdd88, 0.8, 10)
    streetPl.position.set(lx, 6, -5); add(streetPl)
  }

  return {
    // Spawn DANS l'appartement visible + quelques-uns dans la rue
    spawnBounds: { minX: -10, maxX: 10, minZ: -24, maxZ: -17 },
    groundY:     0,                   // surface du parquet
    cameraPos:   [0, 9, 5],           // fenêtre de l'immeuble d'en face
    cameraTarget: [0, 3, -20],        // vise l'appartement
    indoors: true,
    sideExit: true,                   // les PNJ fuient vers les côtés (sorties latérales)
    party: true,                      // la foule danse (ambiance fête)
    // Cible à identifier : AUCUN signe distinctif visuel — même allure que la foule.
    // Seul indice : son comportement. À toi d'observer.
    // Assis sur le canapé de gauche (seatY cale l'assise sur la banquette).
    hiddenTarget: {
      spawn: [-8, -21.7],
      seatY: 0.2,
      clue:  "Aucune photo. Aucun nom. Une seule certitude : pendant que tout le monde danse... lui reste assis à négocier au téléphone.",
    },
  }
}

export const MAP_BUILDERS = [
  buildMapStreet,
  buildMapWarehouse,
  buildMapDocks,
  buildMapMilitary,
  buildMapConvoy,
  buildMapParty,
]
