import * as THREE from 'three'
import { scene, camera, setLighting } from './scene.js'
import { clearMap, makeJeep } from './maps.js'
import { startCinematicMusic, stopCinematicMusic, startPhoneVoice, stopPhoneVoice } from './audio.js'
import { spawnCharacter } from './characters.js'

// ─── Moteur de cinématiques 3D (caméra qui filme) ───────────────────
let active = false
let t = 0, total = 0
let keyframes = [], textCues = []
let onDoneCb = null
let objects = []
let overlay = null, textEl = null
let savedBg = null, savedFog = null
let animated = []   // objets animés pendant la cinématique : { fn }
let blood = []      // particules de sang
let cinMixers = []  // mixers d'animation des modèles .glb en cinématique
let lastFrameT = 0
let phoneOn = false

function add(obj) { scene.add(obj); objects.push(obj); return obj }
function animate(fn) { animated.push(fn) }

// Jet de sang : particules rouges avec gravité, à (x,y,z)
function spawnBlood(x, y, z, n = 12, spread = 3, dir = null) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.025 + Math.random() * 0.05, 5, 5),
      new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? 0x5a0000 : 0x8a0a0a }))
    m.position.set(x, y, z); add(m)
    const base = dir || { x: 0, y: 0, z: 0 }
    blood.push({
      m,
      vx: base.x + (Math.random() - 0.5) * spread,
      vy: base.y + Math.random() * 2.6 + 1.4,
      vz: base.z + (Math.random() - 0.5) * spread,
      born: t, life: 0.9 + Math.random() * 0.5,
    })
  }
}

// Poussière / particules d'ambiance flottantes (profondeur + vie dans le cadre)
function addDust(count, area, ymax, color = 0xffffff, opacity = 0.3) {
  const motes = []
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.012 + Math.random() * 0.02, 4, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * (0.35 + Math.random() * 0.65) }))
    m.position.set((Math.random() - 0.5) * area, 0.3 + Math.random() * ymax, (Math.random() - 0.5) * area)
    add(m)
    motes.push({ m, ph: Math.random() * 6.28, sp: 0.25 + Math.random() * 0.5 })
  }
  animate(() => {
    for (const d of motes) {
      d.m.position.y += Math.sin(t * d.sp + d.ph) * 0.002
      d.m.position.x += Math.cos(t * 0.4 + d.ph) * 0.0015
    }
  })
}

function updateBlood(dt) {
  for (let i = blood.length - 1; i >= 0; i--) {
    const b = blood[i]
    b.vy -= 9.8 * dt
    b.m.position.x += b.vx * dt
    b.m.position.y += b.vy * dt
    b.m.position.z += b.vz * dt
    if (b.m.position.y < 0.02) { b.m.position.y = 0.02; b.vy = 0; b.vx *= 0.7; b.vz *= 0.7 }  // s'écrase au sol
    if (t - b.born > b.life) { scene.remove(b.m); blood.splice(i, 1) }
  }
}

function box(w, h, d, color, x, y, z, emissive = false) {
  const mat = emissive
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshLambertMaterial({ color })
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  if (!emissive) { m.castShadow = true; m.receiveShadow = true }
  return add(m)
}

function cyl(rt, rb, h, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }))
  m.position.set(x, y, z); m.castShadow = true
  return add(m)
}

function plane(color, size, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95 }))
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true
  return add(m)
}

// Acteur articulé low-poly (capsules + sphères, vraies articulations, ombres)
// Articulations exposées : armL/armR (épaules), elbowL/elbowR, legL/legR (hanches), kneeL/kneeR, head, torso
function figure(color, x, z, { rot = 0, rim = 0, skin = 0xe8b880, pose = 'stand', hat = 0, build = 1 } = {}) {
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 })
  const skMat   = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 })
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.9 })

  const mesh = (geo, mat, py = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = py; m.castShadow = true; return m }
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 5, 10)

  // — Bassin / torse (capsule effilée) —
  const root = new THREE.Group(); root.position.y = 0.92; g.add(root)
  const pelvis = mesh(cap(0.17 * build, 0.12), bodyMat, 0); root.add(pelvis)
  const torso = new THREE.Group(); torso.position.y = 0.18; root.add(torso)
  const chest = mesh(cap(0.2 * build, 0.34), bodyMat, 0.22); torso.add(chest)
  // épaules
  const shoulders = mesh(cap(0.1, 0.34), bodyMat, 0.42); shoulders.rotation.z = Math.PI / 2; torso.add(shoulders)

  // — Tête + cou —
  const neck = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 8), skMat, 0.5); torso.add(neck)
  const headPivot = new THREE.Group(); headPivot.position.y = 0.58; torso.add(headPivot)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), skMat); head.castShadow = true; headPivot.add(head)
  const hairm = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat)
  hairm.position.y = 0.02; headPivot.add(hairm)
  // nez
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6), skMat); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0, 0.16); headPivot.add(nose)
  if (hat) {
    const hm = new THREE.MeshStandardMaterial({ color: hat, roughness: 0.6 })
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 14), hm); brim.position.y = 0.13; headPivot.add(brim)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.2, 14), hm); top.position.y = 0.24; headPivot.add(top)
  }

  // — Bras (épaule → coude → avant-bras → main) —
  function makeArm(sx) {
    const shoulder = new THREE.Group(); shoulder.position.set(sx, 0.42, 0); torso.add(shoulder)
    const upper = mesh(cap(0.06, 0.22), bodyMat, -0.17); shoulder.add(upper)
    const elbow = new THREE.Group(); elbow.position.y = -0.34; shoulder.add(elbow)
    const fore = mesh(cap(0.055, 0.2), bodyMat, -0.15); elbow.add(fore)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skMat); hand.position.y = -0.3; hand.castShadow = true; elbow.add(hand)
    return { shoulder, elbow, hand }
  }
  const aL = makeArm(-0.26), aR = makeArm(0.26)

  // — Jambes (hanche → genou → tibia → pied) —
  function makeLeg(hx) {
    const hip = new THREE.Group(); hip.position.set(hx, -0.02, 0); root.add(hip)
    const thigh = mesh(cap(0.08, 0.26), bodyMat, -0.2); hip.add(thigh)
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee)
    const shin = mesh(cap(0.07, 0.24), bodyMat, -0.18); knee.add(shin)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.24), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }))
    foot.position.set(0, -0.34, 0.06); foot.castShadow = true; knee.add(foot)
    return { hip, knee }
  }
  const lL = makeLeg(-0.1), lR = makeLeg(0.1)

  // — Marqueur cible —
  if (rim) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 28),
      new THREE.MeshBasicMaterial({ color: rim, transparent: true, opacity: 0.9 }))
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring)
    const light = new THREE.PointLight(rim, 1.0, 6); light.position.set(0, 2, 1); g.add(light)
    animate(() => { ring.scale.setScalar(1 + Math.sin(t * 3) * 0.15) })
  }

  // — Poses —
  if (pose === 'lie') {
    g.rotation.x = -Math.PI / 2; g.position.y = 0.22
  } else if (pose === 'kneel') {
    lL.hip.rotation.x = -1.5; lL.knee.rotation.x = 1.6
    lR.hip.rotation.x = -1.5; lR.knee.rotation.x = 1.6
    root.position.y = 0.5
  }

  g.position.set(x, 0, z)
  g.rotation.y = rot
  add(g)
  // armL/armR = épaules (rotation.x = balancement) ; legL/legR = hanches
  return {
    group: g, root, torso, head: headPivot,
    armL: aL.shoulder, armR: aR.shoulder, elbowL: aL.elbow, elbowR: aR.elbow, handL: aL.hand, handR: aR.hand,
    legL: lL.hip, legR: lR.hip, kneeL: lL.knee, kneeR: lR.knee,
  }
}

