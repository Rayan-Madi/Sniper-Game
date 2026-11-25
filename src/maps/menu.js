// Décor du menu (spec du lot 3, §2 3b, choix « Menu », approche B ; plan du lot 3a, tâche A1) : la rue de M1
// d'avant le lot 3, figée ici. Elle se monte derrière le menu au démarrage, au retour d'une mission et au retour du
// PvP (main.js, pvp.js), pendant que la caméra du menu tourne autour. Copie volontaire de la carte de M1 telle
// qu'elle était au découpage de src/maps.js : le sous-lot 3b réécrit M1 (m1-rue.js) sans toucher au menu, qui garde
// ses références du memtest du lot 1 et les immeubles autour desquels tourne sa caméra. Pas de zone d'apparition,
// de poste ni d'écho : le menu n'est pas une mission.
// Son profil de caméra est le profil hors mission (src/gfx/cameraProfile.js : plans de 0,1 à 200 m, sa brume de 50 à
// 140 m, soleil en (20, 40, 10) visé vers l'origine, cadre d'ombre de ±60 m), reposé à chaque montage : une mission
// quittée (showMenu) ou une manche PvP (QUITTER) n'y laisse ni son plan lointain, ni sa brume, ni son soleil (spec du
// lot 3, §2 b).
import * as THREE from 'three'
import { scene, camera, sun, setLighting } from '../scene.js'
import { resetCameraProfile } from '../gfx/cameraProfile.js'
import { clear, add, box, plane, cylinder, tree, car, building, solide } from './prims.js'

export function buildMenuDecor() {
  clear()
  setLighting({ ambientI: 0.65, sunI: 1.2, fillI: 0.4, sunColor: 0xfff0cc })
  scene.background = new THREE.Color(0x87a0b0)
  resetCameraProfile(camera, scene, sun)

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

  // Kiosque marché avec auvent (bois)
  solide(box(4, 0.1, 3, 0xcc8844, 6, 2.4, 5), 'bois')
  solide(box(0.1, 2.4, 0.1, 0x885522, 4, 1.2, 3.5), 'bois')
  solide(box(0.1, 2.4, 0.1, 0x885522, 8, 1.2, 3.5), 'bois')
  solide(box(0.1, 2.4, 0.1, 0x885522, 4, 1.2, 6.5), 'bois')
  solide(box(0.1, 2.4, 0.1, 0x885522, 8, 1.2, 6.5), 'bois')

  // Lampadaires rue
  for (let lz = -10; lz <= 10; lz += 8) {
    solide(cylinder(0.08, 0.1, 7, 0x666666, 12, 3.5, lz), 'metal')
    const lp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffbb }))
    lp.position.set(12, 7.3, lz); add(lp)
    const pl = new THREE.PointLight(0xffdd88, 1.2, 15)
    pl.position.set(12, 7, lz); add(pl)
    solide(cylinder(0.08, 0.1, 7, 0x666666, -12, 3.5, lz), 'metal')
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
    solide(cylinder(0.28, 0.32, 0.75, 0x445544, -4 + i * 6, 0.37, 14), 'metal')
  }
}
