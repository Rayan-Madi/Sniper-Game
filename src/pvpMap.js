import * as THREE from 'three'
import { scene, setLighting } from './scene.js'
import { clearMap } from './maps.js'

// ─── Arène PvP dédiée : grande fête d'appartement nocturne ───────────
// Auto-contenue (ne partage pas le tableau d'objets de maps.js) pour ne
// jamais interférer avec le mode histoire.
//
// Géométrie : une GRANDE salle de fête (48 × 24) ouverte côté sniper par une
// baie vitrée pleine hauteur ; le nid du sniper est juste en face, en léger
// surplomb, avec une vue plongeante DÉGAGÉE sur toute la piste. Tous les
// murs de la salle sont fermés sauf la baie → le contre-tueur est vraiment
// enfermé dans la fête, il ne peut pas errer dans une ruelle vide.
let objects = []

function add(obj) { scene.add(obj); objects.push(obj); return obj }

function box(w, h, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.1 }))
  m.position.set(x, y, z)
  m.castShadow = true; m.receiveShadow = true
  return add(m)
}

function plane(w, d, color, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 }))
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true
  return add(m)
}

function cyl(rt, rb, h, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }))
  m.position.set(x, y, z); m.castShadow = true
  return add(m)
}

export function clearPvpMap() {
  for (const o of objects) scene.remove(o)
  objects = []
}

// Objets solides de l'arène — utilisés par le raycast du laser
// (raycaster sur scene.children entier = trop lourd avec les foules skinnées)
export function getPvpColliders() { return objects }

// Dimensions de la salle (partagées par le build et les bornes retournées)
const ROOM = { minX: -24, maxX: 24, frontZ: -12, backZ: -36, ceilY: 11 }
const ROOM_CZ = (ROOM.frontZ + ROOM.backZ) / 2   // centre en Z (-24)

