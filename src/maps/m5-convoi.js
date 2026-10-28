// M5, le convoi : la route du désert vue du promontoire (plan du lot 3a, tâche A1 : découpage de l'ancien
// src/maps.js). Les jeeps du convoi sont construites par makeJeep (prims.js) et menées par main.js.
import * as THREE from 'three'
import { scene, setLighting } from '../scene.js'
import { clear, add, box, plane, cylinder, solide } from './prims.js'

// ─── MAP 5 : Convoi, route traversante, cible en voiture ────────────
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
  solide(box(90, 0.2, 9, 0x3a3a3a, 0, 0.1, -4), 'sol')
  // Bandes centrales
  for (let x = -42; x <= 42; x += 7) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xddcc44 }))
    line.rotation.x = -Math.PI / 2
    line.position.set(x, 0.22, -4); add(line)
  }
  // Bas-côtés sableux
  solide(box(90, 0.05, 2, 0x8a7a55, 0, 0.12, -8.5), 'sol')
  solide(box(90, 0.05, 2, 0x8a7a55, 0, 0.12, 0.5), 'sol')

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
    add(solide(rock))
  }

  // ── MESAS à l'horizon (silhouettes de canyon, profondeur western) ────
  for (const [mx, mz, mw, mh] of [[-70, -60, 26, 16], [55, -70, 34, 20], [0, -88, 42, 14], [82, -42, 20, 12]]) {
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(mw * 0.42, mw * 0.55, mh, 7),
      new THREE.MeshLambertMaterial({ color: 0x8a6f52 }))
    mesa.position.set(mx, mh / 2, mz); add(solide(mesa))
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(mw * 0.44, mw * 0.42, mh * 0.12, 7),
      new THREE.MeshLambertMaterial({ color: 0x9d8262 }))
    cap.position.set(mx, mh + mh * 0.06, mz); add(solide(cap))
  }

  // ── GLISSIÈRES de sécurité le long de la route ───────────────────────
  for (const gz of [-8.7, 0.7]) {
    solide(box(88, 0.22, 0.08, 0x9aa0a4, 0, 0.72, gz, false), 'metal')
    for (let px = -42; px <= 42; px += 6) solide(box(0.12, 0.72, 0.12, 0x6d7276, px, 0.36, gz, false), 'metal')
  }

  // ── ÉPAVES / véhicules du convoi déjà arrêtés (décor, HORS de la chaussée) ──
  // La route (avec bas-côtés) couvre z=[-8.5, 0.5] ; les jeeps roulent à z=-4.
  // Ces épaves sont posées bien au-delà, dans le sable, pour ne jamais être traversées.
  // Camion en panne à gauche
  solide(box(5, 2.6, 3, 0x6a6a4a, -34, 1.3, -13), 'metal')
  solide(box(3, 2, 3, 0x5a5a3a, -36, 1, -13), 'metal')
  solide(cylinder(0.6, 0.6, 0.4, 0x222222, -34, 0.4, -11), 'metal')   // roue
  // Blindé à droite
  solide(box(6, 2.4, 3.4, 0x4a5a3a, 34, 1.2, 6), 'metal')
  solide(cylinder(1, 1.2, 0.7, 0x3a4a2a, 34, 2.6, 6), 'metal')         // tourelle
  solide(box(4, 0.3, 0.3, 0x2a3a1a, 37, 2.6, 6), 'metal')              // canon

  // ── ARBRES MORTS désertiques (en arrière-plan) ───────────────────────
  for (let i = 0; i < 8; i++) {
    const x = (Math.random() - 0.5) * 90
    const z = -18 - Math.random() * 22
    solide(cylinder(0.15, 0.25, 2.5 + Math.random() * 2, 0x6a5a45, x, 1.5, z), 'bois')
  }

  // ── PROMONTOIRE SNIPER (rocher surélevé, derrière la caméra) ─────────
  box(8, 6, 6, 0x8a7a5a, 0, 3, 27)
  box(8, 0.4, 6, 0x9a8a6a, 0, 6.2, 27)   // plateau

  // ── PYLÔNES électriques le long de la route (profondeur) ─────────────
  for (const px of [-30, 0, 30]) {
    solide(cylinder(0.2, 0.3, 10, 0x777777, px, 5, -22), 'metal')
    solide(box(4, 0.3, 0.3, 0x777777, px, 9, -22), 'metal')
    solide(box(4, 0.3, 0.3, 0x777777, px, 8, -22), 'metal')
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

  // Ancres : les lieux nommés que la mission cite (src/campaign/missions/m5.js ; sortes décrites dans son index.js)
  return {
    groundY:   0.2,                // dessus de la route (0,1 + 0,2 / 2) : PNJ, jeeps et occupants
    acoustics: 'colline',          // désert et collines, très ouvert : des retours lointains qui roulent
    ancres: {
      oeil:   [0, 7, 24],          // le promontoire
      regard: [0, 1, -4],          // vise la route
      zone:   { minX: -30, maxX: 30, minZ: -7, maxZ: -1 },   // la route ; les occupants du convoi y sont tirés, puis assis
      route:  { z: -4, depart: -55, sens: 1 },              // l'axe de la route ; le convoi y entre par la gauche, vers +X
      places: {}, sorties: {}, abris: {},
    },
  }
}
