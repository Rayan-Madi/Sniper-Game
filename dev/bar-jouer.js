// Le Bivouac joué seul (développement, hors build) : dev/bar.html?jouer=1. La coquille du bar (src/bar/index.js, tâche
// B11) montée avec les réglages de rendu du jeu, rendue à chaque image par le renderer et la caméra de la page, comme
// main.js le fera (tâche B16). Rien n'est branché au jeu.
// ?cam=x,y,z,lacet,tangage   pose de départ, sans carte ni pause (captures)
// ?t=s                       partir à cet instant de la soirée (ce qui précède est passé, Sorel entré après 210 s)
// ?soupcon=n                 S de départ
// ?infos=trajet,heure        renseignements sus d'avance
// ?verre=demi|cafe           déjà servi
// ?stats=1                   appels et triangles de l'image
// ?qualite=moyen|bas|haut    densité de pixels du préréglage graphique (défaut : moyen)
// ?manuel=1                  la boucle ne fait plus avancer la soirée (update(0)) : seules les accroches la font avancer,
//                            par pas fixes (__barAvance), et la partie est déterministe
// ?memtest=N                 N montages joués deux images puis arrêtés, mémoire du renderer relevée (window.__barMemtest)
// Accroches (spec §7, point 8) : __bar() l'état ; __barAller(x, z, lacet, tangage) ; __barAvance(s) ; __barSoupcon(v) ;
// __barJournal() ; __barAsseoir(id) ; window.__barFin, le contrat rendu par onDone.
import * as THREE from 'three'
import { startBar } from '../src/bar/index.js'
import { preloadCharacters } from '../src/characters.js'
import { presetFor } from '../src/gfx/quality.js'

const q = new URLSearchParams(location.search)
const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(presetFor(q.get('qualite') || 'moyen', devicePixelRatio).pixelRatio)
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.35
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200)
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

let audio = null
try {
  const ctx = new AudioContext()
  const dest = ctx.createGain(); dest.gain.value = 0.7; dest.connect(ctx.destination)
  audio = { ctx, dest }
} catch (e) { /* sans son */ }

const options = {}
for (const k of ['cam', 't', 'soupcon', 'infos', 'verre']) if (q.get(k)) options[k] = q.get(k)
if (q.get('stats') === '1') options.stats = true

await preloadCharacters()
const statut = document.getElementById('stats')

const memtest = Math.max(0, Math.round(+q.get('memtest') || 0))
if (memtest > 0) {
  // N parties montées, jouées deux images (l'ombre comprise), arrêtées : la mémoire du renderer revient-elle ?
  const lire = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures })
  const vide = new THREE.Scene()
  renderer.render(vide, camera)
  const avant = lire(), pendant = [], apres = [], montagesMs = []
  for (let i = 0; i < memtest; i++) {
    const t0 = performance.now()
    const bar = startBar({ renderer, camera, audio, onDone: () => {}, options: { cam: '3.5,1.65,3.95,0,-0.05', verre: 'demi', t: 63 } })
    montagesMs.push(+(performance.now() - t0).toFixed(1))
    bar.update(1 / 60); renderer.render(bar.scene, camera)
    bar.update(1 / 60); renderer.render(bar.scene, camera)
    pendant.push(lire())
    bar.stop()
    renderer.render(vide, camera)
    apres.push(lire())
  }
  const fin = apres[apres.length - 1]
  window.__barMemtest = { avant, pendant, apres, montagesMs,
    delta: { geometries: fin.geometries - avant.geometries, textures: fin.textures - avant.textures },
    deltaEntreMontages: { geometries: fin.geometries - apres[0].geometries, textures: fin.textures - apres[0].textures } }
  statut.textContent = JSON.stringify(window.__barMemtest.deltaEntreMontages)
} else {
  const manuel = q.get('manuel') === '1'
  let fini = false
  const bar = startBar({ renderer, camera, audio, root: document.body, options, onDone: r => {
    fini = true
    window.__barFin = { ...r, error: r.error ? String(r.error) : undefined }
    console.log('[bar] fin', JSON.stringify(window.__barFin))
    statut.textContent = `FIN : ${r.resultat} · renseignements ${Object.entries(r.renseignements).filter(([, v]) => v).map(([k]) => k).join(', ') || 'aucun'}`
  } })
  const d = bar.debug
  window.__bar = () => d.etat()
  window.__barAller = (x, z, lacet, tangage) => d.aller(x, z, lacet, tangage)
  window.__barAvance = s => { d.avancer(s); return d.etat() }
  window.__barSoupcon = v => d.soupcon(v)
  window.__barJournal = () => d.journal
  window.__barAsseoir = id => d.asseoir(id)
  window.__barDebug = d
  let last = performance.now()
  const image = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now
    bar.update(manuel ? 0 : dt)
    if (fini) return
    renderer.render(bar.scene, camera)
    requestAnimationFrame(image)
  }
  requestAnimationFrame(image)
}