export function buildPvpArena() {
  clearPvpMap()
  clearMap()   // retire le décor du mode histoire (ex: la rue affichée derrière le menu)
  setLighting({ ambientI: 1.25, sunI: 0.55, fillI: 0.65, sunColor: 0x9fb0dc, ambColor: 0xa6b2d6 })
  scene.background = new THREE.Color(0x0a0a14)
  scene.fog = new THREE.Fog(0x0a0a14, 70, 160)

  // Sol extérieur (rue entre les immeubles)
  plane(120, 120, 0x1a1a1a)

  const W = ROOM.maxX - ROOM.minX          // 48
  const D = ROOM.frontZ - ROOM.backZ       // 24
  const CY = ROOM.ceilY

  // ── SALLE DE FÊTE — parquet, murs, plafond ; ouverte seulement en façade ──
  box(W, 0.3, D, 0x4a3520, 0, 0.15, ROOM_CZ)                 // parquet
  box(W, 0.3, D, 0x15101e, 0, CY, ROOM_CZ)                   // plafond
  box(W, CY, 0.4, 0x231a2e, 0, CY / 2, ROOM.backZ)           // mur du fond
  box(0.4, CY, D, 0x231a2e, ROOM.minX, CY / 2, ROOM_CZ)      // mur gauche
  box(0.4, CY, D, 0x231a2e, ROOM.maxX, CY / 2, ROOM_CZ)      // mur droit
  // Plinthe/rambarde basse en façade (sous le niveau des yeux du sniper : ne
  // bouche JAMAIS sa vue plongeante sur le parquet)
  box(W, 0.9, 0.3, 0x2a2a3a, 0, 0.45, ROOM.frontZ)
  // Façade AU-DESSUS de l'ouverture (au-dessus du plafond → n'occulte rien)
  box(W + 6, 10, 0.6, 0x12121c, 0, CY + 5, ROOM.frontZ)
  for (let fx = -20; fx <= 20; fx += 5) {
    for (let fy = CY + 1.5; fy <= CY + 9; fy += 3.5) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0xffdd88 : 0x223344 }))
      w.position.set(fx, fy, ROOM.frontZ + 0.35); add(w)
    }
  }
  // Piliers d'angle de la baie (fins)
  for (const px of [ROOM.minX, ROOM.maxX]) box(0.6, CY, 0.6, 0x0a0a12, px, CY / 2, ROOM.frontZ)

  // ── MOBILIER (décor + couverts qui cassent la ligne de mire du sniper) ──
  // Scène/DJ au fond
  box(8, 1.2, 1.6, 0x1a1a1a, 0, 0.6, ROOM.backZ + 2)
  box(7.4, 0.18, 1.2, 0x222222, 0, 1.28, ROOM.backZ + 2)     // plateau DJ
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8),
      new THREE.MeshBasicMaterial({ color: [0xff2200, 0x00ff88, 0x2244ff][i] }))
    led.position.set(-4 + i * 4, 1.3, ROOM.backZ + 1.2); add(led)
  }
  box(1.4, 2.4, 1.0, 0x111111, -5.5, 1.2, ROOM.backZ + 1.5)  // enceinte G
  box(1.4, 2.4, 1.0, 0x111111, 5.5, 1.2, ROOM.backZ + 1.5)   // enceinte D

  // Bars latéraux (supports de pièces d'arme)
  box(7, 1.3, 1.4, 0x2a1a10, ROOM.minX + 5, 0.65, ROOM_CZ + 2)
  box(7.2, 0.12, 1.5, 0x3a2810, ROOM.minX + 5, 1.36, ROOM_CZ + 2)
  for (let i = 0; i < 5; i++) {
    cyl(0.13, 0.13, 0.6, [0x228800, 0xaa4400, 0x8800aa, 0x884400, 0x2288aa][i],
      ROOM.minX + 2.5 + i * 0.7, 1.66, ROOM_CZ + 1.4)
  }
  box(7, 1.3, 1.4, 0x102a1a, ROOM.maxX - 5, 0.65, ROOM_CZ - 3)
  box(7.2, 0.12, 1.5, 0x10381f, ROOM.maxX - 5, 1.36, ROOM_CZ - 3)

  // Canapés + tables basses répartis (couverts au sol)
  const lounges = [
    [-16, ROOM.backZ + 5, 0x3a1a2a], [16, ROOM.backZ + 5, 0x1a2a3a],
    [-15, ROOM.frontZ - 5, 0x2a1a3a], [15, ROOM.frontZ - 5, 0x1a3a2a],
  ]
  for (const [lx, lz, col] of lounges) {
    box(5, 0.6, 1.4, col, lx, 0.3, lz)
    box(5, 0.9, 0.5, col, lx, 0.65, lz - 0.75)              // dossier
  }
  box(2.4, 0.4, 1.2, 0x2a2a2a, 12, 0.2, ROOM_CZ + 4)         // table basse (support pièce)
  box(2.4, 0.4, 1.2, 0x2a2a2a, -12, 0.2, ROOM_CZ - 6)

  // Boule à facettes + fil
  const discoBall = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 14),
    new THREE.MeshLambertMaterial({ color: 0xdddddd }))
  discoBall.position.set(0, CY - 2.5, ROOM_CZ); add(discoBall)
  box(0.05, 2, 0.05, 0x888888, 0, CY - 1.4, ROOM_CZ)

  // ── ÉCLAIRAGE de la salle (grille modérée + fort ambiant → coins éclairés,
  // sans multiplier les point lights au point de plomber les perfs WebGL) ──
  for (let lx = -18; lx <= 18; lx += 9) {
    for (let lz = ROOM.backZ + 5; lz <= ROOM.frontZ - 3; lz += 9) {
      const room = new THREE.PointLight(0xfff0dd, 1.6, 34)
      room.position.set(lx, CY - 2, lz); add(room)
    }
  }

  // ── LUMIÈRES DE FÊTE colorées ──────────────────────────────────────────
  const partyColors = [0xff0066, 0x00ffcc, 0xff6600, 0x9900ff, 0x00aaff, 0xffee00]
  for (let i = 0; i < partyColors.length; i++) {
    const pl = new THREE.PointLight(partyColors[i], 1.7, 16)
    pl.position.set(-18 + i * 7.2, CY - 3, ROOM_CZ); add(pl)
    const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 8),
      new THREE.MeshBasicMaterial({ color: partyColors[i] }))
    spot.position.set(-18 + i * 7.2, CY - 1.6, ROOM_CZ); add(spot)
  }

  // ── PISTE DE DANSE (repère + zone de concentration de la foule) ─────────
  const DANCE_CENTER = new THREE.Vector3(0, 0, ROOM_CZ)
  const DANCE = { center: DANCE_CENTER, radiusX: 10, radiusZ: 6 }
  const danceFloor = new THREE.Mesh(new THREE.PlaneGeometry(DANCE.radiusX * 2, DANCE.radiusZ * 2),
    new THREE.MeshBasicMaterial({ color: 0x220033, transparent: true, opacity: 0.6 }))
  danceFloor.rotation.x = -Math.PI / 2
  danceFloor.position.set(0, 0.32, ROOM_CZ); add(danceFloor)
  for (let dx = -8; dx <= 8; dx += 2) {
    for (let dz = -4; dz <= 4; dz += 2) {
      if ((dx + dz) % 4 === 0) {
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8),
          new THREE.MeshBasicMaterial({ color: 0x440055, transparent: true, opacity: 0.5 }))
        tile.rotation.x = -Math.PI / 2
        tile.position.set(dx, 0.33, ROOM_CZ + dz); add(tile)
      }
    }
  }

  // ── IMMEUBLE DU NID DE SNIPER (en face, côté Z positif) ──────────────
  // L'œil du sniper est posé au bord de la fenêtre (juste devant la façade de
  // son immeuble), en léger surplomb, pile en face de la baie de la salle.
  const EYE = { x: 0, y: 7, z: 4 }
  box(W + 8, 20, 8, 0x111118, 0, 10, EYE.z + 5)              // corps de l'immeuble (derrière l'œil)
  box(W + 8, 0.4, 8, 0x1a1a22, 0, 20.2, EYE.z + 5)           // toit
  // Fenêtres décoratives sur la façade (tournées vers la salle)
  for (let fx = -20; fx <= 20; fx += 5) {
    for (let fy = 3; fy <= 17; fy += 3.5) {
      if (Math.abs(fx) < 3 && Math.abs(fy - EYE.y) < 2) continue   // laisse la baie du nid vide
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.8),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xffdd88 : 0x223344 }))
      w.position.set(fx, fy, EYE.z + 0.95); w.rotation.y = Math.PI; add(w)
    }
  }
  // Marqueur lumineux du nid : visible UNIQUEMENT depuis la salle (plane
  // tourné vers -Z, derrière l'œil du sniper) → jamais dans le champ du
  // sniper, mais le contre-tueur repère le nid grâce à lui.
  const nestWindow = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3.2),
    new THREE.MeshBasicMaterial({ color: 0xffcc66 }))
  nestWindow.position.set(0, EYE.y, EYE.z + 0.9); nestWindow.rotation.y = Math.PI; add(nestWindow)
  const nestGlow = new THREE.PointLight(0xffcc66, 1.2, 10)
  nestGlow.position.set(0, EYE.y, EYE.z + 0.2); add(nestGlow)
  // Appui de fenêtre bas (sous les yeux — ne bouche pas la vue)
  box(5, 0.5, 0.5, 0x2a2a3a, 0, EYE.y - 1.4, EYE.z - 0.3)

  // ── SILHOUETTE DU SNIPER (visible depuis la salle) ────────────────────
  // Une forme sombre se découpe sur la fenêtre éclairée + un canon de fusil qui
  // dépasse : le contre-tueur a enfin quelque chose à VISER (pas juste le laser).
  // Placée DERRIÈRE l'œil du sniper (z > EYE.z) → jamais dans son propre champ.
  const sil = new THREE.MeshStandardMaterial({ color: 0x05050a, roughness: 1, metalness: 0 })
  const silTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.7, 6, 10), sil)
  silTorso.position.set(0, EYE.y - 0.3, EYE.z + 0.8); add(silTorso)
  const silHead = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), sil)
  silHead.position.set(0, EYE.y + 0.55, EYE.z + 0.8); add(silHead)
  const silShoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9, 6, 10), sil)
  silShoulders.rotation.z = Math.PI / 2; silShoulders.position.set(0, EYE.y + 0.15, EYE.z + 0.7); add(silShoulders)
  // Canon de fusil qui sort de la fenêtre vers la salle (aligné sur le muzzle du laser)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.5, metalness: 0.4 }))
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0.28, EYE.y - 0.4, EYE.z - 0.6); add(barrel)
  const scopeGlint = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5555 }))
  scopeGlint.position.set(0.28, EYE.y - 0.15, EYE.z + 0.3); add(scopeGlint)   // reflet rouge de la lunette

  // ── PIÈCES D'ARME (canon / poignée / culasse) — positions ALÉATOIRES ────
  // Tirées sous seed partagé → les deux joueurs sont d'accord, mais elles
  // CHANGENT à chaque manche : le sniper ne peut plus camper des spots fixes.
  // Bien espacées les unes des autres pour couvrir toute la salle.
  const partColors = [0xffaa22, 0x22ccff, 0x66ff66]
  const partLabels = ['canon', 'poignée', 'culasse']
  const partSpots = []
  for (let i = 0; i < 3; i++) {
    let pos, tries = 0
    do {
      pos = new THREE.Vector3(
        ROOM.minX + 3 + Math.random() * (W - 6),
        0.6,
        ROOM.backZ + 4 + Math.random() * (D - 7))
      tries++
    } while (tries < 40 && partSpots.some(p => p.pos.distanceTo(pos) < 9))
    partSpots.push({ pos, color: partColors[i], label: partLabels[i] })
  }
  const partMeshes = partSpots.map(p => {
    const g = new THREE.Group()
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0),
      new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.7, roughness: 0.3 }))
    g.add(core)
    const glow = new THREE.PointLight(p.color, 1.6, 6)
    g.add(glow)
    g.position.copy(p.pos)
    add(g)
    return g
  })

  return {
    nest: {
      cameraPos: [EYE.x, EYE.y, EYE.z],
      // Origine du LASER : décalée sous/devant l'œil (comme un canon de fusil)
      // pour que le sniper voie son propre trait converger vers sa visée, au
      // lieu d'un point coaxial invisible pile au centre de l'écran.
      muzzlePos: [EYE.x, EYE.y - 0.7, EYE.z - 0.6],
      // Ce que le contre-tueur doit toucher (la fenêtre du nid)
      windowBox: new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(EYE.x, EYE.y, EYE.z), new THREE.Vector3(5.5, 4, 2.4)),
      // La baie est large mais fixe : on borne la visée à ce qu'elle couvre.
      yawRange: 0.85,
      pitchMin: -0.62, pitchMax: 0.10,
      defaultPitch: -0.28,
    },
    // Spawn ALÉATOIRE dans la salle (généré sous seed partagé → identique chez
    // les deux joueurs), pas toujours au centre. On garde une marge de 4 u avec
    // les murs et on évite la zone tout au fond (scène DJ).
    pnjSpawn: [
      ROOM.minX + 4 + Math.random() * (W - 8),
      0,
      ROOM.backZ + 5 + Math.random() * (D - 8),
    ],
    // Bornes STRICTEMENT à l'intérieur de la salle (marge de 2 u avec les murs,
    // et la façade reste devant en frontZ-2 → le joueur ne sort jamais dehors).
    moveBounds: { minX: ROOM.minX + 2, maxX: ROOM.maxX - 2, minZ: ROOM.backZ + 2, maxZ: ROOM.frontZ - 2 },
    danceFloor: DANCE,
    roomCenter: [0, 1.5, ROOM_CZ],
    partSpots: partSpots.map((p, i) => ({ ...p, mesh: partMeshes[i] })),
  }
}
