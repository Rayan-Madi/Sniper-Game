// M4, la base militaire : la cour vue de la tour de garde (plan du lot 3a, tâche A1 : découpage de l'ancien
// src/maps.js).
import * as THREE from 'three'
import { scene, setLighting } from '../scene.js'
import { clear, add, box, plane, cylinder, solide } from './prims.js'

// ─── MAP 4 : Base militaire, plein jour, vue depuis tour de garde ────
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
  solide(box(40, 0.2, 36, 0x6a6a60, 0, 0.1, -4), 'sol')

  // Marquages au sol (cercle hélipad au centre)
  const heli = new THREE.Mesh(
    new THREE.RingGeometry(4, 4.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  )
  heli.rotation.x = -Math.PI / 2
  heli.position.set(0, 0.22, -4); add(heli)
  // H au centre (peinture épaisse sur le tarmac : du sol)
  solide(box(0.4, 0.05, 3, 0xffffff, -1, 0.23, -4), 'sol')
  solide(box(0.4, 0.05, 3, 0xffffff,  1, 0.23, -4), 'sol')
  solide(box(2.4, 0.05, 0.4, 0xffffff, 0, 0.23, -4), 'sol')

  // ── CLÔTURE périmètre (loin, z=-30 et côtés) ─────────────────────────
  for (let i = -16; i <= 16; i += 2) {
    solide(box(0.12, 3.5, 0.12, 0x999988, i * 2, 1.75, -32), 'metal')
  }
  solide(box(68, 0.1, 0.1, 0xaaaa99, 0, 3.4, -32), 'metal')
  solide(box(68, 0.1, 0.1, 0xaaaa99, 0, 2.4, -32), 'metal')
  solide(box(68, 0.1, 0.1, 0xaaaa99, 0, 1.4, -32), 'metal')

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
  solide(box(12, 8, 0.3, 0x3a4a2a, 0, 4, -23.9), 'metal')
  solide(box(0.3, 8, 0.3, 0x556644, -6, 4, -23.9), 'metal')
  solide(box(0.3, 8, 0.3, 0x556644,  6, 4, -23.9), 'metal')

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
  solide(box(3, 2.4, 7, 0x4a5a3a, -15, 1.2, 6), 'metal')
  solide(box(3, 1.4, 3, 0x3a4a2a, -15, 2.8, 8), 'metal')    // cabine
  solide(box(3, 2.4, 7, 0x4a5a3a,  15, 1.2, 6), 'metal')
  solide(box(3, 1.4, 3, 0x3a4a2a,  15, 2.8, 8), 'metal')
  // Jeep au fond
  solide(box(2.4, 1.4, 4, 0x5a6a4a, -10, 0.7, -16), 'metal')
  solide(box(2.4, 1.4, 4, 0x5a6a4a,  10, 0.7, -16), 'metal')

  // ── TONNEAUX / caisses sur les bords ─────────────────────────────────
  for (let i = 0; i < 5; i++) {
    solide(cylinder(0.5, 0.5, 1.2, 0x4a6a3a, -19 + Math.random() * 2, 0.6, -2 + i * 3), 'metal')
    solide(cylinder(0.5, 0.5, 1.2, 0x6a5a2a,  19 - Math.random() * 2, 0.6, -2 + i * 3), 'metal')
  }

  // ── TOUR RADAR (décor, au fond gauche) ───────────────────────────────
  solide(cylinder(0.3, 0.4, 12, 0x888888, -26, 6, -26), 'metal')
  const dish = new THREE.Mesh(new THREE.SphereGeometry(2, 12, 8, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide }))
  dish.position.set(-26, 12, -26); dish.rotation.z = 0.5; add(solide(dish, 'metal'))

  // ── DRAPEAU au centre-fond (la balle traverse le tissu) ──────────────
  solide(cylinder(0.1, 0.1, 8, 0xaaaaaa, -8, 4, 4), 'metal')
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.5),
    new THREE.MeshBasicMaterial({ color: 0x335533, side: THREE.DoubleSide }))
  flag.position.set(-6.7, 7, 4); add(flag)

  return {
    // Cour centrale dégagée : x=[-15,15], z=[-18,6], aucun obstacle
    spawnBounds: { minX: -15, maxX: 15, minZ: -18, maxZ: 6 },
    groundY:      0.2,             // dessus du tarmac (0,1 + 0,2 / 2)
    cameraPos:    [0, 14.5, 21],   // bord AVANT de la tour, rien devant
    cameraTarget: [0, 1, -6],      // plonge vers la cour
    indoors: false,
    acoustics: 'base',             // champ ouvert : écho court
  }
}