// Acteur de cinématique basé sur un VRAI modèle .glb (joue Idle).
// Renvoie la même interface que figure() mais avec des poignées factices
// (les manipulations d'os procédurales deviennent sans effet, le modèle idle).
// match : force un modèle précis (ex 'gangster_man_01' → les frères sont des HOMMES)
// clip  : joue une animation précise (Threaten, Dance, Talk, Point, Sit…)
function glbActor(type, x, z, { rot = 0, rim = 0, match = null, clip = null } = {}) {
  const ch = spawnCharacter(type, { match })
  if (!ch) return figure(0x3a3a3a, x, z, { rot, rim })   // repli procédural si non chargé
  const g = new THREE.Group()
  g.add(ch.model)
  g.position.set(x, 0, z); g.rotation.y = rot
  add(g)
  // joue le clip demandé, sinon Idle, sinon la 1re anim dispo
  const act = (clip && ch.actions[clip]) || ch.actions['Idle'] || ch.firstAction
  if (act) act.reset().play()
  cinMixers.push(ch.mixer)
  // halo cible
  if (rim) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 28),
      new THREE.MeshBasicMaterial({ color: rim, transparent: true, opacity: 0.9 }))
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; g.add(ring)
    const light = new THREE.PointLight(rim, 1.0, 6); light.position.set(0, 2, 1); g.add(light)
    animate(() => { ring.scale.setScalar(1 + Math.sin(t * 3) * 0.15) })
  }
  const d = () => new THREE.Group()   // poignées factices (no-op)
  return {
    group: g, glb: true, root: d(), torso: d(), head: d(),
    armL: d(), armR: d(), elbowL: d(), elbowR: d(), handL: d(), handR: d(),
    legL: d(), legR: d(), kneeL: d(), kneeR: d(),
  }
}

function smooth(a) { return a * a * (3 - 2 * a) }
function lerp3(a, b, k) {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

// ─── Cinématique d'INTRO : flashback — Viktor découvre sa famille ────
function INTRO() {
  let viktor = null, viktorStart = 5, viktorEnd = -1.5
  return {
    music: 'somber',
    title: 'VIKTOR KANE',
    bg: 0x0a0c14, fogNear: 14, fogFar: 50,
    lighting: { ambientI: 0.6, sunI: 0.4, fillI: 0.3, sunColor: 0x5a6a9a, ambColor: 0x2a3346 },
    build() {
      // Salon familial, la nuit
      plane(0x2a2018, 40)
      // tapis
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(7, 5),
        new THREE.MeshLambertMaterial({ color: 0x4a2a22 })); rug.rotation.x = -Math.PI / 2; rug.position.set(-1, 0.02, -2); add(rug)
      // murs
      box(18, 7, 0.3, 0x2a2832, 0, 3.5, -8)
      box(0.3, 7, 16, 0x24222c, -9, 3.5, -2)
      // porte d'entrée ouverte (au fond droite) — Viktor arrive de là
      box(2.4, 5, 0.3, 0x140f0c, 6.5, 2.5, -7.85)
      box(2.0, 4.6, 0.1, 0x0a0a12, 6.5, 2.3, -7.7)  // ouverture sombre
      // canapé
      box(4, 0.6, 1.4, 0x3a2a3a, -3, 0.4, -5); box(4, 0.9, 0.4, 0x3a2a3a, -3, 0.9, -5.6)
      // table basse renversée (lutte) + lampe au sol
      box(1.6, 0.2, 1, 0x3a2a1a, -1, 0.5, -1.5);
      const fallenLamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffcc88 })); fallenLamp.position.set(1.5, 0.2, -1); add(fallenLamp)
      const floorLight = new THREE.PointLight(0xffaa66, 1.3, 14); floorLight.position.set(1.5, 0.4, -1); add(floorLight)
      // jouet d'enfant au sol
      box(0.3, 0.3, 0.3, 0x3366cc, -2.5, 0.15, -0.5)

      // La famille, au sol (silhouettes immobiles) — non graphique
      figure(0x6a3a4a, -2.5, -2.5, { pose: 'lie', rot: 0.4, skin: 0xd8a878 })       // un proche
      figure(0x4a4a6a, -0.5, -3.2, { pose: 'lie', rot: -0.8, skin: 0xd8a878 })      // un proche
      const childF = figure(0x3a6a5a, -1.6, -1.6, { pose: 'lie', rot: 0.2, skin: 0xe8c090 })
      childF.group.scale.setScalar(0.7)                                              // enfant

      // poussière dans la pénombre (maison figée dans le drame)
      addDust(28, 11, 3, 0xaabbdd, 0.18)
      // Viktor entre par la porte et s'avance vers eux
      viktor = figure(0x20242e, viktorStart, -5, { rot: Math.PI, skin: 0xd8a878 })
      animate(() => {
        const p = Math.min(1, Math.max(0, (t - 1) / 7))          // marche de t=1 à t=8
        const ease = p * p * (3 - 2 * p)
        viktor.group.position.x = viktorStart + (viktorEnd - viktorStart) * ease
        viktor.group.position.z = -5 + (-2.2 - (-5)) * ease
        // balancement de marche
        if (p < 1) {
          viktor.legL.rotation.x = Math.sin(t * 6) * 0.5
          viktor.legR.rotation.x = Math.sin(t * 6 + Math.PI) * 0.5
        } else {
          // s'agenouille auprès d'eux
          const kn = Math.min(1, (t - 8.5) / 2)
          viktor.legL.scale.y = 1 - kn * 0.5; viktor.legR.scale.y = 1 - kn * 0.5
          viktor.group.position.y = -kn * 0.4
          viktor.head.rotation.x = kn * 0.5
        }
      })
    },
    keyframes: [
      { time: 0.0,  pos: [6.5, 2.2, -3],  look: [2, 1, -3] },     // depuis la porte, on devine la pièce
      { time: 4.0,  pos: [3.5, 2.0, 0],   look: [-1.5, 0.4, -2.5] }, // révèle les corps au sol
      { time: 8.0,  pos: [0.5, 1.6, 1],   look: [-1.5, 0.5, -2.2] }, // Viktor arrive près d'eux
      { time: 12.0, pos: [-1, 1.3, 1.5],  look: [-1.5, 0.6, -2.2] }, // gros plan sur Viktor agenouillé
      { time: 15.5, pos: [-1.5, 2.2, 2.5], look: [-1.5, 0.5, -2.5] },
    ], total: 16,
    textCues: [
      { from: 0.6, to: 4.0,  text: "Ce soir-là, je suis rentré plus tôt que prévu." },
      { from: 4.4, to: 8.0,  text: "La porte était ouverte. Le silence... anormal." },
      { from: 8.4, to: 12.0, text: "Ils étaient tous là. Ils n'avaient rien fait de mal." },
      { from: 12.4, to: 16.0, text: "Un réseau voulait mon silence. Il aura ma vengeance." },
    ],
  }
}

