// M6, la fête : l'appartement vu de l'immeuble d'en face (plan du lot 3a, tâche A1 : découpage de l'ancien
// src/maps.js).
import * as THREE from 'three'
import { scene, setLighting } from '../scene.js'
import { clear, add, box, plane, cylinder, solide, traversable, addObstacle } from './prims.js'

// ─── MAP 6 : Fête d'appartement, vue depuis couloir / fenêtre opposée ─
// Grande salle pleine de monde : civils nombreux, cible à identifier
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

  // ── SALLE DE FÊTE : pièce OUVERTE côté caméra (sinon on ne voit rien) ──
  // Sol parquet : SURFACE à y=0 (les PNJ ont les pieds à 0). Auparavant la
  // surface était à 0,3 → tout le monde (et les meubles) semblait enfoncé.
  solide(box(30, 0.2, 9, 0x4a3520, 0, -0.1, -20.5), 'sol')
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
    solide(box(0.3, 8, 0.3, 0x0a0a12, px, 4, -16), 'metal')
  }
  // Rambarde basse de la baie vitrée
  solide(box(30, 0.6, 0.2, 0x2a2a3a, 0, 1, -16), 'metal')

  // ── MOBILIER intérieur (décor de fête), en bois ──────────────────────
  // Table DJ (fond)
  solide(box(5, 1.1, 1.2, 0x1a1a1a, 0, 0.55, -24), 'bois')
  solide(box(4.6, 0.15, 0.9, 0x222222, 0, 1.18, -24), 'bois')  // plateau
  // Enceintes DJ
  solide(box(1.0, 1.8, 0.8, 0x111111, -3.2, 0.9, -24), 'bois')
  solide(box(1.0, 1.8, 0.8, 0x111111,  3.2, 0.9, -24), 'bois')
  // Leds enceintes
  for (let i = 0; i < 3; i++) {
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8),
      new THREE.MeshBasicMaterial({ color: [0xff2200, 0x00ff88, 0x2244ff][i] }))
    led.position.set(-3.2 + i * 3.2, 1.2, -24.62); add(led)
  }

  // Canapés
  solide(box(4, 0.55, 1.2, 0x3a1a2a, -8, 0.27, -22), 'bois')
  solide(box(4, 0.8, 0.5, 0x3a1a2a, -8, 0.6, -22.6), 'bois')   // dossier
  solide(box(4, 0.55, 1.2, 0x1a2a3a,  8, 0.27, -22), 'bois')
  solide(box(4, 0.8, 0.5, 0x1a2a3a,  8, 0.6, -22.6), 'bois')

  // Tables basses
  solide(box(1.8, 0.35, 0.9, 0x2a2a2a, -8, 0.17, -20.5), 'bois')
  solide(box(1.8, 0.35, 0.9, 0x2a2a2a,  8, 0.17, -20.5), 'bois')

  // Meubles BAS (canapés + dossiers, tables) : trop bas pour être détectés
  // automatiquement par box() (seuil h ≥ 1,1) → on les déclare explicitement
  // comme obstacles pour que les PNJ ne les traversent plus.
  for (const [ox, oz, ow, od] of [
    [-8, -22.1, 4, 1.8], [8, -22.1, 4, 1.8],       // canapés (assise + dossier)
    [-8, -20.5, 1.8, 0.9], [8, -20.5, 1.8, 0.9],   // tables basses
  ]) {
    addObstacle({ minX: ox - ow / 2, maxX: ox + ow / 2, minZ: oz - od / 2, maxZ: oz + od / 2 })
  }

  // Bar côté gauche
  solide(box(5, 1.2, 1.2, 0x2a1a10, -10, 0.6, -19), 'bois')
  solide(box(5.2, 0.1, 1.3, 0x3a2810, -10, 1.26, -19), 'bois') // comptoir
  // Bouteilles sur le bar (verre : la balle les traverse)
  for (let i = 0; i < 4; i++) {
    traversable(cylinder(0.12, 0.12, 0.55, [0x228800, 0xaa4400, 0x8800aa, 0x884400][i],
      -12 + i * 0.6, 1.55, -18.45))
  }

  // Boule à facettes (disco ball)
  const discoBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 12),
    new THREE.MeshLambertMaterial({ color: 0xdddddd, wireframe: false })
  )
  discoBall.position.set(0, 6.5, -20); add(solide(discoBall, 'metal'))
  // Fil de suspension
  solide(box(0.04, 1.2, 0.04, 0x888888, 0, 7.1, -20), 'metal')

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

  // Lumière au sol : piste de danse
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
    solide(cylinder(0.35, 0.4, 0.9, 0x333322, i * 4, 0.45, -5), 'metal')  // poubelle
    solide(cylinder(0.38, 0.38, 0.05, 0x222211, i * 4, 0.92, -5), 'metal') // couvercle
  }

  // Quelques passants dans la rue (zone spawn)
  // Lampadaires rue
  for (let lx = -10; lx <= 10; lx += 10) {
    solide(cylinder(0.08, 0.1, 6, 0x666666, lx, 3, -5), 'metal')
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
    acoustics: 'interieur',           // le tireur est dans l'appartement d'en face : écho court et sourd
    sideExit: true,                   // les PNJ fuient vers les côtés (sorties latérales)
    party: true,                      // la foule danse (ambiance fête)
    // Cible à identifier : AUCUN signe distinctif visuel, même allure que la foule.
    // Seul indice : son comportement. À toi d'observer.
    // Assis sur le canapé de gauche (seatY cale l'assise sur la banquette). En fuite, il se lève devant l'assise, au-dessus
    // de ses pieds (standUp : pas en x et z, en m) : debout entre le canapé et la table basse, il court sans les traverser.
    hiddenTarget: {
      spawn: [-8, -21.7],
      seatY: 0.2,
      standUp: [0, 0.5],
      clue:  "Aucune photo. Aucun nom. Une seule certitude : pendant que tout le monde danse... lui reste assis à négocier au téléphone.",
    },
  }
}
