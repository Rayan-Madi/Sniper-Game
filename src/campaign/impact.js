import * as THREE from 'three'

// Hauteur du trou d'impact au-dessus du sol (évite le scintillement avec la surface).
const HOLE_LIFT = 0.035

// Tir manqué : où finit une balle qui ne touche personne. Sur le sol de la carte (groundY, le dessus de la dalle du
// port ou du tarmac, pas y = 0 sous la surface), sinon 40 m devant. `hole` : position du trou d'impact laissé au
// sol, ou null si la balle a fini en l'air.
export function missImpact(ray, groundY = 0) {
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY)   // n · p + constante = 0, soit y = groundY
  const point = new THREE.Vector3()
  if (!ray.intersectPlane(ground, point)) ray.at(40, point)
  const hole = point.y < groundY + 1 ? new THREE.Vector3(point.x, groundY + HOLE_LIFT, point.z) : null
  return { point, hole }
}