// ─── Cinématiques par niveau (variées) ───────────────────────────────
const LEVEL_CINEMATICS = {
  // 1 — Marché : la caméra TOURNE autour de Markov
  1: () => ({
    music: 'tense',
    title: 'MISSION 01 — LE MARCHÉ',
    bg: 0x1a1a24, fogNear: 20, fogFar: 75,
    lighting: { ambientI: 0.45, sunI: 0.45, fillI: 0.3, sunColor: 0x6677aa, ambColor: 0x334455 },
    build() {
      plane(0x2a2a2a, 50)
      box(3, 0.15, 2, 0xaa6633, -5, 1.6, -4); for (const sx of [-6.4, -3.6]) box(0.12, 1.6, 0.12, 0x663311, sx, 0.8, -4)
      // Camionnette ouverte (il y jette sa victime)
      box(2.6, 1.6, 4.5, 0x444a55, 4.5, 0.8, -1)
      box(2.6, 1.6, 0.2, 0x222831, 4.5, 0.8, 1.1, false)  // hayon ouvert
      // Markov (vrai modèle) près d'une victime au sol qu'il vient de traîner
      const victim = figure(0x886644, -1.5, 0.5, { pose: 'lie', rot: 1.4, skin: 0xe8b880 })
      const m = glbActor('target', 0.2, 0, { rim: 0xff3322, rot: 2.6, match: 'gangster_man_01', clip: 'Threaten' })
      // badaud qui détourne le regard (personne n'ose intervenir)
      glbActor('civilian', -4, 3, { rot: 2.4, clip: 'Look' })
      animate(() => {
        // Markov tire la victime vers la camionnette
        const p = (Math.sin(t * 1.2) * 0.5 + 0.5)
        m.armR.rotation.x = -1.2 - p * 0.3
        victim.group.position.x = -1.5 + p * 0.4
        m.head.rotation.y = Math.sin(t * 0.6) * 0.2
      })
    },
    // ORBITE autour de la scène d'enlèvement
    keyframes: [
      { time: 0,  pos: [-8, 4, 6],  look: [-0.5, 1, 0] },
      { time: 4,  pos: [-2, 2.4, 7], look: [-0.5, 1, 0] },
      { time: 8,  pos: [6, 2.2, 4],  look: [0, 1.2, 0] },
      { time: 11.5, pos: [3.5, 1.8, 2.5], look: [0.2, 1.4, 0] },
    ], total: 12,
    textCues: [
      { from: 0.4, to: 4.4, phone: true, text: "📞 « Livraison ce soir. Jeune. Propre. Pas de traces. »" },
      { from: 4.8, to: 8.2,  text: "Markov. Écoute interceptée il y a une heure." },
      { from: 8.6, to: 12.0, text: "La « livraison », c'est elle. Il ne sentira rien." },
    ],
  }),

  // 2 — Sanctechair : abattoir, horreur. Les frères (vrais modèles) surplombent
  //     la victime ; le sang gicle ; à la fin, l'un se TOURNE lentement vers toi.
  2: () => ({
    music: 'tense',
    title: 'MISSION 02 — LES BOUCHERS',
    bg: 0x060306, fogNear: 10, fogFar: 42,
    lighting: { ambientI: 0.18, sunI: 0.12, fillI: 0.1, sunColor: 0x882222, ambColor: 0x1a0808 },
    build() {
      plane(0x0c0608, 50)
      // LAMPE SUSPENDUE QUI SE BALANCE — les ombres tanguent dans la pièce
      const lampPivot = new THREE.Group(); lampPivot.position.set(0, 4.6, 0.6); add(lampPivot)
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6),
        new THREE.MeshBasicMaterial({ color: 0x0a0a0a }))
      cord.position.y = -0.6; lampPivot.add(cord)
      const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.3, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x1c1c20, side: THREE.DoubleSide, roughness: 0.6 }))
      lampShade.position.y = -1.25; lampPivot.add(lampShade)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff6a5a }))
      bulb.position.y = -1.36; lampPivot.add(bulb)
      const red = new THREE.PointLight(0xff2018, 2.4, 16)
      red.position.y = -1.4; lampPivot.add(red)
      const backGlow = new THREE.PointLight(0x22314a, 0.8, 22); backGlow.position.set(0, 4, -7); add(backGlow)

      // corps suspendus à des crochets, qui se balancent (glauque)
      box(10, 0.15, 0.15, 0x3a3a3a, 0, 3.7, -3)
      const hung = []
      for (const hx of [-2.8, -1, 1.1, 2.9]) {
        cyl(0.025, 0.025, 0.9, 0x888888, hx, 3.25, -3)
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.75, 5, 10),
          new THREE.MeshStandardMaterial({ color: 0x431618, roughness: 0.95 }))
        body.position.set(hx, 2.15, -3); body.castShadow = true; add(body); hung.push({ body, hx })
      }

      // flaque de sang (grandit) + éclaboussures
      const bloodPool = new THREE.Mesh(new THREE.CircleGeometry(1, 24),
        new THREE.MeshStandardMaterial({ color: 0x3a0404, roughness: 0.3 }))
      bloodPool.rotation.x = -Math.PI / 2; bloodPool.position.set(0, 0.03, 0.6); bloodPool.scale.setScalar(0.7); add(bloodPool)

      // table de boucher + CORPS SOUS UN DRAP taché (suggéré = plus glaçant, plus propre)
      box(2.6, 0.18, 1.3, 0x241c20, 0, 0.92, 0.6)
      for (const [tx, tz] of [[-1.1, 0.1], [1.1, 0.1], [-1.1, 1.1], [1.1, 1.1]]) box(0.12, 0.9, 0.12, 0x140f12, tx, 0.46, tz)
      const sheet = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 1.15, 6, 14),
        new THREE.MeshStandardMaterial({ color: 0xcfc8bd, roughness: 0.95 }))
      sheet.scale.set(1, 0.5, 1); sheet.rotation.z = Math.PI / 2
      sheet.position.set(0, 1.1, 0.6); sheet.castShadow = true; add(sheet)
      // taches de sang qui imbibent le drap
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshBasicMaterial({ color: 0x5a0808 }))
      stain.rotation.x = -Math.PI / 2; stain.position.set(0.25, 1.25, 0.62); add(stain)
      const stain2 = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: 0x4a0606 }))
      stain2.rotation.x = -Math.PI / 2; stain2.position.set(-0.35, 1.25, 0.55); add(stain2)
      const cleaver = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.24),
        new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 0.6, roughness: 0.3 }))
      cleaver.position.set(-0.6, 1.2, 0.6); cleaver.rotation.z = 0.2; add(cleaver)

      // LES DEUX FRÈRES — des HOMMES (modèles forcés), gestuelle de menace
      const b1 = glbActor('target', -1.25, -0.25, { rim: 0xff1a1a, rot: 0.5, match: 'gangster_man_01', clip: 'Threaten' })
      const b2 = glbActor('target', 1.35, -0.15, { rim: 0xff1a1a, rot: -0.5, match: 'mafia_boss', clip: 'Punch' })
      // poussière en suspension dans la lumière rouge (épaisseur d'atmosphère)
      addDust(40, 12, 3.2, 0xff8866, 0.22)

      // rats qui filent le long du mur du fond
      const rats = []
      for (let i = 0; i < 2; i++) {
        const rat = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.16, 3, 6),
          new THREE.MeshStandardMaterial({ color: 0x17141a, roughness: 1 }))
        rat.rotation.z = Math.PI / 2; rat.position.y = 0.06; add(rat)
        rats.push({ rat, off: i * 4.7 })
      }

      let spatt = -1, lastDrip = -1
      animate(() => {
        // la lampe se balance — les ombres tanguent, la lumière grésille
        lampPivot.rotation.x = Math.sin(t * 1.15) * 0.32
        lampPivot.rotation.z = Math.cos(t * 0.9) * 0.22
        red.intensity = 1.7 + Math.sin(t * 12) * 0.6 + Math.random() * 0.45
        for (const h of hung) h.body.rotation.z = Math.sin(t * 1.05 + h.hx) * 0.14
        // le sang GOUTTE des corps suspendus
        if (Math.floor(t * 2.4) !== lastDrip) {
          lastDrip = Math.floor(t * 2.4)
          const h = hung[Math.abs(lastDrip) % hung.length]
          spawnBlood(h.hx, 1.45, -3, 1, 0.12, { x: 0, y: -3.6, z: 0 })
        }
        // les rats traversent la pièce
        for (const r of rats) {
          const pp = ((t * 2.1 + r.off) % 11) - 5.5
          r.rat.position.set(pp, 0.06, -4.4 + Math.sin(pp * 2) * 0.15)
        }
        // le corps TRESSAILLE sous le drap (suggéré, glaçant)
        const jolt = Math.max(0, Math.sin(t * 7.2)) ** 6
        sheet.scale.y = 0.5 + jolt * 0.1
        sheet.position.y = 1.1 + jolt * 0.03
        // gerbe de sang rythmée (comme des coups) + flaque qui s'étend
        const cyc = Math.floor(t * 1.15)
        if (cyc !== spatt) {
          spatt = cyc
          spawnBlood(0, 1.15, 0.6, 20, 2.8, { x: 0, y: 2.0, z: 0.2 })
          bloodPool.scale.setScalar(Math.min(2.3, 0.7 + cyc * 0.15))
        }
        // CLIMAX : le frère 1 se tourne LENTEMENT vers la caméra et avance (glaçant)
        if (t > 7.5) {
          const k = Math.min(1, (t - 7.5) / 3.2)
          b1.group.rotation.y = 0.5 + k * (-0.5)      // pivote face à la caméra (+Z)
          b1.group.position.z = -0.25 + k * 0.9        // s'avance vers toi
          b1.group.position.x = -1.25 + k * 0.5
        }
      })
    },
    // Noir → poussée basse et lente dans l'abattoir → gros plan sur le frère qui te fixe
    keyframes: [
      { time: 0,    pos: [0, 0.6, 8],   look: [0, 1.3, 0], roll: 0.02 },
      { time: 4.5,  pos: [-2, 1.2, 5],  look: [0, 1.2, 0.4], roll: 0.06 },
      { time: 8.5,  pos: [-1.4, 1.6, 3.5], look: [-0.9, 1.5, 0.2], roll: -0.06 },
      { time: 12.5, pos: [-0.7, 1.65, 2.3], look: [-0.75, 1.6, 0.6], roll: 0.04 },  // face au frère qui s'est tourné
    ], total: 13,
    textCues: [
      { from: 0.4, to: 4.2,  text: "Les frères Sanctechair. Ce ne sont plus des hommes." },
      { from: 4.6, to: 8.6,  text: "Ils découpent les vivants et vendent la chair au poids." },
      { from: 9.0, to: 13.0, text: "L'un d'eux vient de sentir un regard. Trop tard pour lui." },
    ],
  }),

  // 3 — Port : travelling latéral le long des conteneurs
  3: () => ({
    music: 'tense',
    title: 'MISSION 03 — LE PORT',
    bg: 0x0a1520, fogNear: 20, fogFar: 80,
    lighting: { ambientI: 0.45, sunI: 0.35, fillI: 0.25, sunColor: 0x5566aa, ambColor: 0x223355 },
    build() {
      plane(0x1e2228, 50)
      const water = new THREE.Mesh(new THREE.PlaneGeometry(50, 20),
        new THREE.MeshLambertMaterial({ color: 0x061828 }))
      water.rotation.x = -Math.PI / 2; water.position.set(0, -0.1, -12); add(water)
      const cc = [0xcc3322, 0x2244cc, 0x228833, 0x886622, 0xcc6611]
      for (let i = 0; i < 5; i++) box(2.5, 2.8, 5, cc[i], -9 + i * 4.5, 1.4, -7)
      cyl(0.3, 0.4, 18, 0xdd8800, 11, 9, -9); box(12, 0.6, 0.6, 0xdd8800, 6, 18, -9)
      const warn = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2200 })); warn.position.set(11, 18.5, -9); add(warn)
      // Conteneur OUVERT — la "marchandise humaine"
      box(3, 3, 6, 0x553322, 0.5, 1.5, -3)
      box(0.15, 3, 6, 0x2a1810, -1.1, 1.5, -3, false)   // porte ouverte
      // Victimes entravées entassées dans le conteneur (sombres, immobiles)
      figure(0x6a5a4a, 0.3, -3.6, { rot: 0.2, skin: 0xd8a878 }).group.scale.setScalar(0.95)
      figure(0x5a6a5a, 1.1, -2.6, { rot: -0.4, skin: 0xe8c090 }).group.scale.setScalar(0.85)
      // Le passeur (vrai modèle) à côté d'une victime près du conteneur
      const victim = figure(0x886655, -0.2, -0.4, { rot: 0.4, skin: 0xe8b880 })
      const t1 = glbActor('target', -1.6, 0.6, { rim: 0xff3322, rot: 0.6, match: 'mafia_boss', clip: 'Point' })
      animate(() => {
        const p = Math.sin(t * 1.4) * 0.5 + 0.5
        victim.group.position.z = -0.4 - p * 0.5
        victim.group.position.x = -0.2 + p * 0.25
      })
    },
    // dolly latéral le long des conteneurs vers la scène
    keyframes: [
      { time: 0,  pos: [10, 3, 7],   look: [0, 1.5, -3] },
      { time: 5,  pos: [-6, 2.6, 6], look: [-0.5, 1.5, -3] },
      { time: 9,  pos: [-3, 2, 4],   look: [-1, 1.4, 0] },
      { time: 11.5, pos: [-1.5, 1.8, 3], look: [-1.5, 1.4, 0.4] },
    ], total: 12,
    textCues: [
      { from: 0.4, to: 4.0,  text: "Le port. Ici, des êtres humains deviennent du fret." },
      { from: 4.4, to: 8.0,  text: "Il entasse ses victimes dans un conteneur." },
      { from: 8.4, to: 12.0, text: "Il sait qu'un fantôme rôde. Qu'il ait peur." },
    ],
  }),

  // 4 — Base militaire : 3 officiers, caméra crane (descend du ciel)
  4: () => ({
    music: 'tense',
    title: 'MISSION 04 — LA BASE',
    bg: 0x9ab0c0, fogNear: 35, fogFar: 130,
    lighting: { ambientI: 0.8, sunI: 1.4, fillI: 0.5, sunColor: 0xffffe0, ambColor: 0xfff0e0 },
    build() {
      plane(0x6a6a60, 60)
      box(10, 5, 6, 0x6a7a5a, -10, 2.5, -8)   // baraquement
      box(3, 2.4, 6, 0x4a5a3a, 9, 1.2, -6)    // camion
      cyl(0.3, 0.4, 10, 0x888888, 11, 5, -10) // antenne
      // hélipad
      const heli = new THREE.Mesh(new THREE.RingGeometry(3, 3.3, 28),
        new THREE.MeshBasicMaterial({ color: 0xffffff })); heli.rotation.x = -Math.PI / 2; heli.position.y = 0.03; add(heli)
      // ── DEAL D'ARMES : caisses ouvertes, fusils alignés, mallette de billets ──
      // caisses militaires empilées
      box(1.6, 0.7, 0.9, 0x4a5232, -0.9, 0.35, 0.9)
      box(1.6, 0.7, 0.9, 0x525a38, -0.9, 1.05, 0.9)
      box(1.6, 0.7, 0.9, 0x4a5232, 1.2, 0.35, 1.1)
      // caisse ouverte remplie de fusils
      box(1.8, 0.5, 1.0, 0x3e4629, 0.2, 0.25, 2.0)
      for (let i = 0; i < 4; i++) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.3),
          new THREE.MeshStandardMaterial({ color: 0x181818, metalness: 0.5, roughness: 0.4 }))
        r.position.set(-0.25 + i * 0.16, 0.55, 2.0); r.rotation.y = 0.1; add(r)
      }
      // mallette de billets ouverte sur une caisse
      box(0.65, 0.1, 0.45, 0x1c1c22, -0.9, 1.46, 0.9)
      const cash = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.36),
        new THREE.MeshBasicMaterial({ color: 0x7fae4e })); cash.position.set(-0.9, 1.54, 0.9); add(cash)

      // LES 3 OFFICIERS — même pool "target" que le jeu (3 cibles au niveau 4)
      // "Talk" est une pose ASSISE sur ce jeu d'animations (hanches ~0.4m plus basses) —
      // pas de siège ici, donc on garde une pose debout crédible pour la négociation.
      const o1 = glbActor('target', -1.6, -0.2, { rim: 0xff3322, rot: 0.7, match: 'gangster_man_01', clip: 'Threaten' })
      const o2 = glbActor('target', 0.4, -0.7, { rim: 0xff3322, rot: 0, match: 'mafia_boss', clip: 'Point' })
      const o3 = glbActor('target', 1.9, -0.1, { rim: 0xff3322, rot: -0.7, match: 'mafia_woman_01', clip: 'Aim' })
      // l'acheteur du réseau (simple garde, pas une cible) — pas de halo
      glbActor('guard', 0.3, 3.2, { rot: Math.PI, clip: 'Look' })

      animate(() => {
        // reflet des billets qui accroche la lumière
        cash.material.color.setHSL(0.28, 0.55, 0.42 + Math.sin(t * 3) * 0.08)
      })
    },
    // crane : descend du ciel → glisse au ras des caisses → s'arrête sur le deal
    keyframes: [
      { time: 0,   pos: [0, 16, 14],   look: [0, 0, 1] },
      { time: 4,   pos: [-3, 6, 9],    look: [0, 1.2, 1] },
      { time: 8,   pos: [-3.5, 1.4, 5], look: [-0.5, 1.3, 0.8] },
      { time: 11.5, pos: [-2, 1.6, 3.2], look: [-0.3, 1.3, 0.4] },
    ], total: 12,
    textCues: [
      { from: 0.4, to: 4.0,  text: "Une base militaire. Trois officiers corrompus." },
      { from: 4.4, to: 8.0,  text: "Les armes de l'armée, vendues au réseau. Cash." },
      { from: 8.4, to: 12.0, text: "En plein jour. Pas d'ombre. Juste mon souffle." },
    ],
  }),

  // 5 — Convoi : passage au ras du bitume, travelling latéral, poussière au soleil
  5: () => ({
    music: 'tense',
    title: 'MISSION 05 — LE CONVOI',
    bg: 0xb0a088, fogNear: 35, fogFar: 160,
    lighting: { ambientI: 0.8, sunI: 1.5, fillI: 0.5, sunColor: 0xffe8c0, ambColor: 0xfff0e0 },
    build() {
      plane(0xa89878, 120)
      // route + pointillés
      box(110, 0.15, 8, 0x3a3a3a, 0, 0.12, -2)
      for (let x = -52; x <= 52; x += 7) box(3, 0.04, 0.4, 0xddcc44, x, 0.21, -2, true)
      // mesas + soleil couchant
      for (const [mx, mz, mw, mh] of [[-60, -55, 26, 15], [45, -65, 34, 19], [0, -80, 42, 13]]) {
        const mesa = new THREE.Mesh(new THREE.CylinderGeometry(mw * 0.42, mw * 0.55, mh, 7),
          new THREE.MeshLambertMaterial({ color: 0x8a6f52 }))
        mesa.position.set(mx, mh / 2, mz); add(mesa)
      }
      const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 28), new THREE.MeshBasicMaterial({ color: 0xff7733, fog: false }))
      sun.position.set(-20, 8, -95); add(sun)
      const sunGlow = new THREE.PointLight(0xff8844, 1.4, 300); sunGlow.position.set(-20, 14, -70); add(sunGlow)
      // rochers facettés
      for (let i = 0; i < 10; i++) {
        const s = 0.7 + Math.random() * 2
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0),
          new THREE.MeshStandardMaterial({ color: 0x8d7c5f, roughness: 0.95, flatShading: true }))
        rock.position.set((Math.random() - 0.5) * 100, s * 0.4, -2 + (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 25))
        rock.rotation.set(Math.random() * 3, Math.random() * 3, 0); add(rock)
      }
      // LE CONVOI : trois vraies jeeps détaillées qui roulent
      const jeeps = [makeJeep(0x2a3a4a), makeJeep(0x3a4a2a), makeJeep(0x4a3a2a)]
      const offs = [11, 0, -11]
      for (const j of jeeps) add(j)
      // colonel + chauffeur dans la jeep du milieu (assis)
      const col = glbActor('target', 0, 0, { rim: 0xff3322, rot: -Math.PI / 2, match: 'mafia_boss', clip: 'Sit' })
      const drv = glbActor('guard', 0, 0, { rot: -Math.PI / 2, clip: 'Sit' })
      // traînées de poussière derrière les roues
      const puffs = []
      let lastPuff = -1
      animate(() => {
        const baseX = -40 + t * 5.6
        for (let i = 0; i < 3; i++) jeeps[i].position.set(baseX + offs[i], 0, -2)
        col.group.position.set(baseX - 1.4, 0.82, -2)
        drv.group.position.set(baseX + 0.6, 0.62, -2)
        // un nuage de poussière par jeep, en continu
        const pi = Math.floor(t / 0.13)
        if (pi !== lastPuff) {
          lastPuff = pi
          for (let i = 0; i < 3; i++) {
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.25, 6, 6),
              new THREE.MeshBasicMaterial({ color: 0xb9a583, transparent: true, opacity: 0.35 }))
            m.position.set(baseX + offs[i] - 2.4, 0.3, -2 + (Math.random() - 0.5) * 1.6)
            add(m); puffs.push({ m, born: t })
          }
        }
        for (let i = puffs.length - 1; i >= 0; i--) {
          const pf = puffs[i]; const age = t - pf.born
          pf.m.position.y += 0.012; pf.m.scale.multiplyScalar(1.018)
          pf.m.material.opacity = Math.max(0, 0.35 - age * 0.28)
          if (age > 1.4) { scene.remove(pf.m); puffs.splice(i, 1) }
        }
      })
    },
    // ras du bitume → passage tout proche → travelling à hauteur du colonel → envolée
    keyframes: [
      { time: 0,    pos: [10, 0.55, 2.5], look: [-38, 1.6, -2], roll: 0.03 },
      { time: 4.5,  pos: [8, 0.7, 2.8],   look: [-8, 1.4, -2], roll: 0.05 },
      { time: 6.2,  pos: [6, 1.1, 4],     look: [4, 1.2, -2], roll: -0.04 },
      { time: 10.5, pos: [22, 1.5, 3.5],  look: [26, 1.2, -2], roll: 0 },
      { time: 13.5, pos: [26, 5, 9],      look: [45, 1.5, -2], roll: 0 },
    ], total: 14,
    textCues: [
      { from: 0.5, to: 4.6, phone: true, text: "\ud83d\udcde \u00ab Prenez la vieille route. Personne ne nous attendra. \u00bb" },
      { from: 5.0, to: 9.0,  text: "Mauvais calcul, colonel. Quelqu'un attend toujours." },
      { from: 9.4, to: 13.8, text: "Trois v\u00e9hicules. Un seul tir. Le sien." },
    ],
  }),

  // 6 — Fête : la caméra serpente à travers la foule vers la cible (sans halo)
  6: () => ({
    music: 'tense',
    title: 'MISSION FINALE',
    bg: 0x0a0a14, fogNear: 16, fogFar: 60,
    lighting: { ambientI: 0.6, sunI: 0.4, fillI: 0.3, sunColor: 0x6677bb, ambColor: 0x445577 },
    build() {
      plane(0x110d18, 50)
      // piste de danse — damier lumineux qui pulse
      const tiles = []
      const tileCols = [0x8a2aaa, 0x2a5aaa, 0xaa2a5a, 0x2aaa8a]
      for (let dx = -3; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
        if ((dx + dz + 10) % 2 === 0) {
          const tile = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45),
            new THREE.MeshBasicMaterial({ color: tileCols[(dx * 3 + dz + 20) % 4], transparent: true, opacity: 0.5 }))
          tile.rotation.x = -Math.PI / 2
          tile.position.set(dx * 1.55, 0.02, -3 + dz * 1.55)
          add(tile); tiles.push(tile)
        }
      }
      // boule disco + éclats de lumière
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.15 }))
      ball.position.set(0, 4.5, -3); add(ball)
      const pc = [0xff0066, 0x00ffcc, 0xff6600, 0x9900ff]
      const spots = pc.map((c, i) => {
        const pl = new THREE.PointLight(c, 1.6, 14); pl.position.set(-4.5 + i * 3, 4, -3); add(pl); return pl
      })
      // DJ + platines au fond
      box(3.4, 1.1, 0.9, 0x15121c, 0, 0.55, -7.4)
      glbActor('civilian', 0, -8.1, { clip: 'Point' })   // le DJ, bras levé
      // LA FOULE : vrais personnages qui DANSENT (aucune cible montrée)
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2 + 0.4
        const r = 2.1 + (i % 3) * 0.85
        glbActor('civilian', Math.cos(ang) * r, -3 + Math.sin(ang) * r * 0.62, {
          rot: Math.random() * 6.28,
          clip: i % 4 === 3 ? 'Talk' : 'Dance',
        })
      }
      // paillettes en suspension dans les spots (ambiance boîte de nuit)
      addDust(50, 13, 4.5, 0xffffff, 0.32)
      animate(() => {
        ball.rotation.y = t * 2.2
        for (let i = 0; i < spots.length; i++) spots[i].intensity = 1.1 + Math.sin(t * 3 + i * 1.7) * 0.7
        for (let i = 0; i < tiles.length; i++) tiles[i].material.opacity = 0.35 + (Math.sin(t * 4 + i) * 0.5 + 0.5) * 0.4
      })
    },
    // balaye la foule — chaque visage pourrait être LUI
    keyframes: [
      { time: 0,    pos: [-6.5, 1.7, 4],  look: [-2, 1.5, -3] },
      { time: 4,    pos: [4, 1.6, 2.5],   look: [0.5, 1.5, -3.5] },
      { time: 8,    pos: [-2.5, 1.8, 1],  look: [-1, 1.5, -4] },
      { time: 11.5, pos: [0, 3.4, 4.5],   look: [0, 1.2, -3] },   // plan large final : la foule entière
    ], total: 12,
    // Écoute interceptée EN DIRECT : il est au téléphone pendant que tu le cherches
    textCues: [
      { from: 0.5, to: 4.5, phone: true, text: "📞 « Ils sont tous morts ? — Oui. Il ne reste que vous. »" },
      { from: 4.9, to: 8.4, phone: true, text: "📞 « Alors trouvez-moi ce sniper. CE SOIR. »" },
      { from: 8.8, to: 12.0, text: "Il est là. Au téléphone, au milieu d'eux. Observe." },
    ],
  }),
}

