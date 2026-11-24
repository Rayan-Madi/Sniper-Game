// Page de la salle du Bivouac (développement, hors build) : le décor seul (src/bar/salle.js), rendu avec les réglages
// du jeu (tone mapping ACES, exposition 1,35, ombre PCF calculée une fois puis figée, comme l'enquête), sur le patron de
// dev/enquete-decor.html. Rien de B11 ici (ni contrôleur, ni personnages, ni interface).
// ?vue=entree|zinc|tableA|tableB|couloir   les vues des captures de la tâche B9 (défaut : entree, le départ de Viktor)
// ?cam=x,y,z,lacet,tangage   caméra figée à la place d'une vue (lacet 0 regarde vers -z, positif tourne à gauche)
// ?qualite=moyen|bas|haut    densité de pixels du préréglage graphique (src/gfx/quality.js ; défaut : moyen)
// ?stats=1                   appels de dessin et triangles de l'image (la première, passe d'ombre comprise, puis la courante)
// ?attenue=1                 effets atténués (néon et télé fixes)
// ?t=s                       avance le décor de s secondes (pas de 1/60 s) avant la première image
// ?figer=1                   n'avance plus le décor après la première image (captures déterministes)
// ?wc=libre                  le voyant du WC sur LIBRE
// ?memtest=N                 N montages et libérations de la salle, mémoire du renderer relevée (window.__bar.memtest)
import * as THREE from 'three'
import { creerSalle } from '../src/bar/salle.js'
import { ANCRES, SIEGES, PLACES, TABLES, lacetVers } from '../src/bar/plan.js'
import { presetFor } from '../src/gfx/quality.js'

const q = new URLSearchParams(location.search)
const DEBOUT = 1.65
const dOuest = SIEGES.find(s => s.id === 'D-ouest')
const VUES = {
  entree: [ANCRES.depart.x, DEBOUT, ANCRES.depart.z, ANCRES.depart.lacet, -0.05],
  zinc: [-1.1, DEBOUT, 2.7, lacetVers({ x: -1.1, z: 2.7 }, { x: -5.4, z: -0.4 }), -0.1],
  tableA: [dOuest.x, dOuest.oeil, dOuest.z, lacetVers(dOuest, TABLES.A), -0.14],
  tableB: [PLACES.mangeDeboutEst.x, DEBOUT, PLACES.mangeDeboutEst.z, lacetVers(PLACES.mangeDeboutEst, TABLES.B), -0.28],
  couloir: [-2.0, DEBOUT, -1.4, lacetVers({ x: -2.0, z: -1.4 }, { x: -2.5, z: -6.0 }), -0.03],   // le couloir et le téléphone
}

const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(presetFor(q.get('qualite') || 'moyen', devicePixelRatio).pixelRatio)
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.35

const salle = creerSalle({ attenue: q.get('attenue') === '1' })
if (q.get('wc') === 'libre') salle.setWcOccupe(false)
const scene = new THREE.Scene()
scene.fog = salle.brouillard
scene.background = salle.brouillard.color
scene.add(salle.group)

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 40)   // la caméra de l'enquête
camera.rotation.order = 'YXZ'
const [x, y, z, lacet, tangage] = q.get('cam') ? q.get('cam').split(',').map(Number) : VUES[q.get('vue')] || VUES.entree
camera.position.set(x, y, z)
camera.rotation.set(tangage, lacet, 0)

for (let i = 0, n = Math.round((+q.get('t') || 0) * 60); i < n; i++) salle.update(1 / 60)

renderer.shadowMap.autoUpdate = false   // l'ombre du soleil est calculée à la première image, puis figée
renderer.shadowMap.needsUpdate = true

// ?memtest=N : N montages de la salle, chacun rendu deux images (ombre comprise) puis libéré, et renderer.info.memory
// relevé avant le premier et après chacun : la mesure du memtest du jeu (spec §8, Δ géométries et textures = 0), en
// attendant les étapes du bar de scripts/memtest.mjs (B16)
const memtest = Math.max(0, Math.round(+q.get('memtest') || 0))
if (memtest > 0) {
  scene.remove(salle.group); salle.dispose()
  renderer.render(scene, camera)
  const lire = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures })
  const avant = lire(), pendant = [], apres = []
  for (let i = 0; i < memtest; i++) {
    const s = creerSalle()
    scene.add(s.group)
    renderer.shadowMap.needsUpdate = true
    renderer.render(scene, camera); s.update(1 / 60); renderer.render(scene, camera)
    pendant.push(lire())
    scene.remove(s.group); s.dispose()
    renderer.render(scene, camera)
    apres.push(lire())
  }
  const fin = apres[apres.length - 1]
  window.__bar = { memtest: { avant, pendant, apres, delta: { geometries: fin.geometries - avant.geometries, textures: fin.textures - avant.textures } } }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

const figer = q.get('figer') === '1'
const panneau = q.get('stats') === '1' ? document.getElementById('stats') : null
const etat = { salle, scene, camera, renderer, images: 0, premiere: null, courante: null, decor: salle.stats() }
let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  if (!figer && etat.images > 0) salle.update(dt)
  renderer.render(scene, camera)
  const mesure = { appels: renderer.info.render.calls, triangles: renderer.info.render.triangles }
  if (etat.images === 0) etat.premiere = mesure
  etat.courante = mesure
  etat.images++
  if (panneau) {
    panneau.textContent = `décor : ${etat.decor.drawables} maillages, ${etat.decor.triangles} triangles\n` +
      `première image (ombre comprise) : ${etat.premiere.appels} appels, ${etat.premiere.triangles} triangles\n` +
      `image courante : ${mesure.appels} appels, ${mesure.triangles} triangles`
  }
  requestAnimationFrame(frame)
}
if (!memtest) { window.__bar = etat; requestAnimationFrame(frame) }
