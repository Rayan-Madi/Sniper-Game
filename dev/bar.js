// Page de la salle du Bivouac (développement, hors build) : le décor (src/bar/salle.js), et ses patrons sur demande
// (src/bar/patrons.js), rendus avec les réglages du jeu (tone mapping ACES, exposition 1,35, ombre PCF calculée une fois
// puis figée, comme l'enquête), sur le patron de dev/enquete-decor.html. Rien de B11 ici (ni contrôleur, ni interface).
// ?vue=entree|zinc|tableA|tableB|couloir|lise   les vues des captures des tâches B9 et B10 (défaut : entree, le départ)
// ?cam=x,y,z,lacet,tangage   caméra figée à la place d'une vue (lacet 0 regarde vers -z, positif tourne à gauche)
// ?qualite=moyen|bas|haut    densité de pixels du préréglage graphique (src/gfx/quality.js ; défaut : moyen)
// ?stats=1                   appels de dessin et triangles de l'image (la première, passe d'ombre comprise, puis la courante)
// ?attenue=1                 effets atténués (néon et télé fixes)
// ?t=s                       avance le décor (et les patrons) de s secondes (pas de 1/60 s) avant la première image
// ?figer=1                   n'avance plus rien après la première image (captures déterministes)
// ?wc=libre                  le voyant du WC sur LIBRE
// ?memtest=N                 N montages et libérations (de la salle, et des patrons avec ?patrons=1), mémoire du renderer
//                            relevée (window.__bar.memtest)
// Patrons (tâche B10) :
// ?patrons=1                 les dix personnes du casting (modèles du jeu chargés d'abord) ; durée du montage et de la
//                            logique par image relevées (window.__bar.patrons)
// ?sorel=1                   Sorel présent (il entre à 18:30 : absent au montage), à la porte
// ?regard=lenoir,dussart     ces personnes tournent la tête vers la caméra
// ?parle=mattei              ces personnes hochent la tête
// ?geste=haas:Threaten       un geste du haut du corps
// ?lise=A                    Lise part du zinc vers cet arrêt (A, B, C, D) par son itinéraire
// ?lever=haas,mattei         ces personnes se lèvent (haas:demi : à demi)
import * as THREE from 'three'
import { creerSalle } from '../src/bar/salle.js'
import { creerCasting } from '../src/bar/patrons.js'
import { preloadCharacters } from '../src/characters.js'
import { ANCRES, SIEGES, PLACES, TABLES, lacetVers, itineraire } from '../src/bar/plan.js'
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
  lise: [4.9, DEBOUT, 1.4, lacetVers({ x: 4.9, z: 1.4 }, { x: 1.2, z: 0.2 }), -0.12],          // Lise qui traverse la salle
  escorteA: [3.4, DEBOUT, 2.1, lacetVers({ x: 3.4, z: 2.1 }, { x: 1.4, z: 3.4 }), -0.3],       // la table A de côté (B10)
  escorteB: [2.5, DEBOUT, -1.2, lacetVers({ x: 2.5, z: -1.2 }, { x: 4.3, z: -3.1 }), -0.3],    // la table B de côté (B10)
}
// ?vue=escorteA|escorteB : Dussart et Lenoir, Mattei et Haas vus de côté (captures de la tâche B10)

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

// ── les patrons ──
const avecPatrons = q.get('patrons') === '1'
const liste = v => (q.get(v) || '').split(',').filter(Boolean)
let casting = null
const mesures = { montageMs: null, logiqueMs: 0, images: 0 }
function preparer(c) {
  if (q.get('sorel') === '1') c.patrons.get('sorel').setPresent(true)
  for (const role of liste('regard')) c.patrons.get(role).regarder(camera.position)
  for (const role of liste('parle')) c.patrons.get(role).parler(true)
  if (q.get('geste')) { const [role, nom] = q.get('geste').split(':'); c.patrons.get(role).geste(nom) }
  for (const r of liste('lever')) { const [role, demi] = r.split(':'); c.patrons.get(role).seLever({ demi: demi === 'demi' }) }
  if (q.get('lise')) { const lise = c.patrons.get('lise'); lise.marcher(itineraire(lise.position, ANCRES.lise[q.get('lise')])) }
}
if (avecPatrons) {
  await preloadCharacters()
  const t0 = performance.now()
  casting = creerCasting()
  mesures.montageMs = performance.now() - t0
  scene.add(casting.group)
  preparer(casting)
}

