// M3, le port : quai, conteneurs et pluie, vus de la pile de conteneurs (plan du lot 3a, tâche A1 : découpage de
// l'ancien src/maps.js).
import * as THREE from 'three'
import { scene, setLighting } from '../scene.js'
import { clear, add, box, plane, cylinder, solide, setMapAmbient } from './prims.js'

// ─── MAP 3 : Port de nuit, entrepôt côtier ──────────────────────────
// RÈGLE : caméra fixe à [0, 10, 28], regarde vers z=0 (droit devant)
// Spawn = rectangle z=[-12, 8], x=[-14, 14] : PLAT, VIDE, visible à 100%
export function buildMapDocks() {
  clear()
  setLighting({ ambientI: 0.9, sunI: 0.7, fillI: 0.45, sunColor: 0x9fb0dd, ambColor: 0x8fa0c4 })
  scene.background = new THREE.Color(0x0a1520)
  scene.fog = new THREE.Fog(0x0a1520, 35, 95)

  // ── SOL ──────────────────────────────────────────────────────────────
  plane(200, 200, 0x252520)
  // Dalle béton quai (zone de spawn uniquement, aucun obstacle dedans)
  solide(box(34, 0.35, 26, 0x2e2e28, 0, 0.17, -2), 'sol')

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
  solide(box(7, 8, 0.3, 0x2a2a25, -9, 4, -20.1), 'metal')
  solide(box(7, 8, 0.3, 0x2a2a25,  9, 4, -20.1), 'metal')
  solide(box(2, 8, 0.3, 0x333330,  0, 4, -20.1), 'metal')
  // Fenêtres entrepôt allumées
  for (let wx = -14; wx <= 14; wx += 7) {
    const ww = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.2),
      new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.7 }))
    ww.position.set(wx, 8.5, -20.12); add(ww)
    const pl = new THREE.PointLight(0xffdd88, 0.8, 12)
    pl.position.set(wx, 8.5, -19); add(pl)
  }

  // Bateau amarré à gauche (décor, loin de la zone spawn), coque et mât en acier
  solide(box(24, 4, 9, 0x1a2535, -28, 2, -18), 'metal')
  solide(box(22, 0.8, 7, 0x243040, -28, 4.5, -18), 'metal')
  solide(box(7, 5, 5, 0x1e3045, -28, 7, -14), 'metal')
  solide(cylinder(0.25, 0.3, 6, 0x222222, -26, 10, -14), 'metal')
  // Lumières bateau
  const bLight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }))
  bLight.position.set(-28, 12, -14); add(bLight)

  // Grue (décor, à droite hors spawn)
  solide(box(0.9, 22, 0.9, 0xdd8800, 28, 11, -10), 'metal')
  solide(box(18, 0.7, 0.7, 0xdd8800, 19, 22, -10), 'metal')
  solide(box(0.08, 10, 0.08, 0x888888, 22, 17, -10), 'metal')
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
      solide(box(2.4, 2.8, 5.5, cCols[(col + row * 3) % cCols.length],
        -20 + col * 0.2, row * 2.8 + 1.4, -6 + col * 0.5), 'metal')
      solide(box(2.4, 2.8, 5.5, cCols[(col + row * 2) % cCols.length],
         20 - col * 0.2, row * 2.8 + 1.4, -6 + col * 0.5), 'metal')
    }
  }

  // ── LAMPADAIRES sur la dalle (bord, n'obstruent pas le spawn) ────────
  for (const lx of [-15, 0, 15]) {
    solide(cylinder(0.08, 0.1, 7, 0x666666, lx, 3.5, 12), 'metal')
    const lp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffffaa }))
    lp.position.set(lx, 7.2, 12); add(lp)
    const pl = new THREE.PointLight(0xffdd88, 1.8, 22)
    pl.position.set(lx, 7, 12); add(pl)
  }

  // ── POSTE SNIPER : toit conteneurs empilés côté droit de l'écran ─────
  // Caméra à [0, 10, 28] : donc derrière la caméra il y a le "mur" suivant
  solide(box(14, 6, 5, 0x333330, 0, 3, 30), 'metal')     // conteneurs empilés (derrière sniper)
  solide(box(14, 0.3, 5, 0x2a2a25, 0, 6.15, 30), 'metal') // toit / plateforme
  solide(box(12, 0.8, 0.2, 0x444440, 0, 6.6, 27.6), 'metal') // muret appui sniper

  // ── BOLLARDS jaunes bord du quai ─────────────────────────────────────
  for (let bx = -14; bx <= 14; bx += 7) {
    solide(cylinder(0.16, 0.19, 1.0, 0xddcc00, bx, 0.5, 11.5), 'metal')
  }

  // ── CONTENEUR VERROUILLÉ (choix moral), bien visible, face au sniper ──
  solide(box(2.6, 3, 6, 0x8a1f1f, -16.5, 1.5, 2), 'metal')              // conteneur rouge sombre
  // chaînes en croix sur la porte avant
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.35 })
  const ch1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.06), chainMat)
  ch1.position.set(-16.5, 1.5, 5.06); ch1.rotation.z = 0.5; add(solide(ch1, 'metal'))
  const ch2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.09, 0.06), chainMat)
  ch2.position.set(-16.5, 1.5, 5.06); ch2.rotation.z = -0.5; add(solide(ch2, 'metal'))

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
  setMapAmbient((dt) => {
    const p = rainGeo.attributes.position.array
    for (let i = 1; i < RAIN_N * 3; i += 3) {
      p[i] -= dt * 24                 // chute rapide
      if (p[i] < 0) p[i] = 22        // recycle en haut
    }
    rainGeo.attributes.position.needsUpdate = true
  })

  return {
    // Zone de spawn : dalle plate, aucun obstacle, x=[-13,13] z=[-11,10]
    spawnBounds: { minX: -13, maxX: 13, minZ: -11, maxZ: 10 },
    groundY:      0.345,         // dessus de la dalle du quai (0,17 + 0,35 / 2)
    cameraPos:    [0, 10, 28],
    cameraTarget: [0, 1, -2],    // vise le quai en contrebas
    indoors: false,
    acoustics: 'port',           // écho long et métallique, entre conteneurs et hangars
    rain: true,                  // la pluie s'entend pendant la mission (nappe de src/audio.js)
    // CHOIX MORAL : tirer sur le cadenas du conteneur rouge libère les victimes
    moralLock: { pos: [-16.5, 1.35, 5.15] },
  }
}
