// M2, les frères : la place de nuit vue du toit (plan du lot 3a, tâche A1 : découpage de l'ancien src/maps.js).
import * as THREE from 'three'
import { scene, setLighting } from '../scene.js'
import { clear, add, box, plane, cylinder, car, building, solide } from './prims.js'

// ─── MAP 2 : Plaza de nuit, toit d'immeuble, vue plongeante ─────────
// Sniper sur le toit d'un immeuble en bordure de place
// Caméra à y=22, orientée vers le bas (pitch négatif) sur la place en contrebas
// Zone des PNJ (ancre zone) = la place AU SOL, directement visible depuis le toit
export function buildMapWarehouse() {
  clear()
  setLighting({ ambientI: 0.85, sunI: 0.6, fillI: 0.4, sunColor: 0x9fb0dd, ambColor: 0x8fa0c8 })
  scene.background = new THREE.Color(0x0a0a18)
  scene.fog = new THREE.Fog(0x0a0a18, 40, 100)

  // Grande place dallée au sol
  plane(60, 60, 0x3a3a3a)

  // Dallage : lignes blanches
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
    solide(box(1.8, 0.35, 0.5, 0x5a4a3a, bx, 0.17, bz), 'bois')   // banc
    solide(cylinder(0.08, 0.08, 5, 0x888888, bx + 2, 2.5, bz), 'metal') // lampadaire
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

  // Façade immeuble : fenêtres éclairées
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

  // Ancres : les lieux nommés que la mission cite (src/campaign/missions/m2.js ; sortes décrites dans son index.js)
  return {
    groundY:   0,                      // la place dallée
    acoustics: 'place',                // écho de la place, entourée d'immeubles
    ancres: {
      oeil:   [0, 22.5, 22],           // sur le toit de l'immeuble nord
      regard: [0, 0, 0],               // le centre de la place, en bas
      zone:   { minX: -14, maxX: 14, minZ: -14, maxZ: 14 },   // toute la place au sol, bien visible depuis le toit
      places: {}, sorties: {}, abris: {},
    },
  }
}