// ─── Cinématique de fin ──────────────────────────────────────────────
function ENDING() {
  return {
    music: 'resolve',
    title: 'ÉPILOGUE',
    bg: 0x2a1c12, fogNear: 30, fogFar: 130,
    lighting: { ambientI: 0.7, sunI: 1.0, fillI: 0.4, sunColor: 0xffaa66, ambColor: 0x664433 },
    build() {
      box(40, 0.4, 40, 0x2a2420, 0, 0, 0)
      box(40, 1, 0.5, 0x3a3430, 0, 0.7, -7)
      const sun = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0xffcc66 })); sun.position.set(0, 7, -55); add(sun)
      const sl = new THREE.PointLight(0xffaa55, 1.6, 250); sl.position.set(0, 12, -30); add(sl)
      const v = figure(0x2a2a30, 1.2, 1, { rot: -2.7, skin: 0xd8a878 })
      animate(() => { v.head.rotation.y = -2.7 + Math.sin(t * 0.4) * 0.15 })
      box(0.12, 0.12, 2, 0x111111, -0.6, 0.2, 1)   // fusil posé au sol
      for (let i = 0; i < 7; i++) box(4, 6 + Math.random() * 9, 4, 0x2a2622, -18 + i * 6, 5, -22)
    },
    keyframes: [
      { time: 0,  pos: [4, 2, 6],  look: [1, 1.4, 1] },
      { time: 4,  pos: [0, 2.5, 5], look: [0.6, 1.3, 0] },
      { time: 9,  pos: [-2, 3.5, 6], look: [0, 2, -12] },
      { time: 14, pos: [-2, 5.5, 10], look: [0, 3.5, -35] },
    ], total: 15,
    // L'épilogue change si le joueur a libéré les victimes du conteneur (choix moral, mission 3)
    textCues: [
      { from: 0.5, to: 4.0,  text: "C'est fini. Le dernier est tombé." },
      { from: 4.4, to: 8.0,  text: "Pour ma femme. Ma fille. Et tous les autres." },
      { from: 8.4, to: 11.5, text: window.__freedVictims
          ? "Et ceux du conteneur, quelque part, respirent à nouveau."
          : "Le réseau n'est plus que cendres." },
      { from: 11.9, to: 15.0, text: "Repose, Viktor. Tu peux enfin dormir." },
    ],
  }
}

