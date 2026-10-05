// Page de décor de l'enquête (développement, hors build) : l'appartement seul, rendu avec les réglages du jeu.
// ?cam=x,y,z,lacet,tangage   caméra figée (défaut : le départ, yeux à 1,65 m)
// ?stats=1                   appels de dessin et triangles de l'image précédente
// ?porte=1                   porte d'entrée déjà ouverte (vues de l'intérieur)
// ?set=spot:24,ambient:6,expo:1.35   réglage à l'œil des intensités (clés de apt.lights) et de l'exposition
import * as THREE from 'three'
import { buildApartment } from '../src/prologue/apartment.js'

const q = new URLSearchParams(location.search)
const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.35

const apt = buildApartment()
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05070c)
scene.fog = new THREE.Fog(0x05070c, 6, 22)
scene.add(apt.group)

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 40)
camera.rotation.order = 'YXZ'
const [x, y, z, yaw, pitch] = (q.get('cam') || `${apt.start.x},1.65,${apt.start.z},${apt.start.yaw},${apt.start.pitch}`).split(',').map(Number)
camera.position.set(x, y, z)
camera.rotation.set(pitch, yaw, 0)

if (q.get('porte') === '1') { apt.openDoor(); apt.update(0.1); for (let i = 0; i < 20; i++) apt.update(0.1) }

for (const kv of (q.get('set') || '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':')
  if (k === 'expo') renderer.toneMappingExposure = Number(v)
  else if (apt.lights[k]) apt.lights[k].intensity = Number(v)
}

renderer.shadowMap.autoUpdate = false
renderer.shadowMap.needsUpdate = true

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

const stats = q.get('stats') === '1' ? document.getElementById('stats') : null
let last = performance.now(), maxCalls = 0
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now
  apt.update(dt)
  renderer.render(scene, camera)
  maxCalls = Math.max(maxCalls, renderer.info.render.calls)
  if (stats) stats.textContent = `appels ${renderer.info.render.calls} (max ${maxCalls}, passe d'ombre comprise) · triangles ${renderer.info.render.triangles}`
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
window.__apt = { apt, scene, camera, renderer }
