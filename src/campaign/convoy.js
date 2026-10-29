// Convoi de la mission 5 : trois jeeps qui traversent la route, avec leurs occupants.
// convoy = { baseX, depart, z, groundY, dir, speed, vehicles: [{ mesh, offsetX, riders: [{ npc, dx, dy, dz }] }] } :
// baseX avance le long de X depuis depart (l'entrée de la route), dans le sens dir ; z est l'axe de la route, groundY
// le dessus de sa chaussée (src/maps/m5-convoi.js).
import { disposeObject } from '../gfx/dispose.js'

// Abscisse du convoi (m) : la route parcourue depuis son entrée, dans son sens de marche.
export function abscisseConvoi(convoy) {
  return (convoy.baseX - convoy.depart) * convoy.dir
}

// Support d'une cible touchée à bord du convoi (dernierTirMortel.support, contrat du lot 4) : le véhicule qui la porte
// (son entrée de convoy.vehicles), l'abscisse du convoi au coup (sTir) et à l'impact (sImpact : celle de l'image où la
// balle l'a touchée, après que le convoi a roulé, la pose contre laquelle le segment a été cherché). null si le PNJ
// n'est à bord d'aucun véhicule, ou sans convoi.
export function supportDuTir(convoy, npc, sTir) {
  const vehicule = convoy ? convoy.vehicles.find(v => v.riders.some(r => r.npc === npc)) : null
  return vehicule ? { type: 'convoi', vehicule, sTir, sImpact: abscisseConvoi(convoy) } : null
}

// Au-delà, le convoi a quitté la zone de tir.
export const CONVOY_END_X = 60

// Avance le convoi de dt et replace jeeps et occupants. Vrai si le colonel (target), encore vivant, sort par la
// droite : la mission est ratée. Colonel déjà abattu : le convoi s'immobilise hors champ, pas de nouveau passage.
export function stepConvoy(convoy, dt, target) {
  convoy.baseX += convoy.dir * convoy.speed * dt
  if (convoy.baseX > CONVOY_END_X) {
    if (target && target.alive) return true
    convoy.baseX = CONVOY_END_X
  }
  const y = convoy.groundY
  for (const v of convoy.vehicles) {
    const vx = convoy.baseX + v.offsetX
    v.mesh.position.set(vx, y, convoy.z)
    for (const r of v.riders) {
      if (!r.npc) continue
      // Un occupant abattu reste dans la jeep, qui roule encore : seule sa position suit, sa chute garde sa rotation.
      r.npc.mesh.position.set(vx + r.dx, y + r.dy, convoy.z + r.dz)
      if (r.npc.alive) r.npc.mesh.rotation.y = Math.PI / 2   // face au sens de la marche (+X)
    }
  }
  return false
}

// Retire les jeeps du convoi (relance, mission suivante, retour au menu) et libère leurs ressources (27 géométries
// par jeep). Les occupants ne sont pas enfants des jeeps : ce sont des PNJ de la mission, retirés avec les autres.
export function releaseConvoy(convoy) {
  for (const v of convoy.vehicles) disposeObject(v.mesh)
}