// ─── Moteur ──────────────────────────────────────────────────────────
let startTime = 0
function begin(config, onDone, ending = false) {
  active = true; t = 0; onDoneCb = onDone
  startTime = performance.now(); lastFrameT = 0
  objects = []; animated = []; blood = []; cinMixers = []
  clearMap()
  savedBg = scene.background; savedFog = scene.fog
  scene.background = new THREE.Color(config.bg)
  scene.fog = new THREE.Fog(config.bg, config.fogNear || 20, config.fogFar || 110)
  setLighting(config.lighting || {})
  config.build()
  keyframes = config.keyframes
  total = config.total
  textCues = config.textCues
  startCinematicMusic(config.music || 'tense')
  makeOverlay(ending, config.title)
}

export function startIntroCinematic(onDone) { begin(INTRO(), onDone, false) }
export function startLevelCinematic(level, onDone) {
  const idx = ((level - 1) % 6) + 1
  begin(LEVEL_CINEMATICS[idx](), onDone, false)
}
export function startEndingCinematic(onDone) { begin(ENDING(), onDone, true) }
export function isCinematicActive() { return active }

function makeOverlay(ending, title) {
  overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;inset:0;z-index:120;cursor:pointer;font-family:'Courier New',monospace;`
  // Letterbox qui se FERME en glissant (entrée de scène cinéma)
  const barTop = document.createElement('div')
  barTop.style.cssText = `position:absolute;top:0;left:0;right:0;height:0;background:#000;transition:height 0.8s ease;`
  const barBot = document.createElement('div')
  barBot.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:0;background:#000;transition:height 0.8s ease;`
  requestAnimationFrame(() => { barTop.style.height = '10vh'; barBot.style.height = '10vh' })

  // Carte de titre de mission (s'affiche 3 s puis s'efface)
  if (title) {
    const tc = document.createElement('div')
    tc.textContent = title
    tc.style.cssText = `position:absolute;top:41%;left:0;right:0;text-align:center;
      font-size:32px;letter-spacing:0.4em;color:${ending ? '#ffd9a8' : '#e8f0e8'};
      text-shadow:0 0 34px rgba(0,0,0,0.9), 0 0 12px rgba(78,255,78,0.25);
      opacity:0;transition:opacity 0.9s;z-index:3;pointer-events:none;`
    overlay.appendChild(tc)
    requestAnimationFrame(() => { tc.style.opacity = '1' })
    setTimeout(() => { tc.style.opacity = '0' }, 3000)
  }
  textEl = document.createElement('div')
  textEl.style.cssText = `position:absolute;bottom:13vh;left:0;right:0;text-align:center;
    color:${ending ? '#ffd9a8' : '#e8f0e8'};font-size:21px;letter-spacing:0.08em;
    text-shadow:0 2px 14px #000;opacity:0;transition:opacity 0.6s;`
  textEl.dataset.base = ending ? '#ffd9a8' : '#e8f0e8'
  // Vignettage cinéma (assombrit les bords)
  const vignette = document.createElement('div')
  vignette.style.cssText = `position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(ellipse at center, rgba(0,0,0,0) 48%, rgba(0,0,0,0.55) 100%);`
  // Grain de film (bruit SVG animé, très subtil)
  const grain = document.createElement('div')
  grain.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0.06;mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    background-size:180px 180px;animation:grain 0.5s steps(3) infinite;`
  // teinte chaude/froide légère selon l'ambiance
  const tint = document.createElement('div')
  tint.style.cssText = `position:absolute;inset:0;pointer-events:none;mix-blend-mode:soft-light;opacity:0.25;
    background:${ending ? '#ff9a4a' : '#2a3a6a'};`

  const skip = document.createElement('div')
  skip.textContent = 'APPUYER POUR PASSER'
  skip.style.cssText = `position:absolute;bottom:11.5vh;right:30px;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.12em;z-index:2;`
  overlay.appendChild(vignette); overlay.appendChild(tint); overlay.appendChild(grain)
  overlay.appendChild(barTop); overlay.appendChild(barBot); overlay.appendChild(textEl); overlay.appendChild(skip)
  document.body.appendChild(overlay)
  // keyframes du grain (une seule fois)
  if (!document.getElementById('cin-grain-kf')) {
    const st = document.createElement('style'); st.id = 'cin-grain-kf'
    st.textContent = `@keyframes grain{0%{transform:translate(0,0)}33%{transform:translate(-4%,3%)}66%{transform:translate(3%,-2%)}100%{transform:translate(0,0)}}`
    document.head.appendChild(st)
  }
  overlay.addEventListener('click', finish)
}

export function updateCinematic(dt) {
  if (!active) return
  // Temps basé sur l'horloge réelle → durée correcte quel que soit le framerate
  t = (performance.now() - startTime) / 1000
  const frameDt = Math.min(0.05, Math.max(0, t - lastFrameT)); lastFrameT = t
  for (const fn of animated) fn()
  for (const m of cinMixers) m.update(frameDt)
  updateBlood(frameDt)

  let k0 = keyframes[0], k1 = keyframes[keyframes.length - 1]
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].time && t <= keyframes[i + 1].time) { k0 = keyframes[i]; k1 = keyframes[i + 1]; break }
  }
  const span = Math.max(0.001, k1.time - k0.time)
  const k = smooth(Math.max(0, Math.min(1, (t - k0.time) / span)))
  const pos = lerp3(k0.pos, k1.pos, k)
  const look = lerp3(k0.look, k1.look, k)
  // léger tremblement "caméra à l'épaule" (vie + tension)
  const sway = 0.035
  camera.position.set(
    pos[0] + Math.sin(t * 1.7) * sway,
    pos[1] + Math.sin(t * 2.3 + 1) * sway,
    pos[2] + Math.cos(t * 1.3) * sway
  )
  camera.lookAt(look[0], look[1], look[2])
  // angle penché (dutch) optionnel par keyframe
  const roll = (k0.roll || 0) + ((k1.roll || 0) - (k0.roll || 0)) * k
  if (roll) camera.rotation.z += roll
  camera.fov = 50; camera.updateProjectionMatrix()

  // Narration en MACHINE À ÉCRIRE (l'écriture se révèle lettre par lettre)
  // Les répliques "phone" (écoutes téléphoniques interceptées) sont en vert terminal.
  let shown = null
  for (const c of textCues) if (t >= c.from && t <= c.to) { shown = c; break }
  // Voix au téléphone : marmonnement filtré pendant les répliques "phone"
  if (shown && shown.phone && !phoneOn) { startPhoneVoice(); phoneOn = true }
  else if (phoneOn && (!shown || !shown.phone)) { stopPhoneVoice(); phoneOn = false }
  if (textEl) {
    if (shown) {
      const chars = Math.max(0, Math.floor((t - shown.from) / 0.038))
      const txt = shown.text.slice(0, chars)
      if (textEl.textContent !== txt) textEl.textContent = txt
      textEl.style.opacity = '1'
      textEl.style.color = shown.phone ? '#8fe8a0' : (textEl.dataset.base || '#e8f0e8')
      textEl.style.fontStyle = shown.phone ? 'italic' : 'normal'
    } else {
      textEl.style.opacity = '0'
    }
  }

  if (t >= total) finish()
}

function finish() {
  if (!active) return
  active = false
  stopCinematicMusic()
  if (phoneOn) { stopPhoneVoice(); phoneOn = false }
  for (const o of objects) scene.remove(o)
  objects = []; animated = []
  if (savedBg) scene.background = savedBg
  if (savedFog) scene.fog = savedFog
  if (overlay && overlay.parentNode) {
    overlay.style.transition = 'opacity 0.6s'; overlay.style.opacity = '0'
    const ov = overlay
    setTimeout(() => { if (ov.parentNode) document.body.removeChild(ov) }, 600)
  }
  overlay = null; textEl = null
  const cb = onDoneCb; onDoneCb = null
  if (cb) cb()
}