for (let i = 0, n = Math.round((+q.get('t') || 0) * 60); i < n; i++) { salle.update(1 / 60); if (casting) casting.update(1 / 60) }

renderer.shadowMap.autoUpdate = false   // l'ombre du soleil est calculée à la première image, puis figée
renderer.shadowMap.needsUpdate = true

// ?memtest=N : N montages de la salle (et des patrons), chacun rendu deux images (ombre comprise) puis libéré, et
// renderer.info.memory relevé avant le premier et après chacun : la mesure du memtest du jeu (spec §8, Δ géométries et
// textures = 0), en attendant les étapes du bar de scripts/memtest.mjs (B16). Les modèles des patrons, partagés, restent
// au renderer une fois dessinés (comme au menu du jeu, characters.js) : le reste après chaque libération est compté à part
// (partages) et ne doit pas bouger d'un montage à l'autre.
const memtest = Math.max(0, Math.round(+q.get('memtest') || 0))
if (memtest > 0) {
  scene.remove(salle.group); salle.dispose()
  if (casting) { casting.dispose(); casting = null }
  renderer.render(scene, camera)
  const lire = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures })
  const avant = lire(), pendant = [], apres = [], montagesMs = []
  let partages = null
  for (let i = 0; i < memtest; i++) {
    const s = creerSalle()
    scene.add(s.group)
    let c = null
    if (avecPatrons) {
      const t0 = performance.now()
      c = creerCasting()
      montagesMs.push(+(performance.now() - t0).toFixed(1))
      scene.add(c.group)
    }
    renderer.shadowMap.needsUpdate = true
    renderer.render(scene, camera); s.update(1 / 60); if (c) c.update(1 / 60); renderer.render(scene, camera)
    pendant.push(lire())
    if (c && !partages) {   // géométries et textures des modèles dessinés, marquées partagées : elles restent
      const g = new Set(), t = new Set()
      c.group.traverse(o => {
        if (o.geometry && o.geometry.userData.shared) g.add(o.geometry)
        for (const m of [].concat(o.material || [])) for (const k in m) if (m[k] && m[k].isTexture && m[k].userData.shared) t.add(m[k])
      })
      partages = { geometries: g.size, textures: t.size }
    }
    scene.remove(s.group); s.dispose()
    if (c) c.dispose()
    renderer.render(scene, camera)
    apres.push(lire())
  }
  const fin = apres[apres.length - 1]
  window.__bar = { memtest: { avant, pendant, apres, partages, montagesMs,
    delta: { geometries: fin.geometries - avant.geometries, textures: fin.textures - avant.textures },
    deltaEntreMontages: { geometries: fin.geometries - apres[0].geometries, textures: fin.textures - apres[0].textures } } }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

const figer = q.get('figer') === '1'
const panneau = q.get('stats') === '1' ? document.getElementById('stats') : null
const etat = { salle, casting, scene, camera, renderer, images: 0, premiere: null, courante: null, decor: salle.stats(),
  patrons: casting ? { ...casting.stats(), mesures } : null }
let last = performance.now()
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  if (!figer && etat.images > 0) {
    salle.update(dt)
    if (casting) {
      const t0 = performance.now()
      casting.update(dt)
      mesures.logiqueMs += performance.now() - t0; mesures.images++
    }
  }
  renderer.render(scene, camera)
  const mesure = { appels: renderer.info.render.calls, triangles: renderer.info.render.triangles }
  if (etat.images === 0) etat.premiere = mesure
  etat.courante = mesure
  etat.images++
  if (panneau) {
    panneau.textContent = `décor : ${etat.decor.drawables} maillages, ${etat.decor.triangles} triangles\n` +
      (casting ? `patrons : ${etat.patrons.personnes} présents, ${etat.patrons.appels} maillages, ${etat.patrons.triangles} triangles\n` : '') +
      `première image (ombre comprise) : ${etat.premiere.appels} appels, ${etat.premiere.triangles} triangles\n` +
      `image courante : ${mesure.appels} appels, ${mesure.triangles} triangles`
  }
  requestAnimationFrame(frame)
}
if (!memtest) { window.__bar = etat; requestAnimationFrame(frame) }
