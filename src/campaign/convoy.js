// Convoi de la mission 5 : trois jeeps qui traversent la route, avec leurs occupants.
// convoy = { baseX, z, groundY, dir, speed, vehicles: [{ mesh, offsetX, riders: [{ npc, dx, dy, dz }] }] } :
// baseX avance le long de X, z est l'axe de la route, groundY le dessus de sa chaussée (maps.js).
import { disposeObject } from '../gfx/dispose.js'

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
